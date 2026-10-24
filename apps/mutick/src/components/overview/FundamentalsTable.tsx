import { PenLine, TriangleAlert } from "lucide-react"
import { Fragment } from "react"
import { fmtDay } from "@/api/client"
import type { Field, FieldKey } from "@/api/types"
import { Panel } from "@/components/common/Panel"
import { TONE_TEXT, TONE_WORD } from "@/components/overview/DeltaChip"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  GROUP_LABELS, METRICS, cellState, fmtChange, fmtMetric, shortQuarter, toneFor, withRelease, yoyChange,
  type MetricDef, type MetricGroup, type OverviewSlice,
} from "@/lib/fundamentals"
import { inSentence } from "@/lib/format"
import { cn } from "@/lib/utils"

const STICKY = "sticky left-0 z-10 min-w-[148px] bg-card group-hover:bg-muted"

/** A dash with its reason: on hover for the mouse, inline for screen readers (no Tab stop per cell). */
function Dash({ tip }: { tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help text-subtle-foreground underline decoration-dotted underline-offset-2">
          <span aria-hidden>—</span>
          <span className="sr-only">{tip}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{tip}</TooltipContent>
    </Tooltip>
  )
}

/** The release's own column: flagged numbers are red and open their fix; fixed and learned ones say so. */
function LatestCell({ m, slice, fields, onFix }: { m: MetricDef; slice: OverviewSlice; fields: Field[]; onFix: (k: FieldKey) => void }) {
  const cell = cellState(m, fields)
  const text = fmtMetric(m.unit, m.value(slice.latest))
  if (cell.flagged) {
    const f = cell.flagged
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="link"
            size="sm"
            onClick={() => onFix(f.key)}
            aria-label={`${text}, needs you. Fix ${inSentence(f.label)}`}
            className="h-auto min-h-6 gap-1 p-0 text-13 font-normal text-destructive tabular-nums has-[>svg]:px-0"
          >
            <TriangleAlert className="size-3" aria-hidden />
            {text}
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          {m.inputs.length === 1 && m.inputs[0] === f.key ? "Needs you: " : `Uses ${inSentence(f.label)}, which needs you: `}
          {f.check?.message} Click to fix.
        </TooltipContent>
      </Tooltip>
    )
  }
  if (cell.learned && cell.learned.beforeValue !== undefined) {
    const before = withRelease(slice.latest, fields.map((f) => (f.key === cell.learned!.key ? { ...f, value: f.beforeValue! } : f)))
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Stacked like the Release check, so the column keeps its width. */}
          <span className="inline-flex cursor-help flex-col items-end tabular-nums">
            <span className="text-xs text-subtle-foreground line-through"><span className="sr-only">Before learning: </span>{fmtMetric(m.unit, m.value(before))}</span>
            <span className="font-medium text-primary"><span className="sr-only">After: </span>{text}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>Before learning: {fmtMetric(m.unit, m.value(before))}</TooltipContent>
      </Tooltip>
    )
  }
  if (cell.status === "corrected" && m.inputs.length === 1)
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-help items-center gap-1 text-foreground tabular-nums">
            <PenLine className="size-3 text-primary" aria-hidden />
            {text}
            <span className="sr-only">, fixed by an analyst</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>Fixed by an analyst</TooltipContent>
      </Tooltip>
    )
  return <span className="text-foreground tabular-nums">{text}</span>
}

function YoyCell({ m, slice, fields }: { m: MetricDef; slice: OverviewSlice; fields: Field[] }) {
  if (m.yoy === "none") return <Dash tip="No year-over-year: a ratio has no meaningful change." />
  if (cellState(m, fields).flagged) return <Dash tip="Fix the flagged number first." />
  const v = yoyChange(m, slice.latest, slice.yearAgo)
  if (v === null) return <Dash tip="No comparable quarter a year earlier." />
  const tone = toneFor(v, m.polarity)
  return <span className={cn("tabular-nums", TONE_TEXT[tone])}>{fmtChange(m.yoy, v)}<span className="sr-only">{TONE_WORD[tone]}</span></span>
}

/** Quarterly matrix: rows are metrics, columns the last four quarters and the change on a year earlier. */
export function FundamentalsTable({ slice, fields, onFix }: { slice: OverviewSlice; fields: Field[]; onFix: (k: FieldKey) => void }) {
  const cols = slice.visible.length + 2
  let lastGroup: MetricGroup | null = null
  return (
    <Panel
      title="Fundamentals"
      info="Earlier quarters come from SEC filings. The latest quarter comes from the release, with our checks applied, until its 10-Q is filed."
    >
      <Table className="text-13" aria-label="Fundamentals">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(STICKY, "align-bottom text-subtle-foreground")}>Metric</TableHead>
            {slice.visible.map((q, i) => {
              const latest = i === slice.visible.length - 1
              return (
                <TableHead key={q.fiscalLabel} className={cn("text-right align-bottom", latest && "bg-primary-soft/40")}>
                  <div className="flex flex-col items-end py-1 leading-tight">
                    <span className={cn("font-medium", latest ? "text-foreground" : "text-muted-foreground")}>{shortQuarter(q.fiscalLabel)}</span>
                    <span className="text-xs font-normal whitespace-nowrap text-subtle-foreground">{latest ? "this release" : `e. ${fmtDay(q.periodEnd)}`}</span>
                  </div>
                </TableHead>
              )
            })}
            <TableHead className="text-right align-bottom">
              <div className="flex flex-col items-end py-1 leading-tight">
                <span className="font-medium text-muted-foreground">YoY</span>
                <span className="text-xs font-normal whitespace-nowrap text-subtle-foreground">vs {slice.yearAgo ? shortQuarter(slice.yearAgo.fiscalLabel) : "a year ago"}</span>
              </div>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {METRICS.map((m) => {
            const showGroup = m.group !== lastGroup
            lastGroup = m.group
            return (
              <Fragment key={m.key}>
                {showGroup && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={cols} className="px-2 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {GROUP_LABELS[m.group]}
                    </TableCell>
                  </TableRow>
                )}
                <TableRow className="group hover:bg-muted">
                  <TableHead scope="row" className={cn(STICKY, "h-auto py-2 font-normal text-muted-foreground")}>{m.label}</TableHead>
                  {slice.visible.map((q, i) => (
                    <TableCell key={q.fiscalLabel} className={cn("text-right", i === slice.visible.length - 1 && "bg-primary-soft/40")}>
                      {i === slice.visible.length - 1
                        ? <LatestCell m={m} slice={slice} fields={fields} onFix={onFix} />
                        : <span className="text-foreground tabular-nums">{fmtMetric(m.unit, m.value(q))}</span>}
                    </TableCell>
                  ))}
                  <TableCell className="text-right"><YoyCell m={m} slice={slice} fields={fields} /></TableCell>
                </TableRow>
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </Panel>
  )
}
