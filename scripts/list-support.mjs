#!/usr/bin/env node
/**
 * The operator side of the support queue (CN-7): lists support requests and moves them
 * through the lifecycle open → in_progress → resolved / closed.
 *
 * Credential-gated like scripts/list-reports.mjs — holding the Firebase service account is
 * the authorization boundary. There is no HTTP route that can list or change a support
 * request, and no external ticketing platform: the queue is worked from here.
 *
 *   $env:BEZY_SERVICE_ACCOUNT = "C:\path\to\service-account.json"
 *   node scripts/list-support.mjs                        # open requests
 *   node scripts/list-support.mjs --all                  # every request
 *   node scripts/list-support.mjs --status in_progress   # one lifecycle
 *   node scripts/list-support.mjs --move <ref> in_progress --note "looking into it"
 */
import fs from 'node:fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { SUPPORT_STATUSES } from '../api/_support.js';

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

const moveIndex = args.indexOf('--move');
if (moveIndex !== -1) {
  const reference = args[moveIndex + 1];
  const status = args[moveIndex + 2];
  if (!reference || !SUPPORT_STATUSES.includes(status)) {
    console.error(`Usage: --move <reference> ${SUPPORT_STATUSES.join('|')} [--note "..."]`);
    process.exit(1);
  }
  const noteIndex = args.indexOf('--note');
  const note = noteIndex !== -1 ? String(args[noteIndex + 1] || '') : '';
  const ref = firestore.collection('supportRequests').doc(String(reference));
  if (!(await ref.get()).exists) { console.error(`No support request ${reference}`); process.exit(2); }
  const update = { status, statusUpdatedAt: new Date() };
  if (note) update.statusNote = note.slice(0, 500);
  await ref.set(update, { merge: true });
  console.log(`Support request ${reference} → ${status}.`);
  process.exit(0);
}

const statusIndex = args.indexOf('--status');
const wantedStatus = statusIndex !== -1 ? args[statusIndex + 1] : null;
if (wantedStatus && !SUPPORT_STATUSES.includes(wantedStatus)) {
  console.error(`Unknown status. Use one of: ${SUPPORT_STATUSES.join(', ')}`);
  process.exit(1);
}

const showAll = args.includes('--all');
const snap = await firestore.collection('supportRequests').get();
const requests = snap.docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .filter((r) => (wantedStatus ? r.status === wantedStatus : showAll ? true : r.status === 'open'))
  .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

if (!requests.length) {
  console.log(wantedStatus ? `No ${wantedStatus} support requests.` : showAll ? 'No support requests.' : 'No open support requests.');
  process.exit(0);
}

console.log(`${requests.length} ${wantedStatus ? `${wantedStatus} ` : ''}support request(s):\n`);
for (const r of requests) {
  const when = r.createdAt?.toDate?.().toISOString() ?? 'unknown';
  console.log(`  ${r.reference || r.id}   [${r.status}]`);
  console.log(`    when      ${when}`);
  console.log(`    category  ${r.category}`);
  console.log(`    user      ${r.telegramUserId}`);
  console.log(`    language  ${r.languageCode || 'unknown'}`);
  if (r.details) console.log(`    details   ${String(r.details).slice(0, 400)}`);
  if (r.statusNote) console.log(`    note      ${String(r.statusNote).slice(0, 200)}`);
  console.log('');
}
console.log(`Move with: node scripts/list-support.mjs --move <reference> ${SUPPORT_STATUSES.join('|')} --note "what you did"`);
console.log('Reply to the user from the bot chat — the request carries their Telegram id.');
process.exit(0);
