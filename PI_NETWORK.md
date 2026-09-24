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

## What this branch adds

**Photo transfer (media layer).** A selected dating photo uploads automatically
through Vercel to a **private Vercel Blob store**; its ID and Blob reference
live in the shared database. The existing Telegram database and `DATABASE_URL`
stay intact. Authorized viewers download through the API when browsing; the
owner's device may be offline. No image bytes go into Postgres. Copies already
cached on viewer devices cannot be remotely erased, and Vercel Blob storage and
transfer incur usage charges.

**Shared social layer.** Namespaced tables in the same shared database plus
Vercel endpoints under `/api/social/*`:

- `profile` — publish/read/remove a member's cross-platform profile. Telegram
  profiles are derived server-side from the existing `users`/`profiles`/
  `preferences` tables (the client sends no profile body); Pi profiles are
  validated against the Pi app's own constants. Both providers land in one
  `bezy_social_profiles` row keyed by `(provider, subject)`.
- `discover` — both-sides filtered candidates (gender, age, area, visibility,
  paused, already decided/blocked/matched/reported excluded; telegram viewers
  never see telegram candidates, so the legacy deck is never duplicated),
  ranked by shared interests then age closeness, capped at 30.
- `decision` — like/pass with transactional mutual-like match creation.
- `matches` — list active matches with counterpart card, last message and
  unread; unmatch.
- `messages` — list/send/read per match; idempotent client ids, per-match
  send rate limit.
- `block` — one-directional row applied both ways; blocking also ends an
  active match between the two (both frontends promise this).
- `report` — file a report and block the target, ending any active match.

Premium checkout in the Pi app remains gated, and moderator review tooling for
the new reports table is not built yet. This branch must not be released as a
working cross-platform dating app until the tests below pass and purchases are
explicitly enabled.

## Current Vercel/Neon state (verified with the Vercel CLI)

- The `bezy-telegram` project keeps its existing Neon store
  `neon-apricot-helmet` as its `DATABASE_URL` — **never replace or unlink it**
  or Telegram members lose their data.
- The new shared database `bezy-db` (Neon ID `withered-night-73349739`) is
  connected to the **`bezy-pi-app`** project (Neon's standard variable names),
  and migrations `001` + `002` are applied there. `BEZY_MEDIA_DATABASE_URL`
  is set on `bezy-telegram` (production set from the dashboard, preview from
  the connected store — verify the production value points at bezy-db, not
  the Telegram database).
- `BEZY_PI_ORIGINS` is set on `bezy-telegram` for the Pi Testnet app
  (`https://bezyhv6896.pinet.com`) and the Pi Vercel app
  (`https://bezy-pi-app.vercel.app`).
- The private Blob store **`bezy-media`** is created and connected to
  `bezy-telegram` (`BLOB_READ_WRITE_TOKEN` in all environments).
- The `bezy-pi-app` Vercel project exists, is GitHub-linked with
  `rootDirectory: pi-app`, and has `NEXT_PUBLIC_BEZY_API_URL` set. Its
  production branch still needs to be set to `BezyPiNetwork` in the
  dashboard (Settings → Git → Production Branch) — until then main pushes
  would attempt a root-pi-app build that cannot exist on main.
- The `bezy-api` Vercel project hosts `shared-api/` (the moved
  `api/media` + `api/social` code) at `https://bezy-api.vercel.app`, with
  both database secrets, the Blob store and origins configured. The
  `TELEGRAM_BOT_TOKEN` secret still needs to be copied onto it (only
  Telegram-side shared auth depends on it; Pi auth does not).

## Setup steps

1. Copy the connection string for `bezy-db` from the Neon console and add it
   on the `bezy-telegram` project as a **secret named
   `BEZY_MEDIA_DATABASE_URL`** (Production + Preview). Set it manually rather
   than using Vercel's storage-connect flow: connecting a second Neon store to
   a project that already has one can overwrite the existing `POSTGRES_*`
   variables that the Telegram backend depends on. Do not paste the connection
   string into the repo or a chat.
2. Run `media-migrations/001-media.sql` then `media-migrations/002-social.sql`
   **only on `bezy-db`**. All tables are namespaced (`bezy_media_*`,
   `bezy_social_*`) and touch nothing from the Telegram database.
3. Create a **private Vercel Blob store** and link it to the Vercel project
   serving `/api/media/*`; Vercel supplies `BLOB_READ_WRITE_TOKEN` on that
   project's server environment. A Postgres database alone cannot retain
   photo bytes. Never put Blob tokens in `NEXT_PUBLIC_*` or in source control.
4. Set `BEZY_PI_ORIGINS` to the exact HTTPS Pi App Studio and Pi Vercel
   frontend origins (comma separated). The Pi frontend points at the API via
   `NEXT_PUBLIC_BEZY_API_URL`. This URL is public; it is not a secret.
   Requests from the API's own deployment origin (the Telegram mini app
   posting to the same origin, `BEZY_MINI_APP_URL`) are always allowed, so
   the mini app's writes work without being listed here.
5. Deploy the root Vercel API and create the separate `pi-app` Vercel project
   (its builds differ from the root app; deploy it as its own project or via
   a Pi-supported code import). A GitHub push does not update the Pi-hosted
   App Studio app.
6. Verify authenticated Pi and Telegram uploads, access denial, reload,
   deletion, and viewing while the uploader is offline before rollout.

## Integration contract

1. One opaque Bezy member ID per account, with a unique provider binding
   `(provider, provider_subject)` for Telegram and Pi. Telegram `initData` is
   signature-verified on the server; Pi access tokens are verified through
   `GET /v2/me`. Accounts are never merged based on usernames or names.
2. Discovery, decisions, matches, private conversations, blocks, reports and
   moderation live behind server APIs keyed by internal member ID. Mutual
   likes run in transactions; blocks and privacy settings are enforced for
   every operation across both providers.
3. Telegram's existing profile-avatar URL stays served by Telegram. User-added
   dating images are held in private Vercel Blob, with IDs, consent and Blob
   references in the separate shared database. All reads go through a
   server-authenticated endpoint, not a public image URL. Device copies are
   optional caches and never the only source of an uploaded photo. Photo
   authorization is integrated with discovery, decisions, reports, matches
   and moderation.
4. The Pi frontend talks to the shared APIs for cross-user data instead of
   only Pi userState. Migrating any existing Pi profile happens through the
   normal profile publish with the user's consent.
5. Pi payments must be verified on the server against an order, product,
   amount, app and verified UID. Approve and complete through Pi, then grant
   Premium once. Restore it after reload; handle retries, interruptions,
   expiration and manual renewal. Client callbacks alone cannot grant
   Premium. **Not implemented yet — checkout stays gated.**
6. Test with one Telegram and two distinct Pi accounts: reciprocal discovery,
   likes, match, chat, unmatch, block, report, photo availability while the
   owner is offline, photo reload and deletion, account deletion, moderator
   review and payment reconciliation. Keep public access and purchases
   disabled until these tests pass.

## Deployment separation

Three Vercel projects, each under the Hobby ceiling of 12 serverless
functions per deployment:

- **`bezy-telegram`** (root `./`) — the Telegram mini app and its legacy API:
  12 route files exactly (`api/*.js` minus the shared layer). Never deploy
  more routes here.
- **`bezy-api`** (root `shared-api/`) — the shared community API: 3 media +
  7 social route files. Env: `DATABASE_URL` (Telegram DB, read-only for the
  profile mirror), `BEZY_MEDIA_DATABASE_URL` (bezy-db), `TELEGRAM_BOT_TOKEN`,
  `BEZY_PI_ORIGINS` (must include `https://bezy-telegram.vercel.app` for the
  mini app's cross-origin calls, plus the Pi origins), `BEZY_MINI_APP_URL`,
  and the `bezy-media` Blob store's `BLOB_READ_WRITE_TOKEN`.
- **`bezy-pi-app`** (root `pi-app/`) — the Pi frontend, with
  `NEXT_PUBLIC_BEZY_API_URL=https://bezy-api.vercel.app`.

The mini app calls the shared API at `https://bezy-api.vercel.app` (absolute,
cross-origin, CORS-allowlisted); the Pi frontend defaults to the same origin
when `NEXT_PUBLIC_BEZY_API_URL` is absent (App Studio builds). Do not put
`DATABASE_URL`, Pi API keys or wallet secrets in any frontend or the repo.
The generated `pi-app/lib/pi.ts` is marked locked by App Studio; verify its
upload rules before import. The My Apps icon is configured separately in Pi
App Studio and is unaffected by in-app branding changes. CLI deploys of
projects with a `rootDirectory` must run from the repo root with
`--project <name>` so the root directory resolves inside the upload.
