# Bezy — Data processing map

**Status: engineering document, not a legal opinion.** It records what the code actually
does, so that a qualified EU/Austrian privacy adviser can assess it against the law. Items
marked **LEGAL REVIEW REQUIRED** are deliberately unresolved: they need a professional
judgement or a fact (a contract, a tax status, a retention period) that has not been verified.

Bezy having a Privacy Policy does not make it compliant. This document exists so the gap
between the policy and the system is visible.

- **Controller (public-facing):** DIGITAL CONCORDIA, Reg. No. RB/ABC/21 A 28773, registered
  25 March 2021 with the Cotonou Commercial Court, Abomey-Calavi, Benin, represented by its
  owner Yao Amevi Amessinou Sossou. Contact: `contacts@digitalconcordia.com`.
- **Reviewed against commit:** the working tree at the time of the GDPR readiness audit.
- **Data Protection Officer:** none appointed. **LEGAL REVIEW REQUIRED** — whether Art. 37
  requires one for this processing has not been assessed by a professional.
- **EU representative (Art. 27):** none appointed. **LEGAL REVIEW REQUIRED** — a controller
  established outside the EU that offers services to people in the EU may be required to
  designate one. This is a live question because the operator is registered in Benin.

---

## 1. Data inventory

Every field below was located in the code, not assumed. "Where" gives the Firestore path.

### 1.1 Telegram identity — received from Telegram via signed `initData`

| Field | Where | Why | Necessary? |
| --- | --- | --- | --- |
| `telegramId` | `users/{id}` (also the document id) | The only user identifier Bezy has; authentication and all relationships key off it | Yes |
| `firstName` | `users/{id}` | Fallback display name before a profile exists | Yes |
| `username` | `users/{id}` | The Telegram public handle. Released **only after a mutual match**, to open the conversation | Yes |
| `languageCode` | `users/{id}` | Language of bot messages and notifications | Yes |
| `photoUrl` | `users/{id}` | Profile picture shown in Discover | Yes, if photos are shown |
| ~~`lastName`~~ | — | **No longer collected** (never displayed or used) | Removed |
| ~~`isPremiumTelegram`~~ | — | **No longer collected** (never granted any entitlement) | Removed |

Identity model: the **Telegram numeric id** is the authoritative identity and the only basis
for ownership; the **`@username`** is a mutable public locator and is never used as a key; the
**Bezy `displayName`** is presentation only. The username may be absent or change at any time,
and the code treats it as optional throughout.

`initData` itself is validated in memory (`api/_telegram.js`) and **never stored or logged**.

### 1.2 Bezy dating profile — provided by the user

| Field | Where | Why |
| --- | --- | --- |
| `displayName`, `age`, `city`, `bio`, `interests[]` | `users/{id}.profile` | The profile other users see; drives compatibility scoring |
| `gender`, `seeking` | `users/{id}.profile` | Reciprocal matching. **See §3 — potential Art. 9 data** |
| `discoverable`, `profileComplete` | `users/{id}` and `.profile` | Whether the profile enters other people's decks |
| `preferences` (`minAge`, `maxAge`, `city`, `sameCityOnly`) | `users/{id}.preferences` | Discovery filters |

### 1.3 Age eligibility

| Field | Where | Why |
| --- | --- | --- |
| `ageEligibilityConfirmed` | `users/{id}` | 18+ gate. Written only from an explicit `true` |
| `ageEligibilityConfirmedAt` | `users/{id}` | Evidence of when the declaration was made; never re-dated |
| `ageEligibilityMethod` | `users/{id}` | Always `"self_declaration"` |

Bezy performs **no** age or identity verification and must never describe this as verified age.

### 1.4 Dating activity

| Field | Where | Why |
| --- | --- | --- |
| `action` (`like` / `super` / `pass`), `createdAt` | `users/{id}/actions/{targetId}` | Prevents re-showing a decided profile; detects mutual likes |
| `fromId`, `action`, `createdAt` | `users/{id}/likesReceived/{fromId}` | Reverse index powering the Premium "who liked you" feature |
| `participants[]`, `active`, `createdAt`, `endedAt`, `endedBy`, `endedReason` | `matches/{sortedPair}` | The match itself and whether it is still live |
| `targetId`, `createdAt` | `users/{id}/blocks/{targetId}` | Safety: exclusion from discovery and contact |
| `actorId`, `createdAt` | `users/{id}/blockedBy/{actorId}` | Mirror so discovery can filter both directions in one read |
| `usage` (`day`, `discoveryActions`, `superLikes`) | `users/{id}` | Daily free-tier quotas; resets on a new UTC day |

**Conversations are not processed by Bezy at all.** Matched users are handed to Telegram and
message content never reaches Bezy's servers or database.

### 1.5 Safety / moderation

| Field | Where | Why |
| --- | --- | --- |
| `reporterId`, `targetId`, `reason`, `details`, `status`, `createdAt` | `reports/{autoId}` | Reviewing reported Bezy profiles and conduct |

`details` is user-authored free text capped at 1000 characters and may contain whatever the
reporter types. No profile snapshot is copied into a report, so an erasure request does not
leave stale personal data inside the moderation record.

### 1.6 Payments (Telegram Stars)

| Field | Where | Why |
| --- | --- | --- |
| `telegramPaymentChargeId` (document id), `providerPaymentChargeId` | `bezyPayments/{chargeId}` | Idempotency key; required to issue a refund |
| `telegramUserId`, `planId`, `stars`, `currency`, `invoicePayload` | `bezyPayments/{chargeId}` | Reconciling a purchase to an account |
| `status`, `refundStatus`, `createdAt`, `processedAt`, `refundedAt`, `refundSource`, `membershipExpiresAt` | `bezyPayments/{chargeId}` | Payment and refund lifecycle |
| `nonce`, `telegramUserId`, `planId`, `stars`, `status` | `bezyInvoices/{nonce}` | Server-side verification at pre-checkout |
| `bezyPremium` (`active`, `planId`, `expiresAt`, `purchasedAt`, `revokedAt`, …) | `users/{id}` | Entitlement |

Bezy never receives card numbers, bank details or billing addresses. Telegram Stars are
settled entirely inside Telegram.

### 1.7 Technical data

| Item | Reality in this codebase |
| --- | --- |
| Cookies | **None.** No `document.cookie` anywhere |
| `localStorage` | One key, `bezy-language`, storing the chosen UI language. Strictly functional, not tracking |
| `sessionStorage` | Not used |
| Analytics / telemetry | **None.** No Google Analytics, Meta Pixel, Sentry, PostHog, Firebase Analytics, or advertising identifiers |
| Third-party scripts | One: `telegram.org/js/telegram-web-app.js`, required for the Mini App to function |
| Dependencies | `firebase-admin` (runtime) and `@playwright/test` (development) only |
| IP addresses / user-agent | Not collected or stored by Bezy. Vercel processes request metadata as part of hosting |
| Rate-limit counters | `rateLimits/{id}` — per-user request counts per bucket with a window start. Records activity timing, so it is personal data and is **erased with the account** |
| Application logs | Errors and `[bezy-payment]` / `[bezy-privacy]` lines containing Telegram ids, plan ids and amounts. **No tokens, keys, `initData`, or profile content** |

---

## 2. Legal basis analysis

**LEGAL REVIEW REQUIRED for every row.** These are the bases that appear *technically*
plausible given what the code does; confirming them is a lawyer's job, not this document's.

| Processing | Plausible basis | Reasoning |
| --- | --- | --- |
| Account creation, authentication via Telegram | Contract (Art. 6(1)(b)) | Without it the service cannot be provided at all |
| Profile storage and display | Contract | The profile *is* the service |
| Discovery, compatibility scoring, matching | Contract | The core function the user asked for |
| 18+ declaration record | Legal obligation and/or legitimate interests | Evidence of an adults-only restriction |
| Block / unmatch | Contract | A user-requested feature |
| Reports and moderation | Legitimate interests (Art. 6(1)(f)) | Protecting users; a balancing test is required |
| Premium purchase, invoices, entitlement | Contract | Performing the purchase |
| Payment record retention after deletion | Legal obligation (Art. 6(1)(c)) | Accounting/tax retention — **period unverified** |
| Daily quota counters | Contract and/or legitimate interests | Enforcing the free tier and limiting abuse |
| Security logging | Legitimate interests | Fraud and abuse prevention |
| Language preference in `localStorage` | Strictly necessary | Not tracking; consent generally not required for a functional preference |

Consent is deliberately **not** claimed as the basis for core dating processing: it would be
hard to argue as freely given when the processing is the service itself.

---

## 3. Special-category data (Art. 9) — the central open question

**This is the most significant unresolved legal issue and it must not be hand-waved.**

Bezy stores `gender` (`woman`, `man`, `non_binary`, `prefer_not_to_say`) and `seeking`
(`women`, `men`, `everyone`), and `api/discover.js` combines them so that only reciprocally
compatible profiles are shown.

What the code factually does: for a user whose `gender` is `man` and `seeking` is `men`, the
system stores and acts on a combination from which sexual orientation can be inferred. The
matching logic is precisely a computation over that pair of fields.

Article 9(1) covers "data concerning a natural person's sex life or sexual orientation".
Whether these fields constitute Art. 9 data here, or merely permit an inference, is a legal
question with real consequences: if Art. 9 applies, Art. 6 alone is not sufficient and an
Art. 9(2) condition — realistically **explicit consent** under 9(2)(a) — would be needed.

**LEGAL REVIEW REQUIRED.** Do not resolve this in code without advice.

What has been done in the meantime:

- The issue is documented rather than assumed away.
- No explicit-consent mechanism has been invented, because implementing a consent flow that
  is later found to be the wrong basis is worse than an honest gap.
- `bio` and `interests` are free text and may contain anything, including health, religious
  or political information a user volunteers. Bezy does not solicit or parse it.
- If counsel concludes Art. 9 applies, the technically indicated change is a specific,
  granular, unbundled explicit-consent step at profile creation, recorded with a timestamp
  and version — mirroring the existing age-declaration pattern.

---

## 4. Retention

Where the law fixes a period, this document does not guess it.

| Data | Current behaviour | Target |
| --- | --- | --- |
| Account, profile, preferences | Kept until the user deletes the account | Add inactivity-based deletion — **not implemented** |
| Actions (like/pass/super) | Deleted with the account | Adequate |
| `likesReceived` mirrors | Deleted with the account, including fan-out to other users | Adequate |
| Matches | Deactivated on deletion, retaining two Telegram ids | Consider purging fully deactivated matches after a period — **not implemented** |
| Blocks / blockedBy | Deleted with the account, mirrors cleaned | Adequate |
| Reports | **Retained** after the reported user deletes their account | Needed so a user cannot erase their own conduct record. Retention period **LEGAL REVIEW REQUIRED** |
| Payments and invoices | **Retained** after deletion | Accounting/tax obligation. Period **LEGAL REVIEW REQUIRED** (commonly multi-year, but this depends on the applicable jurisdiction and has not been verified) |
| Daily usage counters | Overwritten each UTC day; deleted with the account | Adequate |
| Vercel platform logs | Controlled by Vercel's own retention | **LEGAL REVIEW REQUIRED** — confirm the platform's retention |

**Not implemented:** automated retention enforcement. Deletion is user-initiated. There is no
scheduled job that removes dormant accounts or ages out old records.

---

## 5. Data subject rights

| Right | Status |
| --- | --- |
| Access (Art. 15) | **Implemented** — `POST /api/account {action:'export'}`, downloadable JSON from Profile → Safety & privacy |
| Portability (Art. 20) | **Implemented** — the same structured, machine-readable JSON |
| Erasure (Art. 17) | **Implemented** — `POST /api/account {action:'delete'}` with typed confirmation |
| Rectification (Art. 16) | **Partly implemented** — the profile is editable in-app; anything else via email |
| Restriction (Art. 18) | **Manual** — via `contacts@digitalconcordia.com`. A user can also unset *discoverable* to stop being shown |
| Objection (Art. 21) | **Manual** — via email |
| Withdraw consent (Art. 7(3)) | Not applicable unless consent becomes a basis (see §3) |
| Complaint to a supervisory authority | The Privacy Policy should name the route. **LEGAL REVIEW REQUIRED** — which authority is competent depends on the establishment analysis |

The export deliberately returns **counts, not identities**, for likes received, and omits
reports filed *about* the user, because disclosing either would reveal third parties'
personal data.

---

## 6. Data minimisation findings

| Field | Finding |
| --- | --- |
| `lastName` | Stored from Telegram but **never displayed or used** in any code path. Candidate for removal |
| `isPremiumTelegram` | Stored, never used for entitlement. Retained only as a signal; removable |
| `photoUrl` | A Telegram-hosted URL rather than a copied image — good minimisation, no photo storage |
| `details` on reports | Free text, capped at 1000 chars, no snapshot copied — proportionate |
| `invoicePayload` | Contains plan, user id and nonce. Needed for verification and audit |
| Conversations | Not processed at all — the single largest minimisation win in the architecture |

**Both were subsequently removed.** Each was traced end to end — one write, one read (the
export), no display, no logic, no compatibility dependency — and `api/profile/me.js` no longer
collects either. The export still reads them so that records created before the change remain
exportable; new records simply do not have the fields.

Existing production records may still carry them. No destructive migration was run. Clearing
them from historical documents is a **technical item**, not a blocker.

A further finding from the same review: `/api/discover` was disclosing every candidate's
Telegram `@username`. Since the handle is what allows direct contact on Telegram, that let
anyone read their own deck's API response and message people who had never matched with them,
bypassing the consent gate the product exists to enforce. The handle is now released only by
`/api/matches`. See `docs/SECURITY.md` §6.

---

## 7. Processors and international transfers

**Nothing here asserts a transfer mechanism.** Adequacy decisions, SCCs and DPAs are
contractual facts that must be verified in each provider's own documentation and, where
required, actually signed.

| Recipient | Role | Data | Location | Status |
| --- | --- | --- | --- | --- |
| **Telegram** | Independent — see below | Identity, bot messages, all conversation content, Stars payments | Telegram's own infrastructure | **LEGAL REVIEW REQUIRED** |
| **Vercel** | Hosting / serverless processor | All API traffic; request metadata and logs | Depends on region configuration — **not verified** | **LEGAL REVIEW REQUIRED**: confirm the DPA and the deployment region |
| **Google / Firebase (Firestore)** | Database processor | Everything in §1 except conversations | Database created in **`europe-west1` (Belgium)** — data at rest is in the EU | **LEGAL REVIEW REQUIRED**: confirm the Google Cloud DPA and any support-access transfers |
| **Operator (DIGITAL CONCORDIA)** | Controller | Administrative access via service-account credentials | Benin / Austria | **LEGAL REVIEW REQUIRED** |

Two facts worth stating plainly:

1. The Firestore database is in `europe-west1`, so the primary datastore is in the EU. That
   is a genuine advantage but does not by itself settle the transfer question.
2. The **controller is established in Benin while the service targets EU users**. Benin has
   no EU adequacy decision. This makes both the Art. 27 representative question and the
   transfer analysis materially more important than for an EU-established operator.

### Telegram's role

Telegram supplies identity, delivers bot messages, hosts every conversation and processes
Stars payments. Bezy has no contract with Telegram beyond accepting the Bot API terms, and
Telegram states that Mini Apps are operated independently by their developers and that data
sent to a Mini App is handled by that developer.

Practical consequence: **Telegram is responsible for Telegram; Bezy is responsible for Bezy.**
The Privacy Policy must not imply Bezy controls Telegram's infrastructure, and must not imply
Telegram vouches for Bezy. Whether Telegram is a separate controller, a joint controller for
any specific operation, or a processor is **LEGAL REVIEW REQUIRED**.

---

## 8. Profiling and automated decision-making

Bezy performs **profiling** in the Art. 4(4) sense: `api/discover.js` computes a deterministic
compatibility score from shared interests, same city and age proximity, adds a fixed +6
visibility boost for Premium members, and orders the deck by that score.

It does **not** appear to constitute a decision under Art. 22, because:

- no legal or similarly significant effect follows from the ranking;
- it orders candidates, it does not exclude anyone the user could otherwise reach;
- the user makes every like/pass decision themselves.

Whether Art. 22 is engaged is **LEGAL REVIEW REQUIRED**, but the transparency obligation is
satisfiable regardless, and the logic is fully documented in `docs/ARCHITECTURE.md` and
summarised for users in the Privacy Policy. There is no opaque model and no machine learning.

---

## 9. Security posture

Full detail in `docs/SECURITY.md`. Verified in code during these audits:

- Telegram `initData` is validated with an HMAC and a timing-safe comparison; a forged or
  foreign-bot signature is rejected. `auth_date` older than 24 hours is refused.
- **Identity always comes from validated `initData`.** No endpoint accepts a user id from the
  request body, so acting on another account is not possible.
- Firestore denies all direct client access; only the Vercel API touches the database via the
  Admin SDK.
- Anti-enumeration: a swipe against a non-existent, non-discoverable or blocked target returns
  an identical response, so Bezy membership cannot be probed by Telegram id. This was a real
  leak found and fixed during the audit.
- Premium entitlement, quotas and the 18+ gate are enforced server-side, never in the UI.
- Payment amounts and plans are always re-derived on the server; client values are ignored.
- Output is HTML-escaped at every interpolation point in the Mini App.
- No secret is logged. Errors return machine codes, not internal messages.

Known residual risks:

- **24-hour `initData` replay window.** Captured `initData` remains usable for that period.
  Shortening it would break long-lived Mini App sessions, since Telegram does not refresh it.
- ~~No rate limiting~~ — **implemented** in `api/_ratelimit.js`: per-user, per-bucket fixed
  windows covering swipe, discovery, profile writes, reports, blocks, likes, invoice creation,
  export and deletion. See `docs/SECURITY.md` §4.
- **No automated retention enforcement** (see §4).
