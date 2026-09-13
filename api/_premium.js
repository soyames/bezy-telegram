// Bezy Premium: the single authoritative source for plans, pricing, membership state
// and quotas. Every endpoint that grants or denies a Premium capability must go through
// this module so entitlement can never drift between routes.
//
// Bezy Premium is NOT Telegram Premium. `users/{id}.isPremiumTelegram` describes the
// user's Telegram subscription and must never grant a Bezy entitlement.

const DEFAULT_PLANS = {
  monthly: { durationMonths: 1, stars: 250 },
  quarterly: { durationMonths: 3, stars: 600 },
  yearly: { durationMonths: 12, stars: 1900 }
};

function starsFor(planId, fallback) {
  const override = Number(process.env[`BEZY_PREMIUM_STARS_${planId.toUpperCase()}`]);
  return Number.isInteger(override) && override > 0 ? override : fallback;
}

// Prices are resolved on the server at call time. The Mini App only ever displays what
// the backend returns; it can never influence what a user is actually charged.
export function premiumPlans() {
  return Object.fromEntries(
    Object.entries(DEFAULT_PLANS).map(([id, plan]) => [
      id,
      { id, durationMonths: plan.durationMonths, stars: starsFor(id, plan.stars), currency: 'XTR' }
    ])
  );
}

export function premiumPlan(planId) {
  return premiumPlans()[String(planId || '')] || null;
}

export const PREMIUM_BENEFITS = ['who_liked_you', 'advanced_discovery', 'more_super_likes', 'increased_visibility', 'unlimited_discovery', 'messaging'];

// Daily, server-enforced allowances. Free limits exist to make Premium meaningful;
// the Premium ceiling exists only as an anti-abuse guard, not as a product limit.
export const LIMITS = {
  free: { discoveryActions: 30, superLikes: 1 },
  premium: { discoveryActions: 500, superLikes: 5 }
};

export function limitsFor(isPremium) {
  return isPremium ? LIMITS.premium : LIMITS.free;
}

export function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

// A membership is active only while it has not expired AND has not been revoked.
//
// Expiration and refund are different states: expiry is time running out, a refund is the
// purchase being undone. A refund revokes entitlement immediately, even when `expiresAt`
// is still in the future, so `revokedAt` is checked independently of the clock.
export function premiumState(userData = {}, now = new Date()) {
  const membership = userData?.bezyPremium || {};
  const expiresAtMs = toMillis(membership.expiresAt);
  const revoked = Boolean(membership.revokedAt);
  const active = membership.active === true && !revoked && expiresAtMs > now.getTime();
  return {
    active,
    planId: active ? membership.planId || null : null,
    expiresAt: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
    daysRemaining: active ? Math.ceil((expiresAtMs - now.getTime()) / 86400000) : 0,
    revoked,
    revocationReason: revoked ? membership.revocationReason || null : null
  };
}

export function isPremiumActive(userData, now = new Date()) {
  return premiumState(userData, now).active;
}

// Calendar-month arithmetic, clamped so 31 Jan + 1 month lands on the last day of
// February rather than overflowing into March.
export function addMonths(date, months) {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCMonth(result.getUTCMonth() + months);
  if (result.getUTCDate() < day) result.setUTCDate(0);
  return result;
}

// Renewal must never destroy time the user already paid for: an entitled membership is
// extended from its current expiry, anything else restarts from now.
//
// This keys off effective entitlement rather than the raw `expiresAt`, so a refunded
// membership that still carries a future expiry cannot be stacked on by a new purchase —
// that would silently hand back the time that was just refunded.
export function nextExpiry(userData, plan, now = new Date()) {
  const entitled = premiumState(userData, now).active;
  const base = entitled ? new Date(toMillis(userData.bezyPremium.expiresAt)) : now;
  return addMonths(base, plan.durationMonths);
}

export const REFUND_STATUS = { NONE: 'none', PENDING: 'pending', REFUNDED: 'refunded', FAILED: 'failed' };

/**
 * Records a Telegram Stars refund and revokes the user's Bezy Premium entitlement.
 *
 * This is the single revocation path. It is called both by the webhook when Telegram
 * pushes `refunded_payment`, and by the admin refund script after `refundStarPayment`
 * returns — so a refund initiated anywhere (Bezy, Telegram support, the owner's own
 * script) converges on identical state.
 *
 * Everything happens in one transaction keyed on the payment document, so concurrent or
 * repeated refunds cannot revoke twice, double-notify, or corrupt the record. Historical
 * purchase data (plan, amount, purchase date, charge id, original expiry) is preserved;
 * only entitlement is withdrawn.
 *
 * `storage` is injected so this module stays free of the Admin SDK singleton and can be
 * driven from a local script as easily as from a serverless function.
 *
 * @returns {Promise<{outcome: 'refunded'|'already_refunded'|'unknown_payment', ...}>}
 */
export async function applyRefund(storage, chargeId, { source = 'telegram_webhook', now = new Date() } = {}) {
  const id = String(chargeId || '');
  if (!id) return { outcome: 'unknown_payment', chargeId: id };

  const { tx, advisoryLock } = await import('./_db.js');
  return tx(async (q) => {
    await advisoryLock(q, `charge:${id}`);
    const paymentRows = await q('SELECT * FROM bezy_payments WHERE telegram_payment_charge_id = $1 FOR UPDATE', [id]);
    // A refund for a charge Bezy never recorded is not something we can act on. It is
    // reported rather than silently written, so it shows up in the logs.
    const payment = paymentRows.rows[0] || null;
    if (!payment) return { outcome: 'unknown_payment', chargeId: id };

    const telegramUserId = String(payment.telegram_user_id || '');
    await advisoryLock(q, `premium:${telegramUserId}`);

    if (payment.refund_status === REFUND_STATUS.REFUNDED) {
      return { outcome: 'already_refunded', chargeId: id, telegramUserId, planId: payment.plan_id || null };
    }

    const membershipRows = telegramUserId
      ? await q('SELECT * FROM premium_memberships WHERE telegram_id = $1 FOR UPDATE', [telegramUserId])
      : { rows: [] };
    const membership = membershipRows.rows[0] || null;
    const before = premiumState(
      membership ? {
        bezyPremium: {
          active: membership.active === true,
          planId: membership.plan_id,
          expiresAt: membership.expires_at ? new Date(membership.expires_at) : null,
          revokedAt: membership.revoked_at ? new Date(membership.revoked_at) : null,
          revocationReason: membership.revocation_reason
        }
      } : {},
      now
    );

    await q(
      `UPDATE bezy_payments SET refund_status = $1, refunded_at = $2, refund_source = $3, status = 'refunded'
       WHERE telegram_payment_charge_id = $4`,
      [REFUND_STATUS.REFUNDED, now, source, id]
    );

    // The membership keeps its full history and simply stops granting access. Setting
    // active=false plus revoked_at is what premiumState() reads, so every Premium-gated
    // endpoint sees the user as Free on its very next call.
    const revoked = before.active;
    if (telegramUserId && revoked) {
      await q(
        `INSERT INTO premium_memberships (telegram_id, active, plan_id, expires_at, purchased_at, updated_at, source,
                                          telegram_payment_charge_id, revoked_at, revocation_reason)
         SELECT telegram_id, FALSE, plan_id, expires_at, purchased_at, $1, source, telegram_payment_charge_id, $1, 'refund'
         FROM premium_memberships WHERE telegram_id = $2
         ON CONFLICT (telegram_id) DO UPDATE SET active = FALSE, revoked_at = EXCLUDED.revoked_at,
           revocation_reason = EXCLUDED.revocation_reason, updated_at = EXCLUDED.updated_at`,
        [now, telegramUserId]
      );
      await q('UPDATE premium_memberships SET refunded_charge_id=$1 WHERE telegram_id=$2', [id, telegramUserId]);
    }

    return {
      outcome: 'refunded',
      chargeId: id,
      telegramUserId,
      planId: payment.plan_id || null,
      stars: payment.stars != null ? String(payment.stars) : null,
      revoked,
      previousState: before.active ? 'active' : 'inactive',
      newState: 'inactive'
    };
  });
}

const PAYLOAD_PREFIX = 'bezy_premium';
const PAYLOAD_VERSION = 'v1';

export function buildInvoicePayload(planId, telegramUserId, nonce) {
  return `${PAYLOAD_PREFIX}:${PAYLOAD_VERSION}:${planId}:${telegramUserId}:${nonce}`;
}

// Payloads are generated server-side and echoed back by Telegram. Parsing is strict:
// anything that does not match the exact shape is rejected rather than coerced.
export function parseInvoicePayload(payload) {
  const parts = String(payload || '').split(':');
  if (parts.length !== 5) return null;
  const [prefix, version, planId, userId, nonce] = parts;
  if (prefix !== PAYLOAD_PREFIX || version !== PAYLOAD_VERSION) return null;
  if (!premiumPlan(planId) || !/^\d+$/.test(userId) || !/^[A-Za-z0-9_-]{8,}$/.test(nonce)) return null;
  return { planId, telegramUserId: userId, nonce };
}

export function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

// Daily counters reset lazily on first use of a new UTC day, so no scheduled job is needed.
export function currentUsage(userData = {}, now = new Date()) {
  const usage = userData?.usage || {};
  if (usage.day !== utcDay(now)) return { day: utcDay(now), discoveryActions: 0, superLikes: 0 };
  return {
    day: usage.day,
    discoveryActions: Number(usage.discoveryActions) || 0,
    superLikes: Number(usage.superLikes) || 0
  };
}

/**
 * Decides whether a swipe may proceed and returns the usage counters to persist.
 * Returns { allowed, reason, usage, limits }.
 */
export function checkSwipeQuota(userData, action, isPremium, now = new Date()) {
  const limits = limitsFor(isPremium);
  const usage = currentUsage(userData, now);

  if (usage.discoveryActions >= limits.discoveryActions) {
    return { allowed: false, reason: 'DISCOVERY_LIMIT_REACHED', usage, limits };
  }
  if (action === 'super' && usage.superLikes >= limits.superLikes) {
    return { allowed: false, reason: 'SUPER_LIKE_LIMIT_REACHED', usage, limits };
  }

  return {
    allowed: true,
    reason: null,
    limits,
    usage: {
      day: usage.day,
      discoveryActions: usage.discoveryActions + 1,
      superLikes: usage.superLikes + (action === 'super' ? 1 : 0)
    }
  };
}
