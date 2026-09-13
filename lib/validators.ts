// ============================================================
// lib/validators.ts — File type and size validation (server-side)
// ============================================================

import { SUPPORTED_MIME_TYPES, MAX_FILE_SIZE, ApiError } from "@/types";

/** Magic byte signatures for supported file types */
const MAGIC_BYTES: Record<string, number[]> = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  docx: [0x50, 0x4b, 0x03, 0x04], // PK (ZIP-based)
};

/**
 * Validates a file's MIME type against its actual magic bytes.
 * Returns a structured ApiError if invalid, null if valid.
 */
export function validateFileType(
  buffer: Buffer,
  mimeType: string
): ApiError | null {
  const normalizedMime = mimeType.toLowerCase().split(";")[0].trim();

  if (!SUPPORTED_MIME_TYPES.includes(normalizedMime as (typeof SUPPORTED_MIME_TYPES)[number])) {
    return {
      error: `Unsupported file type: ${normalizedMime}. Please upload a PDF, DOCX, or plain text file.`,
      errorType: "UNSUPPORTED_FILE",
      retryable: false,
    };
  }

  // Verify magic bytes for binary formats
  if (normalizedMime === "application/pdf") {
    const magic = MAGIC_BYTES.pdf;
    const match = magic.every((byte, i) => buffer[i] === byte);
    if (!match) {
      return {
        error: "The file doesn't appear to be a valid PDF.",
        errorType: "UNSUPPORTED_FILE",
        retryable: false,
      };
    }
  }

  if (normalizedMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const magic = MAGIC_BYTES.docx;
    const match = magic.every((byte, i) => buffer[i] === byte);
    if (!match) {
      return {
        error: "The file doesn't appear to be a valid DOCX file.",
        errorType: "UNSUPPORTED_FILE",
        retryable: false,
      };
    }
  }

  return null; // valid
}

/**
 * Validates file size against the maximum allowed.
 * Returns a structured ApiError if too large, null if valid.
 */
export function validateFileSize(sizeBytes: number): ApiError | null {
  if (sizeBytes > MAX_FILE_SIZE) {
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(1);
    return {
      error: `File too large (${sizeMB}MB). Maximum allowed size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`,
      errorType: "FILE_TOO_LARGE",
      retryable: false,
    };
  }
  return null; // valid
}

/**
 * Validates that extracted document text is not empty.
 */
export function validateDocumentContent(text: string): ApiError | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 10) {
    return {
      error: "The document appears to be empty or contains no readable text.",
      errorType: "INVALID_INPUT",
      retryable: false,
    };
  }
  return null;
}
