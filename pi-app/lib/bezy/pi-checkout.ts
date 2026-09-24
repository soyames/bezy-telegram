"use client";

import {
  approvePiPayment,
  cancelPiPayment,
  completePiPayment,
  type PiEntitlement,
} from "@/lib/bezy/media";
import { PREMIUM_DAYS } from "@/lib/bezy/data";

/**
 * Buy Premium. Pi drives the sheet; Bezy's server approves and completes it against Pi's
 * API and returns the entitlement it recorded, so the result reflects a durable server
 * record rather than anything this browser claimed. Until the server has a Pi API key it
 * answers 503 and the caller shows Premium as unavailable — it never half-charges.
 */
export interface PiPurchase {
  paymentId: string;
  txid: string;
  entitlement: PiEntitlement;
}

export function buyPremium(product: { id: string; price_in_pi: number }): Promise<PiPurchase> {
  const pi = typeof window !== "undefined" ? window.Pi : undefined;
  if (!pi?.createPayment) {
    return Promise.reject(new Error("Open Bezy in Pi Browser to buy Premium."));
  }

  return new Promise<PiPurchase>((resolve, reject) => {
    pi.createPayment(
      {
        amount: product.price_in_pi,
        memo: `Bezy Premium — ${PREMIUM_DAYS} days`,
        metadata: { productId: product.id, days: PREMIUM_DAYS },
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
