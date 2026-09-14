"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import DisclaimerBanner from "@/components/DisclaimerBanner";
import AccessibilityToolbar from "@/components/AccessibilityToolbar";
import DocumentUploader from "@/components/DocumentUploader";
import SimplifyPanel from "@/components/SimplifyPanel";
import ClauseRiskPanel from "@/components/ClauseRiskPanel";
import ComparePanel from "@/components/ComparePanel";
import QAPanel from "@/components/QAPanel";
import NextStepsPanel from "@/components/NextStepsPanel";
import { ClauseAnalysis, ApiError } from "@/types";

type TabId = "simplify" | "clauses" | "compare" | "ask" | "nextsteps";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "simplify",  label: "Plain Explanation", icon: "✨" },
  { id: "clauses",   label: "Clause Risks",       icon: "🔍" },
  { id: "compare",   label: "Compare Docs",       icon: "⚖️" },
  { id: "ask",       label: "Ask Document",       icon: "💬" },
  { id: "nextsteps", label: "Before You Sign",    icon: "📋" },
];

const FEATURES = [
  { label: "Plain-Language Explanation", desc: "Three reading levels — simple to detailed." },
  { label: "Clause Risk Analysis",       desc: "Every clause flagged by type and severity." },
  { label: "Document Comparison",        desc: "Side-by-side diff of any two versions." },
  { label: "Grounded Q&A",               desc: "Answers citing the exact clause source." },
  { label: "Before You Sign",            desc: "Checklist, red flags, lawyer questions." },
];

export default function Home() {
  const [documentText, setDocumentText]   = useState<string | null>(null);
  const [documentName, setDocumentName]   = useState<string>("Document");
  const [documentHash, setDocumentHash]   = useState<string | null>(null);
  const [uploadError, setUploadError]     = useState<ApiError | null>(null);
  const [activeTab, setActiveTab]         = useState<TabId>("simplify");
  const [analysisCache, setAnalysisCache] = useState<ClauseAnalysis | null>(null);
  const [logoError, setLogoError]         = useState(false);

  const handleDocumentLoaded = useCallback((text: string, name: string, hash: string) => {
    setDocumentText(text);
    setDocumentName(name);
    // Use hash returned by /api/parse — avoids redundant SHA-256 on main thread (EFF-08)
    setDocumentHash(hash);
    setUploadError(null);
    setAnalysisCache(null);
    setActiveTab("simplify");
  }, []);

  const handleReset = useCallback(() => {
    setDocumentText(null);
    setDocumentName("Document");
    setDocumentHash(null);
    setUploadError(null);
    setAnalysisCache(null);
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* ── Disclaimer ────────────────────────────────────────── */}
      <DisclaimerBanner />

      {/* ── Header ───────────────────────────────────────────── */}
      <header className="nav-header" style={{
        position: "sticky",
        top: "38px",
        zIndex: 40,
        backgroundColor: "#ffffff",
        borderBottom: "1px solid var(--color-border)",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
      }}>
        <div style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "0.8rem 2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1.5rem",
          flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {!logoError ? (
              <Image
                src="/brand/LexplainLogo_trimmed.png"
                alt="Lexplain"
                width={145}
                height={39}
                style={{ objectFit: "contain", objectPosition: "left", height: "38px", width: "auto" }}
                onError={() => setLogoError(true)}
                priority
              />
            ) : (
              <span className="heading-display" style={{ fontSize: "1.3rem", color: "var(--color-text)", fontWeight: 700 }}>
                Lexplain
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
            <AccessibilityToolbar />
            {documentText && (
              <button onClick={handleReset} className="btn-ghost" aria-label="Load a new document">
                ← New document
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Main ─────────────────────────────────────────────── */}
      <main id="main-content" style={{
        flex: 1,
        maxWidth: "1200px",
        margin: "0 auto",
        width: "100%",
        padding: "clamp(2rem, 4vw, 3.5rem) clamp(1rem, 3vw, 2rem)",
      }}>

        {/* ════ UPLOAD STATE ══════════════════════════════════ */}
        {!documentText && (
          <div className="animate-fade-up">

            {/* Hero */}
            <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.4rem 1rem",
                borderRadius: "2rem",
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                marginBottom: "1.5rem",
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "#0284c7",
                  display: "inline-block",
                  animation: "pulseCyan 1.5s ease-in-out infinite",
                }} />
                <span style={{ fontSize: "0.72rem", color: "#1d4ed8", fontFamily: "var(--font-display)", fontWeight: 600, letterSpacing: "0.04em" }}>
                  Powered by Google Gemini AI
                </span>
              </div>

              <h2 className="heading-display" style={{
                fontSize: "clamp(2rem, 5vw, 3.5rem)",
                maxWidth: "780px",
                margin: "0 auto 1.25rem",
                color: "var(--color-text)",
              }}>
                Understand any legal document{" "}
                <span className="text-brand-gradient">in plain language</span>
              </h2>

              <p style={{
                fontSize: "1.05rem",
                color: "var(--color-text-muted)",
                maxWidth: "560px",
                margin: "0 auto",
                lineHeight: 1.7,
              }}>
                Upload a lease, NDA, employment offer, or Terms of Service —
                get a plain-language breakdown, risk analysis, and a before-you-sign checklist.
              </p>
            </div>

            {/* Feature grid */}
            <div className="feature-grid">
              {FEATURES.map((f, i) => (
                <div key={f.label} style={{
                  background: "var(--color-surface)",
                  padding: "1.25rem 1.1rem",
                  transition: "background 0.2s",
                  cursor: "default",
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--color-surface-2)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "var(--color-surface)")}
                >
                  <div style={{
                    fontSize: "0.65rem",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    color: "var(--cyan-500)",
                    fontFamily: "var(--font-display)",
                    marginBottom: "0.5rem",
                    textTransform: "uppercase",
                  }}>
                    0{i + 1}
                  </div>
                  <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--color-text)", marginBottom: "0.3rem", fontFamily: "var(--font-display)", letterSpacing: "-0.01em" }}>
                    {f.label}
                  </p>
                  <p style={{ fontSize: "0.72rem", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>

            {/* Upload card */}
            <div className="card" style={{ maxWidth: "640px", margin: "0 auto", padding: "2.25rem" }}>
              <h3 className="heading-sub" style={{ fontSize: "1.1rem", marginBottom: "0.35rem", color: "var(--color-text)" }}>
                Upload your document
              </h3>
              <p style={{ fontSize: "0.78rem", color: "var(--color-text-dim)", marginBottom: "1.5rem" }}>
                PDF, DOCX, or plain text · Max 10 MB · Processed in-session, never stored
              </p>

              {uploadError && (
                <div className="alert-error" style={{ marginBottom: "1.5rem", display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                  <span style={{ color: "var(--color-risk-high)", flexShrink: 0 }}>⚠</span>
                  <div>
                    <p style={{ fontSize: "0.85rem", color: "#e88a8a", fontWeight: 500 }}>{uploadError.error}</p>
                    <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.2rem" }}>
                      {uploadError.errorType === "FILE_TOO_LARGE"   && "Try a smaller file or paste text directly."}
                      {uploadError.errorType === "UNSUPPORTED_FILE" && "Supported: PDF, DOCX, TXT."}
                    </p>
                  </div>
                </div>
              )}

              <DocumentUploader
                id="primary-upload"
                label="Upload your legal document"
                onDocumentLoaded={handleDocumentLoaded}
                onError={setUploadError}
              />
            </div>

            {/* Trust row */}
            <div style={{
              display: "flex",
              justifyContent: "center",
              gap: "2.5rem",
              marginTop: "1.75rem",
              flexWrap: "wrap",
            }}>
              {["🔒 No document storage", "⚡ Results in seconds", "⚖️ Not legal advice"].map(label => (
                <span key={label} style={{ fontSize: "0.72rem", color: "var(--color-text-dim)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ════ ANALYSIS STATE ════════════════════════════════ */}
        {documentText && documentHash && (
          <div className="animate-fade-up" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

            {/* Document bar */}
            <div className="card-inner" style={{
              padding: "0.85rem 1.25rem",
              display: "flex",
              alignItems: "center",
              gap: "0.9rem",
              flexWrap: "wrap",
            }}>
              <div style={{
                width: 34, height: 34,
                background: "#eff6ff",
                borderRadius: "var(--radius-sm)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#1d4ed8",
                flexShrink: 0,
                border: "1px solid #bfdbfe",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--font-display)", letterSpacing: "-0.01em" }}>
                  {documentName}
                </p>
                <p style={{ fontSize: "0.7rem", color: "var(--color-text-dim)", marginTop: "1px" }}>
                  {documentText.length.toLocaleString()} characters · ~{Math.ceil(documentText.split(/\s+/).length / 200)} min read
                </p>
              </div>
              <span style={{ fontSize: "0.7rem", color: "var(--color-right)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
                Ready
              </span>
            </div>

            {/* Tabs */}
            <nav aria-label="Analysis features" style={{ display: "flex" }}>
              <div className="tab-nav" role="tablist" aria-label="Analysis tabs" style={{ overflowX: "auto" }}>
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    role="tab"
                    id={`tab-${tab.id}`}
                    aria-selected={activeTab === tab.id}
                    aria-controls={`panel-${tab.id}`}
                    onClick={() => setActiveTab(tab.id)}
                    className={`tab-btn${activeTab === tab.id ? " tab-active" : ""}`}
                  >
                    <span aria-hidden="true" style={{ fontSize: "0.95rem" }}>{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
            </nav>

            {/* Panels */}
            <div className="card" style={{ padding: "clamp(1.25rem, 3vw, 2rem)" }}>
              {activeTab === "simplify" && (
                <div role="tabpanel" id="panel-simplify" aria-labelledby="tab-simplify" tabIndex={0}>
                  <SimplifyPanel documentText={documentText} />
                </div>
              )}
              {activeTab === "clauses" && (
                <div role="tabpanel" id="panel-clauses" aria-labelledby="tab-clauses" tabIndex={0}>
                  <ClauseRiskPanel
                    documentText={documentText}
                    documentHash={documentHash}
                    cachedAnalysis={analysisCache}
                    onAnalysisComplete={a => setAnalysisCache(a)}
                  />
                </div>
              )}
              {activeTab === "compare" && (
                <div role="tabpanel" id="panel-compare" aria-labelledby="tab-compare" tabIndex={0}>
                  <ComparePanel primaryText={documentText} primaryName={documentName} />
                </div>
              )}
              {activeTab === "ask" && (
                <div role="tabpanel" id="panel-ask" aria-labelledby="tab-ask" tabIndex={0}>
                  <QAPanel documentText={documentText} />
                </div>
              )}
              {activeTab === "nextsteps" && (
                <div role="tabpanel" id="panel-nextsteps" aria-labelledby="tab-nextsteps" tabIndex={0}>
                  <NextStepsPanel
                    documentText={documentText}
                    clauses={analysisCache?.clauses}
                    summary={analysisCache?.summary}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer style={{
        backgroundColor: "#ffffff",
        borderTop: "1px solid var(--color-border)",
        padding: "1.5rem 2rem",
        textAlign: "center",
      }}>
        <p style={{ fontSize: "0.72rem", color: "var(--color-text-dim)" }}>
          Lexplain explains legal documents in plain language.{" "}
          <strong style={{ color: "var(--color-text-muted)", fontWeight: 500 }}>Not legal advice.</strong>
          {" "}· PromptWars Exclusive Edition
        </p>
      </footer>
    </div>
  );
}
