# Bezy — packet for qualified legal review

This file consolidates the questions counsel must resolve and the repository facts that
answer the factual half of each question. It makes **no legal conclusions**; engineering
preparation only. Maintained alongside the implementation — reconcile on change.

## The questions (with factual pointers)

1. **Art. 9 — `gender` + `seeking` (roadmap P0-5).** Facts: closed enums
   (`api/profile/me.js:5-6`), mandatory for profile completion, stored in
   `users/{id}.profile`, used *only* for reciprocal deck eligibility
   (`api/discover.js` `genderMatches`), never displayed on any public card, never scored,
   never inferred; no sexual-orientation collection or inference anywhere; no
   `relationshipIntent` field exists. Question for counsel: does storing and
   eligibility-using these two fields in a dating service engage Art. 9, and on what
   basis may it be processed? This decision gates RT-4 (consent withdrawal) and the P1-3
   `relationshipIntent` sub-item.
2. **Art. 6 legal bases.** Facts: purpose list in Privacy Policy §2/§4;
   `DATA_PROCESSING_MAP.md` §2. Question: basis per purpose (contract / legitimate
   interests / consent), especially discovery, notifications, support, retention.
3. **DPIA (P0-11).** Facts: `docs/DPIA_ASSESSMENT.md` is a screening stating a full DPIA
   "appears likely to be required" on criterion 4 + intended scale. The field-level
   register facts are in the session-audit record and `DATA_PROCESSING_MAP.md`.
4. **Art. 27 EU representative (P0-6).** Fact: controller established in Benin (operator
   identity §P0-12; Privacy Policy §1). Question: is an EU representative required and who?
5. **Processors / transfers (P0-7).** Facts: processors are Telegram (identity, photos
   CDN, messaging, payments), Vercel (hosting/logs), Google Firestore (europe-west1);
   no others; no DPA/SCC conclusions exist in the repository
   (`DATA_PROCESSING_MAP.md` §7).
6. **Retention periods (P0-8).** Facts: operational defaults are implemented and
   documented (abandoned signups 90d, ended matches 180d, spent invoices 30d, rate-limit
   counters 7d, support requests 365d — the last is a *proposed operational default,
   subject to legal confirmation*); payments and reports are deliberately unset in
   `api/_retention.js`. Questions: statutory periods for payment records and safety
   reports in the applicable jurisdiction(s).
7. **Supervisory authority (P0-9).** Question: which authority is competent given the
   Benin establishment and EU users?
8. **18+ self-declaration sufficiency (P0-10).** Facts: server-enforced declaration,
   stored with timestamp and method `self_declaration`; no verification; disclosed
   everywhere. Question: sufficiency for an adult-only service in target jurisdictions.
9. **Consumer law — withdrawal/immediate performance (CN-5).** Facts: Terms state
   one-off fixed term, no auto-renewal, immediate revocation on refund; no legal
   conclusion drawn. Question: EU withdrawal-right treatment for an immediately-performed
   digital service.
10. **VAT/OSS (CN-6).** Facts: Stars-only, no tax conclusion asserted anywhere.
11. **Qualified review of Terms and Privacy (P0-13).** Both drafted, EN + FR, and
    reconciled with implementation on 2026-09-10 (see the reconciliation session log).
    To be reviewed as drafted.

## Standing implementation facts counsel can rely on

- No chat content, media binaries, GPS, analytics, cookies, or advertising identifiers
  are collected (pinned by the localization suite and the data map).
- Firestore client access is deny-all; all access is via the validated-initData API.
- Rights (access/portability/erasure/restriction/objection) are self-service and
  documented; deletion retains exactly four categories (payments, invoice links, reports
  filed, reports about) — Privacy Policy §14.
- The matching engine uses declared data only and is fully documented
  (`ARCHITECTURE.md` "Discovery strategy", `OUTCOME_DATA_SPEC.md`).

## How to use

Hand the full register (§field inventory in the audit record + `DATA_PROCESSING_MAP.md`)
with this file. If a fact changes, update both. If counsel resolves a question, move the
roadmap item out of 🔴 with the decision recorded.
