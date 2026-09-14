// ============================================================
// lib/sanitize.ts — Prompt injection sanitization
//
// Legal documents uploaded by users could contain adversarial
// content (e.g., text like "Ignore all previous instructions...")
// designed to hijack the AI model. This module strips known
// injection patterns before interpolating document text into prompts.
// ============================================================

/**
 * Patterns commonly used in prompt injection attacks.
 * These are stripped from user-provided content before it's
 * interpolated into any Gemini prompt.
 */
const INJECTION_PATTERNS = [
  // System prompt override attempts
  /\[\s*SYSTEM\s*\]/gi,
  /\[\s*INST\s*\]/gi,
  /\[\s*\/INST\s*\]/gi,
  /<<\s*SYS\s*>>/gi,
  /<\s*\|system\s*\|>/gi,
  /\[\[\s*system\s*\]\]/gi,

  // Common injection phrases
  /ignore\s+(all\s+)?previous\s+instructions?/gi,
  /disregard\s+(all\s+)?previous\s+instructions?/gi,
  /forget\s+(all\s+)?previous\s+instructions?/gi,
  /you\s+are\s+now\s+(?:a\s+)?(?:an?\s+)?(?:different|new|another)\s+(?:ai|assistant|model|bot)/gi,
  /act\s+as\s+(?:if\s+you\s+(?:are|were)\s+)?(?:a\s+)?(?:different|another|unrestricted)/gi,
  /pretend\s+(?:you\s+are|to\s+be)\s+(?:a\s+)?(?:different|another|unrestricted)/gi,
  /your\s+new\s+(?:system\s+)?prompt/gi,
  /override\s+(?:your\s+)?(?:system\s+)?instructions/gi,

  // Template injection markers
  /\{\{.*?\}\}/g, // Handlebars-style
  /\$\{.*?\}/g, // Template literals
  /<\?.*?\?>/g, // PHP-style

  // Role manipulation
  /<role>/gi,
  /<\/role>/gi,
  /<assistant>/gi,
  /<\/assistant>/gi,
  /<human>/gi,
  /<\/human>/gi,
];

/**
 * Sanitizes user-provided document text before inserting into Gemini prompts.
 * Removes known prompt injection patterns while preserving the document's
 * legal meaning as much as possible.
 *
 * @param text - Raw extracted text from a user-uploaded document
 * @returns Sanitized text safe for prompt interpolation
 */
export function sanitizeForPrompt(text: string): string {
  let sanitized = text;

  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }

  // Limit consecutive whitespace (can be used to hide injections)
  sanitized = sanitized.replace(/\n{4,}/g, "\n\n\n");
  sanitized = sanitized.replace(/[ \t]{20,}/g, " ");

  return sanitized;
}

/**
 * Truncates text to a maximum character count to prevent
 * excessively long prompts that could cause issues or costs.
 */
export function truncateToMaxChars(text: string, maxChars: number = 100000): string {
  if (text.length <= maxChars) return text;
  return (
    text.slice(0, maxChars) +
    `\n\n[Document truncated at ${maxChars.toLocaleString()} characters due to length limits]`
  );
}

/**
 * Combined sanitize + truncate for use in API routes.
 */
export function prepareDocumentForPrompt(text: string, maxChars?: number): string {
  return truncateToMaxChars(sanitizeForPrompt(text), maxChars);
}
