import { countLowStockItems } from '../../utils/lowStockCount.js';
import type { MetricsContext, TimingLegs } from './types.js';

export async function getLowStockCount(
  { tenantId }: MetricsContext,
  legs?: TimingLegs,
): Promise<number> {
  return countLowStockItems({ tenantId }, legs);
}
