// Support (CN-7): the Telegram-bot-first support flow.
//
// The bot is the primary support channel; contacts@digitalconcordia.com stays the fallback
// for formal legal/privacy matters. Nothing here is a ticketing platform: requests are one
// PostgreSQL collection with a four-state lifecycle, created from validated Telegram update
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
export async function createSupportRequest(storage, { telegramUserId, category, details, languageCode = null }) {
  const userId = String(telegramUserId);
  const { tx, advisoryLock } = await import('./_db.js');
  // Normalization lives here, the single choke point: both channels (Mini App endpoint and
  // bot intake) get the same category allow-list and the same 1000-character ceiling, so
  // neither can store a longer description or an invalid category.
  const normalized = normalizeSupportRequest({ category, details });
  if (!normalized.category) throw new Error('INVALID_CATEGORY');
  details = normalized.details;

  // The reference counter is row-locked inside the transaction, so references are dense,
  // unique and unguessable without the counter — and concurrent requests serialize instead
  // of colliding. A caller can never influence the id.
  const reference = await tx(async (q) => {
    await advisoryLock(q, `support:${userId}`);
    const retry = await q(`SELECT reference FROM support_requests WHERE telegram_user_id=$1 AND category=$2
      AND details=$3 AND created_at >= now() - interval '1 minute' ORDER BY created_at DESC LIMIT 1`, [userId,category,details]);
    if (retry.rows.length) return retry.rows[0].reference;
    const counter = await q(`INSERT INTO support_meta(id,n) VALUES ('refs',1)
      ON CONFLICT(id) DO UPDATE SET n=support_meta.n+1 RETURNING n`);
    const next = Number(counter.rows[0].n);
    const ref = formatSupportReference(next);
    await q(
      `INSERT INTO support_requests (reference, telegram_user_id, category, details, status, language_code, created_at)
       VALUES ($1, $2, $3, $4, 'open', $5, now())`,
      [ref, userId, category, details, languageCode || null]
    );
    return ref;
  });

  console.log(`[bezy-support] request_created ${JSON.stringify({ reference, telegramUserId: userId, category })}`);
  return reference;
}

/** The caller's own requests, newest first. Never anyone else's. */
export async function listSupportRequests(storage, telegramUserId, limit = 20) {
  const { query } = await import('./_db.js');
  const result = await query(
    `SELECT reference, category, status, details, created_at
     FROM support_requests
     WHERE telegram_user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [String(telegramUserId), Math.min(Number(limit) || 20, 50)]
  );
  return result.rows.map((r) => ({
    reference: String(r.reference),
    category: SUPPORT_CATEGORIES.includes(r.category) ? r.category : 'problem',
    status: SUPPORT_STATUSES.includes(r.status) ? r.status : 'open',
    details: String(r.details || '').slice(0, SUPPORT_DETAILS_MAX),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : null
  }));
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
  // `seeking` is NOT required: the server defaults it to `everyone` and never blocks a
  // profile for lacking it, so the diagnostic must not name it as missing.
  // The 18+ declaration IS required — the same profile is not live without it. Completeness
  // is derived from the missing list, so the diagnostic never disagrees with itself over a
  // stale stored flag.
  if (userData?.ageEligibilityConfirmed !== true) missing.push('ageDeclaration');
  return { complete: missing.length === 0, missing };
}

export function diagnoseMatches(matchCount = 0) {
  return { matchCount: Math.max(0, Number(matchCount) || 0) };
}
