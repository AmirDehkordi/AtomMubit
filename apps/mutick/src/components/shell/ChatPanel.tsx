import { MessageSquareText, X } from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useRef } from "react"
import { Composer } from "@/components/chat/Composer"
import { Thread } from "@/components/chat/Thread"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, useSidebar } from "@/components/ui/sidebar"
import { inSentence } from "@/lib/format"
import { useApp } from "@/state/app"


/** Companies this build can track; untracked ones show as suggestions. */
const TRACK_EXAMPLES = ["Track NVIDIA", "Track Microsoft"]

/** The assistant as a right-hand shadcn Sidebar. Expanded it's the chat; collapsed it's an icon rail. */
export function ChatSidebar() {
  const { messages, chatOpen, setChat, ask, unread, release, fields, project } = useApp()
  // Suggestions follow the release: one per number that needs you, then two general ones. Asked ones drop off.
  const asked = new Set(messages.flatMap((m) => (m.role === "user" ? [m.text] : [])))
  const busy = messages.some((m) => m.role === "thinking" || (m.role === "progress" && !m.done))
  const suggestions = release && !busy
    ? [
        ...fields.filter((f) => f.status === "flagged").map((f) => `Why was ${f.key === "fiscal_quarter" ? "the " : ""}${inSentence(f.label)} flagged?`),
        ...TRACK_EXAMPLES.filter((t) => !project.companies.some((c) => t.endsWith(c.name))),
        "How did revenue change on last year?",
        "What changes after learning?",
      ].filter((s) => !asked.has(s)).slice(0, 3)
    : []
  const { state, isMobile, openMobile, setOpenMobile } = useSidebar()
  const collapsed = state === "collapsed"
  // Below md the sidebar is a sheet with its own open state; keep it and the chat state in step.
  useEffect(() => {
    if (isMobile) setOpenMobile(chatOpen)
  }, [isMobile, chatOpen, setOpenMobile])
  useEffect(() => {
    if (isMobile && !openMobile) setChat(false)
    // Only a change in the sheet's own state should close the chat.
  }, [openMobile])
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" })
  }, [messages])

  return (
    <Sidebar side="right" collapsible="icon" className="border-l" role="complementary" aria-label="Assistant">
      {collapsed ? (
        <SidebarContent className="items-center py-3">
          <Button variant="ghost" size="icon" className="relative size-9 text-muted-foreground hover:text-primary" aria-label={unread ? "Open assistant, new messages" : "Open assistant"} onClick={() => setChat(true)}>
            <MessageSquareText />
            {unread && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary" aria-hidden />}
          </Button>
          <span className="mt-3 text-xs tracking-wide text-subtle-foreground [writing-mode:vertical-rl]" aria-hidden>Assistant</span>
        </SidebarContent>
      ) : (
        <motion.div layoutId="chat" transition={{ duration: 0.3, ease: "easeOut" }} className="flex h-full min-h-0 flex-col">
          <SidebarHeader className="h-14 flex-row items-center border-b px-4">
            <h2 className="text-sm font-semibold text-foreground">Assistant</h2>
            <Button variant="ghost" size="icon" className="ml-auto size-7" aria-label="Close assistant" onClick={() => setChat(false)}>
              <X />
            </Button>
          </SidebarHeader>
          <SidebarContent className="min-h-0">
            <ScrollArea className="h-full">
              <div className="p-4">
                <Thread messages={messages} />
                <div className="mt-4 flex flex-col items-start gap-2">
                  {suggestions.map((s) => (
                    <Button key={s} variant="outline" size="sm" className="h-7 rounded-full text-xs font-normal text-muted-foreground hover:text-primary dark:hover:border-primary" onClick={() => void ask(s)}>
                      {s}
                    </Button>
                  ))}
                </div>
                <div ref={end} />
              </div>
            </ScrollArea>
          </SidebarContent>
          <SidebarFooter className="border-t p-3">
            <Composer placeholder="Ask about a number, or track another company" />
          </SidebarFooter>
        </motion.div>
      )}
    </Sidebar>
  )
}
