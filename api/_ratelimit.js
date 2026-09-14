// Server-side abuse protection (Neon PostgreSQL).
//
// Bezy already enforces *product* quotas (30 discovery actions and 1 super like per day on
// the free tier). Those exist to make Premium meaningful. This module is a different thing:
// it limits how fast an authenticated caller may act, so a script holding valid Telegram
// initData cannot mass-like, scrape the deck, spam reports or flood invoice creation inside
// the 24-hour window during which that initData stays valid.
//
// Storage is one row per user (`rate_limits(user_id, buckets)`), where `buckets` is a JSONB
// map of fixed-window counters — the same dynamic `bucket_window` keys PostgreSQL used. The
// row is deleted along with the account via an explicit delete in api/account.js.

import { query, tx, ApiError } from './_db.js';

/**
 * Limits are deliberately far above real human use. The intent is to stop automation, not to
 * interrupt someone who is swiping quickly. Several buckets carry both a burst window and a
 * longer window: the first stops a flood, the second stops slow sustained abuse.
 */
export const RATE_LIMITS = {
  // A fast human swipes perhaps 20-30 profiles a minute; a script does thousands.
  swipe: [{ limit: 40, windowSeconds: 60 }, { limit: 600, windowSeconds: 3600 }],
  // Each deck load is one call. Reloading every few seconds for an hour is not human.
  discover: [{ limit: 60, windowSeconds: 300 }, { limit: 400, windowSeconds: 3600 }],
  profile_write: [{ limit: 20, windowSeconds: 600 }],
  // Report spam is a harassment vector in its own right.
  report: [{ limit: 5, windowSeconds: 3600 }, { limit: 15, windowSeconds: 86400 }],
  block: [{ limit: 40, windowSeconds: 3600 }],
  likes_view: [{ limit: 60, windowSeconds: 3600 }],
  // Invoice creation writes a database row each time.
  premium_invoice: [{ limit: 10, windowSeconds: 3600 }],
  premium_status: [{ limit: 120, windowSeconds: 3600 }],
  // The export runs several queries, so it is the most expensive call in the product.
  account_export: [{ limit: 3, windowSeconds: 3600 }],
  account_delete: [{ limit: 5, windowSeconds: 3600 }],
  // Restriction is a data-subject right, so the ceiling is loose enough that exercising it —
  // including changing one's mind a few times — is never obstructed.
  account_restrict: [{ limit: 20, windowSeconds: 3600 }],
  // Objection (Art. 21) is the same class of data-subject right as restriction.
  account_objection: [{ limit: 20, windowSeconds: 3600 }],
  // Support requests share one bucket across the bot and the Mini App, so neither channel
  // can flood the queue. Genuine support needs are nowhere near this ceiling.
  support_create: [{ limit: 3, windowSeconds: 3600 }, { limit: 10, windowSeconds: 86400 }],
  // Bezy conversations. A fast human typist sends a few messages a minute; these ceilings
  // stop a scripted flood without ever interrupting a real conversation.
  messages: [{ limit: 30, windowSeconds: 60 }, { limit: 400, windowSeconds: 3600 }],
  // Message reads come from the Mini App's polling loop (~4s while a conversation is open).
  // The client now marks read only when there is something unread, but a conversation left
  // open all day still polls: the hourly ceiling must be above the poll loop's consumption.
  messages_read: [{ limit: 30, windowSeconds: 30 }, { limit: 3600, windowSeconds: 3600 }],
  // The post-match conversation game. Writes are a round start or one of five answers, so a
  // whole round is six calls; the ceiling stops a script, never two people playing. The game
  // deliberately does NOT share the messaging buckets: polling a round must never consume
  // someone's ability to send a message.
  game: [{ limit: 20, windowSeconds: 60 }, { limit: 200, windowSeconds: 3600 }],
  game_read: [{ limit: 30, windowSeconds: 30 }, { limit: 3600, windowSeconds: 3600 }]
};

export class RateLimitError extends Error {
  constructor(retryAfterSeconds) {
    super('RATE_LIMITED');
    this.rateLimited = true;
    // Rounded up to whole seconds and never accompanied by the limit or the current count:
    // the caller learns when to come back, not how close to the threshold they were.
    this.retryAfter = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}

function windowsFor(bucket) {
  const windows = RATE_LIMITS[bucket];
  if (!windows) throw new Error(`Unknown rate limit bucket: ${bucket}`);
  return windows;
}

/**
 * Records one use of `bucket` for `userId` and throws RateLimitError when a window is full.
 *
 * Read-modify-write inside a transaction with a row lock, so concurrent requests cannot
 * race the counter. This is abuse mitigation, not an authorization boundary — entitlement,
 * quotas and the age gate are all enforced separately and exactly.
 *
 * Fails open. If the row cannot be read or written the request proceeds, because the
 * endpoints all need the database anyway and a rate limiter must not become a new outage
 * mode.
 */
export async function enforceRateLimit(storage, userId, bucket, now = Date.now()) {
  const windows = windowsFor(bucket);
  try {
    await tx(async (q) => {
      const lock = await q('SELECT buckets FROM rate_limits WHERE user_id = $1 FOR UPDATE', [userId]);
      const current = lock.rows[0]?.buckets || {};

      const next = { ...current };
      for (const { limit, windowSeconds } of windows) {
        const key = `${bucket}_${windowSeconds}`;
        const entry = current[key] || {};
        const windowMs = windowSeconds * 1000;
        const startedAt = Number(entry.w) || 0;
        const expired = now - startedAt >= windowMs;
        const count = expired ? 0 : Number(entry.c) || 0;

        if (count >= limit) {
          throw new RateLimitError((startedAt + windowMs - now) / 1000);
        }
        // Counter windows store epoch millis: no driver-specific date types in JSONB.
        next[key] = { w: expired ? now : startedAt, c: count + 1 };
      }

      await q(
        'INSERT INTO rate_limits (user_id, buckets) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET buckets = EXCLUDED.buckets',
        [userId, JSON.stringify(next)]
      );
    });
    return { allowed: true };
  } catch (error) {
    if (error.rateLimited) throw error;
    // Fail open: a limiter outage must never become an application outage.
    console.warn(`[bezy-ratelimit] counter failed for ${bucket}, allowing request:`, error.message);
    return { allowed: true, degraded: true };
  }
}

/**
 * Wraps enforceRateLimit for a handler: returns true when the caller may proceed, and sends
 * an identical 429 for every bucket when they may not. The response never names the bucket
 * or the limit, so probing cannot map out the rate-limit configuration.
 */
export async function rateLimit(storage, res, userId, bucket) {
  try {
    await enforceRateLimit(storage, userId, bucket);
    return true;
  } catch (error) {
    if (!error.rateLimited) throw error;
    // Trip logging (T4): the operator's tuning evidence. Bucket, id and wait only — no
    // request content, no profile data, nothing that analytics would collect.
    console.log(`[bezy-ratelimit] limit_reached ${JSON.stringify({ userId: String(userId), bucket, retryAfter: error.retryAfter })}`);
    res.setHeader('Retry-After', String(error.retryAfter));
    res.status(429).json({ error: 'RATE_LIMITED', retryAfter: error.retryAfter });
    return false;
  }
}
