import { LayoutGroup, MotionConfig } from "motion/react"
import { AppShell } from "@/components/shell/AppShell"
import { StartScreen } from "@/components/start/StartScreen"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppProvider, useApp } from "@/state/app"

function Screens() {
  const { phase } = useApp()
  return phase === "workspace" ? <AppShell /> : <StartScreen />
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={300}>
        <AppProvider>
          <LayoutGroup>
            <Screens />
          </LayoutGroup>
          <Toaster position="bottom-left" />
        </AppProvider>
      </TooltipProvider>
    </MotionConfig>
  )
}
