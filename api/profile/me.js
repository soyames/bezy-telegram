import { readUser } from '../_users.js';
import { query, tx, advisoryLock, ApiError } from '../_db.js';
import { requirePost, requireTelegramUser, SUPPORTED_LOCALES } from '../_telegram.js';
import { rateLimit } from '../_ratelimit.js';
import { normalizeNotificationSettings, notificationSettings } from '../_notify.js';
import { processingPaused } from '../_privacy.js';

const ALLOWED_GENDERS = new Set(['woman', 'man', 'non_binary', 'prefer_not_to_say']);
const ALLOWED_SEEKING = new Set(['women', 'men', 'everyone']);

// Profile prompts. The ids are machine tokens and are never translated — the question text
// lives in the locale catalogues under `prompt_<id>`. Adding a prompt here requires adding
// that key in both languages, which tests/localization.test.mjs enforces.
export const PROMPT_IDS = ['perfect_sunday', 'i_value', 'first_date', 'should_know', 'talk_for_hours'];
const MAX_PROMPTS = 3;
const PROMPT_ANSWER_MAX = 200;

// Languages spoken. ISO 639-1 codes, stored as machine tokens and never translated — the
// display name lives in `language_<id>` in both catalogues. A closed list rather than free
// text so the same language always matches itself and can be filtered on reliably.
export const LANGUAGE_IDS = ['en', 'fr', 'es', 'pt', 'ar', 'de', 'it', 'ru', 'sw', 'yo', 'pl', 'tr', 'hi', 'id', 'zh', 'ja', 'ko'];
const MAX_LANGUAGES = 5;

function normalizeLanguages(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  for (const value of input) {
    const id = String(value ?? '').trim().toLowerCase();
    if (LANGUAGE_IDS.includes(id)) seen.add(id);
    if (seen.size >= MAX_LANGUAGES) break;
  }
  // Stored in catalogue order rather than the order supplied, so two profiles listing the
  // same languages are stored identically.
  return LANGUAGE_IDS.filter((id) => seen.has(id));
}

function cleanText(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

/**
 * Prompts are optional and never affect profile completeness: a user who skips them still
 * has a complete profile. Unknown ids are dropped rather than stored, and only the first
 * answer for a given prompt is kept.
 */
function normalizePrompts(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const prompts = [];
  for (const entry of input) {
    const id = String(entry?.id ?? '');
    if (!PROMPT_IDS.includes(id) || seen.has(id)) continue;
    const answer = cleanText(entry?.answer, PROMPT_ANSWER_MAX);
    if (!answer) continue;
    seen.add(id);
    prompts.push({ id, answer });
    if (prompts.length >= MAX_PROMPTS) break;
  }
  return prompts;
}

export function normalizeProfile(input = {}) {
  const age = Number(input.age);
  const interests = Array.isArray(input.interests)
    ? [...new Set(input.interests.map((value) => cleanText(value, 32)).filter(Boolean))].slice(0, 12)
    : [];
  const gender = ALLOWED_GENDERS.has(input.gender) ? input.gender : '';
  const seeking = ALLOWED_SEEKING.has(input.seeking) ? input.seeking : 'everyone';
  const displayName = cleanText(input.displayName, 60);
  const city = cleanText(input.city, 80);
  const bio = cleanText(input.bio, 500);
  const prompts = normalizePrompts(input.prompts);
  const languages = normalizeLanguages(input.languages);
  const discoverable = Boolean(input.discoverable);
  const complete = Boolean(displayName && Number.isInteger(age) && age >= 18 && age <= 100 && city && gender);

  return {
    displayName,
    age: Number.isInteger(age) ? age : null,
    gender,
    seeking,
    city,
    bio,
    interests,
    prompts,
    languages,
    discoverable: complete && discoverable,
    profileComplete: complete
  };
}

/**
 * The machine view of a user's age-assurance state, derived — never stored — from the
 * existing 18+ declaration. Today only `selfDeclared18Plus` exists: Telegram's age
 * verification is a restricted-content mechanism Bezy cannot request (ADR 0010), so no
 * other value can be produced truthfully. The shape leaves room for a future
 * `telegramAgeVerified18Plus` state without inventing it now.
 */
export function ageStatusOf(data = {}) {
  return data.ageEligibilityConfirmed === true ? 'selfDeclared18Plus' : null;
}

export function normalizePreferences(input = {}) {
  const min = Number(input.minAge);
  const max = Number(input.maxAge);
  const minAge = Number.isFinite(min) ? Math.min(Math.max(Math.trunc(min), 18), 100) : 18;
  const maxAge = Number.isFinite(max) ? Math.min(Math.max(Math.trunc(max), minAge), 100) : 100;
  return {
    minAge,
    maxAge,
    city: cleanText(input.city, 80),
    sameCityOnly: Boolean(input.sameCityOnly),
    languages: normalizeLanguages(input.languages)
  };
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const user = requireTelegramUser(req, res);
  if (!user) return;

  try {
    // Reads are cheap; only writes are rate limited, so opening the app is never blocked.
    const isWrite = Boolean(req.body?.profile || req.body?.preferences || req.body?.notifications || req.body?.ageEligibilityConfirmed || req.body?.locale);
    if (isWrite && !(await rateLimit(null, res, user.id, 'profile_write'))) return;
    return await handleProfile(req, res, user);
  } catch (error) {
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message });
    console.error('Profile request failed:', error);
    return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
  }
}

async function handleProfile(req, res, user) {
  const userId = String(user.id);
  const now = new Date();

  // Data minimisation: Telegram also supplies last_name and is_premium, but Bezy displays
  // neither and uses neither in any logic, so they are deliberately not collected.
  // `is_premium` in particular is Telegram Premium, which must never grant Bezy Premium.
  const baseData = {
    telegramId: userId,
    firstName: user.first_name || '',
    username: user.username || '',
    languageCode: user.language_code || '',
    photoUrl: user.photo_url || '',
    updatedAt: now
  };

  // The explicit Bezy language choice. Written only when the Mini App selector is used and
  // only for a supported locale — automatic detection never persists, so a Telegram or
  // device language change keeps re-resolving. The stored Telegram `languageCode` is
  // refreshed separately from initData and always loses to `locale` at read time.
  if (typeof req.body?.locale === 'string' && SUPPORTED_LOCALES.includes(req.body.locale)) {
    baseData.locale = req.body.locale;
  }

  let data;
  await tx(async (q) => {
  await advisoryLock(q, `user:${userId}`);
  await q('SELECT telegram_id FROM users WHERE telegram_id = $1 FOR UPDATE', [userId]);
  const current = await readUser(userId, q);

  // Bezy is 18+ only. Eligibility is an explicit self-declaration by the user — it is NOT
  // identity or age verification, and Telegram supplies no verified age. The declaration is
  // only ever recorded from an affirmative `true`; nothing here can set it implicitly, and an
  // existing declaration is never overwritten or re-dated.
  const alreadyConfirmed = current.ageEligibilityConfirmed === true;
  if (!alreadyConfirmed && req.body?.ageEligibilityConfirmed === true) {
    baseData.ageEligibilityConfirmed = true;
    baseData.ageEligibilityConfirmedAt = now;
    baseData.ageEligibilityMethod = 'self_declaration';
  }
  const ageConfirmed = alreadyConfirmed || baseData.ageEligibilityConfirmed === true;

  // While a legal pause (restriction or objection) is in force, saving a profile is
  // rectification and stays available — but it must not republish the profile.
  const processingPausedAccount = processingPaused(current);

  let nextProfile = current.profile || {};
  if (req.body?.profile && typeof req.body.profile === 'object') {
    nextProfile = normalizeProfile(req.body.profile);
    // Server-side enforcement: without the declaration a profile can never become complete
    // or discoverable, so a client that skips the age gate still cannot enter Discover.
    if (!ageConfirmed) {
      nextProfile = { ...nextProfile, profileComplete: false, discoverable: false };
    }
    // Editing a profile is rectification (GDPR Art. 16) and stays available while processing
    // is paused — but saving must not be a back door that republishes the profile.
    if (processingPausedAccount) {
      nextProfile = { ...nextProfile, discoverable: false };
    }
  }

  let nextPreferences = current.preferences || normalizePreferences();
  if (req.body?.preferences && typeof req.body.preferences === 'object') {
    nextPreferences = normalizePreferences(req.body.preferences);
  }

  // Notification choices are opt-out: an account that has never touched them has everything
  // on. Only the categories the user is allowed to control are stored — transactional
  // messages are not represented here at all, so no payload can switch them off. A partial
  // payload is merged OVER the stored settings, so it never resets an unnamed category.
  let nextNotifications = notificationSettings(current);
  if (req.body?.notifications && typeof req.body.notifications === 'object') {
    nextNotifications = normalizeNotificationSettings({ ...nextNotifications, ...req.body.notifications });
  }

    // The users row is the source of identity truth; everything else hangs off its FK.
    await q(
      `INSERT INTO users (telegram_id, first_name, username, language_code, locale, photo_url, updated_at, created_at,
                          age_eligibility_confirmed, age_eligibility_confirmed_at, age_eligibility_method,
                          profile_complete, discoverable)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (telegram_id) DO UPDATE SET
         first_name = EXCLUDED.first_name,
         username = EXCLUDED.username,
         language_code = EXCLUDED.language_code,
         locale = COALESCE(EXCLUDED.locale, users.locale),
         photo_url = EXCLUDED.photo_url,
         updated_at = EXCLUDED.updated_at,
         age_eligibility_confirmed = users.age_eligibility_confirmed OR EXCLUDED.age_eligibility_confirmed,
         age_eligibility_confirmed_at = COALESCE(users.age_eligibility_confirmed_at, EXCLUDED.age_eligibility_confirmed_at),
         age_eligibility_method = COALESCE(users.age_eligibility_method, EXCLUDED.age_eligibility_method),
         profile_complete = EXCLUDED.profile_complete,
         discoverable = EXCLUDED.discoverable`,
      [
        userId, baseData.firstName, baseData.username, baseData.languageCode, baseData.locale ?? null, baseData.photoUrl, now,
        baseData.ageEligibilityConfirmed === true, baseData.ageEligibilityConfirmedAt ?? null, baseData.ageEligibilityMethod ?? null,
        Boolean(nextProfile.profileComplete), Boolean(nextProfile.discoverable)
      ]
    );

    if (req.body?.profile && typeof req.body.profile === 'object') {
      await q(
        `INSERT INTO profiles (telegram_id, display_name, age, gender, seeking, city, bio, interests, languages, discoverable, profile_complete)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (telegram_id) DO UPDATE SET
           display_name = EXCLUDED.display_name, age = EXCLUDED.age, gender = EXCLUDED.gender, seeking = EXCLUDED.seeking,
           city = EXCLUDED.city, bio = EXCLUDED.bio, interests = EXCLUDED.interests, languages = EXCLUDED.languages,
           discoverable = EXCLUDED.discoverable, profile_complete = EXCLUDED.profile_complete`,
        [
          userId, nextProfile.displayName || null, nextProfile.age, nextProfile.gender || null, nextProfile.seeking,
          nextProfile.city || null, nextProfile.bio || null, nextProfile.interests, nextProfile.languages,
          nextProfile.discoverable, nextProfile.profileComplete
        ]
      );
      await q('DELETE FROM prompt_answers WHERE telegram_id = $1', [userId]);
      for (const [position, prompt] of (nextProfile.prompts || []).entries()) {
        await q('INSERT INTO prompt_answers (telegram_id, id, answer, position) VALUES ($1, $2, $3, $4)', [userId, prompt.id, prompt.answer, position]);
      }
      // The bio/prompt content is the cache key's source; an edited profile must never be
      // served a stale translation, so the author's translation cache is pruned on every
      // profile write. It regenerates lazily on the next view.
      await q('DELETE FROM profile_translations WHERE author_id = $1', [userId]);
    }

    await q(
      `INSERT INTO preferences (telegram_id, min_age, max_age, city, same_city_only, languages)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (telegram_id) DO UPDATE SET min_age = EXCLUDED.min_age, max_age = EXCLUDED.max_age,
         city = EXCLUDED.city, same_city_only = EXCLUDED.same_city_only, languages = EXCLUDED.languages`,
      [userId, nextPreferences.minAge, nextPreferences.maxAge, nextPreferences.city, nextPreferences.sameCityOnly, nextPreferences.languages]
    );

    await q(
      `INSERT INTO notification_settings (telegram_id, matches, super_likes, profile_reminders, messages)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (telegram_id) DO UPDATE SET matches = EXCLUDED.matches, super_likes = EXCLUDED.super_likes,
         profile_reminders = EXCLUDED.profile_reminders, messages = EXCLUDED.messages`,
      [userId, nextNotifications.matches, nextNotifications.super_likes, nextNotifications.profile_reminders, nextNotifications.messages]
    );
  data = await readUser(userId, q);
  });
  return res.status(200).json({
    ok: true,
    userId,
    // Existing accounts that predate the age gate are reported as needing the declaration
    // rather than being silently treated as confirmed.
    needsAgeConfirmation: data.ageEligibilityConfirmed !== true,
    ageEligibility: {
      confirmed: data.ageEligibilityConfirmed === true,
      method: data.ageEligibilityMethod || null
    },
    // Derived state for honest trust copy: "18+ self-declared" today, never "verified".
    ageStatus: ageStatusOf(data),
    // Reported explicitly rather than left for the client to infer from `profile`, so an
    // account written before notification settings existed still reports the real defaults.
    notifications: notificationSettings(data),
    // The legal states are reported explicitly so the Mini App can show the account's real
    // state rather than inferring it from an absent deck — and can say which state is in force.
    processingRestricted: data.processingRestricted === true,
    processingObjection: data.processingObjection === true,
    profile: data,
    needsProfile: !data.profileComplete
  });
}

