// All destructive test work is restricted to the dedicated bezy_test database.
import fs from 'node:fs';
import pg from 'pg';
import { parseEnv } from 'node:util';
import { connectionOptions } from '../api/_db.js';

export function testDatabaseUrl() {
  let value = process.env.TEST_DATABASE_URL;
  if (!value && process.env.NEON_ENV_FILE) {
    const env = parseEnv(fs.readFileSync(process.env.NEON_ENV_FILE, 'utf8'));
    const url = new URL(env.DATABASE_URL_UNPOOLED || env.POSTGRES_URL_NON_POOLING);
    url.pathname = '/bezy_test';
    value = url.toString();
  }
  let url;
  try { url = new URL(value); } catch { throw new Error('Set TEST_DATABASE_URL or NEON_ENV_FILE for the isolated test database.'); }
  if (decodeURIComponent(url.pathname) !== '/bezy_test' || !['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('REFUSED: tests require the dedicated bezy_test database.');
  }
  process.env.DATABASE_URL = url.toString();
  process.env.TEST_DATABASE_URL = url.toString();
  return url.toString();
}

let client;
export async function testSql(text, params = []) {
  if (!client) {
    client = new pg.Client(connectionOptions(testDatabaseUrl()));
    await client.connect();
    const identity = await client.query('SELECT current_database() AS name');
    if (identity.rows[0].name !== 'bezy_test') throw new Error('REFUSED: database identity mismatch.');
    // Direct suite runs serialize, too. Playwright's parent runner holds this lock
    // across its web server and workers, which must share the same fixture state.
    if (process.env.BEZY_TEST_SERIALIZED !== '1') {
      const lock = await client.query("SELECT pg_try_advisory_lock(928144027) AS acquired");
      if (!lock.rows[0].acquired) throw new Error('Another database test run is active.');
    }
  }
  return client.query(text, params);
}

export async function resetTestData() {
  await testSql(`TRUNCATE users, matches, conversations, reports, bezy_payments,
    bezy_invoices, rate_limits, support_meta RESTART IDENTITY CASCADE`);
}

export async function closeTestDb() {
  if (client) await client.end();
  client = null;
}
