# Bezy on Pi: Pi-hosted architecture target

This branch is a **reference for creating a new Pi App Studio app**. The target is
Pi App Studio hosting and its backend persistent storage, with Pi sign-in and Pi
payments. No Vercel or Neon instance is required by this target architecture.
The existing Bezy Telegram app remains unchanged at the repository root.

Pi has announced backend persistence for **newly created** App Studio apps, but
has not published enough detail to establish that it can support Bezy's full
multiuser dating data, file handling, messaging, moderation, and durable paid
membership logic. Do not represent this branch's static `/pi/` preview as a
working dating app. It has no payment, server verification, or database.

## Source of product behavior

The current Telegram implementation is the reference for interface, languages,
onboarding, profile fields, discovery, matching, conversations, age eligibility,
block/report, privacy controls, and Premium benefits. Its `api/` functions and
SQL use Telegram BIGINT IDs and private database migrations; they are not
deployable to Pi App Studio as-is. Pi UIDs must be the identity key for the
new app. Never map or link by username, and never treat Pi KYC as proof of
adult age unless an officially exposed, suitable age claim exists.

## App Studio capability gates before production

In a newly created App Studio app, verify each item with actual generated code
and tests, not only AI descriptions:

1. Server-side `/v2/me` token verification and protected operations bound to
   the resulting UID. The Pi access token and API key must never be exposed in
   URLs, logs, source, or browser storage.
2. Durable, access-controlled, cross-user data needed for discovery, mutual
   likes, matches, private conversations, blocks, reports, moderation and
   account export/deletion. Check pagination, concurrency, and storage limits.
3. Private profile photos: upload, access rules, deletion, consent, and review.
4. Payment flow for real Pi Mainnet U2A payments: durable order, server-side
   verification of user, amount and product, approval, completion, idempotent
   Premium activation, interrupted-payment recovery, expiry and fresh renewal.
   Never promise automatic recurring charges without confirmed platform support.
5. Adult eligibility, moderation, privacy/terms and accessible mobile flows.

If App Studio cannot satisfy any of these, do not weaken safety or payment
integrity. Revisit the platform choice with the owner before using an external
backend. The Pi App Studio code import has compatibility requirements; the
current repository has not been validated against them.

## Creation fields from the supplied screenshots

**Name (30 characters):** Bezy on Pi

**Description (200 characters):** Bezy helps adult Pioneers meet through profiles, mutual interests and respectful conversations. Sign in with Pi and unlock optional Premium features with Pi payments.

**Language:** English initially; use Bezy's existing translations when complete.

**Category:** Social, subject to Pi's listing rules.

**Pi AI instructions (1,000 characters):**

> Create a Pi-hosted Bezy dating app for adults, using https://github.com/soyames/bezy-telegram/tree/BezyPiNetwork as the product and design reference. Use Pi App Studio's own backend persistent storage, Pi sign-in and Pi payments. Do not depend on Vercel, Neon, Telegram login or Telegram Stars. Verify Pi identity server-side; use Pi UID as the account key. Build separate consent-based dating profiles with age eligibility, photos and preferences. Support discovery, mutual likes/matches, private messaging, blocking, reporting, moderation, privacy controls and account deletion. Premium is optional: create durable orders, verify each Pi payment server-side, grant access once after completion and prompt renewal at expiry. Never auto-charge or expose keys. If App Studio cannot securely provide cross-user data, media storage, moderation or durable payment verification, flag the limitation and stop short of claiming those features work. Keep Bezy branding and mobile usability.

Do not paste keys, wallet passphrases, or access tokens into App Studio's prompt
or this public repository. The branch URL grants no GitHub write permission to
Pi AI. If App Studio requests a GitHub connection, inspect the requested scopes.

## After App Studio generates its app

Export its code and inspect the actual storage, API, security and payment
implementation. The generated app may need to be synchronized back to this
branch if the import/export format supports it. Validate in Pi Testnet before
requesting Mainnet access. User action in the Pi App Studio interface is needed
to create the hosted app; this repository cannot provision it by itself.
