'use client';

import { create } from 'zustand';
import type { StreamEvent, ViewSpec } from '@desk/shared';
import { streamChat, type StoredMessage } from './api';

export interface Step {
  id: string;
  label: string;
  state: 'running' | 'done' | 'failed';
  summary: string | null;
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

interface DeskState {
  projectId: string | null;
  conversationId: string | null;
  /** A question typed on the empty desk, sent once the desk page opens. */
  pendingQuestion: string | null;
  messages: ChatMessage[];
  view: ViewSpec | null;
  sending: boolean;
  /** Bumped when filings change, so the dashboard refetches. */
  filingsVersion: number;
  start: (projectId: string, conversationId: string, question: string) => void;
  load: (projectId: string, conversationId: string | null, messages: StoredMessage[], view: ViewSpec | null) => void;
  send: (text: string) => Promise<void>;
  showView: (view: ViewSpec) => void;
  filingsChanged: () => void;
}

const fromStored = (m: StoredMessage): ChatMessage => ({
  id: m.id,
  role: m.role,
  text: m.content,
  steps: m.toolTrace
    .filter((t) => t.tool !== 'ask_user')
    .map((t, i) => ({ id: `${m.id}-${i}`, label: t.summary, state: t.ok ? 'done' : 'failed', summary: null })),
  choice: m.choice,
  pending: false,
  error: null,
});

export const useDesk = create<DeskState>((set, get) => ({
  projectId: null,
  conversationId: null,
  pendingQuestion: null,
  messages: [],
  view: null,
  sending: false,
  filingsVersion: 0,

  start: (projectId, conversationId, question) =>
    set({ projectId, conversationId, pendingQuestion: question, messages: [], view: null }),

  load: (projectId, conversationId, messages, view) =>
    set({ projectId, conversationId, messages: messages.map(fromStored), view }),

  showView: (view) => set({ view }),
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
            const step: Step = { id: e.id, label: e.state === 'running' ? e.label : (e.summary ?? e.label), state: e.state, summary: e.summary };
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
          set({ view: e.spec });
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
