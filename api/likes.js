import { readUser, readUsers } from './_users.js';
import { query, ApiError } from './_db.js';
import { requirePost, requireTelegramUser } from './_telegram.js';
import { isPremiumActive } from './_premium.js';
import { rateLimit } from './_ratelimit.js';
import { processingPaused } from './_privacy.js';

export function publicLiker(id, data) {
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
    if (!(await rateLimit(null, res, user.id, 'likes_view'))) return;

    const userData = await readUser(String(user.id));
    if (processingPaused(userData)) return res.status(403).json({ error: 'PROCESSING_RESTRICTED' });
    if (!userData.ageEligibilityConfirmed) return res.status(403).json({ error: 'AGE_CONFIRMATION_REQUIRED' });

    // People the caller already decided on (including ones they matched with) are not
    // "waiting": the teaser counts exactly what the Premium list would show.
    const [receivedResult, decidedResult] = await Promise.all([
      query(
        `SELECT lr.from_id, lr.action, lr.created_at
         FROM likes_received lr
         WHERE lr.target_id = $1
           AND NOT EXISTS (SELECT 1 FROM actions a WHERE a.actor_id=$1 AND a.target_id=lr.from_id)
           AND NOT EXISTS (SELECT 1 FROM blocks b WHERE
             (b.blocker_id=$1 AND b.blocked_id=lr.from_id) OR (b.blocker_id=lr.from_id AND b.blocked_id=$1))
           AND EXISTS (SELECT 1 FROM users u WHERE u.telegram_id=lr.from_id AND u.discoverable=TRUE
             AND u.profile_complete=TRUE AND u.age_eligibility_confirmed=TRUE
             AND u.processing_restricted=FALSE AND u.processing_objection=FALSE)
         ORDER BY lr.created_at DESC
         LIMIT 50`,
        [String(user.id)]
      ),
      query('SELECT target_id FROM actions WHERE actor_id = $1', [String(user.id)])
    ]);
    const decided = new Set(decidedResult.rows.map((r) => String(r.target_id)));

    if (!isPremiumActive(userData)) {
      // The count is a non-identifying teaser: it reveals no profile, name or photo.
      const pending = receivedResult.rows.filter((r) => !decided.has(String(r.from_id))).length;
      return res.status(403).json({ error: 'PREMIUM_REQUIRED', likeCount: pending });
    }

    const accounts = await readUsers(receivedResult.rows.map(r => String(r.from_id)));
    const likes = [];
    for (const row of receivedResult.rows) {
      const fromId = String(row.from_id);
      if (decided.has(fromId)) continue;
      const liker = accounts.get(fromId);
      if (!liker) continue;
      // A paused liker is stored, not used; an explicitly hidden profile cannot be
      // reciprocated (the swipe gate refuses it), so showing it would invite a dead end.
      if (processingPaused(liker) || liker.discoverable === false) continue;
      const createdAtMs = row.created_at ? new Date(row.created_at).getTime() : 0;
      likes.push({
        ...publicLiker(fromId, liker),
        action: row.action || 'like',
        likedAt: createdAtMs ? new Date(createdAtMs).toISOString() : null,
        likedAtMs: createdAtMs
      });
    }
    likes.sort((a, b) => b.likedAtMs - a.likedAtMs);

    return res.status(200).json({ ok: true, likes, likeCount: likes.length });
  } catch (error) {
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message });
    console.error('Likes request failed:', error);
    return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
  }
}

