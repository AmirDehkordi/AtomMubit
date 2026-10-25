'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import type { StreamEvent } from '@desk/shared';
import { BrandMark } from '@/components/brand';
import { ChatPanel } from '@/components/chat/chat-panel';
import { Dashboard } from '@/components/dashboard/dashboard';
import { MubitButton, toolbarButton } from '@/components/mubit/mubit-panel';
import { API_URL, api } from '@/lib/api';
import { useDesk } from '@/lib/desk-store';

const ease = [0.22, 1, 0.36, 1] as const;

export default function DeskPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const hasTabs = useDesk((s) => s.tabs.length > 0);
  const filingsVersion = useDesk((s) => s.filingsVersion);
  const loaded = useRef(false);
  const client = useQueryClient();

  const project = useQuery({
    queryKey: ['project', projectId, filingsVersion],
    queryFn: () => api.project(projectId),
  });

  // First load: restore the conversation and tabs, or send the question typed on the empty desk.
  useEffect(() => {
    if (!project.data || loaded.current) return;
    loaded.current = true;
    const desk = useDesk.getState();
    if (desk.projectId === projectId && desk.pendingQuestion) {
      void desk.send(desk.pendingQuestion);
    } else {
      desk.load(projectId, project.data.conversationId, project.data.messages, project.data.views);
    }
  }, [project.data, projectId]);

  // Background progress: filings being read, blocks re-read.
  useEffect(() => {
    const source = new EventSource(`${API_URL}/events/${projectId}`);
    source.onmessage = (msg) => {
      const event = JSON.parse(msg.data) as StreamEvent;
      if (event.type === 'extraction') {
        useDesk.getState().filingsChanged();
        useDesk.getState().clearRereading();
        void client.invalidateQueries({ queryKey: ['outline', event.accession] });
        void client.invalidateQueries({ queryKey: ['section'] });
      }
      if (event.type === 'block') {
        useDesk.getState().blockEvent(event.id, event.status);
        if (event.status !== 'unchecked') void client.invalidateQueries({ queryKey: ['section'] });
      }
    };
    return () => source.close();
  }, [projectId, client]);

  const filings = project.data?.filings ?? [];
  const title = project.data?.project.title ?? '';

  return (
    <main className="bg-ink relative flex h-dvh overflow-hidden">
      {hasTabs && (
        <motion.section
          key="dashboard"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease }}
          className="min-w-0 flex-1"
        >
          <Dashboard filings={filings} title={title} projectId={projectId} />
        </motion.section>
      )}
      <aside
        className={
          hasTabs
            ? 'edge my-4 mr-4 flex w-[clamp(340px,34vw,460px)] shrink-0 flex-col overflow-hidden rounded-2xl shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7),0_2px_6px_rgba(0,0,0,0.3)]'
            : 'flex h-full w-full flex-col'
        }
      >
        {/* The chat's own toolbar: who you are talking to, what trains on it, and a fresh desk. */}
        <header className="flex h-14 shrink-0 items-center gap-2 pr-3 pl-4">
          <span className="text-muted mr-auto flex items-center gap-2 text-sm font-medium">
            <BrandMark className="size-6" /> MuTick
          </span>
          <MubitButton projectId={projectId} />
          <Link href="/" title="New desk" aria-label="New desk" className={toolbarButton}>
            <Plus className="size-4" />
          </Link>
        </header>
        <div className="min-h-0 flex-1">
          <ChatPanel filings={filings} wide={!hasTabs} />
        </div>
      </aside>
      {/* Fine grain over the whole desk, so the dark panels read as frosted rather than flat. */}
      <div aria-hidden className="grain pointer-events-none absolute inset-0 z-10" />
    </main>
  );
}
