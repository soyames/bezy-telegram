import { query, toIso, ApiError } from './_db.js';
import { requirePost, requireTelegramUser, normalizeLanguageTag, resolveUserLanguage } from './_telegram.js';
import { isPremiumActive, limitsFor, currentUsage } from './_premium.js';
import { rateLimit } from './_ratelimit.js';
import { processingPaused } from './_privacy.js';
import { localizeProfileTexts } from './_profileText.js';

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
    if (!(await rateLimit(null, res, user.id, 'discover'))) return;
    return await handleDiscover(req, res, user);
  } catch (error) {
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message });
    console.error('Discover request failed:', error);
    return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
  }
}

// A candidate row becomes the same PostgreSQL-shaped object every pure scoring function
// already consumes, so the eligibility/ranking logic is byte-for-byte the same.
function rowToCandidate(row) {
  return {
    id: String(row.telegram_id),
    firstName: row.first_name ?? '',
    photoUrl: row.photo_url ?? '',
    profile: {
      displayName: row.display_name ?? '',
      age: row.age ?? null,
      gender: row.gender ?? '',
      seeking: row.seeking ?? 'everyone',
      city: row.city ?? '',
      bio: row.bio ?? '',
      interests: row.interests ?? [],
      prompts: row.prompts || [],
      languages: row.languages ?? [],
      discoverable: row.discoverable === true,
      profileComplete: row.profile_complete === true
    },
    preferences: {
      minAge: row.pref_min_age ?? 18,
      maxAge: row.pref_max_age ?? 100,
      city: row.pref_city ?? '',
      sameCityOnly: row.pref_same_city_only === true,
      languages: row.pref_languages ?? []
    },
    ageEligibilityConfirmed: row.age_eligibility_confirmed === true,
    profileComplete: row.profile_complete === true,
    discoverable: row.discoverable === true,
    processingRestricted: row.processing_restricted === true,
    processingObjection: row.processing_objection === true,
    createdAt: row.created_at ? new Date(row.created_at) : null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
    bezyPremium: {
      active: row.premium_active === true,
      planId: row.premium_plan_id ?? null,
      expiresAt: row.premium_expires_at ? new Date(row.premium_expires_at) : null,
      revokedAt: row.premium_revoked_at || null,
      revocationReason: row.premium_revocation_reason ?? null
    },
    usage: {
      day: row.usage_day ?? null,
      discoveryActions: Number(row.usage_discovery_actions) || 0,
      superLikes: Number(row.usage_super_likes) || 0
    }
  };
}

const CANDIDATE_SELECT = `
  SELECT u.telegram_id, u.first_name, u.photo_url, u.age_eligibility_confirmed, u.profile_complete, u.discoverable,
         u.processing_restricted, u.processing_objection, u.created_at, u.updated_at,
         COALESCE((SELECT json_agg(json_build_object('id',pa.id,'answer',pa.answer) ORDER BY pa.position, pa.id) FROM prompt_answers pa WHERE pa.telegram_id=u.telegram_id),'[]'::json) AS prompts,
         p.display_name, p.age, p.gender, p.seeking, p.city, p.bio, p.interests, p.languages,
         pr.min_age AS pref_min_age, pr.max_age AS pref_max_age, pr.city AS pref_city,
         pr.same_city_only AS pref_same_city_only, pr.languages AS pref_languages,
         pm.active AS premium_active, pm.plan_id AS premium_plan_id, pm.expires_at AS premium_expires_at,
         pm.revoked_at AS premium_revoked_at, pm.revocation_reason AS premium_revocation_reason,
         us.day AS usage_day, us.discovery_actions AS usage_discovery_actions, us.super_likes AS usage_super_likes
  FROM users u
  LEFT JOIN profiles p ON p.telegram_id = u.telegram_id
  LEFT JOIN preferences pr ON pr.telegram_id = u.telegram_id
  LEFT JOIN premium_memberships pm ON pm.telegram_id = u.telegram_id
  LEFT JOIN usage us ON us.telegram_id = u.telegram_id
  WHERE u.discoverable = TRUE AND u.profile_complete = TRUE AND u.age_eligibility_confirmed = TRUE`;

async function handleDiscover(req, res, user) {
  const userId = String(user.id);

  // The caller's own account, and everything already decided or blocked — the same
  // exclusions the deck has always applied, in both directions.
  const [currentResult, excludedResult] = await Promise.all([
    query(
      `SELECT u.*, us.day AS usage_day, us.discovery_actions AS usage_discovery_actions, us.super_likes AS usage_super_likes
       FROM users u LEFT JOIN usage us ON us.telegram_id = u.telegram_id
       WHERE u.telegram_id = $1`,
      [userId]
    ),
    query(
      `SELECT target_id AS id FROM actions WHERE actor_id = $1
       UNION SELECT blocked_id FROM blocks WHERE blocker_id = $1
       UNION SELECT blocker_id FROM blocked_by WHERE blocked_id = $1`,
      [userId]
    )
  ]);

  const u = currentResult.rows[0];
  if (!u) return res.status(404).json({ error: 'PROFILE_NOT_FOUND' });

  const profileResult = await query('SELECT * FROM profiles WHERE telegram_id = $1', [userId]);
  const prefsResult = await query('SELECT * FROM preferences WHERE telegram_id = $1', [userId]);
  const p = profileResult.rows[0] || {};
  const pr = prefsResult.rows[0] || {};

  const currentData = {
    telegramId: userId,
    profile: {
      displayName: p.display_name ?? '', age: p.age ?? null, gender: p.gender ?? '',
      seeking: p.seeking ?? 'everyone', city: p.city ?? '', bio: p.bio ?? '',
      interests: p.interests ?? [], prompts: [], languages: p.languages ?? [],
      discoverable: u.discoverable === true, profileComplete: u.profile_complete === true
    },
    preferences: { minAge: pr.min_age ?? 18, maxAge: pr.max_age ?? 100, city: pr.city ?? '', sameCityOnly: pr.same_city_only === true, languages: pr.languages ?? [] },
    ageEligibilityConfirmed: u.age_eligibility_confirmed === true,
    profileComplete: u.profile_complete === true,
    discoverable: u.discoverable === true,
    processingRestricted: u.processing_restricted === true,
    processingObjection: u.processing_objection === true,
    createdAt: u.created_at ? new Date(u.created_at) : null,
    updatedAt: u.updated_at ? new Date(u.updated_at) : null,
    locale: u.locale ?? null,
    languageCode: u.language_code ?? null,
    bezyPremium: null,
    usage: { day: u.usage_day ?? null, discoveryActions: Number(u.usage_discovery_actions) || 0, superLikes: Number(u.usage_super_likes) || 0 }
  };
  const premiumResult = await query('SELECT * FROM premium_memberships WHERE telegram_id = $1', [userId]);
  if (premiumResult.rows[0]) {
    const m = premiumResult.rows[0];
    currentData.bezyPremium = {
      active: m.active === true, planId: m.plan_id, expiresAt: m.expires_at ? new Date(m.expires_at) : null,
      purchasedAt: m.purchased_at ? new Date(m.purchased_at) : null, revokedAt: m.revoked_at ? new Date(m.revoked_at) : null,
      revocationReason: m.revocation_reason
    };
  }
  const excluded = new Set(excludedResult.rows.map((r) => String(r.id)));

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

  // The candidate set is EVERY discoverable, complete, 18+ declared user, and eligibility is
  // computed over the whole set before any ordering — the same no-window guarantee the
  // PostgreSQL implementation pinned. The SQL query is indexed by the partial
  // users_discoverable_idx; newest-first ordering is deterministic in memory below, with
  // missing timestamps treated as oldest, so no discoverable account is ever dropped by the
  // query itself. The response page remains 20.
  const candidatesResult = await query(CANDIDATE_SELECT);
  const candidates = candidatesResult.rows.map(rowToCandidate).sort((a, b) => {
    const aCreated = a.createdAt?.getTime?.() ?? 0;
    const bCreated = b.createdAt?.getTime?.() ?? 0;
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
  for (const candidate of candidates) {
    if (candidate.id === String(user.id) || excluded.has(candidate.id)) { decidedMisses++; continue; }
    const data = candidate;
    // A paused account is already undiscoverable, but it is excluded explicitly as well:
    // the legal state, not a derived visibility flag, is what must govern here.
    if (processingPaused(data)) { decidedMisses++; continue; }
    // The 18+ declaration is enforced on the candidate side too: an account that predates
    // the age gate and never declared can be served no deck and must appear in no deck.
    if (data.ageEligibilityConfirmed !== true) { hardMisses++; continue; }
    if (!data.profileComplete || !genderMatches(currentProfile, data.profile)) { hardMisses++; continue; }
    if (!matchesPreferences(preferences, currentProfile, data.profile, isPremium)) { preferenceMisses++; continue; }
    const createdAt = data.createdAt?.getTime?.() ?? 0;
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
      ...publicProfile(candidate.id, data),
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
    if (!candidates.some(candidate => candidate.id !== userId)) return 'no_supply';
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

  // User-generated content follows the viewer's locale: translations are ATTACHED to the
  // served page only (never substituting the original), cached under the author's own
  // document, and simply absent when the source and the viewer share a language.
  const page = eligible.slice(0, 20);
  // The Mini App sends its already-resolved locale (explicit choice > Telegram > browser >
  // English). Validating it against SUPPORTED_LOCALES keeps that single resolution chain
  // authoritative — no second locale system — and the stored values cover older clients.
  const viewerLocale = normalizeLanguageTag(req.body?.lang) || resolveUserLanguage(currentData);
  await Promise.all(page.map(async (profile) => {
    profile.translations = await localizeProfileTexts(null, profile.id, profile, viewerLocale);
  }));

  return res.status(200).json({
    ok: true,
    profiles: page,
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
