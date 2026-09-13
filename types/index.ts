// ============================================================
// types/index.ts — All shared TypeScript interfaces for Lexplain
// ============================================================

/** Reading level for plain-language simplification */
export type ReadingLevel = "simple" | "standard" | "detailed";

/** Classification type for a legal clause */
export type ClauseType = "obligation" | "right" | "risk" | "neutral";

/** Severity level for risk clauses */
export type Severity = "low" | "medium" | "high";

/** A single extracted and classified clause */
export interface Clause {
  id: string;
  text: string;
  type: ClauseType;
  severity?: Severity; // only present when type === 'risk'
  explanation: string; // plain-language explanation of this clause
  section?: string; // e.g. "Section 4.2" if identifiable
}

/** Full clause analysis result for a document */
export interface ClauseAnalysis {
  clauses: Clause[];
  summary: string; // one-paragraph plain-language overview
  riskCount: { low: number; medium: number; high: number };
  documentHash: string; // SHA-256 of raw text, used for memoization
}

/** A single comparison item between two documents */
export interface ComparisonItem {
  aspect: string; // what is being compared, e.g. "Termination clause"
  doc1Summary: string;
  doc2Summary: string;
  difference: string; // plain-language explanation of what differs
  significance: "minor" | "moderate" | "major";
}

/** Full document comparison result */
export interface ComparisonResult {
  items: ComparisonItem[];
  overallDifferences: string; // short paragraph summary
  recommendation: string; // which document favors the user more and why
}

/** A single Q&A citation chunk */
export interface Citation {
  chunkIndex: number;
  text: string; // the relevant chunk text
  relevanceScore: number;
}

/** Q&A response with grounding citations */
export interface QAResponse {
  answer: string;
  citations: Citation[];
  isGrounded: boolean; // false when the model refused due to insufficient context
}

/** A next-steps checklist item */
export interface ChecklistItem {
  item: string;
  category: "action" | "question" | "warning";
  priority: "high" | "medium" | "low";
}

/** Full next-steps / lawyer-prep output */
export interface NextStepsResult {
  beforeYouSign: ChecklistItem[];
  questionsForLawyer: string[];
  redFlags: string[]; // top 3 highest-severity concerns distilled
}

/** Uploaded document state (client-side session) */
export interface DocumentSession {
  id: string; // random UUID per upload
  name: string;
  rawText: string;
  charCount: number;
  uploadedAt: number;
  analysisCache?: ClauseAnalysis; // memoized result
  chunkCache?: string[]; // memoized chunks for RAG
  embeddingCache?: number[][]; // memoized embeddings
}

/** Standardized API error response */
export interface ApiError {
  error: string;
  errorType:
    | "RATE_LIMIT"
    | "INVALID_INPUT"
    | "FILE_TOO_LARGE"
    | "UNSUPPORTED_FILE"
    | "SERVICE_UNAVAILABLE"
    | "UNKNOWN";
  retryable: boolean;
}

/** Supported file MIME types */
export const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

/** Max file size in bytes (10MB) */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
