import { query, cors, mediaIdentity, decodeMember } from './_helpers.js';

// Blocks are one-directional rows but always applied both ways: discovery, decisions,
// matches and photo access all exclude a blocked pair. DELETE lifts the block.
export default async function handler(req, res) {
  if (!cors(req, res)) return res.status(403).json({ error: 'ORIGIN_DENIED' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST' && req.method !== 'DELETE')
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    const viewer = await mediaIdentity(req);
    if (!viewer) return res.status(401).json({ error: 'INVALID_SESSION' });
    const target = decodeMember(req.body?.target);
    if (!target) return res.status(400).json({ error: 'INVALID_TARGET' });
    if (req.method === 'POST') {
      await query(`INSERT INTO bezy_media_blocks
         (blocker_provider,blocker_subject,blocked_provider,blocked_subject)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [viewer.provider, viewer.subject, target.provider, target.subject]);
      // Blocking ends any active match between the two, exactly as both frontends
      // tell users: the conversation closes for both sides immediately.
      await query(`UPDATE bezy_social_matches SET active=false, ended_at=now(),
         ended_by_provider=$1, ended_by_subject=$2, ended_reason='blocked'
         WHERE active AND (
           (a_provider=$1 AND a_subject=$2 AND b_provider=$3 AND b_subject=$4)
           OR (b_provider=$1 AND b_subject=$2 AND a_provider=$3 AND a_subject=$4))`,
        [viewer.provider, viewer.subject, target.provider, target.subject]);
    } else {
      await query(`DELETE FROM bezy_media_blocks WHERE blocker_provider=$1 AND blocker_subject=$2
         AND blocked_provider=$3 AND blocked_subject=$4`,
        [viewer.provider, viewer.subject, target.provider, target.subject]);
    }
    return res.status(204).end();
  } catch (error) {
    console.error('social block failed', error?.code || error?.name);
    return res.status(503).json({ error: 'SOCIAL_UNAVAILABLE' });
  }
}
