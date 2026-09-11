#!/usr/bin/env node
/**
 * Read-only match-integrity diagnosis. Lists every match document and verifies the
 * reciprocal-like invariant against the live action documents, without writing a single
 * document. Used to answer "is this user a TRUE mutual match?" — e.g. the Aamir check —
 * and to find any stale match documents before they are displayed.
 *
 * Credential-gated like scripts/list-reports.mjs: holding the Firebase service account is
 * the authorization boundary. Never mutates anything.
 *
 *   $env:BEZY_SERVICE_ACCOUNT = "C:\path\to\service-account.json"
 *   node scripts/diagnose-matches.mjs [<telegramId>]   # whole collection, or one participant
 */
import fs from 'node:fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.BEZY_SERVICE_ACCOUNT && !(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY)) {
  console.error('No credentials. Set BEZY_SERVICE_ACCOUNT (path to a service-account JSON).');
  process.exit(1);
}
if (!getApps().length) {
  if (process.env.BEZY_SERVICE_ACCOUNT) {
    const sa = JSON.parse(fs.readFileSync(process.env.BEZY_SERVICE_ACCOUNT, 'utf8'));
    initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
  } else {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      })
    });
  }
}

const db = getFirestore();
const isLike = (action) => action === 'like' || action === 'super';
const focus = process.argv[2] ? String(process.argv[2]) : null;

const snapshot = await db.collection('matches').get();
const rows = [];
for (const doc of snapshot.docs) {
  const data = doc.data() || {};
  const participants = (data.participants || []).map(String);
  if (focus && !participants.includes(focus)) continue;
  const [a, b] = participants;
  const [aOnB, bOnA] = await Promise.all([
    a && b ? db.collection('users').doc(a).collection('actions').doc(b).get() : Promise.resolve(null),
    a && b ? db.collection('users').doc(b).collection('actions').doc(a).get() : Promise.resolve(null)
  ]);
  const aAction = aOnB?.exists ? aOnB.data()?.action : '(no user doc / no action)';
  const bAction = bOnA?.exists ? bOnA.data()?.action : '(no user doc / no action)';
  rows.push({
    id: doc.id,
    active: data.active !== false,
    participants,
    source: data.source || '(unknown)',
    createdAt: data.createdAt?.toMillis ? new Date(data.createdAt.toMillis()).toISOString() : String(data.createdAt || ''),
    endedReason: data.endedReason || '',
    aAction,
    bAction,
    mutual: isLike(aAction) && isLike(bAction)
  });
}
rows.sort((x, y) => String(x.createdAt).localeCompare(String(y.createdAt)));

for (const row of rows) {
  const flag = row.mutual ? 'OK      ' : '!! NON-MUTUAL';
  console.log(`${flag} ${row.id} active=${row.active} source=${row.source} created=${row.createdAt}`);
  console.log(`         ${row.participants[0] ?? '?'} -> ${row.participants[1] ?? '?'}: ${row.aAction}`);
  console.log(`         ${row.participants[1] ?? '?'} -> ${row.participants[0] ?? '?'}: ${row.bAction}`);
  if (row.endedReason) console.log(`         ended: ${row.endedReason}`);
}

const bad = rows.filter((row) => row.active && !row.mutual);
console.log(`\n${rows.length} match document(s), ${bad.length} active without mutual likes.`);

if (focus) {
  const verdict = bad.length
    ? 'NOT a verified mutual match — both likes are not present (see lines above).'
    : rows.some((row) => row.active && row.mutual)
      ? 'verified mutual match — both sides hold a like.'
      : 'no active match document at all.';
  console.log(`For ${focus}: ${verdict}`);
}
