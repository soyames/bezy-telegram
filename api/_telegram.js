import crypto from 'node:crypto';

export function validateInitData(initData) {
  const params = new URLSearchParams(initData || '');
  const hash = params.get('hash');
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!hash || !token) return null;

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const calculated = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (calculated.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(hash))) return null;

  const authDate = Number(params.get('auth_date'));
  const now = Date.now() / 1000;
  if (!Number.isFinite(authDate) || now - authDate > 86400 || now - authDate < -60) return null;

  try {
    return JSON.parse(params.get('user') || 'null');
  } catch {
    return null;
  }
}

export function requirePost(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return false;
  }
  return true;
}

export function requireTelegramUser(req, res) {
  const user = validateInitData(req.body?.initData);
  if (!user?.id) {
    res.status(401).json({ error: 'Invalid Telegram session' });
    return null;
  }
  return user;
}

export async function telegramApi(method, body) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.description || `Telegram API error: ${method}`);
  return data.result;
}

export const MINI_APP_URL = process.env.BEZY_MINI_APP_URL || 'https://bezy-telegram.vercel.app';

export function miniAppUrl(view) {
  return view ? `${MINI_APP_URL}?view=${encodeURIComponent(view)}` : MINI_APP_URL;
}

export function telegramUserLink(user) {
  if (user?.username) return `https://t.me/${user.username}`;
  return `tg://user?id=${user?.telegramId || user?.id}`;
}

export function normalizedLanguage(languageCode) {
  return String(languageCode || '').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export async function configureLocalizedCommands() {
  const scope = { type: 'all_private_chats' };
  const english = [
    { command: 'start', description: 'Start Bezy' },
    { command: 'help', description: 'How Bezy works' },
    { command: 'profile', description: 'My profile' },
    { command: 'discover', description: 'Discover people' },
    { command: 'matches', description: 'My matches' },
    { command: 'premium', description: 'Bezy Premium' },
    { command: 'settings', description: 'Settings' }
  ];
  const french = [
    { command: 'demarrer', description: 'Démarrer Bezy' },
    { command: 'aide', description: 'Comment fonctionne Bezy' },
    { command: 'profil', description: 'Mon profil' },
    { command: 'decouvrir', description: 'Découvrir des personnes' },
    { command: 'matchs', description: 'Mes matchs' },
    { command: 'premium', description: 'Bezy Premium' },
    { command: 'parametres', description: 'Paramètres' }
  ];
  await Promise.all([
    telegramApi('setMyCommands', { commands: english, scope, language_code: 'en' }),
    telegramApi('setMyCommands', { commands: french, scope, language_code: 'fr' }),
    telegramApi('setMyCommands', { commands: english, scope })
  ]);
}
