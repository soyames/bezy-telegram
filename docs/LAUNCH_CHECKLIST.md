# Bezy launch checklist

The operational runbook behind the four launch gates in
`docs/BEZY_MASTER_ROADMAP.md` §16. Each gate lists concrete steps and the evidence that
counts. Nothing here adds a new requirement — it operationalises what the roadmap already
gates on. Procedures are referenced, not duplicated.

**Ground rules**

- Never run a Firestore-backed suite twice on the same day: development tests and the live
  app share the Spark daily read quota (roadmap SC-2). One green run per fresh quota day is
  the discipline; the suites clean their own synthetic `9000000xx` data before and after.
- Test suites need `BEZY_SERVICE_ACCOUNT`; the smoke suite is read-only and unauthenticated.
- Production data: 1 real user, 2 real invoices, 1 rate-limit record (as last reconciled).
  Never mutate real records.
- Billing stays disabled. Raising the quota is not an available answer.

---

## L-1 — Internal testing (🟢 READY)

Owner walks the whole product on the live bot before anyone else is invited.

| # | Step | Command / where | Evidence |
| --- | --- | --- | --- |
| 1.1 | Latest code deployed | Vercel → Deployments | newest commit **Ready** |
| 1.2 | Webhook healthy **and** `allowed_updates` includes `pre_checkout_query` (P0-4) | `.\scripts\set-webhook.ps1 -VerifyOnly` | prints **READY** |
| 1.3 | Vercel env points at `bezydating` | `docs/TELEGRAM_SETUP.md` §2c | `verify-env.mjs` passes |
| 1.4 | Backend suite (fresh quota day) | `BEZY_SERVICE_ACCOUNT=<path> node tests/backend.test.mjs` | 0 failed |
| 1.5 | Security suite | `BEZY_SERVICE_ACCOUNT=<path> node tests/security.test.mjs` | 0 failed |
| 1.6 | Playwright suite | `BEZY_SERVICE_ACCOUNT=<path> npx playwright test` | 0 failed |
| 1.7 | Localization suite | `node tests/localization.test.mjs` | 0 failed |
| 1.8 | Production smoke | `npm run test:smoke` | 0 failed; drift reported informationally |
| 1.9 | First-user flow on a second, real Telegram account | `docs/TELEGRAM_SETUP.md` §5 | profile → discover → like → match → bot notification → Telegram conversation |
| 1.10 | Data-subject rights by hand | Profile → Safety & privacy | export downloads; pause and objection pause the deck and confirm in the bot chat; withdrawal does not republish; deletion confirms and removes the account |
| 1.11 | Legal pages on the live domain | `/privacy`, `/terms`, both languages | operator identity (DIGITAL CONCORDIA), rights, support address all correct |
| 1.12 | Outside-Telegram gate | open `https://bezy-telegram.vercel.app/` in a plain browser | logo shows, the button links `https://t.me/BezyDatingBot` |
| 1.13 | Real Telegram WebView, both platforms (Q-7) | open `@BezyDatingBot` on an iOS device and an Android device, launch the Mini App | profile → discover → like → match → bot notification, on both OSes — the one surface Playwright cannot cover, done by hand |

## L-2 — Small controlled pilot (🟡 READY WITH CAVEATS)

Blocked caveats first: **P0-1…P0-3** (a real Stars purchase and refund) must clear before
Premium is piloted. Pilot users must be told this is an early service.

| # | Step | Command / where | Evidence |
| --- | --- | --- | --- |
| 2.1 | Real Stars purchase, refund and revocation | `docs/TELEGRAM_SETUP.md` §2b, steps 1–20 | every step logged as described; P0-1…P0-3 marked clear in the roadmap |
| 2.2 | Invite a small cohort; state the service is early | bot `/start` | cohort exists |
| 2.3 | Reminder discipline: dry-run first | `npm run reminders` | eligible list looks right; `--apply` only when intended |
| 2.4 | Retention discipline: dry-run first | `npm run retention` | nothing removed by accident; `--apply` only when intended |
| 2.5 | Report review cadence | `scripts/list-reports.mjs` | reports triaged; SF-1 tooling suffices at this volume |
| 2.6 | Quota watch | Firestore console | test days never exhausted the shared quota (SC-2) |

## L-3 — Public launch (🔴 NOT READY)

Nothing below can be checked off by engineering.

| # | Gate | Roadmap item |
| --- | --- | --- |
| 3.1 | Legal review of `gender`/`seeking` under Art. 9 (decides `relationshipIntent` and RT-4) | P0-5 |
| 3.2 | Completed DPIA (not the screening) | P0-11 |
| 3.3 | Qualified review of Terms and Privacy | P0-13 |
| 3.4 | EU withdrawal-right / immediate-performance decision | CN-5 |
| 3.5 | Retention periods for payments and reports set by the operator after legal advice, then wired via env vars (`BEZY_RETENTION_PAYMENT_DAYS`, `BEZY_RETENTION_REPORT_DAYS`) and the retention run scheduled as an operator task | T1 |

## L-4 — Large-scale campaign (~60k) (🔴 NOT READY)

| # | Gate | Roadmap item |
| --- | --- | --- |
| 4.1 | External penetration / security review | T2 |
| 4.2 | Vercel behaviour under load | SC-1 |
| 4.3 | Firestore behaviour under load — including the shared-quota consequence of SC-2; a separate test project or emulator is the proper fix before campaign scale | SC-2 |
| 4.4 | Discovery query scalability | SC-3 |
| 4.5 | Payment webhook reliability under load | SC-5 |
| 4.6 | Production smoke suite green on the campaign build | Q-6 |

---

## Ongoing operations (any stage)

- **Tests:** one green full run per fresh quota day, never iterative retries against
  production data.
- **Reminders:** dry-run `npm run reminders` whenever run; `--apply` is a deliberate send.
- **Retention:** dry-run `npm run retention`; `--apply` only after the L-3 legal periods are
  configured.
- **Reports:** `scripts/list-reports.mjs` reviewed on a set cadence — triage is
  `--resolve`/`--dismiss` with a note; `npm run reports` shows the reason/status/day
  distributions that justify category tuning (SF-3).
- **Rate limits (T4):** watch `[bezy-ratelimit] limit_reached` log lines and inspect
  `npm run rate-limits` before tuning. Tune `RATE_LIMITS` from real traffic only — the
  current values are estimates designed to stop automation, not humans; lower never,
  loosen only with trip evidence.
- **Never claim** "GDPR compliant", age verification, or identity verification anywhere in
  copy (roadmap §16).
