import { useEffect, useState } from "react"
import { MUBIT_STAGES, type MubitStatus } from "@/api/types"
import { RollingNumber } from "@/components/common/MetricNumber"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { examplesForNextVersion, withSessionFixes } from "@/lib/mubit"
import { useApp } from "@/state/app"

/** The count the analyst saw last time the panel was open, so the next opening can roll from it. */
let lastSeen: number | undefined

const RESULT = { passed: { label: "Passed", variant: "success" }, below_target: { label: "Below target", variant: "danger" }, prompt_only: { label: "Prompt only", variant: "muted" } } as const

/**
 * The only Mubit detail inside the analyst's product: which model answers, how it tested,
 * and how close the next version is. The full mechanism is explained outside the product.
 */
export function MubitPopover() {
  const { mubit } = useApp()
  return mubit ? <MubitPanel mubit={mubit} /> : null
}

function MubitPanel({ mubit }: { mubit: MubitStatus }) {
  const { project } = useApp()
  const m = withSessionFixes(mubit, project.corrections)
  const live = m.versions[m.versions.length - 1]
  const needed = examplesForNextVersion(m)
  const have = Math.min(m.newSinceVersion, needed)
  const target = live?.needs ?? 90
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(have)
  const [gained, setGained] = useState(0)
  // The count when the workspace opened is the baseline, so fixes made before the first opening still show.
  useEffect(() => { lastSeen ??= have }, [])
  // On opening, start at the last count seen and roll to the current one, so new fixes visibly add up.
  useEffect(() => {
    if (!open) return
    const from = lastSeen ?? have
    setShown(from)
    setGained(have - from)
    lastSeen = have
    const t = setTimeout(() => setShown(have), 250)
    return () => clearTimeout(t)
  }, [open, have])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 px-2.5 text-xs font-normal text-muted-foreground hover:text-primary dark:hover:border-primary"
        >
          <span className="size-1.5 rounded-full bg-primary" aria-hidden />
          Mubit {live?.version} · {m.servedShare.mubit}% of calls
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" aria-label={`Mubit ${m.task}`}>
        <div className="flex flex-col gap-1 p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Mubit · {m.task}</span>
            <Badge variant="soft" className="ml-auto">{MUBIT_STAGES.find((s) => s.key === m.stage)?.label}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            The small model {live?.version} answers {m.servedShare.mubit}% of calls. The frontier model answers the rest.
          </p>
        </div>
        <Separator />
        <div className="flex flex-col gap-2 p-4">
          <span className="text-xs text-subtle-foreground">Test accuracy, target {target}%</span>
          {m.versions.map((v) => (
            <div key={v.version} className="flex items-center gap-3 text-13 tabular-nums">
              <span className="w-6 text-muted-foreground">{v.version}</span>
              <span className="font-medium text-foreground">{v.matched}%</span>
              <Badge variant={RESULT[v.result].variant} className="ml-auto">{RESULT[v.result].label}</Badge>
            </div>
          ))}
        </div>
        <Separator />
        <div className="flex flex-col gap-2 p-4">
          <div className="flex items-baseline justify-between text-xs">
            <span className="shrink-0 text-subtle-foreground">Toward {m.nextVersion}</span>
            <span className="shrink-0 text-foreground tabular-nums"><RollingNumber value={shown} /> of {needed} new examples</span>
          </div>
          <Progress value={(shown / needed) * 100} className="h-1.5 [&>*]:duration-700" aria-label={`New examples toward ${m.nextVersion}`} />
          <p className="text-xs text-subtle-foreground">
            {gained > 0 && <span className="text-primary">+{gained} from your fixes. </span>}
            Each fix you save counts as one.{m.sample ? " Sample data." : ""}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
