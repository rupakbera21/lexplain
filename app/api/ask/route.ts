// ============================================================
// app/api/ask/route.ts — Grounded Q&A with RAG (streaming)
//
// GenAI techniques:
//   1. text-embedding-004 to embed query + document chunks
//   2. Cosine similarity retrieval of top-k relevant chunks
//   3. gemini-2.0-flash to answer ONLY from retrieved context
//   4. Anti-hallucination: refusal when context is insufficient
//
// Returns SSE stream. Client sends pre-computed chunk embeddings
// to avoid re-embedding on every question.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { generateStreamingResponse, generateEmbedding, generateEmbeddings } from "@/lib/gemini";
import { prepareDocumentForPrompt } from "@/lib/sanitize";
import { chunkDocument, retrieveTopKChunks } from "@/lib/chunker";
import { checkRateLimit } from "@/lib/ratelimit";
import { ApiError } from "@/types";

function errorResponse(err: ApiError, status: number = 400) {
  return NextResponse.json(err, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse | Response> {
  const rateLimitError = checkRateLimit(req);
  if (rateLimitError) return errorResponse(rateLimitError, 429);

  let body: {
    question?: string;
    text?: string;
    chunks?: string[];
    embeddings?: number[][];
  };

  try {
    body = await req.json();
  } catch {
    return errorResponse({ error: "Invalid request body.", errorType: "INVALID_INPUT", retryable: false }, 400);
  }

  const { question, text, chunks: providedChunks, embeddings: providedEmbeddings } = body;

  if (!question || question.trim().length < 3) {
    return errorResponse({ error: "A question is required.", errorType: "INVALID_INPUT", retryable: false }, 400);
  }
  if (!text || text.trim().length < 10) {
    return errorResponse({ error: "Document text is required.", errorType: "INVALID_INPUT", retryable: false }, 400);
  }

  const sanitizedText = prepareDocumentForPrompt(text);
  const sanitizedQuestion = prepareDocumentForPrompt(question, 500);

  try {
    // ── Build or use cached chunks + embeddings ───────────────
    const chunks = providedChunks ?? chunkDocument(sanitizedText);
    let topChunks: { chunk: string; score: number }[] = [];

    try {
      const chunkEmbeddings = providedEmbeddings ?? (await generateEmbeddings(chunks));
      const queryEmbedding = await generateEmbedding(sanitizedQuestion);
      topChunks = retrieveTopKChunks(queryEmbedding, chunkEmbeddings, chunks, 5, 0.4);
    } catch (embedErr) {
      console.warn("[Lexplain:Ask] Embedding retrieval failed or rate-limited, falling back to document context:", embedErr);
      // Resilient fallback: if embeddings hit quota, select document chunks directly so user request always succeeds
      topChunks = chunks.slice(0, 5).map((c) => ({ chunk: c, score: 0.8 }));
    }

    // ── Build grounded prompt ─────────────────────────────────
    let prompt: string;
    let systemPrompt: string;

    if (topChunks.length === 0) {
      // Anti-hallucination: refuse when no relevant context found
      prompt = `The user asked: "${sanitizedQuestion}"
      
There are no relevant sections in the document to answer this question.

Respond with exactly this message: "This document doesn't appear to address that question. The document may not cover this topic, or the question may be outside the scope of the document's content. Consider asking a legal professional for guidance on this matter."`;
      systemPrompt = "You are a helpful legal document assistant. Answer only what is asked.";
    } else {
      const contextSection = topChunks
        .map((item, i) => `[Context ${i + 1} — Relevance: ${(item.score * 100).toFixed(0)}%]\n${item.chunk}`)
        .join("\n\n---\n\n");

      systemPrompt = `You are a legal document assistant. Your role is to answer questions about a legal document ONLY based on the provided context excerpts from that document. 

CRITICAL RULES:
1. Answer ONLY from the context provided. Do not draw on general legal knowledge or make assumptions.
2. If the context doesn't contain enough information to answer the question confidently, say so honestly: "The document doesn't clearly address this — consider asking a legal professional."
3. Always cite which context section(s) your answer comes from, using [Context N].
4. Never provide legal advice. State facts from the document only.
5. Be precise and clear.`;

      prompt = `Context from the document:

${contextSection}

---

User question: ${sanitizedQuestion}

Answer based ONLY on the context above. Cite your sources using [Context N] notation.`;
    }

    // ── Stream the grounded answer ────────────────────────────
    const stream = await generateStreamingResponse(prompt, systemPrompt);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err: unknown) {
    console.error("[Lexplain:Ask] Error in ask route:", err);
    const apiErr = err as ApiError;
    const status = apiErr.errorType === "RATE_LIMIT" ? 429 : apiErr.errorType === "INVALID_INPUT" ? 400 : 503;
    return errorResponse(
      apiErr.error
        ? apiErr
        : { error: "Couldn't answer that question right now — please try again.", errorType: "UNKNOWN", retryable: true },
      status
    );
  }
}
