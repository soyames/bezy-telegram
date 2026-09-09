#!/usr/bin/env node
/**
 * Lists Bezy user reports for moderation review, and lets the operator close one.
 *
 * Deliberately a credential-gated script rather than an admin web console: Bezy needs
 * *visibility* of reports, not a moderation platform. Holding the Firebase service account
 * is the authorization boundary, exactly as for scripts/refund-payment.mjs. There is no
 * HTTP route that can list or resolve reports.
 *
 * Telegram already handles Telegram-layer abuse (spam, account bans, message reports).
 * These reports are strictly about Bezy dating profiles and Bezy conduct.
 *
 *   $env:BEZY_SERVICE_ACCOUNT = "C:\path\to\service-account.json"
 *   node scripts/list-reports.mjs                    # open reports
 *   node scripts/list-reports.mjs --all              # every report
 *   node scripts/list-reports.mjs --resolve <id> --note "actioned"
 */
import fs from 'node:fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
const resolveIndex = args.indexOf('--resolve');

if (resolveIndex !== -1) {
  const id = args[resolveIndex + 1];
  if (!id) { console.error('Usage: --resolve <reportId> [--note "..."]'); process.exit(1); }
  const noteIndex = args.indexOf('--note');
  const note = noteIndex !== -1 ? String(args[noteIndex + 1] || '') : '';
  const ref = firestore.collection('reports').doc(id);
  if (!(await ref.get()).exists) { console.error(`No report ${id}`); process.exit(2); }
  await ref.set({ status: 'resolved', resolvedAt: new Date(), resolutionNote: note.slice(0, 500) }, { merge: true });
  console.log(`Report ${id} marked resolved.`);
  process.exit(0);
}

const showAll = args.includes('--all');
const snap = await firestore.collection('reports').get();
const reports = snap.docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .filter((r) => showAll || r.status === 'open')
  .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

if (!reports.length) {
  console.log(showAll ? 'No reports.' : 'No open reports.');
  process.exit(0);
}

console.log(`${reports.length} ${showAll ? 'report(s)' : 'open report(s)'}:\n`);
for (const r of reports) {
  const when = r.createdAt?.toDate?.().toISOString() ?? 'unknown';
  console.log(`  ${r.id}`);
  console.log(`    when      ${when}`);
  console.log(`    reason    ${r.reason}`);
  console.log(`    reporter  ${r.reporterId}`);
  console.log(`    target    ${r.targetId}`);
  console.log(`    status    ${r.status}`);
  if (r.details) console.log(`    details   ${String(r.details).slice(0, 300)}`);

  // Show whether the reported account still exists, to help triage.
  const target = await firestore.collection('users').doc(String(r.targetId)).get();
  console.log(`    target account: ${target.exists ? (target.data()?.discoverable ? 'active, discoverable' : 'active, hidden') : 'deleted'}`);
  console.log('');
}
console.log('Resolve with: node scripts/list-reports.mjs --resolve <id> --note "what you did"');
console.log('To take a profile out of discovery, set users/{id}.discoverable = false in the Firebase console.');
process.exit(0);
