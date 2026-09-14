// ============================================================
// __tests__/integration/simplify.test.ts
//
// POST /api/simplify — streaming response integration tests.
// Gemini is mocked so no live API calls are made.
// ============================================================

import { NextRequest } from "next/server";
import { POST } from "@/app/api/simplify/route";

// Mock Gemini
jest.mock("@/lib/gemini", () => ({
  generateStreamingResponse: jest.fn(),
}));

// Mock rate limiter (allow all by default)
jest.mock("@/lib/ratelimit", () => ({
  checkRateLimit: jest.fn(() => null),
}));

import { generateStreamingResponse } from "@/lib/gemini";
import { checkRateLimit } from "@/lib/ratelimit";

const mockGenerateStreaming = generateStreamingResponse as jest.MockedFunction<typeof generateStreamingResponse>;
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

function makeRequest(body: unknown, ip = "127.0.0.1"): NextRequest {
  return new NextRequest("http://localhost/api/simplify", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

const VALID_TEXT = "This is a valid legal document with sufficient length for testing purposes.";

describe("POST /api/simplify", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockReturnValue(null);
  });

  it("returns 400 for missing text", async () => {
    const res = await POST(makeRequest({ level: "standard" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.errorType).toBe("INVALID_INPUT");
  });

  it("returns 400 for text shorter than 10 chars", async () => {
    const res = await POST(makeRequest({ text: "hi", level: "standard" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid reading level", async () => {
    const res = await POST(makeRequest({ text: VALID_TEXT, level: "expert" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.errorType).toBe("INVALID_INPUT");
  });

  it("returns a streaming SSE response for valid input", async () => {
    mockGenerateStreaming.mockResolvedValueOnce(makeStream("Here is your summary."));
    const res = await POST(makeRequest({ text: VALID_TEXT, level: "standard" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
  });

  it("calls generateStreamingResponse with simple system prompt for level=simple", async () => {
    mockGenerateStreaming.mockResolvedValueOnce(makeStream("Simple explanation."));
    await POST(makeRequest({ text: VALID_TEXT, level: "simple" }));
    const [, systemPrompt] = mockGenerateStreaming.mock.calls[0];
    expect(systemPrompt).toContain("10-year-old");
  });

  it("calls generateStreamingResponse with detailed system prompt for level=detailed", async () => {
    mockGenerateStreaming.mockResolvedValueOnce(makeStream("Detailed explanation."));
    await POST(makeRequest({ text: VALID_TEXT, level: "detailed" }));
    const [, systemPrompt] = mockGenerateStreaming.mock.calls[0];
    expect(systemPrompt).toContain("Executive Summary");
  });

  it("defaults to standard level when level is omitted", async () => {
    mockGenerateStreaming.mockResolvedValueOnce(makeStream("Standard explanation."));
    await POST(makeRequest({ text: VALID_TEXT }));
    const [, systemPrompt] = mockGenerateStreaming.mock.calls[0];
    expect(systemPrompt).not.toContain("10-year-old");
    expect(systemPrompt).not.toContain("Executive Summary");
  });

  it("returns 429 when rate limit is hit", async () => {
    mockCheckRateLimit.mockReturnValueOnce({
      error: "Rate limit exceeded. Please wait 30 seconds before trying again.",
      errorType: "RATE_LIMIT",
      retryable: true,
    });
    const res = await POST(makeRequest({ text: VALID_TEXT, level: "standard" }));
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.errorType).toBe("RATE_LIMIT");
  });

  it("returns 503 when Gemini throws a service error", async () => {
    mockGenerateStreaming.mockRejectedValueOnce({
      error: "Service unavailable.",
      errorType: "SERVICE_UNAVAILABLE",
      retryable: true,
    });
    const res = await POST(makeRequest({ text: VALID_TEXT, level: "standard" }));
    expect(res.status).toBe(503);
  });
});
