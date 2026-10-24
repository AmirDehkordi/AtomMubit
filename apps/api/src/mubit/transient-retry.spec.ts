import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_RETRY, isTransient, retryDelay, withTransientRetry } from './transient-retry';

const err = (status?: number, headers: Record<string, string> = {}, name = 'APIError') => {
  const e = Object.assign(new Error('x'), { status, headers });
  Object.defineProperty(e, 'constructor', { value: { name } });
  return e;
};
const fast = { ...DEFAULT_RETRY, sleep: vi.fn(async () => undefined) };

describe('withTransientRetry', () => {
  it('retries a 503 and returns the later success', async () => {
    const fn = vi.fn().mockRejectedValueOnce(err(503)).mockResolvedValueOnce('ok');
    await expect(withTransientRetry(fn, fast)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it('gives up after the last attempt', async () => {
    const fn = vi.fn().mockRejectedValue(err(503));
    await expect(withTransientRetry(fn, fast)).rejects.toMatchObject({ status: 503 });
    expect(fn).toHaveBeenCalledTimes(3);
  });
  it('does not retry a client error or x-should-retry: false', async () => {
    for (const e of [err(400), err(503, { 'x-should-retry': 'false' })]) {
      const fn = vi.fn().mockRejectedValue(e);
      await expect(withTransientRetry(fn, fast)).rejects.toBe(e);
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });
  it('retries connection failures but not timeouts', () => {
    expect(isTransient(err(undefined, {}, 'APIConnectionError'))).toBe(true);
    expect(isTransient(err(undefined, {}, 'APIConnectionTimeoutError'))).toBe(false);
  });
  it('honours retry-after, capped', () => {
    expect(retryDelay(err(429, { 'retry-after': '2' }), 0, DEFAULT_RETRY)).toBe(2000);
    expect(retryDelay(err(429, { 'retry-after': '60' }), 0, DEFAULT_RETRY)).toBe(DEFAULT_RETRY.maxDelayMs);
  });
});
