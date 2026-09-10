#!/usr/bin/env node
/**
 * Read-only view of the live rate-limit counters (T4): who is near or over a window, per
 * bucket. The tuning evidence is the `[bezy-ratelimit] limit_reached` log line; this script
 * shows the state behind it so an operator can tell "one user going fast" from "a bucket
 * that is too tight for real humans".
 *
 * Privacy: counters record timing only, the script prints ids and numbers, and it changes
 * nothing. Credential-gated like every operator script.
 *
 *   $env:BEZY_SERVICE_ACCOUNT = "C:\path\to\service-account.json"
 *   node scripts/rate-limit-status.mjs                 # all counters
 *   node scripts/rate-limit-status.mjs --bucket swipe  # one bucket
 */
import fs from 'node:fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { RATE_LIMITS } from '../api/_ratelimit.js';

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
const bucketIndex = args.indexOf('--bucket');
const bucket = bucketIndex !== -1 ? args[bucketIndex + 1] : null;
if (bucket && !RATE_LIMITS[bucket]) {
  console.error(`Unknown bucket. Known buckets: ${Object.keys(RATE_LIMITS).join(', ')}`);
  process.exit(1);
}

const now = Date.now();
const rows = [];
for (const doc of (await firestore.collection('rateLimits').get()).docs) {
  const counters = doc.data() || {};
  for (const [key, entry] of Object.entries(counters)) {
    const keyBucket = key.split('_')[0] === 'notify' ? `notify_${key.split('_')[1]}` : key.replace(/_\d+$/, '');
    if (bucket && !(keyBucket === bucket || key === bucket)) continue;
    const windowMs = Number(key.split('_').pop()) * 1000 || 0;
    const startedAt = Number(entry?.w) || 0;
    const count = Number(entry?.c) || 0;
    if (!startedAt || !count) continue;
    const remainingMs = startedAt + windowMs - now;
    const limits = RATE_LIMITS[keyBucket] || (key.startsWith('notify_') ? [{ limit: 5, windowSeconds: 86400 }] : null);
    const limit = limits ? limits.reduce((max, w) => Math.max(max, Number(w.limit) || 0), 0) : '?';
    rows.push({ user: doc.id, key, keyBucket, count, limit, windowMs, remainingMs });
  }
}
rows.sort((a, b) => b.remainingMs - a.remainingMs);

console.log('=== Live rate-limit windows ===\n');
if (!rows.length) {
  console.log(bucket ? `No active windows for ${bucket}.` : 'No active rate-limit windows.');
  process.exit(0);
}
for (const r of rows.slice(0, 100)) {
  const minutes = Math.max(0, Math.ceil(r.remainingMs / 60000));
  console.log(`  ${r.user.padEnd(12)} ${r.key.padEnd(26)} ${String(r.count).padStart(4)}/${String(r.limit).padStart(4)}   resets in ~${minutes} min`);
}
if (rows.length > 100) console.log(`  … and ${rows.length - 100} more.`);
console.log('\nTune RATE_LIMITS in api/_ratelimit.js from real traffic, never by guessing.');
console.log('See the launch checklist (T4) for the tuning procedure.');
process.exit(0);
