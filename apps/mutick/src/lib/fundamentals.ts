import { useEffect, useState } from "react"
import { getOverview } from "@/api/client"
import type { CompanyOverview, Field, FieldKey, FieldStatus, QuarterRow, Release } from "@/api/types"

export type MetricGroup = "income" | "cash" | "shares" | "ratio"
export type MetricUnit = "usd_m" | "eps" | "shares_m" | "pct" | "x"
/** Which direction of change is good. Arrows show direction; colour shows goodness. */
export type Polarity = "up-good" | "down-good" | "neutral"

export interface MetricDef {
  key: string
  label: string
  group: MetricGroup
  unit: MetricUnit
  /** relative: % change. pp: percentage-point change. none: a ratio, no meaningful change. */
  yoy: "relative" | "pp" | "none"
  polarity: Polarity
  value: (q: QuarterRow) => number | null
  /** Extracted fields this number is built from, so a flagged field marks it. */
  inputs: FieldKey[]
}

export const GROUP_LABELS: Record<MetricGroup, string> = {
  income: "Income statement",
  cash: "Cash flow",
  shares: "Shares",
  ratio: "Margins & ratios",
}

const div = (a: number, b: number) => (b ? a / b : null)
const fcf = (q: QuarterRow) => q.cashFromOperations - q.capex

export const METRICS: MetricDef[] = [
  { key: "revenue", label: "Revenue", group: "income", unit: "usd_m", yoy: "relative", polarity: "up-good", value: (q) => q.revenue, inputs: ["revenue"] },
  { key: "cost_of_revenue", label: "Cost of revenue", group: "income", unit: "usd_m", yoy: "relative", polarity: "down-good", value: (q) => q.costOfRevenue, inputs: [] },
  { key: "gross_profit", label: "Gross profit", group: "income", unit: "usd_m", yoy: "relative", polarity: "up-good", value: (q) => q.revenue - q.costOfRevenue, inputs: ["revenue"] },
  { key: "operating_income", label: "Operating income", group: "income", unit: "usd_m", yoy: "relative", polarity: "up-good", value: (q) => q.operatingIncome, inputs: [] },
  { key: "net_income", label: "Net income", group: "income", unit: "usd_m", yoy: "relative", polarity: "up-good", value: (q) => q.netIncome, inputs: ["net_income"] },
  { key: "eps_diluted", label: "Diluted EPS", group: "income", unit: "eps", yoy: "relative", polarity: "up-good", value: (q) => q.epsDiluted, inputs: ["eps_gaap"] },
  { key: "cfo", label: "Cash from operations", group: "cash", unit: "usd_m", yoy: "relative", polarity: "up-good", value: (q) => q.cashFromOperations, inputs: [] },
  { key: "capex", label: "Capital expenditure", group: "cash", unit: "usd_m", yoy: "relative", polarity: "neutral", value: (q) => q.capex, inputs: [] },
  { key: "fcf", label: "Free cash flow", group: "cash", unit: "usd_m", yoy: "relative", polarity: "up-good", value: fcf, inputs: [] },
  { key: "shares", label: "Diluted shares", group: "shares", unit: "shares_m", yoy: "relative", polarity: "down-good", value: (q) => q.sharesDiluted, inputs: ["diluted_shares"] },
  { key: "gross_margin", label: "Gross margin", group: "ratio", unit: "pct", yoy: "pp", polarity: "up-good", value: (q) => div(q.revenue - q.costOfRevenue, q.revenue), inputs: ["revenue"] },
  { key: "operating_margin", label: "Operating margin", group: "ratio", unit: "pct", yoy: "pp", polarity: "up-good", value: (q) => div(q.operatingIncome, q.revenue), inputs: ["revenue"] },
  { key: "net_margin", label: "Net margin", group: "ratio", unit: "pct", yoy: "pp", polarity: "up-good", value: (q) => div(q.netIncome, q.revenue), inputs: ["revenue", "net_income"] },
  { key: "fcf_margin", label: "FCF margin", group: "ratio", unit: "pct", yoy: "pp", polarity: "up-good", value: (q) => div(fcf(q), q.revenue), inputs: ["revenue"] },
  { key: "fcf_conversion", label: "FCF conversion", group: "ratio", unit: "x", yoy: "none", polarity: "up-good", value: (q) => div(fcf(q), q.netIncome), inputs: ["net_income"] },
  { key: "capex_intensity", label: "Capex intensity", group: "ratio", unit: "pct", yoy: "pp", polarity: "neutral", value: (q) => div(q.capex, q.revenue), inputs: ["revenue"] },
  { key: "capex_to_cfo", label: "Capex / CFO", group: "ratio", unit: "x", yoy: "none", polarity: "neutral", value: (q) => div(q.capex, q.cashFromOperations), inputs: [] },
]

export const metric = (key: string) => METRICS.find((m) => m.key === key)!

/** Quarter row fields that come straight from the release extraction. */
const FROM_RELEASE: Partial<Record<FieldKey, keyof QuarterRow>> = {
  revenue: "revenue",
  net_income: "netIncome",
  eps_gaap: "epsDiluted",
  diluted_shares: "sharesDiluted",
}

/** The quarter as the analyst currently sees it: extracted values (with fixes) replace the stored ones. */
export function withRelease(q: QuarterRow, fields: Field[]): QuarterRow {
  const out = { ...q }
  for (const f of fields) {
    const k = FROM_RELEASE[f.key]
    if (k && typeof f.value === "number") (out[k] as number) = f.value
  }
  return out
}

export interface CellState {
  /** The worst status among the fields this number is built from. */
  status?: FieldStatus
  /** The flagged field, when there is one. */
  flagged?: Field
  /** In after mode, the field whose value learning changed. */
  learned?: Field
}

export function cellState(m: Pick<MetricDef, "inputs">, fields: Field[] | undefined): CellState {
  if (!fields) return {}
  const inputs = m.inputs.map((k) => fields.find((f) => f.key === k)).filter(Boolean) as Field[]
  const flagged = inputs.find((f) => f.status === "flagged")
  if (flagged) return { status: "flagged", flagged }
  return {
    status: inputs.find((f) => f.status === "corrected")?.status ?? inputs[0]?.status,
    learned: inputs.find((f) => f.beforeValue !== undefined),
  }
}

/** Change against the same quarter a year earlier, as a fraction (relative) or a point difference (pp). */
export function yoyChange(m: MetricDef, cur: QuarterRow, yearAgo: QuarterRow | undefined): number | null {
  if (m.yoy === "none" || !yearAgo) return null
  const a = m.value(cur), b = m.value(yearAgo)
  if (a === null || b === null) return null
  if (m.yoy === "pp") return a - b
  return b ? (a - b) / Math.abs(b) : null
}

export type Tone = "pos" | "neg" | "neutral"

export function toneFor(delta: number, polarity: Polarity): Tone {
  if (polarity === "neutral" || delta === 0) return "neutral"
  return (delta > 0) === (polarity === "up-good") ? "pos" : "neg"
}

const MINUS = "−"

export function fmtMetric(unit: MetricUnit, v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—"
  const sign = v < 0 ? MINUS : ""
  const a = Math.abs(v)
  switch (unit) {
    case "usd_m": return a >= 1000 ? `${sign}$${(a / 1000).toFixed(1)}B` : `${sign}$${a.toFixed(0)}M`
    case "eps": return `${sign}$${a.toFixed(2)}`
    case "shares_m": return `${(a / 1000).toFixed(a >= 10000 ? 1 : 2)}B`
    case "pct": return `${sign}${(a * 100).toFixed(1)}%`
    case "x": return `${sign}${a.toFixed(1)}x`
  }
}

export function fmtChange(kind: MetricDef["yoy"], v: number): string {
  const sign = v > 0 ? "+" : v < 0 ? MINUS : ""
  return kind === "pp" ? `${sign}${Math.abs(v * 100).toFixed(1)}pp` : `${sign}${Math.abs(v * 100).toFixed(1)}%`
}

/** Fiscal label for a column header: "Q2 FY2027" stays as is, it is already short. */
export const shortQuarter = (label: string) => label.replace(" FY20", " FY")

export interface OverviewSlice {
  /** Up to four quarters ending with the selected release, oldest first; the last one carries the extraction. */
  visible: QuarterRow[]
  latest: QuarterRow
  /** Same quarter a year earlier, for YoY. */
  yearAgo?: QuarterRow
}

/** The quarters the Overview shows for a release, with the release's extracted values applied. */
export function sliceFor(o: CompanyOverview, release: Release, fields: Field[]): OverviewSlice | undefined {
  const i = o.quarters.findIndex((q) => q.releaseId === release.id)
  if (i < 0) return undefined
  const rows = o.quarters.slice(0, i + 1)
  rows[i] = withRelease(rows[i], fields)
  return { visible: rows.slice(-4), latest: rows[i], yearAgo: rows[i - 4] }
}

/** Latest close over the last four quarters' diluted EPS. */
export function trailingPe(o: CompanyOverview, slice: OverviewSlice) {
  const all = o.quarters.slice(0, o.quarters.findIndex((q) => q.fiscalLabel === slice.latest.fiscalLabel))
  const last4 = [...all.slice(-3), slice.latest]
  if (last4.length < 4) return null
  const eps = last4.reduce((s, q) => s + q.epsDiluted, 0)
  const close = o.prices[o.prices.length - 1]?.close
  return close && eps > 0 ? { pe: close / eps, close, eps, basis: `${last4[0].fiscalLabel} to ${slice.latest.fiscalLabel}` } : null
}

const cache = new Map<string, CompanyOverview>()

/** Loads a company's overview once per session. */
export function useOverview(ticker: string | undefined) {
  const [data, setData] = useState<CompanyOverview | undefined>(() => (ticker ? cache.get(ticker) : undefined))
  useEffect(() => {
    if (!ticker) return
    const hit = cache.get(ticker)
    if (hit) { setData(hit); return }
    setData(undefined)
    let live = true
    void getOverview(ticker).then((o) => {
      cache.set(ticker, o)
      if (live) setData(o)
    })
    return () => { live = false }
  }, [ticker])
  return data
}

