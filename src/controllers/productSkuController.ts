import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { reserveNextProductSku } from '../utils/productSkuSequence.js';

import { getRequestTenantId } from '../utils/tenantContext.js';

export const getNextProductSku = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getRequestTenantId(req);
  const sku = await reserveNextProductSku(tenantId);
  sendSuccess(res, { sku });
});
