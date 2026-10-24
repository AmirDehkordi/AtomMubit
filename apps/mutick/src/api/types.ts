/**
 * Data contract between the Earnings Desk UI and its backend.
 * The backend returns these shapes; see API.md. Money is USD millions unless noted.
 */

export type RuleId = "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7"

export type FieldKey =
  | "fiscal_quarter"
  | "period_end"
  | "revenue"
  | "net_income"
  | "diluted_shares"
  | "eps_gaap"
  | "eps_adjusted"

/** How a number was checked, or why it is waiting. */
export type FieldStatus = "verified_math" | "verified_sec" | "flagged" | "corrected" | "waiting"

export type CheckSource = "arithmetic" | "sec" | "analyst"

export type FieldUnit = "usd_m" | "usd_per_share" | "shares_m" | "text" | "date"

/** One labelled stretch of the release text. Fields and candidates point at segments by id. */
export interface Segment {
  text: string
  /** Present when this text is a number the AI could have picked. */
  id?: string
}

export interface Candidate {
  segmentId: string
  value: number | string
  label: string
}

export interface Check {
  by: CheckSource
  ok: boolean
  /** Plain sentence shown to the analyst, e.g. "Net income ÷ diluted shares = $0.82". */
  message: string
}

export interface Field {
  key: FieldKey
  label: string
  value: number | string | null
  unit: FieldUnit
  status: FieldStatus
  check?: Check
  rule?: RuleId
  /** Segment the value was read from. */
  sourceSegment?: string
  /** Numbers in the release the analyst can pick from when correcting. */
  candidates?: Candidate[]
  /** After learning: what taught the model to get this right. */
  learnedFrom?: string
  /** UI-derived in "after" mode: the AI's original answer when learning changed it. */
  beforeValue?: number | string | null
  /** UI-derived in "before" mode: an analyst kept the AI's value despite the failed check. */
  kept?: boolean
}

export type Mode = "before" | "after"

export interface Extraction {
  mode: Mode
  fields: Field[]
  /** Seconds for the whole release. */
  seconds: number
  costUsd: number
  servedBy: string
  measuredAt: string
  /** Mubit's x-middleware-request-id for the extraction call. */
  requestId: string
}

export interface Release {
  id: string
  ticker: string
  fiscalLabel: string
  periodEnd: string
  filedAt: string
  filingUrl: string
  title: string
  excerpt: Segment[]
  extractions: Record<Mode, Extraction>
}

export interface Company {
  ticker: string
  name: string
  fiscalYearEnd: string
  releaseIds: string[]
}

export interface Correction {
  id: string
  releaseId: string
  field: FieldKey
  from: number | string | null
  to: number | string
  rule?: RuleId
  source: CheckSource
  /** Who made the correction. */
  by: string
  /** Required when an analyst keeps a value a check flagged. */
  reason?: string
  /** Mubit x-middleware-request-id of the extraction call that produced the original value. */
  requestId?: string
  at: string
}

export interface Project {
  sample: boolean
  companies: Company[]
  releases: Record<string, Release>
  corrections: Correction[]
}

export type ProgressStep = { id: string; label: string; detail?: string; href?: string; tone?: "ok" | "issue" | "wait" }

export interface Answer {
  text: string
  citations: { label: string; href?: string }[]
  trace: { label: string; detail: string }[]
}

export const RULES: Record<RuleId, { title: string; detail: string }> = {
  R1: { title: "GAAP EPS", detail: "Diluted GAAP EPS, not the adjusted figure in the headline" },
  R2: { title: "Total revenue", detail: "Consolidated revenue, not a segment or organic figure" },
  R3: { title: "Quarter only", detail: "The three-month column, never year to date" },
  R4: { title: "Fiscal label", detail: "Label the quarter on the company's own fiscal calendar" },
  R5: { title: "Units", detail: "All money in US dollars, millions" },
  R6: { title: "Signs", detail: "Losses as negative numbers" },
  R7: { title: "No guessing", detail: "Leave it empty when the release doesn't state it" },
}

/** Mubit's view of the work, as its console shows it. */
export type MubitStage = "collecting" | "reviewing" | "training" | "testing" | "passed" | "silent_test" | "partial_rollout" | "live"

export interface MubitVersion {
  version: string
  result: "passed" | "below_target" | "prompt_only"
  /** % of test cases matching the provider model's answers. */
  matched: number
  needs: number
  examples: number
  trainedAt: string
}

export interface MubitRoute {
  task: string
  servedBy: string
  stage: MubitStage
  kept: number
  threshold: number
}

export interface MubitEvent {
  at: string
  kind: "correction" | "train" | "test" | "rollout"
  label: string
}

export interface MubitStatus {
  sample: boolean
  measuredAt: string
  task: string
  route: string
  stage: MubitStage
  /** Kept examples in the task overall. */
  kept: number
  /** New kept examples since the current version. */
  newSinceVersion: number
  /** Minimum new examples before retraining (Mubit default 25). */
  threshold: number
  /** Examples the live version was trained on. */
  liveExamples: number
  /** Retraining also needs new examples of at least this fraction of liveExamples (Mubit default 0.5). */
  minNewFraction: number
  nextVersion: string
  versions: MubitVersion[]
  /** Share of this task's calls each side answered, in %. */
  servedShare: { provider: number; mubit: number }
  calls: number
  /** Promotion gates for the current version. */
  gates: {
    silentTest: { pairs: number; pairsNeeded: number; sessions: number; sessionsNeeded: number; passRate: number; passNeeded: number }
    rollout: { calls: number; callsNeeded: number }
  }
  /** What live traffic looks like right now, in words. */
  liveNote: string
  routing: MubitRoute[]
  timeline: MubitEvent[]
}

export const MUBIT_STAGES: { key: MubitStage; label: string }[] = [
  { key: "collecting", label: "Collecting" },
  { key: "reviewing", label: "Reviewing" },
  { key: "training", label: "Training" },
  { key: "testing", label: "Testing" },
  { key: "passed", label: "Passed" },
  { key: "silent_test", label: "Silent test" },
  { key: "partial_rollout", label: "Partial rollout" },
  { key: "live", label: "Live" },
]

/**
 * One fiscal quarter of reported fundamentals, USD millions (EPS in USD, shares in millions).
 * Filed quarters come from SEC XBRL; the newest quarter comes from the release until its 10-Q lands.
 */
export interface QuarterRow {
  fiscalLabel: string
  periodEnd: string
  /** The release this quarter was extracted from, when the company is tracked here. */
  releaseId?: string
  revenue: number
  costOfRevenue: number
  operatingIncome: number
  netIncome: number
  epsDiluted: number
  cashFromOperations: number
  capex: number
  sharesDiluted: number
}

export interface PricePoint {
  date: string
  close: number
  volume: number
}

/** Everything the company Overview tab draws. GET /api/companies/{ticker}/overview */
export interface CompanyOverview {
  ticker: string
  sample: boolean
  /** Oldest first. */
  quarters: QuarterRow[]
  /** Daily closes, oldest first, about three years so the 150-day average is warm on the 2Y view. */
  prices: PricePoint[]
  pricesAsOf: string
  /** 8-K earnings filing dates, drawn as markers on the price chart. */
  earningsDates: string[]
}
