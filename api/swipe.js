import { db } from './_firebase.js';
import { telegramApi, miniAppUrl, requirePost, requireTelegramUser, telegramUserLink, normalizedLanguage } from './_telegram.js';
import { isPremiumActive, checkSwipeQuota } from './_premium.js';

const ACTIONS = new Set(['like', 'super', 'pass']);

function matchId(a, b) {
  return [String(a), String(b)].sort().join('_');
}

// Per the Telegram-Native Communication Principle, the notification hands the conversation
// back to Telegram. It must not offer a "call" button: the Bot API cannot start a call on a
// user's behalf, so calling is described as something the users do with Telegram's own
// controls once they are in the chat.
function matchMessage(language, name) {
  return language === 'fr'
    ? `💜 Match avec ${name} ! Vous vous êtes tous les deux appréciés.\n\nVotre conversation se poursuit sur Telegram — messages, appels vocaux et vidéo inclus.`
    : `💜 You matched with ${name}! You both liked each other.\n\nYour conversation continues on Telegram — messages, voice and video calls included.`;
}

async function notifyMatch(user, other, language) {
  const otherName = other.profile?.displayName || other.firstName || (language === 'fr' ? 'votre match' : 'your match');
  const openChatText = language === 'fr' ? '💬 Ouvrir la conversation' : '💬 Open Telegram chat';
  const openBezyText = language === 'fr' ? '💜 Ouvrir Bezy' : '💜 Open Bezy';
  const buttons = [[{ text: openChatText, url: telegramUserLink(other) }], [{ text: openBezyText, web_app: { url: miniAppUrl('matches') } }]];
  await telegramApi('sendMessage', {
    chat_id: user.telegramId,
    text: matchMessage(language, otherName),
    reply_markup: { inline_keyboard: buttons }
  });
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const user = requireTelegramUser(req, res);
  if (!user) return;

  const targetId = String(req.body?.targetId || '');
  const action = String(req.body?.action || '');
  if (!targetId || targetId === String(user.id) || !ACTIONS.has(action)) {
    return res.status(400).json({ error: 'INVALID_ACTION' });
  }

  const firestore = db();
  const userRef = firestore.collection('users').doc(String(user.id));
  const targetRef = firestore.collection('users').doc(targetId);
  const actionRef = userRef.collection('actions').doc(targetId);
  const reciprocalRef = targetRef.collection('actions').doc(String(user.id));
  const matchRef = firestore.collection('matches').doc(matchId(user.id, targetId));

  const likeReceivedRef = targetRef.collection('likesReceived').doc(String(user.id));

  try {
    const result = await firestore.runTransaction(async (tx) => {
      // All reads must precede all writes inside a Firestore transaction.
      const currentSnap = await tx.get(userRef);
      const targetSnap = await tx.get(targetRef);
      const reciprocalSnap = await tx.get(reciprocalRef);
      const existingMatch = await tx.get(matchRef);
      const blockedEitherWay = await tx.get(userRef.collection('blocks').doc(targetId));
      const blockedByTarget = await tx.get(userRef.collection('blockedBy').doc(targetId));
      const currentData = currentSnap.exists ? currentSnap.data() : {};
      // Liking, super-liking and matching are all 18+ actions. The declaration is checked
      // here as well as in the profile endpoint so a direct API call cannot bypass the gate.
      // It is evaluated before anything about the target is considered, so an ineligible
      // caller learns nothing — not even whether a given profile exists.
      if (currentData.ageEligibilityConfirmed !== true) throw new Error('AGE_CONFIRMATION_REQUIRED');

      // Anti-enumeration: "no account", "not discoverable" and "blocked in either
      // direction" all return the identical error. Otherwise anyone holding valid initData
      // could probe arbitrary Telegram ids and learn who has a Bezy dating account — which
      // for a dating service is exactly the kind of disclosure that must not be possible.
      const targetData = targetSnap.exists ? targetSnap.data() : null;
      const reachable = Boolean(targetData)
        && targetData.profileComplete === true
        && !blockedEitherWay.exists
        && !blockedByTarget.exists;
      if (!reachable) throw new Error('TARGET_NOT_FOUND');

      const isPremium = isPremiumActive(currentData);

      // Daily allowances are enforced here, inside the transaction, so the counter cannot
      // be bypassed by a client that ignores the UI or races concurrent requests.
      const alreadyActioned = (await tx.get(actionRef)).exists;
      if (!alreadyActioned) {
        const quota = checkSwipeQuota(currentData, action, isPremium);
        if (!quota.allowed) {
          const error = new Error(quota.reason);
          error.quota = { reason: quota.reason, limits: quota.limits, isPremium };
          throw error;
        }
        tx.set(userRef, { usage: quota.usage }, { merge: true });
      }

      tx.set(actionRef, { action, createdAt: new Date() }, { merge: true });

      const reciprocal = reciprocalSnap.exists ? reciprocalSnap.data()?.action : '';
      const isLike = action === 'like' || action === 'super';
      const isReciprocalLike = reciprocal === 'like' || reciprocal === 'super';
      const matched = isLike && isReciprocalLike;

      // Reverse index of the same action, so a user can be shown who liked them without
      // scanning every other user's actions. This is an index, not a second like system.
      if (isLike) tx.set(likeReceivedRef, { fromId: String(user.id), action, createdAt: new Date() }, { merge: true });
      else tx.delete(likeReceivedRef);

      if (matched && !existingMatch.exists) {
        tx.set(matchRef, {
          participants: [String(user.id), targetId].sort(),
          createdAt: new Date(),
          source: 'mutual_like',
          active: true
        });
      }

      return {
        matched,
        created: matched && !existingMatch.exists,
        target: targetSnap.data() || {}
      };
    });

    if (result.created) {
      const currentSnap = await userRef.get();
      const current = currentSnap.data() || { telegramId: user.id };
      const language = normalizedLanguage(user.language_code);
      const targetLanguage = normalizedLanguage(result.target.languageCode);
      await Promise.allSettled([
        notifyMatch(current, result.target, language),
        notifyMatch(result.target, current, targetLanguage)
      ]);
    }

    return res.status(200).json({ ok: true, action, matched: result.matched });
  } catch (error) {
    console.error('Swipe failed:', error);
    // Only the expected, user-meaningful case is surfaced; internal database errors
    // must not leak their text to the Mini App.
    if (error.message === 'TARGET_NOT_FOUND') return res.status(404).json({ error: error.message });
    if (error.message === 'AGE_CONFIRMATION_REQUIRED') return res.status(403).json({ error: error.message });
    if (error.quota) return res.status(403).json({ error: error.quota.reason, limits: error.quota.limits, isPremium: error.quota.isPremium });
    return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
  }
}
