// Retrying Mubit's transient gateway errors.
//
// Mubit answers 429/503 (with `retry-after`) when it cannot take a request right
// now, e.g. "The gateway could not check this key just now", and only retries
// itself when nothing was sent upstream. Those requests never reached the
// provider, so repeating them cannot record a call twice. Timeouts are not
// retried: the provider may have answered.

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  sleep: (ms: number) => Promise<void>;
}

export const DEFAULT_RETRY: RetryOptions = {
  attempts: 3,
  baseDelayMs: 800,
  maxDelayMs: 8_000,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

function header(err: unknown, name: string): string | null {
  const headers = (err as { headers?: Headers | Record<string, string> } | null)?.headers;
  if (!headers) return null;
  if (typeof (headers as Headers).get === 'function') return (headers as Headers).get(name);
  return (headers as Record<string, string>)[name] ?? null;
}

export function isTransient(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  if (header(err, 'x-should-retry') === 'false') return false;
  const { status, constructor } = err as { status?: number; constructor?: { name?: string } };
  if (typeof status === 'number') return RETRYABLE_STATUS.has(status);
  // The OpenAI SDK's connection failure (nothing reached the gateway); not its timeout.
  return constructor?.name === 'APIConnectionError';
}

export function retryDelay(err: unknown, attempt: number, opts: RetryOptions): number {
  const after = Number(header(err, 'retry-after'));
  if (Number.isFinite(after) && after > 0) return Math.min(after * 1000, opts.maxDelayMs);
  const backoff = opts.baseDelayMs * 2 ** attempt;
  return Math.min(backoff + Math.floor(Math.random() * opts.baseDelayMs), opts.maxDelayMs);
}

export async function withTransientRetry<T>(fn: () => Promise<T>, opts: RetryOptions = DEFAULT_RETRY): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= opts.attempts - 1 || !isTransient(err)) throw err;
      await opts.sleep(retryDelay(err, attempt, opts));
    }
  }
}
