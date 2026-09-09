# Bezy architecture

## Product boundary

Bezy is a Telegram-native product. Telegram is the user-facing application, identity layer, notification channel and messaging environment. The Bezy Mini App is the rich UI and is opened from the Bezy bot inside Telegram.

## Runtime

- **Telegram Bot**: commands, onboarding, match notifications and orchestration.
- **Telegram Mini App**: Discover, profile editing, likes/passes, matches, settings and future premium UI.
- **Vercel**: static Mini App hosting plus serverless API routes for webhook handling, Telegram initData validation, business logic and Firestore access.
- **Firebase Cloud Firestore**: server-side persistent database only.
- **Telegram Stars**: future paid membership/digital goods inside Telegram; not implemented in the current matching flow.

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

- `users/{telegramId}` — Telegram identity metadata and the user's Bezy dating profile.
- `users/{telegramId}/actions/{targetTelegramId}` — the current user's like, super-like or pass decision for a target.
- `matches/{sortedTelegramIdPair}` — a mutual like between two users.

The Mini App never receives Firestore credentials and never performs direct Firestore reads or writes.

## Current API boundary

- `POST /api/profile/me` — validate Telegram identity, create/load the Bezy account, and save the user's profile.
- `POST /api/discover` — return eligible profiles after excluding the current user's previous actions.
- `POST /api/swipe` — record pass/like/super and atomically create a match when interest is mutual; the Vercel function sends Telegram match notifications.
- `POST /api/matches` — return the current user's matches.
- `POST /api/telegram/webhook` — process localized bot commands and provide Mini App entry points.

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

## Premium boundary

Premium UI is present only as a placeholder at this stage. Telegram Stars integration is deliberately deferred until the core profile → discovery → like/pass → mutual match → Telegram conversation flow is stable and tested.

## Future Telegram Serverless evaluation

Telegram has been expanding its own bot/Mini App platform and there are reports of a Telegram-native serverless runtime. We should evaluate it separately before moving production workloads. For now, Vercel remains the stable backend boundary because it is already deployed and keeps Firebase billing disabled. Any migration should be treated as a deliberate architecture change after confirming public availability, runtime limits, database capabilities, secrets handling, observability and pricing.
