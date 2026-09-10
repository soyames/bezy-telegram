# ADR 0002 — Vercel + Firestore + Telegram initData

- **Status:** Accepted (recorded 2026-09-10; decision predates the record)
- **Permanent decision per roadmap §1.**

## Context

Bezy needed a serverless API boundary, a server-side database and an authentication mechanism
that does not create its own account system (ADR 0001).

## Decision

- Backend: **Vercel** serverless functions (`api/`).
- Database: **Firestore** (`bezydating`, europe-west1) as the server-side database only.
- Auth: **Telegram `initData`**, validated server-side (HMAC, timing-safe, 24h window) — the
  Vercel API is the authorization boundary, and Firestore client access is denied entirely
  (`firestore.rules`).

## Consequences

- The Mini App never receives Firestore credentials; every read and write goes through the
  API with per-user authorization and rate limiting.
- Identity comes only from validated `initData` — there is no user id parameter to tamper
  with, so a caller can never act on another account.
- Serverless means per-request cold starts and no long-lived scheduler: retention and
  reminders are operator-invoked scripts, by design.
- Depends on: ADR 0001. Constrains: ADR 0008 (free tier / quota discipline).
