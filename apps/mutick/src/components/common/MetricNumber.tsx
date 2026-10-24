import NumberFlow, { type Format } from "@number-flow/react"
import { fmtMetric, type MetricUnit } from "@/lib/fundamentals"

/** NumberFlow's value, decimals and affixes for a unit, matching `fmtMetric` exactly ("$52.9B", "$1.17", "75.5%"). */
function parts(unit: MetricUnit, v: number): { value: number; digits: number; prefix?: string; suffix?: string } {
  const a = Math.abs(v)
  switch (unit) {
    case "usd_m": return a >= 1000 ? { value: v / 1000, digits: 1, prefix: "$", suffix: "B" } : { value: v, digits: 0, prefix: "$", suffix: "M" }
    case "eps": return { value: v, digits: 2, prefix: "$" }
    case "shares_m": return { value: v / 1000, digits: a >= 10000 ? 1 : 2, suffix: "B" }
    case "pct": return { value: v * 100, digits: 1, suffix: "%" }
    case "x": return { value: v, digits: 1, suffix: "x" }
  }
}

/**
 * A number that rolls to its new value when it changes: a fix landing, or the Before/After switch.
 * NumberFlow skips the roll when the viewer asks for reduced motion. Its digits live in a shadow DOM that
 * screen readers don't read reliably, so they're hidden and the same value is given as plain text.
 */
export function MetricNumber({ unit, value }: { unit: MetricUnit; value: number | null }) {
  if (value === null || !Number.isFinite(value)) return <>—</>
  const p = parts(unit, value)
  const format: Format = { minimumFractionDigits: p.digits, maximumFractionDigits: p.digits }
  return (
    <>
      <NumberFlow value={p.value} format={format} prefix={p.prefix} suffix={p.suffix} locales="en-GB" aria-hidden />
      <span className="sr-only">{fmtMetric(unit, value)}</span>
    </>
  )
}

/** A plain number with fixed decimals that rolls when it changes, such as the trailing P/E or a count. */
export function RollingNumber({ value, digits = 0, suffix }: { value: number; digits?: number; suffix?: string }) {
  return (
    <>
      <NumberFlow value={value} format={{ minimumFractionDigits: digits, maximumFractionDigits: digits }} suffix={suffix} locales="en-GB" aria-hidden />
      <span className="sr-only">{value.toFixed(digits)}{suffix}</span>
    </>
  )
}
