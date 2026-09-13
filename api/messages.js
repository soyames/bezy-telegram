import { db } from './_firebase.js';
import { requirePost, requireTelegramUser, miniAppUrl, normalizedLanguage, localized } from './_telegram.js';
import { isPremiumActive } from './_premium.js';
import { rateLimit } from './_ratelimit.js';
import { deliverNotification } from './_notify.js';
import { processingPaused } from './_privacy.js';

// Bezy-native conversations between matched users (ADR 0009). Telegram keeps identity and
// notifications; Bezy stores and delivers the messages inside the Mini App.
//
// Conversation documents are keyed by the canonical match id — the sorted pair of Telegram
// numeric ids — so there is exactly one conversation per pair and the client can never
// choose or guess an id that belongs to someone else. Messages live under
// conversations/{conversationId}/messages/{clientId}, where the client-generated id makes a
// retried send idempotent: the same id always writes the same document.
//
// The sender is always derived from the authenticated initData. `senderId` is never
// accepted from the request, and the counterpart is always derived from the conversation
// id, so no route exposes or accepts arbitrary Telegram ids.

const MAX_LENGTH = 500;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

function matchId(a, b) {
  return [String(a), String(b)].sort().join('_');
}

// One conversation per pair, derived from the ids inside the conversationId: it must
// contain the caller's own id and its canonical matchId form must equal what was sent.
// The shape is pinned to two numeric ids so a malformed id answers 404 instead of
// surfacing an Admin SDK document-path error as a 500.
function counterpart(userId, conversationId) {
  const value = String(conversationId || '');
  if (!/^\d+_\d+$/.test(value)) return null;
  const parts = value.split('_');
  const other = parts.find((id) => id !== String(userId));
  if (!other || matchId(userId, other) !== value) return null;
  return other;
}

const isLike = (action) => action === 'like' || action === 'super';

/**
 * The authorization chain for every action. Everything is derived server-side: the caller
 * from initData, the counterpart from the conversation id, the match and blocks from
 * Firestore. Throws the same typed errors the Mini App already maps to locale copy.
 */
async function authorize(firestore, user, conversationId) {
  const me = String(user.id);
  const otherId = counterpart(me, conversationId);
  if (!otherId) throw Object.assign(new Error('CONVERSATION_UNAVAILABLE'), { status: 404 });

  const [meSnap, otherSnap, matchSnap] = await Promise.all([
    firestore.collection('users').doc(me).get(),
    firestore.collection('users').doc(otherId).get(),
    firestore.collection('matches').doc(String(conversationId)).get()
  ]);
  const meData = meSnap.exists ? meSnap.data() : {};
  // An ineligible or paused caller is refused before anything about the counterpart is
  // considered, exactly like the swipe gate.
  if (processingPaused(meData)) throw Object.assign(new Error('PROCESSING_RESTRICTED'), { status: 403 });
  if (meData.ageEligibilityConfirmed !== true) throw Object.assign(new Error('AGE_CONFIRMATION_REQUIRED'), { status: 403 });

  const matchData = matchSnap.exists ? matchSnap.data() : null;
  // Anti-enumeration: a missing, ended or wrong match and a block in either direction all
  // answer with the identical error, so the endpoint cannot probe who has a Bezy account.
  const participants = (matchData?.participants || []).map(String);
  if (!matchData || matchData.active === false || !participants.includes(me) || !participants.includes(otherId)) {
    throw Object.assign(new Error('CONVERSATION_UNAVAILABLE'), { status: 404 });
  }
  // A counterpart whose account is paused (restriction or objection) has withdrawn from
  // processing: their messages must not be read or written, exactly like their profile
  // leaves Discover.
  if (processingPaused(otherSnap.exists ? otherSnap.data() || {} : {})) {
    throw Object.assign(new Error('CONVERSATION_UNAVAILABLE'), { status: 404 });
  }
  // Blocks are read in both directions from the caller's own mirror documents: a block
  // either way ends the conversation for both sides.
  const [blockedMine, blockedTheirs] = await Promise.all([
    firestore.collection('users').doc(me).collection('blocks').doc(otherId).get(),
    firestore.collection('users').doc(me).collection('blockedBy').doc(otherId).get()
  ]);
  if (blockedMine.exists || blockedTheirs.exists) throw Object.assign(new Error('CONVERSATION_UNAVAILABLE'), { status: 404 });

  // The reciprocal-like invariant is re-verified here too: a conversation can only exist
  // while both sides still hold their like.
  const [myAction, otherAction] = await Promise.all([
    firestore.collection('users').doc(me).collection('actions').doc(otherId).get(),
    firestore.collection('users').doc(otherId).collection('actions').doc(me).get()
  ]);
  const myActionValue = myAction.exists ? myAction.data()?.action : '';
  const otherActionValue = otherAction.exists ? otherAction.data()?.action : '';
  if (!isLike(myActionValue) || !isLike(otherActionValue)) throw Object.assign(new Error('CONVERSATION_UNAVAILABLE'), { status: 404 });

  // Messaging is Premium-gated (roadmap §14): a matched user without an active membership
  // can see the conversation is there but cannot open or send.
  if (!isPremiumActive(meData)) throw Object.assign(new Error('PREMIUM_REQUIRED'), { status: 403 });

  return { me, otherId, meData, otherData: otherSnap.exists ? otherSnap.data() : null };
}

const OPEN_BEZY_BTN = { en: '💜 Open Bezy', fr: '💜 Ouvrir Bezy', de: '💜 Bezy öffnen', es: '💜 Abrir Bezy', it: '💜 Apri Bezy', pt: '💜 Abrir o Bezy', ru: '💜 Открыть Bezy', pl: '💜 Otwórz Bezy', ar: '💜 افتح Bezy', tr: '💜 Bezy\'yi aç', sw: '💜 Fungua Bezy', yo: '💜 Ṣí Bezy', hi: '💜 Bezy खोलें', id: '💜 Buka Bezy', zh: '💜 打开 Bezy', ja: '💜 Bezy を開く', ko: '💜 Bezy 열기' };
const YOUR_MATCH = { en: 'your match', fr: 'votre match', de: 'dein Match', es: 'tu match', it: 'il tuo match', pt: 'o teu match', ru: 'твой мэтч', pl: 'twoje dopasowanie', ar: 'مطابقتك', tr: 'eşleşmen', sw: 'mechi yako', yo: 'mátìsì rẹ', hi: 'आपका मैच', id: 'kecocokanmu', zh: '你的配对', ja: 'あなたのマッチ', ko: '내 매치' };

function messageNotification(language, senderName) {
  const text = localized(language, {
    en: `💬 New message on Bezy\n\n${senderName} sent you a message. Open Bezy to reply.`,
    fr: `💬 Nouveau message sur Bezy\n\n${senderName} vous a écrit. Ouvrez Bezy pour répondre.`,
    de: `💬 Neue Nachricht auf Bezy\n\n${senderName} hat dir geschrieben. Öffne Bezy, um zu antworten.`,
    es: `💬 Nuevo mensaje en Bezy\n\n${senderName} te ha enviado un mensaje. Abre Bezy para responder.`,
    it: `💬 Nuovo messaggio su Bezy\n\n${senderName} ti ha inviato un messaggio. Apri Bezy per rispondere.`,
    pt: `💬 Nova mensagem na Bezy\n\n${senderName} enviou-te uma mensagem. Abre a Bezy para responder.`,
    ru: `💬 Новое сообщение в Bezy\n\n${senderName} отправил(а) тебе сообщение. Открой Bezy, чтобы ответить.`,
    pl: `💬 Nowa wiadomość w Bezy\n\n${senderName} wysłał(a) ci wiadomość. Otwórz Bezy, aby odpowiedzieć.`,
    ar: `💬 رسالة جديدة في Bezy\n\nأرسل لك ${senderName} رسالة. افتح Bezy للرد.`,
    tr: `💬 Bezy\'de yeni mesaj\n\n${senderName} sana mesaj gönderdi. Yanıtlamak için Bezy\'yi aç.`,
    sw: `💬 Ujumbe mpya kwenye Bezy\n\n${senderName} amekutumia ujumbe. Fungua Bezy ili kujibu.`,
    yo: `💬 Ìfiránṣẹ́ tuntun lórí Bezy\n\n${senderName} fi ìfiránṣẹ́ ránṣẹ́ sí ẹ. Ṣí Bezy láti dáhùn.`,
    hi: `💬 Bezy पर नया संदेश\n\n${senderName} ने आपको संदेश भेजा। जवाब देने के लिए Bezy खोलें।`,
    id: `💬 Pesan baru di Bezy\n\n${senderName} mengirimimu pesan. Buka Bezy untuk membalas.`,
    zh: `💬 Bezy 新消息\n\n${senderName} 给你发了消息。打开 Bezy 回复。`,
    ja: `💬 Bezy に新しいメッセージ\n\n${senderName} さんからメッセージが届きました。Bezy を開いて返信しましょう。`,
    ko: `💬 Bezy 새 메시지\n\n${senderName} 님이 메시지를 보냈습니다. Bezy를 열어 답장하세요.`
  });
  const openBezyText = localized(language, OPEN_BEZY_BTN);
  return {
    text,
    reply_markup: { inline_keyboard: [[{ text: openBezyText, web_app: { url: miniAppUrl('messages') } }]] }
  };
}

export function publicMessage(docId, data) {
  const toIso = (value) => (value?.toMillis ? new Date(value.toMillis()).toISOString() : value instanceof Date ? value.toISOString() : null);
  return {
    id: String(docId),
    senderId: String(data.senderId || ''),
    text: String(data.text || ''),
    createdAt: toIso(data.createdAt)
  };
}

async function listMessages(req, res, user) {
  const firestore = db();
  const context = await authorize(firestore, user, req.body?.conversationId);
  // Descending + reverse keeps the NEWEST 200 messages: the cap truncates old history,
  // never the recent end of the conversation (the previous ascending query returned the
  // oldest 200, which silently froze every conversation at message 200).
  const messagesSnap = await firestore.collection('conversations')
    .doc(String(req.body.conversationId)).collection('messages')
    .orderBy('createdAt', 'desc').limit(200).get();
  const messages = messagesSnap.docs.map((doc) => publicMessage(doc.id, doc.data())).reverse();
  return res.status(200).json({ ok: true, conversationId: String(req.body.conversationId), messages });
}

async function markRead(req, res, user) {
  const firestore = db();
  const context = await authorize(firestore, user, req.body?.conversationId);
  const ref = firestore.collection('conversations').doc(String(req.body.conversationId));
  const now = new Date();
  // The watermark is the newest message actually listed (the client sends its timestamp)
  // capped at now, and it never moves backwards — a message that lands during the list
  // round trip must not be silently marked read before it is ever rendered. The client
  // value is only a read watermark: it cannot grant or hide anything.
  const claimed = new Date(req.body?.lastMessageAt || 0).getTime();
  const snapshot = await ref.get();
  const existing = snapshot.exists ? snapshot.data() || {} : {};
  const previous = existing.lastRead?.[context.me]?.toMillis?.() ?? 0;
  const watermark = new Date(Math.max(previous, Math.min(now.getTime(), Number.isFinite(claimed) ? claimed : 0)));
  // The conversation document carries participants on every write, so the erasure query
  // (participants array-contains) can always see it — a read-only conversation is never
  // orphaned after account deletion.
  await ref.set({
    participants: [context.me, context.otherId].sort(),
    matchId: String(req.body.conversationId),
    lastRead: { [context.me]: watermark },
    updatedAt: now
  }, { merge: true });
  return res.status(200).json({ ok: true });
}

async function sendMessage(req, res, user) {
  const firestore = db();
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'INVALID_ACTION' });
  if (text.length > MAX_LENGTH) return res.status(400).json({ error: 'INVALID_ACTION' });
  const clientId = String(req.body?.clientId || '');
  if (!CLIENT_ID_PATTERN.test(clientId)) return res.status(400).json({ error: 'INVALID_ACTION' });

  const conversationId = String(req.body?.conversationId || '');
  const context = await authorize(firestore, user, conversationId);

  const conversationRef = firestore.collection('conversations').doc(conversationId);
  const messageRef = conversationRef.collection('messages').doc(clientId);
  const now = new Date();

  // Idempotent: a retried send carries the same clientId and lands on the same document.
  // The existing document is returned as-is, never overwritten — but only when it is the
  // caller's own message. A clientId collision with the counterpart's message is answered
  // generically, never by leaking the other side's text.
  const existing = await messageRef.get();
  if (existing.exists) {
    if (existing.data()?.senderId !== context.me) {
      return res.status(409).json({ error: 'INVALID_ACTION' });
    }
    return res.status(200).json({ ok: true, message: publicMessage(clientId, existing.data()), duplicate: true });
  }

  // The write is transactional with a re-read of the match and both block mirrors, so a
  // send that passed authorization before a block, unmatch or deletion commit lands
  // afterwards cannot persist message content or resurrect a closed conversation.
  await firestore.runTransaction(async (tx) => {
    const [matchDoc, blockedMine, blockedTheirs, conversationDoc] = await Promise.all([
      tx.get(firestore.collection('matches').doc(conversationId)),
      tx.get(firestore.collection('users').doc(context.me).collection('blocks').doc(context.otherId)),
      tx.get(firestore.collection('users').doc(context.me).collection('blockedBy').doc(context.otherId)),
      tx.get(conversationRef)
    ]);
    const liveMatch = matchDoc.exists ? matchDoc.data() : null;
    const participants = (liveMatch?.participants || []).map(String);
    const stillValid = liveMatch && liveMatch.active !== false
      && participants.includes(context.me) && participants.includes(context.otherId)
      && !blockedMine.exists && !blockedTheirs.exists;
    if (!stillValid) throw Object.assign(new Error('CONVERSATION_UNAVAILABLE'), { status: 404 });

    const existingInTx = await tx.get(messageRef);
    if (existingInTx.exists) return; // duplicate landed while this transaction started

    const conversation = conversationDoc.exists ? conversationDoc.data() || {} : {};
    tx.set(messageRef, { senderId: context.me, text, createdAt: now });
    tx.set(conversationRef, {
      ...conversation,
      participants: [context.me, context.otherId].sort(),
      matchId: conversationId,
      status: 'open',
      createdAt: conversation.createdAt || now,
      updatedAt: now,
      lastMessageAt: now,
      lastMessagePreview: text.slice(0, 80),
      lastMessageSenderId: context.me
    });
  });

  // Telegram stays the notification channel; the message content never leaves Bezy. The
  // recipient's preferences and the per-day cap apply (api/_notify.js).
  const other = context.otherData || { telegramId: context.otherId };
  // The recipient's explicit Bezy choice wins over their Telegram language.
  const otherLanguage = normalizedLanguage(other.locale || other.languageCode);
  await deliverNotification(firestore, other, 'messages', messageNotification(
    otherLanguage, context.meData?.profile?.displayName || context.meData?.firstName || localized(otherLanguage, YOUR_MATCH)
  ));

  return res.status(200).json({ ok: true, message: publicMessage(clientId, { senderId: context.me, text, createdAt: now }) });
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const user = requireTelegramUser(req, res);
  if (!user) return;

  const action = String(req.body?.action || '');
  if (!['list', 'send', 'read'].includes(action)) return res.status(400).json({ error: 'INVALID_ACTION' });

  // Sends and reads share the conversation quota surface; sends are additionally capped by
  // the tighter messages bucket inside the same limiter.
  if (!(await rateLimit(db(), res, user.id, action === 'send' ? 'messages' : 'messages_read'))) return;

  try {
    if (action === 'list') return await listMessages(req, res, user);
    if (action === 'read') return await markRead(req, res, user);
    return await sendMessage(req, res, user);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Messages request failed:', error);
    return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
  }
}
