import { readUser, readUsers } from './_users.js';
import { query, ApiError } from './_db.js';
import { requirePost, requireTelegramUser, normalizeLanguageTag, resolveUserLanguage } from './_telegram.js';
import { processingPaused } from './_privacy.js';
import { localizeProfileTexts } from './_profileText.js';

export function publicMatch(id, data) {
  const profile = data.profile || {};
  return {
    id: String(id),
    displayName: profile.displayName || data.firstName || '',
    age: profile.age || null,
    city: profile.city || '',
    bio: profile.bio || '',
    interests: Array.isArray(profile.interests) ? profile.interests : [],
    prompts: Array.isArray(profile.prompts) ? profile.prompts : [],
    languages: Array.isArray(profile.languages) ? profile.languages : [],
    photoUrl: data.photoUrl || ''
    // The @username is deliberately NOT released anymore: conversations are Bezy-native
    // (ADR 0009), so the handle has no product consumer, and ADR 0005 says the username
    // is never a contact vector. `id` remains the authoritative identity.
  };
}

/**
 * "Why you matched" — the shared signals behind a match, drawn only from the same
 * deterministic attributes `api/discover.js` already scores on.
 *
 * Deliberately narrow. It returns machine tokens plus values the counterpart already
 * published in their own profile, so it can never disclose anything the viewer could not
 * already see on the match card. It infers nothing, and `gender`/`seeking` are never
 * surfaced: those are the attributes under the open Article 9 review, and explaining a match
 * in terms of them would be exactly the sensitive inference to avoid.
 *
 * The Mini App renders each signal from the locale catalogue; no prose is produced here.
 */
export function sharedSignals(mine = {}, theirs = {}) {
  const signals = [];

  const myInterests = new Map((mine.interests || []).map((v) => [String(v).toLowerCase(), String(v)]));
  const shared = (theirs.interests || [])
    .filter((v) => myInterests.has(String(v).toLowerCase()))
    .map((v) => myInterests.get(String(v).toLowerCase()));
  if (shared.length) signals.push({ type: 'interests', values: shared.slice(0, 5) });

  const myCity = String(mine.city || '').trim();
  const theirCity = String(theirs.city || '').trim();
  if (myCity && theirCity && myCity.toLowerCase() === theirCity.toLowerCase()) {
    signals.push({ type: 'city', values: [theirCity] });
  }

  // A language in common is what makes a conversation possible at all, so it feeds the
  // match explanation and the starters the same way interests do. Both profiles must
  // have listed it; ids are machine tokens, rendered by the Mini App catalogue.
  const myLanguages = Array.isArray(mine.languages) ? mine.languages : [];
  const theirLanguages = Array.isArray(theirs.languages) ? theirs.languages : [];
  const sharedLanguages = theirLanguages.filter((id) => myLanguages.includes(id));
  if (sharedLanguages.length) signals.push({ type: 'languages', values: sharedLanguages.slice(0, 5) });

  const myAge = Number(mine.age);
  const theirAge = Number(theirs.age);
  if (myAge >= 18 && theirAge >= 18 && Number.isFinite(myAge) && Number.isFinite(theirAge) && Math.abs(myAge - theirAge) <= 5) {
    signals.push({ type: 'age', values: [] });
  }

  return signals;
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const user = requireTelegramUser(req, res);
  if (!user) return;

  try {
    return await handleMatches(req, res, user);
  } catch (error) {
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message });
    console.error('Matches request failed:', error);
    return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
  }
}

async function handleMatches(req, res, user) {
  const userId = String(user.id);
  const selfData = await readUser(userId);
  const myProfile = selfData.profile || {};
  // A paused account keeps access to its OWN stored data — restriction is not a trap that
  // locks someone out of their own match list (the export works for the same reason). What
  // stops is processing for dating purposes: new likes, new matches, and the OTHER side
  // reading the paused profile. The counterpart-side check below enforces that half.
  // Same resolution as Discover: the Mini App's resolved locale wins (validated against
  // SUPPORTED_LOCALES), the stored explicit/Telegram values cover older clients.
  const viewerLocale = normalizeLanguageTag(req.body?.lang) || resolveUserLanguage(selfData);

  const snapshot = await query(`SELECT m.*, row_to_json(c) AS conversation_data, cr.last_read_at,
      CASE WHEN m.participant_a=$1 THEN m.participant_b ELSE m.participant_a END AS other_id
    FROM matches m
    JOIN actions a ON a.actor_id=m.participant_a AND a.target_id=m.participant_b AND a.action IN ('like','super')
    JOIN actions b ON b.actor_id=m.participant_b AND b.target_id=m.participant_a AND b.action IN ('like','super')
    LEFT JOIN conversations c ON c.conversation_id=m.match_id
    LEFT JOIN conversation_reads cr ON cr.conversation_id=m.match_id AND cr.user_id=$1
    WHERE (m.participant_a=$1 OR m.participant_b=$1) AND m.active=TRUE
      AND NOT EXISTS (SELECT 1 FROM blocks bl WHERE
        (bl.blocker_id=m.participant_a AND bl.blocked_id=m.participant_b) OR
        (bl.blocker_id=m.participant_b AND bl.blocked_id=m.participant_a))
    ORDER BY m.created_at DESC, m.match_id`, [userId]);
  const accounts = await readUsers(snapshot.rows.map(r => String(r.other_id)));

  const matches = [];
  await Promise.all(snapshot.rows.map(async (matchRow) => {
    const matchData = {
      participants: [String(matchRow.participant_a), String(matchRow.participant_b)],
      active: matchRow.active,
      createdAt: matchRow.created_at
    };
    if (matchData.active === false) return;
    const participants = matchData.participants;
    const otherId = participants.find((id) => id !== userId);
    if (!otherId) return;

    const otherData = accounts.get(otherId);
    if (!otherData || processingPaused(otherData)) return;
    const conv = matchRow.conversation_data;
    const lastMessageAt = conv?.last_message_at ? new Date(conv.last_message_at).getTime() : 0;
    const lastReadAt = matchRow.last_read_at ? new Date(matchRow.last_read_at).getTime() : 0;
    const conversation = {
      lastMessagePreview: String(conv?.last_message_preview || ''),
      lastMessageAt: lastMessageAt > 0 ? new Date(lastMessageAt).toISOString() : null,
      lastMessageSenderId: String(conv?.last_message_sender_id || ''),
      unread: String(conv?.last_message_sender_id || '') !== userId && lastMessageAt > 0 && lastReadAt < lastMessageAt
    };
    const matchedAtMs = matchRow.created_at ? new Date(matchRow.created_at).getTime() : 0;
    const card = {
      ...publicMatch(otherId, otherData),
      // Why you matched, and the starter suggestions derived from it, are computed from the
      // same shared signals so the two can never disagree.
      sharedSignals: sharedSignals(myProfile, otherData.profile || {}),
      matchId: matchRow.match_id,
      matchedAtMs: Number.isFinite(matchedAtMs) ? matchedAtMs : 0,
      matchedAt: Number.isFinite(matchedAtMs) && matchedAtMs > 0 ? new Date(matchedAtMs).toISOString() : null,
      conversation
    };
    // Same viewer-locale treatment as Discover: translations attached, originals preserved.
    card.translations = await localizeProfileTexts(null, otherId, card, viewerLocale);
    matches.push(card);
  }));

  matches.sort((a, b) => b.matchedAtMs - a.matchedAtMs);

  return res.status(200).json({ ok: true, matches });
}
