import { describe, expect, it } from 'vitest';
import { quarterFromFacts, type Fact } from './quarter-math';

const fact = (start: string | null, end: string, val: number, accn: string, filed: string, form = '10-Q'): Fact => ({
  start,
  end,
  val,
  accn,
  form,
  filed,
});

// A calendar-year company. Revenue in USD.
const revenue: Fact[] = [
  fact('2025-01-01', '2025-03-31', 100, 'q1', '2025-05-01'),
  fact('2025-04-01', '2025-06-30', 110, 'q2', '2025-08-01'),
  fact('2025-01-01', '2025-06-30', 210, 'q2', '2025-08-01'),
  fact('2025-07-01', '2025-09-30', 120, 'q3', '2025-11-01'),
  fact('2025-01-01', '2025-09-30', 330, 'q3', '2025-11-01'),
  fact('2025-01-01', '2025-12-31', 460, 'k', '2026-02-15', '10-K'),
];

describe('quarterFromFacts', () => {
  it('uses a reported three-month fact', () => {
    expect(quarterFromFacts(revenue, '2025-06-30')).toMatchObject({ value: 110, method: 'reported', accessions: ['q2'] });
  });

  it('derives Q4 as the full year minus nine months', () => {
    expect(quarterFromFacts(revenue, '2025-12-31')).toMatchObject({
      value: 130,
      method: 'derived',
      accessions: ['k', 'q3'],
      note: '12 months − 9 months',
    });
  });

  it('derives Q2 cash flow from year-to-date figures', () => {
    const cash = [
      fact('2025-01-01', '2025-03-31', 40, 'q1', '2025-05-01'),
      fact('2025-01-01', '2025-06-30', 95, 'q2', '2025-08-01'),
    ];
    expect(quarterFromFacts(cash, '2025-06-30')).toMatchObject({ value: 55, method: 'derived', note: '6 months − 3 months' });
  });

  it('keeps the original value and flags a restatement', () => {
    const restated = [...revenue, fact('2025-04-01', '2025-06-30', 112, 'q2-next-year', '2026-08-01')];
    expect(quarterFromFacts(restated, '2025-06-30')).toMatchObject({ value: 110, restated: true });
  });

  it('returns null when nothing covers the quarter', () => {
    expect(quarterFromFacts(revenue, '2026-03-31')).toBeNull();
  });
});
