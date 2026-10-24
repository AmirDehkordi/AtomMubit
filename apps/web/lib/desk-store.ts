'use client';

import { create } from 'zustand';
import type { ViewSpec } from '@desk/shared';

interface DeskState {
  projectId: string | null;
  view: ViewSpec | null;
  highlights: string[];
  setProject: (id: string) => void;
  showView: (spec: ViewSpec) => void;
}

/** What the dashboard shows. The agent drives it through `view` stream events. */
export const useDesk = create<DeskState>((set) => ({
  projectId: null,
  view: null,
  highlights: [],
  setProject: (projectId) => set({ projectId }),
  showView: (view) =>
    set({ view, highlights: 'highlight' in view ? view.highlight : [] }),
}));
