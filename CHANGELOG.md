# Changelog

All notable changes to Lexplain will be documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

---

## [1.1.0] — 2026-09-15

### Changed (Efficiency Improvements)
- **Singleton Gemini Client & Models:** Instantiated module-level singletons for `GoogleGenerativeAI`, the primary text model (`gemini-2.5-flash`), and embedding model (`text-embedding-004`) to eliminate per-request client creation overhead (`lib/gemini.ts`).
- **Throttled Batch Embedding Generation:** Replaced unthrottled `Promise.all` with a concurrent worker pool (`MAX_CONCURRENT = 5`) to prevent burst quota exhaustion while maximizing embedding throughput (`lib/gemini.ts`).
- **Prompt Payload Optimization in Next-Steps:** Optimized `app/api/next-steps/route.ts` to omit the full 20,000-character document excerpt whenever structured clause context and summary are already available.
- **Dynamic Truncation Notices:** Interpolated exact `maxChars` values dynamically into document truncation messages rather than using a static 100,000-character string (`lib/sanitize.ts`).
- **Eliminated Redundant Client Hashing:** Removed client-side SHA-256 main-thread re-computation in `app/page.tsx`, directly reusing the server-computed document hash from `/api/parse`.
- **Rate-Limiter Memory & Stack Safety:** Replaced `Math.min(...spread)` with `.reduce()` in `lib/ratelimit.ts` to prevent call-stack overflow risk, and added an unref'd 5-minute stale-timestamp cleanup interval to prevent memory leaks under sustained traffic.
- **Quota-Specific Grok Fallback & UI Indicators:** Hardened Gemini-to-Grok failover to trigger specifically on 429 / quota exhaustion with transparent client-side fallback status indicators.
- **MIME/Module Normalization:** Swapped external ESM `uuid` dependency in `app/api/analyze-clauses/route.ts` with standard Node/browser `crypto.randomUUID()`.

### Added (Testing Suite Expansion)
- **API Route Integration Tests:** Added comprehensive integration test suites across all 6 Next.js endpoints (`__tests__/integration/`): `simplify.test.ts` (SSE streaming & rate limiting), `analyze-clauses.test.ts` (structured JSON & risk scoring), `ask.test.ts` (RAG retrieval & anti-hallucination), `compare.test.ts` (side-by-side comparison), `next-steps.test.ts` (checklist & red flags), and `parse.test.ts` (multi-format parsing & file-type validation).
- **Core Unit Test Coverage:** Added unit test suites for `lib/gemini.ts` (error classification, retry backoff, embedding pool), `lib/grok.ts` (fallback stream & JSON parser), `lib/parsers.ts` (MIME dispatch & text extraction), and `lib/ratelimit.ts` (IP extraction & sliding-window thresholds).
- **Component Tests:** Added full jsdom component tests (`__tests__/components/`) for the three primary interactive panels: `ClauseRiskPanel.test.tsx` (filtering, loading skeletons, accordion expansion, re-analysis), `QAPanel.test.tsx` (example chips, input validation, streaming indicators, retry handlers), and `ComparePanel.test.tsx` (upload triggers, comparison cards, significance badges).
- **Strengthened Unit Assertions:** Added explicit adjacent-chunk content overlap verification in `chunker.test.ts` and pinned exact 3-vs-4 newline collapsing boundaries in `sanitize.test.ts`.

### Scope & Compliance Note
- Net effect strictly scoped to Efficiency and Testing. Zero regressions or changes to Code Quality, Security, Accessibility, or Problem Statement Alignment. Disclaimers, rate-limit policies, keyboard accessibility, ARIA hierarchies, and contrast tokens remain preserved.

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
