// Bezy API contract suite. Pure — no Firestore, no network, no credentials: it pins the
// documented response shapes (docs/API_CONTRACT.md, version 1) against the builders that
// actually produce them, so a shape change must be a deliberate contract change, not an
// accident. A changed key set, an added field, or a field leaking past its disclosure
// boundary fails here.

import fs from 'node:fs';
import path from 'node:path';
import { publicProfile } from '../api/discover.js';
import { publicMatch, sharedSignals } from '../api/matches.js';
import { publicLiker } from '../api/likes.js';
import { publicPlans } from '../api/premium.js';
import { normalizeProfile, normalizePreferences, PROMPT_IDS, LANGUAGE_IDS } from '../api/profile/me.js';
import { premiumState, limitsFor, currentUsage, checkSwipeQuota, premiumPlans, LIMITS } from '../api/_premium.js';
import { defaultNotificationSettings, normalizeNotificationSettings, OPTIONAL_CATEGORIES } from '../api/_notify.js';
import { processingPaused } from '../api/_privacy.js';
import { reminderMessage } from '../api/_reminders.js';
import { retentionPolicy, isConfigured } from '../api/_retention.js';

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
