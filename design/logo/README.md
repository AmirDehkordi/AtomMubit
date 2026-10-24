# MuTick logo options

Six candidate marks to replace the current `BrandMark`. Each is a hand-written SVG on a 24×24 grid, drawn in `currentColor` with no gradients and no second colour, so it takes on `text-muted` grey the way the current mark does.

Open `preview.html` in a browser to see every mark at 16, 24 and 48px, in grey and off-white, on ink and panel, and in a mock of the chat toolbar. The SVG files are the source: after you edit one, run `node design/logo/build.mjs` to rebuild the preview. `screenshot-cards.jpg` and `screenshot-toolbar.jpg` are captures of the preview.

## The options

| File | Idea |
| --- | --- |
| `00-current.svg` | The baseline: a filled circle with a ✓ cut out. Clear, but it reads as a generic "success" badge, and it is heavier than the 14px label beside it. |
| `01-mu-tick.svg` | μ + tick, spelled out: a μ whose right stroke leaves the bowl and runs on as a long tick arm. It is the most literal version of the name, but at 16px it can read as a handwritten "u". |
| `02-ticked-box.svg` | An analyst's hand tick that overshoots its box: the outline breaks where the tick leaves the corner. It reads instantly, but it is the closest to a to-do app's checkbox. |
| `03-bar-tick.svg` | A tick built from rising bars: four bars whose slanted tops trace a ✓, so numbers and checking are one shape. At 48px it works; at 16px it reads as signal bars. This is the weakest option. |
| `04-m-tick.svg` | Monogram: an M whose middle is a tick (short left stem, long right arm). It is a single stroke, as plain as Grok's slash-through-circle. **Recommended.** |
| `05-data-point.svg` | A tick that ends on a solid dot, like the last point on a line chart: "this figure is checked". Friendly, but the dot also makes it look like a pin or a lollipop. |
| `06-totals-rule.svg` | A tick over a double rule, the line an accountant draws under a total once it agrees. It is the most finance-native option, but the two rules sit only about 1px apart at 16px. |

## Recommendation: 4 · M tick

- **It says "checked" without looking like a status icon.** The tick sits inside a letterform, so it can't be confused with a green "done" badge or a checkbox, which is the main weakness of the current mark.
- **It ties the mark to the name.** The M opens the word "MuTick" and the tick closes it, so the mark means something beside the label and on its own (favicon, avatar).
- **It is as simple as the brief asks.** One path, one stroke weight, no container. At 18px its weight matches the 14px Inter Medium "MuTick" label better than the solid disc does.
- **It holds up at 16px.** Two vertical stems and one V leave nothing to blur together.
- **It looks nothing like Mubit.** Mubit's mark is a filled block of diagonal stripes. This is a single open line, so the label and the Mubit button next to each other no longer look like two arrows.

Runner-up: **6 · Totals rule**, if you want the most finance-specific idea and can accept the tighter detail at 16px.

## Drop-in `BrandMark` (not applied)

This replaces `BrandMark` in `apps/web/components/brand.tsx`. The API and box size stay the same (a `size-7` span, 18px glyph, `text-muted`), so the call sites (`<BrandMark className="size-6" />` in `app/p/[projectId]/page.tsx` and `components/empty-desk.tsx`) don't change. The new mark needs no mask, so remove the `useId` import if nothing else in the file uses it.

```tsx
import { cn } from '@/lib/cn';

/** The desk's mark: an M whose middle is a tick, the ✓ an analyst puts next to a number once it is checked. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn('text-muted grid size-7 shrink-0 place-items-center', className)} aria-hidden>
      <svg
        viewBox="0 0 24 24"
        className="size-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 19v-8.5l5.5 5.5L20 5v14" />
      </svg>
    </span>
  );
}
```

To try another option instead, keep the same `<svg>` wrapper and swap in the body of its file. In JSX, write attributes in camelCase (`stroke-width` becomes `strokeWidth`). Option 2 uses a `<mask>`, so give it a `useId()` id the way the current mark does.

## Notes

- The line marks use `stroke="currentColor"` with round caps, and the bar mark uses `fill="currentColor"`. Both follow the text colour, so `text-muted`, `text-text` and hover colours all work as they do now.
- The stroke width is 2.25 on the 24 grid: about 1.7px at 18px and 1.5px at 16px, close to the stem weight of Inter Medium at 14px.
