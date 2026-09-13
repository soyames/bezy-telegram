import { db } from './_firebase.js';
import { miniAppUrl, requirePost, requireTelegramUser, normalizedLanguage, localized } from './_telegram.js';
import { isPremiumActive, checkSwipeQuota } from './_premium.js';
import { rateLimit } from './_ratelimit.js';
import { deliverNotification } from './_notify.js';
import { processingPaused } from './_privacy.js';

const ACTIONS = new Set(['like', 'super', 'pass']);

function matchId(a, b) {
  return [String(a), String(b)].sort().join('_');
}

// The match notification points at the Bezy conversation (ADR 0009): Bezy owns messaging
// between matched users, and the button opens the Mini App where the conversation lives.
const YOUR_MATCH = { en: 'your match', fr: 'votre match', de: 'dein Match', es: 'tu match', it: 'il tuo match', pt: 'o teu match', ru: 'твой мэтч', pl: 'twoje dopasowanie', ar: 'مطابقتك', tr: 'eşleşmen', sw: 'mechi yako', yo: 'mátìsì rẹ', hi: 'आपका मैच', id: 'kecocokanmu', zh: '你的配对', ja: 'あなたのマッチ', ko: '내 매치' };
const START_CHATTING = { en: '💬 Start chatting', fr: '💬 Commencer la conversation', de: '💬 Unterhaltung starten', es: '💬 Empezar a chatear', it: '💬 Inizia a chattare', pt: '💬 Começar a conversar', ru: '💬 Начать общение', pl: '💬 Zacznij rozmawiać', ar: '💬 ابدأ المحادثة', tr: '💬 Sohbete başla', sw: '💬 Anza kuongea', yo: '💬 Bẹ̀rẹ̀ ìbánisọ̀rọ̀', hi: '💬 बातचीत शुरू करें', id: '💬 Mulai mengobrol', zh: '💬 开始聊天', ja: '💬 チャットを始める', ko: '💬 대화 시작하기' };
const OPEN_BEZY_BTN = { en: '💜 Open Bezy', fr: '💜 Ouvrir Bezy', de: '💜 Bezy öffnen', es: '💜 Abrir Bezy', it: '💜 Apri Bezy', pt: '💜 Abrir o Bezy', ru: '💜 Открыть Bezy', pl: '💜 Otwórz Bezy', ar: '💜 افتح Bezy', tr: '💜 Bezy\'yi aç', sw: '💜 Fungua Bezy', yo: '💜 Ṣí Bezy', hi: '💜 Bezy खोलें', id: '💜 Buka Bezy', zh: '💜 打开 Bezy', ja: '💜 Bezy を開く', ko: '💜 Bezy 열기' };

function matchMessage(language, name) {
  return localized(language, {
    en: `💜 You matched with ${name}! You both liked each other.\n\nYour conversation is waiting for you inside Bezy.`,
    fr: `💜 Match avec ${name} ! Vous vous êtes tous les deux appréciés.\n\nVotre conversation vous attend dans Bezy.`,
    de: `💜 Match mit ${name}! Ihr habt euch gegenseitig geliked.\n\nEure Unterhaltung wartet in Bezy auf euch.`,
    es: `💜 ¡Match con ${name}! Se han gustado mutuamente.\n\nSu conversación los espera dentro de Bezy.`,
    it: `💜 Match con ${name}! Vi siete piaciuti a vicenda.\n\nLa vostra conversazione vi aspetta su Bezy.`,
    pt: `💜 Match com ${name}! Gostaram um do outro.\n\nA vossa conversa espera por vocês dentro da Bezy.`,
    ru: `💜 Мэтч с ${name}! Вы понравились друг другу.\n\nВаш разговор ждёт вас внутри Bezy.`,
    pl: `💜 Dopasowanie z ${name}! Polubiliście się nawzajem.\n\nWasza rozmowa czeka w Bezy.`,
    ar: `💜 مطابقة مع ${name}! أعجبتما ببعضكما.\n\nمحادثتكما بانتظاركما داخل Bezy.`,
    tr: `💜 ${name} ile eşleştin! Birbirinizi beğendiniz.\n\nSohbetiniz sizi Bezy içinde bekliyor.`,
    sw: `💜 Mmepatana na ${name}! Mmependana.\n\nMazungumzo yenu yanawasubiri ndani ya Bezy.`,
    yo: `💜 Mátìsì pẹ̀lú ${name}! Ẹ fẹ́ràn ara yín.\n\nÌbánisọ̀rọ̀ yín ń dúró de ẹ nínú Bezy.`,
    hi: `💜 आपका ${name} के साथ मैच हुआ! आपने एक-दूसरे को पसंद किया।\n\nआपकी बातचीत Bezy में आपका इंतज़ार कर रही है।`,
    id: `💜 Kamu cocok dengan ${name}! Kalian saling menyukai.\n\nPercakapan kalian menunggu di dalam Bezy.`,
    zh: `💜 你和 ${name} 配对成功！你们互相喜欢。\n\n你们的对话在 Bezy 里等着你们。`,
    ja: `💜 ${name} さんとマッチしました！お互いをいいねしました。\n\n会話は Bezy の中で待っています。`,
    ko: `💜 ${name} 님과 매치되었습니다! 서로 좋아했습니다.\n\n대화가 Bezy 안에서 기다리고 있습니다.`
  });
}

export async function notifyMatch(firestore, user, other, language) {
  const otherName = other.profile?.displayName || other.firstName || localized(language, YOUR_MATCH);
  const openChatText = localized(language, START_CHATTING);
  const buttons = [[{ text: openChatText, web_app: { url: miniAppUrl('messages') } }]];
  return deliverNotification(firestore, user, 'matches', {
    text: matchMessage(language, otherName),
    reply_markup: { inline_keyboard: buttons }
  });
}

/**
 * Super Like notification.
 *
 * Deliberately anonymous. Naming the sender would hand out, for free and unprompted, exactly
 * what /api/likes charges Premium members to see — and, more importantly, it would disclose
 * someone's interest before the recipient has expressed any of their own. The message says
 * that it happened and points back to the deck, where the recipient decides for themselves.
 *
 * It carries no name, no photo, no @username and no id, and it is sent only when the super
 * like did not already produce a match: a match notification says more and supersedes it.
 */
function superLikeMessage(language) {
  return localized(language, {
    en: '⭐ Someone super liked you on Bezy.\n\nKeep discovering — if you like them back, it\'s a match.',
    fr: '⭐ Quelqu’un vous a envoyé un Super Like sur Bezy.\n\nContinuez à découvrir — si vous l’aimez en retour, c’est un match.',
    de: '⭐ Jemand hat dir auf Bezy einen Super Like geschickt.\n\nEntdecke weiter — wenn du zurücklikst, ist es ein Match.',
    es: '⭐ Alguien te ha enviado un Super Like en Bezy.\n\nSigue descubriendo: si le devuelves el like, es un match.',
    it: '⭐ Qualcuno ti ha inviato un Super Like su Bezy.\n\nContinua a scoprire: se ricambi il like, è un match.',
    pt: '⭐ Alguém te enviou um Super Like na Bezy.\n\nContinua a descobrir — se gostares de volta, é um match.',
    ru: '⭐ Кто-то отправил тебе Супер Лайк в Bezy.\n\nПродолжай знакомиться — если ответишь взаимностью, будет мэтч.',
    pl: '⭐ Ktoś wysłał ci Super Polubienie w Bezy.\n\nOdkrywaj dalej — jeśli odwzajemnisz, będzie dopasowanie.',
    ar: '⭐ أرسل لك شخص إعجاب سوبر في Bezy.\n\nواصل الاكتشاف — إذا أعجبت به أيضًا، ستكون مطابقة.',
    tr: '⭐ Biri sana Bezy\'de Süper Beğeni gönderdi.\n\nKeşfetmeye devam et — sen de beğenirsen bu bir eşleşme olur.',
    sw: '⭐ Mtu amekutumia Super Like kwenye Bezy.\n\nEndelea kugundua — ukimpenda naye, ni mechi.',
    yo: '⭐ Ẹnìkan fi Súpà Like ránṣẹ́ sí ẹ lórí Bezy.\n\nMáa ṣàwárí lọ — tí o bá fẹ́ràn rẹ̀ pa dà, mátìsì ni.',
    hi: '⭐ किसी ने आपको Bezy पर सुपर लाइक भेजा है।\n\nखोजते रहें — अगर आप भी उन्हें पसंद करें, तो यह मैच है।',
    id: '⭐ Seseorang mengirim Super Like padamu di Bezy.\n\nTerus jelajahi — jika kamu menyukainya balik, itu kecocokan.',
    zh: '⭐ 有人在 Bezy 上给你发了超级喜欢。\n\n继续发现——如果你也喜欢对方，就是配对。',
    ja: '⭐ 誰かが Bezy でスーパーいいねを送りました。\n\n発見を続けましょう——相手をいいねし返せばマッチです。',
    ko: '⭐ 누군가 Bezy에서 슈퍼 좋아요를 보냈습니다.\n\n계속 발견하세요 — 서로 좋아하면 매치가 됩니다.'
  });
}

async function notifySuperLike(firestore, recipient) {
  // The recipient's explicit Bezy choice wins over their Telegram language, so a user who
  // picked French never receives an English Super Like notification.
  const language = normalizedLanguage(recipient.locale || recipient.languageCode);
  const openBezyText = localized(language, OPEN_BEZY_BTN);
  return deliverNotification(firestore, recipient, 'super_likes', {
    text: superLikeMessage(language),
    reply_markup: { inline_keyboard: [[{ text: openBezyText, web_app: { url: miniAppUrl('discover') } }]] }
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

  if (!(await rateLimit(firestore, res, user.id, 'swipe'))) return;

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
      // A paused account (Art. 18 restriction or Art. 21 objection) can neither act nor be
      // acted on. It is evaluated before the target is considered, so a paused caller learns
      // nothing. One error code covers both states: the operational effect is identical, and
      // the account and profile endpoints report which legal state is in force.
      if (processingPaused(currentData)) throw new Error('PROCESSING_RESTRICTED');
      if (currentData.ageEligibilityConfirmed !== true) throw new Error('AGE_CONFIRMATION_REQUIRED');

      // Anti-enumeration: "no account", "not discoverable" and "blocked in either
      // direction" all return the identical error. Otherwise anyone holding valid initData
      // could probe arbitrary Telegram ids and learn who has a Bezy dating account — which
      // for a dating service is exactly the kind of disclosure that must not be possible.
      const targetData = targetSnap.exists ? targetSnap.data() : null;
      const reachable = Boolean(targetData)
        // A paused account is not processed for anyone, and is unreachable through the
        // same identical error as every other unreachable case.
        && !processingPaused(targetData)
        && targetData.profileComplete === true
        // A hidden profile is unreachable too. Without this, a caller could distinguish
        // "no Bezy account" from "has an account but is not discoverable".
        && targetData.discoverable === true
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
          error.quota = { reason: quota.reason, usage: quota.usage, limits: quota.limits, isPremium };
          throw error;
        }
        tx.set(userRef, { usage: quota.usage }, { merge: true });
      }

      tx.set(actionRef, { action, createdAt: new Date() }, { merge: true });

      const reciprocal = reciprocalSnap.exists ? reciprocalSnap.data()?.action : '';
      const isLike = action === 'like' || action === 'super';
      const isReciprocalLike = reciprocal === 'like' || reciprocal === 'super';
      const matched = isLike && isReciprocalLike;

      // A pass overwrites the like that underpins an existing match, so the match is ended
      // here rather than left dangling as an active match with no reciprocal like behind
      // it. This is the same effect unmatch has, without the two-sided pass records.
      if (!isLike && existingMatch.exists && existingMatch.data()?.active !== false) {
        tx.set(matchRef, { active: false, endedAt: new Date(), endedReason: 'pass' }, { merge: true });
      }

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
        // A super like only warrants its own notification when the recipient has not already
        // decided about the sender — telling someone about a profile they have already passed
        // on is noise, not news.
        superLiked: action === 'super' && !matched && !reciprocalSnap.exists && !alreadyActioned,
        target: targetSnap.data() || {}
      };
    });

    if (result.created) {
      const currentSnap = await userRef.get();
      const current = currentSnap.data() || { telegramId: user.id };
      // The recipient is re-read AFTER the commit, so a pause or block that landed during
      // the transaction is respected by the notification path too — the in-transaction
      // snapshot can be stale by the time the message is delivered.
      const targetSnap = await targetRef.get();
      const target = targetSnap.data() || result.target;
      // Both sides resolve their explicit Bezy choice before their Telegram language.
      const language = normalizedLanguage(current.locale || user.language_code);
      const targetLanguage = normalizedLanguage(target.locale || target.languageCode);
      await Promise.allSettled([
        notifyMatch(firestore, current, target, language),
        notifyMatch(firestore, target, current, targetLanguage)
      ]);
    } else if (result.superLiked) {
      // Same re-read: a super-like notification is suppressed for a recipient who paused
      // or blocked in the window between the transaction and the delivery.
      const targetSnap = await targetRef.get();
      if (targetSnap.exists) await notifySuperLike(firestore, targetSnap.data() || {});
    }

    return res.status(200).json({ ok: true, action, matched: result.matched });
  } catch (error) {
    console.error('Swipe failed:', error);
    // Only the expected, user-meaningful case is surfaced; internal database errors
    // must not leak their text to the Mini App.
    if (error.message === 'TARGET_NOT_FOUND') return res.status(404).json({ error: error.message });
    if (error.message === 'PROCESSING_RESTRICTED') return res.status(403).json({ error: error.message });
    if (error.message === 'AGE_CONFIRMATION_REQUIRED') return res.status(403).json({ error: error.message });
    if (error.quota) return res.status(403).json({ error: error.quota.reason, usage: error.quota.usage, limits: error.quota.limits, isPremium: error.quota.isPremium });
    return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
  }
}
