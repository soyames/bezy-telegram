// Focused suite for user-generated profile-content translation (api/_profileText.js).
//
// The pure detection/gating/hash parts are pinned by the contract suite; this file pins the
// behaviour around them: viewer-locale targeting for all 17 locales, original preservation,
// caching, edited-content invalidation, non-Latin scripts, and graceful provider failure.
// No Firestore and no external network — the translation provider is a local HTTP server
// whose responses carry the target locale, and Firestore is a tiny in-memory double.

import http from 'node:http';
import { localizeProfileTexts, TRANSLATABLE_LOCALES, hashFor } from '../api/_profileText.js';

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `  -> ${String(detail).slice(0, 240)}` : ''}`); }
}
function section(title) { console.log(`\n== ${title} ==`); }

// ------------------------------------------------------------------ doubles

// Mirrors the document chain localizeProfileTexts uses: users/{id}/profileTranslations/{key}.
function fakeFirestore() {
  const store = new Map();
  return {
    store,
    collection: (name) => ({
      doc: (id) => ({
        collection: (sub) => ({
          doc: (docId) => {
            const key = `${name}/${id}/${sub}/${docId}`;
            return {
              get: async () => (store.has(key) ? { exists: true, data: () => ({ ...store.get(key) }) } : { exists: false, data: () => null }),
              set: async (value) => { store.set(key, { ...value }); }
            };
          }
        })
      })
    })
  };
}

// The provider records every request and answers in translate_a/single shape with a
// `[<target>] <text>` payload, so tests observe exactly which locale pair was requested.
const requests = [];
let failing = false;
const provider = http.createServer((req, res) => {
  if (failing) { res.writeHead(500); return res.end('provider unavailable'); }
  const url = new URL(req.url, 'http://127.0.0.1');
  requests.push({ sl: url.searchParams.get('sl'), tl: url.searchParams.get('tl'), q: url.searchParams.get('q') });
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify([[[`[${url.searchParams.get('tl')}] ${url.searchParams.get('q')}`]], null, url.searchParams.get('sl')]));
});
await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
const ENDPOINT = `http://127.0.0.1:${provider.address().port}/t?sl={sl}&tl={tl}&q={q}`;
process.env.BEZY_TRANSLATE_ENDPOINT = ENDPOINT;

const FRENCH = 'Je ne perds mon temps pour une cause sans vision';
const ENGLISH = "I don't waste my time on a cause without a vision";
const SWAHILI = 'Sipotezi muda wangu kwa jambo lisilo na maono';
const YORUBA = 'Mi ò fi àkókò mi ṣòfò fún ọ̀ràn tí kò ní ìràn';

// ------------------------------------------------------------- viewer matrix

section('viewer locale matrix');
{
  // 1. English viewer + French profile: both free-text fields translated, originals intact.
  const db = fakeFirestore();
  requests.length = 0;
  const promptAnswer = 'Je ne perds pas mon temps pour une cause sans vision';
  const profile = { bio: FRENCH, prompts: [{ id: 'should_know', answer: promptAnswer }] };
  const before = JSON.stringify(profile);
  const out = await localizeProfileTexts(db, 'u-owner', profile, 'en');
  check('bio translated for an en viewer', out.bio?.text === `[en] ${FRENCH}` && out.bio.sourceLang === 'fr', JSON.stringify(out.bio));
  check('prompt translated under its own key', out['prompt:should_know']?.text === `[en] ${promptAnswer}`, JSON.stringify(out));
  check('the profile object itself is never mutated', JSON.stringify(profile) === before);
  check('provider received the detected source and the viewer target', requests.length === 2 && requests.every((r) => r.sl === 'fr' && r.tl === 'en'), JSON.stringify(requests));
}

{
  // 2. French viewer + French profile: original only, no translation, no provider call.
  const db = fakeFirestore();
  requests.length = 0;
  const out = await localizeProfileTexts(db, 'u', { bio: FRENCH, prompts: [{ id: 'should_know', answer: FRENCH }] }, 'fr');
  check('fr viewer sees fr content untranslated', Object.keys(out).length === 0);
  check('no provider call for a same-language profile', requests.length === 0, String(requests.length));
}

{
  // 3. German viewer + English profile: the target is the viewer locale.
  const db = fakeFirestore();
  requests.length = 0;
  const out = await localizeProfileTexts(db, 'u', { bio: ENGLISH }, 'de');
  check('en bio translated to de', out.bio?.text === `[de] ${ENGLISH}` && out.bio.sourceLang === 'en', JSON.stringify(out));
  check('provider received tl=de', requests.length === 1 && requests[0].tl === 'de');
}

// 4. Every supported viewer locale reaches the provider with that locale as the target —
//    the deck must never silently fall back to English for a supported locale.
for (const locale of TRANSLATABLE_LOCALES) {
  const db = fakeFirestore();
  requests.length = 0;
  const profile = { bio: locale === 'en' ? FRENCH : ENGLISH };
  const out = await localizeProfileTexts(db, 'u', profile, locale);
  check(`viewer locale ${locale} targets ${locale}, not en`,
    out.bio?.text === `[${locale}] ${profile.bio}` && requests.length === 1 && requests[0].tl === locale,
    `got ${JSON.stringify(out)}`);
}

section('non-Latin source content');
{
  const db = fakeFirestore();
  requests.length = 0;
  const out = await localizeProfileTexts(db, 'u', { bio: SWAHILI }, 'en');
  check('Swahili source translates for an en viewer', out.bio?.text === `[en] ${SWAHILI}` && out.bio.sourceLang === 'sw', JSON.stringify(out));
  check('provider received sl=sw', requests.length === 1 && requests[0].sl === 'sw');
}
{
  const db = fakeFirestore();
  requests.length = 0;
  const out = await localizeProfileTexts(db, 'u', { bio: YORUBA }, 'de');
  check('Yoruba source translates for a de viewer', out.bio?.text === `[de] ${YORUBA}` && out.bio.sourceLang === 'yo', JSON.stringify(out));
  check('provider received sl=yo', requests.length === 1 && requests[0].sl === 'yo');
}
{
  // CJK/Cyrillic/Arabic/Devanagari text is not Latin-spaced: it must still pass the gate
  // and be detected by script, not silently skipped.
  const samples = [
    ['最近、楽しんでいることは何ですか？', 'ja'],
    ['요즘 즐기고 있는 것이 무엇인가요?', 'ko'],
    ['最近有什么让你乐在其中的事？', 'zh'],
    ['Что тебе нравится делать в последнее время?', 'ru'],
    ['ما الشيء الذي تستمتع به مؤخرًا؟', 'ar'],
    ['हाल ही में आप किस चीज़ का आनंद ले रहे हैं?', 'hi']
  ];
  for (const [text, source] of samples) {
    const db = fakeFirestore();
    requests.length = 0;
    const out = await localizeProfileTexts(db, 'u', { bio: text }, 'en');
    check(`${source} text is translated for an en viewer`,
      out.bio?.text === `[en] ${text}` && out.bio.sourceLang === source && requests.length === 1 && requests[0].sl === source,
      `got ${JSON.stringify(out)}`);
  }
}

section('nothing to translate');
{
  const db = fakeFirestore();
  requests.length = 0;
  const out = await localizeProfileTexts(db, 'u', { bio: '', prompts: [{ id: 'should_know', answer: '🙂🙂🙂' }] }, 'en');
  const out2 = await localizeProfileTexts(db, 'u', { bio: 'https://bezy.example/x?y=1' }, 'de');
  const out3 = await localizeProfileTexts(db, 'u', { bio: 'Salut' }, 'de');
  const out4 = await localizeProfileTexts(db, 'u', { bio: null, prompts: null }, 'de');
  check('empty, emoji-only, URL-only, one-word and null content attach nothing and never reach the provider',
    [out, out2, out3, out4].every((o) => Object.keys(o).length === 0) && requests.length === 0,
    `calls=${requests.length}`);
}

section('caching');
{
  const db = fakeFirestore();
  requests.length = 0;
  const first = await localizeProfileTexts(db, 'u', { bio: FRENCH }, 'en');
  const second = await localizeProfileTexts(db, 'u', { bio: FRENCH }, 'en');
  check('a second view reuses the cached translation', first.bio?.text === second.bio?.text);
  check('provider called exactly once across two views', requests.length === 1, String(requests.length));
}
{
  // 9. Edited profile text: the hash is content-bound, so the stale entry is never served.
  const db = fakeFirestore();
  requests.length = 0;
  await localizeProfileTexts(db, 'u', { bio: FRENCH }, 'en');
  const edited = 'Je ne perds pas mon temps pour une cause sans vision';
  const out = await localizeProfileTexts(db, 'u', { bio: edited }, 'en');
  check('edited text gets a fresh translation', out.bio?.text === `[en] ${edited}`, JSON.stringify(out));
  check('provider called again for the edited text', requests.length === 2, String(requests.length));
  check('the cache keys differ between the two versions', hashFor(FRENCH) !== hashFor(edited));
}
{
  // A cached entry whose recorded source disagrees with detection is discarded, not served.
  const db = fakeFirestore();
  requests.length = 0;
  await localizeProfileTexts(db, 'u', { bio: FRENCH }, 'en');
  db.store.set(`users/u/profileTranslations/${hashFor(FRENCH)}|en`, { text: 'STALE', sourceLang: 'es', target: 'en' });
  const out = await localizeProfileTexts(db, 'u', { bio: FRENCH }, 'en');
  check('a sourceLang mismatch re-translates instead of serving stale text',
    out.bio?.text === `[en] ${FRENCH}` && out.bio.text !== 'STALE', JSON.stringify(out));
}

section('provider failure degrades to the original');
{
  const quietWarn = console.warn;
  console.warn = () => {};
  failing = true;
  const db = fakeFirestore();
  const out = await localizeProfileTexts(db, 'u', { bio: FRENCH }, 'en');
  failing = false;
  check('an HTTP failure attaches nothing and never throws', Object.keys(out).length === 0);

  process.env.BEZY_TRANSLATE_ENDPOINT = 'http://127.0.0.1:1/closed?sl={sl}&tl={tl}&q={q}';
  const out2 = await localizeProfileTexts(fakeFirestore(), 'u', { bio: FRENCH }, 'en');
  process.env.BEZY_TRANSLATE_ENDPOINT = ENDPOINT;
  check('an unreachable provider attaches nothing and never throws', Object.keys(out2).length === 0);
  console.warn = quietWarn;
}

provider.close();
console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (fail) { console.log('Failed:\n - ' + failures.join('\n - ')); process.exit(1); }
