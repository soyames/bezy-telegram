import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { put, get, del } from '@vercel/blob';
import { mediaQuery as query } from './_db.js';
import { cors, mediaIdentity, sameMember } from './_auth.js';
import { photoAccess } from './_access.js';

const MAX_BYTES = 3 * 1024 * 1024; // beneath Vercel Function's 4.5 MB request limit
const TYPES = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;

function format(bytes) {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff,0xd8,0xff]))) return 'jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
  if (bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') return 'webp';
  return null;
}

async function readLimited(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new RangeError('PHOTO_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (!cors(req, res)) return res.status(403).json({ error: 'ORIGIN_DENIED' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET','POST','DELETE'].includes(req.method)) return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    const viewer = await mediaIdentity(req);
    if (!viewer) return res.status(401).json({ error: 'INVALID_SESSION' });
    if (req.method === 'POST') {
      const registered = await query(`SELECT adult_confirmed FROM bezy_media_members
        WHERE provider=$1 AND subject=$2`, [viewer.provider,viewer.subject]);
      if (!registered.rows[0]?.adult_confirmed)
        return res.status(403).json({ error: 'ADULT_CONFIRMATION_REQUIRED' });
      const current = await query(`SELECT count(*)::int AS count FROM bezy_media_photos WHERE owner_provider=$1 AND owner_subject=$2`,
        [viewer.provider,viewer.subject]);
      if (current.rows[0].count >= 6) return res.status(409).json({ error: 'PHOTO_LIMIT' });
      const bytes = await readLimited(req);
      const kind = format(bytes);
      if (!bytes.length || !kind || req.headers['content-type'] !== TYPES[kind])
        return res.status(415).json({ error: 'INVALID_IMAGE' });
      const id = crypto.randomUUID();
      const name = crypto.createHash('sha256').update(viewer.subject).digest('hex');
      const blob = await put(`bezy/${viewer.provider}/${name}/${id}.${kind}`, bytes,
        { access: 'private', contentType: TYPES[kind], addRandomSuffix: true });
      try {
        await query(`INSERT INTO bezy_media_photos (photo_id,owner_provider,owner_subject,blob_url,content_type)
          VALUES ($1,$2,$3,$4,$5)`, [id,viewer.provider,viewer.subject,blob.url,TYPES[kind]]);
      } catch (error) {
        await del(blob.url).catch(() => {});
        throw error;
      }
      return res.status(201).json({ id });
    }
    if (req.method === 'DELETE' && req.query?.all === '1') {
      await query(`UPDATE bezy_media_members SET discoverable=false, photo_consent=false
        WHERE provider=$1 AND subject=$2`, [viewer.provider,viewer.subject]);
      const owned = await query(`SELECT blob_url FROM bezy_media_photos
        WHERE owner_provider=$1 AND owner_subject=$2`, [viewer.provider,viewer.subject]);
      for (const row of owned.rows) await del(row.blob_url);
      await query(`DELETE FROM bezy_media_photos WHERE owner_provider=$1 AND owner_subject=$2`,
        [viewer.provider,viewer.subject]);
      return res.status(204).end();
    }
    const id = String(req.query?.id || '');
    if (req.method === 'DELETE' && !UUID.test(id)) return res.status(400).json({ error: 'INVALID_PHOTO_ID' });
    if (req.method === 'GET' && !id) {
      const provider = req.query?.provider || viewer.provider;
      const subject = req.query?.subject || viewer.subject;
      if (!['pi','telegram'].includes(provider) || typeof subject !== 'string' || subject.length > 128)
        return res.status(400).json({ error: 'INVALID_OWNER' });
      const owner = { provider,subject };
      if (!(await photoAccess(viewer,owner))) return res.status(404).json({ error: 'PHOTO_NOT_FOUND' });
      const { rows } = await query(`SELECT photo_id AS id FROM bezy_media_photos
        WHERE owner_provider=$1 AND owner_subject=$2 ORDER BY created_at LIMIT 6`, [provider,subject]);
      return res.status(200).json({ photos: rows });
    }
    if (!UUID.test(id)) return res.status(400).json({ error: 'INVALID_PHOTO_ID' });
    const { rows } = await query(`SELECT owner_provider,owner_subject,blob_url,content_type
      FROM bezy_media_photos WHERE photo_id=$1`, [id]);
    const photo = rows[0];
    if (!photo) return res.status(404).json({ error: 'PHOTO_NOT_FOUND' });
    const owner = { provider:photo.owner_provider,subject:photo.owner_subject };
    if (req.method === 'DELETE') {
      if (!sameMember(viewer,owner)) return res.status(403).json({ error: 'FORBIDDEN' });
      await del(photo.blob_url);
      await query('DELETE FROM bezy_media_photos WHERE photo_id=$1', [id]);
      return res.status(204).end();
    }
    if (!(await photoAccess(viewer,owner))) return res.status(404).json({ error: 'PHOTO_NOT_FOUND' });
    const blob = await get(photo.blob_url, { access:'private' });
    if (!blob || blob.statusCode !== 200) return res.status(404).json({ error: 'PHOTO_NOT_FOUND' });
    res.setHeader('Content-Type',photo.content_type);
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    return Readable.fromWeb(blob.stream).pipe(res);
  } catch (error) {
    if (error instanceof RangeError) return res.status(413).json({ error:'PHOTO_TOO_LARGE' });
    console.error('media transfer failed',error?.code || error?.name);
    return res.status(503).json({ error:'MEDIA_UNAVAILABLE' });
  }
}

export const config = { api: { bodyParser: false } };
