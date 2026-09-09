import { db } from './_firebase.js';
import { requirePost, requireTelegramUser } from './_telegram.js';

function publicMatch(id, data) {
  const profile = data.profile || {};
  return {
    id: String(id),
    displayName: profile.displayName || data.firstName || '',
    age: profile.age || null,
    city: profile.city || '',
    bio: profile.bio || '',
    interests: Array.isArray(profile.interests) ? profile.interests : [],
    photoUrl: data.photoUrl || '',
    username: data.username || '',
    telegramId: data.telegramId || Number(id)
  };
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
  const snapshot = await db().collection('matches')
    .where('participants', 'array-contains', String(user.id))
    .limit(50)
    .get();

  const matches = [];
  for (const matchDoc of snapshot.docs) {
    const matchData = matchDoc.data() || {};
    if (matchData.active === false) continue;
    const participants = matchData.participants || [];
    const otherId = participants.find((id) => String(id) !== String(user.id));
    if (!otherId) continue;
    const otherSnap = await db().collection('users').doc(String(otherId)).get();
    if (!otherSnap.exists) continue;
    // Firestore Timestamps do not survive JSON serialization in a usable shape,
    // so the API returns milliseconds and an ISO string the Mini App can render.
    const matchedAtMs = matchData.createdAt?.toMillis?.() ?? new Date(matchData.createdAt || 0).getTime();
    matches.push({
      ...publicMatch(otherId, otherSnap.data() || {}),
      matchId: matchDoc.id,
      matchedAtMs: Number.isFinite(matchedAtMs) ? matchedAtMs : 0,
      matchedAt: Number.isFinite(matchedAtMs) && matchedAtMs > 0 ? new Date(matchedAtMs).toISOString() : null
    });
  }

  matches.sort((a, b) => b.matchedAtMs - a.matchedAtMs);

  return res.status(200).json({ ok: true, matches });
}
