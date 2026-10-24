import { ExternalLink } from "lucide-react"
import { useEffect, useRef } from "react"
import type { Candidate, Release } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * The release text with numbers marked. The highlighted segment is where the selected value came from.
 * In the fix panel, the number the check points to lights up amber and the AI's wrong number red.
 */
export function SourceExcerpt({
  release, highlight, candidates, onPick, rightSegment, wrongSegment, className,
}: {
  release: Release
  highlight?: string
  candidates?: Candidate[]
  onPick?: (c: Candidate) => void
  rightSegment?: string
  wrongSegment?: string
  className?: string
}) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!highlight) return
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    root.current?.querySelector(`[data-seg="${highlight}"]`)?.scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" })
  }, [highlight])
  return (
    <div ref={root} className={cn("flex flex-col gap-3", className)}>
      <p className="text-13 leading-7 whitespace-pre-line text-muted-foreground">
        {release.excerpt.map((seg, i) => {
          if (!seg.id) return <span key={i}>{seg.text}</span>
          const cand = candidates?.find((c) => c.segmentId === seg.id)
          const lit = highlight === seg.id
          if (cand && onPick)
            return (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <button
                    data-seg={seg.id}
                    type="button"
                    onClick={() => onPick(cand)}
                    aria-label={`Use ${seg.text}, ${cand.label}`}
                    className={cn(
                      "focus-ring rounded px-1 py-0.5 font-medium text-foreground tabular-nums underline decoration-dotted decoration-primary underline-offset-4 transition-colors hover:bg-primary-soft hover:text-primary",
                      lit && (seg.id === wrongSegment ? "bg-destructive/15 text-destructive decoration-destructive" : "bg-primary-soft text-primary"),
                      seg.id === rightSegment && !lit && "decoration-solid",
                    )}
                  >
                    {seg.text}
                  </button>
                </TooltipTrigger>
                <TooltipContent>Use {seg.text} ({cand.label})</TooltipContent>
              </Tooltip>
            )
          return (
            <mark key={i} data-seg={seg.id} className={cn("rounded bg-transparent px-0.5 text-foreground tabular-nums transition-colors", lit && "bg-primary-soft text-primary ring-1 ring-primary/40")}>
              {seg.text}
            </mark>
          )
        })}
      </p>
      <Button asChild variant="link" size="sm" className="h-auto min-h-6 gap-1 self-start px-0 text-xs has-[>svg]:px-0">
        <a href={release.filingUrl} target="_blank" rel="noopener noreferrer">
          Open the {release.fiscalLabel} 8-K on SEC.gov <ExternalLink className="size-3" aria-hidden /><span className="sr-only">(opens in a new tab)</span>
        </a>
      </Button>
    </div>
  )
}
