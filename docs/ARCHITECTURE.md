# Bezy architecture

## Product boundary

Bezy is a Telegram-native product. Telegram is the user-facing application, identity layer, notification channel and messaging environment. The Bezy Mini App is the rich UI and is opened from the Bezy bot inside Telegram.

## Runtime

- **Telegram Bot**: commands, onboarding, match notifications and orchestration.
- **Telegram Mini App**: Discover, profile editing, likes/passes, matches, settings and future premium UI.
- **Vercel**: static Mini App hosting plus serverless API routes for webhook handling, Telegram initData validation, business logic and Firestore access.
- **Firebase Cloud Firestore**: server-side persistent database only.
- **Telegram Stars**: future paid membership/digital goods inside Telegram; not implemented in the current matching flow.

## Telegram-Native Communication Principle

Bezy does not replicate Telegram's communication features. Once two users are permitted to
connect, Bezy hands communication back to Telegram: private messaging, voice calls, video
calls, media sharing and Telegram-native profile/story experiences all happen in Telegram.

**Bezy controls** who you discover, who you like or super-like, who is allowed to match with
you, discovery filters, profile completeness, dating preferences, safety, blocking, reporting,
verification, match lifecycle and premium dating features.

**Telegram provides** identity, the user account and profile, chat, voice calls, video calls,
stories, notifications, media sharing, contacts, privacy settings and transport encryption.

This is an architectural rule, not a preference. It exists to prevent work such as: building a
Bezy chat system, adding WebRTC or TURN servers, storing messages, call metadata or story media
in Firestore, or mirroring Telegram stories into Bezy.

Practical consequences:

- A match hands off to the Telegram conversation. Voice and video calls are started by the users
  from Telegram's own call controls; the Bot API cannot initiate a call on a user's behalf
  (`phone.requestCall` is a user-only MTProto method), so Bezy must never present a button that
  claims to place a call.
- Stories are not copied into Firestore. Where Bezy uses stories at all, it uses Telegram's
  native share-to-story flow from the Mini App rather than hosting story media.
- Premium must not paywall functionality Telegram already gives users for free. Premium unlocks
  Bezy's matchmaking value — discovery volume, seeing who liked you, advanced filters, super
  likes, priority and visibility — never Telegram's own chat or call features.

## Operator

Bezy is operated by **DIGITAL CONCORDIA**, a business registered in Benin under Registration
No. `RB/ABC/21 A 28773`, registered on 25 March 2021 with the Cotonou Commercial Court,
represented by its owner and legal representative Yao Amevi Amessinou Sossou. Registered
address: Abomey-Calavi, Benin. Contact: `contacts@digitalconcordia.com`.

Digital Concordia is the operating and trade name used for Bezy. The registration extract
itself carries the spelling "DIGITAL CONDORDIA" — a clerical error made when the business was
created. Public-facing Bezy material uses the intended spelling, DIGITAL CONCORDIA, while the
registration number remains the authoritative identifier. Nothing in this repository asserts
that the registry has corrected the spelling, because it has not.

## Age policy: 18+ by self-declaration

Bezy is for adults aged 18 and over. Eligibility is established by an **explicit
self-declaration**, not by verification:

- Bezy does **not** perform identity verification, government-ID checks, facial age
  estimation, or use any third-party age-verification provider.
- Telegram does not supply a verified age, and Bezy must never imply that it does.
- No copy anywhere may claim users are "verified adults". The permitted phrasing is
  "Bezy is for adults aged 18 and over."

The declaration is stored on the user document and is deliberately **not** named
`verifiedAge`, which would imply verification that does not happen:

```text
users/{telegramId}
    ageEligibilityConfirmed    true (only ever written from an explicit boolean true)
    ageEligibilityConfirmedAt  Timestamp of the first declaration; never re-dated
    ageEligibilityMethod       "self_declaration"
```

Enforcement is server-side and layered, so a client that skips the gate gains nothing:

| Endpoint | Behaviour without a declaration |
| --- | --- |
| `POST /api/profile/me` | Profile can never become `profileComplete` or `discoverable` |
| `POST /api/discover` | Empty deck, `needsAgeConfirmation: true` |
| `POST /api/swipe` | `403 AGE_CONFIRMATION_REQUIRED`, checked before the target is even looked up |

The Mini App shows the gate before any other view, hides the bottom navigation while it is
open, offers no pre-selected option, and requires an affirmative tap. Declaring "under 18"
blocks profile creation, discovery and matching. Accounts created before the gate existed are
asked to declare rather than being silently grandfathered in.

Separately, the profile's numeric `age` field is still validated at 18–100; the declaration
does not replace it.

## Explicit non-goals

- No separate Bezy mobile application.
- No separate Bezy login page.
- No Telegram Login Widget for the Mini App.
- No Firebase Authentication at this stage.
- No Firebase Cloud Functions.
- No Firebase Cloud Storage for profile photos at this stage.
- No Google Cloud Functions or other Google Cloud compute.
- No external payment page.
- No Bezy-hosted chat database for ordinary conversations; matched users are directed to Telegram for the conversation.

## Authentication

The Mini App receives Telegram `initData`. The Vercel backend validates the Telegram signature with the bot token before trusting user data. The Telegram Login Widget is not part of this architecture because it is intended for authorizing users on external websites; the Mini App already provides Telegram identity data directly.

## Firestore security

The browser/Mini App must not connect directly to Firestore. `firestore.rules` therefore denies all direct client reads and writes. Vercel uses the Firebase Admin SDK, which operates as a privileged server client and bypasses Firestore Security Rules. This is intentional: the Vercel API is the authorization boundary.

## Current data model

- `users/{telegramId}` — Telegram identity metadata, the user's Bezy dating profile and their
  saved discovery `preferences` (`minAge`, `maxAge`, `city`, `sameCityOnly`).
- `users/{telegramId}/actions/{targetTelegramId}` — the current user's like, super-like or pass decision for a target.
- `matches/{sortedTelegramIdPair}` — a mutual like between two users.

Planned, not yet implemented: `users/{uid}/blocks`, `users/{uid}/reports`, `subscriptions/{uid}`.

Deliberately absent, and must stay absent under the Telegram-Native Communication Principle:
any collection for messages, conversations, calls, call metadata, story media or story views.

The Mini App never receives Firestore credentials and never performs direct Firestore reads or writes.

## Current API boundary

- `POST /api/profile/me` — validate Telegram identity, create/load the Bezy account, and save the user's profile.
- `POST /api/discover` — return eligible profiles after excluding the current user's previous actions.
- `POST /api/swipe` — record pass/like/super and atomically create a match when interest is mutual; the Vercel function sends Telegram match notifications.
- `POST /api/matches` — return the current user's matches.
- `POST /api/premium` — `action: 'status'` returns membership, plans, limits and usage;
  `action: 'invoice'` issues a Telegram Stars invoice link for a plan.
- `POST /api/likes` — Premium-only: people who liked the current user. Free members receive
  `403 PREMIUM_REQUIRED` with a count only.
- `POST /api/telegram/webhook` — process localized bot commands, `pre_checkout_query` and
  `successful_payment`, and provide Mini App entry points.

## Matching and conversation flow

```text
Telegram user
    ↓
Bezy Mini App
    ↓ Telegram initData
Vercel API
    ↓
Firestore
    ↓
Like / Super / Pass
    ↓
Mutual like?
  ├─ no → next profile
  └─ yes → create match
              ↓
       Telegram notification
              ↓
       Open Telegram chat
```

Bezy stores the match and connection state, not an ordinary external chat history. Telegram remains the conversation environment.

## Billing policy

The Bezy Firebase project is intended to remain on the Firebase Spark/no-billing setup during development. Do not enable Firebase/Google Cloud billing merely to deploy Bezy API routes: Vercel hosts the serverless functions. Do not add Firebase Cloud Functions or other Google Cloud compute without an explicit architecture decision.

## Localization

Telegram supplies a user's language code to Mini Apps. Bezy uses the Telegram language automatically on first use, with English as the fallback, and lets the user explicitly switch between English and French in Profile/Settings. Localization catalogs live under `locales/`. The UI uses shared translation keys rather than duplicated screens.

The bot also has localized command scopes for English and French. French commands use Telegram's supported command character set, e.g. `/demarrer`, `/aide`, `/profil`, `/decouvrir`, `/matchs` and `/parametres`.

## Legal pages

The Mini App links to `/privacy` and `/terms` from Profile/Settings. The links carry the selected language (`?lang=en` or `?lang=fr`) so the legal pages stay aligned with the Mini App language.

## Photos

The initial approach is to use the Telegram profile photo URL when Telegram makes it available. Bezy should not create a separate photo storage system until there is a clear product requirement and privacy/security review.

## Bezy Premium

### Bezy Premium is not Telegram Premium

`users/{id}.isPremiumTelegram` records whether the user pays Telegram for *Telegram* Premium.
It is informational only and must never grant a Bezy entitlement. Bezy Premium lives in its own
field, `users/{id}.bezyPremium`, and is granted solely by a verified Telegram Stars payment.

### Payment provider

Bezy Premium is a digital service sold inside Telegram, so it is paid for with **Telegram Stars
(`XTR`)** through the Bot API. There is no external checkout page, no card form, and no
third-party payment provider in the Premium path. A Smart Glocal account exists for the bot at
the Telegram/BotFather level, but it is **not used by Bezy Premium** and no Smart Glocal code
exists in this repository; Stars require an empty `provider_token`.

Premium must never paywall Telegram's own features. Messaging, voice and video calls between
matched users stay free per the Telegram-Native Communication Principle above.

### Plans

Prices and durations are resolved server-side in `api/_premium.js`. The Mini App only renders
what `/api/premium` returns, so a client can never influence what it is charged.

| Plan | Duration | Price |
| --- | --- | --- |
| `monthly` | 1 month | 250 ⭐ |
| `quarterly` | 3 months | 600 ⭐ |
| `yearly` | 12 months | 1900 ⭐ |

Each price can be overridden per environment with `BEZY_PREMIUM_STARS_MONTHLY`,
`BEZY_PREMIUM_STARS_QUARTERLY` and `BEZY_PREMIUM_STARS_YEARLY`.

### Membership and payment model

```text
users/{telegramId}.bezyPremium
    active                     boolean
    planId                     monthly | quarterly | yearly
    expiresAt                  Timestamp — authoritative; expiry is evaluated, never trusted
    purchasedAt, updatedAt     Timestamp
    source                     telegram_stars
    telegramPaymentChargeId    string

users/{telegramId}.usage       { day, discoveryActions, superLikes }  daily quota counters
users/{telegramId}/likesReceived/{fromId}   reverse index of an existing action

bezyInvoices/{nonce}           pending invoice issued by the backend
bezyPayments/{telegramPaymentChargeId}      processed payment — document id is the idempotency key
```

There is no `subscriptions` collection: a single authoritative membership state lives on the
user document, which discovery and swipe already read, so entitlement costs no extra reads.

### Payment flow

```text
Mini App (choose plan)
    ↓ POST /api/premium { action: 'invoice', planId }
Vercel validates initData → resolves plan + price server-side → writes bezyInvoices/{nonce}
    ↓ createInvoiceLink (currency XTR, provider_token "")
Telegram native Stars checkout   ← Mini App opens it with tg.openInvoice()
    ↓ pre_checkout_query
Vercel webhook re-derives plan, price, buyer and invoice from Firestore → answerPreCheckoutQuery
    ↓ successful_payment
Vercel webhook → Firestore transaction keyed on telegram_payment_charge_id
    ↓
Bezy Premium active → Telegram confirmation → Mini App re-reads /api/premium
```

Premium is granted by exactly one event: a validated `successful_payment`. Creating an invoice,
opening the payment sheet, or passing pre-checkout grants nothing, and the Mini App never marks
itself Premium — it re-reads authoritative state after checkout closes.

### Idempotency

Telegram can redeliver payment updates. Activation runs in a Firestore transaction that first
reads `bezyPayments/{telegram_payment_charge_id}`; if that document exists the update is a
duplicate and returns without extending the membership or re-sending a confirmation. The
provider charge id is stored so a future refund can call `refundStarPayment`.

### Renewal

An entitled membership is extended from its existing `expiresAt`; anything else restarts from
now. Buying a month on 20 September while active until 15 October yields 15 November — purchased
time is never destroyed. Renewal keys off *effective entitlement*, not the raw `expiresAt`, so a
refunded membership that still carries a future date cannot be stacked on by a new purchase.

### Refunds

**A refund is not an expiration.** Expiry is time running out; a refund undoes the purchase.
A refunded membership becomes Free *immediately*, even when `expiresAt` is months away.

```text
successful_payment → payment recorded → Premium activated
                                              ↓
                                       refund requested
                                              ↓
                                  Telegram Stars refund succeeds
                                              ↓
                        refunded_payment webhook  /  admin script
                                              ↓
                               payment marked refunded  (bezyPayments)
                                              ↓
                          entitlement revoked  (users/{id}.bezyPremium)
                                              ↓
                                 Telegram confirmation to the user
```

Telegram pushes `refunded_payment` inside a normal `message` update whenever a Stars payment is
refunded — by Bezy, by the operator's script, or by Telegram support. That update is the
authoritative revocation trigger, so entitlement is withdrawn regardless of who initiated the
refund. It requires no new `allowed_updates` entry beyond `message`.

`applyRefund()` in `api/_premium.js` is the single revocation path, shared by the webhook and
the admin script. It runs one transaction on `bezyPayments/{telegram_payment_charge_id}`:

| Field | On refund |
| --- | --- |
| `bezyPayments/{id}.refundStatus` | `none` → `refunded` (or `failed` if Telegram rejects) |
| `bezyPayments/{id}.status` | `processed` → `refunded` |
| `bezyPayments/{id}.refundedAt`, `.refundSource` | written |
| `users/{id}.bezyPremium.active` | `true` → `false` |
| `users/{id}.bezyPremium.revokedAt`, `.revocationReason`, `.refundedChargeId` | written |
| `planId`, `purchasedAt`, `expiresAt`, `telegramPaymentChargeId`, `stars`, `invoicePayload` | **preserved for audit** |

`premiumState()` treats any membership with `revokedAt` as inactive independently of the clock,
so every Premium-gated endpoint sees the user as Free on its next call.

Ordering is deliberate: Telegram is asked first and Firestore is only written after Telegram
confirms. A rejected refund records `refundStatus: failed` with the reason and leaves the
membership untouched. Re-processing the same charge returns `already_refunded` without a second
write, a second revocation, or a duplicate notification.

Refunds are administrative and have **no HTTP endpoint** — see "Refund authorization" below.

### Entitlements, enforced server-side

| Capability | Free | Premium |
| --- | --- | --- |
| Discovery actions per day | 30 | 500 (anti-abuse ceiling) |
| Super Likes per day | 1 | 5 |
| See who liked you | ✗ `403 PREMIUM_REQUIRED` | ✓ |
| Advanced discovery (city, same-city-only) | ✗ | ✓ |
| Visibility in others' discovery | normal | +6 ranking boost |

Every restriction is enforced by the API, not by hiding UI. `/api/likes` returns only a
non-identifying count to free members — no profile, name or photo is sent. Quotas are consumed
inside the swipe transaction, so a client that ignores the UI or races requests cannot exceed
them. The visibility boost only reorders real candidates; it never fabricates profiles or
guarantees a match.

`api/_premium.js` is the single source of truth for plans, membership state and quotas, so
entitlement cannot drift between endpoints.

### Refund authorization

There is deliberately **no refund API route**. `POST /api/premium` accepts only `status` and
`invoice`; anything else is rejected with `INVALID_ACTION`, and `/api/premium/refund` does not
exist. A refund therefore cannot be triggered by any Mini App client, authenticated or not, and
no user can act on another user's payment.

Refunds are initiated by the operator running `scripts/refund-payment.mjs`, which requires both
the bot token and the Firebase service-account credentials. Holding those credentials *is* the
authorization boundary. Should a refund UI ever be needed, it must sit behind a real admin
identity check — never behind Telegram `initData` alone, which only proves who the caller is,
not that they are permitted to refund.

## Future Telegram Serverless evaluation

Telegram has been expanding its own bot/Mini App platform and there are reports of a Telegram-native serverless runtime. We should evaluate it separately before moving production workloads. For now, Vercel remains the stable backend boundary because it is already deployed and keeps Firebase billing disabled. Any migration should be treated as a deliberate architecture change after confirming public availability, runtime limits, database capabilities, secrets handling, observability and pricing.
