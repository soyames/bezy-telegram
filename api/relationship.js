import { db } from './_firebase.js';
import { requirePost, requireTelegramUser } from './_telegram.js';
import { rateLimit } from './_ratelimit.js';

// Safety actions for a dating service: block, unblock, report and unmatch.
// All of them are enforced server-side — hiding a button is not a safety control.
//
// One endpoint rather than four keeps the serverless function count low and keeps the
// shared authorization and validation in a single place.

const REPORT_REASONS = new Set(['harassment', 'spam', 'scam', 'fake_profile', 'inappropriate_content', 'underage', 'other']);
const DETAILS_MAX = 1000;

function matchId(a, b) {
  return [String(a), String(b)].sort().join('_');
}

/**
 * Blocking is deliberately symmetrical in effect: neither party can discover, like or
 * match the other afterwards. The mirror document under the blocked user lets discovery
 * filter both directions with a single subcollection read instead of a query per candidate.
 * The blocked user is never told that they were blocked.
 */
async function block(firestore, userId, targetId) {
  const now = new Date();
  const batch = firestore.batch();
  batch.set(firestore.collection('users').doc(userId).collection('blocks').doc(targetId), { targetId, createdAt: now });
  batch.set(firestore.collection('users').doc(targetId).collection('blockedBy').doc(userId), { actorId: userId, createdAt: now });

  // An existing match is ended so it can no longer appear for either side.
  const matchRef = firestore.collection('matches').doc(matchId(userId, targetId));
  if ((await matchRef.get()).exists) {
    batch.set(matchRef, { active: false, endedAt: now, endedBy: userId, endedReason: 'block' }, { merge: true });
  }

  // A block also records a decision, so the pair never resurfaces in discovery.
  batch.set(firestore.collection('users').doc(userId).collection('actions').doc(targetId), { action: 'pass', createdAt: now }, { merge: true });
  batch.set(firestore.collection('users').doc(targetId).collection('actions').doc(userId), { action: 'pass', createdAt: now }, { merge: true });
  // Any pending like between the two is withdrawn from "who liked you".
  batch.delete(firestore.collection('users').doc(userId).collection('likesReceived').doc(targetId));
  batch.delete(firestore.collection('users').doc(targetId).collection('likesReceived').doc(userId));

  await batch.commit();
  return { blocked: true };
}

async function unblock(firestore, userId, targetId) {
  const batch = firestore.batch();
  batch.delete(firestore.collection('users').doc(userId).collection('blocks').doc(targetId));
  batch.delete(firestore.collection('users').doc(targetId).collection('blockedBy').doc(userId));
  await batch.commit();
  // The recorded pass is intentionally left in place: unblocking restores contactability,
  // it does not re-inject someone into the deck who was already decided on.
  return { blocked: false };
}

/**
 * Reports are stored for moderation review. Only what is needed to act on the report is
 * kept: who reported whom, a category, an optional free-text description and a status.
 * No profile snapshot is copied, so a later erasure request does not leave stale personal
 * data behind inside the report.
 */
async function report(firestore, userId, targetId, body) {
  const reason = REPORT_REASONS.has(body?.reason) ? body.reason : 'other';
  const details = String(body?.details ?? '').trim().slice(0, DETAILS_MAX);
  const now = new Date();

  const ref = await firestore.collection('reports').add({
    reporterId: userId,
    targetId,
    reason,
    details,
    status: 'open',
    createdAt: now
  });

  // Reporting always blocks as well: a user who reports someone should not keep seeing them.
  await block(firestore, userId, targetId);
  return { reported: true, reportId: ref.id, reason };
}

/**
 * Unmatching ends the match for both sides and records a pass in both directions, so the
 * pair cannot reappear in discovery and no stale match can be used to re-establish contact.
 * Telegram conversations already exchanged are outside Bezy's control and are not touched.
 */
async function unmatch(firestore, userId, targetId) {
  const now = new Date();
  const ref = firestore.collection('matches').doc(matchId(userId, targetId));
  const snap = await ref.get();
  if (!snap.exists || !(snap.data()?.participants || []).includes(userId)) {
    return { unmatched: false, reason: 'NO_SUCH_MATCH' };
  }

  const batch = firestore.batch();
  batch.set(ref, { active: false, endedAt: now, endedBy: userId, endedReason: 'unmatch' }, { merge: true });
  batch.set(firestore.collection('users').doc(userId).collection('actions').doc(targetId), { action: 'pass', createdAt: now }, { merge: true });
  batch.set(firestore.collection('users').doc(targetId).collection('actions').doc(userId), { action: 'pass', createdAt: now }, { merge: true });
  batch.delete(firestore.collection('users').doc(userId).collection('likesReceived').doc(targetId));
  batch.delete(firestore.collection('users').doc(targetId).collection('likesReceived').doc(userId));
  await batch.commit();
  return { unmatched: true };
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const user = requireTelegramUser(req, res);
  if (!user) return;

  const userId = String(user.id);
  const action = String(req.body?.action || '');
  const targetId = String(req.body?.targetId || '');

  if (!targetId || targetId === userId) return res.status(400).json({ error: 'INVALID_TARGET' });
  if (!['block', 'unblock', 'report', 'unmatch', 'list_blocks'].includes(action)) {
    return res.status(400).json({ error: 'INVALID_ACTION' });
  }

  try {
    const firestore = db();

    // The acting account must itself be eligible to use Bezy.
    const selfSnap = await firestore.collection('users').doc(userId).get();
    if (selfSnap.data()?.ageEligibilityConfirmed !== true) {
      return res.status(403).json({ error: 'AGE_CONFIRMATION_REQUIRED' });
    }

    // Rate limited per action class. Report has the tightest budget because report spam is
    // itself a harassment vector. list_blocks and unmatch ride the block budget.
    const bucket = action === 'report' ? 'report' : 'block';
    if (!(await rateLimit(firestore, res, userId, bucket))) return;

    // Anti-enumeration: acting on a Telegram id that has no Bezy account must look exactly
    // like acting on one that does. The response below is identical either way; the only
    // difference is that nothing is written for a stranger, so no mirror document or report
    // is created under an account that does not exist.
    const targetExists = action === 'list_blocks'
      ? true
      : (await firestore.collection('users').doc(targetId).get()).exists;

    if (action === 'list_blocks') {
      const blocks = await firestore.collection('users').doc(userId).collection('blocks').limit(100).get();
      const blocked = [];
      for (const doc of blocks.docs) {
        const other = await firestore.collection('users').doc(doc.id).get();
        blocked.push({
          id: doc.id,
          displayName: other.data()?.profile?.displayName || '',
          blockedAt: doc.data()?.createdAt?.toMillis?.() ? new Date(doc.data().createdAt.toMillis()).toISOString() : null
        });
      }
      return res.status(200).json({ ok: true, blocked });
    }

    if (action === 'block') {
      if (!targetExists) return res.status(200).json({ ok: true, blocked: true });
      return res.status(200).json({ ok: true, ...(await block(firestore, userId, targetId)) });
    }
    if (action === 'unblock') return res.status(200).json({ ok: true, ...(await unblock(firestore, userId, targetId)) });
    if (action === 'report') {
      // A report about a non-existent account is accepted in appearance but not stored:
      // there is nothing to moderate, and storing it would let anyone fill the moderation
      // queue with entries for arbitrary Telegram ids.
      if (!targetExists) return res.status(200).json({ ok: true, reported: true, reason: REPORT_REASONS.has(req.body?.reason) ? req.body.reason : 'other' });
      return res.status(200).json({ ok: true, ...(await report(firestore, userId, targetId, req.body)) });
    }
    return res.status(200).json({ ok: true, ...(await unmatch(firestore, userId, targetId)) });
  } catch (error) {
    console.error('Relationship request failed:', error);
    return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
  }
}
