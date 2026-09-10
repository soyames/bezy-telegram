// Server-side abuse protection.
//
// Bezy already enforces *product* quotas (30 discovery actions and 1 super like per day on
// the free tier). Those exist to make Premium meaningful. This module is a different thing:
// it limits how fast an authenticated caller may act, so a script holding valid Telegram
// initData cannot mass-like, scrape the deck, spam reports or flood invoice creation inside
// the 24-hour window during which that initData stays valid.
//
// Storage is one Firestore document per user (`rateLimits/{telegramUserId}`) holding a fixed
// window counter per bucket. No external service, no Redis, nothing new in the architecture.
// The document is personal data — it records activity timing — so it is deleted along with
// the account (see api/account.js).

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
  // Invoice creation writes a Firestore document each time.
  premium_invoice: [{ limit: 10, windowSeconds: 3600 }],
  premium_status: [{ limit: 120, windowSeconds: 3600 }],
  // The export runs six collection queries, so it is the most expensive call in the product.
  account_export: [{ limit: 3, windowSeconds: 3600 }],
  account_delete: [{ limit: 5, windowSeconds: 3600 }],
  // Restriction is a data-subject right, so the ceiling is loose enough that exercising it —
  // including changing one's mind a few times — is never obstructed.
  account_restrict: [{ limit: 20, windowSeconds: 3600 }],
  // Support requests share one bucket across the bot and the Mini App, so neither channel
  // can flood the queue. Genuine support needs are nowhere near this ceiling.
  support_create: [{ limit: 3, windowSeconds: 3600 }, { limit: 10, windowSeconds: 86400 }]
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
 * Read-then-write rather than a transaction: under heavy concurrency a small number of extra
 * requests may slip through, which is an acceptable trade for avoiding a transaction on every
 * API call. This is abuse mitigation, not an authorization boundary — entitlement, quotas and
 * the age gate are all enforced separately and exactly.
 *
 * Fails open. If the counter cannot be read or written the request proceeds, because the
 * endpoints all need Firestore anyway and a rate limiter must not become a new outage mode.
 */
export async function enforceRateLimit(firestore, userId, bucket, now = Date.now()) {
  const windows = windowsFor(bucket);
  const ref = firestore.collection('rateLimits').doc(String(userId));

  let current = {};
  try {
    const snap = await ref.get();
    current = snap.exists ? snap.data() || {} : {};
  } catch (error) {
    console.warn(`[bezy-ratelimit] read failed for ${bucket}, allowing request:`, error.message);
    return { allowed: true, degraded: true };
  }

  const next = {};
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
    next[key] = { w: expired ? now : startedAt, c: count + 1 };
  }

  try {
    await ref.set(next, { merge: true });
  } catch (error) {
    console.warn(`[bezy-ratelimit] write failed for ${bucket}:`, error.message);
  }
  return { allowed: true };
}

/**
 * Wraps enforceRateLimit for a handler: returns true when the caller may proceed, and sends
 * an identical 429 for every bucket when they may not. The response never names the bucket
 * or the limit, so probing cannot map out the rate-limit configuration.
 */
export async function rateLimit(firestore, res, userId, bucket) {
  try {
    await enforceRateLimit(firestore, userId, bucket);
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
