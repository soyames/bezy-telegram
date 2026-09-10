# Bezy — Master Roadmap

**This file is the authoritative execution state for Bezy.** Read it before starting work;
update it after. It is never replaced, only amended. A new idea *adds* to this document — it
does not erase anything already in it.

- **Last reconciled:** commit `30ef891` plus uncommitted execution work (see §0).
- **Reconciliation method:** every status was checked against the repository. Where the
  owner's understanding and the code disagreed, the code won and the difference is recorded
  in §4. Nothing is marked complete because it was mentioned in conversation.
- **Coverage:** §2 maps all 24 defined workstreams to their tracking section. If a workstream
  has no section, the roadmap is incomplete and §2 will show it.

## Status legend

| | Meaning |
| --- | --- |
| 🟢 COMPLETE | Every applicable layer in the Definition of Done is satisfied |
| 🔵 READY | Specified and unblocked; not started |
| 🟠 IN PROGRESS | Actively being built |
| 🟡 PARTIALLY COMPLETE | Some layers done. **Not** complete |
| 🔴 BLOCKED | Cannot proceed until a dependency clears |
| ⚪ DEFERRED | Deliberately not now. **Not** deleted |

### Definition of Done

backend · frontend · Telegram integration · database · authorization · security · privacy ·
localization EN · localization FR · tests · regression · documentation · production
verification (where required).

Code existing is not done. Tests passing is not done if localization or production
verification is required and missing.

---

## 0. Checkpoint status

🟢 **Working tree clean at `f448c65`** (`chore: record post-commit checkpoint state in the
roadmap`). Commit is **local only — not pushed**.

This section always records unsaved or unpushed state, because that is what disappears
between sessions. When work is left uncommitted, list the files and what they contain here
before ending the session.

| State | Detail |
| --- | --- |
| Uncommitted | Documentation-only: the environment-block session-log note (§20) and §19/§0 consistency corrections (verified counts, awaiting-verification list, checkpoint name) |
| Unverified | N-1, N-2, N-3, N-4, RT-2, RT-3, PR-8, the CN-7 support flow and the P1-3 `languages` tests are written but have never been executed (Firestore quota). §19 lists the three commands that must be green before any is marked 🟢 |
| Unpushed | `main` is 5 commits ahead of `origin/main` |

---

## 1. Permanent architecture decisions

Not revisitable without an explicit owner decision. Any request that conflicts with these
must stop and be reported rather than implemented. See §18 for known conflicts.

- Telegram-native: Telegram owns identity, notifications, messaging and platform safety.
  Bezy owns profiles, discovery, matching, dating-specific safety, Premium and data controls.
- Backend **Vercel**, database **Firestore**, auth **Telegram `initData`**.
- Payments: **Telegram Stars (XTR) only.** No Smart Glocal, no cards, no other provider.
- Photos: **Telegram photo URLs only.** No Firebase Storage, Cloudinary, S3, Vercel Blob or
  any Bezy-owned image storage. A feature needing persistent image storage must **stop and be
  reported**.
- Bot username **`@BezyDatingBot`** — must not be changed.
- No analytics, tracking or unnecessary cookies.
- Identity: Telegram numeric id is canonical and the only basis for ownership; `@username` is
  a mutable public locator, never a key; `displayName` is presentation.
- Localization is presentation only. Never translate API paths, URLs, Telegram links, JSON
  keys, Firestore collections/fields, error codes, environment variables, JS identifiers,
  Telegram Bot API methods, or machine tokens such as `DELETE`.

---

## 2. Workstream coverage index

Every defined workstream maps to a tracking section. This table is the audit surface: if a
workstream has no home, it is missing and must be added before work begins.

| # | Workstream | Tracked in | Overall |
| --- | --- | --- | --- |
| WS1 | Telegram foundation | §3 C1–C8, §5 P0-4 | 🟡 |
| WS2 | Profile | §3 C4, §7 P1-1, P1-2 | 🟢 |
| WS3 | Discovery | §3 C5, C6, C13, C15, §7 P1-3, P1-6 | 🟡 |
| WS4 | Matching | §3 C7, C14, §7 P1-4, P1-5 | 🟢 |
| WS5 | Relationship / safety | §3 C12, §8 SF-1…SF-6 | 🟡 |
| WS6 | Account / user rights | §3 C10, C11, §6 T1, §9 RT-1…RT-4 | 🟡 |
| WS7 | GDPR / privacy | §5 P0-5…P0-11, §3 C22 | 🔴 |
| WS8 | Age / adult safety | §3 C9, §5 P0-10 | 🟡 |
| WS9 | Security | §3 C2, C13, C15, C16, C21, §6 T2, T4 | 🟡 |
| WS10 | Localization | §3 C20, §6 T5 | 🟢 |
| WS11 | Photo / media | §3 C17 | 🟢 |
| WS12 | Premium / monetization | §4 R1–R3, §5 P0-1…P0-3, §10 PR-1…PR-8 | 🟡 |
| WS13 | Consumer / commercial | §11 CN-1…CN-7 | 🔴 |
| WS14 | Notifications | §7 P1-7, §9 N-1…N-4 | 🟡 |
| WS15 | Match quality | §7 P1-6, §10 backlog | 🟡 |
| WS16 | AI | §17 AI-1…AI-2 | ⚪ |
| WS17 | Verification | §17 V-1 | ⚪ |
| WS18 | Dating experiences | §17 EX-1 | ⚪ |
| WS19 | Business / ecosystem | §17 BZ-1 | ⚪ |
| WS20 | Growth / acquisition | §14 G-1…G-7 | 🔵 |
| WS21 | Scale / infrastructure | §12 SC-1…SC-7 | 🔵 |
| WS22 | Quality / regression | §13 Q-1…Q-8 | 🟢 |
| WS23 | Documentation / governance | §15 D-1…D-4 | 🟢 |
| WS24 | Launch | §16 L-1…L-4 | 🔴 |

---

## 3. Completed work (verified in code)

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| C1 | Telegram-native architecture, `@BezyDatingBot` | 🟢 | `docs/ARCHITECTURE.md`; username unchanged |
| C2 | `initData` validation (HMAC, timing-safe, 24h window) | 🟢 | `api/_telegram.js`; security suite |
| C3 | Mini App shell, navigation, EN/FR | 🟢 | `index.html`, `app.js`; Playwright |
| C4 | Profile create / edit / discoverability / validation | 🟢 | `api/profile/me.js` |
| C5 | Discovery, deterministic compatibility, real stats | 🟢 | `api/discover.js` |
| C6 | Like / Pass / Super Like, daily quotas | 🟢 | `api/swipe.js` |
| C7 | Mutual matching + Telegram conversation handoff | 🟢 | `api/swipe.js`, `api/matches.js` |
| C8 | Localized bot commands + webhook | 🟢 | `api/telegram/webhook.js` |
| C9 | 18+ self-declaration, server-enforced, never "verified" | 🟢 | profile / discover / swipe / relationship |
| C10 | Account export (Art. 15/20) | 🟢 | `api/account.js` |
| C11 | Account deletion (Art. 17) incl. mirror cleanup | 🟢 | `api/account.js`; backend + Playwright |
| C12 | Block / Report / Unmatch, server-enforced | 🟢 | `api/relationship.js`; `scripts/list-reports.mjs` |
| C13 | User-enumeration protections | 🟢 | swipe + relationship return identical responses |
| C14 | Username disclosure boundary (released only on mutual match) | 🟢 | `api/discover.js` vs `api/matches.js` |
| C15 | Rate limiting, per-user, fail-open, erased on deletion | 🟢 | `api/_ratelimit.js` |
| C16 | Firestore deny-all client rules | 🟢 | `firestore.rules`, deployed |
| C17 | Telegram-only photo architecture | 🟢 | No upload/blob/base64/bucket/CDN path; regression-locked |
| C18 | Data minimisation (`lastName`, `isPremiumTelegram` dropped) | 🟢 | `api/profile/me.js`; security suite |
| C19 | Bezy Premium ≠ Telegram Premium, enforced and stated | 🟢 | `api/_premium.js`; UI + `/premium` copy |
| C20 | EN/FR localization + integrity tests | 🟢 | `tests/localization.test.mjs` (94 checks) |
| C21 | Security documentation | 🟢 | `docs/SECURITY.md` |
| C22 | Data-processing map | 🟢 | `docs/DATA_PROCESSING_MAP.md` |

---

## 4. Reconciliation — demoted from "complete"

Correctly built and tested, but missing a Definition-of-Done layer. Recording these honestly
is the point of the control system.

| # | Item | Actual | Missing layer |
| --- | --- | --- | --- |
| R1 | Telegram Stars invoice generation | 🟡 | Production verification. Verified live only to the payment sheet opening with the server-derived price |
| R2 | Premium entitlement architecture | 🟡 | The **paid** path has never run end to end in production |
| R3 | Refund lifecycle | 🟡 | No real `refundStarPayment` has been issued |
| R4 | DPIA assessment | 🟡 | `docs/DPIA_ASSESSMENT.md` is a **screening**, not a DPIA, and says so itself |

---

## 5. P0 — launch blockers

### 5.1 Production payment verification

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| P0-1 | Real Telegram Stars purchase (250 ⭐ monthly) | 🔴 BLOCKED | Blocked on a Stars balance; observed balance was 0 |
| P0-2 | Real Telegram Stars refund | 🔴 BLOCKED | Depends on P0-1. `scripts/refund-payment.mjs` |
| P0-3 | Full lifecycle verification in production | 🔴 BLOCKED | Depends on P0-1/P0-2. Procedure: `docs/TELEGRAM_SETUP.md` §2b |
| P0-4 | Re-confirm `allowed_updates` before the test | 🔵 READY | Must include `pre_checkout_query`. `scripts/set-webhook.ps1 -VerifyOnly` |

Clearing P0-1 promotes R1–R3 and removes the largest technical unknown in the project.

### 5.2 Legal review — not answerable by engineering

| # | Question | Status |
| --- | --- | --- |
| P0-5 | Art. 9 treatment of `gender` + `seeking` | 🔴 LEGAL REVIEW REQUIRED |
| P0-6 | Art. 27 EU representative (Benin controller, EU users) | 🔴 LEGAL REVIEW REQUIRED |
| P0-7 | Processor / DPA / transfer mechanisms (Telegram, Google, Vercel) | 🔴 LEGAL REVIEW REQUIRED |
| P0-8 | Payment and report retention periods | 🔴 LEGAL REVIEW REQUIRED |
| P0-9 | Competent supervisory authority | 🔴 LEGAL REVIEW REQUIRED |
| P0-10 | Legal sufficiency of 18+ self-declaration for an adult service | 🔴 LEGAL REVIEW REQUIRED |
| P0-11 | Completed DPIA (see R4) | 🔴 LEGAL REVIEW REQUIRED |

**P0-5 gates P1-3 and P1-6.** Expanding sensitive signals before it resolves widens the exact
exposure under review.

### 5.3 Legal content

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| P0-12 | Operator identity in legal pages | 🟢 COMPLETE | DIGITAL CONCORDIA, RB/ABC/21 A 28773, Abomey-Calavi, EN + FR |
| P0-13 | Qualified legal review of Terms and Privacy | 🔴 LEGAL REVIEW REQUIRED | Drafted, not reviewed |

---

## 6. Technical hardening

| # | Item | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| T1 | Retention enforcement framework | P0 | 🟡 PARTIAL | **Mechanism implemented**: `api/_retention.js` + `scripts/retention.mjs`, dry-run by default, 15 tests. Operational periods have defaults; payment and report periods are deliberately unset pending P0-8. **No scheduler** — runs are operator-invoked |
| T2 | Penetration / external security review | P0 | 🔵 READY | Never performed |
| T3 | Load and production-scale testing | P0 | 🔵 READY | See §12; required before any large campaign |
| T4 | Abuse / rate-limit tuning from real traffic | P3 | 🟡 PARTIAL | Instrumentation complete: every `RATE_LIMITED` trip is logged (`[bezy-ratelimit] limit_reached` — bucket, id, wait; counts only), `scripts/rate-limit-status.mjs` (`npm run rate-limits`) shows live windows per bucket, and the launch checklist documents the tuning procedure (lower never, loosen only with trip evidence). Final tuning requires real traffic by definition |
| T5 | Remove dead locale keys | P4 | 🟢 COMPLETE | `premium_soon`, `people_nearby`, `adults_only` removed; `premium_expired` was not dead but unwired — now drives a lapsed-membership notice. Guarded by a test so they cannot return |
| T7 | Hardcoded English in runtime-populated markup | P4 | 🟢 COMPLETE | Eight elements shipped English that JS replaces, causing a flash for French users; `people-label` still shipped the deleted string "people nearby". Now empty in markup, localized at runtime, guarded by a test |
| T6 | Opaque per-viewer profile ids | P4 | ⚪ DEFERRED | Deck `id` is a real Telegram numeric id. Accepted; `docs/SECURITY.md` §6 |

---

## 7. P1 — core dating experience

Four of the seven are now shipped end to end (backend + UI + EN/FR + tests). The remaining
three are blocked or partial for the reasons given below.

| # | Item | Status | Dependencies / notes |
| --- | --- | --- | --- |
| P1-1 | Profile prompts | 🟢 COMPLETE | Five prompts, up to three answers of ≤200 chars. Ids are machine tokens (`api/profile/me.js` `PROMPT_IDS`); question text lives in `prompt_<id>` in both catalogues, so one stored answer renders in the reader's language. Optional — never affects `profileComplete`. Published on the deck card and the match card |
| P1-2 | Profile preview ("how others see me") | 🟢 COMPLETE | `openPreview()` renders the same `profileCardHtml()` the deck uses, from the form's current values. No swipe controls, no `username`, no `telegramId`. Incomplete profiles get `preview_incomplete` instead of an empty card |
| P1-3 | Expanded discovery filters | 🟡 PARTIAL | Age/city/same-city exist and are Premium-gated. `languages` 🟢 implemented: profile chips, a free (non-Premium) discovery filter, a compatibility term, EN/FR, tests in all suites. **`relationshipIntent` 🔴 BLOCKED on P0-5** — the last remaining sub-item |
| P1-4 | Why you matched | 🟢 COMPLETE | `sharedSignals()` in `api/matches.js` returns `interests`/`city`/`age` tokens plus values the counterpart already published. Attached to matches only, so it is unreachable before mutual consent. `gender`/`seeking` deliberately excluded — see §18 |
| P1-5 | Conversation starters | 🟢 COMPLETE | Derived in the client from the same `sharedSignals`, so explanation and suggestion cannot disagree. Suggestion + copy only; the conversation still happens in Telegram. Reachable from Matches and Messages |
| P1-6 | Compatibility / ranking improvements | 🟡 PARTIAL | Deterministic scoring + Premium boost exist and are documented. Sensitive signals blocked on P0-5 |
| P1-7 | Improved Telegram notifications | 🟠 IN PROGRESS | Match and Premium-activation notifications exist and are localized; every §9 notification item (N-1…N-4) is now implemented, so the substance is complete — verification pending the fresh-quota suite run |

---

## 8. Safety & moderation — beyond what exists

Bezy handles Bezy-level dating safety. **Telegram-level messaging safety is Telegram's and
must not be duplicated.**

| # | Item | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| SF-1 | Moderation review tooling | P3 | 🟡 PARTIAL | `scripts/list-reports.mjs` gives visibility and resolve. No queue, no dashboard — deliberate |
| SF-2 | Moderation queue / triage workflow | P3 | 🟢 COMPLETE | The credential-gated workflow now has a defined lifecycle — open → resolved/dismissed — in `api/_moderation.js`, one module shared by the script and the contract tests so they cannot drift. `scripts/list-reports.mjs` gains `--status` filtering, triage notes and `--dismiss`. Still deliberately no dashboard: a queue UI stays off the table until volume justifies it |
| SF-3 | Report category tuning from real reports | P3 | 🟡 PARTIAL | Instrumentation complete: `scripts/report-stats.mjs` (`npm run reports`, read-only) prints reason/status/day distributions from a pure, contract-tested aggregation — the tuning evidence exists the moment real reports do. The tuning decision itself remains traffic-dependent by nature |
| SF-4 | Scam / spam detection | P3 | ⚪ DEFERRED | Needs volume first. Assess privacy impact before any automated inference |
| SF-5 | Impersonation / fake-profile detection | P3 | ⚪ DEFERRED | Would likely require photo or identity signals — see V-1 and §1 photo constraint |
| SF-6 | Suspicious-account signals | P3 | ⚪ DEFERRED | Depends on SF-4 |

---

## 9. Notifications & remaining user rights

### Notifications (WS14)

| # | Item | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| N-1 | Super Like notification | P1 | 🟠 IN PROGRESS | Implemented in `api/swipe.js`: anonymous by design — no name, photo, `@username` or id — and sent only when the super like did not already produce a match, since a match notification says more. Ordinary likes stay silent. **Tests written but not yet executed** — see the quota note below |
| N-2 | Profile-completion reminder | P1 | 🟠 IN PROGRESS | Implemented: a `profile_reminders` optional notification category capped at **one per seven days** (per-category `windowMs`, counters in the existing `rateLimits` document, so no new retention surface), `api/_reminders.js` (plan/send split mirroring `_retention.js`) and `scripts/profile-reminders.mjs` (dry-run by default, `--apply` to send, `--limit`/`--protect`). Eligible: declared 18+, profile incomplete, account not paused by a legal state. Delivery goes through `deliverNotification`, so opt-out and legal pause are applied centrally — a paused account is not even selected. EN/FR. **Firestore-backed tests written but not executed** |
| N-3 | Safety / account event notifications | P3 | 🟠 IN PROGRESS | Implemented: report acknowledgments, pause/resume and objection/withdrawal confirmations, and a deletion confirmation — all transactional `account` messages, delivered regardless of settings and even while the account is paused. The report ack is identical whether or not the target exists, so it cannot be used to probe account existence; blocks, unblocks and unmatches stay silent. EN/FR. **Firestore-backed tests written but not executed** |
| N-4 | Notification frequency controls / user preferences | P1 | 🟠 IN PROGRESS | `api/_notify.js` + a Notifications card in the profile view, EN/FR. Opt-out, not opt-in. Transactional categories are structurally unrepresentable in the settings map, so no payload can mute a payment or account message. Super Likes carry a 5/day flood ceiling stored in the existing `rateLimits` document, so capping adds no new personal-data surface. **Tests written but not yet executed** |

Telegram is the only notification channel. **No email or SMS infrastructure** without explicit
owner approval.

**Notification policy (set by N-4, applies to everything above).** Engagement notifications are
the user's choice and can be switched off. Transactional notifications — payment, refund,
account events — are not, because they are the only record the user gets of something that
happened to their money or their account. This is enforced structurally rather than by
convention: the stored settings map contains only the optional categories, so there is no key a
malicious or malformed payload could set to mute a receipt.

### Data-subject rights (WS6)

| # | Item | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| RT-1 | Rectification beyond profile editing | P0 | 🟢 COMPLETE | Analysis closed: everything Bezy controls is editable in-app. Telegram-owned identity (`first_name`, `username`, photo) is corrected in Telegram itself; matches and blocks carry their own actions (unmatch, unblock); usage and rate-limit counters are transient. The genuine remainder — the 18+ declaration and payment records — stays via `contacts@digitalconcordia.com`; nothing further is automatable |
| RT-2 | Restriction of processing | P0 | 🟠 IN PROGRESS | Implemented as self-service: `action: 'restrict'`/`'unrestrict'` on `/api/account`, a *Pause processing* control in Safety & privacy, EN/FR. A recorded legal state (`processingRestricted` + timestamps), not a visibility flag — enforced in `discover.js`, `swipe.js`, `profile/me.js` and `_notify.js`, and checked before any other user's data is read. A restricted target is unreachable through the same identical `TARGET_NOT_FOUND` as every other case, so restriction is undetectable from outside. Access and erasure stay available; lifting does not republish. Privacy Policy and `DATA_PROCESSING_MAP.md` §5 updated. **Firestore-backed tests written but not executed** |
| RT-3 | Objection | P0 | 🟠 IN PROGRESS | Implemented as self-service — Art. 21(5) allows objections by automated means: `action: 'object'`/`'unobject'` on `/api/account`, an *Object to processing* control in Safety & privacy, EN/FR. A recorded `processingObjection` legal state kept distinct from restriction in storage and in the export (the rights are distinct, the record must say which happened), sharing one `processingPaused()` predicate (`api/_privacy.js`) across discover/swipe/profile/notify so the enforcement points cannot drift. An objecting target is unreachable through the same identical `TARGET_NOT_FOUND`, so the objection is undetectable from outside. Bezy honours the objection immediately; whether compelling legitimate grounds could ever justify continuing is an operator legal-review question (P0-5 family), not code. Privacy Policy and `DATA_PROCESSING_MAP.md` §5 updated. **Firestore-backed tests written but not executed** |
| RT-4 | Consent withdrawal | 🔴 | 🔴 BLOCKED | Only applicable if P0-5 makes consent a basis |

Documented in `docs/DATA_PROCESSING_MAP.md` §5. The Privacy Policy must not promise automation
that does not exist.

---

## 10. Premium backlog (WS12 / WS15)

Telegram Stars only. Not promoted; none started.

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| PR-1 | Rewind | ⚪ DEFERRED | Reuses existing action records; no new sensitive field |
| PR-2 | Additional Super Likes | ⚪ DEFERRED | Quota change only |
| PR-3 | Recently active | ⚪ DEFERRED | Needs a `lastActiveAt` field — new data, assess first |
| PR-4 | Boosts | ⚪ DEFERRED | Interacts with the ranking boost already in `api/discover.js` |
| PR-5 | Incognito | ⚪ DEFERRED | Interacts with discoverability and the enumeration model |
| PR-6 | New users filter | ⚪ DEFERRED | `createdAt` already exists |
| PR-7 | Unlimited likes | ⚪ DEFERRED | Effectively exists via the premium quota ceiling; clarify positioning |
| PR-8 | Compatibility insights | 🟠 IN PROGRESS | Implemented: Premium members see a `breakdown` on every deck card — the deterministic score explained with terms the card already shows (shared interests, shared languages, candidate's city, age proximity). Derived from on-card fields only: no new disclosure, no sensitive inference. Server-gated: the field is absent for free callers. EN/FR, contract-pinned, backend tests written. **Firestore-backed tests not executed** (quota) |

**Recommended smallest high-value set when promoted:** PR-1, PR-2, PR-6 — each reuses existing
data and needs no new sensitive field.

---

## 11. Consumer & commercial (WS13)

| # | Item | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| CN-1 | Operator identification / legal notice | P0 | 🟢 COMPLETE | See P0-12 |
| CN-2 | Pricing transparency and plan duration | P0 | 🟢 COMPLETE | Server-authoritative; shown before purchase; Stars requirement stated |
| CN-3 | Cancellation behaviour | P0 | 🟢 COMPLETE | Terms now state, EN and FR, that each purchase is a one-off fixed term that does not auto-renew, that there is no subscription to cancel, and that buying again extends the existing expiry |
| CN-4 | Refund policy in Terms | P0 | 🟢 COMPLETE | Terms state a refund removes access immediately |
| CN-5 | Digital-service withdrawal right / immediate-performance waiver | P0 | 🔴 LEGAL REVIEW REQUIRED | EU/Austrian consumer law question. Not implemented, not decided |
| CN-6 | VAT / OSS obligations | P0 | 🔴 LEGAL REVIEW REQUIRED | **No tax conclusion has been drawn.** Do not assert VAT status |
| CN-7 | Consumer support channel | P1 | 🟢 COMPLETE | **Owner decision: complete — do not reopen.** `@BezyDatingBot` is the primary support channel (`/support` / FR `/assistance`: category menu, deterministic troubleshooting from the caller's own document, structured intake → `BZ-XXXX` requests with a four-state lifecycle); the Mini App leads with the bot link and offers the same intake and history; the operator queue is `scripts/list-support.mjs`. Email is only the formal/fallback channel. Requests are exported, erased with the account, and retention-integrated. (The Firestore-backed test execution for this feature is still pending the fresh-quota run in §19 — a verification note, not an open item) |

---

## 12. Scale & infrastructure (WS21)

None started. No unnecessary infrastructure expansion.

| # | Item | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| SC-1 | Vercel behaviour under load | P0 | 🔵 READY | Serverless cold starts, concurrency, function limits |
| SC-2 | Firestore behaviour under load | P0 | 🔵 READY | Free-tier daily quotas are a real ceiling at campaign scale. **No longer theoretical:** on 2026-09-10 the Spark daily read quota was exhausted by development testing alone — several backend + Playwright runs against the one shared database — which aborted a suite mid-run and blocked all further Firestore reads for the day. Writes continued to work. Two consequences to design for: (a) the test suites and production share a quota, so a busy test day can degrade the live app; (b) an aborted suite can leave synthetic `9000000xx` profiles discoverable, since cleanup itself needs reads. Both argue for a separate test project or emulator before any campaign. **Billing must stay disabled**, so raising the quota is not an available answer |
| SC-3 | Discovery query scalability | P0 | 🔵 READY | `where('discoverable','==',true).limit(100)` scans a fixed window; behaviour at large user counts is unmodelled |
| SC-4 | Rate-limiter scalability | P1 | 🔵 READY | One document per user per request; read-then-write contention unmeasured |
| SC-5 | Payment webhook reliability under load | P0 | 🔵 READY | Telegram retries on non-200; idempotency is tested but not load-tested |
| SC-6 | Failure-mode catalogue | P1 | 🟢 COMPLETE | `docs/FAILURE_MODES.md` — per dependency: what the user sees, what the operator sees in the `[bezy-*]` logs, and the response; tied to the deterministic degraded-state e2e spec and the payment symptom table in TELEGRAM_SETUP §2b |
| SC-7 | Observability | P1 | 🔵 READY | Structured `[bezy-*]` console-log conventions now cover payments, privacy actions, notifications, rate-limit trips and support; the failure-mode catalogue maps them. Metrics, alerting and tracing remain deliberately unbuilt until load justifies them — and any analytics-shaped system must clear ADR 0006 first |

---

## 13. Quality & regression (WS22)

| # | Item | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| Q-1 | Backend suite | — | 🟢 COMPLETE | 307 checks |
| Q-2 | Security suite | — | 🟢 COMPLETE | 102 checks |
| Q-3 | Playwright suite | — | 🟢 COMPLETE | 42 specs |
| Q-4 | Localization suite | — | 🟢 COMPLETE | 133 checks |
| Q-5 | API contract tests | P1 | 🟢 COMPLETE | `docs/API_CONTRACT.md` version 1 + `tests/contract.test.mjs` (35 checks, **pure — runs without Firestore**): exact key sets and types for every public shape, the disclosure boundary (no `username`/`telegramId`/`gender`/`seeking` off the match card), and the error catalogue pinned both ways against the Mini App mapping. Its first run caught a real TDZ crash in `api/_notify.js`. Runs first in `npm test` |
| Q-6 | Production smoke tests | P0 | 🟢 COMPLETE | `tests/smoke.test.mjs`, 40 checks. Read-only and unauthenticated: build freshness, live locale consistency, legal pages, and that all 8 endpoints reject unauthenticated and forged requests |
| Q-7 | Browser / Telegram client compatibility | P1 | 🟢 COMPLETE | Playwright now runs a three-engine matrix (chromium, webkit, firefox). The Firestore-backed specs stay Chromium-only by quota discipline; `tests/e2e/browsers.spec.js` is the Firestore-free set (gate + legal pages, EN/FR) and runs on all three — 9/9 green. Telegram WebView on real iOS/Android cannot be automated outside the Telegram client and is a documented manual L-1 step (`LAUNCH_CHECKLIST.md` 1.13) |
| Q-8 | Error-state coverage | P1 | 🟢 COMPLETE | `tests/e2e/degraded.spec.js` drives degraded states deterministically through route interception (no Firestore): whole-API down → typed toast + navigable shell; locale outage → complete built-in English fallback; rate limit → the wait is named. The fallback catalogue is now generated from `locales/en.json` (`npm run sync:fallback`) and pinned by the localization suite — the spec's first run caught it stale, rendering raw keys |

**Never reduce coverage to make the suite green.**

---

## 14. Growth & acquisition (WS20)

**Entirely unstarted and previously untracked.** Verified: no referral, invite, attribution,
campaign or `start_param` code exists.

| # | Item | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| G-1 | Controlled pilot cohort | P5 | 🔵 READY | Gated by L-2 |
| G-2 | Launch messaging / positioning | P5 | 🔵 READY | Must not claim age verification or GDPR compliance |
| G-3 | Telegram deep-link attribution (`start_param`) | P5 | 🔴 BLOCKED | "Attribution" as named is tracking and conflicts with ADR 0006 — see §18-E. A non-tracking entry-point use (e.g. language selection) is possible if the owner decides; nothing consumes `start_param` today |
| G-4 | Referral mechanism | P5 | ⚪ DEFERRED | Creates a user-to-user relationship graph — assess privacy before building |
| G-5 | WhatsApp channel acquisition (~60k) | P5 | 🔴 BLOCKED | Blocked on L-4 |
| G-6 | Country representatives / ambassadors | P5 | ⚪ DEFERRED | Operational, not technical |
| G-7 | Growth analytics | P5 | 🔴 BLOCKED | **Conflicts with §1 "no analytics or tracking".** See §18-A |

---

## 15. Documentation & governance (WS23)

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| D-1 | Core docs | 🟢 COMPLETE | ARCHITECTURE, SECURITY, DATA_PROCESSING_MAP, DPIA_ASSESSMENT, TELEGRAM_SETUP, LAUNCH_CHECKLIST, API_CONTRACT, FAILURE_MODES, `docs/adr/` |
| D-2 | This roadmap as source of truth | 🟢 COMPLETE | Referenced from `docs/ARCHITECTURE.md` |
| D-3 | Launch checklist | 🟢 COMPLETE | `docs/LAUNCH_CHECKLIST.md` — the operational runbook behind the four §16 gates: per-level steps, commands and evidence, plus ongoing-operations discipline. Adds no new requirements; references existing procedures |
| D-4 | Architecture decision records | 🟢 COMPLETE | Eight dated ADRs in `docs/adr/` (Telegram-native, platform stack, Stars-only, photos, identity model, no-analytics, localization, billing/quota discipline) — referenced from `ARCHITECTURE.md`, pinned by the contract suite |

---

## 16. Launch gates (WS24)

Four distinct levels. **Do not collapse them.** A feature can be technically complete while
launch stays blocked.

| # | Level | Status | Gated by |
| --- | --- | --- | --- |
| L-1 | Internal testing | 🟢 READY | — |
| L-2 | Small controlled pilot | 🟡 READY WITH CAVEATS | P0-1…P0-3; pilot users told it is an early service |
| L-3 | Public launch | 🔴 NOT READY | P0-5, P0-11, P0-13, CN-5, T1 |
| L-4 | Large-scale campaign (~60k) | 🔴 NOT READY | All P0, plus T1, T2, SC-1…SC-3, SC-5, Q-6 |

Bezy is **technically prepared for legal review**. It is not "GDPR compliant" and that phrase
must not be used.

---

## 17. Long-horizon backlog

Not promoted. Each requires an explicit decision before any work starts.

| # | Item | Status | Gate before implementation |
| --- | --- | --- | --- |
| AI-1 | AI profile / conversation assistance | ⚪ DEFERRED | Assess personal-data processing, special-category inference, third-party transfer, retention, cost, user benefit |
| AI-2 | AI moderation / scam detection | ⚪ DEFERRED | Same, plus accuracy and appeal implications. Relates to SF-4/SF-5 |
| V-1 | Optional profile / photo / identity verification | ⚪ DEFERRED | **Distinct from the 18+ self-declaration (C9) — never conflate them.** Photo verification would likely require persistent image storage, which §1 forbids: must stop and be reported |
| EX-1 | Dating experiences (events, speed dating, date ideas, games, gifts) | ⚪ DEFERRED | Virtual gifts must not introduce a payment path outside Telegram Stars. See §18-C |
| BZ-1 | Business ecosystem (restaurants, hotels, partners, weddings) | ⚪ DEFERRED | Introduces third-party data sharing and new processors. See §18-B. Do not build until the core loop proves demand |

---

## 18. Known conflicts requiring an owner decision

Surfaced by this audit. Each is a stated future intention that contradicts a permanent
decision in §1. None may be resolved by engineering alone.

**§18-A — Growth analytics vs "no tracking" (G-7).** WS20 contemplates growth analytics "if
later legally/privacy approved". §1 forbids analytics and tracking, and the absence of any
analytics is currently a load-bearing claim in the Privacy Policy, `DATA_PROCESSING_MAP.md`
and `DPIA_ASSESSMENT.md` (it is part of why criterion 3 of the DPIA screening is *not* met).
Introducing analytics would require updating all three documents and would likely change the
DPIA outcome. **Decision required before any attribution beyond G-3.**

**§18-B — Business ecosystem vs the transfer position (BZ-1).** Partner integrations would
share personal data with new third parties, creating processors and possibly transfers that do
not exist today. This intersects the unresolved P0-7. **Blocked behind P0-7.**

**§18-C — Virtual gifts vs Stars-only (EX-1).** Gifts could imply a value transfer outside
Telegram Stars, contradicting §1. If pursued, it must be implemented as Stars or not at all.

**§18-D — `relationshipIntent` vs Art. 9 (P1-3).** Already tracked as blocked on P0-5, restated
here so it is visible at the conflict level rather than only inside a feature row.

**§18-E — Deep-link attribution vs no analytics (G-3).** G-3 contemplates `start_param`
attribution. ADR 0006 forbids analytics and tracking, and the Privacy Policy relies on that
absence. Attribution as named is tracking. A start parameter that only selects the language
or an entry point carries no tracking and could be implemented, but that is not what G-3
names. **Decision required before any `start_param` work beyond a non-tracking entry-point
use.**

---

## 19. Quality gate — current baseline

Last **fully executed** gate, covering everything through P1-1/P1-2/P1-4/P1-5:

```
Localization:  133 passed / 0 failed
Backend:       307 passed / 0 failed
Security:      102 passed / 0 failed
Smoke:          40 passed / 0 failed   (read-only, against production)
Playwright:     42 passed / 0 failed
Total:         624 passed / 0 failed
```

Since then, localization has been re-run and is at **182 passed / 0 failed** (checks now pin
the prompt, notification, language and support-category id lists to the API, guard the
placeholders, pin the canonical support address and sweep the repository for bot-identity
drift).

⚠️ **The N-1/N-2/N-3/N-4, RT-2, RT-3, PR-8, the CN-7 support flow and the P1-3 `languages`
tests have been written but never executed.** The Firestore free-tier daily read quota was
exhausted (see SC-2), which aborts any Firestore-backed suite part-way. The following must be
run, green, **from a credentialed operator environment during a fresh quota window**, before
any of them may be marked 🟢:

```bash
BEZY_SERVICE_ACCOUNT=<path> node tests/backend.test.mjs
BEZY_SERVICE_ACCOUNT=<path> node tests/security.test.mjs
BEZY_SERVICE_ACCOUNT=<path> npx playwright test
```

Run them once, on a fresh quota day, rather than iteratively — the quota is shared with the
live app. What *is* verified for N-1/N-4: `node --check` on every changed file, the localization
suite, and the ten `api/_notify.js` pure-logic behaviours (defaults, normalization, unknown-key
rejection, and that a transactional category cannot be disabled), executed standalone. For
RT-2, RT-3, PR-8, the CN-7 support flow and P1-3 `languages` the same applies: `node --check`
and the localization suite are green; the backend, security and Playwright suites remain
unexecuted. The **contract suite** (`tests/contract.test.mjs`, 66 checks) runs without
Firestore and is part of this verified set — it caught a module-load crash the quota-gated
suites could not. Two Firestore-free e2e sets are also verified: the degraded-state spec (3
checks, route interception) and the three-engine browser spec (9 checks across
chromium/webkit/firefox).

`npm test` runs the three Node suites; `npm run test:e2e` runs Playwright; `npm run test:smoke` checks production; `npm run retention` dry-runs the retention policy. Backend, security
and Playwright need `BEZY_SERVICE_ACCOUNT`; localization is pure static analysis.

**Production data:** 1 real user, 2 real invoices, 1 rate-limit record. Synthetic test data
uses ids `9000000xx` only and is cleaned before and after every run. Never mutate real records.

---

## 20. Session log

Newest first.

### Session — fresh-quota verification: blocked at environment
- **Attempted:** the §19 fresh-quota verification workstream (the three canonical commands
  for N-1…N-4, RT-2/RT-3, PR-8, P1-3 languages and the support flow).
- **Outcome: not executed.** The session environment had no `BEZY_SERVICE_ACCOUNT`, no
  `FIREBASE_*` and no `TELEGRAM_BOT_TOKEN`; the repository holds no service-account or
  `.env` file on disk (only the git-ignore pattern exists). Running the suites without
  credentials fails at Firebase `cert()` initialization before any Firestore read — zero
  verification value — so they were deliberately not burned. No quota was consumed.
- **State:** nothing verified, nothing falsified, no defects found. The §19 commands and
  the one-run discipline stand unchanged; they execute the moment an operator environment
  provides the credentials. The roadmap statuses for the waiting items stay as-is.

### Session — fix: canonical bot identity contradiction
- **Fixed:** `docs/TELEGRAM_SETUP.md` §0 claimed the "intended" username was `@BezyBot`
  (moving from `@BezyDatingBot`) — contradicting the permanent §1 decision. §0 now states
  `@BezyDatingBot` is permanent (roadmap §1, ADR 0001) and that renaming would be an owner
  decision recorded in the roadmap first. This was the only stale reference in the
  repository.
- **Regression added:** two localization checks — a repository-wide sweep that fails on a
  bare `@BezyBot` in any tracked file type (docs, pages, scripts, JSON, PowerShell), and a
  pin that the roadmap §1 decision line still exists. The check's own literals are excluded
  from the sweep.
- **Tests:** localization 180 → 182 passed / 0 failed; contract 66 passed / 0 failed;
  degraded e2e 3/3; cross-browser e2e 9/9. All quota-free suites green.

### Session — owner decision: CN-7 closed
- The owner declared CN-7 **complete**: the bot is the primary support channel and email is
  only the formal/fallback channel. The row is now 🟢 with that decision recorded; the
  pending Firestore-backed test execution stays noted in §19 as verification, not scope.

### Session — execution: SF-2/SF-3, T4 tooling, SC-6 catalogue
- **Built:** `api/_moderation.js` — the report lifecycle (open → resolved/dismissed) and a
  pure aggregation shared by the scripts and the contract tests. `list-reports.mjs` gains
  `--status`, notes and `--dismiss`; `report-stats.mjs` (`npm run reports`) prints the
  reason/status/day distributions that justify category tuning. `RATE_LIMITED` trips are now
  logged (`[bezy-ratelimit] limit_reached`), `rate-limit-status.mjs` (`npm run rate-limits`)
  inspects live windows, and the launch checklist documents the tuning procedure.
  `docs/FAILURE_MODES.md` catalogues every degraded dependency: user view, operator view,
  response.
- **Status changes:** SF-2 🔵 → 🟢; SF-3 🔵 → 🟡 (instrumentation done, tuning is
  traffic-dependent); T4 🔵 → 🟡 (same shape); SC-6 🔵 → 🟢; SC-7 note updated; D-1 list
  gains FAILURE_MODES. Contract 59 → 66.

### Session — execution: PR-8 compatibility insights
- **Built:** Premium members see a `breakdown` on every deck card — the deterministic score
  explained with terms the card already shows (shared interests, shared languages,
  candidate's city, age proximity), so it discloses nothing new and infers nothing
  sensitive. The field is absent for free callers: the server is the gate. EN/FR
  (`why_languages` added), contract-pinned (v1.1), backend tests written but unexecuted
  (quota). PR-8 🔵 → 🟠.

### Session — execution: CN-7 reworked to bot-first support
- **Product decision applied:** the Bezy bot is the primary support channel; email is the
  formal fallback. `/support`/`/assistance` (registered commands) opens a category menu via
  callbacks; Premium/Profile/Discovery/Likes&Matches are diagnosed deterministically from
  the caller's own document only; "still need help?" sets a transient
  `pendingSupportRequest` on the user doc and the next plain message becomes a structured
  request `BZ-XXXX` in `supportRequests` (counter-keyed references, four-state lifecycle,
  minimal fields). The Mini App card now leads with the bot link (canonical URL pinned),
  then the same intake form and the caller's own history via `POST /api/support`; the
  operator works the queue with `scripts/list-support.mjs` (no HTTP route, no external
  platform). Privacy: requests are exported, erased with the account, rate-limited
  (`support_create`, one bucket across both channels) and retention-integrated with the
  period deliberately unset. Email keeps the 3-working-days aim in the app, Privacy and
  Terms.
- **Status changes:** CN-7 🟢 → 🟠 (reworked, Firestore-backed tests unexecuted). Contract
  51 → 59; localization 175 → 180; API contract v1.2; data map §1.6 added.
- **Next:** SF-2 triage, SF-3 report stats, T4 rate-limit tooling.

### Session — execution: Q-7 browser matrix and Q-8 degraded states
- **Built:** a three-engine Playwright matrix (chromium/webkit/firefox) with the
  Firestore-backed specs pinned to Chromium by quota discipline, plus a Firestore-free
  cross-browser spec (gate + legal pages, EN/FR — 9/9 green across engines). Degraded
  dependency states are now driven deterministically through route interception:
  whole-API-down, locale outage, and rate limiting each degrade to a typed, navigable app.
  The built-in fallback catalogue is generated from `locales/en.json`
  (`npm run sync:fallback`) and pinned by the localization suite.
- **Caught and fixed:** the fallback catalogue was stale — a locale outage rendered raw
  `app.*` keys across the profile form. The harness always injected the Telegram stub, so
  the outside-Telegram gate was unreachable in tests; it now serves a hermetic `?plain=1`
  mode with the Telegram script removed.
- **Status changes:** Q-7 🔵 → 🟢 (WebView check is a documented manual L-1 step, checklist
  1.13); Q-8 🟡 → 🟢; WS22 🟡 → 🟢.
- **Tests:** browsers 9 passed / 0 failed across three engines; degraded 3 passed / 0
  failed; localization 169 → 171.

### Session — execution: governance clarifications (RT-1, G-3)
- **RT-1 closed by analysis:** everything Bezy controls is editable in-app; the remainder is
  Telegram-owned identity (corrected in Telegram), self-correcting transient counters, or
  records with their own actions (unmatch/unblock). The 18+ declaration and payment records
  stay on the email path — nothing further is automatable. Documented in the roadmap and
  `DATA_PROCESSING_MAP.md`.
- **G-3 blocked and recorded:** "attribution" as named is tracking and conflicts with
  ADR 0006 — recorded as §18-E per the roadmap's own conflict rule. A non-tracking
  entry-point use is possible only on an owner decision.
- **Status changes:** RT-1 🟡 → 🟢; G-3 🔵 → 🔴 BLOCKED.

### Session — execution: Q-5 contract tests and D-4 ADRs
- **Built:** the API contract suite (Q-5, 44 checks) and the ADR set (D-4, eight records in
  `docs/adr/`). The ADRs are the full record of the §1 permanent decisions, referenced from
  `ARCHITECTURE.md`, and the contract suite pins that the ADR directory holds exactly the
  documented set with status/decision/consequences sections.
- **Status changes:** Q-5 🟡 → 🟢; D-4 🟡 → 🟢; WS23 🟡 → 🟢 (all four D-* items complete).
- **Tests:** contract 44 passed / 0 failed; localization 169 passed / 0 failed.
- **Next:** governance clarifications (RT-1 remainder, G-3 vs ADR 0006).

### Session — execution: Q-5 API contract tests
- **Built:** `docs/API_CONTRACT.md` version 1 plus `tests/contract.test.mjs` (35 checks) — a
  pure suite that pins every public response shape (exact key sets and types), the disclosure
  boundary (no `username`/`telegramId`/`gender`/`seeking` off the match card) and the error
  catalogue both ways against the Mini App mapping. Producers were exported
  (`publicProfile`, `publicMatch`, `publicLiker`, `publicPlans`, `normalizeProfile`,
  `normalizePreferences`). Wired as `npm run test:contract` and runs first in `npm test`.
- **Caught immediately:** a temporal-dead-zone crash in `api/_notify.js` — `DAY_MS` was used
  in `NOTIFICATION_CATEGORIES` before its declaration, which would have crashed every route
  importing the module in production. The quota-gated suites could not have caught it; the
  pure suite can. Fixed by moving the constant above the categories.
- **Status changes:** Q-5 🟡 → 🟢. D-1 core-docs list now includes API_CONTRACT.
- **Tests:** contract 35 passed / 0 failed; localization re-run 169 passed / 0 failed.
- **Next:** D-4 architecture decision records.

### Session — execution: D-3 launch checklist, gate fix, operator name
- **Built:** `docs/LAUNCH_CHECKLIST.md` — the operational runbook behind the four §16 gates
  (steps, commands, evidence per level, ongoing-ops discipline). Adds no new requirements.
- **Fixed:** the outside-Telegram gate at the root URL was a bare "Bezy / Open Bezy from
  Telegram to continue." with no way in and no logo. It now shows the Bezy mark
  (`/assets/bezy-icon.png`) and a button linking the canonical bot
  (`https://t.me/BezyDatingBot`), EN/FR by browser language. Pinned twice: a localization
  check that the gate links the canonical bot, and an e2e test of the full gate screen.
  **Requires a Vercel deploy to reach production.**
- **Changed:** operator representative name "Yao Amevi Amessinou Sossou" → "Yao Sossou" in
  ARCHITECTURE, DATA_PROCESSING_MAP, Privacy and Terms (EN + FR).
- **Status changes:** D-3 🔵 → 🟢; D-1 core-docs list now includes LAUNCH_CHECKLIST.
  Localization suite 168 → 169.
- **Next:** Q-5 API contract tests.

### Session — execution: CN-7 in-app support route
- **Built:** a *Help & support* card in the Mini App profile view with a `mailto:` entry point
  to `contacts@digitalconcordia.com`, EN/FR. The address is now pinned twice — a localization
  check (markup + both catalogues) and an e2e attribute assertion — so the support route
  cannot drift to a lookalike.
- **Not built:** an SLA. It is an operational commitment (response time, hours) that the
  operator either defines or deliberately declines before launch — the roadmap row now says
  so, and no response-time promise was invented in the copy.
- **Status changes:** CN-7 stays 🟡 (route done, SLA pending). Localization suite 165 → 168.
- **Next:** D-3 launch checklist.

### Session — execution: N-3 safety / account event notifications
- **Built:** transactional `account` bot messages for the events that are a user's only
  record of something that happened to their account: report acknowledgment, pause/resume
  confirmation, objection/withdrawal confirmation, and a deletion confirmation sent while the
  account still exists. All ride the existing `account` category, so no new settings surface
  and no payload can mute them; they are delivered even while the account is paused.
- **Design decisions worth keeping:** the report acknowledgment is identical whether or not
  the target account exists — differing text would turn the bot chat into an
  account-existence oracle. Blocks, unblocks and unmatches stay silent: their effect is
  already visible in the app. Idempotent repeats send nothing — only an actual state change
  is an event.
- **Status changes:** N-3 🟡 → 🟠; P1-7 🟡 → 🟠 (its substance was the §9 items, now all
  implemented).
- **Tests:** backend additions written but unexecuted (Firestore quota). Localization suite
  re-run: 165 passed / 0 failed.
- **Next:** CN-7 in-app support route.

### Session — execution: N-2 profile-completion reminders
- **Built:** a `profile_reminders` optional notification category capped at one per seven
  days — the cap window is now per-category (`windowMs` on `NOTIFICATION_CATEGORIES`), still
  stored in the same `rateLimits` counters account deletion already erases. `api/_reminders.js`
  mirrors the `_retention.js` plan/send split; `scripts/profile-reminders.mjs` is the
  operator-invoked driver (dry-run by default, `--apply`, `--limit`, `--protect`), wired as
  `npm run reminders`. The Mini App Notifications card gains the toggle (EN/FR).
- **Design decisions worth keeping:** only accounts that declared 18+ and have an incomplete
  profile are eligible — people who never confirmed never engaged and are not contacted. A
  paused account is not even *selected* for a reminder, and delivery still goes through
  `deliverNotification`, so opt-out and the cap are applied in one place, never by the script.
  No scheduler was built — the operator invokes the script, like retention.
- **Regression:** adding an optional category changed the default `notifications` map, so the
  N-4 default/echo assertions were updated to include it (expected consequence, not a defect).
- **Status changes:** N-2 🔵 → 🟠 (implemented, tests unexecuted). Localization suite stays
  green at 165; the category pinning check now also covers the reminders toggle.
- **Tests:** backend additions (plan selection, cap, opt-out, pause exclusion, language,
  button deep link) written but unexecuted (Firestore quota).
- **Next:** N-3 safety / account event notifications.

### Session — execution: RT-2, RT-3 and the P1-3 `languages` sub-item
- **Built:** RT-2 restriction of processing as self-service — `action: 'restrict'`/`'unrestrict'`
  on `/api/account`, a recorded `processingRestricted` legal state (not a visibility flag)
  enforced in `discover.js`, `swipe.js`, `profile/me.js` and `_notify.js`, a *Pause processing*
  control in Safety & privacy, EN/FR, Privacy Policy and `DATA_PROCESSING_MAP.md` §5 updated.
  RT-3 objection as self-service the same way — Art. 21(5) allows objections by automated
  means: `action: 'object'`/`'unobject'`, a recorded `processingObjection` state kept distinct
  from restriction, an *Object to processing* control, EN/FR. P1-3 `languages`: profile chips,
  a free (non-Premium) discovery filter and a compatibility term, EN/FR.
- **Design decisions worth keeping:** a paused account is excluded by the legal state itself
  and returns the same identical `TARGET_NOT_FOUND` shape as every other case, so neither
  restriction nor objection is detectable from outside. Both legal states share one
  `processingPaused()` predicate (`api/_privacy.js`) across discover/swipe/profile/notify so
  the enforcement points cannot drift, while staying distinct in storage and the export —
  the rights are distinct, the record must say which happened. Language ids are ISO 639-1
  machine tokens with a closed list pinned between API and Mini App by a localization check;
  profiles listing no language are never excluded by the filter; the language filter is
  deliberately not Premium-gated because being unable to hold a conversation is whether the
  product works at all, not a power-user concern.
- **Status changes:** P1-3 `languages` sub-item 🔵 → implemented (row stays 🟡 PARTIAL:
  `relationshipIntent` remains blocked on P0-5). RT-3 🟡 → 🟠 (implemented, tests unexecuted).
  §9 header renamed: these rights are no longer "not automated". Localization suite 143 → 165.
- **Tests:** localization 165 passed / 0 failed. Backend, security and Playwright additions
  for RT-2, RT-3 and `languages` are written but unexecuted (Firestore quota) — see §19.
- **Next:** N-2 profile-completion reminder.

### Session — execution: N-1 and N-4 (notifications)
- **Built:** `api/_notify.js` — one place that decides what Bezy is allowed to send, wired into
  `api/swipe.js`, `api/profile/me.js` and the data export, plus a Notifications card in the
  profile view, EN + FR.
- **Design decisions worth keeping:** the settings map contains *only* the categories a user may
  control, so muting a payment receipt is not a validation rule that could be forgotten — it is
  unrepresentable. The Super Like notification is anonymous because naming the sender would both
  give away what `/api/likes` charges for and disclose someone's interest before the recipient
  has expressed any of their own. The 5/day ceiling reuses the `rateLimits` document, which
  account deletion already erases, so flood protection created no new retention obligation.
- **Not finished:** the backend and e2e tests for this work are written but **have never run** —
  the Firestore daily read quota was exhausted. See §19 for the exact commands. N-1 and N-4 are
  therefore 🟠, not 🟢.
- **Found while working:** SC-2 stopped being theoretical — development testing alone exhausted
  the production database's daily read quota, and an aborted suite left synthetic profiles
  behind because cleanup itself needs reads. Both are now recorded on SC-2. The leftover
  `9000000xx` documents were removed by targeted delete (writes were still available).
- **Tests:** localization 133 → 143. The rest of the gate is unchanged but unre-run.
- **Next:** run the three suites on a fresh quota day and promote N-1/N-4, then P0-4.

### Session — execution: P1-1, P1-2, P1-4, P1-5
- **Shipped:** profile prompts (P1-1), profile preview (P1-2), why you matched (P1-4) and
  conversation starters (P1-5) — each end to end: backend, Mini App, EN + FR, tests.
- **Design decisions worth keeping:** prompt ids are machine tokens stored alone, so one
  answer renders under the reader's own question — a test now pins the Mini App list to the
  API list so they cannot drift. `sharedSignals()` is the single source for both the match
  explanation and the openers, so the two cannot disagree, and it is attached only to
  matches, which is what keeps it behind mutual consent. `gender`/`seeking` are excluded
  from it by design (§18) and a test asserts they never appear.
- **Regression caught and fixed:** the "Why you matched" label shipped as a `<b>` inside
  `.match-info`, which broke two existing Playwright specs on strict mode and put a second
  bold element in front of assistive technology. Now a `.why-label` span, with the chip CSS
  scoped to beat the inherited `.match-info span` rule.
- **Status changes:** P1-1/P1-2/P1-4/P1-5 🔵 → 🟢; WS2 and WS4 🟡 → 🟢; PR-8 ⚪ DEFERRED →
  🔵 READY now that its stated blocker (build P1-4 first) is cleared.
- **Tests:** 566 → 624, 0 failing.
- **Next:** P0-4 then P0-1.

### Session — execution: retention, smoke tests, demo-copy cleanup
- **Fixed now:** T5 dead locale keys (and wired `premium_expired` into a real lapsed-membership
  notice); T1 retention framework with dry-run script and 15 tests; Q-6 production smoke suite
  (40 checks); CN-3 non-renewal clause in Terms EN/FR; T7 hardcoded English removed from eight
  runtime-populated elements.
- **Regressions caught and fixed:** the new lapsed notice reused `.locked` and broke Playwright
  strict mode — given its own class, and coverage extended to the refunded case. The smoke test
  initially failed on local-ahead-of-production drift; the assertion was wrong, not the system,
  so it now checks live internal consistency and reports drift informationally.
- **Tests:** 488 → 566, 0 failing.
- **Next:** P0-4 then P0-1.

### Session — workstream continuity audit
- **Workstream:** governance. No code changed, nothing committed.
- **Done:** reconciled the roadmap against all 24 defined workstreams; added §2 coverage index
  and §18 conflicts register.
- **Found:** six workstreams had no home at all (growth, scale, quality-beyond-suites,
  governance artifacts, launch gates, consumer/commercial); notifications and user rights were
  under-specified; four conflicts between stated future intentions and permanent decisions.
- **Item count:** 71 → 108.
- **Next:** P0-4 then P0-1.

### Session — master roadmap established (`30ef891`)
- Created the roadmap; reconciled claimed-complete items against code; demoted four to
  PARTIALLY COMPLETE; committed the previously untracked localization suite. 488 tests passing.

### Session — launch-readiness check (`6e692aa`)
- Found and fixed `RATE_LIMITED` unmapped in the Mini App; verified production served the
  latest build.

### Session — pre-launch hardening (`011c999`)
- Rate limiting; closed the `@username` pre-match disclosure and a second enumeration leak;
  stopped collecting `lastName` / `isPremiumTelegram`; `docs/SECURITY.md`.

### Session — GDPR readiness (`b37c598`)
- Account export and deletion; block / report / unmatch; data-processing map; DPIA screening.

### Session — refund and 18+ (`de52d9f`)
- Refund → Premium revocation; 18+ self-declaration gate; operator identity finalised.

### Session — Premium (`7175168`)
- Telegram Stars Premium end to end against mocks; full French localization.

---

## 21. How to use this file

**Starting a session:** read §0 (unsaved state), §2 (coverage), §5 (P0), §7 (P1). State the
current workstream, what is complete, what is open, and the next action.

**A new idea arrives:** do not start coding. Record it as `NEW IDEA / AFFECTED WORKSTREAM /
PRIORITY / DEPENDENCIES / CONFLICTS / PREVIOUS WORK THAT MUST REMAIN`, add it to the right
section, and report the resulting order. If it contradicts §1, add it to §18 and stop.

**Ending a session:** update statuses, preserve everything unfinished, add what was newly
discovered, record blockers and test counts, update §0 with any unsaved state, and append a
session-log entry.

**Auditing completeness:** walk §2. Every workstream must map to a section containing real
items. A workstream with no home means the roadmap is incomplete.

**Never** treat a prompt as a clean slate, and never mark something complete because the code
exists.
