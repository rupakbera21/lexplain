// ============================================================
// __tests__/integration/next-steps.test.ts
//
// POST /api/next-steps — checklist generation integration tests.
// Verifies clause-present vs clause-absent branching (EFF-04 fix).
// ============================================================

import { NextRequest } from "next/server";
import { POST } from "@/app/api/next-steps/route";

jest.mock("@/lib/gemini", () => ({
  generateStructuredJSON: jest.fn(),
}));

jest.mock("@/lib/ratelimit", () => ({
  checkRateLimit: jest.fn(async () => null),
}));

import { generateStructuredJSON } from "@/lib/gemini";
import { checkRateLimit } from "@/lib/ratelimit";

const mockGenJSON = generateStructuredJSON as jest.MockedFunction<typeof generateStructuredJSON>;
const mockCheckRateLimit = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>;

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/next-steps", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
    body: JSON.stringify(body),
  });
}

const DOC_TEXT =
  "Section 1: The User agrees not to sue. Section 2: Arbitration is mandatory in Delaware. Section 3: All rights are waived.";

const RISK_CLAUSES = [
  {
    id: "c1",
    text: "User waives all rights to class action.",
    type: "risk" as const,
    severity: "high" as const,
    explanation: "You cannot join a class-action lawsuit.",
    section: "Section 12",
  },
];

const MOCK_NEXT_STEPS = {
  beforeYouSign: [
    { item: "Consult a lawyer about the class action waiver.", category: "action", priority: "high" },
  ],
  questionsForLawyer: ["What are the implications of waiving class action rights?"],
  redFlags: ["Class action waiver — you lose the right to join group lawsuits."],
};

describe("POST /api/next-steps", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue(null);
  });

  it("returns 400 for missing document text", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.errorType).toBe("INVALID_INPUT");
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      error: "Rate limit exceeded.",
      errorType: "RATE_LIMIT",
      retryable: true,
    });
    const res = await POST(makeRequest({ text: DOC_TEXT }));
    expect(res.status).toBe(429);
  });

  it("returns valid NextStepsResult shape", async () => {
    mockGenJSON.mockResolvedValueOnce(MOCK_NEXT_STEPS);
    const res = await POST(makeRequest({ text: DOC_TEXT, clauses: RISK_CLAUSES, summary: "A test contract." }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.beforeYouSign)).toBe(true);
    expect(Array.isArray(data.questionsForLawyer)).toBe(true);
    expect(Array.isArray(data.redFlags)).toBe(true);
  });

  it("clause-present path: prompt does NOT include full document section", async () => {
    mockGenJSON.mockResolvedValueOnce(MOCK_NEXT_STEPS);
    await POST(makeRequest({
      text: DOC_TEXT,
      clauses: RISK_CLAUSES,
      summary: "A test contract with a class action waiver.",
    }));
    const [promptArg] = mockGenJSON.mock.calls[0];
    expect(promptArg).not.toContain("Full Document (for context):");
  });

  it("clause-absent path: prompt DOES include full document section", async () => {
    mockGenJSON.mockResolvedValueOnce(MOCK_NEXT_STEPS);
    await POST(makeRequest({
      text: DOC_TEXT,
      clauses: [],     // no clauses
      summary: "",     // no summary
    }));
    const [promptArg] = mockGenJSON.mock.calls[0];
    expect(promptArg).toContain("Full Document (for context):");
  });

  it("defaults to empty arrays when clauses/summary omitted", async () => {
    mockGenJSON.mockResolvedValueOnce(MOCK_NEXT_STEPS);
    // No clauses or summary — should trigger fallback path
    const res = await POST(makeRequest({ text: DOC_TEXT }));
    expect(res.status).toBe(200);
    const [promptArg] = mockGenJSON.mock.calls[0];
    // Without clause context, full doc should appear
    expect(promptArg).toContain("Full Document (for context):");
  });

  it("returns 503 when Gemini fails", async () => {
    mockGenJSON.mockRejectedValueOnce({
      error: "Service unavailable.",
      errorType: "SERVICE_UNAVAILABLE",
      retryable: true,
    });
    const res = await POST(makeRequest({ text: DOC_TEXT }));
    expect(res.status).toBe(503);
  });

  it("checklist items have required fields", async () => {
    mockGenJSON.mockResolvedValueOnce(MOCK_NEXT_STEPS);
    const res = await POST(makeRequest({ text: DOC_TEXT, clauses: RISK_CLAUSES, summary: "A contract." }));
    const data = await res.json();
    for (const item of data.beforeYouSign) {
      expect(item).toHaveProperty("item");
      expect(item).toHaveProperty("category");
      expect(item).toHaveProperty("priority");
      expect(["action", "question", "warning"]).toContain(item.category);
      expect(["high", "medium", "low"]).toContain(item.priority);
    }
  });
});
