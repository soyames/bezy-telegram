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

export function normalizedLanguage(languageCode) {
  // The legacy five-locale resolver is upgraded to the full 17-locale system: every bot,
  // notification and payment message now follows the same normalization as the Mini App.
  // Unsupported languages still fall back to English — the resolution chain above
  // (normalizeLanguageTag → resolveLanguage) remains the only other step.
  return normalizeLanguageTag(languageCode) || 'en';
}

// The five supported Bezy locales. Machine values — never translated, never extended by a
// regional tag: the canonical Bezy locale stays the two-letter code.
export const SUPPORTED_LOCALES = ['en', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'pl', 'ar', 'tr', 'sw', 'yo', 'hi', 'id', 'zh', 'ja', 'ko'];

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
export function localized(language, { en, fr, de, es, it, pt, ru, pl, ar, tr, sw, yo, hi, id, zh, ja, ko }) {
  const variants = { fr, de, es, it, pt, ru, pl, ar, tr, sw, yo, hi, id, zh, ja, ko };
  return variants[language] || en;
}

// Command registration is a deployment concern, not a per-user one: the 18 setMyCommands
// calls run once per serverless process (a cold start re-registers), never on every /start.
let commandsConfigured = false;
export async function configureLocalizedCommands() {
  if (commandsConfigured) return;
  commandsConfigured = true;
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
  // The twelve global-rollout locales keep the stable English command words with
  // translated descriptions: with 17 locales, per-locale command words would multiply
  // collision and typo risk for no user benefit — Telegram's command menu shows the
  // descriptions in the user's language.
  const described = (lang, descriptions) => [
    { command: 'start', description: descriptions.start },
    { command: 'help', description: descriptions.help },
    { command: 'profile', description: descriptions.profile },
    { command: 'discover', description: descriptions.discover },
    { command: 'matches', description: descriptions.matches },
    { command: 'premium', description: descriptions.premium },
    { command: 'settings', description: descriptions.settings },
    { command: 'support', description: descriptions.support }
  ];
  const GLOBAL_DESCRIPTIONS = {
    pt: { start: 'Iniciar o Bezy', help: 'Como o Bezy funciona', profile: 'O meu perfil', discover: 'Descobrir pessoas', matches: 'Os meus matches', premium: 'Bezy Premium', settings: 'Definições', support: 'Ajuda e apoio' },
    ru: { start: 'Начать с Bezy', help: 'Как работает Bezy', profile: 'Мой профиль', discover: 'Знакомиться с людьми', matches: 'Мои мэтчи', premium: 'Bezy Premium', settings: 'Настройки', support: 'Помощь и поддержка' },
    pl: { start: 'Zacznij z Bezy', help: 'Jak działa Bezy', profile: 'Mój profil', discover: 'Odkrywaj ludzi', matches: 'Moje dopasowania', premium: 'Bezy Premium', settings: 'Ustawienia', support: 'Pomoc i wsparcie' },
    ar: { start: 'ابدأ مع Bezy', help: 'كيف يعمل Bezy', profile: 'ملفي الشخصي', discover: 'اكتشف أشخاصًا', matches: 'المطابقات الخاصة بي', premium: 'Bezy Premium', settings: 'الإعدادات', support: 'المساعدة والدعم' },
    tr: { start: 'Bezy\'ye başla', help: 'Bezy nasıl çalışır', profile: 'Profilim', discover: 'İnsanları keşfet', matches: 'Eşleşmelerim', premium: 'Bezy Premium', settings: 'Ayarlar', support: 'Yardım ve destek' },
    sw: { start: 'Anza na Bezy', help: 'Jinsi Bezy inavyofanya kazi', profile: 'Wasifu wangu', discover: 'Gundua watu', matches: 'Mechi zangu', premium: 'Bezy Premium', settings: 'Mipangilio', support: 'Msaada na usaidizi' },
    yo: { start: 'Bẹ̀rẹ̀ pẹ̀lú Bezy', help: 'Bí Bezy ṣe ń ṣiṣẹ́', profile: 'Àkọọ́lẹ̀ mi', discover: 'Ṣàwárí àwọn ènìyàn', matches: 'Àwọn mátíìsì mi', premium: 'Bezy Premium', settings: 'Ìtòlẹ́sẹẹsẹ', support: 'Ìrànlọ́wọ́ àti àtìlẹ́yìn' },
    hi: { start: 'Bezy शुरू करें', help: 'Bezy कैसे काम करता है', profile: 'मेरी प्रोफ़ाइल', discover: 'लोगों को खोजें', matches: 'मेरे मैच', premium: 'Bezy Premium', settings: 'सेटिंग्स', support: 'सहायता और समर्थन' },
    id: { start: 'Mulai Bezy', help: 'Cara kerja Bezy', profile: 'Profil saya', discover: 'Temukan orang', matches: 'Kecocokan saya', premium: 'Bezy Premium', settings: 'Pengaturan', support: 'Bantuan dan dukungan' },
    zh: { start: '开始使用 Bezy', help: 'Bezy 如何运作', profile: '我的个人资料', discover: '发现新朋友', matches: '我的配对', premium: 'Bezy Premium', settings: '设置', support: '帮助与支持' },
    ja: { start: 'Bezy を始める', help: 'Bezy の仕組み', profile: 'マイプロフィール', discover: '人を見つける', matches: 'マイマッチ', premium: 'Bezy Premium', settings: '設定', support: 'ヘルプとサポート' },
    ko: { start: 'Bezy 시작하기', help: 'Bezy 이용 방법', profile: '내 프로필', discover: '사람 발견하기', matches: '내 매치', premium: 'Bezy Premium', settings: '설정', support: '도움말 및 지원' }
  };
  await Promise.all([
    telegramApi('setMyCommands', { commands: english, scope, language_code: 'en' }),
    telegramApi('setMyCommands', { commands: french, scope, language_code: 'fr' }),
    telegramApi('setMyCommands', { commands: german, scope, language_code: 'de' }),
    telegramApi('setMyCommands', { commands: spanish, scope, language_code: 'es' }),
    telegramApi('setMyCommands', { commands: italian, scope, language_code: 'it' }),
    ...Object.entries(GLOBAL_DESCRIPTIONS).map(([lang, descriptions]) =>
      telegramApi('setMyCommands', { commands: described(lang, descriptions), scope, language_code: lang })),
    telegramApi('setMyCommands', { commands: english, scope })
  ]);
}
