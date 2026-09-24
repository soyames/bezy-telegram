import { mediaQuery as query } from './_db.js';
import { cors, mediaIdentity } from './_auth.js';

export default async function handler(req, res) {
  if (!cors(req, res)) return res.status(403).json({ error: 'ORIGIN_DENIED' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST' && req.method !== 'DELETE') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    const viewer = await mediaIdentity(req);
    if (!viewer) return res.status(401).json({ error: 'INVALID_SESSION' });
    const provider = req.body?.provider;
    const subject = req.body?.subject;
    if (!['pi','telegram'].includes(provider) || typeof subject !== 'string' || !subject || subject.length > 128)
      return res.status(400).json({ error: 'INVALID_TARGET' });
    if (req.method === 'POST') {
      await query(`INSERT INTO bezy_media_blocks (blocker_provider,blocker_subject,blocked_provider,blocked_subject)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [viewer.provider,viewer.subject,provider,subject]);
    } else {
      await query(`DELETE FROM bezy_media_blocks WHERE blocker_provider=$1 AND blocker_subject=$2
         AND blocked_provider=$3 AND blocked_subject=$4`, [viewer.provider,viewer.subject,provider,subject]);
    }
    return res.status(204).end();
  } catch (error) {
    console.error('media block failed', error?.code || error?.name);
    return res.status(503).json({ error: 'MEDIA_UNAVAILABLE' });
  }
}
