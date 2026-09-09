import { db } from './_firebase.js';
import { telegramApi, miniAppUrl, requirePost, requireTelegramUser, telegramUserLink, normalizedLanguage } from './_telegram.js';

const ACTIONS = new Set(['like', 'super', 'pass']);

function matchId(a, b) {
  return [String(a), String(b)].sort().join('_');
}

function matchMessage(language, name) {
  return language === 'fr'
    ? `💜 Match avec ${name} ! Vous vous êtes tous les deux appréciés.`
    : `💜 You matched with ${name}! You both liked each other.`;
}

async function notifyMatch(user, other, language) {
  const otherName = other.profile?.displayName || other.firstName || 'your match';
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
    return res.status(400).json({ error: 'Invalid action' });
  }

  const firestore = db();
  const userRef = firestore.collection('users').doc(String(user.id));
  const targetRef = firestore.collection('users').doc(targetId);
  const actionRef = userRef.collection('actions').doc(targetId);
  const reciprocalRef = targetRef.collection('actions').doc(String(user.id));
  const matchRef = firestore.collection('matches').doc(matchId(user.id, targetId));

  const result = await firestore.runTransaction(async (tx) => {
    const [targetSnap, reciprocalSnap, existingMatch] = await Promise.all([
      tx.get(targetRef),
      tx.get(reciprocalRef),
      tx.get(matchRef)
    ]);
    if (!targetSnap.exists) throw new Error('Target profile not found');

    tx.set(actionRef, { action, createdAt: new Date() }, { merge: true });

    const reciprocal = reciprocalSnap.exists ? reciprocalSnap.data()?.action : '';
    const isLike = action === 'like' || action === 'super';
    const isReciprocalLike = reciprocal === 'like' || reciprocal === 'super';
    const matched = isLike && isReciprocalLike;

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
}
