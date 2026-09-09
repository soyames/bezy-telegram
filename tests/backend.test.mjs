// Bezy backend suite: core dating flow + Bezy Premium (Telegram Stars).
// Runs the real API handlers against the real Firestore database using synthetic
// Telegram IDs 9000000xx, which are deleted before and after the run.
//
//   BEZY_SERVICE_ACCOUNT=<path to service-account.json> node tests/backend.test.mjs
import { startHarness, makeInitData, TEST_USERS } from './harness.mjs';
import { premiumPlans, parseInvoicePayload, addMonths, nextExpiry, premiumState, checkSwipeQuota, LIMITS, applyRefund, REFUND_STATUS } from '../api/_premium.js';
import { db } from '../api/_firebase.js';

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `  -> ${String(detail).slice(0, 240)}` : ''}`); }
}
function section(title) { console.log(`\n== ${title} ==`); }

const harness = await startHarness({ port: Number(process.env.PORT || 3310) });
const BASE = harness.url;
const initData = Object.fromEntries(Object.entries(TEST_USERS).map(([k, u]) => [k, makeInitData(u)]));

async function call(path, who, body = {}) {
  const res = await fetch(BASE + path, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, initData: typeof who === 'string' && who.includes('=') ? who : initData[who] })
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
async function webhook(update) {
  const res = await fetch(`${BASE}/api/telegram/webhook`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(update)
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const sent = () => fetch(`${BASE}/__telegram-calls`).then((r) => r.json());
const resetCalls = () => fetch(`${BASE}/__reset-telegram-calls`, { method: 'POST' });

const firestore = db();
const isTestId = (id) => /^9000000\d\d$/.test(String(id));
async function cleanup() {
  for (const doc of (await firestore.collection('users').get()).docs) {
    if (isTestId(doc.id)) await firestore.recursiveDelete(doc.ref);
  }
  for (const col of ['matches', 'bezyPayments', 'bezyInvoices', 'reports']) {
    for (const doc of (await firestore.collection(col).get()).docs) {
      const d = doc.data();
      const touchesTest = (d.participants || []).some(isTestId) || isTestId(d.telegramUserId)
        || isTestId(d.reporterId) || isTestId(d.targetId);
      if (touchesTest) await doc.ref.delete();
    }
  }
  // Rate-limit counters are per-user and would otherwise carry across scenarios, which run
  // far more requests as one user than any human would. Rate limiting itself is verified in
  // tests/security.test.mjs.
  for (const doc of (await firestore.collection('rateLimits').get()).docs) {
    if (isTestId(doc.id)) await doc.ref.delete();
  }
}
async function setPremium(userId, membership) {
  await firestore.collection('users').doc(String(userId)).set({ bezyPremium: membership }, { merge: true });
}
const PROFILES = {
  a: { displayName: 'Ada', age: 29, city: 'Paris', gender: 'woman', seeking: 'men', interests: ['music', 'travel', 'books'], bio: 'Testing Bezy.', discoverable: true },
  b: { displayName: 'Bo', age: 31, city: 'Paris', gender: 'man', seeking: 'women', interests: ['music', 'travel'], bio: 'Bonjour.', discoverable: true },
  c: { displayName: 'Cy', age: 45, city: 'Lyon', gender: 'man', seeking: 'women', interests: ['hiking'], bio: 'Salut.', discoverable: true },
  d: { displayName: 'Dee', age: 28, city: 'Paris', gender: 'man', seeking: 'everyone', interests: ['books'], bio: 'Hi.', discoverable: true }
};
// Bezy is 18+ only, so seeding must make the explicit declaration exactly as onboarding does.
async function seedAll() {
  for (const key of ['a', 'b', 'c', 'd']) {
    await call('/api/profile/me', key, { ageEligibilityConfirmed: true });
    await call('/api/profile/me', key, { profile: PROFILES[key] });
  }
}

await cleanup();
const PLANS = premiumPlans();

try {
  // ------------------------------------------------------------------ pure units
  section('Premium module (pure logic)');
  check('three plans are configured', Object.keys(PLANS).join(',') === 'monthly,quarterly,yearly', Object.keys(PLANS).join(','));
  check('all plans priced in XTR with positive Stars', Object.values(PLANS).every((p) => p.currency === 'XTR' && p.stars > 0));
  check('plan durations are 1/3/12 months', [PLANS.monthly.durationMonths, PLANS.quarterly.durationMonths, PLANS.yearly.durationMonths].join(',') === '1,3,12');
  check('addMonths clamps 31 Jan + 1 month to 28/29 Feb', addMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString().slice(0, 10) === '2026-02-28');
  check('expired membership reads as inactive', premiumState({ bezyPremium: { active: true, expiresAt: new Date(Date.now() - 1000) } }).active === false);
  check('future membership reads as active', premiumState({ bezyPremium: { active: true, expiresAt: new Date(Date.now() + 86400000) } }).active === true);
  check('active:false with future expiry is inactive', premiumState({ bezyPremium: { active: false, expiresAt: new Date(Date.now() + 86400000) } }).active === false);
  check('Telegram Premium alone grants nothing', premiumState({ isPremiumTelegram: true }).active === false);
  const activeUntil = new Date('2026-10-15T00:00:00Z');
  check('renewal extends existing expiry, never resets it',
    nextExpiry({ bezyPremium: { active: true, expiresAt: activeUntil } }, PLANS.monthly, new Date('2026-09-20T00:00:00Z')).toISOString().slice(0, 10) === '2026-11-15');
  check('expired renewal restarts from now',
    nextExpiry({ bezyPremium: { active: true, expiresAt: new Date('2026-01-01T00:00:00Z') } }, PLANS.monthly, new Date('2026-09-20T00:00:00Z')).toISOString().slice(0, 10) === '2026-10-20');
  check('free super-like quota is lower than premium', LIMITS.free.superLikes < LIMITS.premium.superLikes);
  check('quota blocks the free discovery ceiling',
    checkSwipeQuota({ usage: { day: new Date().toISOString().slice(0, 10), discoveryActions: LIMITS.free.discoveryActions, superLikes: 0 } }, 'like', false).reason === 'DISCOVERY_LIMIT_REACHED');
  check('premium is not blocked at the free ceiling',
    checkSwipeQuota({ usage: { day: new Date().toISOString().slice(0, 10), discoveryActions: LIMITS.free.discoveryActions, superLikes: 0 } }, 'like', true).allowed === true);

  section('Invoice payload parsing');
  check('valid payload parses', parseInvoicePayload('bezy_premium:v1:monthly:900000001:abcdefgh')?.planId === 'monthly');
  check('unknown plan rejected', parseInvoicePayload('bezy_premium:v1:lifetime:900000001:abcdefgh') === null);
  check('wrong prefix rejected', parseInvoicePayload('evil:v1:monthly:900000001:abcdefgh') === null);
  check('wrong version rejected', parseInvoicePayload('bezy_premium:v2:monthly:900000001:abcdefgh') === null);
  check('non-numeric user rejected', parseInvoicePayload('bezy_premium:v1:monthly:abc:abcdefgh') === null);
  check('short nonce rejected', parseInvoicePayload('bezy_premium:v1:monthly:900000001:x') === null);
  check('empty payload rejected', parseInvoicePayload('') === null);

  // ------------------------------------------------------------------ auth
  section('Authentication');
  let r = await call('/api/premium', 'user=%7B%22id%22%3A1%7D&hash=deadbeef');
  check('forged initData rejected on /api/premium', r.status === 401, JSON.stringify(r.data));
  r = await call('/api/likes', 'user=%7B%22id%22%3A1%7D&hash=deadbeef');
  check('forged initData rejected on /api/likes', r.status === 401);
  const foreign = makeInitData(TEST_USERS.a, '222222:DIFFERENT-BOT-TOKEN');
  r = await call('/api/premium', foreign);
  check('initData signed by another bot rejected', r.status === 401);
  check('GET on /api/premium returns 405', (await fetch(`${BASE}/api/premium`)).status === 405);
  check('GET on /api/likes returns 405', (await fetch(`${BASE}/api/likes`)).status === 405);

  await seedAll();

  // ------------------------------------------------------------------ status
  section('Premium status');
  r = await call('/api/premium', 'a');
  check('free user reports inactive membership', r.data.premium?.active === false, JSON.stringify(r.data.premium));
  check('status exposes backend-authoritative plans', (r.data.plans || []).length === 3);
  check('plan prices match server config', r.data.plans.find((p) => p.id === 'monthly').stars === PLANS.monthly.stars);
  check('yearly is flagged best value', r.data.plans.find((p) => p.id === 'yearly').bestValue === true);
  check('free limits are reported', r.data.limits?.discoveryActions === LIMITS.free.discoveryActions);
  r = await call('/api/premium', 'a', { action: 'bogus' });
  check('unknown action rejected', r.status === 400 && r.data.error === 'INVALID_ACTION');

  // ------------------------------------------------------------------ invoice
  section('Stars invoice creation');
  await resetCalls();
  r = await call('/api/premium', 'a', { action: 'invoice', planId: 'monthly' });
  check('invoice link returned', r.status === 200 && typeof r.data.invoiceLink === 'string', JSON.stringify(r.data).slice(0, 200));
  const invoiceCall = (await sent()).find((c) => c.method === 'createInvoiceLink');
  check('invoice uses XTR currency', invoiceCall?.body?.currency === 'XTR', invoiceCall?.body?.currency);
  check('invoice uses empty provider_token (Stars requirement)', invoiceCall?.body?.provider_token === '');
  check('invoice has exactly one price component', invoiceCall?.body?.prices?.length === 1);
  check('invoice amount equals server plan price', invoiceCall?.body?.prices?.[0]?.amount === PLANS.monthly.stars);
  check('invoice title within Telegram 32-char limit', (invoiceCall?.body?.title || '').length <= 32);
  check('invoice payload is server-generated and well-formed', parseInvoicePayload(invoiceCall?.body?.payload)?.telegramUserId === '900000001');
  r = await call('/api/premium', 'a', { action: 'invoice', planId: 'lifetime' });
  check('invalid plan rejected', r.status === 400 && r.data.error === 'INVALID_PLAN');
  r = await call('/api/premium', 'a', { action: 'invoice', planId: 'monthly', stars: 1, telegramUserId: '900000002' });
  const forgedCall = (await sent()).filter((c) => c.method === 'createInvoiceLink').pop();
  check('client-supplied price is ignored', forgedCall?.body?.prices?.[0]?.amount === PLANS.monthly.stars, String(forgedCall?.body?.prices?.[0]?.amount));
  check('client-supplied user id is ignored', parseInvoicePayload(forgedCall?.body?.payload)?.telegramUserId === '900000001');

  // ------------------------------------------------------------------ pre-checkout
  section('pre_checkout_query validation');
  const goodPayload = invoiceCall.body.payload;
  const preQuery = (over = {}) => ({ pre_checkout_query: { id: 'pcq1', from: { id: 900000001 }, currency: 'XTR', total_amount: PLANS.monthly.stars, invoice_payload: goodPayload, ...over } });
  const lastAnswer = async () => (await sent()).filter((c) => c.method === 'answerPreCheckoutQuery').pop();

  await resetCalls();
  check('valid pre-checkout returns 200', (await webhook(preQuery())).status === 200);
  check('valid pre-checkout approved', (await lastAnswer())?.body?.ok === true, JSON.stringify((await lastAnswer())?.body));
  await resetCalls(); await webhook(preQuery({ total_amount: 1 }));
  check('manipulated amount rejected', (await lastAnswer())?.body?.ok === false);
  await resetCalls(); await webhook(preQuery({ currency: 'USD' }));
  check('non-Stars currency rejected', (await lastAnswer())?.body?.ok === false);
  await resetCalls(); await webhook(preQuery({ from: { id: 900000002 } }));
  check('different Telegram user rejected', (await lastAnswer())?.body?.ok === false);
  await resetCalls(); await webhook(preQuery({ invoice_payload: 'bezy_premium:v1:monthly:900000001:neverissued00' }));
  check('unissued invoice nonce rejected', (await lastAnswer())?.body?.ok === false);
  await resetCalls(); await webhook(preQuery({ invoice_payload: 'garbage' }));
  check('malformed payload rejected', (await lastAnswer())?.body?.ok === false);

  // ------------------------------------------------------------------ activation
  section('successful_payment activation');
  const paidMessage = (over = {}, payment = {}) => ({
    message: {
      chat: { id: 900000001 }, from: { id: 900000001, language_code: 'en' }, ...over,
      successful_payment: { currency: 'XTR', total_amount: PLANS.monthly.stars, invoice_payload: goodPayload, telegram_payment_charge_id: 'charge_test_1', provider_payment_charge_id: 'prov_1', ...payment }
    }
  });

  await resetCalls();
  check('successful_payment returns 200', (await webhook(paidMessage())).status === 200);
  let userDoc = (await firestore.collection('users').doc('900000001').get()).data();
  check('membership activated', userDoc?.bezyPremium?.active === true, JSON.stringify(userDoc?.bezyPremium));
  check('membership records the purchased plan', userDoc?.bezyPremium?.planId === 'monthly');
  check('membership stores the charge id', userDoc?.bezyPremium?.telegramPaymentChargeId === 'charge_test_1');
  const firstExpiry = userDoc.bezyPremium.expiresAt.toMillis();
  check('expiry is about one month out', Math.abs(firstExpiry - addMonths(new Date(), 1).getTime()) < 3 * 86400000);
  const paymentDoc = (await firestore.collection('bezyPayments').doc('charge_test_1').get()).data();
  check('payment recorded under charge id', paymentDoc?.status === 'processed', JSON.stringify(paymentDoc || {}).slice(0, 160));
  check('payment stores provider charge id for refunds', paymentDoc?.providerPaymentChargeId === 'prov_1');
  check('payment records Stars amount and currency', paymentDoc?.stars === PLANS.monthly.stars && paymentDoc?.currency === 'XTR');
  const confirm = (await sent()).filter((c) => c.method === 'sendMessage').pop();
  check('activation confirmation sent to user', /Bezy Premium is now active/.test(confirm?.body?.text || ''), confirm?.body?.text);

  section('Idempotency');
  await resetCalls();
  check('duplicate successful_payment returns 200', (await webhook(paidMessage())).status === 200);
  userDoc = (await firestore.collection('users').doc('900000001').get()).data();
  check('duplicate does NOT extend membership', userDoc.bezyPremium.expiresAt.toMillis() === firstExpiry,
    `${new Date(firstExpiry).toISOString()} -> ${userDoc.bezyPremium.expiresAt.toDate().toISOString()}`);
  check('duplicate sends no second confirmation', (await sent()).filter((c) => c.method === 'sendMessage').length === 0);

  section('Renewal');
  const renewPayloadRes = await call('/api/premium', 'a', { action: 'invoice', planId: 'quarterly' });
  check('quarterly invoice created for renewal', renewPayloadRes.status === 200);
  const renewPayload = (await sent()).filter((c) => c.method === 'createInvoiceLink').pop().body.payload;
  await webhook(paidMessage({}, { invoice_payload: renewPayload, total_amount: PLANS.quarterly.stars, telegram_payment_charge_id: 'charge_test_2' }));
  userDoc = (await firestore.collection('users').doc('900000001').get()).data();
  const renewedExpiry = userDoc.bezyPremium.expiresAt.toMillis();
  check('renewal adds to the existing expiry', Math.abs(renewedExpiry - addMonths(new Date(firstExpiry), 3).getTime()) < 2 * 86400000,
    `${new Date(firstExpiry).toISOString()} -> ${new Date(renewedExpiry).toISOString()}`);
  check('renewal updates the active plan', userDoc.bezyPremium.planId === 'quarterly');

  section('Forged payment rejection');
  await webhook(paidMessage({ from: { id: 900000003, language_code: 'en' }, chat: { id: 900000003 } }, { telegram_payment_charge_id: 'charge_forged_1' }));
  check('payment for a mismatched user is not recorded', (await firestore.collection('bezyPayments').doc('charge_forged_1').get()).exists === false);
  await webhook(paidMessage({}, { total_amount: 1, telegram_payment_charge_id: 'charge_forged_2' }));
  check('under-paid amount is not recorded', (await firestore.collection('bezyPayments').doc('charge_forged_2').get()).exists === false);
  await webhook(paidMessage({}, { currency: 'USD', telegram_payment_charge_id: 'charge_forged_3' }));
  check('non-Stars currency is not recorded', (await firestore.collection('bezyPayments').doc('charge_forged_3').get()).exists === false);
  await webhook(paidMessage({}, { invoice_payload: 'garbage', telegram_payment_charge_id: 'charge_forged_4' }));
  check('malformed payload is not recorded', (await firestore.collection('bezyPayments').doc('charge_forged_4').get()).exists === false);
  const cSnap = (await firestore.collection('users').doc('900000003').get()).data();
  check('no membership leaked to the forged user', premiumState(cSnap).active === false);

  // ------------------------------------------------------------------ entitlement
  section('Premium entitlement: who liked you');
  await call('/api/swipe', 'b', { targetId: '900000001', action: 'like' });
  await call('/api/swipe', 'd', { targetId: '900000001', action: 'super' });
  await setPremium('900000001', { active: false });
  r = await call('/api/likes', 'a');
  check('free user is refused with PREMIUM_REQUIRED', r.status === 403 && r.data.error === 'PREMIUM_REQUIRED', JSON.stringify(r.data));
  check('refusal leaks no liker profiles', r.data.likes === undefined);
  check('refusal still returns a non-identifying count', r.data.likeCount === 2, String(r.data.likeCount));

  await setPremium('900000001', { active: true, planId: 'monthly', expiresAt: new Date(Date.now() + 30 * 86400000) });
  r = await call('/api/likes', 'a');
  check('premium user can list likers', r.status === 200 && (r.data.likes || []).length === 2, JSON.stringify(r.data).slice(0, 200));
  check('liker profiles include display names', (r.data.likes || []).every((l) => Boolean(l.displayName)));

  await setPremium('900000001', { active: true, planId: 'monthly', expiresAt: new Date(Date.now() - 1000) });
  r = await call('/api/likes', 'a');
  check('expired premium is refused like a free user', r.status === 403 && r.data.error === 'PREMIUM_REQUIRED');
  await firestore.collection('users').doc('900000001').set({ isPremiumTelegram: true, bezyPremium: { active: false } }, { merge: true });
  r = await call('/api/likes', 'a');
  check('Telegram Premium does NOT unlock the feature', r.status === 403, JSON.stringify(r.data));

  section('Premium discovery benefits');
  await setPremium('900000001', { active: false });
  await call('/api/profile/me', 'a', { preferences: { minAge: 18, maxAge: 100, city: 'Lyon', sameCityOnly: false } });
  r = await call('/api/discover', 'a');
  check('free user does not get advanced city filtering', (r.data.profiles || []).some((p) => p.city !== 'Lyon'), (r.data.profiles || []).map((p) => p.city).join(','));
  check('discover reports free entitlement', r.data.isPremium === false);
  await setPremium('900000001', { active: true, planId: 'yearly', expiresAt: new Date(Date.now() + 86400000) });
  r = await call('/api/discover', 'a');
  check('premium user gets advanced city filtering', (r.data.profiles || []).every((p) => p.city === 'Lyon'), (r.data.profiles || []).map((p) => p.city).join(','));
  check('discover reports premium entitlement', r.data.isPremium === true);
  await call('/api/profile/me', 'a', { preferences: { minAge: 18, maxAge: 100, city: '', sameCityOnly: false } });

  await setPremium('900000002', { active: true, planId: 'yearly', expiresAt: new Date(Date.now() + 86400000) });
  await firestore.collection('users').doc('900000001').collection('actions').doc('900000002').delete();
  await firestore.collection('users').doc('900000001').collection('actions').doc('900000004').delete();
  r = await call('/api/discover', 'a');
  const bo = (r.data.profiles || []).find((p) => p.id === '900000002');
  check('premium candidate receives a visibility boost', bo && bo.compatibility >= 99, `Bo=${bo?.compatibility}`);
  check('boosted candidate ranks first', (r.data.profiles || [])[0]?.id === '900000002', (r.data.profiles || []).map((p) => p.id).join(','));
  await setPremium('900000002', { active: false });

  section('Server-enforced quotas');
  await setPremium('900000001', { active: false });
  await firestore.collection('users').doc('900000001').set({
    usage: { day: new Date().toISOString().slice(0, 10), discoveryActions: LIMITS.free.discoveryActions, superLikes: LIMITS.free.superLikes }
  }, { merge: true });
  r = await call('/api/swipe', 'a', { targetId: '900000003', action: 'like' });
  check('free user blocked at the daily discovery limit', r.status === 403 && r.data.error === 'DISCOVERY_LIMIT_REACHED', JSON.stringify(r.data));
  await setPremium('900000001', { active: true, planId: 'monthly', expiresAt: new Date(Date.now() + 86400000) });
  r = await call('/api/swipe', 'a', { targetId: '900000003', action: 'like' });
  check('premium user bypasses the free discovery limit', r.status === 200, JSON.stringify(r.data));
  await firestore.collection('users').doc('900000001').set({
    usage: { day: new Date().toISOString().slice(0, 10), discoveryActions: 0, superLikes: LIMITS.premium.superLikes }
  }, { merge: true });
  r = await call('/api/swipe', 'a', { targetId: '900000004', action: 'super' });
  check('premium super-like allowance is still enforced', r.status === 403 && r.data.error === 'SUPER_LIKE_LIMIT_REACHED', JSON.stringify(r.data));
  r = await call('/api/swipe', 'a', { targetId: '900000004', action: 'like' });
  check('a normal like still works at the super-like cap', r.status === 200);

  // ------------------------------------------------------------------ 18+ gate
  section('18+ age eligibility (self-declaration)');
  await cleanup();

  // A brand-new account has made no declaration.
  r = await call('/api/profile/me', 'a');
  check('new account needs the age declaration', r.data.needsAgeConfirmation === true, JSON.stringify(r.data.needsAgeConfirmation));
  check('new account is not marked confirmed', r.data.ageEligibility?.confirmed === false);
  check('nothing is silently confirmed on creation',
    (await firestore.collection('users').doc('900000001').get()).data()?.ageEligibilityConfirmed === undefined);

  // Server-side enforcement: a client that skips the gate still cannot become discoverable.
  r = await call('/api/profile/me', 'a', { profile: PROFILES.a });
  check('profile cannot complete without the declaration', r.data.profile?.profileComplete === false, JSON.stringify(r.data.profile?.profileComplete));
  check('profile cannot become discoverable without it', r.data.profile?.discoverable === false);
  r = await call('/api/discover', 'a');
  check('discover serves no deck before the declaration', (r.data.profiles || []).length === 0 && r.data.needsAgeConfirmation === true);
  r = await call('/api/swipe', 'a', { targetId: '900000002', action: 'like' });
  check('swipe rejected with AGE_CONFIRMATION_REQUIRED', r.status === 403 && r.data.error === 'AGE_CONFIRMATION_REQUIRED', JSON.stringify(r.data));

  // A falsy or non-boolean value must never count as a declaration.
  for (const bogus of [false, 'true', 1, null]) {
    await call('/api/profile/me', 'a', { ageEligibilityConfirmed: bogus });
  }
  check('only an explicit boolean true is accepted',
    (await firestore.collection('users').doc('900000001').get()).data()?.ageEligibilityConfirmed === undefined);

  // The affirmative action.
  r = await call('/api/profile/me', 'a', { ageEligibilityConfirmed: true });
  check('declaration accepted', r.data.needsAgeConfirmation === false, JSON.stringify(r.data.needsAgeConfirmation));
  let ageDoc = (await firestore.collection('users').doc('900000001').get()).data();
  check('ageEligibilityConfirmed stored', ageDoc.ageEligibilityConfirmed === true);
  check('ageEligibilityConfirmedAt stored', Boolean(ageDoc.ageEligibilityConfirmedAt));
  check('method recorded as self_declaration', ageDoc.ageEligibilityMethod === 'self_declaration', ageDoc.ageEligibilityMethod);
  check('no "verifiedAge" field is created', ageDoc.verifiedAge === undefined && ageDoc.ageVerified === undefined);
  const declaredAt = ageDoc.ageEligibilityConfirmedAt.toMillis();

  // Re-declaring must not re-date the original record.
  await call('/api/profile/me', 'a', { ageEligibilityConfirmed: true });
  check('existing declaration is not re-dated',
    (await firestore.collection('users').doc('900000001').get()).data().ageEligibilityConfirmedAt.toMillis() === declaredAt);

  r = await call('/api/profile/me', 'a', { profile: PROFILES.a });
  check('profile completes once declared', r.data.profile?.profileComplete === true);
  r = await call('/api/discover', 'a');
  check('discover works after the declaration', r.data.needsAgeConfirmation === undefined);

  // The numeric age field remains enforced independently of the declaration.
  r = await call('/api/profile/me', 'a', { profile: { ...PROFILES.a, age: 17 } });
  check('declared adult still cannot save an under-18 age', r.data.profile?.profileComplete === false);
  await call('/api/profile/me', 'a', { profile: PROFILES.a });

  // Existing accounts created before the gate are asked, not grandfathered in.
  await firestore.collection('users').doc('900000002').set({
    telegramId: 900000002, profile: PROFILES.b, profileComplete: true, discoverable: true, createdAt: new Date()
  });
  r = await call('/api/profile/me', 'b');
  check('pre-existing account is asked to declare', r.data.needsAgeConfirmation === true);
  check('pre-existing account not silently confirmed', r.data.ageEligibility?.confirmed === false);
  r = await call('/api/swipe', 'b', { targetId: '900000001', action: 'like' });
  check('pre-existing account cannot swipe until it declares', r.status === 403 && r.data.error === 'AGE_CONFIRMATION_REQUIRED');

  // ------------------------------------------------------------------ launch checks
  section('Firestore record structure');
  await cleanup();
  await seedAll();
  const structRes = await call('/api/premium', 'a', { action: 'invoice', planId: 'monthly' });
  check('invoice endpoint succeeded', structRes.status === 200);
  const structPayload = (await sent()).filter((c) => c.method === 'createInvoiceLink').pop().body.payload;
  const structNonce = parseInvoicePayload(structPayload).nonce;

  const invoiceDoc = (await firestore.collection('bezyInvoices').doc(structNonce).get()).data();
  check('bezyInvoices keyed by server nonce', Boolean(invoiceDoc), structNonce);
  check('pending invoice starts as status=pending', invoiceDoc?.status === 'pending', invoiceDoc?.status);
  check('pending invoice records user, plan, stars and currency',
    invoiceDoc?.telegramUserId === '900000001' && invoiceDoc?.planId === 'monthly' && invoiceDoc?.stars === PLANS.monthly.stars && invoiceDoc?.currency === 'XTR',
    JSON.stringify(invoiceDoc || {}).slice(0, 160));

  const structCharge = 'charge_struct_1';
  await webhook({
    message: {
      chat: { id: 900000001 }, from: { id: 900000001, language_code: 'en' },
      successful_payment: { currency: 'XTR', total_amount: PLANS.monthly.stars, invoice_payload: structPayload, telegram_payment_charge_id: structCharge, provider_payment_charge_id: 'prov_struct' }
    }
  });

  const membership = (await firestore.collection('users').doc('900000001').get()).data()?.bezyPremium || {};
  for (const field of ['active', 'planId', 'expiresAt', 'purchasedAt', 'source', 'telegramPaymentChargeId']) {
    check(`membership has ${field}`, membership[field] !== undefined, Object.keys(membership).join(','));
  }
  check('membership source is telegram_stars', membership.source === 'telegram_stars', membership.source);
  const payDoc = (await firestore.collection('bezyPayments').doc(structCharge).get()).data();
  check('bezyPayments document id IS the charge id', payDoc?.telegramPaymentChargeId === structCharge);
  check('payment links back to the invoice payload', payDoc?.invoicePayload === structPayload);
  check('payment stores membershipExpiresAt for audit', Boolean(payDoc?.membershipExpiresAt));
  check('invoice marked paid and linked to the charge',
    (await firestore.collection('bezyInvoices').doc(structNonce).get()).data()?.status === 'paid');

  section('Idempotency (explicit)');
  const beforeCount = (await firestore.collection('bezyPayments').get()).size;
  const expiryBefore = membership.expiresAt.toMillis();
  await resetCalls();
  const replay = await webhook({
    message: {
      chat: { id: 900000001 }, from: { id: 900000001, language_code: 'en' },
      successful_payment: { currency: 'XTR', total_amount: PLANS.monthly.stars, invoice_payload: structPayload, telegram_payment_charge_id: structCharge, provider_payment_charge_id: 'prov_struct' }
    }
  });
  check('replayed payment still acknowledged with 200', replay.status === 200);
  check('replay creates NO second payment document', (await firestore.collection('bezyPayments').get()).size === beforeCount);
  check('replay does NOT extend membership',
    (await firestore.collection('users').doc('900000001').get()).data().bezyPremium.expiresAt.toMillis() === expiryBefore);
  check('replay sends no duplicate confirmation', (await sent()).filter((c) => c.method === 'sendMessage').length === 0);
  check('entitlement still active exactly once',
    premiumState((await firestore.collection('users').doc('900000001').get()).data()).active === true);

  section('Expiration boundary');
  const nowRef = new Date('2026-06-15T12:00:00Z');
  check('one minute BEFORE expiry is Premium',
    premiumState({ bezyPremium: { active: true, expiresAt: new Date(nowRef.getTime() + 60000) } }, nowRef).active === true);
  check('one minute AFTER expiry is Free',
    premiumState({ bezyPremium: { active: true, expiresAt: new Date(nowRef.getTime() - 60000) } }, nowRef).active === false);
  check('exactly at expiry is Free (not strictly greater)',
    premiumState({ bezyPremium: { active: true, expiresAt: nowRef } }, nowRef).active === false);
  check('active flag alone never grants entitlement',
    premiumState({ bezyPremium: { active: true } }).active === false);
  check('daysRemaining is zero once expired',
    premiumState({ bezyPremium: { active: true, expiresAt: new Date(Date.now() - 1000) } }).daysRemaining === 0);
  await setPremium('900000001', { active: true, planId: 'monthly', expiresAt: new Date(Date.now() - 1000) });
  r = await call('/api/likes', 'a');
  check('expired membership blocked at the API boundary', r.status === 403 && r.data.error === 'PREMIUM_REQUIRED');
  r = await call('/api/premium', 'a');
  check('expired membership reported as inactive by /api/premium', r.data.premium?.active === false);

  section('Telegram Premium is not Bezy Premium');
  // A Telegram Premium user who never bought Bezy Premium.
  await firestore.collection('users').doc('900000001').set({ isPremiumTelegram: true }, { merge: true });
  await setPremium('900000001', { active: false });
  r = await call('/api/premium', 'a');
  check('Telegram Premium user reports isPremium=false', r.data.premium?.active === false, JSON.stringify(r.data.premium));
  r = await call('/api/likes', 'a');
  check('Telegram Premium user refused Premium-only API', r.status === 403 && r.data.error === 'PREMIUM_REQUIRED');
  r = await call('/api/discover', 'a');
  check('Telegram Premium user gets no advanced discovery', r.data.isPremium === false);
  check('Telegram Premium user keeps free quota', r.data.quota?.limits?.discoveryActions === LIMITS.free.discoveryActions);
  check('isPremiumTelegram is still stored as informational',
    (await firestore.collection('users').doc('900000001').get()).data().isPremiumTelegram === true);

  // ------------------------------------------------------------------ refunds
  // Helper: buy a plan for user A and return the charge id backing the membership.
  async function purchase(planId, chargeId, who = 'a', userId = '900000001') {
    await call('/api/premium', who, { action: 'invoice', planId });
    const payload = (await sent()).filter((c) => c.method === 'createInvoiceLink').pop().body.payload;
    await webhook({
      message: {
        chat: { id: Number(userId) }, from: { id: Number(userId), language_code: who === 'b' ? 'fr' : 'en' },
        successful_payment: {
          currency: 'XTR', total_amount: PLANS[planId].stars, invoice_payload: payload,
          telegram_payment_charge_id: chargeId, provider_payment_charge_id: `prov_${chargeId}`
        }
      }
    });
    return payload;
  }
  const refundUpdate = (chargeId, payload, stars, userId = '900000001', lang = 'en') => ({
    message: {
      chat: { id: Number(userId) }, from: { id: Number(userId), language_code: lang },
      refunded_payment: {
        currency: 'XTR', total_amount: stars, invoice_payload: payload,
        telegram_payment_charge_id: chargeId, provider_payment_charge_id: `prov_${chargeId}`
      }
    }
  });
  const userDocOf = async (id = '900000001') => (await firestore.collection('users').doc(id).get()).data() || {};
  const payDocOf = async (id) => (await firestore.collection('bezyPayments').doc(id).get()).data() || {};

  section('Refund A: successful refund revokes Premium');
  await cleanup();
  await seedAll();
  await resetCalls();
  const refPayload = await purchase('monthly', 'charge_refund_1');
  let doc = await userDocOf();
  check('membership active before refund', premiumState(doc).active === true);
  const originalPlan = doc.bezyPremium.planId;
  const originalPurchasedAt = doc.bezyPremium.purchasedAt.toMillis();
  const originalExpiry = doc.bezyPremium.expiresAt.toMillis();
  check('membership expiry is in the future', originalExpiry > Date.now());

  await resetCalls();
  const refRes = await webhook(refundUpdate('charge_refund_1', refPayload, PLANS.monthly.stars));
  check('refunded_payment update returns 200', refRes.status === 200);

  doc = await userDocOf();
  check('membership no longer active', doc.bezyPremium.active === false, JSON.stringify(doc.bezyPremium).slice(0, 200));
  check('premiumState evaluates as Free', premiumState(doc).active === false);
  check('revokedAt recorded', Boolean(doc.bezyPremium.revokedAt));
  check('revocationReason is refund', doc.bezyPremium.revocationReason === 'refund', doc.bezyPremium.revocationReason);
  check('refundedChargeId links to the refunded payment', doc.bezyPremium.refundedChargeId === 'charge_refund_1');

  let pay = await payDocOf('charge_refund_1');
  check('payment marked refunded', pay.refundStatus === REFUND_STATUS.REFUNDED, pay.refundStatus);
  check('payment status flipped to refunded', pay.status === 'refunded');
  check('refundedAt timestamp recorded', Boolean(pay.refundedAt));
  check('refund source recorded', pay.refundSource === 'telegram_webhook', pay.refundSource);

  r = await call('/api/premium', 'a');
  check('/api/premium reports Free after refund', r.data.premium?.active === false, JSON.stringify(r.data.premium));
  check('/api/premium exposes revoked state', r.data.premium?.revoked === true);
  r = await call('/api/likes', 'a');
  check('Premium-only likes endpoint rejects refunded user', r.status === 403 && r.data.error === 'PREMIUM_REQUIRED');
  await call('/api/profile/me', 'a', { preferences: { minAge: 18, maxAge: 100, city: 'Lyon', sameCityOnly: false } });
  r = await call('/api/discover', 'a');
  check('advanced discovery filters no longer applied', (r.data.profiles || []).some((p) => p.city !== 'Lyon') || (r.data.profiles || []).length === 0);
  check('discover reports isPremium=false', r.data.isPremium === false);
  check('free discovery quota restored', r.data.quota?.limits?.discoveryActions === LIMITS.free.discoveryActions);
  check('free super-like quota restored', r.data.quota?.limits?.superLikes === LIMITS.free.superLikes);
  await call('/api/profile/me', 'a', { preferences: { minAge: 18, maxAge: 100, city: '', sameCityOnly: false } });

  const refundNotice = (await sent()).filter((c) => c.method === 'sendMessage').pop();
  check('refund confirmation sent to the user', /refunded/i.test(refundNotice?.body?.text || ''), refundNotice?.body?.text?.slice(0, 90));

  section('Refund H: historical purchase data preserved');
  check('original plan retained', doc.bezyPremium.planId === originalPlan);
  check('original purchase date retained', doc.bezyPremium.purchasedAt.toMillis() === originalPurchasedAt);
  check('original expiry retained for audit', doc.bezyPremium.expiresAt.toMillis() === originalExpiry);
  check('original charge id retained', doc.bezyPremium.telegramPaymentChargeId === 'charge_refund_1');
  check('payment retains plan and amount', pay.planId === 'monthly' && pay.stars === PLANS.monthly.stars);
  check('payment retains currency and payload', pay.currency === 'XTR' && pay.invoicePayload === refPayload);
  check('payment retains provider charge id', pay.providerPaymentChargeId === 'prov_charge_refund_1');
  check('payment retains original processedAt', Boolean(pay.processedAt));

  section('Refund C: duplicate refund is idempotent');
  const revokedAtFirst = doc.bezyPremium.revokedAt.toMillis();
  const paymentsBefore = (await firestore.collection('bezyPayments').get()).size;
  await resetCalls();
  const dupRes = await webhook(refundUpdate('charge_refund_1', refPayload, PLANS.monthly.stars));
  check('replayed refund returns 200', dupRes.status === 200);
  check('no duplicate confirmation sent', (await sent()).filter((c) => c.method === 'sendMessage').length === 0);
  doc = await userDocOf();
  check('revokedAt unchanged on replay', doc.bezyPremium.revokedAt.toMillis() === revokedAtFirst);
  check('membership still inactive (not reactivated)', premiumState(doc).active === false);
  check('no extra payment document created', (await firestore.collection('bezyPayments').get()).size === paymentsBefore);
  const dupDirect = await applyRefund(firestore, 'charge_refund_1', { source: 'admin_script' });
  check('applyRefund reports already_refunded', dupDirect.outcome === 'already_refunded', dupDirect.outcome);
  check('replay did not overwrite the original refund source', (await payDocOf('charge_refund_1')).refundSource === 'telegram_webhook');

  section('Refund: repurchase after refund does not restore refunded time');
  await resetCalls();
  await purchase('monthly', 'charge_after_refund');
  doc = await userDocOf();
  check('new purchase reactivates Premium', premiumState(doc).active === true);
  check('new expiry starts from now, not the refunded expiry',
    Math.abs(doc.bezyPremium.expiresAt.toMillis() - addMonths(new Date(), 1).getTime()) < 2 * 86400000,
    `refunded expiry ${new Date(originalExpiry).toISOString()} -> new ${doc.bezyPremium.expiresAt.toDate().toISOString()}`);
  check('revocation markers cleared by the new purchase', !doc.bezyPremium.revokedAt);

  section('Refund B: failed Telegram refund does not revoke');
  await firestore.collection('bezyPayments').doc('charge_after_refund').set({
    refundStatus: REFUND_STATUS.FAILED, refundFailedAt: new Date(), refundFailureReason: 'CHARGE_NOT_FOUND'
  }, { merge: true });
  doc = await userDocOf();
  check('membership still active after a failed refund', premiumState(doc).active === true);
  check('no revocation markers written', !doc.bezyPremium.revokedAt && doc.bezyPremium.active === true);
  r = await call('/api/premium', 'a');
  check('/api/premium still reports Premium', r.data.premium?.active === true);
  r = await call('/api/likes', 'a');
  check('Premium endpoint still accessible', r.status === 200);
  check('failure reason recorded for diagnosis', (await payDocOf('charge_after_refund')).refundFailureReason === 'CHARGE_NOT_FOUND');

  section('Refund D: refund before expiration revokes immediately');
  await resetCalls();
  const yearPayload = await purchase('yearly', 'charge_year_1');
  doc = await userDocOf();
  const yearExpiry = doc.bezyPremium.expiresAt.toMillis();
  check('yearly membership expires far in the future', yearExpiry > Date.now() + 300 * 86400000);
  await webhook(refundUpdate('charge_year_1', yearPayload, PLANS.yearly.stars));
  doc = await userDocOf();
  check('long-dated membership revoked immediately', premiumState(doc).active === false);
  check('future expiresAt preserved but powerless', doc.bezyPremium.expiresAt.toMillis() === yearExpiry);
  r = await call('/api/likes', 'a');
  check('access denied despite unexpired date', r.status === 403);

  section('Refund E: refund after expiration still records');
  await resetCalls();
  const latePayload = await purchase('monthly', 'charge_expired_1');
  await setPremium('900000001', { active: true, planId: 'monthly', expiresAt: new Date(Date.now() - 86400000), telegramPaymentChargeId: 'charge_expired_1' });
  doc = await userDocOf();
  check('membership already expired before refund', premiumState(doc).active === false);
  await resetCalls();
  const lateRes = await webhook(refundUpdate('charge_expired_1', latePayload, PLANS.monthly.stars));
  check('refund of an expired membership returns 200', lateRes.status === 200);
  check('payment still marked refunded', (await payDocOf('charge_expired_1')).refundStatus === REFUND_STATUS.REFUNDED);
  doc = await userDocOf();
  check('membership remains Free', premiumState(doc).active === false);
  check('no confirmation sent when nothing was revoked', (await sent()).filter((c) => c.method === 'sendMessage').length === 0);

  section('Refund F: Telegram Premium cannot resurrect a refunded membership');
  await firestore.collection('users').doc('900000001').set({ isPremiumTelegram: true }, { merge: true });
  doc = await userDocOf();
  check('Telegram Premium flag set', doc.isPremiumTelegram === true);
  check('Bezy Premium still Free after refund', premiumState(doc).active === false);
  r = await call('/api/premium', 'a');
  check('/api/premium still reports inactive', r.data.premium?.active === false);
  r = await call('/api/likes', 'a');
  check('Premium-only endpoint still refuses', r.status === 403);

  section('Refund G: refunds are not publicly reachable');
  check('no /api/premium/refund route exists', (await fetch(`${BASE}/api/premium/refund`, { method: 'POST' })).status === 404);
  r = await call('/api/premium', 'a', { action: 'refund', telegramPaymentChargeId: 'charge_year_1' });
  check('refund is not an accepted /api/premium action', r.status === 400 && r.data.error === 'INVALID_ACTION', JSON.stringify(r.data));
  r = await call('/api/premium', 'b', { action: 'invoice', planId: 'monthly' });
  check('another user cannot act on someone else\'s payment through the API', r.status === 200 && parseInvoicePayload((await sent()).filter((c) => c.method === 'createInvoiceLink').pop().body.payload).telegramUserId === '900000002');
  const unknown = await applyRefund(firestore, 'charge_does_not_exist', { source: 'admin_script' });
  check('refunding an unrecorded charge is refused', unknown.outcome === 'unknown_payment', unknown.outcome);
  check('unrecorded charge writes no payment document', (await firestore.collection('bezyPayments').doc('charge_does_not_exist').get()).exists === false);

  section('Refund: webhook robustness');
  check('refunded_payment without a charge id returns 200', (await webhook({
    message: { chat: { id: 900000001 }, from: { id: 900000001, language_code: 'en' }, refunded_payment: { currency: 'XTR', total_amount: 1 } }
  })).status === 200);
  check('refund for an unknown charge returns 200 and changes nothing', (await webhook(refundUpdate('charge_never_seen', 'x', 1))).status === 200);

  // ------------------------------------------------------------------ safety & rights
  section('Block');
  await cleanup();
  await seedAll();
  r = await call('/api/relationship', 'a', { action: 'block', targetId: '900000002' });
  check('block accepted', r.status === 200 && r.data.blocked === true, JSON.stringify(r.data));
  check('block recorded for the blocker',
    (await firestore.collection('users').doc('900000001').collection('blocks').doc('900000002').get()).exists);
  check('mirror recorded under the blocked user',
    (await firestore.collection('users').doc('900000002').collection('blockedBy').doc('900000001').get()).exists);
  r = await call('/api/discover', 'a');
  check('blocked user removed from blocker deck', !(r.data.profiles || []).some((p) => p.id === '900000002'), (r.data.profiles || []).map((p) => p.id).join(','));
  r = await call('/api/discover', 'b');
  check('blocker removed from blocked user deck', !(r.data.profiles || []).some((p) => p.id === '900000001'), (r.data.profiles || []).map((p) => p.id).join(','));
  r = await call('/api/swipe', 'b', { targetId: '900000001', action: 'like' });
  check('blocked user cannot like the blocker', r.status === 404, JSON.stringify(r.data));
  r = await call('/api/swipe', 'a', { targetId: '900000002', action: 'like' });
  check('blocker cannot like the blocked user', r.status === 404);
  r = await call('/api/relationship', 'a', { action: 'list_blocks', targetId: 'none' });
  check('blocked list returns the block', (r.data.blocked || []).some((b) => b.id === '900000002'), JSON.stringify(r.data.blocked));
  r = await call('/api/relationship', 'a', { action: 'unblock', targetId: '900000002' });
  check('unblock accepted', r.status === 200 && r.data.blocked === false);
  check('block document removed',
    (await firestore.collection('users').doc('900000001').collection('blocks').doc('900000002').get()).exists === false);
  check('mirror removed',
    (await firestore.collection('users').doc('900000002').collection('blockedBy').doc('900000001').get()).exists === false);

  section('Block ends an existing match');
  await cleanup();
  await seedAll();
  await call('/api/swipe', 'a', { targetId: '900000002', action: 'like' });
  r = await call('/api/swipe', 'b', { targetId: '900000001', action: 'like' });
  check('match created for the block test', r.data.matched === true);
  await call('/api/relationship', 'a', { action: 'block', targetId: '900000002' });
  r = await call('/api/matches', 'a');
  check('match gone for the blocker', (r.data.matches || []).length === 0, JSON.stringify(r.data.matches));
  r = await call('/api/matches', 'b');
  check('match gone for the blocked user too', (r.data.matches || []).length === 0);

  section('Report');
  await cleanup();
  await seedAll();
  r = await call('/api/relationship', 'a', { action: 'report', targetId: '900000002', reason: 'harassment', details: 'Test report.' });
  check('report accepted', r.status === 200 && r.data.reported === true, JSON.stringify(r.data));
  const reportSnap = await firestore.collection('reports').doc(r.data.reportId).get();
  const reportData = reportSnap.data() || {};
  check('report stores reporter, target, reason and status',
    reportData.reporterId === '900000001' && reportData.targetId === '900000002' && reportData.reason === 'harassment' && reportData.status === 'open',
    JSON.stringify(reportData).slice(0, 160));
  check('report stores no profile snapshot', reportData.profile === undefined && reportData.displayName === undefined);
  check('reporting also blocks',
    (await firestore.collection('users').doc('900000001').collection('blocks').doc('900000002').get()).exists);
  r = await call('/api/relationship', 'a', { action: 'report', targetId: '900000003', reason: 'not_a_real_reason' });
  check('unknown reason normalized to other', (await firestore.collection('reports').doc(r.data.reportId).get()).data().reason === 'other');
  r = await call('/api/relationship', 'a', { action: 'report', targetId: '900000004', details: 'x'.repeat(5000) });
  check('report details truncated', (await firestore.collection('reports').doc(r.data.reportId).get()).data().details.length === 1000);

  section('Unmatch');
  await cleanup();
  await seedAll();
  await call('/api/swipe', 'a', { targetId: '900000002', action: 'like' });
  await call('/api/swipe', 'b', { targetId: '900000001', action: 'like' });
  r = await call('/api/relationship', 'a', { action: 'unmatch', targetId: '900000002' });
  check('unmatch accepted', r.status === 200 && r.data.unmatched === true, JSON.stringify(r.data));
  check('match no longer listed for either side',
    (await call('/api/matches', 'a')).data.matches.length === 0 && (await call('/api/matches', 'b')).data.matches.length === 0);
  r = await call('/api/discover', 'a');
  check('unmatched person does not return to the deck', !(r.data.profiles || []).some((p) => p.id === '900000002'));
  r = await call('/api/relationship', 'a', { action: 'unmatch', targetId: '900000003' });
  check('unmatch with no match is a safe no-op', r.status === 200 && r.data.unmatched === false, JSON.stringify(r.data));

  section('Relationship authorization');
  r = await call('/api/relationship', 'user=%7B%22id%22%3A1%7D&hash=deadbeef', { action: 'block', targetId: '900000002' });
  check('unauthenticated relationship call rejected', r.status === 401);
  r = await call('/api/relationship', 'a', { action: 'block', targetId: '900000001' });
  check('cannot block yourself', r.status === 400 && r.data.error === 'INVALID_TARGET');
  r = await call('/api/relationship', 'a', { action: 'nonsense', targetId: '900000002' });
  check('unknown relationship action rejected', r.status === 400 && r.data.error === 'INVALID_ACTION');
  check('GET on relationship rejected', (await fetch(`${BASE}/api/relationship`)).status === 405);

  section('User enumeration protection');
  await cleanup();
  await seedAll();
  const unknownRes = await call('/api/swipe', 'a', { targetId: '900000099', action: 'like' });
  await call('/api/relationship', 'a', { action: 'block', targetId: '900000003' });
  const blockedRes = await call('/api/swipe', 'a', { targetId: '900000003', action: 'like' });
  check('non-existent and blocked targets are indistinguishable',
    unknownRes.status === blockedRes.status && JSON.stringify(unknownRes.data) === JSON.stringify(blockedRes.data),
    `${unknownRes.status}:${JSON.stringify(unknownRes.data)} vs ${blockedRes.status}:${JSON.stringify(blockedRes.data)}`);

  section('Data export (GDPR access / portability)');
  await cleanup();
  await seedAll();
  await call('/api/swipe', 'a', { targetId: '900000002', action: 'like' });
  await call('/api/swipe', 'b', { targetId: '900000001', action: 'like' });
  await call('/api/relationship', 'a', { action: 'block', targetId: '900000003' });
  r = await call('/api/account', 'a', { action: 'export' });
  const exported = r.data.data || {};
  check('export returns the account', r.status === 200 && exported.account?.telegramId === 900000001, JSON.stringify(exported.account).slice(0, 120));
  check('export includes the profile', exported.profile?.displayName === 'Ada');
  check('export includes the age declaration', exported.ageEligibility?.confirmed === true && exported.ageEligibility?.method === 'self_declaration');
  check('export includes own decisions', (exported.decisions || []).some((d) => d.targetTelegramId === '900000002'));
  check('export includes blocks', (exported.blocked || []).some((b) => b.targetTelegramId === '900000003'));
  check('export includes matches', (exported.matches || []).length === 1);
  check('likes received are a count, not other people\'s profiles', typeof exported.likesReceivedCount === 'number' && exported.likes === undefined);
  check('export does not disclose reports filed about the user', exported.reportsAboutYou === undefined);
  check('export explains that conversations live in Telegram', (exported.notes || []).some((n) => /Telegram/.test(n)));
  r = await call('/api/account', 'user=%7B%22id%22%3A1%7D&hash=deadbeef', { action: 'export' });
  check('unauthenticated export rejected', r.status === 401);

  section('Account deletion (GDPR erasure)');
  await cleanup();
  await seedAll();
  await call('/api/swipe', 'a', { targetId: '900000002', action: 'like' });
  await call('/api/swipe', 'b', { targetId: '900000001', action: 'like' });
  await call('/api/relationship', 'a', { action: 'block', targetId: '900000003' });
  await purchase('monthly', 'charge_delete_1');

  r = await call('/api/account', 'a', { action: 'delete' });
  check('deletion requires explicit confirmation', r.status === 400 && r.data.error === 'CONFIRMATION_REQUIRED', JSON.stringify(r.data));
  r = await call('/api/account', 'a', { action: 'delete', confirm: 'yes' });
  check('wrong confirmation rejected', r.status === 400);
  check('account still present before confirmed deletion',
    (await firestore.collection('users').doc('900000001').get()).exists);

  r = await call('/api/account', 'a', { action: 'delete', confirm: 'DELETE' });
  check('deletion succeeds with confirmation', r.status === 200 && r.data.deleted === true, JSON.stringify(r.data));
  check('user document removed', (await firestore.collection('users').doc('900000001').get()).exists === false);
  check('actions subcollection removed',
    (await firestore.collection('users').doc('900000001').collection('actions').get()).size === 0);
  check('blocks subcollection removed',
    (await firestore.collection('users').doc('900000001').collection('blocks').get()).size === 0);
  check('mirror under the blocked user cleaned up',
    (await firestore.collection('users').doc('900000003').collection('blockedBy').doc('900000001').get()).exists === false);
  check('like mirror removed from the other user',
    (await firestore.collection('users').doc('900000002').collection('likesReceived').doc('900000001').get()).exists === false);
  check('matches ended for the counterpart', (await call('/api/matches', 'b')).data.matches.length === 0);
  check('deleted user is not discoverable',
    !((await call('/api/discover', 'b')).data.profiles || []).some((p) => p.id === '900000001'));
  check('payment record retained for accounting',
    (await firestore.collection('bezyPayments').doc('charge_delete_1').get()).exists);
  check('retained counts reported to the user', r.data.retained?.payments === 1, JSON.stringify(r.data.retained));

  r = await call('/api/account', 'a', { action: 'delete', confirm: 'DELETE' });
  check('deletion is idempotent', r.status === 200 && r.data.alreadyDeleted === true, JSON.stringify(r.data));
  r = await call('/api/account', 'a', { action: 'export' });
  check('export after deletion returns no account', r.data.data?.account === null, JSON.stringify(r.data.data).slice(0, 120));

  // Reopening the Mini App creates a brand-new account. It must carry nothing over.
  r = await call('/api/profile/me', 'a');
  check('returning user must re-declare age', r.data.needsAgeConfirmation === true);
  const reborn = (await firestore.collection('users').doc('900000001').get()).data() || {};
  check('returning user has no previous profile', !reborn.profile?.displayName, JSON.stringify(reborn.profile));
  check('returning user has no previous membership', premiumState(reborn).active === false);
  check('returning user has no previous decisions',
    (await firestore.collection('users').doc('900000001').collection('actions').get()).size === 0);
  check('returning user has no previous blocks',
    (await firestore.collection('users').doc('900000001').collection('blocks').get()).size === 0);

  // ------------------------------------------------------------------ regression
  section('Regression: existing dating flow');
  await cleanup();
  await seedAll();
  r = await call('/api/profile/me', 'a');
  check('profile loads', r.status === 200 && r.data.profile?.profileComplete === true);
  r = await call('/api/profile/me', 'a', { profile: { ...PROFILES.a, age: 17 } });
  check('18+ still enforced', r.data.profile?.profileComplete === false);
  await call('/api/profile/me', 'a', { profile: PROFILES.a });
  r = await call('/api/discover', 'a');
  check('discover returns candidates', (r.data.profiles || []).length >= 2, (r.data.profiles || []).map((p) => p.id).join(','));
  check('stats remain real', r.data.stats?.available === r.data.profiles.length);
  r = await call('/api/swipe', 'a', { targetId: '900000003', action: 'pass' });
  check('pass works', r.status === 200 && r.data.matched === false);
  await resetCalls();
  await call('/api/swipe', 'a', { targetId: '900000002', action: 'like' });
  r = await call('/api/swipe', 'b', { targetId: '900000001', action: 'like' });
  check('mutual like creates a match', r.data.matched === true);
  const notifications = (await sent()).filter((c) => c.method === 'sendMessage');
  check('two localized match notifications sent', notifications.length === 2, `sent=${notifications.length}`);
  check('notifications localized per recipient', notifications.some((n) => /You matched/.test(n.body.text)) && notifications.some((n) => /Match avec/.test(n.body.text)));
  r = await call('/api/matches', 'a');
  check('match list returns the match', (r.data.matches || [])[0]?.id === '900000002');
  check('matchedAt is an ISO string', typeof (r.data.matches || [])[0]?.matchedAt === 'string');
  r = await call('/api/swipe', 'a', { targetId: '900000001', action: 'like' });
  check('self-swipe still rejected', r.status === 400);
  r = await call('/api/swipe', 'a', { targetId: '900000002', action: 'wave' });
  check('unknown action still rejected', r.status === 400);

  section('Regression: bot commands');
  await resetCalls();
  const cmd = (text, lang) => webhook({ message: { chat: { id: 900000001 }, from: { language_code: lang }, text } });
  for (const [text, lang] of [['/start', 'en'], ['/help', 'en'], ['/profile', 'en'], ['/discover', 'en'], ['/matches', 'en'], ['/settings', 'en'], ['/aide', 'fr'], ['/parametres', 'fr']]) {
    const res = await cmd(text, lang);
    if (res.status !== 200) check(`${text} returns 200`, false, String(res.status));
  }
  check('all existing commands return 200', true);
  check('unknown command ignored', (await cmd('/nope', 'en')).status === 200);
  await resetCalls();
  await cmd('/premium', 'en');
  const premiumEn = (await sent()).filter((c) => c.method === 'sendMessage').pop();
  check('/premium no longer says "coming soon"', !/coming soon/i.test(premiumEn?.body?.text || ''), premiumEn?.body?.text?.slice(0, 80));
  check('/premium mentions Telegram Stars', /Telegram Stars/.test(premiumEn?.body?.text || ''));
  check('/premium tells the user they need a Stars balance', /Stars in your balance/i.test(premiumEn?.body?.text || ''), premiumEn?.body?.text?.slice(0, 200));
  check('/premium warns that Telegram Premium is not Bezy Premium',
    /does not include Bezy Premium/i.test(premiumEn?.body?.text || ''), premiumEn?.body?.text?.slice(0, 240));
  check('/premium opens the premium view', /view=premium/.test(JSON.stringify(premiumEn?.body?.reply_markup || {})));
  await resetCalls();
  await cmd('/premium', 'fr');
  const premiumFr = (await sent()).filter((c) => c.method === 'sendMessage').pop();
  check('/premium localized in French', /Telegram Stars/.test(premiumFr?.body?.text || '') && /Voir qui vous a liké/.test(premiumFr?.body?.text || ''));
  check('/premium states the Stars requirement in French', /Mes Stars/.test(premiumFr?.body?.text || ''), premiumFr?.body?.text?.slice(0, 200));
  check('/premium warns in French that Telegram Premium is separate',
    /n’inclut pas Bezy Premium/.test(premiumFr?.body?.text || ''), premiumFr?.body?.text?.slice(0, 240));
} finally {
  await cleanup();
  await harness.close();
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (failures.length) console.log('Failed:\n - ' + failures.join('\n - '));
process.exit(fail ? 1 : 0);
