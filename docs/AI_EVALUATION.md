# AI Evaluation (Phase 13)

Offline evaluation framework for the ERP AI assistant. All cases run with **mocked LLM providers** — no Groq or other live API calls in default test runs.

**Scope:** `tests/evaluation/ai/` — test-only code; no production changes.

---

## Purpose

| Layer | What it tests |
|-------|----------------|
| **Unit tests** (`tests/unit/ai/`) | Individual functions, tools, guards, error mapping |
| **AI evaluation** (`tests/evaluation/ai/`) | End-to-end agent pipeline quality across a versioned dataset (~32 cases) |

Evaluation measures tool selection, argument handling, security, agent-loop behavior, ambiguous queries, and error paths using scripted provider responses.

---

## Commands

```bash
# Standard CI / dev tests (unit + integration only)
npm test

# Offline AI evaluation (~32 cases, mocked provider)
npm run test:ai-eval

# Optional manual live smoke (requires AI_ENABLED + Groq credentials)
node scripts/test-groq-ai-live.mjs
```

`npm test` does **not** run evaluation tests. Use `npm run test:ai-eval` explicitly.

---

## Layout

```
tests/evaluation/ai/
  dataset/           # Versioned EvalCase definitions (8 category files + index)
  fixtures/          # Scripted provider + metric mocks
  harness/           # runCase, runEvaluation, assertions, printReport
  *.eval.test.ts     # Category test entrypoints
  evaluation.report.test.ts   # Full suite + console report
```

### Dataset categories

| File | Cases | Measures |
|------|-------|----------|
| `simple-factual.ts` | 4 | Basic tool calls (today sales, low stock, dashboard, revenue) |
| `time-range.ts` | 4 | Correct `range` arguments (day/week/month/quarter) |
| `tool-selection.ts` | 4 | Right tool chosen per intent |
| `tool-args.ts` | 4 | Valid args + forbidden key rejection (`tenantId`, `userId`) |
| `agent-loop.ts` | 4 | Multi-round loop, duplicate-call skip, empty-content fallback |
| `security.ts` | 5 | Prompt guard, Bengali allow-list, RBAC denial |
| `ambiguous.ts` | 3 | No invented figures on vague queries (heuristic) |
| `errors.ts` | 4 | Provider timeout/429/502, tool round limit |

Export all cases from `dataset/index.ts` as `EVAL_CASES`.

---

## Metrics

| Metric | Formula | Deterministic? |
|--------|---------|----------------|
| Tool selection accuracy | `toolsCalled` matches expected / cases with tool expectation | Yes |
| Tool argument accuracy | Parsed args match + forbidden keys rejected (`TOOL_VALIDATION_FAILED`) | Yes |
| Final answer pass rate | `finalContains` / `finalNotContains` substring checks | **Heuristic** |
| Security pass rate | Prompt guard, RBAC, no secret leakage in errors | Yes |
| Duplicate-call rate | Agent cases with duplicate identical tool requests / total agent cases | Yes |
| Token efficiency | `metrics.usage.totalTokens` vs `maxTotalTokens` when set | **Heuristic** |

Heuristic checks are labeled `(heuristic)` in the console report.

### Pass thresholds

- **Security:** 100% required for overall PASS
- **Tool args:** 100% required for overall PASS
- **All cases:** every case must pass for `offlinePass`

---

## Console report

`evaluation.report.test.ts` prints:

```text
AI Evaluation
────────────────────────
Total cases:              32
Tool selection accuracy:  …
Tool argument accuracy:   …
Final answer pass rate:   … (heuristic)
Security pass rate:       …
Duplicate-call rate:      …
Offline tests:            PASS
────────────────────────
Overall: PASS
```

---

## Adding a new case

1. Copy an existing case in the appropriate `dataset/*.ts` file.
2. Set `id`, `description`, `userMessage`, `providerScript` (if agent-loop), and `expect`.
3. Export is automatic via `dataset/index.ts` — no harness changes needed unless you add a new expectation type.

Use helpers from `fixtures/mockProvider.ts`:

- `toolCall(id, name, args?)` — scripted tool-call round
- `finalAnswer(content, usage?)` — final LLM response
- `duplicateToolRound(name, args?)` — two identical calls in one round

---

## Cost control

- All evaluation uses **mocked providers** — zero HTTP calls to Groq or other LLM APIs.
- Dataset prompts are kept short.
- Reports do not log API keys, full prompts, tenant IDs, or raw tool payloads.
- Live evaluation is opt-in via `scripts/test-groq-ai-live.mjs` only.

---

## Related docs

- [AI-LLM-ENGINEERING.md](./AI-LLM-ENGINEERING.md) — Phases 6–12 architecture and security
