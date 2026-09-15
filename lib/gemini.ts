// ============================================================
// lib/gemini.ts — Central Gemini API client for Lexplain
// All Gemini calls route through this module. The API key is
// read from server-side env vars only — never exposed to client.
// ============================================================

import {
  GoogleGenerativeAI,
  GenerativeModel,
  GenerateContentStreamResult,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import { ApiError } from "@/types";
import { isGrokConfigured, streamGrok, generateGrokJSON } from "./grok";
import { cleanMarkdownArtifacts, cleanObjectMarkdownArtifacts } from "./sanitize";

// ─── Client initialization ───────────────────────────────────
// API key validation is lazy — validated at first call, not import time.
// This allows the build to succeed without GEMINI_API_KEY set.
// Singleton instances are reused across invocations within the same
// serverless lambda lifetime (EFF-01 fix: avoid re-instantiation cost).

/** Default safety settings — permissive enough for legal document analysis */
const SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
];

// Module-level singletons — created once per lambda instance.
let _flashModel: GenerativeModel | null = null;
let _embeddingModel: GenerativeModel | null = null;

/** Returns the shared flash model singleton, initializing on first call. */
export function getFlashModel(): GenerativeModel {
  if (!_flashModel) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error(
        "GEMINI_API_KEY environment variable is not set. " +
          "Copy .env.example to .env.local and add your key."
      );
    }
    _flashModel = new GoogleGenerativeAI(key).getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
      safetySettings: SAFETY_SETTINGS,
    });
  }
  return _flashModel;
}

/** Returns the shared embedding model singleton, initializing on first call. */
export function getEmbeddingModel(): GenerativeModel {
  if (!_embeddingModel) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error(
        "GEMINI_API_KEY environment variable is not set. " +
          "Copy .env.example to .env.local and add your key."
      );
    }
    _embeddingModel = new GoogleGenerativeAI(key).getGenerativeModel({
      model: "gemini-embedding-001",
    });
  }
  return _embeddingModel;
}

// ─── Error classification ────────────────────────────────────

type GeminiErrorType = ApiError["errorType"];

function classifyError(err: unknown): { type: GeminiErrorType; message: string; retryable: boolean } {
  // Fast-path: if this is already a typed ApiError thrown by callWithRetry,
  // re-use its errorType directly instead of trying to string-inspect it.
  if (err !== null && typeof err === "object" && "errorType" in err) {
    const apiErr = err as ApiError;
    return {
      type: apiErr.errorType,
      message: apiErr.error ?? "An error occurred.",
      retryable: apiErr.retryable ?? false,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes("429") || lower.includes("quota") || lower.includes("rate limit") || lower.includes("resource_exhausted")) {
    return { type: "RATE_LIMIT", message: "API quota exceeded — please try again in a moment.", retryable: true };
  }
  if (lower.includes("503") || lower.includes("unavailable") || lower.includes("overloaded")) {
    return { type: "SERVICE_UNAVAILABLE", message: "The AI service is temporarily unavailable — please try again.", retryable: true };
  }
  if (lower.includes("timeout") || lower.includes("deadline")) {
    return { type: "SERVICE_UNAVAILABLE", message: "The request timed out — please try again.", retryable: true };
  }
  if (lower.includes("401") || lower.includes("api key") || lower.includes("unauthorized")) {
    return { type: "UNKNOWN", message: "API authentication error — check your API key.", retryable: false };
  }
  if (lower.includes("400") || lower.includes("invalid") || lower.includes("unsupported")) {
    return { type: "INVALID_INPUT", message: "The document content could not be processed.", retryable: false };
  }
  return { type: "UNKNOWN", message: "An unexpected error occurred — please try again.", retryable: true };
}

// ─── Retry with exponential backoff ─────────────────────────

const DEFAULT_RETRIES = 2;
const BASE_DELAY_MS = 800;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps a Gemini API call with retry logic and structured error classification.
 * Retries on transient errors (429, 503, timeout) with exponential backoff.
 * Throws a typed ApiError on permanent failures or exhausted retries.
 */
export async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = DEFAULT_RETRIES
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const classified = classifyError(err);

      // Don't retry permanent failures
      if (!classified.retryable) {
        const apiErr: ApiError = {
          error: classified.message,
          errorType: classified.type,
          retryable: false,
        };
        throw apiErr;
      }

      // Last attempt — surface the error
      if (attempt === maxRetries) {
        // Log error type only — never log document content or PII (security requirement)
        console.error(`[Lexplain] Gemini call failed after ${maxRetries + 1} attempts:`, {
          errorType: classified.type,
          attempt,
          rawError: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        });
        const apiErr: ApiError = {
          error: classified.message,
          errorType: classified.type,
          retryable: true,
        };
        throw apiErr;
      }

      // Exponential backoff
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      await sleep(delay);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError;
}

// ─── Streaming helper ────────────────────────────────────────

/**
 * Generates a streaming response and converts it to a ReadableStream
 * suitable for use as a Next.js streaming API response (SSE).
 * Falls back to Grok (xAI) ONLY on quota/rate-limit errors (RATE_LIMIT).
 * Other error types (INVALID_INPUT, auth failures) surface honestly — routing
 * those to Grok would not help and would mask real bugs.
 */
export async function generateStreamingResponse(
  prompt: string,
  systemPrompt?: string
): Promise<ReadableStream<Uint8Array>> {
  try {
    const model = getFlashModel();

    const result: GenerateContentStreamResult = await callWithRetry(() =>
      model.generateContentStream({
        contents: [
          ...(systemPrompt
            ? [{ role: "user" as const, parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }]
            : [{ role: "user" as const, parts: [{ text: prompt }] }]),
        ],
      })
    );

    const encoder = new TextEncoder();

    return new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              const cleanedText = cleanMarkdownArtifacts(text);
              if (cleanedText) {
                // Format as Server-Sent Events
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: cleanedText })}\n\n`));
              }
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          const classified = classifyError(err);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: classified.message, errorType: classified.type })}\n\n`)
          );
          controller.close();
        }
      },
    });
  } catch (geminiErr) {
    // Fall back to Groq for quota/rate-limit errors or service unavailability (503 / overload / timeout)
    // Permanent errors (INVALID_INPUT, auth failures) still surface honestly.
    const classified = classifyError(geminiErr);
    if ((classified.type === "RATE_LIMIT" || classified.type === "SERVICE_UNAVAILABLE") && isGrokConfigured()) {
      console.warn(
        `[Lexplain] Gemini ${classified.type} (${classified.message}), falling back to Groq. `,
        "Note: embedding-path quota exhaustion cannot fall back to Groq (no compatible endpoint)."
      );
      // Prepend a via_fallback sentinel so the client can show the subtle badge.
      const grokStream = await streamGrok(prompt, systemPrompt);
      const encoder = new TextEncoder();
      return new ReadableStream({
        async start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ via_fallback: true })}\n\n`));
          const reader = grokStream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          } finally {
            controller.close();
          }
        },
      });
    }
    throw geminiErr;
  }
}

// ─── Structured JSON generation ──────────────────────────────

/**
 * Generates structured JSON output using Gemini's response schema feature.
 * Used for clause extraction and document comparison.
 * Falls back to Grok (xAI) ONLY on quota/rate-limit errors (RATE_LIMIT).
 * Other error types (INVALID_INPUT, auth failures) surface honestly.
 *
 * When Grok handles the request, the returned object has `_via_fallback: true`
 * attached (via Object.assign) so calling components can show the subtle badge.
 */
export async function generateStructuredJSON<T>(
  prompt: string,
  systemPrompt: string
): Promise<T> {
  try {
    const model = getFlashModel();

    const result = await callWithRetry(() =>
      model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemPrompt}\n\n${prompt}` }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      })
    );

    const text = result.response.text();
    try {
      // Strip markdown code fences if present
      const cleaned = text.replace(/^```json\n?/m, "").replace(/```$/m, "").trim();
      const parsed = JSON.parse(cleaned) as T;
      return cleanObjectMarkdownArtifacts(parsed);
    } catch {
      throw {
        error: "Failed to parse AI response as structured data.",
        errorType: "UNKNOWN",
        retryable: true,
      } as ApiError;
    }
  } catch (geminiErr) {
    // Fall back to Groq for quota/rate-limit errors or service unavailability (503 / overload / timeout)
    // Permanent errors (INVALID_INPUT, auth failures) still surface honestly.
    const classified = classifyError(geminiErr);
    if ((classified.type === "RATE_LIMIT" || classified.type === "SERVICE_UNAVAILABLE") && isGrokConfigured()) {
      console.warn(`[Lexplain] Gemini ${classified.type}, falling back to Groq for structured JSON.`);
      const result = await generateGrokJSON<T>(prompt, systemPrompt);
      // Attach fallback marker so calling components can surface the subtle badge.
      // Object.assign avoids the T & {_via_fallback} intersection type constraint.
      Object.assign(result as object, { _via_fallback: true });
      return result;
    }
    throw geminiErr;
  }
}

// ─── Embedding generation ────────────────────────────────────

/**
 * Generates an embedding vector for a text chunk.
 * Used in the RAG pipeline for the Q&A feature.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const model = getEmbeddingModel();
  const result = await callWithRetry(() =>
    model.embedContent({
      content: { role: "user", parts: [{ text }] },
    })
  );
  return result.embedding.values;
}

/**
 * Generates embeddings for multiple chunks with controlled concurrency.
 * Up to MAX_CONCURRENT_BATCHES batches run in parallel; remaining batches
 * are queued to avoid burst 429s while still cutting sequential round-trips
 * for typical 20-40 chunk documents (EFF-02 fix).
 */
export async function generateEmbeddings(chunks: string[]): Promise<number[][]> {
  const BATCH_SIZE = 10;
  const MAX_CONCURRENT_BATCHES = 3;

  // Partition into batches
  const batches: string[][] = [];
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    batches.push(chunks.slice(i, i + BATCH_SIZE));
  }

  const results: number[][][] = new Array(batches.length);
  let nextBatch = 0;

  // Worker: repeatedly takes the next unprocessed batch until all done
  async function worker() {
    while (true) {
      const idx = nextBatch++;
      if (idx >= batches.length) break;
      results[idx] = await Promise.all(batches[idx].map(generateEmbedding));
    }
  }

  // Spin up at most MAX_CONCURRENT_BATCHES workers
  const workers = Array.from(
    { length: Math.min(MAX_CONCURRENT_BATCHES, batches.length) },
    worker
  );
  await Promise.all(workers);

  return results.flat();
}
