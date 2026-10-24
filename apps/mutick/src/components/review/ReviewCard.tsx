import { ArrowLeft, ArrowRight, TriangleAlert, X } from "lucide-react"
import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import type { Candidate, Field } from "@/api/types"
import { RULES } from "@/api/types"
import { SourceExcerpt } from "@/components/release/SourceExcerpt"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { Separator } from "@/components/ui/separator"
import { fmtValue, inSentence } from "@/lib/format"
import { useApp, type ReviewItem } from "@/state/app"
import { cn } from "@/lib/utils"

/**
 * One flagged number for an analyst to settle, in the slide-in fix panel. It asks one question,
 * "which number is right?", with the number that matches the check as the main action.
 * Typing a value or keeping the AI's value are the quieter ways out at the bottom.
 * Shortcuts only act while this card has focus, so a stray key elsewhere never makes a correction,
 * and never from a text field. Enter picks the highlighted number; K keeps the AI's value.
 * One save per card: after the first pick, further clicks and keys are ignored until it closes.
 */
export function ReviewCard({ item, next, onNext, onClose }: { item: ReviewItem; next?: Field; onNext?: () => void; onClose?: () => void }) {
  const { correct } = useApp()
  const { release, field } = item
  const [mode, setMode] = useState<"choose" | "type" | "keep">("choose")
  const [typed, setTyped] = useState("")
  const [source, setSource] = useState("")
  const [reason, setReason] = useState("")
  const [hover, setHover] = useState<string>()
  // Set on a submit with empty fields; each clears as soon as its field is typed in.
  const [errors, setErrors] = useState<{ value?: string; source?: string; reason?: string }>({})
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const root = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const sourceRef = useRef<HTMLInputElement>(null)
  const rule = field.rule
  const options = field.candidates ?? []
  // The check names the right value; when exactly one option differs from the AI's answer, that's the one it points to.
  const others = options.filter((c) => c.value !== field.value)
  const suggested = others.length === 1 ? others[0].segmentId : undefined
  const suggestedOption = options.find((c) => c.segmentId === suggested)
  const aiSegment = options.find((c) => c.value === field.value)?.segmentId
  const aiValue = fmtValue(field)
  const numeric = field.unit === "usd_m" || field.unit === "shares_m" || field.unit === "usd_per_share"

  useEffect(() => {
    root.current?.focus({ preventScroll: true })
  }, [])

  const save = (to: number | string, why?: string) => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    void correct(release, field.key, field.value, to, rule, why)
  }
  const keep = () => { setMode("keep"); focusInput() }
  const focusInput = () => setTimeout(() => inputRef.current?.focus(), 0)
  const back = () => { setMode("choose"); setErrors({}); root.current?.focus() }
  const pick = (c: Candidate) => {
    if (mode === "type") {
      // While typing, clicking a number in the release fills the value and records where it came from.
      setTyped(String(c.value))
      setSource(`Release text: ${c.label}`)
      setErrors({})
      return
    }
    // The AI's own number failed the check, so keeping it needs a reason, like "Keep".
    if (c.value === field.value) return keep()
    save(c.value, `Picked from the release: ${c.label}`)
  }
  /** A number for money and share fields, or null when the text isn't one; any text for labels. */
  const parsed = (): number | string | null => {
    const t = typed.trim()
    const n = Number(t.replace(/[$,]/g, "").replace("−", "-"))
    const isNumber = /^[−-]?\$?[\d,]*\.?\d+$/.test(t) && Number.isFinite(n)
    return isNumber ? n : numeric ? null : t
  }

  const submitTyped = () => {
    const value = parsed()
    const errs = {
      value: !typed.trim() ? "Type the right value." : value === null ? `Enter a number, for example ${field.unit === "usd_per_share" ? "1.17" : "52940"}.` : undefined,
      source: source.trim() ? undefined : "Say where the value comes from.",
    }
    setErrors(errs)
    if (errs.value) inputRef.current?.focus()
    else if (errs.source) sourceRef.current?.focus()
    else if (value !== null) save(value, source.trim())
  }
  const submitKeep = () => {
    if (!reason.trim()) { setErrors({ reason: `Say why ${aiValue} is right.` }); inputRef.current?.focus(); return }
    if (field.value !== null) save(field.value, reason.trim())
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    const target = e.target as HTMLElement
    // Text fields keep every key.
    if (target.closest('input, textarea, select, [contenteditable="true"], [role="listbox"], [role="option"]')) {
      if (e.key === "Escape") root.current?.focus()
      return
    }
    // On a button or link, Enter and Space press it; the number and letter shortcuts still work.
    if ((e.key === "Enter" || e.key === " ") && target.closest("button, a[href]")) return
    if (e.key === "Escape" && onClose) onClose()
    else if (mode !== "choose" || savingRef.current) return
    else if (e.key === "Enter") { e.preventDefault(); if (suggestedOption) pick(suggestedOption) }
    else if (e.key === "k" || e.key === "K") { e.preventDefault(); keep() }
    else if (e.key === "e" || e.key === "E") { e.preventDefault(); setMode("type"); focusInput() }
    else if (/^[1-9]$/.test(e.key)) { const c = options[Number(e.key) - 1]; if (c) pick(c) }
  }

  return (
    <Card
      ref={root as React.Ref<HTMLDivElement>}
      role="region"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="h-full gap-0 overflow-hidden rounded-none border-0 py-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
      aria-label={`Fix ${field.label} for ${release.ticker} ${release.fiscalLabel}`}
    >
      <div className="flex items-start gap-3 border-b px-4 py-3">
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold text-foreground">Fix {inSentence(field.label)}</span>
          <span className="text-xs text-subtle-foreground tabular-nums">{release.ticker} · {release.fiscalLabel}</span>
        </span>
        {onClose && <Button variant="ghost" size="icon" className="ml-auto size-7" aria-label="Close" aria-keyshortcuts="Escape" onClick={onClose}><X className="size-4" /></Button>}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
        {field.check && (
          <p className="flex gap-2 text-13 leading-6 text-foreground">
            <TriangleAlert className="mt-1 size-3.5 shrink-0 text-destructive" aria-hidden />
            <span>{field.check.message}</span>
          </p>
        )}

        {mode === "choose" && (
          <section className="flex flex-col gap-2" aria-labelledby={`q-${field.key}`}>
            <h3 id={`q-${field.key}`} className="text-sm font-semibold text-foreground">Which number is right?</h3>
            {options.map((c, i) => {
              const isAi = c.value === field.value
              const isSuggested = c.segmentId === suggested
              return (
                <Button
                  key={c.segmentId}
                  variant={isSuggested ? "default" : "outline"}
                  className="h-auto justify-between gap-3 px-3 py-2.5 text-left"
                  disabled={saving}
                  aria-keyshortcuts={isSuggested ? `${i + 1} Enter` : String(i + 1)}
                  onClick={() => pick(c)}
                  onMouseEnter={() => setHover(c.segmentId)}
                  onMouseLeave={() => setHover(undefined)}
                  onFocus={() => setHover(c.segmentId)}
                  onBlur={() => setHover(undefined)}
                >
                  <span className="flex min-w-0 flex-col items-start gap-0.5">
                    <span className="text-base font-semibold tabular-nums">{fmtValue({ unit: field.unit, value: c.value })}</span>
                    <span className={cn("text-xs font-normal whitespace-normal", isSuggested ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {c.label}{isAi ? " · the AI's answer, asks why" : isSuggested ? " · matches the check" : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-1" aria-hidden>
                    {isSuggested && <Kbd className="bg-primary-foreground/15 text-primary-foreground">Enter</Kbd>}
                    <Kbd className={cn(isSuggested && "bg-primary-foreground/15 text-primary-foreground")}>{i + 1}</Kbd>
                  </span>
                </Button>
              )
            })}
            <p className="text-xs text-subtle-foreground">
              Picking saves the fix and teaches the model{rule ? `, using rule ${rule} (${RULES[rule].title})` : ""}.
            </p>
          </section>
        )}

        {mode === "type" && (
          <form className="flex flex-col gap-3" noValidate onSubmit={(e) => { e.preventDefault(); submitTyped() }}>
            <h3 className="text-sm font-semibold text-foreground">Type the right value</h3>
            <Field className="gap-1">
              <FieldLabel htmlFor={`value-${field.key}`} className="text-xs text-muted-foreground">Value</FieldLabel>
              <Input
                id={`value-${field.key}`} ref={inputRef} value={typed} placeholder="e.g. 1.17" className="h-9 bg-muted text-13 tabular-nums"
                onChange={(e) => { setTyped(e.target.value); setErrors((x) => ({ ...x, value: undefined })) }}
                aria-invalid={!!errors.value || undefined} aria-describedby={errors.value ? `value-${field.key}-error` : undefined}
              />
              {errors.value && <FieldError id={`value-${field.key}-error`} className="text-xs">{errors.value}</FieldError>}
            </Field>
            <Field className="gap-1">
              <FieldLabel htmlFor={`source-${field.key}`} className="text-xs text-muted-foreground">Where it comes from</FieldLabel>
              <Input
                id={`source-${field.key}`} ref={sourceRef} value={source} placeholder="e.g. income statement, line 4" className="h-9 bg-muted text-13"
                onChange={(e) => { setSource(e.target.value); setErrors((x) => ({ ...x, source: undefined })) }}
                aria-invalid={!!errors.source || undefined} aria-describedby={errors.source ? `source-${field.key}-error` : `fill-${field.key}`}
              />
              {errors.source && <FieldError id={`source-${field.key}-error`} className="text-xs">{errors.source}</FieldError>}
            </Field>
            <p id={`fill-${field.key}`} className="text-xs text-subtle-foreground">Both are needed to save. Or pick a number in the release below to fill both.</p>
            <div className="flex gap-2">
              <Button type="submit" size="sm" className="h-9">Save fix</Button>
              <Button type="button" size="sm" variant="ghost" className="h-9" onClick={back}><ArrowLeft /> Back</Button>
            </div>
          </form>
        )}

        {mode === "keep" && (
          <form className="flex flex-col gap-3" noValidate onSubmit={(e) => { e.preventDefault(); submitKeep() }}>
            <h3 className="text-sm font-semibold text-foreground">Keep {aiValue}?</h3>
            <Field className="gap-1">
              <FieldLabel htmlFor={`keep-${field.key}`} className="text-xs font-normal text-muted-foreground">The check failed, so say why {aiValue} is right. This goes in the audit trail.</FieldLabel>
              <Input
                id={`keep-${field.key}`} ref={inputRef} value={reason} placeholder="Why this value is right" className="h-9 bg-muted text-13"
                onChange={(e) => { setReason(e.target.value); setErrors({}) }}
                aria-invalid={!!errors.reason || undefined} aria-describedby={errors.reason ? `keep-${field.key}-error` : undefined}
              />
              {errors.reason && <FieldError id={`keep-${field.key}-error`} className="text-xs">{errors.reason}</FieldError>}
            </Field>
            <div className="flex gap-2">
              <Button type="submit" size="sm" className="h-9">Keep {aiValue}</Button>
              <Button type="button" size="sm" variant="ghost" className="h-9" onClick={back}><ArrowLeft /> Back</Button>
            </div>
          </form>
        )}

        <Separator />
        <section className="flex flex-col gap-2">
          <h3 className="text-xs tracking-wide text-subtle-foreground uppercase">From the release</h3>
          <SourceExcerpt
            release={release}
            highlight={hover ?? field.sourceSegment}
            candidates={options}
            onPick={(c) => { if (!savingRef.current) pick(c) }}
            rightSegment={suggested}
            wrongSegment={aiSegment}
            className="[&_p]:text-xs [&_p]:leading-6"
          />
        </section>
      </div>

      {mode === "choose" && (
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 border-t px-2 py-2">
          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" aria-keyshortcuts="E" disabled={saving} onClick={() => { setMode("type"); focusInput() }}>
            Not listed? Type it <Kbd aria-hidden>E</Kbd>
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" aria-keyshortcuts="K" disabled={saving} onClick={keep}>
            Keep {aiValue} <Kbd aria-hidden>K</Kbd>
          </Button>
          {next && onNext && (
            <Button variant="ghost" size="sm" className="ml-auto h-8 text-xs text-muted-foreground" disabled={saving} onClick={onNext}>
              Next: {inSentence(next.label)} <ArrowRight aria-hidden />
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}
