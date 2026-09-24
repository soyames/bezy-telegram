import { mediaQuery as query } from '../media/_db.js';
import { cors, mediaIdentity } from '../media/_auth.js';

// Pi Network checkout. Pi drives the sheet in the browser, but nothing is granted there:
// every step is verified against Pi's own API with the app's server-side key, and the
// entitlement is read back from bezy_pi_payments. A client callback cannot mint Premium.
//
// Until PI_API_KEY is set on this project, Pi answers 401 and checkout reports itself
// unavailable — it never half-works and never takes money it cannot honour.

const PI_API = 'https://api.minepi.com/v2';
const PRODUCT_ID = '6ab4ec72c8d845bd3f689671';
const PREMIUM_DAYS = 30;

function apiKey() {
  return process.env.PI_API_KEY || '';
}

async function pi(path, init = {}) {
  const response = await fetch(`${PI_API}${path}`, {
    ...init,
    headers: { Authorization: `Key ${apiKey()}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
}

/** Premium runs from the newest completed payment, so it survives any client state loss. */
async function entitlementOf(viewer) {
  const { rows } = await query(
    `SELECT completed_at FROM bezy_pi_payments
      WHERE provider=$1 AND subject=$2 AND status='completed'
      ORDER BY completed_at DESC LIMIT 1`,
    [viewer.provider, viewer.subject]);
  const completedAt = rows[0]?.completed_at;
  if (!completedAt) return { active: false, expiresAt: 0 };
  const expiresAt = new Date(completedAt).getTime() + PREMIUM_DAYS * 24 * 60 * 60 * 1000;
  return { active: expiresAt > Date.now(), expiresAt };
}

export default async function handler(req, res) {
  if (!cors(req, res)) return res.status(403).json({ error: 'ORIGIN_DENIED' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'POST'].includes(req.method))
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    const viewer = await mediaIdentity(req);
    if (!viewer) return res.status(401).json({ error: 'INVALID_SESSION' });
    // Payments exist only on Pi; a Telegram member is authenticated but has no Pi uid.
    if (viewer.provider !== 'pi') return res.status(403).json({ error: 'NOT_PI_MEMBER' });

    if (!apiKey()) return res.status(503).json({ error: 'PAYMENTS_UNAVAILABLE' });

    if (req.method === 'GET') {
      const entitlement = await entitlementOf(viewer);
      return res.status(200).json({ productId: PRODUCT_ID, days: PREMIUM_DAYS, ...entitlement });
    }

    const action = req.body?.action;
    const paymentId = typeof req.body?.paymentId === 'string' ? req.body.paymentId : '';
    if (!paymentId || paymentId.length > 128) return res.status(400).json({ error: 'INVALID_PAYMENT' });

    // Pi is the authority on what the caller actually paid: read the payment back and make
    // sure it belongs to this member before touching it.
    const found = await pi(`/payments/${encodeURIComponent(paymentId)}`);
    if (!found.ok || !found.body) return res.status(404).json({ error: 'PAYMENT_NOT_FOUND' });
    const payment = found.body;
    if (String(payment.user_uid) !== String(viewer.subject))
      return res.status(403).json({ error: 'PAYMENT_NOT_YOURS' });

    if (action === 'approve') {
      if (payment.status?.developer_approved && !payment.status?.cancelled) {
        // Already approved on a retry: idempotent, nothing to do at Pi.
      } else if (payment.status?.cancelled || payment.status?.user_cancelled) {
        return res.status(409).json({ error: 'PAYMENT_CANCELLED' });
      } else {
        const approved = await pi(`/payments/${encodeURIComponent(paymentId)}/approve`, { method: 'POST' });
        if (!approved.ok) return res.status(502).json({ error: 'APPROVE_FAILED' });
      }
      await query(
        `INSERT INTO bezy_pi_payments (payment_id,provider,subject,product_id,amount,status)
         VALUES ($1,$2,$3,$4,$5,'approved')
         ON CONFLICT (payment_id) DO NOTHING`,
        [paymentId, viewer.provider, viewer.subject, String(payment.metadata?.productId || PRODUCT_ID),
          Number(payment.amount) || 0]);
      return res.status(200).json({ ok: true });
    }

    if (action === 'complete') {
      const txid = String(req.body?.txid || payment.transaction?.txid || '');
      if (!payment.status?.developer_completed) {
        const completed = await pi(`/payments/${encodeURIComponent(paymentId)}/complete`, {
          method: 'POST', body: JSON.stringify({ txid }),
        });
        if (!completed.ok) return res.status(502).json({ error: 'COMPLETE_FAILED' });
      }
      await query(
        `UPDATE bezy_pi_payments SET status='completed', txid=$2, completed_at=now()
          WHERE payment_id=$1`, [paymentId, txid]);
      const entitlement = await entitlementOf(viewer);
      return res.status(200).json({ ok: true, ...entitlement });
    }

    if (action === 'cancel') {
      await query(
        `INSERT INTO bezy_pi_payments (payment_id,provider,subject,product_id,amount,status)
         VALUES ($1,$2,$3,$4,$5,'cancelled')
         ON CONFLICT (payment_id) DO UPDATE SET status='cancelled'`,
        [paymentId, viewer.provider, viewer.subject, PRODUCT_ID, Number(payment.amount) || 0]);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'INVALID_ACTION' });
  } catch (error) {
    console.error('pi payment failed', error?.code || error?.name);
    return res.status(503).json({ error: 'PAYMENT_UNAVAILABLE' });
  }
}
