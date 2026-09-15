// ============================================================
// __tests__/unit/grok.test.ts
// Unit tests for lib/grok.ts — isGrokConfigured, streamGrok,
// generateGrokJSON. Fetch is mocked.
// ============================================================

// We mock fetch globally for these tests
const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
  // Default: GROK_API_KEY present
  process.env.GROK_API_KEY = "test-grok-key";
});

afterEach(() => {
  delete process.env.GROK_API_KEY;
});

import { isGrokConfigured, generateGrokJSON } from "@/lib/grok";

describe("isGrokConfigured", () => {
  it("returns true when GROK_API_KEY is set", () => {
    process.env.GROK_API_KEY = "some-key";
    expect(isGrokConfigured()).toBe(true);
  });

  it("returns false when GROK_API_KEY is not set", () => {
    delete process.env.GROK_API_KEY;
    expect(isGrokConfigured()).toBe(false);
  });

  it("returns false when GROK_API_KEY is empty string", () => {
    process.env.GROK_API_KEY = "";
    expect(isGrokConfigured()).toBe(false);
  });

  it("returns false when GROK_API_KEY is whitespace only", () => {
    process.env.GROK_API_KEY = "   ";
    expect(isGrokConfigured()).toBe(false);
  });
});

describe("generateGrokJSON", () => {
  it("parses valid JSON from Grok response", async () => {
    const payload = { summary: "Test", clauses: [] };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(payload) } }],
      }),
    });

    const result = await generateGrokJSON("Test prompt", "System prompt");
    expect(result).toEqual(payload);
  });

  it("strips markdown code fences before parsing", async () => {
    const payload = { key: "value" };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "```json\n" + JSON.stringify(payload) + "\n```" } }],
      }),
    });

    const result = await generateGrokJSON("Test prompt", "System prompt");
    expect(result).toEqual(payload);
  });

  it("throws when Grok returns non-OK status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      text: async () => "rate limited",
    });

    await expect(generateGrokJSON("prompt", "system")).rejects.toThrow();
  });

  it("throws when GROK_API_KEY is not configured", async () => {
    delete process.env.GROK_API_KEY;
    await expect(generateGrokJSON("prompt", "system")).rejects.toThrow("GROK_API_KEY is not configured");
  });

  it("throws ApiError when JSON parsing fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "this is not valid json {{" } }],
      }),
    });

    await expect(generateGrokJSON("prompt", "system")).rejects.toMatchObject({
      errorType: "UNKNOWN",
      retryable: true,
    });
  });

  it("throws when response has empty content", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "" } }],
      }),
    });

    await expect(generateGrokJSON("prompt", "system")).rejects.toThrow("Empty response");
  });
});

describe("streamGrok", () => {
  it("throws when GROK_API_KEY is not configured", async () => {
    delete process.env.GROK_API_KEY;
    const { streamGrok } = await import("@/lib/grok");
    await expect(streamGrok("prompt")).rejects.toThrow("GROK_API_KEY is not configured");
  });

  it("throws when Grok returns non-OK status", async () => {
    const { streamGrok } = await import("@/lib/grok");
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "error body",
    });
    await expect(streamGrok("prompt")).rejects.toThrow("Grok API error");
  });

  it("returns a ReadableStream when Grok returns OK", async () => {
    const { streamGrok } = await import("@/lib/grok");
    const encoder = new TextEncoder();
    // Simulate a minimal SSE stream
    const sseData = `data: ${JSON.stringify({ choices: [{ delta: { content: "hello" } }] })}\n\ndata: [DONE]\n\n`;
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseData));
        controller.close();
      },
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: readable,
    });

    const stream = await streamGrok("prompt", "system");
    expect(stream).toBeInstanceOf(ReadableStream);
  });
});
