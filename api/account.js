import { db } from './_firebase.js';
import { requirePost, requireTelegramUser, normalizedLanguage } from './_telegram.js';
import { premiumState } from './_premium.js';
import { rateLimit } from './_ratelimit.js';
import { notificationSettings, deliverNotification } from './_notify.js';

// Data-subject rights that Bezy can genuinely honour automatically:
//   action: 'export'   — GDPR Art. 15 access / Art. 20 portability, as machine-readable JSON
//   action: 'delete'   — GDPR Art. 17 erasure
//   action: 'restrict' / 'unrestrict' — GDPR Art. 18 restriction of processing
//   action: 'object' / 'unobject'     — GDPR Art. 21 objection to processing
//
// Rights that need a human (rectification beyond profile editing, complaints) are handled by
// contacts@digitalconcordia.com and are described in the Mini App and the Privacy Policy.
// Nothing here promises automation that does not exist.

const DELETE_CONFIRMATION = 'DELETE';

/**
 * Account-event confirmations. These ride the transactional `account` category, which the
 * user cannot switch off: a pause, an objection or a deletion happened to the user's own
 * account, and the bot message is the durable record of it. Sent only when the state
 * actually changed — an idempotent repeat is not a new event and gets no new message.
 */
function accountEventMessages(language) {
  if (language === 'fr') {
    return {
      restricted: 'Le traitement est maintenant suspendu. Bezy conserve vos données et n’en utilise aucune. Reprenez à tout moment dans Bezy → Profil → Sécurité et confidentialité.',
      unrestricted: 'Le traitement a repris. Activez « Montrer mon profil dans Découvrir » quand vous êtes prêt·e à être vu·e à nouveau.',
      objected: 'Votre opposition est enregistrée. Bezy a cessé de traiter vos données pour la découverte et les matchs. Retirez-la à tout moment dans Bezy → Profil → Sécurité et confidentialité.',
      unobjected: 'Votre opposition a été retirée. Activez « Montrer mon profil dans Découvrir » quand vous êtes prêt·e à être vu·e à nouveau.',
      deleted: 'Votre compte Bezy a été supprimé. Votre profil, vos likes, vos passes, vos matchs et vos blocages ont été effacés. Les paiements sont conservés pour la comptabilité. Au revoir 💜'
    };
  }
  return {
    restricted: 'Processing is now paused. Bezy is storing your data and using none of it. Resume anytime in Bezy → Profile → Safety & privacy.',
    unrestricted: 'Processing has resumed. Turn on “Show my profile in Discover” when you are ready to be seen again.',
    objected: 'Your objection is recorded. Bezy has stopped processing your data for discovery and matching. Withdraw it anytime in Bezy → Profile → Safety & privacy.',
    unobjected: 'Your objection has been withdrawn. Turn on “Show my profile in Discover” when you are ready to be seen again.',
    deleted: 'Your Bezy account has been deleted. Your profile, likes, passes, matches and blocks are gone. Payment records are kept for accounting. Goodbye 💜'
  };
}

function sendAccountEvent(firestore, userData, key) {
  return deliverNotification(firestore, userData, 'account', { text: accountEventMessages(normalizedLanguage(userData?.languageCode))[key] });
}

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

  const [actions, blocks, likesReceived, matchesSnap, payments, reports, supportSnap] = await Promise.all([
    userRef.collection('actions').get(),
    userRef.collection('blocks').get(),
    userRef.collection('likesReceived').get(),
    firestore.collection('matches').where('participants', 'array-contains', userId).get(),
    firestore.collection('bezyPayments').where('telegramUserId', '==', userId).get(),
    firestore.collection('reports').where('reporterId', '==', userId).get(),
    firestore.collection('supportRequests').where('telegramUserId', '==', userId).get()
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
    notificationPreferences: notificationSettings(data),
    processingRestriction: {
      restricted: data.processingRestricted === true,
      restrictedAt: iso(data.processingRestrictedAt),
      liftedAt: iso(data.processingRestrictionLiftedAt)
    },
    processingObjection: {
      objected: data.processingObjection === true,
      objectedAt: iso(data.processingObjectedAt),
      withdrawnAt: iso(data.processingObjectionLiftedAt)
    },
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
    supportRequests: supportSnap.docs.map((d) => ({
      reference: d.data().reference || d.id,
      category: d.data().category,
      status: d.data().status,
      details: String(d.data().details || '').slice(0, 500),
      createdAt: iso(d.data().createdAt)
    })),
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
 * Restriction of processing (GDPR Art. 18), as a self-service, reversible control.
 *
 * This is deliberately more than the `discoverable` toggle it replaces as a workaround.
 * `discoverable` is a visibility preference; restriction is a recorded legal state that stops
 * Bezy *processing* the account at all — no deck, no swiping in either direction, no new
 * matches, no engagement notifications — while storing everything untouched. Nothing is
 * deleted, and the user keeps their own access rights: export still works, because Art. 15 is
 * a different right and restriction must not be a trap that locks someone out of their data.
 *
 * Lifting the restriction deliberately does NOT re-publish the profile. `discoverable` stays
 * false until the user turns it back on themselves, so nobody is silently returned to the deck
 * by an action they took for a different reason.
 *
 * Idempotent in both directions: restricting twice, or lifting when not restricted, is safe
 * and reports the same outcome.
 */
async function setProcessingRestriction(firestore, userId, restricted) {
  const userRef = firestore.collection('users').doc(userId);
  const snap = await userRef.get();
  if (!snap.exists) return { restricted: false, alreadyInState: true, unknownAccount: true };

  const current = snap.data() || {};
  const already = (current.processingRestricted === true) === restricted;
  const now = new Date();

  const update = restricted
    ? { processingRestricted: true, processingRestrictedAt: now, discoverable: false, updatedAt: now }
    : { processingRestricted: false, processingRestrictionLiftedAt: now, updatedAt: now };
  // The stored profile carries its own copy of `discoverable`; both must agree or the profile
  // endpoint would hand the Mini App a value discovery does not honour.
  if (restricted && current.profile) update.profile = { ...current.profile, discoverable: false };

  if (!already) {
    await userRef.update(update);
    // The user's record of what just happened to their account. Transactional, so it is
    // delivered even though engagement notifications are already suppressed by the pause.
    await sendAccountEvent(firestore, current, restricted ? 'restricted' : 'unrestricted');
  }

  console.log(`[bezy-privacy] account.processing_restriction ${JSON.stringify({ telegramUserId: userId, restricted, alreadyInState: already })}`);
  return { restricted, alreadyInState: already };
}

/**
 * Objection to processing (GDPR Art. 21), as a self-service, reversible control — Art. 21(5)
 * explicitly allows an objection to be exercised "by automated means", so a button in the Mini
 * App is the right shape for this right.
 *
 * The operational effect mirrors restriction: the account is paused (see `_privacy.js`), so no
 * deck, no swiping in either direction, no new matches, no engagement notifications, while
 * everything is stored untouched. Export and deletion stay available — an objection must not
 * be a trap that locks someone out of their data.
 *
 * The legal states stay distinct in storage and in the export, because the rights themselves
 * are distinct and a future request ("what happened to my account?") must be answerable from
 * the record. Withdrawing the objection does NOT republish the profile, for the same reason
 * restriction does not: `discoverable` stays false until the user turns it back on.
 *
 * A controller receiving an objection must either stop processing or demonstrate compelling
 * legitimate grounds to continue. Bezy stops immediately; whether compelling grounds could
 * ever exist for a dating profile is part of the operator's legal review (P0-5 family), not
 * something this code invents.
 *
 * Idempotent in both directions, like restriction.
 */
async function setProcessingObjection(firestore, userId, objected) {
  const userRef = firestore.collection('users').doc(userId);
  const snap = await userRef.get();
  if (!snap.exists) return { objected: false, alreadyInState: true, unknownAccount: true };

  const current = snap.data() || {};
  const already = (current.processingObjection === true) === objected;
  const now = new Date();

  const update = objected
    ? { processingObjection: true, processingObjectedAt: now, discoverable: false, updatedAt: now }
    : { processingObjection: false, processingObjectionLiftedAt: now, updatedAt: now };
  // Same double write as restriction: the stored profile carries its own `discoverable` copy
  // and both must agree.
  if (objected && current.profile) update.profile = { ...current.profile, discoverable: false };

  if (!already) {
    await userRef.update(update);
    await sendAccountEvent(firestore, current, objected ? 'objected' : 'unobjected');
  }

  console.log(`[bezy-privacy] account.processing_objection ${JSON.stringify({ telegramUserId: userId, objected, alreadyInState: already })}`);
  return { objected, alreadyInState: already };
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

  // Bezy conversations are deleted outright, including every message: erasure covers the
  // deleted user's message content, and the counterpart's copy of the exchange goes with
  // it. (Message-retention policy for active accounts is a flagged legal follow-up — see
  // the roadmap — this only defines the deletion behaviour, which erasure already
  // required.)
  const conversationsSnap = await firestore.collection('conversations').where('participants', 'array-contains', userId).get();
  for (const doc of conversationsSnap.docs) {
    await firestore.recursiveDelete(doc.ref);
  }

  const retained = {
    payments: (await firestore.collection('bezyPayments').where('telegramUserId', '==', userId).get()).size,
    reportsAboutYou: (await firestore.collection('reports').where('targetId', '==', userId).get()).size
  };

  // Sent while the account still exists: the user's durable record that erasure happened.
  // Transactional, so it is delivered regardless of notification choices.
  await sendAccountEvent(firestore, data, 'deleted');

  // Support requests are the caller's own personal data, so erasure covers them too. They
  // reference the user by Telegram id only, like everything else in the request.
  const supportSnap = await firestore.collection('supportRequests').where('telegramUserId', '==', userId).get();
  const supportBatch = firestore.batch();
  for (const doc of supportSnap.docs) supportBatch.delete(doc.ref);
  await supportBatch.commit();

  // Removes the user document and every subcollection: profile, actions, likesReceived,
  // blocks and blockedBy.
  await firestore.recursiveDelete(userRef);
  // Rate-limit counters record when the account acted, so they are erased with it.
  await firestore.collection('rateLimits').doc(userId).delete().catch(() => {});

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
      if (!(await rateLimit(firestore, res, userId, 'account_export'))) return;
      return res.status(200).json({ ok: true, data: await exportData(firestore, userId) });
    }
    if (action === 'restrict' || action === 'unrestrict') {
      if (!(await rateLimit(firestore, res, userId, 'account_restrict'))) return;
      return res.status(200).json({ ok: true, ...(await setProcessingRestriction(firestore, userId, action === 'restrict')) });
    }
    if (action === 'object' || action === 'unobject') {
      if (!(await rateLimit(firestore, res, userId, 'account_objection'))) return;
      return res.status(200).json({ ok: true, ...(await setProcessingObjection(firestore, userId, action === 'object')) });
    }
    if (action === 'delete') {
      // A typed confirmation guards an irreversible action against accidental calls.
      if (!(await rateLimit(firestore, res, userId, 'account_delete'))) return;
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
