// User-generated profile-content translation.
//
// Bezy's own UI is localized by the 17-locale catalogue system. This module handles the
// OTHER kind of text: the words a profile owner wrote themselves (bio, prompt answers).
// The product principle: "Bezy speaks the viewer's language without pretending to rewrite
// the other person's words." Therefore:
//
//   - the original text is always preserved and always available ("Show original");
//   - a translation is only ATTACHED (never substituted) when the detected source language
//     differs from the viewer's locale;
//   - nothing is translated when there is no meaningful linguistic content (emoji-only,
//     URL-only, very short, names);
//   - detection is deterministic (script blocks for CJK/Cyrillic/Arabic/Devanagari,
//     function-word fingerprints for the Latin-script locales) — no large ML system;
//   - translations are cached server-side in `profile_translations` (author, content hash,
//     target locale) — deleted with the account via the users foreign key. The cache key is
//     the content hash, so an edited profile can never reuse a stale translation.
//   - the provider is a free, keyless web endpoint, overridable via BEZY_TRANSLATE_ENDPOINT;
//     every failure degrades to "show the original" — a broken provider must never hide or
//     alter user content. Full text is never logged.
//
// Privacy note: sending profile text to an external translation endpoint is a data
// processing the privacy documentation must reflect (roadmap dependency, not code).
import crypto from 'node:crypto';

export const TRANSLATABLE_LOCALES = ['en', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'pl', 'ar', 'tr', 'sw', 'yo', 'hi', 'id', 'zh', 'ja', 'ko'];

// Deterministic language detection, tier 1: the script of the text pins the language for
// non-Latin scripts. Overlaps are resolved in favour of the more specific script.
const SCRIPT_BLOCKS = [
  ['ja', (ch) => (ch >= 0x3040 && ch <= 0x30ff) || (ch >= 0x31f0 && ch <= 0x31ff)],
  ['ko', (ch) => ch >= 0xac00 && ch <= 0xd7af],
  ['zh', (ch) => ch >= 0x4e00 && ch <= 0x9fff],
  ['ru', (ch) => (ch >= 0x0400 && ch <= 0x04ff)],
  ['ar', (ch) => (ch >= 0x0600 && ch <= 0x06ff)],
  ['hi', (ch) => ch >= 0x0900 && ch <= 0x097f]
];

// Tier 2: function-word fingerprints for the Latin-script locales. Words are deliberately
// distinctive per language; scoring requires at least two hits and a clear margin, so
// short or ambiguous text resolves to null ("do not translate") instead of a wrong guess.
const FINGERPRINTS = {
  en: ['the', 'and', 'that', 'with', 'have', 'you', 'not', 'this', 'are', 'was', 'for', 'from', 'your', 'what', 'just', 'been', 'waste', 'time', 'without', 'really'],
  fr: ['est', 'dans', 'pour', 'avec', 'vous', 'pas', 'une', 'les', 'des', 'nous', 'mon', 'temps', 'sans', 'cette', 'quelque', 'vision', 'cause'],
  de: ['der', 'die', 'das', 'und', 'nicht', 'ich', 'mit', 'für', 'sich', 'ein', 'keine', 'zeit', 'eine', 'ohne', 'sache', 'verschwende'],
  es: ['para', 'con', 'está', 'pero', 'muy', 'también', 'una', 'los', 'las', 'como', 'tiempo', 'sin', 'cosa', 'causa', 'el', 'pierdo'],
  it: ['per', 'con', 'che', 'non', 'sono', 'anche', 'una', 'gli', 'della', 'come', 'tempo', 'senza', 'cosa', 'causa', 'visione'],
  pt: ['para', 'com', 'não', 'você', 'também', 'muito', 'uma', 'dos', 'das', 'porque', 'tempo', 'sem', 'coisa', 'causa', 'visão'],
  pl: ['się', 'jest', 'przez', 'oraz', 'jako', 'dla', 'nie', 'ale', 'czy', 'bardzo', 'czas', 'bez', 'sprawę', 'na', 'tracę'],
  tr: ['için', 'çok', 'değil', 'senin', 'benim', 'bir', 'bu', 'ama', 'ile', 'kadar', 'zaman', 'olmadan', 'dava', 'vizyonu'],
  sw: ['kwa', 'katika', 'hii', 'watu', 'kuwa', 'lakini', 'sana', 'na', 'ni', 'ya', 'wakati', 'bila', 'jambo', 'wangu', 'sipotezi'],
  yo: ['àti', 'láti', 'pẹ̀lú', 'àwọn', 'nínú', 'jẹ́', 'ń', 'kí', 'tí', 'wà', 'àkókò', 'fún', 'ọ̀ràn', 'mi', 'ṣòfò'],
  id: ['yang', 'dengan', 'tidak', 'untuk', 'saya', 'kamu', 'dan', 'ini', 'itu', 'akan', 'waktu', 'tanpa', 'hal', 'membuang', 'visi']
};

const WORD = /[a-zà-ÿāēīōūăąčćđęěėįłńņšūųźżžñçğışöüẹọṣḅḍḥḳṃṅṇṛṣṭṿẓéêèëîïôûâàáäæœßñçýþðǿ̀̄̇]+/giu;

export function detectLanguage(text) {
  const value = String(text ?? '');
  if (!value.trim()) return null;

  // Script tier: count characters per script block; the block with the most characters
  // wins, which keeps mixed-script names ("こんにちは, Maria") pinned to their language.
  const scores = new Map();
  for (const ch of value) {
    const code = ch.codePointAt(0);
    for (const [lang, matches] of SCRIPT_BLOCKS) {
      if (matches(code)) scores.set(lang, (scores.get(lang) || 0) + 1);
    }
  }
  if (scores.size) {
    const [lang] = [...scores.entries()].sort((a, b) => b[1] - a[1])[0];
    return lang;
  }

  // Latin tier: fingerprint scoring.
  const words = value.toLowerCase().match(WORD) || [];
  if (words.length < 2) return null;
  const totals = Object.entries(FINGERPRINTS).map(([lang, list]) => [
    lang,
    words.reduce((n, w) => n + (list.includes(w) ? 1 : 0), 0)
  ]);
  const ranked = totals.sort((a, b) => b[1] - a[1]);
  const best = ranked[0];
  const second = ranked[1]?.[1] || 0;
  if (best[1] >= 2 && best[1] > second) return best[0];
  return null;
}

// Meaningful linguistic content only: emoji-only, URL-only, number-only and very short
// texts are shown as written — a translation would be noise, not help.
export function needsTranslation(text) {
  const value = String(text ?? '').trim();
  if (!value || value.length < 8) return false;
  if (/^https?:\/\/\S+$/i.test(value)) return false;
  const words = value.match(WORD) || [];
  if (words.length >= 2 && words.join('').length >= 6) return true;
  // Non-Latin scripts (CJK, Hangul, Cyrillic, Arabic, Devanagari) carry meaning per
  // character and have no spaces to count words by; a handful of letters is a sentence,
  // not a name. Emoji, numbers and symbols never count.
  const scriptLetters = (value.match(/[぀-ヿㇰ-ㇿ가-힯一-鿿Ѐ-ӿ؀-ۿऀ-ॿ]/g) || []).length;
  return scriptLetters >= 3;
}

export function hashFor(text) {
  return crypto.createHash('sha256').update(String(text ?? '')).digest('hex').slice(0, 32);
}

const DEFAULT_ENDPOINT = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl={sl}&tl={tl}&dt=t&q={q}';

// One translation, provider-backed. The endpoint is env-overridable so tests and future
// provider changes never touch call sites; the default is the free, keyless web endpoint.
// Failures throw — callers degrade to the original text.
export async function translateText(text, source, target) {
  const endpoint = (process.env.BEZY_TRANSLATE_ENDPOINT || DEFAULT_ENDPOINT)
    .replace('{sl}', encodeURIComponent(source))
    .replace('{tl}', encodeURIComponent(target))
    .replace('{q}', encodeURIComponent(text));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(endpoint, { signal: controller.signal });
    if (!response.ok) throw new Error(`translate provider HTTP ${response.status}`);
    const data = await response.json();
    const segments = Array.isArray(data?.[0]) ? data[0].map((segment) => String(segment?.[0] || '')).join('') : '';
    const translated = segments.trim();
    if (!translated) throw new Error('translate provider returned no text');
    return translated;
  } finally {
    clearTimeout(timer);
  }
}

// Attaches translations for a profile's free-text fields when (and only when) the
// detected source language differs from the viewer's locale. Returns only the translated
// entries; an absent entry means "show the original". Never mutates the profile.
export async function localizeProfileTexts(storage, authorId, profile, viewerLocale) {
  if (!TRANSLATABLE_LOCALES.includes(viewerLocale)) return {};
  const result = {};
  const fields = [];
  if (profile?.bio) fields.push(['bio', String(profile.bio)]);
  for (const prompt of Array.isArray(profile?.prompts) ? profile.prompts : []) {
    if (prompt?.id && prompt?.answer) fields.push([`prompt:${prompt.id}`, String(prompt.answer)]);
  }
  for (const [key, text] of fields) {
    if (!needsTranslation(text)) continue;
    const source = detectLanguage(text);
    if (!source || source === viewerLocale) continue;
    try {
      const translated = await translateCached(storage, authorId, text, source, viewerLocale);
      if (translated && translated !== text) result[key] = { text: translated, sourceLang: source };
    } catch (error) {
      console.warn(`[bezy-profiletext] translation failed for ${key}:`, error.message);
    }
  }
  return result;
}

// Cache: one row per (author, content hash, target), deleted with the account via the
// users foreign key. An edited profile produces a new hash, so stale entries can never be
// served; the write path additionally prunes the author's cache on profile saves.
async function translateCached(storage, authorId, text, source, target) {
  const { query } = await import('./_db.js');
  const contentHash = hashFor(text);
  try {
    const cached = await query(
      'SELECT text FROM profile_translations WHERE author_id = $1 AND content_hash = $2 AND locale = $3 AND source_lang = $4',
      [String(authorId), contentHash, target, source]
    );
    if (cached.rows.length) return cached.rows[0].text;
  } catch (error) {
    console.warn('[bezy-profiletext] cache read failed:', error.message);
  }
  const translated = await translateText(text, source, target);
  try {
    await query(
      `INSERT INTO profile_translations (author_id, content_hash, locale, text, source_lang, target, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, now()) ON CONFLICT (author_id, content_hash, locale) DO NOTHING`,
      [String(authorId), contentHash, target, translated, source, target]
    );
  } catch (error) {
    console.warn('[bezy-profiletext] cache write failed:', error.message);
  }
  return translated;
}
