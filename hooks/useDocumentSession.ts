// ============================================================
// hooks/useDocumentSession.ts — Client-side session state + memoization
//
// Stores uploaded document text and memoizes expensive results
// (clause analysis, chunks, embeddings) by documentHash so switching
// between tabs doesn't re-run the same AI call.
// ============================================================

"use client";

import { useState, useCallback } from "react";
import { DocumentSession, ClauseAnalysis } from "@/types";
import { v4 as uuidv4 } from "uuid";

interface SessionState {
  primary: DocumentSession | null;
  secondary: DocumentSession | null; // for comparison mode
}

export function useDocumentSession() {
  const [sessions, setSessions] = useState<SessionState>({
    primary: null,
    secondary: null,
  });

  const loadDocument = useCallback(
    async (
      file: File | null,
      pastedText: string | null,
      slot: "primary" | "secondary" = "primary"
    ): Promise<DocumentSession | null> => {
      const formData = new FormData();

      if (file) {
        formData.append("file", file);
      } else if (pastedText) {
        formData.append("text", pastedText);
      } else {
        return null;
      }

      const res = await fetch("/api/parse", { method: "POST", body: formData });

      if (!res.ok) {
        const err = await res.json();
        throw err;
      }

      const data = await res.json();

      const session: DocumentSession = {
        id: uuidv4(),
        name: data.name ?? (file?.name ?? "Pasted Document"),
        rawText: data.text,
        charCount: data.text.length,
        uploadedAt: Date.now(),
      };

      setSessions((prev) => ({ ...prev, [slot]: session }));
      return session;
    },
    []
  );

  const cacheAnalysis = useCallback(
    (documentHash: string, analysis: ClauseAnalysis, slot: "primary" | "secondary" = "primary") => {
      setSessions((prev) => {
        const session = prev[slot];
        if (!session || session.rawText === undefined) return prev;
        return {
          ...prev,
          [slot]: { ...session, analysisCache: analysis },
        };
      });
    },
    []
  );

  const getCachedAnalysis = useCallback(
    (documentHash: string, slot: "primary" | "secondary" = "primary"): ClauseAnalysis | null => {
      const session = sessions[slot];
      if (!session?.analysisCache) return null;
      if (session.analysisCache.documentHash !== documentHash) return null;
      return session.analysisCache;
    },
    [sessions]
  );

  const cacheChunks = useCallback(
    (chunks: string[], embeddings: number[][], slot: "primary" | "secondary" = "primary") => {
      setSessions((prev) => {
        const session = prev[slot];
        if (!session) return prev;
        return {
          ...prev,
          [slot]: { ...session, chunkCache: chunks, embeddingCache: embeddings },
        };
      });
    },
    []
  );

  const clearSession = useCallback((slot: "primary" | "secondary" = "primary") => {
    setSessions((prev) => ({ ...prev, [slot]: null }));
  }, []);

  return {
    primary: sessions.primary,
    secondary: sessions.secondary,
    loadDocument,
    cacheAnalysis,
    getCachedAnalysis,
    cacheChunks,
    clearSession,
  };
}
