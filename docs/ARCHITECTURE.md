# Bezy architecture

## Product boundary

Bezy is a Telegram-native product. Telegram is the user-facing application, identity layer, notification channel and messaging environment. The Bezy Mini App is the rich UI and is opened from the Bezy bot inside Telegram.

## Runtime

- **Telegram Bot**: commands, onboarding, notifications and orchestration.
- **Telegram Mini App**: Discover, profiles, likes, matches, settings and premium UI.
- **Vercel**: static Mini App hosting plus serverless API routes for webhook handling, Telegram initData validation, business logic and Firestore access.
- **Firebase Cloud Firestore**: server-side persistent database only.
- **Telegram Stars**: future paid membership/digital goods inside Telegram.

## Explicit non-goals

- No separate Bezy mobile application.
- No separate Bezy login page.
- No Telegram Login Widget for the Mini App.
- No Firebase Authentication at this stage.
- No Firebase Cloud Functions.
- No Firebase Cloud Storage for profile photos at this stage.
- No Google Cloud Functions or other Google Cloud compute.
- No external payment page.

## Authentication

The Mini App receives Telegram `initData`. The Vercel backend validates the Telegram signature with the bot token before trusting user data. The Telegram Login Widget is not part of this architecture because it is intended for authorizing users on external websites; the Mini App already provides Telegram identity data directly.

## Firestore security

The browser/Mini App must not connect directly to Firestore. `firestore.rules` therefore denies all direct client reads and writes. Vercel uses the Firebase Admin SDK, which operates as a privileged server client and bypasses Firestore Security Rules. This is intentional: the API is the authorization boundary.

## Billing policy

The Bezy Firebase project is intended to remain on the Firebase Spark/no-billing setup during development. Do not enable Firebase/Google Cloud billing merely to deploy Bezy API routes: Vercel hosts the serverless functions. Do not add Firebase Cloud Functions or other Google Cloud compute without an explicit architecture decision.

## Localization

Telegram supplies a user's language code to Mini Apps. Bezy should default to English and provide French (`fr`) when the Telegram language is French. Localization catalogs live under `locales/`. The UI should use the same translation keys rather than duplicating screens for each language.

## Photos

The initial approach is to use the Telegram profile photo URL when Telegram makes it available. Bezy should not create a separate photo storage system until there is a clear product requirement and privacy/security review.

## Future Telegram Serverless evaluation

Telegram has been expanding its own bot/Mini App platform and there are reports of a Telegram-native serverless runtime. We should evaluate it separately before moving production workloads. For now, Vercel remains the stable backend boundary because it is already deployed and keeps Firebase billing disabled. Any migration should be treated as a deliberate architecture change after confirming public availability, runtime limits, database capabilities, secrets handling, observability and pricing.
