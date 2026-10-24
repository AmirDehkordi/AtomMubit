'use client';

import { ArrowUp } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';

export function Composer({
  onSend,
  disabled,
  placeholder,
  autoFocus,
  className,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [text, setText] = useState('');
  const submit = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText('');
  };
  return (
    <form
      className={cn(
        'border-line bg-panel focus-within:border-accent/60 flex items-end gap-2 rounded-2xl border p-3 transition-colors',
        className,
      )}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={2}
        placeholder={placeholder}
        className="placeholder:text-muted flex-1 resize-none bg-transparent text-[15px] outline-none"
      />
      <button
        type="submit"
        disabled={!text.trim() || disabled}
        className="bg-accent text-ink grid size-9 shrink-0 place-items-center rounded-xl transition-opacity disabled:opacity-40"
        aria-label="Send"
      >
        <ArrowUp className="size-4" />
      </button>
    </form>
  );
}
