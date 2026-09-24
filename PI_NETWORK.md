# Bezy on Pi: integration workstream

This branch is a separate Pi Browser entry point for the existing Bezy product. The
Telegram production app remains at `/`. The Pi preview is at `/pi/`; it currently
supports Pi sign-in and server verification only. Do not advertise it as a working
dating service or accept Premium payments yet.

## What is already in this branch

- `/pi/`: mobile entry and Pi SDK sign-in. `?sandbox=1` is for registered Testnet
  app development only. The default is Mainnet mode, which still requires Pi app
  registration and verified production URL.
- `/api/pi/session`: Vercel function that verifies the access token against Pi
  `/v2/me`. It never trusts a client-supplied UID and does not persist tokens.
- `tests/pi-identity.test.mjs`: identity verification boundary checks.

## Work required before launch

1. Register separate Testnet and Mainnet Pi apps, verify the HTTPS deployment
   domains, and configure Pi's app wallet and server API key in Vercel secrets.
   Never commit keys or a wallet passphrase. App wallet and personal wallet are
   distinct; confirm the actual payout arrangement in the Pi portal.
2. Add a **private** database migration for Pi users and their profile, matching,
   message, safety, and payment relationships. The current SQL uses Telegram BIGINT
   IDs throughout, and `db/` is deliberately excluded from this public repo.
   Keep Pi UIDs in a separate namespaced identity table; never coerce them into
   Telegram IDs or auto-link identities by matching usernames.
3. Adapt each dating API to verified Pi identity and authorize ownership at every
   read/write. Reuse matching and moderation rules after separating them from
   Telegram transport. Preserve adult eligibility, consent, reports, blocks,
   export, deletion, and privacy rights for Pi accounts. Review the Pi app's
   privacy/terms text before launch.
4. Build Bezy Pi profile onboarding, discovery, likes, matches, conversation,
   safety, and Premium screens on the Pi-specific frontend. The current Telegram
   frontend sends signed `initData` to every API endpoint and cannot simply be
   reused as a Pi client.
5. Define Pi-denominated plan prices separately from Telegram Stars prices.
   Request `payments` scope, start U2A purchases with `Pi.createPayment`, verify
   payment UID, direction, network, amount, and order metadata against a durable
   server-side order before approval. Complete with Pi Platform API, persist a
   unique payment ID/transaction ID, and extend Premium exactly once. Recover
   interrupted payments and never deliver access on client callbacks alone.
   The current Pi SDK documents individual payments, so display renewal as a
   fresh user-approved purchase rather than automatic billing.
6. Test in Pi Sandbox and Pi Browser, including an interrupted payment, duplicate
   callbacks, a mismatch in payment amount/UID, adult gate, blocked users, and
   account deletion. Mainnet access and listing require Pi's review.

## App Studio external AI route

The branch is public and can be read at
`https://github.com/soyames/bezy-telegram/tree/BezyPiNetwork`. This does **not**
grant Pi AI GitHub write access. If App Studio offers repository import or a
GitHub authorization prompt, inspect its requested permissions before connecting
the account. A public URL is enough for read-only inspection if the tool supports
reading repositories. Never paste Vercel secrets, the Pi Server API Key, or a
wallet passphrase into App Studio's AI instruction box.

### Form fields (within the screenshot limits)

**App name (30 characters):** Bezy on Pi

**Description (200 characters):** Bezy helps adult Pioneers meet through profiles, mutual interests and respectful conversations. Sign in with Pi and unlock optional Premium features with Pi payments.

**Language:** English initially; preserve the existing localized Bezy experience
where support is complete.

**Category:** Social, subject to Pi's category and listing rules.

**Pi AI instructions (1,000 characters):**

> Build Bezy on Pi as a Pi Browser dating app for adults, using the existing Bezy code at https://github.com/soyames/bezy-telegram/tree/BezyPiNetwork as the reference. Keep the current Vercel backend and database. Use Pi SDK sign-in and verify each Pi access token server-side with /v2/me. Pi UID identifies a user; a dating profile with photo, age, interests, preferences and consent is created separately. Include profile creation, discovery, mutual likes and matches, private messaging, blocking, reporting, moderation, privacy controls and account deletion. Premium is optional and paid in Pi through Pi SDK and server-approved/completed payments; activate access only after verified completion. Show a renewal prompt when time expires, with no automatic charge. Never expose server keys or wallet secrets. Do not use Telegram authentication or Telegram Stars in this Pi experience. Preserve Bezy branding and mobile usability.

The AI text states the intended product; it is not proof that App Studio will
automatically implement this complex existing backend or receive GitHub access.
