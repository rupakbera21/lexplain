"use client";

import { useState, useCallback } from "react";
import DocumentUploader from "./DocumentUploader";
import { ComparisonResult, ComparisonItem, ApiError } from "@/types";

interface ComparePanelProps {
  primaryText: string;
  primaryName: string;
}

const SIG_CONFIG = {
  major: { label: "Major", className: "sig-major" },
  moderate: { label: "Moderate", className: "sig-moderate" },
  minor: { label: "Minor", className: "sig-minor" },
};

function ComparisonCard({ item }: { item: ComparisonItem }) {
  return (
    <article
      className="aspect-card animate-fade-in"
      aria-label={`Comparison: ${item.aspect} — ${item.significance} difference`}
    >
      <div className="aspect-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span style={{ fontSize: "1rem" }} aria-hidden="true">⚖️</span>
          <h3 style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--color-text)", margin: 0, fontFamily: "var(--font-display)" }}>
            {item.aspect}
          </h3>
        </div>
        <span className={`badge ${SIG_CONFIG[item.significance].className}`}>
          {SIG_CONFIG[item.significance].label} Difference
        </span>
      </div>

      <div className="aspect-split">
        <div className="aspect-col">
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.2rem 0.55rem", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "4px", fontSize: "0.7rem", fontWeight: 700, color: "#1d4ed8", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: "0.65rem", fontFamily: "var(--font-display)" }}>
            📄 Document 1 (Original)
          </div>
          <p style={{ fontSize: "0.85rem", color: "var(--color-text)", lineHeight: 1.6, margin: 0 }}>
            {item.doc1Summary}
          </p>
        </div>
        <div className="aspect-col">
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.2rem 0.55rem", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: "4px", fontSize: "0.7rem", fontWeight: 700, color: "#6d28d9", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: "0.65rem", fontFamily: "var(--font-display)" }}>
            📄 Document 2 (Comparison)
          </div>
          <p style={{ fontSize: "0.85rem", color: "var(--color-text)", lineHeight: 1.6, margin: 0 }}>
            {item.doc2Summary}
          </p>
        </div>
      </div>

      <div className="aspect-matters">
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.3rem" }}>
          <span style={{ fontSize: "0.9rem" }} aria-hidden="true">💡</span>
          <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#92400e", fontFamily: "var(--font-display)" }}>
            Why this difference matters
          </span>
        </div>
        <p style={{ fontSize: "0.85rem", color: "#78350f", lineHeight: 1.55, margin: 0, fontWeight: 500 }}>
          {item.difference}
        </p>
      </div>
    </article>
  );
}

export default function ComparePanel({ primaryText, primaryName }: ComparePanelProps) {
  const [secondaryText, setSecondaryText] = useState<string | null>(null);
  const [secondaryName, setSecondaryName] = useState("Document 2");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [filterSig, setFilterSig] = useState<"all" | "major" | "moderate" | "minor">("all");

  const handleCompare = useCallback(async () => {
    if (!secondaryText) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text1: primaryText,
          text2: secondaryText,
          name1: primaryName,
          name2: secondaryName,
        }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data as ApiError); return; }
      setResult(data as ComparisonResult);
    } catch {
      setError({ error: "Couldn't compare the documents right now — please try again.", errorType: "UNKNOWN", retryable: true });
    } finally {
      setIsLoading(false);
    }
  }, [primaryText, primaryName, secondaryText, secondaryName]);

  const filteredItems = result?.items.filter(
    (i) => filterSig === "all" || i.significance === filterSig
  ) ?? [];

  return (
    <section aria-labelledby="compare-heading" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <h2 id="compare-heading" className="panel-title">
          Document Comparison
        </h2>
        <p className="panel-desc">
          Upload a second document to compare side-by-side. Highlights deviations in terms, risk allocations, and key clauses.
        </p>
      </div>

      {/* Documents side-by-side indicator */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
        <div className="compare-doc-card primary">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.7rem", fontWeight: 700, color: "#1d4ed8", letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: "var(--font-display)" }}>
              📄 DOCUMENT 1 (PRIMARY)
            </span>
            <span style={{ fontSize: "0.72rem", color: "var(--color-text-dim)", background: "#ffffff", padding: "0.15rem 0.5rem", borderRadius: "9999px", border: "1px solid #e2e8f0" }}>
              {primaryText.length.toLocaleString()} chars
            </span>
          </div>
          <p style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--color-text)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--font-display)" }}>
            {primaryName}
          </p>
        </div>

        {secondaryText ? (
          <div className="compare-doc-card secondary">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.7rem", fontWeight: 700, color: "#4f46e5", letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: "var(--font-display)" }}>
                📄 DOCUMENT 2 (COMPARISON)
              </span>
              <span style={{ fontSize: "0.72rem", color: "var(--color-text-dim)", background: "#ffffff", padding: "0.15rem 0.5rem", borderRadius: "9999px", border: "1px solid #e2e8f0" }}>
                {secondaryText.length.toLocaleString()} chars
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
              <p style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--color-text)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--font-display)", flex: 1 }}>
                {secondaryName}
              </p>
              <button
                type="button"
                onClick={() => { setSecondaryText(null); setResult(null); }}
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  color: "#dc2626",
                  background: "#fee2e2",
                  border: "1px solid #fca5a5",
                  borderRadius: "var(--radius-sm)",
                  padding: "0.2rem 0.6rem",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  transition: "all 0.15s ease",
                }}
                aria-label="Remove second document"
              >
                ✕ Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="compare-doc-card empty">
            <p style={{ fontSize: "0.82rem", color: "var(--color-text-dim)", margin: 0 }}>
              Document 2 not yet loaded — upload below to begin
            </p>
          </div>
        )}
      </div>

      {/* Upload second document */}
      {!secondaryText && (
        <div className="card" style={{ padding: "1.5rem", backgroundColor: "#ffffff" }}>
          <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text)", marginBottom: "1rem" }}>
            Upload or paste the second document to compare:
          </p>
          <DocumentUploader
            id="compare-upload"
            label="Upload second document"
            onDocumentLoaded={(text, name) => {
              setSecondaryText(text);
              setSecondaryName(name);
            }}
            onError={setError}
          />
        </div>
      )}

      {secondaryText && !result && (
        <div>
          <button
            id="compare-btn"
            onClick={handleCompare}
            disabled={isLoading}
            aria-label="Compare documents"
            aria-busy={isLoading}
            className="btn-primary"
          >
            {isLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                Comparing documents…
              </>
            ) : (
              "⚖️ Compare Documents"
            )}
          </button>
        </div>
      )}

      {isLoading && (
        <div aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: "6rem", width: "100%" }} aria-hidden="true" />)}
          <p style={{ textAlign: "center", fontSize: "0.82rem", color: "var(--color-text-muted)" }}>
            Analyzing semantic differences and clause variations between documents…
          </p>
        </div>
      )}

      {error && (
        <div role="alert" className="alert-box animate-fade-up">
          <span className="alert-icon" aria-hidden="true">⚠️</span>
          <div className="alert-content">
            <div className="alert-title">{error.error}</div>
            <div className="alert-text">
              An error occurred during comparison. Please click below to try again.
            </div>
            {error.retryable && (
              <button
                type="button"
                onClick={handleCompare}
                className="btn-retry"
                aria-label="Try running comparison again"
              >
                <span>↺</span> Try again
              </button>
            )}
          </div>
        </div>
      )}

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }} className="animate-fade-up">
          {/* Executive Summary Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem" }}>
            <div className="summary-card-diff">
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.65rem" }}>
                <span style={{ fontSize: "1.1rem" }} aria-hidden="true">📊</span>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#1d4ed8", fontFamily: "var(--font-display)" }}>
                  Overall Differences Summary
                </span>
              </div>
              <p style={{ fontSize: "0.88rem", color: "var(--color-text)", lineHeight: 1.65, margin: 0 }}>
                {result.overallDifferences}
              </p>
            </div>

            <div className="summary-card-rec">
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.65rem" }}>
                <span style={{ fontSize: "1.1rem" }} aria-hidden="true">⚖️</span>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#15803d", fontFamily: "var(--font-display)" }}>
                  Strategic Recommendation
                </span>
              </div>
              <p style={{ fontSize: "0.88rem", color: "#14532d", lineHeight: 1.65, margin: 0, fontWeight: 500 }}>
                {result.recommendation}
              </p>
            </div>
          </div>

          {/* Significance filter */}
          <div role="group" aria-label="Filter by significance" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-dim)", marginRight: "0.25rem" }}>Filter:</span>
            {(["all", "major", "moderate", "minor"] as const).map((sig) => {
              const count = sig === "all" ? result.items.length : result.items.filter((i) => i.significance === sig).length;
              return (
                <button
                  key={sig}
                  type="button"
                  onClick={() => setFilterSig(sig)}
                  aria-pressed={filterSig === sig}
                  className={`filter-pill ${filterSig === sig ? "active" : ""}`}
                >
                  <span>{sig.charAt(0).toUpperCase() + sig.slice(1)}</span>
                  <span style={{
                    fontSize: "0.68rem",
                    padding: "0.05rem 0.4rem",
                    borderRadius: "9999px",
                    background: filterSig === sig ? "rgba(255,255,255,0.25)" : "#f1f5f9",
                    color: filterSig === sig ? "#ffffff" : "var(--color-text-dim)",
                  }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Comparison cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }} role="list" aria-label="Comparison items">
            {filteredItems.map((item, i) => (
              <div key={i} role="listitem">
                <ComparisonCard item={item} />
              </div>
            ))}
          </div>

          <div>
            <button onClick={() => { setResult(null); }} className="btn-secondary text-sm">↺ Re-compare</button>
          </div>
        </div>
      )}
    </section>
  );
}
