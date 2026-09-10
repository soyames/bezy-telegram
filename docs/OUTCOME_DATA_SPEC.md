# Stage 4 — Outcome-data specification (design only)

This document defines what future adaptive tuning *could* consume, how it would be
represented without violating the no-analytics architecture, and the gates that must clear
before any of it is implemented. **Nothing here is implemented, collected, or active.**
Stage 2/3 weights remain principled initial values until real cohorts exist.

## Explicit outcome events (all already stored, none newly collected)

| Outcome | Where it exists today | Meaning for tuning |
| --- | --- | --- |
| like / super like | `users/{id}/actions/{target}` `action` | positive signal, direction-aware (caller acted) |
| pass | same | negative signal |
| mutual match | `matches/{pair}` `source: 'mutual_like'` | the primary positive outcome — the thing to maximise |
| continued match | `matches/{pair}` `active: true` over time | sustained-match signal |
| unmatch / block-ended | `matches/{pair}` `endedReason` (`unmatch`, `block`) | negative outcome, direction recorded in `endedBy` |
| account-deletion end | `endedReason: 'account_deleted'` | not a quality signal — excluded from evaluation |

Chat content, message text, media, GPS and any inferred attribute are **not** outcomes and
must never enter the dataset. A like is the user's explicit, visible product decision —
that is what makes it legitimate feedback.

## Hypotheses Stage 4 would evaluate (not "learnings")

1. Higher pair score (Stage 2) correlates with a higher mutual-match rate than the
   pre-Stage-2 one-sided ordering.
2. The +10 preference-fit term raises mutual-match rate without measurably reducing deck
   size for the caller.
3. Freshness weighting raises response rate (matches per day) without burying compatible
   dormant profiles.
4. Page diversity reduces same-signal clustering without lowering mutual-match rate.
5. Exploration offsets give sparse profiles a non-zero first-match rate.

## Evaluation methodology (operator-run, offline)

- **Cohort:** all users in a defined period; comparisons are per-candidate-exposure, not
  per-user summaries, to avoid behavioural profiling.
- **Metrics:** mutual-match rate (matches / like exposures), sustained-match rate (matches
  still active after N days), unmatch rate, response latency. **Never** swipe volume, time
  in app, or notification counts.
- **Method:** retrospective comparison of orderings produced by coefficient variants over
  the same exposure set — deterministic replays of `api/discover.js` logic, no live
  experiments, no A/B infra, no new services.
- **Tooling:** implemented — `scripts/outcome-eval.mjs` (`npm run outcomes`), read-only and
  credential-gated, reduces the stored outcomes to the metric table via the pure
  `api/_outcomes.js` (contract-pinned: nulls for empty cohorts, no engagement rows,
  deletion-endings excluded from quality rates).
- **Output:** coefficient change proposals with evidence, recorded in the roadmap before
  any weight is touched. Weights change only on evidence, never on preference.

## Representation constraint (no-analytics compliance)

No event stream, no per-swipe telemetry, no new collection. The actions/matches documents
already exist for product operation (exclusion, who-liked-you, match lifecycle); Stage 4
merely *re-reads* them in bulk for offline evaluation. If evaluation ever requires more
than that, it must pass the same seven-question data gate as any new signal and a
privacy/legal review (ADR 0006).

## Gates before any implementation

1. Real cohorts exist (a meaningful pilot, not the development database).
2. The evaluation script is built and its output reviewed by the operator.
3. For any coefficient change: evidence from §Evaluation methodology is recorded in the
   roadmap.
4. For anything beyond re-reading the existing collections: P0-7-class privacy review.
5. ML in any form additionally requires the Stage 4 legal review (roadmap Stage 4 gate).
