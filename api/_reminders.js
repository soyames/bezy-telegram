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
    },
    pt: {
      text: 'O teu perfil Bezy está quase pronto 💜 Uma visita rápida chega para o terminares.',
      button: 'Terminar o meu perfil'
    },
    ru: {
      text: 'Твой профиль Bezy почти готов 💜 Один быстрый заход — и он готов.',
      button: 'Завершить мой профиль'
    },
    pl: {
      text: 'Twój profil Bezy jest prawie gotowy 💜 Wystarczy szybka wizyta, aby go ukończyć.',
      button: 'Dokończ mój profil'
    },
    ar: {
      text: 'ملفك في Bezy شبه مكتمل 💜 زيارة سريعة تكفي لإكماله.',
      button: 'أكمل ملفي'
    },
    tr: {
      text: 'Bezy profilin neredeyse hazır 💜 Bitirmek için kısa bir ziyaret yeterli.',
      button: 'Profilimi tamamla'
    },
    sw: {
      text: 'Wasifu wako wa Bezy uko karibu kukamilika 💜 Ziara fupi inatosha kuukamilisha.',
      button: 'Kamilisha wasifu wangu'
    },
    yo: {
      text: 'Àkọọ́lẹ̀ Bezy rẹ ti fẹ́rẹ̀ẹ́ pé 💜 Ìbẹ̀wò kúkúrú kan ló tó láti parí rẹ̀.',
      button: 'Parí àkọọ́lẹ̀ mi'
    },
    hi: {
      text: 'आपकी Bezy प्रोफ़ाइल लगभग तैयार है 💜 इसे पूरा करने के लिए एक छोटी सी यात्रा काफ़ी है।',
      button: 'मेरी प्रोफ़ाइल पूरी करें'
    },
    id: {
      text: 'Profil Bezy-mu hampir siap 💜 Kunjungan singkat cukup untuk menyelesaikannya.',
      button: 'Selesaikan profilku'
    },
    zh: {
      text: '你的 Bezy 资料快完成了 💜 快速访问一次就能完成。',
      button: '完成我的资料'
    },
    ja: {
      text: 'Bezy プロフィールはほぼ完成です 💜 短い訪問で仕上げられます。',
      button: 'プロフィールを仕上げる'
    },
    ko: {
      text: 'Bezy 프로필이 거의 완성되었습니다 💜 잠깐 방문하면 끝낼 수 있어요.',
      button: '내 프로필 완성하기'
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
export async function planProfileReminders(storage, { limit = 200, protectedIds = [] } = {}) {
  const guard = new Set(protectedIds.map(String));
  const plan = { users: [], skipped: 0 };
  const { query } = await import('./_db.js');
  // Oldest first — those are the accounts most at risk of leaving forever. The WHERE
  // clause is indexed by the partial users_discoverable-style shape; sorting is in SQL.
  const result = await query(
    `SELECT u.telegram_id, u.created_at, u.profile_complete, u.processing_restricted, u.processing_objection,
            u.language_code, u.locale,
            ns.profile_reminders AS reminders_enabled
     FROM users u
     LEFT JOIN notification_settings ns ON ns.telegram_id = u.telegram_id
     WHERE u.age_eligibility_confirmed = TRUE
     ORDER BY u.created_at ASC`
  );
  for (const row of result.rows) {
    if (plan.users.length >= limit) { plan.skipped++; continue; }
    if (guard.has(String(row.telegram_id))) continue;
    if (row.profile_complete === true) continue;
    if (row.processing_restricted === true || row.processing_objection === true) continue;
    plan.users.push({
      id: String(row.telegram_id),
      data: {
        telegramId: String(row.telegram_id),
        languageCode: row.language_code,
        locale: row.locale,
        createdAt: row.created_at,
        notifications: { profile_reminders: row.reminders_enabled !== false }
      }
    });
  }

  return plan;
}

/**
 * Sends the plan through `deliverNotification`, so preference, legal pause and the seven-day
 * cap are all applied in one place. Never throws per user: one failed delivery must not stop
 * the rest of the run, and a notification must never become an error for an operator task.
 */
export async function sendProfileReminders(storage, plan) {
  const summary = { sent: 0, disabled: 0, capped: 0, failed: 0, noRecipient: 0 };
  for (const user of plan.users) {
    // The user's explicit Bezy choice wins over their Telegram language.
    const message = reminderMessage(user.data?.locale || user.data?.languageCode);
    const result = await deliverNotification(storage, user.data, REMINDER_CATEGORY, {
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
