import { cn } from "@/lib/utils"

/** An auditor's tick mark: the sign put next to a figure once it has been checked. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-5 text-primary", className)} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3.5 12.5 9 18 20.5 5" />
    </svg>
  )
}

/** Kept until the top bar's import is renamed. */
export const AtomMark = LogoMark

export function Wordmark({ large }: { large?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark className={large ? "size-7" : undefined} />
      <span className={cn("font-semibold tracking-tight text-foreground", large ? "text-xl" : "text-sm")}>Tickmark</span>
    </span>
  )
}
