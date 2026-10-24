/**
 * SAMPLE DATA for the company Overview. Numbers are illustrative, not the companies' reported results.
 * Replace with GET /api/companies/{ticker}/overview (see API.md).
 */
import type { CompanyOverview, PricePoint, QuarterRow } from "../types"

const q = (
  fiscalLabel: string, periodEnd: string, revenue: number, costOfRevenue: number, operatingIncome: number,
  netIncome: number, epsDiluted: number, cashFromOperations: number, capex: number, sharesDiluted: number, releaseId?: string,
): QuarterRow => ({ fiscalLabel, periodEnd, releaseId, revenue, costOfRevenue, operatingIncome, netIncome, epsDiluted, cashFromOperations, capex, sharesDiluted })

/** Deterministic pseudo-random numbers, so the sample price line is the same on every load. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Weekday closes from `from` to `to`, a random walk bent so it starts at `start` and ends at `end`. */
function priceSeries(seed: number, from: string, to: string, start: number, end: number, vol: number, baseVolume: number): PricePoint[] {
  const rand = mulberry32(seed)
  const days: string[] = []
  for (let d = new Date(from + "T00:00:00Z"); d <= new Date(to + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1))
    if (d.getUTCDay() % 6 !== 0) days.push(d.toISOString().slice(0, 10))
  const walk = [0]
  for (let i = 1; i < days.length; i++) walk.push(walk[i - 1] + (rand() - 0.5) * 2 * vol)
  const drift = (Math.log(end / start) - walk[walk.length - 1]) / (days.length - 1)
  return days.map((date, i) => ({
    date,
    close: Math.round(start * Math.exp(walk[i] + drift * i) * 100) / 100,
    volume: Math.round(baseVolume * (0.6 + rand() * 0.8)),
  }))
}

export const OVERVIEWS: Record<string, CompanyOverview> = {
  NVDA: {
    ticker: "NVDA",
    sample: true,
    quarters: [
      q("Q1 FY2026", "2025-04-27", 31200, 9048, 18096, 16250, 0.66, 15600, 936, 24700),
      q("Q2 FY2026", "2025-07-27", 34600, 9688, 20760, 18300, 0.74, 17934, 969, 24650),
      q("Q3 FY2026", "2025-10-26", 38200, 10123, 23302, 20450, 0.83, 20450, 1031, 24600),
      q("Q4 FY2026", "2026-01-25", 42100, 10736, 26102, 22900, 0.93, 22213, 1221, 24560),
      q("Q1 FY2027", "2026-04-26", 46860, 11715, 29288, 25190, 1.03, 24938, 1453, 24510, "nvda-q1-fy2027"),
      q("Q2 FY2027", "2026-07-26", 52940, 12970, 33352, 28610, 1.17, 28896, 1747, 24480, "nvda-q2-fy2027"),
    ],
    prices: priceSeries(7, "2023-10-23", "2026-10-23", 43.5, 204.6, 0.024, 260),
    pricesAsOf: "2026-10-23",
    earningsDates: ["2024-02-21", "2024-05-22", "2024-08-28", "2024-11-20", "2025-02-26", "2025-05-28", "2025-08-27", "2025-11-19", "2026-02-25", "2026-05-27", "2026-08-26"],
  },
  MSFT: {
    ticker: "MSFT",
    sample: true,
    quarters: [
      q("Q3 FY2025", "2025-03-31", 61900, 19437, 27979, 21600, 2.9, 25998, 17951, 7460),
      q("Q4 FY2025", "2025-06-30", 64700, 20445, 28986, 22800, 3.05, 31056, 19410, 7470),
      q("Q1 FY2026", "2025-09-30", 66200, 20522, 30121, 23500, 3.14, 29128, 20522, 7475),
      q("Q2 FY2026", "2025-12-31", 69800, 21778, 31968, 24900, 3.33, 30014, 21987, 7480),
      q("Q3 FY2026", "2026-03-31", 71900, 22505, 33218, 25500, 3.41, 33074, 23008, 7480, "msft-q3-fy2026"),
      q("Q4 FY2026", "2026-06-30", 76420, 23690, 35612, 27230, 3.65, 37446, 24836, 7470, "msft-q4-fy2026"),
    ],
    prices: priceSeries(11, "2023-10-23", "2026-10-23", 329.3, 531.8, 0.014, 22),
    pricesAsOf: "2026-10-23",
    earningsDates: ["2024-01-30", "2024-04-25", "2024-07-30", "2024-10-30", "2025-01-29", "2025-04-30", "2025-07-30", "2025-10-29", "2026-01-28", "2026-04-29", "2026-07-29"],
  },
}
