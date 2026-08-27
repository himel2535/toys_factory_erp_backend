import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  cacheGetResponse,
  clearResponseCache,
  dashboardBusinessAlertsCacheKey,
  dashboardRecentInvoicesCacheKey,
} from '../../src/middleware/responseCache.js';
import { sendSuccess } from '../../src/utils/apiResponse.js';

function mockRes() {
  const handlers: Record<string, Array<() => void>> = {};
  const res: {
    headersSent: boolean;
    statusCode: number;
    status: (code: number) => typeof res;
    json: (payload: unknown) => typeof res;
    on: (event: string, handler: () => void) => typeof res;
    emit: (event: string) => void;
  } = {
    headersSent: false,
    statusCode: 200,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(_payload: unknown) {
      return res;
    },
    on(event: string, handler: () => void) {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(handler);
      return res;
    },
    emit(event: string) {
      for (const handler of handlers[event] ?? []) handler();
    },
  };
  return res;
}

describe('cacheGetResponse dashboard routes', () => {
  beforeEach(() => {
    clearResponseCache();
  });

  it('returns MISS then HIT memory on identical GET within TTL', async () => {
    const middleware = cacheGetResponse(60_000, dashboardRecentInvoicesCacheKey);
    const req = {
      method: 'GET',
      tenantId: 'default',
      query: { tenantId: 'default', limit: '5' },
      path: '/api/v1/dashboard/recent-invoices',
    };

    let handlerRuns = 0;

    const res1 = mockRes();
    let missNext = false;
    await middleware(req as never, res1 as never, () => {
      missNext = true;
    });
    expect(missNext).toBe(true);
    handlerRuns += 1;
    sendSuccess(res1 as never, [{ id: 'INV-1' }]);
    res1.emit('finish');

    const res2 = mockRes();
    let hitNext = false;
    await middleware(req as never, res2 as never, () => {
      hitNext = true;
    });
    expect(hitNext).toBe(false);
    expect(handlerRuns).toBe(1);
    expect(res2.statusCode).toBe(200);
  });

  it(
    'aborts inflight waiter when response finishes without cache write',
    async () => {
      vi.useFakeTimers();
      try {
        const middleware = cacheGetResponse(60_000, dashboardBusinessAlertsCacheKey);
        const req = {
          method: 'GET',
          tenantId: 'default',
          query: { tenantId: 'default' },
          path: '/api/v1/dashboard/business-alerts',
        };

        const res = mockRes();
        let missNext = false;
        await middleware(req as never, res as never, () => {
          missNext = true;
        });
        expect(missNext).toBe(true);

        res.status(500).json({ success: false, error: 'handler failed' });
        res.emit('finish');

        const res2 = mockRes();
        let secondMissNext = false;
        await middleware(req as never, res2 as never, () => {
          secondMissNext = true;
        });
        expect(secondMissNext).toBe(true);

        vi.advanceTimersByTime(35_000);
      } finally {
        vi.useRealTimers();
      }
    },
    10_000,
  );
});
