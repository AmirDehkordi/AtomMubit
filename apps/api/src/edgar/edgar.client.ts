import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../core/config';

const MIN_GAP_MS = 125; // SEC allows 10 requests a second; stay at 8.
const RETRIES = 3;

export const HOUR = 60 * 60 * 1000;
/** Filing documents never change once filed. */
export const FOREVER = Number.POSITIVE_INFINITY;

export class EdgarError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
  }
}

/**
 * The only place that talks to SEC EDGAR. Every request carries the declared
 * User-Agent, requests are spaced to stay under the SEC's rate limit, and
 * responses are cached on disk (data/edgar-cache) so restarts and demos don't
 * refetch.
 */
@Injectable()
export class EdgarClient {
  private readonly logger = new Logger(EdgarClient.name);
  private readonly cacheDir = join(config.dataDir, 'edgar-cache');
  private queue: Promise<void> = Promise.resolve();
  private lastRequestAt = 0;

  async json<T>(url: string, maxAgeMs: number): Promise<T> {
    return JSON.parse(await this.text(url, maxAgeMs)) as T;
  }

  async text(url: string, maxAgeMs: number): Promise<string> {
    const file = this.cachePath(url);
    const cached = await this.readCache(file, maxAgeMs);
    if (cached !== null) return cached;
    const body = await this.fetchWithRetry(url);
    await mkdir(this.cacheDir, { recursive: true });
    await writeFile(file, body);
    return body;
  }

  private async fetchWithRetry(url: string): Promise<string> {
    if (!config.secUserAgent) {
      throw new EdgarError('SEC_USER_AGENT is not set. The SEC requires a contact in every request.', null);
    }
    for (let attempt = 0; ; attempt++) {
      await this.throttle();
      const started = Date.now();
      const res = await fetch(url, {
        headers: { 'User-Agent': config.secUserAgent, Accept: 'application/json, text/html, */*' },
      });
      this.logger.debug(`${res.status} ${url} ${Date.now() - started}ms`);
      if (res.ok) return res.text();
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= RETRIES) {
        throw new EdgarError(`SEC returned ${res.status} for ${url}`, res.status);
      }
      await sleep(1000 * 2 ** attempt);
    }
  }

  /** Serialises requests so they start at least MIN_GAP_MS apart. */
  private throttle(): Promise<void> {
    const turn = this.queue.then(async () => {
      const wait = this.lastRequestAt + MIN_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastRequestAt = Date.now();
    });
    this.queue = turn.catch(() => undefined);
    return turn;
  }

  private cachePath(url: string): string {
    const readable = url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9.-]+/g, '_').slice(0, 120);
    const hash = createHash('sha1').update(url).digest('hex').slice(0, 10);
    return join(this.cacheDir, `${readable}_${hash}`);
  }

  private async readCache(file: string, maxAgeMs: number): Promise<string | null> {
    try {
      const info = await stat(file);
      if (Date.now() - info.mtimeMs > maxAgeMs) return null;
      return await readFile(file, 'utf8');
    } catch {
      return null;
    }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
