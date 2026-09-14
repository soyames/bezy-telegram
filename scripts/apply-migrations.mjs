#!/usr/bin/env node
/**
 * Applies every numbered `db/0NN-*.sql` migration, in order, to the database named by
 * DATABASE_URL — the one path Bezy has for migrating a REAL database (scripts/setup-test-db.mjs
 * deliberately refuses anything that is not `bezy_test`).
 *
 * Safe by construction:
 *   - DRY RUN BY DEFAULT. Nothing is written without `--apply`.
 *   - DATABASE_URL must be set explicitly; there is no fallback and no default target.
 *   - The connection uses the application's own verified-TLS posture (api/_db.js).
 *   - It reports the host and database it is about to touch, never the credentials.
 *   - Every migration is idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS) and carries its
 *     own BEGIN/COMMIT, so a re-run is a no-op and a failure rolls that file back whole.
 *   - `schema_versions` is printed before and after, so the change is visible.
 *
 *   DATABASE_URL=... node scripts/apply-migrations.mjs            # report what would run
 *   DATABASE_URL=... node scripts/apply-migrations.mjs --apply    # run it
 */
import fs from 'node:fs';
import pg from 'pg';
import { connectionOptions, resolveDatabaseUrl } from '../api/_db.js';

const APPLY = process.argv.includes('--apply');
// The same resolution the application itself uses, so whichever variable the Vercel/Neon
// integration injects (DATABASE_URL, POSTGRES_URL, PG*…) is the one that gets migrated.
const url = resolveDatabaseUrl();
if (!url) {
  console.error('No database is configured. Set DATABASE_URL (or pull the environment) and re-run.');
  process.exit(1);
}

// Identity only — the password never leaves the driver.
let target;
try {
  const parsed = new URL(url);
  target = `${parsed.hostname}${decodeURIComponent(parsed.pathname)}`;
} catch {
  console.error('DATABASE_URL is not a valid PostgreSQL URL.');
  process.exit(1);
}

const dir = new URL('../db/', import.meta.url);
let files = [];
try {
  files = fs.readdirSync(dir).filter((name) => /^\d{3}-.*\.sql$/.test(name)).sort();
} catch {
  console.error('db/ is not present locally — the migrations are private and live outside git.');
  process.exit(1);
}
if (!files.length) {
  console.error('No numbered migrations found in db/.');
  process.exit(1);
}

const client = new pg.Client(connectionOptions(url));
try {
  await client.connect();
  const identity = await client.query('SELECT current_database() AS name, version() AS version');
  console.log(`Target      : ${target}`);
  console.log(`Database    : ${identity.rows[0].name}`);
  console.log(`Mode        : ${APPLY ? 'APPLY' : 'DRY RUN (pass --apply to write)'}`);

  const versionTable = await client.query("SELECT to_regclass('public.schema_versions') IS NOT NULL AS present");
  const applied = versionTable.rows[0].present
    ? (await client.query('SELECT version FROM schema_versions ORDER BY version')).rows.map((r) => Number(r.version))
    : [];
  console.log(`Recorded    : ${applied.length ? applied.join(', ') : '(none — schema_versions does not exist yet)'}`);
  console.log(`Migrations  : ${files.join(', ')}`);

  if (!APPLY) {
    const pending = files.filter((name) => !applied.includes(Number(name.slice(0, 3))));
    console.log(`\nWould run   : ${pending.length ? pending.join(', ') : 'nothing — every migration is already recorded'}`);
    console.log('Re-running a recorded migration is harmless (each one is idempotent).');
    process.exit(0);
  }

  for (const name of files) {
    const sql = fs.readFileSync(new URL(name, dir), 'utf8');
    process.stdout.write(`Applying ${name} ... `);
    await client.query(sql);
    console.log('ok');
  }

  const after = (await client.query('SELECT version FROM schema_versions ORDER BY version')).rows.map((r) => Number(r.version));
  console.log(`\nRecorded now: ${after.join(', ')}`);
  const tables = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  console.log(`Tables      : ${tables.rows.length} (${tables.rows.map((r) => r.table_name).join(', ')})`);
} catch (error) {
  // The message can carry the failing statement but never the credentials.
  console.error(`\nMIGRATION FAILED: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
