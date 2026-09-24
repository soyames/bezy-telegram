"use client";

import { useEffect, useState } from "react";
import { useBezy } from "@/contexts/bezy-context";
import { useNav } from "@/components/bezy/nav";
import { Overlay, OverlayHeader, SelectCard } from "@/components/bezy/pieces";
import { Button, IconCheck, IconInfo, IconStar, Pill, cx } from "@/components/bezy/ui";
import { premiumExpiryLabel } from "@/lib/bezy/data";
import { fetchPiCheckout, type PiCheckout } from "@/lib/bezy/media";
import { buyPlan } from "@/lib/bezy/pi-checkout";

// Plans are named, not identified: "quarterly" is a server token, not customer-facing copy.
const PLAN_LABEL: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

// Only what the code actually delivers today. Extra Super Likes, filter upgrades and a
// discover ranking boost are not built, so they are not sold — add each line here only
// once its feature ships.
const BENEFITS = [
  "See everyone who already liked you",
  "Like them back and match instantly",
  "Nobody is told that you looked at their profile",
];

export function PremiumScreen() {
  const { premiumOpen, closePremium } = useNav();
  const { premium, isPremiumActive, activatePremium, toast } = useBezy();
  const [checkout, setCheckout] = useState<PiCheckout | null>(null);
  const [selected, setSelected] = useState("monthly");
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Plans and entitlement both come from the server, so the price the member sees is the
  // price the server will insist on.
  useEffect(() => {
    if (!premiumOpen) return;
    let live = true;
    fetchPiCheckout()
      .then((next) => {
        if (!live) return;
        setCheckout(next);
        if (!next.plans.some((p) => p.id === selected)) {
          setSelected(next.plans[0]?.id ?? "");
        }
      })
      .catch(() => {
        if (live) setError("Premium isn't available right now. Please try again shortly.");
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [premiumOpen]);

  if (!premiumOpen) return null;

  const plans = checkout?.plans ?? [];
  const plan = plans.find((p) => p.id === selected) ?? plans[0] ?? null;
  const available = Boolean(checkout?.configured) && plan !== null;

  async function handlePurchase() {
    if (!plan) {
      setError("Premium isn't available to purchase right now. Please try again shortly.");
      return;
    }
    setError(null);
    setPurchasing(true);
    try {
      // Bezy's server approves and completes the payment with Pi and records it; the
      // entitlement it returns is the durable one.
      const purchase = await buyPlan(plan);
      activatePremium(purchase.paymentId, purchase.txid);
      toast(`Premium unlocked for ${plan.months} month${plan.months === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong completing your payment. Please try again.",
      );
    } finally {
      setPurchasing(false);
    }
  }

  const active = isPremiumActive;

  return (
    <Overlay onClose={closePremium}>
      <OverlayHeader title="Bezy Premium" onBack={closePremium} />
      <div className="flex-1 overflow-y-auto bz-no-scrollbar p-5">
        <div className="bz-premium-grad relative overflow-hidden rounded-[1.75rem] p-6 text-white">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20">
            <IconStar className="h-6 w-6" />
          </span>
          <h2 className="mt-3 font-display text-2xl font-bold">Bezy Premium</h2>
          <p className="mt-1 text-sm text-white/90">
            See who already liked you, and match by liking back. Paid in Pi.
          </p>
          {plan ? (
            <p className="mt-4 font-display text-3xl font-bold">
              {plan.pi} <span className="text-base font-semibold text-white/85">Pi</span>
              <span className="ml-2 text-sm font-semibold text-white/85">
                for {plan.months} month{plan.months === 1 ? "" : "s"}
              </span>
            </p>
          ) : (
            <p className="mt-4 text-sm text-white/85">Pricing is loading…</p>
          )}
        </div>

        {/* Same three plans as the Telegram mini app: monthly, quarterly, yearly. */}
        {plans.length > 0 ? (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-bz-faint">
              Choose your plan
            </p>
            <div className="space-y-2">
              {plans.map((p) => (
                <SelectCard
                  key={p.id}
                  active={p.id === plan?.id}
                  label={`${PLAN_LABEL[p.id] ?? p.id} · ${p.pi} Pi`}
                  desc={`${p.months} month${p.months === 1 ? "" : "s"} of Premium`}
                  onClick={() => setSelected(p.id)}
                />
              ))}
            </div>
          </div>
        ) : null}

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
            disabled={!available || purchasing}
            block
            className={cx(!available && "opacity-60")}
          >
            {purchasing
              ? "Confirming payment…"
              : !available
                ? "Premium unavailable"
                : `${active ? "Renew" : "Subscribe"} · ${plan?.pi} Pi for ${plan?.months} month${
                    plan?.months === 1 ? "" : "s"
                  }`}
          </Button>
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-bz-panel-2 p-4 text-xs leading-relaxed text-bz-muted">
          <IconInfo className="mt-0.5 h-4 w-4 shrink-0 text-bz-rose" />
          <span>
            You approve every payment yourself in Pi — Bezy never charges you automatically. Premium
            unlocks only once Pi confirms the payment, and runs for the length of the plan you
            chose. There is no automatic renewal: come back here whenever you want to extend.
          </span>
        </div>
      </div>
    </Overlay>
  );
}
