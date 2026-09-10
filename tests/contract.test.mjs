// Bezy API contract suite. Pure — no Firestore, no network, no credentials: it pins the
// documented response shapes (docs/API_CONTRACT.md, version 1) against the builders that
// actually produce them, so a shape change must be a deliberate contract change, not an
// accident. A changed key set, an added field, or a field leaking past its disclosure
// boundary fails here.

import fs from 'node:fs';
import path from 'node:path';
import { publicProfile, compatibilityBreakdown, filtersActive, compatibility, pairCompatibility, explorationTerm, preferenceFit, freshnessTerm, applyPageDiversity } from '../api/discover.js';
import { publicMatch, sharedSignals } from '../api/matches.js';
import { publicLiker } from '../api/likes.js';
import { publicPlans } from '../api/premium.js';
import { normalizeProfile, normalizePreferences, PROMPT_IDS, LANGUAGE_IDS } from '../api/profile/me.js';
import { premiumState, limitsFor, currentUsage, checkSwipeQuota, premiumPlans, LIMITS } from '../api/_premium.js';
import { defaultNotificationSettings, normalizeNotificationSettings, OPTIONAL_CATEGORIES } from '../api/_notify.js';
import { processingPaused } from '../api/_privacy.js';
import { reminderMessage } from '../api/_reminders.js';
import { retentionPolicy, isConfigured } from '../api/_retention.js';
import { SUPPORT_CATEGORIES, SUPPORT_STATUSES, SUPPORT_DETAILS_MAX, formatSupportReference, normalizeSupportRequest, diagnosePremium, diagnoseDiscovery, diagnoseProfile } from '../api/_support.js';
import { REPORT_STATUSES, triageTransition, summarizeReports } from '../api/_moderation.js';
import { RATE_LIMITS } from '../api/_ratelimit.js';
import { summarizeOutcomes, outcomeReport } from '../api/_outcomes.js';

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `  -> ${String(detail).slice(0, 240)}` : ''}`); }
}
function section(title) { console.log(`\n== ${title} ==`); }

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// Exact key sets. The order in these arrays is the order of docs/API_CONTRACT.md v1; the
// test compares key sets, not order.
const SHAPES = {
  deckCard: ['id', 'displayName', 'age', 'city', 'bio', 'interests', 'prompts', 'languages', 'photoUrl', 'compatibility', 'isNew'],
  deckCardBase: ['id', 'displayName', 'age', 'city', 'bio', 'interests', 'prompts', 'languages', 'photoUrl'],
  liker: ['id', 'displayName', 'age', 'city', 'bio', 'interests', 'photoUrl', 'action', 'likedAt', 'likedAtMs'],
  matchCard: ['id', 'displayName', 'age', 'city', 'bio', 'interests', 'prompts', 'languages', 'photoUrl', 'username'],
  matchCardEnvelope: ['sharedSignals', 'matchId', 'matchedAtMs', 'matchedAt'],
  signal: ['type', 'values'],
  profileStored: ['displayName', 'age', 'city', 'gender', 'seeking', 'interests', 'bio', 'prompts', 'languages', 'discoverable', 'profileComplete'],
  preferencesStored: ['minAge', 'maxAge', 'city', 'sameCityOnly', 'languages'],
  notificationSettings: ['matches', 'super_likes', 'profile_reminders'],
  premiumState: ['active', 'planId', 'expiresAt', 'daysRemaining', 'revoked', 'revocationReason'],
  plan: ['id', 'stars', 'currency', 'durationMonths', 'bestValue'],
  swipeQuota: ['allowed', 'reason', 'usage', 'limits'],
  reminderMessage: ['text', 'button']
};

const keys = (obj) => Object.keys(obj).sort();

// ---------------------------------------------------------------- fixtures
const ADA_DOC = {
  firstName: 'Ada',
  photoUrl: 'https://t.me/i/userpic/320/ada.jpg',
  telegramId: 900000001,
  username: 'ada_bezy_test',
  profile: {
    displayName: 'Ada', age: 29, city: 'Paris', gender: 'woman', seeking: 'men',
    interests: ['music'], bio: 'Hello.', prompts: [{ id: 'perfect_sunday', answer: 'Walk.' }],
    languages: ['fr', 'en'], discoverable: true, profileComplete: true
  }
};

// ---------------------------------------------------------------- discover card
section('Discover card (version 1)');
{
  const card = publicProfile('900000001', ADA_DOC);
  check('the deck card carries exactly the documented base fields',
    JSON.stringify(keys(card)) === JSON.stringify([...SHAPES.deckCardBase].sort()),
    keys(card).join(','));
  check('the card id is a string', typeof card.id === 'string' && card.id === '900000001');
  check('name, age and city come from the profile', card.displayName === 'Ada' && card.age === 29 && card.city === 'Paris');
  check('interests, prompts and languages are arrays', [card.interests, card.prompts, card.languages].every(Array.isArray));
  // The disclosure boundary: the Telegram handle is the contact vector and is released only
  // on a mutual match.
  check('the deck card never carries the @username', card.username === undefined, keys(card).join(','));
  check('the deck card never carries the Telegram id beyond the target id', card.telegramId === undefined && !('telegramId' in card));
  check('sensitive attributes never leave the backend', !('gender' in card) && !('seeking' in card));
  const empty = publicProfile('900000002', {});
  check('a profileless account still yields a well-typed card',
    empty.displayName === '' && empty.age === null && empty.city === '' && empty.photoUrl === ''
    && [empty.interests, empty.prompts, empty.languages].every(Array.isArray));
}

// ---------------------------------------------------------------- matches card
section('Match card (version 1)');
{
  const card = publicMatch('900000001', ADA_DOC);
  check('the match card carries exactly the documented fields',
    JSON.stringify(keys(card)) === JSON.stringify([...SHAPES.matchCard].sort()),
    keys(card).join(','));
  check('the handle is released only on a match', typeof card.username === 'string' && card.username === 'ada_bezy_test');
  check('the match card still never exposes gender or seeking', !('gender' in card) && !('seeking' in card));

  const signals = sharedSignals(ADA_DOC.profile, { interests: ['music', 'travel'], city: 'Paris', age: 27 });
  check('shared signals carry exactly the documented fields',
    signals.every((s) => JSON.stringify(keys(s)) === JSON.stringify(SHAPES.signal)));
  check('shared signals name only the documented types',
    signals.every((s) => ['interests', 'city', 'age'].includes(s.type)), JSON.stringify(signals));
  check('shared signals expose values the counterpart already published',
    signals.find((s) => s.type === 'interests')?.values.join(',') === 'music');
  check('gender and seeking never appear as a shared signal',
    !JSON.stringify(signals).includes('gender') && !JSON.stringify(signals).includes('seeking'));
}

// ---------------------------------------------------------------- premium insight (PR-8)
section('Compatibility breakdown (contract version 1.1)');
{
  const breakdown = compatibilityBreakdown(
    { interests: ['Music', 'travel'], languages: ['en', 'fr'], city: 'Paris', age: 29 },
    { interests: ['music', 'Travel'], languages: ['fr'], city: 'paris', age: 31 }
  );
  check('the breakdown carries exactly the documented fields',
    JSON.stringify(keys(breakdown)) === JSON.stringify(['closeInAge', 'sharedCity', 'sharedInterests', 'sharedLanguages'].sort()),
    keys(breakdown).join(','));
  check('shared interests are matched case-insensitively and keep the candidate\'s own spelling',
    JSON.stringify(breakdown.sharedInterests) === JSON.stringify(['music', 'Travel']), JSON.stringify(breakdown.sharedInterests));
  check('shared languages are matched on machine tokens', JSON.stringify(breakdown.sharedLanguages) === JSON.stringify(['fr']));
  check('the shared city is the candidate\'s own published value', breakdown.sharedCity === 'paris');
  check('age proximity uses the documented 5-year window',
    breakdown.closeInAge === true && compatibilityBreakdown({ age: 29 }, { age: 35 }).closeInAge === false);
  check('the breakdown never carries sensitive attributes', !('gender' in breakdown) && !('seeking' in breakdown));
  check('the base deck card shape has no breakdown key', !('breakdown' in publicProfile('900000001', ADA_DOC)));
  check('filter detection matches the documented defaults',
    filtersActive({ minAge: 18, maxAge: 100, city: '', sameCityOnly: false, languages: [] }) === false
    && filtersActive({ minAge: 18, maxAge: 100, city: '', sameCityOnly: true, languages: [] }) === true
    && filtersActive({ minAge: 30, maxAge: 100, city: '', sameCityOnly: false, languages: [] }) === true
    && filtersActive({ minAge: 18, maxAge: 100, city: '', sameCityOnly: false, languages: ['en'] }) === true);
}

// ---------------------------------------------------------------- Stage 2 reciprocal pair
section('Reciprocal pair compatibility (Stage 2)');
{
  check('the pair model is symmetric', pairCompatibility(85, 40) === pairCompatibility(40, 85));
  check('a balanced pair beats a lopsided one with a higher mean',
    pairCompatibility(70, 70) > pairCompatibility(85, 40)
    && pairCompatibility(55, 55) > pairCompatibility(50, 90));
  check('a hard one-sided miss can never be rescued',
    pairCompatibility(1, 99) < 10 && pairCompatibility(20, 98) < pairCompatibility(50, 50));
  check('the implemented form equals the documented 0.6/0.3/0.1 formula',
    pairCompatibility(83, 47) === Math.round(0.6 * 47 + 0.3 * ((83 + 47) / 2) - 0.1 * Math.abs(83 - 47)));
  check('the directional score stays deterministic and ranged',
    compatibility(ADA_DOC.profile, ADA_DOC.profile) >= 1 && compatibility({}, {}) >= 1 && compatibility({}, {}) <= 99);
  check('exploration is bounded and rewards only sparse profiles',
    explorationTerm({ interests: ['a'], languages: ['en'], bio: 'b', prompts: [{ id: 'i_value', answer: 'x' }] }) === 0
    && explorationTerm({ interests: ['a'] }) === 3
    && explorationTerm({ interests: ['a'], bio: 'b' }) === 1
    && explorationTerm({}) === 3);
  check('preference fit mirrors the documented filter semantics',
    preferenceFit({ minAge: 30, maxAge: 40 }, { age: 29 }) === false
    && preferenceFit({ minAge: 18, maxAge: 100 }, { age: 29 }) === true
    && preferenceFit({ languages: ['en'] }, { languages: ['fr'] }) === false
    && preferenceFit({ languages: ['en'] }, { languages: [] }) === true
    && preferenceFit({ languages: [] }, {}) === true);
  check('city terms apply only for Premium seekers',
    preferenceFit({ city: 'Paris' }, { city: 'Lyon' }, false) === true
    && preferenceFit({ city: 'Paris' }, { city: 'Lyon' }, true) === false
    && preferenceFit({ sameCityOnly: true, city: 'Paris' }, { city: 'Lyon' }, true) === false);
  check('the reverse preference term creates real pair asymmetry',
    pairCompatibility(70, 80) > pairCompatibility(70, 70));
}

// ---------------------------------------------------------------- Stage 3 adaptive (slice 1)
section('Stage 3 freshness and page diversity');
{
  const NOW = 1_800_000_000_000;
  check('freshness decays in bounded steps and never negatives',
    freshnessTerm(new Date(NOW - 2 * 86400000), NOW) === 4
    && freshnessTerm(new Date(NOW - 20 * 86400000), NOW) === 2
    && freshnessTerm(new Date(NOW - 80 * 86400000), NOW) === 1
    && freshnessTerm(new Date(NOW - 400 * 86400000), NOW) === 0
    && freshnessTerm(null, NOW) === 0
    && freshnessTerm(new Date(NOW + 1000), NOW) === 0);
  // Five equal candidates, all same city as the caller: the penalty is bounded and page-local.
  const page = ['b', 'c', 'd', 'e', 'f'].map((id) => ({
    id, orderKey: 50, city: 'Paris', interests: ['music']
  }));
  const diverse = applyPageDiversity(page, { city: 'Paris', interests: ['music'] });
  check('page diversity is bounded', diverse.every((entry) => entry.orderKey >= 47)
    && diverse.filter((entry) => entry.orderKey === 47).length === 2);
  check('page diversity preserves all candidates', diverse.length === 5
    && JSON.stringify(diverse.map((e) => e.id).sort()) === JSON.stringify(['b', 'c', 'd', 'e', 'f']));
  check('page diversity leaves no cross-page state',
    applyPageDiversity([{ id: 'x', orderKey: 50, city: 'Paris', interests: ['music'] }], { city: 'Paris', interests: ['music'] })[0].orderKey === 50);
}

// ---------------------------------------------------------------- likes
section('Liker card (version 1)');
{
  const liker = publicLiker('900000002', { ...ADA_DOC, profile: { ...ADA_DOC.profile, displayName: 'Bo' } });
  check('the liker card carries exactly the documented base fields',
    JSON.stringify(keys(liker)) === JSON.stringify(['id', 'displayName', 'age', 'city', 'bio', 'interests', 'photoUrl'].sort()),
    keys(liker).join(','));
  check('the liker card respects the same disclosure boundary', liker.username === undefined && !('telegramId' in liker));
}

// ---------------------------------------------------------------- profile + preferences
section('Stored profile and preferences (version 1)');
{
  const profile = normalizeProfile({ displayName: 'Ada', age: 29, city: 'Paris', gender: 'woman', seeking: 'men', interests: ['x'], bio: 'y', discoverable: true });
  check('a stored profile has exactly the documented fields',
    JSON.stringify(keys(profile)) === JSON.stringify([...SHAPES.profileStored].sort()),
    keys(profile).join(','));
  check('stored field types are stable', typeof profile.age === 'number' && Array.isArray(profile.interests)
    && Array.isArray(profile.prompts) && Array.isArray(profile.languages) && typeof profile.profileComplete === 'boolean');
  const prefs = normalizePreferences({ minAge: 30, maxAge: 40, sameCityOnly: true, languages: ['en'] });
  check('stored preferences have exactly the documented fields',
    JSON.stringify(keys(prefs)) === JSON.stringify([...SHAPES.preferencesStored].sort()),
    keys(prefs).join(','));
  check('preference types are stable', typeof prefs.minAge === 'number' && typeof prefs.maxAge === 'number'
    && typeof prefs.sameCityOnly === 'boolean' && Array.isArray(prefs.languages));
  check('prompt ids and language ids are closed machine-token lists',
    PROMPT_IDS.length > 0 && LANGUAGE_IDS.length > 0
    && PROMPT_IDS.every((id) => /^[a-z_]+$/.test(id)) && LANGUAGE_IDS.every((id) => /^[a-z]{2}$/.test(id)));
}

// ---------------------------------------------------------------- premium
section('Premium (version 1)');
{
  const state = premiumState({ bezyPremium: { active: true, planId: 'monthly', expiresAt: new Date(Date.now() + 30 * 86400000) } });
  check('premium state has exactly the documented fields',
    JSON.stringify(keys(state)) === JSON.stringify([...SHAPES.premiumState].sort()),
    keys(state).join(','));
  const plan = publicPlans()[0];
  check('a public plan has exactly the documented fields',
    JSON.stringify(keys(plan)) === JSON.stringify([...SHAPES.plan].sort()), keys(plan).join(','));
  check('the plans come from the server catalogue', publicPlans().length === Object.keys(premiumPlans()).length);
  const quota = checkSwipeQuota({ usage: {} }, 'like', false);
  check('a quota decision has exactly the documented fields',
    JSON.stringify(keys(quota)) === JSON.stringify([...SHAPES.swipeQuota].sort()), keys(quota).join(','));
  check('limits carry the documented tiers', LIMITS.free.discoveryActions > 0 && LIMITS.premium.discoveryActions > LIMITS.free.discoveryActions);
  check('limitsFor returns the same shape for both tiers',
    JSON.stringify(keys(limitsFor(false))) === JSON.stringify(keys(limitsFor(true))), JSON.stringify(keys(limitsFor(false))));
}

// ---------------------------------------------------------------- notifications, privacy, reminders, retention
section('Supporting shapes (version 1)');
{
  check('notification settings hold exactly the optional categories',
    JSON.stringify(keys(defaultNotificationSettings())) === JSON.stringify([...SHAPES.notificationSettings].sort()),
    keys(defaultNotificationSettings()).join(','));
  check('normalization cannot add a category', keys(normalizeNotificationSettings({ invented: true })).every((k) => OPTIONAL_CATEGORIES.includes(k)));
  check('processingPaused answers the one documented question',
    processingPaused({ processingRestricted: true }) === true && processingPaused({ processingObjection: true }) === true && processingPaused({}) === false);
  check('a reminder message has exactly the documented fields',
    JSON.stringify(keys(reminderMessage('en'))) === JSON.stringify([...SHAPES.reminderMessage].sort()),
    keys(reminderMessage('en')).join(','));
  const policy = retentionPolicy();
  check('every retention rule is either configured or flagged',
    Object.values(policy).every((rule) => isConfigured(rule) || rule.legalReviewRequired === true || rule.days === null));
}

// ---------------------------------------------------------------- error catalogue
section('Error catalogue (version 1)');
{
  // Every error code the Mini App maps must be in the documented catalogue, and every
  // documented code must still be mapped — an unmapped code renders as a raw token.
  const app = read('app.js');
  const mapped = [...app.matchAll(/^\s{2}([A-Z][A-Z_]{3,}): 'app\./gm)].map((m) => m[1]).sort();
  const DOCUMENTED = ['AGE_CONFIRMATION_REQUIRED', 'DATABASE_UNAVAILABLE', 'DISCOVERY_LIMIT_REACHED', 'INVALID_SESSION', 'PREMIUM_REQUIRED', 'PREMIUM_UNAVAILABLE', 'PROCESSING_RESTRICTED', 'PROFILE_NOT_FOUND', 'RATE_LIMITED', 'SUPER_LIKE_LIMIT_REACHED', 'TARGET_NOT_FOUND'];
  check('every documented error code is mapped in the Mini App',
    DOCUMENTED.every((code) => mapped.includes(code)), DOCUMENTED.filter((code) => !mapped.includes(code)).join(','));
  check('every mapped error code is documented in the contract',
    mapped.every((code) => DOCUMENTED.includes(code)), mapped.filter((code) => !DOCUMENTED.includes(code)).join(','));
  // The mapping values pointing at real catalogue keys is enforced by the localization
  // suite's usage-coverage walk.
}

// ---------------------------------------------------------------- support flow (CN-7)
section('Support flow (contract version 1.2)');
{
  // Pinned after a live 500: where + orderBy on different fields requires a composite
  // index that may not exist. Support and reminder reads must sort in memory instead.
  check('support reads never rely on a composite index', !/orderBy\(/.test(read('api/_support.js')),
    'orderBy found in api/_support.js');
  // Discovery follows the same discipline after a live discovery failure: the previous
  // SC-3 window (newest 100 over a composite index) silently excluded eligible users
  // beyond the window — and dropped documents missing `createdAt` — so the candidate
  // query must be a plain equality with in-memory newest-first ordering. No query-level
  // window, no composite index, and the declared indexes must not contain one for users.
  check('discovery never orders in the query',
    !/orderBy\(/.test(read('api/discover.js')), 'orderBy found in api/discover.js');
  check('discovery never windows candidates in the query',
    !/\.limit\(100\)/.test(read('api/discover.js')), 'limit(100) found in api/discover.js');
  check('discovery orders newest-first in memory',
    /createdAt\?\.toMillis/.test(read('api/discover.js')), 'in-memory newest-first sort missing');
  const indexFile = JSON.parse(read('firestore.indexes.json'));
  check('no users composite index is declared for discovery',
    !(indexFile.indexes || []).some((i) => i.collectionGroup === 'users'),
    'a users composite index is still declared; the query no longer needs one');
  check('support categories are a closed machine-token list',
    SUPPORT_CATEGORIES.length > 0 && SUPPORT_CATEGORIES.every((id) => /^[a-z_]+$/.test(id)));
  check('support statuses are the documented four-state lifecycle',
    JSON.stringify(SUPPORT_STATUSES) === JSON.stringify(['open', 'in_progress', 'resolved', 'closed']));
  check('references are dense, zero-padded and prefixed',
    formatSupportReference(7) === 'BZ-0007' && formatSupportReference(1042) === 'BZ-1042');
  check('request normalization validates the category and truncates details',
    normalizeSupportRequest({ category: 'premium', details: 'x'.repeat(2000) }).details.length === SUPPORT_DETAILS_MAX
    && normalizeSupportRequest({ category: 'invented', details: 'y' }).category === null);
  check('premium diagnostics expose only user-visible membership facts',
    keys(diagnosePremium({ bezyPremium: { active: true, planId: 'monthly', expiresAt: new Date(Date.now() + 86400000) } }))
      .join(',') === ['active', 'daysRemaining', 'expiresAt', 'planId', 'revoked'].sort().join(','));
  check('discovery diagnostics name states, never other users',
    keys(diagnoseDiscovery({})).sort().join(',') === ['ageEligibilityConfirmed', 'discoverable', 'discoveryRemaining', 'filtersActive', 'processingObjection', 'processingRestricted', 'profileComplete'].sort().join(','));
  check('profile diagnostics list only the documented required fields',
    diagnoseProfile({ profile: { displayName: 'Ada', age: 29, city: 'Paris', gender: 'woman' } }).missing.join(',') === 'seeking');
  check('retention policy covers support requests', 'supportRequests' in retentionPolicy());
  check('support requests have the proposed operational default and stay overridable',
    isConfigured(retentionPolicy().supportRequests)
    && retentionPolicy().supportRequests.days === 365);
}

// ---------------------------------------------------------------- moderation tooling (SF-2/SF-3)
section('Moderation tooling (contract)');
{
  check('the report lifecycle is the documented three-state set',
    JSON.stringify(REPORT_STATUSES) === JSON.stringify(['open', 'resolved', 'dismissed']));
  check('open reports may be resolved or dismissed',
    triageTransition('open', 'resolved').update.status === 'resolved'
    && triageTransition('open', 'dismissed').update.status === 'dismissed');
  check('terminal states reject further transitions',
    triageTransition('resolved', 'dismissed').error === 'INVALID_TRANSITION'
    && triageTransition('dismissed', 'resolved').error === 'INVALID_TRANSITION');
  check('a triage note is bounded',
    triageTransition('open', 'resolved', 'x'.repeat(1000)).update.statusNote.length <= 500);
  const summary = summarizeReports([
    { reason: 'spam', status: 'open', createdAt: new Date() },
    { reason: 'spam', status: 'resolved', createdAt: new Date(Date.now() - 40 * 86400000) },
    { reason: 'other', status: 'open', createdAt: new Date() }
  ]);
  check('summarization counts reasons and statuses',
    summary.total === 3 && summary.byReason.spam === 2 && summary.byReason.other === 1
    && summary.byStatus.open === 2 && summary.byStatus.resolved === 1);
  check('the daily distribution covers only the last 30 days',
    Object.values(summary.byDay).reduce((a, b) => a + b, 0) === 2, JSON.stringify(summary.byDay));
  check('the support bucket exists and shares one ceiling across both channels',
    Array.isArray(RATE_LIMITS.support_create) && RATE_LIMITS.support_create.some((w) => w.windowSeconds === 86400),
    JSON.stringify(RATE_LIMITS.support_create));
}

// ---------------------------------------------------------------- Stage 4 outcome evaluation
section('Outcome evaluation (Stage 4)');
{
  const summary = summarizeOutcomes({
    likes: 100,
    matches: [
      { active: true }, { active: true }, { active: true },
      { active: false, endedReason: 'unmatch' },
      { active: false, endedReason: 'block' },
      { active: false, endedReason: 'account_deleted' },
      { active: false, endedReason: 'unmatch' }
    ],
    blocks: 5,
    unmatches: 2
  });
  check('the headline metric is mutual matches per like',
    summary.mutualMatchRate === 0.07 && summary.matches === 7 && summary.likes === 100);
  check('continued-match rate is active over total',
    summary.continuedMatchRate === 3 / 7 && summary.active === 3);
  check('unmatch and block-ended rates are fractions of ended matches',
    summary.unmatchRate === 2 / 4 && summary.blockEndedRate === 1 / 4);
  check('account-deletion endings are reported but never counted as quality signals',
    summary.deletionEnded === 1 && !('deletionEndedRate' in summary));
  check('empty cohorts report nulls, never invented numbers',
    summarizeOutcomes({ likes: 0, matches: [], blocks: 0, unmatches: 0 }).mutualMatchRate === null);
  check('the report table has no engagement or swipe-volume rows',
    !outcomeReport(summary).some(([label]) => /swipe|session|time|view/i.test(label)));
}

// ---------------------------------------------------------------- governance records
section('Architecture decision records (version 1)');
{
  const ADRS = [
    '0001-telegram-native.md',
    '0002-platform-stack.md',
    '0003-payments-telegram-stars-only.md',
    '0004-photos-telegram-urls-only.md',
    '0005-identity-model.md',
    '0006-no-analytics.md',
    '0007-localization-presentation-only.md',
    '0008-billing-disabled-free-tier.md'
  ];
  check('the ADR directory holds exactly the documented ADRs',
    fs.readdirSync(path.join(root, 'docs/adr')).filter((f) => f.endsWith('.md')).sort().join(',') === ADRS.slice().sort().join(','),
    fs.readdirSync(path.join(root, 'docs/adr')).filter((f) => f.endsWith('.md')).sort().join(','));
  for (const file of ADRS) {
    const body = read(`docs/adr/${file}`);
    check(`${file} records status and decision`,
      /- \*\*Status:\*\*/.test(body) && /## Decision/.test(body) && /## Consequences/.test(body));
  }
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (fail) { console.log('Failed:\n - ' + failures.join('\n - ')); process.exit(1); }
