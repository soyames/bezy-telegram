import { query, tx, ApiError } from './_db.js';
import { requirePost, requireTelegramUser, validUserId, normalizedLanguage, localized } from './_telegram.js';
import { rateLimit } from './_ratelimit.js';
import { deliverNotification } from './_notify.js';

// Safety actions for a dating service: block, unblock, report and unmatch.
// All of them are enforced server-side — hiding a button is not a safety control.
//
// One endpoint rather than four keeps the serverless function count low and keeps the
// shared authorization and validation in a single place.

const REPORT_REASONS = new Set(['harassment', 'spam', 'scam', 'fake_profile', 'inappropriate_content', 'underage', 'other']);
const DETAILS_MAX = 1000;

function matchId(a, b) {
  return [String(a), String(b)].sort((x, y) => BigInt(x) < BigInt(y) ? -1 : 1).join('_');
}

/**
 * The one safety action that warrants a bot message: filing a report hands the matter to a
 * human moderator, and the acknowledgment is the reporter's record that it was received.
 * Deliberately identical whether or not the target account exists — a differing
 * acknowledgment would let a caller probe account existence through the bot chat.
 * Blocks, unblocks and unmatches stay silent: their effect is visible in the app itself.
 */
function reportAcknowledgment(language) {
  return localized(language, {
    en: 'We received your report and will look into it. If someone is in immediate danger, contact your local authorities.',
    fr: 'Nous avons bien reçu votre signalement et nous allons l’examiner. En cas de danger immédiat, contactez les autorités locales.',
    de: 'Wir haben deine Meldung erhalten und werden sie prüfen. Bei akuter Gefahr kontaktiere die örtlichen Behörden.',
    es: 'Hemos recibido tu denuncia y la examinaremos. Si alguien está en peligro inmediato, contacta con las autoridades locales.',
    it: 'Abbiamo ricevuto la tua segnalazione e la esamineremo. Se qualcuno è in pericolo immediato, contatta le autorità locali.',
    pt: 'Recebemos a tua denúncia e vamos analisá-la. Se alguém estiver em perigo imediato, contacta as autoridades locais.',
    ru: 'Мы получили твою жалобу и рассмотрим её. Если кто-то в непосредственной опасности, обратись в местные органы.',
    pl: 'Otrzymaliśmy twoje zgłoszenie i rozpatrzymy je. Jeśli ktoś jest w bezpośrednim niebezpieczeństwie, skontaktuj się z lokalnymi władzami.',
    ar: 'استلمنا بلاغك وسننظر فيه. إذا كان أحدهم في خطر مباشر، تواصل مع السلطات المحلية.',
    tr: 'Şikâyetini aldık ve inceleyeceğiz. Biri acil tehlike altındaysa yerel yetkililerle iletişime geç.',
    sw: 'Tumepokea ripoti yako na tutaichunguza. Ikiwa mtu yuko hatarini mara moja, wasiliana na mamlaka za eneo lako.',
    yo: 'A ti gba ìjábọ̀ rẹ, a ó sì ṣàyẹ̀wò rẹ̀. Tí ẹnìkan bá wà nínú ewu lẹ́sẹ̀kẹsẹ̀, kàn sí àwọn aláṣẹ àdúgbò rẹ.',
    hi: 'हमें आपकी रिपोर्ट मिल गई है और हम इसकी जाँच करेंगे। अगर कोई तुरंत खतरे में है, तो स्थानीय अधिकारियों से संपर्क करें।',
    id: 'Kami menerima laporanmu dan akan meninjaunya. Jika seseorang dalam bahaya langsung, hubungi otoritas setempat.',
    zh: '我们已收到你的举报并将进行调查。如果有人处于即时危险中，请联系当地有关部门。',
    ja: '通報を受け取りました。確認します。誰かが差し迫った危険にある場合は、現地の当局に連絡してください。',
    ko: '신고를 접수했으며 검토하겠습니다. 누군가 즉각적인 위험에 처해 있다면 현지 당국에 연락하세요.'
  });
}

/**
 * Blocking is deliberately symmetrical in effect: neither party can discover, like or
 * match the other afterwards. The mirror document under the blocked user lets discovery
 * filter both directions with a single subcollection read instead of a query per candidate.
 * The blocked user is never told that they were blocked.
 */
async function block(storage, userId, targetId) {
  await tx(async (q) => {
    await q(
      'INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES ($1, $2, now()) ON CONFLICT (blocker_id, blocked_id) DO NOTHING',
      [userId, targetId]
    );
    await q(
      'INSERT INTO blocked_by (blocked_id, blocker_id, created_at) VALUES ($1, $2, now()) ON CONFLICT (blocked_id, blocker_id) DO NOTHING',
      [targetId, userId]
    );

    // An existing match is ended so it can no longer appear for either side.
    await q(
      `UPDATE matches SET active = FALSE, ended_at = now(), ended_by = $1, ended_reason = 'block'
       WHERE match_id = $2 AND active = TRUE`,
      [userId, matchId(userId, targetId)]
    );

    // The Bezy conversation is closed too: messaging stops immediately for both sides, and
    // the conversation screen reports the conversation as unavailable.
    await q(
      `UPDATE conversations SET status = 'blocked', updated_at = now() WHERE conversation_id = $1`,
      [matchId(userId, targetId)]
    );

    // A block also records a decision, so the pair never resurfaces in discovery.
    await q(
      'INSERT INTO actions (actor_id, target_id, action, created_at) VALUES ($1, $2, $3, now()) ON CONFLICT (actor_id, target_id) DO UPDATE SET action = EXCLUDED.action, created_at = EXCLUDED.created_at',
      [userId, targetId, 'pass']
    );
    await q(
      'INSERT INTO actions (actor_id, target_id, action, created_at) VALUES ($1, $2, $3, now()) ON CONFLICT (actor_id, target_id) DO UPDATE SET action = EXCLUDED.action, created_at = EXCLUDED.created_at',
      [targetId, userId, 'pass']
    );
    // Any pending like between the two is withdrawn from "who liked you".
    await q('DELETE FROM likes_received WHERE target_id = $1 AND from_id = $2', [userId, targetId]);
    await q('DELETE FROM likes_received WHERE target_id = $1 AND from_id = $2', [targetId, userId]);
  });
  return { blocked: true };
}

async function unblock(storage, userId, targetId) {
  await tx(async (q) => {
    await q('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [userId, targetId]);
    await q('DELETE FROM blocked_by WHERE blocked_id = $1 AND blocker_id = $2', [targetId, userId]);
  });
  // The recorded pass is intentionally left in place: unblocking restores contactability,
  // it does not re-inject someone into the deck who was already decided on.
  return { blocked: false };
}

/**
 * Reports are stored for moderation review. Only what is needed to act on the report is
 * kept: who reported whom, a category, an optional free-text description and a status.
 * No profile snapshot is copied, so a later erasure request does not leave stale personal
 * data behind inside the report.
 */
async function report(storage, userId, targetId, body) {
  const reason = REPORT_REASONS.has(body?.reason) ? body.reason : 'other';
  const details = String(body?.details ?? '').trim().slice(0, DETAILS_MAX);

  // Reporting always blocks as well: a user who reports someone should not keep seeing them.
  // The block is written first — the safety action is the one that must survive — so a
  // report-write failure can never silently drop the block. If the report fails afterwards,
  // the caller still learns both facts.
  await block(storage, userId, targetId);
  let reported = true;
  let reportId = null;
  try {
    const result = await query(
      'INSERT INTO reports (reporter_id, target_id, reason, details, status, created_at) VALUES ($1, $2, $3, $4, $5, now()) RETURNING id',
      [userId, targetId, reason, details, 'open']
    );
    reportId = String(result.rows[0].id);
  } catch (error) {
    reported = false;
    console.warn('[bezy-safety] report write failed after block:', error.message);
  }
  return { reported, reportId, reason };
}

/**
 * Unmatching ends the match for both sides and records a pass in both directions, so the
 * pair cannot reappear in discovery and no stale match can be used to re-establish contact.
 * The Bezy conversation history is kept — it records what the two users exchanged — but
 * nothing new can be sent.
 */
async function unmatch(storage, userId, targetId) {
  const mId = matchId(userId, targetId);
  const result = await query('SELECT * FROM matches WHERE match_id = $1', [mId]);
  const matchRow = result.rows[0] || null;
  const participants = matchRow ? [String(matchRow.participant_a), String(matchRow.participant_b)] : [];
  if (!matchRow || !participants.includes(userId)) {
    return { unmatched: false, reason: 'NO_SUCH_MATCH' };
  }

  await tx(async (q) => {
    await q(
      `UPDATE matches SET active = FALSE, ended_at = now(), ended_by = $1, ended_reason = 'unmatch' WHERE match_id = $2`,
      [userId, mId]
    );
    for (const [actor, target] of [[userId, targetId], [targetId, userId]]) {
      await q(
        'INSERT INTO actions (actor_id, target_id, action, created_at) VALUES ($1, $2, $3, now()) ON CONFLICT (actor_id, target_id) DO UPDATE SET action = EXCLUDED.action, created_at = EXCLUDED.created_at',
        [actor, target, 'pass']
      );
      await q('DELETE FROM likes_received WHERE target_id = $1 AND from_id = $2', [actor, target]);
    }
    // The conversation closes with the match: no further messaging either way.
    await q(`UPDATE conversations SET status = 'closed', updated_at = now() WHERE conversation_id = $1`, [mId]);
  });
  return { unmatched: true };
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const user = requireTelegramUser(req, res);
  if (!user) return;

  const userId = String(user.id);
  const action = String(req.body?.action || '');
  const targetId = String(req.body?.targetId || '');

  if (!targetId || targetId === userId) return res.status(400).json({ error: 'INVALID_TARGET' });
  if (!['block', 'unblock', 'report', 'unmatch', 'list_blocks'].includes(action)) {
    return res.status(400).json({ error: 'INVALID_ACTION' });
  }

  try {
    // The acting account must itself be eligible to use Bezy.
    const selfResult = await query(
      `SELECT u.telegram_id, u.first_name, u.language_code, u.locale, u.age_eligibility_confirmed,
              p.display_name
       FROM users u LEFT JOIN profiles p ON p.telegram_id = u.telegram_id
       WHERE u.telegram_id = $1`,
      [userId]
    );
    const selfRow = selfResult.rows[0] || {};
    if (selfRow.age_eligibility_confirmed !== true) {
      return res.status(403).json({ error: 'AGE_CONFIRMATION_REQUIRED' });
    }

    // Rate limited per action class. Report has the tightest budget because report spam is
    // itself a harassment vector. list_blocks and unmatch ride the block budget.
    const bucket = action === 'report' ? 'report' : 'block';
    if (!(await rateLimit(null, res, userId, bucket))) return;

    // Anti-enumeration: acting on a Telegram id that has no Bezy account must look exactly
    // like acting on one that does. The response below is identical either way; the only
    // difference is that nothing is written for a stranger, so no mirror row or report
    // is created under an account that does not exist.
    const targetExists = action === 'list_blocks'
      ? true
      : validUserId(targetId) && (await query('SELECT 1 FROM users WHERE telegram_id = $1', [targetId])).rows.length > 0;

    if (action === 'list_blocks') {
      const blocks = await query(
        `SELECT b.blocked_id, b.created_at, p.display_name
         FROM blocks b LEFT JOIN profiles p ON p.telegram_id = b.blocked_id
         WHERE b.blocker_id = $1 ORDER BY b.created_at DESC LIMIT 100`,
        [userId]
      );
      const blocked = blocks.rows.map((r) => ({
        id: String(r.blocked_id),
        displayName: r.display_name || '',
        blockedAt: r.created_at ? new Date(r.created_at).toISOString() : null
      }));
      return res.status(200).json({ ok: true, blocked });
    }

    if (action === 'block') {
      if (!targetExists) return res.status(200).json({ ok: true, blocked: true });
      return res.status(200).json({ ok: true, ...(await block(null, userId, targetId)) });
    }
    if (action === 'unblock') return res.status(200).json({ ok: true, ...(validUserId(targetId) ? await unblock(null, userId, targetId) : { blocked: false }) });
    if (action === 'report') {
      // A report about a non-existent account is accepted in appearance but not stored:
      // there is nothing to moderate, and storing it would let anyone fill the moderation
      // queue with entries for arbitrary Telegram ids. The acknowledgment below is sent in
      // both cases and is identical, so it cannot be used to tell the two apart. It is
      // awaited: the reporter's record of receipt must not be lost to a frozen serverless
      // instance on the discarded-report path.
      const selfData = {
        telegramId: userId,
        firstName: selfRow.first_name ?? null,
        languageCode: selfRow.language_code ?? null,
        locale: selfRow.locale ?? null
      };
      const ack = reportAcknowledgment(normalizedLanguage(selfData.languageCode));
      await deliverNotification(null, selfData, 'account', { text: ack });
      if (!targetExists) return res.status(200).json({ ok: true, reported: true, reason: REPORT_REASONS.has(req.body?.reason) ? req.body.reason : 'other' });
      return res.status(200).json({ ok: true, ...(await report(null, userId, targetId, req.body)) });
    }
    return res.status(200).json({ ok: true, ...(validUserId(targetId) ? await unmatch(null, userId, targetId) : {unmatched:false,reason:'NO_SUCH_MATCH'}) });
  } catch (error) {
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message });
    console.error('Relationship request failed:', error);
    return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
  }
}
