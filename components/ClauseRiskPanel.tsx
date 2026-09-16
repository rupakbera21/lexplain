"use client";

import { useState, useCallback, useMemo } from "react";
import FallbackBadge from "./FallbackBadge";
import { ClauseAnalysis, Clause, ClauseType, Severity, ApiError } from "@/types";

interface ClauseRiskPanelProps {
  documentText: string;
  documentHash: string;
  cachedAnalysis: ClauseAnalysis | null;
  onAnalysisComplete: (analysis: ClauseAnalysis) => void;
}

const TYPE_CONFIG: Record<ClauseType, { label: string; badgeClass: string; icon: string }> = {
  obligation: { label: "Obligation", badgeClass: "badge-obligation", icon: "📋" },
  right: { label: "Right", badgeClass: "badge-right", icon: "✅" },
  risk: { label: "Risk", badgeClass: "badge-risk-high", icon: "⚠️" },
  neutral: { label: "Neutral", badgeClass: "badge-neutral", icon: "ℹ️" },
};

const SEVERITY_CLASSES: Record<Severity, string> = {
  high: "badge-risk-high",
  medium: "badge-risk-medium",
  low: "badge-risk-low",
};

function ClauseCard({ clause }: { clause: Clause }) {
  const [expanded, setExpanded] = useState(false);
  const config = TYPE_CONFIG[clause.type];
  const badgeClass =
    clause.type === "risk" && clause.severity
      ? SEVERITY_CLASSES[clause.severity]
      : config.badgeClass;

  return (
    <article
      className="card animate-fade-up"
      style={{ overflow: "hidden", transition: "all 0.15s ease", backgroundColor: "#ffffff" }}
      aria-label={`Clause: ${clause.type}${clause.severity ? ` — ${clause.severity} severity` : ""}`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={`clause-${clause.id}-body`}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "1.1rem 1.25rem",
          display: "flex",
          alignItems: "flex-start",
          gap: "0.85rem",
          background: "transparent",
          border: "none",
          cursor: "pointer",
        }}
      >
        <span style={{ fontSize: "1.1rem", marginTop: "2px", flexShrink: 0 }} aria-hidden="true">
          {config.icon}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
            <span className={`badge ${badgeClass}`}>
              {clause.type === "risk" && clause.severity
                ? `${clause.severity.toUpperCase()} RISK`
                : config.label}
            </span>
            {clause.section && (
              <span style={{ fontSize: "0.72rem", color: "var(--color-text-dim)", fontFamily: "monospace", background: "#f1f5f9", padding: "0.15rem 0.4rem", borderRadius: "3px" }}>
                {clause.section}
              </span>
            )}
          </div>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text)", lineHeight: 1.5, margin: 0, overflowWrap: "break-word", wordBreak: "break-word" }}>
            {clause.text}
          </p>
        </div>

        <span
          style={{
            color: "var(--color-text-dim)",
            fontSize: "0.75rem",
            flexShrink: 0,
            marginTop: "4px",
            transition: "transform 0.2s ease",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
          aria-hidden="true"
        >
          ▼
        </span>
      </button>

      {expanded && (
        <div
          id={`clause-${clause.id}-body`}
          style={{
            padding: "1rem 1.25rem 1.25rem",
            borderTop: "1px solid var(--color-border)",
            background: "#f8fafc",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          <div>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-dim)", marginBottom: "0.3rem" }}>
              Original Clause Text
            </div>
            <p style={{ fontSize: "0.82rem", color: "var(--color-text)", background: "#ffffff", padding: "0.75rem 1rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", fontFamily: "monospace", lineHeight: 1.6, overflowWrap: "break-word", wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
              {clause.text}
            </p>
          </div>
          <div>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-dim)", marginBottom: "0.3rem" }}>
              Plain-Language Explanation
            </div>
            <p style={{ fontSize: "0.86rem", color: "var(--color-text)", lineHeight: 1.6, overflowWrap: "break-word", wordBreak: "break-word" }}>
              {clause.explanation}
            </p>
          </div>
        </div>
      )}
    </article>
  );
}

type FilterType = ClauseType | "all";

export default function ClauseRiskPanel({
  documentText,
  documentHash,
  cachedAnalysis,
  onAnalysisComplete,
}: ClauseRiskPanelProps) {
  const [analysis, setAnalysis] = useState<ClauseAnalysis | null>(cachedAnalysis);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [viaFallback, setViaFallback] = useState(false);

  const handleAnalyze = useCallback(async () => {
    if (cachedAnalysis && cachedAnalysis.documentHash === documentHash) {
      setAnalysis(cachedAnalysis);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/analyze-clauses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: documentText }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data as ApiError);
        return;
      }

      // _via_fallback is injected by generateStructuredJSON when Grok answered
      const { _via_fallback, ...resultData } = data as ClauseAnalysis & { _via_fallback?: boolean };
      setViaFallback(Boolean(_via_fallback));
      const result = resultData as ClauseAnalysis;
      setAnalysis(result);
      onAnalysisComplete(result);
    } catch {
      setError({ error: "Couldn't analyze the document right now — please try again.", errorType: "UNKNOWN", retryable: true });
    } finally {
      setIsLoading(false);
    }
  }, [documentText, documentHash, cachedAnalysis, onAnalysisComplete]);

  const filteredClauses = useMemo(
    () =>
      analysis?.clauses.filter(
        (c) => filter === "all" || c.type === filter
      ) ?? [],
    [analysis, filter]
  );

  const filterLabels: Record<FilterType, string> = useMemo(
    () => ({
      all: `All (${analysis?.clauses.length ?? 0})`,
      risk: `Risks (${analysis?.clauses.filter((c) => c.type === "risk").length ?? 0})`,
      obligation: `Obligations (${analysis?.clauses.filter((c) => c.type === "obligation").length ?? 0})`,
      right: `Rights (${analysis?.clauses.filter((c) => c.type === "right").length ?? 0})`,
      neutral: `Neutral (${analysis?.clauses.filter((c) => c.type === "neutral").length ?? 0})`,
    }),
    [analysis]
  );

  return (
    <section aria-labelledby="clause-heading" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <h2 id="clause-heading" className="panel-title">
          Clause-by-Clause Risk Analysis
        </h2>
        <p className="panel-desc">
          Every clause extracted and categorized as Obligation, Right, Risk, or Neutral with severity assessment.
        </p>
      </div>

      {!analysis && (
        <div>
          <button
            id="analyze-clauses-btn"
            onClick={handleAnalyze}
            disabled={isLoading}
            aria-label="Run clause analysis"
            aria-busy={isLoading}
            className="btn-primary"
          >
            {isLoading ? (
              <>
                <span className="animate-spin" style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block" }} aria-hidden="true" />
                Extracting & classifying clauses…
              </>
            ) : (
              "🔍 Analyze Clauses & Risks"
            )}
          </button>
        </div>
      )}

      {isLoading && (
        <div aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: "4.5rem", width: "100%" }} aria-hidden="true" />
          ))}
          <p style={{ textAlign: "center", fontSize: "0.82rem", color: "var(--color-text-muted)" }}>
            Extracting clauses, scoring risk severity, and generating explanations…
          </p>
        </div>
      )}

      {error && (
        <div role="alert" className="alert-box animate-fade-up">
          <span className="alert-icon" aria-hidden="true">⚠️</span>
          <div className="alert-content">
            <div className="alert-title">{error.error}</div>
            <div className="alert-text">
              An error occurred while evaluating clauses. Please click below to try again.
            </div>
            {error.retryable && (
              <button
                type="button"
                onClick={handleAnalyze}
                className="btn-retry"
                aria-label="Try running clause analysis again"
              >
                <span>↺</span> Try again
              </button>
            )}
          </div>
        </div>
      )}

      {analysis && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }} className="animate-fade-up">
          {/* Provider badge — shown only when Grok answered instead of Gemini */}
          {viaFallback && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <FallbackBadge visible={true} />
            </div>
          )}
          {/* Risk summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.85rem" }}>
            {(["high", "medium", "low"] as Severity[]).map((sev) => (
              <div
                key={sev}
                className="card"
                style={{
                  padding: "1rem 1.25rem",
                  textAlign: "center",
                  background: sev === "high" ? "#fef2f2" : sev === "medium" ? "#fffbeb" : "#f0fdf4",
                  borderColor: sev === "high" ? "#fecaca" : sev === "medium" ? "#fde68a" : "#bbf7d0",
                }}
              >
                <div style={{
                  fontSize: "1.75rem",
                  fontWeight: 800,
                  fontFamily: "var(--font-display)",
                  color: sev === "high" ? "#b91c1c" : sev === "medium" ? "#b45309" : "#15803d",
                }}>
                  {analysis.riskCount[sev]}
                </div>
                <div style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: sev === "high" ? "#991b1b" : sev === "medium" ? "#92400e" : "#166534",
                  marginTop: "0.2rem",
                }}>
                  {sev} risk{analysis.riskCount[sev] !== 1 ? "s" : ""}
                </div>
              </div>
            ))}
          </div>

          {/* Document Summary box */}
          <div style={{
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: "var(--radius)",
            padding: "1.1rem 1.35rem",
          }}>
            <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--brand-700)", fontFamily: "var(--font-display)", marginBottom: "0.35rem" }}>
              Document Summary
            </p>
            <p style={{ fontSize: "0.88rem", color: "#1e293b", lineHeight: 1.6, overflowWrap: "break-word", wordBreak: "break-word", margin: 0 }}>
              {analysis.summary}
            </p>
          </div>

          {/* Filter tabs */}
          <div
            role="tablist"
            aria-label="Filter clauses by type"
            style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}
          >
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-dim)", marginRight: "0.25rem" }}>Filter:</span>
            {(Object.keys(filterLabels) as FilterType[]).map((f) => {
              const count = f === "all" ? analysis.clauses.length : analysis.clauses.filter((c) => c.type === f).length;
              const label = f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1);
              return (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={filter === f}
                  onClick={() => setFilter(f)}
                  className={`filter-pill ${filter === f ? "active" : ""}`}
                >
                  <span>{label}</span>
                  <span style={{
                    fontSize: "0.68rem",
                    padding: "0.05rem 0.4rem",
                    borderRadius: "9999px",
                    background: filter === f ? "rgba(255,255,255,0.25)" : "#f1f5f9",
                    color: filter === f ? "#ffffff" : "var(--color-text-dim)",
                  }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Clause list */}
          <div
            role="list"
            aria-label={`${filter === "all" ? "All clauses" : `${filter} clauses`}`}
            style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
          >
            {filteredClauses.length === 0 ? (
              <div className="card" style={{ padding: "2.5rem", textAlign: "center", color: "var(--color-text-muted)", fontSize: "0.88rem" }}>
                No clauses of this category found in the document.
              </div>
            ) : (
              filteredClauses.map((clause) => (
                <div role="listitem" key={clause.id}>
                  <ClauseCard clause={clause} />
                </div>
              ))
            )}
          </div>

          <div>
            <button
              onClick={() => { setAnalysis(null); setError(null); }}
              className="btn-secondary"
              aria-label="Re-run clause analysis"
            >
              ↺ Re-analyze
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
