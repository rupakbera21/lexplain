// ============================================================
// __tests__/integration/ask.test.ts
//
// POST /api/ask — RAG Q&A route integration tests.
// Covers cache hit/miss paths and anti-hallucination refusal.
// ============================================================

import { NextRequest } from "next/server";
import { POST } from "@/app/api/ask/route";

jest.mock("@/lib/gemini", () => ({
  generateStreamingResponse: jest.fn(),
  generateEmbedding: jest.fn(),
  generateEmbeddings: jest.fn(),
}));

jest.mock("@/lib/ratelimit", () => ({
  checkRateLimit: jest.fn(async () => null),
}));

import {
  generateStreamingResponse,
  generateEmbedding,
  generateEmbeddings,
} from "@/lib/gemini";
import { checkRateLimit } from "@/lib/ratelimit";

const mockStreaming = generateStreamingResponse as jest.MockedFunction<typeof generateStreamingResponse>;
const mockEmbedding = generateEmbedding as jest.MockedFunction<typeof generateEmbedding>;
const mockEmbeddings = generateEmbeddings as jest.MockedFunction<typeof generateEmbeddings>;
const mockCheckRateLimit = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>;

function makeStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
    body: JSON.stringify(body),
  });
}

const DOC_TEXT = "Section 1: This agreement governs the use of services. Section 2: Either party may terminate with 30 days written notice. Section 3: Payment is due within 30 days of invoice.";
// Pre-computed chunk embeddings that will produce a high similarity to the query embedding
const CHUNK_EMBEDDING = [1, 0, 0];
const QUERY_EMBEDDING = [1, 0, 0]; // identical = similarity 1.0

describe("POST /api/ask", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue(null);
  });

  it("returns 400 for missing question", async () => {
    const res = await POST(makeRequest({ text: DOC_TEXT }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.errorType).toBe("INVALID_INPUT");
  });

  it("returns 400 for question shorter than 3 chars", async () => {
    const res = await POST(makeRequest({ text: DOC_TEXT, question: "hi" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing document text", async () => {
    const res = await POST(makeRequest({ question: "What are my obligations?" }));
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      error: "Rate limit exceeded.",
      errorType: "RATE_LIMIT",
      retryable: true,
    });
    const res = await POST(makeRequest({ text: DOC_TEXT, question: "What are my obligations?" }));
    expect(res.status).toBe(429);
  });

  it("uses provided chunks/embeddings (cache hit path) — does not call generateEmbeddings", async () => {
    mockEmbedding.mockResolvedValueOnce(QUERY_EMBEDDING);
    mockStreaming.mockResolvedValueOnce(makeStream("Your answer here."));

    const res = await POST(makeRequest({
      text: DOC_TEXT,
      question: "What are my obligations?",
      chunks: ["Section 1: This agreement governs the use of services."],
      embeddings: [CHUNK_EMBEDDING],
    }));

    expect(res.status).toBe(200);
    // generateEmbeddings should NOT be called when embeddings are provided
    expect(mockEmbeddings).not.toHaveBeenCalled();
    // Only the query embedding is generated
    expect(mockEmbedding).toHaveBeenCalledTimes(1);
  });

  it("calls generateEmbeddings when no embeddings provided (cache miss path)", async () => {
    mockEmbeddings.mockResolvedValueOnce([CHUNK_EMBEDDING]);
    mockEmbedding.mockResolvedValueOnce(QUERY_EMBEDDING);
    mockStreaming.mockResolvedValueOnce(makeStream("Your answer here."));

    const res = await POST(makeRequest({
      text: DOC_TEXT,
      question: "What are my obligations?",
    }));

    expect(res.status).toBe(200);
    expect(mockEmbeddings).toHaveBeenCalledTimes(1);
  });

  it("anti-hallucination: streams refusal when no relevant chunks found (similarity below threshold)", async () => {
    // Return embeddings that are orthogonal to query — cosine sim = 0, well below 0.4 threshold
    const ORTHOGONAL = [0, 1, 0];
    mockEmbeddings.mockResolvedValueOnce([ORTHOGONAL]);
    mockEmbedding.mockResolvedValueOnce([1, 0, 0]); // orthogonal to chunk
    mockStreaming.mockResolvedValueOnce(makeStream("This document doesn't appear to address that question."));

    const res = await POST(makeRequest({
      text: DOC_TEXT,
      question: "What is the capital of France?",
    }));

    expect(res.status).toBe(200);
    // Verify the prompt passed to streaming contains the anti-hallucination refusal instruction
    const [promptArg] = mockStreaming.mock.calls[0];
    expect(promptArg).toContain("no relevant sections");
  });

  it("returns SSE stream headers on success", async () => {
    mockEmbedding.mockResolvedValueOnce(QUERY_EMBEDDING);
    mockStreaming.mockResolvedValueOnce(makeStream("Answer here."));

    const res = await POST(makeRequest({
      text: DOC_TEXT,
      question: "What are my obligations?",
      chunks: ["Section 1: This agreement governs the use of services."],
      embeddings: [CHUNK_EMBEDDING],
    }));

    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });
});
