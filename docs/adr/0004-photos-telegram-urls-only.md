# ADR 0004 — Telegram photo URLs are the only image source

- **Status:** Accepted (recorded 2026-09-10; decision predates the record)
- **Permanent decision per roadmap §1.**

## Context

Profile photos are core to a dating product. Storing images would require infrastructure
(Firebase Storage, Cloudinary, S3, Vercel Blob) that Bezy deliberately does not run, plus a
new category of personal data (biometric-adjacent image content) with its own retention and
safety obligations.

## Decision

Photos are **Telegram photo URLs only**. No Firebase Storage, Cloudinary, S3, Vercel Blob or
any Bezy-owned image storage; no upload endpoint; no persistent base64. The only stored photo
reference is the Telegram-provided URL, read at render time.

## Consequences

- The localization suite regression-locks this: no storage dependency in package.json, no
  upload middleware, no inline base64, no image bytes written to Firestore.
- A feature needing persistent image storage must **stop and be reported** — this is exactly
  what V-1 (photo verification) would likely require, which is why V-1 is gated (§17).
- Telegram-side photo changes propagate automatically; Bezy caches nothing and purges nothing.
- Depends on: ADR 0001.
