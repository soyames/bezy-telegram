// Localization and machine-identifier integrity.
//
// Two jobs, and the second matters as much as the first:
//   1. every user-visible string exists in English AND French;
//   2. localization can never reach a machine identifier — API routes, JSON keys, Firestore
//      collection names, error codes, environment variables or Telegram links.
//
// Pure static analysis of the source. No network, no Firestore, no credentials.
//
//   node tests/localization.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `  -> ${String(detail).slice(0, 300)}` : ''}`); }
}
const section = (t) => console.log(`\n== ${t} ==`);

const app = read('app.js');
const en = JSON.parse(read('locales/en.json')).app;
const fr = JSON.parse(read('locales/fr.json')).app;
const LOCALES = { en, fr };

// ---------------------------------------------------------------- catalogue health
section('Catalogue integrity');
check('English and French define exactly the same keys',
  JSON.stringify(Object.keys(en).sort()) === JSON.stringify(Object.keys(fr).sort()),
  `only in en: ${Object.keys(en).filter((k) => !(k in fr))} | only in fr: ${Object.keys(fr).filter((k) => !(k in en))}`);

for (const [lang, cat] of Object.entries(LOCALES)) {
  const empty = Object.entries(cat).filter(([, v]) => typeof v !== 'string' || !v.trim()).map(([k]) => k);
  check(`no empty or non-string values in ${lang}`, empty.length === 0, empty.join(','));
}

// A French catalogue that simply copies the English string is a silent fallback.
const identical = Object.keys(en).filter((k) => en[k] === fr[k]);
// Words that are legitimately identical in both languages.
const ALLOWED_IDENTICAL = new Set(['messages', 'super', 'premium_title', 'plan', 'language_name', 'reason_spam', 'notifications_title',
  // Language names that are spelled the same in French.
  'language_sw', 'language_yo']);
const suspicious = identical.filter((k) => !ALLOWED_IDENTICAL.has(k));
check('no French string silently duplicates the English one', suspicious.length === 0,
  suspicious.map((k) => `${k}="${en[k]}"`).join(' | '));

// ---------------------------------------------------------------- usage coverage
section('Every referenced key exists in both languages');
const staticKeys = [...app.matchAll(/t\('app\.([a-z0-9_]+)'\)/g)].map((m) => m[1]);
const missing = { en: [], fr: [] };
for (const key of new Set(staticKeys)) {
  if (!(key in en)) missing.en.push(key);
  if (!(key in fr)) missing.fr.push(key);
}
check('no statically referenced key is missing in English', missing.en.length === 0, missing.en.join(','));
check('no statically referenced key is missing in French', missing.fr.length === 0, missing.fr.join(','));
check('a meaningful number of keys are actually used', new Set(staticKeys).size > 100, String(new Set(staticKeys).size));

// Keys built at runtime, e.g. t(`app.${action}`) and t(`app.reason_${r}`). Each family is
// enumerated explicitly so a new member cannot be added without a translation.
section('Dynamically built key families are complete');
const FAMILIES = {
  'plan_': ['monthly', 'quarterly', 'yearly'],
  'reason_': ['harassment', 'spam', 'scam', 'fake_profile', 'inappropriate_content', 'underage', 'other'],
  'prompt_': ['perfect_sunday', 'i_value', 'first_date', 'should_know', 'talk_for_hours'],
  'notify_': ['matches', 'super_likes', 'messages'],
  'language_': ['en', 'fr', 'es', 'pt', 'ar', 'de', 'it', 'ru', 'sw', 'yo'],
  '': ['block', 'unmatch', 'block_confirm', 'unmatch_confirm', 'block_done', 'unmatch_done']
};
for (const [prefix, members] of Object.entries(FAMILIES)) {
  for (const member of members) {
    const key = `${prefix}${member}`;
    check(`dynamic key "${key}" exists in both languages`, Boolean(en[key]) && Boolean(fr[key]),
      `en=${Boolean(en[key])} fr=${Boolean(fr[key])}`);
  }
}

// ---------------------------------------------------------------- error codes
section('Every user-reachable error code renders in both languages');
const errorBlock = /const ERROR_KEYS = \{([\s\S]*?)\};/.exec(app)?.[1] || '';
const mapped = Object.fromEntries([...errorBlock.matchAll(/([A-Z_]{4,}):\s*'app\.([a-z0-9_]+)'/g)].map((m) => [m[1], m[2]]));
const USER_REACHABLE = [
  'RATE_LIMITED', 'PREMIUM_REQUIRED', 'AGE_CONFIRMATION_REQUIRED', 'TARGET_NOT_FOUND',
  'DATABASE_UNAVAILABLE', 'INVALID_SESSION', 'PROFILE_NOT_FOUND',
  'DISCOVERY_LIMIT_REACHED', 'SUPER_LIKE_LIMIT_REACHED', 'PROCESSING_RESTRICTED',
  'CONVERSATION_UNAVAILABLE'
];
for (const code of USER_REACHABLE) {
  const key = mapped[code];
  check(`${code} renders in both languages`, Boolean(key) && Boolean(en[key]) && Boolean(fr[key]),
    `key=${key || 'UNMAPPED'}`);
}
check('the typed delete confirmation stays the literal DELETE in every language',
  Object.values(LOCALES).every((cat) => /DELETE/.test(cat.delete_type)),
  `en="${en.delete_type}" fr="${fr.delete_type}"`);
// Removed keys must not reappear. `premium_soon` in particular claimed Premium was
// "coming soon" long after it shipped.
for (const dead of ['premium_soon', 'people_nearby', 'adults_only', 'support_bot']) {
  check(`removed key "${dead}" has not come back`,
    !(dead in en) && !(dead in fr) && !app.includes(`${dead}:`), `en=${dead in en} fr=${dead in fr}`);
}
check('the long-wait rate-limit variant keeps its {n} placeholder',
  en.rate_limited_minutes?.includes('{n}') && fr.rate_limited_minutes?.includes('{n}'));

// Prompt ids are machine tokens shared between the Mini App and the API. If the two lists
// drift, a stored answer renders as a raw token or is silently discarded on save.
section('Prompt ids are machine tokens and stay in sync');
const idList = (source, name) => {
  const raw = new RegExp(`(?:export )?const ${name} = \\[([^\\]]*)\\]`).exec(source)?.[1] || '';
  return [...raw.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
};
const apiPromptIds = idList(read('api/profile/me.js'), 'PROMPT_IDS');
const appPromptIds = idList(app, 'PROMPT_IDS');
check('the Mini App and the API agree on the prompt ids',
  apiPromptIds.length > 0 && JSON.stringify(apiPromptIds) === JSON.stringify(appPromptIds),
  `api=${apiPromptIds.join(',')} app=${appPromptIds.join(',')}`);

// The same contract for notification categories, with one addition: `account` is deliberately
// absent from the Mini App list. Transactional messages are not the user's to switch off, so a
// toggle for them must never appear.
const notify = read('api/_notify.js');
const apiOptionalCategories = [...notify.matchAll(/^ {2}([a-z_]+): \{ optional: (true|false)/gm)]
  .filter((m) => m[2] === 'true').map((m) => m[1]);
const appCategories = idList(app, 'NOTIFICATION_CATEGORIES');
check('the Mini App offers exactly the notification categories the API lets users control',
  apiOptionalCategories.length > 0 && JSON.stringify(apiOptionalCategories) === JSON.stringify(appCategories),
  `api=${apiOptionalCategories.join(',')} app=${appCategories.join(',')}`);
check('transactional notifications are not offered as a toggle', !appCategories.includes('account'));

// The same contract for support categories (CN-7): machine tokens shared between the bot
// intake, the API and the Mini App form, with a localized label per id and per status.
const supportSource = read('api/_support.js');
const apiSupportCategories = idList(supportSource, 'SUPPORT_CATEGORIES');
const appSupportCategories = idList(app, 'SUPPORT_CATEGORIES');
check('the Mini App and the API agree on the support categories',
  apiSupportCategories.length > 0 && JSON.stringify(apiSupportCategories) === JSON.stringify(appSupportCategories),
  `api=${apiSupportCategories.join(',')} app=${appSupportCategories.join(',')}`);
check('every support category has a label in both languages',
  apiSupportCategories.every((id) => en[`support_cat_${id}`] && fr[`support_cat_${id}`]),
  apiSupportCategories.filter((id) => !en[`support_cat_${id}`] || !fr[`support_cat_${id}`]).join(','));
check('every support status has a label in both languages',
  idList(supportSource, 'SUPPORT_STATUSES').every((id) => en[`support_status_${id}`] && fr[`support_status_${id}`]));
check('the support card links the canonical bot',
  /id="support-bot-btn"[^>]*href="https:\/\/t\.me\/BezyDatingBot"/.test(read('index.html')), 'bot link not found on the support card');

// The canonical bot identity cannot drift: @BezyDatingBot is a permanent decision
// (roadmap §1, ADR 0001). A bare "@BezyBot" in any file — docs, pages, scripts — is drift,
// and the decision itself must stay recorded in the roadmap.
const BOT_IDENTITY_EXTS = new Set(['.md', '.html', '.js', '.mjs', '.json', '.ps1']);
const botIdentityDrift = [];
(function walkBot(dir) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (rel === './tests/localization.test.mjs') continue; // the check's own literals
    if (entry.isDirectory()) {
      if (['node_modules', 'test-results', 'playwright-report', '.git'].includes(entry.name)) continue;
      walkBot(rel);
    } else if (BOT_IDENTITY_EXTS.has(path.extname(entry.name))) {
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      if (/BezyBot/.test(text)) botIdentityDrift.push(rel);
    }
  }
})('.');
check('no file references a bare @BezyBot — the canonical username is @BezyDatingBot',
  botIdentityDrift.length === 0, botIdentityDrift.join(','));
check('the roadmap records the permanent bot-username decision',
  /`@BezyDatingBot`\*\* — must not be changed/.test(read('docs/BEZY_MASTER_ROADMAP.md')), 'decision line not found in roadmap §1');

check('every notification category has a label in both languages',
  apiOptionalCategories.every((id) => en[`notify_${id}`] && fr[`notify_${id}`]),
  apiOptionalCategories.filter((id) => !en[`notify_${id}`] || !fr[`notify_${id}`]).join(','));
check('every prompt id has a question in both languages',
  apiPromptIds.every((id) => en[`prompt_${id}`] && fr[`prompt_${id}`]),
  apiPromptIds.filter((id) => !en[`prompt_${id}`] || !fr[`prompt_${id}`]).join(','));
check('no prompt id leaked into either catalogue as a translatable value',
  Object.values(en).concat(Object.values(fr)).every((value) => !apiPromptIds.includes(value)));

// Language ids are ISO 639-1 codes stored on profiles and preferences. If the two lists drift,
// a stored language renders as a raw code or is silently dropped on save.
const apiLanguageIds = idList(read('api/profile/me.js'), 'LANGUAGE_IDS');
const appLanguageIds = idList(app, 'LANGUAGE_IDS');
check('the Mini App and the API agree on the language ids',
  apiLanguageIds.length > 0 && JSON.stringify(apiLanguageIds) === JSON.stringify(appLanguageIds),
  `api=${apiLanguageIds.join(',')} app=${appLanguageIds.join(',')}`);
check('every language id has a display name in both languages',
  apiLanguageIds.every((id) => en[`language_${id}`] && fr[`language_${id}`]),
  apiLanguageIds.filter((id) => !en[`language_${id}`] || !fr[`language_${id}`]).join(','));
check('language ids are never themselves used as a translated value',
  Object.values(en).concat(Object.values(fr)).every((value) => !apiLanguageIds.includes(value)));
// The catalogue must name the language, not echo the code — "fr" as a display name would be
// a machine token leaking into the interface.
check('language display names are real words, not codes',
  apiLanguageIds.every((id) => en[`language_${id}`].length > 2 && fr[`language_${id}`].length > 2));
for (const [key, token] of [['why_interests', '{values}'], ['why_city', '{values}'], ['starter_interest', '{value}'], ['starter_city', '{value}']]) {
  check(`"${key}" keeps its ${token} placeholder in both languages`,
    en[key]?.includes(token) && fr[key]?.includes(token), `en="${en[key]}" fr="${fr[key]}"`);
}

// ---------------------------------------------------------------- feature coverage
section('Feature areas are covered in both languages');
const AREAS = {
  'age gate': ['age_gate_title', 'age_gate_body', 'age_confirm', 'age_deny', 'age_note', 'age_blocked_title', 'age_blocked_body'],
  premium: ['premium_intro', 'choose_plan', 'subscribe_with_stars', 'active_until', 'days_remaining', 'premium_active', 'stars_note', 'stars_needed', 'not_telegram_premium', 'premium_expired', 'premium_revoked', 'premium_lapsed_hint'],
  payment: ['preparing_checkout', 'payment_cancelled', 'payment_failed', 'payment_received', 'payment_pending', 'payment_processing'],
  deletion: ['delete_account', 'delete_explain', 'delete_retained', 'delete_type', 'delete_done_title', 'delete_done_body'],
  export: ['export_data', 'export_preparing', 'export_ready'],
  safety: ['block', 'unblock', 'report', 'unmatch', 'report_reason', 'report_send', 'report_note', 'blocked_people', 'no_blocked'],
  'empty and loading states': ['loading', 'no_matches', 'no_profiles', 'no_conversations', 'no_likes_yet', 'complete_profile', 'empty_filters', 'empty_pool', 'empty_no_supply', 'empty_eligibility', 'adjust_filters', 'check_later'],
  'rate limiting': ['rate_limited', 'rate_limited_minutes'],
  prompts: ['prompts_title', 'prompts_hint', 'prompt_placeholder', 'prompt_none', 'prompts_select_label', 'prompts_answer_label'],
  'profile preview': ['preview_profile', 'preview_title', 'preview_hint', 'preview_incomplete'],
  'why you matched': ['why_matched', 'why_interests', 'why_city', 'why_age', 'why_languages', 'why_none'],
  'conversation starters': ['starters_title', 'starters_hint', 'starter_interest', 'starter_city', 'starter_generic', 'starter_copy', 'starter_copied'],
  'notification preferences': ['notifications_title', 'notifications_hint', 'notify_matches', 'notify_super_likes', 'notify_super_likes_note', 'notify_profile_reminders', 'notify_profile_reminders_note', 'notifications_saved'],
  languages: ['languages_label', 'languages_hint', 'filter_languages', 'filter_languages_hint'],
  'restriction of processing': ['restrict_title', 'restrict_explain', 'restrict_action', 'restrict_confirm', 'restricted_badge', 'restricted_notice', 'unrestrict_action', 'restrict_done', 'unrestrict_done', 'restrict_note', 'error_processing_restricted'],
  'objection to processing': ['objection_title', 'objection_explain', 'objection_confirm', 'object_action', 'objection_badge', 'objection_notice', 'unobject_action', 'objection_done', 'unobject_done', 'objection_note'],
  'help and support': ['support_title', 'support_intro', 'support_help', 'support_formal', 'support_contact', 'support_history', 'support_history_empty', 'support_form_title', 'support_form_category', 'support_form_details', 'support_form_placeholder', 'support_submit', 'support_required', 'support_done', 'support_email', 'support_expectation'],
  'data and privacy controls': ['data_title', 'data_controls', 'data_controls_intro', 'privacy_by_design']
};
for (const [area, keys] of Object.entries(AREAS)) {
  const gaps = keys.filter((k) => !en[k] || !fr[k]);
  check(`${area} is fully localized`, gaps.length === 0, gaps.join(','));
}

// ---------------------------------------------------------------- messaging copy
section('Messaging copy describes Bezy conversations, not Telegram handoffs');
{
  const html = read('index.html');
  const localesText = [en, fr].map((catalogue) => JSON.stringify(catalogue)).join(' ');
  check('no remaining "Open Telegram chat" action anywhere',
    !app.includes('Open Telegram chat') && !html.includes('Open Telegram chat') && !localesText.includes('Open Telegram chat'),
    'a Telegram chat handoff string remains');
  check('no copy claims the conversation happens in Telegram',
    !localesText.includes('happens in Telegram') && !localesText.includes('se déroule dans Telegram'),
    'stale Telegram-conversation copy remains in a catalogue');
  check('the canonical Premium benefits include Bezy messaging in both languages',
    Boolean(en.benefit_messaging) && Boolean(fr.benefit_messaging) && en.benefit_messaging !== fr.benefit_messaging,
    `en="${en.benefit_messaging}" fr="${fr.benefit_messaging}"`);
}

// ---------------------------------------------------------------- static markup
section('No hardcoded copy in runtime-populated elements');
// Anything applyLocale() or a render function fills must ship empty. Otherwise a French user
// sees an English flash on every load, and the markup can drift out of sync with the
// catalogues — `people-label` once shipped "people nearby" after that key was deleted.
{
  const html = read('index.html');
  const RUNTIME_FILLED = [
    'discover-loading', 'premium-loading', 'people-label', 'match-label', 'new-label',
    'my-name', 'profile-status', 'my-avatar', 'prompts-hint', 'prompts-list',
    'notifications-hint', 'notification-list', 'restriction-notice', 'objection-notice', 'support-intro', 'support-formal', 'support-expectation', 'privacy-by-design',
    'chat-name', 'chat-sub', 'chat-status', 'chat-messages', 'chat-why', 'chat-locked'
  ];
  for (const id of RUNTIME_FILLED) {
    const m = new RegExp(`id="${id}"[^>]*>([^<]*)<`).exec(html);
    check(`#${id} ships empty rather than hardcoded copy`, m !== null && m[1].trim() === '',
      m ? `found ${JSON.stringify(m[1])}` : 'element not found');
  }
  // And each must actually be populated at runtime, or emptying it would leave a blank.
  const populated = new Set([...app.matchAll(/setText\('([^']+)'/g)].map((m) => m[1]));
  const byRender = ['my-name', 'profile-status', 'my-avatar', 'prompts-list', 'notification-list', 'restriction-notice', 'objection-notice', 'chat-why', 'chat-messages', 'chat-locked'];
  for (const id of RUNTIME_FILLED) {
    check(`#${id} is populated at runtime`, populated.has(id) || byRender.includes(id),
      'neither setText nor a render function fills it');
  }
}

// ---------------------------------------------------------------- machine identifiers
section('Localization never reaches a machine identifier');

// Nothing in a translation may look like a route, a URL, a JSON key or a code.
const FORBIDDEN_IN_VALUES = [
  [/\/api\//, 'an API path'],
  [/https?:\/\//, 'a URL'],
  [/tg:\/\//, 'a Telegram deep link'],
  // `delete_type` is exempt on purpose: the word DELETE is a literal the user must type,
  // and the API compares it exactly, so translating it would break the confirmation.
  // `objection_explain` names the GDPR / RGPD and its article on purpose — a legal reference
  // the user is entitled to see, not a machine token.
  [/\b[A-Z][A-Z_]{3,}\b/, 'a machine error code', ['delete_type', 'objection_explain']],
  [/\bTELEGRAM_BOT_TOKEN|FIREBASE_[A-Z_]+|BEZY_MINI_APP_URL\b/, 'an environment variable']
];
for (const [lang, cat] of Object.entries(LOCALES)) {
  for (const [pattern, what, exempt = []] of FORBIDDEN_IN_VALUES) {
    const hits = Object.entries(cat)
      .filter(([k, v]) => !exempt.includes(k) && pattern.test(v))
      .map(([k, v]) => `${k}="${v}"`);
    check(`${lang} contains no ${what}`, hits.length === 0, hits.join(' | '));
  }
}

// The API surface is one stable machine interface with canonical English paths.
const CANONICAL_ROUTES = ['/api/profile/me', '/api/discover', '/api/swipe', '/api/matches', '/api/premium', '/api/likes', '/api/relationship', '/api/account', '/api/support'];
const apiConst = /const API = \{([^}]*)\}/.exec(app)?.[1] || '';
for (const route of CANONICAL_ROUTES) {
  check(`API constant still points at ${route}`, apiConst.includes(`'${route}'`), apiConst.slice(0, 200));
}
check('the API constant contains no localized route', !/decouvrir|matchs|profil['"]|compte|abonnement/.test(apiConst), apiConst.slice(0, 200));

// The support address is a machine token: the in-app entry point and both catalogues must
// all name the same canonical address, or a user could be pointed at a lookalike.
const supportMailto = /id="support-email-btn"[^>]*href="mailto:([^"]+)"/.exec(read('index.html'))?.[1] || '';
check('the support button links to the canonical support address',
  supportMailto === 'contacts@digitalconcordia.com', supportMailto || 'element not found');
check('both catalogues name the canonical support address',
  en.rights_note.includes('contacts@digitalconcordia.com') && fr.rights_note.includes('contacts@digitalconcordia.com'));

// The outside-Telegram gate is the only path a web visitor has into the app, so it must link
// the canonical bot — a lookalike link here would hand every web visitor to an impostor.
check('the outside-Telegram gate links the canonical bot',
  /https:\/\/t\.me\/BezyDatingBot/.test(app), 'bot link not found in the gate');

// The built-in fallback catalogue renders when the locale fetch fails (the degraded-state
// e2e spec drives that path). It is generated from locales/en.json by
// scripts/sync-fallback-locale.mjs; this check pins that it cannot drift.
const fallbackBlock = /BEGIN fallback catalogue[\s\S]*?\n {6}app: (\{.*\}),\n {6}\/\/ END fallback catalogue/.exec(app);
check('the built-in fallback catalogue is present in app.js', Boolean(fallbackBlock), 'marker block not found');
if (fallbackBlock) {
  let fallbackKeys = [];
  try { fallbackKeys = Object.keys(JSON.parse(fallbackBlock[1])); } catch (error) { check(`fallback catalogue parses`, false, error.message); }
  check('the fallback catalogue holds exactly the English catalogue keys',
    JSON.stringify(fallbackKeys) === JSON.stringify(Object.keys(en)),
    fallbackKeys.filter((k) => !(k in en)).concat(Object.keys(en).filter((k) => !fallbackKeys.includes(k))).join(','));
}

// Route files on disk must stay language-neutral.
const apiFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel);
    else if (entry.name.endsWith('.js')) apiFiles.push(rel);
  }
})('api');
const localizedRouteFiles = apiFiles.filter((f) => /decouvrir|matchs|profil\.js|compte|abonnement|parametres/.test(f));
check('no localized API route file exists on disk', localizedRouteFiles.length === 0, localizedRouteFiles.join(','));
check('the expected route files are all present',
  CANONICAL_ROUTES.every((r) => apiFiles.includes(`${r.slice(1)}.js`)),
  CANONICAL_ROUTES.filter((r) => !apiFiles.includes(`${r.slice(1)}.js`)).join(',') || 'all present');

// JSON keys crossing the API boundary are language-neutral by contract.
section('API contract fields stay language-neutral');
const CONTRACT_FIELDS = ['telegramId', 'username', 'firstName', 'photoUrl', 'profileComplete', 'discoverable', 'createdAt', 'updatedAt'];
const apiSource = apiFiles.map((f) => read(f)).join('\n');
for (const field of CONTRACT_FIELDS) {
  check(`contract field ${field} is present and unlocalized`, apiSource.includes(field), '');
}
const FIRESTORE_COLLECTIONS = ['users', 'matches', 'actions', 'likesReceived', 'bezyPremium', 'usage', 'bezyInvoices', 'bezyPayments', 'reports', 'blocks', 'rateLimits'];
for (const col of FIRESTORE_COLLECTIONS) {
  check(`Firestore identifier "${col}" still used verbatim`, apiSource.includes(col), '');
}

// Telegram links are built from the stored handle, never from a translated string.
section('Telegram links are built from data, not from translations');
// Bezy conversations (ADR 0009): no user-targeted t.me link is built from data anymore —
// conversations open inside the Mini App. The only remaining Telegram links are the static
// canonical bot entry points pinned elsewhere in this suite.
check('no user-targeted t.me link is built from data anymore',
  !/https:\/\/t\.me\/\$\{/.test(app) && !/t\.me\/\$\{button\.dataset\.chat\}/.test(app),
  'a data-built t.me link remains in app.js');
check('no translation is interpolated into a link', !/href="\$\{t\(/.test(app) && !/t\.me\/\$\{t\(/.test(app));
check('legal links carry the language as a query parameter, not a translated path',
  /\/privacy\?lang=\$\{state\.lang\}/.test(app) && /\/terms\?lang=\$\{state\.lang\}/.test(app));

// ---------------------------------------------------------------- photo architecture
section('Telegram is the only photo source');
const PHOTO_FORBIDDEN = [
  [/firebase-admin\/storage|getStorage\(/, 'Firebase Storage'],
  [/cloudinary/i, 'Cloudinary'],
  [/aws-sdk|s3\.upload|S3Client/i, 'S3'],
  [/@vercel\/blob|vercel\/blob/i, 'Vercel Blob'],
  [/multer|formidable|busboy/i, 'a file-upload middleware'],
  [/data:image\/[a-z]+;base64/i, 'an inline base64 image']
];
const allSource = [app, apiSource, read('index.html')].join('\n');
for (const [pattern, what] of PHOTO_FORBIDDEN) {
  check(`no ${what} anywhere in the app`, !pattern.test(allSource), '');
}
check('the only stored photo reference is the Telegram-provided URL',
  /photoUrl: user\.photo_url \|\| ''/.test(read('api/profile/me.js')),
  'profile endpoint no longer stores photo_url verbatim');
check('no image bytes are ever written to Firestore',
  !/photoData|photoBytes|imageBuffer|photoBase64/.test(allSource));
check('package.json declares no image or storage dependency',
  !/cloudinary|aws-sdk|@vercel\/blob|sharp|multer|jimp/.test(read('package.json')),
  read('package.json').replace(/\s+/g, ' ').slice(0, 200));

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (failures.length) console.log('Failed:\n - ' + failures.join('\n - '));
process.exit(fail ? 1 : 0);
