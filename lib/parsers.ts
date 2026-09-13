// ============================================================
// lib/parsers.ts — Document text extraction (PDF / DOCX / plain text)
//
// All parsing is in-memory: Buffer in → string out.
// No files are written to disk at any point (security requirement).
// ============================================================

import mammoth from "mammoth";

export type ParsedDocument = {
  text: string;
  pageCount?: number;
  wordCount: number;
};

/**
 * Parses a PDF buffer and extracts plain text.
 * Uses a dynamic import so pdf-parse doesn't run at module evaluation time
 * (avoids DOMMatrix error in newer versions).
 */
export async function parsePDF(buffer: Buffer): Promise<ParsedDocument> {
  // Dynamic import defers pdf-parse evaluation to call time, not module load
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfParseModule = await import("pdf-parse" as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfParse = (pdfParseModule as any).default ?? pdfParseModule;

  const data = await pdfParse(buffer, {
    // Limit pages to prevent runaway memory use
    max: 200,
  });

  const text = (data.text as string)
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    text,
    pageCount: data.numpages as number,
    wordCount: text.split(/\s+/).filter(Boolean).length,
  };
}

/**
 * Parses a DOCX buffer and extracts plain text.
 */
export async function parseDOCX(buffer: Buffer): Promise<ParsedDocument> {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
  };
}

/**
 * Processes plain text (just normalizes whitespace).
 */
export function parsePlainText(raw: string): ParsedDocument {
  const text = raw
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
  };
}

/**
 * Unified parser — dispatches based on MIME type.
 * Returns structured ParsedDocument or throws with a user-friendly message.
 */
export async function parseDocument(
  buffer: Buffer,
  mimeType: string,
  rawText?: string
): Promise<ParsedDocument> {
  const normalized = mimeType.toLowerCase().split(";")[0].trim();

  switch (normalized) {
    case "application/pdf":
      return parsePDF(buffer);

    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return parseDOCX(buffer);

    case "text/plain":
    case "text/markdown":
      return parsePlainText(rawText ?? buffer.toString("utf-8"));

    default:
      throw new Error(`Unsupported MIME type for parsing: ${normalized}`);
  }
}
