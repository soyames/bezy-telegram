#!/usr/bin/env node
/**
 * Stage 4 outcome evaluation (docs/OUTCOME_DATA_SPEC.md). Read-only: it re-reads the
 * explicit product outcomes already stored — likes, matches, unmatch/block endings — and
 * prints the match-quality metrics that coefficient changes must be judged against.
 * Swipe volume and engagement numbers are deliberately absent.
 *
 * Credential-gated like every operator script; changes nothing; dry-run is the whole run.
 *
 *   $env:BEZY_SERVICE_ACCOUNT = "C:\path\to\service-account.json"
 *   node scripts/outcome-eval.mjs
 */
import fs from 'node:fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { summarizeOutcomes, outcomeReport } from '../api/_outcomes.js';

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

const matchesSnap = await firestore.collection('matches').get();
const matches = matchesSnap.docs.map((d) => d.data());

let likes = 0;
let blocks = 0;
let unmatches = 0;
// Like exposures are the caller's explicit decisions, counted across all users' actions.
for (const userDoc of (await firestore.collection('users').get()).docs) {
  const actions = await userDoc.ref.collection('actions').get();
  for (const action of actions.docs) {
    if (action.data()?.action === 'like' || action.data()?.action === 'super') likes++;
  }
  blocks += (await userDoc.ref.collection('blocks').get()).size;
}
unmatches = matches.filter((m) => m?.endedReason === 'unmatch').length;

const summary = summarizeOutcomes({ likes, matches, blocks, unmatches });

console.log('=== Bezy outcome evaluation (Stage 4) ===\n');
console.log('The success measure is match quality, never swipe volume.\n');
for (const [label, value] of outcomeReport(summary)) {
  console.log(`  ${label.padEnd(38)} ${value}`);
}
console.log('\nCoefficient changes require this evidence first (docs/OUTCOME_DATA_SPEC.md).');
process.exit(0);
