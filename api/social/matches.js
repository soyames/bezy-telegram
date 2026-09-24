import { query, cors, mediaIdentity, counterpartCard, isoAt, isUuid } from './_helpers.js';

// The conversation list. A match is a pair of members; everything shown here is resolved
// for the viewer (counterpart, last message, unread) and ordered by recent activity.

const MAX_MATCHES = 100;

export default async function handler(req, res) {
  if (!cors(req, res)) return res.status(403).json({ error: 'ORIGIN_DENIED' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST')
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    const viewer = await mediaIdentity(req);
    if (!viewer) return res.status(401).json({ error: 'INVALID_SESSION' });

    if (req.method === 'POST') {
      const matchId = req.body?.match;
      if (!isUuid(matchId)) return res.status(400).json({ error: 'INVALID_MATCH' });
      if (req.body?.action !== 'unmatch') return res.status(400).json({ error: 'INVALID_ACTION' });
      const { rowCount } = await query(
        `UPDATE bezy_social_matches SET active=false, ended_at=now(),
           ended_by_provider=$2, ended_by_subject=$3, ended_reason='unmatch'
         WHERE match_id=$1 AND active
           AND ((a_provider=$2 AND a_subject=$3) OR (b_provider=$2 AND b_subject=$3))`,
        [matchId, viewer.provider, viewer.subject]);
      if (!rowCount) return res.status(404).json({ error: 'CONVERSATION_UNAVAILABLE' });
      return res.status(204).end();
    }

    const { rows } = await query(
      `SELECT match_id, a_provider, a_subject, b_provider, b_subject, created_at
         FROM bezy_social_matches
         WHERE active AND ((a_provider=$1 AND a_subject=$2) OR (b_provider=$1 AND b_subject=$2))
         ORDER BY created_at DESC LIMIT $3`,
      [viewer.provider, viewer.subject, MAX_MATCHES]);

    const items = [];
    for (const row of rows) {
      const mine = row.a_provider === viewer.provider && row.a_subject === viewer.subject;
      const other = mine ? { provider: row.b_provider, subject: row.b_subject }
        : { provider: row.a_provider, subject: row.a_subject };
      const counterpart = await counterpartCard(viewer, other.provider, other.subject);
      const { rows: lastRows } = await query(
        `SELECT sender_provider, sender_subject, text, created_at
           FROM bezy_social_messages WHERE match_id=$1
           ORDER BY created_at DESC LIMIT 1`, [row.match_id]);
      const last = lastRows[0];
      const { rows: unreadRows } = await query(
        `SELECT EXISTS (SELECT 1 FROM bezy_social_messages m
           WHERE m.match_id=$1
             AND NOT (m.sender_provider=$2 AND m.sender_subject=$3)
             AND m.created_at > COALESCE((SELECT r.last_read_at FROM bezy_social_reads r
               WHERE r.match_id=$1 AND r.reader_provider=$2 AND r.reader_subject=$3),
               '-infinity'::timestamptz)) AS unread`,
        [row.match_id, viewer.provider, viewer.subject]);
      items.push({ at: last?.created_at ?? row.created_at, summary: {
        id: row.match_id,
        createdAt: isoAt(row.created_at),
        counterpart,
        lastMessage: last ? { text: last.text,
          fromMe: last.sender_provider === viewer.provider && last.sender_subject === viewer.subject,
          at: isoAt(last.created_at) } : null,
        unread: unreadRows[0]?.unread === true } });
    }
    items.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
    return res.status(200).json({ matches: items.map((item) => item.summary) });
  } catch (error) {
    console.error('social matches failed', error?.code || error?.name);
    return res.status(503).json({ error: 'SOCIAL_UNAVAILABLE' });
  }
}
