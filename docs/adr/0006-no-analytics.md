# ADR 0006 — No analytics, tracking or unnecessary cookies

- **Status:** Accepted (recorded 2026-09-10; decision predates the record)
- **Permanent decision per roadmap §1.**

## Context

Analytics and attribution tooling are the industry default, but they create a tracking
surface that the Privacy Policy, the data-processing map and the DPIA screening all currently
rely on *not existing* (the absence of tracking is part of why DPIA criterion 3 is not met).

## Decision

No analytics, tracking or unnecessary cookies. Verified absent: 0 references to any
analytics, metrics or attribution SDK.

## Consequences

- The claim "no analytics" is load-bearing in Privacy Policy, `DATA_PROCESSING_MAP.md` and
  `DPIA_ASSESSMENT.md` — introducing analytics would require updating all three and would
  likely change the DPIA outcome.
- Growth attribution (G-7) conflicts with this decision and requires an explicit owner
  decision first (§18-A). A bare `start_param` deep link (G-3) is possible without tracking,
  but attribution beyond it is not.
- Observability is limited to `console` logging (SC-7 is 🔵 READY and unbuilt).
