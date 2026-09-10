#!/usr/bin/env node
/**
 * Read-only report statistics (SF-3): the distribution by reason, by status and by day for
 * the last 30 days. This is the measurement that makes category tuning possible the moment
 * real reports exist — the tuning itself stays a traffic-dependent decision, but the
 * instrumentation is deterministic and tested (api/_moderation.js, contract suite).
 *
 * Credential-gated and read-only: it changes nothing.
 *
 *   $env:BEZY_SERVICE_ACCOUNT = "C:\path\to\service-account.json"
 *   node scripts/report-stats.mjs
 */
import fs from 'node:fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { summarizeReports } from '../api/_moderation.js';

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
const snap = await firestore.collection('reports').get();
const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const summary = summarizeReports(rows);

console.log('=== Bezy report statistics ===\n');
console.log(`  total reports: ${summary.total}\n`);

const pad = (text, width = 26) => String(text).padEnd(width);
console.log('  by reason:');
for (const [reason, count] of Object.entries(summary.byReason).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${pad(reason)} ${count}`);
}
console.log('\n  by status:');
for (const [status, count] of Object.entries(summary.byStatus).sort()) {
  console.log(`    ${pad(status)} ${count}`);
}
if (Object.keys(summary.byDay).length) {
  console.log('\n  last 30 days:');
  for (const [day, count] of Object.entries(summary.byDay).sort()) {
    console.log(`    ${day}   ${count}`);
  }
}
console.log('\nCategory tuning (SF-3) is a decision for real traffic; this output is its evidence.');
process.exit(0);
