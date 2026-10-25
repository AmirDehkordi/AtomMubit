import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { serviceLocks } from '../db/schema';
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
  constructor(private readonly dbs: DbService) {}
  private readonly logger = new Logger(EdgarClient.name);
  private readonly cacheDir = join(config.dataDir, 'edgar-cache');

  async json<T>(url: string, maxAgeMs: number): Promise<T> {
    return JSON.parse(await this.text(url, maxAgeMs)) as T;
  }

  async text(url: string, maxAgeMs: number): Promise<string> {
    const file = this.cachePath(url);
    const cached = await this.readCache(file, maxAgeMs);
    if (cached !== null) return cached;
    let body: string;
    try {
      body = await this.fetchWithRetry(url);
    } catch (err) {
      // The SEC is unreachable or refusing (403, 429, timeout): an older copy beats failing.
      const stale = await this.readCache(file, FOREVER);
      if (stale === null) throw err;
      this.logger.warn(`Serving a cached copy of ${url}: ${err instanceof Error ? err.message : String(err)}`);
      return stale;
    }
    await mkdir(this.cacheDir, { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, body);
    await rename(temporary,file);
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
        signal: AbortSignal.timeout(30_000),
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
  private async throttle(): Promise<void> {
    const at = await this.dbs.db.transaction(async tx => {
      await tx.insert(serviceLocks).values({id:'sec-rate-limit'}).onConflictDoNothing();
      const [lock] = await tx.select().from(serviceLocks).where(eq(serviceLocks.id,'sec-rate-limit')).for('update');
      const at = Math.max(Date.now(),lock!.nextAt.getTime());
      await tx.update(serviceLocks).set({nextAt:new Date(at+MIN_GAP_MS)}).where(eq(serviceLocks.id,'sec-rate-limit'));
      return at;
    });
    if (at > Date.now()) await sleep(at-Date.now());
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
