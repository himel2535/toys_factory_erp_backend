# Phase 5 — Dashboard Performance Benchmark Report

**Date:** 2026-08-27  
**Scope:** Post-Phases 1–4 audit (tenant isolation, RBAC, business dates, metrics extraction)  
**Production code changes:** ZERO

---

## 1. Benchmark Methodology

- **Environment:** Backend on `localhost:5000`, `PERF_TRACE=1`, MongoDB Atlas (connected), Redis **not configured** (in-memory cache fallback — same as Aug 2026 baseline).
- **Auth:** Single login (`admin@toysfactory.com`), cookie reused for all requests.
- **Per endpoint (×6):** 1 cold request (first to that route after fresh server) + 5 warm repeats (same URL within 60s HTTP cache TTL).
- **Parallel load:** All 6 dashboard endpoints fired concurrently — once cold, once warm.
- **Inflight coalescing:** Fresh server restart → 3 concurrent `sales-trend` requests before any cache warm.
- **Observability:** Server stdout parsed for `[cache] HIT/MISS/inflight` and `[timing]` handler legs; client-side wall latency + `X-Perf-Trace`.
- **Script:** `scripts/run-phase5-dashboard-perf.mjs` → `docs/phase5-dashboard-perf-results.json`.

---

## 2. Results Table

| Endpoint | Cold (ms) | Warm median (ms) | Warm min–max (ms) | Speedup (cold/warm) |
|---|---:|---:|---|---:|
| summary (KPI) | 640 | 8 | 6–58 | 80× |
| sales-trend | 483 | 9 | 5–14 | 54× |
| revenue-trend | 425 | 7 | 6–9 | 61× |
| top-products | 275 | 8 | 7–26 | 34× |
| recent-invoices | 275 | 5 | 4–10 | 55× |
| business-alerts | 593 | 9 | 5–19 | 66× |

**Parallel dashboard load (6 endpoints):**

| Mode | Total wall (ms) | Notes |
|---|---:|---|
| Cold (post-restart) | 579 | Longest leg ~572ms; parallel << sequential sum (2691ms) |
| Warm (cache HIT) | 239 | Summary 21ms; trends ~200ms (loader may still refresh within 15s TTL) |

**Cold concurrent sales-trend (3 requests, fresh server):**

| Metric | Value |
|---|---:|
| Total wall | 870 ms |
| Per-request | 859–868 ms |
| Server: MISS | 1 |
| Server: HIT inflight | 2 |
| Handler `[timing]` total | 463 ms (single execution) |

---

## 3. Comparison with Previous Baseline

**No reliable pre-Phase-1–4 API baseline exists** for the metrics-extraction refactor. Reference-only data from Aug 2026 (`web/docs/final-erp-performance-report.json`):

| Metric | Aug 2026 reference | Phase 5 (2026-08-27) | Delta |
|---|---:|---:|---|
| Summary cold | 778 ms | 640 ms | **−17.7%** (faster) |
| Summary warm | 17 ms | 8 ms (median) | **−9 ms** (faster) |

Atlas latency and auth-cache warmth vary between runs; treat as directional, not strict regression proof.

---

## 4. Measurable Regression

**None detected.**

- Warm summary median **8 ms** (threshold: >50 ms) — pass
- Warm speedup **80×** (threshold: <5×) — pass
- Parallel cold wall **579 ms** vs sequential sum **2691 ms** (ratio 0.22, threshold: >2× duplicate Mongo) — pass
- Controller → metrics: warm requests show **3–21 ms** HTTP total with handler skipped on cache HIT — no extraction overhead observable

---

## 5. Cache HIT/MISS Observations

From server logs during main benchmark suite:

- **6 MISS** — one per endpoint on first request
- **42 HIT memory** — all warm repeats and parallel warm load
- **0 HIT redis** — Redis not configured (expected)
- **Cold concurrent sales-trend:** 1 MISS + 2 **HIT inflight** — HTTP inflight coalescing confirmed

Tenant cache keys include `tenant:default:` prefix with route + query params (e.g. `tenant:default:/api/v1/dashboard/summary?scope=full&tenantId=default`).

---

## 6. DB Query / Timing Observations

Cold handler timings from `[timing]` logs (Mongo-bound, unchanged by metrics layer):

| Handler | DB/handler total | Dominant legs |
|---|---:|---|
| summary | 377 ms | Parallel KPI aggs ~275–284 ms each |
| sales-trend | 451 ms | Loader + chart bucketing |
| revenue-trend | 419 ms | Loader + chart bucketing |
| top-products | 265 ms | Top-line aggregations |
| recent-invoices | 262 ms | Invoice find + customer lookup |
| business-alerts | 572 ms | Multiple alert category queries |

Warm cache HIT requests skip handlers entirely (HTTP 3–21 ms). No duplicate Mongo reads observed in parallel cold load.

---

## 7. API Request Count

| Category | Count |
|---|---:|
| Per-endpoint (cold + 5 warm × 6) | 36 |
| Parallel loads (cold + warm × 6) | 12 |
| Concurrent sales-trend (warm) | 3 |
| Cold concurrent sales-trend (separate run) | 3 |
| **Total measured** | **54** |

Full dashboard cold load = **6 API requests** (parallel).

---

## 8. Build / Test Results

| Check | Result |
|---|---|
| `npm run lint` (tsc) | PASS |
| `npx vitest run --project unit` | **98/98 PASS** |
| Dashboard-related unit tests | PASS (`responseCache`, `dashboardMetrics`, `salesMetrics`, `dashboardDateRange`, tenant/RBAC) |
| `npm run build` | PASS |
| Frontend files changed | **0** |

---

## 9. Safe to Proceed to Phase 6?

**Yes.** Performance is stable post-Phases 1–4:

- HTTP cache (60s) and inflight coalescing intact
- Warm dashboard summary faster than historical reference (~8 ms vs ~17 ms)
- Metrics extraction adds no measurable handler overhead
- Payload shapes valid for all 6 endpoints
- Tenant-scoped cache keys confirmed in logs and unit tests

---

## 10. Files Changed

| File | Type |
|---|---|
| `scripts/run-phase5-dashboard-perf.mjs` | New benchmark harness |
| `docs/phase5-dashboard-perf-results.json` | New baseline data |
| `docs/phase5-dashboard-perf-report.md` | This report |
| `docs/phase5-server-cold2.log` | Server log (cold coalescing run) |

**Production code (controllers, middleware, metrics, loader, cache): 0 files changed.**
