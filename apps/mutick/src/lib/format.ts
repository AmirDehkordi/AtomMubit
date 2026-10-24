import type { Field } from "@/api/types"

export function fmtUsdM(m: number) {
  const abs = Math.abs(m)
  const s = abs >= 1000 ? `$${(abs / 1000).toFixed(abs >= 100000 ? 1 : 2)}B` : `$${abs.toFixed(0)}M`
  return m < 0 ? `−${s}` : s
}

export function fmtMillions(n: number) {
  const s = Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })
  return n < 0 ? `−${s}` : s
}

/** "card" shows $52.94B for money; "table" shows house units: USD millions with separators. */
export function fmtValue(f: Pick<Field, "unit"> & { value: Field["value"] | undefined }, style: "card" | "table" = "card"): string {
  const v = f.value
  if (v === null || v === undefined) return "—"
  if (style === "table" && (f.unit === "usd_m" || f.unit === "shares_m")) return fmtMillions(Number(v))
  switch (f.unit) {
    case "usd_m": return fmtUsdM(Number(v))
    case "usd_per_share": return `${Number(v) < 0 ? "−" : ""}$${Math.abs(Number(v)).toFixed(2)}`
    case "shares_m": return `${(Number(v) / 1000).toFixed(2)}B`
    case "date": return new Date(String(v) + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    default: return String(v).charAt(0).toUpperCase() + String(v).slice(1)
  }
}

export function fmtUsd(n: number) {
  return `$${n.toFixed(n < 0.01 ? 4 : n < 0.1 ? 3 : 2)}`
}

/** A field label for use mid-sentence: "Diluted EPS (GAAP)" becomes "diluted EPS", "Revenue" becomes "revenue". */
export function inSentence(label: string) {
  const s = label.replace(/\s*\(.*\)$/, "")
  return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s
}
