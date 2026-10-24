import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react"
import { toast } from "sonner"
import * as api from "@/api/client"
import type { Answer, Correction, Field, FieldKey, Mode, MubitStatus, ProgressStep, Project, Release, RuleId } from "@/api/types"
import { emptyProject } from "@/api/mock/data"
import { fmtValue } from "@/lib/format"
import { examplesForNextVersion, withSessionFixes } from "@/lib/mubit"

export type Phase = "start" | "working" | "workspace"
/** Tabs on a company: Amir's Overview, plus the release check. */
export type Tab = "overview" | "check"

export type Message =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "progress"; steps: ProgressStep[]; done: boolean; error?: string }
  | { id: string; role: "assistant"; answer: Answer }
  | { id: string; role: "thinking" }

interface State {
  phase: Phase
  project: Project
  selectedReleaseId?: string
  tab: Tab
  /** The flagged field whose fix panel is open. */
  fixing?: FieldKey
  mode: Mode
  chatOpen: boolean
  messages: Message[]
  highlight?: string
  unread: boolean
  mubit?: MubitStatus
  /** After the first tracking, the first click in the workspace folds the chat away. */
  foldOnInteract: boolean
  /** Text to put in the chat box, for example "Track " from the company menu. `at` makes a repeat count as new. */
  draft?: { text: string; at: number }
}

type Action =
  | { type: "phase"; phase: Phase }
  | { type: "message"; message: Message }
  | { type: "updateMessage"; id: string; patch: Partial<Message> }
  | { type: "removeMessage"; id: string }
  | { type: "addCompany"; result: api.TrackResult }
  | { type: "select"; releaseId: string }
  | { type: "tab"; tab: Tab }
  | { type: "fixing"; field?: FieldKey }
  | { type: "mode"; mode: Mode }
  | { type: "chat"; open: boolean }
  | { type: "highlight"; segment?: string }
  | { type: "correction"; correction: Correction }
  | { type: "mubit"; status: MubitStatus }
  | { type: "foldOnInteract"; on: boolean }
  | { type: "draft"; text: string }

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "phase": return { ...s, phase: a.phase }
    case "message": return { ...s, messages: [...s.messages, a.message], unread: s.unread || !s.chatOpen }
    case "updateMessage": return { ...s, messages: s.messages.map((m) => (m.id === a.id ? ({ ...m, ...a.patch } as Message) : m)) }
    case "removeMessage": return { ...s, messages: s.messages.filter((m) => m.id !== a.id) }
    case "addCompany": {
      const { company, releases } = a.result
      const already = s.project.companies.some((c) => c.ticker === company.ticker)
      const map = { ...s.project.releases }
      releases.forEach((r) => (map[r.id] = r))
      return {
        ...s,
        project: { ...s.project, companies: already ? s.project.companies : [...s.project.companies, company], releases: map },
        selectedReleaseId: releases[0]?.id ?? s.selectedReleaseId,
        tab: "overview",
        fixing: undefined,
      }
    }
    case "select": return { ...s, selectedReleaseId: a.releaseId, highlight: undefined, fixing: undefined }
    case "tab": return { ...s, tab: a.tab }
    case "fixing": return { ...s, fixing: a.field }
    case "mode": return { ...s, mode: a.mode }
    case "chat": return { ...s, chatOpen: a.open, unread: a.open ? false : s.unread }
    case "highlight": return { ...s, highlight: a.segment }
    case "mubit": return { ...s, mubit: a.status }
    case "foldOnInteract": return { ...s, foldOnInteract: a.on }
    case "draft": return { ...s, chatOpen: true, unread: false, draft: { text: a.text, at: Date.now() } }
    case "correction": return { ...s, project: { ...s.project, corrections: [...s.project.corrections.filter((c) => !(c.releaseId === a.correction.releaseId && c.field === a.correction.field)), a.correction] } }
  }
}

/** Fields as the analyst should see them: in "before" mode, analyst corrections overlay the AI's answers. */
export function effectiveFields(release: Release, mode: Mode, corrections: Correction[]): Field[] {
  const fields = release.extractions[mode].fields
  if (mode === "after") {
    const before = release.extractions.before.fields
    return fields.map((f) => {
      const b = before.find((x) => x.key === f.key)
      return b && b.value !== f.value ? { ...f, beforeValue: b.value } : f
    })
  }
  return fields.map((f) => {
    const c = corrections.find((x) => x.releaseId === release.id && x.field === f.key)
    if (!c) return f
    const pick = f.candidates?.find((k) => k.value === c.to)
    const fmt = (v: Field["value"]) => fmtValue({ unit: f.unit, value: v })
    // The row already shows the checker (Analyst) and the rule, so the message only says what changed.
    return {
      ...f,
      value: c.to,
      status: "corrected",
      kept: c.from === c.to,
      sourceSegment: pick?.segmentId ?? f.sourceSegment,
      check: { by: "analyst", ok: true, message: c.from === c.to ? `Kept at ${fmt(c.to)} despite the failed check.` : `Changed from ${fmt(c.from)} to ${fmt(c.to)}.` },
    }
  })
}

export interface ReviewItem { release: Release; field: Field }

/** The company's previous release, for the "vs last quarter" column. */
export function priorRelease(project: Project, release: Release): Release | undefined {
  const c = project.companies.find((x) => x.ticker === release.ticker)
  const i = c?.releaseIds.indexOf(release.id) ?? -1
  const id = i >= 0 ? c?.releaseIds[i + 1] : undefined
  return id ? project.releases[id] : undefined
}

interface Ctx extends State {
  release?: Release
  fields: Field[]
  track: (query: string) => Promise<void>
  upload: (file: File) => Promise<void>
  ask: (question: string) => Promise<void>
  correct: (release: Release, field: FieldKey, from: Field["value"], to: number | string, rule?: RuleId, reason?: string) => Promise<void>
  select: (id: string) => void
  setTab: (t: Tab) => void
  /** Opens a flagged field's fix panel over the current tab; no field closes it. */
  setFixing: (field?: FieldKey) => void
  setMode: (m: Mode) => void
  setChat: (open: boolean) => void
  setHighlight: (seg?: string) => void
  /** Call on the first interaction with the workspace: folds the chat once. */
  workspaceTouched: () => void
  /** Opens the chat with this text in the box, ready to finish and send. */
  prefill: (text: string) => void
}

const AppContext = createContext<Ctx | null>(null)
const newId = () => `m-${crypto.randomUUID()}`

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    phase: "start", project: emptyProject(), tab: "overview", mode: "before", chatOpen: true, messages: [], unread: false, foldOnInteract: false,
  })

  useEffect(() => {
    if (state.phase === "workspace" && !state.mubit) void api.getMubitStatus().then((status) => dispatch({ type: "mubit", status }))
  }, [state.phase, state.mubit])

  const runTrack = useCallback(async (label: string, run: (onStep: (s: ProgressStep) => void) => Promise<api.TrackResult>) => {
    dispatch({ type: "message", message: { id: newId(), role: "user", text: label } })
    const pid = newId()
    const steps: ProgressStep[] = []
    dispatch({ type: "message", message: { id: pid, role: "progress", steps: [], done: false } })
    if (state.phase === "start") dispatch({ type: "phase", phase: "working" })
    try {
      const result = await run((s) => {
        steps.push(s)
        dispatch({ type: "updateMessage", id: pid, patch: { steps: [...steps] } })
      })
      dispatch({ type: "updateMessage", id: pid, patch: { done: true } })
      await new Promise((r) => setTimeout(r, 450))
      const first = state.phase !== "workspace"
      dispatch({ type: "addCompany", result })
      dispatch({ type: "phase", phase: "workspace" })
      // The chat lands on the right and stays until the user starts working in the release.
      if (first) dispatch({ type: "foldOnInteract", on: true })
    } catch (e) {
      dispatch({ type: "updateMessage", id: pid, patch: { done: true, error: e instanceof Error ? e.message : "Something went wrong. Try again." } })
      if (state.phase === "start") dispatch({ type: "phase", phase: "start" })
    }
  }, [state.phase])

  const track = useCallback((query: string) => runTrack(query, (s) => api.trackCompany(query, s)), [runTrack])
  const upload = useCallback((file: File) => runTrack(`Uploaded ${file.name}`, (s) => api.uploadRelease(file, s)), [runTrack])

  const release = state.selectedReleaseId ? state.project.releases[state.selectedReleaseId] : undefined

  const ask = useCallback(async (question: string) => {
    // Tracking: "Track …", or a message that names a company we can track and isn't a question about the release.
    const named = api.companyIn(question)
    const short = question.trim().split(/\s+/).length <= 2
    if (/^\s*track\b/i.test(question) || (named && (!release || short || /^\s*(add|follow)\b/i.test(question)))) return track(/^\s*track\b/i.test(question) ? question : `Track ${question.trim()}`)
    dispatch({ type: "message", message: { id: newId(), role: "user", text: question } })
    const tid = newId()
    dispatch({ type: "message", message: { id: tid, role: "thinking" } })
    const answer = await api.ask(question, release, release && effectiveFields(release, state.mode, state.project.corrections))
    dispatch({ type: "removeMessage", id: tid })
    dispatch({ type: "message", message: { id: newId(), role: "assistant", answer } })
  }, [release, track, state.mode, state.project.corrections])

  const correct = useCallback<Ctx["correct"]>(async (rel, field, from, to, rule, reason) => {
    const correction = await api.submitCorrection({ releaseId: rel.id, field, from, to, rule, reason, requestId: rel.extractions.before.requestId })
    dispatch({ type: "correction", correction })
    const label = rel.extractions.before.fields.find((f) => f.key === field)?.label ?? field
    const m = state.mubit && withSessionFixes(state.mubit, [...state.project.corrections, correction])
    const toward = m ? ` Mubit has ${Math.min(m.newSinceVersion, examplesForNextVersion(m))} of the ${examplesForNextVersion(m)} new examples it needs to train ${m.nextVersion}.` : ""
    toast.success(from === to ? "Value kept and sent to Mubit" : "Fix saved and sent to Mubit", { description: `${rel.ticker} ${rel.fiscalLabel} · ${label}.${toward}` })
  }, [state.mubit, state.project.corrections])

  const value = useMemo<Ctx>(() => ({
    ...state,
    release,
    fields: release ? effectiveFields(release, state.mode, state.project.corrections) : [],
    track, upload, ask, correct,
    // A fix toast belongs to the company it was made on, so it goes when the company changes.
    select: (id) => { toast.dismiss(); dispatch({ type: "select", releaseId: id }) },
    setTab: (t) => dispatch({ type: "tab", tab: t }),
    setFixing: (field) => dispatch({ type: "fixing", field }),
    setMode: (m) => dispatch({ type: "mode", mode: m }),
    setChat: (open) => dispatch({ type: "chat", open }),
    setHighlight: (seg) => dispatch({ type: "highlight", segment: seg }),
    prefill: (text) => dispatch({ type: "draft", text }),
    workspaceTouched: () => {
      if (!state.foldOnInteract) return
      dispatch({ type: "foldOnInteract", on: false })
      dispatch({ type: "chat", open: false })
    },
  }), [state, release, track, upload, ask, correct])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useApp must be used inside AppProvider")
  return ctx
}
