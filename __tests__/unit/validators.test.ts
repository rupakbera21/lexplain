// ============================================================
// __tests__/unit/validators.test.ts — Unit tests for validators.ts
// ============================================================

import { validateFileSize, validateFileType, validateDocumentContent } from "@/lib/validators";
import { MAX_FILE_SIZE } from "@/types";

describe("validateFileSize", () => {
  it("returns null for a file within the limit", () => {
    expect(validateFileSize(1024)).toBeNull();
    expect(validateFileSize(MAX_FILE_SIZE)).toBeNull();
  });

  it("returns an error for a file over the limit", () => {
    const err = validateFileSize(MAX_FILE_SIZE + 1);
    expect(err).not.toBeNull();
    expect(err?.errorType).toBe("FILE_TOO_LARGE");
    expect(err?.retryable).toBe(false);
  });

  it("includes the actual file size in the error message", () => {
    const err = validateFileSize(15 * 1024 * 1024);
    expect(err?.error).toContain("15.0MB");
  });
});

describe("validateFileType", () => {
  const pdfMagic = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
  const docxMagic = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14]); // PK zip header
  const garbage = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);

  it("accepts valid PDF files", () => {
    expect(validateFileType(pdfMagic, "application/pdf")).toBeNull();
  });

  it("rejects a file with PDF mime but wrong magic bytes", () => {
    const err = validateFileType(garbage, "application/pdf");
    expect(err).not.toBeNull();
    expect(err?.errorType).toBe("UNSUPPORTED_FILE");
  });

  it("accepts valid DOCX files", () => {
    const mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    expect(validateFileType(docxMagic, mime)).toBeNull();
  });

  it("accepts plain text files", () => {
    const textBuffer = Buffer.from("This is plain text content");
    expect(validateFileType(textBuffer, "text/plain")).toBeNull();
  });

  it("rejects unsupported MIME types", () => {
    const err = validateFileType(Buffer.from("test"), "image/jpeg");
    expect(err).not.toBeNull();
    expect(err?.errorType).toBe("UNSUPPORTED_FILE");
  });

  it("handles MIME type with charset suffix", () => {
    const textBuffer = Buffer.from("Some legal text here");
    expect(validateFileType(textBuffer, "text/plain; charset=utf-8")).toBeNull();
  });
});

describe("validateDocumentContent", () => {
  it("returns null for valid document text", () => {
    expect(validateDocumentContent("This is a valid legal document with sufficient text.")).toBeNull();
  });

  it("returns error for empty string", () => {
    const err = validateDocumentContent("");
    expect(err).not.toBeNull();
    expect(err?.errorType).toBe("INVALID_INPUT");
  });

  it("returns error for whitespace-only string", () => {
    const err = validateDocumentContent("   \n\t  ");
    expect(err).not.toBeNull();
  });

  it("returns error for very short text", () => {
    const err = validateDocumentContent("Hi");
    expect(err).not.toBeNull();
  });

  it("accepts text of exactly 10 characters", () => {
    expect(validateDocumentContent("1234567890")).toBeNull();
  });
});
