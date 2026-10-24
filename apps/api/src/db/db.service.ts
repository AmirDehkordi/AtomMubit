import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import { config } from '../core/config';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Postgres through Drizzle. With DATABASE_URL it connects to that server;
 * without it, it runs embedded Postgres (PGlite) in data/pglite, so local
 * development needs no Docker. Migrations run on start.
 */
@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  private pool: Pool | null = null;
  private lite: PGlite | null = null;
  private _db: Db | null = null;

  get db(): Db {
    if (!this._db) throw new Error('Database not ready');
    return this._db;
  }

  async onModuleInit(): Promise<void> {
    const migrationsFolder = config.migrationsDir;
    if (config.databaseUrl) {
      this.pool = new Pool({ connectionString: config.databaseUrl });
      const db = drizzlePg(this.pool, { schema });
      await migratePg(db, { migrationsFolder });
      this._db = db as unknown as Db;
      this.logger.log('Postgres connected (DATABASE_URL)');
    } else {
      const dir = join(config.dataDir, 'pglite');
      mkdirSync(dir, { recursive: true });
      this.lite = new PGlite(dir);
      const db = drizzlePglite(this.lite, { schema });
      await migratePglite(db, { migrationsFolder });
      this._db = db as unknown as Db;
      this.logger.log(`Embedded Postgres (PGlite) at ${dir}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
    await this.lite?.close();
  }
}
