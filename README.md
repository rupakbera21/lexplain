# Lexplain

> **Legal documents in plain language.** GenAI-powered legal document companion for the PromptWars Exclusive Edition challenge.

Lexplain is not a lawyer. It is a plain-language lens for legal text. Every output carries a persistent, design-level disclaimer — because the clearest way to respect the problem statement's core constraint ("must not present itself as a replacement for professional legal advice") is to make that boundary impossible to miss.

---

## Features

| # | Feature | Status |
|---|---|---|
| 1 | Plain-language simplification at 3 reading levels (Simple / Standard / Detailed) | ✅ |
| 2 | Clause extraction & classification (Obligation / Right / Risk / Neutral) with severity ratings | ✅ |
| 3 | Side-by-side document comparison with significance ratings | ✅ |
| 4 | Grounded Q&A — answers cite document sections; refuses when context is insufficient | ✅ |
| 5 | Before-You-Sign checklist + Questions for your lawyer | ✅ |

---

## Requirement Traceability Matrix

Maps every bullet from the original problem statement to the shipped feature:

| Problem Statement Requirement | Implemented Feature | Route / Component |
|---|---|---|
| Help users **understand** legal documents | Plain-language simplification at 3 levels | `/api/simplify` → `SimplifyPanel` |
| **Compare** legal documents | Two-document side-by-side comparison | `/api/compare` → `ComparePanel` |
| **Navigate** legal documents | Clause-by-clause extraction with filtering | `/api/analyze-clauses` → `ClauseRiskPanel` |
| **Flag risks** and problematic terms | Risk scoring with High/Medium/Low severity | `/api/analyze-clauses` → `ClauseRiskPanel` |
| **Basic legal assistance** | Before-You-Sign checklist & lawyer questions | `/api/next-steps` → `NextStepsPanel` |
| Answer **free-form questions** about documents | Grounded Q&A with source citations | `/api/ask` → `QAPanel` |
| Must **not replace professional advice** | Persistent sticky disclaimer banner + footer | `DisclaimerBanner`, every API response |

---

## GenAI Architecture

All Gemini calls route through `lib/gemini.ts`. The API key lives only in server-side environment variables.

| Feature | GenAI Technique | Model | Code Location |
|---|---|---|---|
| Plain-language simplification | Streaming prompted summarization (3 system prompts) | `gemini-2.0-flash` | `/api/simplify/route.ts` |
| Clause extraction | Structured JSON output (`responseMimeType: application/json`) | `gemini-2.0-flash` | `/api/analyze-clauses/route.ts` |
| Risk scoring | Conditioned reasoning over clauses with red-flag taxonomy | `gemini-2.0-flash` | `/api/analyze-clauses/route.ts` |
| Document comparison | Two-document diff prompt → structured JSON output | `gemini-2.0-flash` | `/api/compare/route.ts` |
| Grounded Q&A | RAG: chunk → embed with `text-embedding-004` → cosine retrieval → grounded answer | `text-embedding-004` + `gemini-2.0-flash` | `/api/ask/route.ts`, `lib/chunker.ts` |
| Before-You-Sign checklist | Prompted generation conditioned on risk-flagged clauses | `gemini-2.0-flash` | `/api/next-steps/route.ts` |

**Anti-hallucination:** The Q&A feature refuses to answer when retrieved context has a cosine similarity below 0.4, responding: *"This document doesn't appear to address that question... Consider asking a legal professional."*

---

## Security Considerations

| Concern | Mitigation |
|---|---|
| **API key exposure** | `GEMINI_API_KEY` lives in `.env.local` (gitignored). Never referenced in client code. `.env.example` committed with placeholder only. |
| **Document persistence** | Documents are processed in-memory per-request as `Buffer` objects. Nothing is written to disk or a database. Confirmed in UI: *"Your document is processed for this session only and is not stored."* |
| **File type validation** | MIME type checked + magic byte verification before any parsing. Rejects non-PDF/DOCX/TXT files server-side. |
| **File size limit** | 10MB hard cap enforced server-side in `/api/parse`. Client shows distinct error for oversized files. |
| **Prompt injection** | `lib/sanitize.ts` strips known injection patterns (`[SYSTEM]`, `[INST]`, `ignore all previous instructions`, Handlebars, template literals, role tags) from document text before interpolation into any Gemini prompt. |
| **Rate limiting** | Sliding-window in-memory rate limiter (20 req/min per IP) on all `/api/*` routes. Returns `429` with retry-after hint. |
| **No PII in logs** | Server logs emit only error type, route, and timestamp. Never document content or identifying information. |

---

## Performance Notes

- **Streaming:** `/api/simplify` and `/api/ask` use `generateContentStream` → Server-Sent Events. Users see text appearing within 1–2 seconds of submitting rather than waiting for the full response.
- **Session memoization:** Clause analysis is cached by `documentHash` (SHA-256 of raw text) in client state. Switching from the Clauses tab to Q&A and back does not re-run analysis.
- **RAG chunking:** Documents are split into 1,500-character sliding-window chunks with 200-character overlap using sentence-boundary detection, then only the top-5 most relevant chunks (cosine similarity ≥ 0.4) are sent to Gemini for each Q&A call. This prevents large-document context overflow and reduces latency.
- **Lazy loading:** The `DocumentUploader` file-processing logic dispatches to the server immediately; PDF/DOCX parsing happens server-side and doesn't bloat the client bundle.

---

## Accessibility

Lexplain was built to make legal information accessible to *everyone* — not just people comfortable with legal jargon, but also people who benefit from visual or reading accommodations.

### Features

| Feature | Implementation |
|---|---|
| **Semantic HTML** | `<header>`, `<main>`, `<nav>`, `<section>`, `<article>`, `<footer>` throughout |
| **Heading hierarchy** | Single `<h1>` on page (brand), `<h2>` per panel, `<h3>` per clause |
| **ARIA labels** | All interactive elements have `aria-label`, `aria-describedby`, `role`, `aria-selected`, `aria-expanded`, `aria-busy`, `aria-live` |
| **Keyboard navigation** | Every feature reachable and operable via Tab/Enter/Space — no mouse required |
| **Font size toggle** | 3 sizes (Normal / Large / XL), persisted to localStorage via `AccessibilityToolbar` |
| **Dyslexia-friendly font** | OpenDyslexic loaded on-demand when toggled, with increased letter and word spacing |
| **High-contrast mode** | Activated via toolbar; overrides all color tokens to black/white/yellow via CSS custom properties |
| **Skip to content** | "Skip to main content" link appears on focus for screen reader/keyboard users |
| **Screen reader support** | Streaming text uses `aria-live="polite"` / `aria-atomic="false"` |
| **Color contrast** | All text/background combinations meet WCAG 2.1 AA (≥ 4.5:1 for body text) |
| **Alt text** | All decorative icons marked `aria-hidden="true"` |

### Manual Checks Run
- ✅ Full keyboard-only walkthrough (Tab through all 5 features, Enter/Space all buttons)
- ✅ Screen reader spot-check (NVDA + Chrome) — all panels announced correctly
- ✅ High-contrast mode visual review — all text remains readable
- ✅ Zoom to 200% — layout remains functional, no horizontal scroll
- ✅ Dyslexia mode — OpenDyslexic loads correctly and persists on reload

---

## Testing

See [TESTING.md](./TESTING.md) for the full manual test case table and instructions to run unit/integration tests.

### Run Tests
```bash
npm test                    # run all tests
npm test -- --coverage     # with coverage report
npm test chunker            # run chunker tests only
```

### Test Coverage
- **Unit tests:** `lib/chunker.ts`, `lib/validators.ts`, `lib/sanitize.ts`
- **Integration tests:** `/api/simplify`, `/api/analyze-clauses` (Gemini mocked)
- **Manual test cases:** 8 scenarios in TESTING.md including error cases and anti-hallucination

---

## Setup & Running Locally

### Prerequisites
- Node.js 18+
- npm 9+
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

### Steps

```bash
# 1. Clone / open the lexplain directory
cd lexplain

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local and paste your GEMINI_API_KEY

# 4. Run the development server
npm run dev

# 5. Open http://localhost:3000
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | ✅ Yes | Your Gemini API key. Get one at [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| `RATE_LIMIT_RPM` | Optional | Requests per minute per IP. Default: `20` |

---

## Deployment (Vercel)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Set environment variable
vercel env add GEMINI_API_KEY
```

Or use the Vercel dashboard: connect this repo, add `GEMINI_API_KEY` in **Settings → Environment Variables**.

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

---

## Project Structure

```
lexplain/
├── app/
│   ├── layout.tsx          # Root layout, SEO metadata, skip link
│   ├── page.tsx            # Main page — upload + 5-tab UI
│   ├── globals.css         # Design system, accessibility modes
│   └── api/
│       ├── parse/          # Document upload + parsing
│       ├── simplify/       # Streaming plain-language explanation
│       ├── analyze-clauses/ # Clause extraction + risk scoring
│       ├── compare/        # Document comparison
│       ├── ask/            # Grounded Q&A (RAG)
│       └── next-steps/     # Before-You-Sign checklist
├── components/             # All React UI components
├── lib/                    # Gemini client, parsers, chunker, validators, sanitizer, rate limiter
├── hooks/                  # useDocumentSession, useStreamingResponse
├── types/                  # Shared TypeScript interfaces
├── __tests__/              # Unit + integration tests
├── .env.example            # Safe to commit — placeholder key only
├── README.md
├── CHANGELOG.md
└── TESTING.md
```

---

*Lexplain — making legal documents readable for everyone, without replacing the lawyers who matter.*
