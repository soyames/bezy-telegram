# Bezy Telegram setup

## 1. Main Mini App

Configure in @BotFather:

- Main Mini App URL: `https://bezy-telegram.vercel.app/`
- Launch mode: Fullscreen
- Menu button: `Bezy` → the same Mini App URL

The Main Mini App is the primary Bezy UI. No Telegram Login Widget is required.

## 2. Vercel environment variables

The deployed Vercel project must have these variables in the **Production** environment:

- `TELEGRAM_BOT_TOKEN`
- `BEZY_MINI_APP_URL=https://bezy-telegram.vercel.app`
- `FIREBASE_PROJECT_ID=bezydating`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Optional:

- `TELEGRAM_WEBHOOK_SECRET` — a random secret used to verify the webhook header.
- `BEZY_PREMIUM_STARS_MONTHLY`, `BEZY_PREMIUM_STARS_QUARTERLY`, `BEZY_PREMIUM_STARS_YEARLY` —
  override the default Stars prices (250 / 600 / 1900). Prices are backend-authoritative; the
  Mini App only displays what the API returns.

No payment-provider token is needed. Telegram Stars require an **empty** `provider_token`, so
Bezy Premium adds no payment secrets.

Do not put the Firebase service-account JSON or private key in GitHub.

## 2b. Testing Bezy Premium

Automated tests run against the real Firestore project with synthetic Telegram IDs `9000000xx`,
which are deleted before and after each run. The Telegram Bot API is stubbed, so no live bot,
no real Stars and no production data are involved.

```bash
BEZY_SERVICE_ACCOUNT=/path/to/service-account.json npm test
BEZY_SERVICE_ACCOUNT=/path/to/service-account.json npm run test:e2e
```

### Verifying a real Stars payment

The automated suite proves the server logic — signature validation, price and plan derivation,
pre-checkout rejection, idempotency, renewal and entitlement. It does **not** prove that
Telegram's live Stars rail works end to end, because that requires a real bot, a real Telegram
client and a real Stars balance.

#### Before you start

| Requirement | How to confirm |
| --- | --- |
| Latest code deployed to Vercel | Vercel → Deployments → the newest commit is **Ready** |
| Webhook allows `pre_checkout_query` | `.\scripts\set-webhook.ps1 -VerifyOnly` prints **READY** |
| Vercel env points at `bezydating` | See "Verifying the Vercel environment" below |
| Stars balance on the test account | Telegram → Settings → My Stars (top up via @PremiumBot) |

Use a **second Telegram account** as the buyer, not the bot owner account, so the flow matches
what a real user experiences.

#### Procedure

1. **Open Bezy.** In Telegram, open the Bezy bot and send `/start`. Tap **Open Bezy**.
2. **Create the account.** The Mini App opens on Profile for a new user. Fill in display name,
   age (18+), city, gender and "looking for", tick *Show my profile in Discover*, then **Save
   profile**. The app should switch to Discover with real counts.
3. **Open Premium.** Tap **View membership** on the Discover card, or send `/premium` and tap
   **View Premium**. Confirm three plans render with Stars prices (250 / 600 / 1900 ⭐).
4. **Select a plan.** Tap **Monthly** — the card gets a purple border. Use monthly for the test;
   it is the cheapest to refund.
5. **Create the invoice.** Tap **Subscribe with Telegram Stars**. The button shows
   *Preparing checkout…* while `POST /api/premium {action:"invoice"}` runs.
   → Vercel log: none yet (invoice creation is not logged as a payment event).
   → Firestore: a new `bezyInvoices/{nonce}` document with `status: "pending"`.
6. **Telegram payment UI opens.** The native Stars sheet appears showing
   *Bezy Premium · Monthly* and the Star price. **The price shown must equal the price in the
   Mini App.** If it differs, stop — the invoice was not built from server config.
7. **Pay.** Confirm the payment in Telegram.
8. **`pre_checkout_query` arrives.**
   → Vercel log: `[bezy-payment] pre_checkout.approved {"telegramUserId":…,"planId":"monthly",
   "expectedStars":250,"receivedAmount":250,"currency":"XTR"}`
9. **Backend answers within 10s.** If the log shows `pre_checkout.rejected`, the `reason` field
   names the exact check that failed (`invalid`, `plan`, `account`, `currency`, `price`,
   `expired`, `unverified`).
10. **`successful_payment` arrives.**
11. **Backend processes it.**
    → Vercel log: `[bezy-payment] successful_payment.activated {…,"chargeId":"…",
    "idempotent":false,"expiresAt":"…"}`
12. **Payment record created.** Firestore → `bezyPayments/{telegram_payment_charge_id}` with
    `status: "processed"`, the Stars amount, `currency: "XTR"` and `membershipExpiresAt`.
    The document **id** is the charge id — that is the idempotency key.
13. **Membership activated.** Firestore → `users/{telegramId}.bezyPremium` with `active: true`,
    `planId: "monthly"`, `expiresAt` ≈ one month out, `source: "telegram_stars"` and
    `telegramPaymentChargeId`. `bezyInvoices/{nonce}.status` flips to `"paid"`.
14. **Mini App refreshes.** The app polls `/api/premium` after the sheet closes and switches to
    the membership card showing the plan, the localized expiry date and days remaining.
    It must never show Premium before step 13 completes.
15. **Premium features unlock.** *Who liked you* lists real profiles instead of the padlock;
    Filters apply city / same-city; the daily discovery limit no longer blocks swiping.
16. **Telegram confirmation.** The bot sends *"💎 Bezy Premium is now active!"* with an
    **Open Bezy** button, in the buyer's language.

#### Then verify idempotency and clean up

17. In Vercel, replay the `successful_payment` request (Logs → the request → Replay). The log
    must read `successful_payment.duplicate_ignored` with `"idempotent":true`, `bezyPayments`
    must still hold one document, and `expiresAt` must be unchanged.
18. Refund the test purchase so the Stars return to the buyer:

```powershell
$env:TELEGRAM_BOT_TOKEN = "..."   # your shell only
$body = @{ user_id = <buyer telegram id>; telegram_payment_charge_id = "<charge id>" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$env:TELEGRAM_BOT_TOKEN/refundStarPayment" -ContentType "application/json" -Body $body
```

A refund does **not** revoke the membership. Delete `users/{id}.bezyPremium` and
`bezyPayments/{charge_id}` manually after a test purchase. (Automatic revocation on refund is
not implemented — see the limitations in the architecture doc.)

#### If the payment fails

| Symptom | Where to look | Likely cause |
| --- | --- | --- |
| Payment sheet never opens | Mini App shows *We couldn't start the payment* | `createInvoiceLink` failed — check `TELEGRAM_BOT_TOKEN` in Vercel |
| Sheet opens, then "payment timed out" | No `pre_checkout.*` line in Vercel logs | `allowed_updates` is missing `pre_checkout_query` — the most common cause |
| `pre_checkout.rejected` with `reason:"price"` | Log `expectedStars` vs `receivedAmount` | The invoice was created before a price change; reopen Premium |
| `pre_checkout.rejected` with `reason:"expired"` | `bezyInvoices/{nonce}` missing | Invoice created against a different Firebase project — check `FIREBASE_PROJECT_ID` |
| `pre_checkout.rejected` with `reason:"account"` | — | The buyer is not the account that opened the Mini App |
| Stars charged but no membership | No `successful_payment.*` line | Webhook returned non-200, or `TELEGRAM_WEBHOOK_SECRET` mismatches between Vercel and `setWebhook` (returns 401) |
| Mini App stuck on *Your payment is being processed* | Firestore membership | Activation failed after payment — inspect the `successful_payment.rejected` `reason` |
| All webhook calls 401 | Vercel logs | `TELEGRAM_WEBHOOK_SECRET` set in Vercel but not passed to `setWebhook` |

Payment logs are prefixed `[bezy-payment]` and contain no token, key, initData or profile data.

## 2c. Verifying the Vercel environment

This cannot be checked from the repository — the values live in the Vercel project. To confirm
they point at `bezydating` without printing secrets:

```bash
npm i -g vercel && vercel login && vercel link
vercel env pull .env.production.local --environment=production
node scripts/verify-env.mjs .env.production.local
```

`.env*` is git-ignored. The checker prints only pass/fail per variable, never a value.

## 3. Telegram webhook

After the Vercel deployment is live, set the bot webhook to:

`https://bezy-telegram.vercel.app/api/telegram/webhook`

If `TELEGRAM_WEBHOOK_SECRET` is configured, pass the same value as Telegram's `secret_token` when calling `setWebhook`.

### Required for Telegram Stars: `allowed_updates`

**Payments will silently never activate if this is wrong.** `allowed_updates` defaults to a list
that excludes `pre_checkout_query`, and an earlier `setWebhook` on this bot was called with
`allowed_updates = ["message"]`. With that setting Telegram delivers `successful_payment`
(which arrives inside a `message`) but never delivers `pre_checkout_query`, so checkout times
out after 10 seconds and the user is refunded.

The webhook must be registered for both:

```powershell
$token = "YOUR_BOT_TOKEN"
$body = @{
    url             = "https://bezy-telegram.vercel.app/api/telegram/webhook"
    allowed_updates = @("message", "pre_checkout_query")
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$token/setWebhook" -ContentType "application/json" -Body $body
```

Verify with `getWebhookInfo`: `allowed_updates` must list `pre_checkout_query`.

Example from a local PowerShell session (keep the token private):

```powershell
$token = "YOUR_BOT_TOKEN"
Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$token/setWebhook" -ContentType "application/json" -Body (@{ url = "https://bezy-telegram.vercel.app/api/telegram/webhook" } | ConvertTo-Json)
```

With a webhook secret:

```powershell
$token = "YOUR_BOT_TOKEN"
$secret = "YOUR_WEBHOOK_SECRET"
Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$token/setWebhook" -ContentType "application/json" -Body (@{ url = "https://bezy-telegram.vercel.app/api/telegram/webhook"; secret_token = $secret } | ConvertTo-Json)
```

## 4. Commands

The first `/start` or `/demarrer` automatically registers localized private-chat command lists through the Bot API.

English:

- `/start`
- `/help`
- `/profile`
- `/discover`
- `/matches`
- `/premium`
- `/settings`

French:

- `/demarrer`
- `/aide`
- `/profil`
- `/decouvrir`
- `/matchs`
- `/premium`
- `/parametres`

Telegram command names are limited to lowercase English letters, digits and underscores, so French commands use ASCII spellings.

## 5. First-user flow

```text
Telegram
  ↓
Bezy bot / Main Mini App
  ↓
Telegram initData
  ↓
Vercel validates signature
  ↓
Firestore creates/loads users/{telegramId}
  ↓
User completes Bezy profile
  ↓
Discover
  ↓
Like / Super / Pass
  ↓
Mutual like → matches/{pair}
  ↓
Telegram match notification
  ↓
Open Telegram conversation
```

## 6. Billing boundary

Do not enable Firebase or Google Cloud billing for this architecture. Vercel runs the application API routes. Firestore remains the server-side database. Firebase Cloud Functions are not used.
