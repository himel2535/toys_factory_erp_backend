#!/usr/bin/env node
/**
 * Verify production API reachability (Railway + Vercel proxy).
 *
 * Usage:
 *   node scripts/verify-production-api.mjs
 *   RAILWAY_URL=https://your-service.up.railway.app node scripts/verify-production-api.mjs
 *   VERCEL_URL=https://toys-factory-erp-one.vercel.app node scripts/verify-production-api.mjs
 */

const RAILWAY_URL =
  process.env.RAILWAY_URL ?? 'https://toysfactoryerpbackend-production.up.railway.app';
const VERCEL_URL = process.env.VERCEL_URL ?? 'https://toys-factory-erp-one.vercel.app';

async function probe(label, url, init) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
    const text = await res.text();
    let snippet = text.slice(0, 160);
    try {
      snippet = JSON.stringify(JSON.parse(text)).slice(0, 160);
    } catch {
      // keep raw snippet
    }
    const ok =
      label.includes('health') ? res.status === 200 :
      label.includes('login') ? res.status === 200 || res.status === 401 :
      res.ok;
    console.log(`${ok ? 'OK' : 'FAIL'} ${label}: HTTP ${res.status} ${snippet}`);
    return { ok, status: res.status, body: text };
  } catch (error) {
    console.log(`FAIL ${label}: ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, status: 0, body: '' };
  }
}

console.log('=== Production API verification ===');
console.log(`Railway: ${RAILWAY_URL}`);
console.log(`Vercel:  ${VERCEL_URL}`);
console.log('');

const railwayHealth = await probe('Railway /health', `${RAILWAY_URL}/health`);
const railwayLogin = await probe('Railway POST /api/v1/auth/login', `${RAILWAY_URL}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@toysfactory.com', password: 'password123' }),
});
const vercelLogin = await probe('Vercel POST /api/v1/auth/login', `${VERCEL_URL}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@toysfactory.com', password: 'password123' }),
});

const railwayDead =
  railwayHealth.body.includes('Application not found') ||
  railwayLogin.body.includes('Application not found');

if (railwayDead) {
  console.log('');
  console.log('Diagnosis: Railway returns "Application not found" — service deleted or domain expired.');
  console.log('Fix: Railway dashboard → recreate/redeploy backend → set env vars → note public URL.');
  console.log('Then update Vercel NEXT_PUBLIC_API_URL + NEXT_PUBLIC_SOCKET_URL and redeploy frontend.');
  process.exit(1);
}

const allOk = railwayHealth.ok && railwayLogin.ok && vercelLogin.ok;
process.exit(allOk ? 0 : 1);
