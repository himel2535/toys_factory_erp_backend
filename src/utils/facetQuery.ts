import type { Model, PipelineStage } from 'mongoose';

type FacetResult = {
  count: number;
  docs: Array<Record<string, unknown>>;
};

/** Mongoose select strings → MongoDB $project object ({ field: 1 }). */
export function normalizeAggregationProjection(
  projection: Record<string, 0 | 1> | string,
): Record<string, 0 | 1> {
  if (typeof projection !== 'string') return projection;
  const fields = projection.trim().split(/\s+/).filter(Boolean);
  const out: Record<string, 0 | 1> = {};
  for (const field of fields) {
    out[field] = 1;
  }
  return out;
}

/** Single round trip: total count + capped preview rows. */
export async function facetCountAndFind(
  model: Model<unknown>,
  filter: Record<string, unknown>,
  itemLimit: number,
  projection?: Record<string, 0 | 1> | string,
): Promise<FacetResult> {
  const pipeline: PipelineStage[] = [{ $match: filter }];
  if (projection) {
    pipeline.push({ $project: normalizeAggregationProjection(projection) });
  }
  pipeline.push({
    $facet: {
      count: [{ $count: 'n' }],
      items: [{ $limit: itemLimit }],
    },
  });

  const [result] = await model.aggregate(pipeline);
  const count = Number(result?.count?.[0]?.n ?? 0);
  const docs = (result?.items ?? []) as Array<Record<string, unknown>>;
  return { count, docs };
}

/** Low-stock preview + count from find only (count = items when under cap). */
export async function findLowStockPreview(
  model: Model<unknown>,
  filter: Record<string, unknown>,
  projection: string,
  itemLimit: number,
): Promise<FacetResult> {
  const docs = (await model.find(filter).select(projection).limit(itemLimit).lean()) as Array<
    Record<string, unknown>
  >;
  return { count: docs.length, docs };
}
