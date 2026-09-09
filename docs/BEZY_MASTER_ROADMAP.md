# Bezy — Master Roadmap

**This file is the authoritative execution state for Bezy.** Read it before starting work;
update it after. It is never replaced, only amended. A new idea *adds* to this document — it
does not erase anything already in it.

- **Last reconciled:** against the working tree at commit `6e692aa` **plus uncommitted work**
  (see §0).
- **Reconciliation method:** every status below was checked against the code, not carried over
  from a previous summary. Where the owner's understanding and the repository disagreed, the
  repository won and the difference is called out.

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

## 0. Uncommitted work — READ FIRST

🟠 **The most recent session is not committed.** This is exactly the state that goes missing
between sessions, so it is recorded first.

| File | State | Contains |
| --- | --- | --- |
| `tests/localization.test.mjs` | **untracked** | The entire localization + machine-identifier suite (94 checks). Highest loss risk |
| `app.js` | modified | Stars-requirement copy on the Premium screen; `stars_needed` / `not_telegram_premium` fallbacks |
| `api/telegram/webhook.js` | modified | `/premium` states the Stars balance requirement and that Telegram Premium ≠ Bezy Premium, EN + FR |
| `locales/en.json`, `locales/fr.json` | modified | `stars_needed`, `not_telegram_premium` |
| `tests/backend.test.mjs` | modified | 4 assertions on the new bot wording |
| `package.json` | modified | `npm test` runs localization + backend + security |

**Owner instruction at time of writing: no commit, no push, no deploy.** Nothing has been
committed. This section stays until the owner authorises a commit.

---

## 1. Permanent architecture decisions

Not revisitable without an explicit owner decision. Any request that conflicts with these must
stop and be reported, per §15 of the control protocol.

- Telegram-native: Telegram owns identity, notifications, messaging and platform safety.
  Bezy owns profiles, discovery, matching, dating-specific safety, Premium and data controls.
- Backend **Vercel**, database **Firestore**, auth **Telegram `initData`**.
- Payments: **Telegram Stars (XTR) only.** No Smart Glocal, no cards, no other provider.
- Photos: **Telegram photo URLs only.** No Firebase Storage, Cloudinary, S3, Vercel Blob, or
  any Bezy-owned image storage. A feature needing persistent image storage must **stop and be
  reported**, not implemented.
- Bot username **`@BezyDatingBot`** — must not be changed.
- No analytics, tracking or unnecessary cookies.
- Identity: Telegram numeric id is canonical and is the only basis for ownership; `@username`
  is a mutable public locator, never a key; `displayName` is presentation.
- Localization is presentation only. Never translate API paths, URLs, Telegram links, JSON
  keys, Firestore collections/fields, error codes, environment variables, JS identifiers,
  Telegram Bot API methods, or machine-readable confirmation tokens such as `DELETE`.

---

## 2. Completed work (verified in code)

Each item was re-checked. Anything the owner listed as complete that does **not** meet the
Definition of Done has been demoted and appears in §3 instead — those demotions are the point
of this reconciliation.

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| C1 | Telegram-native architecture, `@BezyDatingBot` | 🟢 | `docs/ARCHITECTURE.md`; bot username unchanged |
| C2 | `initData` validation (HMAC, timing-safe, 24h window) | 🟢 | `api/_telegram.js`; security suite |
| C3 | Mini App shell, navigation, EN/FR | 🟢 | `index.html`, `app.js`; Playwright |
| C4 | Profile create / edit / discoverability | 🟢 | `api/profile/me.js` |
| C5 | Discovery, deterministic compatibility, real stats | 🟢 | `api/discover.js` |
| C6 | Like / Pass / Super Like, daily quotas | 🟢 | `api/swipe.js` |
| C7 | Mutual matching + Telegram handoff | 🟢 | `api/swipe.js`, `api/matches.js` |
| C8 | Localized bot commands + webhook | 🟢 | `api/telegram/webhook.js` |
| C9 | 18+ self-declaration, server-enforced | 🟢 | profile/discover/swipe/relationship; never called "verified age" |
| C10 | Account export (Art. 15/20) | 🟢 | `api/account.js` |
| C11 | Account deletion (Art. 17) incl. mirror cleanup | 🟢 | `api/account.js`; backend + Playwright |
| C12 | Block / Report / Unmatch, server-enforced | 🟢 | `api/relationship.js`; `scripts/list-reports.mjs` |
| C13 | User-enumeration protections | 🟢 | swipe + relationship return identical responses |
| C14 | Username disclosure boundary (released only on mutual match) | 🟢 | `api/discover.js` vs `api/matches.js` |
| C15 | Rate limiting, per-user, fail-open, erased on deletion | 🟢 | `api/_ratelimit.js` |
| C16 | Firestore deny-all client rules | 🟢 | `firestore.rules`, deployed |
| C17 | Telegram-only photo architecture | 🟢 | Verified: no upload/blob/base64/bucket/CDN path; regression-locked |
| C18 | Data minimisation (`lastName`, `isPremiumTelegram` no longer collected) | 🟢 | `api/profile/me.js`; security suite |
| C19 | Bezy Premium ≠ Telegram Premium, enforced and stated | 🟢 | `api/_premium.js`; UI + `/premium` copy |
| C20 | EN/FR localization + integrity tests | 🟢 | `tests/localization.test.mjs` (**uncommitted**, §0) |
| C21 | Security documentation | 🟢 | `docs/SECURITY.md` |
| C22 | Data-processing map | 🟢 | `docs/DATA_PROCESSING_MAP.md` |

---

## 3. Reconciliation — items demoted from "complete"

**These were listed as verified-complete by the owner but do not meet the Definition of Done.**
Recording them honestly is the whole purpose of this control system.

| # | Item | Claimed | Actual | Missing layer |
| --- | --- | --- | --- | --- |
| R1 | Telegram Stars invoice generation | complete | 🟡 PARTIALLY COMPLETE | Production verification. Verified live only as far as the native payment sheet opening with the server-derived price; no real payment completed |
| R2 | Premium entitlement architecture | complete | 🟡 PARTIALLY COMPLETE | Backend, UI, tests and localization are done; the **paid** path has never run end to end in production |
| R3 | Refund lifecycle | complete | 🟡 PARTIALLY COMPLETE | Code, idempotency and revocation are fully tested against mocks; no real `refundStarPayment` has been issued |
| R4 | DPIA assessment | complete | 🟡 PARTIALLY COMPLETE | `docs/DPIA_ASSESSMENT.md` is a **screening**, not a DPIA. It says so itself and must never be presented as a completed DPIA |

None of these are defects. They are correctly built and correctly tested — they simply require
a real transaction or a professional assessment before they can be called complete.

---

## 4. P0 — launch blockers

### 4.1 Production payment verification

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| P0-1 | Real Telegram Stars purchase (250 ⭐ monthly) | 🔴 BLOCKED | Blocked on a Stars balance. Observed balance was 0 |
| P0-2 | Real Telegram Stars refund | 🔴 BLOCKED | Depends on P0-1. Use `scripts/refund-payment.mjs` |
| P0-3 | Full lifecycle verification in production | 🔴 BLOCKED | Depends on P0-1/P0-2. Procedure: `docs/TELEGRAM_SETUP.md` §2b |
| P0-4 | Re-confirm `allowed_updates` before the test | 🔵 READY | Must include `pre_checkout_query`, or checkout times out. `scripts/set-webhook.ps1 -VerifyOnly` |

Unblocking P0-1 clears the single largest technical unknown in the project.

### 4.2 Legal review — none of these may be answered by engineering

| # | Question | Status |
| --- | --- | --- |
| P0-5 | Art. 9 treatment of `gender` + `seeking` | 🔴 LEGAL REVIEW REQUIRED |
| P0-6 | Art. 27 EU representative (Benin controller, EU users) | 🔴 LEGAL REVIEW REQUIRED |
| P0-7 | Processor / DPA / transfer mechanisms (Telegram, Google, Vercel) | 🔴 LEGAL REVIEW REQUIRED |
| P0-8 | Payment and report retention periods | 🔴 LEGAL REVIEW REQUIRED |
| P0-9 | Competent supervisory authority | 🔴 LEGAL REVIEW REQUIRED |
| P0-10 | Legal sufficiency of 18+ self-declaration for an adult service | 🔴 LEGAL REVIEW REQUIRED |
| P0-11 | Completed DPIA (see R4) | 🔴 LEGAL REVIEW REQUIRED |

**P0-5 gates P1-3 and P1-6** (see §6): expanding `relationshipIntent` or similar sensitive
signals before it resolves would widen the exact exposure under review.

### 4.3 Legal content

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| P0-12 | Operator identity in legal pages | 🟢 COMPLETE | DIGITAL CONCORDIA, RB/ABC/21 A 28773, Abomey-Calavi, EN + FR |
| P0-13 | Legal review of the pages themselves | 🔴 LEGAL REVIEW REQUIRED | Content is drafted, not reviewed by a qualified adviser |

---

## 5. Open technical work (not started)

| # | Item | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| T1 | Automated retention / dormant-account expiry | P0 | 🔵 READY | Verified absent. Retention is documented but not enforced; deletion is user-initiated only |
| T2 | Penetration / deeper security testing | P0 | 🔵 READY | Never performed |
| T3 | Load and production-scale testing | P0 | 🔵 READY | Required before any 60k campaign |
| T4 | Abuse / rate-limit tuning from real traffic | P3 | 🔵 READY | Current limits are estimates, unvalidated against real behaviour |
| T5 | Remove dead locale keys | P4 | 🔵 READY | `adults_only`, `people_nearby`, `premium_expired`, `premium_soon`. **`premium_soon` says "Bezy Premium is coming soon", which contradicts shipped reality** |
| T6 | Opaque per-viewer profile ids | P4 | ⚪ DEFERRED | Deck `id` is a real Telegram numeric id. Accepted residual risk; see `docs/SECURITY.md` §6 |

---

## 6. P1 — core dating experience

**Verified: all seven are at zero references in the codebase. None is started.** The
architecture supports them; that is not the same as having them.

Each needs backend + UI + EN + FR + tests before it can go 🟢.

| # | Item | Status | Dependencies / notes |
| --- | --- | --- | --- |
| P1-1 | Profile prompts | 🔵 READY | Structured optional free text. Same risk class as the existing `bio`; no new sensitive category |
| P1-2 | Profile preview ("how others see me") | 🔵 READY | Must render the real discovery card and expose no Telegram id, internal id, moderation or payment data |
| P1-3 | Expanded discovery filters | 🟡 PARTIAL | Age/city/same-city exist and are Premium-gated. **`relationshipIntent` is 🔴 BLOCKED on P0-5.** `languages` is non-sensitive and 🔵 READY |
| P1-4 | Why you matched | 🔵 READY | Shared-signal computation; must reveal only what the other user put in their own profile |
| P1-5 | Conversation starters | 🔵 READY | Shares P1-4's computation. Suggestion only — the conversation stays on Telegram |
| P1-6 | Compatibility / ranking improvements | 🟡 PARTIAL | Deterministic scoring + Premium boost exist and are documented. Additional signals blocked on P0-5 where sensitive |
| P1-7 | Improved Telegram notifications | 🟡 PARTIAL | Match and Premium-activation notifications exist and are localized. Super Like, profile-completion and safety notifications not built |

---

## 7. P2 — Premium backlog

Not promoted. Telegram Stars only.

⚪ Rewind · additional Super Likes · boosts · advanced filters · incognito · recently active ·
new users · compatibility insights.

**Recommended smallest high-value set when promoted:** Rewind, additional Super Likes, and
"recently active" — each reuses existing data, needs no new sensitive field, and is
independently testable.

---

## 8. P3–P6 — backlog

⚪ Optional verification (must not require Bezy photo storage) · AI profile assistant · AI
conversation assistance · moderation assistance · events · date planning · gifts · community
features.

AI in any form requires a privacy, transfer, special-category-inference, retention and cost
assessment **before** implementation.

---

## 9. Quality gate — current

Run before declaring any workstream complete. Never weaken or delete a test.

```
Localization:   94 passed / 0 failed
Backend:       281 passed / 0 failed
Security:       84 passed / 0 failed
Playwright:     29 passed / 0 failed
Total:         488 passed / 0 failed
```

`npm test` runs the three Node suites; `npm run test:e2e` runs Playwright.
Backend, security and Playwright need `BEZY_SERVICE_ACCOUNT`; localization is pure static
analysis and needs nothing.

**Production data:** 1 real user, 2 real invoices, 1 rate-limit record. Synthetic test data
uses ids `9000000xx` only and is cleaned up before and after every run. Never mutate real
records.

---

## 10. Readiness

| Milestone | Status | Gate |
| --- | --- | --- |
| Internal testing | 🟢 Ready | — |
| Small controlled pilot | 🟡 Ready with caveats | P0-1 through P0-3 |
| Public launch | 🔴 Not ready | P0-5, P0-11 |
| 60k campaign | 🔴 Not ready | All P0, plus T1 and T3 |

Bezy is **technically prepared for legal review**. It is not "GDPR compliant" and that phrase
must not be used.

---

## 11. Session log

Newest first. One entry per substantial session.

### Session — master roadmap established
- **Workstream:** project control / continuity.
- **Done:** created this file; reconciled every claimed-complete item against the code.
- **Found:** the previous session is entirely uncommitted, including the untracked
  localization suite (§0); four items demoted from complete (§3); all seven P1 features
  verified at zero references; four dead locale keys, one contradicting shipped reality (T5).
- **Tests:** 488 passing, 0 failing.
- **Not done:** no product feature implemented, per instruction.
- **Next:** commit §0, then P0-1 (real Stars purchase) when a balance is available.

### Session — launch-readiness check (`6e692aa`)
- Found and fixed `RATE_LIMITED` unmapped in the Mini App; verified production served the
  latest build. 390 tests passing at the time.

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

## 12. How to use this file

**Starting a session:** read §0 (uncommitted), §4 (P0), §6 (P1); state the current workstream,
what is already complete, what is still open, and the next action.

**A new idea arrives:** do not start coding. Record it as `NEW IDEA / AFFECTED WORKSTREAM /
PRIORITY / DEPENDENCIES / CONFLICTS / PREVIOUS WORK THAT MUST REMAIN`, add it here, then
report the resulting order. If it conflicts with §1, stop and explain.

**Ending a session:** update statuses, preserve everything unfinished, add what was newly
discovered, record blockers and test counts, and append a session-log entry.

**Never** treat a prompt as a clean slate, and never mark something complete because the code
exists.
