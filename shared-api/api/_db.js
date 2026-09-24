// Bezy server-side database access layer — Neon PostgreSQL.
//
// One module owns every database connection in the product. Nothing else in api/ opens a
// connection, and nothing is ever exposed to the Mini App: the browser sees only JSON API
// responses, never a connection string, an error detail, or a schema name.
//
// Serverless (Vercel) posture:
//   - a single pg.Pool, sized for serverless concurrency (Neon's pooler handles the rest),
//   - idle connections are released on a timer so the instance never holds a socket open,
//   - every query is parameterized — user-controlled values are NEVER interpolated,
//   - database errors are mapped to the API's typed codes; SQL text never reaches clients,
//   - authorization (validated Telegram initData) always runs before any query.
//
// Canonical identity: Telegram numeric ids are BIGINT in PostgreSQL. They cross the JS
// boundary ONLY as strings, so large ids never lose precision.

import pg from 'pg';
// Daily quota keys are calendar dates, never local-time Date objects.
pg.types.setTypeParser(1082, value => value);

let pool = null;

/**
 * The database connection resolves from the environment in this order:
 *   1. DATABASE_URL (the canonical, explicit variable),
 *   2. NEON_DATABASE_URL, POSTGRES_URL, POSTGRES_URL_NON_POOLING (Vercel storage
 *      integrations inject one of these shapes),
 *   3. discrete PGHOST/PGUSER/PGPASSWORD/PGDATABASE (or their NEON_PG* twins) composed
 *      into a URL.
 * Nothing is ever logged — the resolved string only ever reaches the pg driver.
 */
export function resolveDatabaseUrl() {
  const direct = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL
    || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (direct) return direct;
  const host = process.env.PGHOST || process.env.NEON_PGHOST;
  const user = process.env.PGUSER || process.env.NEON_PGUSER;
  const password = process.env.PGPASSWORD ?? process.env.NEON_PGPASSWORD;
  const database = process.env.PGDATABASE || process.env.NEON_PGDATABASE;
  if (host && user && password && database) {
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/${encodeURIComponent(database)}`;
  }
  return null;
}

// URL SSL options override pg's explicit ssl object. Remove them before enforcing
// certificate and hostname verification, including when a URL says sslmode=disable.
export function connectionOptions(value) {
  let url;
  try { url = new URL(value); } catch { throw new ApiError('DATABASE_UNAVAILABLE'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new ApiError('DATABASE_UNAVAILABLE');
  for (const key of ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  return { connectionString: url.toString(), ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 10000 };
}

function logFailure(operation, error, extra = {}) {
  console.error(JSON.stringify({ category: 'database', operation,
    code: /^[A-Z0-9]{5}$/.test(error?.originalCode || error?.code || '') ? (error.originalCode || error.code) : 'DATABASE_UNAVAILABLE', ...extra }));
}

export function dbReady() {
  return Boolean(resolveDatabaseUrl());
}

export function db() {
  if (!pool) {
    const databaseUrl = resolveDatabaseUrl();
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not configured');
    }
    pool = new pg.Pool({
      ...connectionOptions(databaseUrl),
      max: 4,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      allowExitOnIdle: true,
      statement_timeout: 15000,
      idle_in_transaction_session_timeout: 15000
    });
    pool.on('error', (error) => logFailure('idle', error));
  }
  return pool;
}

export async function closeDb() {
  const current = pool;
  pool = null;
  if (current) await current.end();
}

export async function databaseHealth() {
  const started = performance.now();
  try {
    await query('SELECT 1');
    return { reachable: true, latencyMs: Math.round(performance.now() - started),
      pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount } };
  } catch { return { reachable: false, latencyMs: Math.round(performance.now() - started) }; }
}

/**
 * Parameterized single query. `params` are always values, never SQL. Returns { rows }.
 * Throws typed ApiError('DATABASE_UNAVAILABLE') on failure — the client never sees SQL.
 */
export class ApiError extends Error {
  constructor(code, status = 500) {
    super(code);
    this.status = status;
  }
}

export async function query(text, params = []) {
  try {
    const result = await db().query(text, params);
    return result;
  } catch (error) {
    // Never leak driver/SQL details to the API surface; the detail stays in the log only.
    logFailure('query', error);
    throw new ApiError('DATABASE_UNAVAILABLE');
  }
}

/**
 * Transaction helper. The callback receives a client with the same signature as query():
 *   await tx((q) => q('SELECT ...', [params]))
 * A throw inside the callback rolls back; ApiError propagates untouched.
 *
 * Deadlocks and serialization failures (40P01/40001) are retried automatically — the same
 * semantics PostgreSQL's runTransaction provided — so concurrent business operations
 * converge on a deterministic final state instead of surfacing as 500s.
 */
export async function tx(callback, attempts = 3) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let client;
    try {
      client = await db().connect();
      await client.query('BEGIN');
      const result = await callback(async (text, params = []) => {
        try {
          return await client.query(text, params);
        } catch (error) {
          // Preserve the driver error code so the retry logic below can see it.
          const wrapped = new ApiError('DATABASE_UNAVAILABLE');
          wrapped.originalCode = error.code;
          throw wrapped;
        }
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client?.query('ROLLBACK').catch(() => {});
      const code = error.originalCode || error.code;
      if ((code === '40P01' || code === '40001') && attempt < attempts - 1) {
        lastError = error;
        logFailure('retry', error, { attempt: attempt + 1 });
        client.release();
        client = null;
        await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
        continue;
      }
      if (error instanceof ApiError) throw error;
      if (!error.code && /^[A-Z][A-Z_]+$/.test(error.message || '')) throw error;
      logFailure('transaction', error);
      throw new ApiError('DATABASE_UNAVAILABLE');
    } finally {
      client?.release();
    }
  }
  throw lastError;
}

/**
 * Serializes transactions per business key WITHOUT row locks: the advisory lock is held
 * until the transaction ends and touches no table, so concurrent transactions over
 * DIFFERENT keys can never deadlock through foreign-key lock ordering. Call it inside tx()
 * as the first statement.
 */
export function advisoryLock(q, key) {
  return q('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
}

// ------------------------------------------------------------------ shared mappers

/** PostgreSQL timestamps arrive in the API as ISO strings; pg returns Date objects. */
export function toIso(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return null;
}

/** BIGINT stays a string end-to-end: JS Numbers must never carry Telegram ids. */
export function id(value) {
  const s = String(value ?? '');
  if (!/^\d+$/.test(s)) throw new ApiError('DATABASE_UNAVAILABLE');
  return s;
}

/** Simple WHERE-clause builder for a fixed set of equality filters (values parameterized). */
export function whereFilters(columns, filters) {
  const clauses = [];
  const params = [];
  for (const [column, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;
    if (!columns.includes(column)) throw new ApiError('DATABASE_UNAVAILABLE');
    params.push(value);
    clauses.push(`${column} = $${params.length}`);
  }
  return { clause: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}
