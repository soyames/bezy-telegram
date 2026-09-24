import { validateInitData } from '../_telegram.js';

const PI_ME = 'https://api.minepi.com/v2/me';

// App Studio serves a Pi app from per-app hosts that change whenever the app is
// regenerated: a preview on <something>.vusercontent.net and the published app on
// <app>.pinet.com. Listing those by exact origin alone means the app silently loses
// every API call the moment the host moves, so they are matched by suffix instead.
// Override with BEZY_PI_ORIGIN_SUFFIXES (comma separated, '' to disable) to tighten this.
const DEFAULT_ORIGIN_SUFFIXES = 'vusercontent.net,pinet.com';

function matchesOriginSuffix(origin, suffixes) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export function cors(req, res) {
  const origin = req.headers?.origin;
  if (!origin) return true;
  // Requests from the API's own deployment (the Telegram mini app posts to the same
  // origin) are always allowed: browsers attach Origin to same-origin POSTs, and
  // refusing them would break every write from the mini app itself.
  const ownHost = req.headers?.host;
  if (ownHost && (origin === `https://${ownHost}` || origin === `http://${ownHost}`)) return true;
  const allowed = (process.env.BEZY_PI_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (process.env.BEZY_MINI_APP_URL) allowed.push(process.env.BEZY_MINI_APP_URL);
  const configured = process.env.BEZY_PI_ORIGIN_SUFFIXES;
  const suffixes = (configured === undefined ? DEFAULT_ORIGIN_SUFFIXES : configured)
    .split(',').map((s) => s.trim().toLowerCase().replace(/^\./, '')).filter(Boolean);
  if (!allowed.includes(origin) && !matchesOriginSuffix(origin, suffixes)) return false;
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
