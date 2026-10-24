import { motion } from "motion/react"
import type { CSSProperties } from "react"
import { ReleaseView } from "@/components/release/ReleaseView"
import { ChatSidebar } from "@/components/shell/ChatPanel"
import { TopBar } from "@/components/shell/TopBar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { useApp } from "@/state/app"

/**
 * The page and the assistant. The assistant is a right-hand shadcn Sidebar; the provider's open
 * state is the chat's: expanded chat, or its icon rail.
 */
export function AppShell() {
  const { chatOpen, setChat, workspaceTouched } = useApp()
  return (
    <SidebarProvider
      open={chatOpen}
      onOpenChange={setChat}
      className="h-screen overflow-hidden"
      style={{ "--sidebar-width": "400px", "--sidebar-width-icon": "3rem" } as CSSProperties}
    >
      {/* First Tab stop: past the top bar to the release. */}
      <a href="#release" className="focus-ring sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to the release
      </a>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15, ease: "easeOut" }} className="flex min-w-0 flex-1" onPointerDownCapture={workspaceTouched}>
        <SidebarInset className="@container/col min-w-0">
          <TopBar />
          <ScrollArea className="min-h-0 flex-1">
            <div className="@container">
              <ReleaseView />
            </div>
          </ScrollArea>
        </SidebarInset>
      </motion.div>
      <ChatSidebar />
    </SidebarProvider>
  )
}
