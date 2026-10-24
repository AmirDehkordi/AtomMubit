import { Check, ChevronDown, ClipboardCopy, Copy, Download, History } from "lucide-react"
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react"
import { toast } from "sonner"
import type { Correction, Field, FieldKey, Release } from "@/api/types"
import { RULES } from "@/api/types"
import { Panel } from "@/components/common/Panel"
import { StatusChip, statusLabel } from "@/components/common/StatusChip"
import { AttentionStrip } from "@/components/release/AttentionStrip"
import { SourceExcerpt } from "@/components/release/SourceExcerpt"
import { ReviewCard } from "@/components/review/ReviewCard"
import { DeltaChip } from "@/components/overview/DeltaChip"
import { OverviewTab } from "@/components/overview/OverviewTab"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtUsd, fmtValue } from "@/lib/format"
import type { Polarity } from "@/lib/fundamentals"
import { effectiveFields, priorRelease, useApp, type Tab } from "@/state/app"
import { cn } from "@/lib/utils"

const CHECKER = { arithmetic: "Arithmetic", sec: "SEC 10-Q", analyst: "Analyst" } as const
const NUMERIC = new Set(["usd_m", "shares_m", "usd_per_share"])
/** Which way is good for each number, as on the Overview: fewer diluted shares is good. */
const POLARITY: Partial<Record<FieldKey, Polarity>> = { diluted_shares: "down-good" }

/** Change on the previous release as a fraction, or null when it can't be computed. */
function change(cur: Field["value"], prev: Field["value"] | undefined) {
  return typeof cur === "number" && typeof prev === "number" && prev !== 0 ? (cur - prev) / Math.abs(prev) : null
}

/** A company's release: Amir's Overview, the field-by-field release check, and the slide-in fix panel. */
export function ReleaseView() {
  const { release, fields, mode, project, tab, setTab, fixing, setFixing } = useApp()
  const heading = useRef<HTMLHeadingElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  // What opened the fix panel, so focus can go back there when it closes.
  const opener = useRef<HTMLElement | null>(null)
  const closedOutside = useRef(false)

  const fixedNow = release && fixing && project.corrections.some((c) => c.releaseId === release.id && c.field === fixing)
  // The fix panel opens over whichever tab is showing, so the dashboard stays in view while the analyst fixes.
  const fixItem = release && fixing && mode === "before" && !fixedNow ? release.extractions.before.fields.find((f) => f.key === fixing && f.status === "flagged") : undefined

  // Arriving from the start screen leaves focus nowhere; put it on the release's heading.
  useEffect(() => {
    if (document.activeElement === document.body) heading.current?.focus()
  }, [])
  // Runs before the panel focuses itself, so this is still the Fix button (or card, or cell) that was pressed.
  useLayoutEffect(() => {
    const el = document.activeElement as HTMLElement | null
    if (fixItem && el && el !== document.body && !sheet.current?.contains(el)) opener.current = el
    if (fixItem) closedOutside.current = false
  }, [fixItem?.key])

  if (!release) return <p className="p-6 text-13 text-muted-foreground">Pick a release in the sidebar.</p>
  const company = project.companies.find((c) => c.ticker === release.ticker)
  const issues = fields.filter((f) => f.status === "flagged").length
  // The panel covers the red box, so it offers the next number that needs you itself.
  const nextFlagged = fields.find((f) => f.status === "flagged" && f.key !== fixItem?.key)

  /** Fix pressed again for the open number: the panel is already there, so go to it. */
  const onFix = (k: FieldKey) => {
    if (k === fixItem?.key) sheet.current?.querySelector<HTMLElement>("[role=region]")?.focus()
    else setFixing(k)
  }
  /** Back to what opened the panel; once fixed, that row has gone, so the next Fix, or the box that says nothing needs you. */
  const restoreFocus = () => {
    if (closedOutside.current) return
    const back = opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>("[data-fix]") ?? document.querySelector<HTMLElement>("[data-needs-you]")
    back?.focus()
  }

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 p-4">
      <h1 id="release" ref={heading} tabIndex={-1} className="sr-only">
        {company?.name ?? release.ticker} {release.fiscalLabel}
      </h1>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-4">
        <TabsList className="h-10 animate-in fade-in slide-in-from-left-3 duration-500 ease-out [animation-fill-mode:both] motion-reduce:animate-none [animation-delay:80ms]">
          {([["overview", "Overview"], ["check", "Release check"]] as const).map(([value, label]) => (
            <TabsTrigger key={value} value={value} className="h-8 gap-1.5 px-3 dark:data-[state=active]:border-primary/60 dark:data-[state=active]:bg-primary-soft dark:data-[state=active]:text-primary">
              {label}
              {value === "check" && issues > 0 && (
                <Badge variant="danger" className="h-5 min-w-5 rounded-full px-1 text-xs tabular-nums">
                  {issues}<span className="sr-only"> {issues === 1 ? "number needs" : "numbers need"} you</span>
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* On arrival from the start screen the page comes in from the left, a step at a time. */}
        {mode === "before" && (
          <div className="animate-in fade-in slide-in-from-left-3 duration-500 ease-out [animation-fill-mode:both] motion-reduce:animate-none [animation-delay:160ms]">
            <AttentionStrip fields={fields} fixing={fixItem?.key} onFix={onFix} />
          </div>
        )}

        <div className="animate-in fade-in slide-in-from-left-3 duration-500 ease-out [animation-fill-mode:both] motion-reduce:animate-none [animation-delay:240ms]">
          <TabsContent value="overview" className="focus-ring rounded-lg"><OverviewTab /></TabsContent>
          <TabsContent value="check" className="focus-ring rounded-lg"><CheckTab /></TabsContent>
        </div>
      </Tabs>

      {/* Not modal: no dimming, and a click on another red number moves the panel to that number. */}
      <Sheet open={!!fixItem} onOpenChange={(open) => { if (!open) setFixing(undefined) }} modal={false}>
        <SheetContent
          ref={sheet}
          side="right"
          showCloseButton={false}
          className="w-full gap-0 p-0 shadow-2xl sm:w-[420px] sm:max-w-[420px]"
          // The fix card focuses itself so its shortcuts work; don't move focus to the first button.
          onOpenAutoFocus={(e) => e.preventDefault()}
          // Esc in a text box goes back to the card (the card handles it) instead of closing and losing the text.
          onEscapeKeyDown={(e) => { if ((e.target as HTMLElement | null)?.closest("input, textarea")) e.preventDefault() }}
          // Radix would return focus to a trigger this panel doesn't have; return it to the opener instead,
          // unless the analyst clicked or tabbed away, in which case focus is already where they want it.
          onInteractOutside={() => { closedOutside.current = true }}
          onCloseAutoFocus={(e) => { e.preventDefault(); restoreFocus() }}
        >
          <SheetTitle className="sr-only">Fix {fixItem?.label}</SheetTitle>
          <SheetDescription className="sr-only">Pick the right number from the release, type it with its source, or keep the AI value with a reason.</SheetDescription>
          {fixItem && (
            <ReviewCard
              key={`${release.id}-${fixItem.key}`}
              item={{ release, field: fixItem }}
              next={nextFlagged}
              onNext={nextFlagged ? () => setFixing(nextFlagged.key) : undefined}
              onClose={() => setFixing(undefined)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

/** Every extracted field with its check and the source text. */
function CheckTab() {
  const { release, fields, mode, highlight, setHighlight, project, setFixing } = useApp()
  const [openHistory, setOpenHistory] = useState<FieldKey>()
  // Two fields can share a source segment (GAAP and adjusted EPS), so the selected row is tracked by field.
  const [selected, setSelected] = useState<FieldKey>()
  if (!release) return null

  const ex = release.extractions[mode]
  const prior = priorRelease(project, release)
  const priorFields = prior ? effectiveFields(prior, mode, project.corrections) : []
  const issues = fields.filter((f) => f.status === "flagged").length
  const checked = fields.filter((f) => f.status.startsWith("verified") || f.status === "corrected").length
  const correctionFor = (k: FieldKey) => project.corrections.find((c) => c.releaseId === release.id && c.field === k)

  return (
    <div className="flex flex-col gap-4">
      <Card className={cn("flex-row flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3", mode === "after" && "border-primary/40 bg-primary-soft")}>
        <SummaryStat label="Checked" value={`${checked} of ${fields.length} numbers`} />
        <SummaryStat label="Needs you" value={String(issues)} tone={issues ? "text-destructive" : undefined} />
        <SummaryStat label="Speed" value={`${ex.seconds}s per release`} />
        <SummaryStat label="Cost" value={`${fmtUsd(ex.costUsd)} per release`} />
        {mode === "before" && <span className="ml-auto text-xs text-subtle-foreground">Answered by {ex.servedBy}</span>}
      </Card>

      <div className="grid grid-cols-1 gap-4 @5xl:grid-cols-12">
        <Panel
          title={<>Extracted fields <span className="normal-case tracking-normal text-subtle-foreground">· money and shares in USD m</span></>}
          className="@5xl:col-span-8"
          actions={<ExportButtons release={release} corrections={project.corrections} />}
        >
          <Table aria-label="Extracted fields">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs text-subtle-foreground uppercase">Field</TableHead>
                <TableHead className="text-right text-xs text-subtle-foreground uppercase">Value</TableHead>
                <TableHead className="text-right text-xs whitespace-nowrap text-subtle-foreground uppercase">vs {prior?.fiscalLabel.split(" ")[0] ?? "prior"}</TableHead>
                <TableHead className="text-xs text-subtle-foreground uppercase">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((f) => {
                const c = correctionFor(f.key)
                const showHistory = openHistory === f.key && c && mode === "before"
                const pf = priorFields.find((x) => x.key === f.key)
                const delta = NUMERIC.has(f.unit) && f.status !== "flagged" ? change(f.value, pf?.value) : null
                const fixable = f.status === "flagged" && mode === "before"
                const hasHistory = !!c && mode === "before"
                const open = () => {
                  setSelected(f.key)
                  setHighlight(f.sourceSegment)
                  // A fix's toast sits over the history row it would open; clear it.
                  if (hasHistory) toast.dismiss()
                  if (fixable) setFixing(f.key)
                  if (hasHistory) setOpenHistory((cur) => (cur === f.key ? undefined : f.key))
                }
                return (
                  <Fragment key={f.key}>
                    {/* The whole row is the mouse target; the field name is the same action as a button for the keyboard. */}
                    <TableRow
                      data-state={(selected ? selected === f.key : !!highlight && highlight === f.sourceSegment) ? "selected" : undefined}
                      className={cn("cursor-pointer data-[state=selected]:bg-muted", f.beforeValue !== undefined && "bg-primary-soft/60 hover:bg-primary-soft")}
                      onClick={open}
                    >
                      <TableHead scope="row" className="h-auto py-2.5 align-top font-normal whitespace-normal">
                        <button
                          type="button"
                          className="focus-ring -mx-1 -my-[3px] flex min-h-6 items-center gap-1 rounded-sm px-1 text-left text-13 text-foreground"
                          aria-expanded={hasHistory ? !!showHistory : undefined}
                          onClick={(e) => { e.stopPropagation(); open() }}
                        >
                          {f.label}
                          <span className="sr-only">{fixable ? ", fix" : hasHistory ? ", fix history" : ", show in the release text"}</span>
                          {hasHistory && <ChevronDown className={cn("size-3.5 text-subtle-foreground transition-transform", showHistory && "rotate-180")} aria-hidden />}
                        </button>
                        {f.check && (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            <span className="text-subtle-foreground">{CHECKER[f.check.by]}{f.rule ? ` · ${f.rule} ${RULES[f.rule].title}` : ""} · </span>
                            {f.check.message}
                          </div>
                        )}
                        {f.learnedFrom && (
                          <div className="mt-1 text-xs text-primary">{f.learnedFrom}</div>
                        )}
                      </TableHead>
                      <TableCell className="py-2.5 text-right align-top text-13 whitespace-nowrap tabular-nums">
                        {f.beforeValue !== undefined && <div className="text-xs text-subtle-foreground line-through"><span className="sr-only">Before learning: </span>{fmtValue({ ...f, value: f.beforeValue }, "table")}</div>}
                        <span className={f.status === "flagged" ? "text-destructive" : f.beforeValue !== undefined ? "font-medium text-primary" : "text-foreground"}>{fmtValue(f, "table")}</span>
                      </TableCell>
                      <TableCell className="py-2.5 text-right align-top">
                        {delta !== null ? (
                          <DeltaChip value={delta} kind="relative" polarity={POLARITY[f.key] ?? "up-good"} />
                        ) : f.status === "flagged" ? (
                          <Tooltip>
                            <TooltipTrigger asChild><span className="text-xs text-subtle-foreground"><span aria-hidden>—</span><span className="sr-only">Fix this first</span></span></TooltipTrigger>
                            <TooltipContent>Fix this first</TooltipContent>
                          </Tooltip>
                        ) : <span className="text-xs text-subtle-foreground">—</span>}
                      </TableCell>
                      <TableCell className="w-[1%] py-2.5 align-top"><StatusChip status={f.status} kept={f.kept} short /></TableCell>
                    </TableRow>
                    {showHistory && c && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={4} className="bg-muted/60 py-2.5 whitespace-normal">
                          <AuditLine correction={c} field={f} original={release.extractions.before.fields.find((x) => x.key === f.key)} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
          <p className="mt-2 text-xs text-subtle-foreground">{prior ? `Change is against ${release.ticker} ${prior.fiscalLabel}. ` : ""}Pick a field to see where it came from.</p>
        </Panel>

        <Panel title="From the release" className="@5xl:col-span-4">
          <SourceExcerpt release={release} highlight={highlight} />
        </Panel>
      </div>
    </div>
  )
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-xs text-subtle-foreground">{label}</span>
      <span className={cn("text-sm font-medium text-foreground tabular-nums", tone)}>{value}</span>
    </span>
  )
}

function AuditLine({ correction: c, field, original }: { correction: Correction; field: Field; original?: Field }) {
  const [copied, setCopied] = useState(false)
  const when = new Date(c.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" })
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1 text-foreground"><History className="size-3.5 text-subtle-foreground" aria-hidden /> {c.from === c.to ? "Kept" : "Fixed"} by {c.by}</span>
      <span className="tabular-nums">{when}</span>
      {c.from === c.to ? (
        <span className="tabular-nums">Kept <span className="text-foreground">{fmtValue(field, "table")}</span> despite the failed check</span>
      ) : (
        <span className="tabular-nums">
          <span className="text-subtle-foreground line-through">{original ? fmtValue(original, "table") : String(c.from)}</span> → <span className="text-foreground">{fmtValue(field, "table")}</span>
        </span>
      )}
      {c.rule && <span>{c.rule} · {RULES[c.rule].title}</span>}
      {c.reason && <span>{c.from === c.to ? "Reason" : "Source"}: <span className="text-foreground">“{c.reason}”</span></span>}
      {c.requestId && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-6 gap-1 px-1.5 font-mono text-xs text-muted-foreground"
              onClick={(e) => { e.stopPropagation(); void navigator.clipboard?.writeText(c.requestId!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200) }) }}
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {c.requestId.slice(0, 18)}…
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy the Mubit request ID</TooltipContent>
        </Tooltip>
      )}
      {c.requestId && (
        <span role="status" className="sr-only">{copied ? "Request ID copied" : ""}</span>
      )}
    </div>
  )
}

/** Plain values for spreadsheets: numbers without currency symbols or separators, dates in ISO. */
function csvValue(f: Field) {
  return f.value === null || f.value === undefined ? "" : String(f.value)
}

function rows(release: Release, fields: Field[], corrections: Correction[]) {
  const header = ["Company", "Quarter", "Field", "Value (USD m unless noted)", "Status", "Checked by", "Rule", "Original AI value", "Fixed by", "Fixed at (UTC)", "Reason or source", "Mubit request ID"]
  const body = fields.map((f) => {
    const c = corrections.find((x) => x.releaseId === release.id && x.field === f.key)
    const orig = release.extractions.before.fields.find((x) => x.key === f.key)
    return [
      release.ticker, release.fiscalLabel, f.label, csvValue(f), statusLabel(f.status), f.check ? CHECKER[f.check.by] : "", f.rule ?? "",
      c && orig ? csvValue(orig) : f.beforeValue !== undefined ? csvValue({ ...f, value: f.beforeValue }) : "", c?.by ?? "", c?.at ?? "", c?.reason ?? "", c?.requestId ?? release.extractions.before.requestId,
    ]
  })
  return [header, ...body]
}

function ExportButtons({ release, corrections }: { release: Release; corrections: Correction[] }) {
  const { mode } = useApp()
  const [copied, setCopied] = useState(false)
  const data = () => rows(release, effectiveFields(release, mode, corrections), corrections)
  const copy = async () => {
    const tsv = data().map((r) => r.join("\t")).join("\n")
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1500) }
    try {
      await navigator.clipboard.writeText(tsv)
      done()
    } catch {
      // Clipboard API refused (no permission or not a secure context): fall back to a selection copy.
      const ta = Object.assign(document.createElement("textarea"), { value: tsv })
      ta.style.position = "fixed"
      ta.style.opacity = "0"
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand("copy")
      ta.remove()
      if (ok) done()
      else toast.error("Couldn't copy. Use Export CSV instead.")
    }
  }
  const exportCsv = () => {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    const csv = data().map((r) => r.map(esc).join(",")).join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    const a = Object.assign(document.createElement("a"), { href: url, download: `${release.ticker}-${release.fiscalLabel.replace(/\s/g, "-")}-${mode}.csv` })
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground" onClick={() => void copy()}>
            {copied ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />} {copied ? "Copied" : "Copy"}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Copy as a table you can paste into Excel</TooltipContent>
      </Tooltip>
      <span role="status" className="sr-only">{copied ? "Copied. Paste it into Excel." : ""}</span>
      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground" onClick={exportCsv}>
        <Download className="size-3.5" /> Export CSV
      </Button>
    </>
  )
}
