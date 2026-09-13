// ============================================================
// app/api/analyze-clauses/route.ts — Clause extraction & risk scoring
//
// GenAI technique: Structured JSON output via responseMimeType.
// Returns: ClauseAnalysis with typed clauses, severity, explanations.
// Result is memoizable by documentHash on the client.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { generateStructuredJSON } from "@/lib/gemini";
import { prepareDocumentForPrompt } from "@/lib/sanitize";
import { hashDocument } from "@/lib/chunker";
import { checkRateLimit } from "@/lib/ratelimit";
import { ClauseAnalysis, Clause, ApiError } from "@/types";
import { v4 as uuidv4 } from "uuid";

const SYSTEM_PROMPT = `You are a senior legal analyst. Your task is to extract and classify every significant clause from the provided legal document.

For each clause you identify:
1. Extract the clause text verbatim (or a clear representative excerpt if very long)
2. Classify it as one of: "obligation" (what a party MUST do), "right" (what a party CAN do or is entitled to), "risk" (potentially harmful or unfavorable term), or "neutral" (standard boilerplate with no particular advantage to either party)
3. If type is "risk", assign a severity: "low" (minor inconvenience), "medium" (notable concern worth flagging), or "high" (serious red flag — could significantly harm the user)
4. Provide a 1-2 sentence plain-language explanation of what this clause means in practice
5. Identify the section/clause number if present in the document

High-risk clauses include (but are not limited to):
- Automatic renewal with no notice requirement
- One-sided termination rights
- Unlimited liability or indemnification of the other party
- Broad IP assignment (including future inventions)
- Non-compete or non-solicitation clauses with wide scope
- Waiver of jury trial or class action rights
- Mandatory arbitration in a distant jurisdiction
- Unilateral right to modify terms
- Unusual or punitive liquidated damages

Return ONLY a valid JSON object with this exact structure:
{
  "summary": "One paragraph overview of the document in plain language",
  "clauses": [
    {
      "id": "unique-string",
      "text": "verbatim or excerpt from document",
      "type": "obligation|right|risk|neutral",
      "severity": "low|medium|high|null",
      "explanation": "plain language explanation",
      "section": "section identifier or null"
    }
  ],
  "riskCount": {
    "low": 0,
    "medium": 0,
    "high": 0
  }
}

Be thorough. Aim to identify 10-25 clauses for a typical legal document.`;

function errorResponse(err: ApiError, status: number = 400) {
  return NextResponse.json(err, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateLimitError = checkRateLimit(req);
  if (rateLimitError) return errorResponse(rateLimitError, 429);

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse({ error: "Invalid request body.", errorType: "INVALID_INPUT", retryable: false }, 400);
  }

  const { text } = body;
  if (!text || text.trim().length < 10) {
    return errorResponse({ error: "Document text is required.", errorType: "INVALID_INPUT", retryable: false }, 400);
  }

  const sanitized = prepareDocumentForPrompt(text);
  const documentHash = hashDocument(text);
  const prompt = `Analyze the following legal document and extract all significant clauses:\n\n---\n${sanitized}\n---`;

  try {
    const result = await generateStructuredJSON<{
      summary: string;
      clauses: Omit<Clause, "id">[];
      riskCount: { low: number; medium: number; high: number };
    }>(prompt, SYSTEM_PROMPT);

    // Assign UUIDs to clauses and validate types
    const clauses: Clause[] = result.clauses.map((c) => ({
      ...c,
      id: uuidv4(),
      // Ensure nullish severity becomes undefined
      severity: c.severity ?? undefined,
    }));

    // Recount risks from actual clauses (more reliable than model's count)
    const riskCount = clauses.reduce(
      (acc, c) => {
        if (c.type === "risk" && c.severity) {
          acc[c.severity] = (acc[c.severity] ?? 0) + 1;
        }
        return acc;
      },
      { low: 0, medium: 0, high: 0 }
    );

    const response: ClauseAnalysis = {
      summary: result.summary,
      clauses,
      riskCount,
      documentHash,
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    const apiErr = err as ApiError;
    const status = apiErr.errorType === "RATE_LIMIT" ? 429 : apiErr.errorType === "INVALID_INPUT" ? 400 : 503;
    return errorResponse(
      apiErr.error
        ? apiErr
        : { error: "Couldn't analyze this document right now — please try again.", errorType: "UNKNOWN", retryable: true },
      status
    );
  }
}
