# Bezy on Pi: shared dating backend

`pi-app/` contains the September 24, 2026 App Studio export, with branding edits
and a purchase safety gate documented in `pi-app/README.md`. `assets/pi/` holds
the supplied logos. The Telegram app remains at the repository root. Nothing
in this branch is deployed.

## Shared community decision

Telegram and Pi users should discover each other, like, match, block, report
and message in one Bezy community. Reuse the existing Vercel API and Neon
infrastructure after adapting its private schema; the Pi Browser frontend
remains separate. Pi sign-in and Pi payments stay on Pi. Telegram login and
Stars stay on Telegram. Payment prices and provider histories stay distinct.

This export does **not** yet support shared dating. Pi userState saves data
per Pi account; photo object URLs expire with the tab; and the discover screen
correctly reports no shared candidates. The exported Premium screen disables
checkout until real benefits and durable, verified entitlements exist. These
edits do not affect the already hosted App Studio version.

## Integration contract

1. Create one opaque Bezy member ID per account, with a unique provider binding
   `(provider, provider_subject)` for Telegram and Pi. Verify signed Telegram
   `initData` on the server and Pi access tokens through `GET /v2/me`. Never
   merge accounts based on usernames or names. Linking identities needs explicit
   consent and proof of control of both accounts.
2. Move discovery, decisions, matches, private conversations, blocks, reports
   and moderation behind server APIs keyed by internal member ID. Use
   transactions for mutual likes and enforce both sides' privacy settings and
   blocks for every operation across both providers.
3. The owner requires dating photo bytes to remain on each user's device; do
   not put the bytes in Vercel, Neon, Pi userState, or another media host without
   an explicit change to that requirement. The database may hold non-image
   metadata, consent and availability only. For another user to see a photo,
   its device must transfer the bytes or serve them while online; an App Studio
   object URL cannot be fetched by another device and disappears after reload.
   A browser cannot promise that the source device remains reachable in the
   background. Do not claim reliable cross-user photo display until a feasible,
   consented transport has been demonstrated on real Pi and Telegram devices,
   including offline and device-change behavior. Telegram's existing profile
   avatar URL is already served by Telegram, so it does not satisfy a strict
   device-only rule. The actual SQL migrations in `db/` are private.
4. Adapt the Pi frontend to the shared APIs for cross-user data instead of
   only Pi userState. Migrate any existing Pi profile with the user's consent;
   Vercel cannot automatically read per-user App Studio state.
5. Verify Pi payments on the server against an order, product, amount, app and
   verified UID. Approve and complete through Pi, then grant Premium once.
   Restore it after reload; handle retries, interruptions, expiration and
   manual renewal. Client callbacks alone cannot grant Premium.
6. Test with one Telegram and two distinct Pi accounts: reciprocal discovery,
   likes, match, chat, unmatch, block, report, photo availability while the
   owner is offline, photo reload and deletion,
   account deletion, moderator review and payment reconciliation. Keep public
   access and purchases disabled until these tests pass.

## Deployment separation

The root app and Next.js export have different builds. Deploy `pi-app/` as a
separate Vercel project or use a Pi-supported code import, then connect it to
the shared API after identity and cross-origin security are implemented. Do
not put `DATABASE_URL`, Pi API keys or wallet secrets in the frontend or repo.
The generated `pi-app/lib/pi.ts` is marked locked by App Studio; verify its
upload rules before import. The My Apps icon is configured separately in Pi
App Studio and is unaffected by in-app branding changes.
