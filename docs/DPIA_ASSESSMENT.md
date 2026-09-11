# Bezy — DPIA screening

**This is a screening, not a completed DPIA, and it is not a legal opinion.** It applies the
Art. 35 criteria to what Bezy's code actually does, so a qualified adviser can decide whether
a full DPIA is required and, if so, start from a factual basis rather than a blank page.

Nothing here concludes that a DPIA is legally mandatory, and nothing here concludes that one
can be skipped. That determination is **LEGAL REVIEW REQUIRED**.

- **Scope:** the Bezy Telegram Mini App, bot and Vercel API as implemented at the time of the
  GDPR readiness audit.
- **Controller:** DIGITAL CONCORDIA (see `docs/DATA_PROCESSING_MAP.md`).
- **Companion document:** `DATA_PROCESSING_MAP.md` holds the data inventory, legal-basis
  analysis and transfer findings this screening relies on.

---

## 1. Art. 35(3) — the three listed cases

| Case | Applies? | Reasoning against the actual system |
| --- | --- | --- |
| (a) Systematic and extensive **automated evaluation** producing legal or similarly significant effects | **Unlikely** | Discovery scores and orders candidates, but no decision with legal or similarly significant effect follows. Every like/pass is made by the user |
| (b) Processing of **special categories** on a large scale | **Open** | Turns entirely on the Art. 9 question in `DATA_PROCESSING_MAP.md` §3. If `gender` + `seeking` are Art. 9 data, this criterion becomes live once the user base grows |
| (c) Systematic **monitoring of a publicly accessible area** on a large scale | **No** | Bezy monitors no physical or public space |

---

## 2. WP29 nine-criteria screening

The WP29 guidance (endorsed by the EDPB) treats meeting **two or more** criteria as a strong
indicator that a DPIA is needed.

| # | Criterion | Met? | Basis in the code |
| --- | --- | --- | --- |
| 1 | Evaluation or scoring | **Yes** | `api/discover.js` computes a compatibility score and ranks the deck |
| 2 | Automated decision-making with legal/significant effect | **No** | Ranking only; the human chooses |
| 3 | Systematic monitoring | **No** | No behavioural tracking, no analytics, no cookies, no location tracking. Only self-entered city |
| 4 | Sensitive data or data of a highly personal nature | **Likely yes** | Dating profiles, `gender`/`seeking`, free-text `bio`. Even if Art. 9 is not engaged, dating data is highly personal |
| 5 | Data processed on a large scale | **Not yet** | 1 real account today. A launch to a ~60k audience would change this answer |
| 6 | Matching or combining datasets | **Partly** | Bezy combines its own profile and action data. It does not combine external datasets |
| 7 | Data concerning vulnerable subjects | **Partly** | Adults only by self-declaration, so minors are excluded by policy but not by verification. Dating users can be vulnerable to harassment, stalking and fraud |
| 8 | Innovative use or new technology | **No** | Conventional web technology. No biometrics, no AI/ML, no face matching |
| 9 | Processing preventing a right or use of a service | **Partly** | A block or a moderation decision restricts another user's access to Bezy |

**Count today: roughly 4 of 9 clearly or partly met (1, 4, 7, 9), with 5 pending scale.**

That is above the two-criterion threshold. On a plain reading of the guidance, **a DPIA
should be treated as likely required before a public launch**, primarily because of criterion 4
combined with the intended scale.

---

## 3. Risks to individuals

Identified from the architecture rather than from a template.

| Risk | Severity | Current mitigation | Gap |
| --- | --- | --- | --- |
| Someone is outed as a Bezy user, or their orientation inferred | **High** | Membership cannot be probed: non-existent, hidden and blocked targets return identical responses. No public profiles, no web-indexable pages | Residual: any match learns the counterpart's Telegram identity — inherent to the product |
| Harassment or unwanted contact after a match | **High** | Bezy block, unmatch and report; Telegram's own block/report handles the conversation layer | No automated content moderation. Response times are not guaranteed |
| A minor accesses an adult service | **High** | Server-enforced 18+ gate: no profile, no deck, no swiping without a declaration; explicit affirmative action; disclosed as self-declaration | Self-declaration can be defeated by simply lying. Verification deliberately not implemented (see §5) |
| Profile data exposed by a breach | **High** | Deny-all Firestore rules; no direct client access; Admin SDK only; credentials in env vars; no secrets logged; per-user, per-bucket rate limiting on every endpoint | No penetration test. 24-hour `initData` replay window |
| Data retained longer than necessary | **Medium** | User-initiated deletion removes profile and activity, with fan-out cleanup; operator-run retention tool applies operational defaults (abandoned signups 90d, ended matches 180d, spent invoices 30d, stale counters 7d, support requests 365d) | Payment and report periods deliberately unset pending legal review; no scheduler (operator-invoked by design) |
| Payment data linked to a dating profile | **Medium** | Payment records hold ids and amounts only — no profile content. No card data ever reaches Bezy | Payment records survive deletion; retention period unverified |
| Transfer of EU personal data outside the EEA | **Medium/High** | Firestore is in `europe-west1` | Controller established in Benin; Vercel region unverified; no verified transfer mechanism |
| Impersonation / fake profiles | **Medium** | Telegram identity is cryptographically bound; reporting exists | No identity verification. One Telegram account, one profile |
| Report misuse to harm another user | **Low** | Reports are reviewed by a human before any action | No appeal process |

---

## 4. Measures already implemented

Verified in code during the audit, not aspirational:

- Data minimisation by architecture: **ordinary Telegram conversations are never processed by
  Bezy** — the single controlled exception is support-intake text, stored in the user's own
  support request (≤1000 chars) and erased with the account.
- No analytics, no cookies, no tracking, no advertising identifiers, no third-party SDKs
  beyond Telegram's own Mini App script.
- Photos are referenced by Telegram URL, not copied into Bezy storage.
- Server-side enforcement of the age gate, Premium entitlement, quotas and blocks.
- Anti-enumeration of Bezy membership.
- Working access, portability and erasure, with fan-out cleanup of mirrored records.
- Reports store no profile snapshot, so erasure leaves no residue in moderation records.
- Deny-all Firestore rules with all access mediated by the server.
- EU-region database.

---

## 5. Deliberate design decisions worth recording

**Age assurance.** Bezy uses self-declaration and says so plainly. Stronger age assurance —
ID checks, facial age estimation, third-party providers — would itself require processing far
more sensitive data (identity documents, biometrics) about every user. For an MVP at this
scale that trade-off was judged to increase privacy risk rather than reduce it. This is a
judgement a regulator could disagree with, particularly for an adult service, and it is
**LEGAL REVIEW REQUIRED**.

**No consent banner.** There is no cookie or tracking consent flow because there is nothing to
consent to: the only client-side storage is a language preference. Adding a banner would be
theatre, not compliance.

**Bezy-native messaging (ADR 0009, 2026-09-11).** Messages between matched users are now
stored in Firestore and delivered inside the Mini App. Mitigations already implemented:
message content is never logged, never enters error responses, and never leaves Bezy (the
Telegram notification is generic, capped, and preference-gated); access requires an active
mutual match with no blocks plus Premium, verified server-side on every request; account
deletion erases conversations; Firestore stays deny-all to clients. **LEGAL REVIEW
REQUIRED:** this extends the processed data (private message content) beyond the previous
architecture, so the screening above must be re-run against the messaging scope — in
particular the retention question (no period defined for active conversations) and the
privacy-policy text, which still describes Telegram-hosted chats.

---

## 6. Screening conclusion

**A full DPIA appears likely to be required before a public launch**, on the strength of
criterion 4 (highly personal dating data) together with the intended scale, and subject to
the unresolved Art. 9 question.

At the current scale — one real account and a private development stage — the processing is
not large-scale, and the practical risk is correspondingly low.

Recommended sequence:

1. Resolve the **Art. 9 question** first. It determines the legal basis, whether explicit
   consent is required, and whether Art. 35(3)(b) is engaged.
2. Resolve the **establishment and Art. 27 representative** question, given a Benin-registered
   controller serving EU users from Austria.
3. Verify the **processor and transfer** position for Vercel and Google/Firebase.
4. If a DPIA is required, complete it using §§1–5 above as the factual input.
5. Only then open paid Premium to a wide audience.

**Do not treat this document as a completed DPIA, and do not represent it to anyone as one.**
