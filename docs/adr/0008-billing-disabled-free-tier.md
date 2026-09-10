# ADR 0008 — Billing stays disabled; the free tier is the operating envelope

- **Status:** Accepted (recorded 2026-09-10; decision predates the record)
- **Permanent decision per roadmap §1 and SC-2.**

## Context

Firestore runs on the Spark (free) tier. Development tests share the same project as the live
app. On 2026-09-10 the daily read quota was exhausted by development testing alone, aborting
a suite mid-run and blocking all further reads for the day — while writes kept working.

## Decision

Billing stays disabled. Raising the quota is not an available answer; the free tier's limits
are the operating envelope until the operator decides otherwise.

## Consequences

- Test discipline: one green full-suite run per fresh quota day, never iterative retries
  against production data. A separate test project or the emulator is the proper fix before
  campaign scale (SC-2).
- Pure suites (contract, localization) run regardless of quota and are the always-available
  gate; the Firestore-backed suites (backend, security, Playwright) are quota-gated.
- An aborted suite can leave synthetic `9000000xx` profiles discoverable, since cleanup
  itself needs reads — synthetic ids only, and never real records.
- Depends on: ADR 0002. Constrains: every quota-touching feature (rate limiting, notification
  caps) must reuse existing documents rather than add new ones.
