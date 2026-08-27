/** Authoritative Asia/Dhaka business-date calculations for the ERP backend. */

export const BUSINESS_TIMEZONE = 'Asia/Dhaka';
export const BUSINESS_LOCALE = 'en-US';

export type BusinessDateParts = { year: number; month: number; day: number };

const ISO_DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function getBusinessDateParts(at: Date = new Date()): BusinessDateParts {
  const parts = new Intl.DateTimeFormat(BUSINESS_LOCALE, {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(at);
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

export function businessDateKeyFromParts(parts: BusinessDateParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function getBusinessMonthKeyFromParts(parts: Pick<BusinessDateParts, 'year' | 'month'>): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
}

export function getBusinessTodayIso(at: Date = new Date()): string {
  return businessDateKeyFromParts(getBusinessDateParts(at));
}

export function getBusinessMonthPrefix(at: Date = new Date()): string {
  const parts = getBusinessDateParts(at);
  return getBusinessMonthKeyFromParts(parts);
}

export function addBusinessDays(parts: BusinessDateParts, delta: number): BusinessDateParts {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day + delta, 12, 0, 0);
  return getBusinessDateParts(new Date(utc));
}

export function addBusinessMonths(parts: BusinessDateParts, delta: number): BusinessDateParts {
  const utc = Date.UTC(parts.year, parts.month - 1 + delta, 1, 12, 0, 0);
  return getBusinessDateParts(new Date(utc));
}

/** Monday of the week containing the given business calendar day. */
export function getBusinessMondayParts(parts: BusinessDateParts): BusinessDateParts {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0);
  const d = new Date(utc);
  const dow = d.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  return addBusinessDays(parts, diff);
}

/** Convert instant or stored YYYY-MM-DD string to business date key. */
export function toBusinessDateKey(value: Date | string): string {
  if (typeof value === 'string') {
    const slice = value.slice(0, 10);
    if (ISO_DATE_KEY.test(slice)) return slice;
    if (!value.trim()) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return businessDateKeyFromParts(getBusinessDateParts(parsed));
  }
  if (Number.isNaN(value.getTime())) return '';
  return businessDateKeyFromParts(getBusinessDateParts(value));
}

export function parseStoredBusinessDateKey(value: unknown): string | null {
  if (!value) return null;
  const slice = String(value).slice(0, 10);
  return ISO_DATE_KEY.test(slice) ? slice : null;
}

/** Noon UTC anchor for stable calendar formatting. */
export function businessNoonUtcDate(parts: BusinessDateParts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
}

export function formatBusinessDayLabel(parts: BusinessDateParts): string {
  return businessNoonUtcDate(parts).toLocaleDateString(BUSINESS_LOCALE, {
    timeZone: BUSINESS_TIMEZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function formatBusinessShortDay(parts: BusinessDateParts): string {
  return businessNoonUtcDate(parts).toLocaleDateString(BUSINESS_LOCALE, {
    timeZone: BUSINESS_TIMEZONE,
    day: 'numeric',
    month: 'short',
  });
}

export function formatBusinessMonthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1, 12, 0, 0)).toLocaleDateString(BUSINESS_LOCALE, {
    timeZone: BUSINESS_TIMEZONE,
    month: 'short',
    year: '2-digit',
  });
}

export function formatBusinessRangeLabel(start: BusinessDateParts, end: BusinessDateParts): string {
  if (start.year === end.year && start.month === end.month && start.day === end.day) {
    return formatBusinessShortDay(start);
  }
  if (start.year === end.year && start.month === end.month) {
    const month = new Date(Date.UTC(start.year, start.month - 1, 1, 12, 0, 0)).toLocaleDateString(
      BUSINESS_LOCALE,
      { timeZone: BUSINESS_TIMEZONE, month: 'short' },
    );
    return `${start.day}–${end.day} ${month}`;
  }
  return `${formatBusinessShortDay(start)}–${formatBusinessShortDay(end)}`;
}

export function lastDayOfBusinessMonth(year: number, month: number): BusinessDateParts {
  const lastDay = new Date(Date.UTC(year, month, 0, 12, 0, 0));
  return getBusinessDateParts(lastDay);
}
