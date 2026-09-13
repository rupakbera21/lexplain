# Changelog

All notable changes to Lexplain will be documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

Changes in development but not yet deployed.

---

## [1.0.0] — Initial Release

### Added
- **Document upload** — PDF, DOCX, and plain text support with magic-byte validation and 10MB size cap
- **Plain-language simplification** — Streaming AI explanation at 3 reading levels (Simple / Standard / Detailed) via `gemini-2.0-flash`
- **Clause extraction & risk scoring** — Structured JSON output classification of every clause as Obligation / Right / Risk / Neutral with High/Medium/Low severity for risks
- **Document comparison** — Side-by-side diff of two documents with significance ratings (Major / Moderate / Minor) and overall recommendation
- **Grounded Q&A** — RAG pipeline using `text-embedding-004` for chunk embedding, cosine similarity retrieval, and grounded answers with anti-hallucination refusal
- **Before-You-Sign checklist** — Personalized checklist, lawyer questions, and top 3 red flags generated from risk analysis
- **Persistent disclaimer banner** — Sticky, impossible-to-miss disclaimer on every page ("Lexplain explains legal documents in plain language. It does not provide legal advice.")
- **Accessibility toolbar** — Font size toggle (3 levels), OpenDyslexic font toggle, high-contrast mode toggle — all persisted to localStorage
- **Full keyboard navigation** — Every feature reachable via Tab/Enter/Space
- **ARIA support** — Proper labels, roles, live regions, and expanded/selected states throughout
- **Rate limiting** — 20 req/min per IP sliding-window limiter on all API routes
- **Prompt injection sanitization** — Strips known injection patterns from user-uploaded document text
- **No document persistence** — Explicit in UI; confirmed in server architecture
- **Session memoization** — Clause analysis cached by document SHA-256 hash
- **Error handling** — Retry with exponential backoff; distinct error types surfaced to UI; user input preserved on failure
- **Unit tests** — chunker, validators, sanitize modules
- **Documentation** — README, CHANGELOG, TESTING.md

### Security
- API key: server-side environment variable only; `.env.example` committed with placeholder
- No content in server logs
- File validation: magic bytes + MIME + size before parsing

### Architecture
- Next.js 15 App Router + TypeScript strict mode
- All Gemini calls centralized in `lib/gemini.ts`
- SSE streaming for simplification and Q&A
