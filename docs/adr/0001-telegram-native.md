# ADR 0001 — Bezy is Telegram-native

- **Status:** Accepted with one superseded clause (2026-09-11). The **messaging** clause is
  superseded by ADR 0009: conversations between matched users are Bezy-native. Everything
  else stands.
- **Permanent decision per roadmap §1:** not revisitable without an explicit owner decision.

## Context

Bezy is a dating service distributed exclusively through Telegram. Telegram already provides
identity, notifications, messaging and platform-level safety at a scale a two-person product
cannot replicate. The alternative — building an independent identity system, notification
channel or messaging backend — would duplicate all of that and create new personal-data
surfaces.

## Decision

Telegram owns identity, notifications, platform safety and hosting. Bezy owns profiles,
discovery, matching, dating-specific safety, Premium and data controls. **Messaging:
originally Telegram-owned; by owner decision (2026-09-11) conversations between matched
users are Bezy-native — see ADR 0009, which supersedes that clause.** Bezy must not rebuild
any other Telegram capability.

## Consequences

- The bot username `@BezyDatingBot` is the entry point and must not be changed (§1).
- ~~Conversations live in Telegram chats only; Bezy stores no message content~~
  **Superseded by ADR 0009:** conversations between matched users live in Firestore and are
  delivered inside the Mini App.
- Match notifications open the Bezy conversation; the `@username` release remains guarded by
  the disclosure boundary (ADR 0005), and usernames are no longer used as a contact vector.
- Telegram-level platform safety is Telegram's; Bezy handles Bezy-level dating safety
  (roadmap §8) and Bezy-messaging safety (ADR 0009).
- Depends on: ADR 0002 (platform), ADR 0005 (identity). Superseded in part by: ADR 0009.
