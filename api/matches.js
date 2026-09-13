import { db } from './_firebase.js';
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
  if (Number.isFinite(myAge) && Number.isFinite(theirAge) && Math.abs(myAge - theirAge) <= 5) {
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
    console.error('Matches request failed:', error);
    return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
  }
}

async function handleMatches(req, res, user) {
  const selfSnap = await db().collection('users').doc(String(user.id)).get();
  const selfData = selfSnap.data() || {};
  const myProfile = selfData.profile || {};
  // A paused account keeps access to its OWN stored data — restriction is not a trap that
  // locks someone out of their own match list (the export works for the same reason). What
  // stops is processing for dating purposes: new likes, new matches, and the OTHER side
  // reading the paused profile. The counterpart-side check below enforces that half.
  // Same resolution as Discover: the Mini App's resolved locale wins (validated against
  // SUPPORTED_LOCALES), the stored explicit/Telegram values cover older clients.
  const viewerLocale = normalizeLanguageTag(req.body?.lang) || resolveUserLanguage(selfData);

  const snapshot = await db().collection('matches')
    .where('participants', 'array-contains', String(user.id))
    .get();

  const isLike = (action) => action === 'like' || action === 'super';

  const matches = [];
  await Promise.all(snapshot.docs.map(async (matchDoc) => {
    const matchData = matchDoc.data() || {};
    if (matchData.active === false) return;
    const participants = matchData.participants || [];
    const otherId = participants.find((id) => String(id) !== String(user.id));
    if (!otherId) return;

    // The reciprocal-like invariant is verified against the live action documents rather
    // than assumed from the match document itself: a match only ever displays while both
    // sides still hold a like for each other. Deliberately non-mutating — a stale document
    // is skipped here, never rewritten on read.
    const [otherSnap, myActionSnap, otherActionSnap, conversationSnap] = await Promise.all([
      db().collection('users').doc(String(otherId)).get(),
      db().collection('users').doc(String(user.id)).collection('actions').doc(String(otherId)).get(),
      db().collection('users').doc(String(otherId)).collection('actions').doc(String(user.id)).get(),
      db().collection('conversations').doc(matchDoc.id).get()
    ]);
    if (!otherSnap.exists) return;
    // A counterpart whose account is paused has withdrawn from processing: their profile
    // and preview are not served to the viewer's match list either.
    if (processingPaused(otherSnap.data() || {})) return;
    const myAction = myActionSnap.exists ? myActionSnap.data()?.action : '';
    const otherAction = otherActionSnap.exists ? otherActionSnap.data()?.action : '';
    if (!isLike(myAction) || !isLike(otherAction)) return;

    const otherData = otherSnap.data() || {};
    // The conversation preview for the Messages tab: last message, when, and whether it is
    // unread for this reader. No message content beyond the single-line preview is returned
    // here — the full history lives behind the authorized /api/messages endpoint.
    const conversationData = conversationSnap.exists ? conversationSnap.data() : null;
    const lastMessageAt = conversationData?.lastMessageAt?.toMillis?.() ?? 0;
    const lastRead = conversationData?.lastRead?.[String(user.id)];
    const lastReadAt = lastRead?.toMillis?.() ?? 0;
    const conversation = conversationData ? {
      lastMessagePreview: String(conversationData.lastMessagePreview || ''),
      lastMessageAt: lastMessageAt > 0 ? new Date(lastMessageAt).toISOString() : null,
      lastMessageSenderId: String(conversationData.lastMessageSenderId || ''),
      unread: String(conversationData.lastMessageSenderId || '') !== String(user.id) && lastMessageAt > 0 && lastReadAt < lastMessageAt
    } : { lastMessagePreview: '', lastMessageAt: null, lastMessageSenderId: '', unread: false };
    // Firestore Timestamps do not survive JSON serialization in a usable shape,
    // so the API returns milliseconds and an ISO string the Mini App can render.
    const matchedAtMs = matchData.createdAt?.toMillis?.() ?? new Date(matchData.createdAt || 0).getTime();
    const card = {
      ...publicMatch(otherId, otherData),
      // Why you matched, and the starter suggestions derived from it, are computed from the
      // same shared signals so the two can never disagree.
      sharedSignals: sharedSignals(myProfile, otherData.profile || {}),
      matchId: matchDoc.id,
      matchedAtMs: Number.isFinite(matchedAtMs) ? matchedAtMs : 0,
      matchedAt: Number.isFinite(matchedAtMs) && matchedAtMs > 0 ? new Date(matchedAtMs).toISOString() : null,
      conversation
    };
    // Same viewer-locale treatment as Discover: translations attached, originals preserved.
    card.translations = await localizeProfileTexts(db(), otherId, card, viewerLocale);
    matches.push(card);
  }));

  matches.sort((a, b) => b.matchedAtMs - a.matchedAtMs);

  return res.status(200).json({ ok: true, matches });
}
