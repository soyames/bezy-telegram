import { db } from '../_firebase.js';
import { requirePost, requireTelegramUser } from '../_telegram.js';
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
export const LANGUAGE_IDS = ['en', 'fr', 'es', 'pt', 'ar', 'de', 'it', 'ru', 'sw', 'yo'];
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

function normalizeProfile(input = {}) {
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

function normalizePreferences(input = {}) {
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
    const isWrite = Boolean(req.body?.profile || req.body?.preferences || req.body?.notifications || req.body?.ageEligibilityConfirmed);
    if (isWrite && !(await rateLimit(db(), res, user.id, 'profile_write'))) return;
    return await handleProfile(req, res, user);
  } catch (error) {
    console.error('Profile request failed:', error);
    return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
  }
}

async function handleProfile(req, res, user) {
  const ref = db().collection('users').doc(String(user.id));
  const snap = await ref.get();
  const current = snap.exists ? snap.data() : {};
  const now = new Date();

  // Data minimisation: Telegram also supplies last_name and is_premium, but Bezy displays
  // neither and uses neither in any logic, so they are deliberately not collected.
  // `is_premium` in particular is Telegram Premium, which must never grant Bezy Premium.
  const baseData = {
    telegramId: user.id,
    firstName: user.first_name || '',
    username: user.username || '',
    languageCode: user.language_code || '',
    photoUrl: user.photo_url || '',
    updatedAt: now
  };

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
    baseData.profile = nextProfile;
    baseData.profileComplete = nextProfile.profileComplete;
    baseData.discoverable = nextProfile.discoverable;
  }

  let nextPreferences = current.preferences || normalizePreferences();
  if (req.body?.preferences && typeof req.body.preferences === 'object') {
    nextPreferences = normalizePreferences(req.body.preferences);
    baseData.preferences = nextPreferences;
  }

  // Notification choices are opt-out: an account that has never touched them has everything
  // on. Only the categories the user is allowed to control are stored — transactional
  // messages are not represented here at all, so no payload can switch them off.
  let nextNotifications = notificationSettings(current);
  if (req.body?.notifications && typeof req.body.notifications === 'object') {
    nextNotifications = normalizeNotificationSettings(req.body.notifications);
    baseData.notifications = nextNotifications;
  }

  if (!snap.exists) {
    await ref.set({
      ...baseData,
      profile: nextProfile,
      preferences: nextPreferences,
      notifications: nextNotifications,
      profileComplete: Boolean(nextProfile.profileComplete),
      discoverable: Boolean(nextProfile.discoverable),
      createdAt: now
    });
  } else {
    await ref.update(baseData);
  }

  const latest = await ref.get();
  const data = latest.data() || {};
  return res.status(200).json({
    ok: true,
    userId: String(user.id),
    // Existing accounts that predate the age gate are reported as needing the declaration
    // rather than being silently treated as confirmed.
    needsAgeConfirmation: data.ageEligibilityConfirmed !== true,
    ageEligibility: {
      confirmed: data.ageEligibilityConfirmed === true,
      method: data.ageEligibilityMethod || null
    },
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
