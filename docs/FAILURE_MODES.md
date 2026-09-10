# Bezy failure-mode catalogue (SC-6)

What happens when a dependency degrades, what the user sees, what the operator sees, and
what to do. The Mini App's degraded states are exercised deterministically by
`tests/e2e/degraded.spec.js` (route interception, no Firestore); the backend behaviours are
enforced by design and logged under the `[bezy-*]` prefixes below. Structured logging
conventions are the only observability Bezy has — by the no-analytics decision (ADR 0006,
roadmap SC-7).

| Dependency fails | User sees | Operator sees | Response |
| --- | --- | --- | --- |
| Firestore read quota exhausted (SC-2) | Requests fail with `DATABASE_UNAVAILABLE`; the Mini App shows "Bezy could not reach its database" and stays navigable | Vercel logs: handler 500s | Wait for the quota window; keep test suites off the shared project (one run per fresh quota day) |
| Firestore outage | Same as above | Handler catch logs | Failures are typed and generic — nothing leaks; restore when Firebase does |
| Telegram Bot API unreachable (notifications) | An action that should notify completes silently | `[bezy-notify] … delivery failed` — never a user error | Delivery failure is logged, not surfaced: the state change already committed. Retry is not automatic (no scheduler) |
| Locale files fail to load | The app renders the built-in English fallback catalogue (complete, generated from `locales/en.json`) | Browser console `[Bezy] Locale initialization failed` | Fix the static asset; run `npm run sync:fallback` if the catalogue drifted |
| The whole API is down (Vercel function failure) | Typed toast per error code; app stays navigable; account init degrades to the Profile view | Vercel function logs | See per-function catch blocks |
| `TELEGRAM_BOT_TOKEN` missing/rotated | Webhook returns 500; Telegram retries and eventually stops delivering | Vercel logs | Restore the env var; Telegram resumes delivery on the next non-200-free retry |
| Firestore composite index missing | `500` — `9 FAILED_PRECONDITION: The query requires an index` with the index-creation URL in the log (observed live on `/api/support`, 2026-09-10) | Vercel logs | Keep queries index-free: `where`-only or full scans with in-memory sorting — pinned for the support module by the contract suite |
| Webhook registered without the secret while Vercel has it | Every update rejected 401; **all** bot replies and callbacks stop (observed live 2026-09-10) | Vercel logs `Invalid webhook secret`; `getWebhookInfo.last_error_message` | Re-run `set-webhook.ps1` with `$env:TELEGRAM_WEBHOOK_SECRET` set to the Vercel value; the script now exits 3 when `last_error_message` is present |
| Webhook secret mismatch | Telegram updates rejected 401 | Vercel logs `Invalid webhook secret` | Set the same `TELEGRAM_WEBHOOK_SECRET` in Vercel and `setWebhook` (`docs/TELEGRAM_SETUP.md` §3) |
| Payment checkout failures | Buyer sees Telegram's own error message in their language (all seven cases localized) | `[bezy-payment] pre_checkout.rejected {reason}` | `docs/TELEGRAM_SETUP.md` §2b has the symptom→cause table |
| Support-request creation fails | The bot or Mini App shows the generic failure | `[bezy-support]` / handler logs | The counter transaction is atomic: a failed create leaves no partial request and no burned reference |
| Rate limiter counter read/write fails | Request proceeds (fail-open by design) | `[bezy-ratelimit] read/write failed` | Abuse mitigation must never be a new outage mode; entitlement and quotas are enforced separately and exactly |

**Never in any failure mode:** internal error text, stack traces, Firestore names, bot
tokens or other users' data reach the user. Every user-visible message comes from the locale
catalogues via stable machine error codes (API contract v1).
