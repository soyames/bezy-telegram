import { query, cors, mediaIdentity, counterpartCard } from './_helpers.js';

// Everyone who has already liked the viewer and whom the viewer has not decided on yet.
// This is the Premium "see who liked you" list: the viewer's own discovery filters are
// deliberately NOT applied — widening past them is the point of the feature — but the
// liker's own privacy choices (paused, hidden or matches-only visibility) are, exactly as
// in discovery, along with blocks in either direction, the viewer's reports and any
// match they already share. Anyone who turned up here would otherwise be a stranger the
// liker chose to hide.

const MAX_LIKES = 30;

export default async function handler(req, res) {
  if (!cors(req, res)) return res.status(403).json({ error: 'ORIGIN_DENIED' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    const viewer = await mediaIdentity(req);
    if (!viewer) return res.status(401).json({ error: 'INVALID_SESSION' });

    const { rows } = await query(
      `SELECT d.actor_provider, d.actor_subject
         FROM bezy_social_decisions d
         JOIN bezy_social_profiles p
           ON p.provider = d.actor_provider AND p.subject = d.actor_subject
         JOIN bezy_media_members m
           ON m.provider = p.provider AND m.subject = p.subject
        WHERE d.target_provider = $1 AND d.target_subject = $2
          AND d.decision = 'like'
          AND m.discoverable AND m.adult_confirmed
          AND NOT p.paused AND p.visibility = 'everyone'
          AND NOT EXISTS (SELECT 1 FROM bezy_social_decisions x
              WHERE x.actor_provider=$1 AND x.actor_subject=$2
                AND x.target_provider=d.actor_provider AND x.target_subject=d.actor_subject)
          AND NOT EXISTS (SELECT 1 FROM bezy_media_blocks b WHERE
              (b.blocker_provider=$1 AND b.blocker_subject=$2
                AND b.blocked_provider=d.actor_provider AND b.blocked_subject=d.actor_subject)
              OR (b.blocker_provider=d.actor_provider AND b.blocker_subject=d.actor_subject
                AND b.blocked_provider=$1 AND b.blocked_subject=$2))
          AND NOT EXISTS (SELECT 1 FROM bezy_social_matches x WHERE x.active
              AND ((x.a_provider=$1 AND x.a_subject=$2
                    AND x.b_provider=d.actor_provider AND x.b_subject=d.actor_subject)
                OR (x.b_provider=$1 AND x.b_subject=$2
                    AND x.a_provider=d.actor_provider AND x.a_subject=d.actor_subject)))
          AND NOT EXISTS (SELECT 1 FROM bezy_social_reports r
              WHERE r.reporter_provider=$1 AND r.reporter_subject=$2
                AND r.target_provider=d.actor_provider AND r.target_subject=d.actor_subject)
        ORDER BY d.created_at DESC
        LIMIT ${MAX_LIKES}`,
      [viewer.provider, viewer.subject]);

    // counterpartCard is the same card discovery and the match list render, so a liker
    // appears here exactly as they would anywhere else.
    const likes = [];
    for (const row of rows) {
      const card = await counterpartCard(viewer, row.actor_provider, row.actor_subject);
      if (card) likes.push(card);
    }
    return res.status(200).json({ likes });
  } catch (error) {
    console.error('social likes failed', error?.code || error?.name);
    return res.status(503).json({ error: 'SOCIAL_UNAVAILABLE' });
  }
}
