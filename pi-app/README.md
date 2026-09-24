# App Studio export (September 24, 2026)

This Next.js folder is the Pi App Studio download, isolated from the Telegram
root app so its import structure remains intact.

Changes from the export:

- Branding matches the export exactly: the same supplied artwork, the same
  layout and the same brand-surface color it blends into. The two marks travel
  as bundled module assets (`lib/bezy/assets/`) instead of `public/` paths
  because the App Studio host serves `/_next/static` but not `public/`. No
  image pixels were redrawn or changed.
- Premium checkout is live for one benefit: the "Likes you" screen, which lists
  everyone who already liked you and lets you match by liking back. Its copy
  promises only that. Extra Super Likes, filter upgrades and a discover ranking
  boost are NOT built — do not add them to `BENEFITS` in
  `components/bezy/premium-screen.tsx` until the feature exists.
- Area is a typed city, not a fixed list. `AREAS` is a suggestion list; a typed
  city is normalized by `areaFromCity()` (mirrored in
  `../shared-api/api/social/_helpers.js`), so "London" still finds "Greater
  London" and anything else is matched on its own text.

This export still stores profile details in per-user App Studio state, and
publishes the same profile to the shared community service so real Pi and
Telegram users can be discovered, liked, matched and messaged. Added dating
photos upload through an authenticated Vercel API to private Vercel Blob; the
separate shared Postgres database holds references only. IndexedDB caches bytes on the viewer's
device, including after reload while browser storage persists. A browser can
evict local cache; the backend can re-serve a photo when online even if the
owner's device is offline. Backend setup is described in `../PI_NETWORK.md`.

Known gap: `activatePremium(paymentId, txid)` runs entirely on the client, so
the entitlement is not verified server-side — it can be forged from the console
and is lost if Pi userState is cleared. Server-verified receipts (PI_NETWORK.md
contract item 5) are still unbuilt.

The cross-platform integration contract is in [`../PI_NETWORK.md`](../PI_NETWORK.md).
