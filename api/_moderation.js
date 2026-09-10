// Moderation tooling (SF-2 triage, SF-3 category measurement).
//
// Bezy needs *visibility* of reports, not a moderation platform — the credential-gated
// scripts are the workflow. This module holds the pure decisions so the scripts cannot
// drift: the lifecycle, the legal transitions, and the aggregation that tells the operator
// which categories real usage actually produces, so tuning (SF-3) can begin the moment
// reports exist instead of waiting for a dashboard.
//
// Reports carry the reporter's and target's Telegram ids only — see api/relationship.js.

// Lifecycle: open → resolved (actioned) or dismissed (nothing to do). Terminal either way,
// so a triage decision is never silently undone.
export const REPORT_STATUSES = ['open', 'resolved', 'dismissed'];
export const REPORT_TRANSITIONS = { open: ['resolved', 'dismissed'], resolved: [], dismissed: [] };

export function triageTransition(current, action, note = '') {
  const status = REPORT_STATUSES.includes(current) ? current : 'open';
  if (!REPORT_TRANSITIONS[status].includes(action)) {
    return { error: 'INVALID_TRANSITION', status, action };
  }
  return {
    update: {
      status: action,
      statusUpdatedAt: new Date(),
      statusNote: String(note || '').trim().slice(0, 500)
    }
  };
}

/**
 * Aggregates raw report rows (doc data) into the distributions SF-3 exists for: by reason,
 * by status, and by calendar day (last 30 days). Pure, so dry-run and real runs share the
 * math with the tests.
 */
export function summarizeReports(rows = [], { now = Date.now() } = {}) {
  const byReason = {};
  const byStatus = {};
  const byDay = {};
  const DAY_MS = 86400000;
  for (const row of rows) {
    const reason = String(row?.reason || 'other');
    const status = String(row?.status || 'open');
    byReason[reason] = (byReason[reason] || 0) + 1;
    byStatus[status] = (byStatus[status] || 0) + 1;
    const ms = row?.createdAt?.toMillis?.() ?? new Date(row?.createdAt || 0).getTime();
    if (Number.isFinite(ms) && ms > 0 && now - ms <= 30 * DAY_MS) {
      const day = new Date(ms).toISOString().slice(0, 10);
      byDay[day] = (byDay[day] || 0) + 1;
    }
  }
  return { total: rows.length, byReason, byStatus, byDay };
}
