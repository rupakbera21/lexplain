// ============================================================
// app/api/simplify/route.ts — Plain-language simplification (streaming)
//
// GenAI technique: Streaming prompted summarization at 3 reading levels.
// Returns Server-Sent Events (SSE) stream for real-time UI updates.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { generateStreamingResponse } from "@/lib/gemini";
import { prepareDocumentForPrompt } from "@/lib/sanitize";
import { checkRateLimit } from "@/lib/ratelimit";
import { ReadingLevel, ApiError } from "@/types";

const SYSTEM_PROMPTS: Record<ReadingLevel, string> = {
  simple: `You are a legal document expert helping non-lawyers understand complex legal text.
Your task is to explain this legal document in SIMPLE language suitable for a 10-year-old or someone with no legal background.
Use very short sentences. Avoid all legal jargon — if you must use a legal term, immediately explain it in plain words.
Use bullet points and bold text to highlight the most important things.
Always start with a one-sentence summary of what type of document this is and what it does.
Format: Use clear headings, bullet points, and short paragraphs.`,

  standard: `You are a legal document expert helping everyday people understand legal documents.
Your task is to explain this legal document in PLAIN LANGUAGE for a general adult audience.
You may use some common legal terms, but always explain them. Aim for clarity over completeness.
Structure your response with: 1) What this document is, 2) Key obligations for each party, 3) Important rights, 4) Notable restrictions.
Be thorough but conversational.`,

  detailed: `You are a legal document expert producing a comprehensive plain-language analysis.
Your task is to explain this legal document in DETAILED PLAIN LANGUAGE for a business-savvy reader.
Cover all major provisions systematically. You may use legal terminology but always provide the plain-language meaning.
Structure: Executive Summary → Party Obligations → Rights & Remedies → Restrictions & Limitations → Notable Provisions → Overall Assessment.
Be comprehensive and precise.`,
};

function errorResponse(err: ApiError, status: number) {
  return NextResponse.json(err, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse | Response> {
  const rateLimitError = checkRateLimit(req);
  if (rateLimitError) return errorResponse(rateLimitError, 429);

  let body: { text?: string; level?: ReadingLevel };
  try {
    body = await req.json();
  } catch {
    return errorResponse({ error: "Invalid request body.", errorType: "INVALID_INPUT", retryable: false }, 400);
  }

  const { text, level = "standard" } = body;

  if (!text || text.trim().length < 10) {
    return errorResponse({ error: "Document text is required.", errorType: "INVALID_INPUT", retryable: false }, 400);
  }

  if (!["simple", "standard", "detailed"].includes(level)) {
    return errorResponse({ error: "Invalid reading level.", errorType: "INVALID_INPUT", retryable: false }, 400);
  }

  const sanitized = prepareDocumentForPrompt(text);
  const prompt = `Please analyze and explain the following legal document:\n\n---\n${sanitized}\n---`;

  try {
    const stream = await generateStreamingResponse(prompt, SYSTEM_PROMPTS[level]);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err: unknown) {
    const apiErr = err as ApiError;
    const status = apiErr.errorType === "RATE_LIMIT" ? 429 : apiErr.errorType === "INVALID_INPUT" ? 400 : 503;
    return errorResponse(
      apiErr.error ? apiErr : { error: "Couldn't simplify this document right now — please try again.", errorType: "UNKNOWN", retryable: true },
      status
    );
  }
}
