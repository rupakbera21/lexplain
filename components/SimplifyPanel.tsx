"use client";

import { useState, useCallback } from "react";
import StreamingText from "./StreamingText";
import { useStreamingResponse } from "@/hooks/useStreamingResponse";
import { ReadingLevel } from "@/types";

interface SimplifyPanelProps {
  documentText: string;
}

const LEVEL_LABELS: Record<ReadingLevel, { label: string; desc: string; icon: string }> = {
  simple: { label: "Simple", desc: "Everyday language for non-lawyers", icon: "🌱" },
  standard: { label: "Standard", desc: "Clear, balanced, and complete breakdown", icon: "📖" },
  detailed: { label: "Detailed", desc: "Deep analytical view with nuance preserved", icon: "🔍" },
};

export default function SimplifyPanel({ documentText }: SimplifyPanelProps) {
  const [level, setLevel] = useState<ReadingLevel>("standard");
  const { text, isStreaming, isDone, error, startStream, reset } = useStreamingResponse();

  const handleAnalyze = useCallback(async () => {
    await startStream("/api/simplify", { text: documentText, level });
  }, [documentText, level, startStream]);

  return (
    <section aria-labelledby="simplify-heading" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <h2 id="simplify-heading" className="panel-title">
          Plain-Language Explanation
        </h2>
        <p className="panel-desc">
          Get a clear, jargon-free explanation of your document. Choose the desired reading level below.
        </p>
      </div>

      {/* Reading level selector */}
      <div>
        <label
          id="reading-level-label"
          style={{
            display: "block",
            fontSize: "0.8rem",
            fontWeight: 600,
            color: "var(--color-text)",
            marginBottom: "0.6rem",
            fontFamily: "var(--font-display)",
          }}
        >
          Reading Level
        </label>
        <div
          role="radiogroup"
          aria-labelledby="reading-level-label"
          className="level-grid"
        >
          {(Object.keys(LEVEL_LABELS) as ReadingLevel[]).map((lvl) => {
            const isSelected = level === lvl;
            return (
              <button
                key={lvl}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => { setLevel(lvl); reset(); }}
                className={`level-card ${isSelected ? "active" : ""}`}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                  <span className="card-icon" aria-hidden="true">{LEVEL_LABELS[lvl].icon}</span>
                  <div style={{
                    width: 16, height: 16, borderRadius: "50%",
                    border: isSelected ? "5px solid var(--brand-600)" : "1.5px solid #cbd5e1",
                    background: "#ffffff",
                    transition: "all 0.15s ease",
                  }} />
                </div>
                <div className="card-label">{LEVEL_LABELS[lvl].label}</div>
                <div className="card-desc">{LEVEL_LABELS[lvl].desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <button
          id="simplify-analyze-btn"
          onClick={handleAnalyze}
          disabled={isStreaming}
          aria-label="Generate plain-language explanation"
          aria-busy={isStreaming}
          className="btn-primary"
        >
          {isStreaming ? (
            <>
              <span className="animate-spin" style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block" }} aria-hidden="true" />
              Explaining document…
            </>
          ) : (
            "✨ Explain in Plain Language"
          )}
        </button>
      </div>

      {/* Error state */}
      {error && !isStreaming && (
        <div role="alert" className="alert-box animate-fade-up">
          <span className="alert-icon" aria-hidden="true">⚠️</span>
          <div className="alert-content">
            <div className="alert-title">{error.error}</div>
            <div className="alert-text">
              {error.errorType === "UNKNOWN"
                ? "The AI request could not be completed. Please verify your connection or click below to retry."
                : "A temporary service issue occurred."}
            </div>
            {error.retryable && (
              <button
                type="button"
                onClick={handleAnalyze}
                className="btn-retry"
                aria-label="Try running the analysis again"
              >
                <span>↺</span> Try again
              </button>
            )}
          </div>
        </div>
      )}

      {/* Streaming analysis indicator */}
      {isStreaming && !text && (
        <div aria-live="polite" style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "1.25rem 0", color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
          <div className="animate-spin" style={{ width: 18, height: 18, border: "2px solid #cbd5e1", borderTopColor: "var(--brand-600)", borderRadius: "50%" }} aria-hidden="true" />
          Analyzing your document with Google Gemini… text will begin streaming shortly.
        </div>
      )}

      {/* Output */}
      {(text || isStreaming) && (
        <div className="card animate-fade-up" style={{ padding: "1.75rem", backgroundColor: "#ffffff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.25rem", paddingBottom: "1rem", borderBottom: "1px solid var(--color-border)" }}>
            <span style={{ fontSize: "1.2rem" }} aria-hidden="true">{LEVEL_LABELS[level].icon}</span>
            <span style={{ fontSize: "0.92rem", fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--color-text)" }}>
              {LEVEL_LABELS[level].label} Explanation
            </span>
            {isStreaming && (
              <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "var(--brand-600)", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", animation: "pulseCyan 1s infinite" }} />
                Streaming…
              </span>
            )}
            {isDone && (
              <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "var(--color-right)", fontWeight: 600 }}>
                ✓ Complete
              </span>
            )}
          </div>
          <StreamingText text={text} isStreaming={isStreaming} />
        </div>
      )}
    </section>
  );
}
