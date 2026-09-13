import { readUsers } from './_users.js';
import { query, tx, advisoryLock, ApiError } from './_db.js';
import { miniAppUrl, requirePost, requireTelegramUser, validUserId, normalizedLanguage, localized } from './_telegram.js';
import { isPremiumActive, checkSwipeQuota } from './_premium.js';
import { rateLimit } from './_ratelimit.js';
import { deliverNotification } from './_notify.js';
import { processingPaused } from './_privacy.js';

const ACTIONS = new Set(['like', 'super', 'pass']);

function matchId(a, b) {
  return [String(a), String(b)].sort((x, y) => BigInt(x) < BigInt(y) ? -1 : 1).join('_');
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

export async function notifyMatch(storage, user, other, language) {
  const otherName = other.profile?.displayName || other.firstName || localized(language, YOUR_MATCH);
  const openChatText = localized(language, START_CHATTING);
  const buttons = [[{ text: openChatText, web_app: { url: miniAppUrl('messages') } }]];
  return deliverNotification(storage, user, 'matches', {
    text: matchMessage(language, otherName),
    reply_markup: { inline_keyboard: buttons }
  });
}

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

async function notifySuperLike(storage, recipient) {
  // The recipient's explicit Bezy choice wins over their Telegram language, so a user who
  // picked French never receives an English Super Like notification.
  const language = normalizedLanguage(recipient.locale || recipient.languageCode);
  const openBezyText = localized(language, OPEN_BEZY_BTN);
  return deliverNotification(storage, recipient, 'super_likes', {
    text: superLikeMessage(language),
    reply_markup: { inline_keyboard: [[{ text: openBezyText, web_app: { url: miniAppUrl('discover') } }]] }
  });
}

// The caller/target rows in the shape every pure check (`processingPaused`, `isPremiumActive`,
// `checkSwipeQuota`) already consumes.
export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const user = requireTelegramUser(req, res);
  if (!user) return;

  const targetId = String(req.body?.targetId || '');
  const action = String(req.body?.action || '');
  if (!targetId || targetId === String(user.id) || !ACTIONS.has(action)) {
    return res.status(400).json({ error: 'INVALID_ACTION' });
  }
  if (!validUserId(targetId)) return res.status(404).json({ error: 'TARGET_NOT_FOUND' });

  if (!(await rateLimit(null, res, user.id, 'swipe'))) return;

  try {
    let result = await tx(async (q) => {
      // Same-user swipes serialize on an advisory lock instead of a row lock: the caller's
      // quota must not be raced, but an exclusive row lock would deadlock against the other
      // transaction's foreign-key checks during concurrent mutual likes.
      await advisoryLock(q, `swipe:${user.id}`);
      await advisoryLock(q, `pair:${matchId(user.id, targetId)}`);
      // All reads precede all writes inside one transaction, exactly like the PostgreSQL
      // version.
      const accounts = await readUsers([String(user.id), targetId], q);
      // Sequential on the single transaction client: pg serializes these anyway, and
      // explicit awaits keep the transaction client free of queued-query deprecation.
      const reciprocalRows = await q('SELECT action FROM actions WHERE actor_id = $1 AND target_id = $2', [targetId, String(user.id)]);
      // No FOR UPDATE here: two concurrent mutual likes would each hold a speculative lock
      // on the same (possibly absent) match row and deadlock against the caller-row lock
      // the other transaction holds. The INSERT ... ON CONFLICT below is the serialization
      // point, and RETURNING tells each transaction whether it created the match.
      const matchRows = await q('SELECT * FROM matches WHERE match_id = $1', [matchId(user.id, targetId)]);
      const blockedMine = await q('SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [String(user.id), targetId]);
      const blockedTheirs = await q('SELECT 1 FROM blocked_by WHERE blocked_id = $1 AND blocker_id = $2', [String(user.id), targetId]);
      const actionRows = await q('SELECT 1 FROM actions WHERE actor_id = $1 AND target_id = $2', [String(user.id), targetId]);

      const currentData = accounts.get(String(user.id)) || {};
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
      const targetData = accounts.get(targetId);
      const reachable = Boolean(targetData)
        // A paused account is not processed for anyone, and is unreachable through the
        // same identical error as every other unreachable case.
        && !processingPaused(targetData)
        && targetData.profileComplete === true
        // A hidden profile is unreachable too. Without this, a caller could distinguish
        // "no Bezy account" from "has an account but is not discoverable".
        && targetData.discoverable === true
        && blockedMine.rows.length === 0
        && blockedTheirs.rows.length === 0;
      if (!reachable) throw new Error('TARGET_NOT_FOUND');

      const isPremium = isPremiumActive(currentData);

      // Daily allowances are enforced here, inside the transaction, so the counter cannot
      // be bypassed by a client that ignores the UI or races concurrent requests.
      const alreadyActioned = actionRows.rows.length > 0;
      if (!alreadyActioned) {
        const quota = checkSwipeQuota(currentData, action, isPremium);
        if (!quota.allowed) {
          const error = new Error(quota.reason);
          error.quota = { reason: quota.reason, usage: quota.usage, limits: quota.limits, isPremium };
          throw error;
        }
        await q(
          `INSERT INTO usage (telegram_id, day, discovery_actions, super_likes) VALUES ($1, $2, $3, $4)
           ON CONFLICT (telegram_id) DO UPDATE SET day = EXCLUDED.day,
             discovery_actions = EXCLUDED.discovery_actions, super_likes = EXCLUDED.super_likes`,
          [String(user.id), String(quota.usage.day), quota.usage.discoveryActions, quota.usage.superLikes]
        );
      }

      const reciprocal = reciprocalRows.rows[0]?.action || '';
      const isLike = action === 'like' || action === 'super';
      const isReciprocalLike = reciprocal === 'like' || reciprocal === 'super';
      const matched = isLike && isReciprocalLike;
      const existingMatch = matchRows.rows[0] || null;

      await q(
        `INSERT INTO actions (actor_id, target_id, action, created_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (actor_id, target_id) DO UPDATE SET action = EXCLUDED.action, created_at = EXCLUDED.created_at`,
        [String(user.id), targetId, action]
      );

      // A pass overwrites the like that underpins an existing match, so the match is ended
      // here rather than left dangling as an active match with no reciprocal like behind
      // it. This is the same effect unmatch has, without the two-sided pass records.
      if (!isLike && existingMatch && existingMatch.active !== false) {
        await q(`UPDATE matches SET active = FALSE, ended_at = now(), ended_reason = 'pass' WHERE match_id = $1`, [matchId(user.id, targetId)]);
      }

      // Reverse index of the same action, so a user can be shown who liked them without
      // scanning every other user's actions. This is an index, not a second like system.
      if (isLike) {
        await q(
          `INSERT INTO likes_received (target_id, from_id, action, created_at) VALUES ($1, $2, $3, now())
           ON CONFLICT (target_id, from_id) DO UPDATE SET action = EXCLUDED.action, created_at = EXCLUDED.created_at`,
          [targetId, String(user.id), action]
        );
      } else {
        await q('DELETE FROM likes_received WHERE target_id = $1 AND from_id = $2', [targetId, String(user.id)]);
      }

      let createdNow = false;
      if (matched && !existingMatch) {
        const parts = [String(user.id), targetId].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
        // Database-enforced match uniqueness: concurrent mutual likes race to this INSERT,
        // and exactly one of them can win. RETURNING tells THIS request whether it was the
        // one that created the match — so exactly one match notification goes out, never two.
        const inserted = await q(
          'INSERT INTO matches (match_id, participant_a, participant_b, source, active, created_at) VALUES ($1, $2, $3, $4, TRUE, now()) ON CONFLICT (match_id) DO NOTHING RETURNING match_id',
          [matchId(user.id, targetId), parts[0], parts[1], 'mutual_like']
        );
        createdNow = inserted.rows.length > 0;
      }

      return {
        matched,
        created: createdNow,
        // A super like only warrants its own notification when the recipient has not already
        // decided about the sender — telling someone about a profile they have already passed
        // on is noise, not news.
        superLiked: action === 'super' && !matched && reciprocalRows.rows.length === 0 && !alreadyActioned,
        target: targetData || {}
      };
    });

    if (result.created) {
      // The recipient is re-read AFTER the commit, so a pause or block that landed during
      // the transaction is respected by the notification path too — the in-transaction
      // snapshot can be stale by the time the message is delivered.
      const accounts = await readUsers([String(user.id),targetId]);
      const current = accounts.get(String(user.id)) || { telegramId: user.id };
      const target = accounts.get(targetId) || result.target;
      // Both sides resolve their explicit Bezy choice before their Telegram language.
      const language = normalizedLanguage(current.locale || user.language_code);
      const targetLanguage = normalizedLanguage(target.locale || target.languageCode);
      await Promise.allSettled([
        notifyMatch(null, current, target, language),
        notifyMatch(null, target, current, targetLanguage)
      ]);
    } else if (result.superLiked) {
      // Same re-read: a super-like notification is suppressed for a recipient who paused
      // or blocked in the window between the transaction and the delivery.
      const target = (await readUsers([targetId])).get(targetId);
      if (target) await notifySuperLike(null, target);
    }

    return res.status(200).json({ ok: true, action, matched: result.matched });
  } catch (error) {
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message });
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
