import { db } from './_firebase.js';
import { requirePost, requireTelegramUser } from './_telegram.js';

function publicMatch(id, data) {
  const profile = data.profile || {};
  return {
    id: String(id),
    displayName: profile.displayName || data.firstName || 'Bezy member',
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

  const snapshot = await db().collection('matches')
    .where('participants', 'array-contains', String(user.id))
    .limit(50)
    .get();

  const matches = [];
  for (const matchDoc of snapshot.docs) {
    const participants = matchDoc.data()?.participants || [];
    const otherId = participants.find((id) => String(id) !== String(user.id));
    if (!otherId) continue;
    const otherSnap = await db().collection('users').doc(String(otherId)).get();
    if (!otherSnap.exists) continue;
    matches.push({
      ...publicMatch(otherId, otherSnap.data() || {}),
      matchedAt: matchDoc.data()?.createdAt || null
    });
  }

  matches.sort((a, b) => {
    const aTime = a.matchedAt?.toMillis?.() || new Date(a.matchedAt || 0).getTime();
    const bTime = b.matchedAt?.toMillis?.() || new Date(b.matchedAt || 0).getTime();
    return bTime - aTime;
  });

  return res.status(200).json({ ok: true, matches });
}
