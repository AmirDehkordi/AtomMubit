import { describe, expect, it, vi } from 'vitest';
import { SectionExtractionV2, type ExtractionFactV2 } from '@desk/shared';
import { ExtractionEngine, type EngineInput } from './engine';
import { prepareSections, cleanHtml } from './preparation';
import { evidenceSpan, normalizeUsd, quoteHasNumber, verifyFact } from './verification';
const content = '😀 Consolidated income statement (USD in millions, except per share data). Three months ended July 26, 2026.\n| Revenue | $ 96,221 |\n| Net income | (12,345) |\n| Diluted earnings per share | 2.46 |';
const input: EngineInput = { runId: 'run-1', documentId: 'doc-1', format: 'text', content };
const revenue = (overrides: Partial<ExtractionFactV2> = {}): ExtractionFactV2 => ({ key: 'revenue', label: 'Revenue', basis: 'GAAP', currency: 'USD',
  period: { start: null, end: '2026-07-26', months: 3, fiscalYear: 2027, fiscalPeriod: 'Q2' }, value: 96221, range: null,
  unit: 'USD', scale: 'millions', qualifier: null, missingReason: null, quote: '| Revenue | $ 96,221 |', ...overrides });
const output = (facts = [revenue()]) => ({ schemaVersion: '2' as const, blocks: [], facts });
const section = (text = content) => prepareSections({ ...input, content: text })[0]!;

describe('document preparation', () => {
  it('preserves table rows, decodes entities and drops executable/invisible content', () => {
    const text = cleanHtml('<html><head><title>noise</title></head><script>secret()</script><style>bad</style><ix:header>hidden</ix:header><h2>Item 2</h2><table><tr><th>Revenue</th><th>USD</th></tr><tr><td>&#128512; A &amp; B</td><td>(1,000)</td></tr></table></html>');
    expect(text).toContain('## Item 2'); expect(text).toContain('| 😀 A & B | (1,000) |');
    expect(text).not.toMatch(/secret|noise|hidden|bad/);
  });
  it('splits below 30k preserving surrogate pairs and page/source identity', () => {
    const sections = prepareSections({ ...input, content: '😀'.repeat(30_000) + '\fPage 2', sourceUrl: 'https://example.test/source' });
    expect(sections.length).toBeGreaterThan(3);
    for (const s of sections) { expect(s.text.length).toBeLessThan(30_000); expect(s.text).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/); expect(s.sourceUrl).toContain('example.test'); }
    expect(sections.at(-1)?.page).toBe(2);
  });
});
describe('source and numerical verification', () => {
  it('accepts a start date implied by the duration when the statement prints only the end', () => {
    // Real 10-Q tables print "Three months ended July 26, 2026", never the start date.
    const implied = revenue({ period: { start: '2026-04-27', end: '2026-07-26', months: 3, fiscalYear: 2027, fiscalPeriod: 'Q2' } });
    const period = verifyFact(implied, section()).checks.find((c) => c.verifier === 'period');
    expect(period?.outcome).toBe('pass');
    const wrong = revenue({ period: { start: '2026-01-26', end: '2026-07-26', months: 3, fiscalYear: 2027, fiscalPeriod: 'Q2' } });
    expect(verifyFact(wrong, section()).checks.find((c) => c.verifier === 'period')?.outcome).toBe('fail');
  });
  it('indexes repeated quotes in UTF-16 code units', () => {
    const text = '😀 amount 10; amount 10';
    expect(evidenceSpan(text, 'amount 10')).toEqual({ start: 3, end: 12, offsetUnit: 'utf16' });
    expect(evidenceSpan(text, 'amount 10', 1)?.start).toBe(14);
    expect(evidenceSpan(text, 'not present')).toBeNull();
  });
  it('requires an exact quote, printed numerical token and parentheses sign', () => {
    expect(quoteHasNumber('(12,345)', -12345)).toBe(true);
    expect(quoteHasNumber('96,221', 6221)).toBe(false);
    expect(verifyFact(revenue({ quote: '| Revenue | $96,221 |' }), section()).supported).toBe(false);
    expect(verifyFact(revenue({ value: 96222 }), section()).supported).toBe(false);
    expect(verifyFact(revenue({ scale: 'units' }), section()).supported).toBe(false);
    expect(verifyFact(revenue({ scale: null }), section()).supported).toBe(false);
  });
  it('normalizes only USD totals and never per-share or foreign currency', () => {
    expect(normalizeUsd(revenue({ scale: 'billions', value: 2.5 }))?.value).toBe(2500);
    expect(normalizeUsd(revenue({ scale: 'thousands', value: 2500 }))?.value).toBe(2.5);
    expect(normalizeUsd(revenue({ currency: 'EUR' }))).toBeNull();
    expect(normalizeUsd(revenue({ key: 'eps_diluted', unit: 'USD/share', scale: 'units', value: 2.46 }))).toBeNull();
    expect(normalizeUsd(revenue({ value: null, range: { low: 2, high: 3 }, scale: 'billions' }))?.range).toEqual({ low: 2000, high: 3000 });
  });
  it('keeps 6/9/12-month fiscal observations and rejects annual as quarterly', () => {
    for (const [months, word] of [[6, 'Six'], [9, 'Nine'], [12, 'Twelve']] as const) {
      const fact = revenue({ period: { start: null, end: '2026-07-26', months, fiscalYear: 2027, fiscalPeriod: months === 12 ? 'FY' : 'Q2' } });
      expect(verifyFact(fact, section(content.replace('Three', word))).supported).toBe(true);
    }
    expect(verifyFact(revenue(), section(content.replace('Three months', 'Year'))).supported).toBe(false);
  });
  it('rejects unsupported release dates and impossible source period intervals', () => {
    expect(verifyFact(revenue({ period: { start: null, end: '2026-08-26', months: 3, fiscalYear: 2027, fiscalPeriod: 'Q2' } }), section('Published August 26, 2026. ' + content)).supported).toBe(false);
    expect(verifyFact(revenue({ period: { start: '2026-01-01', end: '2026-07-26', months: 3, fiscalYear: 2027, fiscalPeriod: 'Q2' } }), section()).supported).toBe(false);
  });
  it('accepts explicitly printed from/to reporting ranges', () => {
    const fact = revenue({period:{start:'2026-04-27',end:'2026-07-26',months:3,fiscalYear:2027,fiscalPeriod:'Q2'}});
    expect(verifyFact(fact, section(content.replace('Three months ended July 26, 2026', 'Three months from April 27, 2026 to July 26, 2026'))).supported).toBe(true);
    expect(verifyFact(fact, section(content.replace('Three months ended July 26, 2026', 'Three months from 2026-04-27 through 2026-07-26'))).supported).toBe(true);
    expect(verifyFact(revenue(), section(content.replace('Three months ended July 26, 2026', 'Three months from April 27, 2026 to July 26, 2026'))).supported).toBe(true);
    expect(verifyFact(revenue(), section(content.replace('Three months ended July 26, 2026', 'Three months from January 1, 2026 to July 26, 2026'))).supported).toBe(false);
    expect(verifyFact(fact, section(content.replace('Three months ended July 26, 2026', 'Published July 26, 2026. Three months from April 27, 2026 to July 25, 2026'))).supported).toBe(false);
  });
  it('marks missing XBRL unknown and skips mismatched annual references', () => {
    const checked = verifyFact(revenue(), section());
    expect(checked.checks.find((c) => c.verifier === 'xbrl')?.outcome).toBe('unknown');
    expect(checked.supported).toBe(true);
    const mismatch = verifyFact(revenue(), section(), { value: 100, currency: 'USD', unit: 'USD', basis: 'GAAP', periodEnd: '2026-07-26', months: 12 });
    expect(mismatch.checks.find((c) => c.verifier === 'xbrl')?.outcome).toBe('not-applicable');
  });
  it('rejects scaled EPS and non-GAAP core facts', () => {
    const eps = revenue({ key: 'eps_diluted', value: 2.46, unit: 'USD/share', quote: '| Diluted earnings per share | 2.46 |' });
    expect(verifyFact(eps, section()).supported).toBe(false);
    expect(verifyFact({ ...eps, scale: 'units' }, section()).supported).toBe(true);
    expect(verifyFact(revenue({ basis: 'non-GAAP' }), section()).supported).toBe(false);
  });
});
describe('bounded extraction and audit', () => {
  it('enforces strict model schema', () => {
    expect(SectionExtractionV2.safeParse({ ...output(), surprise: true }).success).toBe(false);
    expect(SectionExtractionV2.safeParse(output([revenue({ period: { start: null, end: '2026-07-26', months: 4 as 3, fiscalYear: 2027, fiscalPeriod: 'Q2' } })])).success).toBe(false);
  });
  it('retains first malformed attempt, repairs once and explains missing defaults', async () => {
    const callJson = vi.fn().mockResolvedValueOnce({ output: { blocks: [] }, requestId: 'first' }).mockResolvedValueOnce({ output: output(), requestId: 'second' });
    const result = await new ExtractionEngine({ callJson }).run(input);
    expect(result.attempts).toHaveLength(2); expect(result.attempts[0]?.error).toBeTruthy();
    expect(result.facts.find((f) => f.fact.key === 'revenue')?.status).toBe('fixed');
    expect(result.missingFields).toEqual(['net_income', 'eps_diluted']);
    expect(result.facts.filter((f) => f.fact.missingReason)).toHaveLength(2);
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.attempts[0]?.input)).toBe(true);
    expect(callJson.mock.calls[1]?.[0].rules).toHaveLength(1);
  });
  it('checks fiscal-year metadata without substituting calendar years', async () => {
    const callJson = vi.fn().mockResolvedValue({ output: output() });
    const good = await new ExtractionEngine({ callJson }).run({ ...input, filing: { form: '10-Q', fiscalYear: 2027, fiscalPeriod: 'Q2', periodEnd: '2026-07-26' } });
    expect(good.facts[0]?.status).toBe('verified');
    const bad = await new ExtractionEngine({ callJson }).run({ ...input, filing: { form: '10-Q', fiscalYear: 2026, fiscalPeriod: 'Q2', periodEnd: '2026-07-26' } });
    expect(bad.facts[0]?.status).toBe('review');
  });
  it('never marks failed final blocks or facts verified', async () => {
    const bad = revenue({ value: 12 });
    const callJson = vi.fn().mockResolvedValue({ output: output([bad]) });
    const result = await new ExtractionEngine({ callJson }).run(input);
    expect(callJson).toHaveBeenCalledTimes(2); expect(result.facts[0]?.status).toBe('review');
    expect(result.attempts[0]?.output).toEqual(output([bad]));
  });
  it('repair prompt contains only general rule, never expected reference answer', async () => {
    const callJson = vi.fn().mockResolvedValue({ output: output() });
    const result = await new ExtractionEngine({ callJson, referenceFact: async () => ({ value: 777777777, currency: 'USD', unit: 'USD', basis: 'GAAP', months: 3, periodEnd: '2026-07-26' }) }).run(input);
    expect(result.attempts).toHaveLength(2); expect(JSON.stringify(result.attempts[1]?.input)).not.toContain('777777777');
    expect(result.facts[0]?.status).toBe('review');
  });
  it('preserves accepted runtime rules and does not spend repair calls on transport failures', async () => {
    const callJson = vi.fn().mockRejectedValue(new Error('provider unavailable'));
    await expect(new ExtractionEngine({ callJson }).run({ ...input, rules: ['TEAM: use GAAP'] })).rejects.toThrow('provider unavailable');
    expect(callJson).toHaveBeenCalledTimes(1); expect(callJson.mock.calls[0]?.[0].rules).toEqual(['TEAM: use GAAP']);
  });
});
