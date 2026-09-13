"use client";

import { useEffect, useState, useCallback } from "react";

type FontSize = "normal" | "large" | "xl";
interface A11yState { fontSize: FontSize; dyslexic: boolean; highContrast: boolean; }
const STORAGE_KEY = "lexplain_a11y";

function loadState(): A11yState {
  if (typeof window === "undefined") return { fontSize: "normal", dyslexic: false, highContrast: false };
  try { const s = localStorage.getItem(STORAGE_KEY); if (s) return JSON.parse(s) as A11yState; } catch {}
  return { fontSize: "normal", dyslexic: false, highContrast: false };
}

function applyToDOM(state: A11yState) {
  const html = document.documentElement;
  html.setAttribute("data-font-size", state.fontSize);
  html.setAttribute("data-dyslexic", String(state.dyslexic));
  html.setAttribute("data-contrast", state.highContrast ? "high" : "normal");
  if (state.dyslexic && !document.getElementById("opendyslexic-css")) {
    const link = document.createElement("link");
    link.id = "opendyslexic-css"; link.rel = "stylesheet";
    link.href = "https://fonts.cdnfonts.com/css/opendyslexic";
    document.head.appendChild(link);
  }
}

export default function AccessibilityToolbar() {
  const [state, setState] = useState<A11yState>({ fontSize: "normal", dyslexic: false, highContrast: false });
  const [mounted, setMounted] = useState(false);

  useEffect(() => { const s = loadState(); setState(s); applyToDOM(s); setMounted(true); }, []);

  const update = useCallback((partial: Partial<A11yState>) => {
    setState(prev => {
      const next = { ...prev, ...partial };
      applyToDOM(next);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  if (!mounted) return null;

  const btnBase: React.CSSProperties = {
    background: "#ffffff",
    border: "1px solid var(--color-border)",
    color: "#334155",
    borderRadius: "var(--radius-sm)",
    padding: "0.3rem 0.55rem",
    fontSize: "0.7rem",
    fontWeight: 600,
    fontFamily: "var(--font-body)",
    cursor: "pointer",
    transition: "all 0.15s ease",
    lineHeight: 1,
  };
  const btnActive: React.CSSProperties = {
    background: "#eff6ff",
    border: "1px solid #93c5fd",
    color: "#1d4ed8",
  };

  const sizes: FontSize[] = ["normal", "large", "xl"];
  const sizeLabels: Record<FontSize, string> = { normal: "A", large: "A+", xl: "A++" };

  return (
    <div role="toolbar" aria-label="Accessibility options" style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
      {/* Font size */}
      <div role="group" aria-label="Text size" style={{ display: "flex", gap: "2px" }}>
        {sizes.map(sz => (
          <button
            key={sz}
            onClick={() => update({ fontSize: sz })}
            aria-pressed={state.fontSize === sz}
            aria-label={`Text size ${sz}`}
            style={{ ...btnBase, ...(state.fontSize === sz ? btnActive : {}) }}
          >
            {sizeLabels[sz]}
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 14, background: "var(--color-border)" }} aria-hidden />

      {/* Dyslexia toggle */}
      <button
        onClick={() => update({ dyslexic: !state.dyslexic })}
        aria-pressed={state.dyslexic}
        aria-label={`Dyslexia-friendly font ${state.dyslexic ? "on" : "off"}`}
        data-tooltip="Dyslexia font"
        style={{ ...btnBase, ...(state.dyslexic ? { ...btnActive, background: "#f5f3ff", border: "1px solid #c4b5fd", color: "#6d28d9" } : {}) }}
      >
        Dy
      </button>

      {/* High contrast toggle */}
      <button
        onClick={() => update({ highContrast: !state.highContrast })}
        aria-pressed={state.highContrast}
        aria-label={`High contrast ${state.highContrast ? "on" : "off"}`}
        data-tooltip="High contrast"
        style={{ ...btnBase, ...(state.highContrast ? { background: "#fefce8", border: "1px solid #fde047", color: "#a16207" } : {}) }}
      >
        ◑
      </button>
    </div>
  );
}
