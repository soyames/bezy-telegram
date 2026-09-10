import crypto from 'node:crypto';
import { db } from './_firebase.js';
import { requirePost, requireTelegramUser, telegramApi, normalizedLanguage } from './_telegram.js';
import { premiumPlan, premiumPlans, premiumState, PREMIUM_BENEFITS, limitsFor, currentUsage, buildInvoicePayload } from './_premium.js';
import { rateLimit } from './_ratelimit.js';

const PLAN_LABELS = {
  en: { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' },
  fr: { monthly: 'Mensuel', quarterly: 'Trimestriel', yearly: 'Annuel' }
};
const INVOICE_DESCRIPTION = {
  en: 'See who liked you, advanced discovery, more Super Likes, increased visibility and unlimited discovery.',
  fr: 'Voyez qui vous a liké, découverte avancée, plus de Super Likes, visibilité accrue et découverte illimitée.'
};

export function publicPlans() {
  return Object.values(premiumPlans()).map((plan) => ({
    id: plan.id,
    stars: plan.stars,
    currency: plan.currency,
    durationMonths: plan.durationMonths,
    bestValue: plan.id === 'yearly'
  }));
}

async function statusResponse(res, userId) {
  const snap = await db().collection('users').doc(String(userId)).get();
  const data = snap.exists ? snap.data() : {};
  const state = premiumState(data);
  const limits = limitsFor(state.active);
  const usage = currentUsage(data);
  return res.status(200).json({
    ok: true,
    premium: state,
    benefits: PREMIUM_BENEFITS,
    plans: publicPlans(),
    limits,
    usage: {
      discoveryActions: usage.discoveryActions,
      superLikes: usage.superLikes,
      discoveryRemaining: Math.max(0, limits.discoveryActions - usage.discoveryActions),
      superLikesRemaining: Math.max(0, limits.superLikes - usage.superLikes)
    }
  });
}

// Creates a Telegram Stars invoice link. This grants nothing: Premium is activated only
// when the webhook receives and validates a successful_payment update.
async function createInvoice(req, res, user) {
  const plan = premiumPlan(req.body?.planId);
  if (!plan) return res.status(400).json({ error: 'INVALID_PLAN' });

  const language = normalizedLanguage(user.language_code);
  const nonce = crypto.randomUUID();
  const payload = buildInvoicePayload(plan.id, user.id, nonce);

  // The pending invoice is recorded before the link is issued so pre-checkout can verify
  // the plan and price against server state rather than trusting the echoed payload alone.
  await db().collection('bezyInvoices').doc(nonce).set({
    nonce,
    telegramUserId: String(user.id),
    planId: plan.id,
    stars: plan.stars,
    currency: plan.currency,
    payload,
    status: 'pending',
    createdAt: new Date()
  });

  const title = `Bezy Premium · ${(PLAN_LABELS[language] || PLAN_LABELS.en)[plan.id]}`;
  const invoiceLink = await telegramApi('createInvoiceLink', {
    title: title.slice(0, 32),
    description: (INVOICE_DESCRIPTION[language] || INVOICE_DESCRIPTION.en).slice(0, 255),
    payload,
    // Telegram Stars require an empty provider_token and exactly one price component.
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: title.slice(0, 32), amount: plan.stars }]
  });

  return res.status(200).json({
    ok: true,
    invoiceLink,
    plan: { id: plan.id, stars: plan.stars, currency: plan.currency, durationMonths: plan.durationMonths }
  });
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const user = requireTelegramUser(req, res);
  if (!user) return;

  try {
    const action = String(req.body?.action || 'status');
    if (action === 'status') {
      if (!(await rateLimit(db(), res, user.id, 'premium_status'))) return;
      return await statusResponse(res, user.id);
    }
    if (action === 'invoice') {
      if (!(await rateLimit(db(), res, user.id, 'premium_invoice'))) return;
      return await createInvoice(req, res, user);
    }
    return res.status(400).json({ error: 'INVALID_ACTION' });
  } catch (error) {
    console.error('Premium request failed:', error);
    return res.status(500).json({ error: 'PREMIUM_UNAVAILABLE' });
  }
}
