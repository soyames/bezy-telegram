import { db } from '../_firebase.js';
import { requirePost, requireTelegramUser } from '../_telegram.js';

const ALLOWED_GENDERS = new Set(['woman', 'man', 'non_binary', 'prefer_not_to_say']);
const ALLOWED_SEEKING = new Set(['women', 'men', 'everyone']);

function cleanText(value, max) {
  return String(value ?? '').trim().slice(0, max);
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
    discoverable: complete && discoverable,
    profileComplete: complete
  };
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const user = requireTelegramUser(req, res);
  if (!user) return;

  const ref = db().collection('users').doc(String(user.id));
  const snap = await ref.get();
  const current = snap.exists ? snap.data() : {};
  const now = new Date();

  const baseData = {
    telegramId: user.id,
    firstName: user.first_name || '',
    lastName: user.last_name || '',
    username: user.username || '',
    languageCode: user.language_code || '',
    photoUrl: user.photo_url || '',
    isPremiumTelegram: Boolean(user.is_premium),
    updatedAt: now
  };

  let nextProfile = current.profile || {};
  if (req.body?.profile && typeof req.body.profile === 'object') {
    nextProfile = normalizeProfile(req.body.profile);
    baseData.profile = nextProfile;
    baseData.profileComplete = nextProfile.profileComplete;
    baseData.discoverable = nextProfile.discoverable;
  }

  if (!snap.exists) {
    await ref.set({
      ...baseData,
      profile: nextProfile,
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
    profile: data,
    needsProfile: !data.profileComplete
  });
}
