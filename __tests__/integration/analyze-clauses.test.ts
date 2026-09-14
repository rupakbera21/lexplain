// ============================================================
// __tests__/integration/analyze-clauses.test.ts
//
// POST /api/analyze-clauses — clause extraction integration tests.
// Gemini JSON generation is mocked.
// ============================================================

import { NextRequest } from "next/server";
import { POST } from "@/app/api/analyze-clauses/route";

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
  return new NextRequest("http://localhost/api/analyze-clauses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
    body: JSON.stringify(body),
  });
}

const VALID_TEXT = "This is a valid legal document with sufficient content for clause analysis testing.";

const MOCK_GEMINI_RESPONSE = {
  summary: "This is a test contract governing the use of services.",
  clauses: [
    {
      text: "Either party may terminate with 30 days notice.",
      type: "right",
      severity: null,
      explanation: "Both parties can end the contract with 30 days notice.",
      section: "Section 5",
    },
    {
      text: "User waives all rights to class action lawsuits.",
      type: "risk",
      severity: "high",
      explanation: "You cannot join a class-action lawsuit against this company.",
      section: "Section 12",
    },
  ],
  riskCount: { low: 0, medium: 0, high: 1 },
};

describe("POST /api/analyze-clauses", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockReturnValue(null);
  });

  it("returns 400 for missing text", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.errorType).toBe("INVALID_INPUT");
  });

  it("returns 400 for text shorter than 10 chars", async () => {
    const res = await POST(makeRequest({ text: "short" }));
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockReturnValueOnce({
      error: "Rate limit exceeded.",
      errorType: "RATE_LIMIT",
      retryable: true,
    });
    const res = await POST(makeRequest({ text: VALID_TEXT }));
    expect(res.status).toBe(429);
  });

  it("returns valid ClauseAnalysis shape for correct input", async () => {
    mockGenJSON.mockResolvedValueOnce(MOCK_GEMINI_RESPONSE);
    const res = await POST(makeRequest({ text: VALID_TEXT }));
    expect(res.status).toBe(200);
    const data = await res.json();

    // Shape validation
    expect(data).toHaveProperty("summary");
    expect(data).toHaveProperty("clauses");
    expect(data).toHaveProperty("riskCount");
    expect(data).toHaveProperty("documentHash");
    expect(Array.isArray(data.clauses)).toBe(true);
    expect(typeof data.summary).toBe("string");
  });

  it("assigns a UUID id to each clause", async () => {
    mockGenJSON.mockResolvedValueOnce(MOCK_GEMINI_RESPONSE);
    const res = await POST(makeRequest({ text: VALID_TEXT }));
    const data = await res.json();
    for (const clause of data.clauses) {
      expect(clause.id).toBeDefined();
      expect(typeof clause.id).toBe("string");
      expect(clause.id.length).toBeGreaterThan(0);
    }
  });

  it("recounts riskCount from actual clauses (ignores model count)", async () => {
    // Model says high: 0 but clauses contain one high-risk clause
    const responseWithWrongCount = {
      ...MOCK_GEMINI_RESPONSE,
      riskCount: { low: 0, medium: 0, high: 0 }, // intentionally wrong
    };
    mockGenJSON.mockResolvedValueOnce(responseWithWrongCount);

    const res = await POST(makeRequest({ text: VALID_TEXT }));
    const data = await res.json();
    // Should recount to 1 from actual clause data
    expect(data.riskCount.high).toBe(1);
  });

  it("returns 503 when Gemini fails", async () => {
    mockGenJSON.mockRejectedValueOnce({
      error: "Service unavailable.",
      errorType: "SERVICE_UNAVAILABLE",
      retryable: true,
    });
    const res = await POST(makeRequest({ text: VALID_TEXT }));
    expect(res.status).toBe(503);
  });

  it("handles clauses with null severity gracefully", async () => {
    mockGenJSON.mockResolvedValueOnce(MOCK_GEMINI_RESPONSE);
    const res = await POST(makeRequest({ text: VALID_TEXT }));
    const data = await res.json();
    const rightClause = data.clauses.find((c: { type: string }) => c.type === "right");
    // null severity from model should be undefined (not null) in output
    expect(rightClause.severity).toBeUndefined();
  });
});
