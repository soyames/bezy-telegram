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

This export still stores profile details in per-user App Studio state, and
publishes the same profile to the shared community service so real Pi and
Telegram users can be discovered, liked, matched and messaged. Added dating
photos upload through an authenticated Vercel API to private Vercel Blob; the
separate shared Postgres database holds references only. IndexedDB caches bytes on the viewer's
device, including after reload while browser storage persists. A browser can
evict local cache; the backend can re-serve a photo when online even if the
owner's device is offline. The Pi-hosted App Studio version is unchanged until
code is uploaded. Backend setup is described in `../PI_NETWORK.md`.
The existing
client `activatePremium(paymentId, txid)` cannot establish a verified, durable
server entitlement. Do not deploy it publicly as a working dating app.

The cross-platform integration contract is in [`../PI_NETWORK.md`](../PI_NETWORK.md).
