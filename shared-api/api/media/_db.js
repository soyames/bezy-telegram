import pg from 'pg';
import { connectionOptions } from '../_db.js';

// This pool is deliberately separate from the existing Telegram DATABASE_URL.
// Connect the new Bezy shared-media database using BEZY_MEDIA_DATABASE_URL.
let pool;
function mediaPool() {
  if (!process.env.BEZY_MEDIA_DATABASE_URL) throw new Error('MEDIA_DATABASE_NOT_CONFIGURED');
  if (!pool) {
    pool = new pg.Pool({ ...connectionOptions(process.env.BEZY_MEDIA_DATABASE_URL),
      max: 4, idleTimeoutMillis: 30000, allowExitOnIdle: true });
  }
  return pool;
}
export async function mediaQuery(sql, params = []) {
  return mediaPool().query(sql, params);
}

/**
 * Transaction over the SAME shared database as mediaQuery(). api/_db.js tx() opens the
 * Telegram pool and must never be used for bezy_media_* / bezy_social_* tables.
 * A throw inside the callback rolls back; serialization failures are retried once.
 */
export async function mediaTx(callback, attempts = 2) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let client;
    try {
      client = await mediaPool().connect();
      await client.query('BEGIN');
      const result = await callback((sql, params = []) => client.query(sql, params));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client?.query('ROLLBACK').catch(() => {});
      if (['40P01', '40001'].includes(error?.code) && attempt < attempts - 1) {
        lastError = error;
        client?.release();
        client = null;
        await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
        continue;
      }
      throw error;
    } finally {
      client?.release();
    }
  }
  throw lastError;
}

/** Serializes transactions per business key without touching a table (see api/_db.js). */
export function mediaAdvisoryLock(q, key) {
  return q('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
}
