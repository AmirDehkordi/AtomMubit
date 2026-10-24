/**
 * The only module the UI calls for data. This version is a mock over sample data.
 * To connect the real backend, re-implement these functions with fetch() against the
 * endpoints in API.md, keeping the same signatures and return types.
 */
import { COMPANIES, MUBIT, RELEASES } from "./mock/data"
import { OVERVIEWS } from "./mock/overview"
import { RULES, type Answer, type Company, type CompanyOverview, type Correction, type Field, type FieldKey, type MubitStatus, type ProgressStep, type QuarterRow, type Release, type RuleId } from "./types"
import { fmtValue, inSentence } from "@/lib/format"

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class TrackError extends Error {}

function matchCompany(query: string): keyof typeof COMPANIES | null {
  const q = query.toLowerCase()
  if (/\bnvda\b|nvidia/.test(q)) return "NVDA"
  if (/\bmsft\b|microsoft/.test(q)) return "MSFT"
  return null
}

export interface TrackResult {
  company: Company
  releases: Release[]
}

/** Find a company's latest earnings releases on SEC EDGAR, extract them, run the checks. */
export async function trackCompany(query: string, onStep: (s: ProgressStep) => void): Promise<TrackResult> {
  const ticker = matchCompany(query)
  if (!ticker) throw new TrackError("This build can track NVIDIA or Microsoft. Try “Track NVIDIA”.")
  return runPipeline(ticker, onStep)
}

/** Read an uploaded earnings release instead of fetching one. */
export async function uploadRelease(file: File, onStep: (s: ProgressStep) => void): Promise<TrackResult> {
  onStep({ id: "upload", label: `Reading ${file.name}`, tone: "ok" })
  await wait(500)
  const ticker = matchCompany(file.name)
  if (!ticker) throw new TrackError(`Couldn't find an NVIDIA or Microsoft earnings release in ${file.name}. This build reads those two only.`)
  return runPipeline(ticker, onStep)
}

/** The company a message names, if this build can track it. Lets "nvidia" on its own start tracking. */
export function companyIn(text: string): string | null {
  return matchCompany(text)
}

async function runPipeline(ticker: keyof typeof COMPANIES, onStep: (s: ProgressStep) => void): Promise<TrackResult> {
  const company: Company = { ...COMPANIES[ticker], releaseIds: [...COMPANIES[ticker].releaseIds] }
  const releases = company.releaseIds.map((id) => RELEASES[id])
  const latest = releases[0]
  const before = latest.extractions.before.fields
  const issues = before.filter((f) => f.status === "flagged").length
  const waiting = before.filter((f) => f.status === "waiting").length

  await wait(500)
  onStep({ id: "find", label: `Found ${company.name}'s 8-K filed ${fmtDay(latest.filedAt)}`, detail: "SEC EDGAR · Item 2.02 · Exhibit 99.1", href: latest.filingUrl, tone: "ok" })
  await wait(700)
  onStep({ id: "read", label: "Read the press release", detail: latest.title, tone: "ok" })
  await wait(800)
  onStep({ id: "extract", label: `Extracted ${before.length} fields`, detail: `Through Mubit · ${latest.extractions.before.seconds}s`, tone: "ok" })
  await wait(600)
  onStep({ id: "math", label: issues ? `Arithmetic check: ${issues} ${issues === 1 ? "issue" : "issues"}` : "Arithmetic check: no issues", tone: issues ? "issue" : "ok" })
  await wait(500)
  onStep({ id: "sec", label: waiting ? "SEC check: waiting for the 10-Q" : "SEC check: matches the 10-Q", tone: waiting ? "wait" : "ok" })
  await wait(400)
  onStep({ id: "history", label: `Added ${releases.length - 1} earlier ${releases.length - 1 === 1 ? "quarter" : "quarters"}`, tone: "ok" })
  return { company, releases }
}

let nextId = 1
export async function submitCorrection(input: { releaseId: string; field: FieldKey; from: Correction["from"]; to: number | string; rule?: RuleId; reason?: string; requestId?: string }): Promise<Correction> {
  await wait(250)
  return { id: `c${nextId++}`, ...input, source: "analyst", by: "You", at: new Date().toISOString() }
}

/** The Mubit task behind the extraction, as the Mubit console reports it. */
export async function getMubitStatus(): Promise<MubitStatus> {
  await wait(150)
  return MUBIT
}

/** Quarterly fundamentals and prices for one company. */
export async function getOverview(ticker: string): Promise<CompanyOverview> {
  await wait(250)
  const o = OVERVIEWS[ticker]
  if (!o) throw new Error(`No overview for ${ticker}`)
  return o
}

/** Answers questions about the checks. The mock knows a few; the backend answers from check results. */
let lastTopic: (typeof TOPICS)[number] | undefined

/** Which number a question is about. Checked in order, so "revenue this quarter" is about revenue. */
const TOPICS: { key: FieldKey; re: RegExp; row?: keyof QuarterRow }[] = [
  { key: "eps_gaap", re: /\beps\b|earnings per share/, row: "epsDiluted" },
  { key: "revenue", re: /revenue|sales|top line/, row: "revenue" },
  { key: "net_income", re: /net income|profit|bottom line/, row: "netIncome" },
  { key: "diluted_shares", re: /shares|share count/, row: "sharesDiluted" },
  { key: "fiscal_quarter", re: /fiscal|quarter label|which quarter|period/ },
]
const CHECKER = { arithmetic: "Arithmetic check", sec: "SEC check", analyst: "Analyst" } as const

/**
 * Answer a question about the release. `fields` are the values as the analyst sees them now, with fixes applied.
 * The real backend reads those from its own store by release id.
 */
export async function ask(question: string, release?: Release, fields?: Field[]): Promise<Answer> {
  await wait(900)
  const q = question.toLowerCase()
  if (/learn|mubit|before|after|faster|cheaper|small model/.test(q))
    return { text: "After learning, a small model trained by Mubit answers this task. On 20 held-out cases it got more numbers right than the frontier model, in about a sixth of the time and at about a tenth of the cost per release. Switch the top bar to After to see its answers, or click the Mubit button for its test results. These are sample figures until the measured runs are in.",
      citations: [], trace: [{ label: "Scoreboard", detail: "20 held-out companies, 60 releases" }] }
  if (!release)
    return { text: "Track a company first, for example “Track NVIDIA”. Then ask about any of its numbers.", citations: [], trace: [] }

  const list = fields ?? release.extractions.before.fields
  const cite = [{ label: `${release.ticker} · 8-K · ${release.fiscalLabel}`, href: release.filingUrl }]
  // A follow-up such as "what about last year?" stays on the number asked about last.
  const topic = TOPICS.find((t) => t.re.test(q)) ?? (/last year|compared|what about|and the|change|growth/.test(q) ? lastTopic : undefined)
  lastTopic = topic
  const f = topic && list.find((x) => x.key === topic.key)
  if (!topic || !f) {
    const flagged = list.filter((x) => x.status === "flagged").map((x) => inSentence(x.label))
    return { text: `I can explain any number on ${release.ticker} ${release.fiscalLabel}: revenue, net income, EPS, diluted shares or the fiscal quarter.${flagged.length ? ` ${flagged.length === 1 ? "One needs" : `${flagged.length} need`} you now: ${flagged.join(" and ")}.` : ""} Try “How did revenue change on last year?”`, citations: [], trace: [] }
  }

  const parts: string[] = []
  const value = fmtValue(f)
  const is = /shares$/i.test(f.label) ? "are" : "is"
  if (f.status === "flagged") parts.push(`${f.label} needs you. ${f.check?.message ?? ""} Click Fix in the red box to pick the right number.`)
  else if (f.status === "corrected") parts.push(`${f.label} ${is} ${value}, fixed by an analyst.`)
  else if (f.status === "waiting") parts.push(`${f.label} ${is} ${value}. The 10-Q isn't filed yet, so the SEC check is still to come.`)
  else if (f.status === "verified_sec") parts.push(`${f.label} ${is} ${value}, confirmed by the 10-Q.`)
  else parts.push(`${f.label} ${is} ${value}. It passed the arithmetic check.`)

  // Change on the same quarter a year earlier, from the company's quarterly history.
  const o = OVERVIEWS[release.ticker]
  const i = o?.quarters.findIndex((x) => x.releaseId === release.id) ?? -1
  const yearAgo = i >= 4 ? o!.quarters[i - 4] : undefined
  if (topic.row && yearAgo && typeof f.value === "number" && f.status !== "flagged") {
    const prev = yearAgo[topic.row] as number
    const pct = ((f.value - prev) / Math.abs(prev)) * 100
    parts.push(`That is ${pct >= 0 ? "up" : "down"} ${Math.abs(pct).toFixed(1)}% on ${yearAgo.fiscalLabel} (${fmtValue({ unit: f.unit, value: prev })}).`)
  }
  const trace = [
    ...(f.check ? [{ label: CHECKER[f.check.by], detail: f.check.ok ? "passed" : "failed" }] : []),
    ...(f.rule ? [{ label: "Rule", detail: `${f.rule} · ${RULES[f.rule].title}` }] : []),
  ]
  return { text: parts.join(" ").replace(/\s+/g, " ").trim(), citations: cite, trace }
}

export function fmtDay(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}
