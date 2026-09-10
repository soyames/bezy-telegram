// Retention policy.
//
// The data-processing map documents what Bezy keeps and why, but until now nothing enforced
// it: deletion was entirely user-initiated. This module is the enforcement mechanism.
//
// Two deliberate rules:
//
//  1. **No retention period is invented here.** The defaults below are operational data
//     minimisation decisions — abandoned signups, ended matches, spent invoices, expired
//     counters — none of which depends on a legal question.
//
//  2. **Categories whose period is a legal question are disabled by default.** Payment
//     records (accounting obligation) and reports (safety record) have no default and are
//     skipped entirely unless an operator sets the corresponding environment variable. The
//     mechanism is ready; the number is not engineering's to choose.
//
// Nothing here runs automatically. `scripts/retention.mjs` drives it, dry-run by default.

const DAY_MS = 86400000;

function envDays(name, fallback) {
  const raw = Number(process.env[name]);
  if (Number.isInteger(raw) && raw > 0) return raw;
  return fallback;
}

/**
 * `days: null` means "no policy configured — never purge". That is the correct state for a
 * category whose retention period requires legal advice, and it is not a bug.
 */
export function retentionPolicy() {
  return {
    abandonedSignups: {
      days: envDays('BEZY_RETENTION_ABANDONED_DAYS', 90),
      legalReviewRequired: false,
      description: 'Accounts that never confirmed 18+ and never completed a profile.'
    },
    endedMatches: {
      days: envDays('BEZY_RETENTION_ENDED_MATCH_DAYS', 180),
      legalReviewRequired: false,
      description: 'Matches ended by unmatch, block or account deletion.'
    },
    spentInvoices: {
      days: envDays('BEZY_RETENTION_INVOICE_DAYS', 30),
      legalReviewRequired: false,
      description: 'Paid or abandoned invoices. The payment record, not the invoice, is the audit trail.'
    },
    staleRateLimits: {
      days: envDays('BEZY_RETENTION_RATELIMIT_DAYS', 7),
      legalReviewRequired: false,
      description: 'Rate-limit counters whose windows have long expired.'
    },
    payments: {
      // Deliberately unset. Accounting/tax retention is P0-8 in the roadmap.
      days: envDays('BEZY_RETENTION_PAYMENT_DAYS', null),
      legalReviewRequired: true,
      description: 'Payment records. Retention period is an accounting/tax question (roadmap P0-8).'
    },
    reports: {
      // Deliberately unset. Safety-record retention is also P0-8.
      days: envDays('BEZY_RETENTION_REPORT_DAYS', null),
      legalReviewRequired: true,
      description: 'Moderation reports. Retention period requires legal review (roadmap P0-8).'
    }
  };
}

export function isConfigured(rule) {
  return Number.isInteger(rule?.days) && rule.days > 0;
}

function millis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function olderThan(value, days, now) {
  const ms = millis(value);
  return ms > 0 && now - ms >= days * DAY_MS;
}

/**
 * Decides what the policy would remove. Pure: it reads, classifies and returns a plan, and
 * never deletes. The caller applies it, which keeps dry-run and apply on identical logic.
 *
 * `protectedIds` shields real production accounts from ever being selected by a run started
 * with the wrong flags.
 */
export async function planRetention(firestore, { now = Date.now(), protectedIds = [] } = {}) {
  const policy = retentionPolicy();
  const guard = new Set(protectedIds.map(String));
  const plan = { policy, users: [], matches: [], invoices: [], rateLimits: [], payments: [], reports: [], skipped: [] };

  for (const [name, rule] of Object.entries(policy)) {
    if (!isConfigured(rule)) {
      plan.skipped.push({ category: name, reason: rule.legalReviewRequired ? 'LEGAL REVIEW REQUIRED — no period configured' : 'no period configured' });
    }
  }

  // Abandoned signups: never declared 18+, never completed a profile, no payment history.
  if (isConfigured(policy.abandonedSignups)) {
    for (const doc of (await firestore.collection('users').get()).docs) {
      if (guard.has(doc.id)) continue;
      const d = doc.data() || {};
      const abandoned = d.ageEligibilityConfirmed !== true && d.profileComplete !== true;
      if (abandoned && olderThan(d.createdAt, policy.abandonedSignups.days, now)) {
        const paid = await firestore.collection('bezyPayments').where('telegramUserId', '==', doc.id).limit(1).get();
        if (paid.empty) plan.users.push(doc.id);
      }
    }
  }

  if (isConfigured(policy.endedMatches)) {
    for (const doc of (await firestore.collection('matches').get()).docs) {
      const d = doc.data() || {};
      if (d.active === false && olderThan(d.endedAt, policy.endedMatches.days, now)) plan.matches.push(doc.id);
    }
  }

  if (isConfigured(policy.spentInvoices)) {
    for (const doc of (await firestore.collection('bezyInvoices').get()).docs) {
      const d = doc.data() || {};
      if (guard.has(String(d.telegramUserId))) continue;
      if (olderThan(d.createdAt, policy.spentInvoices.days, now)) plan.invoices.push(doc.id);
    }
  }

  if (isConfigured(policy.staleRateLimits)) {
    for (const doc of (await firestore.collection('rateLimits').get()).docs) {
      if (guard.has(doc.id)) continue;
      const windows = Object.values(doc.data() || {});
      const newest = windows.reduce((max, w) => Math.max(max, Number(w?.w) || 0), 0);
      if (newest > 0 && now - newest >= policy.staleRateLimits.days * DAY_MS) plan.rateLimits.push(doc.id);
    }
  }

  if (isConfigured(policy.payments)) {
    for (const doc of (await firestore.collection('bezyPayments').get()).docs) {
      const d = doc.data() || {};
      if (guard.has(String(d.telegramUserId))) continue;
      if (olderThan(d.processedAt || d.createdAt, policy.payments.days, now)) plan.payments.push(doc.id);
    }
  }

  if (isConfigured(policy.reports)) {
    for (const doc of (await firestore.collection('reports').get()).docs) {
      const d = doc.data() || {};
      if (olderThan(d.createdAt, policy.reports.days, now)) plan.reports.push(doc.id);
    }
  }

  plan.total = plan.users.length + plan.matches.length + plan.invoices.length
    + plan.rateLimits.length + plan.payments.length + plan.reports.length;
  return plan;
}

/** Executes a plan produced by planRetention. Users are removed recursively with their subcollections. */
export async function applyRetention(firestore, plan) {
  const applied = { users: 0, matches: 0, invoices: 0, rateLimits: 0, payments: 0, reports: 0 };

  for (const id of plan.users) {
    await firestore.recursiveDelete(firestore.collection('users').doc(id));
    await firestore.collection('rateLimits').doc(id).delete().catch(() => {});
    applied.users++;
  }
  for (const [collection, ids, key] of [
    ['matches', plan.matches, 'matches'],
    ['bezyInvoices', plan.invoices, 'invoices'],
    ['rateLimits', plan.rateLimits, 'rateLimits'],
    ['bezyPayments', plan.payments, 'payments'],
    ['reports', plan.reports, 'reports']
  ]) {
    for (const id of ids) {
      await firestore.collection(collection).doc(id).delete();
      applied[key]++;
    }
  }

  console.log(`[bezy-privacy] retention.applied ${JSON.stringify(applied)}`);
  return applied;
}
