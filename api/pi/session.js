import { requirePiUser } from './_identity.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  const user = await requirePiUser(req, res);
  if (!user) return;
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ uid: user.uid, username: user.username });
}
