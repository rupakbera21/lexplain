// ============================================================
// app/api/next-steps/route.ts — Before-You-Sign checklist + lawyer questions
//
// GenAI technique: Prompted generation conditioned on the risk-flagged
// clauses from analyze-clauses. Produces a structured checklist.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { generateStructuredJSON } from "@/lib/gemini";
import { prepareDocumentForPrompt } from "@/lib/sanitize";
import { checkRateLimit } from "@/lib/ratelimit";
import { Clause, NextStepsResult, ApiError } from "@/types";

const SYSTEM_PROMPT = `You are a senior legal advisor helping someone understand what to do before signing a legal document.

Based on the document summary and identified risk clauses, generate:

1. A "Before You Sign" checklist — specific actions the person should take or verify before signing. Make each item concrete and actionable (not vague advice like "read carefully").

2. A list of specific questions to ask a lawyer — focused on the most concerning or unclear aspects of this document. These should be real, pointed questions a lawyer would actually help with.

3. A "Red Flags" list — the top 3 most concerning aspects of this document that deserve immediate attention.

Each checklist item should have:
- item: the action or question text
- category: "action" (something to do), "question" (something to ask/verify), or "warning" (something to be aware of)
- priority: "high" (do before signing), "medium" (important but not blocking), or "low" (nice to have)

Return ONLY valid JSON:
{
  "beforeYouSign": [
    { "item": "string", "category": "action|question|warning", "priority": "high|medium|low" }
  ],
  "questionsForLawyer": [
    "Specific question 1",
    "Specific question 2"
  ],
  "redFlags": [
    "Red flag 1 — explanation",
    "Red flag 2 — explanation",
    "Red flag 3 — explanation"
  ]
}

Generate 8-15 before-you-sign items, 5-10 lawyer questions, and exactly 3 red flags.
If there are no high-severity risks, still generate practical general-purpose checklist items for this document type.`;

function errorResponse(err: ApiError, status: number = 400) {
  return NextResponse.json(err, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateLimitError = checkRateLimit(req);
  if (rateLimitError) return errorResponse(rateLimitError, 429);

  let body: { text?: string; clauses?: Clause[]; summary?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse({ error: "Invalid request body.", errorType: "INVALID_INPUT", retryable: false }, 400);
  }

  const { text, clauses = [], summary = "" } = body;

  if (!text || text.trim().length < 10) {
    return errorResponse({ error: "Document text is required.", errorType: "INVALID_INPUT", retryable: false }, 400);
  }

  // Build a risk-focused summary for the prompt
  const riskClauses = clauses.filter((c) => c.type === "risk");
  const highRisks = riskClauses.filter((c) => c.severity === "high");
  const medRisks = riskClauses.filter((c) => c.severity === "medium");

  const sanitizedText = prepareDocumentForPrompt(text, 20000);

  const clauseSummary = [
    summary ? `Document Summary: ${summary}` : "",
    highRisks.length > 0
      ? `HIGH SEVERITY RISKS (${highRisks.length}):\n${highRisks.map((c) => `- ${c.explanation} [Section: ${c.section ?? "unspecified"}]`).join("\n")}`
      : "",
    medRisks.length > 0
      ? `MEDIUM SEVERITY RISKS (${medRisks.length}):\n${medRisks.map((c) => `- ${c.explanation}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const prompt = `Here is the legal document and risk analysis:

${clauseSummary || "No prior risk analysis available — analyze from the document below."}

Full Document (for context):
---
${sanitizedText}
---

Generate the Before-You-Sign checklist and lawyer questions.`;

  try {
    const result = await generateStructuredJSON<NextStepsResult>(prompt, SYSTEM_PROMPT);

    return NextResponse.json({
      beforeYouSign: result.beforeYouSign ?? [],
      questionsForLawyer: result.questionsForLawyer ?? [],
      redFlags: result.redFlags ?? [],
    } as NextStepsResult);
  } catch (err: unknown) {
    const apiErr = err as ApiError;
    const status = apiErr.errorType === "RATE_LIMIT" ? 429 : apiErr.errorType === "INVALID_INPUT" ? 400 : 503;
    return errorResponse(
      apiErr.error
        ? apiErr
        : { error: "Couldn't generate the checklist right now — please try again.", errorType: "UNKNOWN", retryable: true },
      status
    );
  }
}
