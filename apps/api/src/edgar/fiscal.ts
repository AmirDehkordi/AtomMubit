import type { FiscalPeriod } from '@desk/shared';

// Fiscal calendar maths. Pure functions, no I/O.
//
// Companies label quarters on their own fiscal year, which is named after the
// calendar year it ends in: NVIDIA's year ending 25 Jan 2026 is FY2026, so its
// quarter ending 26 Jul 2026 is Q2 FY2027. Many companies use 52/53-week years
// that end on a weekday near a date (the last Sunday of January), so the
// fiscal-year-end date from the SEC is treated as approximate (±21 days).

const DAY_MS = 24 * 60 * 60 * 1000;
const FYE_TOLERANCE_DAYS = 21;

export function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toDate(toIso).getTime() - toDate(fromIso).getTime()) / DAY_MS);
}

/** "0125" (the SEC submissions format) → month and day. */
export function parseFiscalYearEnd(mmdd: string): { month: number; day: number } {
  const month = Number(mmdd.slice(0, 2));
  const day = Number(mmdd.slice(2, 4));
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) {
    throw new Error(`Bad fiscal year end "${mmdd}"`);
  }
  return { month, day };
}

function fiscalYearEndDate(year: number, fye: { month: number; day: number }): Date {
  const lastDay = new Date(Date.UTC(year, fye.month, 0)).getUTCDate();
  return new Date(Date.UTC(year, fye.month - 1, Math.min(fye.day, lastDay)));
}

export interface FiscalLabel {
  fiscalYear: number;
  /** 1–4. A 10-K's period is quarter 4. */
  quarter: 1 | 2 | 3 | 4;
}

/** Which fiscal year and quarter a period ending on `periodEnd` belongs to. */
export function fiscalLabel(periodEnd: string, fiscalYearEnd: string): FiscalLabel {
  const fye = parseFiscalYearEnd(fiscalYearEnd);
  const end = toDate(periodEnd).getTime();
  const earliest = end - FYE_TOLERANCE_DAYS * DAY_MS;

  let fiscalYear = toDate(periodEnd).getUTCFullYear() - 1;
  while (fiscalYearEndDate(fiscalYear, fye).getTime() < earliest) fiscalYear++;

  const previousEnd = fiscalYearEndDate(fiscalYear - 1, fye).getTime();
  const months = (end - previousEnd) / DAY_MS / (365.25 / 12);
  const quarter = Math.min(4, Math.max(1, Math.round(months / 3))) as FiscalLabel['quarter'];
  return { fiscalYear, quarter };
}

export function fiscalPeriodFor(form: string, label: FiscalLabel): FiscalPeriod {
  return form.startsWith('10-K') ? 'FY' : (`Q${label.quarter}` as FiscalPeriod);
}

/** "Q2 FY2027"; a 10-K's quarter shows as "Q4 FY2026". */
export function quarterName(label: FiscalLabel): string {
  return `Q${label.quarter} FY${label.fiscalYear}`;
}

/**
 * The quarter an earnings release (8-K Item 2.02) reports on: the last quarter
 * that ended at least a week before the release date. A February release from
 * NVIDIA reports Q4 of the year that ended in January, not Q1.
 */
export function releaseLabel(releaseDate: string, fiscalYearEnd: string): FiscalLabel {
  const fye = parseFiscalYearEnd(fiscalYearEnd);
  const latest = toDate(releaseDate).getTime() - 7 * DAY_MS;
  const year = toDate(releaseDate).getUTCFullYear();
  let best: Date | null = null;
  for (const y of [year - 1, year]) {
    for (let q = 0; q < 4; q++) {
      const end = fiscalYearEndDate(y, fye);
      const candidate = addMonths(end, 3 * q);
      if (candidate.getTime() <= latest && (!best || candidate > best)) best = candidate;
    }
  }
  return fiscalLabel(best!.toISOString().slice(0, 10), fiscalYearEnd);
}

function addMonths(d: Date, n: number): Date {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return target;
}

/** Two quarter ends are consecutive when 80–100 days apart (covers 13- and 14-week quarters). */
export function isNextQuarter(earlierEnd: string, laterEnd: string): boolean {
  const gap = daysBetween(earlierEnd, laterEnd);
  return gap >= 80 && gap <= 100;
}
