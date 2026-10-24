'use client';

import { ArrowUp, CornerDownLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { cn } from '@/lib/cn';

export function Composer({
  onSend,
  disabled,
  placeholder,
  autoFocus,
  large,
  className,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder: string;
  autoFocus?: boolean;
  large?: boolean;
  className?: string;
}) {
  const [text, setText] = useState('');
  const ready = text.trim().length > 0 && !disabled;
  const submit = () => {
    if (!ready) return;
    onSend(text.trim());
    setText('');
  };
  return (
    <form
      className={cn(
        'group border-line bg-panel relative rounded-2xl border transition-all duration-300',
        'focus-within:border-accent/50 focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-accent)_12%,transparent),0_12px_40px_-12px_color-mix(in_oklab,var(--color-accent)_35%,transparent)]',
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
        rows={large ? 3 : 2}
        placeholder={placeholder}
        className={cn(
          'placeholder:text-subtle block w-full resize-none bg-transparent px-4 pt-3.5 pb-11 outline-none',
          large ? 'text-base' : 'text-[15px]',
        )}
      />
      <div className="absolute right-3 bottom-2.5 left-4 flex items-center justify-between">
        <span className="text-subtle flex items-center gap-1 text-[11px]">
          <CornerDownLeft className="size-3" /> Enter to send · Shift+Enter for a new line
        </span>
        <motion.button
          type="submit"
          disabled={!ready}
          whileTap={{ scale: 0.92 }}
          animate={{ scale: ready ? 1 : 0.94, opacity: ready ? 1 : 0.4 }}
          className="from-accent to-accent-2 text-ink grid size-8 place-items-center rounded-full bg-gradient-to-br shadow-[0_4px_16px_-4px_var(--color-accent)]"
          aria-label="Send"
        >
          <ArrowUp className="size-4" strokeWidth={2.5} />
        </motion.button>
      </div>
    </form>
  );
}
