/**
 * Phase 5 — Dashboard API performance benchmark (no browser).
 *
 * Prerequisites:
 *   1. Backend running with PERF_TRACE=1 (capture stdout for [cache]/[timing] logs):
 *        cd toys_factory_erp_backend
 *        PERF_TRACE=1 npm run dev 2>&1 | tee /tmp/phase5-server.log
 *   2. Optional cold-start suite: restart server before `--cold-start` mode.
 *
 * Usage:
 *   node scripts/run-phase5-dashboard-perf.mjs
 *   API_BASE=http://localhost:5000 node scripts/run-phase5-dashboard-perf.mjs --cold-start
 *   SERVER_LOG=/tmp/phase5-server.log node scripts/run-phase5-dashboard-perf.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_BASE = process.env.API_BASE ?? 'http://localhost:5000';
const EMAIL = process.env.DASHBOARD_EMAIL ?? 'admin@toysfactory.com';
const PASSWORD = process.env.DASHBOARD_PASSWORD ?? 'password123';
const SERVER_LOG = process.env.SERVER_LOG ?? '';
const WARM_RUNS = Number(process.env.WARM_RUNS ?? 5);
const COLD_START = process.argv.includes('--cold-start');

const ENDPOINTS = [
  { id: 'summary', path: '/api/v1/dashboard/summary?scope=full' },
  { id: 'sales-trend', path: '/api/v1/dashboard/sales-trend?range=month' },
  { id: 'revenue-trend', path: '/api/v1/dashboard/revenue-trend?range=month' },
  { id: 'top-products', path: '/api/v1/dashboard/top-products?limit=5' },
  { id: 'recent-invoices', path: '/api/v1/dashboard/recent-invoices?limit=5' },
  { id: 'business-alerts', path: '/api/v1/dashboard/business-alerts' },
];

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stats(values) {
  if (!values.length) return { min: 0, max: 0, median: 0, mean: 0 };
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    median: median(values),
    mean: Math.round((sum / values.length) * 10) / 10,
  };
}

function parsePerfTrace(header) {
  if (!header) return {};
  const legs = {};
  for (const part of header.split(' ')) {
    const [k, v] = part.split('=');
    if (k && v) legs[k] = Number.parseInt(v.replace('ms', ''), 10);
  }
  return legs;
}

async function login() {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const cookies = res.headers.getSetCookie?.() ?? [];
  const raw = res.headers.get('set-cookie');
  const list = cookies.length ? cookies : raw ? [raw] : [];
  const token = list.find((c) => c.startsWith('token='));
  if (!token) {
    const body = await res.text().catch(() => '');
    throw new Error(`Login failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return token.split(';')[0];
}

async function timedGet(cookie, path) {
  const started = Date.now();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Cookie: cookie },
  });
  const durationMs = Date.now() - started;
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return {
    status: res.status,
    ok: res.ok,
    durationMs,
    perfTrace: res.headers.get('x-perf-trace'),
    perfTraceLegs: parsePerfTrace(res.headers.get('x-perf-trace')),
    bodyBytes: text.length,
    json,
  };
}

function verifyPayloadShape(endpointId, json) {
  const issues = [];
  if (!json || json.success !== true) {
    issues.push('missing success:true envelope');
    return { valid: false, issues };
  }
  const data = json.data;

  switch (endpointId) {
    case 'summary': {
      const keys = [
        'monthRevenue', 'monthSalesCount', 'pendingSales', 'openLeadsCount',
        'customerDue', 'pendingProduction', 'lowStock', 'salesSummary', 'totalInventoryValue',
      ];
      for (const k of keys) {
        if (!(k in data)) issues.push(`summary missing key: ${k}`);
      }
      break;
    }
    case 'sales-trend':
    case 'revenue-trend':
      if (!Array.isArray(data)) issues.push('trend data not array');
      else if (data.length > 0) {
        const pt = data[0];
        if (!('key' in pt && 'value' in pt && 'label' in pt)) issues.push('trend point missing key/value/label');
      }
      break;
    case 'top-products':
    case 'recent-invoices':
      if (!Array.isArray(data)) issues.push(`${endpointId} data not array`);
      break;
    case 'business-alerts':
      if (!data || typeof data !== 'object') issues.push('business-alerts data not object');
      break;
    default:
      break;
  }

  return { valid: issues.length === 0, issues };
}

function parseServerLog(logPath) {
  if (!logPath || !existsSync(logPath)) {
    return { available: false, cacheEvents: [], timingEvents: [] };
  }
  const text = readFileSync(logPath, 'utf8');
  const cacheEvents = [];
  const timingEvents = [];
  for (const line of text.split('\n')) {
    if (line.includes('[cache]')) {
      const m = line.match(/\[cache\] (HIT \w+|MISS) GET tenant:([^\s]+)/);
      if (m) cacheEvents.push({ type: m[1], tenant: m[2], raw: line.trim() });
    }
    if (line.includes('[timing] GET /dashboard/') || line.includes('[timing] GET /api/v1/dashboard/')) {
      timingEvents.push(line.trim());
    }
  }
  return { available: true, cacheEvents, timingEvents, cacheHits: cacheEvents.filter((e) => e.type.startsWith('HIT')).length, cacheMisses: cacheEvents.filter((e) => e.type === 'MISS').length };
}

async function fetchHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return await res.json();
  } catch {
    return null;
  }
}

async function benchmarkEndpoint(cookie, endpoint) {
  const cold = await timedGet(cookie, endpoint.path);
  const warm = [];
  for (let i = 0; i < WARM_RUNS; i += 1) {
    warm.push(await timedGet(cookie, endpoint.path));
  }
  const warmMs = warm.map((r) => r.durationMs);
  const shape = verifyPayloadShape(endpoint.id, cold.json);
  return {
    id: endpoint.id,
    path: endpoint.path,
    cold: {
      durationMs: cold.durationMs,
      perfTrace: cold.perfTrace,
      perfTraceLegs: cold.perfTraceLegs,
      bodyBytes: cold.bodyBytes,
      status: cold.status,
    },
    warm: {
      runs: warmMs,
      ...stats(warmMs),
    },
    speedupRatio: cold.durationMs > 0
      ? Math.round((cold.durationMs / (median(warmMs) || 1)) * 10) / 10
      : 0,
    payloadShape: shape,
  };
}

async function parallelDashboardLoad(cookie) {
  const started = Date.now();
  const results = await Promise.all(
    ENDPOINTS.map(async (ep) => {
      const r = await timedGet(cookie, ep.path);
      return { id: ep.id, durationMs: r.durationMs, status: r.status };
    }),
  );
  return {
    totalWallMs: Date.now() - started,
    requestCount: results.length,
    endpoints: results,
  };
}

async function concurrentSalesTrend(cookie, concurrency = 3) {
  const path = '/api/v1/dashboard/sales-trend?range=month';
  const started = Date.now();
  const results = await Promise.all(
    Array.from({ length: concurrency }, () => timedGet(cookie, path)),
  );
  return {
    concurrency,
    totalWallMs: Date.now() - started,
    perRequestMs: results.map((r) => r.durationMs),
    ...stats(results.map((r) => r.durationMs)),
  };
}

async function main() {
  const health = await fetchHealth();
  if (!health) {
    throw new Error(`Backend not reachable at ${API_BASE}/health — start server first`);
  }

  const cookie = await login();
  const endpointResults = [];

  for (const ep of ENDPOINTS) {
    endpointResults.push(await benchmarkEndpoint(cookie, ep));
  }

  const parallelCold = await parallelDashboardLoad(cookie);
  const parallelWarm = await parallelDashboardLoad(cookie);

  const concurrentTrend = await concurrentSalesTrend(cookie, 3);

  const sequentialColdSum = endpointResults.reduce((s, r) => s + r.cold.durationMs, 0);
  const logAnalysis = parseServerLog(SERVER_LOG);

  const historicalReference = {
    source: 'web/docs/final-erp-performance-report.json (2026-08-18)',
    dashboardSummaryColdMs: 778,
    dashboardSummaryWarmMs: 17,
    note: 'Pre-Phase-1-4 reference only; not a direct apples-to-apples comparison',
  };

  const summaryResult = endpointResults.find((r) => r.id === 'summary');

  const report = {
    phase: 5,
    measuredAt: new Date().toISOString(),
    apiBase: API_BASE,
    environment: {
      coldStartMode: COLD_START,
      warmRunsPerEndpoint: WARM_RUNS,
      serverLog: SERVER_LOG || null,
      health: health?.data ?? health,
      redis: health?.data?.redis ?? 'unknown',
      database: health?.data?.database ?? 'unknown',
    },
    historicalReference,
    comparisonToReference: summaryResult ? {
      summaryColdMs: summaryResult.cold.durationMs,
      summaryWarmMedianMs: summaryResult.warm.median,
      referenceColdMs: historicalReference.dashboardSummaryColdMs,
      referenceWarmMs: historicalReference.dashboardSummaryWarmMs,
      coldDeltaPct: Math.round(((summaryResult.cold.durationMs - historicalReference.dashboardSummaryColdMs) / historicalReference.dashboardSummaryColdMs) * 1000) / 10,
      warmDeltaMs: summaryResult.warm.median - historicalReference.dashboardSummaryWarmMs,
      warmRegressionThresholdMs: 50,
      warmWithinThreshold: summaryResult.warm.median <= 50,
    } : null,
    endpoints: endpointResults,
    parallelLoad: {
      cold: parallelCold,
      warm: parallelWarm,
      sequentialColdSumMs: sequentialColdSum,
      parallelVsSequentialRatio: sequentialColdSum > 0
        ? Math.round((parallelCold.totalWallMs / sequentialColdSum) * 100) / 100
        : null,
    },
    concurrentSalesTrend: concurrentTrend,
    serverLogAnalysis: logAnalysis,
    payloadVerification: {
      allValid: endpointResults.every((r) => r.payloadShape.valid),
      details: endpointResults.map((r) => ({ id: r.id, ...r.payloadShape })),
    },
    apiRequestCounts: {
      perEndpointColdPlusWarm: ENDPOINTS.length * (1 + WARM_RUNS),
      parallelLoads: 2 * ENDPOINTS.length,
      concurrentSalesTrend: 3,
      totalHttpRequests: ENDPOINTS.length * (1 + WARM_RUNS) + 2 * ENDPOINTS.length + 3,
    },
    regressionAssessment: {
      warmSummaryOverThreshold: summaryResult ? summaryResult.warm.median > 50 : null,
      warmSpeedupBelow5x: summaryResult ? summaryResult.speedupRatio < 5 : null,
      parallelDuplicateMongoSuspected: parallelCold.totalWallMs > sequentialColdSum * 2,
      measurableRegressionDetected: false,
    },
  };

  report.regressionAssessment.measurableRegressionDetected =
    report.regressionAssessment.warmSummaryOverThreshold === true
    || report.regressionAssessment.warmSpeedupBelow5x === true
    || report.regressionAssessment.parallelDuplicateMongoSuspected === true;

  const outPath = join(__dirname, '../docs/phase5-dashboard-perf-results.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
