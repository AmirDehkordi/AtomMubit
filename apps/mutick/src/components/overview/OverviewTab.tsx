import type { Field } from "@/api/types"
import { FundamentalsTable } from "@/components/overview/FundamentalsTable"
import { KpiRow } from "@/components/overview/KpiRow"
import { PriceChartPanel } from "@/components/overview/PriceChartPanel"
import { QuarterBarCard } from "@/components/overview/QuarterBarCard"
import { Skeleton } from "@/components/ui/skeleton"
import { sliceFor, useOverview } from "@/lib/fundamentals"
import { useApp } from "@/state/app"

/**
 * The Fundamentals Tracker overview, per quarter. Reading order is importance: headline numbers,
 * then two columns. Left (7/12): the fundamentals table. Right (5/12): price, then the two ratio charts.
 * With the chat open the page is narrower, so the table takes 8/12 and the charts stack.
 */
export function OverviewTab() {
  const { release, fields, setFixing, setTab, setHighlight } = useApp()
  const overview = useOverview(release?.ticker)
  if (!release) return null
  const slice = overview && sliceFor(overview, release, fields)
  if (!overview || !slice)
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[116px]" />)}</div>
        <Skeleton className="h-[560px]" />
      </div>
    )

  const open = (f?: Field) => {
    if (!f) return
    if (f.status === "flagged") setFixing(f.key)
    else {
      setHighlight(f.sourceSegment)
      setTab("check")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <KpiRow slice={slice} fields={fields} onOpen={open} />
      <div className="grid grid-cols-1 gap-4 @5xl:grid-cols-12">
        <div className="@5xl:col-span-8 @6xl:col-span-7">
          <FundamentalsTable slice={slice} fields={fields} onFix={setFixing} />
        </div>
        <div className="flex flex-col gap-4 @5xl:col-span-4 @6xl:col-span-5">
          <PriceChartPanel overview={overview} shown={slice.visible.map((q) => q.fiscalLabel)} />
          <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2 @5xl:grid-cols-1 @6xl:grid-cols-2">
            <QuarterBarCard
              title="Earnings quality"
              info="Bars: FCF margin (free cash flow ÷ revenue). FCF conversion (free cash flow ÷ net income) on hover."
              metricKey="fcf_margin" hoverKey="fcf_conversion" step={0.1} floor={0.4}
              slice={slice} fields={fields}
            />
            <QuarterBarCard
              title="Capex intensity"
              info="Bars: cash capex ÷ revenue. Capex ÷ cash from operations on hover."
              metricKey="capex_intensity" hoverKey="capex_to_cfo" step={0.05} floor={0.1}
              slice={slice} fields={fields}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
