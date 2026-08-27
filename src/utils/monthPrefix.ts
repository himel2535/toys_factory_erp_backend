import { getBusinessMonthPrefix } from './businessDate.js';

/** Business calendar YYYY-MM (Asia/Dhaka). */
export function currentMonthPrefix(now = new Date()): string {
  return getBusinessMonthPrefix(now);
}

/** Inclusive prefix range for YYYY-MM or YYYY-MM-DD string dates (index-friendly vs $regex). */
export function monthPrefixRange(prefix: string): { $gte: string; $lt: string } {
  const [yearRaw, monthRaw] = prefix.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return {
    $gte: prefix,
    $lt: `${nextYear}-${String(nextMonth).padStart(2, '0')}`,
  };
}

export function invoiceMonthMatch(tenantId: string, prefix: string) {
  const range = monthPrefixRange(prefix);
  return {
    tenantId,
    status: { $nin: ['cancelled', 'draft'] },
    $or: [{ issueDate: range }, { date: range }],
  };
}
