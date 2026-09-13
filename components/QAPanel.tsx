"use client";

import { useState, useRef, useCallback } from "react";
import StreamingText from "./StreamingText";
import { useStreamingResponse } from "@/hooks/useStreamingResponse";

interface QAPanelProps {
  documentText: string;
}

interface QAItem {
  question: string;
  answer: string;
}

const EXAMPLE_QUESTIONS = [
  "What are my main obligations under this agreement?",
  "Can the other party terminate this agreement without cause?",
  "What happens if there is a dispute or breach?",
  "Is there an automatic renewal clause?",
  "What are the confidentiality requirements?",
];

export default function QAPanel({ documentText }: QAPanelProps) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<QAItem[]>([]);
  const currentQuestion = useRef("");

  const { text, isStreaming, isDone, error, startStream } = useStreamingResponse();
  const prevIsDone = useRef(false);

  const handleAsk = useCallback(async (q?: string) => {
    const query = q ?? question;
    if (!query.trim() || isStreaming) return;
    currentQuestion.current = query;
    await startStream("/api/ask", { text: documentText, question: query });
  }, [documentText, question, isStreaming, startStream]);

  if (isDone && !prevIsDone.current && text && currentQuestion.current) {
    prevIsDone.current = true;
    setHistory((prev) => [
      { question: currentQuestion.current, answer: text },
      ...prev,
    ]);
    setQuestion("");
  }
  if (!isDone) prevIsDone.current = false;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAsk();
  };

  return (
    <section aria-labelledby="qa-heading" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <h2 id="qa-heading" className="panel-title">
          Ask About This Document
        </h2>
        <p className="panel-desc">
          Ask any question — answers are grounded strictly in your document text and cite specific sections.
        </p>
      </div>

      {/* Question input */}
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <label htmlFor="qa-question-input" className="sr-only">
          Ask a question about the document
        </label>
        <div className="qa-input-container">
          <span style={{ fontSize: "1.05rem", color: "var(--color-text-dim)", flexShrink: 0 }} aria-hidden="true">
            🔍
          </span>
          <input
            id="qa-question-input"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. What happens if I want to cancel early or terminate without cause?"
            disabled={isStreaming}
            aria-label="Your question about the document"
            aria-describedby="qa-hint"
            className="qa-input-field"
          />
          <button
            type="submit"
            disabled={!question.trim() || isStreaming}
            aria-label="Submit question"
            className="qa-submit-btn"
          >
            {isStreaming ? (
              <>
                <span className="animate-spin" style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block" }} />
                Searching…
              </>
            ) : (
              "Ask Document →"
            )}
          </button>
        </div>
        <p id="qa-hint" style={{ fontSize: "0.74rem", color: "var(--color-text-dim)", margin: 0 }}>
          💡 Answers are derived strictly from the document clauses and cite the relevant section numbers.
        </p>
      </form>

      {/* Example questions */}
      <div>
        <p style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--color-text-muted)", marginBottom: "0.5rem", fontFamily: "var(--font-display)" }}>
          Suggested questions to ask:
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }} role="list" aria-label="Example questions">
          {EXAMPLE_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              role="listitem"
              onClick={() => { setQuestion(q); handleAsk(q); }}
              disabled={isStreaming}
              aria-label={`Example question: ${q}`}
              className="qa-chip"
            >
              <span style={{ color: "#2563eb", fontWeight: 700 }} aria-hidden="true">?</span>
              <span>{q}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="alert-box animate-fade-up">
          <span className="alert-icon" aria-hidden="true">⚠️</span>
          <div className="alert-content">
            <div className="alert-title">{error.error}</div>
            <div className="alert-text">
              An error occurred while answering your question. Please click below to retry.
            </div>
            {error.retryable && (
              <button
                type="button"
                onClick={() => handleAsk()}
                className="btn-retry"
                aria-label="Try asking question again"
              >
                <span>↺</span> Try again
              </button>
            )}
          </div>
        </div>
      )}

      {/* Active streaming answer */}
      {(isStreaming || (text && !isDone)) && (
        <div className="card animate-fade-in" style={{ padding: "1.5rem", backgroundColor: "#ffffff" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            marginBottom: "1rem",
            paddingBottom: "0.85rem",
            borderBottom: "1px solid var(--color-border)",
            flexWrap: "wrap",
          }}>
            <span style={{
              fontSize: "0.92rem",
              fontWeight: 700,
              color: "var(--brand-700)",
              fontFamily: "var(--font-display)",
              flex: 1,
              minWidth: 0,
              overflowWrap: "break-word",
              wordBreak: "break-word",
            }}>
              {currentQuestion.current}
            </span>
            {isStreaming && (
              <span style={{ fontSize: "0.75rem", color: "var(--brand-600)", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", animation: "pulseCyan 1s infinite" }} />
                Searching document…
              </span>
            )}
          </div>
          <StreamingText text={text} isStreaming={isStreaming} />
        </div>
      )}

      {/* Q&A History */}
      {history.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          <h3 style={{
            fontSize: "0.72rem",
            fontWeight: 700,
            color: "var(--color-text-dim)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontFamily: "var(--font-display)",
            margin: 0,
          }}>
            Previous Questions ({history.length})
          </h3>
          {history.map((item, i) => (
            <details
              key={i}
              className="qa-history-item"
            >
              <summary className="qa-history-summary">
                <span style={{
                  color: "#1d4ed8",
                  fontWeight: 700,
                  fontSize: "0.8rem",
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }} aria-hidden="true">
                  ?
                </span>
                <span style={{
                  fontSize: "0.88rem",
                  fontWeight: 600,
                  color: "var(--color-text)",
                  flex: 1,
                  minWidth: 0,
                  overflowWrap: "break-word",
                  wordBreak: "break-word",
                }}>
                  {item.question}
                </span>
                <span style={{ color: "var(--color-text-dim)", fontSize: "0.75rem", flexShrink: 0 }}>
                  ▼
                </span>
              </summary>
              <div className="qa-history-body">
                <StreamingText text={item.answer} isStreaming={false} />
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
