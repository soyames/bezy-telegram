// Stage 4 outcome evaluation — the offline, operator-run measurement behind
// docs/OUTCOME_DATA_SPEC.md. Read-only and pure: it re-reads the explicit product
// outcomes the system already stores (actions, matches, blocks) and reduces them to the
// match-quality metrics the spec names. No new collection, no telemetry, no per-user
// profiles — counts and rates only. Swipe volume and engagement metrics are deliberately
// absent: the success measure is match quality.

export function summarizeOutcomes(rows, now = Date.now()) {
  const likes = Number(rows.likes) || 0;
  const matches = Array.isArray(rows.matches) ? rows.matches : [];
  const blocks = Number(rows.blocks) || 0;
  const unmatches = Number(rows.unmatches) || 0;

  const total = matches.length;
  const active = matches.filter((m) => m?.active !== false).length;
  const ended = total - active;
  const endedByBlock = matches.filter((m) => m?.endedReason === 'block').length;
  const endedByUnmatch = matches.filter((m) => m?.endedReason === 'unmatch').length;
  const endedByDeletion = matches.filter((m) => m?.endedReason === 'account_deleted').length;
  const continuedRate = total ? active / total : null;

  return {
    likes,
    matches: total,
    // The headline metric: mutual matches per like sent. Higher is better; it is the only
    // number coefficient changes are judged against.
    mutualMatchRate: likes ? total / likes : null,
    active,
    ended,
    continuedMatchRate: continuedRate,
    unmatchRate: ended ? endedByUnmatch / ended : null,
    blockEndedRate: ended ? endedByBlock / ended : null,
    deletionEnded: endedByDeletion,
    blocks
  };
}

/** Human-readable table for the operator script. */
export function outcomeReport(summary) {
  const fmt = (value, digits = 3) => (value === null || value === undefined) ? 'n/a' : Number(value).toFixed(digits);
  return [
    ['likes sent', String(summary.likes)],
    ['mutual matches', String(summary.matches)],
    ['mutual match rate (matches/like)', fmt(summary.mutualMatchRate, 4)],
    ['matches still active', String(summary.active)],
    ['continued-match rate (active/total)', fmt(summary.continuedMatchRate)],
    ['unmatch rate (of ended)', fmt(summary.unmatchRate)],
    ['block-ended rate (of ended)', fmt(summary.blockEndedRate)],
    ['ended by account deletion', String(summary.deletionEnded)],
    ['blocks recorded', String(summary.blocks)]
  ];
}
