# ADR 0007 — Localization is presentation only

- **Status:** Accepted (recorded 2026-09-10; decision predates the record)
- **Permanent decision per roadmap §1.**

## Context

Bezy ships EN + FR, and localized copy lives in `locales/en.json` and `locales/fr.json`.
Localization that leaks into machine identifiers would break the API, corrupt stored data or
create lookalike URLs.

## Decision

Localization is presentation only. Never translate: API paths, URLs, Telegram links, JSON
keys, Firestore collections/fields, error codes, environment variables, JS identifiers, or
machine tokens such as `DELETE` (the typed deletion confirmation).

## Consequences

- Stored values are machine tokens (prompt ids, language codes, notification category ids,
  enum values like `gender`) and are rendered from the reader's locale — one stored value
  renders in every language.
- The localization suite enforces this: translations may not contain API paths, URLs,
  machine error codes or environment variables; the canonical routes, support address and
  bot link are pinned; catalogues must not silently duplicate English.
- The API contract suite pins the same boundary on response shapes.
