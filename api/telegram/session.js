import { requirePost, requireTelegramUser } from '../_telegram.js';

export default function handler(req, res) {
  if (!requirePost(req, res)) return;
  const user = requireTelegramUser(req, res);
  if (!user) return;
  return res.status(200).json({ ok: true, user });
}
