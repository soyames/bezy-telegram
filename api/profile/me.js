import crypto from 'node:crypto';
import { db } from '../_firebase.js';

function telegramUser(initData) {
  const params = new URLSearchParams(initData || '');
  const hash = params.get('hash');
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!hash || !token) return null;
  params.delete('hash');
  const check = [...params.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const calculated = crypto.createHmac('sha256', secret).update(check).digest('hex');
  if (calculated.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(hash))) return null;
  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || Date.now()/1000 - authDate > 86400 || Date.now()/1000 - authDate < -60) return null;
  try { return JSON.parse(params.get('user') || 'null'); } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = telegramUser(req.body?.initData);
  if (!user?.id) return res.status(401).json({ error: 'Invalid Telegram session' });

  const ref = db().collection('users').doc(String(user.id));
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      telegramId: user.id,
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      username: user.username || '',
      languageCode: user.language_code || '',
      isPremiumTelegram: Boolean(user.is_premium),
      createdAt: new Date(),
      updatedAt: new Date()
    });
  } else {
    await ref.update({
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      username: user.username || '',
      languageCode: user.language_code || '',
      isPremiumTelegram: Boolean(user.is_premium),
      updatedAt: new Date()
    });
  }

  return res.status(200).json({ ok: true, userId: String(user.id), profile: snap.exists ? snap.data() : null });
}
