import { TriangleAlert } from "lucide-react"
import { Bar, CartesianGrid, Cell, ComposedChart, XAxis, YAxis } from "recharts"
import type { Field } from "@/api/types"
import { CHART_MARGIN, C, ChartLegend, ChartTable, TooltipShell, axisBase, chartClass, gridProps, hovered } from "@/components/charts/chartTheme"
import { Panel } from "@/components/common/Panel"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { cellState, fmtMetric, metric, shortQuarter, type OverviewSlice } from "@/lib/fundamentals"
import { inSentence } from "@/lib/format"

// The two cards sit side by side: same height, margin and axis height so their baselines line up.
// The extra top margin leaves room for the warning mark over a flagged bar.
const CHART_HEIGHT = 200
const MARGIN = { ...CHART_MARGIN, top: 20 }

interface Datum {
  quarter: string
  value: number | null
  hover: string
  flagged: boolean
}

/** Round ticks at `step` up to the rounded max, never below `floor`. */
function roundTicks(data: Datum[], step: number, floor: number) {
  const max = Math.max(0, ...data.map((d) => d.value ?? 0))
  const top = Math.max(floor, Math.ceil(max / step) * step)
  const ticks: number[] = []
  for (let t = 0; t <= top + 1e-9; t += step) ticks.push(Number(t.toFixed(3)))
  return { ticks, top }
}

/** "Q3 FY26" on two lines, so four labels fit the narrow side-by-side cards. */
function QuarterTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const [q, fy] = (payload?.value ?? "").split(" ")
  return (
    <text x={x} y={y} dy={12} textAnchor="middle" fontSize={12} fill={C.axis}>
      <tspan x={x}>{q}</tspan>
      <tspan x={x} dy={14}>{fy}</tspan>
    </text>
  )
}

/** The warning triangle over a flagged bar, so "needs you" doesn't rest on red versus amber alone. */
function FlagMark({ x = 0, y = 0, width = 0 }: { x?: number | string; y?: number | string; width?: number | string }) {
  return <TriangleAlert x={Number(x) + Number(width) / 2 - 6} y={Number(y) - 16} width={12} height={12} className="text-destructive" aria-hidden />
}

/**
 * A percentage by quarter as amber bars, with a second ratio on hover. A bar built from a flagged
 * number turns red, so a wrong extraction is visible in the chart, not just the table.
 */
export function QuarterBarCard({
  title, info, metricKey, hoverKey, step, floor, slice, fields,
}: {
  title: string
  info: string
  metricKey: string
  hoverKey: string
  step: number
  floor: number
  slice: OverviewSlice
  fields: Field[]
}) {
  const m = metric(metricKey)
  const h = metric(hoverKey)
  const flagged = cellState(m, fields).flagged
  const data: Datum[] = slice.visible.map((q, i) => ({
    quarter: shortQuarter(q.fiscalLabel),
    value: m.value(q),
    hover: fmtMetric(h.unit, h.value(q)),
    flagged: i === slice.visible.length - 1 && !!flagged,
  }))
  const { ticks, top } = roundTicks(data, step, floor)
  const config = { value: { label: m.label, color: C.accent } } satisfies ChartConfig

  return (
    <Panel title={title} info={info}>
      <ChartContainer config={config} className={chartClass} style={{ height: CHART_HEIGHT }}>
        <ComposedChart
          data={data}
          margin={MARGIN}
          accessibilityLayer
          title={`${title} chart`}
          desc="Use the left and right arrow keys to read each quarter. The same numbers follow as a table."
        >
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="quarter" {...axisBase} interval={0} height={40} tick={<QuarterTick />} />
          <YAxis {...axisBase} width={44} domain={[0, top]} ticks={ticks} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
          <ChartTooltip
            content={(p) => {
              const d = hovered<Datum>(p)
              if (!d) return null
              return (
                <TooltipShell
                  title={d.quarter}
                  rows={[
                    { label: m.label, value: fmtMetric(m.unit, d.value), swatch: d.flagged ? "bg-destructive" : "bg-chart-1" },
                    { label: h.label, value: d.hover },
                  ]}
                  note={d.flagged ? `Uses ${inSentence(flagged!.label)}, which needs you.` : undefined}
                />
              )
            }}
          />
          <Bar
            dataKey="value"
            radius={[2, 2, 0, 0]}
            maxBarSize={44}
            isAnimationActive={false}
            label={(p: { x?: number | string; y?: number | string; width?: number | string; index?: number }) => (data[p.index ?? -1]?.flagged ? <FlagMark {...p} /> : <g />)}
          >
            {data.map((d) => <Cell key={d.quarter} fill={d.flagged ? C.flagged : C.accent} />)}
          </Bar>
        </ComposedChart>
      </ChartContainer>
      <ChartLegend
        items={[
          { label: m.label, swatch: "bar", tone: "bg-chart-1" },
          ...(flagged ? [{ label: "Needs you", swatch: "alert" as const, tone: "bg-destructive" }] : []),
          { label: `Hover for ${inSentence(h.label)}`, swatch: "none" },
        ]}
      />
      <ChartTable
        caption={`${title}: ${inSentence(m.label)} and ${inSentence(h.label)} by quarter`}
        columns={["Quarter", m.label, h.label]}
        rows={data.map((d) => [d.quarter, `${fmtMetric(m.unit, d.value)}${d.flagged ? `, needs you: uses ${inSentence(flagged!.label)}` : ""}`, d.hover])}
      />
    </Panel>
  )
}
