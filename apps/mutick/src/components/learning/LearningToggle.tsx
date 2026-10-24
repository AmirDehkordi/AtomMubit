import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useApp } from "@/state/app"
import type { Mode } from "@/api/types"

export function LearningToggle() {
  const { mode, setMode } = useApp()
  return (
    <div className="flex items-center gap-2">
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(v) => v && setMode(v as Mode)}
        className="h-8 rounded-lg bg-muted p-0.5"
        aria-label="Show results before or after learning"
      >
        <ToggleGroupItem value="before" className="h-7 rounded-md px-3 text-xs data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:inset-ring data-[state=on]:inset-ring-foreground/50">
          Before
        </ToggleGroupItem>
        <ToggleGroupItem value="after" className="h-7 rounded-md px-3 text-xs data-[state=on]:bg-primary-soft data-[state=on]:text-primary data-[state=on]:inset-ring data-[state=on]:inset-ring-primary/60">
          After
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}
