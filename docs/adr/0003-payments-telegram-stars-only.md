# ADR 0003 — Telegram Stars is the only payment rail

- **Status:** Accepted (recorded 2026-09-10; decision predates the record)
- **Permanent decision per roadmap §1.**

## Context

Bezy Premium needs payments. Options considered: Telegram Stars, Smart Glocal, card
processing. Card processing would make Bezy a payment processor with PCI scope and card data;
Smart Glocal adds a second provider relationship. Telegram Stars is native to the Telegram
distribution channel (ADR 0001) and never exposes card details to Bezy.

## Decision

Payments are **Telegram Stars (XTR) only**. No Smart Glocal, no cards, no other provider.
Prices are server-authoritative; the Mini App only displays what the API returns. The invoice
`provider_token` stays empty, so Bezy holds no payment secrets.

## Consequences

- Premium activation happens only after the webhook receives a validated
  `successful_payment`; refunds flow through Telegram's `refundStarPayment` with the payment
  record updated in lockstep (`api/_premium.js`).
- A Stars balance is required for any real purchase; the paid path has never run end to end
  in production (roadmap P0-1…P0-3, R2/R3).
- Any future feature implying value transfer outside Stars must stop and be reported (§18-C).
- Depends on: ADR 0001.
