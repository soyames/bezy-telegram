import { query, cors, mediaIdentity, isoAt, isUuid, isClientId, cleanText, MAX_MESSAGE } from './_helpers.js';

// Conversation history and sends. Only an active match's participants may read or write,
// and a message is identified by the client's own id so a retry can never duplicate it.

const MAX_WINDOW = 200;
const RATE_LIMIT = 10;

async function activeMatch(viewer, matchId) {
  const { rows } = await query(
    `SELECT match_id FROM bezy_social_matches WHERE match_id=$1 AND active
       AND ((a_provider=$2 AND a_subject=$3) OR (b_provider=$2 AND b_subject=$3))`,
    [matchId, viewer.provider, viewer.subject]);
  return rows[0] || null;
}

/** Accepts epoch milliseconds or an ISO timestamp; null when unusable. */
function afterMs(value) {
  if (value === undefined || value === null || value === '') return null;
  const raw = String(value);
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return Math.round(numeric);
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export default async function handler(req, res) {
  if (!cors(req, res)) return res.status(403).json({ error: 'ORIGIN_DENIED' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST')
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    const viewer = await mediaIdentity(req);
    if (!viewer) return res.status(401).json({ error: 'INVALID_SESSION' });

    if (req.method === 'GET') {
      const matchId = req.query?.match;
      if (!isUuid(matchId) || !(await activeMatch(viewer, matchId)))
        return res.status(404).json({ error: 'CONVERSATION_UNAVAILABLE' });
      const since = afterMs(req.query?.after);
      const params = [matchId];
      let window = 'match_id=$1';
      if (since !== null) {
        params.push(since);
        window += ` AND created_at > to_timestamp($2::double precision / 1000.0)`;
      }
      const { rows } = await query(
        `SELECT client_id, sender_provider, sender_subject, text, created_at
           FROM bezy_social_messages WHERE ${window}
           ORDER BY created_at ASC LIMIT ${MAX_WINDOW}`, params);
      return res.status(200).json({ messages: rows.map((row) => ({
        id: row.client_id,
        fromMe: row.sender_provider === viewer.provider && row.sender_subject === viewer.subject,
        text: row.text,
        at: isoAt(row.created_at) })) });
    }

    const matchId = req.body?.match;
    if (!isUuid(matchId)) return res.status(400).json({ error: 'INVALID_MATCH' });
    if (!(await activeMatch(viewer, matchId)))
      return res.status(404).json({ error: 'CONVERSATION_UNAVAILABLE' });

    if (req.body?.read === true) {
      await query(`INSERT INTO bezy_social_reads (match_id,reader_provider,reader_subject,last_read_at)
         VALUES ($1,$2,$3,now())
         ON CONFLICT (match_id,reader_provider,reader_subject) DO UPDATE SET last_read_at=now()`,
        [matchId, viewer.provider, viewer.subject]);
      return res.status(204).end();
    }

    const clientId = req.body?.clientId;
    if (!isClientId(clientId)) return res.status(400).json({ error: 'INVALID_MESSAGE' });
    const text = cleanText(req.body?.text, MAX_MESSAGE);
    if (!text) return res.status(400).json({ error: 'INVALID_MESSAGE' });

    const { rows: recent } = await query(
      `SELECT count(*)::int AS count FROM bezy_social_messages
         WHERE match_id=$1 AND sender_provider=$2 AND sender_subject=$3
           AND created_at > now() - interval '1 minute'`,
      [matchId, viewer.provider, viewer.subject]);
    if (recent[0].count >= RATE_LIMIT) return res.status(429).json({ error: 'RATE_LIMITED' });

    await query(`INSERT INTO bezy_social_messages (match_id,client_id,sender_provider,sender_subject,text)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (match_id,client_id) DO NOTHING`,
      [matchId, clientId, viewer.provider, viewer.subject, text]);
    // Re-read rather than trusting RETURNING: a replayed clientId resolves to the row
    // that already exists, so the client's optimistic bubble reconciles with one truth.
    const { rows } = await query(
      `SELECT client_id, sender_provider, sender_subject, text, created_at
         FROM bezy_social_messages WHERE match_id=$1 AND client_id=$2`, [matchId, clientId]);
    const message = rows[0];
    if (!message) return res.status(404).json({ error: 'CONVERSATION_UNAVAILABLE' });
    return res.status(201).json({ message: { id: message.client_id,
      fromMe: message.sender_provider === viewer.provider && message.sender_subject === viewer.subject,
      text: message.text, at: isoAt(message.created_at) } });
  } catch (error) {
    console.error('social messages failed', error?.code || error?.name);
    return res.status(503).json({ error: 'SOCIAL_UNAVAILABLE' });
  }
}
