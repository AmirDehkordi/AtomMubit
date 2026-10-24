import { MessageSquareText, TriangleAlert } from "lucide-react"
import { fmtDay } from "@/api/client"
import { LearningToggle } from "@/components/learning/LearningToggle"
import { RollingNumber } from "@/components/common/MetricNumber"
import { LogoMark, Wordmark } from "@/components/common/Wordmark"
import { CompanySwitcher } from "@/components/shell/CompanySwitcher"
import { MubitPopover } from "@/components/shell/MubitPopover"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cellState, metric, sliceFor, trailingPe, useOverview } from "@/lib/fundamentals"
import { cn } from "@/lib/utils"
import { fmtUsd } from "@/lib/format"
import { useApp } from "@/state/app"

/**
 * Latest close over four quarters of diluted EPS. Red with a warning mark when this quarter's EPS still
 * needs the analyst. It takes focus, so the tooltip's working is there for the keyboard too.
 */
function TrailingPe() {
  const { release, fields } = useApp()
  const overview = useOverview(release?.ticker)
  const slice = overview && release && sliceFor(overview, release, fields)
  const pe = overview && slice && trailingPe(overview, slice)
  if (!pe) return null
  const flagged = cellState(metric("eps_diluted"), fields).flagged
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="focus-ring inline-flex cursor-help items-baseline gap-2 rounded-sm whitespace-nowrap">
          {/* Shorter label on a narrow column, so the bar stays on one row. */}
          <span className="text-xs tracking-wide text-subtle-foreground uppercase"><span className="hidden @6xl/col:inline">Trailing </span>P/E</span>
          <span className={cn("inline-flex items-center gap-1 self-center text-sm font-semibold tabular-nums", flagged ? "text-destructive" : "text-foreground")}>
            {flagged && <TriangleAlert className="size-3.5" aria-hidden />}
            <RollingNumber value={pe.pe} digits={1} suffix="x" />
            {flagged && <span className="sr-only">, needs you</span>}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        ${pe.close.toFixed(2)} close ÷ ${pe.eps.toFixed(2)} diluted EPS, {pe.basis}.
        {flagged ? " Uses this quarter's EPS, which needs you." : ""}
      </TooltipContent>
    </Tooltip>
  )
}

/** In After mode, the Mubit win in one line. How it was measured is in the tooltip, which focus opens too. */
function AfterResult() {
  const { release, mode, mubit } = useApp()
  if (!release || mode !== "after") return null
  const a = release.extractions.after
  const b = release.extractions.before
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="focus-ring cursor-help rounded-sm text-xs whitespace-nowrap text-primary tabular-nums">
          {a.seconds}s · {fmtUsd(a.costUsd)}<span className="hidden @6xl/col:inline"> per release <span className="text-subtle-foreground">(was {b.seconds}s · {fmtUsd(b.costUsd)})</span></span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {a.seconds}s and {fmtUsd(a.costUsd)} per release; was {b.seconds}s and {fmtUsd(b.costUsd)} with the frontier model. Measured in Mubit's test runs on {a.measuredAt.split(" · ")[0]}, not on live traffic.{mubit ? ` ${mubit.liveNote}.` : ""}{mubit?.sample ? " Sample data." : ""}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * The release's controls. Narrow columns (1024 with the chat open, or zoomed in) wrap to a second row
 * rather than hiding anything; only the wordmark text gives way to the mark.
 */
export function TopBar() {
  const { release, setChat, unread } = useApp()

  return (
    <header className="shrink-0 border-b bg-card animate-in fade-in duration-500 ease-out motion-reduce:animate-none">
      <div className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
        <span className="hidden shrink-0 @4xl/col:inline-flex"><Wordmark /></span>
        <LogoMark className="shrink-0 @4xl/col:hidden" />
        {release ? (
          <>
            <Separator orientation="vertical" className="h-5!" />
            <CompanySwitcher />
            <Badge variant="soft" className="border-0 bg-primary-soft px-2.5 py-1 font-normal text-muted-foreground tabular-nums">
              {release.fiscalLabel} · ended {fmtDay(release.periodEnd)}
            </Badge>
            <TrailingPe />
          </>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-2">
          <LearningToggle />
          <AfterResult />
          <MubitPopover />
          {/* Below md the assistant is a sheet with no rail, so it opens from here. */}
          <Button variant="ghost" size="icon" className="relative size-8 text-muted-foreground md:hidden" aria-label={unread ? "Open assistant, new messages" : "Open assistant"} onClick={() => setChat(true)}>
            <MessageSquareText />
            {unread && <span className="absolute top-1 right-1 size-2 rounded-full bg-primary" aria-hidden />}
          </Button>
        </div>
      </div>
    </header>
  )
}
