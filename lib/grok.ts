// ============================================================
// lib/grok.ts — Groq (LPU) Fallback Client for Lexplain
// Automatically activated if Gemini API fails, runs out of quota, or is unavailable.
// Reads GROQ_API_KEY (or GROK_API_KEY) from server-side env vars only.
// ============================================================

import { ApiError } from "@/types";
import { cleanMarkdownArtifacts, cleanObjectMarkdownArtifacts } from "@/lib/sanitize";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";

function getApiKey(): string | undefined {
  return process.env.GROQ_API_KEY || process.env.GROK_API_KEY;
}

export function isGrokConfigured(): boolean {
  const key = getApiKey();
  return Boolean(key && key.trim().length > 0);
}

/**
 * Stream responses from Groq via Server-Sent Events (SSE).
 */
export async function streamGrok(
  prompt: string,
  systemPrompt?: string
): Promise<ReadableStream<Uint8Array>> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("GROK_API_KEY is not configured for Grok fallback.");
  }

  const messages = [
    ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
    { role: "user", content: prompt },
  ];

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      stream: true,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("[Lexplain:Grok] HTTP error:", response.status, errText);
    throw new Error(`Grok API error: ${response.statusText} (${response.status})`);
  }

  if (!response.body) {
    throw new Error("No response body received from Grok API.");
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = response.body.getReader();

  return new ReadableStream({
    async start(controller) {
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;

            const dataStr = trimmed.slice(6);
            if (dataStr === "[DONE]") {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              return;
            }

            try {
              const parsed = JSON.parse(dataStr);
              const chunkText = parsed.choices?.[0]?.delta?.content;
              if (chunkText) {
                const cleanedText = cleanMarkdownArtifacts(chunkText);
                if (cleanedText) {
                  // Emit in Lexplain's SSE format
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ text: cleanedText })}\n\n`)
                  );
                }
              }
            } catch {
              // Ignore malformed intermediate chunks
            }
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        console.error("[Lexplain:Grok] Stream reading error:", err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              error: "An error occurred while streaming response from Grok.",
              errorType: "SERVICE_UNAVAILABLE",
            })}\n\n`
          )
        );
        controller.close();
      }
    },
  });
}

/**
 * Generate structured JSON from Grok (xAI).
 */
export async function generateGrokJSON<T>(
  prompt: string,
  systemPrompt: string
): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("GROK_API_KEY is not configured for Grok fallback.");
  }

  const messages = [
    {
      role: "system",
      content: `${systemPrompt}\n\nCRITICAL: Respond ONLY with valid, unescaped JSON matching the requested schema. Do NOT wrap in markdown fences or include commentary.`,
    },
    { role: "user", content: prompt },
  ];

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("[Lexplain:Grok] JSON HTTP error:", response.status, errText);
    throw new Error(`Grok API error: ${response.statusText} (${response.status})`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error("Empty response from Grok API.");
  }

  try {
    const cleaned = rawContent.replace(/^```json\n?/m, "").replace(/```$/m, "").trim();
    const parsed = JSON.parse(cleaned) as T;
    return cleanObjectMarkdownArtifacts(parsed);
  } catch {
    console.error("[Lexplain:Grok] Failed to parse JSON:", rawContent);
    throw {
      error: "Failed to parse structured response from backup provider.",
      errorType: "UNKNOWN",
      retryable: true,
    } as ApiError;
  }
}
