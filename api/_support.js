// Support (CN-7): the Telegram-bot-first support flow.
//
// The bot is the primary support channel; contacts@digitalconcordia.com stays the fallback
// for formal legal/privacy matters. Nothing here is a ticketing platform: requests are one
// Firestore collection with a four-state lifecycle, created from validated Telegram update
// context (the webhook) or from the Mini App behind `requireTelegramUser`, and read back by
// their owner only. The operator works the queue through scripts/list-support.mjs, exactly
// like moderation reports.
//
// Data minimisation: a request holds the category, the user's own description, their
// Telegram id (identity, never client-supplied), a status and timestamps — nothing else.
// Requests are erased with the account, exported with it, and governed by the existing
// retention mechanism (period deliberately unset — see _retention.js).

import { premiumState, isPremiumActive, limitsFor, currentUsage } from './_premium.js';

// Machine tokens. Labels live in the locale catalogues under `support_cat_<id>` and
// `support_status_<id>`; the ids themselves are never translated.
export const SUPPORT_CATEGORIES = ['premium', 'profile', 'likes_matches', 'discovery', 'privacy_account', 'problem', 'contact'];
export const SUPPORT_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
export const SUPPORT_DETAILS_MAX = 1000;

export function formatSupportReference(number) {
  return `BZ-${String(number).padStart(4, '0')}`;
}

export function normalizeSupportRequest(input = {}) {
  const category = SUPPORT_CATEGORIES.includes(input?.category) ? input.category : null;
  const details = String(input?.details ?? '').trim().slice(0, SUPPORT_DETAILS_MAX);
  return { category, details };
}

/**
 * Creates a support request and returns its reference. Runs in one transaction keyed on a
 * counter document, so references are dense, unique and unguessable without the counter —
 * and a caller can never influence the id. Used by both the webhook (update context) and the
 * Mini App endpoint (validated initData); the telegram id always comes from the caller's
 * authenticated context, never from the payload.
 */
export async function createSupportRequest(firestore, { telegramUserId, category, details, languageCode = null }) {
  const userId = String(telegramUserId);
  const counterRef = firestore.collection('supportMeta').doc('refs');
  const now = new Date();

  const reference = await firestore.runTransaction(async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const next = (counterSnap.data()?.n || 0) + 1;
    tx.set(counterRef, { n: next });
    const ref = formatSupportReference(next);
    tx.set(firestore.collection('supportRequests').doc(ref), {
      reference: ref,
      telegramUserId: userId,
      category,
      details,
      status: 'open',
      languageCode: languageCode || null,
      createdAt: now
    });
    return ref;
  });

  console.log(`[bezy-support] request_created ${JSON.stringify({ reference, telegramUserId: userId, category })}`);
  return reference;
}

/** The caller's own requests, newest first. Never anyone else's. */
export async function listSupportRequests(firestore, telegramUserId, limit = 20) {
  // Deliberately no orderBy in the query: where + orderBy on different fields would need a
  // composite index (observed live as a 500 on 2026-09-10), and a user's own requests are a
  // handful — creation is rate-limited to 3/hour. Sort in memory instead.
  const snap = await firestore.collection('supportRequests')
    .where('telegramUserId', '==', String(telegramUserId))
    .get();
  const requests = snap.docs.map((doc) => {
    const d = doc.data() || {};
    const ms = d.createdAt?.toMillis?.() ?? new Date(d.createdAt || 0).getTime();
    return {
      reference: d.reference || doc.id,
      category: SUPPORT_CATEGORIES.includes(d.category) ? d.category : 'problem',
      status: SUPPORT_STATUSES.includes(d.status) ? d.status : 'open',
      details: String(d.details || '').slice(0, SUPPORT_DETAILS_MAX),
      createdAt: Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null,
      createdAtMs: ms
    };
  });
  requests.sort((a, b) => b.createdAtMs - a.createdAtMs);
  return requests.slice(0, Math.min(Number(limit) || 20, 50)).map(({ createdAtMs, ...rest }) => rest);
}

/**
 * Deterministic troubleshooting, pure: it answers only from the caller's own document, so it
 * can never reveal anything about another user. Each returns machine facts; the bot and the
 * Mini App render them into the user's language.
 */
export function diagnosePremium(userData = {}) {
  const state = premiumState(userData);
  return {
    active: state.active,
    planId: state.planId,
    expiresAt: state.expiresAt,
    daysRemaining: state.daysRemaining,
    revoked: state.revoked
  };
}

export function diagnoseDiscovery(userData = {}) {
  const limits = limitsFor(isPremiumActive(userData));
  const usage = currentUsage(userData);
  const preferences = userData?.preferences || {};
  return {
    profileComplete: userData?.profileComplete === true,
    ageEligibilityConfirmed: userData?.ageEligibilityConfirmed === true,
    discoverable: userData?.discoverable === true,
    processingRestricted: userData?.processingRestricted === true,
    processingObjection: userData?.processingObjection === true,
    discoveryRemaining: Math.max(0, limits.discoveryActions - usage.discoveryActions),
    filtersActive: Boolean(preferences.sameCityOnly || String(preferences.city || '').trim() || (Array.isArray(preferences.languages) && preferences.languages.length))
  };
}

export function diagnoseProfile(userData = {}) {
  const profile = userData?.profile || {};
  const missing = [];
  if (!String(profile.displayName || '').trim()) missing.push('displayName');
  if (!(Number.isInteger(profile.age) && profile.age >= 18 && profile.age <= 100)) missing.push('age');
  if (!String(profile.city || '').trim()) missing.push('city');
  if (!String(profile.gender || '').trim()) missing.push('gender');
  if (!String(profile.seeking || '').trim()) missing.push('seeking');
  return { complete: userData?.profileComplete === true, missing };
}

export function diagnoseMatches(matchCount = 0) {
  return { matchCount: Math.max(0, Number(matchCount) || 0) };
}
