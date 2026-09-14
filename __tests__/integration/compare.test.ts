// ============================================================
// __tests__/integration/compare.test.ts
//
// POST /api/compare — document comparison integration tests.
// ============================================================

import { NextRequest } from "next/server";
import { POST } from "@/app/api/compare/route";

jest.mock("@/lib/gemini", () => ({
  generateStructuredJSON: jest.fn(),
}));

jest.mock("@/lib/ratelimit", () => ({
  checkRateLimit: jest.fn(() => null),
}));

import { generateStructuredJSON } from "@/lib/gemini";
import { checkRateLimit } from "@/lib/ratelimit";

const mockGenJSON = generateStructuredJSON as jest.MockedFunction<typeof generateStructuredJSON>;
const mockCheckRateLimit = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>;

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
    body: JSON.stringify(body),
  });
}

const DOC1 = "This is the first legal document with enough text content for testing purposes here.";
const DOC2 = "This is the second legal document with enough text content but with different terms here.";

const MOCK_COMPARISON = {
  items: [
    {
      aspect: "Termination clause",
      doc1Summary: "30 days notice required.",
      doc2Summary: "Immediate termination allowed.",
      difference: "Document 2 allows immediate termination without notice.",
      significance: "major" as const,
    },
  ],
  overallDifferences: "The documents differ significantly on termination rights.",
  recommendation: "Document 1 is more favorable as it provides notice before termination.",
};

describe("POST /api/compare", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockReturnValue(null);
  });

  it("returns 400 for missing first document", async () => {
    const res = await POST(makeRequest({ text2: DOC2 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.errorType).toBe("INVALID_INPUT");
  });

  it("returns 400 for missing second document", async () => {
    const res = await POST(makeRequest({ text1: DOC1 }));
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockReturnValueOnce({
      error: "Rate limit exceeded.",
      errorType: "RATE_LIMIT",
      retryable: true,
    });
    const res = await POST(makeRequest({ text1: DOC1, text2: DOC2 }));
    expect(res.status).toBe(429);
  });

  it("returns valid ComparisonResult shape", async () => {
    mockGenJSON.mockResolvedValueOnce(MOCK_COMPARISON);
    const res = await POST(makeRequest({ text1: DOC1, text2: DOC2 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.overallDifferences).toBe("string");
    expect(typeof data.recommendation).toBe("string");
  });

  it("each item has required fields", async () => {
    mockGenJSON.mockResolvedValueOnce(MOCK_COMPARISON);
    const res = await POST(makeRequest({ text1: DOC1, text2: DOC2 }));
    const data = await res.json();
    for (const item of data.items) {
      expect(item).toHaveProperty("aspect");
      expect(item).toHaveProperty("doc1Summary");
      expect(item).toHaveProperty("doc2Summary");
      expect(item).toHaveProperty("difference");
      expect(item).toHaveProperty("significance");
      expect(["minor", "moderate", "major"]).toContain(item.significance);
    }
  });

  it("returns 503 when Gemini fails", async () => {
    mockGenJSON.mockRejectedValueOnce({
      error: "Service unavailable.",
      errorType: "SERVICE_UNAVAILABLE",
      retryable: true,
    });
    const res = await POST(makeRequest({ text1: DOC1, text2: DOC2 }));
    expect(res.status).toBe(503);
  });
});
