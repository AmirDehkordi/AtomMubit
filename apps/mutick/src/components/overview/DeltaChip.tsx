import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { fmtChange, toneFor, type MetricDef, type Polarity } from "@/lib/fundamentals"
import { cn } from "@/lib/utils"

const VARIANT = { pos: "success", neg: "danger", neutral: "muted" } as const

/** Arrow and signed change on a tint. The arrow shows direction; the colour shows whether that is good. */
export function DeltaChip({ value, kind, polarity, className }: { value: number | null; kind: MetricDef["yoy"]; polarity: Polarity; className?: string }) {
  if (value === null || !Number.isFinite(value)) return null
  const Arrow = value > 0 ? ArrowUp : value < 0 ? ArrowDown : ArrowRight
  return (
    <Badge variant={VARIANT[toneFor(value, polarity)]} className={cn("gap-0.5 px-1.5 tabular-nums", className)}>
      <Arrow aria-hidden />
      {fmtChange(kind, value)}
      <span className="sr-only">{TONE_WORD[toneFor(value, polarity)]}</span>
    </Badge>
  )
}

export const TONE_TEXT = { pos: "text-success", neg: "text-destructive", neutral: "text-muted-foreground" } as const
/** What the colour says, for screen readers: the sign gives the direction, this gives good or bad. */
export const TONE_WORD = { pos: ", better", neg: ", worse", neutral: "" } as const
