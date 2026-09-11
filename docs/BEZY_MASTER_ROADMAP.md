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

🟢 **Working tree clean at `3d5df65`** (`feat: Premium entitlement UX consistency, Telegram
story sharing, voice/call boundaries`). **Pushed — `main` is in sync with `origin/main`**
(verified 2026-09-11 at end of day), so the Vercel production build includes: Bezy-native
messaging (ADR 0009), the conversation shell integration, the Premium UX consistency fix and
the Telegram story share action.

This section always records unsaved or unpushed state, because that is what disappears
between sessions. When work is left uncommitted, list the files and what they contain here
before ending the session.

| State | Detail |
| --- | --- |
| Uncommitted | This checkpoint edit only (this file). |
| Unverified | N-1, N-2, N-3, N-4, RT-2, RT-3, PR-8, the CN-7 support flow and the P1-3 `languages` tests are written but have never been executed (Firestore quota). §19 lists the three commands that must be green before any is marked 🟢. The Firestore-backed discovery regressions, mutual-like state-machine cases and the Bezy-conversations section are likewise written but unexecuted here. Legal follow-ups from ADR 0009 remain flagged (retention, privacy-policy text, DPIA re-screening); voice messages carry the additional dependency list recorded in ADR 0009 (storage decision, media lifecycle, retention, DPIA, webview mic verification) |
| Unpushed | Nothing — pushed at `3d5df65` |

---

## 1. Permanent architecture decisions

Not revisitable without an explicit owner decision. Any request that conflicts with these
must stop and be reported rather than implemented. See §18 for known conflicts.

- Telegram-native platform, Bezy-native conversations (ADR 0009): Telegram owns identity,
  hosting, notifications and platform safety. Bezy owns profiles, discovery, matching,
  **messaging between matched users** (Firestore storage, delivery inside the Mini App),
  dating-specific safety, Premium and data controls.
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
| P0-4 | Re-confirm `allowed_updates` before the test | 🟢 COMPLETE | Verified live 2026-09-10: `allowed_updates = message, callback_query, pre_checkout_query`, the registration was re-run **with** `TELEGRAM_WEBHOOK_SECRET` (clearing the observed 401 wall), `pending_update_count: 0`, `last_error: none` — the script prints READY with no warning. Support buttons and Stars pre-checkout are now both deliverable |

Clearing P0-1 promotes R1–R3 and removes the largest technical unknown in the project.

Counsel-ready factual packet: `docs/LEGAL_REVIEW_PACKET.md` — the open legal questions with
the repository facts for each, maintained against the implementation. Stage 4 outcome-data
specification (design only, nothing active): `docs/OUTCOME_DATA_SPEC.md`.

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
| P1-6 | Compatibility / ranking improvements | 🟡 PARTIAL | Deterministic scoring + Premium boost exist and are documented; the zero-result deck is honest (four-way `emptyReason` with explicit actions, no recycling, no silent relaxation); **Stage 2 reciprocal ordering implemented** — floor-dominated pair model (`0.85·min + 0.05·max`), invisible preference-fit term, bounded sparse-profile exploration, displayed score stays the caller's own. Stage 3 (freshness/diversity from explicit outcomes) next; sensitive signals blocked on P0-5 |
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
| SC-3 | Discovery query scalability | P0 | 🟡 PARTIAL | After a live discovery failure (an eligible, discoverable user never reached a deck), the SC-3 composite-index window was **removed**: the candidate query is now a plain where-only equality with in-memory newest-first ordering — no query-level window, no composite index, deterministic at any pool size, missing `createdAt` treated as oldest. The response page stays 20. Contract suite pins the index-free, window-free query; the Firestore-backed regression (>100 pool not truncated) is written but unexecuted (quota). At-scale *load* behaviour remains subject to SC-1/SC-2 testing |
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
| D-1 | Core docs | 🟢 COMPLETE | ARCHITECTURE, SECURITY, DATA_PROCESSING_MAP, DPIA_ASSESSMENT, TELEGRAM_SETUP, LAUNCH_CHECKLIST, API_CONTRACT, FAILURE_MODES, LEGAL_REVIEW_PACKET, OUTCOME_DATA_SPEC, `docs/adr/` |
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

### Session — end of day, 2026-09-11: everything pushed and deployed
- **State:** working tree clean at `3d5df65`; `main` in sync with `origin/main` — the
  production build now includes Bezy-native messaging (ADR 0009), the conversation shell
  integration, the Premium UX consistency fix and the Telegram story share action.
- **Verified green today:** contract 125, localization 205, discovery 50; Firestore-free
  e2e (conversation 11, premium-ux 6, browsers incl. story editor) 22/22 Chromium and
  44/44 WebKit+Firefox.
- **Still open (recorded, not forgotten):** the Firestore-backed suites (§19 checklist)
  including the Bezy-conversations section; the ADR 0009 legal follow-ups (message
  retention, privacy/terms copy, DPIA re-screening); the voice-message dependency list
  (storage decision, media lifecycle, retention, DPIA, webview mic verification); manual
  real-device checks (conversation keyboard behaviour, story editor on a live client).
- **Next session:** start from §0, then the §19 credentialed verification run.

### Session — Telegram Stories via the official share-to-story event (uncommitted by instruction)
- **Investigated the API pages provided:** the phone-calls API is MTProto client-only
  (`phone.requestCall`, conference creation included) — no Mini App path, confirming ADR
  0009's call limitation. The one officially supported Mini App story surface is the
  `web_app_share_to_story` web event (JS API: `WebApp.shareToStory`), which opens Telegram's
  native story editor with a media URL, caption and link widget.
- **Implemented:** a "Share Bezy to your story" action in Profile (Settings & Privacy) —
  feature-detected (`tg.shareToStory` or the `TelegramWebviewProxy` event bridge), hidden on
  unsupported clients; shares Bezy's own brand media (`/assets/bezy-icon.png`), a localized
  EN/FR caption and a widget link to the canonical bot. No story media is stored in
  Firestore; Bezy does not view or deep-link into other users' stories.
- **Tests:** browsers.spec gained the story-editor test (button visible on supporting
  clients, click produces the exact media/caption/widget payload) — 22/22 Chromium, 44/44
  WebKit+Firefox; contract 122 → 125 (official event, canonical widget, feature detection);
  localization 205; discovery 50.
- **Not committed / not pushed / not deployed** (explicit workstream instruction): see §0.

### Session — Premium entitlement UX consistency + voice/call investigation (uncommitted by instruction)
- **Premium UX root cause:** the Discover and Matches promotional Premium cards were static
  markup that always rendered, and entitlement was only fetched when the Premium view
  opened — so the app never knew an active member was active. **Fixed:** `/api/premium`
  status loads at boot; `renderPremiumSurfaces()` re-renders the two promo cards and every
  `.premium-action` button from that single backend verdict — active members see membership
  status and "View membership", free/expired members keep the upgrade UI; the messaging lock
  screen already followed the server verdict and stays server-gated. **Benefit added:**
  `messaging` ("Chat with your matches" / "Discutez avec vos matchs") in
  `PREMIUM_BENEFITS` (canonical) + `BENEFIT_KEYS` + EN/FR.
- **Voice messages:** NOT implemented — deferred at the storage boundary (no approved media
  layer; Firestore binary/base64 explicitly ruled out) plus unverified
  `getUserMedia`/MediaRecorder reliability inside Telegram webviews. Recorded with the exact
  dependency list in ADR 0009.
- **Telegram native 1:1 calls:** NOT launchable from a Mini App — the official deep-link
  catalogue has no 1:1 call link and the Bot API has no call mechanism. No fake call button
  was added; the limitation is recorded in ADR 0009 and ARCHITECTURE.md.
- **Stale copy fixed:** `starters_hint` EN/FR no longer claims the conversation happens in
  Telegram; a localization pin now forbids "Open Telegram chat" and Telegram-conversation
  claims anywhere.
- **Tests:** new Firestore-free `tests/e2e/premium-ux.spec.js` (6 tests: no Unlock pitch for
  active members, membership page + benefits, FR benefits, free lock + upgrade flow,
  expired-as-free, active member sends) — 17/17 Chromium with conversation.spec, 42/42
  WebKit+Firefox; contract 118 → 122 (entitlement surface pins); localization 202 → 205
  (stale-copy + benefit pins); discovery 50.
- **Not committed / not pushed / not deployed** (explicit workstream instruction): see §0.

### Session — conversation screen integrated into the app shell (uncommitted by instruction)
- **Root cause:** the chat screen was a full-viewport fixed layer (`z-index: 35`) above the
  global bottom navigation, so opening a conversation hid the whole shell.
- **Fixed:** the conversation is now a detail layer of the existing shell — it sits below
  the navigation (`z-index: 5`) and reserves the navigation's measured height at its bottom
  (`--bezy-nav-h`, re-measured on `resize` and Telegram's `viewportChanged`), so the
  composer always clears the nav and rides the resized Mini App viewport when the keyboard
  opens. Opening a conversation switches the underlying view to Messages (nav stays
  highlighted; back and nav taps land on the Messages list); nav taps close the conversation
  and switch screens like any other view; the message history and failed pending sends are
  cached per match so back-and-forth does not destroy state. Composer focus scrolls to the
  newest message. No new nav component, no architecture change (no new ADR).
- **Tests:** conversation e2e 8 → 11 (nav visible + Messages active inside the conversation,
  composer clears the nav geometrically, nav switches screens, back returns to Messages with
  state surviving) — 11/11 Chromium, 30/30 WebKit+Firefox incl. browsers.spec; contract 118,
  localization 202, discovery 50. Keyboard-open behaviour (composer above keyboard, no
  overlap) follows the standard Telegram Mini App viewport resize and remains a manual
  real-device check.
- **Not committed / not pushed / not deployed** (explicit workstream instruction): see §0.

### Session — Bezy conversations implemented (ADR 0009, uncommitted by instruction)
- **Decision recorded:** messaging between matched users is now Bezy-native — ADR 0009
  accepted; ADR 0001's messaging clause marked superseded; roadmap §1 updated. Telegram
  keeps identity, hosting, notifications and platform safety.
- **Implemented:** `api/messages.js` (list/send/read; sender from initData only; counterpart
  derived from the canonical conversation id = sorted pair of Telegram ids; every action
  gated by active mutual match + no blocks + Premium; idempotent sends via client-generated
  message ids; `messages`/`messages_read` rate-limit buckets; generic capped Telegram
  notification, never message content). Conversation preview + unread state attached to
  `/api/matches`. Block/unmatch close the conversation; account deletion erases it.
  The Mini App gained a full conversation screen: composer with disabled-empty send,
  optimistic sends with retry (no duplicates), ~4s poll while open (Firestore stays
  deny-all to clients — polling is the smallest real-time mechanism the architecture
  allows), Premium lock screen, unavailable state, why-you-matched header, "Use this
  message" fills the composer without sending, safety menu (block/report/unmatch). All
  Telegram chat-handoff code (t.me/tg:// links, the bot-button `/start match_` flow, the
  username heal) is removed as obsolete.
- **Tests:** contract 109 → 117 (messaging API + UI pins); localization 188 → 202
  (chat runtime ids, `notify_messages`, `CONVERSATION_UNAVAILABLE`); discovery 50;
  conversation e2e rewritten for the chat screen — 8 tests, 12/12 Chromium incl.
  browsers.spec, 24/24 WebKit+Firefox; backend suite gained the Bezy-conversations section
  (Premium gate, send, counterpart read, idempotency, empty/oversized/malformed rejection,
  forged senderId ignored, non-participant and unmatched refusal, block and unmatch close,
  deletion erases) — written, runs in the credentialed environment.
- **Flagged legal follow-ups (not decided here):** retention for active-account messages;
  privacy/terms pages still describe Telegram-hosted chats; DPIA/data-map additions;
  notification-processing documentation. Deletion behaviour is implemented (erasure), no
  retention value invented.
- **Not committed / not pushed / not deployed** (explicit workstream instruction): see §0.

### Session — bot-button handoff for username-less matches (live-confirmed Android failure, uncommitted by instruction)
- **Live-confirmed:** for match `2096013731_702749047` the partner has NO `@username`;
  tapping Continue conversation on Android opened NOTHING with both prior mechanisms —
  `openTelegramLink(tg://…)` (previous build) and webview navigation to `tg://` (current
  build). Grounded in Telegram sources: custom schemes from the Mini App webview are not a
  supported handoff (`tg://`-style redirects "unlikely to be supported" per a Telegram
  developer in tdlib/telegram-bot-api#681), while `tg://` URLs in bot inline buttons are
  documented Bot API input and resolved by the client itself.
- **Fixed:** `chatLinkFor` now opens `https://t.me/BezyDatingBot?start=match_<id>` for
  username-less matches; the webhook handles `/start match_<id>` by re-sending the match
  notification (with its client-resolved "Open Telegram chat" button) to participants only —
  strangers and unknown ids get nothing, so it cannot enumerate or revive matches. Card hint
  copy explains the two taps in EN/FR.
- **Also re-confirmed to the operator:** Telegram chat cannot render INSIDE Bezy — a Mini App
  webview cannot embed Telegram's chat UI, and the Bot API cannot message between users.
  The architecture stays §1 Telegram-native: Bezy owns match context, Telegram owns the
  conversation; the handoff is the product.
- **Tests:** contract 108 → 109 (bot-start fallback + participant check); backend suite
  gained a `/start match_` section (participant re-send, non-participant silent, unknown id
  silent — credentialed env); conversation e2e updated, 9/9 Chromium, 26/26 WebKit+Firefox;
  localization 188; discovery 50. **Remains manual:** the bot-button → profile → message
  taps on a real Android/iOS client; if the profile link still fails there, the partner
  needs to set a @username (then the direct t.me path applies).
- **Not committed / not pushed / not deployed** (explicit workstream instruction): see §0.

### Session — verified match handoff fixed (uncommitted by instruction)
- **DB state verified (by operator):** match `2096013731_702749047` is a real mutual match —
  both `like` actions present, `source: 'mutual_like'`, `active=true`, created
  2026-09-10T15:42Z, diagnostic reports 0 active non-mutual documents. Matching integrity for
  this case is VERIFIED; the matching algorithm was not reopened.
- **Root cause of the broken conversation:** the handoff for a matched user without a
  `@username` builds `tg://user?id=<numeric>` and passed it to `WebApp.openTelegramLink`,
  whose documented input is `https://t.me/…` — clients reject or silently drop the tg://
  input, so the CTA did nothing. A secondary hazard: the stored `@username` used for the
  t.me link can be stale (refreshed only when the target uses Bezy), sending the user to a
  dead or re-taken handle.
- **Fixed:** `openTelegramLink` now routes `https://t.me/…` through the WebApp API and hands
  `tg://` to the client's native opener via webview navigation (Telegram intercepts its own
  scheme); the match card explains the profile-first, one-more-tap flow for username-less
  matches (`chat_no_username_hint`, EN/FR); `api/swipe.js` re-reads the target's handle with
  `getChat` at match creation and clears removed handles, so the match notification's
  "Open Telegram chat" button and the in-app CTA never point at a stale t.me address.
  No new backend, no fake chat, no Premium change, no identity change — the numeric
  Telegram id stays canonical.
- **Verified in code/tests:** contract 104 → 108 (tg:// native-opener routing, https-only
  openTelegramLink, handoff caveat, getChat refresh); conversation e2e suite 7 → 9 tests,
  9/9 Chromium, 26/26 WebKit+Firefox incl. browsers.spec; localization 188; discovery 50.
  **Remains manual (real Telegram client):** that tapping the CTA opens the matched user's
  profile/chat on a real client (iOS/Android/Desktop) — browser tests cannot drive Telegram
  native UI; with a username the t.me link is Telegram's documented mechanism.
- **Not committed / not pushed / not deployed** (explicit workstream instruction): see §0.

### Session — mutual-like invariant hardened (match integrity audit, uncommitted by instruction)
- **Audit verdict:** match creation has always required `isLike && isReciprocalLike`
  (api/swipe.js, since its introducing commit `5750b74`); compatibility/ranking code
  (api/discover.js) has no write access to the `matches` collection; likesReceived is an
  index only; block/unmatch/account-deletion all deactivate matches. **Two integrity gaps
  found:** (1) a swipe `pass` on an already-actioned user overwrote the like underpinning an
  existing match without ending the match document — reachable via the API only (the deck
  excludes decided users), leaving an active match with no reciprocal like; (2) the matches
  read path trusted the match document alone, so any stale document would display.
- **Fixed:** api/swipe.js ends the match when a pass overwrites its underlying like
  (`endedReason: 'pass'`); api/matches.js re-verifies both users' action documents before
  returning a match and is strictly read-only; `scripts/diagnose-matches.mjs` (new,
  read-only) verifies any pair — including the real Aamir question — against live data in
  the credentialed environment.
- **Real Aamir state: UNKNOWN here** — no service account in this environment. The
  diagnostic script + §0 checklist are what the credentialed operator runs; nothing was
  inferred or mutated.
- **Tests:** contract 99 → 104 (mutual-like creation, pass-ends-match, read-path
  verification, compatibility-no-writes, single creation site); backend suite gained a
  mutual-like state-machine section (one-sided like, reciprocal like, reverse order,
  compatibility-without-consent, pass-after-match, stale-document filtering) — written, to
  run with credentials; quota-free suites re-run here: contract 104, localization 188,
  discovery 50, conversation e2e 7/7 Chromium.
- **Not committed / not pushed** (explicit workstream instruction): see §0 for the exact
  file list.

### Session — match → conversation flow fixed (audit → fix → test, uncommitted by instruction)
- **Audit findings:** (1) the Messages tab was a weak bridge — a small chat pill, no
  why-you-matched, no safety entry, no explicit bridge copy — with no in-Bezy composer by
  architecture (Telegram owns messaging), so the screen did not clearly lead to a real
  conversation; (2) `openTelegramLink` silently did nothing for `tg://` links when
  `openTelegramLink` was unavailable — the "Continue conversation does nothing" failure mode;
  (3) `starterSuggestions` already guaranteed a generic fallback, but the sheet had no labeled
  starter section and the generic copy was weak, so edge-case matches read as "empty".
- **Fixed (existing architecture only, no new backend):** tg:// links fall back to the system
  opener as a last resort; the Messages tab now renders the same card hierarchy as Matches
  (why you matched → Start/Continue conversation → Ways to start → Safety) with the bridge
  copy "Your conversation happens securely in Telegram."; the starters sheet gained a labeled
  "Start with" section; `starter_generic` reworded to "Start with something simple about what
  you already have in common."
- **Premium:** verified no entitlement change — the conversation CTA is not Premium-gated in
  the current design (the gate sits upstream in matching: Premium-only who-liked-you, swipe
  quotas). Pinned by contract and e2e checks so the launch-time gate behaviour cannot drift
  silently in either direction.
- **Tests:** new Firestore-free cross-engine suite `tests/e2e/conversation.spec.js` — 7 tests
  (t.me username hand-off, `tg://user?id=` numeric hand-off, starters non-empty with shared
  signals, generic opener for nothing-in-common matches, safety reachable from Messages, no
  CTA for unmatched users, CTA not Premium-gated); 7 passed on Chromium, 22 passed across
  WebKit+Firefox+browsers.spec. Contract suite 95 → 99; localization 188; discovery 50.
  Firestore-backed suites still unexecuted locally (no service account in this environment).
- **Not committed / not pushed** (explicit workstream instruction): see §0 for the exact file
  list.
- **Known remaining limitation:** for a matched user with no @username, Telegram offers no
  deep link that opens a private chat directly — `tg://user?id=` opens their Telegram profile,
  from which the conversation is one tap. With a username (the common case) the `t.me`
  hand-off opens the chat directly. Both are the best targets Telegram's public linking model
  supports without a client-account workaround, which §1 forbids.

### Session — Everyone discovery fixed + match→chat hand-off fixed (both live, user-confirmed)
- **Everyone bug (confirmed live):** a caller whose `seeking` was `everyone` could not see a
  friend whose own `seeking` did not accept the caller's `gender` — the reciprocal check
  overrode Everyone. **Fixed:** in `genderMatches` (api/discover.js), a caller seeking
  `everyone` passes the gender/seeking gate entirely — the caller's own gender never decides
  discoverability. Everyone removes only the gender/seeking restriction: completeness, age,
  filters, blocks, decisions and paused states all still apply, and a match still requires
  the candidate to have liked the caller first. Explicit preferences (`women`/`men`) keep the
  fully reciprocal rule, including `prefer_not_to_say` matching only candidates seeking
  `everyone`. ARCHITECTURE "CURRENT" discovery strategy updated. Pure matrix expanded to the
  Everyone semantics (50/0); Firestore-backed scenario added (male caller + Everyone sees a
  male candidate seeking women) — written, not executed (quota).
- **Match→chat bug (confirmed live):** the chat entry only worked for matched users with a
  `@username` — the primary button was a dead toast or absent otherwise. **Fixed:** the
  hand-off now uses the public `t.me/<username>` link when a username exists and Telegram's
  numeric-user deep link `tg://user?id=<id>` (the id the match card already carries) when it
  does not; `tg://` links route through Telegram's native opener, never the in-app browser.
  The primary action is labelled "Start conversation" and flips to "Continue conversation"
  after the first tap via a device-local marker (Telegram still owns the actual chat); safety
  actions remain available behind it. EN/FR keys added (`start_conversation`,
  `continue_conversation`; `open_chat` removed), fallback catalogue synced, contract pins
  added (95/0), localization 188/0, cross-engine e2e 12/12.
- **Remaining manual verification:** on a real device, match two accounts where one has no
  `@username` and confirm "Start conversation" opens that user's Telegram conversation (the
  `tg://user?id=` deep link). Code-level tests cannot prove Telegram's client-side resolution.
- No commit, no push, no deploy in this session.

### Session — discovery candidate window removed (live failure: an eligible user never reached a deck)
- **Live incident:** a real, actively-used account with `discoverable: true` never appeared in
  the caller's Discovery deck; the deck was empty. Root cause class: the SC-3 candidate query
  (`where discoverable == true` + `orderBy createdAt desc` + `limit 100`) computed eligibility
  over a bounded, index-dependent window — eligible users beyond the newest 100 were silently
  unreachable, documents missing `createdAt` were silently dropped by `orderBy`, and the
  composite-index dependency was exactly the failure shape observed live on `/api/support`
  (see FAILURE_MODES.md). **Fixed:** the query is now a plain where-only equality (automatic
  single-field index, no 500 mode); newest-first ordering is applied in memory with missing
  timestamps treated as oldest; eligibility is computed over the whole pool; the response page
  stays 20. `firestore.indexes.json` no longer declares a users composite index.
- **Also fixed:** the Mini App filter form serialized a cleared age input as `0`, which the
  backend clamps to `maxAge 18` — an accidental all-hiding filter. A missing value now means
  the default bound.
- **Live follow-up (same incident):** the caller's actual empty deck reported
  `emptyReason: 'eligibility'` — the reciprocal gender/seeking rule excluded every
  discoverable candidate, and the screen gave no clue what the caller's own stored values
  were. Two defects fixed without touching the rule: (1) the profile form **pre-selected**
  "I am: Prefer not to say" for accounts that never consciously chose — the most
  exclusionary value as the implicit default, making such accounts invisible to everyone
  seeking a specific gender; the select now starts on a placeholder and `required` forces an
  affirmative choice. (2) The eligibility empty state now shows the caller their **own**
  stored "I am" / "Looking for" with an "Update my profile" action — own values only,
  frontend-only, no new backend field, no public-card change (the gender/seeking privacy
  boundary is untouched and still contract-pinned). New EN/FR keys, fallback catalogue
  synced, cross-engine e2e regression added (Firestore-free, 12/12 green).
- **Coverage:** new pure suite `tests/discovery.test.mjs` (45 checks — the full reciprocal
  gender/seeking matrix incl. the prefer_not_to_say rule, the eligibility-≠-ranking invariant
  across pairCompatibility/preferenceFit/freshness/page-diversity/Premium, broad default
  filters, completeness↔discoverability linkage, the production pair passing every pure gate)
  wired into `npm test`. Firestore-backed regression scenarios added to
  `tests/backend.test.mjs` (mutually eligible pair reaches the deck, >100 pool is not
  truncated, pagination serves every eligible candidate before an honest `pool` empty state).
  Contract suite re-pins discovery as index-free and window-free (92/0). Localization 188/0.
  Firestore-backed suites remain **written but unexecuted — credentials/quota unavailable**.
- **Deployed (2026-09-10):** the working tree (window fix, filter fix, gender-default fix and
  the eligibility self-diagnosis) was deployed to production with the Vercel CLI as
  Environment: Production, and the production smoke suite passed 40/0 against the new
  deployment — the live bundle carries the new code (`empty_eligibility_you`,
  `gender_placeholder`, the filter-serialization fix). No git commit or push was part of this
  deployment.

### Session — P0-4 cleared: webhook re-registered with the secret
- The operator re-ran `set-webhook.ps1` with `TELEGRAM_WEBHOOK_SECRET` set to the Vercel
  value: `setWebhook ok=True`, all three update types registered, no `last_error`, zero
  pending updates. The 401 wall is cleared; support-menu callbacks and Stars pre-checkout
  are now deliverable end to end. P0-4 🔵 → 🟢.
- Remaining live checks the operator can now do by hand: tap a support-menu button in the
  bot (Firestore quota permitting) and, when a Stars balance exists, run TELEGRAM_SETUP
  §2b (P0-1…P0-3).

### Session — convergence checkpoint (stop cleanly)
- **Verified against the repository:** every remaining roadmap item is blocked only by
  E/F/G/H or real-traffic dependency. No work was manufactured to stay busy; no completed
  decision was reopened.
- **Preparatory artifacts confirmed on disk and referenced:** §19 credentialed-suite
  commands; `docs/TELEGRAM_SETUP.md` §2b payment procedure; `set-webhook.ps1 -VerifyOnly`
  (launch checklist L-1.2); `docs/LEGAL_REVIEW_PACKET.md`; `docs/OUTCOME_DATA_SPEC.md`;
  `scripts/outcome-eval.mjs`; `firestore.indexes.json` (both indexes deployed);
  `scripts/retention.mjs` / `scripts/profile-reminders.mjs` / `scripts/list-support.mjs`.
- **Exact external action per blocker:** (1) credentialed fresh-quota day → run the three
  §19 suites once; (2) owner authorization → Vercel redeploy; (3) real Stars balance →
  §2b procedure; (4) operator shell with the Vercel secret → `set-webhook.ps1`; (5) legal
  counsel → LEGAL_REVIEW_PACKET (P0-5 first); (6) real traffic → T4/SF-3 tuning and
  Stage 5 evaluation.
- **Next session must re-audit the 24 workstreams before assuming convergence still holds.**

### Session — autonomous: support failure fallback
- **Fixed:** the support-callback and support-intake catch blocks previously swallowed
  failures with no user feedback (the dead-button class observed live during diagnosis).
  Both now answer with a plain-language fallback ("Bezy could not process that right now…
  or write to contacts@digitalconcordia.com.", EN/FR) — the button can never again be a
  silent dead end. The fallback reveals no internals; delivery failure of the fallback
  itself is logged and nothing else happens. The forced-failure path has no clean harness
  injection, so it is covered by code review + the existing happy-path tests rather than a
  fabricated test.
- **Tests:** smoke 40/0; contract 90/0; localization 188/0 (webhook untouched by the
  Firestore-free e2e sets).

### Session — autonomous: Stage 4 evaluation tooling
- **Built:** `api/_outcomes.js` (pure) + `scripts/outcome-eval.mjs` (`npm run outcomes`) —
  the operator-run, read-only evaluation the outcome spec calls for: mutual-match rate,
  continued-match rate, unmatch/block-ended rates from the outcomes already stored.
  Contract-pinned (84 → 90): the headline metric is matches-per-like, empty cohorts return
  nulls (never invented numbers), account-deletion endings are reported but excluded from
  quality rates, and no engagement/swipe-volume row can enter the report.

### Session — autonomous: SC-3 fix, Stage 4 spec, counsel packet
- **SC-3 fixed:** the discover query was an unordered 100-document window — beyond 100
  discoverable users candidates could be missed across reloads. Now newest-first over a
  composite index (`discoverable` + `createdAt`), declared in `firestore.indexes.json` and
  **deployed to bezydating (default database)** with the authenticated Firebase CLI under
  the operator's standing index authorization. Contract suite pins the index declaration
  and the query/index agreement (82 → 84).
- **Stage 4 prepared as design only:** `docs/OUTCOME_DATA_SPEC.md` — the five explicit
  outcome events (all already stored), the five hypotheses, the operator-run offline
  evaluation methodology (mutual-match rate / sustained-match rate / unmatch rate; never
  swipe volume), the no-analytics representation constraint, and the five gates before any
  implementation. Nothing active, nothing collected.
- **WS7 prepared:** `docs/LEGAL_REVIEW_PACKET.md` — the eleven open legal questions with
  repository-fact pointers, plus the standing facts counsel can rely on.
- **Tests:** contract 84 passed / 0 failed; the full quota-free gate re-run below.

### Session — Stage 3 adaptive, slice 1: freshness + page diversity
- **Built:** a bounded freshness term (+4/+2/+1/0 for activity within 7/30/90 days, from
  `updatedAt`/`createdAt` already loaded — zero new reads) and page-local bounded diversity
  (after three same-page candidates share the caller's dominant declared signal, further
  same-signal candidates take a −3 ordering penalty; no cross-session state, no inference,
  declared data only). Both are ordering-only; eligibility, safety, recycling, card shapes
  and the caller's displayed score are untouched. Contract suite pins the bounds, decay,
  page-locality and no-cross-state behaviour (78 → 82); backend twin-profile freshness test
  written but unexecuted (quota).
- **Designed, not implemented:** outcome feedback and weight tuning — the evaluation
  methodology (mutual-match rate / sustained-match rate / unmatch rate on real cohorts,
  operator-run, offline) is documented in ARCHITECTURE; Stage 2 weights remain principled
  initial values until real outcomes exist. No new data collection, no live experiment
  infra.
- **Docs:** ARCHITECTURE Stage 3 status; API contract v1.5 (ordering semantics extended).

### Session — Stage 2 reciprocal compatibility implemented
- **Built:** deck ordering now uses a floor-dominated reciprocal pair model — the approved
  shape 0.6·min + 0.3·mean − 0.1·gap, implemented as its exact algebraic equivalent
  `0.85·min + 0.05·max` (verified numerically before coding). The reverse directional score
  gains a +10 preference-fit term (`preferenceFit`) when the caller fits the candidate's
  own filters (age/languages always; city/same-city only for Premium candidates — their
  own semantics), realising pair state 2 with zero extra reads and no new data. A bounded
  deterministic `explorationTerm` (+3/+1) keeps sparse profiles from being buried. Cards
  still display only the caller's own directional score; the internal ordering key is
  stripped from the payload and the reciprocal side is never disclosed or implied. Premium
  +6 boost preserved. Contract suite pins the formula, symmetry, floor-dominance, fit
  semantics and exploration bounds; backend deck test asserts the fitting candidate ranks
  above the mismatching one (written, unexecuted — quota).
- **Docs:** ARCHITECTURE Stage 2 status + pair-scoring rationale retained; API contract
  v1.4 (ordering semantics only — card shapes unchanged).
- **Next:** Stage 3 adaptive (freshness/diversity from explicit outcomes) — not started.

### Session — product-quality review of discovery; safe CX fixes applied
- **Findings and fixes:** (1) acting on the last card of a page dead-ended into an empty
  state even though more eligible candidates existed — the app now fetches the next page
  automatically, with a loading placeholder, so the deck only reports empty when the server
  says so. (2) The empty deck now distinguishes four honest reasons, attributed from data
  the request already read (no extra queries, nothing new disclosed): `no_supply` (nothing
  discoverable), `filters` (the caller's own preferences), `eligibility` (hard reciprocal
  gender/seeking mismatch), `pool` (everyone decided on) — each with its own EN/FR copy and
  Check-again action; filters are never silently relaxed, candidates never recycled. (3)
  Cards now show a "new today" chip and, for free users, a "why this person" line computed
  only from facts the card already shows (shared interests, shared languages, same city);
  Premium keeps the numeric breakdown. (4) The four-stage engine spec (inputs/outputs/
  storage/sensitive/behavioural/chat/explainability/risks/metric per stage) and the
  pair-scoring design — the mean is rejected; a floor-weighted pair model distinguishing
  hard incompatibility, preference mismatch, mutual compatibility, asymmetric interest and
  exploration uncertainty — are documented in ARCHITECTURE "Discovery strategy". API
  contract v1.3 now lists all four `emptyReason` values.
- **Deliberately not built:** reciprocal scoring (next slice, on approval), any new data
  collection, any behavioural dataset.
- **Tests:** localization 188/0; contract 69/0; degraded e2e 3/3; cross-browser 9/9.
  Backend empty-deck scenarios (all four reasons) written but unexecuted (quota).

### Session — action: honest zero-result discovery + staged engine strategy
- **Built:** `/api/discover` now returns `emptyReason: 'filters' | 'pool' | null`; the Mini
  App empty deck explains the reason and offers only explicit user actions (adjust filters,
  reset with a tap, check again). Decided candidates are never recycled, filters are never
  silently relaxed — pinned by backend tests (written, unexecuted) and a contract check on
  the new `filtersActive()` helper. EN/FR keys added.
- **Documented:** the three-stage engine strategy in `ARCHITECTURE.md` "Discovery
  strategy" — CURRENT explainable deterministic, FUTURE reciprocal/adaptive (each term from
  published data or explicit product outcomes only), LATER statistical/ML after real data
  plus a privacy review, with conversation content explicitly excluded as a dataset.
- **Status:** P1-6 note updated. Localization/contract suites re-run below.

### Session — action: documentation reconciliation after the data-processing audit
- **All 12 audit contradictions verified against code and fixed in documentation** (code is
  the source of truth; nothing was changed to match stale docs): Privacy Policy EN + FR
  (drop "last name" and "approximate distance"; add prompts, languages, counters, support
  intake, reminders, the true four deletion-retained categories, the corrected §15
  eligibility-vs-score explanation, the actual retention defaults, the renamed section
  path; effective date bumped), `DATA_PROCESSING_MAP` (§1.2/1.4/1.5/1.7→1.8 inventories,
  §4 retention table + mechanism description, §5 rights paths, §6 minimisation table, §8
  profiling terms + eligibility/score distinction, §9 buckets + retention line),
  `DPIA_ASSESSMENT` (rate limiting + retention rows, messaging exception), `SECURITY.md`
  (three new rate-limit buckets, log prefixes, retention line), `ARCHITECTURE.md`
  (implemented blocks/reports, `isPremiumTelegram` no longer collected).
- **Defined:** support-request retention now has an operational default — **365 days**,
  overridable via `BEZY_RETENTION_SUPPORT_DAYS` — marked as a proposed default subject to
  legal confirmation; payments and reports stay deliberately unset (P0-8). Contract suite
  pins the default.
- **UX:** the Privacy & your data card now opens with a plain-language transparency line
  ("Your chats stay in Telegram. Your photos stay on Telegram. We use your city, not your
  GPS."), EN + FR, pinned by localization and e2e assertions. The Mini App deletion copy
  now lists the same four retained categories as the policy.
- **Legacy fields:** `lastName`/`isPremiumTelegram` remain export-readable for historical
  records only; no production mutation was performed, and no cleanup is required at this
  scale — documented in the map §6.
- **Tests:** run below. Firestore-backed suites remain unexecuted (no credentials in this
  environment; quota discipline unchanged).
- **Next:** legal counsel on the §19 register facts (Art. 9/P0-5 first), then P0-4/P0-1.

### Session — Profile IA refinement (approved CX, presentation only)
- **Changed (UI only — no backend, schema, bot or support changes):** the Profile settings
  now read Safety → Privacy & your data → Help & support → Legal. Safety keeps *Blocked
  people*; the data card keeps *Download my data* and *Delete my account* (still visually
  destructive) and gains one human-readable entry point, *Data & privacy controls*, whose
  sheet explains in plain language and hosts the existing Pause/Object flows with their
  legally precise copy — no legal capability removed, none weakened. Help & support now has
  exactly two CTAs: **Get help** (same canonical bot link, pinned by tests) and **My support
  requests**; the structured intake form still exists, reachable from the history sheet as
  *Contact support*, and the formal/legal fallback (email + the 3-working-days aim) is a
  small text block instead of a competing button. The Legal card keeps Privacy and Terms
  under the plain title *Legal* (`legal_privacy` value changed; FR: *Mentions légales*).
- **Localization:** `support_bot` removed (banlisted), new keys `support_help`,
  `support_formal`, `data_title`, `data_controls`, `data_controls_intro`; safety/rights
  copy shortened per the copy principles.
- **Tests:** localization 182 → 186 passed / 0 failed; contract 67 passed / 0 failed;
  degraded e2e 3/3; cross-browser e2e 9/9. The Firestore-backed e2e specs (safety, profile)
  were updated to the new IA and remain unexecuted (quota).

### Session — Firestore index deployed, rules confirmed
- At the operator's request, the missing Firestore index and rules were created: the one
  composite index the live error named (`supportRequests`: `telegramUserId` + `createdAt`)
  is now declared in `firestore.indexes.json` and **deployed to bezydating (default
  database)** via the authenticated Firebase CLI; `firestore.rules` compiled and was
  already up to date — deny-all client access covers every collection including
  `supportRequests`/`supportMeta`, so no rules were missing. The index build clears the live
  `/api/support` 500 without waiting for a redeploy; the in-memory-sort code fix means new
  deployments do not depend on it. Billing posture unchanged (indexes and rules deploys are
  free on Spark). TELEGRAM_SETUP gained §2c; the launch checklist reference moved to §2d.

### Session — Vercel logs identify the live failures; both fixed
- **Evidence from production logs (2026-09-10):** (a) from ~11:46, every webhook update
  returned 401 — the operator re-registered without `TELEGRAM_WEBHOOK_SECRET` while Vercel
  has it set; (b) at 11:29:49, `POST /api/support` 500ed with `9 FAILED_PRECONDITION: The
  query requires an index` — `listSupportRequests` used `where` + `orderBy` on different
  fields, needing a composite index that does not exist.
- **Fixed:** `listSupportRequests` now sorts in memory (a user's own requests are a
  handful; creation is rate-limited) — the same no-composite-index discipline as the
  reminders planner, now pinned by a contract check that `api/_support.js` contains no
  `orderBy`. `set-webhook.ps1` now exits 3 when `getWebhookInfo` reports a
  `last_error_message`, with the secret-mismatch remedy spelled out; the failure-mode
  catalogue and TELEGRAM_SETUP §3 gained both rows.
- **Remaining operator actions:** (1) re-run `set-webhook.ps1` with
  `$env:TELEGRAM_WEBHOOK_SECRET` set to the Vercel value — this alone unblocks the live bot;
  (2) redeploy to Vercel so the index-free support-history query reaches production.
- **Tests:** contract 66 → 67 passed / 0 failed; localization 182 passed / 0 failed.

### Session — live callback trace: failure chain confirmed mechanically
- **Evidence:** `allowed_updates` now correct (README prints READY), yet taps stay silent. A
  local reproduction with the harness (fake bot token, no Firebase env) POSTs a
  `callback_query` and gets exactly the live symptom: HTTP 200 `{"ok":true}`, one Telegram
  call — `answerCallbackQuery` (the button spinner stops) — zero `sendMessage`, and the
  error swallowed into the console only.
- **Conclusion:** every `support:` path starts with a Firestore read while message commands
  touch no Firestore — which is why `/support` renders but taps die. When the read fails
  (most plausibly the exhausted daily read quota, SC-2 — to be confirmed by Vercel's
  `Callback handling failed:` log line), the handler still answers 200, so Telegram records
  no error and the user sees nothing.
- **Production check:** smoke suite green (40/40); no build-freshness drift flagged.
- **Not changed:** webhook code (no-code-changes constraint). One hardening candidate is
  proposed, not applied: a user-visible fallback message when the callback path fails.
- **Next action:** operator confirms the Vercel `Callback handling failed:` line after one
  tap, then either waits for quota or approves the fallback-message hardening.

### Session — diagnosis: support-menu buttons dead in the live bot
- **Symptom reported by the owner:** `/support` renders the category menu (current build's
  exact copy — so the deployment is fresh), but every button tap does nothing; `/settings`
  shows the welcome message (which is the current code's intended Mini App handoff, not a
  routing defect).
- **Root cause:** the registered webhook's `allowed_updates` was `["message",
  "pre_checkout_query"]` — without `callback_query`, Telegram silently drops every button
  tap. The webhook code has handled `callback_query` since the CN-7 rework; it simply never
  received the updates.
- **Fixed (repo):** `scripts/set-webhook.ps1` now registers and verifies all three update
  types and reports which are missing; `docs/TELEGRAM_SETUP.md` §3 and the launch checklist
  L-1.2 document the requirement; roadmap P0-4 updated.
- **Remaining operator action:** re-run `.\scripts\set-webhook.ps1` (token in the operator's
  own shell) — the script's `-VerifyOnly` confirms the fix on the live bot. No quota was
  consumed; no application code changed.

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
- **Fixed:** `docs/TELEGRAM_SETUP.md` §0 claimed the "intended" username was a shorter
  handle (moving from `@BezyDatingBot`) — contradicting the permanent §1 decision. §0 now
  states `@BezyDatingBot` is permanent (roadmap §1, ADR 0001) and that renaming would be an
  owner decision recorded in the roadmap first. This was the only stale reference in the
  repository.
- **Regression added:** two localization checks — a repository-wide sweep that fails on any
  short-handle drift in any tracked file type (docs, pages, scripts, JSON, PowerShell), and
  a pin that the roadmap §1 decision line still exists. The check's own literals are
  excluded from the sweep.
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
