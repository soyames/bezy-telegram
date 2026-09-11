// Telegram notification policy.
//
// Telegram is Bezy's only notification channel — there is no email or SMS infrastructure, by
// decision. That makes the bot chat a shared, finite space: every message Bezy sends competes
// with the user's real conversations, so what gets sent is governed here rather than decided
// separately at each call site.
//
// Two rules:
//   1. Engagement notifications are the user's choice and can be switched off.
//   2. Transactional notifications are not. A payment receipt, a refund or an account event is
//      a record of something that happened to the user's money or account, and suppressing it
//      because of a UI toggle would leave them with no record at all.
//
// Category ids are machine tokens. They are stored, compared and used as locale-key suffixes
// (`notify_<id>`); they are never translated.

import { telegramApi } from './_telegram.js';
import { processingPaused } from './_privacy.js';

const DAY_MS = 86400000;

/**
 * `optional` is what the user may turn off. `dailyCap` is the flood ceiling within `windowMs`
 * (default one day): 0 means uncapped, which is correct for events that cannot be generated at
 * will by other people.
 *
 * Matches are uncapped because a match requires the recipient's own prior like — nobody else
 * can cause one unilaterally. Super Likes can be sent by anyone, so they are capped: without a
 * ceiling, a group could turn the bot chat into a firehose aimed at one person. Profile
 * reminders are capped at one per seven days — a daily nudge about an unfinished profile would
 * be spam, and the reminder only ever matters while the profile stays incomplete.
 */
export const NOTIFICATION_CATEGORIES = {
  matches: { optional: true, dailyCap: 0 },
  super_likes: { optional: true, dailyCap: 5 },
  profile_reminders: { optional: true, dailyCap: 1, windowMs: 7 * DAY_MS },
  // Bezy conversation messages. Capped: a matched counterpart can generate these at will,
  // so without a ceiling one person could turn the other's bot chat into a firehose. The
  // notification is generic — never the message content — and opening Bezy is the call to
  // action (Telegram owns notifications; Bezy owns the conversation).
  messages: { optional: true, dailyCap: 10 },
  account: { optional: false, dailyCap: 0 }
};

export const OPTIONAL_CATEGORIES = Object.keys(NOTIFICATION_CATEGORIES)
  .filter((id) => NOTIFICATION_CATEGORIES[id].optional);

// Opt-out, not opt-in: a dating app that silently never tells you about your matches is
// broken. The user can switch either category off at any time.
export function defaultNotificationSettings() {
  return Object.fromEntries(OPTIONAL_CATEGORIES.map((id) => [id, true]));
}

/**
 * Accepts a settings object from a request body. Unknown keys are dropped rather than stored,
 * and only an explicit `false` disables a category, so a malformed or partial payload can
 * never silently mute someone.
 */
export function normalizeNotificationSettings(input = {}) {
  const settings = defaultNotificationSettings();
  if (!input || typeof input !== 'object') return settings;
  for (const id of OPTIONAL_CATEGORIES) {
    if (id in input) settings[id] = input[id] !== false;
  }
  return settings;
}

// Reads the stored settings off a user document, tolerating accounts written before this
// existed: an absent `notifications` map means "everything on", which is the default.
export function notificationSettings(userData = {}) {
  return normalizeNotificationSettings(userData?.notifications || {});
}

export function isNotificationEnabled(userData, category) {
  const definition = NOTIFICATION_CATEGORIES[category];
  if (!definition) return false;
  // A paused account (GDPR Art. 18 restriction or Art. 21 objection) outranks the user's own
  // toggles: while one is in force Bezy stores the account but does not act on it, and sending
  // an engagement message would be exactly such an act. Transactional messages are unaffected —
  // a payment or account event still has to reach the person it happened to.
  if (processingPaused(userData) && definition.optional) return false;
  if (!definition.optional) return true;
  return notificationSettings(userData)[category] !== false;
}

/**
 * Fixed-window counter (24 hours by default, per-category `windowMs` override), stored
 * alongside the rate-limit counters in `rateLimits/{telegramUserId}` under a `notify_` prefix.
 * Reusing that document is deliberate: it is already deleted with the account (see
 * api/account.js), so capping introduces no new personal-data surface and no new retention
 * obligation.
 *
 * Fails open, like the rate limiter. This only ever runs after a Firestore transaction has
 * already succeeded, so a read failure here is a transient blip that can cost a handful of
 * extra messages — not a path to an unbounded flood.
 */
export async function withinDailyCap(firestore, userId, category, now = Date.now()) {
  const definition = NOTIFICATION_CATEGORIES[category] || {};
  const cap = definition.dailyCap || 0;
  if (!cap) return true;

  const window = definition.windowMs || DAY_MS;
  const ref = firestore.collection('rateLimits').doc(String(userId));
  const key = `notify_${category}`;
  let entry = {};
  try {
    const snap = await ref.get();
    entry = (snap.exists ? snap.data() || {} : {})[key] || {};
  } catch (error) {
    console.warn(`[bezy-notify] cap read failed for ${category}, allowing:`, error.message);
    return true;
  }

  const startedAt = Number(entry.w) || 0;
  const expired = now - startedAt >= window;
  const count = expired ? 0 : Number(entry.c) || 0;
  if (count >= cap) return false;

  try {
    await ref.set({ [key]: { w: expired ? now : startedAt, c: count + 1 } }, { merge: true });
  } catch (error) {
    console.warn(`[bezy-notify] cap write failed for ${category}:`, error.message);
  }
  return true;
}

/**
 * Sends one notification, subject to the recipient's preference and the category's cap.
 *
 * Never throws: a notification is the last step after the state change it describes has
 * already been committed, so a Telegram failure must not turn a successful action into an
 * error for the user who performed it.
 */
export async function deliverNotification(firestore, recipient, category, message) {
  const chatId = recipient?.telegramId;
  if (!chatId) return { sent: false, reason: 'NO_RECIPIENT' };
  if (!isNotificationEnabled(recipient, category)) return { sent: false, reason: 'DISABLED' };
  if (!(await withinDailyCap(firestore, chatId, category))) return { sent: false, reason: 'CAPPED' };
  try {
    await telegramApi('sendMessage', { chat_id: chatId, ...message });
    return { sent: true };
  } catch (error) {
    console.warn(`[bezy-notify] ${category} delivery failed:`, error.message);
    return { sent: false, reason: 'DELIVERY_FAILED' };
  }
}
