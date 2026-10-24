/**
 * SAMPLE DATA. Numbers are illustrative, not the companies' reported results.
 * Replace with live extractions from the backend (see API.md).
 */
import type { Field, MubitStatus, Project, Release } from "../types"

const nvdaQ2Fields = (mode: "before" | "after"): Field[] => {
  const after = mode === "after"
  return [
    after
      ? { key: "fiscal_quarter", label: "Fiscal quarter", value: "Q2 FY2027", unit: "text", status: "verified_math", rule: "R4", sourceSegment: "n2-title",
          check: { by: "arithmetic", ok: true, message: "NVIDIA's fiscal year ends in late January, so a quarter ending 26 Jul 2026 is Q2 FY2027." },
          learnedFrom: "Learned from earlier analyst fixes to fiscal labels (R4)" }
      : { key: "fiscal_quarter", label: "Fiscal quarter", value: "Q3 2026", unit: "text", status: "flagged", rule: "R4", sourceSegment: "n2-date",
          check: { by: "arithmetic", ok: false, message: "NVIDIA's fiscal year ends in late January, so a quarter ending 26 Jul 2026 is Q2 FY2027, not calendar Q3 2026." },
          candidates: [{ segmentId: "n2-title", value: "Q2 FY2027", label: "Second quarter fiscal 2027" }, { segmentId: "n2-date", value: "Q3 2026", label: "Calendar Q3 2026" }] },
    { key: "period_end", label: "Period end", value: "2026-07-26", unit: "date", status: "verified_math", sourceSegment: "n2-date",
      check: { by: "arithmetic", ok: true, message: "Matches the quarter end stated in the release." } },
    { key: "revenue", label: "Revenue", value: 52940, unit: "usd_m", status: "waiting", rule: "R2", sourceSegment: "n2-rev",
      check: { by: "sec", ok: true, message: "Waiting for the 10-Q. Plausible against last quarter (+13%)." } },
    { key: "net_income", label: "Net income", value: 28610, unit: "usd_m", status: "waiting", sourceSegment: "n2-ni",
      check: { by: "sec", ok: true, message: "Waiting for the 10-Q." } },
    { key: "diluted_shares", label: "Diluted shares", value: 24480, unit: "shares_m", status: "verified_math", rule: "R5", sourceSegment: "n2-sh",
      check: { by: "arithmetic", ok: true, message: "In millions, consistent with net income and EPS." } },
    after
      ? { key: "eps_gaap", label: "Diluted EPS (GAAP)", value: 1.17, unit: "usd_per_share", status: "verified_math", rule: "R1", sourceSegment: "n2-epsg",
          check: { by: "arithmetic", ok: true, message: "Net income ÷ diluted shares = $1.17." },
          learnedFrom: "Learned from earlier analyst fixes to GAAP EPS (R1)" }
      : { key: "eps_gaap", label: "Diluted EPS (GAAP)", value: 1.24, unit: "usd_per_share", status: "flagged", rule: "R1", sourceSegment: "n2-epsa",
          check: { by: "arithmetic", ok: false, message: "Net income ÷ diluted shares = $1.17, but the AI took $1.24, the adjusted (non-GAAP) figure." },
          candidates: [{ segmentId: "n2-epsg", value: 1.17, label: "GAAP diluted EPS" }, { segmentId: "n2-epsa", value: 1.24, label: "Non-GAAP diluted EPS" }] },
    { key: "eps_adjusted", label: "Adjusted EPS (reported)", value: 1.24, unit: "usd_per_share", status: "verified_math", sourceSegment: "n2-epsa",
      check: { by: "arithmetic", ok: true, message: "Kept separately so the GAAP rule can be checked." } },
  ]
}

const nvdaQ2: Release = {
  id: "nvda-q2-fy2027",
  ticker: "NVDA",
  fiscalLabel: "Q2 FY2027",
  periodEnd: "2026-07-26",
  filedAt: "2026-08-26",
  filingUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=NVDA&type=8-K",
  title: "Financial results for the second quarter of fiscal 2027",
  excerpt: [
    { text: "Results for the " }, { id: "n2-title", text: "second quarter of fiscal 2027" },
    { text: ". Revenue for the quarter ended " }, { id: "n2-date", text: "July 26, 2026" },
    { text: " was " }, { id: "n2-rev", text: "$52.94 billion" },
    { text: ", up 13% from the previous quarter. For the first half of fiscal 2027, revenue was " }, { id: "n2-h1", text: "$99.80 billion" },
    { text: ".\n\nGAAP earnings per diluted share for the quarter were " }, { id: "n2-epsg", text: "$1.17" },
    { text: ". Non-GAAP earnings per diluted share were " }, { id: "n2-epsa", text: "$1.24" },
    { text: ".\n\nGAAP net income was " }, { id: "n2-ni", text: "$28.61 billion" },
    { text: " on " }, { id: "n2-sh", text: "24.48 billion" }, { text: " weighted average diluted shares." },
  ],
  extractions: {
    before: { mode: "before", fields: nvdaQ2Fields("before"), seconds: 4.6, costUsd: 0.021, servedBy: "Frontier model (gpt-6-luna)", measuredAt: "Sample data", requestId: "mreq_0b7e5a1c9d2f4e6a8b0c1d2e3f4a5b6c" },
    after: { mode: "after", fields: nvdaQ2Fields("after"), seconds: 0.8, costUsd: 0.0019, servedBy: "Mubit small model v2", measuredAt: "20 held-out companies · Sample data", requestId: "mreq_1c8f6b2d0e3a5f7b9c1d2e3f4a5b6c7d" },
  },
}

const verifiedFields = (rev: number, ni: number, sh: number, eps: number, epsAdj: number, label: string, end: string, seg: string): Field[] => [
  { key: "fiscal_quarter", label: "Fiscal quarter", value: label, unit: "text", status: "verified_sec", rule: "R4", sourceSegment: `${seg}-title`, check: { by: "sec", ok: true, message: "Matches the fiscal period on the 10-Q." } },
  { key: "period_end", label: "Period end", value: end, unit: "date", status: "verified_sec", sourceSegment: `${seg}-date`, check: { by: "sec", ok: true, message: "Matches the 10-Q." } },
  { key: "revenue", label: "Revenue", value: rev, unit: "usd_m", status: "verified_sec", rule: "R2", sourceSegment: `${seg}-rev`, check: { by: "sec", ok: true, message: "Matches the 10-Q within 0.5%." } },
  { key: "net_income", label: "Net income", value: ni, unit: "usd_m", status: "verified_sec", sourceSegment: `${seg}-ni`, check: { by: "sec", ok: true, message: "Matches the 10-Q within 0.5%." } },
  { key: "diluted_shares", label: "Diluted shares", value: sh, unit: "shares_m", status: "verified_sec", sourceSegment: `${seg}-sh`, check: { by: "sec", ok: true, message: "Matches the 10-Q." } },
  { key: "eps_gaap", label: "Diluted EPS (GAAP)", value: eps, unit: "usd_per_share", status: "verified_sec", rule: "R1", sourceSegment: `${seg}-epsg`, check: { by: "sec", ok: true, message: "Matches the 10-Q to the cent." } },
  { key: "eps_adjusted", label: "Adjusted EPS (reported)", value: epsAdj, unit: "usd_per_share", status: "verified_math", sourceSegment: `${seg}-epsa`, check: { by: "arithmetic", ok: true, message: "Kept separately so the GAAP rule can be checked." } },
]

const simpleExcerpt = (seg: string, period: string, date: string, rev: string, epsg: string, epsa: string, ni: string, sh: string) => [
  { text: "Results for the " }, { id: `${seg}-title`, text: period }, { text: ". Revenue for the quarter ended " }, { id: `${seg}-date`, text: date },
  { text: " was " }, { id: `${seg}-rev`, text: rev }, { text: ".\n\nGAAP earnings per diluted share were " }, { id: `${seg}-epsg`, text: epsg },
  { text: ". Non-GAAP earnings per diluted share were " }, { id: `${seg}-epsa`, text: epsa }, { text: ".\n\nGAAP net income was " }, { id: `${seg}-ni`, text: ni },
  { text: " on " }, { id: `${seg}-sh`, text: sh }, { text: " weighted average diluted shares." },
]

const nvdaQ1: Release = {
  id: "nvda-q1-fy2027", ticker: "NVDA", fiscalLabel: "Q1 FY2027", periodEnd: "2026-04-26", filedAt: "2026-05-27",
  filingUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=NVDA&type=8-K",
  title: "Financial results for the first quarter of fiscal 2027",
  excerpt: simpleExcerpt("n1", "first quarter of fiscal 2027", "April 26, 2026", "$46.86 billion", "$1.03", "$1.09", "$25.19 billion", "24.51 billion"),
  extractions: {
    before: { mode: "before", fields: verifiedFields(46860, 25190, 24510, 1.03, 1.09, "Q1 FY2027", "2026-04-26", "n1"), seconds: 4.4, costUsd: 0.020, servedBy: "Frontier model (gpt-6-luna)", measuredAt: "Sample data", requestId: "mreq_2d9a7c3e1f4b6a8c0d2e3f4a5b6c7d8e" },
    after: { mode: "after", fields: verifiedFields(46860, 25190, 24510, 1.03, 1.09, "Q1 FY2027", "2026-04-26", "n1"), seconds: 0.8, costUsd: 0.0019, servedBy: "Mubit small model v2", measuredAt: "20 held-out companies · Sample data", requestId: "mreq_3e0b8d4f2a5c7b9d1e3f4a5b6c7d8e9f" },
  },
}

const msftQ4Fields = (mode: "before" | "after"): Field[] => {
  const after = mode === "after"
  return [
    { key: "fiscal_quarter", label: "Fiscal quarter", value: "Q4 FY2026", unit: "text", status: "verified_math", rule: "R4", sourceSegment: "m4-title",
      check: { by: "arithmetic", ok: true, message: "Microsoft's fiscal year ends 30 June, so this is Q4 FY2026." } },
    { key: "period_end", label: "Period end", value: "2026-06-30", unit: "date", status: "verified_math", sourceSegment: "m4-date",
      check: { by: "arithmetic", ok: true, message: "Matches the quarter end stated in the release." } },
    after
      ? { key: "revenue", label: "Revenue", value: 76420, unit: "usd_m", status: "verified_math", rule: "R3", sourceSegment: "m4-rev",
          check: { by: "arithmetic", ok: true, message: "The three-month column, not the twelve-month total." },
          learnedFrom: "Learned from earlier analyst fixes to quarterly revenue (R3)" }
      : { key: "revenue", label: "Revenue", value: 281700, unit: "usd_m", status: "flagged", rule: "R3", sourceSegment: "m4-fy",
          check: { by: "arithmetic", ok: false, message: "$281.7B is the twelve-month total for fiscal 2026. The quarter's three-month figure is $76.42B." },
          candidates: [{ segmentId: "m4-rev", value: 76420, label: "Three months ended 30 Jun 2026" }, { segmentId: "m4-fy", value: 281700, label: "Twelve months ended 30 Jun 2026" }] },
    { key: "net_income", label: "Net income", value: 27230, unit: "usd_m", status: "verified_math", sourceSegment: "m4-ni",
      check: { by: "arithmetic", ok: true, message: "Consistent with EPS × diluted shares." } },
    { key: "diluted_shares", label: "Diluted shares", value: 7470, unit: "shares_m", status: "verified_math", sourceSegment: "m4-sh",
      check: { by: "arithmetic", ok: true, message: "In millions." } },
    { key: "eps_gaap", label: "Diluted EPS (GAAP)", value: 3.65, unit: "usd_per_share", status: "verified_math", rule: "R1", sourceSegment: "m4-epsg",
      check: { by: "arithmetic", ok: true, message: "Net income ÷ diluted shares = $3.65." } },
  ]
}

const msftQ4: Release = {
  id: "msft-q4-fy2026", ticker: "MSFT", fiscalLabel: "Q4 FY2026", periodEnd: "2026-06-30", filedAt: "2026-07-29",
  filingUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=MSFT&type=8-K",
  title: "Earnings release for the fourth quarter of fiscal 2026",
  excerpt: [
    { text: "Results for the " }, { id: "m4-title", text: "fourth quarter of fiscal 2026" }, { text: ", the quarter ended " }, { id: "m4-date", text: "June 30, 2026" },
    { text: ". Revenue was " }, { id: "m4-rev", text: "$76.42 billion" }, { text: " for the three months and " }, { id: "m4-fy", text: "$281.70 billion" },
    { text: " for the twelve months.\n\nNet income was " }, { id: "m4-ni", text: "$27.23 billion" }, { text: " and diluted earnings per share were " }, { id: "m4-epsg", text: "$3.65" },
    { text: ", on " }, { id: "m4-sh", text: "7.47 billion" }, { text: " diluted shares.\n\nOutlook: fiscal 2027 revenue is expected to be $318 billion to $322 billion" },
    { text: ", compared with $316 billion to $324 billion previously." },
  ],
  extractions: {
    before: { mode: "before", fields: msftQ4Fields("before"), seconds: 5.1, costUsd: 0.023, servedBy: "Frontier model (gpt-6-luna)", measuredAt: "Sample data", requestId: "mreq_4f1c9e5a3b6d8c0e2f4a5b6c7d8e9f0a" },
    after: { mode: "after", fields: msftQ4Fields("after"), seconds: 0.9, costUsd: 0.0021, servedBy: "Mubit small model v2", measuredAt: "20 held-out companies · Sample data", requestId: "mreq_5a2d0f6b4c7e9d1f3a5b6c7d8e9f0a1b" },
  },
}

const msftQ3: Release = {
  id: "msft-q3-fy2026", ticker: "MSFT", fiscalLabel: "Q3 FY2026", periodEnd: "2026-03-31", filedAt: "2026-04-29",
  filingUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=MSFT&type=8-K",
  title: "Earnings release for the third quarter of fiscal 2026",
  excerpt: simpleExcerpt("m3", "third quarter of fiscal 2026", "March 31, 2026", "$71.90 billion", "$3.41", "$3.41", "$25.50 billion", "7.48 billion"),
  extractions: {
    before: { mode: "before", fields: verifiedFields(71900, 25500, 7480, 3.41, 3.41, "Q3 FY2026", "2026-03-31", "m3"), seconds: 4.9, costUsd: 0.022, servedBy: "Frontier model (gpt-6-luna)", measuredAt: "Sample data", requestId: "mreq_6b3e1a7c5d8f0e2a4b6c7d8e9f0a1b2c" },
    after: { mode: "after", fields: verifiedFields(71900, 25500, 7480, 3.41, 3.41, "Q3 FY2026", "2026-03-31", "m3"), seconds: 0.9, costUsd: 0.0021, servedBy: "Mubit small model v2", measuredAt: "20 held-out companies · Sample data", requestId: "mreq_7c4f2b8d6e9a1f3b5c7d8e9f0a1b2c3d" },
  },
}

export const COMPANIES = {
  NVDA: { ticker: "NVDA", name: "NVIDIA", fiscalYearEnd: "Late January", releaseIds: [nvdaQ2.id, nvdaQ1.id] },
  MSFT: { ticker: "MSFT", name: "Microsoft", fiscalYearEnd: "30 June", releaseIds: [msftQ4.id, msftQ3.id] },
} as const

export const RELEASES: Record<string, Release> = {
  [nvdaQ2.id]: nvdaQ2, [nvdaQ1.id]: nvdaQ1, [msftQ4.id]: msftQ4, [msftQ3.id]: msftQ3,
}

export const emptyProject = (): Project => ({ sample: true, companies: [], releases: {}, corrections: [] })

export const MUBIT: MubitStatus = {
  sample: true,
  measuredAt: "Sample data",
  task: "Earnings numbers",
  route: "mw-auto/gpt-6-luna-9a7e60/earnings-numbers",
  stage: "partial_rollout",
  kept: 179,
  newSinceVersion: 12,
  threshold: 25,
  liveExamples: 167,
  minNewFraction: 0.5,
  nextVersion: "v3",
  versions: [
    { version: "v1", result: "below_target", matched: 81, needs: 90, examples: 25, trainedAt: "Fri 23:40" },
    { version: "v2", result: "passed", matched: 94, needs: 90, examples: 167, trainedAt: "Sat 13:10" },
  ],
  servedShare: { provider: 90, mubit: 10 },
  calls: 640,
  gates: {
    silentTest: { pairs: 50, pairsNeeded: 50, sessions: 14, sessionsNeeded: 10, passRate: 93, passNeeded: 90 },
    rollout: { calls: 63, callsNeeded: 100 },
  },
  liveNote: "Live traffic: v2 answers 10% of calls (partial rollout)",
  routing: [
    { task: "Earnings numbers", servedBy: "Mubit small model v2 · 10% of calls", stage: "partial_rollout", kept: 179, threshold: 25 },
  ],
  timeline: [
    { at: "Fri 22:10", kind: "correction", label: "First 25 kept examples from 180 releases" },
    { at: "Fri 23:40", kind: "train", label: "v1 trained" },
    { at: "Fri 23:55", kind: "test", label: "v1 below target: 81% matched, needs 90%" },
    { at: "Sat 12:20", kind: "correction", label: "142 corrections fed back as examples in the prompt" },
    { at: "Sat 13:10", kind: "train", label: "v2 trained on 167 examples" },
    { at: "Sat 13:25", kind: "test", label: "v2 passed: 94% matched" },
    { at: "Sat 14:40", kind: "rollout", label: "v2 silent test on copies of 10% of calls" },
    { at: "Sat 17:05", kind: "rollout", label: "v2 answering 10% of real calls" },
  ],
}
