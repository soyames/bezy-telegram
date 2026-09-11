import { db } from './_firebase.js';
import { requirePost, requireTelegramUser, miniAppUrl, normalizedLanguage } from './_telegram.js';
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
function counterpart(userId, conversationId) {
  const parts = String(conversationId || '').split('_');
  if (parts.length !== 2) return null;
  const other = parts.find((id) => id !== String(userId));
  if (!other || matchId(userId, other) !== String(conversationId)) return null;
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

function messageNotification(language, senderName) {
  const text = language === 'fr'
    ? `💬 Nouveau message sur Bezy\n\n${senderName} vous a écrit. Ouvrez Bezy pour répondre.`
    : `💬 New message on Bezy\n\n${senderName} sent you a message. Open Bezy to reply.`;
  const openBezyText = language === 'fr' ? '💜 Ouvrir Bezy' : '💜 Open Bezy';
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
  const messagesSnap = await firestore.collection('conversations')
    .doc(String(req.body.conversationId)).collection('messages')
    .orderBy('createdAt', 'asc').limit(200).get();
  const messages = messagesSnap.docs.map((doc) => publicMessage(doc.id, doc.data()));
  return res.status(200).json({ ok: true, conversationId: String(req.body.conversationId), messages });
}

async function markRead(req, res, user) {
  const firestore = db();
  const context = await authorize(firestore, user, req.body?.conversationId);
  const ref = firestore.collection('conversations').doc(String(req.body.conversationId));
  const now = new Date();
  await ref.set({ lastRead: { [context.me]: now }, updatedAt: now }, { merge: true });
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
  // The existing document is returned as-is, never overwritten.
  const existing = await messageRef.get();
  if (existing.exists) return res.status(200).json({ ok: true, message: publicMessage(clientId, existing.data()), duplicate: true });

  await messageRef.set({ senderId: context.me, text, createdAt: now });
  await conversationRef.set({
    participants: [context.me, context.otherId].sort(),
    matchId: conversationId,
    status: 'open',
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    lastMessagePreview: text.slice(0, 80),
    lastMessageSenderId: context.me
  }, { merge: true });

  // Telegram stays the notification channel; the message content never leaves Bezy. The
  // recipient's preferences and the per-day cap apply (api/_notify.js).
  const other = context.otherData || { telegramId: context.otherId };
  await deliverNotification(firestore, other, 'messages', messageNotification(
    normalizedLanguage(other.languageCode), context.meData?.profile?.displayName || context.meData?.firstName || 'your match'
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
