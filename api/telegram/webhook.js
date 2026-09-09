import { configureLocalizedCommands, miniAppUrl, normalizedLanguage, telegramApi } from '../_telegram.js';
import { db } from '../_firebase.js';
import { parseInvoicePayload, premiumPlan, nextExpiry } from '../_premium.js';

const COMMAND_VIEWS = {
  start: null, demarrer: null, help: null, aide: null,
  profile: 'profile', profil: 'profile', discover: 'discover', decouvrir: 'discover',
  matches: 'matches', matchs: 'matches', premium: 'premium', settings: 'profile', parametres: 'profile'
};

function commandName(text) {
  const first = String(text || '').trim().split(/\s+/)[0];
  return first.replace(/^\//, '').split('@')[0].toLowerCase();
}
function uiButton(language, view) { return { text: language === 'fr' ? '💜 Ouvrir Bezy' : '💜 Open Bezy', web_app: { url: miniAppUrl(view) } }; }
function helpText(language) {
  return language === 'fr'
    ? ['💜 <b>Comment fonctionne Bezy</b>', '', '1. Créez votre profil dans la Mini App.', '2. Découvrez des personnes compatibles.', '3. Likez ou passez.', '4. Un match apparaît lorsque l’intérêt est réciproque.', '5. Ouvrez ensuite la conversation directement dans Telegram.', '', 'Bezy est réservé aux personnes de 18 ans et plus.'].join('\n')
    : ['💜 <b>How Bezy works</b>', '', '1. Create your profile in the Mini App.', '2. Discover compatible people.', '3. Like or pass.', '4. A match appears when interest is mutual.', '5. Then open the conversation directly in Telegram.', '', 'Bezy is for adults aged 18 and over.'].join('\n');
}

async function sendCommand(chatId, command, language) {
  if (command === 'help' || command === 'aide') {
    await telegramApi('sendMessage', { chat_id: chatId, text: helpText(language), parse_mode: 'HTML', reply_markup: { inline_keyboard: [[uiButton(language, null)]] } });
    return;
  }
  if (command === 'premium') {
    const text = language === 'fr'
      ? ['💎 <b>Bezy Premium</b>', '', 'Débloquez davantage de façons de faire de belles rencontres.', '', '✓ Voir qui vous a liké', '✓ Découverte avancée', '✓ Plus de Super Likes', '✓ Visibilité accrue', '✓ Découverte illimitée', '', 'Le paiement se fait avec les Telegram Stars ⭐. Ouvrez Bezy Premium pour choisir votre formule.'].join('\n')
      : ['💎 <b>Bezy Premium</b>', '', 'Unlock more ways to discover meaningful connections.', '', '✓ See who liked you', '✓ Advanced discovery', '✓ More Super Likes', '✓ Increased visibility', '✓ Unlimited discovery', '', 'Payment is made with Telegram Stars ⭐. Open Bezy Premium to choose your plan.'].join('\n');
    const label = language === 'fr' ? '💎 Voir Premium' : '💎 View Premium';
    await telegramApi('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: label, web_app: { url: miniAppUrl('premium') } }]] } });
    return;
  }
  const view = COMMAND_VIEWS[command] ?? null;
  const text = language === 'fr' ? '💜 Bienvenue sur Bezy. Rencontrez quelqu’un qui mérite d’être connu.' : '💜 Welcome to Bezy. Meet someone worth knowing.';
  await telegramApi('sendMessage', { chat_id: chatId, text, reply_markup: { inline_keyboard: [[uiButton(language, view)]] } });
}

// ---------------------------------------------------------------------------
// Telegram Stars payments
//
// Premium is granted by exactly one event: a validated `successful_payment`. Creating an
// invoice, opening the Telegram payment sheet, or passing pre-checkout grants nothing.
// ---------------------------------------------------------------------------

// Telegram requires an answer within 10 seconds. Every field is re-derived from server
// state: the plan, the price and the buyer all come from Firestore, never from the update.
// Telegram shows error_message directly to the buyer, so it follows their language.
const CHECKOUT_ERRORS = {
  en: {
    invalid: 'This payment link is not valid. Please reopen Bezy Premium and try again.',
    plan: 'That Premium plan is no longer available.',
    account: 'This payment link belongs to a different Telegram account.',
    currency: 'Bezy Premium can only be purchased with Telegram Stars.',
    price: 'The price has changed. Please reopen Bezy Premium and try again.',
    expired: 'This payment link has expired. Please reopen Bezy Premium.',
    unverified: 'This payment could not be verified. Please reopen Bezy Premium.'
  },
  fr: {
    invalid: 'Ce lien de paiement n’est pas valide. Rouvrez Bezy Premium et réessayez.',
    plan: 'Cette formule Premium n’est plus disponible.',
    account: 'Ce lien de paiement appartient à un autre compte Telegram.',
    currency: 'Bezy Premium ne peut être acheté qu’avec les Telegram Stars.',
    price: 'Le prix a changé. Rouvrez Bezy Premium et réessayez.',
    expired: 'Ce lien de paiement a expiré. Rouvrez Bezy Premium.',
    unverified: 'Ce paiement n’a pas pu être vérifié. Rouvrez Bezy Premium.'
  }
};

// Payment logging is deliberately narrow: enough to diagnose a failed checkout from the
// Vercel logs, with no bot token, no Firebase key, no initData and no profile content.
function logPayment(event, fields) {
  console.log(`[bezy-payment] ${event} ${JSON.stringify(fields)}`);
}

async function handlePreCheckout(query) {
  const parsed = parseInvoicePayload(query.invoice_payload);
  const messages = CHECKOUT_ERRORS[normalizedLanguage(query.from?.language_code)] || CHECKOUT_ERRORS.en;
  const plan = parsed && premiumPlan(parsed.planId);
  const context = {
    telegramUserId: String(query.from?.id || ''),
    planId: parsed?.planId || null,
    expectedStars: plan?.stars ?? null,
    receivedAmount: Number(query.total_amount),
    currency: query.currency
  };
  const reject = (key) => {
    logPayment('pre_checkout.rejected', { ...context, reason: key });
    return telegramApi('answerPreCheckoutQuery', {
      pre_checkout_query_id: query.id,
      ok: false,
      error_message: messages[key]
    });
  };

  if (!parsed) return reject('invalid');
  if (!plan) return reject('plan');
  if (String(query.from?.id) !== parsed.telegramUserId) return reject('account');
  if (query.currency !== 'XTR') return reject('currency');
  if (Number(query.total_amount) !== plan.stars) return reject('price');

  const invoiceSnap = await db().collection('bezyInvoices').doc(parsed.nonce).get();
  if (!invoiceSnap.exists) return reject('expired');
  const invoice = invoiceSnap.data() || {};
  if (invoice.telegramUserId !== parsed.telegramUserId || invoice.planId !== plan.id || Number(invoice.stars) !== plan.stars) {
    return reject('unverified');
  }

  logPayment('pre_checkout.approved', context);
  return telegramApi('answerPreCheckoutQuery', { pre_checkout_query_id: query.id, ok: true });
}

// Activation runs in a single transaction keyed on telegram_payment_charge_id, so a
// redelivered update can never extend a membership twice.
async function handleSuccessfulPayment(message) {
  const payment = message.successful_payment;
  const chargeId = payment?.telegram_payment_charge_id;
  const parsed = parseInvoicePayload(payment?.invoice_payload);
  const plan = parsed && premiumPlan(parsed.planId);

  const context = {
    telegramUserId: String(message.from?.id || ''),
    planId: parsed?.planId || null,
    chargeId: chargeId || null,
    expectedStars: plan?.stars ?? null,
    receivedAmount: Number(payment?.total_amount),
    currency: payment?.currency
  };

  if (!chargeId || !parsed || !plan) {
    logPayment('successful_payment.rejected', { ...context, reason: 'unrecognized_payload' });
    return null;
  }
  if (String(message.from?.id) !== parsed.telegramUserId) {
    logPayment('successful_payment.rejected', { ...context, reason: 'user_mismatch' });
    return null;
  }
  if (payment.currency !== 'XTR' || Number(payment.total_amount) !== plan.stars) {
    logPayment('successful_payment.rejected', { ...context, reason: 'currency_or_amount_mismatch' });
    return null;
  }

  const firestore = db();
  const paymentRef = firestore.collection('bezyPayments').doc(chargeId);
  const userRef = firestore.collection('users').doc(parsed.telegramUserId);
  const invoiceRef = firestore.collection('bezyInvoices').doc(parsed.nonce);
  const now = new Date();

  const result = await firestore.runTransaction(async (tx) => {
    const existing = await tx.get(paymentRef);
    if (existing.exists) return { duplicate: true, expiresAt: existing.data()?.membershipExpiresAt || null };

    const userSnap = await tx.get(userRef);
    const userData = userSnap.exists ? userSnap.data() : {};
    const expiresAt = nextExpiry(userData, plan, now);

    tx.set(paymentRef, {
      telegramPaymentChargeId: chargeId,
      providerPaymentChargeId: payment.provider_payment_charge_id || '',
      telegramUserId: parsed.telegramUserId,
      product: 'bezy_premium',
      planId: plan.id,
      stars: Number(payment.total_amount),
      currency: payment.currency,
      invoicePayload: payment.invoice_payload,
      status: 'processed',
      createdAt: now,
      processedAt: now,
      membershipExpiresAt: expiresAt
    });

    const membership = {
      active: true,
      planId: plan.id,
      expiresAt,
      purchasedAt: now,
      updatedAt: now,
      source: 'telegram_stars',
      telegramPaymentChargeId: chargeId
    };
    if (userSnap.exists) tx.update(userRef, { bezyPremium: membership });
    else tx.set(userRef, { telegramId: Number(parsed.telegramUserId), bezyPremium: membership, createdAt: now, updatedAt: now }, { merge: true });

    tx.set(invoiceRef, { status: 'paid', paidAt: now, telegramPaymentChargeId: chargeId }, { merge: true });

    return { duplicate: false, expiresAt, planId: plan.id };
  });

  logPayment(result.duplicate ? 'successful_payment.duplicate_ignored' : 'successful_payment.activated', {
    ...context,
    idempotent: result.duplicate,
    expiresAt: result.expiresAt ? new Date(result.expiresAt.toMillis?.() ?? result.expiresAt).toISOString() : null
  });
  return result;
}

async function confirmPremium(chatId, language, expiresAt) {
  const date = expiresAt ? new Date(expiresAt.toMillis?.() ?? expiresAt) : null;
  const until = date
    ? new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
    : '';
  const text = language === 'fr'
    ? `💎 Bezy Premium est maintenant actif !${until ? `\n\nActif jusqu’au ${until}.` : ''}`
    : `💎 Bezy Premium is now active!${until ? `\n\nActive until ${until}.` : ''}`;
  const label = language === 'fr' ? '💎 Ouvrir Bezy' : '💎 Open Bezy';
  await telegramApi('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: { inline_keyboard: [[{ text: label, web_app: { url: miniAppUrl('premium') } }]] }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.TELEGRAM_BOT_TOKEN) return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN is not configured' });
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret && req.headers['x-telegram-bot-api-secret-token'] !== expectedSecret) return res.status(401).json({ error: 'Invalid webhook secret' });

  const update = req.body || {};

  // Payment updates are handled before command routing. Telegram retries on a non-200,
  // so failures are logged and acknowledged rather than surfaced as an error status.
  if (update.pre_checkout_query) {
    try { await handlePreCheckout(update.pre_checkout_query); }
    catch (error) { console.error('Pre-checkout handling failed:', error); }
    return res.status(200).json({ ok: true });
  }

  const message = update.message;
  if (!message?.chat?.id) return res.status(200).json({ ok: true });
  const language = normalizedLanguage(message.from?.language_code);

  if (message.successful_payment) {
    try {
      const result = await handleSuccessfulPayment(message);
      if (result && !result.duplicate) await confirmPremium(message.chat.id, language, result.expiresAt);
    } catch (error) {
      console.error('Successful-payment handling failed:', error);
    }
    return res.status(200).json({ ok: true });
  }

  const command = commandName(message.text);
  if (!Object.prototype.hasOwnProperty.call(COMMAND_VIEWS, command)) return res.status(200).json({ ok: true });

  if (command === 'start' || command === 'demarrer') {
    try { await configureLocalizedCommands(); }
    catch (error) { console.error('Unable to configure Telegram commands:', error); }
  }
  await sendCommand(message.chat.id, command, language);
  return res.status(200).json({ ok: true });
}
