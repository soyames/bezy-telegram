import { readUsers } from './_users.js';
import { query, tx, ApiError } from './_db.js';
import { requirePost, requireTelegramUser, miniAppUrl, normalizedLanguage, localized } from './_telegram.js';
import { isPremiumActive } from './_premium.js';
import { rateLimit } from './_ratelimit.js';
import { deliverNotification } from './_notify.js';
import { processingPaused } from './_privacy.js';
import { GAME_ACTIONS, gameRateLimitBucket, handleGameAction } from './_game.js';

// Bezy-native conversations between matched users (ADR 0009). Telegram keeps identity and
// notifications; Bezy stores and delivers the messages inside the Mini App.
//
// Conversation ids are the canonical match id — the sorted pair of Telegram numeric ids —
// so there is exactly one conversation per pair and the client can never choose or guess an
// id that belongs to someone else. Messages live in the `messages` table keyed by
// (conversation_id, client_id), where the client-generated id makes a retried send
// idempotent: the same id always writes the same row.
//
// The sender is always derived from the authenticated initData. `senderId` is never
// accepted from the request, and the counterpart is always derived from the conversation
// id, so no route exposes or accepts arbitrary Telegram ids.

const MAX_LENGTH = 500;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

function matchId(a, b) {
  return [String(a), String(b)].sort((x, y) => BigInt(x) < BigInt(y) ? -1 : 1).join('_');
}

// One conversation per pair, derived from the ids inside the conversationId: it must
// contain the caller's own id and its canonical matchId form must equal what was sent.
// The shape is pinned to two numeric ids so a malformed id answers 404 instead of
// surfacing a database error as a 500.
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
 * PostgreSQL. Throws the same typed errors the Mini App already maps to locale copy.
 */
async function authorize(user, conversationId, query) {
  const me = String(user.id);
  const otherId = counterpart(me, conversationId);
  if (!otherId) throw Object.assign(new Error('CONVERSATION_UNAVAILABLE'), { status: 404 });

  // Sequential on the single transaction client: pg serializes these anyway.
  const accounts = await readUsers([me, otherId], query);
  const matchRows = await query('SELECT * FROM matches WHERE match_id = $1', [String(conversationId)]);
  const meData = accounts.get(me) || {};
  // An ineligible or paused caller is refused before anything about the counterpart is
  // considered, exactly like the swipe gate.
  if (processingPaused(meData)) throw Object.assign(new Error('PROCESSING_RESTRICTED'), { status: 403 });
  if (meData.ageEligibilityConfirmed !== true) throw Object.assign(new Error('AGE_CONFIRMATION_REQUIRED'), { status: 403 });

  const matchData = matchRows.rows[0] || null;
  // Anti-enumeration: a missing, ended or wrong match and a block in either direction all
  // answer with the identical error, so the endpoint cannot probe who has a Bezy account.
  const participants = matchData ? [String(matchData.participant_a), String(matchData.participant_b)] : [];
  if (!matchData || matchData.active === false || !participants.includes(me) || !participants.includes(otherId)) {
    throw Object.assign(new Error('CONVERSATION_UNAVAILABLE'), { status: 404 });
  }
  // A counterpart whose account is paused (restriction or objection) has withdrawn from
  // processing: their messages must not be read or written, exactly like their profile
  // leaves Discover.
  const otherData = accounts.get(otherId) || {};
  if (processingPaused(otherData)) {
    throw Object.assign(new Error('CONVERSATION_UNAVAILABLE'), { status: 404 });
  }
  // Blocks are read in both directions from the caller's own perspective: a block
  // either way ends the conversation for both sides.
  const blockedMine = await query('SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [me, otherId]);
  const blockedTheirs = await query('SELECT 1 FROM blocked_by WHERE blocked_id = $1 AND blocker_id = $2', [me, otherId]);
  if (blockedMine.rows.length || blockedTheirs.rows.length) throw Object.assign(new Error('CONVERSATION_UNAVAILABLE'), { status: 404 });

  // The reciprocal-like invariant is re-verified here too: a conversation can only exist
  // while both sides still hold their like.
  const myAction = await query('SELECT action FROM actions WHERE actor_id = $1 AND target_id = $2', [me, otherId]);
  const otherAction = await query('SELECT action FROM actions WHERE actor_id = $1 AND target_id = $2', [otherId, me]);
  const myActionValue = myAction.rows[0]?.action || '';
  const otherActionValue = otherAction.rows[0]?.action || '';
  if (!isLike(myActionValue) || !isLike(otherActionValue)) throw Object.assign(new Error('CONVERSATION_UNAVAILABLE'), { status: 404 });

  // Messaging is Premium-gated (roadmap §14): a matched user without an active membership
  // can see the conversation is there but cannot open or send.
  if (!isPremiumActive(meData)) throw Object.assign(new Error('PREMIUM_REQUIRED'), { status: 403 });

  return { me, otherId, meData, otherData };
}

const OPEN_BEZY_BTN = { en: '💜 Open Bezy', fr: '💜 Ouvrir Bezy', de: '💜 Bezy öffnen', es: '💜 Abrir Bezy', it: '💜 Apri Bezy', pt: '💜 Abrir o Bezy', ru: '💜 Открыть Bezy', pl: '💜 Otwórz Bezy', ar: '💜 افتح Bezy', tr: '💜 Bezy\'yi aç', sw: '💜 Fungua Bezy', yo: '💜 Ṣí Bezy', hi: '💜 Bezy खोलें', id: '💜 Buka Bezy', zh: '💜 打开 Bezy', ja: '💜 Bezy を開く', ko: '💜 Bezy 열기' };
const YOUR_MATCH = { en: 'your match', fr: 'votre match', de: 'dein Match', es: 'tu match', it: 'il tuo match', pt: 'o teu match', ru: 'твой мэтч', pl: 'twoje dopasowanie', ar: 'مطابقتك', tr: 'eşleşmen', sw: 'mechi yako', yo: 'mátìsì rẹ', hi: 'आपका मैच', id: 'kecocokanmu', zh: '你的配对', ja: 'あなたのマッチ', ko: '내 매치' };

function messageNotification(language, senderName, conversationId) {
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
    reply_markup: { inline_keyboard: [[{ text: openBezyText, web_app: { url: miniAppUrl('messages', conversationId) } }]] }
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

// Serialize against closure on the match row; account and entitlement row locks
// ensure a pause, deletion, or refund cannot commit between authorization and use.
//
// Exported because every conversation capability must enter through the SAME gate: the
// post-match game (api/game.js) reuses this authorization chain rather than re-implementing
// it, so a block, an unmatch, a paused account, an expired membership or a closed
// conversation shuts the game down exactly as it shuts messaging down. The match-row lock
// also serializes concurrent game writes for the pair, which is what makes round creation
// idempotent and round completion happen exactly once.
export async function inConversation(user, conversationId, callback) {
  const otherId = counterpart(String(user.id), conversationId);
  if (!otherId) throw new ApiError('CONVERSATION_UNAVAILABLE', 404);
  return tx(async q => {
    await q('SELECT match_id FROM matches WHERE match_id=$1 FOR UPDATE', [conversationId]);
    await q('SELECT telegram_id FROM users WHERE telegram_id=ANY($1::bigint[]) ORDER BY telegram_id FOR SHARE', [[String(user.id),otherId]]);
    await q('SELECT telegram_id FROM premium_memberships WHERE telegram_id=$1 FOR SHARE', [String(user.id)]);
    const context = await authorize(user, conversationId, q);
    return callback(q, context);
  });
}

// The conversation row is created lazily by the first thing that needs it — a message, a
// read watermark, or a game round. The id is the canonical pair, so the participants are
// derivable from it and no caller can name a conversation that is not its own.
export function ensureConversation(q, conversationId) {
  return q(`INSERT INTO conversations(conversation_id,participant_a,participant_b,match_id,status,created_at,updated_at)
    VALUES ($1,$2,$3,$1,'open',now(),now()) ON CONFLICT(conversation_id) DO NOTHING`,
    [conversationId, ...String(conversationId).split('_')]);
}

async function listMessages(req, res, user) {
  const conversationId = String(req.body?.conversationId || '');
  const messages = await inConversation(user, conversationId, async q => {
    const result = await q(`SELECT client_id, sender_id, text, created_at FROM messages
      WHERE conversation_id=$1 ORDER BY created_at DESC, client_id DESC LIMIT 200`, [conversationId]);
    return result.rows.map(messageView).reverse();
  });
  return res.status(200).json({ ok: true, conversationId, messages });
}

function messageView(row) {
  return { id: String(row.client_id), senderId: String(row.sender_id), text: row.text, createdAt: row.created_at.toISOString() };
}

async function markRead(req, res, user) {
  const conversationId = String(req.body?.conversationId || '');
  await inConversation(user, conversationId, async (q, context) => {
    const claimed = new Date(req.body?.lastMessageAt || 0).getTime();
    const watermark = new Date(Math.max(0, Math.min(Date.now(), Number.isFinite(claimed) ? claimed : 0)));
    await ensureConversation(q, conversationId);
    await q(`INSERT INTO conversation_reads(conversation_id,user_id,last_read_at) VALUES($1,$2,$3)
      ON CONFLICT(conversation_id,user_id) DO UPDATE SET last_read_at=GREATEST(conversation_reads.last_read_at,EXCLUDED.last_read_at)`,
      [conversationId,context.me,watermark]);
  });
  return res.status(200).json({ ok: true });
}

async function sendMessage(req, res, user) {
  const text = String(req.body?.text || '').trim();
  const clientId = String(req.body?.clientId || '');
  if (!text || text.length > MAX_LENGTH || !CLIENT_ID_PATTERN.test(clientId)) return res.status(400).json({error:'INVALID_ACTION'});
  const conversationId = String(req.body?.conversationId || '');
  const result = await inConversation(user, conversationId, async (q, context) => {
    const existing = await q('SELECT client_id,sender_id,text,created_at FROM messages WHERE conversation_id=$1 AND client_id=$2', [conversationId,clientId]);
    if (existing.rows.length) {
      if (String(existing.rows[0].sender_id) !== context.me) throw new ApiError('INVALID_ACTION',409);
      return { message: messageView(existing.rows[0]), duplicate: true, context };
    }
    await ensureConversation(q, conversationId);
    const inserted = await q(`INSERT INTO messages(conversation_id,client_id,sender_id,text,created_at)
      SELECT $1,$2,$3,$4,GREATEST(clock_timestamp(),COALESCE(last_message_at + interval '1 millisecond',clock_timestamp()))
      FROM conversations WHERE conversation_id=$1 RETURNING client_id,sender_id,text,created_at`, [conversationId,clientId,context.me,text]);
    await q(`UPDATE conversations SET updated_at=clock_timestamp(), last_message_at=m.created_at,
      last_message_preview=left(m.text,80), last_message_sender_id=m.sender_id
      FROM messages m WHERE conversations.conversation_id=$1 AND m.conversation_id=$1 AND m.client_id=$2`, [conversationId,clientId]);
    return { message: messageView(inserted.rows[0]), duplicate: false, context };
  });
  if (!result.duplicate) {
    const { context } = result;
    await deliverNotification(null, context.otherData, 'messages', messageNotification(
      normalizedLanguage(context.otherData.locale || context.otherData.languageCode),
      context.meData.profile?.displayName || context.meData.firstName || localized('en',YOUR_MATCH), conversationId));
  }
  return res.status(200).json({ok:true,message:result.message,duplicate:result.duplicate});
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const user = requireTelegramUser(req, res);
  if (!user) return;

  const action = String(req.body?.action || '');
  // The post-match game is a capability of the conversation, so it is served by the
  // conversation's own route: same authorization chain, same typed errors, same handler —
  // and no second serverless function (the platform ceiling is 12 per deployment).
  const isGame = GAME_ACTIONS.includes(action);
  if (!isGame && !['list', 'send', 'read'].includes(action)) return res.status(400).json({ error: 'INVALID_ACTION' });

  // Sends and reads share the conversation quota surface; sends are additionally capped by
  // the tighter messages bucket inside the same limiter. The game keeps its own buckets.
  const bucket = isGame ? gameRateLimitBucket(action) : (action === 'send' ? 'messages' : 'messages_read');
  if (!(await rateLimit(null, res, user.id, bucket))) return;

  try {
    if (isGame) return await handleGameAction(action, req, res, user, { inConversation, ensureConversation });
    if (action === 'list') return await listMessages(req, res, user);
    if (action === 'read') return await markRead(req, res, user);
    return await sendMessage(req, res, user);
  } catch (error) {
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message });
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Messages request failed:', error);
    return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
  }
}
