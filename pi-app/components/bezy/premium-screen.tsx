"use client";

import { useState } from "react";
import { useBezy } from "@/contexts/bezy-context";
import { useNav } from "@/components/bezy/nav";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { Overlay, OverlayHeader } from "@/components/bezy/pieces";
import { Button, IconCheck, IconInfo, IconStar, Pill, cx } from "@/components/bezy/ui";
import { PREMIUM_DAYS, premiumExpiryLabel } from "@/lib/bezy/data";
import { PRODUCT_CONFIG } from "@/lib/product-config";

const BENEFITS = [
  "See everyone who already liked you",
  "Advanced discovery filters",
  "Extra Super Likes each week",
  "Increased visibility in Discover",
];

// Shared discovery, likes and entitlement verification are not connected in this
// exported build. Do not accept real Pi for benefits that cannot yet be delivered.
const PURCHASES_ENABLED = false;

export function PremiumScreen() {
  const { premiumOpen, closePremium } = useNav();
  const { premium, isPremiumActive, activatePremium, toast } = useBezy();
  const auth = usePiAuth();
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!premiumOpen) return null;

  const products = auth?.products ?? null;
  const sdk = auth?.sdk ?? null;
  const product = products?.find((p) => p.id === PRODUCT_CONFIG.PRODUCT_6ab4ec72c8d845bd3f689671) ?? null;
  const amount = product?.price_in_pi;

  async function handlePurchase() {
    if (!PURCHASES_ENABLED || !product || !sdk) {
      setError("Premium isn't available to purchase right now. Please try again shortly.");
      return;
    }
    setError(null);
    setPurchasing(true);
    try {
      const result = await sdk.makePurchase(product.slug);
      if (result.ok) {
        activatePremium(result.paymentId, result.txid);
        toast(`Premium unlocked for ${PREMIUM_DAYS} days.`);
      } else {
        setError("Your payment didn't complete. You haven't been charged.");
      }
    } catch (e: any) {
      const code = e?.code;
      if (code === "purchase_cancelled") {
        setError("Payment cancelled — you weren't charged.");
      } else if (code === "product_not_found") {
        setError("Premium isn't available to purchase right now.");
      } else {
        setError("Something went wrong completing your payment. Please try again.");
      }
    } finally {
      setPurchasing(false);
    }
  }

  const active = isPremiumActive;

  return (
    <Overlay onClose={closePremium}>
      <OverlayHeader title="Bezy Premium" onBack={closePremium} />
      <div className="flex-1 overflow-y-auto bz-no-scrollbar p-5">
        <div className="bz-hero-grad relative overflow-hidden rounded-[1.75rem] p-6 text-white">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20">
            <IconStar className="h-6 w-6" />
          </span>
          <h2 className="mt-3 font-display text-2xl font-bold">Bezy Premium</h2>
          <p className="mt-1 text-sm text-white/90">
            {PREMIUM_DAYS} days of extra visibility and control, paid once in Pi.
          </p>
          {product ? (
            <p className="mt-4 font-display text-3xl font-bold">
              {amount} <span className="text-base font-semibold text-white/85">Pi</span>
            </p>
          ) : (
            <p className="mt-4 text-sm text-white/85">Pricing is loading…</p>
          )}
        </div>

        {active ? (
          <div className="mt-4 rounded-2xl border border-bz-line bg-bz-panel p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-bz-plum-soft text-bz-plum">
                <IconCheck className="h-4 w-4" />
              </span>
              <p className="text-sm font-semibold text-bz-ink">Premium is active</p>
              <Pill tone="plum" className="ml-auto">
                Active
              </Pill>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-bz-muted">
              Your benefits are unlocked until <span className="font-semibold text-bz-ink">{premiumExpiryLabel(premium.expiresAt)}</span>.
              There&apos;s no automatic renewal — you can extend anytime below.
            </p>
          </div>
        ) : premium.expiresAt ? (
          <div className="mt-4 rounded-2xl border border-bz-line bg-bz-panel-2 p-4">
            <p className="text-sm font-semibold text-bz-ink">Premium expired</p>
            <p className="mt-1 text-xs leading-relaxed text-bz-muted">
              Your last period ended on {premiumExpiryLabel(premium.expiresAt)}. Renew below to unlock your
              benefits again.
            </p>
          </div>
        ) : null}

        <div className="mt-5 space-y-2.5">
          {BENEFITS.map((b) => (
            <div key={b} className="flex items-start gap-3 rounded-2xl border border-bz-line bg-bz-panel p-3.5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bz-rose-soft text-bz-rose">
                <IconCheck className="h-3.5 w-3.5" />
              </span>
              <p className="text-sm leading-relaxed text-bz-ink">{b}</p>
            </div>
          ))}
        </div>

        {error ? (
          <p className="mt-4 rounded-2xl bg-bz-danger-soft px-4 py-3 text-sm text-bz-danger">{error}</p>
        ) : null}

        <div className="mt-5">
          <Button
            onClick={handlePurchase}
            disabled={!PURCHASES_ENABLED || !product || purchasing}
            block
            className={cx((!PURCHASES_ENABLED || !product) && "opacity-60")}
          >
            {!PURCHASES_ENABLED
              ? "Premium unavailable until real matching is ready"
              : purchasing
              ? "Confirming payment…"
              : active
                ? `Renew · ${amount ?? "…"} Pi for ${PREMIUM_DAYS} more days`
                : product
                  ? `Upgrade to Premium · ${amount} Pi`
                  : "Premium unavailable"}
          </Button>
          {!PURCHASES_ENABLED && <p className="mt-2 text-xs text-bz-muted">We are connecting real profiles and messages before enabling purchases.</p>}
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-bz-panel-2 p-4 text-xs leading-relaxed text-bz-muted">
          <IconInfo className="mt-0.5 h-4 w-4 shrink-0 text-bz-rose" />
          <span>
            You approve every payment yourself in Pi — Bezy never charges you automatically. Premium unlocks
            only after your payment is confirmed, and lasts exactly {PREMIUM_DAYS} days. When it expires you can
            come back here to renew manually.
          </span>
        </div>
      </div>
    </Overlay>
  );
}
