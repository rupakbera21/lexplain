"use client";

import { useState, useCallback } from "react";
import FallbackBadge from "./FallbackBadge";
import { NextStepsResult, Clause, ChecklistItem, ApiError } from "@/types";

interface NextStepsPanelProps {
  documentText: string;
  clauses?: Clause[];
  summary?: string;
}

const PRIORITY_CONFIG = {
  high: { label: "High Priority" },
  medium: { label: "Medium Priority" },
  low: { label: "Low Priority" },
};

const CATEGORY_CONFIG = {
  action: { icon: "✅", borderClass: "checklist-action" },
  question: { icon: "🤔", borderClass: "checklist-question" },
  warning: { icon: "⚠️", borderClass: "checklist-warning" },
};

function ChecklistItemCard({ item }: { item: ChecklistItem }) {
  const [checked, setChecked] = useState(false);
  const catConfig = CATEGORY_CONFIG[item.category];
  const priConfig = PRIORITY_CONFIG[item.priority];

  return (
    <label
      className={`checklist-item-card ${catConfig.borderClass} ${checked ? "checked" : ""}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
        className="checklist-checkbox"
        aria-label={`Mark as complete: ${item.item}`}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem", flexWrap: "wrap" }}>
          <span aria-hidden="true" style={{ fontSize: "0.95rem" }}>{catConfig.icon}</span>
          <span className={`priority-tag priority-${item.priority}`}>
            <span className="priority-dot" aria-hidden="true" />
            {priConfig.label}
          </span>
        </div>
        <p className={`checklist-item-text ${checked ? "item-completed" : ""}`}>
          {item.item}
        </p>
      </div>
    </label>
  );
}

export default function NextStepsPanel({ documentText, clauses = [], summary = "" }: NextStepsPanelProps) {
  const [result, setResult] = useState<NextStepsResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [activeTab, setActiveTab] = useState<"checklist" | "lawyer" | "redflags">("checklist");
  const [viaFallback, setViaFallback] = useState(false);

  const handleGenerate = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/next-steps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: documentText, clauses, summary }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data as ApiError); return; }
      const { _via_fallback, ...resultData } = data as NextStepsResult & { _via_fallback?: boolean };
      setViaFallback(Boolean(_via_fallback));
      setResult(resultData as NextStepsResult);
    } catch {
      setError({ error: "Couldn't generate the checklist right now — please try again.", errorType: "UNKNOWN", retryable: true });
    } finally {
      setIsLoading(false);
    }
  }, [documentText, clauses, summary]);

  const highPriorityCount = result?.beforeYouSign.filter((i) => i.priority === "high").length ?? 0;

  return (
    <section aria-labelledby="nextsteps-heading" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <h2 id="nextsteps-heading" className="panel-title">
          Before You Sign
        </h2>
        <p className="panel-desc">
          A personalized checklist, targeted questions for your lawyer, and top red flags — tailored specifically to this document.
        </p>
      </div>

      {!result && (
        <div>
          <button
            id="nextsteps-generate-btn"
            onClick={handleGenerate}
            disabled={isLoading}
            aria-label="Generate before-you-sign checklist"
            aria-busy={isLoading}
            className="btn-primary"
          >
            {isLoading ? (
              <>
                <span className="animate-spin" style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block" }} aria-hidden="true" />
                Generating checklist…
              </>
            ) : (
              "📝 Generate Checklist"
            )}
          </button>
        </div>
      )}

      {isLoading && (
        <div aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: "4.5rem", width: "100%" }} aria-hidden="true" />)}
          <p style={{ textAlign: "center", fontSize: "0.82rem", color: "var(--color-text-muted)" }}>
            Building your personalized checklist…
          </p>
        </div>
      )}

      {error && (
        <div role="alert" className="alert-box animate-fade-up">
          <span className="alert-icon" aria-hidden="true">⚠️</span>
          <div className="alert-content">
            <div className="alert-title">{error.error}</div>
            <div className="alert-text">
              An error occurred while generating the checklist. Please click below to retry.
            </div>
            {error.retryable && (
              <button
                type="button"
                onClick={handleGenerate}
                className="btn-retry"
                aria-label="Try generating checklist again"
              >
                <span>↺</span> Try again
              </button>
            )}
          </div>
        </div>
      )}

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.35rem" }} className="animate-fade-in">
          {/* Provider badge — shown only when Grok answered instead of Gemini */}
          {viaFallback && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <FallbackBadge visible={true} />
            </div>
          )}
          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.85rem" }}>
            <div className="card" style={{ padding: "1rem 1.25rem", textAlign: "center", background: "#fef2f2", borderColor: "#fecaca" }}>
              <div style={{ fontSize: "1.75rem", fontWeight: 800, fontFamily: "var(--font-display)", color: "#b91c1c" }}>{highPriorityCount}</div>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#991b1b", marginTop: "0.2rem" }}>High priority items</div>
            </div>
            <div className="card" style={{ padding: "1rem 1.25rem", textAlign: "center", background: "#eff6ff", borderColor: "#bfdbfe" }}>
              <div style={{ fontSize: "1.75rem", fontWeight: 800, fontFamily: "var(--font-display)", color: "#1d4ed8" }}>{result.questionsForLawyer.length}</div>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#1e40af", marginTop: "0.2rem" }}>Questions for lawyer</div>
            </div>
            <div className="card" style={{ padding: "1rem 1.25rem", textAlign: "center", background: "#fffbeb", borderColor: "#fde68a" }}>
              <div style={{ fontSize: "1.75rem", fontWeight: 800, fontFamily: "var(--font-display)", color: "#b45309" }}>{result.redFlags.length}</div>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#92400e", marginTop: "0.2rem" }}>Red flags</div>
            </div>
          </div>

          {/* Filter tabs */}
          <div role="tablist" aria-label="Next steps sections" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-dim)", marginRight: "0.25rem" }}>View:</span>
            {(["checklist", "lawyer", "redflags"] as const).map((tab) => {
              const count = tab === "checklist" ? result.beforeYouSign.length : tab === "lawyer" ? result.questionsForLawyer.length : result.redFlags.length;
              const label = tab === "checklist" ? "Checklist" : tab === "lawyer" ? "Lawyer Questions" : "Red Flags";
              const icon = tab === "checklist" ? "✅" : tab === "lawyer" ? "⚖️" : "🚨";
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  aria-controls={`${tab}-panel`}
                  id={`${tab}-tab`}
                  onClick={() => setActiveTab(tab)}
                  className={`filter-pill ${activeTab === tab ? "active" : ""}`}
                >
                  <span aria-hidden="true">{icon}</span>
                  <span>{label}</span>
                  <span style={{
                    fontSize: "0.68rem",
                    padding: "0.05rem 0.4rem",
                    borderRadius: "9999px",
                    background: activeTab === tab ? "rgba(255,255,255,0.25)" : "#f1f5f9",
                    color: activeTab === tab ? "#ffffff" : "var(--color-text-dim)",
                  }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Checklist tab */}
          {activeTab === "checklist" && (
            <div
              role="tabpanel"
              id="checklist-panel"
              aria-labelledby="checklist-tab"
              style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
            >
              {/* Sort: high → medium → low */}
              {["high", "medium", "low"].flatMap((priority) =>
                result.beforeYouSign
                  .filter((i) => i.priority === priority)
                  .map((item, idx) => (
                    <ChecklistItemCard key={`${priority}-${idx}`} item={item} />
                  ))
              )}
            </div>
          )}

          {/* Lawyer questions tab */}
          {activeTab === "lawyer" && (
            <div
              role="tabpanel"
              id="lawyer-panel"
              aria-labelledby="lawyer-tab"
              style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
            >
              <div style={{
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                borderRadius: "var(--radius)",
                padding: "1rem 1.25rem",
                marginBottom: "0.25rem",
              }}>
                <p style={{ fontSize: "0.86rem", color: "#1e40af", lineHeight: 1.6, margin: 0, fontWeight: 500, overflowWrap: "break-word", wordBreak: "break-word" }}>
                  💡 Bring these specific questions to your consultation. They are tailored to the unusual or high-risk aspects of this document.
                </p>
              </div>
              {result.questionsForLawyer.map((q, i) => (
                <div key={i} className="lawyer-q-card">
                  <span className="lawyer-q-number">{i + 1}</span>
                  <p className="lawyer-q-text">{q}</p>
                </div>
              ))}
            </div>
          )}

          {/* Red flags tab */}
          {activeTab === "redflags" && (
            <div
              role="tabpanel"
              id="redflags-panel"
              aria-labelledby="redflags-tab"
              style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
            >
              {result.redFlags.map((flag, i) => (
                <div key={i} className="red-flag-card">
                  <span className="red-flag-icon" aria-hidden="true">🚨</span>
                  <p className="red-flag-text">{flag}</p>
                </div>
              ))}
            </div>
          )}

          <div>
            <button onClick={() => { setResult(null); setError(null); }} className="btn-secondary">
              ↺ Regenerate
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
