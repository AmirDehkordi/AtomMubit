import { describe, expect, it } from 'vitest';
import { fiscalLabel, isNextQuarter, quarterName, releaseLabel } from './fiscal';

describe('fiscalLabel', () => {
  it.each([
    // NVIDIA: 52/53-week year ending late January
    ['2026-01-25', '0125', 'Q4 FY2026'],
    ['2026-04-26', '0125', 'Q1 FY2027'],
    ['2026-07-26', '0125', 'Q2 FY2027'],
    ['2025-10-26', '0125', 'Q3 FY2026'],
    ['2025-01-26', '0126', 'Q4 FY2025'],
    // Microsoft: June year end
    ['2026-09-30', '0630', 'Q1 FY2027'],
    ['2026-06-30', '0630', 'Q4 FY2026'],
    ['2026-03-31', '0630', 'Q3 FY2026'],
    // Apple: late-September 52/53-week year
    ['2025-12-27', '0927', 'Q1 FY2026'],
    ['2026-09-26', '0927', 'Q4 FY2026'],
    ['2026-06-27', '0927', 'Q3 FY2026'],
    // Calendar year
    ['2026-03-31', '1231', 'Q1 FY2026'],
    ['2025-12-31', '1231', 'Q4 FY2025'],
  ])('%s with year end %s is %s', (periodEnd, fye, expected) => {
    expect(quarterName(fiscalLabel(periodEnd, fye))).toBe(expected);
  });
});

describe('isNextQuarter', () => {
  it('accepts 13- and 14-week quarters', () => {
    expect(isNextQuarter('2025-10-26', '2026-01-25')).toBe(true);
    expect(isNextQuarter('2026-03-31', '2026-06-30')).toBe(true);
  });
  it('rejects a skipped quarter', () => {
    expect(isNextQuarter('2025-10-26', '2026-04-26')).toBe(false);
  });
});

describe('releaseLabel', () => {
  it.each([
    ['2026-02-25', '0131', 'Q4 FY2026'],
    ['2026-05-20', '0131', 'Q1 FY2027'],
    ['2026-08-26', '0131', 'Q2 FY2027'],
    ['2026-07-29', '0630', 'Q4 FY2026'],
    ['2026-01-29', '0926', 'Q1 FY2026'],
    ['2026-02-10', '1231', 'Q4 FY2025'],
  ])('a release on %s with year end %s reports %s', (date, fye, expected) => {
    expect(quarterName(releaseLabel(date, fye))).toBe(expected);
  });
});
