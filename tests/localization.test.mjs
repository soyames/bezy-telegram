// Localization and machine-identifier integrity.
//
// Two jobs, and the second matters as much as the first:
//   1. every user-visible string exists in English, French, German, Spanish AND Italian;
//   2. localization can never reach a machine identifier — API routes, JSON keys, PostgreSQL
//      collection names, error codes, environment variables or Telegram links.
//
// English is the reference locale: the four other catalogues must cover exactly the
// English key surface, and none may silently duplicate the English string (a copied string
// is a silent fallback, not a translation). The bot, notification and checkout strings live
// in api/ and follow the same five-language rule through `localized()`.
//
// Static analysis of the source plus unit tests of the shared language-resolution functions
// (imported from api/_telegram.js). No network, no PostgreSQL, no credentials.
//
//   node tests/localization.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeLanguageTag, resolveLanguage, resolveUserLanguage, normalizedLanguage, SUPPORTED_LOCALES } from '../api/_telegram.js';

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
const de = JSON.parse(read('locales/de.json')).app;
const es = JSON.parse(read('locales/es.json')).app;
const it = JSON.parse(read('locales/it.json')).app;
const pt = JSON.parse(read('locales/pt.json')).app;
const ru = JSON.parse(read('locales/ru.json')).app;
const pl = JSON.parse(read('locales/pl.json')).app;
const ar = JSON.parse(read('locales/ar.json')).app;
const tr = JSON.parse(read('locales/tr.json')).app;
const sw = JSON.parse(read('locales/sw.json')).app;
const yo = JSON.parse(read('locales/yo.json')).app;
const hi = JSON.parse(read('locales/hi.json')).app;
const id = JSON.parse(read('locales/id.json')).app;
const zh = JSON.parse(read('locales/zh.json')).app;
const ja = JSON.parse(read('locales/ja.json')).app;
const ko = JSON.parse(read('locales/ko.json')).app;
const LOCALES = { en, fr, de, es, it, pt, ru, pl, ar, tr, sw, yo, hi, id, zh, ja, ko };
const LOCALE_NAMES = { fr: 'French', de: 'German', es: 'Spanish', it: 'Italian', pt: 'Portuguese', ru: 'Russian', pl: 'Polish', ar: 'Arabic', tr: 'Turkish', sw: 'Swahili', yo: 'Yoruba', hi: 'Hindi', id: 'Indonesian', zh: 'Chinese', ja: 'Japanese', ko: 'Korean' };
const EN_KEYS = Object.keys(en).sort();
const keyDelta = (cat) => ({
  onlyInEn: EN_KEYS.filter((k) => !(k in cat)),
  onlyInCat: Object.keys(cat).filter((k) => !(k in en))
});

// ---------------------------------------------------------------- catalogue health
section('Catalogue integrity');
for (const lang of Object.keys(LOCALE_NAMES)) {
  const delta = keyDelta(LOCALES[lang]);
  check(`English and ${LOCALE_NAMES[lang]} define exactly the same keys`,
    delta.onlyInEn.length === 0 && delta.onlyInCat.length === 0,
    `only in en: ${delta.onlyInEn} | only in ${lang}: ${delta.onlyInCat}`);
}

for (const [lang, cat] of Object.entries(LOCALES)) {
  const empty = Object.entries(cat).filter(([, v]) => typeof v !== 'string' || !v.trim()).map(([k]) => k);
  check(`no empty or non-string values in ${lang}`, empty.length === 0, empty.join(','));
}

// A catalogue that simply copies the English string is a silent fallback, not a translation.
// Each language gets its own whitelist of words that are legitimately spelled identically.
const SHARED_LOANWORDS = ['super', 'premium_title', 'reason_spam', 'support_cat_premium', 'language_hi', 'language_yo'];
const ALLOWED_IDENTICAL = {
  fr: new Set(['messages', 'super', 'premium_title', 'plan', 'language_name', 'reason_spam', 'notifications_title',
    'original_label', 'language_sw', 'language_yo', 'language_hi']),
  de: new Set(['super', 'plan', 'matches', 'like', 'support_cat_likes_matches', 'premium_title', 'reason_spam', 'support_cat_premium',
    'original_label', 'language_yo', 'language_hi']),
  es: new Set(['super', 'plan', 'matches', 'like', 'match_score', 'premium_title', 'reason_spam',
    'legal_privacy', 'original_label', 'language_yo', 'language_hi']),
  it: new Set(['super', 'like', 'match_score', 'premium_title', 'reason_spam', 'support_cat_premium',
    'privacy', 'language_sw', 'language_yo', 'language_hi']),
  pt: new Set(['super', 'like', 'match_score', 'matches', 'legal_privacy', 'original_label', 'premium_title', 'reason_spam', 'support_cat_premium', ...SHARED_LOANWORDS]),
  ru: new Set(['super', 'premium_title', 'reason_spam', 'support_cat_premium', 'language_hi', 'language_yo']),
  pl: new Set(['super', 'plan', 'premium_title', 'reason_spam', 'support_cat_premium', 'language_hi', 'language_yo']),
  ar: new Set(['super', 'premium_title', 'reason_spam', 'support_cat_premium', 'language_hi', 'language_yo']),
  tr: new Set(['super', 'plan', 'non_binary', 'premium_title', 'reason_spam', 'support_cat_premium', 'language_hi', 'language_yo']),
  sw: new Set(['super', 'premium_title', 'reason_spam', 'support_cat_premium', 'language_hi', 'language_yo']),
  yo: new Set(['super', 'premium_title', 'reason_spam', 'support_cat_premium', 'language_hi', 'language_yo', 'language_sw']),
  hi: new Set(['super', 'premium_title', 'reason_spam', 'support_cat_premium', 'language_hi', 'language_yo']),
  id: new Set(['super', 'premium_title', 'reason_spam', 'support_cat_premium', 'language_hi', 'language_yo', 'language_sw']),
  zh: new Set(['super', 'premium_title', 'reason_spam', 'support_cat_premium', 'language_hi', 'language_yo']),
  ja: new Set(['super', 'premium_title', 'reason_spam', 'support_cat_premium', 'language_hi', 'language_yo']),
  ko: new Set(['super', 'premium_title', 'reason_spam', 'support_cat_premium', 'language_hi', 'language_yo'])
};
for (const lang of Object.keys(LOCALE_NAMES)) {
  const identical = Object.keys(en).filter((k) => en[k] === LOCALES[lang][k]);
  const suspicious = identical.filter((k) => !ALLOWED_IDENTICAL[lang].has(k));
  check(`no ${LOCALE_NAMES[lang]} string silently duplicates the English one`, suspicious.length === 0,
    suspicious.map((k) => `${k}="${en[k]}"`).join(' | '));
}

// ---------------------------------------------------------------- usage coverage
section('Every referenced key exists in every language');
const staticKeys = [...app.matchAll(/t\('app\.([a-z0-9_]+)'\)/g)].map((m) => m[1]);
const missing = Object.fromEntries(Object.keys(LOCALES).map((lang) => [lang, []]));
for (const key of new Set(staticKeys)) {
  for (const lang of Object.keys(LOCALES)) if (!(key in LOCALES[lang])) missing[lang].push(key);
}
for (const lang of Object.keys(LOCALES)) {
  check(`no statically referenced key is missing in ${lang === 'en' ? 'English' : LOCALE_NAMES[lang]}`,
    missing[lang].length === 0, missing[lang].join(','));
}
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
    check(`dynamic key "${key}" exists in every language`,
      Object.values(LOCALES).every((cat) => Boolean(cat[key])),
      Object.entries(LOCALES).filter(([, cat]) => !cat[key]).map(([lang]) => lang).join(','));
  }
}

// ---------------------------------------------------------------- error codes
section('Every user-reachable error code renders in every language');
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
  check(`${code} renders in every language`,
    Boolean(key) && Object.values(LOCALES).every((cat) => Boolean(cat[key])),
    `key=${key || 'UNMAPPED'}`);
}
check('the typed delete confirmation stays the literal DELETE in every language',
  Object.values(LOCALES).every((cat) => /DELETE/.test(cat.delete_type)),
  `en="${en.delete_type}" fr="${fr.delete_type}" de="${de.delete_type}"`);
// Removed keys must not reappear. `premium_soon` in particular claimed Premium was
// "coming soon" long after it shipped.
for (const dead of ['premium_soon', 'people_nearby', 'adults_only', 'support_bot']) {
  check(`removed key "${dead}" has not come back`,
    Object.values(LOCALES).every((cat) => !(dead in cat)) && !app.includes(`${dead}:`),
    Object.entries(LOCALES).filter(([, cat]) => dead in cat).map(([lang]) => lang).join(','));
}
check('the long-wait rate-limit variant keeps its {n} placeholder',
  Object.values(LOCALES).every((cat) => cat.rate_limited_minutes?.includes('{n}')));

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
check('every support category has a label in every language',
  apiSupportCategories.every((id) => Object.values(LOCALES).every((cat) => cat[`support_cat_${id}`])),
  apiSupportCategories.filter((id) => Object.entries(LOCALES).some(([, cat]) => !cat[`support_cat_${id}`])).join(','));
check('every support status has a label in every language',
  idList(supportSource, 'SUPPORT_STATUSES').every((id) => Object.values(LOCALES).every((cat) => cat[`support_status_${id}`])));
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
// The roadmap is a private, gitignored document (owner decision: docs/ is never published).
// When it exists locally it must record the decision; a fresh clone without it must still pass.
const roadmap = (() => { try { return read('docs/BEZY_MASTER_ROADMAP.md'); } catch { return ''; } })();
check('the roadmap records the permanent bot-username decision when present',
  !roadmap || /`@BezyDatingBot`\*\* — must not be changed/.test(roadmap), 'decision line not found in roadmap §1');

check('every notification category has a label in every language',
  apiOptionalCategories.every((id) => Object.values(LOCALES).every((cat) => cat[`notify_${id}`])),
  apiOptionalCategories.filter((id) => Object.entries(LOCALES).some(([, cat]) => !cat[`notify_${id}`])).join(','));
check('every prompt id has a question in every language',
  apiPromptIds.every((id) => Object.values(LOCALES).every((cat) => cat[`prompt_${id}`])),
  apiPromptIds.filter((id) => Object.entries(LOCALES).some(([, cat]) => !cat[`prompt_${id}`])).join(','));
check('no prompt id leaked into any catalogue as a translatable value',
  Object.values(LOCALES).flatMap(Object.values).every((value) => !apiPromptIds.includes(value)));

// Language ids are ISO 639-1 codes stored on profiles and preferences. If the two lists drift,
// a stored language renders as a raw code or is silently dropped on save.
const apiLanguageIds = idList(read('api/profile/me.js'), 'LANGUAGE_IDS');
const appLanguageIds = idList(app, 'LANGUAGE_IDS');
check('the Mini App and the API agree on the language ids',
  apiLanguageIds.length > 0 && JSON.stringify(apiLanguageIds) === JSON.stringify(appLanguageIds),
  `api=${apiLanguageIds.join(',')} app=${appLanguageIds.join(',')}`);
check('every language id has a display name in every language',
  apiLanguageIds.every((id) => Object.values(LOCALES).every((cat) => cat[`language_${id}`])),
  apiLanguageIds.filter((id) => Object.entries(LOCALES).some(([, cat]) => !cat[`language_${id}`])).join(','));
check('language ids are never themselves used as a translated value',
  Object.values(LOCALES).flatMap(Object.values).every((value) => !apiLanguageIds.includes(value)));
// The catalogue must name the language, not echo the code — "fr" as a display name would be
// a machine token leaking into the interface. CJK names like 中文 are two characters long
// but are words, not codes, so a bare two-letter lowercase ASCII code is what is banned.
check('language display names are real words, not codes',
  apiLanguageIds.every((id) => Object.values(LOCALES).every((cat) => {
    const name = cat[`language_${id}`];
    return name.length >= 2 && !/^[a-z]{2}$/.test(name);
  })));
for (const [key, token] of [['why_interests', '{values}'], ['why_city', '{values}'], ['starter_interest', '{value}'], ['starter_city', '{value}']]) {
  check(`"${key}" keeps its ${token} placeholder in every language`,
    Object.values(LOCALES).every((cat) => cat[key]?.includes(token)),
    Object.entries(LOCALES).map(([lang, cat]) => `${lang}="${cat[key]}"`).join(' | '));
}

// THIS OR THAT — the question bank is a list of MACHINE IDENTIFIERS in api/_thisorthat.js.
// Both option labels live in the catalogues under tot_q_<id>_a / _b, which is what lets two
// participants reading Bezy in different languages take part in the same canonical round.
// A question added to the bank without seventeen translations fails here rather than
// rendering a raw token to someone.
section('This or That: every canonical question is playable in every language');
{
  const bank = read('api/_thisorthat.js');
  const bankIds = [...bank.matchAll(/\{ id: '([a-z0-9_]+)', category: '([a-z_]+)' \}/g)].map((m) => m[1]);
  check('the question bank parses and is the curated 30', bankIds.length === 30, String(bankIds.length));
  for (const option of ['a', 'b']) {
    const gaps = bankIds.filter((id) => Object.values(LOCALES).some((cat) => !cat[`tot_q_${id}_${option}`]));
    check(`every question has option ${option} in all seventeen languages`, gaps.length === 0, gaps.join(','));
  }
  check('no catalogue holds a label for a question that is not in the bank',
    Object.entries(LOCALES).every(([, cat]) => Object.keys(cat).filter((k) => k.startsWith('tot_q_'))
      .every((k) => bankIds.includes(k.replace(/^tot_q_/, '').replace(/_[ab]$/, '')))),
    Object.keys(en).filter((k) => k.startsWith('tot_q_') && !bankIds.includes(k.replace(/^tot_q_/, '').replace(/_[ab]$/, ''))).join(','));
  check('the two options of a question are never the same string',
    bankIds.every((id) => Object.values(LOCALES).every((cat) => cat[`tot_q_${id}_a`] !== cat[`tot_q_${id}_b`])),
    bankIds.filter((id) => Object.values(LOCALES).some((cat) => cat[`tot_q_${id}_a`] === cat[`tot_q_${id}_b`])).join(','));
  check('no question id leaked into a catalogue as a translatable value',
    Object.values(LOCALES).flatMap(Object.values).every((value) => !bankIds.includes(value)));
  // v1 deliberately avoids sensitive territory. The English bank is the reference: a
  // question that names any of these would have to be a deliberate product decision.
  const SENSITIVE = /\b(religio|politic|ethnic|race|salary|income|trauma|immigration|visa|criminal|illness|disease|therapy|sex|alcohol|beer|wine|drug)/i;
  const sensitive = bankIds.filter((id) => SENSITIVE.test(`${en[`tot_q_${id}_a`]} ${en[`tot_q_${id}_b`]}`));
  check('the v1 bank stays out of sensitive territory', sensitive.length === 0, sensitive.join(','));
  // Placeholders the game copy interpolates at render time.
  for (const [key, tokens] of [['tot_state_waiting', ['{name}']], ['tot_progress', ['{n}', '{total}']],
    ['tot_same', ['{choice}']], ['tot_different', ['{mine}', '{name}', '{theirs}']],
    ['tot_summary_same', ['{n}']], ['tot_summary_different', ['{n}']],
    ['tot_waiting_body', ['{name}']], ['tot_waiting_question', ['{name}']], ['tot_talk_message', ['{a}', '{b}']]]) {
    check(`"${key}" keeps its placeholders in every language`,
      Object.values(LOCALES).every((cat) => tokens.every((token) => cat[key]?.includes(token))),
      Object.entries(LOCALES).filter(([, cat]) => !tokens.every((token) => cat[key]?.includes(token))).map(([lang]) => lang).join(','));
  }
  // No score, no percentage, no ranking language anywhere in the game copy — in any language.
  const gameCopy = Object.values(LOCALES).flatMap((cat) => Object.entries(cat).filter(([k]) => k.startsWith('tot_')).map(([, v]) => v));
  check('the game copy never claims a score or a percentage',
    gameCopy.every((value) => !/%|\bscore\b|\bpoints?\b|\bxp\b|\bstreak\b/i.test(value)),
    gameCopy.filter((value) => /%|\bscore\b|\bpoints?\b|\bxp\b|\bstreak\b/i.test(value)).join(' | '));
}

// ---------------------------------------------------------------- feature coverage
section('Feature areas are covered in every language');
const AREAS = {
  'age gate': ['age_gate_title', 'age_gate_body', 'age_confirm', 'age_deny', 'age_note', 'age_blocked_title', 'age_blocked_body', 'age_status_title', 'age_self_declared'],
  'home screen': ['home_screen_title', 'home_screen_body', 'home_screen_add', 'home_screen_added'],
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
  'conversation starters': ['starters_title', 'starters_hint', 'starter_interest', 'starter_city', 'starter_languages', 'starter_generic', 'starter_copy', 'starter_copied', 'starter_universal_1', 'starter_universal_2', 'starter_universal_3'],
  'this or that': ['tot_title', 'tot_play', 'tot_intro', 'tot_optional_note', 'tot_start', 'tot_new_round', 'tot_state_your_turn', 'tot_state_waiting', 'tot_state_results', 'tot_state_completed', 'tot_answer', 'tot_see_results', 'tot_view', 'tot_progress', 'tot_final_note', 'tot_waiting_body', 'tot_waiting_question', 'tot_same', 'tot_different', 'tot_different_note', 'tot_summary_same', 'tot_summary_different', 'tot_talk_about', 'tot_talk_message', 'tot_error_round', 'tot_error_final'],
  'profile-content translation': ['translated_from', 'show_original', 'original_label', 'show_translation'],
  'notification preferences': ['notifications_title', 'notifications_hint', 'notify_matches', 'notify_super_likes', 'notify_super_likes_note', 'notify_profile_reminders', 'notify_profile_reminders_note', 'notifications_saved'],
  languages: ['languages_label', 'languages_hint', 'filter_languages', 'filter_languages_hint'],
  'restriction of processing': ['restrict_title', 'restrict_explain', 'restrict_action', 'restrict_confirm', 'restricted_badge', 'restricted_notice', 'unrestrict_action', 'restrict_done', 'unrestrict_done', 'restrict_note', 'error_processing_restricted'],
  'objection to processing': ['objection_title', 'objection_explain', 'objection_confirm', 'object_action', 'objection_badge', 'objection_notice', 'unobject_action', 'objection_done', 'unobject_done', 'objection_note'],
  'help and support': ['support_title', 'support_intro', 'support_help', 'support_formal', 'support_contact', 'support_history', 'support_history_empty', 'support_form_title', 'support_form_category', 'support_form_details', 'support_form_placeholder', 'support_submit', 'support_required', 'support_done', 'support_email', 'support_expectation'],
  'data and privacy controls': ['data_title', 'data_controls', 'data_controls_intro', 'privacy_by_design']
};
for (const [area, keys] of Object.entries(AREAS)) {
  const gaps = keys.filter((k) => Object.entries(LOCALES).some(([, cat]) => !cat[k]));
  check(`${area} is fully localized`, gaps.length === 0, gaps.join(','));
}

// ---------------------------------------------------------------- messaging copy
section('Messaging copy describes Bezy conversations, not Telegram handoffs');
{
  const html = read('index.html');
  const localesText = Object.values(LOCALES).map((catalogue) => JSON.stringify(catalogue)).join(' ');
  check('no remaining "Open Telegram chat" action anywhere',
    !app.includes('Open Telegram chat') && !html.includes('Open Telegram chat') && !localesText.includes('Open Telegram chat'),
    'a Telegram chat handoff string remains');
  check('no copy claims the conversation happens in Telegram',
    !localesText.includes('happens in Telegram') && !localesText.includes('se déroule dans Telegram')
      && !localesText.includes('findet in Telegram statt') && !localesText.includes('tiene lugar en Telegram')
      && !localesText.includes('avviene su Telegram'),
    'stale Telegram-conversation copy remains in a catalogue');
  check('the canonical Premium benefits include Bezy messaging in every language',
    ['fr', 'de', 'es', 'it'].every((lang) => Boolean(LOCALES[lang].benefit_messaging) && LOCALES[lang].benefit_messaging !== en.benefit_messaging),
    Object.entries(LOCALES).map(([lang, cat]) => `${lang}="${cat.benefit_messaging}"`).join(' | '));
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
    'chat-name', 'chat-sub', 'chat-status', 'chat-messages', 'chat-why', 'chat-locked', 'chat-game',
    // The brand tagline ships empty and renders from the active catalogue, so the header
    // never flashes English before the resolved locale paints.
    'tagline',
    // The bot attribution under the Discover feed is catalogue copy too.
    'discover-powered-by'
  ];
  for (const id of RUNTIME_FILLED) {
    const m = new RegExp(`id="${id}"[^>]*>([^<]*)<`).exec(html);
    check(`#${id} ships empty rather than hardcoded copy`, m !== null && m[1].trim() === '',
      m ? `found ${JSON.stringify(m[1])}` : 'element not found');
  }
  // And each must actually be populated at runtime, or emptying it would leave a blank.
  const populated = new Set([...app.matchAll(/setText\('([^']+)'/g)].map((m) => m[1]));
  const byRender = ['my-name', 'profile-status', 'my-avatar', 'prompts-list', 'notification-list', 'restriction-notice', 'objection-notice', 'chat-why', 'chat-messages', 'chat-locked', 'chat-game'];
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
  [/\bTELEGRAM_BOT_TOKEN|DATABASE_URL|BEZY_MINI_APP_URL\b/, 'an environment variable']
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
check('all three catalogues name the canonical support address',
  en.rights_note.includes('contacts@digitalconcordia.com') && fr.rights_note.includes('contacts@digitalconcordia.com') && de.rights_note.includes('contacts@digitalconcordia.com'));

// The outside-Telegram gate is the only path a web visitor has into the app, so it must link
// the canonical bot — a lookalike link here would hand every web visitor to an impostor.
check('the outside-Telegram gate links the canonical bot',
  /https:\/\/t\.me\/BezyDatingBot/.test(app), 'bot link not found in the gate');

// The built-in fallback catalogue renders when the locale fetch fails (the degraded-state
// e2e spec drives that path). It is generated from locales/en.json by
// scripts/sync-fallback-locale.mjs; this check pins that it cannot drift.
const fallbackBlock = /BEGIN fallback catalogue[\s\S]*?\r?\n {6}app: (\{.*\}),\r?\n {6}\/\/ END fallback catalogue/.exec(app);
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
const DOMAIN_RECORDS = ['users', 'matches', 'actions', 'likesReceived', 'bezyPremium', 'usage', 'bezyInvoices', 'bezyPayments', 'reports', 'blocks', 'rateLimits'];
for (const col of DOMAIN_RECORDS) {
  check(`PostgreSQL identifier "${col}" still used verbatim`, apiSource.includes(col), '');
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

// ---------------------------------------------------------------- locale plumbing
section('Locale plumbing rides the existing mechanisms');

// The whole locale files — `app` plus the small `profile` section — stay in parity, so a
// catalogue can never silently drop or add a top-level section.
{
  const whole = Object.fromEntries(Object.keys(LOCALES).map((lang) => [lang, JSON.parse(read(`locales/${lang}.json`))]));
  const topLevel = JSON.stringify(Object.keys(whole.en).sort());
  check('locale files define the same top-level sections',
    Object.values(whole).every((file) => JSON.stringify(Object.keys(file).sort()) === topLevel),
    Object.entries(whole).map(([lang, file]) => `${lang}=${Object.keys(file)}`).join(' | '));
  check('the profile section keeps language parity too',
    Object.values(whole).every((file) => JSON.stringify(Object.keys(file.profile).sort()) === JSON.stringify(Object.keys(whole.en.profile).sort())),
    Object.entries(whole).map(([lang, file]) => `${lang}=${Object.keys(file.profile)}`).join(' | '));
}

// Locale resolution: the Mini App mirrors the API's normalize/resolve pair (pinned here and
// unit-tested in the resolution section below), so the same priority applies everywhere.
check('the Mini App resolves every locale through the shared normalize/resolve pair',
  app.includes("const SUPPORTED_LOCALES = ['en', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'pl', 'ar', 'tr', 'sw', 'yo', 'hi', 'id', 'zh', 'ja', 'ko']")
    && /function normalizeLanguageTag\(code\)/.test(app)
    && /function resolveAppLocale\(\)/.test(app)
    && /function browserLanguages\(\)/.test(app),
  'normalizeLanguageTag/resolveAppLocale/browserLanguages missing from app.js');
check('the Mini App consults the browser preferred-language list, not one value',
  app.includes('navigator.languages'), 'navigator.languages not consulted');
check('Mini App resolution order: explicit → Telegram → browser → English',
  app.indexOf('normalizeLanguageTag(storedExplicitLanguage())') < app.indexOf('normalizeLanguageTag(state.telegramUser')
    && app.indexOf('normalizeLanguageTag(state.telegramUser') < app.indexOf('browserLanguages()[0]')
    && app.includes("return browserLanguages()[0] || 'en'"),
  'the resolution tiers are out of order');
for (const [code, label] of [['de', 'German'], ['es', 'Spanish'], ['it', 'Italian']]) {
  check(`the outside-Telegram gate follows the browser language into ${label}`,
    app.includes('gateLanguage = normalizeLanguageTag(browserCode)') && app.includes(`${code}: { tagline:`),
    `the gate has no ${code} copy`);
  check(`the Mini App offers a ${label} selector on the existing mechanism`,
    read('index.html').includes(`data-language="${code}"`), `no ${code} language button in index.html`);
}
for (const [code, label] of [['pt', 'Portuguese'], ['ru', 'Russian'], ['pl', 'Polish'], ['ar', 'Arabic'], ['tr', 'Turkish'], ['sw', 'Swahili'], ['yo', 'Yoruba'], ['hi', 'Hindi'], ['id', 'Indonesian'], ['zh', 'Chinese'], ['ja', 'Japanese'], ['ko', 'Korean']]) {
  check(`the Mini App offers a ${label} selector on the existing mechanism`,
    read('index.html').includes(`data-language="${code}"`), `no ${code} language button in index.html`);
  check(`the gate carries ${label} copy`,
    app.includes(`${code}: { tagline:`), `the gate has no ${code} copy`);
  check(`the global command descriptions define ${code} exactly once`,
    (read('api/_telegram.js').match(new RegExp(`^ {4}${code}: \\{ start: `, 'm')) || []).length === 1, `${code} description entry off`);
}
check('the global command descriptions cover every new locale',
  ['pt', 'ru', 'pl', 'ar', 'tr', 'sw', 'yo', 'hi', 'id', 'zh', 'ja', 'ko'].every((code) => read('api/_telegram.js').includes(`${code}: { start: `))
    && read('api/_telegram.js').includes('Object.entries(GLOBAL_DESCRIPTIONS).map'),
  'GLOBAL_DESCRIPTIONS missing a locale');
check('message timestamps render in every time locale',
  ['de: \'de-DE\'', 'es: \'es-ES\'', 'it: \'it-IT\''].every((mapping) => app.includes(mapping)),
  'chat time formatting is missing a locale mapping');

const telegramSource = read('api/_telegram.js');
// normalizedLanguage is the single resolver behind every bot/notification/payment message;
// it must route ALL 17 supported locales to themselves — a five-locale remnant would serve
// English copy to twelve supported languages.
for (const code of SUPPORTED_LOCALES) {
  check(`normalizedLanguage resolves ${code} (and its regional tags) to ${code}`,
    normalizedLanguage(code) === code && normalizedLanguage(`${code}-XX`) === code && normalizedLanguage(`${code}_XX`) === code,
    `got ${normalizedLanguage(code)} / ${normalizedLanguage(`${code}-XX`)}`);
}
check('normalizedLanguage falls back to English for unsupported languages',
  normalizedLanguage('uk') === 'en' && normalizedLanguage('') === 'en' && normalizedLanguage('xx') === 'en');
check('the localized() picker is the one shared five-language mechanism',
  /export function localized\(/.test(telegramSource), 'localized() not found in api/_telegram.js');

// Bot command scopes: every locale declares its own setMyCommands scope, and localized
// commands resolve to the same views as their English counterparts. Command words are never
// machine identifiers — they are Telegram-facing entry points — but the set is pinned so it
// cannot drift without a deliberate change.
const CANONICAL_COMMANDS = {
  de: [['start', 'Bezy starten'], ['hilfe', 'So funktioniert Bezy'], ['profil', 'Mein Profil'],
    ['entdecken', 'Personen entdecken'], ['matches', 'Meine Matches'], ['premium', 'Bezy Premium'],
    ['einstellungen', 'Einstellungen'], ['support', 'Hilfe & Support']],
  es: [['empezar', 'Iniciar Bezy'], ['ayuda', 'Cómo funciona Bezy'], ['perfil', 'Mi perfil'],
    ['descubrir', 'Descubrir personas'], ['matches', 'Mis matches'], ['premium', 'Bezy Premium'],
    ['ajustes', 'Configuración'], ['soporte', 'Ayuda y soporte']],
  it: [['start', 'Inizia Bezy'], ['aiuto', 'Come funziona Bezy'], ['profilo', 'Il mio profilo'],
    ['scopri', 'Scopri persone'], ['matches', 'I miei match'], ['premium', 'Bezy Premium'],
    ['impostazioni', 'Impostazioni'], ['assistenza', 'Aiuto e supporto']]
};
for (const [code, canonical] of Object.entries(CANONICAL_COMMANDS)) {
  const varName = { de: 'german', es: 'spanish', it: 'italian' }[code];
  check(`the ${LOCALE_NAMES[code]} command scope is registered exactly once`,
    (telegramSource.match(new RegExp(`language_code: '${code}'`, 'g')) || []).length === 1, `${code} scope count off`);
  const block = new RegExp(`const ${varName} = \\[([\\s\\S]*?)\\];`).exec(telegramSource)?.[1] || '';
  const commands = [...block.matchAll(/\{ command: '([a-z]+)', description: '([^']+)' \}/g)]
    .map((m) => [m[1], m[2]]);
  check(`the ${LOCALE_NAMES[code]} command set and descriptions are exactly the canonical ones`,
    JSON.stringify(commands) === JSON.stringify(canonical), JSON.stringify(commands));
}

// The webhook maps the localized command words to the same views the English commands use.
const webhookSource = read('api/telegram/webhook.js');
check('German bot commands resolve to their views in the webhook',
  /hilfe: null/.test(webhookSource) && /entdecken: 'discover'/.test(webhookSource) && /einstellungen: 'profile'/.test(webhookSource),
  'COMMAND_VIEWS misses German commands');
check('Spanish bot commands resolve to their views in the webhook',
  /ayuda: null/.test(webhookSource) && /descubrir: 'discover'/.test(webhookSource) && /ajustes: 'profile'/.test(webhookSource),
  'COMMAND_VIEWS misses Spanish commands');
check('Italian bot commands resolve to their views in the webhook',
  /aiuto: null/.test(webhookSource) && /scopri: 'discover'/.test(webhookSource) && /impostazioni: 'profile'/.test(webhookSource),
  'COMMAND_VIEWS misses Italian commands');

// Bot messages, notifications, invoice labels and checkout errors: no binary fr/en check may
// remain anywhere in the API — every user-facing API string must go through the five-way
// localized() picker (or an equivalent five-language map), so a Spanish or Italian user
// never falls through to English copy.
{
  const apiFiles = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith('.js')) apiFiles.push(rel);
    }
  })('api');
  const apiSource = apiFiles.map((f) => read(f)).join('\n');
  check('no binary fr/en language check remains in the API',
    !apiSource.replace(read('api/_telegram.js'), '').includes("language === 'fr'"),
    'a French-or-English ternary still exists in api/ (the localized() helper itself is exempt)');
  check('every bot surface carries an explicit branch for every language',
    ['api/telegram/webhook.js', 'api/swipe.js', 'api/messages.js', 'api/account.js', 'api/relationship.js', 'api/_reminders.js', 'api/premium.js']
      .every((f) => ['fr', 'de', 'es', 'it', 'pt', 'ru', 'pl', 'ar', 'tr', 'sw', 'yo', 'hi', 'id', 'zh', 'ja', 'ko'].every((lang) => new RegExp(`${lang}:\\s*['{(\`]`).test(read(f)))),
    'a bot file is missing a language branch');

  // Pre-checkout rejection texts are shown verbatim by Telegram to the buyer, so every
  // reason must exist in every language with the same keys as English.
  const checkoutBlock = /const CHECKOUT_ERRORS = \{([\s\S]*?)\n\};/.exec(webhookSource)?.[1] || '';
  const checkoutKeys = (block) => [...block.matchAll(/^ {2}(\w+): \{([\s\S]*?)\n {2}\}/gm)].flatMap((m) => {
    const lang = m[1];
    return [...m[2].matchAll(/^ {4}(\w+):/gm)].map((k) => `${lang}.${k[1]}`);
  });
  const REASONS = ['invalid', 'plan', 'account', 'currency', 'price', 'expired', 'unverified'];
  check('checkout errors cover the same reasons in every language',
    JSON.stringify(checkoutKeys(checkoutBlock).sort()) === JSON.stringify(Object.keys(LOCALES).flatMap((lang) => REASONS.map((k) => `${lang}.${k}`)).sort()),
    checkoutKeys(checkoutBlock).join(','));

  // Invoice titles and descriptions are shown inside Telegram's payment sheet.
  const premiumSource = read('api/premium.js');
  check('invoice plan labels exist in every language',
    /de: \{ monthly: 'Monatlich', quarterly: 'Vierteljährlich', yearly: 'Jährlich' \}/.test(premiumSource)
      && /es: \{ monthly: 'Mensual', quarterly: 'Trimestral', yearly: 'Anual' \}/.test(premiumSource)
      && /it: \{ monthly: 'Mensile', quarterly: 'Trimestrale', yearly: 'Annuale' \}/.test(premiumSource),
    'PLAN_LABELS is missing a language entry');
  check('the invoice description exists in every language',
    premiumSource.includes('erweiterte Suche') && premiumSource.includes('descubrimiento avanzado') && premiumSource.includes('scoperta avanzata'),
    'INVOICE_DESCRIPTION is missing a language entry');
}

// ---------------------------------------------------------------- bot completeness
section('No partial locale: every language-carrying object holds all seventeen');
{
  // Every object literal in the API and the Mini App that carries `en:` and `fr:` entries
  // must carry all seventeen — a site that silently falls back to English is a partial
  // locale, not a complete one. Top-level keys are identified by their common indentation,
  // so nested maps (CHECKOUT_ERRORS, DISCOVERY_FINDINGS, GLOBAL_DESCRIPTIONS…) are checked
  // at their own level.
  const apiFiles = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith('.js')) apiFiles.push(rel);
    }
  })('api');
  // api/_profileText.js holds the language-detection data (script blocks + Latin
  // fingerprints for the script-detected locales), not a localized() map — exempt.
  const source = apiFiles.filter((f) => f !== 'api/_profileText.js').map((f) => read(f)).join('\n') + '\n' + app;
  const literals = [];
  let i = 0;
  while (i < source.length) {
    if (source[i] !== '{') { i++; continue; }
    let depth = 0, j = i;
    while (j < source.length) {
      const c = source[j];
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { literals.push(source.slice(i + 1, j)); break; } }
      j++;
    }
    i = j + 1;
  }
  const ALL17 = ['en', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'pl', 'ar', 'tr', 'sw', 'yo', 'hi', 'id', 'zh', 'ja', 'ko'];
  let checked = 0;
  const bad = [];
  for (const inner of literals) {
    const matches = [...inner.matchAll(/^([ \t]*)([a-z]{2}):/gm)].map((m) => ({ key: m[2], indent: m[1].length }));
    if (!matches.length) continue;
    const keysAt = (indent) => new Set(matches.filter((m) => m.indent === indent).map((m) => m.key));
    const minIndent = Math.min(...matches.map((m) => m.indent));
    const topKeys = keysAt(minIndent);
    if (!topKeys.has('en') || !topKeys.has('fr')) continue;
    checked++;
    const missing = ALL17.filter((k) => !topKeys.has(k));
    if (missing.length) bad.push(`object #${checked} missing: ${missing.join(',')}`);
  }
  check('every language-carrying object holds all seventeen locales',
    bad.length === 0 && checked > 20, `checked=${checked} | ${bad.join(' | ')}`);
}

// ---------------------------------------------------------------- resolution behaviour
section('Language resolution priority (pure, shared with the API)');
{
  check('the supported locale set is exactly the seventeen canonical locales',
    JSON.stringify([...SUPPORTED_LOCALES]) === JSON.stringify(['en', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'pl', 'ar', 'tr', 'sw', 'yo', 'hi', 'id', 'zh', 'ja', 'ko']),
    SUPPORTED_LOCALES.join(','));

  const NORMALIZE = [
    ['en', 'en'], ['en-US', 'en'], ['en-GB', 'en'], ['EN_gb', 'en'],
    ['fr', 'fr'], ['fr-FR', 'fr'], ['fr_BE', 'fr'],
    ['de', 'de'], ['de-DE', 'de'], ['de-AT', 'de'], ['de-CH', 'de'],
    ['es', 'es'], ['es-ES', 'es'], ['es-419', 'es'],
    ['it', 'it'], ['it-IT', 'it'],
    ['pt', 'pt'], ['pt-BR', 'pt'], ['pt-PT', 'pt'],
    ['ru', 'ru'], ['pl', 'pl'], ['ar', 'ar'], ['ar-EG', 'ar'], ['tr', 'tr'],
    ['sw', 'sw'], ['yo', 'yo'], ['hi', 'hi'], ['id', 'id'], ['id-ID', 'id'],
    ['zh', 'zh'], ['zh-CN', 'zh'], ['zh-Hans', 'zh'], ['ja', 'ja'], ['ko', 'ko'],
    ['nl', ''], ['vi', ''], ['', ''], [null, ''], [undefined, ''], ['123', ''], ['en_US_POSIX', 'en']
  ];
  for (const [input, expected] of NORMALIZE) {
    check(`normalizeLanguageTag(${JSON.stringify(input)}) -> ${JSON.stringify(expected)}`,
      normalizeLanguageTag(input) === expected, `got ${JSON.stringify(normalizeLanguageTag(input))}`);
  }

  const RESOLVE = [
    ['explicit de beats Telegram fr and browser es', { explicit: 'de', telegram: 'fr', browser: ['es'] }, 'de'],
    ['explicit regional es-419 normalizes and beats Telegram it', { explicit: 'es-419', telegram: 'it', browser: ['fr'] }, 'es'],
    ['Telegram it beats browser fr', { telegram: 'it', browser: ['fr'] }, 'it'],
    ['unsupported Telegram falls to the browser (nl → es)', { telegram: 'nl', browser: ['es', 'nl'] }, 'es'],
    ['unsupported Telegram and browser fall to English', { telegram: 'nl', browser: ['vi', 'af'] }, 'en'],
    ['the browser list uses its first supported entry', { browser: ['af', 'de-AT', 'fr'] }, 'de'],
    ['regional Telegram tag normalizes', { telegram: 'de-CH', browser: ['fr'] }, 'de'],
    ['zh-CN Telegram normalizes to zh', { telegram: 'zh-CN', browser: ['en'] }, 'zh'],
    ['pt Telegram beats es browser', { telegram: 'pt', browser: ['es'] }, 'pt'],
    ['no signal resolves to English', {}, 'en']
  ];
  for (const [name, input, expected] of RESOLVE) {
    check(name, resolveLanguage(input) === expected, `got ${JSON.stringify(resolveLanguage(input))}`);
  }

  const USERS = [
    ['explicit locale beats the Telegram language on the account', { locale: 'es', languageCode: 'de' }, 'es'],
    ['the Telegram language is used when no explicit locale is stored', { languageCode: 'it' }, 'it'],
    ['an empty document resolves to English', {}, 'en'],
    ['an invalid stored locale falls through to the Telegram language', { locale: 'nl', languageCode: 'fr' }, 'fr']
  ];
  for (const [name, userData, expected] of USERS) {
    check(name, resolveUserLanguage(userData) === expected, `got ${JSON.stringify(resolveUserLanguage(userData))}`);
  }
}

// ---------------------------------------------------------------- persistence
section('Explicit selection persists; automatic detection does not');
{
  const loadLocaleBody = /async function loadLocale\(language\) \{([\s\S]*?)\n\}/.exec(app)?.[1] || '';
  check('automatic detection never writes the cache (loadLocale does not persist)',
    !loadLocaleBody.includes('localStorage.setItem'), 'loadLocale still persists the detected language');
  const persistCount = (app.match(/localStorage\.setItem\('bezy-language'/g) || []).length;
  check('the cache is written exactly where an explicit choice exists (selector + account adoption)',
    persistCount === 2, `found ${persistCount} cache writes`);
  check('the selector persists the explicit choice and sends it to the account',
    app.includes("localStorage.setItem('bezy-language', button.dataset.language)")
      && app.includes('api(API.profile, { body: { locale: button.dataset.language } })'),
    'the selector handler does not persist or sync the choice');
  check('a saved account choice is adopted only when this device has no explicit choice',
    app.includes('savedLocale && !storedExplicit'), 'the adoption guard is missing');
  check('the profile endpoint stores the locale only for a supported, explicitly sent value',
    /typeof req\.body\?\.locale === 'string' && SUPPORTED_LOCALES\.includes\(req\.body\.locale\)/.test(read('api/profile/me.js'))
      && read('api/profile/me.js').includes('baseData.locale = req.body.locale'),
    'profile/me.js does not validate or store the locale');
  check('every bot and notification path prefers the explicit locale over the Telegram language',
    ['api/telegram/webhook.js', 'api/swipe.js', 'api/messages.js', 'api/account.js', 'api/_reminders.js']
      .every((f) => /locale \|\| /.test(read(f))),
    'a bot/notification file does not resolve the explicit locale first');
}

// ---------------------------------------------------------------- brand
section('Brand logo + localized tagline');
{
  const BRAND_TAGLINES = {
    en: 'Meet someone worth knowing. 💗', fr: 'Faites une belle rencontre. 💗',
    de: 'Lerne jemanden kennen, der zählt. 💗', es: 'Conoce a alguien especial. 💗',
    it: 'Incontra qualcuno di speciale. 💗'
  };
  for (const [lang, expected] of Object.entries(BRAND_TAGLINES)) {
    check(`the ${lang} catalogue carries the canonical brand tagline`,
      LOCALES[lang].tagline === expected, LOCALES[lang].tagline);
  }
  const html = read('index.html');
  check('the Mini App header uses the one brand lockup asset',
    html.includes('/assets/bezy-logo-without-tagline.png'), 'the new asset is not referenced in index.html');
  check('the header tagline ships empty and is filled at runtime from the catalogue',
    /id="tagline"><\/small>/.test(html), 'the tagline ships hardcoded copy');
  check('the outside-Telegram gate uses the brand lockup and a localized tagline',
    app.includes('/assets/bezy-logo-without-tagline.png') && app.includes("tagline: 'Meet someone worth knowing. 💗'"),
    'the gate does not use the brand asset/tagline');
  check('the legal pages use the brand lockup',
    read('privacy/index.html').includes('/assets/bezy-logo-without-tagline.png')
      && read('terms/index.html').includes('/assets/bezy-logo-without-tagline.png'),
    'a legal page still uses the old mark');
  check('the legal pages carry the new brand taglines',
    read('privacy/index.html').includes('Faites une belle rencontre. 💗')
      && read('terms/index.html').includes('Meet someone worth knowing. 💗'),
    'a legal page still shows the old tagline');
  check('no per-language logo assets were created',
    !html.includes('bezy-logo-en') && !html.includes('bezy-logo-fr') && !html.includes('bezy-logo-de')
      && !html.includes('bezy-logo-es') && !html.includes('bezy-logo-it')
      && !app.includes('bezy-logo-fr') && !app.includes('bezy-logo-de') && !app.includes('bezy-logo-es') && !app.includes('bezy-logo-it'),
    'a language-specific logo filename exists');
  check('the Mini App markup contains no hardcoded English tagline',
    !html.includes('Meet someone worth knowing.'), 'the old hardcoded tagline remains in index.html');
}

// ---------------------------------------------------------------- legal content
section('Formal legal documents are deliberately not translated by this work');
// The Privacy Policy and Terms are formal legal documents. Their French versions exist and
// are published; German, Spanish and Italian versions require legal review before they can
// be declared valid, so the pages keep the en/fr dictionaries and fall back to English for
// any other language — the existing fallback behaviour, unchanged.
{
  const privacy = read('privacy/index.html');
  const terms = read('terms/index.html');
  for (const [code, label] of [['de', 'German'], ['es', 'Spanish'], ['it', 'Italian'], ['pt', 'Portuguese'], ['ru', 'Russian'], ['pl', 'Polish'], ['ar', 'Arabic'], ['tr', 'Turkish'], ['sw', 'Swahili'], ['yo', 'Yoruba'], ['hi', 'Hindi'], ['id', 'Indonesian'], ['zh', 'Chinese'], ['ja', 'Japanese'], ['ko', 'Korean']]) {
    check(`no ${label} legal translation was invented in the Privacy Policy`,
      !privacy.includes(`const ${code}=`) && !privacy.includes(`lang=${code}`), `a ${code} privacy dictionary exists`);
    check(`no ${label} legal translation was invented in the Terms`,
      !terms.includes(`const ${code}=`) && !terms.includes(`lang=${code}`), `a ${code} terms dictionary exists`);
  }
  check('the legal pages keep their English and French dictionaries',
    /const en=/.test(privacy) && /const fr=/.test(privacy) && /const en=/.test(terms) && /const fr=/.test(terms),
    'an existing legal dictionary is missing');
}

// ---------------------------------------------------------------- photo architecture
section('Telegram is the only photo source');
const PHOTO_FORBIDDEN = [
  [/getStorage\(/, 'direct storage access'],
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
check('no image bytes are ever written to PostgreSQL',
  !/photoData|photoBytes|imageBuffer|photoBase64/.test(allSource));
check('package.json declares no image or storage dependency',
  !/cloudinary|aws-sdk|@vercel\/blob|sharp|multer|jimp/.test(read('package.json')),
  read('package.json').replace(/\s+/g, ' ').slice(0, 200));

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (failures.length) console.log('Failed:\n - ' + failures.join('\n - '));
process.exit(fail ? 1 : 0);
