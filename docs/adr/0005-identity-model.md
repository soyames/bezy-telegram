# ADR 0005 — Telegram numeric id is the identity model

- **Status:** Accepted (recorded 2026-09-10; decision predates the record)
- **Permanent decision per roadmap §1.**

## Context

A dating service must be able to say whose profile is whose, while keeping people
unreachable until both sides consent. Telegram offers a numeric id (stable, canonical) and an
`@username` (mutable, public, the actual contact vector).

## Decision

- The Telegram numeric id is canonical and the only basis for ownership: document ids,
  collections, mirror documents and rate-limit counters all key on it.
- `@username` is a mutable public locator, never a key.
- `displayName` is presentation.
- **Disclosure boundary:** the `@username` is released only on a mutual match
  (`/api/matches`), because releasing it earlier would let anyone browse the deck and message
  people directly, bypassing consent. Deck and liker cards never carry `username`,
  `telegramId` or sensitive attributes (`gender`, `seeking`).

## Consequences

- The contract suite pins the boundary: the match card is the only public shape with
  `username`, and sensitive attributes never leave the backend.
- Enumeration protections (§9 of the roadmap, `TARGET_NOT_FOUND` uniformity) exist to stop
  numeric ids from becoming a probing surface.
- Data minimisation follows from it: fields like `lastName` were dropped (C18).
- Depends on: ADR 0001. Pinned by: `tests/contract.test.mjs`, `tests/security.test.mjs`.
