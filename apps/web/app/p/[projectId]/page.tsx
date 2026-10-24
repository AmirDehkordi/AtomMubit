'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { LayoutGroup, motion } from 'motion/react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import type { StreamEvent } from '@desk/shared';
import { ChatPanel } from '@/components/chat/chat-panel';
import { Dashboard } from '@/components/dashboard/dashboard';
import { MubitButton } from '@/components/mubit/mubit-panel';
import { API_URL, api } from '@/lib/api';
import { useDesk } from '@/lib/desk-store';

export default function DeskPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const view = useDesk((s) => s.view);
  const filingsVersion = useDesk((s) => s.filingsVersion);
  const loaded = useRef(false);
  const client = useQueryClient();

  const project = useQuery({
    queryKey: ['project', projectId, filingsVersion],
    queryFn: () => api.project(projectId),
  });

  // First load: restore the conversation, or send the question typed on the empty desk.
  useEffect(() => {
    if (!project.data || loaded.current) return;
    loaded.current = true;
    const desk = useDesk.getState();
    if (desk.projectId === projectId && desk.pendingQuestion) {
      void desk.send(desk.pendingQuestion);
    } else {
      desk.load(projectId, project.data.conversationId, project.data.messages, project.data.view);
    }
  }, [project.data, projectId]);

  // Background progress: filings being read.
  useEffect(() => {
    const source = new EventSource(`${API_URL}/events/${projectId}`);
    source.onmessage = (msg) => {
      const event = JSON.parse(msg.data) as StreamEvent;
      if (event.type === 'extraction') {
        useDesk.getState().filingsChanged();
        void client.invalidateQueries({ queryKey: ['outline', event.accession] });
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
  const split = view !== null;

  return (
    <LayoutGroup>
      <main className="flex h-dvh overflow-hidden">
        {split && (
          <motion.section
            key="dashboard"
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="min-w-0 flex-1"
          >
            <Dashboard view={view} filings={filings} title={title} />
          </motion.section>
        )}
        <motion.aside
          layout
          layoutId="chat"
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className={
            split
              ? 'border-line bg-ink flex h-full w-[440px] shrink-0 flex-col border-l'
              : 'mx-auto flex h-full w-full max-w-2xl flex-col'
          }
        >
          <div className="border-line flex items-center gap-3 border-b px-4 py-3">
            <Link href="/" className="text-muted hover:text-text" aria-label="New desk">
              <ArrowLeft className="size-4" />
            </Link>
            <span className="flex-1 truncate text-sm font-medium">{split ? 'Desk chat' : title || 'Earnings Desk'}</span>
            <MubitButton />
          </div>
          <div className="min-h-0 flex-1">
            <ChatPanel filings={filings} compact={split} />
          </div>
        </motion.aside>
      </main>
    </LayoutGroup>
  );
}
