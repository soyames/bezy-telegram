#!/usr/bin/env node
/**
 * Applies the Bezy retention policy (api/_retention.js).
 *
 * Dry-run by default: it prints exactly what would be removed and changes nothing. Deletion
 * only happens with an explicit --apply.
 *
 * Categories whose retention period is a legal question (payments, reports) have no default
 * and are skipped unless the operator sets the corresponding environment variable. The
 * script reports them as skipped rather than silently ignoring them.
 *
 *   $env:BEZY_SERVICE_ACCOUNT = "C:\path\to\service-account.json"
 *   node scripts/retention.mjs                    # dry run
 *   node scripts/retention.mjs --apply            # execute
 *   node scripts/retention.mjs --protect 12345    # never touch these Telegram ids
 */
import fs from 'node:fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { planRetention, applyRetention, retentionPolicy, isConfigured } from '../api/_retention.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
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

console.log('=== Bezy retention policy ===\n');
for (const [name, rule] of Object.entries(retentionPolicy())) {
  const state = isConfigured(rule) ? `${rule.days} days` : (rule.legalReviewRequired ? 'NOT SET — legal review required' : 'not set');
  console.log(`  ${name.padEnd(20)} ${state}`);
  console.log(`  ${''.padEnd(20)} ${rule.description}`);
}

const plan = await planRetention(firestore, { protectedIds });

console.log(`\n=== ${apply ? 'Applying' : 'Dry run'} ===\n`);
for (const [label, ids] of [
  ['users (abandoned signups)', plan.users],
  ['ended matches', plan.matches],
  ['spent invoices', plan.invoices],
  ['stale rate-limit counters', plan.rateLimits],
  ['payments', plan.payments],
  ['reports', plan.reports],
  ['support requests', plan.supportRequests]
]) {
  console.log(`  ${label.padEnd(28)} ${ids.length}${ids.length ? `  [${ids.slice(0, 5).join(', ')}${ids.length > 5 ? ', …' : ''}]` : ''}`);
}
for (const skip of plan.skipped) console.log(`  skipped: ${skip.category} — ${skip.reason}`);
if (protectedIds.length) console.log(`  protected ids: ${protectedIds.join(', ')}`);

if (!plan.total) {
  console.log('\nNothing matches the configured policy.');
  process.exit(0);
}
if (!apply) {
  console.log(`\n${plan.total} record(s) would be removed. Re-run with --apply to execute.`);
  process.exit(0);
}

const applied = await applyRetention(firestore, plan);
console.log(`\nRemoved: ${JSON.stringify(applied)}`);
process.exit(0);
