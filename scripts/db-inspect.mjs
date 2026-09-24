// Read-only look at the shared Bezy database: which migration's tables are present.
import fs from 'node:fs';
import pg from 'pg';

const envFile = process.argv[2];
const env = Object.fromEntries(
  fs.readFileSync(envFile, 'utf8').split('\n')
    .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
    .map((line) => {
      const at = line.indexOf('=');
      return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^"|"$/g, '')];
    }),
);

const database = env.PGDATABASE || 'postgres';
const client = new pg.Client({
  host: env.PGHOST_UNPOOLED || env.PGHOST,
  user: env.PGUSER,
  password: env.PGPASSWORD,
  database,
  ssl: true,
  connectionTimeoutMillis: 15000,
});

await client.connect();
const who = await client.query('SELECT current_database() AS db, current_user AS usr, version() AS v');
console.log('connected:', who.rows[0].db, 'as', who.rows[0].usr);
console.log('server:  ', String(who.rows[0].v).split(',')[0]);

const tables = await client.query(
  `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'bezy%' ORDER BY tablename`);
console.log('\nbezy_* tables present:');
for (const row of tables.rows) console.log('  ' + row.tablename);

const wanted = {
  '001-media.sql': ['bezy_media_members', 'bezy_media_photos', 'bezy_media_blocks'],
  '002-social.sql': ['bezy_social_profiles', 'bezy_social_decisions', 'bezy_social_matches',
    'bezy_social_messages', 'bezy_social_reads', 'bezy_social_reports'],
  '003-pi-payments.sql': ['bezy_pi_payments'],
};
const have = new Set(tables.rows.map((r) => r.tablename));
console.log('\napplied:');
for (const [file, needed] of Object.entries(wanted)) {
  const missing = needed.filter((t) => !have.has(t));
  console.log(`  ${file.padEnd(22)} ${missing.length ? 'MISSING ' + missing.join(', ') : 'yes'}`);
}
await client.end();
