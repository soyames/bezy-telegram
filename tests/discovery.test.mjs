// Pure discovery-pipeline suite — no Firestore, no credentials, no synthetic accounts.
//
// Pins the invariants behind a live production discovery failure, where an eligible,
// discoverable user never reached another user's deck:
//
//   1. Eligibility ≠ ranking. pairCompatibility, preferenceFit, explorationTerm,
//      freshnessTerm, the Premium visibility boost and page diversity may reorder
//      candidates — they must never remove one. An eligible candidate with a low score
//      is still a candidate.
//   2. Reciprocal gender/seeking, including the rule that prefer_not_to_say only ever
//      matches a candidate seeking 'everyone'.
//   3. Default and malformed filter state stays broad — an accidental restrictive
//      serialization (cleared age input -> 0 -> clamped maxAge 18) must never empty a
//      deck, and an omitted filter must never shrink it.
//
// The Firestore-backed end of the same regression (the real handler, the candidate
// query, >100-pool windows, pagination) lives in tests/backend.test.mjs.
import {
  genderMatches,
  matchesPreferences,
  readPreferences,
  filtersActive,
  compatibility,
  pairCompatibility,
  explorationTerm,
  freshnessTerm,
  applyPageDiversity,
  preferenceFit
} from '../api/discover.js';
import { normalizeProfile, normalizePreferences } from '../api/profile/me.js';
import { processingPaused } from '../api/_privacy.js';

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `  -> ${String(detail).slice(0, 240)}` : ''}`); }
}
function section(title) { console.log(`\n== ${title} ==`); }

section('Gender/seeking eligibility (the documented matrix, Everyone semantics included)');
const MATRIX = [
  // caller gender, caller seeking, candidate gender, candidate seeking, expected
  // Explicit preference stays reciprocal: both directions must accept.
  ['woman', 'women', 'woman', 'women', true],
  ['woman', 'women', 'woman', 'men', false],
  ['woman', 'women', 'man', 'everyone', false],
  ['woman', 'men', 'man', 'women', true],
  ['woman', 'men', 'man', 'men', false],
  ['man', 'women', 'woman', 'men', true],
  ['man', 'men', 'man', 'men', true],
  ['non_binary', 'women', 'woman', 'everyone', true],
  // "Everyone" removes the gender/seeking restriction entirely: the caller's own gender
  // must never decide who is discoverable, and neither must the candidate's seeking.
  // Regression for the live failure: a caller seeking Everyone could not see a friend
  // whose own seeking did not accept the caller's gender.
  ['man', 'everyone', 'man', 'women', true],
  ['man', 'everyone', 'man', 'men', true],
  ['woman', 'everyone', 'man', 'women', true],
  ['woman', 'everyone', 'man', 'everyone', true],
  ['woman', 'everyone', 'woman', 'everyone', true],
  ['man', 'everyone', 'woman', 'everyone', true],
  ['non_binary', 'everyone', 'man', 'everyone', true],
  ['non_binary', 'everyone', 'woman', 'women', true],
  ['prefer_not_to_say', 'everyone', 'woman', 'everyone', true],
  ['prefer_not_to_say', 'everyone', 'woman', 'women', true],
  ['prefer_not_to_say', 'everyone', 'man', 'men', true],
  ['woman', 'everyone', 'prefer_not_to_say', 'everyone', true],
  ['woman', 'everyone', 'prefer_not_to_say', 'men', true],
  // A missing gender behaves like prefer_not_to_say; a missing seeking like 'everyone'.
  ['', 'everyone', 'woman', 'everyone', true],
  ['', 'everyone', 'woman', 'women', true],
  // The prefer_not_to_say rule is unchanged for callers with an explicit preference:
  // a prefer_not_to_say caller passes only candidates seeking 'everyone', and a
  // prefer_not_to_say candidate is invisible to callers seeking a specific gender.
  ['prefer_not_to_say', 'women', 'woman', 'everyone', true],
  ['prefer_not_to_say', 'women', 'woman', 'women', false],
  ['woman', 'women', 'prefer_not_to_say', 'everyone', false]
];
for (const [cg, cs, tg, ts, expected] of MATRIX) {
  check(`gender "${cg || '∅'}" seeking "${cs}" vs gender "${tg}" seeking "${ts}" -> ${expected}`,
    genderMatches({ gender: cg, seeking: cs }, { gender: tg, seeking: ts }) === expected);
}

section('Eligibility ≠ ranking: ordering stages never remove a candidate');
{
  const caller = { gender: 'woman', seeking: 'men', interests: ['music', 'travel'], languages: ['en'], city: 'Paris', age: 29 };
  const candidates = [
    { id: 'b', displayName: 'Bo', city: 'Paris', age: 31, gender: 'man', seeking: 'women', interests: ['music'], languages: ['fr'], bio: 'Hi' },
    { id: 'c', displayName: 'Cy', city: 'Lyon', age: 45, gender: 'man', seeking: 'women', interests: [], languages: [], bio: '' }, // sparse
    { id: 'd', displayName: 'Dee', city: 'Paris', age: 28, gender: 'man', seeking: 'everyone', interests: ['books'], languages: ['en'], bio: 'Hello' },
    { id: 'e', displayName: 'Em', city: '', age: 30, gender: 'man', seeking: 'women', interests: [], languages: [], bio: '', prompts: [] } // minimal
  ];
  const PREMIUM_BOOST = 6; // mirrors PREMIUM_VISIBILITY_BOOST in api/discover.js
  const now = Date.now();
  const scored = candidates.map((c) => {
    const score = compatibility(caller, c);
    const reverseScore = compatibility(c, caller) + (preferenceFit({ minAge: 18, maxAge: 100, languages: [] }, caller, false) ? 10 : 0);
    const orderKey = pairCompatibility(score, reverseScore)
      + explorationTerm(c)
      + freshnessTerm(now - 2 * 86400000)
      + (c.id === 'd' ? PREMIUM_BOOST : 0);
    return { ...c, score, orderKey };
  });
  const ordered = scored.slice().sort((a, b) => b.orderKey - a.orderKey);
  applyPageDiversity(ordered, caller);
  check('every candidate survives scoring, ordering and page diversity',
    ordered.length === candidates.length && candidates.every((c) => ordered.some((o) => o.id === c.id)),
    `in=${candidates.length} out=${ordered.length}`);
  check('the sparse and minimal candidates are still candidates after ranking',
    ordered.some((o) => o.id === 'c') && ordered.some((o) => o.id === 'e'));
  check('ranking changes order without touching membership (low score still present)',
    ordered.length === candidates.length, 'a low-scoring candidate must never be dropped');
}

section('Ordering terms stay bounded ordering-only');
check('explorationTerm is bounded 0..3',
  explorationTerm({}) === 3
  && explorationTerm({ interests: ['a'], languages: ['en'] }) === 1
  && explorationTerm({ interests: ['a'], languages: ['en'], bio: 'x' }) === 0);
check('pairCompatibility never exceeds the higher directional score',
  pairCompatibility(80, 90) <= 90 && pairCompatibility(20, 30) <= 30 && pairCompatibility(20, 90) <= 90);
check('freshnessTerm is bounded 0..4 and returns 0 for absent timestamps',
  freshnessTerm(null) === 0 && freshnessTerm(0) === 0
  && freshnessTerm(new Date()) === 4
  && freshnessTerm(new Date(Date.now() - 8 * 86400000)) === 2
  && freshnessTerm(new Date(Date.now() - 120 * 86400000)) === 0);

section('Default and malformed filter state stays broad');
{
  const defaults = readPreferences({});
  check('default minAge is 18 and maxAge is 100', defaults.minAge === 18 && defaults.maxAge === 100);
  check('default filters are inactive', !filtersActive(defaults));
  const malformed = readPreferences({ minAge: 0, maxAge: 0, city: ' ', sameCityOnly: 'yes', languages: ['xx'] });
  check('malformed numeric bounds clamp into 18..100', malformed.minAge === 18 && malformed.maxAge === 18);
  check('unknown language ids never survive the write path, so they can never become a stored filter',
    normalizePreferences({ languages: ['xx'] }).languages.length === 0);
  const normalized = normalizePreferences({ minAge: 18, maxAge: 100 });
  check('normalizePreferences defaults mirror readPreferences defaults',
    normalized.minAge === 18 && normalized.maxAge === 100 && !normalized.sameCityOnly && normalized.languages.length === 0);

  const complete = { displayName: 'Ada', age: 29, city: 'Paris', gender: 'woman', seeking: 'everyone' };
  check('a complete profile passes default preferences',
    matchesPreferences(defaults, {}, { ...complete, languages: ['en'] }, false));
  check('a profile listing no languages is never excluded by a language filter',
    matchesPreferences({ ...defaults, languages: ['fr'] }, {}, complete, false));
  check('an age filter excludes only profiles outside the band',
    matchesPreferences({ ...defaults, minAge: 25, maxAge: 35 }, {}, { ...complete, age: 40 }, false) === false
    && matchesPreferences({ ...defaults, minAge: 25, maxAge: 35 }, {}, { ...complete, age: 30 }, false) === true);
  check('city and same-city filters are Premium-gated and inactive for free callers',
    matchesPreferences({ ...defaults, city: 'Lyon', sameCityOnly: true }, { city: 'Paris' }, { ...complete, city: 'Lyon' }, false));
}

section('Profile completeness and discoverability stay linked');
{
  const completeProfile = { displayName: 'Ada', age: 29, city: 'Paris', gender: 'woman', seeking: 'men', discoverable: true };
  const normalized = normalizeProfile(completeProfile);
  check('a complete profile can be discoverable', normalized.profileComplete && normalized.discoverable);
  check('an incomplete profile can never be discoverable',
    normalizeProfile({ ...completeProfile, city: '' }).profileComplete === false
    && normalizeProfile({ ...completeProfile, city: '' }).discoverable === false);
  check('an out-of-range age can never complete a profile',
    normalizeProfile({ ...completeProfile, age: 17 }).profileComplete === false
    && normalizeProfile({ ...completeProfile, age: 101 }).profileComplete === false);
}

section('The production regression pair passes every pure eligibility gate');
{
  // Synthetic stand-ins for the live failure: caller and candidate are both complete,
  // discoverable, mutually eligible, unblocked, within default filters.
  const caller = {
    profile: { displayName: 'Caller', age: 29, city: 'Cotonou', gender: 'woman', seeking: 'men', interests: ['music'], languages: ['fr'] },
    profileComplete: true,
    ageEligibilityConfirmed: true,
    discoverable: true
  };
  const candidate = {
    profile: { displayName: 'Friend', age: 31, city: 'Cotonou', gender: 'man', seeking: 'women', interests: ['music', 'travel'], languages: ['fr', 'en'] },
    profileComplete: true,
    ageEligibilityConfirmed: true,
    discoverable: true
  };
  const preferences = readPreferences({});
  const gates = [
    ['not paused (either side)', !processingPaused(caller) && !processingPaused(candidate)],
    ['age declaration on the caller', caller.ageEligibilityConfirmed === true],
    ['profile complete (both)', caller.profileComplete === true && candidate.profileComplete === true],
    ['reciprocal gender/seeking', genderMatches(caller.profile, candidate.profile)],
    ['default preferences', matchesPreferences(preferences, caller.profile, candidate.profile, false)]
  ];
  let allPass = true;
  for (const [name, ok] of gates) {
    allPass = allPass && ok;
    check(`regression pair: ${name}`, ok);
  }
  check('regression pair passes every eligibility gate', allPass, 'the pair must be in the deck');
}

console.log(`\nDiscovery pipeline: ${pass} passed, ${fail} failed.`);
if (failures.length) console.log(`Failures:\n  ${failures.join('\n  ')}`);
process.exit(failures.length ? 1 : 0);
