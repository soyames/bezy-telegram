#!/usr/bin/env node
/**
 * Sends profile-completion reminders (api/_reminders.js).
 *
 * Dry-run by default: it prints exactly who would be reminded and changes nothing. Sending
 * only happens with an explicit --apply.
 *
 * Every user's notification preference, any legal pause (restriction or objection) and the
 * seven-day cap are applied centrally by deliverNotification, so this script cannot spam
 * someone who switched the category off or who paused their account.
 *
 *   $env:BEZY_SERVICE_ACCOUNT = "C:\path\to\service-account.json"
 *   node scripts/profile-reminders.mjs                    # dry run
 *   node scripts/profile-reminders.mjs --apply            # send
 *   node scripts/profile-reminders.mjs --limit 20         # cap the blast radius
 *   node scripts/profile-reminders.mjs --protect 12345    # never message these Telegram ids
 */
import fs from 'node:fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { planProfileReminders, sendProfileReminders } from '../api/_reminders.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const limitArg = args.findIndex((a) => a === '--limit');
const limit = limitArg >= 0 && args[limitArg + 1] ? Number(args[limitArg + 1]) : 200;
const protectedIds = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--protect' && args[i + 1]) protectedIds.push(...args[i + 1].split(',').map((s) => s.trim()));
}

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

console.log('=== Bezy profile-completion reminders ===\n');
console.log('  Eligible: declared 18+, profile still incomplete, account not paused.');
console.log('  Cap: one reminder per user per 7 days. Category is opt-out in the Mini App.\n');

const plan = await planProfileReminders(firestore, { limit, protectedIds });
const ids = plan.users.map((u) => u.id);
console.log(`  ${ids.length} account(s) to remind${ids.length ? `  [${ids.slice(0, 8).join(', ')}${ids.length > 8 ? ', …' : ''}]` : ''}`);
if (plan.skipped) console.log(`  ${plan.skipped} eligible account(s) beyond --limit ${limit}`);
if (protectedIds.length) console.log(`  protected ids: ${protectedIds.join(', ')}`);

if (!plan.users.length) {
  console.log('\nNothing to do.');
  process.exit(0);
}
if (!apply) {
  console.log(`\nDry run — no message was sent. Re-run with --apply to send.`);
  process.exit(0);
}

const summary = await sendProfileReminders(firestore, plan);
console.log(`\nSent: ${JSON.stringify(summary)}`);
process.exit(0);
