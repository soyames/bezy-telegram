# Bezy — security model

Factual description of the controls implemented in this repository. Every statement below
was verified in code and is covered by `tests/security.test.mjs` unless noted otherwise.

This document does not assert legal compliance. See `docs/DATA_PROCESSING_MAP.md` and
`docs/DPIA_ASSESSMENT.md` for the data-protection position and its open legal questions.

---

## 1. Identity model

Three different identifiers, deliberately not interchangeable:

| Identifier | Role | Mutable? |
| --- | --- | --- |
| **Telegram numeric user id** | Authoritative internal identity. Firestore document id, and the key for every relationship, payment and entitlement | No |
| **Telegram `@username`** | Public handle used to open a Telegram conversation | **Yes** — may change or be removed |
| **Bezy `displayName`** | Dating presentation, chosen by the user | Yes |

Rules enforced in code:

- The numeric id is the only thing ownership is ever based on, and it always comes from
  validated `initData`. **No endpoint accepts a user id from the request body.**
- `@username` is never a document id or an identity key. It is treated as a locator that may
  be absent; the Mini App handles a missing username without breaking.
- `firstName` is stored for a display fallback. `lastName` and `is_premium` are **not
  collected** — Bezy never displayed or used either.

## 2. Authentication

Telegram `initData` is validated in `api/_telegram.js`:

- HMAC-SHA256 over the sorted data-check string, keyed with `HMAC("WebAppData", botToken)`.
- Length check followed by `crypto.timingSafeEqual`.
- `auth_date` must be within 24 hours and not in the future.
- `initData` is validated in memory and is **never stored or logged**.

Rejected and tested: missing hash, invalid hash, empty string, a signature from a different
bot token, a user object altered after signing, an expired `auth_date`, a future `auth_date`.

### The 24-hour window — a deliberate trade-off

Telegram issues `initData` once when the Mini App opens and does not refresh it, so a captured
value stays replayable for the remainder of that window. Shortening it would break long
sessions for legitimate users, who would be logged out mid-use with no way to re-authenticate
without reopening the app.

The window is therefore retained, and the risk is reduced by what a replayed session can
actually *do* rather than by how long it lasts:

- per-user rate limits (§4) cap the damage rate of any stolen session;
- daily quotas cap the total volume of dating actions;
- every action is confined to the account the `initData` belongs to — a replay grants no
  access to anyone else's data;
- the destructive action (deletion) needs a typed confirmation as well.

## 3. Authorization

| Control | Where | Enforcement |
| --- | --- | --- |
| 18+ eligibility | profile, discover, swipe, relationship | Server-side; a client that skips the gate cannot complete a profile, load a deck or swipe |
| Premium entitlement | `api/_premium.js` | Single source of truth; expiry and revocation always evaluated, never trusted |
| Daily quotas | inside the swipe transaction | Cannot be raced or bypassed by ignoring the UI |
| Blocks | discover and swipe | Filtered in both directions |
| Refunds | `scripts/refund-payment.mjs` | No HTTP route exists; holding the credentials is the boundary |
| Moderation | `scripts/list-reports.mjs` | Same — no admin route, no console |

## 4. Rate limiting

`api/_ratelimit.js`. Fixed-window counters in `rateLimits/{telegramUserId}`, one document per
user. No external service.

These are distinct from the *product* quotas (30 discovery actions and 1 super like per day on
the free tier). Quotas make Premium meaningful; rate limits stop automation.

| Bucket | Limits |
| --- | --- |
| `swipe` | 40 / min, 600 / hour |
| `discover` | 60 / 5 min, 400 / hour |
| `profile_write` | 20 / 10 min (reads are never limited, so opening the app is never blocked) |
| `report` | 5 / hour, 15 / day |
| `block` | 40 / hour |
| `likes_view` | 60 / hour |
| `premium_invoice` | 10 / hour |
| `premium_status` | 120 / hour |
| `account_export` | 3 / hour |
| `account_delete` | 5 / hour |

Properties, all tested:

- Limits are **per user**, so one abusive account cannot lock anyone else out.
- Buckets are independent; exhausting one does not block another.
- A new window releases the limit with no scheduled job.
- Every bucket returns the identical `429 {"error":"RATE_LIMITED","retryAfter":n}` with a
  `Retry-After` header. The limit, the current count and the bucket name are never disclosed,
  so the configuration cannot be mapped by probing.
- **Fails open.** A counter that cannot be read allows the request; a rate limiter must not
  become a new outage mode, and every endpoint needs Firestore anyway.
- Counters are personal data (they record activity timing) and are **erased with the account**.

Read-then-write rather than a transaction: under heavy concurrency a few extra requests may
slip through. This is abuse mitigation, not an authorization boundary — entitlement, quotas
and the age gate are all enforced exactly.

## 5. User enumeration

For a dating service, "does this Telegram account use Bezy?" is itself sensitive. Two leaks
were found and fixed across the audits:

1. **Swipe** returned a distinguishable `404` for an unknown target. Now *no account*,
   *account but hidden*, *account but incomplete profile* and *blocked in either direction*
   all return a byte-identical response.
2. **Relationship actions** wrote a mirror document or a report under an arbitrary Telegram
   id. Acting on a stranger now returns the same response but writes nothing, so neither the
   response nor the database reveals whether the target exists.

Every other endpoint operates only on the caller's own records and takes no target parameter.

## 6. Contact-information disclosure

The Telegram `@username` is the real contact vector: with it, anyone can message a person
directly on Telegram.

`/api/discover` previously included it on every card. Anyone could read their own deck's API
response and message people who had never matched with them — bypassing the mutual consent
that the product exists to enforce.

The handle is now released **only by `/api/matches`**, after a mutual like. Discover cards
carry no username and no duplicated Telegram id. The card's `id` is the target's Telegram id
and is unavoidable, since the client must name who it is swiping on.

> Residual: `id` is a real Telegram numeric id. Replacing it with an opaque per-viewer handle
> would remove even that, at the cost of a mapping layer. Not implemented.

## 7. Database isolation

- `firestore.rules` denies all direct client access; the deployed ruleset was verified.
- Only the Vercel API touches Firestore, through the Admin SDK.
- The Mini App never receives Firebase credentials and never talks to Firestore.
- Credentials come from environment variables and are never written to the repository.

## 8. Webhook security

- Optional `TELEGRAM_WEBHOOK_SECRET` compared against `x-telegram-bot-api-secret-token`;
  a wrong secret is rejected with 401 (tested).
- `pre_checkout_query` re-derives plan, price, buyer and invoice from Firestore. Nothing in
  the update is trusted.
- `successful_payment` re-validates payload, buyer, currency and amount, then activates in a
  transaction keyed on `telegram_payment_charge_id`.
- `refunded_payment` revokes entitlement through the same idempotent path.
- Malformed, empty, oversized and unexpected update types are all acknowledged with 200 and
  change nothing (tested across eleven shapes). Telegram retries on non-200, so failures are
  logged and acknowledged rather than surfaced as errors.

## 9. Payment integrity

Plan, price and payload are always derived on the server. Client-supplied `stars`,
`priceStars`, `amount` and `telegramUserId` are ignored (tested). A payment whose payload
belongs to another user is refused. Premium cannot be activated, extended or self-assigned
through any client-facing route, including by setting `bezyPremium` or `isPremiumTelegram` on
the profile endpoint.

## 10. Input handling and output safety

- Text fields are trimmed and length-capped: `displayName` 60, `city` 80, `bio` 500,
  interests 12 × 32, report details 1000.
- `gender`, `seeking` and report reasons are allow-listed; anything else is normalised.
- Age is clamped to 18–100; filter ranges are clamped and ordered.
- Firestore is a document store accessed through the Admin SDK with parameterised paths;
  there is no query language to inject into.
- The Mini App escapes every interpolation into HTML. All attributes are quoted.
- Errors return stable machine codes. No stack trace, database text or internal message ever
  reaches a client (tested).

## 11. Logging

Logged: error objects, and `[bezy-payment]` / `[bezy-privacy]` / `[bezy-ratelimit]` lines
containing Telegram ids, plan ids, amounts, currency and outcome.

Never logged: bot token, Firebase private key, service-account credentials, raw `initData`,
profile content, or message content.

## 12. Client-side privacy

No cookies. No analytics, telemetry, pixels or advertising identifiers. No third-party SDK
other than Telegram's own `telegram-web-app.js`. One `localStorage` key, `bezy-language`,
holding the chosen UI language — functional, not tracking. One runtime dependency
(`firebase-admin`).

## 13. Deletion

`api/account.js` erases the profile, actions, likes received, blocks, their mirrors on other
accounts and the rate-limit counters, and ends every match. Idempotent, and guarded by a typed
confirmation. Retained: payment records (accounting) and reports filed by others (so a user
cannot erase the record of their own conduct). Both are disclosed to the user before they
confirm.

## 14. Incident response

No DPO is appointed and no formal incident-response team exists. The practical procedure:

1. **Detect** — Vercel logs (`[bezy-payment]`, `[bezy-privacy]`, `[bezy-ratelimit]`, errors)
   and Firestore usage in the Firebase console.
2. **Contain** — rotate `TELEGRAM_BOT_TOKEN` in BotFather and Vercel; rotate the Firebase
   service account; set `discoverable: false` on affected accounts; re-run `setWebhook`.
3. **Assess** — which categories, how many people, what harm. `DATA_PROCESSING_MAP.md` §1 is
   the inventory to work from.
4. **Decide on notification** — GDPR sets a 72-hour assessment expectation for notifiable
   breaches. **LEGAL REVIEW REQUIRED**: the competent supervisory authority has not been
   determined, and that question is open because the controller is established in Benin while
   serving EU users.
5. **Record** — what happened, when, what was done.

Contact for any report: `contacts@digitalconcordia.com`.

## 15. Known residual risks

| Risk | Status |
| --- | --- |
| 24-hour `initData` replay window | Accepted; mitigated by rate limits and quotas (§2) |
| Deck `id` is a real Telegram numeric id | Accepted; opaque ids not implemented (§6) |
| No automated retention or dormant-account expiry | **Not implemented** |
| No penetration test | Not performed |
| Rate limiter fails open | Deliberate (§4) |
| Under-18 declaration is session-only client-side | Backend enforcement is the real control |
| No automated content moderation | Human review via `scripts/list-reports.mjs`; no response time is promised |
