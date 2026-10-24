import { ArrowUp, Paperclip } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group"
import { useApp } from "@/state/app"

export function Composer({ placeholder, autoFocus }: { placeholder: string; autoFocus?: boolean }) {
  const { ask, upload, draft } = useApp()
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) area.current?.focus()
  }, [autoFocus])

  // Text handed over from elsewhere, such as "Track " from the company menu: fill the box, cursor at the end.
  useEffect(() => {
    if (!draft) return
    setText(draft.text)
    const t = setTimeout(() => {
      const el = area.current
      el?.focus()
      el?.setSelectionRange(draft.text.length, draft.text.length)
    }, 60)
    return () => clearTimeout(t)
  }, [draft])

  async function send(value = text) {
    const q = value.trim()
    if (!q || busy) return
    setText("")
    setBusy(true)
    try {
      await ask(q)
    } finally {
      setBusy(false)
    }
  }

  return (
    <InputGroup className="bg-muted">
      <input
        ref={file}
        type="file"
        accept=".pdf,.htm,.html,.txt"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          if (f) {
            setBusy(true)
            try { await upload(f) } finally { setBusy(false) }
          }
        }}
      />
      <InputGroupTextarea
        ref={area}
        id="composer"
        rows={1}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            void send()
          }
        }}
        className="max-h-52 min-h-10 text-13"
        aria-label="Message"
      />
      <InputGroupAddon align="block-end">
        <InputGroupButton variant="ghost" size="icon-xs" aria-label="Upload an earnings release" onClick={() => file.current?.click()}>
          <Paperclip />
        </InputGroupButton>
        <InputGroupButton variant="default" size="icon-xs" className="ml-auto rounded-md" aria-label="Send" disabled={!text.trim() || busy} onClick={() => void send()}>
          <ArrowUp />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}
