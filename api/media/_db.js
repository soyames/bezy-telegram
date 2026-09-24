import pg from 'pg';
import { connectionOptions } from '../_db.js';

// This pool is deliberately separate from the existing Telegram DATABASE_URL.
// Connect the new Bezy shared-media database using BEZY_MEDIA_DATABASE_URL.
let pool;
export async function mediaQuery(sql, params = []) {
  if (!process.env.BEZY_MEDIA_DATABASE_URL) throw new Error('MEDIA_DATABASE_NOT_CONFIGURED');
  if (!pool) {
    pool = new pg.Pool({ ...connectionOptions(process.env.BEZY_MEDIA_DATABASE_URL),
      max: 4, idleTimeoutMillis: 30000, allowExitOnIdle: true });
  }
  return pool.query(sql, params);
}
