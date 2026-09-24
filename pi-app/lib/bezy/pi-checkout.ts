"use client";

import {
  approvePiPayment,
  cancelPiPayment,
  completePiPayment,
  type PiEntitlement,
  type PiPlan,
} from "@/lib/bezy/media";

/**
 * Buy Premium. Pi drives the sheet; Bezy's server approves and completes it against Pi's
 * API and returns the entitlement it recorded, so the result reflects a durable server
 * record rather than anything this browser claimed. The amount comes from the plan the
 * server published — the server rejects any payment that does not match it. Until it has a
 * Pi API key it answers 503 and the caller shows Premium as unavailable; it never
 * half-charges.
 */
export interface PiPurchase {
  paymentId: string;
  txid: string;
  entitlement: PiEntitlement;
}

export function buyPlan(plan: PiPlan): Promise<PiPurchase> {
  const pi = typeof window !== "undefined" ? window.Pi : undefined;
  if (!pi?.createPayment) {
    return Promise.reject(new Error("Open Bezy in Pi Browser to buy Premium."));
  }

  return new Promise<PiPurchase>((resolve, reject) => {
    pi.createPayment(
      {
        amount: plan.pi,
        memo: `Bezy Premium — ${plan.months} month${plan.months === 1 ? "" : "s"}`,
        // The server reads the plan back off the payment and prices it itself.
        metadata: { plan: plan.id },
      },
      {
        onReadyForServerApproval: (paymentId) => {
          approvePiPayment(paymentId).catch(reject);
        },
        onReadyForServerCompletion: (paymentId, txid) => {
          completePiPayment(paymentId, txid).then(
            (entitlement) => resolve({ paymentId, txid, entitlement }),
            reject,
          );
        },
        onCancel: (paymentId) => {
          // Best-effort: the member abandoned the sheet, so record it and tell them plainly.
          void cancelPiPayment(paymentId).catch(() => {});
          reject(new Error("Payment cancelled — you weren't charged."));
        },
        onError: (error) => reject(error),
      },
    );
  });
}
