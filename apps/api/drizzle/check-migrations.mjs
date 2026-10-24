import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

const migrationsFolder = dirname(fileURLToPath(import.meta.url));
const journal = JSON.parse(await readFile(join(migrationsFolder, 'meta/_journal.json'), 'utf8'));

async function seedFiling(db, accession) {
  await db.query(`INSERT INTO companies (cik, ticker, name, fiscal_year_end) VALUES (1, 'TEST', 'Test', '12-31') ON CONFLICT DO NOTHING`);
  await db.query(`INSERT INTO filings (accession, cik, form, period_end, fiscal_year, fiscal_period, filed_at, url) VALUES ($1, 1, '10-K', '2025-12-31', 2025, 'FY', '2026-01-01', 'https://example.com')`, [accession]);
}

async function verifyMergedSchema(db) {
  const tables = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`);
  assert.equal(tables.rows.length, 27);
  for (const name of ['mubit_status', 'corrections', 'extraction_requests', 'extraction_runs', 'request_runs', 'service_locks']) {
    assert(tables.rows.some(row => row.table_name === name), `missing ${name}`);
  }
  await db.query(`INSERT INTO projects (id, title, team_id) VALUES ('tenant', 'Tenant desk', 'team-a')`);
  await seedFiling(db, 'new');
  await db.query(`INSERT INTO project_filings (project_id, accession, team_id) VALUES ('tenant', 'new', 'team-a')`);
  const { rows: [membership] } = await db.query(`SELECT * FROM project_filings WHERE project_id = 'tenant'`);
  assert.equal(membership.team_id, 'team-a');
  assert.match(membership.id, /^[0-9a-f-]{36}$/);
  assert(membership.created_at);
  await assert.rejects(db.query(`INSERT INTO project_filings (id, project_id, accession, team_id) VALUES ('duplicate', 'tenant', 'new', 'team-a')`), /duplicate key/);
  // Re-running the migrator must leave the history and memberships unchanged.
  await migrate(drizzle(db), { migrationsFolder });
  const history = await db.query(`SELECT * FROM drizzle.__drizzle_migrations`);
  assert.equal(history.rows.length, journal.entries.length);
}

test('all migrations apply to a clean database and preserve merged constraints', async () => {
  const db = new PGlite();
  try {
    await migrate(drizzle(db), { migrationsFolder });
    await verifyMergedSchema(db);
  } finally {
    await db.close();
  }
});

test('extraction migration upgrades a populated upstream main database without losing filing memberships', async () => {
  const upstreamFolder = await mkdtemp(join(tmpdir(), 'atommubit-main-migrations-'));
  const db = new PGlite();
  try {
    await mkdir(join(upstreamFolder, 'meta'));
    const mainEntries = journal.entries.filter(entry => entry.idx <= 4);
    await writeFile(join(upstreamFolder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries: mainEntries }));
    for (const entry of mainEntries) await copyFile(join(migrationsFolder, `${entry.tag}.sql`), join(upstreamFolder, `${entry.tag}.sql`));
    await migrate(drizzle(db), { migrationsFolder: upstreamFolder });
    await db.query(`INSERT INTO projects (id, title) VALUES ('existing', 'Existing desk')`);
    await seedFiling(db, 'old');
    await db.query(`INSERT INTO project_filings (project_id, accession, created_at) VALUES ('existing', 'old', '2026-01-02T00:00:00Z')`);
    await db.query(`INSERT INTO mubit_status (task, kept, adapter_state) VALUES ('section_extractor', 42, 'live')`);
    await migrate(drizzle(db), { migrationsFolder });
    const { rows: [membership] } = await db.query(`SELECT * FROM project_filings WHERE project_id = 'existing'`);
    assert.equal(membership.accession, 'old');
    assert.equal(membership.team_id, 'internal');
    assert.equal(membership.created_at.toISOString(), '2026-01-02T00:00:00.000Z');
    assert.match(membership.id, /^[0-9a-f-]{36}$/);
    assert.equal((await db.query(`SELECT kept FROM mubit_status`)).rows[0].kept, 42);
    await verifyMergedSchema(db);
  } finally {
    await db.close();
    await rm(upstreamFolder, { recursive: true, force: true });
  }
});
