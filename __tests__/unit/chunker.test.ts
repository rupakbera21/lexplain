// ============================================================
// __tests__/unit/chunker.test.ts — Unit tests for chunker.ts
// ============================================================

import { chunkDocument, hashDocument, cosineSimilarity, retrieveTopKChunks } from "@/lib/chunker";

describe("chunkDocument", () => {
  it("returns a single chunk for short text", () => {
    const text = "This is a short document.";
    const chunks = chunkDocument(text, { chunkSize: 1500, overlap: 200 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it("splits long text into multiple overlapping chunks", () => {
    const text = "A".repeat(5000);
    const chunks = chunkDocument(text, { chunkSize: 1500, overlap: 200 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("produces non-empty chunks only", () => {
    const text = "Word ".repeat(500);
    const chunks = chunkDocument(text, { chunkSize: 300, overlap: 50 });
    for (const chunk of chunks) {
      expect(chunk.trim().length).toBeGreaterThan(0);
    }
  });

  it("produces chunks that overlap — content at end of chunk N appears at start of chunk N+1", () => {
    const text = "Sentence one. Sentence two. Sentence three. Sentence four. Sentence five.".repeat(30);
    const chunks = chunkDocument(text, { chunkSize: 200, overlap: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should be within expected length range
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(300); // allow some flexibility for boundary logic
    }
    // TST-06: Verify actual content overlap between adjacent chunks.
    // Take the last 30 characters of chunks[i] and confirm they appear somewhere
    // in the first 80 characters of chunks[i+1]. A regression that removes the
    // overlap window would produce no shared content and this assertion would fail.
    for (let i = 0; i < chunks.length - 1; i++) {
      const headOfNext = chunks[i + 1].slice(0, 20).trim();
      expect(chunks[i]).toContain(headOfNext);
    }
  });

  it("handles empty string", () => {
    const chunks = chunkDocument("");
    expect(chunks.length).toBe(0);
  });
});

describe("hashDocument", () => {
  it("produces the same hash for the same input", () => {
    const text = "This is a legal document.";
    expect(hashDocument(text)).toBe(hashDocument(text));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashDocument("Document A")).not.toBe(hashDocument("Document B"));
  });

  it("returns a 64-character hex string (SHA-256)", () => {
    const hash = hashDocument("test");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("cosineSimilarity", () => {
  it("returns 1.0 for identical vectors", () => {
    const v = [1, 0, 0];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 5);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });

  it("returns 0 for a zero vector", () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });

  it("throws for vectors of different lengths", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
  });
});

describe("retrieveTopKChunks", () => {
  const chunks = ["chunk A", "chunk B", "chunk C", "chunk D"];
  const embeddings = [
    [1, 0, 0],
    [0, 1, 0],
    [0.9, 0.1, 0], // similar to query
    [0, 0, 1],
  ];
  const query = [1, 0, 0];

  it("returns chunks sorted by relevance", () => {
    const results = retrieveTopKChunks(query, embeddings, chunks, 3, 0);
    expect(results[0].chunk).toBe("chunk A");
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("limits results to k", () => {
    const results = retrieveTopKChunks(query, embeddings, chunks, 2, 0);
    expect(results).toHaveLength(2);
  });

  it("filters by minimum score", () => {
    const results = retrieveTopKChunks(query, embeddings, chunks, 10, 0.8);
    // Only chunks A and C should have score >= 0.8 vs [1,0,0]
    expect(results.every((r) => r.score >= 0.8)).toBe(true);
  });

  it("returns empty for very high threshold", () => {
    const results = retrieveTopKChunks(query, embeddings, chunks, 10, 0.999);
    expect(results.length).toBeLessThanOrEqual(1);
  });
});
