// ============================================================
// __tests__/unit/gemini.test.ts
// Unit tests for lib/gemini.ts — classifyError, callWithRetry,
// generateStreamingResponse (Grok fallback), generateStructuredJSON,
// generateEmbedding, generateEmbeddings.
// All external API calls are mocked.
// ============================================================

// Reset the singleton so tests don't bleed state between them
beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-mock-gemini-key";
  jest.resetModules();
});

// ── classifyError ─────────────────────────────────────────────
describe("classifyError (via callWithRetry error surface)", () => {
  // classifyError is not exported but its behavior surfaces through callWithRetry
  // We test it indirectly by throwing errors with known messages.

  it("classifies 429 / quota / rate limit errors as RATE_LIMIT (retryable)", async () => {
    jest.mock("@google/generative-ai", () => ({
      GoogleGenerativeAI: jest.fn(() => ({
        getGenerativeModel: jest.fn(() => ({})),
      })),
      HarmCategory: {},
      HarmBlockThreshold: {},
    }));
    // Reset module so singletons pick up the mock
    const { callWithRetry } = await import("@/lib/gemini");
    const fn = jest.fn().mockRejectedValue(new Error("Request failed with status 429"));
    await expect(callWithRetry(fn, 0)).rejects.toMatchObject({
      errorType: "RATE_LIMIT",
      retryable: true,
    });
  });

  it("classifies 503 / unavailable errors as SERVICE_UNAVAILABLE (retryable)", async () => {
    jest.mock("@google/generative-ai", () => ({
      GoogleGenerativeAI: jest.fn(() => ({ getGenerativeModel: jest.fn(() => ({})) })),
      HarmCategory: {},
      HarmBlockThreshold: {},
    }));
    const { callWithRetry } = await import("@/lib/gemini");
    const fn = jest.fn().mockRejectedValue(new Error("Service unavailable 503"));
    await expect(callWithRetry(fn, 0)).rejects.toMatchObject({
      errorType: "SERVICE_UNAVAILABLE",
    });
  });

  it("classifies timeout errors as SERVICE_UNAVAILABLE (retryable)", async () => {
    jest.mock("@google/generative-ai", () => ({
      GoogleGenerativeAI: jest.fn(() => ({ getGenerativeModel: jest.fn(() => ({})) })),
      HarmCategory: {},
      HarmBlockThreshold: {},
    }));
    const { callWithRetry } = await import("@/lib/gemini");
    const fn = jest.fn().mockRejectedValue(new Error("Request timeout exceeded deadline"));
    await expect(callWithRetry(fn, 0)).rejects.toMatchObject({
      errorType: "SERVICE_UNAVAILABLE",
    });
  });

  it("classifies 400 / invalid errors as INVALID_INPUT (not retryable)", async () => {
    jest.mock("@google/generative-ai", () => ({
      GoogleGenerativeAI: jest.fn(() => ({ getGenerativeModel: jest.fn(() => ({})) })),
      HarmCategory: {},
      HarmBlockThreshold: {},
    }));
    const { callWithRetry } = await import("@/lib/gemini");
    const fn = jest.fn().mockRejectedValue(new Error("400 Invalid request"));
    await expect(callWithRetry(fn, 0)).rejects.toMatchObject({
      errorType: "INVALID_INPUT",
      retryable: false,
    });
  });

  it("classifies auth / api key errors as UNKNOWN (not retryable)", async () => {
    jest.mock("@google/generative-ai", () => ({
      GoogleGenerativeAI: jest.fn(() => ({ getGenerativeModel: jest.fn(() => ({})) })),
      HarmCategory: {},
      HarmBlockThreshold: {},
    }));
    const { callWithRetry } = await import("@/lib/gemini");
    const fn = jest.fn().mockRejectedValue(new Error("401 Unauthorized api key invalid"));
    await expect(callWithRetry(fn, 0)).rejects.toMatchObject({
      errorType: "UNKNOWN",
      retryable: false,
    });
  });
});

// ── callWithRetry ─────────────────────────────────────────────
describe("callWithRetry", () => {
  beforeAll(() => {
    jest.mock("@google/generative-ai", () => ({
      GoogleGenerativeAI: jest.fn(() => ({ getGenerativeModel: jest.fn(() => ({})) })),
      HarmCategory: {},
      HarmBlockThreshold: {},
    }));
  });

  it("returns the result immediately on first success", async () => {
    const { callWithRetry } = await import("@/lib/gemini");
    const fn = jest.fn().mockResolvedValue("success");
    const result = await callWithRetry(fn, 2);
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable errors and succeeds on second attempt", async () => {
    const { callWithRetry } = await import("@/lib/gemini");
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("503 service unavailable"))
      .mockResolvedValueOnce("success-after-retry");
    const result = await callWithRetry(fn, 2);
    expect(result).toBe("success-after-retry");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws immediately on non-retryable errors without retrying", async () => {
    const { callWithRetry } = await import("@/lib/gemini");
    const fn = jest.fn().mockRejectedValue(new Error("400 invalid request"));
    await expect(callWithRetry(fn, 3)).rejects.toMatchObject({ retryable: false });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("exhausts retries and throws after maxRetries attempts", async () => {
    const { callWithRetry } = await import("@/lib/gemini");
    const fn = jest.fn().mockRejectedValue(new Error("503 service unavailable"));
    await expect(callWithRetry(fn, 1)).rejects.toBeDefined();
    // maxRetries=1 means: attempt 0 and attempt 1 = 2 total calls
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ── generateEmbeddings concurrency (EFF-02) ───────────────────
describe("generateEmbeddings concurrency behavior", () => {
  it("returns the same number of embeddings as input chunks", async () => {
    jest.mock("@google/generative-ai", () => ({
      GoogleGenerativeAI: jest.fn(() => ({
        getGenerativeModel: jest.fn(() => ({
          embedContent: jest.fn().mockResolvedValue({
            embedding: { values: [0.1, 0.2, 0.3] },
          }),
        })),
      })),
      HarmCategory: {},
      HarmBlockThreshold: {},
    }));
    const { generateEmbeddings } = await import("@/lib/gemini");
    const chunks = Array.from({ length: 25 }, (_, i) => `chunk ${i}`);
    const embeddings = await generateEmbeddings(chunks);
    expect(embeddings).toHaveLength(25);
    for (const emb of embeddings) {
      expect(emb).toEqual([0.1, 0.2, 0.3]);
    }
  });

  it("handles empty chunks array", async () => {
    jest.mock("@google/generative-ai", () => ({
      GoogleGenerativeAI: jest.fn(() => ({
        getGenerativeModel: jest.fn(() => ({
          embedContent: jest.fn().mockResolvedValue({ embedding: { values: [1] } }),
        })),
      })),
      HarmCategory: {},
      HarmBlockThreshold: {},
    }));
    const { generateEmbeddings } = await import("@/lib/gemini");
    const result = await generateEmbeddings([]);
    expect(result).toHaveLength(0);
  });
});

// ── Quota-specific Grok fallback (Part 4 — audit fix tests) ───
// These tests verify the new discriminating fallback behavior:
// - RATE_LIMIT (429/quota) errors → Grok fallback triggered
// - INVALID_INPUT (400) errors   → Grok fallback NOT triggered (throws honest error)

describe("generateStreamingResponse — quota-specific Grok fallback", () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    process.env.GEMINI_API_KEY = "test-mock-gemini-key";
    process.env.XAI_API_KEY = "test-mock-xai-key";
    global.fetch = mockFetch;
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.XAI_API_KEY;
  });

  it("falls back to Grok (streaming) when Gemini throws a 429 quota error", async () => {
    jest.mock("@google/generative-ai", () => ({
      GoogleGenerativeAI: jest.fn(() => ({
        getGenerativeModel: jest.fn(() => ({
          generateContentStream: jest.fn().mockRejectedValue(new Error("Request failed with status 429 quota exceeded")),
        })),
      })),
      HarmCategory: {},
      HarmBlockThreshold: {},
    }));

    // Mock Grok streaming response
    const encoder = new TextEncoder();
    const sseChunk = `data: ${JSON.stringify({ choices: [{ delta: { content: "fallback answer" } }] })}\n\ndata: [DONE]\n\n`;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: new ReadableStream({
        start(ctrl) {
          ctrl.enqueue(encoder.encode(sseChunk));
          ctrl.close();
        },
      }),
    });

    const { generateStreamingResponse } = await import("@/lib/gemini");
    const stream = await generateStreamingResponse("test prompt");
    expect(stream).toBeInstanceOf(ReadableStream);

    // Drain and verify via_fallback sentinel is first event
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let fullOutput = "";
    let done = false;
    while (!done) {
      const { value, done: d } = await reader.read();
      done = d;
      if (value) fullOutput += decoder.decode(value);
    }
    expect(fullOutput).toContain('"via_fallback":true');
    expect(fullOutput).toContain('"text":"fallback answer"');
  });

  it("does NOT fall back to Grok (streaming) when Gemini throws an INVALID_INPUT (400) error", async () => {
    jest.mock("@google/generative-ai", () => ({
      GoogleGenerativeAI: jest.fn(() => ({
        getGenerativeModel: jest.fn(() => ({
          generateContentStream: jest.fn().mockRejectedValue(new Error("400 invalid request — bad content")),
        })),
      })),
      HarmCategory: {},
      HarmBlockThreshold: {},
    }));

    const { generateStreamingResponse } = await import("@/lib/gemini");
    // Should throw — Grok should NOT be called
    await expect(generateStreamingResponse("bad prompt")).rejects.toBeDefined();
    // fetch (Grok) must NOT have been called
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("generateStructuredJSON — quota-specific Grok fallback", () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    process.env.GEMINI_API_KEY = "test-mock-gemini-key";
    process.env.XAI_API_KEY = "test-mock-xai-key";
    global.fetch = mockFetch;
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.XAI_API_KEY;
  });

  it("falls back to Grok (JSON) when Gemini throws a quota (429) error and attaches _via_fallback marker", async () => {
    jest.mock("@google/generative-ai", () => ({
      GoogleGenerativeAI: jest.fn(() => ({
        getGenerativeModel: jest.fn(() => ({
          generateContent: jest.fn().mockRejectedValue(new Error("429 RESOURCE_EXHAUSTED quota exceeded")),
        })),
      })),
      HarmCategory: {},
      HarmBlockThreshold: {},
    }));

    const grokPayload = { summary: "Grok answer", clauses: [] };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(grokPayload) } }],
      }),
    });

    const { generateStructuredJSON } = await import("@/lib/gemini");
    const result = await generateStructuredJSON<typeof grokPayload>("prompt", "system");
    expect(result.summary).toBe("Grok answer");
    // Fallback marker must be present
    expect((result as Record<string, unknown>)._via_fallback).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does NOT fall back to Grok (JSON) when Gemini throws an INVALID_INPUT (400) error", async () => {
    jest.mock("@google/generative-ai", () => ({
      GoogleGenerativeAI: jest.fn(() => ({
        getGenerativeModel: jest.fn(() => ({
          generateContent: jest.fn().mockRejectedValue(new Error("400 invalid request body")),
        })),
      })),
      HarmCategory: {},
      HarmBlockThreshold: {},
    }));

    const { generateStructuredJSON } = await import("@/lib/gemini");
    await expect(generateStructuredJSON("bad prompt", "system")).rejects.toBeDefined();
    // Grok (fetch) must NOT have been called
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

