// Profile-completion reminders (N-2).
//
// A user who declared 18+ but never finished their profile gets one gentle nudge, subject to
// the notification policy in `_notify.js`:
//
//   - `profile_reminders` is an optional category, so the user can switch it off like any
//     engagement notification.
//   - The category is capped at one message per seven days (`windowMs`), and the cap lives in
//     the same `rateLimits` counters as everything else, so it creates no new retention
//     obligation.
//   - `deliverNotification` also refuses paused accounts (restriction or objection), so a
//     legal state outranks the reminder without this module having to remember it.
//
// Nothing here runs automatically. `scripts/profile-reminders.mjs` drives it, dry-run by
// default, like the retention policy.

import { normalizedLanguage, localized, miniAppUrl } from './_telegram.js';
import { deliverNotification } from './_notify.js';
import { processingPaused } from './_privacy.js';

export const REMINDER_CATEGORY = 'profile_reminders';

/**
 * Bot message text, localized the same way every other bot message is (see
 * `api/swipe.js`): callers pass the resolved language (explicit Bezy choice first,
 * Telegram language second).
 */
export function reminderMessage(languageCode) {
  const language = normalizedLanguage(languageCode);
  return localized(language, {
    en: {
      text: 'Your Bezy profile is nearly ready 💜 A quick visit is all it takes to finish it.',
      button: 'Finish my profile'
    },
    fr: {
      text: 'Votre profil Bezy est presque prêt 💜 Une petite visite suffit pour le terminer.',
      button: 'Terminer mon profil'
    },
    de: {
      text: 'Dein Bezy-Profil ist fast fertig 💜 Ein kurzer Besuch genügt, um es abzuschließen.',
      button: 'Profil fertigstellen'
    },
    es: {
      text: 'Tu perfil de Bezy está casi listo 💜 Con una visita rápida lo terminas.',
      button: 'Terminar mi perfil'
    },
    it: {
      text: 'Il tuo profilo Bezy è quasi pronto 💜 Basta una visita veloce per completarlo.',
      button: 'Completa il profilo'
    }
  });
}

/**
 * Decides who would be reminded. Pure: it reads and classifies, never sends, so dry-run and
 * apply run on identical logic.
 *
 * Eligible: declared 18+ (they showed intent), profile still incomplete, account not paused by
 * a legal state, not shielded by `protectedIds`. Oldest first — those are the accounts most
 * at risk of leaving forever. Accounts that never confirmed 18+ are not contacted at all:
 * they never engaged with the dating product, and a nudge to one of them would be noise.
 *
 * `limit` bounds the blast radius of one run; the operator raises it deliberately.
 */
export async function planProfileReminders(firestore, { limit = 200, protectedIds = [] } = {}) {
  const guard = new Set(protectedIds.map(String));
  const plan = { users: [], skipped: 0 };
  // No orderBy in the query: where + orderBy on different fields would need a composite
  // index. The eligible set is tiny next to the full collection scan, so sorting happens
  // here instead.
  const candidates = await firestore.collection('users')
    .where('ageEligibilityConfirmed', '==', true)
    .get();

  const docs = candidates.docs.slice().sort((a, b) => {
    const millis = (d) => d.data()?.createdAt?.toMillis?.() ?? new Date(d.data()?.createdAt || 0).getTime();
    return millis(a) - millis(b);
  });
  for (const doc of docs) {
    if (plan.users.length >= limit) { plan.skipped++; continue; }
    if (guard.has(doc.id)) continue;
    const data = doc.data() || {};
    if (data.profileComplete === true) continue;
    if (processingPaused(data)) continue;
    plan.users.push({ id: doc.id, data });
  }

  return plan;
}

/**
 * Sends the plan through `deliverNotification`, so preference, legal pause and the seven-day
 * cap are all applied in one place. Never throws per user: one failed delivery must not stop
 * the rest of the run, and a notification must never become an error for an operator task.
 */
export async function sendProfileReminders(firestore, plan) {
  const summary = { sent: 0, disabled: 0, capped: 0, failed: 0, noRecipient: 0 };
  for (const user of plan.users) {
    // The user's explicit Bezy choice wins over their Telegram language.
    const message = reminderMessage(user.data?.locale || user.data?.languageCode);
    const result = await deliverNotification(firestore, user.data, REMINDER_CATEGORY, {
      text: message.text,
      reply_markup: { inline_keyboard: [[{ text: message.button, web_app: { url: miniAppUrl('profile') } }]] }
    });
    if (result.sent) summary.sent++;
    else if (result.reason === 'DISABLED') summary.disabled++;
    else if (result.reason === 'CAPPED') summary.capped++;
    else if (result.reason === 'NO_RECIPIENT') summary.noRecipient++;
    else summary.failed++;
    console.log(`[bezy-notify] profile_reminder ${JSON.stringify({ telegramUserId: user.id, ...result })}`);
  }
  return summary;
}
