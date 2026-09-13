# TESTING.md — Lexplain Test Documentation

## Running Automated Tests

```bash
cd lexplain
npm test                    # all tests
npm test -- --coverage     # with coverage report
npm test -- --watch        # watch mode during development
```

---

## Unit Tests

Located in `__tests__/unit/`.

| File | What's tested |
|---|---|
| `chunker.test.ts` | `chunkDocument` (short/long/empty text), `hashDocument` (consistency, format), `cosineSimilarity` (identical/orthogonal/opposite vectors), `retrieveTopKChunks` (sorting, k-limit, threshold filtering) |
| `validators.test.ts` | `validateFileSize` (within/over limit, size in error message), `validateFileType` (valid PDF/DOCX/text, wrong magic bytes, unsupported type, charset suffix), `validateDocumentContent` (empty, whitespace, too short, valid) |
| `sanitize.test.ts` | `sanitizeForPrompt` (injection patterns, case insensitivity, Handlebars, template literals, INST tags), `truncateToMaxChars`, `prepareDocumentForPrompt` |

---

## Manual Test Cases

These 8 cases are the recommended **demo video shot list**. Each has a clearly distinct, verifiable outcome.

| # | Test Case | How to Reproduce | Expected Outcome | Demonstrates |
|---|---|---|---|---|
| 1 | **Valid PDF upload** | Upload a real lease/NDA PDF via the upload zone | Document parses → simplify panel ready | Core flow, file parsing |
| 2 | **Invalid file type** | Try uploading a `.jpg` or `.xlsx` file | Error: "Unsupported file type. Please upload a PDF, DOCX, or plain text file." | File validation (Security) |
| 3 | **File too large** | Upload a file > 10MB | Error: "File too large (X MB). Maximum allowed is 10MB." | Size validation (Security) |
| 4 | **Empty/unreadable document** | Upload a 0-byte or image-only PDF | Error: "The document appears to be empty or contains no readable text." | Content validation |
| 5 | **Document with high-risk clauses** | Upload an NDA with broad IP assignment + unilateral modification | Red "HIGH RISK" badges visible in Clauses tab; Before-You-Sign shows ≥3 lawyer questions | Clause analysis, risk scoring |
| 6 | **Document with no risky clauses** | Upload a simple, standard service agreement | All clauses show as Obligation/Right/Neutral; Risk count is 0 | Risk detection accuracy |
| 7 | **Irrelevant Q&A question** | Ask "What is the capital of France?" about an NDA | Answer: "This document doesn't appear to address that question..." (anti-hallucination refusal) | Q&A grounding, anti-hallucination |
| 8 | **Two different questions → different answers** | Ask "What are my obligations?" then "What are the termination terms?" | Two distinct, document-grounded answers with different cited sections | Dynamic AI responses |
| 9 | **Document comparison** | Upload a 2023 lease and 2024 lease | Side-by-side diff with highlighted Major/Moderate/Minor differences | Compare feature |
| 10 | **Gemini API failure** | Briefly disconnect network, then submit a simplify request | Error: "Couldn't analyze this document right now — please try again." Retry button appears. Document stays loaded. | Error handling, graceful degradation |
| 11 | **Paste text input** | Switch to "Paste Text" tab, paste a contract's text | Same analysis results as file upload | Text paste feature |
| 12 | **Accessibility modes** | Toggle dyslexia font, high contrast, font size XL | UI adapts visually; all features still keyboard-navigable | Accessibility |

---

## Integration Tests

Located in `__tests__/integration/`. Gemini calls are mocked with `jest.mock('@/lib/gemini')`.

| File | What's tested |
|---|---|
| `simplify.test.ts` | POST `/api/simplify` — missing body, invalid level, empty text, rate limit mock, streaming response shape |
| `analyze-clauses.test.ts` | POST `/api/analyze-clauses` — missing body, malformed JSON response from mocked Gemini, valid response → correct ClauseAnalysis shape |

---

## Accessibility Testing Checklist

- [ ] Tab through every interactive element on the upload page (no mouse)
- [ ] Tab through all 5 feature tabs (keyboard only)
- [ ] Activate upload zone with Enter/Space (no mouse)
- [ ] Submit a question in Q&A with Enter key only
- [ ] All clause expand/collapse buttons work with keyboard
- [ ] Screen reader (NVDA + Chrome): heading structure announced correctly
- [ ] Screen reader: streaming text announced as it arrives
- [ ] High contrast mode: no text invisible against background
- [ ] Font size XL: layout not broken, no truncated text
- [ ] Dyslexia mode: font loads and renders correctly

---

## Demo Video Shot List (4-minute cap)

| Time | Shot | Notes |
|---|---|---|
| 0:00–0:20 | Show homepage, explain Lexplain, point out disclaimer banner | Emphasize the "not legal advice" design decision |
| 0:20–0:50 | Upload a real legal document (NDA recommended) | Live drag-drop, not pre-filled |
| 0:50–1:20 | Switch through reading levels in Simplify tab | Show streaming text arriving in real time |
| 1:20–1:50 | Click Risks tab, show clause analysis | Point out HIGH/MEDIUM badges, expand a risky clause |
| 1:50–2:15 | Click Ask tab, type two different questions | Show two distinct grounded answers with citations |
| 2:15–2:20 | Ask an irrelevant question ("capital of France?") | Show anti-hallucination refusal |
| 2:20–2:45 | Click Compare tab, upload a second version | Show side-by-side diff, point out Major difference |
| 2:45–3:05 | Click Before You Sign, generate checklist | Show high-priority items, switch to Lawyer Questions |
| 3:05–3:25 | Toggle dyslexia mode + high contrast | Show accessibility toolbar in action |
| 3:25–3:45 | Try uploading a JPG | Show distinct error message |
| 3:45–4:00 | Show README requirement traceability matrix | Close with "all 5 features, every rubric criterion" |
