import { validateInitData } from '../_telegram.js';

const PI_ME = 'https://api.minepi.com/v2/me';

export function cors(req, res) {
  const origin = req.headers?.origin;
  if (!origin) return true;
  const allowed = (process.env.BEZY_PI_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,X-Telegram-Init-Data,Content-Type');
  return true;
}

export async function mediaIdentity(req) {
  const header = req.headers?.authorization || '';
  if (header.startsWith('Pi ') && header.length < 2100) {
    const result = await fetch(PI_ME, {
      headers: { Authorization: `Bearer ${header.slice(3)}` },
      signal: AbortSignal.timeout(8000)
    });
    if (!result.ok) return null;
    const data = await result.json();
    return typeof data.uid === 'string' && data.uid.length <= 128 && data.uid.length > 0
      ? { provider: 'pi', subject: data.uid } : null;
  }
  const telegram = validateInitData(req.headers?.['x-telegram-init-data']);
  return Number.isSafeInteger(telegram?.id) && telegram.id > 0
    ? { provider: 'telegram', subject: String(telegram.id) } : null;
}

export function sameMember(a, b) {
  return a.provider === b.provider && a.subject === b.subject;
}
