# Bezy API contract — version 1

The stable machine interface between the Mini App and the backend. Every shape below is
pinned by `tests/contract.test.mjs` (pure — no Firestore, no credentials), so a changed key
set, an added field, or a field leaking past its disclosure boundary fails the suite. To
change the contract, change this document, the test, and the producer together, and bump the
version.

Ground rules that are part of the contract itself:

- All routes are `POST` with `initData` in the JSON body; identity comes only from validated
  Telegram `initData` — there is no user id parameter to tamper with.
- Errors are stable machine codes (never prose). The complete v1 catalogue, each mapped in
  the Mini App: `INVALID_SESSION`, `DATABASE_UNAVAILABLE`, `PROFILE_NOT_FOUND`,
  `TARGET_NOT_FOUND`, `PREMIUM_REQUIRED`, `DISCOVERY_LIMIT_REACHED`,
  `SUPER_LIKE_LIMIT_REACHED`, `PREMIUM_UNAVAILABLE`, `AGE_CONFIRMATION_REQUIRED`,
  `PROCESSING_RESTRICTED`, `RATE_LIMITED`.
- Every response carries `ok: true` on success.
- **Disclosure boundary:** `username` appears only on match cards (`/api/matches`). Deck
  cards, liker cards and every other public shape never carry `username`, `telegramId`,
  `gender` or `seeking`.

## Shapes

### Deck card (`/api/discover` → `profiles[]`)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | target Telegram id — required to name who is swiped on |
| `displayName` | string | |
| `age` | number \| null | |
| `city` | string | |
| `bio` | string | |
| `interests` | string[] | |
| `prompts` | `{ id, answer }[]` | machine ids; question text rendered from `prompt_<id>` |
| `languages` | string[] | ISO 639-1 machine tokens |
| `photoUrl` | string | Telegram photo URL only |
| `compatibility` | number | deterministic score |
| `isNew` | boolean | |

`/api/discover` (200) additionally carries `stats { available, bestMatch, newToday, inYourCity }`,
`preferences { minAge, maxAge, city, sameCityOnly, languages }`, `needsProfile: false`,
`isPremium: boolean` and `quota { discoveryRemaining, superLikesRemaining, limits }`.
Paused variant: `{ ok, profiles: [], needsProfile: false, processingRestricted, processingObjection }`.
Age-gate variant: `{ ok, profiles: [], needsProfile: true, needsAgeConfirmation: true }`.

### Match card (`/api/matches` → `matches[]`)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | |
| `displayName` | string | |
| `age` | number \| null | |
| `city` | string | |
| `bio` | string | |
| `interests` | string[] | |
| `prompts` | `{ id, answer }[]` | |
| `languages` | string[] | |
| `photoUrl` | string | |
| `username` | string | the one place the handle is released: after a mutual match |
| `sharedSignals` | `{ type, values }[]` | `type` ∈ `interests` \| `city` \| `age` |
| `matchId` | string | |
| `matchedAtMs` | number | |
| `matchedAt` | string \| null | ISO |

### Liker card (`/api/likes` → `likes[]`)

`{ id, displayName, age, city, bio, interests, photoUrl, action: 'like' | 'super', likedAt, likedAtMs }`.
Free members receive `403 { error: 'PREMIUM_REQUIRED', likeCount }` — a count only, never data.

### `/api/profile/me` (200)

`{ ok, ageEligibility { confirmed, confirmedAt, method }, notifications { matches, super_likes, profile_reminders }, processingRestricted, processingObjection, profile, needsProfile }`.
`profile` = `{ displayName, age, city, gender, seeking, interests, bio, prompts, languages, discoverable, profileComplete }`.

### `/api/premium` `status` (200)

`{ ok, premium { active, planId, expiresAt, daysRemaining, revoked, revocationReason }, benefits[], plans[{ id, stars, currency, durationMonths, bestValue }], limits, usage { discoveryActions, superLikes, discoveryRemaining, superLikesRemaining } }`.

### `/api/swipe` (200)

`{ ok, action, matched }`. Quota refusals are `{ error, usage, limits }` with a catalogue code.

### `/api/relationship`

`block`/`unblock`: `{ ok, blocked }` · `report`: `{ ok, reported, reportId?, reason? }` ·
`unmatch`: `{ ok, unmatched }` · `list_blocks`: `{ ok, blocked[] }`.

### `/api/account`

`export`: `{ ok, data }` · `restrict`/`unrestrict`: `{ ok, restricted, alreadyInState }` ·
`object`/`unobject`: `{ ok, objected, alreadyInState }` ·
`delete`: `{ ok, deleted, alreadyDeleted?, matchesEnded?, retained }`.

## Changelog

- **v1** — initial versioning. Producers exported (`publicProfile`, `publicMatch`,
  `publicLiker`, `publicPlans`, `normalizeProfile`, `normalizePreferences`); pinned by
  `tests/contract.test.mjs`, which runs without Firestore. The suite caught a real
  temporal-dead-zone crash in `api/_notify.js` on its first run — the contract exists
  precisely so that class of failure is caught without the quota-gated suites.
