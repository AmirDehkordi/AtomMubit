import { CircleCheck, Clock, ExternalLink, Loader2, TriangleAlert } from "lucide-react"
import type { Answer, ProgressStep } from "@/api/types"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import type { Message } from "@/state/app"
import { cn } from "@/lib/utils"

/** The conversation as a polite log: new messages, pipeline steps and answers are read out as they arrive. */
export function Thread({ messages }: { messages: Message[] }) {
  return (
    <div className="flex flex-col gap-4" role="log" aria-live="polite" aria-label="Conversation">
      {messages.map((m) => {
        if (m.role === "user")
          return (
            <div key={m.id} className="ml-auto max-w-[85%] rounded-lg rounded-br-sm bg-muted px-3 py-2 text-13 text-foreground">
              <span className="sr-only">You: </span>{m.text}
            </div>
          )
        if (m.role === "progress") return <ProgressTrace key={m.id} steps={m.steps} done={m.done} error={m.error} />
        if (m.role === "thinking") return <Thinking key={m.id} />
        return <AssistantAnswer key={m.id} answer={m.answer} />
      })}
    </div>
  )
}

function Thinking() {
  return (
    <p className="flex items-center gap-2 px-1 py-2 text-13 text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" aria-hidden />
      Looking at the checks…
    </p>
  )
}

/** What the pipeline is doing next, by how many steps have finished (see trackCompany in the client). */
const NEXT_STEP = ["Finding the filing on SEC EDGAR…", "Reading the press release…", "Extracting the numbers…", "Checking the arithmetic…", "Checking against SEC filings…", "Adding earlier quarters…"]

const TONE = {
  ok: { icon: CircleCheck, cls: "text-success" },
  issue: { icon: TriangleAlert, cls: "text-destructive" },
  wait: { icon: Clock, cls: "text-subtle-foreground" },
} as const

export function ProgressTrace({ steps, done, error }: { steps: ProgressStep[]; done: boolean; error?: string }) {
  return (
    <Card className="gap-0 py-1">
      <CardContent className="px-1">
        <ItemGroup>
          {steps.map((s) => {
            const t = TONE[s.tone ?? "ok"]
            const Icon = t.icon
            return (
              <Item key={s.id} role="listitem" size="sm" className="items-start gap-2 px-2 py-1.5 animate-in fade-in slide-in-from-bottom-1 duration-150">
                <ItemMedia className="pt-0.5"><Icon className={cn("size-3.5", t.cls)} aria-hidden /></ItemMedia>
                <ItemContent className="min-w-0 gap-0">
                  <ItemTitle className="text-13 font-normal">
                    {s.href ? (
                      <a href={s.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-primary">
                        {s.label} <ExternalLink className="size-3" aria-hidden /><span className="sr-only">(opens in a new tab)</span>
                      </a>
                    ) : s.label}
                  </ItemTitle>
                  {s.detail && <ItemDescription className="truncate text-xs text-subtle-foreground">{s.detail}</ItemDescription>}
                </ItemContent>
              </Item>
            )
          })}
          {!done && (
            <Item role="listitem" size="sm" className="gap-2 px-2 py-1.5">
              <ItemMedia><Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden /></ItemMedia>
              <ItemContent><ItemTitle className="text-13 font-normal text-muted-foreground">{NEXT_STEP[steps.length] ?? "Checking the numbers…"}</ItemTitle></ItemContent>
            </Item>
          )}
        </ItemGroup>
        {error && <p className="px-2 pb-2 text-13 text-warning">{error}</p>}
      </CardContent>
    </Card>
  )
}

function AssistantAnswer({ answer }: { answer: Answer }) {
  return (
    <div className="text-13 leading-relaxed text-foreground">
      <p><span className="sr-only">Assistant: </span>{answer.text}</p>
      {answer.citations.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {answer.citations.map((c) => (
            <li key={c.label}>
              {c.href ? (
                <Badge asChild variant="outline" className="bg-muted text-primary tabular-nums hover:bg-primary-soft">
                  <a href={c.href} target="_blank" rel="noreferrer">{c.label} <ExternalLink aria-hidden /><span className="sr-only">(opens in a new tab)</span></a>
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-muted text-muted-foreground">{c.label}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
      {answer.trace.length > 0 && (
        <Accordion type="single" collapsible className="mt-2">
          <AccordionItem value="trace">
            <AccordionTrigger className="py-1.5 text-xs font-medium text-muted-foreground">How this was checked · {answer.trace.length}</AccordionTrigger>
            <AccordionContent>
              <ol className="space-y-1.5">
                {answer.trace.map((t, i) => (
                  <li key={i} className="flex items-center gap-2 text-13">
                    <span className="text-subtle-foreground tabular-nums">{i + 1}</span>
                    <span className="text-foreground">{t.label}</span>
                    <Badge variant="secondary" className="text-subtle-foreground">{t.detail}</Badge>
                  </li>
                ))}
              </ol>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  )
}
