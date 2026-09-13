// ============================================================
// lib/chunker.ts — Document chunking and RAG utilities
//
// Implements sliding-window chunking for the Q&A RAG pipeline.
// Uses SHA-256 hashing for session-level memoization of chunks
// and embeddings so repeated questions don't re-embed the document.
// ============================================================

import crypto from "crypto";

/** Configuration for the sliding-window chunker */
export interface ChunkConfig {
  chunkSize: number; // approximate chars per chunk
  overlap: number; // overlap chars between adjacent chunks
}

export const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  chunkSize: 1500, // ~300-400 words, fits well within embedding model limits
  overlap: 200, // ~50 word overlap to preserve context at boundaries
};

/**
 * Splits a document into overlapping chunks using a sliding-window approach.
 * Attempts to split on sentence boundaries to preserve coherence.
 */
export function chunkDocument(
  text: string,
  config: ChunkConfig = DEFAULT_CHUNK_CONFIG
): string[] {
  const { chunkSize, overlap } = config;

  // Return empty for blank documents
  if (!text || !text.trim()) return [];

  if (text.length <= chunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);

    // Try to end at a sentence boundary (period + space)
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf(". ", end);
      const lastNewline = text.lastIndexOf("\n", end);
      const boundary = Math.max(lastPeriod, lastNewline);

      if (boundary > start + chunkSize * 0.5) {
        end = boundary + 1; // include the period
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // Move start forward by (chunkSize - overlap) but at least 1
    start = Math.max(start + 1, end - overlap);
  }

  return chunks;
}

/**
 * Computes SHA-256 hash of document text for memoization.
 * Used as a cache key so the same document isn't re-analyzed.
 */
export function hashDocument(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Computes cosine similarity between two embedding vectors.
 * Returns a value between -1 and 1 (higher = more similar).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Embedding vectors must have the same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Finds the top-k most relevant chunks for a query embedding.
 * Returns chunks sorted by relevance score (descending).
 */
export function retrieveTopKChunks(
  queryEmbedding: number[],
  chunkEmbeddings: number[][],
  chunks: string[],
  k: number = 5,
  minScore: number = 0.5
): Array<{ chunk: string; score: number; index: number }> {
  const scored = chunkEmbeddings.map((embedding, index) => ({
    chunk: chunks[index],
    score: cosineSimilarity(queryEmbedding, embedding),
    index,
  }));

  return scored
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
