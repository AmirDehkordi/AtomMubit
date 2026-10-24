'use client';

import { create } from 'zustand';
import type { StepDisplay, StreamEvent, ViewSpec } from '@desk/shared';
import { streamChat, type StoredMessage } from './api';

export interface Step {
  id: string;
  tool: string;
  label: string;
  state: 'running' | 'done' | 'failed';
  display?: StepDisplay;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  steps: Step[];
  choice: { id: string; question: string; options: string[] } | null;
  pending: boolean;
  error: string | null;
}

/** A dashboard tab. The first one is pinned: it stays for the whole desk. */
export interface DeskTab {
  id: string;
  spec: ViewSpec;
  pinned: boolean;
}

const MAX_TABS = 8;

interface DeskState {
  projectId: string | null;
  conversationId: string | null;
  /** A question typed on the empty desk, sent once the desk page opens. */
  pendingQuestion: string | null;
  messages: ChatMessage[];
  tabs: DeskTab[];
  activeTab: string | null;
  sending: boolean;
  /** Bumped when filings change, so the dashboard refetches. */
  filingsVersion: number;
  /** Blocks being re-read after a correction (from `block` events with status unchecked). */
  rereading: Set<string>;
  blockEvent: (id: string, status: string) => void;
  start: (projectId: string, conversationId: string, question: string) => void;
  load: (projectId: string, conversationId: string | null, messages: StoredMessage[], views: ViewSpec[]) => void;
  send: (text: string) => Promise<void>;
  /** Opens a view in a tab: an identical view already open is focused instead. */
  showView: (view: ViewSpec) => void;
  focusTab: (id: string) => void;
  closeTab: (id: string) => void;
  filingsChanged: () => void;
}

/** Tabs are identified by what they show; highlights don't make a new tab. */
function tabKey(spec: ViewSpec): string {
  const { highlight: _h, ...rest } = spec as ViewSpec & { highlight?: string[] };
  return JSON.stringify(rest);
}

function withView(tabs: DeskTab[], spec: ViewSpec): { tabs: DeskTab[]; activeTab: string } {
  const id = tabKey(spec);
  if (tabs.some((t) => t.id === id)) {
    return { tabs: tabs.map((t) => (t.id === id ? { ...t, spec } : t)), activeTab: id };
  }
  let next = [...tabs, { id, spec, pinned: tabs.length === 0 }];
  while (next.length > MAX_TABS) {
    const oldest = next.findIndex((t) => !t.pinned);
    next = next.filter((_, i) => i !== oldest);
  }
  return { tabs: next, activeTab: id };
}

const fromStored = (m: StoredMessage): ChatMessage => ({
  id: m.id,
  role: m.role,
  text: m.content,
  steps: m.toolTrace
    .filter((t) => t.tool !== 'ask_user')
    .map((t, i) => ({ id: `${m.id}-${i}`, tool: t.tool, label: t.summary, state: t.ok ? 'done' : 'failed', display: t.display })),
  choice: m.choice,
  pending: false,
  error: null,
});

export const useDesk = create<DeskState>((set, get) => ({
  projectId: null,
  conversationId: null,
  pendingQuestion: null,
  messages: [],
  tabs: [],
  activeTab: null,
  sending: false,
  filingsVersion: 0,
  rereading: new Set(),
  blockEvent: (id, status) =>
    set((s) => {
      const next = new Set(s.rereading);
      if (status === 'unchecked') next.add(id);
      else next.delete(id);
      return { rereading: next };
    }),

  start: (projectId, conversationId, question) =>
    set({ projectId, conversationId, pendingQuestion: question, messages: [], tabs: [], activeTab: null }),

  load: (projectId, conversationId, messages, views) => {
    let state: { tabs: DeskTab[]; activeTab: string | null } = { tabs: [], activeTab: null };
    for (const v of views) state = withView(state.tabs, v);
    set({ projectId, conversationId, messages: messages.map(fromStored), ...state });
  },

  showView: (view) => set((s) => withView(s.tabs, view)),
  focusTab: (id) => set({ activeTab: id }),
  closeTab: (id) =>
    set((s) => {
      const i = s.tabs.findIndex((t) => t.id === id);
      if (i < 0 || s.tabs[i]!.pinned) return {};
      const tabs = s.tabs.filter((t) => t.id !== id);
      const activeTab = s.activeTab === id ? (tabs[Math.max(0, i - 1)]?.id ?? null) : s.activeTab;
      return { tabs, activeTab };
    }),
  filingsChanged: () => set((s) => ({ filingsVersion: s.filingsVersion + 1 })),

  send: async (text) => {
    const { conversationId, sending } = get();
    if (!conversationId || sending || !text.trim()) return;
    const replyId = `pending-${Date.now()}`;
    set((s) => ({
      sending: true,
      pendingQuestion: null,
      messages: [
        ...s.messages.map((m) => ({ ...m, choice: null })),
        { id: `user-${Date.now()}`, role: 'user', text, steps: [], choice: null, pending: false, error: null },
        { id: replyId, role: 'assistant', text: '', steps: [], choice: null, pending: true, error: null },
      ],
    }));
    const patch = (fn: (m: ChatMessage) => ChatMessage) =>
      set((s) => ({ messages: s.messages.map((m) => (m.id === replyId ? fn(m) : m)) }));

    const onEvent = (e: StreamEvent) => {
      switch (e.type) {
        case 'step':
          if (e.tool === 'ask_user') return;
          patch((m) => {
            const step: Step = {
              id: e.id,
              tool: e.tool,
              label: e.state === 'running' ? e.label : (e.summary ?? e.label),
              state: e.state,
              display: e.display,
            };
            const exists = m.steps.some((s) => s.id === e.id);
            return { ...m, steps: exists ? m.steps.map((s) => (s.id === e.id ? step : s)) : [...m.steps, step] };
          });
          if (e.tool === 'add_filings' && e.state === 'done') get().filingsChanged();
          break;
        case 'text':
          patch((m) => ({ ...m, text: m.text + e.delta }));
          break;
        case 'choice':
          patch((m) => ({ ...m, choice: { id: e.id, question: e.question, options: e.options } }));
          break;
        case 'view':
          get().showView(e.spec);
          break;
        case 'error':
          patch((m) => ({ ...m, error: e.message }));
          break;
        case 'done':
          patch((m) => ({ ...m, id: e.messageId, pending: false }));
          get().filingsChanged();
          break;
      }
    };

    try {
      await streamChat(conversationId, text, onEvent);
    } catch (err) {
      patch((m) => ({ ...m, error: err instanceof Error ? err.message : String(err) }));
    } finally {
      patch((m) => ({ ...m, pending: false }));
      set({ sending: false });
    }
  },
}));

/** The view in the active tab. */
export const useActiveView = () =>
  useDesk((s) => s.tabs.find((t) => t.id === s.activeTab)?.spec ?? null);
