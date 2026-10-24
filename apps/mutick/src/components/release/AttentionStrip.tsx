import { CircleCheck, TriangleAlert } from "lucide-react"
import type { Field, FieldKey } from "@/api/types"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item"
import { fmtValue, inSentence } from "@/lib/format"
import { cn } from "@/lib/utils"
import { AnimatePresence, motion } from "motion/react"

/** What needs the analyst, before anything else on the release. The only red on the page. */
export function AttentionStrip({ fields, fixing, onFix }: { fields: Field[]; fixing?: FieldKey; onFix: (k: FieldKey) => void }) {
  const flagged = fields.filter((f) => f.status === "flagged")
  const waiting = fields.filter((f) => f.status === "waiting").length
  if (flagged.length === 0)
    return (
      // Polite, and focusable so focus can land here once the last fix is saved.
      <Alert className="py-3" role="status" tabIndex={-1} data-needs-you>
        <CircleCheck className="text-success" />
        <AlertDescription className="text-13">
          {waiting ? (
            <span><span className="text-foreground">Nothing needs you.</span> {waiting} of {fields.length} numbers are waiting for the 10-Q.</span>
          ) : (
            <span><span className="text-foreground">All {fields.length} numbers checked.</span> Nothing needs you.</span>
          )}
        </AlertDescription>
      </Alert>
    )
  return (
    // A region you can jump to, not an alert: the toast announces each fix, so the box needn't shout on every change.
    <Alert variant="danger" className="block p-0" role="region" aria-labelledby="needs-you-title" tabIndex={-1} data-needs-you>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-4 pt-3 pb-2">
        <TriangleAlert className="size-4 text-destructive" aria-hidden />
        <h2 id="needs-you-title" data-slot="alert-title" className="text-sm font-semibold tracking-tight">
          {flagged.length} {flagged.length === 1 ? "number needs" : "numbers need"} you
        </h2>
        <AlertDescription className="text-xs text-subtle-foreground">{waiting ? "Everything else passed or is waiting for the 10-Q." : "Everything else passed."}</AlertDescription>
      </div>
      <ItemGroup>
        <AnimatePresence initial={false}>
          {flagged.map((f, i) => (
            // A fixed row folds away rather than vanishing, so the eye follows what changed.
            <motion.div key={f.key} role="listitem" exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease: "easeOut" }} className="overflow-hidden">
              {i > 0 && <ItemSeparator className="bg-destructive/25" />}
              {/* The whole row is the mouse target, since the fix panel can cover the button; the button is the keyboard one. */}
              <Item size="sm" className={cn("cursor-pointer rounded-none px-4 py-2.5 transition-colors hover:bg-destructive/5", fixing === f.key && "bg-muted")} onClick={() => onFix(f.key)}>
                {/* On a narrow screen the message drops under the number instead of being cut off. */}
                <ItemContent className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
                  <ItemTitle className="w-40 shrink-0 text-13">{f.label}</ItemTitle>
                  <span className="w-24 shrink-0 text-right text-13 text-destructive tabular-nums">{fmtValue(f)}</span>
                  <ItemDescription className="min-w-48 flex-1 text-xs line-clamp-none">{f.check?.message}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button size="sm" variant={fixing === f.key ? "secondary" : "default"} className="h-8 px-3 text-xs" aria-label={`${fixing === f.key ? "Fixing" : "Fix"} ${inSentence(f.label)}`} data-fix={f.key} onClick={(e) => { e.stopPropagation(); onFix(f.key) }}>
                    {fixing === f.key ? "Fixing" : "Fix"}
                  </Button>
                </ItemActions>
              </Item>
            </motion.div>
          ))}
        </AnimatePresence>
      </ItemGroup>
    </Alert>
  )
}
