// ============================================================
// app/api/compare/route.ts — Two-document comparison
//
// GenAI technique: Two-document diff prompt producing structured
// "what changed / why it matters" pairs as JSON output.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { generateStructuredJSON } from "@/lib/gemini";
import { prepareDocumentForPrompt } from "@/lib/sanitize";
import { checkRateLimit } from "@/lib/ratelimit";
import { ComparisonResult, ComparisonItem, ApiError } from "@/types";

const SYSTEM_PROMPT = `You are a senior legal analyst comparing two versions of a legal document (or two different legal documents).

Your task is to identify meaningful differences between Document 1 and Document 2 and explain what each difference means for the reader.

For each significant difference:
1. Name the aspect being compared (e.g., "Termination clause", "Payment terms", "Non-compete scope")
2. Summarize what Document 1 says about it
3. Summarize what Document 2 says about it
4. Explain the practical significance of this difference — which document is better for the reader, and why
5. Rate the significance: "minor" (cosmetic difference), "moderate" (worth noting), or "major" (could significantly affect rights or obligations)

Also provide:
- An overall summary of the differences between the documents
- A recommendation: overall, which document is more favorable, and what key changes to look out for

Return ONLY valid JSON with this structure:
{
  "items": [
    {
      "aspect": "string",
      "doc1Summary": "string",
      "doc2Summary": "string",
      "difference": "string — plain-language explanation of significance",
      "significance": "minor|moderate|major"
    }
  ],
  "overallDifferences": "paragraph summarizing the main differences",
  "recommendation": "paragraph with overall recommendation"
}

Focus on substantive differences. Ignore formatting differences or minor wording changes that don't affect meaning.
Aim for 5-15 comparison items for a typical document pair.`;

function errorResponse(err: ApiError, status: number = 400) {
  return NextResponse.json(err, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateLimitError = await checkRateLimit(req);
  if (rateLimitError) return errorResponse(rateLimitError, 429);

  let body: { text1?: string; text2?: string; name1?: string; name2?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse({ error: "Invalid request body.", errorType: "INVALID_INPUT", retryable: false }, 400);
  }

  const { text1, text2, name1 = "Document 1", name2 = "Document 2" } = body;

  if (!text1 || text1.trim().length < 10) {
    return errorResponse({ error: "First document text is required.", errorType: "INVALID_INPUT", retryable: false }, 400);
  }
  if (!text2 || text2.trim().length < 10) {
    return errorResponse({ error: "Second document text is required.", errorType: "INVALID_INPUT", retryable: false }, 400);
  }

  const sanitized1 = prepareDocumentForPrompt(text1, 40000);
  const sanitized2 = prepareDocumentForPrompt(text2, 40000);

  const prompt = `Compare the following two legal documents:

=== ${name1} (Document 1) ===
${sanitized1}

=== ${name2} (Document 2) ===
${sanitized2}

Identify all meaningful differences and their significance.`;

  try {
    const result = await generateStructuredJSON<{
      items: ComparisonItem[];
      overallDifferences: string;
      recommendation: string;
    }>(prompt, SYSTEM_PROMPT);

    const response: ComparisonResult = {
      items: result.items ?? [],
      overallDifferences: result.overallDifferences ?? "",
      recommendation: result.recommendation ?? "",
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    const apiErr = err as ApiError;
    const status = apiErr.errorType === "RATE_LIMIT" ? 429 : apiErr.errorType === "INVALID_INPUT" ? 400 : 503;
    return errorResponse(
      apiErr.error
        ? apiErr
        : { error: "Couldn't compare these documents right now — please try again.", errorType: "UNKNOWN", retryable: true },
      status
    );
  }
}
