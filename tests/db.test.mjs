// Bezy Neon PostgreSQL — ACID + idempotency + concurrency verification.
//
// Drives the REAL API handlers through the harness against the ISOLATED bezy_test database.
// Every check asserts DATABASE STATE (via direct SQL), not merely HTTP status codes — the
// point of this suite is that the database itself enforces the invariants.
//
// The production database is never touched: DATABASE_URL must point at bezy_test, which
// scripts/setup-test-db.mjs creates from the local env file.
//
//   NEON_ENV_FILE=<path> node scripts/setup-test-db.mjs --reset
//   NEON_ENV_FILE=<path> node tests/db.test.mjs
import fs from 'node:fs';
import pg from 'pg';
import { startHarness, makeInitData, TEST_USERS } from './harness.mjs';

// ------------------------------------------------------------------ credentials (local only)
const envFile = process.env.NEON_ENV_FILE;
if (!envFile || !fs.existsSync(envFile)) {
  console.error('Set NEON_ENV_FILE to the local Vercel/Neon env file path.');
  process.exit(1);
}
const env = {};
for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2];
}
const adminUrl = env.DATABASE_URL_UNPOOLED || env.POSTGRES_URL_NON_POOLING;
const TEST_DB = 'bezy_test';
const testUrl = new URL(adminUrl);
testUrl.pathname = `/${TEST_DB}`;
process.env.DATABASE_URL = testUrl.toString();
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '111111:LOCAL-TEST-BOT-TOKEN';

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `  -> ${String(detail).slice(0, 240)}` : ''}`); }
}
function section(title) { console.log(`\n== ${title} ==`); }

const harness = await startHarness({ port: 3401 });
const BASE = harness.url;
const initData = Object.fromEntries(Object.entries(TEST_USERS).map(([k, u]) => [k, makeInitData(u)]));
const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';

const sql = new pg.Client({ connectionString: testUrl.toString(), ssl: { rejectUnauthorized: false } });
await sql.connect();

async function call(path, who, body = {}) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, initData: initData[who] })
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
async function webhook(update) {
  const res = await fetch(`${BASE}/api/telegram/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret },
    body: JSON.stringify(update)
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const q = (text, params = []) => sql.query(text, params);

async function cleanup() {
  await q('DELETE FROM messages');
  await q('DELETE FROM conversation_reads');
  await q('DELETE FROM conversations');
  await q('DELETE FROM matches');
  await q('DELETE FROM actions');
  await q('DELETE FROM likes_received');
  await q('DELETE FROM blocks');
  await q('DELETE FROM blocked_by');
  await q('DELETE FROM reports');
  await q('DELETE FROM support_requests');
  await q('DELETE FROM bezy_payments');
  await q('DELETE FROM bezy_invoices');
  await q('DELETE FROM premium_memberships');
  await q('DELETE FROM profile_translations');
  await q('DELETE FROM rate_limits');
  await q('DELETE FROM usage');
  await q('DELETE FROM prompt_answers');
  await q('DELETE FROM profiles');
  await q('DELETE FROM preferences');
  await q('DELETE FROM notification_settings');
  await q('DELETE FROM users');
}

const PROFILE_A = { displayName: 'Ada', age: 29, city: 'Paris', gender: 'woman', seeking: 'men', interests: ['music'], languages: [], bio: 'E2E.', prompts: [], discoverable: true };
const PROFILE_B = { displayName: 'Bo', age: 31, city: 'Paris', gender: 'man', seeking: 'women', interests: ['music'], languages: [], bio: 'E2E.', prompts: [], discoverable: true };

async function seedUser(key, profile) {
  await call('/api/profile/me', key, { ageEligibilityConfirmed: true });
  await call('/api/profile/me', key, { profile });
}
async function seedPremium(key) {
  // Direct DB grant, like the operator would during tests: membership active without payment.
  await q(
    `INSERT INTO premium_memberships (telegram_id, active, plan_id, expires_at, purchased_at, updated_at, source)
     VALUES ($1, TRUE, 'monthly', now() + interval '30 days', now(), now(), 'test') ON CONFLICT (telegram_id) DO UPDATE SET active = TRUE, expires_at = now() + interval '30 days'`,
    [initData[key] ? JSON.parse(new URLSearchParams(initData[key]).get('user')).id : null]
  );
}

const uid = (key) => String(JSON.parse(new URLSearchParams(initData[key]).get('user')).id);
const IDS = { a: uid('a'), b: uid('b'), c: uid('c'), d: uid('d') };

await cleanup();

// ------------------------------------------------------------------ rollback + constraints
section('Transactions roll back atomically');
{
  const { tx } = await import('../api/_db.js');
  let threw = false;
  try {
    await tx(async (q2) => {
      await q2('INSERT INTO users (telegram_id, created_at, updated_at) VALUES ($1, now(), now())', ['990000099']);
      throw new Error('forced failure');
    });
  } catch { threw = true; }
  check('a forced failure inside a transaction throws', threw);
  const leftover = await q('SELECT 1 FROM users WHERE telegram_id = $1', ['990000099']);
  check('nothing from the failed transaction was committed', leftover.rows.length === 0);
}

section('Unique constraints are database-enforced');
{
  await q('INSERT INTO users (telegram_id, created_at, updated_at) VALUES ($1, now(), now())', ['990000098']);
  let threw = false;
  try { await q('INSERT INTO users (telegram_id, created_at, updated_at) VALUES ($1, now(), now())', ['990000098']); }
  catch { threw = true; }
  check('duplicate telegram id is rejected by the primary key', threw);
  await q('DELETE FROM users WHERE telegram_id = $1', ['990000098']);
}

// ------------------------------------------------------------------ profile + swipe + match
section('Profile persistence through the PostgreSQL handlers');
{
  await call('/api/profile/me', 'a', { ageEligibilityConfirmed: true });
  await call('/api/profile/me', 'a', { profile: PROFILE_A });
  const read = await call('/api/profile/me', 'a');
  check('profile save persists and reads back', read.status === 200 && read.data.profile?.profile?.displayName === 'Ada', JSON.stringify(read.data?.profile?.profile).slice(0, 120));
  check('ageStatus is the derived self-declaration', read.data.ageStatus === 'selfDeclared18Plus');
  const prompt = await q('SELECT count(*)::int AS n FROM prompt_answers WHERE telegram_id = $1', [IDS.a]);
  check('no prompt rows for a profile without prompts', prompt.rows[0].n === 0);
}

section('Swipe idempotency and atomic action writes');
{
  await cleanup();
  await seedUser('a', PROFILE_A); await seedUser('b', PROFILE_B);
  await call('/api/swipe', 'a', { targetId: IDS.b, action: 'like' });
  await call('/api/swipe', 'a', { targetId: IDS.b, action: 'like' });
  const actions = await q('SELECT action, count(*)::int AS n FROM actions WHERE actor_id = $1 AND target_id = $2 GROUP BY action', [IDS.a, IDS.b]);
  check('repeated likes produce exactly one action row', actions.rows.length === 1 && actions.rows[0].n === 1, JSON.stringify(actions.rows));
  const received = await q('SELECT count(*)::int AS n FROM likes_received WHERE target_id = $1 AND from_id = $2', [IDS.b, IDS.a]);
  check('the likes_received mirror is written atomically with the action', received.rows[0].n === 1);
}

section('Concurrent mutual likes produce exactly one match');
{
  await cleanup();
  await seedUser('c', { ...PROFILE_A, displayName: 'Cy' });
  await seedUser('d', { ...PROFILE_B, displayName: 'Dee' });
  const results = await Promise.all([
    call('/api/swipe', 'c', { targetId: IDS.d, action: 'like' }),
    call('/api/swipe', 'd', { targetId: IDS.c, action: 'like' })
  ]);
  check('both concurrent likes succeed', results.every((r) => r.status === 200), JSON.stringify(results.map((r) => r.status)));
  const matches = await q('SELECT count(*)::int AS n FROM matches WHERE participant_a = $1 OR participant_b = $2', [IDS.c, IDS.c]);
  check('exactly one match row exists', matches.rows[0].n === 1, String(matches.rows[0].n));
  const active = await q('SELECT active FROM matches LIMIT 1');
  check('the match is active', active.rows[0]?.active === true);
}

// ------------------------------------------------------------------ messaging
section('Message idempotency, window and read watermark');
{
  await cleanup();
  await seedUser('a', PROFILE_A); await seedUser('b', PROFILE_B);
  await seedPremium('a'); await seedPremium('b');
  await call('/api/swipe', 'a', { targetId: IDS.b, action: 'like' });
  await call('/api/swipe', 'b', { targetId: IDS.a, action: 'like' });
  const cid = [IDS.a, IDS.b].sort().join('_');

  const send = await call('/api/messages', 'a', { action: 'send', conversationId: cid, text: 'Hello!', clientId: 'aaaaaaaa' });
  check('a Premium participant can send', send.status === 200, JSON.stringify(send.data));
  const retry = await call('/api/messages', 'a', { action: 'send', conversationId: cid, text: 'Hello!', clientId: 'aaaaaaaa' });
  check('a retried send returns duplicate', retry.data.duplicate === true);
  const count = await q('SELECT count(*)::int AS n FROM messages WHERE conversation_id = $1 AND client_id = $2', [cid, 'aaaaaaaa']);
  check('exactly one message row exists for the client id', count.rows[0].n === 1);

  // Concurrent retries of the same client id.
  const concurrent = await Promise.all([
    call('/api/messages', 'a', { action: 'send', conversationId: cid, text: 'Race!', clientId: 'bbbbbbbb' }),
    call('/api/messages', 'a', { action: 'send', conversationId: cid, text: 'Race!', clientId: 'bbbbbbbb' })
  ]);
  const raceCount = await q('SELECT count(*)::int AS n FROM messages WHERE conversation_id = $1 AND client_id = $2', [cid, 'bbbbbbbb']);
  check('concurrent sends of one client id create exactly one row', raceCount.rows[0].n === 1, String(raceCount.rows[0].n));
  check('both concurrent responses agree on the message', concurrent.every((r) => r.status === 200), JSON.stringify(concurrent.map((r) => r.status)));

  // Newest-window: 205 messages, list returns newest 200.
  for (let i = 0; i < 205; i++) {
    await q(
      'INSERT INTO messages (conversation_id, client_id, sender_id, text, created_at) VALUES ($1, $2, $3, $4, to_timestamp($5))',
      [cid, `cap${String(i).padStart(6, '0')}`, IDS.a, `m${i}`, 1000000000 + i]
    );
  }
  const list = await call('/api/messages', 'a', { action: 'list', conversationId: cid });
  check('the list returns the newest 200', list.data.messages?.length === 200, String(list.data.messages?.length));
  check('the cap truncates old history, never the recent end',
    list.data.messages[0]?.text === 'm7' && list.data.messages[199]?.text === 'Race!',
    `${list.data.messages?.[0]?.text} .. ${list.data.messages?.[199]?.text}`);

  // Read watermark: never backwards, even under a concurrent older write.
  const t2 = new Date(Date.now() - 60000).toISOString();
  const t1 = new Date(Date.now() - 120000).toISOString();
  await call('/api/messages', 'a', { action: 'read', conversationId: cid, lastMessageAt: t2 });
  await Promise.all([
    call('/api/messages', 'a', { action: 'read', conversationId: cid, lastMessageAt: t1 }),
    call('/api/messages', 'a', { action: 'read', conversationId: cid, lastMessageAt: t2 })
  ]);
  const watermark = await q('SELECT last_read_at FROM conversation_reads WHERE conversation_id = $1 AND user_id = $2', [cid, IDS.a]);
  check('the watermark never moves backwards', Math.abs(new Date(watermark.rows[0].last_read_at).getTime() - new Date(t2).getTime()) < 1000, String(watermark.rows[0].last_read_at));
}

section('Block closes messaging transactionally; unblock restores mirrors');
{
  await cleanup();
  await seedUser('a', PROFILE_A); await seedUser('b', PROFILE_B);
  await seedPremium('a'); await seedPremium('b');
  await call('/api/swipe', 'a', { targetId: IDS.b, action: 'like' });
  await call('/api/swipe', 'b', { targetId: IDS.a, action: 'like' });
  const cid = [IDS.a, IDS.b].sort().join('_');
  await call('/api/messages', 'a', { action: 'send', conversationId: cid, text: 'hi', clientId: 'cccccccc' });

  await call('/api/relationship', 'a', { action: 'block', targetId: IDS.b });
  const listAfter = await call('/api/messages', 'b', { action: 'list', conversationId: cid });
  check('blocking closes the conversation for both sides', listAfter.status === 404 && listAfter.data.error === 'CONVERSATION_UNAVAILABLE');
  const mirrors = await q('SELECT (SELECT count(*)::int FROM blocks WHERE blocker_id=$1) AS b, (SELECT count(*)::int FROM blocked_by WHERE blocked_id=$2) AS m', [IDS.a, IDS.b]);
  check('both block mirrors exist', mirrors.rows[0].b === 1 && mirrors.rows[0].m === 1);

  await call('/api/relationship', 'a', { action: 'unblock', targetId: IDS.b });
  const after = await q('SELECT (SELECT count(*)::int FROM blocks WHERE blocker_id=$1) AS b, (SELECT count(*)::int FROM blocked_by WHERE blocked_id=$2) AS m', [IDS.a, IDS.b]);
  check('unblock removes both mirrors', after.rows[0].b === 0 && after.rows[0].m === 0);
}

// ------------------------------------------------------------------ payments
section('Payment webhook: replay idempotency and forged-event rejection');
{
  await cleanup();
  await seedUser('a', PROFILE_A);
  const invoice = await call('/api/premium', 'a', { action: 'invoice', planId: 'monthly' });
  check('invoice creation succeeds', invoice.status === 200 && invoice.data.invoiceLink, JSON.stringify(invoice.data).slice(0, 80));
  const calls = await (await fetch(`${BASE}/__telegram-calls`)).json();
  const invoiceCall = calls.filter((c) => c.method === 'createInvoiceLink').pop();
  const payload = invoiceCall?.body?.payload;
  check('the harness captured the invoice payload', Boolean(payload));

  const paymentUpdate = (chargeId, invoicePayload) => ({
    message: {
      chat: { id: Number(IDS.a) }, from: { id: Number(IDS.a), language_code: 'en' },
      successful_payment: {
        currency: 'XTR', total_amount: 250, invoice_payload: invoicePayload,
        telegram_payment_charge_id: chargeId, provider_payment_charge_id: `prov-${chargeId}`
      }
    }
  });

  // Forged: a well-formed payment whose invoice does not exist.
  const forged = await webhook(paymentUpdate('charge_forged', `forged_payload_${Date.now()}`));
  check('a forged successful_payment is acknowledged', forged.status === 200);
  const forgedMembership = await q('SELECT count(*)::int AS n FROM premium_memberships WHERE telegram_id = $1 AND active = TRUE', [IDS.a]);
  check('a forged payment activates nothing', forgedMembership.rows[0].n === 0);

  // Legitimate: the real invoice payload activates Premium exactly once.
  const first = await webhook(paymentUpdate('charge_real', payload));
  const replay = await webhook(paymentUpdate('charge_real', payload));
  const [payments, membership] = await Promise.all([
    q('SELECT count(*)::int AS n FROM bezy_payments WHERE telegram_payment_charge_id = $1', ['charge_real']),
    q('SELECT count(*)::int AS n FROM premium_memberships WHERE telegram_id = $1 AND active = TRUE', [IDS.a])
  ]);
  check('the legitimate payment is recorded once', payments.rows[0].n === 1, String(payments.rows[0].n));
  check('the webhook replay does not duplicate the payment', first.status === 200 && replay.status === 200);
  check('Premium activates exactly once', membership.rows[0].n === 1, String(membership.rows[0].n));
  const invoiceRow = await q('SELECT status, telegram_payment_charge_id FROM bezy_invoices WHERE nonce = (SELECT nonce FROM bezy_invoices LIMIT 1)');
  check('the invoice is marked paid with the charge id', invoiceRow.rows[0]?.status === 'paid' && invoiceRow.rows[0]?.telegram_payment_charge_id === 'charge_real');
}

// ------------------------------------------------------------------ deletion
section('Account deletion is idempotent, complete and retention-aware');
{
  await cleanup();
  await seedUser('a', PROFILE_A); await seedUser('b', PROFILE_B);
  await call('/api/swipe', 'a', { targetId: IDS.b, action: 'like' });
  await call('/api/swipe', 'b', { targetId: IDS.a, action: 'like' });
  // A payment record that MUST survive deletion.
  await q(
    `INSERT INTO bezy_payments (telegram_payment_charge_id, telegram_user_id, product, plan_id, stars, currency, invoice_payload, status, created_at)
     VALUES ('charge_keep', $1, 'bezy_premium', 'monthly', 250, 'XTR', 'payload', 'processed', now())`,
    [IDS.a]
  );

  const deleted = await call('/api/account', 'a', { action: 'delete', confirm: 'DELETE' });
  check('deletion succeeds', deleted.status === 200 && deleted.data.deleted === true, JSON.stringify(deleted.data).slice(0, 120));
  const user = await q('SELECT 1 FROM users WHERE telegram_id = $1', [IDS.a]);
  check('the user row is gone', user.rows.length === 0);
  const matchState = await q('SELECT active, ended_reason FROM matches LIMIT 1');
  check('the match survives deactivated', matchState.rows[0]?.active === false && matchState.rows[0]?.ended_reason === 'account_deleted');
  const payment = await q('SELECT 1 FROM bezy_payments WHERE telegram_payment_charge_id = $1', ['charge_keep']);
  check('the payment record is retained', payment.rows.length === 1);
  const deletedAgain = await call('/api/account', 'a', { action: 'delete', confirm: 'DELETE' });
  check('deleting again is idempotent', deletedAgain.data?.deleted === true && deletedAgain.data?.alreadyDeleted === true);

  // Concurrent deletion attempts converge on the same state.
  await cleanup();
  await seedUser('a', PROFILE_A);
  await Promise.all([
    call('/api/account', 'a', { action: 'delete', confirm: 'DELETE' }),
    call('/api/account', 'a', { action: 'delete', confirm: 'DELETE' })
  ]);
  const userAfter = await q('SELECT 1 FROM users WHERE telegram_id = $1', [IDS.a]);
  check('concurrent deletions leave no user row', userAfter.rows.length === 0);
}

// ------------------------------------------------------------------ migration-style idempotency
section('Migration-style upserts never duplicate');
{
  await cleanup();
  const { tx } = await import('../api/_db.js');
  // Simulate a re-run of a migration batch: the same logical rows inserted twice.
  for (let run = 0; run < 2; run++) {
    await tx(async (q2) => {
      await q2('INSERT INTO users (telegram_id, created_at, updated_at) VALUES ($1, to_timestamp(1000), to_timestamp(1000)) ON CONFLICT (telegram_id) DO NOTHING', ['990000097']);
      await q2('INSERT INTO matches (match_id, participant_a, participant_b, source, active, created_at) VALUES ($1, $2, $3, $4, TRUE, to_timestamp(1000)) ON CONFLICT (match_id) DO NOTHING', ['990000096_990000097', '990000096', '990000097', 'mutual_like']);
    });
  }
  const users = await q('SELECT count(*)::int AS n FROM users WHERE telegram_id = $1', ['990000097']);
  const matches = await q('SELECT count(*)::int AS n FROM matches WHERE match_id = $1', ['990000096_990000097']);
  check('a re-run migration batch duplicates nothing', users.rows[0].n === 1 && matches.rows[0].n === 1);
  await q('DELETE FROM matches WHERE match_id = $1', ['990000096_990000097']);
  await q('DELETE FROM users WHERE telegram_id = $1', ['990000097']);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (fail) { console.log('Failed:\n - ' + failures.join('\n - ')); process.exit(1); }
// The harness server would keep the event loop alive (and its Windows teardown can assert
// on socket close); exit explicitly once the test database is clean.
process.exit(0);
