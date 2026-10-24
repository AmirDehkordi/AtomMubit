import type { ExtractionFactV2, EvidenceSpanV2, FactCheckV2 } from '@desk/shared';
import type { PreparedSection } from './preparation';
export interface ReferenceFact {
  value: number; currency: string; unit: string; basis: string; periodEnd: string; months: number;
  method?: 'reported' | 'derived' | 'computed';
}
export interface VerifiedFact {
  fact: ExtractionFactV2; span: EvidenceSpanV2 | null; checks: FactCheckV2[];
  normalized: { value: number | null; range: { low: number; high: number } | null; currency: 'USD'; scale: 'millions'; unit: 'USD' } | null;
  supported: boolean;
}
const scaleFactors = { units: 1, thousands: 1e3, millions: 1e6, billions: 1e9 };
export function evidenceSpan(content: string, quote: string, occurrence = 0): EvidenceSpanV2 | null {
  if (!quote) return null;
  let start = -1;
  for (let i = 0; i <= occurrence; i++) { start = content.indexOf(quote, start + 1); if (start < 0) return null; }
  return { start, end: start + quote.length, offsetUnit: 'utf16' };
}
export function quoteHasNumber(quote: string, value: number): boolean {
  const values = quote.match(/\(?[−-]?\s*\$?\s*\d[\d,]*(?:\.\d+)?\s*\)?/g) ?? [];
  return values.some((token) => {
    const parsed = Number(token.replace(/[^\d.]/g, '')) * (/[−-]|\(/.test(token) ? -1 : 1);
    return parsed === value;
  });
}
function dateValid(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function sourceHasDate(text: string, value: string): boolean {
  if (!dateValid(value)) return false;
  if (text.includes(value)) return true;
  const date = new Date(value + 'T00:00:00Z');
  const month = date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  return new RegExp(`\\b${month}\\s+${date.getUTCDate()}(?:,)?\\s+${date.getUTCFullYear()}\\b`, 'i').test(text)
    || new RegExp(`\\b${month.slice(0, 3)}\\.?\\s+${date.getUTCDate()}(?:,)?\\s+${date.getUTCFullYear()}\\b`, 'i').test(text);
}
function periodCheck(fact: ExtractionFactV2, content: string): FactCheckV2 {
  if (fact.missingReason) return { verifier: 'period', outcome: 'not-applicable', detail: 'Missing observation has no asserted period' };
  if (!fact.period) return { verifier: 'period', outcome: 'fail', detail: 'Numeric facts require the printed reporting period' };
  const period = fact.period;
  if (!dateValid(period.end) || (period.start !== null && !dateValid(period.start))) return { verifier: 'period', outcome: 'fail', detail: 'Invalid calendar date' };
  if (period.start) {
    const days = (Date.parse(period.end) - Date.parse(period.start)) / 86400000 + 1;
    if (Math.abs(days - period.months * 30.4375) > 17) return { verifier: 'period', outcome: 'fail', detail: 'Period start/end disagree with duration' };
    if (!sourceHasDate(content, period.start)) return { verifier: 'period', outcome: 'fail', detail: 'Period start is not supported by source dates' };
  }
  const durations: Record<number, RegExp> = { 3: /(?:three|3)[ -]months?|(?:thirteen|13)[ -]weeks?|quarter(?:ly| ended)/i,
    6: /(?:six|6)[ -]months?|(?:twenty.six|26)[ -]weeks?/i,
    9: /(?:nine|9)[ -]months?|(?:thirty.nine|39)[ -]weeks?/i,
    12: /(?:twelve|12)[ -]months?|(?:fifty.two|fifty.three|52|53)[ -]weeks?|year(?:s)? ended|full.year|annual/i };
  const reportingWindows: string[] = [];
  // Bind the date to an ended/ending reporting header. A publication date elsewhere
  // in the section cannot satisfy a reporting-period check (especially on 8-Ks).
  const headers = new RegExp(durations[period.months]!.source, 'gi');
  for (const match of content.matchAll(headers)) {
    const tail = content.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 240);
    if (/ended|ending/i.test(match[0])) reportingWindows.push(tail);
    else {
      const ended = /^\s*(?:period\s+)?(?:ended|ending)\b/i.exec(tail);
      if (ended) reportingWindows.push(tail.slice(ended[0].length));
    }
  }
  if (!reportingWindows.some((window) => sourceHasDate(window, period.end))) return { verifier: 'period', outcome: 'fail', detail: 'Reporting date and duration must be printed in the source; publication date alone is insufficient' };
  return { verifier: 'period', outcome: 'pass', detail: 'Source supports reporting date and duration; annual and cumulative observations retain their duration' };
}
export function normalizeUsd(fact: ExtractionFactV2): VerifiedFact['normalized'] {
  if (fact.missingReason || fact.currency !== 'USD' || fact.unit !== 'USD' || !fact.scale) return null;
  const factor = scaleFactors[fact.scale] / 1e6;
  return { value: fact.value === null ? null : fact.value * factor,
    range: fact.range ? { low: fact.range.low * factor, high: fact.range.high * factor } : null,
    currency: 'USD', scale: 'millions', unit: 'USD' };
}
export function verifyFact(fact: ExtractionFactV2, section: PreparedSection, reference?: ReferenceFact | null, occurrence = 0): VerifiedFact {
  const checks: FactCheckV2[] = [{ verifier: 'schema', outcome: 'pass', detail: 'Parsed strict v2 schema' }];
  const span = evidenceSpan(section.text, fact.quote, occurrence);
  const missing = fact.missingReason !== null;
  const shape = missing ? fact.value === null && fact.range === null : (fact.value !== null) !== (fact.range !== null);
  const numbers = fact.range ? [fact.range.low, fact.range.high] : fact.value === null ? [] : [fact.value];
  const numericSupport = numbers.every((number) => quoteHasNumber(fact.quote, number));
  const core = ['revenue', 'net_income', 'eps_diluted'].includes(fact.key);
  const epsScale = fact.key.startsWith('eps') || /\/share/.test(fact.unit ?? '');
  const unscaledUnit = epsScale || fact.unit === 'percent';
  const sourceScaled = /\b(?:thousand|million|billion)s?\b/i.test(section.text);
  const printedScale = fact.scale !== null && (unscaledUnit ? fact.scale === 'units'
    : fact.scale === 'units' ? !sourceScaled
    : new RegExp(`\\b${fact.scale.slice(0, -1)}s?\\b`, 'i').test(section.text));
  const basisSupported = !core || fact.basis === 'GAAP' && !/non[ -]?gaap|adjusted/i.test(fact.quote);
  const quotePass = shape && (missing || fact.unit !== null && fact.scale !== null) && (!fact.range || fact.range.low <= fact.range.high) && (missing || !!span && numericSupport && printedScale && basisSupported && (!epsScale || fact.scale === 'units'));
  checks.push({ verifier: 'quote', outcome: missing && shape ? 'not-applicable' : quotePass ? 'pass' : 'fail',
    detail: missing ? 'Missing observation is explicit, not an extracted value' : 'Checks exact quote, printed numbers/scale, range ordering and core GAAP basis; EPS must use units' });
  checks.push(periodCheck(fact, section.text));
  if (!reference || missing) checks.push({ verifier: 'xbrl', outcome: 'unknown', detail: 'No comparable reference fact available' });
  else if (!fact.period || reference.periodEnd !== fact.period.end || reference.months !== fact.period.months || reference.currency !== fact.currency || reference.basis !== fact.basis || reference.unit !== fact.unit || reference.method === 'derived' && epsScale) {
    checks.push({ verifier: 'xbrl', outcome: 'not-applicable', detail: 'Reference is not like-for-like; derived EPS is excluded' });
  } else if (fact.value !== null && fact.scale) {
    const raw = fact.value * scaleFactors[fact.scale];
    // Operational reconciliation tolerance, not a benchmark accuracy threshold.
    const rounding = scaleFactors[fact.scale] / 2;
    const tolerance = epsScale ? 0.01 : Math.max(Math.abs(reference.value) * 0.005, rounding);
    checks.push({ verifier: 'xbrl', outcome: Math.abs(raw - reference.value) <= tolerance ? 'pass' : 'fail', detail: 'Like-for-like reconciliation: 0.5% or printed half-unit rounding; EPS absolute 0.01' });
  } else checks.push({ verifier: 'xbrl', outcome: 'not-applicable', detail: 'Range or missing scale cannot reconcile to scalar reference' });
  checks.push({ verifier: 'arithmetic', outcome: 'unknown', detail: 'No independent comparable components supplied; no derived quarterly EPS' });
  return { fact, span, checks, normalized: normalizeUsd(fact), supported: !missing && quotePass && checks.every((check) => check.outcome !== 'fail') };
}
