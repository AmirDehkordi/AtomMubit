import { TriangleAlert } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * One chart style for every panel, as in the Fundamentals Tracker: horizontal dashed grid,
 * no axis lines, 12px subtle ticks. Colours are theme variables, so charts follow the tokens.
 */
export const C = {
  grid: "var(--border)",
  axis: "var(--subtle-foreground)",
  accent: "var(--chart-1)",
  flagged: "var(--destructive)",
  muted: "var(--muted-foreground)",
  text: "var(--foreground)",
} as const

export const gridProps = { stroke: C.grid, strokeDasharray: "3 3", vertical: false } as const

export const axisBase = { stroke: C.grid, axisLine: false, tickLine: false, tick: { fill: C.axis, fontSize: 12 } } as const

export const CHART_MARGIN = { top: 8, right: 12, bottom: 4, left: 4 } as const

/**
 * Overrides shadcn ChartContainer's defaults so ticks use the subtle tier and the cursor stays faint.
 * The chart surface takes focus (arrow keys move the tooltip), so it gets the same ring as other controls.
 */
export const chartClass =
  "aspect-auto w-full [&_.recharts-cartesian-axis-tick_text]:fill-subtle-foreground [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-primary/5 [&_.recharts-surface:focus-visible]:rounded-sm [&_.recharts-surface:focus-visible]:outline-2 [&_.recharts-surface:focus-visible]:outline-solid [&_.recharts-surface:focus-visible]:outline-offset-2 [&_.recharts-surface:focus-visible]:outline-ring/60"

export interface TipRow {
  label?: string
  value: string
  /** A token class for the swatch, e.g. "bg-chart-1". */
  swatch?: string
}

/** The tooltip chrome every chart shares. */
export function TooltipShell({ title, rows, note }: { title: string; rows: TipRow[]; note?: ReactNode }) {
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-muted-foreground tabular-nums">{title}</p>
      <ul className="flex flex-col gap-0.5">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-2 text-foreground tabular-nums">
            {r.swatch && <span className={cn("size-2 shrink-0 rounded-[2px]", r.swatch)} aria-hidden />}
            {r.label && <span className="text-subtle-foreground">{r.label}</span>}
            <span className="ml-auto pl-3 font-medium">{r.value}</span>
          </li>
        ))}
      </ul>
      {note && <p className="mt-1 max-w-64 text-subtle-foreground">{note}</p>}
    </div>
  )
}

/**
 * A centred swatch and label row under a chart. `tone` is a token class: bg-* for swatches, border-* for dash.
 * "alert" is a swatch with the warning triangle, for a bar that needs the analyst. "none" is a plain text hint.
 * Charts carry their own text alternative, so the legend is hidden from screen readers.
 */
export function ChartLegend({ items, className }: { items: { label: string; swatch: "bar" | "alert" | "line" | "dash" | "faint" | "none"; tone?: string }[]; className?: string }) {
  return (
    <div className={cn("mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1", className)} aria-hidden>
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 text-xs text-subtle-foreground">
          {it.swatch === "bar" && <span className={cn("size-2 shrink-0 rounded-[2px]", it.tone)} aria-hidden />}
          {it.swatch === "alert" && <><span className={cn("size-2 shrink-0 rounded-[2px]", it.tone)} /><TriangleAlert className="-ml-0.5 size-3 text-destructive" /></>}
          {it.swatch === "faint" && <span className={cn("h-2.5 w-2 shrink-0 rounded-[1px] opacity-40", it.tone)} aria-hidden />}
          {it.swatch === "line" && <span className={cn("h-0.5 w-4 rounded-full", it.tone)} aria-hidden />}
          {it.swatch === "dash" && <span className={cn("h-0 w-4 border-t border-dashed", it.tone)} aria-hidden />}
          {it.label}
        </span>
      ))}
    </div>
  )
}

/** The row under the cursor, from the props Recharts passes to tooltip content. */
export function hovered<T>(p: { active?: boolean; payload?: readonly { payload?: unknown }[] }): T | undefined {
  return p.active ? (p.payload?.[0]?.payload as T | undefined) : undefined
}

/** A chart's numbers as a table for screen readers. Charts are pictures; this is what they show. */
export function ChartTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: string[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>{columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r[0]}>
            <th scope="row">{r[0]}</th>
            {r.slice(1).map((v, i) => <td key={i}>{v}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
