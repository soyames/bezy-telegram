// Apply a Bezy media/social migration to the shared database, and report what it changed.
// The files are idempotent (IF NOT EXISTS, or a scoped UPDATE), so re-running is safe.
import fs from 'node:fs';
import pg from 'pg';

const [envFile, ...files] = process.argv.slice(2);
if (!envFile || !files.length) {
  console.error('usage: node scripts/db-migrate.mjs <env-file> <migration.sql> [...]');
  process.exit(1);
}

const env = Object.fromEntries(
  fs.readFileSync(envFile, 'utf8').split('\n')
    .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
    .map((line) => {
      const at = line.indexOf('=');
      return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^"|"$/g, '')];
    }),
);

const client = new pg.Client({
  host: env.PGHOST_UNPOOLED || env.PGHOST,
  user: env.PGUSER,
  password: env.PGPASSWORD,
  database: env.PGDATABASE || 'postgres',
  ssl: true,
  connectionTimeoutMillis: 15000,
});
await client.connect();

const { rows: [identity] } = await client.query('SELECT current_database() AS db');
// A migration run against the wrong database is the expensive mistake here, so refuse
// unless the shared tables are actually present.
const { rows: probe } = await client.query(
  `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'
     AND tablename IN ('bezy_media_members','bezy_social_profiles')`);
if (probe[0].n !== 2) {
  console.error(`REFUSED: ${identity.db} does not look like the shared Bezy database.`);
  await client.end();
  process.exit(1);
}
console.log(`database: ${identity.db}`);

for (const file of files) {
  const sql = fs.readFileSync(file, 'utf8');
  // For a data migration, record what it actually touched so the change is auditable.
  const affectsProfiles = /UPDATE\s+bezy_social_profiles/i.test(sql);
  let before = null;
  if (affectsProfiles) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM bezy_social_profiles WHERE provider='pi' AND widen_area = false`);
    before = rows[0].n;
  }
  try {
    await client.query(sql);
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM bezy_social_profiles WHERE provider='pi' AND widen_area = false`);
    console.log(`applied  ${file}` + (affectsProfiles ? `  (pi profiles widened: ${before} → ${rows[0].n})` : ''));
  } catch (error) {
    console.error(`FAILED   ${file}: ${error.code || error.name} ${error.message}`);
    process.exitCode = 1;
  }
}
await client.end();
