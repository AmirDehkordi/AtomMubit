import { useMemo, useState } from "react"
import { Area, Bar, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, XAxis, YAxis } from "recharts"
import type { CompanyOverview, PricePoint } from "@/api/types"
import { fmtDay } from "@/api/client"
import { C, ChartLegend, TooltipShell, axisBase, chartClass, gridProps, hovered } from "@/components/charts/chartTheme"
import { Panel } from "@/components/common/Panel"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

const RANGES = { "6m": { label: "6M", spoken: "6 months", days: 183 }, "1y": { label: "1Y", spoken: "1 year", days: 366 }, "2y": { label: "2Y", spoken: "2 years", days: 731 } } as const
type RangeKey = keyof typeof RANGES
const DAY = 86_400_000
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

type Row = PricePoint & { ma150: number | null }

function withMovingAverage(rows: PricePoint[], n = 150): Row[] {
  let sum = 0
  return rows.map((r, i) => {
    sum += r.close
    if (i >= n) sum -= rows[i - n].close
    return { ...r, ma150: i >= n - 1 ? Math.round((sum / n) * 100) / 100 : null }
  })
}

const monthTick = (iso: string) => {
  const d = new Date(iso + "T00:00:00Z")
  return `${MONTHS[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`
}
const usd = (v: number) => `$${v.toFixed(2)}`

/**
 * Daily close (accent line with a light fill), a dashed 150-day average, volume in the bottom fifth,
 * the last price, and each earnings release as a dashed marker.
 */
export function PriceChartPanel({ overview, shown }: { overview: CompanyOverview; shown: string[] }) {
  const [range, setRange] = useState<RangeKey>("2y")
  const all = useMemo(() => withMovingAverage(overview.prices), [overview.prices])
  // The average is computed over the full series first, so the shortest range still shows it.
  const rows = useMemo(() => {
    const cutoff = Date.parse(all[all.length - 1].date) - RANGES[range].days * DAY
    return all.filter((r) => Date.parse(r.date) >= cutoff)
  }, [all, range])
  // Mark the releases of the quarters in the table, each snapped to the first trading day on or after
  // its filing so the line lands on a real tick. Earnings dates line up with quarters from the end.
  const offset = overview.earningsDates.length - overview.quarters.length
  const markers = shown
    .map((label) => {
      const date = overview.earningsDates[overview.quarters.findIndex((q) => q.fiscalLabel === label) + offset]
      const hit = date ? rows.find((r) => r.date >= date) : undefined
      return hit && hit.date !== rows[0].date ? { x: hit.date, label: label.split(" ")[0] } : undefined
    })
    .filter((m) => m !== undefined)
  const volMax = Math.max(1, ...rows.map((r) => r.volume))
  const last = rows[rows.length - 1]
  const closes = rows.map((r) => r.close)
  const summary = last
    ? `Daily close over ${RANGES[range].spoken}: ${usd(last.close)} on ${fmtDay(last.date)}, ` +
      `high ${usd(Math.max(...closes))}, low ${usd(Math.min(...closes))}` +
      `${last.ma150 !== null ? `, 150-day average ${usd(last.ma150)}` : ""}.` +
      `${markers.length ? ` Earnings releases: ${markers.map((mk) => `${mk.label} on ${fmtDay(mk.x)}`).join(", ")}.` : ""}`
    : ""
  const config = { close: { label: "Close", color: C.accent } } satisfies ChartConfig

  return (
    <Panel
      title="Price"
      info={`Daily close, sample data as of ${fmtDay(overview.pricesAsOf)}. Dashed lines mark the earnings releases (8-K) of the quarters in the table.`}
      actions={
        <ToggleGroup type="single" value={range} onValueChange={(v) => v && setRange(v as RangeKey)} variant="outline" size="sm" aria-label="Price range" className="h-7">
          {(Object.keys(RANGES) as RangeKey[]).map((k) => (
            <ToggleGroupItem key={k} value={k} className="h-7 px-2 text-xs tabular-nums text-subtle-foreground data-[state=on]:bg-primary-soft data-[state=on]:text-foreground data-[state=on]:inset-ring data-[state=on]:inset-ring-primary/60">
              {RANGES[k].label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      }
    >
      <ChartContainer config={config} className={chartClass} style={{ height: 232 }}>
        <ComposedChart
          data={rows}
          margin={{ top: 22, right: 56, bottom: 4, left: 4 }}
          title="Price chart"
          desc="Use the left and right arrow keys to read each day. A summary follows."
        >
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="date" {...axisBase} tickFormatter={monthTick} minTickGap={48} />
          <YAxis yAxisId="price" {...axisBase} width={52} domain={["auto", "auto"]} allowDecimals={false} tickCount={5} tickFormatter={(v: number) => `$${Math.round(v)}`} />
          {/* Hidden axis inflated five times, so volume bars only ever fill the bottom fifth. */}
          <YAxis yAxisId="volume" hide domain={[0, volMax * 5]} />
          <ChartTooltip
            cursor={{ stroke: C.grid, strokeDasharray: "3 3" }}
            content={(p) => {
              const r = hovered<Row>(p)
              if (!r) return null
              return (
                <TooltipShell
                  title={fmtDay(r.date)}
                  rows={[
                    { label: "Close", value: usd(r.close), swatch: "bg-chart-1" },
                    ...(r.ma150 !== null ? [{ label: "150-day MA", value: usd(r.ma150), swatch: "bg-muted-foreground" }] : []),
                  ]}
                />
              )
            }}
          />
          <Bar yAxisId="volume" dataKey="volume" fill={C.axis} fillOpacity={0.18} isAnimationActive={false} />
          <Area yAxisId="price" type="monotone" dataKey="close" stroke={C.accent} strokeWidth={1.5} fill={C.accent} fillOpacity={0.08} dot={false} activeDot={{ r: 3, fill: C.accent, stroke: C.accent }} isAnimationActive={false} />
          <Line yAxisId="price" type="monotone" dataKey="ma150" stroke={C.muted} strokeWidth={1} strokeDasharray="4 3" dot={false} connectNulls={false} isAnimationActive={false} />
          {markers.map((mk) => (
            <ReferenceLine key={mk.x} yAxisId="price" x={mk.x} stroke={C.grid} strokeDasharray="4 4" label={{ value: mk.label, position: "top", fontSize: 12, fill: C.axis }} />
          ))}
          {last && (
            <ReferenceDot yAxisId="price" x={last.date} y={last.close} r={3} fill={C.accent} stroke={C.accent} label={{ value: usd(last.close), position: "right", fontSize: 12, fill: C.text }} />
          )}
        </ComposedChart>
      </ChartContainer>
      <ChartLegend
        className="justify-start pl-1"
        items={[
          { label: "Close", swatch: "line", tone: "bg-chart-1" },
          { label: "150-day MA", swatch: "dash", tone: "border-muted-foreground" },
          { label: "Volume", swatch: "faint", tone: "bg-subtle-foreground" },
        ]}
      />
      <p className="sr-only">{summary}</p>
    </Panel>
  )
}
