import crypto from 'node:crypto';
import { query, mediaTx, mediaAdvisoryLock, cors, mediaIdentity, decodeMember, sameMember,
  counterpartCard, orderPair, matchKey, isoAt } from './_helpers.js';

// One like or pass per (actor, target). A like becomes a match exactly when the reverse
// like already exists — the check and the insert share one transaction serialized on the
// member pair, so two simultaneous likes cannot create two matches.
export default async function handler(req, res) {
  if (!cors(req, res)) return res.status(403).json({ error: 'ORIGIN_DENIED' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    const viewer = await mediaIdentity(req);
    if (!viewer) return res.status(401).json({ error: 'INVALID_SESSION' });
    const target = decodeMember(req.body?.target);
    if (!target || sameMember(viewer, target)) return res.status(400).json({ error: 'INVALID_TARGET' });
    const decision = req.body?.decision;
    if (decision !== 'like' && decision !== 'pass')
      return res.status(400).json({ error: 'INVALID_DECISION' });

    const { rows: profileRows } = await query(
      `SELECT paused FROM bezy_social_profiles WHERE provider=$1 AND subject=$2`,
      [viewer.provider, viewer.subject]);
    if (!profileRows[0] || profileRows[0].paused)
      return res.status(403).json({ error: 'NOT_ELIGIBLE' });

    const { rows: targetRows } = await query(
      `SELECT 1 FROM bezy_media_members WHERE provider=$1 AND subject=$2`,
      [target.provider, target.subject]);
    if (!targetRows[0]) return res.status(404).json({ error: 'TARGET_NOT_FOUND' });

    // A block in either direction hides the member completely, as if they were gone.
    const { rows: blockRows } = await query(
      `SELECT 1 FROM bezy_media_blocks WHERE
         (blocker_provider=$1 AND blocker_subject=$2 AND blocked_provider=$3 AND blocked_subject=$4)
         OR (blocker_provider=$3 AND blocker_subject=$4 AND blocked_provider=$1 AND blocked_subject=$2)`,
      [viewer.provider, viewer.subject, target.provider, target.subject]);
    if (blockRows[0]) return res.status(404).json({ error: 'TARGET_NOT_FOUND' });

    await query(`INSERT INTO bezy_social_decisions
        (actor_provider,actor_subject,target_provider,target_subject,decision)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (actor_provider,actor_subject,target_provider,target_subject)
         DO UPDATE SET decision=$5, created_at=now()`,
      [viewer.provider, viewer.subject, target.provider, target.subject, decision]);

    if (decision === 'pass') return res.status(200).json({ matched: false });

    const [a, b] = orderPair(viewer, target);
    const outcome = await mediaTx(async (q) => {
      await mediaAdvisoryLock(q, matchKey(viewer, target));
      const { rows: mutual } = await q(
        `SELECT 1 FROM bezy_social_decisions WHERE actor_provider=$1 AND actor_subject=$2
           AND target_provider=$3 AND target_subject=$4 AND decision='like'`,
        [target.provider, target.subject, viewer.provider, viewer.subject]);
      if (!mutual[0]) return { matched: false };
      const { rows: existing } = await q(
        `SELECT match_id, created_at FROM bezy_social_matches WHERE active
           AND ((a_provider=$1 AND a_subject=$2 AND b_provider=$3 AND b_subject=$4)
             OR (b_provider=$1 AND b_subject=$2 AND a_provider=$3 AND a_subject=$4))
         ORDER BY created_at DESC LIMIT 1`,
        [viewer.provider, viewer.subject, target.provider, target.subject]);
      if (existing[0]) return { matched: true, match: existing[0] };
      const { rows: blocked } = await q(
        `SELECT 1 FROM bezy_media_blocks WHERE
           (blocker_provider=$1 AND blocker_subject=$2 AND blocked_provider=$3 AND blocked_subject=$4)
           OR (blocker_provider=$3 AND blocker_subject=$4 AND blocked_provider=$1 AND blocked_subject=$2)`,
        [viewer.provider, viewer.subject, target.provider, target.subject]);
      if (blocked[0]) return { matched: false };
      const { rows } = await q(
        `INSERT INTO bezy_social_matches
           (match_id,a_provider,a_subject,b_provider,b_subject,source)
         VALUES ($1,$2,$3,$4,$5,'mutual_like')
         RETURNING match_id, created_at`,
        [crypto.randomUUID(), a.provider, a.subject, b.provider, b.subject]);
      return { matched: true, match: rows[0] };
    });
    if (!outcome.matched) return res.status(200).json({ matched: false });

    const counterpart = await counterpartCard(viewer, target.provider, target.subject);
    return res.status(200).json({ matched: true, match: { id: outcome.match.match_id,
      createdAt: isoAt(outcome.match.created_at), counterpart, lastMessage: null, unread: false } });
  } catch (error) {
    console.error('social decision failed', error?.code || error?.name);
    return res.status(503).json({ error: 'SOCIAL_UNAVAILABLE' });
  }
}
