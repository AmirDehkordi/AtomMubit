import { Info } from "lucide-react"
import type { ReactNode } from "react"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** A titled section: shadcn Card with a small uppercase title (an h2), an optional "i" note and actions. */
export function Panel({ title, info, actions, children, className }: { title?: ReactNode; info?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("gap-3 py-4", className)}>
      {(title || actions) && (
        <CardHeader className="px-4">
          {title && (
            <CardTitle className="flex min-h-6 items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <h2>{title}</h2>
              {info && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    {/* The padding and negative margin give a 24px target without moving the icon. */}
                    <button type="button" aria-label={typeof title === "string" ? `About ${title}` : "About this panel"} className="focus-ring -m-[5px] rounded p-[5px] text-subtle-foreground hover:text-muted-foreground">
                      <Info className="size-3.5" aria-hidden />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs normal-case tracking-normal">{info}</TooltipContent>
                </Tooltip>
              )}
            </CardTitle>
          )}
          {actions && <CardAction className="flex items-center gap-2">{actions}</CardAction>}
        </CardHeader>
      )}
      <CardContent className="min-h-0 flex-1 px-4">{children}</CardContent>
    </Card>
  )
}

