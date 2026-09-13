// ============================================================
// app/api/parse/route.ts — Document upload and parsing endpoint
// Accepts multipart form data with a file or pasted text.
// Returns: { text, wordCount, pageCount?, documentHash, name }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { parseDocument } from "@/lib/parsers";
import { validateFileType, validateFileSize, validateDocumentContent } from "@/lib/validators";
import { sanitizeForPrompt } from "@/lib/sanitize";
import { hashDocument } from "@/lib/chunker";
import { checkRateLimit } from "@/lib/ratelimit";
import { ApiError } from "@/types";

function errorResponse(err: ApiError, status: number = 400) {
  return NextResponse.json(err, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Rate limiting
  const rateLimitError = checkRateLimit(req);
  if (rateLimitError) {
    return errorResponse(rateLimitError, 429);
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const pastedText = formData.get("text") as string | null;

    // ── Pasted text path ──────────────────────────────────────
    if (pastedText && !file) {
      const contentError = validateDocumentContent(pastedText);
      if (contentError) return errorResponse(contentError, 400);

      const parsed = { text: pastedText.trim(), wordCount: pastedText.trim().split(/\s+/).filter(Boolean).length };
      const hash = hashDocument(parsed.text);

      return NextResponse.json({
        text: parsed.text,
        wordCount: parsed.wordCount,
        documentHash: hash,
        name: "Pasted Document",
      });
    }

    // ── File upload path ──────────────────────────────────────
    if (!file) {
      return errorResponse(
        { error: "No file or text provided.", errorType: "INVALID_INPUT", retryable: false },
        400
      );
    }

    // Validate size
    const sizeError = validateFileSize(file.size);
    if (sizeError) return errorResponse(sizeError, 413);

    // Read into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate type (magic bytes)
    const mimeType = file.type || "application/octet-stream";
    const typeError = validateFileType(buffer, mimeType);
    if (typeError) return errorResponse(typeError, 415);

    // Parse document
    const parsed = await parseDocument(buffer, mimeType);

    // Validate content
    const contentError = validateDocumentContent(parsed.text);
    if (contentError) return errorResponse(contentError, 422);

    const hash = hashDocument(parsed.text);

    // Note: we do NOT log document content (security requirement)
    console.log(`[Lexplain] Document parsed: ${hash.slice(0, 8)}... words=${parsed.wordCount} type=${mimeType}`);

    return NextResponse.json({
      text: parsed.text,
      wordCount: parsed.wordCount,
      pageCount: parsed.pageCount,
      documentHash: hash,
      name: file.name,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown parse error";
    console.error("[Lexplain] Parse error:", { type: message, timestamp: new Date().toISOString() });

    return errorResponse(
      { error: "Failed to process the document. Please try a different file.", errorType: "UNKNOWN", retryable: false },
      500
    );
  }
}
