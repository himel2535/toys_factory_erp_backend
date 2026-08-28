import type { ToolExecutionResult } from '../tools/types.js';
import { loadAiChatLimits } from './aiChatLimits.js';

type TrendPoint = {
  key?: string;
  date?: string;
  endDate?: string;
  label?: string;
  value?: number;
};

type TrendPayload = TrendPoint[] | { range?: string; points?: TrendPoint[] };

function compressTrendSeries(data: TrendPayload, rangeHint?: string) {
  const points = Array.isArray(data) ? data : (data.points ?? []);
  const range = Array.isArray(data) ? rangeHint : data.range ?? rangeHint;
  const normalized = points.map((point) => ({
    label: String(point.label ?? ''),
    value: Number(point.value ?? 0),
  }));
  const total = normalized.reduce((sum, point) => sum + point.value, 0);
  let peak = normalized[0] ?? { label: '', value: 0 };
  for (const point of normalized) {
    if (point.value >= peak.value) peak = point;
  }
  return {
    range: range ?? null,
    total,
    peak: { label: peak.label, value: peak.value },
    points: normalized,
  };
}

function truncateJson(payload: unknown, maxChars: number): unknown {
  const json = JSON.stringify(payload);
  if (json.length <= maxChars) return payload;
  return {
    truncated: true,
    preview: json.slice(0, Math.max(0, maxChars - 100)),
  };
}

export function compressToolResultForLlm(
  result: ToolExecutionResult,
  options: { range?: string; env?: NodeJS.ProcessEnv } = {},
): unknown {
  const env = options.env ?? process.env;
  const { maxToolResultChars } = loadAiChatLimits(env);

  if (!result.ok) {
    return truncateJson({ error: result.error }, maxToolResultChars);
  }

  const { toolName, data } = result;

  if (toolName === 'getTodaySales' || toolName === 'getLowStockCount') {
    return truncateJson(data, maxToolResultChars);
  }

  if (toolName === 'getDashboardSummary') {
    return truncateJson(data, maxToolResultChars);
  }

  if (toolName === 'getSalesTrend' || toolName === 'getRevenueTrend') {
    const compressed = compressTrendSeries(data as TrendPayload, options.range);
    return truncateJson(compressed, maxToolResultChars);
  }

  return truncateJson(data, maxToolResultChars);
}

export function toolResultContent(
  result: ToolExecutionResult,
  options: { range?: string; env?: NodeJS.ProcessEnv } = {},
): string {
  const payload = compressToolResultForLlm(result, options);
  return JSON.stringify(payload);
}
