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
    supportRequests: {
      // Proposed operational default, subject to legal confirmation: support requests are
      // the user's own words about their own problem, and they are already erased with the
      // account. A year covers the realistic support lifecycle without inventing a legal
      // period — the operator can override it via BEZY_RETENTION_SUPPORT_DAYS.
      days: envDays('BEZY_RETENTION_SUPPORT_DAYS', 365),
      legalReviewRequired: false,
      description: 'Support requests (CN-7). Operational default 365 days; erased with the account.'
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
export async function planRetention(storage, { now = Date.now(), protectedIds = [] } = {}) {
  const policy = retentionPolicy();
  const guard = new Set(protectedIds.map(String));
  const plan = { policy, users: [], matches: [], invoices: [], rateLimits: [], payments: [], reports: [], supportRequests: [], skipped: [] };
  const { query } = await import('./_db.js');

  for (const [name, rule] of Object.entries(policy)) {
    if (!isConfigured(rule)) {
      plan.skipped.push({ category: name, reason: rule.legalReviewRequired ? 'LEGAL REVIEW REQUIRED — no period configured' : 'no period configured' });
    }
  }

  // Abandoned signups: never declared 18+, never completed a profile, no payment history.
  if (isConfigured(policy.abandonedSignups)) {
    const candidates = await query(
      `SELECT u.telegram_id, u.created_at
       FROM users u
       WHERE u.age_eligibility_confirmed = FALSE AND u.profile_complete = FALSE
         AND NOT EXISTS (SELECT 1 FROM bezy_payments bp WHERE bp.telegram_user_id = u.telegram_id)`,
      []
    );
    for (const row of candidates.rows) {
      if (guard.has(String(row.telegram_id))) continue;
      if (olderThan(row.created_at, policy.abandonedSignups.days, now)) plan.users.push(String(row.telegram_id));
    }
  }

  if (isConfigured(policy.endedMatches)) {
    const result = await query(
      'SELECT match_id, ended_at FROM matches WHERE active = FALSE AND ended_at IS NOT NULL',
      []
    );
    for (const row of result.rows) {
      if (olderThan(row.ended_at, policy.endedMatches.days, now)) plan.matches.push(String(row.match_id));
    }
  }

  if (isConfigured(policy.spentInvoices)) {
    const result = await query('SELECT nonce, telegram_user_id, created_at FROM bezy_invoices', []);
    for (const row of result.rows) {
      if (guard.has(String(row.telegram_user_id))) continue;
      if (olderThan(row.created_at, policy.spentInvoices.days, now)) plan.invoices.push(String(row.nonce));
    }
  }

  if (isConfigured(policy.staleRateLimits)) {
    const result = await query('SELECT user_id, buckets FROM rate_limits', []);
    for (const row of result.rows) {
      if (guard.has(String(row.user_id))) continue;
      const windows = Object.values(row.buckets || {});
      const newest = windows.reduce((max, w) => Math.max(max, Number(w?.w) || 0), 0);
      if (newest > 0 && now - newest >= policy.staleRateLimits.days * DAY_MS) plan.rateLimits.push(String(row.user_id));
    }
  }

  if (isConfigured(policy.payments)) {
    const result = await query(
      'SELECT telegram_payment_charge_id, telegram_user_id, processed_at, created_at FROM bezy_payments',
      []
    );
    for (const row of result.rows) {
      if (guard.has(String(row.telegram_user_id))) continue;
      if (olderThan(row.processed_at || row.created_at, policy.payments.days, now)) plan.payments.push(String(row.telegram_payment_charge_id));
    }
  }

  if (isConfigured(policy.reports)) {
    const result = await query('SELECT id, created_at FROM reports', []);
    for (const row of result.rows) {
      if (olderThan(row.created_at, policy.reports.days, now)) plan.reports.push(String(row.id));
    }
  }

  if (isConfigured(policy.supportRequests)) {
    const result = await query('SELECT reference, created_at FROM support_requests', []);
    for (const row of result.rows) {
      if (olderThan(row.created_at, policy.supportRequests.days, now)) plan.supportRequests.push(String(row.reference));
    }
  }

  plan.total = plan.users.length + plan.matches.length + plan.invoices.length
    + plan.rateLimits.length + plan.payments.length + plan.reports.length + plan.supportRequests.length;
  return plan;
}

/** Executes a plan produced by planRetention. User rows cascade their strictly-erased children. */
export async function applyRetention(storage, plan) {
  const applied = { users: 0, matches: 0, invoices: 0, rateLimits: 0, payments: 0, reports: 0, supportRequests: 0 };
  const { query } = await import('./_db.js');

  for (const id of plan.users) {
    const result = await query('DELETE FROM users WHERE telegram_id = $1', [id]);
    applied.users += result.rowCount || 0;
  }
  const deletes = [
    ['matches', 'match_id', plan.matches, 'matches'],
    ['bezy_invoices', 'nonce', plan.invoices, 'invoices'],
    ['rate_limits', 'user_id', plan.rateLimits, 'rateLimits'],
    ['bezy_payments', 'telegram_payment_charge_id', plan.payments, 'payments'],
    ['reports', 'id', plan.reports, 'reports'],
    ['support_requests', 'reference', plan.supportRequests, 'supportRequests']
  ];
  for (const [table, column, ids, key] of deletes) {
    for (const id of ids) {
      const result = await query(`DELETE FROM ${table} WHERE ${column} = $1`, [id]);
      applied[key] += result.rowCount || 0;
    }
  }

  console.log(`[bezy-privacy] retention.applied ${JSON.stringify(applied)}`);
  return applied;
}
