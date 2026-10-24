import { CircleCheck, Clock, PenLine, TriangleAlert } from "lucide-react"
import type { FieldStatus } from "@/api/types"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const STYLES: Record<FieldStatus, { label: string; short: string; icon: typeof CircleCheck; variant: "success" | "danger" | "soft" | "muted" }> = {
  verified_math: { label: "Consistent with the other figures (arithmetic)", short: "Consistent", icon: CircleCheck, variant: "success" },
  verified_sec: { label: "Confirmed by the SEC filing", short: "Confirmed by SEC", icon: CircleCheck, variant: "success" },
  flagged: { label: "Needs you", short: "Needs you", icon: TriangleAlert, variant: "danger" },
  corrected: { label: "Fixed by an analyst", short: "Fixed", icon: PenLine, variant: "soft" },
  waiting: { label: "Awaiting the SEC filing", short: "Awaiting SEC", icon: Clock, variant: "muted" },
}

/** Plain-language status for exports and screen readers. */
export const statusLabel = (s: FieldStatus) => STYLES[s].short

export function StatusChip({ status, short, className }: { status: FieldStatus; short?: boolean; className?: string }) {
  const s = STYLES[status]
  const Icon = s.icon
  // The short label shows; screen readers get the full one, since its tooltip only opens on hover.
  const badge = (
    <Badge variant={s.variant} className={className}>
      <Icon aria-hidden />
      {short && s.short !== s.label ? <><span aria-hidden>{s.short}</span><span className="sr-only">{s.label}</span></> : short ? s.short : s.label}
    </Badge>
  )
  if (!short || s.short === s.label) return badge
  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>{s.label}</TooltipContent>
    </Tooltip>
  )
}

export function statusTone(statuses: FieldStatus[]): "issue" | "wait" | "ok" {
  if (statuses.includes("flagged")) return "issue"
  if (statuses.includes("waiting")) return "wait"
  return "ok"
}
