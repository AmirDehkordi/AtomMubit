import { Check, ChevronDown, CircleCheck, Clock, Plus, TriangleAlert } from "lucide-react"
import { useRef } from "react"
import { statusTone } from "@/components/common/StatusChip"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { effectiveFields, useApp } from "@/state/app"

/** The status chips' icons, so a company's state never rests on colour alone. */
const TONE = {
  issue: { icon: TriangleAlert, cls: "text-destructive", label: "needs you" },
  wait: { icon: Clock, cls: "text-subtle-foreground", label: "waiting for SEC" },
  ok: { icon: CircleCheck, cls: "text-success", label: "all checked" },
} as const

/** The current company as a menu: switch between tracked companies, or track another one from the chat. */
export function CompanySwitcher() {
  const { project, release, mode, select, prefill } = useApp()
  // A company's dot covers every release it has, so nothing that needs the analyst is hidden.
  const toneOf = (ids: string[]) =>
    statusTone(ids.flatMap((id) => (project.releases[id] ? effectiveFields(project.releases[id], mode, project.corrections).map((f) => f.status) : [])))
  const current = project.companies.find((c) => c.ticker === release?.ticker)
  const others = project.companies.filter((c) => c !== current)
  const othersNeedYou = others.some((c) => toneOf(c.releaseIds) === "issue")
  // "Track another company" hands focus to the chat box, so the menu mustn't take it back to its trigger.
  const toChat = useRef(false)

  return (
    // Not modal: the page behind stays in the accessibility tree; Esc, Tab and an outside click still close it.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 shrink-0 gap-2 px-2" aria-label={`Company: ${current?.name ?? "none"}.${othersNeedYou ? " Another company needs you." : ""} Switch or track another`}>
          <span className="text-sm font-semibold text-foreground tabular-nums">{current?.ticker}</span>
          <span className="text-13 font-normal text-muted-foreground">{current?.name}</span>
          <span className="relative">
            <ChevronDown className="size-4 text-subtle-foreground" />
            {othersNeedYou && <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-destructive" aria-hidden />}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64" onCloseAutoFocus={(e) => { if (toChat.current) { e.preventDefault(); toChat.current = false } }}>
        <DropdownMenuLabel className="text-xs font-normal text-subtle-foreground">Tracked companies</DropdownMenuLabel>
        {project.companies.map((c) => {
          const tone = TONE[toneOf(c.releaseIds)]
          return (
            <DropdownMenuItem key={c.ticker} onSelect={() => select(c.releaseIds[0])} className="gap-2">
              <span className="w-11 font-semibold text-foreground tabular-nums">{c.ticker}</span>
              <span className="truncate text-muted-foreground">{c.name}</span>
              <span className="ml-auto flex items-center gap-2">
                <tone.icon className={cn("size-3.5", tone.cls)} aria-hidden />
                <span className="sr-only">, {tone.label}</span>
                <Check className={cn("size-4", c === current ? "opacity-100" : "opacity-0")} aria-hidden />
              </span>
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => { toChat.current = true; prefill("Track ") }} className="gap-2 text-muted-foreground">
          <Plus /> Track another company
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
