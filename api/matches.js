import { db } from './_firebase.js';
import { requirePost, requireTelegramUser } from './_telegram.js';

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
    photoUrl: data.photoUrl || '',
    // The Telegram handle is released only here, after a mutual match, because it is what
    // hands the conversation over to Telegram. It is the user's current public handle and
    // may change or be removed; `id` remains the authoritative identity.
    username: data.username || ''
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
  const myProfile = selfSnap.data()?.profile || {};

  const snapshot = await db().collection('matches')
    .where('participants', 'array-contains', String(user.id))
    .limit(50)
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
    const [otherSnap, myActionSnap, otherActionSnap] = await Promise.all([
      db().collection('users').doc(String(otherId)).get(),
      db().collection('users').doc(String(user.id)).collection('actions').doc(String(otherId)).get(),
      db().collection('users').doc(String(otherId)).collection('actions').doc(String(user.id)).get()
    ]);
    if (!otherSnap.exists) return;
    const myAction = myActionSnap.exists ? myActionSnap.data()?.action : '';
    const otherAction = otherActionSnap.exists ? otherActionSnap.data()?.action : '';
    if (!isLike(myAction) || !isLike(otherAction)) return;

    const otherData = otherSnap.data() || {};
    // Firestore Timestamps do not survive JSON serialization in a usable shape,
    // so the API returns milliseconds and an ISO string the Mini App can render.
    const matchedAtMs = matchData.createdAt?.toMillis?.() ?? new Date(matchData.createdAt || 0).getTime();
    matches.push({
      ...publicMatch(otherId, otherData),
      // Why you matched, and the starter suggestions derived from it, are computed from the
      // same shared signals so the two can never disagree.
      sharedSignals: sharedSignals(myProfile, otherData.profile || {}),
      matchId: matchDoc.id,
      matchedAtMs: Number.isFinite(matchedAtMs) ? matchedAtMs : 0,
      matchedAt: Number.isFinite(matchedAtMs) && matchedAtMs > 0 ? new Date(matchedAtMs).toISOString() : null
    });
  }));

  matches.sort((a, b) => b.matchedAtMs - a.matchedAtMs);

  return res.status(200).json({ ok: true, matches });
}
