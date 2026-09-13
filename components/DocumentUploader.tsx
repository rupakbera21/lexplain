"use client";

import { useState, useRef, useCallback } from "react";
import { ApiError } from "@/types";

interface DocumentUploaderProps {
  onDocumentLoaded: (text: string, name: string) => void;
  onError: (err: ApiError) => void;
  label?: string;
  id?: string;
}

export default function DocumentUploader({
  onDocumentLoaded,
  onError,
  label = "Upload Legal Document",
  id = "doc-upload",
}: DocumentUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoading,  setIsLoading]  = useState(false);
  const [mode,       setMode]       = useState<"upload" | "paste">("upload");
  const [pastedText, setPastedText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setIsLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res  = await fetch("/api/parse", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) { onError(data as ApiError); return; }
      onDocumentLoaded(data.text, data.name);
    } catch {
      onError({ error: "Failed to upload the document. Please try again.", errorType: "UNKNOWN", retryable: true });
    } finally {
      setIsLoading(false);
    }
  }, [onDocumentLoaded, onError]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handlePasteSubmit = useCallback(async () => {
    if (!pastedText.trim()) return;
    setIsLoading(true);
    const formData = new FormData();
    formData.append("text", pastedText);
    try {
      const res  = await fetch("/api/parse", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) { onError(data as ApiError); return; }
      onDocumentLoaded(data.text, "Pasted Document");
    } catch {
      onError({ error: "Failed to process the pasted text.", errorType: "UNKNOWN", retryable: true });
    } finally {
      setIsLoading(false);
    }
  }, [pastedText, onDocumentLoaded, onError]);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "0.5rem 1.1rem",
    fontSize: "0.78rem",
    fontWeight: 600,
    fontFamily: "var(--font-body)",
    letterSpacing: "0.01em",
    border: "none",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    transition: "all 0.15s ease",
    background: active ? "#ffffff" : "transparent",
    color: active ? "var(--brand-600)" : "var(--color-text-dim)",
    boxShadow: active ? "0 1px 2px rgba(0, 0, 0, 0.06), inset 0 0 0 1px var(--color-border)" : "none",
  });

  return (
    <div style={{ width: "100%" }}>
      {/* Mode toggle */}
      <div
        role="tablist"
        aria-label="Document input method"
        style={{
          display: "flex",
          gap: "2px",
          background: "var(--color-surface-2)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius)",
          padding: "3px",
          marginBottom: "1.25rem",
          width: "fit-content",
        }}
      >
        <button
          role="tab"
          aria-selected={mode === "upload"}
          id={`${id}-upload-tab`}
          aria-controls={`${id}-upload-panel`}
          onClick={() => setMode("upload")}
          style={tabStyle(mode === "upload")}
        >
          ◻ Upload File
        </button>
        <button
          role="tab"
          aria-selected={mode === "paste"}
          id={`${id}-paste-tab`}
          aria-controls={`${id}-paste-panel`}
          onClick={() => setMode("paste")}
          style={tabStyle(mode === "paste")}
        >
          ≡ Paste Text
        </button>
      </div>

      {/* Upload panel */}
      {mode === "upload" && (
        <div role="tabpanel" id={`${id}-upload-panel`} aria-labelledby={`${id}-upload-tab`}>
          <div
            className={`drop-zone${isDragOver ? " drag-over" : ""}`}
            role="button"
            aria-label={`${label} — drag and drop or click to select`}
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
            onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            style={{
              padding: "3rem 2rem",
              textAlign: "center",
              position: "relative",
            }}
          >
            {isLoading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
                <div
                  className="animate-spin"
                  style={{
                    width: 28, height: 28,
                    border: "2px solid var(--color-border)",
                    borderTopColor: "var(--brand-500)",
                    borderRadius: "50%",
                  }}
                  aria-hidden
                />
                <p style={{ fontSize: "0.82rem", color: "var(--color-text-muted)" }}>Processing document…</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.9rem" }}>
                <div style={{
                  width: 48, height: 48,
                  background: "#eff6ff",
                  borderRadius: "var(--radius)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: "1px solid #bfdbfe",
                  fontSize: "1.3rem",
                  color: "var(--brand-600)",
                  fontFamily: "var(--font-display)",
                }}>
                  ◻
                </div>
                <div>
                  <p style={{ fontSize: "0.92rem", fontWeight: 600, color: "var(--color-text)", marginBottom: "0.2rem" }}>
                    Drop your document here
                  </p>
                  <p style={{ fontSize: "0.78rem", color: "var(--color-text-dim)" }}>
                    or click to browse files
                  </p>
                </div>
                <p style={{ fontSize: "0.7rem", color: "var(--color-text-dim)", letterSpacing: "0.04em" }}>
                  PDF · DOCX · TXT · Max 10 MB
                </p>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            id={`${id}-file-input`}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 }}
            aria-label={label}
            onChange={handleFileChange}
          />

          <p style={{ marginTop: "0.85rem", fontSize: "0.72rem", color: "var(--color-text-dim)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span aria-hidden>🔒</span>
            Your document is processed for this session only and is not stored on our servers.
          </p>
        </div>
      )}

      {/* Paste panel */}
      {mode === "paste" && (
        <div
          role="tabpanel"
          id={`${id}-paste-panel`}
          aria-labelledby={`${id}-paste-tab`}
          style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}
        >
          <textarea
            id={`${id}-paste-textarea`}
            aria-label="Paste your legal document text here"
            placeholder="Paste the full text of your legal document here…"
            value={pastedText}
            onChange={e => setPastedText(e.target.value)}
            rows={9}
            className="input-field"
            style={{ resize: "vertical" }}
          />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.72rem", color: "var(--color-text-dim)" }}>
              {pastedText.length.toLocaleString()} characters
            </span>
            <button
              id={`${id}-paste-submit`}
              onClick={handlePasteSubmit}
              disabled={!pastedText.trim() || isLoading}
              aria-label="Analyse pasted document"
              className="btn-primary"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin" style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#ffffff", borderRadius: "50%" }} aria-hidden />
                  Processing…
                </>
              ) : "Analyse Document →"}
            </button>
          </div>

          <p style={{ fontSize: "0.72rem", color: "var(--color-text-dim)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span aria-hidden>🔒</span>
            Your document is processed for this session only and is not stored on our servers.
          </p>
        </div>
      )}
    </div>
  );
}
