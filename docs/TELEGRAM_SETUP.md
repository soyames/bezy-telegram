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

Do not put the Firebase service-account JSON or private key in GitHub.

## 3. Telegram webhook

After the Vercel deployment is live, set the bot webhook to:

`https://bezy-telegram.vercel.app/api/telegram/webhook`

If `TELEGRAM_WEBHOOK_SECRET` is configured, pass the same value as Telegram's `secret_token` when calling `setWebhook`.

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
