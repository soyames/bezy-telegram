import { db } from './_firebase.js';
import { requirePost, requireTelegramUser } from './_telegram.js';
import { isPremiumActive, limitsFor, currentUsage } from './_premium.js';
import { rateLimit } from './_ratelimit.js';
import { processingPaused } from './_privacy.js';

// Premium members receive a small, deterministic ranking boost. It changes ordering only;
// it never fabricates candidates and never guarantees a match.
const PREMIUM_VISIBILITY_BOOST = 6;

function genderMatches(current, candidate) {
  const currentGender = current?.gender || 'prefer_not_to_say';
  const candidateGender = candidate?.gender || 'prefer_not_to_say';
  const currentSeeking = current?.seeking || 'everyone';
  const candidateSeeking = candidate?.seeking || 'everyone';

  const wantsCandidate = currentSeeking === 'everyone'
    || (currentSeeking === 'women' && candidateGender === 'woman')
    || (currentSeeking === 'men' && candidateGender === 'man');
  const candidateWantsCurrent = candidateSeeking === 'everyone'
    || (candidateSeeking === 'women' && currentGender === 'woman')
    || (candidateSeeking === 'men' && currentGender === 'man');
  return wantsCandidate && candidateWantsCurrent;
}

/**
 * What a candidate in the deck is allowed to learn about someone they have not matched with.
 *
 * The Telegram @username is deliberately NOT included. Bezy's premise is that it controls
 * permission to connect: the Telegram handle is the actual contact vector, so releasing it
 * before a mutual match would let anyone browse the deck and message people directly,
 * bypassing consent entirely. The handle is released only by /api/matches.
 *
 * `id` is the target's Telegram id and is unavoidable — the client must be able to name who
 * it is swiping on — but nothing further about their Telegram identity is sent.
 */
export function publicProfile(id, data) {
  const profile = data.profile || {};
  return {
    id: String(id),
    displayName: profile.displayName || data.firstName || '',
    age: profile.age || null,
    city: profile.city || '',
    bio: profile.bio || '',
    interests: Array.isArray(profile.interests) ? profile.interests : [],
    prompts: Array.isArray(profile.prompts) ? profile.prompts : [],
    languages: Array.isArray(profile.languages) ? profile.languages : [],
    photoUrl: data.photoUrl || ''
  };
}

// Stored preferences are written by /api/profile/me. Read defensively so a user who has
// never opened Filters still gets a sane, unfiltered deck.
function readPreferences(stored = {}) {
  const min = Number(stored.minAge);
  const max = Number(stored.maxAge);
  const minAge = Number.isFinite(min) ? Math.min(Math.max(Math.trunc(min), 18), 100) : 18;
  const maxAge = Number.isFinite(max) ? Math.min(Math.max(Math.trunc(max), minAge), 100) : 100;
  return {
    minAge,
    maxAge,
    city: String(stored.city || '').trim(),
    sameCityOnly: Boolean(stored.sameCityOnly),
    languages: Array.isArray(stored.languages) ? stored.languages : []
  };
}

function sameCity(a, b) {
  return Boolean(a) && Boolean(b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

// Age range and language are available to everyone. City targeting and same-city-only are the
// "advanced discovery" filters and are applied only for active Premium members, so a
// free user cannot get Premium filtering by writing preferences directly.
//
// Language is deliberately NOT behind Premium. Being unable to hold a conversation is not a
// power-user concern, it is whether the product works at all — the same reasoning that keeps
// the age range free. A candidate with no languages listed is never excluded, so the filter
// narrows the deck for people who set it without punishing profiles that predate the field.
function matchesPreferences(preferences, currentProfile, candidateProfile, isPremium) {
  const age = Number(candidateProfile?.age);
  if (Number.isFinite(age) && (age < preferences.minAge || age > preferences.maxAge)) return false;
  const wanted = preferences.languages || [];
  if (wanted.length) {
    const spoken = candidateProfile?.languages || [];
    if (spoken.length && !spoken.some((id) => wanted.includes(id))) return false;
  }
  if (!isPremium) return true;
  if (preferences.city && !String(candidateProfile?.city || '').trim().toLowerCase().includes(preferences.city.toLowerCase())) return false;
  if (preferences.sameCityOnly && !sameCity(currentProfile?.city, candidateProfile?.city)) return false;
  return true;
}

// Deterministic compatibility derived from stored profile data — shared interests, a shared
// language, same city and age proximity. No randomness, no placeholder values, and nothing
// inferred: every term is something both people typed into their own profile.
//
// Sensitive attributes are deliberately absent. `gender` and `seeking` already decide who is
// eligible at all; letting them also weight the ranking would make an Article 9 attribute
// drive the ordering of the deck, which is exactly what P0-5 is reviewing.
function compatibility(current = {}, candidate = {}) {
  let score = 45;
  const mine = new Set((current.interests || []).map((value) => String(value).toLowerCase()));
  const shared = (candidate.interests || []).filter((value) => mine.has(String(value).toLowerCase())).length;
  score += Math.min(25, shared * 9);
  // A language in common is what makes a conversation possible at all, so it is worth roughly
  // as much as a shared city. Profiles that list no language are neither rewarded nor punished.
  const myLanguages = current.languages || [];
  const theirLanguages = candidate.languages || [];
  if (myLanguages.length && theirLanguages.length && theirLanguages.some((id) => myLanguages.includes(id))) score += 15;
  if (sameCity(current.city, candidate.city)) score += 18;
  const currentAge = Number(current.age);
  const candidateAge = Number(candidate.age);
  if (Number.isFinite(currentAge) && Number.isFinite(candidateAge)) {
    score += Math.round(12 * (1 - Math.min(1, Math.abs(currentAge - candidateAge) / 15)));
  }
  if (candidate.bio) score += 4;
  return Math.max(1, Math.min(99, score));
}

/**
 * "Why this score" — the Premium compatibility insight (PR-8). It explains the deterministic
 * score with exactly the terms the card already shows: shared interests, shared languages,
 * the candidate's city, age proximity. A Premium member therefore learns nothing new about
 * the person — only why the number says what it says. No sensitive attribute and no
 * inference, by the same rule as the score itself.
 *
 * The handler attaches this to deck cards for Premium callers only; free cards simply have
 * no `breakdown` field, so the server — not the client — is the gate.
 */
export function compatibilityBreakdown(current = {}, candidate = {}) {
  const mine = new Set((current.interests || []).map((value) => String(value).toLowerCase()));
  const sharedInterests = (candidate.interests || []).filter((value) => mine.has(String(value).toLowerCase()));
  const myLanguages = current.languages || [];
  const theirLanguages = candidate.languages || [];
  const sharedLanguages = theirLanguages.filter((id) => myLanguages.includes(id));
  const currentAge = Number(current.age);
  const candidateAge = Number(candidate.age);
  return {
    sharedInterests,
    sharedLanguages,
    sharedCity: sameCity(current.city, candidate.city) ? String(candidate.city || '') : null,
    closeInAge: Number.isFinite(currentAge) && Number.isFinite(candidateAge) && Math.abs(currentAge - candidateAge) <= 5
  };
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const user = requireTelegramUser(req, res);
  if (!user) return;

  try {
    if (!(await rateLimit(db(), res, user.id, 'discover'))) return;
    return await handleDiscover(req, res, user);
  } catch (error) {
    console.error('Discover request failed:', error);
    return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
  }
}

async function handleDiscover(req, res, user) {
  const currentRef = db().collection('users').doc(String(user.id));
  const currentSnap = await currentRef.get();
  if (!currentSnap.exists) return res.status(404).json({ error: 'PROFILE_NOT_FOUND' });

  const currentData = currentSnap.data() || {};
  // A paused account (GDPR Art. 18 restriction or Art. 21 objection) is checked before
  // anything else: while it is in force Bezy must not process the account for discovery at
  // all, so no deck is assembled and no other user's data is read on this account's behalf.
  // The two legal states are reported separately so the Mini App can say which one is in force.
  if (processingPaused(currentData)) {
    return res.status(200).json({
      ok: true,
      profiles: [],
      needsProfile: false,
      processingRestricted: currentData.processingRestricted === true,
      processingObjection: currentData.processingObjection === true
    });
  }
  // Bezy is 18+ only: no deck is served until the user has declared eligibility.
  if (currentData.ageEligibilityConfirmed !== true) {
    return res.status(200).json({ ok: true, profiles: [], needsProfile: true, needsAgeConfirmation: true });
  }
  if (!currentData.profileComplete) {
    return res.status(200).json({ ok: true, profiles: [], needsProfile: true });
  }

  // Excluded: everyone already decided on, everyone this user blocked, and everyone who
  // blocked this user. Blocks are filtered in both directions so neither party can reach
  // the other through discovery.
  const [actionSnap, blocksSnap, blockedBySnap] = await Promise.all([
    currentRef.collection('actions').get(),
    currentRef.collection('blocks').get(),
    currentRef.collection('blockedBy').get()
  ]);
  const excluded = new Set([
    ...actionSnap.docs.map((doc) => doc.id),
    ...blocksSnap.docs.map((doc) => doc.id),
    ...blockedBySnap.docs.map((doc) => doc.id)
  ]);
  const candidatesSnap = await db().collection('users').where('discoverable', '==', true).limit(100).get();

  const preferences = readPreferences(currentData.preferences);
  const currentProfile = currentData.profile || {};
  const isPremium = isPremiumActive(currentData);
  const dayAgo = Date.now() - 86400000;

  const eligible = [];
  for (const doc of candidatesSnap.docs) {
    if (doc.id === String(user.id) || excluded.has(doc.id)) continue;
    const data = doc.data() || {};
    // A paused account is already undiscoverable, but it is excluded explicitly as well:
    // the legal state, not a derived visibility flag, is what must govern here.
    if (processingPaused(data)) continue;
    if (!data.profileComplete || !genderMatches(currentProfile, data.profile)) continue;
    if (!matchesPreferences(preferences, currentProfile, data.profile, isPremium)) continue;
    const createdAt = data.createdAt?.toMillis?.() ?? new Date(data.createdAt || 0).getTime();
    const candidateIsPremium = isPremiumActive(data);
    const score = compatibility(currentProfile, data.profile);
    eligible.push({
      ...publicProfile(doc.id, data),
      compatibility: candidateIsPremium ? Math.min(99, score + PREMIUM_VISIBILITY_BOOST) : score,
      isNew: Number.isFinite(createdAt) && createdAt >= dayAgo,
      // Premium insight, server-gated: the field is simply absent for free callers.
      breakdown: isPremium ? compatibilityBreakdown(currentProfile, data.profile) : undefined
    });
  }

  eligible.sort((a, b) => b.compatibility - a.compatibility);

  const limits = limitsFor(isPremium);
  const usage = currentUsage(currentData);
  const stats = {
    available: eligible.length,
    bestMatch: eligible.length ? eligible[0].compatibility : 0,
    newToday: eligible.filter((profile) => profile.isNew).length,
    inYourCity: eligible.filter((profile) => sameCity(currentProfile.city, profile.city)).length
  };

  return res.status(200).json({
    ok: true,
    profiles: eligible.slice(0, 20),
    stats,
    preferences,
    needsProfile: false,
    isPremium,
    quota: {
      discoveryRemaining: Math.max(0, limits.discoveryActions - usage.discoveryActions),
      superLikesRemaining: Math.max(0, limits.superLikes - usage.superLikes),
      limits
    }
  });
}
