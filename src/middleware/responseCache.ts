import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/apiResponse.js';
import { isRedisReady, redisDelByPattern, redisGet, redisSet } from '../lib/redisClient.js';
import { markPerfLeg } from './perfTrace.js';

type CacheEntry = {
  body: unknown;
  meta?: Record<string, unknown>;
  expiresAt: number;
};

type CacheKeyFn = (req: Request) => string;

type InflightHandle = {
  promise: Promise<CacheEntry>;
  abort: (reason?: Error) => void;
};

const store = new Map<string, CacheEntry>();
const REDIS_KEY_PREFIX = 'erp:cache:';

/** In-flight MISS coalescing — concurrent identical GETs share one backend query. */
const inflightMisses = new Map<string, Promise<CacheEntry>>();

function readMemory(key: string): CacheEntry | null {
  const hit = store.get(key);
  if (!hit || hit.expiresAt <= Date.now()) {
    if (hit) store.delete(key);
    return null;
  }
  return hit;
}

function writeMemory(key: string, entry: CacheEntry) {
  store.set(key, entry);
}

function redisPhysicalKey(logicalKey: string): string {
  return `${REDIS_KEY_PREFIX}${logicalKey}`;
}

function settleInflight(key: string) {
  inflightMisses.delete(key);
}

/** Tenant-safe logical cache key. */
export function buildTenantCacheKey(req: Request): string {
  const tenantId = String(req.query.tenantId ?? 'default');
  const path = req.path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  if (!params.has('tenantId')) params.set('tenantId', tenantId);
  const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const qs = sorted.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `tenant:${tenantId}:${path}${qs ? `?${qs}` : ''}`;
}

export function dashboardSummaryCacheKey(req: Request): string {
  const tenantId = String(req.query.tenantId ?? 'default');
  const scope = String(req.query.scope ?? 'full').toLowerCase();
  return `tenant:${tenantId}:/api/v1/dashboard/summary?scope=${encodeURIComponent(scope)}&tenantId=${encodeURIComponent(tenantId)}`;
}

export function dashboardTopProductsCacheKey(req: Request): string {
  const tenantId = String(req.query.tenantId ?? 'default');
  const limit = String(req.query.limit ?? '5');
  return `tenant:${tenantId}:/api/v1/dashboard/top-products?limit=${encodeURIComponent(limit)}&tenantId=${encodeURIComponent(tenantId)}`;
}

export function dashboardBusinessAlertsCacheKey(req: Request): string {
  const tenantId = String(req.query.tenantId ?? 'default');
  return `tenant:${tenantId}:/api/v1/dashboard/business-alerts?tenantId=${encodeURIComponent(tenantId)}`;
}

export function dashboardRecentInvoicesCacheKey(req: Request): string {
  const tenantId = String(req.query.tenantId ?? 'default');
  const limit = String(req.query.limit ?? '5');
  return `tenant:${tenantId}:/api/v1/dashboard/recent-invoices?limit=${encodeURIComponent(limit)}&tenantId=${encodeURIComponent(tenantId)}`;
}

export function dashboardSalesTrendCacheKey(req: Request): string {
  const tenantId = String(req.query.tenantId ?? 'default');
  const range = String(req.query.range ?? 'month').toLowerCase();
  return `tenant:${tenantId}:/api/v1/dashboard/sales-trend?range=${encodeURIComponent(range)}&tenantId=${encodeURIComponent(tenantId)}`;
}

export function dashboardRevenueTrendCacheKey(req: Request): string {
  const tenantId = String(req.query.tenantId ?? 'default');
  const range = String(req.query.range ?? 'month').toLowerCase();
  return `tenant:${tenantId}:/api/v1/dashboard/revenue-trend?range=${encodeURIComponent(range)}&tenantId=${encodeURIComponent(tenantId)}`;
}

function createInflightWaiter(key: string): InflightHandle {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  let rejectFn!: (err: Error) => void;

  const promise = new Promise<CacheEntry>((resolve, reject) => {
    rejectFn = reject;
    const start = Date.now();
    const poll = () => {
      if (settled) return;
      const hit = readMemory(key);
      if (hit) {
        settled = true;
        if (timer) clearTimeout(timer);
        settleInflight(key);
        resolve(hit);
        return;
      }
      if (Date.now() - start > 30_000) {
        settled = true;
        if (timer) clearTimeout(timer);
        settleInflight(key);
        reject(new Error('cache inflight timeout'));
        return;
      }
      timer = setTimeout(poll, 10);
    };
    poll();
  });

  promise.catch(() => undefined);

  return {
    promise,
    abort: (reason = new Error('cache inflight aborted')) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      settleInflight(key);
      rejectFn(reason);
    },
  };
}

function attachCacheWriter(
  res: Response,
  key: string,
  ttlMs: number,
  inflight?: InflightHandle,
) {
  let cacheWritten = false;
  const finalizeMiss = () => {
    if (cacheWritten || !inflight) return;
    inflight.abort(new Error('cache inflight aborted'));
  };

  const originalJson = res.json.bind(res);
  res.json = ((payload: { success?: boolean; data?: unknown; meta?: Record<string, unknown> }) => {
    if (payload?.success !== false && payload?.data !== undefined) {
      const entry: CacheEntry = {
        body: payload.data,
        meta: payload.meta,
        expiresAt: Date.now() + ttlMs,
      };
      writeMemory(key, entry);
      if (isRedisReady()) {
        void redisSet(redisPhysicalKey(key), JSON.stringify(entry), ttlMs);
      }
      cacheWritten = true;
      settleInflight(key);
    } else if (inflight) {
      finalizeMiss();
    }
    return originalJson(payload);
  }) as typeof res.json;

  res.on('finish', finalizeMiss);
  res.on('close', finalizeMiss);
}

/** GET cache — Redis when REDIS_URL is set, otherwise in-memory. */
export function cacheGetResponse(ttlMs: number, keyFn: CacheKeyFn = buildTenantCacheKey) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') return next();

    const key = keyFn(req);
    const memoryHit = readMemory(key);
    if (memoryHit) {
      console.log(`[cache] HIT memory ${req.method} ${key}`);
      return sendSuccess(res, memoryHit.body, memoryHit.meta);
    }

    if (isRedisReady()) {
      try {
        const redisStart = Date.now();
        const raw = await redisGet(redisPhysicalKey(key));
        if (req.perfTrace) markPerfLeg(req, 'redis', Date.now() - redisStart);
        if (res.headersSent) return;
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as CacheEntry;
            if (parsed.expiresAt > Date.now()) {
              writeMemory(key, parsed);
              console.log(`[cache] HIT redis ${req.method} ${key}`);
              return sendSuccess(res, parsed.body, parsed.meta);
            }
          } catch {
            /* fall through to miss */
          }
        }
      } catch {
        /* fall through to miss */
      }
    }

    const existingInflight = inflightMisses.get(key);
    if (existingInflight) {
      try {
        const entry = await existingInflight;
        if (!res.headersSent && entry.expiresAt > Date.now()) {
          console.log(`[cache] HIT inflight ${req.method} ${key}`);
          return sendSuccess(res, entry.body, entry.meta);
        }
      } catch {
        /* fall through to new miss */
      }
    }

    if (res.headersSent) return;

    const inflight = createInflightWaiter(key);
    inflightMisses.set(key, inflight.promise);

    console.log(`[cache] MISS ${req.method} ${key}`);
    attachCacheWriter(res, key, ttlMs, inflight);
    next();
  };
}

export function clearResponseCache(prefix?: string) {
  if (!prefix) {
    store.clear();
    inflightMisses.clear();
    void redisDelByPattern(`${REDIS_KEY_PREFIX}*`);
    return;
  }
  for (const key of store.keys()) {
    if (key.includes(prefix)) store.delete(key);
  }
  for (const key of inflightMisses.keys()) {
    if (key.includes(prefix)) inflightMisses.delete(key);
  }
  void redisDelByPattern(`${REDIS_KEY_PREFIX}*${prefix}*`);
}
