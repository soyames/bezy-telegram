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

This branch adds an authenticated photo-transfer API and Pi/Telegram upload clients.
A selected dating photo uploads automatically through Vercel to a **private Vercel
Blob store**; its ID and Blob reference live in a separate Bezy shared database.
The existing Telegram database and `DATABASE_URL` stay intact. Authorized
viewers download through the API when browsing; the owner's device may be
offline. The Pi device also caches downloaded bytes in IndexedDB. No image
bytes go into Postgres. Copies already cached on viewer devices cannot be
remotely erased, and Vercel Blob storage and transfer incur usage charges.

Photo transfer is only one component: the Pi export still has no shared
profile discovery, matching or messaging, and must not be released as a
working cross-platform dating app. Premium checkout remains gated.

## Setup for the new Vercel database

1. Keep the Telegram project's existing `DATABASE_URL` as is. On the Vercel
   project serving `/api/media/*`, set `BEZY_MEDIA_DATABASE_URL` to the **new**
   Bezy database connection string. If the new database was auto-linked as
   `DATABASE_URL`, rename or map it to this variable on that project without
   replacing the Telegram project's original value. Do not paste a connection
   string into the repo or this chat.
2. Run `media-migrations/001-media.sql` **only on the new database**. It creates
   three namespaced tables for photo metadata and consent, and does not touch
   the existing Telegram tables.
3. Create a **private Vercel Blob store** and link it to the Vercel project
   serving `/api/media/*`; Vercel supplies `BLOB_READ_WRITE_TOKEN` on that
   project's server environment. A Postgres database alone cannot retain
   photo bytes without storing them in a database. Never put Blob tokens in
   `NEXT_PUBLIC_*` or in source control.
4. Set `BEZY_PI_ORIGINS` to the exact HTTPS Pi App Studio and Pi Vercel
   frontend origins (comma separated). Pi's frontend may point to the API via
   `NEXT_PUBLIC_BEZY_API_URL`. This URL is public; it is not a secret.
5. Deploy the root Vercel API and upload/deploy the `pi-app/` frontend from
   this branch. A GitHub push does not update the Pi-hosted App Studio app.
   Verify authenticated Pi and Telegram uploads, access denial, reload,
   deletion, and viewing while the uploader is offline before rollout.

If the new Vercel database is a Blob store rather than Postgres, step 2 needs
an actual Postgres store for the small metadata tables. Identify the store type
in the Vercel dashboard before connecting anything.

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
3. Keep Telegram's existing profile-avatar URL served by Telegram. User-added
   dating images are held in private Vercel Blob, with IDs, consent and Blob
   references in the separate shared database. All reads go through a
   server-authenticated endpoint, not a public image URL. Device copies are
   optional caches and never the only source of an uploaded photo. Photo
   authorization must be integrated with reciprocal discovery, decisions,
   reports, matches and moderation before a cross-platform launch.
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
