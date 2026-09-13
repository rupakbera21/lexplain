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

// ─── Client initialization ───────────────────────────────────
// API key validation is lazy — validated at call time, not import time.
// This allows the build to succeed without GEMINI_API_KEY set.

function getGenAI(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY environment variable is not set. " +
        "Copy .env.example to .env.local and add your key."
    );
  }
  return new GoogleGenerativeAI(key);
}

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

// ─── Model getters ───────────────────────────────────────────

/** Flash model for most tasks (speed + cost optimized) */
export function getFlashModel(): GenerativeModel {
  return getGenAI().getGenerativeModel({
    model: "gemini-2.5-flash",
    safetySettings: SAFETY_SETTINGS,
  });
}

/** Embedding model for RAG pipeline */
export function getEmbeddingModel(): GenerativeModel {
  return getGenAI().getGenerativeModel({ model: "gemini-embedding-001" });
}

// ─── Error classification ────────────────────────────────────

type GeminiErrorType = ApiError["errorType"];

function classifyError(err: unknown): { type: GeminiErrorType; message: string; retryable: boolean } {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes("429") || lower.includes("quota") || lower.includes("rate limit")) {
    return { type: "RATE_LIMIT", message: "API quota exceeded — please try again in a moment.", retryable: true };
  }
  if (lower.includes("503") || lower.includes("unavailable") || lower.includes("overloaded")) {
    return { type: "SERVICE_UNAVAILABLE", message: "The AI service is temporarily unavailable — please try again.", retryable: true };
  }
  if (lower.includes("timeout") || lower.includes("deadline")) {
    return { type: "SERVICE_UNAVAILABLE", message: "The request timed out — please try again.", retryable: true };
  }
  if (lower.includes("400") || lower.includes("invalid") || lower.includes("unsupported")) {
    return { type: "INVALID_INPUT", message: "The document content could not be processed.", retryable: false };
  }
  if (lower.includes("401") || lower.includes("api key") || lower.includes("unauthorized")) {
    return { type: "UNKNOWN", message: "API authentication error — check your API key.", retryable: false };
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
 * Automatically falls back to Grok (xAI) if Gemini fails or is unavailable.
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
              // Format as Server-Sent Events
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
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
    if (isGrokConfigured()) {
      console.warn("[Lexplain] Gemini streaming call failed, falling back to Grok (xAI):", geminiErr);
      return streamGrok(prompt, systemPrompt);
    }
    throw geminiErr;
  }
}

// ─── Structured JSON generation ──────────────────────────────

/**
 * Generates structured JSON output using Gemini's response schema feature.
 * Used for clause extraction and document comparison.
 * Automatically falls back to Grok (xAI) if Gemini fails or is unavailable.
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
      return JSON.parse(cleaned) as T;
    } catch {
      throw {
        error: "Failed to parse AI response as structured data.",
        errorType: "UNKNOWN",
        retryable: true,
      } as ApiError;
    }
  } catch (geminiErr) {
    if (isGrokConfigured()) {
      console.warn("[Lexplain] Gemini JSON call failed, falling back to Grok (xAI):", geminiErr);
      return generateGrokJSON<T>(prompt, systemPrompt);
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
 * Generates embeddings for multiple chunks in parallel (batched).
 */
export async function generateEmbeddings(chunks: string[]): Promise<number[][]> {
  // Process in batches of 10 to avoid rate limits
  const BATCH_SIZE = 10;
  const embeddings: number[][] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const batchEmbeddings = await Promise.all(batch.map(generateEmbedding));
    embeddings.push(...batchEmbeddings);
  }

  return embeddings;
}
