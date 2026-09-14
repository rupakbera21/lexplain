// ============================================================
// __tests__/integration/parse.test.ts
//
// POST /api/parse — document parsing integration tests.
// File parsers are mocked.
// ============================================================

import { NextRequest } from "next/server";
import { POST } from "@/app/api/parse/route";

jest.mock("@/lib/parsers", () => ({
  parseDocument: jest.fn(),
}));

jest.mock("@/lib/ratelimit", () => ({
  checkRateLimit: jest.fn(() => null),
}));

import { parseDocument } from "@/lib/parsers";
import { checkRateLimit } from "@/lib/ratelimit";

const mockParseDocument = parseDocument as jest.MockedFunction<typeof parseDocument>;
const mockCheckRateLimit = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>;

function makeFormDataRequest(
  fields: { file?: { content: string; name: string; type: string }; text?: string },
  ip = "127.0.0.1"
): NextRequest {
  const formData = new FormData();
  if (fields.text) {
    formData.append("text", fields.text);
  }
  if (fields.file) {
    const blob = new Blob([fields.file.content], { type: fields.file.type });
    const file = new File([blob], fields.file.name, { type: fields.file.type });
    formData.append("file", file);
  }
  return new NextRequest("http://localhost/api/parse", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body: formData,
  });
}

const LONG_ENOUGH = "This is a pasted legal document with sufficient content for testing.";

describe("POST /api/parse", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockReturnValue(null);
  });

  // ── Pasted text path ────────────────────────────────────────

  it("returns parsed result for pasted text", async () => {
    const req = makeFormDataRequest({ text: LONG_ENOUGH });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.text).toBe(LONG_ENOUGH.trim());
    expect(data.documentHash).toBeDefined();
    expect(typeof data.wordCount).toBe("number");
    expect(data.name).toBe("Pasted Document");
  });

  it("returns 400 for pasted text shorter than minimum", async () => {
    const req = makeFormDataRequest({ text: "hi" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // ── File upload path ────────────────────────────────────────

  it("returns 400 for unsupported file type (image/jpeg)", async () => {
    const req = makeFormDataRequest({
      file: { content: "fake content", name: "photo.jpg", type: "image/jpeg" },
    });
    const res = await POST(req);
    expect(res.status).toBe(415);
    const data = await res.json();
    expect(data.errorType).toBe("UNSUPPORTED_FILE");
  });

  it("returns parsed result for a valid plain-text file", async () => {
    mockParseDocument.mockResolvedValueOnce({
      text: LONG_ENOUGH,
      wordCount: 13,
    });
    const req = makeFormDataRequest({
      file: { content: LONG_ENOUGH, name: "contract.txt", type: "text/plain" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.text).toBe(LONG_ENOUGH);
    expect(data.documentHash).toBeDefined();
    expect(data.name).toBe("contract.txt");
  });

  it("returns 400 when no file or text is provided", async () => {
    const req = new NextRequest("http://localhost/api/parse", {
      method: "POST",
      headers: { "x-forwarded-for": "127.0.0.1" },
      body: new FormData(),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockReturnValueOnce({
      error: "Rate limit exceeded.",
      errorType: "RATE_LIMIT",
      retryable: true,
    });
    const req = makeFormDataRequest({ text: LONG_ENOUGH });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });
});
