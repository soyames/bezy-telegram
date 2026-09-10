// Production smoke test.
//
// Answers one question after a deploy: is the live service actually serving the current
// build and refusing unauthenticated access? Read-only, unauthenticated, and it never
// touches Firestore or production data — it cannot create, mutate or delete anything.
//
//   node tests/smoke.test.mjs                                   # production
//   BEZY_SMOKE_URL=http://localhost:3310 node tests/smoke.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.BEZY_SMOKE_URL || 'https://bezy-telegram.vercel.app').replace(/\/$/, '');

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `  -> ${String(detail).slice(0, 200)}` : ''}`); }
}
const section = (t) => console.log(`\n== ${t} ==`);

async function get(pathname) {
  const res = await fetch(BASE + pathname, { redirect: 'follow' });
  return { status: res.status, text: await res.text(), headers: res.headers };
}
async function post(pathname, body = {}) {
  const res = await fetch(BASE + pathname, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

console.log(`Smoke testing ${BASE}\n`);

section('The app is being served');
const app = await get('/app.js');
check('/app.js responds 200', app.status === 200, String(app.status));
const index = await get('/');
check('/ responds 200', index.status === 200, String(index.status));
check('the Mini App loads the Telegram SDK', /telegram-web-app\.js/.test(index.text));
check('the Bezy icon is referenced', /assets\/bezy-icon\.png/.test(index.text));

section('The deployed build matches this working tree');
// A deploy that silently served a stale build would pass every other check, so the live
// bundle is compared against markers taken from the local source.
const localApp = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const MARKERS = ['bezyReady', 'ERROR_KEYS', 'openMatchActions', 'exportMyData', 'openDeleteAccount', 'confirmAge'];
for (const marker of MARKERS) {
  const inLocal = localApp.includes(marker);
  check(`"${marker}" present locally and live`, inLocal && app.text.includes(marker),
    `local=${inLocal} live=${app.text.includes(marker)}`);
}

section('Locales are served and internally consistent');
// The live catalogues are checked against each other and against the live bundle — not
// against the working tree. Local being ahead of production is normal between deploys and
// is reported as drift below, not as a failure.
const live = {};
for (const lang of ['en', 'fr']) {
  const res = await get(`/locales/${lang}.json`);
  check(`/locales/${lang}.json responds 200`, res.status === 200, String(res.status));
  try { live[lang] = JSON.parse(res.text).app; } catch { live[lang] = null; }
  check(`/locales/${lang}.json is valid JSON`, Boolean(live[lang]));
  if (live[lang]) {
    const empty = Object.entries(live[lang]).filter(([, v]) => typeof v !== 'string' || !v.trim()).map(([k]) => k);
    check(`live ${lang} catalogue has no empty values`, empty.length === 0, empty.join(','));
  }
}
if (live.en && live.fr) {
  const onlyEn = Object.keys(live.en).filter((k) => !(k in live.fr));
  const onlyFr = Object.keys(live.fr).filter((k) => !(k in live.en));
  check('live EN and FR catalogues have identical keys', onlyEn.length === 0 && onlyFr.length === 0,
    `only en: ${onlyEn.join(',')} | only fr: ${onlyFr.join(',')}`);

  // Every key the *live* bundle asks for must exist in the *live* catalogue. This is the
  // condition that would show users a raw translation key in production.
  const referenced = [...new Set([...app.text.matchAll(/t\('app\.([a-z0-9_]+)'\)/g)].map((m) => m[1]))];
  for (const lang of ['en', 'fr']) {
    const missing = referenced.filter((k) => !(k in live[lang]));
    check(`live ${lang} catalogue covers every key the live app references`, missing.length === 0,
      missing.slice(0, 8).join(','));
  }
}

section('Deploy freshness (informational)');
{
  const localEn = JSON.parse(fs.readFileSync(path.join(ROOT, 'locales/en.json'), 'utf8')).app;
  const ahead = live.en ? Object.keys(localEn).filter((k) => !(k in live.en)) : [];
  const behind = live.en ? Object.keys(live.en).filter((k) => !(k in localEn)) : [];
  if (ahead.length) console.log(`  INFO  working tree is ahead of production by ${ahead.length} key(s): ${ahead.slice(0, 6).join(', ')}`);
  if (behind.length) console.log(`  INFO  production has ${behind.length} key(s) not in the working tree: ${behind.slice(0, 6).join(', ')}`);
  if (!ahead.length && !behind.length) console.log('  INFO  production locales match the working tree');
  console.log('  INFO  drift is expected between deploys and is not a failure');
}

section('Legal pages are live');
for (const [route, marker] of [['/privacy', 'DIGITAL CONCORDIA'], ['/terms', 'DIGITAL CONCORDIA']]) {
  const res = await get(route);
  check(`${route} responds 200`, res.status === 200, String(res.status));
  check(`${route} names the operator`, res.text.includes(marker));
  check(`${route} does not carry the CONDORDIA typo`, !res.text.includes('CONDORDIA'));
}

section('The API refuses unauthenticated access');
// Every endpoint must reject a request with no valid Telegram initData. This is the check
// that would catch a catastrophic auth regression reaching production.
for (const route of ['/api/profile/me', '/api/discover', '/api/swipe', '/api/matches',
  '/api/premium', '/api/likes', '/api/relationship', '/api/account']) {
  const res = await post(route, {});
  check(`POST ${route} rejects no credentials`, res.status === 401,
    `${res.status}:${JSON.stringify(res.data).slice(0, 80)}`);
}
for (const route of ['/api/discover', '/api/premium', '/api/account']) {
  const res = await post(route, { initData: 'user=%7B%22id%22%3A1%7D&hash=deadbeef' });
  check(`POST ${route} rejects a forged signature`, res.status === 401, String(res.status));
}

section('Method and error hygiene');
const wrongMethod = await get('/api/discover');
check('GET on a POST-only route returns 405', wrongMethod.status === 405, String(wrongMethod.status));
const unauth = await post('/api/discover', {});
check('errors are machine codes, not prose or stack traces',
  /^[A-Z_]+$/.test(String(unauth.data.error || '')), JSON.stringify(unauth.data));
check('no internal detail leaks in an error body',
  !/firestore|firebase|at |Error:|node_modules/i.test(JSON.stringify(unauth.data)), JSON.stringify(unauth.data));

section('The webhook is reachable and guarded');
const webhookGet = await get('/api/telegram/webhook');
check('GET on the webhook returns 405', webhookGet.status === 405, String(webhookGet.status));

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (failures.length) console.log('Failed:\n - ' + failures.join('\n - '));
process.exit(fail ? 1 : 0);
