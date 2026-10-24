import { motion, useReducedMotion } from "motion/react"
import { useEffect, useRef } from "react"
import { Composer } from "@/components/chat/Composer"
import { Thread } from "@/components/chat/Thread"
import { Wordmark } from "@/components/common/Wordmark"
import { Button } from "@/components/ui/button"
import { useApp } from "@/state/app"

const EXAMPLES = ["Track NVIDIA", "Track Microsoft"]
const EASE = [0.22, 1, 0.36, 1] as const

/**
 * Before anything is tracked: the name, one box and two examples, centred. Once a message is sent the
 * box moves to the bottom in one step and stays there; the steps grow above it, like a chat.
 * When tracking finishes, this whole column glides into the right-hand assistant (shared layoutId "chat").
 */
export function StartScreen() {
  const { messages, ask } = useApp()
  const reduce = useReducedMotion()
  const empty = messages.length === 0
  const busy = messages.some((m) => m.role === "progress" && !m.done)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: reduce ? "auto" : "smooth" })
  }, [messages, reduce])

  const layout = reduce ? { duration: 0 } : { duration: 0.45, ease: EASE }

  return (
    <main className="flex h-screen w-full justify-center bg-background px-4">
      <motion.div layoutId="chat" transition={layout} className="flex h-full w-full max-w-2xl flex-col py-8">
        <h1 className="sr-only">Tickmark</h1>
        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-end gap-3 pb-6 text-center">
            <Wordmark large />
            <p className="text-sm text-muted-foreground">Track earnings releases. Checks flag the AI's mistakes, and Mubit learns from your fixes.</p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto pb-4 [scrollbar-gutter:stable]">
            {/* Push a short thread to the bottom so it sits right above the box. */}
            <div className="flex min-h-full flex-col justify-end">
              <Thread messages={messages} />
              <div ref={end} />
            </div>
          </div>
        )}
        <motion.div layout="position" transition={layout} className="flex shrink-0 flex-col gap-3">
          <Composer placeholder="Track a company, or upload an earnings release" autoFocus />
          {!busy && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {EXAMPLES.map((ex) => (
                <Button key={ex} variant="outline" size="sm" className="h-7 rounded-full text-xs text-muted-foreground hover:text-primary dark:hover:border-primary" onClick={() => void ask(ex)}>
                  {ex}
                </Button>
              ))}
            </div>
          )}
        </motion.div>
        {empty && <div className="flex-1" aria-hidden />}
      </motion.div>
    </main>
  )
}
