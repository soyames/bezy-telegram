import { db } from './_firebase.js';
import { requirePost, requireTelegramUser } from './_telegram.js';
import { isPremiumActive, limitsFor, currentUsage } from './_premium.js';
import { rateLimit } from './_ratelimit.js';
import { processingPaused } from './_privacy.js';

// Premium members receive a small, deterministic ranking boost. It changes ordering only;
// it never fabricates candidates and never guarantees a match.
export const PREMIUM_VISIBILITY_BOOST = 6;

// Exported for scripts/diagnose-discover.mjs so the operator diagnostic runs the exact
// production predicates rather than a reimplementation that could drift.
export function genderMatches(current, candidate) {
  const currentGender = current?.gender || 'prefer_not_to_say';
  const candidateGender = candidate?.gender || 'prefer_not_to_say';
  const currentSeeking = current?.seeking || 'everyone';
  const candidateSeeking = candidate?.seeking || 'everyone';

  // "Everyone" removes the gender/seeking restriction entirely: the caller's own gender
  // must never decide who is discoverable, and neither must the candidate's seeking. Every
  // other constraint — completeness, age, filters, blocks, decisions, paused legal states —
  // still applies. A like against a candidate who does not accept the caller can never match,
  // because a match requires the candidate to have liked the caller first.
  if (currentSeeking === 'everyone') return true;

  const wantsCandidate = (currentSeeking === 'women' && candidateGender === 'woman')
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
export function readPreferences(stored = {}) {
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

export function sameCity(a, b) {
  return Boolean(a) && Boolean(b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

// Whether any discovery filter deviates from "everyone". Drives the honest empty-deck
// explanation — the engine never silently relaxes these, only the user can.
export function filtersActive(preferences = {}) {
  return Boolean(preferences.sameCityOnly)
    || Boolean(String(preferences.city || '').trim())
    || (Array.isArray(preferences.languages) && preferences.languages.length > 0)
    || Number(preferences.minAge) > 18
    || Number(preferences.maxAge) < 100;
}

// Age range and language are available to everyone. City targeting and same-city-only are the
// "advanced discovery" filters and are applied only for active Premium members, so a
// free user cannot get Premium filtering by writing preferences directly.
//
// Language is deliberately NOT behind Premium. Being unable to hold a conversation is not a
// power-user concern, it is whether the product works at all — the same reasoning that keeps
// the age range free. A candidate with no languages listed is never excluded, so the filter
// narrows the deck for people who set it without punishing profiles that predate the field.
export function matchesPreferences(preferences, currentProfile, candidateProfile, isPremium) {
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
export function compatibility(current = {}, candidate = {}) {
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
 * Stage 2 reciprocal pair compatibility (design per ARCHITECTURE "Discovery strategy").
 *
 * A relationship needs both directions, so the pair model is floor-dominated: the proposed
 * shape 0.6·min + 0.3·mean − 0.1·gap reduces algebraically to 0.85·min + 0.05·max — the
 * lower directional score carries 17× the weight of the higher one. A lopsided pair (85/40)
 * therefore ranks below a balanced one (70/70), and a hard one-sided miss can never be
 * rescued by the other side's enthusiasm. Deterministic, symmetric, explainable, and it
 * reads only data already in hand — the reverse score is the same formula with the
 * arguments swapped, computed from profiles this request already loaded.
 */
export function pairCompatibility(scoreAB, scoreBA) {
  const low = Math.min(Number(scoreAB) || 1, Number(scoreBA) || 1);
  const high = Math.max(Number(scoreAB) || 1, Number(scoreBA) || 1);
  return Math.round(0.85 * low + 0.05 * high);
}

/**
 * Bounded deterministic exploration for sparse profiles (pair state 5): a candidate who has
 * declared very little (no interests/languages/bio/prompts) gets a small, fixed ordering
 * offset so new or quiet users are not systematically buried. It never touches the
 * displayed score, fabricates nothing, and is capped — a well-filled profile always beats
 * an empty one of equal compatibility.
 */
export function explorationTerm(profile = {}) {
  const signals = (profile.interests?.length || 0) + (profile.languages?.length || 0)
    + (profile.bio ? 1 : 0) + (profile.prompts?.length || 0);
  if (signals <= 1) return 3;
  if (signals === 2) return 1;
  return 0;
}

/**
 * Stage 3 freshness: a bounded, deterministic term favouring recently active profiles —
 * they are the ones who answer. Uses `updatedAt`/`createdAt` already on the candidate's
 * document (zero new reads, zero new data), never overrides hard eligibility, never
 * recycles, and is capped so it cannot suppress a genuinely good match.
 */
export function freshnessTerm(timestampValue, now = Date.now()) {
  const ms = timestampValue?.toMillis?.() ?? (timestampValue instanceof Date ? timestampValue.getTime() : Number(timestampValue) || 0);
  if (!ms || ms <= 0 || ms > now) return 0;
  const ageDays = (now - ms) / 86400000;
  if (ageDays <= 7) return 4;
  if (ageDays <= 30) return 2;
  if (ageDays <= 90) return 1;
  return 0;
}

/**
 * Stage 3 controlled diversity, page-local and bounded: within one returned page, after a
 * few candidates already share the caller's dominant declared signal (same city, or one of
 * the caller's interests), further same-signal candidates get a small ordering penalty.
 * Operates only on the current page — no cross-session state, no stored profile, no
 * demographic inference; every input is data the card itself shows. Bounded so it spreads
 * the page without outranking compatibility.
 */
export function applyPageDiversity(ordered, currentProfile = {}, signalLimit = 3, penalty = 3) {
  const seen = new Map();
  const callerInterests = new Set((currentProfile.interests || []).map((v) => String(v).toLowerCase()));
  for (const entry of ordered) {
    let signal = null;
    const theirCity = String(entry.city || '').trim().toLowerCase();
    if (theirCity && String(currentProfile.city || '').trim().toLowerCase() === theirCity) signal = 'city';
    else {
      const shared = (entry.interests || []).find((v) => callerInterests.has(String(v).toLowerCase()));
      if (shared) signal = `interest:${String(shared).toLowerCase()}`;
    }
    if (signal) {
      const count = seen.get(signal) || 0;
      if (count >= signalLimit) entry.orderKey = (entry.orderKey || 0) - penalty;
      seen.set(signal, count + 1);
    }
  }
  return ordered.sort((a, b) => (b.orderKey || 0) - (a.orderKey || 0));
}

/**
 * Stage 2 preference fit (pair state 2): would the *candidate* see the caller under the
 * candidate's own filters? Mirrors the same readPreferences/matchesPreferences semantics —
 * age range and languages always apply; city/same-city apply only when the candidate is
 * Premium, exactly as for their own deck. This is a soft ranking term only: it deprioritises
 * a pair where one side's stated preferences don't fit the other, it never excludes, and the
 * candidate's preferences are never disclosed or hinted at to the caller. Uses the
 * preferences already on the candidate's document — no extra reads, no new data.
 */
export function preferenceFit(seekerPreferences = {}, candidateProfile = {}, seekerIsPremium = false) {
  const minAge = Number(seekerPreferences.minAge);
  const maxAge = Number(seekerPreferences.maxAge);
  const age = Number(candidateProfile.age);
  if (Number.isFinite(minAge) && Number.isFinite(age) && age < minAge) return false;
  if (Number.isFinite(maxAge) && Number.isFinite(age) && age > maxAge) return false;
  const wanted = seekerPreferences.languages || [];
  if (wanted.length) {
    const spoken = candidateProfile.languages || [];
    if (spoken.length && !spoken.some((id) => wanted.includes(id))) return false;
  }
  if (seekerIsPremium) {
    const city = String(seekerPreferences.city || '').trim().toLowerCase();
    if (city && !String(candidateProfile.city || '').trim().toLowerCase().includes(city)) return false;
    if (seekerPreferences.sameCityOnly && !sameCity(seekerPreferences.city, candidateProfile.city)) return false;
  }
  return true;
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
  // The candidate set is EVERY discoverable user, and eligibility is computed over the whole
  // set before any ordering. The previous SC-3 query window (`limit(100)` + `orderBy`) is
  // rejected outright: it silently excluded eligible users beyond the newest 100, `orderBy`
  // drops documents missing `createdAt`, and `where` + `orderBy` requires a composite index
  // whose absence turns every deck load into a 500 (see docs/FAILURE_MODES.md — observed live
  // on the support module). The query is therefore a plain equality over the automatic
  // single-field index; newest-first ordering is applied in memory below, deterministic at
  // any pool size, with missing timestamps treated as oldest so no discoverable account is
  // ever dropped by the query itself. The response page remains 20.
  const candidatesSnap = await db().collection('users')
    .where('discoverable', '==', true)
    .get();
  const candidates = candidatesSnap.docs.slice().sort((a, b) => {
    const aCreated = a.data()?.createdAt?.toMillis?.() ?? 0;
    const bCreated = b.data()?.createdAt?.toMillis?.() ?? 0;
    return bCreated - aCreated || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });

  const preferences = readPreferences(currentData.preferences);
  const currentProfile = currentData.profile || {};
  const isPremium = isPremiumActive(currentData);
  const dayAgo = Date.now() - 86400000;

  const eligible = [];
  // Zero-result attribution: why did each candidate fail? Counted from data this request
  // already read, so the honest empty-deck explanation costs no extra query and discloses
  // nothing about any individual candidate.
  let hardMisses = 0;    // incomplete profile, or gender/seeking mismatch (never for Everyone callers)
  let decidedMisses = 0; // previously acted on or blocked in either direction
  let preferenceMisses = 0; // excluded by the caller's own filters
  for (const doc of candidates) {
    if (doc.id === String(user.id) || excluded.has(doc.id)) { decidedMisses++; continue; }
    const data = doc.data() || {};
    // A paused account is already undiscoverable, but it is excluded explicitly as well:
    // the legal state, not a derived visibility flag, is what must govern here.
    if (processingPaused(data)) { decidedMisses++; continue; }
    if (!data.profileComplete || !genderMatches(currentProfile, data.profile)) { hardMisses++; continue; }
    if (!matchesPreferences(preferences, currentProfile, data.profile, isPremium)) { preferenceMisses++; continue; }
    const createdAt = data.createdAt?.toMillis?.() ?? new Date(data.createdAt || 0).getTime();
    const candidateIsPremium = isPremiumActive(data);
    const score = compatibility(currentProfile, data.profile);
    // Stage 2: ordering is the reciprocal pair, not the one-sided score. The card keeps
    // showing the caller's own perspective; the other side is never disclosed or implied.
    // The reverse side is the same formula plus the candidate's own preference fit (+10) —
    // a soft, invisible term that realises pair state 2 without a single extra read.
    const reverseScore = compatibility(data.profile, currentProfile)
      + (preferenceFit(data.preferences, currentProfile, candidateIsPremium) ? 10 : 0);
    const orderKey = pairCompatibility(score, reverseScore)
      + explorationTerm(data.profile)
      + freshnessTerm(data.updatedAt ?? data.createdAt)
      + (candidateIsPremium ? PREMIUM_VISIBILITY_BOOST : 0);
    eligible.push({
      ...publicProfile(doc.id, data),
      compatibility: candidateIsPremium ? Math.min(99, score + PREMIUM_VISIBILITY_BOOST) : score,
      isNew: Number.isFinite(createdAt) && createdAt >= dayAgo,
      orderKey,
      // Premium insight, server-gated: the field is simply absent for free callers.
      breakdown: isPremium ? compatibilityBreakdown(currentProfile, data.profile) : undefined
    });
  }

  // The empty-deck reason is the dominant miss category, from data already in hand:
  // 'no_supply' — nothing discoverable at all; 'filters' — the caller's own preferences
  // explain it; 'eligibility' — hard reciprocal eligibility (who you are / who you're
  // looking for) explains it; 'pool' — everyone left has already been decided on.
  function emptyReasonFor() {
    if (eligible.length) return null;
    if (candidates.length === 0) return 'no_supply';
    if (preferenceMisses >= hardMisses && preferenceMisses >= decidedMisses) return 'filters';
    if (hardMisses >= decidedMisses) return 'eligibility';
    return 'pool';
  }

  eligible.sort((a, b) => b.orderKey - a.orderKey);
  applyPageDiversity(eligible, currentProfile);
  // The ordering key is internal: the card payload keeps its documented shape, and the
  // other side's directional score is never disclosed.
  for (const profile of eligible) delete profile.orderKey;

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
    },
    // Honest zero-result diagnostics: the Mini App explains the empty deck and offers
    // explicit actions. Nothing here alters preferences or recycles decided candidates —
    // the strict pool stays strict, and the reason is computed from the caller's own view.
    emptyReason: emptyReasonFor()
  });
}
