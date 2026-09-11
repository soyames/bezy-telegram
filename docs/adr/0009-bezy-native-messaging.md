# ADR 0009 — Bezy-native messaging between matched users

- **Status:** Accepted (2026-09-11) — explicit owner decision; supersedes the messaging
  clause of ADR 0001.
- **Permanent decision per roadmap §1.**

## Context

The Telegram user-to-user chat handoff failed in practice. The Mini App webview cannot fire
`tg://` deep links reliably on any platform (live-confirmed on Android across two
mechanisms; Telegram developers state `tg://`-style redirects are unlikely to be supported
from webviews), a match whose partner has no `@username` had no dependable path to a
conversation at all, and stored `@username`s can go stale. The owner decided that messaging
between matched users must be a real Bezy-native experience inside the Mini App instead of
depending on Telegram's chat UI.

## Decision

Bezy owns conversations between matched users: message storage, delivery inside the Mini
App, conversation starters, unread state and messaging safety. Telegram keeps identity,
hosting the Mini App, bot notifications and the platform environment. Bezy does not fake
Telegram chat, does not send messages as the user through the Bot API, and does not run a
userbot.

## Consequences

- Conversations are keyed by the canonical match id (the sorted pair of Telegram numeric
  ids) under `conversations/{id}`; messages live in `conversations/{id}/messages/{clientId}`.
  The client-generated message id makes a retried send idempotent: the same id always writes
  the same document.
- Authorization is entirely server-side. The sender is the authenticated initData user —
  never accepted from the request; the counterpart is derived from the conversation id —
  never client-chosen; every read and send requires an active mutual match, no blocks in
  either direction, and an active Premium membership (roadmap §14). Anti-enumeration: a
  missing/ended match, a block and a wrong conversation id all answer identically
  (`CONVERSATION_UNAVAILABLE`).
- Real-time is a short client poll (~4s) while a conversation is open. Firestore client
  access stays deny-all (firestore.rules unchanged) and no WebSocket/service infrastructure
  is introduced — polling is the smallest mechanism that fits the Vercel + Firestore
  architecture.
- Telegram remains the notification channel only: a generic "new message" notification
  (never the message content) under the existing preference and daily-cap architecture
  (`_notify.js`, category `messages`, capped).
- Safety stays authoritative: block and unmatch close the conversation server-side;
  account deletion erases the conversation and its messages; sending checks blocks and the
  reciprocal-like state on every request.
- The match notification now points at the Bezy conversation ("Start chatting" → Mini App)
  instead of a Telegram chat link.
- Legal follow-ups are flagged, not decided here: a retention policy for active-account
  messages, the privacy policy and terms pages (user-facing copy still describes
  Telegram-hosted chats), the DPIA/data-processing map update, and notification-processing
  documentation.
- Supersedes: the messaging clause of ADR 0001 (Telegram remains the identity, hosting,
  notification and platform layer). Depends on: ADR 0002, ADR 0005.
