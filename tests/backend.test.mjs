// Bezy backend suite: core dating flow + Bezy Premium (Telegram Stars).
// Runs the real API handlers against the real Firestore database using synthetic
// Telegram IDs 9000000xx, which are deleted before and after the run.
//
//   BEZY_SERVICE_ACCOUNT=<path to service-account.json> node tests/backend.test.mjs
import { startHarness, makeInitData, TEST_USERS } from './harness.mjs';
import { premiumPlans, parseInvoicePayload, addMonths, nextExpiry, premiumState, checkSwipeQuota, LIMITS, applyRefund, REFUND_STATUS } from '../api/_premium.js';
import { db } from '../api/_firebase.js';
import { PROMPT_IDS, LANGUAGE_IDS } from '../api/profile/me.js';
import { sharedSignals } from '../api/matches.js';
import { defaultNotificationSettings, normalizeNotificationSettings, notificationSettings, isNotificationEnabled, withinDailyCap, OPTIONAL_CATEGORIES, NOTIFICATION_CATEGORIES } from '../api/_notify.js';
import { processingPaused } from '../api/_privacy.js';
import { planProfileReminders, sendProfileReminders, reminderMessage } from '../api/_reminders.js';
import { compatibilityBreakdown, filtersActive, pairCompatibility, explorationTerm, preferenceFit } from '../api/discover.js';
import { formatSupportReference, normalizeSupportRequest } from '../api/_support.js';

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

  // ------------------------------------------------------- prompts & shared signals
  section('Profile prompts');
  await cleanup();
  await seedAll();
  const PROMPTS_OK = [{ id: 'perfect_sunday', answer: 'A long walk and a longer lunch.' }, { id: 'i_value', answer: 'Curiosity.' }];
  const storedPrompts = async (who) => (await call('/api/profile/me', who)).data.profile?.profile?.prompts;
  r = await call('/api/profile/me', 'a', { profile: { ...PROFILES.a, prompts: PROMPTS_OK } });
  check('answered prompts are stored in order',
    JSON.stringify(r.data.profile?.profile?.prompts) === JSON.stringify(PROMPTS_OK), JSON.stringify(r.data.profile?.profile?.prompts));
  check('prompts do not change profile completeness', r.data.profile?.profileComplete === true);

  await call('/api/profile/me', 'a', { profile: { ...PROFILES.a, prompts: [{ id: 'not_a_prompt', answer: 'x' }, { id: 'first_date', answer: 'Coffee.' }] } });
  check('an unknown prompt id is dropped rather than stored',
    JSON.stringify(await storedPrompts('a')) === JSON.stringify([{ id: 'first_date', answer: 'Coffee.' }]), JSON.stringify(await storedPrompts('a')));

  await call('/api/profile/me', 'a', { profile: { ...PROFILES.a, prompts: PROMPT_IDS.map((id) => ({ id, answer: `answer for ${id}` })) } });
  check('no more than three prompts are kept', (await storedPrompts('a')).length === 3, String((await storedPrompts('a')).length));

  await call('/api/profile/me', 'a', { profile: { ...PROFILES.a, prompts: [{ id: 'i_value', answer: 'First.' }, { id: 'i_value', answer: 'Second.' }] } });
  check('a repeated prompt id is kept only once, first answer wins',
    JSON.stringify(await storedPrompts('a')) === JSON.stringify([{ id: 'i_value', answer: 'First.' }]), JSON.stringify(await storedPrompts('a')));

  await call('/api/profile/me', 'a', { profile: { ...PROFILES.a, prompts: [{ id: 'i_value', answer: '   ' }, { id: 'first_date', answer: 'Coffee.' }] } });
  check('a blank answer is dropped', (await storedPrompts('a')).every((p) => p.id !== 'i_value'), JSON.stringify(await storedPrompts('a')));

  await call('/api/profile/me', 'a', { profile: { ...PROFILES.a, prompts: [{ id: 'i_value', answer: 'x'.repeat(400) }] } });
  check('a long answer is truncated to 200 characters', (await storedPrompts('a'))[0]?.answer.length === 200, String((await storedPrompts('a'))[0]?.answer.length));

  await call('/api/profile/me', 'a', { profile: { ...PROFILES.a, prompts: 'not-an-array' } });
  check('a malformed prompts value becomes an empty list', JSON.stringify(await storedPrompts('a')) === '[]', JSON.stringify(await storedPrompts('a')));

  r = await call('/api/profile/me', 'a', { profile: { ...PROFILES.a, city: '', prompts: PROMPTS_OK } });
  check('prompts alone cannot complete a profile', r.data.profile?.profileComplete === false);

  await call('/api/profile/me', 'a', { profile: { ...PROFILES.a, prompts: PROMPTS_OK } });
  r = await call('/api/discover', 'b');
  const seenInDeck = (r.data.profiles || []).find((p) => p.id === '900000001');
  check('prompts are published on the discovery card',
    JSON.stringify(seenInDeck?.prompts) === JSON.stringify(PROMPTS_OK), JSON.stringify(seenInDeck?.prompts));
  check('the discovery card still withholds the Telegram handle',
    seenInDeck !== undefined && !('username' in seenInDeck) && !('telegramId' in seenInDeck), Object.keys(seenInDeck || {}).join(','));

  section('Why you matched');
  check('shared interests are reported using the viewer\'s own wording',
    JSON.stringify(sharedSignals({ interests: ['Music', 'Travel'] }, { interests: ['music', 'hiking'] })) === JSON.stringify([{ type: 'interests', values: ['Music'] }]),
    JSON.stringify(sharedSignals({ interests: ['Music', 'Travel'] }, { interests: ['music', 'hiking'] })));
  check('a shared city is detected regardless of casing',
    sharedSignals({ city: 'paris' }, { city: 'Paris' }).some((s) => s.type === 'city' && s.values[0] === 'Paris'));
  check('a different city produces no city signal',
    !sharedSignals({ city: 'Paris' }, { city: 'Lyon' }).some((s) => s.type === 'city'));
  check('ages within five years produce an age signal', sharedSignals({ age: 29 }, { age: 34 }).some((s) => s.type === 'age'));
  check('ages further apart produce none', !sharedSignals({ age: 29 }, { age: 40 }).some((s) => s.type === 'age'));
  check('nothing in common produces no signals', sharedSignals({ interests: ['a'], city: 'Paris', age: 20 }, { interests: ['b'], city: 'Lyon', age: 40 }).length === 0);
  check('at most five shared interests are listed',
    sharedSignals({ interests: ['a', 'b', 'c', 'd', 'e', 'f'] }, { interests: ['a', 'b', 'c', 'd', 'e', 'f'] })[0].values.length === 5);
  check('an empty profile is handled without throwing', sharedSignals().length === 0);
  // gender and seeking are the Article 9 attributes: explaining a match in terms of them
  // would be exactly the sensitive inference the feature must not make.
  check('gender and seeking are never used as a match explanation',
    JSON.stringify(sharedSignals({ gender: 'woman', seeking: 'men' }, { gender: 'man', seeking: 'women' })) === '[]');

  await resetCalls();
  await call('/api/swipe', 'a', { targetId: '900000002', action: 'like' });
  await call('/api/swipe', 'b', { targetId: '900000001', action: 'like' });
  r = await call('/api/matches', 'a');
  const matched = (r.data.matches || [])[0];
  check('a match carries its shared signals', Array.isArray(matched?.sharedSignals) && matched.sharedSignals.length > 0, JSON.stringify(matched?.sharedSignals));
  check('shared signals name only the types the card can render',
    (matched?.sharedSignals || []).every((s) => ['interests', 'city', 'age'].includes(s.type)), JSON.stringify(matched?.sharedSignals));
  check('Ada and Bo share music and travel',
    JSON.stringify((matched?.sharedSignals || []).find((s) => s.type === 'interests')?.values.sort()) === JSON.stringify(['music', 'travel']),
    JSON.stringify(matched?.sharedSignals));
  check('the match card carries prompts as well', JSON.stringify(matched?.prompts) === '[]', JSON.stringify(matched?.prompts));
  r = await call('/api/matches', 'b');
  check('the counterpart sees Ada\'s prompts after matching',
    JSON.stringify((r.data.matches || [])[0]?.prompts) === JSON.stringify(PROMPTS_OK), JSON.stringify((r.data.matches || [])[0]?.prompts));
  check('the handle is still released only on a match', typeof (r.data.matches || [])[0]?.username === 'string');

  // ------------------------------------------------------------------ notifications
  section('Notification preferences (pure logic)');
  check('everything is on by default', JSON.stringify(defaultNotificationSettings()) === JSON.stringify({ matches: true, super_likes: true, profile_reminders: true }),
    JSON.stringify(defaultNotificationSettings()));
  check('an absent notifications map means everything is on',
    JSON.stringify(notificationSettings({})) === JSON.stringify({ matches: true, super_likes: true, profile_reminders: true }));
  check('only an explicit false disables a category',
    normalizeNotificationSettings({ matches: false }).matches === false && normalizeNotificationSettings({ matches: 0 }).matches === true,
    JSON.stringify(normalizeNotificationSettings({ matches: false, super_likes: 0 })));
  check('a category the user did not mention keeps its default',
    normalizeNotificationSettings({ matches: false }).super_likes === true && normalizeNotificationSettings({ matches: false }).profile_reminders === true);
  check('unknown keys are dropped rather than stored',
    !('everything' in normalizeNotificationSettings({ everything: false })), JSON.stringify(normalizeNotificationSettings({ everything: false })));
  check('a malformed payload cannot mute anyone',
    JSON.stringify(normalizeNotificationSettings('off')) === JSON.stringify({ matches: true, super_likes: true, profile_reminders: true }));
  // Transactional messages are a record of something that happened to the user's money or
  // account. No payload may switch them off.
  check('a transactional category stays enabled whatever is stored',
    isNotificationEnabled({ notifications: { account: false, matches: false } }, 'account') === true);
  check('an optional category respects the stored choice',
    isNotificationEnabled({ notifications: { matches: false } }, 'matches') === false);
  check('an unknown category is never notifiable', isNotificationEnabled({}, 'invented') === false);
  check('only the optional categories are offered to users',
    JSON.stringify(OPTIONAL_CATEGORIES) === JSON.stringify(['matches', 'super_likes', 'profile_reminders']), OPTIONAL_CATEGORIES.join(','));

  section('Notification preferences (stored)');
  await cleanup();
  await seedAll();
  r = await call('/api/profile/me', 'a');
  check('a fresh account reports the defaults', JSON.stringify(r.data.notifications) === JSON.stringify({ matches: true, super_likes: true, profile_reminders: true }),
    JSON.stringify(r.data.notifications));
  r = await call('/api/profile/me', 'a', { notifications: { super_likes: false } });
  check('a choice is stored and echoed back', JSON.stringify(r.data.notifications) === JSON.stringify({ matches: true, super_likes: false, profile_reminders: true }),
    JSON.stringify(r.data.notifications));
  r = await call('/api/profile/me', 'a');
  check('the choice survives a reload', r.data.notifications?.super_likes === false);
  r = await call('/api/profile/me', 'a', { notifications: { account: false } });
  check('a client cannot switch off transactional messages', !('account' in (r.data.notifications || {})),
    JSON.stringify(r.data.notifications));
  r = await call('/api/account', 'a', { action: 'export' });
  check('notification choices are included in the data export',
    r.data.export?.notificationPreferences?.super_likes === false, JSON.stringify(r.data.export?.notificationPreferences));
  await call('/api/profile/me', 'a', { notifications: { matches: true, super_likes: true } });

  section('Super Like notification');
  await cleanup();
  await seedAll();
  await resetCalls();
  // Bo super likes Ada. Ada has not decided about Bo, so this is news to her.
  r = await call('/api/swipe', 'b', { targetId: '900000001', action: 'super' });
  check('the super like is recorded', r.status === 200 && r.data.matched === false);
  let notes = (await sent()).filter((c) => c.method === 'sendMessage');
  check('the recipient is notified once', notes.length === 1, `sent=${notes.length}`);
  check('the notification goes to the recipient, not the sender', String(notes[0]?.body?.chat_id) === '900000001', String(notes[0]?.body?.chat_id));
  // The whole point: interest is disclosed, identity is not. Naming the sender would give
  // away for free exactly what /api/likes charges Premium members to see.
  const noteText = JSON.stringify(notes[0]?.body || {});
  check('the notification never names the sender', !/Bo\b/.test(noteText), noteText.slice(0, 200));
  check('the notification carries no @username or Telegram id', !/@|900000002/.test(noteText), noteText.slice(0, 200));
  check('the notification is a Super Like message', /super lik/i.test(notes[0]?.body?.text || ''), notes[0]?.body?.text);

  await resetCalls();
  await call('/api/swipe', 'b', { targetId: '900000001', action: 'super' });
  check('re-deciding on the same person does not notify again', (await sent()).length === 0);

  // A plain like stays silent: that is the "who liked you" Premium feature, not a push.
  await resetCalls();
  await call('/api/swipe', 'c', { targetId: '900000004', action: 'like' });
  check('an ordinary like sends nothing', (await sent()).filter((c) => c.method === 'sendMessage').length === 0);

  // When the super like completes a match, the match notification says more and replaces it.
  await cleanup();
  await seedAll();
  await call('/api/swipe', 'a', { targetId: '900000002', action: 'like' });
  await resetCalls();
  await call('/api/swipe', 'b', { targetId: '900000001', action: 'super' });
  notes = (await sent()).filter((c) => c.method === 'sendMessage');
  check('a super like that matches sends two match notifications and no super-like message',
    notes.length === 2 && notes.every((n) => /matched|Match avec/i.test(n.body.text)), notes.map((n) => n.body.text?.slice(0, 40)).join(' | '));

  section('Notification preferences are enforced on delivery');
  await cleanup();
  await seedAll();
  await call('/api/profile/me', 'a', { notifications: { super_likes: false } });
  await resetCalls();
  await call('/api/swipe', 'b', { targetId: '900000001', action: 'super' });
  check('a switched-off Super Like notification is not sent', (await sent()).filter((c) => c.method === 'sendMessage').length === 0);
  check('the super like itself still counts', (await call('/api/likes', 'a')).status !== 500);

  await cleanup();
  await seedAll();
  await call('/api/profile/me', 'a', { notifications: { matches: false } });
  await call('/api/swipe', 'a', { targetId: '900000002', action: 'like' });
  await resetCalls();
  r = await call('/api/swipe', 'b', { targetId: '900000001', action: 'like' });
  notes = (await sent()).filter((c) => c.method === 'sendMessage');
  check('the match itself is still created when a notification is muted', r.data.matched === true);
  check('only the consenting side is notified', notes.length === 1 && String(notes[0].body.chat_id) === '900000002',
    notes.map((n) => String(n.body.chat_id)).join(','));
  r = await call('/api/matches', 'a');
  check('a muted user still sees the match in the Mini App', (r.data.matches || []).length === 1);

  section('Super Like flood ceiling');
  const capUser = '900000099';
  await firestore.collection('rateLimits').doc(capUser).delete().catch(() => {});
  const capResults = [];
  for (let i = 0; i < 7; i += 1) capResults.push(await withinDailyCap(firestore, capUser, 'super_likes'));
  check('the daily ceiling allows exactly five Super Like notifications',
    capResults.filter(Boolean).length === 5, capResults.join(','));
  check('the ceiling blocks everything after it', capResults.slice(5).every((v) => v === false), capResults.join(','));
  check('an uncapped category is never blocked',
    (await withinDailyCap(firestore, capUser, 'matches')) === true);
  // The counter lives in the rate-limit document, which account deletion already erases, so
  // capping adds no new personal-data surface.
  const capDoc = (await firestore.collection('rateLimits').doc(capUser).get()).data() || {};
  check('the counter is stored with the rate-limit counters', 'notify_super_likes' in capDoc, Object.keys(capDoc).join(','));
  check('yesterday\'s window does not carry over',
    (await withinDailyCap(firestore, capUser, 'super_likes', Date.now() + 86400001)) === true);
  await firestore.collection('rateLimits').doc(capUser).delete().catch(() => {});

  // --------------------------------------------------- profile-completion reminders (N-2)
  section('Profile-completion reminders (pure logic)');
  const reminderDef = NOTIFICATION_CATEGORIES.profile_reminders;
  check('the reminder category is opt-out like other engagement messages', reminderDef?.optional === true);
  check('the reminder is capped at one per seven-day window',
    reminderDef?.dailyCap === 1 && reminderDef?.windowMs === 7 * 86400000, JSON.stringify(reminderDef));
  check('the French reminder is French and the default is English',
    /profil/.test(reminderMessage('fr').text) && !/profil/.test(reminderMessage('en').text));
  check('the reminder carries a button label in both languages',
    Boolean(reminderMessage('en').button) && Boolean(reminderMessage('fr').button)
    && reminderMessage('en').button !== reminderMessage('fr').button);

  section('Profile-completion reminders');
  await cleanup();
  // Four account shapes: eligible, complete (excluded), never-confirmed (excluded) and
  // paused-by-objection (excluded).
  await firestore.collection('users').doc('900000060').set({
    telegramId: 900000060, ageEligibilityConfirmed: true, profileComplete: false, discoverable: false,
    languageCode: 'fr', createdAt: new Date(), profile: { displayName: 'Eligible' }
  });
  await firestore.collection('users').doc('900000061').set({
    telegramId: 900000061, ageEligibilityConfirmed: true, profileComplete: true, discoverable: true,
    createdAt: new Date(), profile: { ...PROFILES.b, displayName: 'Done' }
  });
  await firestore.collection('users').doc('900000062').set({
    telegramId: 900000062, profileComplete: false, discoverable: false,
    createdAt: new Date(), profile: { displayName: 'NeverConfirmed' }
  });
  await firestore.collection('users').doc('900000063').set({
    telegramId: 900000063, ageEligibilityConfirmed: true, profileComplete: false, discoverable: false,
    processingObjection: true, processingObjectedAt: new Date(),
    createdAt: new Date(), profile: { displayName: 'Objecting' }
  });

  let plan = await planProfileReminders(firestore, {});
  const plannedIds = plan.users.map((u) => u.id);
  check('only the confirmed, incomplete, unpaused account is selected',
    JSON.stringify(plannedIds) === JSON.stringify(['900000060']), plannedIds.join(','));
  check('protected ids are never selected',
    (await planProfileReminders(firestore, { protectedIds: ['900000060'] })).users.length === 0);

  await resetCalls();
  let summary = await sendProfileReminders(firestore, plan);
  check('the reminder is sent once', summary.sent === 1, JSON.stringify(summary));
  const reminderNotes = (await sent()).filter((c) => c.method === 'sendMessage');
  check('the reminder is in the recipient\'s language', /profil/.test(reminderNotes[0]?.body?.text || ''), reminderNotes[0]?.body?.text);
  check('the button opens the Mini App profile view',
    /view=profile/.test(JSON.stringify(reminderNotes[0]?.body?.reply_markup || {})), JSON.stringify(reminderNotes[0]?.body?.reply_markup));

  // The seven-day cap: a second run in the same window sends nothing.
  summary = await sendProfileReminders(firestore, plan);
  check('a second run in the same seven-day window is capped', summary.capped === 1 && summary.sent === 0, JSON.stringify(summary));

  // The cap record expires: a run in eight days' time goes through again.
  await firestore.collection('rateLimits').doc('900000060').delete().catch(() => {});
  await firestore.collection('rateLimits').doc('900000060').set({ notify_profile_reminders: { w: Date.now() - 8 * 86400000, c: 1 } });
  summary = await sendProfileReminders(firestore, plan);
  check('an expired window allows the reminder again', summary.sent === 1, JSON.stringify(summary));

  // A user can switch the reminder off entirely, like any engagement notification.
  await cleanup();
  await firestore.collection('users').doc('900000060').set({
    telegramId: 900000060, ageEligibilityConfirmed: true, profileComplete: false, discoverable: false,
    notifications: { matches: true, super_likes: true, profile_reminders: false },
    createdAt: new Date(), profile: { displayName: 'Eligible' }
  });
  plan = await planProfileReminders(firestore, {});
  await firestore.collection('rateLimits').doc('900000060').delete().catch(() => {});
  summary = await sendProfileReminders(firestore, plan);
  check('a switched-off reminder is not sent', summary.disabled === 1 && summary.sent === 0, JSON.stringify(summary));

  // The reminder must never outrank a legal pause — and it does not, because delivery goes
  // through the same policy as everything else.
  await cleanup();
  await firestore.collection('users').doc('900000063').set({
    telegramId: 900000063, ageEligibilityConfirmed: true, profileComplete: false, discoverable: false,
    processingRestricted: true, processingRestrictedAt: new Date(),
    createdAt: new Date(), profile: { displayName: 'Restricted' }
  });
  plan = await planProfileReminders(firestore, {});
  check('a paused account is not even selected for a reminder', plan.users.length === 0, plan.users.map((u) => u.id).join(','));

  // ------------------------------------------- safety / account event notifications (N-3)
  section('Safety and account event notifications');
  await cleanup();
  await seedAll();
  await resetCalls();

  // A report hands the matter to a human moderator; the acknowledgment is the reporter's
  // record that it was received.
  r = await call('/api/relationship', 'a', { action: 'report', targetId: '900000002', reason: 'spam' });
  check('the report is stored', r.status === 200 && r.data.reported === true);
  notes = (await sent()).filter((c) => c.method === 'sendMessage');
  check('the reporter receives an acknowledgment', notes.length === 1 && String(notes[0].body.chat_id) === '900000001',
    notes.map((n) => String(n.body.chat_id)).join(','));
  check('the acknowledgment names no target', !/Bo\b|900000002/.test(JSON.stringify(notes[0].body || {})),
    JSON.stringify(notes[0].body || {}).slice(0, 200));
  const firstAck = notes[0]?.body?.text;
  // A report about a stranger is acknowledged identically, so the bot chat cannot be used to
  // probe account existence.
  await resetCalls();
  r = await call('/api/relationship', 'a', { action: 'report', targetId: '900000098', reason: 'spam' });
  notes = (await sent()).filter((c) => c.method === 'sendMessage');
  check('a report about a stranger gets the same acknowledgment',
    r.data.reported === true && notes.length === 1 && notes[0].body.text === firstAck);

  // Blocks, unblocks and unmatches stay silent: their effect is visible in the app itself.
  await resetCalls();
  await call('/api/relationship', 'a', { action: 'block', targetId: '900000003' });
  await call('/api/relationship', 'a', { action: 'unblock', targetId: '900000003' });
  check('block and unblock stay silent', (await sent()).filter((c) => c.method === 'sendMessage').length === 0);

  // Pausing and resuming are account events: the bot message is the user's durable record,
  // and it is transactional, so it arrives even though the pause itself silences engagement
  // notifications.
  await resetCalls();
  await call('/api/account', 'a', { action: 'restrict' });
  notes = (await sent()).filter((c) => c.method === 'sendMessage');
  check('pausing processing is confirmed in the bot chat', notes.length === 1 && /paused/i.test(notes[0].body.text || ''),
    notes[0]?.body?.text);
  await resetCalls();
  await call('/api/account', 'a', { action: 'restrict' });
  check('an idempotent repeat is not a new event', (await sent()).filter((c) => c.method === 'sendMessage').length === 0);
  await resetCalls();
  await call('/api/account', 'a', { action: 'unrestrict' });
  notes = (await sent()).filter((c) => c.method === 'sendMessage');
  check('resuming processing is confirmed too', notes.length === 1 && /resumed/i.test(notes[0].body.text || ''),
    notes[0]?.body?.text);

  // The objection and its withdrawal are account events of the same kind.
  await resetCalls();
  await call('/api/account', 'a', { action: 'object' });
  notes = (await sent()).filter((c) => c.method === 'sendMessage');
  check('objecting is confirmed in the bot chat', notes.length === 1 && /objection/i.test(notes[0].body.text || ''),
    notes[0]?.body?.text);
  await resetCalls();
  await call('/api/account', 'a', { action: 'unobject' });
  notes = (await sent()).filter((c) => c.method === 'sendMessage');
  check('withdrawing the objection is confirmed too', notes.length === 1 && /withdrawn/i.test(notes[0].body.text || ''),
    notes[0]?.body?.text);

  // Transactional means transactional: no notification setting can mute an account event.
  await call('/api/profile/me', 'a', { notifications: { matches: false, super_likes: false, profile_reminders: false } });
  await resetCalls();
  await call('/api/account', 'a', { action: 'restrict' });
  check('account messages arrive with every engagement toggle off',
    (await sent()).filter((c) => c.method === 'sendMessage').length === 1);
  await resetCalls();
  await call('/api/account', 'a', { action: 'unrestrict' });

  // The bot speaks the recipient's language, like every other notification.
  await cleanup();
  await seedAll();
  await resetCalls();
  await call('/api/relationship', 'b', { action: 'report', targetId: '900000001', reason: 'spam' });
  notes = (await sent()).filter((c) => c.method === 'sendMessage');
  check('the acknowledgment follows the recipient\'s language', /signalement/i.test(notes[0]?.body?.text || ''),
    notes[0]?.body?.text);

  // Erasure gets a final confirmation, sent while the account still exists.
  await resetCalls();
  r = await call('/api/account', 'a', { action: 'delete', confirm: 'DELETE' });
  check('the deletion is recorded', r.status === 200 && r.data.deleted === true);
  notes = (await sent()).filter((c) => c.method === 'sendMessage');
  check('deletion is confirmed in the bot chat', notes.length === 1 && /deleted/i.test(notes[0].body.text || ''),
    notes[0]?.body?.text);
  check('the account is gone afterwards', !(await firestore.collection('users').doc('900000001').get()).exists);

  // ------------------------------------------------------------------ language filter
  section('Languages spoken');
  await cleanup();
  await seedAll();
  const storedLanguages = async (who) => (await call('/api/profile/me', who)).data.profile?.profile?.languages;
  r = await call('/api/profile/me', 'a', { profile: { ...PROFILES.a, languages: ['fr', 'en'] } });
  check('languages are stored', JSON.stringify(r.data.profile?.profile?.languages) === JSON.stringify(['en', 'fr']),
    JSON.stringify(r.data.profile?.profile?.languages));
  // Order is normalized so two profiles listing the same languages are stored identically.
  check('languages are stored in catalogue order regardless of input order',
    JSON.stringify((await call('/api/profile/me', 'a', { profile: { ...PROFILES.a, languages: ['fr', 'en'] } })).data.profile?.profile?.languages)
    === JSON.stringify((await call('/api/profile/me', 'a', { profile: { ...PROFILES.a, languages: ['en', 'fr'] } })).data.profile?.profile?.languages));
  await call('/api/profile/me', 'a', { profile: { ...PROFILES.a, languages: ['en', 'klingon', 'FR', 'en'] } });
  check('unknown codes are dropped, casing is tolerated, duplicates collapse',
    JSON.stringify(await storedLanguages('a')) === JSON.stringify(['en', 'fr']), JSON.stringify(await storedLanguages('a')));
  await call('/api/profile/me', 'a', { profile: { ...PROFILES.a, languages: LANGUAGE_IDS } });
  check('no more than five languages are kept', (await storedLanguages('a')).length === 5, String((await storedLanguages('a')).length));
  await call('/api/profile/me', 'a', { profile: { ...PROFILES.a, languages: 'english' } });
  check('a malformed languages value becomes an empty list', JSON.stringify(await storedLanguages('a')) === '[]');
  r = await call('/api/profile/me', 'a', { profile: { ...PROFILES.a, languages: [] } });
  check('languages never affect profile completeness', r.data.profile?.profileComplete === true);

  section('Language filtering');
  await cleanup();
  await seedAll();
  await call('/api/profile/me', 'b', { profile: { ...PROFILES.b, languages: ['fr'] } });
  await call('/api/profile/me', 'c', { profile: { ...PROFILES.c, languages: ['en'] } });
  // 'd' deliberately lists nothing.
  r = await call('/api/discover', 'a');
  const deckIds = () => (r.data.profiles || []).map((p) => p.id).sort();
  check('an unfiltered deck contains everyone eligible', deckIds().length >= 3, deckIds().join(','));
  check('languages are published on the deck card',
    JSON.stringify((r.data.profiles || []).find((p) => p.id === '900000002')?.languages) === JSON.stringify(['fr']));

  await call('/api/profile/me', 'a', { preferences: { minAge: 18, maxAge: 100, languages: ['fr'] } });
  r = await call('/api/discover', 'a');
  check('filtering by language excludes people who do not speak it',
    !(r.data.profiles || []).some((p) => p.id === '900000003'), deckIds().join(','));
  check('filtering by language keeps people who do speak it',
    (r.data.profiles || []).some((p) => p.id === '900000002'), deckIds().join(','));
  // A profile that predates the field must not be punished by someone else's filter.
  check('a profile with no languages listed is still shown',
    (r.data.profiles || []).some((p) => p.id === '900000004'), deckIds().join(','));
  check('the filter is echoed back so the Mini App can show it',
    JSON.stringify(r.data.preferences?.languages) === JSON.stringify(['fr']), JSON.stringify(r.data.preferences));

  // Unlike city targeting, the language filter is free: being unable to hold a conversation
  // is not a power-user concern.
  r = await call('/api/discover', 'a');
  check('the language filter applies without Premium', r.data.isPremium === false && !(r.data.profiles || []).some((p) => p.id === '900000003'),
    `premium=${r.data.isPremium} deck=${deckIds().join(',')}`);

  await call('/api/profile/me', 'a', { preferences: { minAge: 18, maxAge: 100, languages: [] } });
  r = await call('/api/discover', 'a');
  check('clearing the filter restores the full deck', (r.data.profiles || []).some((p) => p.id === '900000003'), deckIds().join(','));

  // --------------------------------------------- premium compatibility insight (PR-8)
  section('Compatibility breakdown (pure logic)');
  check('the breakdown carries exactly the documented fields',
    JSON.stringify(Object.keys(compatibilityBreakdown(PROFILES.a, PROFILES.b)).sort())
      === JSON.stringify(['closeInAge', 'sharedCity', 'sharedInterests', 'sharedLanguages'].sort()));
  check('the breakdown names only what the candidate already published',
    JSON.stringify(compatibilityBreakdown(PROFILES.a, PROFILES.b).sharedInterests) === JSON.stringify(['music', 'travel'])
    && compatibilityBreakdown(PROFILES.a, PROFILES.b).sharedCity === 'Paris'
    && compatibilityBreakdown(PROFILES.a, PROFILES.b).closeInAge === true);
  check('the breakdown infers nothing and never touches sensitive attributes',
    !('gender' in compatibilityBreakdown(PROFILES.a, PROFILES.b))
    && !('seeking' in compatibilityBreakdown(PROFILES.a, PROFILES.b)));

  section('Compatibility breakdown on the deck');
  await cleanup();
  await seedAll();
  r = await call('/api/discover', 'a');
  check('free callers receive no breakdown field',
    (r.data.profiles || []).length > 0 && (r.data.profiles || []).every((p) => !('breakdown' in p)),
    JSON.stringify((r.data.profiles || [])[0] || {}));
  await setPremium('900000001', { active: true, planId: 'monthly', expiresAt: new Date(Date.now() + 30 * 86400000) });
  r = await call('/api/discover', 'a');
  const premiumCards = (r.data.profiles || []).filter((p) => 'breakdown' in p);
  check('premium callers receive the breakdown on every card',
    premiumCards.length === (r.data.profiles || []).length && premiumCards.length > 0,
    `${premiumCards.length}/${(r.data.profiles || []).length}`);
  check('every breakdown term is already visible on the card itself',
    premiumCards.every((p) => (p.breakdown.sharedInterests || []).every((v) => (p.interests || []).includes(v))
      && (!p.breakdown.sharedCity || p.breakdown.sharedCity === p.city)
      && (p.breakdown.sharedLanguages || []).every((id) => (p.languages || []).includes(id))));
  await setPremium('900000001', null);
  r = await call('/api/discover', 'a');
  check('the breakdown disappears when membership is revoked',
    (r.data.profiles || []).every((p) => !('breakdown' in p)));

  // --------------------------------------------------- Stage 2 reciprocal pair
  section('Reciprocal pair (pure logic)');
  check('the pair model is floor-dominated and symmetric',
    pairCompatibility(85, 40) === pairCompatibility(40, 85) && pairCompatibility(70, 70) > pairCompatibility(85, 40));
  check('exploration is bounded', explorationTerm({}) === 3 && explorationTerm({ interests: ['a', 'b', 'c'] }) === 0);
  check('preference fit is soft — it never excludes', typeof preferenceFit({}, {}) === 'boolean');

  section('Reciprocal pair on the deck');
  await cleanup();
  await seedAll();
  // Bo's filters fit Ada (same city, open age); Cy's exclude her (age floor above Ada's).
  await firestore.collection('users').doc('900000002').set({ preferences: { minAge: 25, maxAge: 35, city: '', sameCityOnly: false, languages: [] } }, { merge: true });
  await firestore.collection('users').doc('900000003').set({ preferences: { minAge: 40, maxAge: 50, city: '', sameCityOnly: false, languages: [] } }, { merge: true });
  r = await call('/api/discover', 'a');
  const deck = r.data.profiles || [];
  const boIndex = deck.findIndex((p) => p.id === '900000002');
  const cyIndex = deck.findIndex((p) => p.id === '900000003');
  check('the pair model ranks the fitting candidate above the mismatching one',
    boIndex >= 0 && cyIndex >= 0 && boIndex < cyIndex, `bo=${boIndex} cy=${cyIndex}`);
  check('the displayed score stays the caller\'s own perspective',
    deck.every((p) => Number.isFinite(p.compatibility) && !('orderKey' in p) && !('reverseScore' in p)),
    JSON.stringify(deck[0] || {}).slice(0, 120));

  // --------------------------------------------------- Stage 3 adaptive (slice 1)
  section('Stage 3 freshness on the deck');
  await cleanup();
  await seedAll();
  // Two synthetic candidates with byte-identical profiles, differing only in updatedAt.
  const twin = { ...PROFILES.b, displayName: 'Twin' };
  await firestore.collection('users').doc('900000060').set({
    telegramId: 900000060, ageEligibilityConfirmed: true, profileComplete: true, discoverable: true,
    profile: { ...twin, discoverable: true, profileComplete: true }, createdAt: new Date(), updatedAt: new Date()
  });
  await firestore.collection('users').doc('900000061').set({
    telegramId: 900000061, ageEligibilityConfirmed: true, profileComplete: true, discoverable: true,
    profile: { ...twin, discoverable: true, profileComplete: true }, createdAt: new Date(), updatedAt: new Date(Date.now() - 400 * 86400000)
  });
  r = await call('/api/discover', 'a');
  const twins = (r.data.profiles || []).filter((p) => ['900000060', '900000061'].includes(p.id));
  check('identical profiles differ only by freshness: the recent one ranks first',
    twins.length === 2 && twins[0].id === '900000060', twins.map((p) => p.id).join(','));

  // --------------------------------------------------- honest zero-result discovery
  section('Empty-deck diagnostics (pure logic)');
  check('default preferences report no active filters',
    filtersActive({ minAge: 18, maxAge: 100, sameCityOnly: false, languages: [] }) === false);
  check('any deviation reports filters', filtersActive({ sameCityOnly: true }) === true);

  section('Empty-deck diagnostics on the deck');
  await cleanup();
  await seedAll();
  await call('/api/profile/me', 'a', { preferences: { minAge: 60, maxAge: 70, city: 'Atlantis', sameCityOnly: true, languages: ['yo'] } });
  r = await call('/api/discover', 'a');
  check('a filter-empty deck explains itself', (r.data.profiles || []).length === 0 && r.data.emptyReason === 'filters', JSON.stringify(r.data.emptyReason));
  check('the filters are not silently relaxed', r.data.preferences.minAge === 60 && r.data.preferences.sameCityOnly === true);
  await call('/api/profile/me', 'a', { preferences: { minAge: 18, maxAge: 100, city: '', sameCityOnly: false, languages: [] } });
  r = await call('/api/discover', 'a');
  check('an explicit reset restores the deck', (r.data.profiles || []).length > 0 && r.data.emptyReason === null,
    JSON.stringify(r.data.emptyReason));
  // A decided candidate is never recycled into an empty deck.
  await cleanup();
  await seedAll();
  await call('/api/swipe', 'a', { targetId: '900000002', action: 'pass' });
  await call('/api/swipe', 'a', { targetId: '900000003', action: 'pass' });
  await call('/api/swipe', 'a', { targetId: '900000004', action: 'pass' });
  r = await call('/api/discover', 'a');
  check('an exhausted deck reports the pool, not filters', (r.data.profiles || []).length === 0 && r.data.emptyReason === 'pool',
    JSON.stringify(r.data.emptyReason));
  check('decided candidates are not recycled',
    (r.data.profiles || []).every((p) => !['900000002', '900000003', '900000004'].includes(p.id)));

  // No supply: nothing discoverable at all.
  await cleanup();
  await seedAll();
  for (const id of ['900000002', '900000003', '900000004']) {
    await firestore.collection('users').doc(id).set({ discoverable: false }, { merge: true });
  }
  r = await call('/api/discover', 'a');
  check('an empty market reports no supply', (r.data.profiles || []).length === 0 && r.data.emptyReason === 'no_supply',
    JSON.stringify(r.data.emptyReason));

  // Hard eligibility: everyone nearby mismatches who you are / who you're looking for.
  await cleanup();
  await seedAll();
  await call('/api/profile/me', 'a', { profile: { ...PROFILES.a, seeking: 'women' } });
  r = await call('/api/discover', 'a');
  check('an eligibility-empty deck says so', (r.data.profiles || []).length === 0 && r.data.emptyReason === 'eligibility',
    JSON.stringify(r.data.emptyReason));
  check('eligibility is never silently relaxed', (r.data.profiles || []).length === 0);

  // -------------------------------------------------- restriction of processing (Art. 18)
  section('Restriction of processing (pure logic)');
  check('a restricted account receives no engagement notifications',
    isNotificationEnabled({ processingRestricted: true }, 'matches') === false
    && isNotificationEnabled({ processingRestricted: true }, 'super_likes') === false);
  check('a restricted account still receives transactional messages',
    isNotificationEnabled({ processingRestricted: true }, 'account') === true);
  check('restriction outranks the user\'s own notification choices',
    isNotificationEnabled({ processingRestricted: true, notifications: { matches: true } }, 'matches') === false);

  section('Restriction of processing');
  await cleanup();
  await seedAll();
  r = await call('/api/account', 'a', { action: 'restrict' });
  check('restriction is recorded', r.status === 200 && r.data.restricted === true && r.data.alreadyInState === false, JSON.stringify(r.data));
  r = await call('/api/account', 'a', { action: 'restrict' });
  check('restricting twice is idempotent', r.data.restricted === true && r.data.alreadyInState === true);
  r = await call('/api/profile/me', 'a');
  check('the profile endpoint reports the restriction', r.data.processingRestricted === true);
  check('the account is no longer discoverable', r.data.profile?.discoverable === false);
  check('the stored profile agrees about discoverability', r.data.profile?.profile?.discoverable === false);
  // Nothing is deleted — that is the whole distinction from erasure.
  check('the profile itself is retained', r.data.profile?.profile?.displayName === 'Ada');
  check('profile completeness is untouched', r.data.profile?.profileComplete === true);

  r = await call('/api/discover', 'a');
  check('a restricted account gets an empty deck', r.status === 200 && (r.data.profiles || []).length === 0);
  check('the empty deck explains itself', r.data.processingRestricted === true, JSON.stringify(r.data));
  check('an empty deck is not reported as an incomplete profile', r.data.needsProfile === false);

  r = await call('/api/swipe', 'a', { targetId: '900000002', action: 'like' });
  check('a restricted account cannot act', r.status === 403 && r.data.error === 'PROCESSING_RESTRICTED', JSON.stringify(r.data));

  // Anti-enumeration: a restricted target is unreachable through the same identical error as
  // every other unreachable case, so restriction is not detectable from outside.
  r = await call('/api/swipe', 'b', { targetId: '900000001', action: 'like' });
  check('a restricted account cannot be acted on', r.status === 404 && r.data.error === 'TARGET_NOT_FOUND', JSON.stringify(r.data));
  r = await call('/api/discover', 'b');
  check('a restricted account is absent from other decks',
    !(r.data.profiles || []).some((p) => p.id === '900000001'), (r.data.profiles || []).map((p) => p.id).join(','));

  // Rectification stays available while restricted, but must not be a way back into the deck.
  r = await call('/api/profile/me', 'a', { profile: { ...PROFILES.a, city: 'Lyon', discoverable: true } });
  check('the profile can still be corrected while restricted', r.data.profile?.profile?.city === 'Lyon');
  check('saving cannot republish a restricted profile', r.data.profile?.discoverable === false && r.data.profile?.profile?.discoverable === false);

  // Restriction must not become a trap that locks someone out of their own data.
  r = await call('/api/account', 'a', { action: 'export' });
  check('export still works while restricted', r.status === 200 && Boolean(r.data.data));
  check('the export records the restriction', r.data.data?.processingRestriction?.restricted === true, JSON.stringify(r.data.data?.processingRestriction));
  check('the export records when it started', typeof r.data.data?.processingRestriction?.restrictedAt === 'string');

  r = await call('/api/account', 'a', { action: 'unrestrict' });
  check('the restriction can be lifted', r.data.restricted === false && r.data.alreadyInState === false);
  r = await call('/api/account', 'a', { action: 'unrestrict' });
  check('lifting twice is idempotent', r.data.restricted === false && r.data.alreadyInState === true);
  r = await call('/api/profile/me', 'a');
  check('the account is no longer restricted', r.data.processingRestricted === false);
  // Lifting restores the account; it does not silently return anyone to the deck.
  check('lifting does not republish the profile', r.data.profile?.discoverable === false);
  r = await call('/api/swipe', 'a', { targetId: '900000002', action: 'like' });
  check('acting works again once lifted', r.status === 200, JSON.stringify(r.data));

  await call('/api/profile/me', 'a', { profile: PROFILES.a });
  r = await call('/api/profile/me', 'a');
  check('the user can put themselves back in Discover deliberately', r.data.profile?.discoverable === true);

  section('Restriction and existing matches');
  await cleanup();
  await seedAll();
  await call('/api/swipe', 'a', { targetId: '900000002', action: 'like' });
  await call('/api/swipe', 'b', { targetId: '900000001', action: 'like' });
  await call('/api/account', 'a', { action: 'restrict' });
  r = await call('/api/matches', 'a');
  check('a restricted account still sees its own matches', (r.data.matches || []).length === 1, JSON.stringify((r.data.matches || []).length));
  r = await call('/api/matches', 'b');
  check('the counterpart is not stripped of the match', (r.data.matches || []).length === 1);
  // The match already exists; restriction stops new processing, not access to what is stored.
  r = await call('/api/account', 'a', { action: 'unrestrict' });
  check('the restriction lifts cleanly with matches in place', r.data.restricted === false);

  // ------------------------------------------------------------ objection (Art. 21)
  section('Objection to processing (pure logic)');
  check('processingPaused covers both legal states',
    processingPaused({ processingRestricted: true }) === true
    && processingPaused({ processingObjection: true }) === true);
  check('processingPaused is false for an ordinary account',
    processingPaused({}) === false
    && processingPaused({ discoverable: false }) === false);
  check('an objecting account receives no engagement notifications',
    isNotificationEnabled({ processingObjection: true }, 'matches') === false
    && isNotificationEnabled({ processingObjection: true }, 'super_likes') === false);
  check('an objecting account still receives transactional messages',
    isNotificationEnabled({ processingObjection: true }, 'account') === true);

  section('Objection to processing');
  await cleanup();
  await seedAll();
  r = await call('/api/account', 'a', { action: 'object' });
  check('objection is recorded', r.status === 200 && r.data.objected === true && r.data.alreadyInState === false, JSON.stringify(r.data));
  r = await call('/api/account', 'a', { action: 'object' });
  check('objecting twice is idempotent', r.data.objected === true && r.data.alreadyInState === true);
  r = await call('/api/profile/me', 'a');
  check('the profile endpoint reports the objection', r.data.processingObjection === true);
  check('objection and restriction stay distinct in the response', r.data.processingRestricted === false);
  check('the account is no longer discoverable', r.data.profile?.discoverable === false);
  check('the stored profile agrees about discoverability', r.data.profile?.profile?.discoverable === false);
  // Nothing is deleted — that is the whole distinction from erasure.
  check('the profile itself is retained', r.data.profile?.profile?.displayName === 'Ada');

  r = await call('/api/discover', 'a');
  check('an objecting account gets an empty deck', r.status === 200 && (r.data.profiles || []).length === 0);
  check('the empty deck names the objection', r.data.processingObjection === true, JSON.stringify(r.data));
  check('an empty deck is not reported as an incomplete profile', r.data.needsProfile === false);

  r = await call('/api/swipe', 'a', { targetId: '900000002', action: 'like' });
  check('an objecting account cannot act', r.status === 403 && r.data.error === 'PROCESSING_RESTRICTED', JSON.stringify(r.data));

  // Anti-enumeration: an objecting target is unreachable through the same identical error as
  // every other unreachable case, so the objection is not detectable from outside.
  r = await call('/api/swipe', 'b', { targetId: '900000001', action: 'like' });
  check('an objecting account cannot be acted on', r.status === 404 && r.data.error === 'TARGET_NOT_FOUND', JSON.stringify(r.data));
  r = await call('/api/discover', 'b');
  check('an objecting account is absent from other decks',
    !(r.data.profiles || []).some((p) => p.id === '900000001'), (r.data.profiles || []).map((p) => p.id).join(','));

  // Rectification stays available while objecting, but must not be a way back into the deck.
  r = await call('/api/profile/me', 'a', { profile: { ...PROFILES.a, bio: 'corrected while objecting', discoverable: true } });
  check('the profile can still be corrected while objecting', r.data.profile?.profile?.bio === 'corrected while objecting');
  check('saving cannot republish an objecting profile', r.data.profile?.discoverable === false && r.data.profile?.profile?.discoverable === false);

  // An objection must not be a trap that locks someone out of their own data.
  r = await call('/api/account', 'a', { action: 'export' });
  check('export still works while objecting', r.status === 200 && Boolean(r.data.data));
  check('the export records the objection', r.data.data?.processingObjection?.objected === true, JSON.stringify(r.data.data?.processingObjection));
  check('the export records when it started', typeof r.data.data?.processingObjection?.objectedAt === 'string');

  r = await call('/api/account', 'a', { action: 'unobject' });
  check('the objection can be withdrawn', r.data.objected === false && r.data.alreadyInState === false);
  r = await call('/api/account', 'a', { action: 'unobject' });
  check('withdrawing twice is idempotent', r.data.objected === false && r.data.alreadyInState === true);
  r = await call('/api/profile/me', 'a');
  check('the account is no longer objecting', r.data.processingObjection === false);
  // Withdrawing restores the account; it does not silently return anyone to the deck.
  check('withdrawing does not republish the profile', r.data.profile?.discoverable === false);
  r = await call('/api/swipe', 'a', { targetId: '900000002', action: 'like' });
  check('acting works again once withdrawn', r.status === 200, JSON.stringify(r.data));

  await call('/api/profile/me', 'a', { profile: PROFILES.a });
  r = await call('/api/profile/me', 'a');
  check('the user can put themselves back in Discover deliberately', r.data.profile?.discoverable === true);

  // Both legal states can be in force at once; lifting one must not lift the other.
  section('Restriction and objection combined');
  await call('/api/account', 'a', { action: 'restrict' });
  await call('/api/account', 'a', { action: 'object' });
  r = await call('/api/account', 'a', { action: 'unrestrict' });
  check('lifting the restriction leaves the objection in force', r.data.restricted === false);
  r = await call('/api/profile/me', 'a');
  check('the account remains paused by the objection', r.data.processingObjection === true);
  r = await call('/api/swipe', 'a', { targetId: '900000002', action: 'like' });
  check('the account still cannot act', r.status === 403 && r.data.error === 'PROCESSING_RESTRICTED', JSON.stringify(r.data));
  r = await call('/api/account', 'a', { action: 'unobject' });
  check('lifting both restores the account', r.data.objected === false);
  r = await call('/api/swipe', 'a', { targetId: '900000002', action: 'like' });
  check('acting works again once both are lifted', r.status === 200, JSON.stringify(r.data));

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

  // ------------------------------------------------------------------ support flow (CN-7)
  section('Support flow (pure logic)');
  check('a support reference is dense and prefixed', formatSupportReference(42) === 'BZ-0042');
  check('request normalization keeps only a valid category and a bounded description',
    normalizeSupportRequest({ category: 'premium', details: 'ok' }).category === 'premium'
    && normalizeSupportRequest({ category: 'x', details: 'ok' }).category === null);

  section('Support flow: Mini App API');
  await cleanup();
  await seedAll();
  r = await call('/api/support', 'a', { action: 'create', category: 'premium', details: 'My Premium is gone.' });
  check('a Mini App request is created with a reference', r.status === 200 && /^BZ-\d{4}$/.test(r.data.reference || ''), JSON.stringify(r.data));
  const firstReference = r.data.reference;
  r = await call('/api/support', 'a', { action: 'create', category: 'profile', details: 'Second request.' });
  check('references are unique and increase', r.data.reference !== firstReference, `${firstReference} vs ${r.data.reference}`);
  r = await call('/api/support', 'a', { action: 'create', category: 'invented', details: 'nope' });
  check('an invalid category is rejected', r.status === 400 && r.data.error === 'INVALID_ACTION');
  r = await call('/api/support', 'a', { action: 'create', category: 'premium', details: '' });
  check('an empty description is rejected', r.status === 400 && r.data.error === 'INVALID_ACTION');
  r = await call('/api/support', 'a', { action: 'list' });
  check('the caller sees exactly their own requests, newest first',
    r.status === 200 && (r.data.requests || []).length === 2
    && (r.data.requests || []).every((q) => q.reference && q.status === 'open' && q.category),
    JSON.stringify(r.data));
  r = await call('/api/support', 'b', { action: 'list' });
  check('another user sees none of them', (r.data.requests || []).length === 0, JSON.stringify(r.data.requests));

  section('Support flow: bot intake');
  const supportWebhook = (update) => webhook(update);
  await resetCalls();
  await supportWebhook({ message: { chat: { id: 900000001 }, from: { language_code: 'en' }, text: '/support' } });
  let supportNotes = (await sent()).filter((c) => c.method === 'sendMessage');
  check('/support answers with the category menu',
    supportNotes.length === 1 && /Help & support/.test(supportNotes[0].body.text || ''),
    supportNotes[0]?.body?.text?.slice(0, 80));
  const menuMarkup = JSON.stringify(supportNotes[0].body.reply_markup || {});
  check('the menu offers the documented categories',
    ['premium', 'profile', 'likes_matches', 'discovery', 'privacy_account', 'problem', 'contact'].every((id) => menuMarkup.includes(`support:${id}`)),
    menuMarkup.slice(0, 200));

  // Premium troubleshooting answers from the caller's own document only.
  await resetCalls();
  await supportWebhook({ callback_query: { id: 'cb1', data: 'support:premium', from: { language_code: 'en' }, message: { chat: { id: 900000001 } } } });
  supportNotes = (await sent()).filter((c) => c.method === 'sendMessage');
  check('premium troubleshooting detects no active membership',
    /No active Bezy Premium/i.test(supportNotes[0]?.body?.text || ''), supportNotes[0]?.body?.text?.slice(0, 120));
  check('troubleshooting offers the intake path', JSON.stringify(supportNotes[0]?.body?.reply_markup || {}).includes('support:new:premium'));

  // Intake: tap "still need help", then send a plain message — it becomes the request.
  await resetCalls();
  await supportWebhook({ callback_query: { id: 'cb2', data: 'support:new:premium', from: { language_code: 'en' }, message: { chat: { id: 900000001 } } } });
  check('intake asks for a description', /Describe your problem/i.test(((await sent()).filter((c) => c.method === 'sendMessage')[0]?.body?.text || '')));
  const pendingDoc = await firestore.collection('users').doc('900000001').get();
  check('the pending category is stored on the caller\'s own document', pendingDoc.data()?.pendingSupportRequest?.category === 'premium');
  await resetCalls();
  await supportWebhook({ message: { chat: { id: 900000001 }, from: { language_code: 'en' }, text: 'Stars are missing from my balance.' } });
  supportNotes = (await sent()).filter((c) => c.method === 'sendMessage');
  check('the plain message becomes a support request',
    supportNotes.length === 1 && /Reference: BZ-\d{4}/.test(supportNotes[0].body.text || ''), supportNotes[0]?.body?.text?.slice(0, 160));
  check('the confirmation states the fallback email', /contacts@digitalconcordia\.com/.test(supportNotes[0]?.body?.text || ''));
  const afterIntake = await firestore.collection('users').doc('900000001').get();
  check('the pending state is cleared', !afterIntake.data()?.pendingSupportRequest);
  r = await call('/api/support', 'a', { action: 'list' });
  check('the bot-created request appears in the caller\'s history',
    (r.data.requests || []).some((q) => q.category === 'premium' && /Stars are missing/.test(q.details)), JSON.stringify(r.data.requests));

  // A plain message without a pending intake creates nothing.
  await resetCalls();
  await supportWebhook({ message: { chat: { id: 900000001 }, from: { language_code: 'en' }, text: 'hello there' } });
  check('an unprompted plain message creates no request',
    (await sent()).filter((c) => c.method === 'sendMessage').length === 0);
  const totalAfterNoise = (await firestore.collection('supportRequests').where('telegramUserId', '==', '900000001').get()).size;
  check('the request count is unchanged', totalAfterNoise === 3, String(totalAfterNoise));

  // Support spam protection: the bucket is shared with the Mini App channel.
  await firestore.collection('rateLimits').doc('900000001').delete().catch(() => {});
  await firestore.collection('rateLimits').doc('900000001').set({ support_create_86400: { w: Date.now(), c: 10 } });
  r = await call('/api/support', 'a', { action: 'create', category: 'problem', details: 'too many' });
  check('support creation is rate limited', r.status === 429 && r.data.error === 'RATE_LIMITED', JSON.stringify(r.data));

  // Support requests are personal data: the export includes them and erasure removes them.
  r = await call('/api/account', 'a', { action: 'export' });
  check('the export includes the caller\'s support requests',
    Array.isArray(r.data.export?.supportRequests) && (r.data.export?.supportRequests || []).length === 3,
    JSON.stringify((r.data.export?.supportRequests || []).length));
  await call('/api/account', 'a', { action: 'delete', confirm: 'DELETE' });
  check('erasure removes the caller\'s support requests',
    (await firestore.collection('supportRequests').where('telegramUserId', '==', '900000001').get()).size === 0);
} finally {
  await cleanup();
  await harness.close();
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (failures.length) console.log('Failed:\n - ' + failures.join('\n - '));
process.exit(fail ? 1 : 0);
