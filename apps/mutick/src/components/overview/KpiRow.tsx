import { TriangleAlert } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { Field } from "@/api/types"
import { MetricNumber } from "@/components/common/MetricNumber"
import { StatusChip } from "@/components/common/StatusChip"
import { DeltaChip } from "@/components/overview/DeltaChip"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { inSentence } from "@/lib/format"
import { cellState, fmtMetric, metric, yoyChange, type OverviewSlice } from "@/lib/fundamentals"
import { cn } from "@/lib/utils"

const KPIS = ["revenue", "net_income", "eps_diluted", "gross_margin", "fcf_margin"]

/** The five headline numbers for the quarter, with the change on the same quarter last year. */
export function KpiRow({ slice, fields, onOpen }: { slice: OverviewSlice; fields: Field[]; onOpen: (field?: Field) => void }) {
  return (
    // Five across when there's room; 3 + 2 on a narrow column (1024 with the chat open), never one alone.
    <div className="grid grid-cols-2 gap-3 @xl:grid-cols-3 @3xl:grid-cols-5">
      {KPIS.map((key) => <KpiCard key={key} metricKey={key} slice={slice} fields={fields} onOpen={onOpen} />)}
    </div>
  )
}

/** True for a moment after a card stops being flagged: the fix just landed. */
function useLanded(flagged: boolean) {
  const was = useRef(flagged)
  const [landed, setLanded] = useState(false)
  useEffect(() => {
    const fixed = was.current && !flagged
    was.current = flagged
    if (!fixed) return
    setLanded(true)
    const t = setTimeout(() => setLanded(false), 900)
    return () => clearTimeout(t)
  }, [flagged])
  return landed
}

function KpiCard({ metricKey, slice, fields, onOpen }: { metricKey: string; slice: OverviewSlice; fields: Field[]; onOpen: (field?: Field) => void }) {
  const m = metric(metricKey)
  const cell = cellState(m, fields)
  const direct = m.inputs.length === 1 && ["revenue", "net_income", "eps_diluted"].includes(metricKey) ? fields.find((f) => f.key === m.inputs[0]) : undefined
  const before = cell.learned && direct?.beforeValue !== undefined && typeof direct.beforeValue === "number" ? direct.beforeValue : undefined
  const value = m.value(slice.latest)
  const landed = useLanded(!!cell.flagged)
  // A card is a button only when it leads somewhere: the fix, or the number in the Release check.
  const target = cell.flagged ?? direct
  const Tile = target ? "button" : "div"
  return (
    <Card
      className={cn(
        "gap-0 overflow-hidden py-0 transition-shadow duration-500",
        landed && "shadow-[0_0_24px_-4px_var(--primary)] ring-2 ring-primary/70",
      )}
    >
      <Tile
        {...(target ? { type: "button" as const, onClick: () => onOpen(target) } : {})}
        className={cn("flex h-full flex-col gap-2 p-4 text-left", target && "focus-ring transition-colors hover:bg-muted")}
      >
        <span className="truncate text-xs tracking-wide text-muted-foreground uppercase">{m.label}</span>
        <span className="flex flex-wrap items-baseline gap-x-2">
          {/* Rolls to the new value when a fix lands or Before/After flips; the colour fades with it. */}
          <span className={cn("text-2xl font-semibold whitespace-nowrap tabular-nums transition-colors duration-700", cell.flagged ? "text-destructive" : cell.learned ? "text-primary" : "text-foreground")}>
            <MetricNumber unit={m.unit} value={value} />
          </span>
          {before !== undefined && <span className="text-xs text-subtle-foreground line-through tabular-nums"><span className="sr-only">Before learning: </span>{fmtMetric(m.unit, before)}</span>}
        </span>
        {/* Reserve the row so cards without a chip stay aligned. */}
        <span className="mt-auto flex min-h-[22px] flex-wrap items-center gap-1.5">
          {!cell.flagged && <DeltaChip value={yoyChange(m, slice.latest, slice.yearAgo)} kind={m.yoy} polarity={m.polarity} />}
          {cell.flagged
            ? (cell.flagged.key === direct?.key ? <StatusChip status="flagged" short /> : <UsesFlagged label={cell.flagged.label} />)
            : direct && <StatusChip status={direct.status} kept={direct.kept} short />}
        </span>
        {target && <span className="sr-only">{cell.flagged ? ". Opens the fix." : ". Shows it in the Release check."}</span>}
      </Tile>
    </Card>
  )
}

/** A ratio built from a flagged number: red like the number, but the number is what needs fixing. */
function UsesFlagged({ label }: { label: string }) {
  return (
    <Badge variant="danger">
      <TriangleAlert aria-hidden />
      Uses {inSentence(label)}
    </Badge>
  )
}
