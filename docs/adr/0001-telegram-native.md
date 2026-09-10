# ADR 0001 — Bezy is Telegram-native

- **Status:** Accepted (recorded 2026-09-10; decision predates the record)
- **Permanent decision per roadmap §1:** not revisitable without an explicit owner decision.

## Context

Bezy is a dating service distributed exclusively through Telegram. Telegram already provides
identity, notifications, messaging and platform-level safety at a scale a two-person product
cannot replicate. The alternative — building an independent identity system, notification
channel or messaging backend — would duplicate all of that and create new personal-data
surfaces.

## Decision

Telegram owns identity, notifications, messaging and platform safety. Bezy owns profiles,
discovery, matching, dating-specific safety, Premium and data controls. Bezy must not rebuild
any Telegram capability.

## Consequences

- The bot username `@BezyDatingBot` is the entry point and must not be changed (§1).
- Conversations live in Telegram chats only; Bezy stores no message content (ARCHITECTURE.md
  "Deliberately absent" collections).
- Match notifications hand the conversation over to Telegram; the `@username` release is the
  contact vector and is guarded by the disclosure boundary (ADR 0005).
- Telegram-level messaging safety is Telegram's and must not be duplicated; Bezy handles
  Bezy-level dating safety (roadmap §8).
- Depends on: ADR 0002 (platform), ADR 0005 (identity).
