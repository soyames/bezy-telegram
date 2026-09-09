import { db } from './_firebase.js';
import { requirePost, requireTelegramUser } from './_telegram.js';
import { isPremiumActive } from './_premium.js';
import { rateLimit } from './_ratelimit.js';

function publicLiker(id, data) {
  const profile = data.profile || {};
  return {
    id: String(id),
    displayName: profile.displayName || data.firstName || '',
    age: profile.age || null,
    city: profile.city || '',
    bio: profile.bio || '',
    interests: Array.isArray(profile.interests) ? profile.interests : [],
    photoUrl: data.photoUrl || ''
  };
}

/**
 * Premium-only: the people who already liked the current user and are still waiting
 * for a decision. Free users receive a 403 and no liker data whatsoever — the gate is
 * the API, not the UI, so hidden markup can never leak identities.
 */
export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const user = requireTelegramUser(req, res);
  if (!user) return;

  try {
    const firestore = db();
    if (!(await rateLimit(firestore, res, user.id, 'likes_view'))) return;
    const userRef = firestore.collection('users').doc(String(user.id));
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};

    if (!isPremiumActive(userData)) {
      // The count is a non-identifying teaser: it reveals no profile, name or photo.
      const pending = await userRef.collection('likesReceived').count().get();
      return res.status(403).json({ error: 'PREMIUM_REQUIRED', likeCount: pending.data().count || 0 });
    }

    const received = await userRef.collection('likesReceived').limit(50).get();
    const decided = new Set((await userRef.collection('actions').get()).docs.map((doc) => doc.id));

    const likes = [];
    for (const doc of received.docs) {
      if (decided.has(doc.id)) continue;
      const likerSnap = await firestore.collection('users').doc(doc.id).get();
      if (!likerSnap.exists) continue;
      const createdAtMs = doc.data()?.createdAt?.toMillis?.() ?? 0;
      likes.push({
        ...publicLiker(doc.id, likerSnap.data() || {}),
        action: doc.data()?.action || 'like',
        likedAt: createdAtMs ? new Date(createdAtMs).toISOString() : null,
        likedAtMs: createdAtMs
      });
    }
    likes.sort((a, b) => b.likedAtMs - a.likedAtMs);

    return res.status(200).json({ ok: true, likes, likeCount: likes.length });
  } catch (error) {
    console.error('Likes request failed:', error);
    return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
  }
}
