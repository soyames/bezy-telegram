# App Studio export (September 24, 2026)

This Next.js folder is the Pi App Studio download, isolated from the Telegram
root app so its import structure remains intact.

Changes from the export:

- Onboarding displays the supplied logo at a readable size. Header and loading
  use the original B mark, cropped through CSS from the same supplied PNG.
  No image pixels were redrawn or changed.
- Premium purchases in this exported source are disabled while real discovery,
  messaging and premium benefits are unavailable. The already hosted App
  Studio version is unchanged until updated separately.

This export stores profiles in per-user App Studio state. It cannot show other
Pi or Telegram users. Uploaded photos are tab-scoped object URLs. Its existing
client `activatePremium(paymentId, txid)` cannot establish a verified, durable
server entitlement. Do not deploy it publicly as a working dating app.

The cross-platform integration contract is in [`../PI_NETWORK.md`](../PI_NETWORK.md).
