import { db } from './_firebase.js';
import { requirePost, requireTelegramUser } from './_telegram.js';
import { premiumState } from './_premium.js';

// Data-subject rights that Bezy can genuinely honour automatically:
//   action: 'export' — GDPR Art. 15 access / Art. 20 portability, as machine-readable JSON
//   action: 'delete' — GDPR Art. 17 erasure
//
// Rights that need a human (rectification beyond profile editing, restriction, objection,
// complaints) are handled by contacts@digitalconcordia.com and are described in the Mini App
// and the Privacy Policy. Nothing here promises automation that does not exist.

const DELETE_CONFIRMATION = 'DELETE';

function iso(value) {
  const ms = value?.toMillis?.() ?? (value instanceof Date ? value.getTime() : null);
  return ms ? new Date(ms).toISOString() : null;
}

/**
 * Everything Bezy holds about the caller, assembled from their own records only.
 * Other people's personal data is never included: likes received are returned as a count,
 * and matches expose only the counterpart's Telegram id, which the user already has.
 */
async function exportData(firestore, userId) {
  const userRef = firestore.collection('users').doc(userId);
  const snap = await userRef.get();
  if (!snap.exists) return { account: null, note: 'No Bezy account exists for this Telegram user.' };
  const data = snap.data() || {};

  const [actions, blocks, likesReceived, matchesSnap, payments, reports] = await Promise.all([
    userRef.collection('actions').get(),
    userRef.collection('blocks').get(),
    userRef.collection('likesReceived').get(),
    firestore.collection('matches').where('participants', 'array-contains', userId).get(),
    firestore.collection('bezyPayments').where('telegramUserId', '==', userId).get(),
    firestore.collection('reports').where('reporterId', '==', userId).get()
  ]);

  return {
    exportedAt: new Date().toISOString(),
    account: {
      telegramId: data.telegramId ?? null,
      firstName: data.firstName ?? null,
      lastName: data.lastName ?? null,
      username: data.username ?? null,
      languageCode: data.languageCode ?? null,
      photoUrl: data.photoUrl ?? null,
      isPremiumTelegram: data.isPremiumTelegram ?? null,
      createdAt: iso(data.createdAt),
      updatedAt: iso(data.updatedAt)
    },
    ageEligibility: {
      confirmed: data.ageEligibilityConfirmed === true,
      confirmedAt: iso(data.ageEligibilityConfirmedAt),
      method: data.ageEligibilityMethod ?? null
    },
    profile: data.profile ?? null,
    discoveryPreferences: data.preferences ?? null,
    dailyUsage: data.usage ?? null,
    premium: { ...premiumState(data), raw: data.bezyPremium ? { planId: data.bezyPremium.planId ?? null, purchasedAt: iso(data.bezyPremium.purchasedAt), revokedAt: iso(data.bezyPremium.revokedAt) } : null },
    decisions: actions.docs.map((d) => ({ targetTelegramId: d.id, action: d.data().action, at: iso(d.data().createdAt) })),
    blocked: blocks.docs.map((d) => ({ targetTelegramId: d.id, at: iso(d.data().createdAt) })),
    // A count only: revealing who liked you would disclose other people's personal data.
    likesReceivedCount: likesReceived.size,
    matches: matchesSnap.docs.map((d) => ({
      matchId: d.id,
      otherTelegramId: (d.data().participants || []).find((p) => p !== userId) ?? null,
      active: d.data().active !== false,
      createdAt: iso(d.data().createdAt),
      endedAt: iso(d.data().endedAt)
    })),
    reportsYouFiled: reports.docs.map((d) => ({ reason: d.data().reason, status: d.data().status, at: iso(d.data().createdAt) })),
    payments: payments.docs.map((d) => ({
      chargeId: d.id, planId: d.data().planId, stars: d.data().stars, currency: d.data().currency,
      status: d.data().status, refundStatus: d.data().refundStatus ?? 'none',
      paidAt: iso(d.data().processedAt), refundedAt: iso(d.data().refundedAt)
    })),
    notes: [
      'Conversations take place in Telegram and are not stored by Bezy.',
      'Reports filed about you are not included: disclosing them would identify the reporter.',
      'Payment records are retained for accounting purposes after account deletion.'
    ]
  };
}

/**
 * Erasure. Removes the profile and all dating activity, and makes the account
 * undiscoverable immediately. Idempotent: deleting twice is safe and reports the same
 * outcome.
 *
 * Deliberately retained:
 *   - bezyPayments: financial records kept for accounting/tax obligations. They hold a
 *     Telegram id, a plan, an amount and timestamps — no profile content — and are the
 *     minimum needed to reconcile a Stars transaction. Retention period is a LEGAL REVIEW
 *     item, not something this code should invent.
 *   - reports filed BY others ABOUT this user: deleting them would let a user erase the
 *     safety record of their own conduct. They reference Telegram ids only.
 */
async function deleteAccount(firestore, userId) {
  const userRef = firestore.collection('users').doc(userId);
  const snap = await userRef.get();
  if (!snap.exists) return { deleted: true, alreadyDeleted: true, retained: {} };

  // Remove this user from other people's "who liked you" lists before their own action
  // records are destroyed, since those records are what identify the fan-out targets.
  const actions = await userRef.collection('actions').get();
  const mirrors = firestore.batch();
  for (const doc of actions.docs) {
    mirrors.delete(firestore.collection('users').doc(doc.id).collection('likesReceived').doc(userId));
  }
  // Blocks placed on others leave a mirror under the blocked account; clear those too.
  const blocks = await userRef.collection('blocks').get();
  for (const doc of blocks.docs) {
    mirrors.delete(firestore.collection('users').doc(doc.id).collection('blockedBy').doc(userId));
  }
  const blockedBy = await userRef.collection('blockedBy').get();
  for (const doc of blockedBy.docs) {
    mirrors.delete(firestore.collection('users').doc(doc.id).collection('blocks').doc(userId));
  }
  await mirrors.commit();

  // End every match so the counterpart is not left with a live match to a deleted account.
  const matchesSnap = await firestore.collection('matches').where('participants', 'array-contains', userId).get();
  const now = new Date();
  const matchBatch = firestore.batch();
  for (const doc of matchesSnap.docs) {
    matchBatch.set(doc.ref, { active: false, endedAt: now, endedReason: 'account_deleted' }, { merge: true });
  }
  await matchBatch.commit();

  const retained = {
    payments: (await firestore.collection('bezyPayments').where('telegramUserId', '==', userId).get()).size,
    reportsAboutYou: (await firestore.collection('reports').where('targetId', '==', userId).get()).size
  };

  // Removes the user document and every subcollection: profile, actions, likesReceived,
  // blocks and blockedBy.
  await firestore.recursiveDelete(userRef);

  console.log(`[bezy-privacy] account.deleted ${JSON.stringify({ telegramUserId: userId, matchesEnded: matchesSnap.size, retainedPayments: retained.payments })}`);
  return { deleted: true, alreadyDeleted: false, matchesEnded: matchesSnap.size, retained };
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const user = requireTelegramUser(req, res);
  if (!user) return;

  // Identity comes only from validated Telegram initData, so a caller can never act on
  // another account: there is no user id parameter to tamper with.
  const userId = String(user.id);
  const action = String(req.body?.action || '');

  try {
    const firestore = db();
    if (action === 'export') {
      return res.status(200).json({ ok: true, data: await exportData(firestore, userId) });
    }
    if (action === 'delete') {
      // A typed confirmation guards an irreversible action against accidental calls.
      if (req.body?.confirm !== DELETE_CONFIRMATION) {
        return res.status(400).json({ error: 'CONFIRMATION_REQUIRED' });
      }
      return res.status(200).json({ ok: true, ...(await deleteAccount(firestore, userId)) });
    }
    return res.status(400).json({ error: 'INVALID_ACTION' });
  } catch (error) {
    console.error('Account request failed:', error);
    return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
  }
}
