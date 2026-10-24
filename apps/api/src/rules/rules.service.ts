import { Injectable, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { rules } from '../db/schema';
import { SEED_RULES } from './seed-rules';

/** The desk's house rules. Active rules go into every section_extractor call (in order of code). */
@Injectable()
export class RulesService implements OnModuleInit {
  constructor(private readonly dbs: DbService) {}

  async onModuleInit(): Promise<void> {
    await this.dbs.db
      .insert(rules)
      .values(SEED_RULES.map((r) => ({ id: randomUUID(), code: r.code, text: r.text, source: 'seed' as const })))
      .onConflictDoNothing();
  }

  all() {
    return this.dbs.db.select().from(rules).orderBy(asc(rules.createdAt));
  }

  async byCode(code: string) {
    const [row] = await this.dbs.db.select().from(rules).where(eq(rules.code, code));
    return row ?? null;
  }

  /** A new rule from a person's correction, inactive until they confirm it. */
  async propose(text: string) {
    const existing = await this.all();
    const next = Math.max(0, ...existing.map((r) => Number(/^R(\d+)$/.exec(r.code)?.[1] ?? 0))) + 1;
    const [row] = await this.dbs.db
      .insert(rules)
      .values({ id: randomUUID(), code: `R${next}`, text, source: 'user', active: false })
      .returning();
    return row!;
  }

  async activate(id: string): Promise<void> {
    await this.dbs.db.update(rules).set({ active: true }).where(eq(rules.id, id));
  }
}
