import { daysBetween } from '../edgar/fiscal';

// Turning XBRL facts into quarterly values. Pure functions, no I/O.
//
// 10-Qs report three-month figures, but cash-flow lines are year-to-date only,
// and there is no 10-Q for the fourth quarter: the 10-K reports the full year.
// So a quarter is either reported directly (an 80–100 day fact) or derived:
// the year-to-date figure ending on the quarter minus the year-to-date figure
// ending one quarter earlier with the same start date. Q4 = full year − nine months.

export interface Fact {
  start: string | null;
  end: string;
  val: number;
  accn: string;
  form: string;
  filed: string;
}

export interface Resolved {
  value: number;
  method: 'reported' | 'derived';
  accessions: string[];
  restated: boolean;
  note: string | null;
}

const isQuarterLong = (days: number) => days >= 80 && days <= 100;
const duration = (f: Fact) => (f.start ? daysBetween(f.start, f.end) : 0);
const months = (days: number) => Math.round(days / 30.44);
/** Drops floating-point noise from subtraction (1.7600000000000002 → 1.76). */
const clean = (n: number) => Number(n.toPrecision(12));

/**
 * The quarterly value of one concept for the quarter ending `periodEnd`, or null.
 * Among duplicate facts (the same period appears again as a comparative in
 * later filings) the original filing's value wins; a different later value
 * marks it restated.
 */
export function quarterFromFacts(facts: Fact[], periodEnd: string): Resolved | null {
  const endingHere = facts.filter((f) => f.end === periodEnd && f.start);

  const direct = endingHere.filter((f) => isQuarterLong(duration(f)));
  if (direct.length) {
    const { original, restated } = pickOriginal(direct);
    return { value: original.val, method: 'reported', accessions: [original.accn], restated, note: null };
  }

  // Longest year-to-date first, so Q4 comes from the full year when both exist.
  const cumulative = endingHere
    .filter((f) => duration(f) > 100)
    .sort((a, b) => duration(b) - duration(a));
  for (const ytd of uniqueByStart(cumulative)) {
    const earlier = facts.filter(
      (f) => f.start === ytd.start && f.end < periodEnd && isQuarterLong(daysBetween(f.end, periodEnd)),
    );
    if (!earlier.length) continue;
    const { original: a, restated: aRestated } = pickOriginal(
      facts.filter((f) => f.start === ytd.start && f.end === ytd.end),
    );
    const { original: b, restated: bRestated } = pickOriginal(earlier);
    return {
      value: clean(a.val - b.val),
      method: 'derived',
      accessions: [a.accn, b.accn],
      restated: aRestated || bRestated,
      note: `${months(duration(a))} months − ${months(duration(b))} months`,
    };
  }
  return null;
}

function pickOriginal(facts: Fact[]): { original: Fact; restated: boolean } {
  const sorted = [...facts].sort((a, b) => a.filed.localeCompare(b.filed));
  const original = sorted[0]!;
  const restated = sorted.some((f) => f.val !== original.val);
  return { original, restated };
}

function uniqueByStart(facts: Fact[]): Fact[] {
  const seen = new Set<string | null>();
  return facts.filter((f) => (seen.has(f.start) ? false : (seen.add(f.start), true)));
}
