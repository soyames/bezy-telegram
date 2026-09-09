// Local test harness: reproduces Vercel's routing so the real API handlers and the real
// Mini App can be exercised end to end without deploying.
//
// Credentials are read from the environment only:
//   BEZY_SERVICE_ACCOUNT  path to a Firebase service-account JSON (local only, never committed)
//   or FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
//
// The bot token defaults to a local test value; initData issued here is signed with that
// same value, so validateInitData() runs for real without needing the production secret.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (process.env.BEZY_SERVICE_ACCOUNT) {
  const sa = JSON.parse(fs.readFileSync(process.env.BEZY_SERVICE_ACCOUNT, 'utf8'));
  process.env.FIREBASE_PROJECT_ID = sa.project_id;
  process.env.FIREBASE_CLIENT_EMAIL = sa.client_email;
  process.env.FIREBASE_PRIVATE_KEY = sa.private_key;
}
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '111111:LOCAL-TEST-BOT-TOKEN';

export const TEST_USERS = {
  a: { id: 900000001, first_name: 'Ada', last_name: 'Test', username: 'ada_bezy_test', language_code: 'en' },
  b: { id: 900000002, first_name: 'Bo', last_name: 'Test', username: 'bo_bezy_test', language_code: 'fr' },
  c: { id: 900000003, first_name: 'Cy', last_name: 'Test', username: 'cy_bezy_test', language_code: 'en' },
  d: { id: 900000004, first_name: 'Dee', last_name: 'Test', username: 'dee_bezy_test', language_code: 'en' }
};

export function makeInitData(user, botToken = process.env.TELEGRAM_BOT_TOKEN) {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('query_id', 'AAH_local_test');
  params.set('user', JSON.stringify(user));
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex'));
  return params.toString();
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

function tgStub(initData, user, port) {
  return `window.Telegram = { WebApp: {
  initData: ${JSON.stringify(initData)},
  initDataUnsafe: { user: ${JSON.stringify(user)} },
  version: '8.0', platform: 'android', colorScheme: 'light', themeParams: {},
  ready(){}, expand(){}, disableVerticalSwipes(){},
  openTelegramLink(u){ window.__lastTelegramLink = u; },
  openLink(u){ window.__lastTelegramLink = u; },
  // Simulates the native Stars sheet. The status is whatever the test asked for; the app
  // must still confirm entitlement with the backend rather than trusting it.
  openInvoice(url, cb){
    window.__lastInvoiceUrl = url;
    const status = window.__invoiceStatus || 'paid';
    if (status === 'paid' && window.__payHook) { fetch(window.__payHook, {method:'POST'}).then(()=>cb && cb(status)); }
    else setTimeout(()=>cb && cb(status), 50);
  },
  HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}},
  MainButton:{show(){},hide(){},setText(){},onClick(){},offClick(){}},
  BackButton:{show(){},hide(){},onClick(){},offClick(){}}
} };`;
}

const handlerCache = new Map();
async function loadHandler(routePath) {
  if (!handlerCache.has(routePath)) {
    const file = path.join(ROOT, 'api', `${routePath}.js`);
    if (!fs.existsSync(file)) return null;
    const mod = await import(pathToFileURL(file).href);
    handlerCache.set(routePath, mod.default);
  }
  return handlerCache.get(routePath);
}

function vercelRes(res) {
  const shim = {
    statusCode: 200,
    status(code) { shim.statusCode = code; return shim; },
    setHeader(k, v) { res.setHeader(k, v); return shim; },
    json(payload) { res.writeHead(shim.statusCode, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(payload)); return shim; },
    send(payload) { res.writeHead(shim.statusCode); res.end(payload); return shim; },
    end(payload) { res.end(payload); return shim; }
  };
  return shim;
}

export function startHarness({ port = 3310 } = {}) {
  const telegramCalls = [];
  const realFetch = globalThis.fetch;

  // Outbound Telegram Bot API calls are captured instead of sent. Stars invoice links and
  // pre-checkout answers are therefore observable without touching a live bot.
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.telegram.org/')) {
      const method = String(url).split('/').pop();
      let body = null;
      try { body = JSON.parse(init?.body || 'null'); } catch { /* ignore */ }
      telegramCalls.push({ method, body });
      const result = method === 'createInvoiceLink'
        ? `https://t.me/$test_invoice_${encodeURIComponent(body?.payload || '')}`
        : { message_id: telegramCalls.length };
      return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return realFetch(url, init);
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === '/__test-users') {
      const payload = Object.fromEntries(Object.entries(TEST_USERS).map(([k, u]) => [k, { user: u, initData: makeInitData(u) }]));
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(payload));
    }
    if (pathname === '/__tg-stub.js') {
      const user = TEST_USERS[url.searchParams.get('as') || 'a'] || TEST_USERS.a;
      res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' });
      return res.end(tgStub(makeInitData(user), user, port));
    }
    if (pathname === '/__telegram-calls') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(telegramCalls));
    }
    if (pathname === '/__reset-telegram-calls') {
      telegramCalls.length = 0;
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end('{"ok":true}');
    }

    if (pathname.startsWith('/api/')) {
      const routePath = pathname.slice('/api/'.length).replace(/\/$/, '');
      const handler = await loadHandler(routePath);
      if (!handler) { res.writeHead(404); return res.end('No such function'); }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      req.body = raw ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : undefined;
      req.query = Object.fromEntries(url.searchParams);
      try { await handler(req, vercelRes(res)); }
      catch (error) {
        console.error(`[api ${routePath}]`, error);
        if (!res.headersSent) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String(error?.message || error) })); }
      }
      return;
    }

    if (pathname === '/') pathname = '/index.html';
    if (pathname === '/privacy' || pathname === '/terms') pathname += '/index.html';
    const file = path.join(ROOT, pathname);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }

    const ext = path.extname(file).toLowerCase();
    if (ext === '.html') {
      const who = url.searchParams.get('as') || 'a';
      const html = fs.readFileSync(file, 'utf8').replace(
        /<script src="https:\/\/telegram\.org\/js\/telegram-web-app\.js"><\/script>/,
        `<script src="/__tg-stub.js?as=${encodeURIComponent(who)}"></script>`
      );
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(html);
    }
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve({
      port,
      telegramCalls,
      url: `http://localhost:${port}`,
      close: () => new Promise((done) => { globalThis.fetch = realFetch; server.close(done); })
    }));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const port = Number(process.env.PORT || 3310);
  startHarness({ port }).then(() => console.log(`[bezy-harness] http://localhost:${port}`));
}
