// Bezy adversarial security suite: rate limiting, user enumeration, identity spoofing,
// relationship abuse, payment forgery, webhook robustness and initData handling.
//
// Runs the real handlers against the real Firestore using synthetic Telegram ids 9000000xx,
// which are removed before and after the run. Real production records are never touched.
//
//   BEZY_SERVICE_ACCOUNT=<path to service-account.json> node tests/security.test.mjs
import { startHarness, makeInitData, TEST_USERS } from './harness.mjs';
import { RATE_LIMITS, enforceRateLimit, RateLimitError } from '../api/_ratelimit.js';
import { premiumPlans, parseInvoicePayload } from '../api/_premium.js';
import { db } from '../api/_firebase.js';

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `  -> ${String(detail).slice(0, 240)}` : ''}`); }
}
const section = (title) => console.log(`\n== ${title} ==`);

const harness = await startHarness({ port: Number(process.env.PORT || 3312) });
const BASE = harness.url;
const initData = Object.fromEntries(Object.entries(TEST_USERS).map(([k, u]) => [k, makeInitData(u)]));

async function call(path, who, body = {}) {
  const res = await fetch(BASE + path, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, initData: typeof who === 'string' && who.includes('=') ? who : initData[who] })
  });
  return { status: res.status, data: await res.json().catch(() => ({})), headers: res.headers };
}
async function webhook(update, headers = {}) {
  const res = await fetch(`${BASE}/api/telegram/webhook`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(update)
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const firestore = db();
const isTestId = (id) => /^9000000\d\d$/.test(String(id));
async function clearRateLimits() {
  for (const doc of (await firestore.collection('rateLimits').get()).docs) {
    if (isTestId(doc.id)) await doc.ref.delete();
  }
}
async function cleanup() {
  for (const doc of (await firestore.collection('users').get()).docs) {
    if (isTestId(doc.id)) await firestore.recursiveDelete(doc.ref);
  }
  for (const col of ['matches', 'bezyPayments', 'bezyInvoices', 'reports']) {
    for (const doc of (await firestore.collection(col).get()).docs) {
      const d = doc.data();
      if ((d.participants || []).some(isTestId) || isTestId(d.telegramUserId) || isTestId(d.reporterId) || isTestId(d.targetId)) {
        await doc.ref.delete();
      }
    }
  }
  await clearRateLimits();
}
const PROFILES = {
  a: { displayName: 'Ada', age: 29, city: 'Paris', gender: 'woman', seeking: 'men', interests: ['music'], bio: 'Sec.', discoverable: true },
  b: { displayName: 'Bo', age: 31, city: 'Paris', gender: 'man', seeking: 'women', interests: ['music'], bio: 'Sec.', discoverable: true },
  c: { displayName: 'Cy', age: 33, city: 'Paris', gender: 'man', seeking: 'women', interests: ['art'], bio: 'Sec.', discoverable: true },
  d: { displayName: 'Dee', age: 28, city: 'Paris', gender: 'man', seeking: 'everyone', interests: ['books'], bio: 'Sec.', discoverable: true }
};
async function seedAll() {
  for (const key of ['a', 'b', 'c', 'd']) {
    await call('/api/profile/me', key, { ageEligibilityConfirmed: true });
    await call('/api/profile/me', key, { profile: PROFILES[key] });
  }
  await clearRateLimits();
}

await cleanup();
const PLANS = premiumPlans();

try {
  // ---------------------------------------------------------------- rate limiting
  section('Rate limiting: unit behaviour');
  const rlUser = '900000090';
  await firestore.collection('rateLimits').doc(rlUser).delete().catch(() => {});
  const burst = RATE_LIMITS.report[0];
  for (let i = 0; i < burst.limit; i++) await enforceRateLimit(firestore, rlUser, 'report');
  let threw = null;
  try { await enforceRateLimit(firestore, rlUser, 'report'); } catch (error) { threw = error; }
  check('limit is enforced once the window is full', threw instanceof RateLimitError, String(threw));
  check('retryAfter is a positive number of seconds', threw?.retryAfter > 0 && threw.retryAfter <= burst.windowSeconds, String(threw?.retryAfter));
  check('error exposes no limit or count', threw?.limit === undefined && threw?.count === undefined);

  // A new window releases the limit without any scheduled cleanup.
  const later = Date.now() + (burst.windowSeconds * 1000) + 1000;
  let recovered = true;
  try { await enforceRateLimit(firestore, rlUser, 'report', later); } catch { recovered = false; }
  check('a fresh window allows requests again', recovered);

  // Buckets are independent: exhausting one must not block another.
  let otherBucketOk = true;
  try { await enforceRateLimit(firestore, rlUser, 'block'); } catch { otherBucketOk = false; }
  check('buckets are independent', otherBucketOk);
  check('every bucket has at least one window', Object.values(RATE_LIMITS).every((w) => Array.isArray(w) && w.length >= 1));
  check('unknown bucket is a programming error, not a silent allow',
    await enforceRateLimit(firestore, rlUser, 'nope').then(() => false, (e) => !e.rateLimited));
  await firestore.collection('rateLimits').doc(rlUser).delete().catch(() => {});

  section('Rate limiting: HTTP behaviour');
  await cleanup();
  await seedAll();
  let limited = null;
  for (let i = 0; i < RATE_LIMITS.account_export[0].limit + 2; i++) {
    const r = await call('/api/account', 'a', { action: 'export' });
    if (r.status === 429) { limited = r; break; }
  }
  check('export is rate limited', limited?.status === 429, String(limited?.status));
  check('rate-limited response uses a stable code', limited?.data?.error === 'RATE_LIMITED', JSON.stringify(limited?.data));
  check('Retry-After header is set', Boolean(limited?.headers?.get('retry-after')), limited?.headers?.get('retry-after'));
  check('response does not disclose the configured limit',
    limited?.data?.limit === undefined && limited?.data?.count === undefined && limited?.data?.bucket === undefined,
    JSON.stringify(limited?.data));

  // Rate limiting must not break ordinary use: a normal session stays well inside the budget.
  await clearRateLimits();
  let normalUseOk = true;
  for (let i = 0; i < 10; i++) {
    if ((await call('/api/discover', 'a')).status !== 200) { normalUseOk = false; break; }
  }
  check('ten deck loads in a row are allowed', normalUseOk);
  await clearRateLimits();
  const swipeTargets = ['900000002', '900000003', '900000004'];
  let swipesOk = true;
  for (const target of swipeTargets) {
    if ((await call('/api/swipe', 'a', { targetId: target, action: 'pass' })).status !== 200) { swipesOk = false; break; }
  }
  check('a normal run of swipes is allowed', swipesOk);

  // Limits are per user, so one abusive account cannot lock out anyone else.
  await clearRateLimits();
  for (let i = 0; i < RATE_LIMITS.account_export[0].limit + 1; i++) await call('/api/account', 'a', { action: 'export' });
  check('one user hitting a limit does not affect another', (await call('/api/account', 'b', { action: 'export' })).status === 200);
  await clearRateLimits();

  section('Rate limiting: erased with the account');
  await cleanup();
  await seedAll();
  await call('/api/account', 'a', { action: 'export' });
  check('rate-limit counters exist while the account does',
    (await firestore.collection('rateLimits').doc('900000001').get()).exists);
  await call('/api/account', 'a', { action: 'delete', confirm: 'DELETE' });
  check('rate-limit counters are erased with the account',
    (await firestore.collection('rateLimits').doc('900000001').get()).exists === false);

  // ---------------------------------------------------------------- enumeration
  section('User enumeration: swipe');
  await cleanup();
  await seedAll();
  // Four target classes that must be indistinguishable to the caller.
  await firestore.collection('users').doc('900000091').set({
    telegramId: 900000091, ageEligibilityConfirmed: true, profileComplete: true, discoverable: false,
    profile: { ...PROFILES.b, displayName: 'Hidden', discoverable: false }, createdAt: new Date()
  });
  await firestore.collection('users').doc('900000092').set({
    telegramId: 900000092, ageEligibilityConfirmed: true, profileComplete: false, discoverable: false, createdAt: new Date()
  });
  // A paused account (here: objection) must be indistinguishable from the other unreachable
  // classes — a caller must not be able to tell "exists but has objected" from "does not exist".
  await firestore.collection('users').doc('900000093').set({
    telegramId: 900000093, ageEligibilityConfirmed: true, profileComplete: true, discoverable: true,
    processingObjection: true, processingObjectedAt: new Date(),
    profile: { ...PROFILES.b, displayName: 'Objecting', discoverable: true }, createdAt: new Date()
  });
  await call('/api/relationship', 'a', { action: 'block', targetId: '900000003' });
  await clearRateLimits();

  const probes = {
    'no account at all': await call('/api/swipe', 'a', { targetId: '900000099', action: 'like' }),
    'account but hidden': await call('/api/swipe', 'a', { targetId: '900000091', action: 'like' }),
    'account but incomplete profile': await call('/api/swipe', 'a', { targetId: '900000092', action: 'like' }),
    'account but objecting': await call('/api/swipe', 'a', { targetId: '900000093', action: 'like' }),
    'blocked by me': await call('/api/swipe', 'a', { targetId: '900000003', action: 'like' })
  };
  const signatures = Object.entries(probes).map(([label, r]) => [label, `${r.status}:${JSON.stringify(r.data)}`]);
  const unique = new Set(signatures.map(([, sig]) => sig));
  check('all five target classes are indistinguishable', unique.size === 1, signatures.map(([l, s]) => `${l}=${s}`).join('  |  '));
  await clearRateLimits();

  section('User enumeration: relationship endpoints');
  const blockKnown = await call('/api/relationship', 'a', { action: 'block', targetId: '900000004' });
  const blockUnknown = await call('/api/relationship', 'a', { action: 'block', targetId: '900000098' });
  check('block on a stranger looks identical to block on a real user',
    blockKnown.status === blockUnknown.status && JSON.stringify(blockKnown.data) === JSON.stringify(blockUnknown.data),
    `${JSON.stringify(blockKnown.data)} vs ${JSON.stringify(blockUnknown.data)}`);
  check('no mirror document is created under a non-existent account',
    (await firestore.collection('users').doc('900000098').collection('blockedBy').doc('900000001').get()).exists === false);

  const reportKnown = await call('/api/relationship', 'a', { action: 'report', targetId: '900000002', reason: 'spam' });
  const reportUnknown = await call('/api/relationship', 'a', { action: 'report', targetId: '900000097', reason: 'spam' });
  check('report on a stranger returns the same shape',
    reportKnown.status === reportUnknown.status && reportUnknown.data.reported === true && reportKnown.data.reported === true);
  check('no report is stored for a non-existent account',
    (await firestore.collection('reports').where('targetId', '==', '900000097').get()).size === 0);
  await clearRateLimits();

  section('User enumeration: other endpoints expose only the caller');
  let r = await call('/api/profile/me', 'a');
  check('profile endpoint takes no target parameter', r.data.profile?.telegramId === 900000001);
  r = await call('/api/profile/me', 'a', { telegramUserId: '900000002', profile: PROFILES.b });
  check('a client-supplied user id is ignored by the profile endpoint',
    (await firestore.collection('users').doc('900000002').get()).data()?.profile?.displayName === 'Bo');
  r = await call('/api/matches', 'a', { targetId: '900000002' });
  check('matches ignores any target parameter', Array.isArray(r.data.matches));
  r = await call('/api/premium', 'a', { action: 'status', telegramUserId: '900000002' });
  check('premium status is always the caller\'s own', r.status === 200 && r.data.premium !== undefined);
  r = await call('/api/account', 'a', { action: 'export', telegramUserId: '900000002' });
  check('export always returns the caller\'s own account', r.data.data?.account?.telegramId === 900000001, String(r.data.data?.account?.telegramId));
  await clearRateLimits();

  // ---------------------------------------------------------------- identity
  section('Identity and initData');
  check('missing hash rejected', (await call('/api/premium', 'user=%7B%22id%22%3A900000001%7D')).status === 401);
  check('invalid hash rejected', (await call('/api/premium', 'user=%7B%22id%22%3A900000001%7D&hash=deadbeef')).status === 401);
  check('empty initData rejected', (await call('/api/premium', '')).status === 401);
  check('initData from a different bot token rejected',
    (await call('/api/premium', makeInitData(TEST_USERS.a, '222222:OTHER-BOT-TOKEN'))).status === 401);

  // Tampering with the user object after signing must invalidate the signature.
  const tampered = new URLSearchParams(initData.a);
  tampered.set('user', JSON.stringify({ ...TEST_USERS.a, id: 900000002 }));
  check('altered user object rejected', (await call('/api/premium', tampered.toString())).status === 401);

  // An expired auth_date must fail even though the signature would otherwise be valid.
  const stale = makeInitData(TEST_USERS.a);
  const staleParams = new URLSearchParams(stale);
  staleParams.set('auth_date', String(Math.floor(Date.now() / 1000) - 90000));
  check('expired auth_date rejected', (await call('/api/premium', staleParams.toString())).status === 401);
  const future = new URLSearchParams(makeInitData(TEST_USERS.a));
  future.set('auth_date', String(Math.floor(Date.now() / 1000) + 3600));
  check('future-dated auth_date rejected', (await call('/api/premium', future.toString())).status === 401);
  check('valid initData still accepted', (await call('/api/telegram/session', 'a')).status === 200);

  // ---------------------------------------------------------------- relationships
  section('Relationship abuse');
  await cleanup();
  await seedAll();
  await call('/api/swipe', 'a', { targetId: '900000002', action: 'like' });
  await call('/api/swipe', 'b', { targetId: '900000001', action: 'like' });
  await clearRateLimits();

  // Only a participant can end a match.
  r = await call('/api/relationship', 'c', { action: 'unmatch', targetId: '900000001' });
  check('a third party cannot unmatch someone else\'s match', r.data.unmatched === false, JSON.stringify(r.data));
  check('the match still exists', (await call('/api/matches', 'a')).data.matches.length === 1);

  // A blocked user cannot re-establish contact by any route.
  await call('/api/relationship', 'a', { action: 'block', targetId: '900000002' });
  await clearRateLimits();
  check('blocked user cannot like the blocker', (await call('/api/swipe', 'b', { targetId: '900000001', action: 'like' })).status === 404);
  check('blocked user cannot super-like the blocker', (await call('/api/swipe', 'b', { targetId: '900000001', action: 'super' })).status === 404);
  check('blocker cannot be rediscovered by the blocked user',
    !((await call('/api/discover', 'b')).data.profiles || []).some((p) => p.id === '900000001'));
  check('the block also ended the match', (await call('/api/matches', 'b')).data.matches.length === 0);

  // Unblocking restores contactability but must not resurrect the ended match.
  await call('/api/relationship', 'a', { action: 'unblock', targetId: '900000002' });
  check('unblocking does not resurrect the ended match', (await call('/api/matches', 'a')).data.matches.length === 0);
  await clearRateLimits();

  // A reporter cannot forge who filed the report.
  r = await call('/api/relationship', 'a', { action: 'report', targetId: '900000003', reason: 'spam', reporterId: '900000002' });
  const forged = await firestore.collection('reports').where('targetId', '==', '900000003').get();
  check('reporter id cannot be spoofed', forged.docs.every((d) => d.data().reporterId === '900000001'),
    forged.docs.map((d) => d.data().reporterId).join(','));
  check('reports cannot be listed through the API',
    (await call('/api/relationship', 'a', { action: 'list_reports', targetId: '900000002' })).status === 400);
  check('report status cannot be set by the client', forged.docs.every((d) => d.data().status === 'open'));
  await clearRateLimits();

  // ---------------------------------------------------------------- premium
  section('Premium and payment forgery');
  await cleanup();
  await seedAll();
  r = await call('/api/premium', 'a', { action: 'invoice', planId: 'monthly', stars: 1, priceStars: 1, amount: 1 });
  const invoiceCall = (await (await fetch(`${BASE}/__telegram-calls`)).json()).filter((c) => c.method === 'createInvoiceLink').pop();
  check('client-supplied price is ignored', invoiceCall.body.prices[0].amount === PLANS.monthly.stars, String(invoiceCall.body.prices[0].amount));
  check('client-supplied user id is ignored', parseInvoicePayload(invoiceCall.body.payload).telegramUserId === '900000001');
  check('client cannot activate Premium directly',
    (await call('/api/premium', 'a', { action: 'activate', planId: 'yearly' })).status === 400);
  check('client cannot set membership through the profile endpoint',
    (await call('/api/profile/me', 'a', { bezyPremium: { active: true, expiresAt: new Date(Date.now() + 8.64e7) } })).status === 200
    && (await call('/api/premium', 'a')).data.premium.active === false);
  check('Telegram Premium flag cannot be self-assigned to gain Bezy Premium',
    (await call('/api/profile/me', 'a', { isPremiumTelegram: true })).status === 200
    && (await call('/api/premium', 'a')).data.premium.active === false);

  // A fabricated payment for another user must not grant them anything.
  const goodPayload = invoiceCall.body.payload;
  await webhook({
    message: {
      chat: { id: 900000002 }, from: { id: 900000002, language_code: 'en' },
      successful_payment: { currency: 'XTR', total_amount: PLANS.monthly.stars, invoice_payload: goodPayload, telegram_payment_charge_id: 'sec_forged_1', provider_payment_charge_id: 'p' }
    }
  });
  check('a payment whose payload belongs to another user is refused',
    (await firestore.collection('bezyPayments').doc('sec_forged_1').get()).exists === false);
  check('neither account gained Premium', (await call('/api/premium', 'b')).data.premium.active === false);

  // ---------------------------------------------------------------- webhook
  section('Webhook robustness');
  const malformed = [
    {},
    { message: {} },
    { message: { chat: {} } },
    { message: { chat: { id: 900000001 } } },
    { pre_checkout_query: {} },
    { message: { chat: { id: 900000001 }, from: { id: 900000001 }, successful_payment: {} } },
    { message: { chat: { id: 900000001 }, from: { id: 900000001 }, refunded_payment: {} } },
    { edited_message: { chat: { id: 900000001 }, text: '/start' } },
    { channel_post: { chat: { id: 1 }, text: 'hello' } },
    { my_chat_member: { chat: { id: 1 } } },
    { message: { chat: { id: 900000001 }, from: { id: 900000001 }, text: 'x'.repeat(20000) } }
  ];
  let allHandled = true;
  for (const update of malformed) {
    const res = await webhook(update);
    if (res.status !== 200) { allHandled = false; check(`malformed update handled: ${JSON.stringify(update).slice(0, 60)}`, false, String(res.status)); }
  }
  check('every malformed or unexpected update returns 200 without crashing', allHandled);
  check('no payment was created by any malformed update',
    (await firestore.collection('bezyPayments').get()).docs.filter((d) => isTestId(d.data().telegramUserId)).length === 0);
  check('webhook rejects a wrong secret when one is configured', await (async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'sec-test-secret';
    const bad = await webhook({ message: { chat: { id: 900000001 }, from: { id: 900000001 }, text: '/start' } }, { 'x-telegram-bot-api-secret-token': 'wrong' });
    const good = await webhook({ message: { chat: { id: 900000001 }, from: { id: 900000001 }, text: '/start' } }, { 'x-telegram-bot-api-secret-token': 'sec-test-secret' });
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    return bad.status === 401 && good.status === 200;
  })());

  // ---------------------------------------------------------------- leakage
  section('Response data minimisation');
  await cleanup();
  await seedAll();
  r = await call('/api/discover', 'a');
  const card = (r.data.profiles || [])[0] || {};
  check('discover cards carry no membership state', card.bezyPremium === undefined && card.isPremium === undefined && card.premium === undefined, Object.keys(card).join(','));
  check('discover cards carry no age-declaration or usage data',
    card.ageEligibilityConfirmed === undefined && card.usage === undefined && card.preferences === undefined);
  check('discover cards carry no payment data', card.bezyPayments === undefined && card.telegramPaymentChargeId === undefined);
  check('discover cards expose no email-like or internal fields', card.lastName === undefined && card.createdAt === undefined);

  // The Telegram handle is the real contact vector. Releasing it before a mutual match would
  // let anyone browse the deck and message people directly, bypassing consent.
  check('discover does NOT reveal the Telegram @username before a match', card.username === undefined, JSON.stringify(Object.keys(card)));
  check('discover does not duplicate the raw Telegram id in a second field', card.telegramId === undefined);
  check('discover still returns the identifier needed to swipe', typeof card.id === 'string' && card.id.length > 0);
  check('no candidate in the deck carries a username',
    (r.data.profiles || []).every((p) => p.username === undefined), String((r.data.profiles || []).filter((p) => p.username !== undefined).length));

  // After a mutual match the handle is released, because that is what opens the Telegram chat.
  await call('/api/swipe', 'a', { targetId: '900000002', action: 'like' });
  await call('/api/swipe', 'b', { targetId: '900000001', action: 'like' });
  const matched = (await call('/api/matches', 'a')).data.matches[0] || {};
  check('a matched user does receive the Telegram handle', matched.username === 'bo_bezy_test', String(matched.username));
  check('matches do not duplicate the raw Telegram id', matched.telegramId === undefined);
  await clearRateLimits();

  r = await call('/api/likes', 'a');
  check('free user receives no liker identities', r.status === 403 && r.data.likes === undefined, JSON.stringify(r.data).slice(0, 120));

  r = await call('/api/swipe', 'a', { targetId: '900000099', action: 'like' });
  check('errors never contain a stack trace or database text',
    !/at |Error:|FIRESTORE|firestore/i.test(JSON.stringify(r.data)), JSON.stringify(r.data));
  // A malformed target id is treated like any unknown account: indistinguishable success,
  // nothing written. That is the anti-enumeration contract, not an error path.
  r = await call('/api/relationship', 'a', { action: 'block', targetId: 'not-a-number' });
  check('a malformed target id is indistinguishable from an unknown one',
    r.status === 200 && r.data.blocked === true, JSON.stringify(r.data));
  check('nothing is written for a malformed target id',
    (await firestore.collection('users').doc('900000001').collection('blocks').doc('not-a-number').get()).exists === false);

  // Genuine input errors return a stable code with no internal detail.
  for (const [label, body] of [
    ['missing target', { action: 'block' }],
    ['self target', { action: 'block', targetId: '900000001' }],
    ['unknown action', { action: 'wat', targetId: '900000002' }]
  ]) {
    const res = await call('/api/relationship', 'a', body);
    check(`${label} returns a code, not an internal message`,
      res.status === 400 && /^[A-Z_]+$/.test(String(res.data.error || '')), `${res.status}:${JSON.stringify(res.data)}`);
  }

  section('Error codes reachable by a normal user are rendered, not generic');
  {
    const fs = await import('node:fs');
    const app = fs.readFileSync('app.js', 'utf8');
    const en = JSON.parse(fs.readFileSync('locales/en.json', 'utf8')).app;
    const fr = JSON.parse(fs.readFileSync('locales/fr.json', 'utf8')).app;
    const block = /const ERROR_KEYS = \{([\s\S]*?)\};/.exec(app)?.[1] || '';
    const handled = Object.fromEntries([...block.matchAll(/([A-Z_]{4,}):\s*'([a-z.__]+)'/g)].map((m) => [m[1], m[2]]));

    // Codes an ordinary user can trigger without misusing the API. The rest
    // (INVALID_ACTION, INVALID_TARGET, INVALID_PLAN, CONFIRMATION_REQUIRED) indicate a
    // malformed client request and may fall back to the generic message.
    const userReachable = [
      'RATE_LIMITED', 'PREMIUM_REQUIRED', 'AGE_CONFIRMATION_REQUIRED',
      'TARGET_NOT_FOUND', 'DATABASE_UNAVAILABLE', 'INVALID_SESSION', 'PROFILE_NOT_FOUND'
    ];
    for (const code of userReachable) {
      const key = handled[code]?.replace(/^app\./, '');
      check(`${code} maps to a real message in both languages`,
        Boolean(key) && Boolean(en[key]) && Boolean(fr[key]),
        `key=${handled[code] || 'UNMAPPED'}`);
    }
    check('rate limiting explains the wait rather than failing generically',
      /rate_limited/.test(block) && /retryAfter/.test(app));
    check('the long-wait variant carries a substitution placeholder',
      en.rate_limited_minutes?.includes('{n}') && fr.rate_limited_minutes?.includes('{n}'));
  }

  section('Retention policy');
  {
    const { retentionPolicy, isConfigured, planRetention, applyRetention } = await import('../api/_retention.js');
    const policy = retentionPolicy();

    // Categories whose period is a legal question must stay unconfigured by default, so a
    // retention run can never quietly delete a payment or a safety record.
    check('payments retention is NOT configured by default', !isConfigured(policy.payments));
    check('reports retention is NOT configured by default', !isConfigured(policy.reports));
    check('both legally gated categories are flagged as such',
      policy.payments.legalReviewRequired === true && policy.reports.legalReviewRequired === true);
    check('operational categories have sane defaults',
      isConfigured(policy.abandonedSignups) && isConfigured(policy.endedMatches)
      && isConfigured(policy.spentInvoices) && isConfigured(policy.staleRateLimits));

    await cleanup();
    const OLD = Date.now() - 400 * 86400000;
    // An abandoned signup: never declared 18+, never completed a profile, long dormant.
    await firestore.collection('users').doc('900000080').set({
      telegramId: 900000080, createdAt: new Date(OLD)
    });
    // A complete, eligible account of the same age must never be selected.
    await firestore.collection('users').doc('900000081').set({
      telegramId: 900000081, createdAt: new Date(OLD), ageEligibilityConfirmed: true,
      profileComplete: true, discoverable: true, profile: PROFILES.b
    });
    // An abandoned signup that nonetheless paid must be protected by its payment history.
    await firestore.collection('users').doc('900000082').set({
      telegramId: 900000082, createdAt: new Date(OLD)
    });
    await firestore.collection('bezyPayments').doc('ret_charge_1').set({
      telegramUserId: '900000082', planId: 'monthly', stars: 250, currency: 'XTR',
      status: 'processed', processedAt: new Date(OLD)
    });
    await firestore.collection('matches').doc('900000080_900000081').set({
      participants: ['900000080', '900000081'], active: false, endedAt: new Date(OLD), createdAt: new Date(OLD)
    });

    let plan = await planRetention(firestore, {});
    check('abandoned signup is selected', plan.users.includes('900000080'), plan.users.join(','));
    check('complete account is NOT selected', !plan.users.includes('900000081'));
    check('abandoned signup with a payment is NOT selected', !plan.users.includes('900000082'), plan.users.join(','));
    check('long-ended match is selected', plan.matches.includes('900000080_900000081'));
    check('no payment is ever selected while unconfigured', plan.payments.length === 0);
    check('no report is ever selected while unconfigured', plan.reports.length === 0);
    check('skipped categories are reported, not silently ignored',
      plan.skipped.some((s) => s.category === 'payments' && /LEGAL REVIEW/.test(s.reason)));

    // Protecting an id must override selection entirely.
    plan = await planRetention(firestore, { protectedIds: ['900000080'] });
    check('a protected id is never selected', !plan.users.includes('900000080'), plan.users.join(','));

    // Planning is pure: nothing was deleted by the calls above.
    check('planning deletes nothing', (await firestore.collection('users').doc('900000080').get()).exists);

    const applied = await applyRetention(firestore, await planRetention(firestore, {}));
    check('apply removes the abandoned signup', (await firestore.collection('users').doc('900000080').get()).exists === false);
    check('apply keeps the complete account', (await firestore.collection('users').doc('900000081').get()).exists);
    check('apply keeps the paying account', (await firestore.collection('users').doc('900000082').get()).exists);
    check('apply keeps the payment record', (await firestore.collection('bezyPayments').doc('ret_charge_1').get()).exists);
    check('apply reports what it removed', applied.users === 1 && applied.matches === 1, JSON.stringify(applied));
  }

  section('Data minimisation: fields no longer collected');
  await cleanup();
  await call('/api/profile/me', 'a', { ageEligibilityConfirmed: true });
  await call('/api/profile/me', 'a', { profile: PROFILES.a });
  const stored = (await firestore.collection('users').doc('900000001').get()).data() || {};
  check('lastName is no longer collected', stored.lastName === undefined, JSON.stringify(Object.keys(stored)));
  check('isPremiumTelegram is no longer collected', stored.isPremiumTelegram === undefined);
  check('fields still needed are collected', Boolean(stored.telegramId && stored.username !== undefined && stored.languageCode !== undefined));
  check('export tolerates records that predate the change', (await call('/api/account', 'a', { action: 'export' })).data.data.account.lastName === null);
} finally {
  await cleanup();
  await harness.close();
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (failures.length) console.log('Failed:\n - ' + failures.join('\n - '));
process.exit(fail ? 1 : 0);
