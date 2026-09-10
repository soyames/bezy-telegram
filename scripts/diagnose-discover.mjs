#!/usr/bin/env node
/**
 * Diagnoses why a profile is missing from Discovery. Read-only: it runs the exact
 * /api/discover pipeline against Firestore and prints where every candidate lands,
 * without writing a single document.
 *
 * The eligibility predicates (genderMatches, matchesPreferences, readPreferences) and
 * every scoring helper are imported from api/discover.js, so the verdicts cannot drift
 * from production. The scripted copy of the handler loop is marked MIRROR below — when
 * api/discover.js changes, keep the two in step.
 *
 * Credential-gated like scripts/list-reports.mjs: holding the Firebase service account is
 * the authorization boundary.
 *
 *   $env:BEZY_SERVICE_ACCOUNT = "C:\path\to\service-account.json"
 *   node scripts/diagnose-discover.mjs --caller <telegramId> --friend <telegramId>
 *   node scripts/diagnose-discover.mjs --caller <telegramId>   # caller's whole deck
 *   node scripts/diagnose-discover.mjs                         # whole-pool overview
 */
import fs from 'node:fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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
  preferenceFit,
  publicProfile,
  PREMIUM_VISIBILITY_BOOST
} from '../api/discover.js';
import { processingPaused } from '../api/_privacy.js';
import { isPremiumActive } from '../api/_premium.js';

if (!getApps().length) {
  if (process.env.BEZY_SERVICE_ACCOUNT) {
    const sa = JSON.parse(fs.readFileSync(process.env.BEZY_SERVICE_ACCOUNT, 'utf8'));
    initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
  } else if (process.env.FIREBASE_PROJECT_ID) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
      })
    });
  } else {
    console.error('Set BEZY_SERVICE_ACCOUNT to a service-account JSON path, or the FIREBASE_* variables.');
    process.exit(1);
  }
}

const firestore = getFirestore();
const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index !== -1 && args[index + 1] ? args[index + 1] : null;
};
const callerId = valueAfter('--caller');
const friendId = valueAfter('--friend');

// MIRROR of the candidate window in api/discover.js handleDiscover.
const CANDIDATE_WINDOW = 100;

function ts(value) {
  const ms = value?.toMillis?.() ?? (value instanceof Date ? value.getTime() : Number(value) || 0);
  return ms ? new Date(ms).toISOString() : 'missing';
}

function profileSummary(data = {}) {
  const p = data.profile || {};
  return {
    name: p.displayName || data.firstName || '',
    age: p.age ?? null,
    city: p.city || '',
    gender: p.gender || '',
    seeking: p.seeking || '',
    interests: (p.interests || []).length,
    languages: (p.languages || []).join(',') || 'none'
  };
}

function printUser(label, data) {
  const s = profileSummary(data);
  console.log(`  ${label}`);
  console.log(`    telegramId          ${data.telegramId ?? ''}`);
  console.log(`    ageEligibility      ${data.ageEligibilityConfirmed === true ? `confirmed ${ts(data.ageEligibilityConfirmedAt)} (${data.ageEligibilityMethod || '?'})` : 'NOT confirmed'}`);
  console.log(`    paused              ${processingPaused(data) ? `YES (restricted=${data.processingRestricted === true}, objection=${data.processingObjection === true})` : 'no'}`);
  console.log(`    profileComplete     ${data.profileComplete === true ? 'true' : 'false'} (profile.profileComplete=${(data.profile || {}).profileComplete === true})`);
  console.log(`    discoverable        ${data.discoverable === true ? 'true' : `false (profile.discoverable=${(data.profile || {}).discoverable === true})`}`);
  console.log(`    premium             ${isPremiumActive(data) ? 'active' : 'free'}`);
  console.log(`    profile             ${s.name || '(no name)'} · age ${s.age ?? '—'} · ${s.city || '(no city)'} · gender "${s.gender}" · seeking "${s.seeking}" · ${s.interests} interest(s) · languages [${s.languages}]`);
  console.log(`    createdAt           ${ts(data.createdAt)}`);
  console.log(`    updatedAt           ${ts(data.updatedAt)}`);
}

async function listIds(collectionRef, label) {
  const snap = await collectionRef.get();
  const ids = snap.docs.map((doc) => doc.id);
  console.log(`  ${label} (${ids.length}): ${ids.length ? ids.join(', ') : '(none)'}`);
  return new Set(ids);
}

// ---------------------------------------------------------------------------
// Overview mode: every account and its visibility flags, plus who the candidate
// query would actually see. Answers "is anyone discoverable at all".
// ---------------------------------------------------------------------------
async function overview() {
  const usersSnap = await firestore.collection('users').get();
  console.log(`\n=== Pool overview: ${usersSnap.size} user document(s) ===\n`);
  for (const doc of usersSnap.docs) printUser(doc.id, doc.data());

  console.log('\n=== Candidate query (users where discoverable == true, newest 100) ===\n');
  const candidatesSnap = await firestore.collection('users')
    .where('discoverable', '==', true)
    .orderBy('createdAt', 'desc')
    .limit(CANDIDATE_WINDOW)
    .get();
  console.log(`  ${candidatesSnap.size} discoverable candidate(s) enter the pipeline.`);
  if (candidatesSnap.size === CANDIDATE_WINDOW) {
    console.log(`  WINDOW FULL: any discoverable account older than ${ts(candidatesSnap.docs.at(-1).data().createdAt)} is outside the window and can never be discovered.`);
  }
  candidatesSnap.docs.forEach((doc, index) => {
    const data = doc.data() || {};
    console.log(`  ${String(index + 1).padStart(3)}. ${doc.id}  ${profileSummary(data).name || '(no name)'}  age ${profileSummary(data).age ?? '—'}  created ${ts(data.createdAt)}`);
  });
}

// ---------------------------------------------------------------------------
// Caller mode: the exact deck assembly for one account, plus a per-gate verdict
// for the candidate of interest (--friend).
// ---------------------------------------------------------------------------
async function diagnoseCaller() {
  const callerSnap = await firestore.collection('users').doc(String(callerId)).get();
  if (!callerSnap.exists) {
    console.error(`No user document for caller ${callerId}.`);
    process.exit(2);
  }
  const currentData = callerSnap.data() || {};

  console.log(`\n=== Caller ${callerId} ===\n`);
  printUser(callerId, currentData);
  const preferences = readPreferences(currentData.preferences);
  console.log(`    preferences (normalized)  minAge ${preferences.minAge} · maxAge ${preferences.maxAge} · city "${preferences.city}" · sameCityOnly ${preferences.sameCityOnly} · languages [${preferences.languages.join(',') || 'none'}]`);
  console.log(`    filtersActive            ${filtersActive(preferences)}`);

  // Early returns in handleDiscover: each of these ends the request before the
  // candidate query runs at all.
  console.log('\n=== Caller-side gates (handleDiscover early returns) ===\n');
  if (processingPaused(currentData)) {
    console.log('  FAIL — processing is paused: the API returns profiles: [] with processingRestricted/processingObjection. No deck is assembled.');
  } else {
    console.log('  ok — processing not paused.');
  }
  if (currentData.ageEligibilityConfirmed !== true) {
    console.log('  FAIL — no 18+ declaration: the API returns needsAgeConfirmation and the Mini App shows the age gate.');
  } else {
    console.log('  ok — age declaration on file.');
  }
  if (!currentData.profileComplete) {
    console.log('  FAIL — caller profile incomplete: the API returns needsProfile and the Mini App shows "Complete your profile".');
  } else {
    console.log('  ok — caller profile complete.');
  }

  console.log('\n=== Caller decision/block sets ===\n');
  const currentRef = firestore.collection('users').doc(String(callerId));
  const actions = await listIds(currentRef.collection('actions'), 'actions (decided already)');
  const blocks = await listIds(currentRef.collection('blocks'), 'blocks (this user blocked)');
  const blockedBy = await listIds(currentRef.collection('blockedBy'), 'blockedBy (blocked by others)');
  const excluded = new Set([...actions, ...blocks, ...blockedBy]);
  if (friendId && excluded.has(String(friendId))) {
    console.log(`  -> Friend ${friendId} is in one of these sets (question 7: excluded).`);
  }

  console.log('\n=== Candidate query + eligibility pipeline (MIRROR of handleDiscover) ===\n');
  let candidatesSnap;
  try {
    candidatesSnap = await firestore.collection('users')
      .where('discoverable', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(CANDIDATE_WINDOW)
      .get();
  } catch (error) {
    console.error(`  The candidate query FAILED: ${error.message}`);
    console.error('  If this is a missing composite index, deploy firestore.indexes.json (discoverable + createdAt).');
    process.exit(3);
  }
  console.log(`  ${candidatesSnap.size} candidate(s) enter the pipeline (limit ${CANDIDATE_WINDOW}).`);
  if (candidatesSnap.size === CANDIDATE_WINDOW) {
    console.log(`  WINDOW FULL: anyone older than ${ts(candidatesSnap.docs.at(-1).data().createdAt)} never enters the pipeline.`);
  }

  const currentProfile = currentData.profile || {};
  const isPremium = isPremiumActive(currentData);
  const dayAgo = Date.now() - 86400000;

  const eligible = [];
  let hardMisses = 0;       // incomplete profile, or reciprocal gender/seeking mismatch
  let decidedMisses = 0;    // previously acted on, blocked, or paused
  let preferenceMisses = 0; // excluded by the caller's own filters
  const rows = [];

  for (const doc of candidatesSnap.docs) {
    const data = doc.data() || {};
    let disposition;
    if (doc.id === String(callerId) || excluded.has(doc.id)) {
      decidedMisses++;
      disposition = 'decided/blocked';
    } else if (processingPaused(data)) {
      decidedMisses++;
      disposition = 'paused';
    } else if (!data.profileComplete || !genderMatches(currentProfile, data.profile)) {
      hardMisses++;
      disposition = 'hard miss';
    } else if (!matchesPreferences(preferences, currentProfile, data.profile, isPremium)) {
      preferenceMisses++;
      disposition = 'preference miss';
    } else {
      disposition = 'ELIGIBLE';
      const createdAt = data.createdAt?.toMillis?.() ?? new Date(data.createdAt || 0).getTime();
      const candidateIsPremium = isPremiumActive(data);
      const score = compatibility(currentProfile, data.profile);
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
        orderKey
      });
    }
    rows.push({ id: doc.id, name: publicProfile(doc.id, data).displayName, disposition });
  }

  for (const row of rows) {
    const marker = row.id === String(friendId) ? '  <-- friend' : '';
    console.log(`  ${row.id.padStart(12)}  ${row.disposition.padEnd(16)}  ${row.name || '(no name)'}${marker}`);
  }
  console.log(`\n  summary: ${eligible.length} eligible · ${hardMisses} hard miss(es) · ${preferenceMisses} preference miss(es) · ${decidedMisses} decided/paused`);

  // MIRROR of emptyReasonFor.
  const emptyReason = eligible.length
    ? null
    : candidatesSnap.size === 0
      ? 'no_supply'
      : preferenceMisses >= hardMisses && preferenceMisses >= decidedMisses
        ? 'filters'
        : hardMisses >= decidedMisses
          ? 'eligibility'
          : 'pool';
  const reasonKey = {
    filters: 'app.empty_filters ("Your filters are hiding everyone…")',
    pool: 'app.empty_pool ("You\'ve seen everyone nearby…")',
    no_supply: 'app.empty_no_supply ("Bezy is brand new here…")',
    eligibility: 'app.empty_eligibility ("No one nearby matches who you\'re looking for…")',
    null: 'app.no_profiles ("No more profiles right now. Check back soon." — the fallback, only reachable with a non-empty deck)'
  }[String(emptyReason)];
  console.log(`\n=== Expected API result for caller ${callerId} ===`);
  console.log(`  emptyReason: ${emptyReason}  ->  ${reasonKey}`);

  eligible.sort((a, b) => b.orderKey - a.orderKey);
  applyPageDiversity(eligible, currentProfile);
  const deck = eligible.slice(0, 20);
  const stats = {
    available: eligible.length,
    bestMatch: eligible.length ? eligible[0].compatibility : 0,
    newToday: eligible.filter((profile) => profile.isNew).length,
    inYourCity: eligible.filter((profile) => profile.city && currentProfile.city && profile.city.trim().toLowerCase() === String(currentProfile.city).trim().toLowerCase()).length
  };
  console.log(`  stats: available ${stats.available} · bestMatch ${stats.bestMatch}% · newToday ${stats.newToday} · inYourCity ${stats.inYourCity}`);
  console.log(`  first response page (${deck.length} of ${eligible.length} eligible):`);
  deck.forEach((profile, index) => {
    const marker = profile.id === String(friendId) ? '  <-- friend' : '';
    console.log(`  ${String(index + 1).padStart(3)}. ${profile.id}  ${profile.displayName || '(no name)'}  ${profile.compatibility}%${marker}`);
  });
  if (eligible.length > 20) {
    console.log(`  The remaining ${eligible.length - 20} eligible profiles return on later calls once decisions free the page.`);
  }

  if (friendId) {
    if (friendId === callerId) {
      console.log('\n  --friend equals --caller: the caller is always excluded from their own deck.');
    } else {
      await friendVerdict(currentData, preferences, isPremium, currentProfile, candidatesSnap, excluded, eligible, deck);
    }
  }
}

async function friendVerdict(currentData, preferences, isPremium, currentProfile, candidatesSnap, excluded, eligible, deck) {
  console.log(`\n=== Friend ${friendId}: the twelve questions ===\n`);
  const friendSnap = await firestore.collection('users').doc(String(friendId)).get();
  if (!friendSnap.exists) {
    console.log(`  1. STORED?          NO — there is no users/${friendId} document. The friend has no Bezy account under this Telegram id.`);
    return;
  }
  const data = friendSnap.data() || {};
  const p = data.profile || {};
  const inWindow = candidatesSnap.docs.some((doc) => doc.id === String(friendId));

  console.log(`  1. STORED?          yes — users/${friendId} exists (created ${ts(data.createdAt)}).`);
  console.log(`  2. COMPLETE?        ${data.profileComplete === true ? 'yes' : `NO — profileComplete=${data.profileComplete === true} (needs: displayName, integer age 18-100, city, gender)`}`);
  console.log(`  3. DISCOVERABLE?    ${data.discoverable === true ? 'yes' : `NO — discoverable=${data.discoverable === true}. The candidate query (where discoverable == true) never sees this account.`}`);
  if (!data.discoverable) {
    console.log('                      (Common: profile saved with "Show my profile in Discover" unchecked, an incomplete profile, or a lifted restriction/objection — lifting a pause does NOT republish; the user must re-enable discoverable.)');
  }
  console.log(`  4. AGE IN RANGE?    ${p.age ?? '—'} within caller [${preferences.minAge}..${preferences.maxAge}] ${Number.isFinite(Number(p.age)) && Number(p.age) >= preferences.minAge && Number(p.age) <= preferences.maxAge ? 'yes' : 'NO'}`);
  const gm = genderMatches(currentProfile, p);
  console.log(`  5. RECIPROCAL?      ${gm ? 'yes' : 'NO'} — caller: gender "${currentProfile.gender}" seeking "${currentProfile.seeking || 'everyone'}"; friend: gender "${p.gender}" seeking "${p.seeking || 'everyone'}". Both directions must accept.`);
  const mp = matchesPreferences(preferences, currentProfile, p, isPremium);
  console.log(`  6. FILTERS?         ${mp ? 'pass' : 'NO — excluded by the caller\'s saved preferences'} (minAge ${preferences.minAge}, maxAge ${preferences.maxAge}, languages [${preferences.languages.join(',') || 'none'}], city "${preferences.city}"${isPremium ? ', sameCityOnly ' + preferences.sameCityOnly : ' (city/same-city are Premium-only and inactive for free callers)'})`);
  if (p.languages && p.languages.length) console.log(`                      friend languages: [${p.languages.join(',')}]`);

  const friendRef = firestore.collection('users').doc(String(friendId));
  const [friendActions, friendBlocks, friendBlockedBy] = await Promise.all([
    friendRef.collection('actions').get(),
    friendRef.collection('blocks').get(),
    friendRef.collection('blockedBy').get()
  ]);
  const callerBlockedFriend = excluded.has(String(friendId));
  const friendBlockedCaller = friendBlocks.docs.some((doc) => doc.id === String(callerId)) || friendBlockedBy.docs.some((doc) => doc.id === String(callerId));
  const friendActedOnCaller = friendActions.docs.some((doc) => doc.id === String(callerId));
  console.log(`  7. BLOCKED?         caller-side exclusion set contains friend: ${callerBlockedFriend}; friend blocks caller (mirror): ${friendBlockedCaller}; friend already decided on caller: ${friendActedOnCaller} (a pass by the friend does not hide the friend from the caller's deck, but the pair can never match)`);
  console.log(`  8. ENTERS QUERY?    ${inWindow ? `yes — position ${candidatesSnap.docs.findIndex((doc) => doc.id === String(friendId)) + 1}/${candidatesSnap.size} in the newest-first window` : 'NO — absent from the discoverable==true window. Either discoverable is false, createdAt is missing (orderBy drops it), or the account is older than the 100th newest discoverable account.'}`);
  if (inWindow && data.discoverable === true) console.log(`                      friend createdAt ${ts(data.createdAt)}`);

  const row = { passed: false, disposition: 'not in window' };
  if (inWindow) {
    if (excluded.has(String(friendId))) row.disposition = 'decided/blocked';
    else if (processingPaused(data)) row.disposition = 'paused';
    else if (!data.profileComplete || !genderMatches(currentProfile, p)) row.disposition = 'hard miss';
    else if (!matchesPreferences(preferences, currentProfile, p, isPremium)) row.disposition = 'preference miss';
    else { row.passed = true; row.disposition = 'ELIGIBLE'; }
  }
  console.log(`  9. PIPELINE?        ${row.disposition}`);
  const deckIndex = deck.findIndex((profile) => profile.id === String(friendId));
  const eligibleIndex = eligible.findIndex((profile) => profile.id === String(friendId));
  console.log(` 10. FINAL DECK?      ${deckIndex !== -1 ? `yes — card ${deckIndex + 1} of the first ${deck.length} returned` : eligibleIndex !== -1 ? `in the eligible pool (rank ${eligibleIndex + 1} of ${eligible.length}) but beyond the first page of 20 — appears after further decisions` : 'no'}`);
  console.log(` 11. FRONTEND?        the caller\'s deck is ${eligible.length ? `non-empty (${eligible.length} eligible)` : 'EMPTY'} — if the Mini App still shows the old fallback "No more profiles right now. Check back soon." while emptyReason says otherwise, the client bundle being served is stale (cached pre-honest-discovery app.js), not the pool.`);
}

(async () => {
  if (!callerId) {
    await overview();
  } else {
    await diagnoseCaller();
  }
  process.exit(0);
})().catch((error) => {
  console.error('Diagnosis failed:', error);
  process.exit(1);
});
