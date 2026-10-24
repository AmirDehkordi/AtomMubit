'use client';

import { ArrowUp, Square } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

const MAX_HEIGHT = 220;

/** The message box: grows with its text, Enter sends, and turns into Stop while the desk works. */
export function Composer({
  onSend,
  onStop,
  busy,
  disabled,
  placeholder,
  autoFocus,
  large,
  className,
}: {
  onSend: (text: string) => void;
  onStop?: () => void;
  busy?: boolean;
  disabled?: boolean;
  placeholder: string;
  autoFocus?: boolean;
  large?: boolean;
  className?: string;
}) {
  const [text, setText] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const ready = text.trim().length > 0 && !disabled && !busy;

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [text]);

  const submit = () => {
    if (!ready) return;
    onSend(text.trim());
    setText('');
  };

  return (
    <form
      className={cn(
        'edge rounded-[20px] transition-[box-shadow] duration-200',
        'focus-within:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)]',
        className,
      )}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={box}
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape' && busy) onStop?.();
        }}
        rows={1}
        placeholder={placeholder}
        className={cn(
          'placeholder:text-subtle block w-full resize-none bg-transparent px-4 pt-3.5 outline-none',
          large ? 'min-h-[84px] text-base' : 'min-h-[52px] text-[15px]',
        )}
      />
      <div className="flex items-center justify-between px-3 pt-1 pb-2.5">
        <span className="text-subtle pl-1 text-[11px]">{busy ? 'Esc to stop' : ''}</span>
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            className="bg-text text-ink grid size-8 place-items-center rounded-full transition-transform active:scale-95"
            aria-label="Stop"
            title="Stop"
          >
            <Square className="size-3" fill="currentColor" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!ready}
            className={cn(
              'grid size-8 place-items-center rounded-full transition-all active:scale-95',
              ready ? 'bg-text text-ink' : 'bg-raised text-subtle',
            )}
            aria-label="Send"
          >
            <ArrowUp className="size-4" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </form>
  );
}
