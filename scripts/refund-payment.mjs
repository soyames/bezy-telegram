#!/usr/bin/env node
/**
 * Refunds a Bezy Premium Telegram Stars payment and revokes the membership.
 *
 * Refunds are an administrative operation, so they are deliberately NOT exposed as an
 * HTTP endpoint. There is no `POST /api/premium/refund`: running this script requires
 * the bot token and the Firebase service account, which only the operator holds. That is
 * the authorization boundary — no Mini App user, authenticated or not, can refund anyone.
 *
 * Order of operations (see docs/TELEGRAM_SETUP.md):
 *   1. look up the payment in Firestore and refuse if it is already refunded
 *   2. call Telegram's refundStarPayment
 *   3. only after Telegram confirms, mark the payment refunded and revoke Premium
 *
 * Telegram also pushes a `refunded_payment` webhook update after a successful refund,
 * which runs the same applyRefund() transaction. That second pass is idempotent.
 *
 *   $env:TELEGRAM_BOT_TOKEN = "..."
 *   $env:BEZY_SERVICE_ACCOUNT = "C:\path\to\service-account.json"
 *   node scripts/refund-payment.mjs <telegram_payment_charge_id> [--dry-run]
 */
import fs from 'node:fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { applyRefund, REFUND_STATUS } from '../api/_premium.js';

const chargeId = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

if (!chargeId || chargeId.startsWith('--')) {
  console.error('Usage: node scripts/refund-payment.mjs <telegram_payment_charge_id> [--dry-run]');
  process.exit(1);
}

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not set. Set it in this shell only; never commit it.');
  process.exit(1);
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

// 1. Validate against recorded state before touching Telegram.
const snap = await firestore.collection('bezyPayments').doc(chargeId).get();
if (!snap.exists) {
  console.error(`No payment recorded for charge id ${chargeId}. Refusing to refund an unknown charge.`);
  process.exit(2);
}
const payment = snap.data() || {};
console.log('Payment found:');
console.log(`  user            ${payment.telegramUserId}`);
console.log(`  plan            ${payment.planId}`);
console.log(`  amount          ${payment.stars} ${payment.currency}`);
console.log(`  status          ${payment.status}`);
console.log(`  refundStatus    ${payment.refundStatus || REFUND_STATUS.NONE}`);

if (payment.refundStatus === REFUND_STATUS.REFUNDED) {
  console.log('\nAlready refunded — nothing to do.');
  process.exit(0);
}
if (dryRun) {
  console.log('\n--dry-run: no refund was requested.');
  process.exit(0);
}

// 2. Ask Telegram to refund. Firestore is not touched until this succeeds.
const response = await fetch(`https://api.telegram.org/bot${token}/refundStarPayment`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ user_id: Number(payment.telegramUserId), telegram_payment_charge_id: chargeId })
});
const body = await response.json().catch(() => ({}));

if (!body.ok) {
  // Telegram refused: the payment stays active and Premium is intentionally NOT revoked.
  await firestore.collection('bezyPayments').doc(chargeId).set({
    refundStatus: REFUND_STATUS.FAILED,
    refundFailedAt: new Date(),
    refundFailureReason: String(body.description || `HTTP ${response.status}`)
  }, { merge: true });
  console.error(`\nTelegram refused the refund: ${body.description || response.status}`);
  console.error('Premium was NOT revoked and the membership is unchanged.');
  process.exit(3);
}

console.log('\nTelegram confirmed the refund.');

// 3. Record it and revoke entitlement.
const result = await applyRefund(firestore, chargeId, { source: 'admin_script' });
console.log(`  outcome         ${result.outcome}`);
console.log(`  entitlement     ${result.revoked ? 'revoked' : 'already inactive'}`);
console.log(`  previous state  ${result.previousState ?? 'n/a'}`);
console.log('\nThe user is now treated as Free by every Premium-gated endpoint.');
console.log('Telegram will also deliver a refunded_payment webhook update; that pass is idempotent.');
process.exit(0);
