import {
  Product,
  RawMaterial,
  SemiFinishedProduct,
  FinishedGood,
} from '../models/index.js';
import {
  productLowStockFilter,
  rawMaterialLowStockFilter,
  quantityMinStockLowStockFilter,
} from './lowStockMongo.js';
import { timeNamed } from './timing.js';

type TenantFilter = { tenantId: string };
type Legs = Record<string, number>;

/** Shared low-stock count across dashboard summary and alerts. */
export async function countLowStockItems(filter: TenantFilter, legs?: Legs): Promise<number> {
  const timed = <T>(name: string, fn: () => Promise<T>) =>
    legs ? timeNamed(name, fn, legs) : fn();

  const [products, rm, sf, fg] = await Promise.all([
    timed('lowStockProducts', () => Product.countDocuments({ ...filter, ...productLowStockFilter() })),
    timed('lowStockRm', () => RawMaterial.countDocuments({ ...filter, ...rawMaterialLowStockFilter() })),
    timed('lowStockSf', () => SemiFinishedProduct.countDocuments({ ...filter, ...quantityMinStockLowStockFilter() })),
    timed('lowStockFg', () => FinishedGood.countDocuments({ ...filter, ...quantityMinStockLowStockFilter() })),
  ]);

  return products + rm + sf + fg;
}
