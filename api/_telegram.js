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
    res.status(401).json({ error: 'INVALID_SESSION' });
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
  const code = String(languageCode || '').toLowerCase();
  if (code.startsWith('fr')) return 'fr';
  if (code.startsWith('de')) return 'de';
  if (code.startsWith('es')) return 'es';
  if (code.startsWith('it')) return 'it';
  return 'en';
}

// The five supported Bezy locales. Machine values — never translated, never extended by a
// regional tag: the canonical Bezy locale stays the two-letter code.
export const SUPPORTED_LOCALES = ['en', 'fr', 'de', 'es', 'it'];

/**
 * Normalizes a BCP 47-style language tag ('en-US', 'fr_BE', 'de-AT', 'es-419') to its Bezy
 * locale. Malformed tags and unsupported languages resolve to '', so they fall through to
 * the next resolution tier instead of being stored or shown.
 */
export function normalizeLanguageTag(code) {
  const primary = String(code ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LOCALES.includes(primary) ? primary : '';
}

/**
 * The deterministic resolution order shared by the Mini App and the API:
 *   1. the user's explicit Bezy language choice (manual selection — never overridden);
 *   2. the Telegram language;
 *   3. the device/browser language (first supported entry of the browser's preferred list);
 *   4. English.
 * Unsupported values fall through to the next tier, so a Portuguese Telegram with a French
 * device resolves to French, and nothing ever returns a raw tag or null.
 */
export function resolveLanguage({ explicit = null, telegram = null, browser = null } = {}) {
  const explicitTag = normalizeLanguageTag(explicit);
  if (explicitTag) return explicitTag;
  const telegramTag = normalizeLanguageTag(telegram);
  if (telegramTag) return telegramTag;
  const browsers = Array.isArray(browser) ? browser : [browser];
  for (const code of browsers) {
    const tag = normalizeLanguageTag(code);
    if (tag) return tag;
  }
  return 'en';
}

/**
 * The server-side view of a user's language: their explicit Bezy choice (`locale`, written
 * by the Mini App selector) outranks the Telegram language recorded on their document.
 * Used by every notification path, where only stored user data is available.
 */
export function resolveUserLanguage(userData = {}) {
  return resolveLanguage({ explicit: userData?.locale, telegram: userData?.languageCode });
}

/**
 * Picks the localized variant for a normalized language code. English is the reference
 * locale and the fallback; French, German, Spanish and Italian overrides are explicit.
 * Used by every bot message, notification and invoice label so a user in any supported
 * locale never lands on English copy.
 */
export function localized(language, { en, fr, de, es, it }) {
  if (language === 'fr' && fr) return fr;
  if (language === 'de' && de) return de;
  if (language === 'es' && es) return es;
  if (language === 'it' && it) return it;
  return en;
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
    { command: 'settings', description: 'Settings' },
    { command: 'support', description: 'Help & support' }
  ];
  const french = [
    { command: 'demarrer', description: 'Démarrer Bezy' },
    { command: 'aide', description: 'Comment fonctionne Bezy' },
    { command: 'profil', description: 'Mon profil' },
    { command: 'decouvrir', description: 'Découvrir des personnes' },
    { command: 'matchs', description: 'Mes matchs' },
    { command: 'premium', description: 'Bezy Premium' },
    { command: 'parametres', description: 'Paramètres' },
    { command: 'assistance', description: 'Aide et assistance' }
  ];
  const german = [
    { command: 'start', description: 'Bezy starten' },
    { command: 'hilfe', description: 'So funktioniert Bezy' },
    { command: 'profil', description: 'Mein Profil' },
    { command: 'entdecken', description: 'Personen entdecken' },
    { command: 'matches', description: 'Meine Matches' },
    { command: 'premium', description: 'Bezy Premium' },
    { command: 'einstellungen', description: 'Einstellungen' },
    { command: 'support', description: 'Hilfe & Support' }
  ];
  const spanish = [
    { command: 'empezar', description: 'Iniciar Bezy' },
    { command: 'ayuda', description: 'Cómo funciona Bezy' },
    { command: 'perfil', description: 'Mi perfil' },
    { command: 'descubrir', description: 'Descubrir personas' },
    { command: 'matches', description: 'Mis matches' },
    { command: 'premium', description: 'Bezy Premium' },
    { command: 'ajustes', description: 'Configuración' },
    { command: 'soporte', description: 'Ayuda y soporte' }
  ];
  const italian = [
    { command: 'start', description: 'Inizia Bezy' },
    { command: 'aiuto', description: 'Come funziona Bezy' },
    { command: 'profilo', description: 'Il mio profilo' },
    { command: 'scopri', description: 'Scopri persone' },
    { command: 'matches', description: 'I miei match' },
    { command: 'premium', description: 'Bezy Premium' },
    { command: 'impostazioni', description: 'Impostazioni' },
    { command: 'assistenza', description: 'Aiuto e supporto' }
  ];
  await Promise.all([
    telegramApi('setMyCommands', { commands: english, scope, language_code: 'en' }),
    telegramApi('setMyCommands', { commands: french, scope, language_code: 'fr' }),
    telegramApi('setMyCommands', { commands: german, scope, language_code: 'de' }),
    telegramApi('setMyCommands', { commands: spanish, scope, language_code: 'es' }),
    telegramApi('setMyCommands', { commands: italian, scope, language_code: 'it' }),
    telegramApi('setMyCommands', { commands: english, scope })
  ]);
}
