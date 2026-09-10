import { configureLocalizedCommands, miniAppUrl, normalizedLanguage, telegramApi } from '../_telegram.js';
import { db } from '../_firebase.js';
import { parseInvoicePayload, premiumPlan, nextExpiry, applyRefund } from '../_premium.js';
import { SUPPORT_CATEGORIES, createSupportRequest, diagnosePremium, diagnoseDiscovery, diagnoseProfile } from '../_support.js';
import { enforceRateLimit } from '../_ratelimit.js';

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
    ? ['💜 <b>Comment fonctionne Bezy</b>', '', '1. Créez votre profil dans la Mini App.', '2. Découvrez des personnes compatibles.', '3. Likez ou passez.', '4. Un match apparaît lorsque l’intérêt est réciproque.', '5. Ouvrez ensuite la conversation directement dans Telegram.', '', 'Bezy est réservé aux personnes de 18 ans et plus.', '', 'Un problème ? Envoyez /assistance.'].join('\n')
    : ['💜 <b>How Bezy works</b>', '', '1. Create your profile in the Mini App.', '2. Discover compatible people.', '3. Like or pass.', '4. A match appears when interest is mutual.', '5. Then open the conversation directly in Telegram.', '', 'Bezy is for adults aged 18 and over.', '', 'Having a problem? Send /support.'].join('\n');
}

// ---------------------------------------------------------------------------
// Support (CN-7): the bot is the primary support channel. Categories are machine tokens;
// labels follow the user's language. Troubleshooting reads only the caller's own document.
// ---------------------------------------------------------------------------

function supportLabel(language, category) {
  const fr = { premium: 'Premium & Telegram Stars', profile: 'Profil', likes_matches: 'Likes & matchs', discovery: 'Découverte', privacy_account: 'Confidentialité & compte', problem: 'Signaler un problème', contact: 'Contacter le support' };
  const en = { premium: 'Premium & Telegram Stars', profile: 'Profile', likes_matches: 'Likes & Matches', discovery: 'Discovery', privacy_account: 'Privacy & Account', problem: 'Report a problem', contact: 'Contact support' };
  return (language === 'fr' ? fr : en)[category] || category;
}

function supportMenuKeyboard(language) {
  const row = (a, b) => b ? [{ text: supportLabel(language, a), callback_data: `support:${a}` }, { text: supportLabel(language, b), callback_data: `support:${b}` }] : [{ text: supportLabel(language, a), callback_data: `support:${a}` }];
  return { inline_keyboard: [row('premium', 'profile'), row('likes_matches', 'discovery'), row('privacy_account', 'problem'), row('contact')] };
}

async function sendSupportMenu(chatId, language) {
  const text = language === 'fr'
    ? ['🛟 <b>Aide et assistance</b>', '', 'Choisissez ce qui vous concerne. Quand c’est possible, je diagnostique le problème tout de suite.', ''].join('\n')
    : ['🛟 <b>Help & support</b>', '', 'Choose what this is about. Where possible, I’ll diagnose the problem right away.', ''].join('\n');
  await telegramApi('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: supportMenuKeyboard(language) });
}

function stillNeedHelpRow(language, category) {
  return [{ text: language === 'fr' ? 'J’ai encore besoin d’aide' : 'Still need help?', callback_data: `support:new:${category}` }];
}

async function sendDiagnosis(chatId, language, textLines, keyboard) {
  await telegramApi('sendMessage', { chat_id: chatId, text: textLines.join('\n'), parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
}

async function supportPremium(chatId, language, userData) {
  const diag = diagnosePremium(userData);
  const openPremium = { text: language === 'fr' ? '💎 Voir Premium' : '💎 View Premium', web_app: { url: miniAppUrl('premium') } };
  let text;
  if (diag.revoked) {
    text = language === 'fr'
      ? ['💎 <b>Premium</b>', '', 'Votre Bezy Premium a été remboursé, l’accès Premium a donc été retiré. Vous pouvez vous réabonner à tout moment dans Bezy Premium.', '', 'ℹ️ Telegram Premium est un abonnement distinct : il n’inclut pas Bezy Premium.']
      : ['💎 <b>Premium</b>', '', 'Your Bezy Premium was refunded, so Premium access was removed. You can subscribe again anytime in Bezy Premium.', '', 'ℹ️ Telegram Premium is a separate subscription: it does not include Bezy Premium.'];
  } else if (diag.active) {
    const until = diag.expiresAt ? new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(diag.expiresAt)) : '';
    text = language === 'fr'
      ? ['💎 <b>Premium</b>', '', `Votre Bezy Premium est actif${until ? ` jusqu’au ${until}` : ''} (${diag.daysRemaining} jour(s) restant(s)).`, '', 'Pour les questions de Stars : les Stars sont gérés par Telegram (Réglages → Mes Stars).']
      : ['💎 <b>Premium</b>', '', `Your Bezy Premium is active${until ? ` until ${until}` : ''} (${diag.daysRemaining} day(s) remaining).`, '', 'For Stars questions: Stars are managed by Telegram (Settings → My Stars).'];
  } else {
    text = language === 'fr'
      ? ['💎 <b>Premium</b>', '', 'Aucun Bezy Premium actif n’est détecté sur votre compte.', '', '• Pour souscrire : ouvrez Bezy → « Voir l’abonnement » → choisissez une formule.', '• Le paiement se fait en Telegram Stars ⭐ (Réglages → Mes Stars).', '• Telegram Premium est un abonnement distinct : il n’inclut pas Bezy Premium.']
      : ['💎 <b>Premium</b>', '', 'No active Bezy Premium was detected on your account.', '', '• To subscribe: open Bezy → “View membership” → choose a plan.', '• Payment is in Telegram Stars ⭐ (Settings → My Stars).', '• Telegram Premium is a separate subscription: it does not include Bezy Premium.'];
  }
  await sendDiagnosis(chatId, language, text, [stillNeedHelpRow(language, 'premium'), [openPremium]]);
}

async function supportProfile(chatId, language, userData) {
  const diag = diagnoseProfile(userData);
  const openProfile = { text: language === 'fr' ? '👤 Ouvrir mon profil' : '👤 Open my profile', web_app: { url: miniAppUrl('profile') } };
  let text;
  if (!diag.complete) {
    const names = diag.missing.map((f) => ({ displayName: language === 'fr' ? 'nom' : 'name', age: language === 'fr' ? 'âge' : 'age', city: 'ville/city', gender: language === 'fr' ? '« je suis »' : '“I am”', seeking: language === 'fr' ? '« je recherche »' : '“looking for”' }[f])).join(', ');
    text = language === 'fr'
      ? ['👤 <b>Profil</b>', '', `Votre profil est incomplet. Il manque : ${names}.`, '', 'Ouvrez Bezy → Profil, complétez les champs, puis « Enregistrer le profil ». Votre profil n’apparaît dans Découvrir que lorsqu’il est complet.']
      : ['👤 <b>Profile</b>', '', `Your profile is incomplete. Missing: ${names}.`, '', 'Open Bezy → Profile, fill in the fields and press “Save profile”. Your profile only appears in Discover once it is complete.'];
  } else {
    text = language === 'fr'
      ? ['👤 <b>Profil</b>', '', 'Votre profil est complet. Vous pouvez le modifier à tout moment dans Bezy → Profil.', '', 'Votre nom d’utilisateur Telegram n’est montré qu’après un match — c’est normal.']
      : ['👤 <b>Profile</b>', '', 'Your profile is complete. You can edit it anytime in Bezy → Profile.', '', 'Your Telegram username is only shown after a match — that is by design.'];
  }
  await sendDiagnosis(chatId, language, text, [stillNeedHelpRow(language, 'profile'), [openProfile]]);
}

async function supportDiscovery(chatId, language, userData) {
  const diag = diagnoseDiscovery(userData);
  const openDiscover = { text: language === 'fr' ? '💜 Ouvrir Découvrir' : '💜 Open Discover', web_app: { url: miniAppUrl('discover') } };
  const findings = [];
  if (!diag.profileComplete) findings.push(language === 'fr' ? '• Votre profil est incomplet — complétez-le dans Bezy → Profil.' : '• Your profile is incomplete — complete it in Bezy → Profile.');
  if (!diag.ageEligibilityConfirmed) findings.push(language === 'fr' ? '• Vous n’avez pas encore confirmé avoir 18 ans ou plus.' : '• You have not confirmed that you are 18 or over yet.');
  if (diag.processingRestricted) findings.push(language === 'fr' ? '• Le traitement est suspendu — reprenez-le dans Profil → Sécurité et confidentialité.' : '• Processing is paused — resume it in Profile → Safety & privacy.');
  if (diag.processingObjection) findings.push(language === 'fr' ? '• Vous vous êtes opposé·e au traitement — retirez l’opposition dans Profil → Sécurité et confidentialité.' : '• You have objected to processing — withdraw the objection in Profile → Safety & privacy.');
  if (!diag.discoverable) findings.push(language === 'fr' ? '• « Montrer mon profil dans Découvrir » est désactivé.' : '• “Show my profile in Discover” is switched off.');
  if (diag.discoveryRemaining === 0) findings.push(language === 'fr' ? '• Vous avez atteint la limite de découverte du jour — elle se réinitialise demain (Premium la supprime).' : '• You have reached today’s discovery limit — it resets tomorrow (Premium removes it).');
  if (diag.filtersActive) findings.push(language === 'fr' ? '• Vos filtres (ville, même ville, langues, tranche d’âge) réduisent les résultats.' : '• Your filters (city, same-city, languages, age range) narrow the results.');
  const text = findings.length
    ? [language === 'fr' ? '🔎 <b>Découverte — voici ce que je vois</b>' : '🔎 <b>Discovery — here is what I see</b>', '', ...findings]
    : [language === 'fr' ? '🔎 <b>Découverte</b>' : '🔎 <b>Discovery</b>', '', language === 'fr' ? 'Tout semble correct : profil complet, visible dans Découvrir, et il vous reste des actions de découverte aujourd’hui. S’il y a peu de monde autour de vous, cela peut simplement signifier qu’il n’y a pas encore beaucoup de profils.' : 'Everything looks correct: your profile is complete, you are discoverable, and you still have discovery actions left today. If there are few people around you, it may simply mean there are not many profiles yet.'];
  await sendDiagnosis(chatId, language, text, [stillNeedHelpRow(language, 'discovery'), [openDiscover]]);
}

async function supportMatches(chatId, language, matchCount) {
  const openMatches = { text: language === 'fr' ? '💜 Ouvrir mes matchs' : '💜 Open my matches', web_app: { url: miniAppUrl('matches') } };
  const text = matchCount > 0
    ? (language === 'fr'
      ? ['💜 <b>Likes & matchs</b>', '', `Vous avez ${matchCount} match(s). Ouvrez Bezy → Matchs pour les voir. La conversation elle-même a lieu ici, dans Telegram.`, '', 'Un like seul ne crée pas de match : il faut que l’intérêt soit réciproque.']
      : ['💜 <b>Likes & Matches</b>', '', `You have ${matchCount} match(es). Open Bezy → Matches to see them. The conversation itself happens here in Telegram.`, '', 'A like alone does not create a match: the interest must be mutual.'])
    : (language === 'fr'
      ? ['💜 <b>Likes & matchs</b>', '', 'Aucun match pour l’instant. Un match naît quand deux personnes se likent mutuellement.', '', '• Complétez votre profil : il apparaît dans Découvrir uniquement s’il est complet.', '• Vérifiez vos filtres — trop stricts, ils réduisent les résultats.', '• Continuez à liker : plus vous découvrez, plus vous avez de chances.']
      : ['💜 <b>Likes & Matches</b>', '', 'No matches yet. A match happens when two people like each other.', '', '• Complete your profile: it only appears in Discover once complete.', '• Check your filters — too strict, and they narrow the results.', '• Keep liking: the more you discover, the better your chances.']);
  await sendDiagnosis(chatId, language, text, [stillNeedHelpRow(language, 'likes_matches'), [openMatches]]);
}

async function supportPrivacy(chatId, language) {
  const openProfile = { text: language === 'fr' ? '👤 Ouvrir mon profil' : '👤 Open my profile', web_app: { url: miniAppUrl('profile') } };
  const text = language === 'fr'
    ? ['🔐 <b>Confidentialité & compte</b>', '', 'Beaucoup de choses se font vous-même dans Bezy → Profil → Sécurité et confidentialité :', '', '• Télécharger mes données', '• Suspendre le traitement (et le reprendre)', '• S’opposer au traitement', '• Supprimer mon compte', '', 'Pour les demandes juridiques ou formelles : contacts@digitalconcordia.com']
    : ['🔐 <b>Privacy & Account</b>', '', 'Much of this is self-service in Bezy → Profile → Safety & privacy:', '', '• Download my data', '• Pause processing (and resume it)', '• Object to processing', '• Delete my account', '', 'For legal or formal requests: contacts@digitalconcordia.com'];
  await sendDiagnosis(chatId, language, text, [stillNeedHelpRow(language, 'privacy_account'), [openProfile]]);
}

async function handleSupportCategory(chatId, language, from, category, firestore) {
  if (category === 'contact' || category === 'problem') {
    await beginSupportIntake(chatId, language, from, category, firestore);
    return;
  }
  const userSnap = await firestore.collection('users').doc(String(from.id)).get();
  const userData = userSnap.data() || {};
  if (category === 'premium') return supportPremium(chatId, language, userData);
  if (category === 'profile') return supportProfile(chatId, language, userData);
  if (category === 'discovery') return supportDiscovery(chatId, language, userData);
  if (category === 'likes_matches') {
    const matches = await firestore.collection('matches').where('participants', 'array-contains', String(from.id)).get();
    const active = matches.docs.filter((d) => d.data()?.active !== false).length;
    return supportMatches(chatId, language, active);
  }
  if (category === 'privacy_account') return supportPrivacy(chatId, language);
}

/**
 * Intake: the user taps "still need help?" (or a no-diagnostics category). A transient
 * `pendingSupportRequest` field on their own document records the category; the next plain
 * message they send becomes the request. The field lives on the user doc, so account
 * deletion erases it with everything else.
 */
async function beginSupportIntake(chatId, language, from, category, firestore) {
  await firestore.collection('users').doc(String(from.id)).set({ pendingSupportRequest: { category, at: new Date() } }, { merge: true });
  const text = language === 'fr'
    ? ['🛟 <b>Décrivez votre problème</b>', '', 'Répondez simplement ici avec votre prochain message : ce que vous avez fait, ce que vous avez vu, et ce qui vous attendiez.'].join('\n')
    : ['🛟 <b>Describe your problem</b>', '', 'Just reply here with your next message: what you did, what you saw, and what you expected.'].join('\n');
  await telegramApi('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
}

async function handleSupportText(chatId, language, from, firestore, messageText) {
  const userId = String(from.id);
  const userRef = firestore.collection('users').doc(userId);
  const userSnap = await userRef.get();
  const pending = userSnap.data()?.pendingSupportRequest;
  if (!pending || !SUPPORT_CATEGORIES.includes(pending.category)) return false;

  // Support spam protection: the same bucket as the Mini App, so neither channel can flood
  // the queue. Fails open like every rate limit.
  try {
    await enforceRateLimit(firestore, userId, 'support_create');
  } catch (error) {
    if (error.rateLimited) {
      const text = language === 'fr' ? 'Vous avez envoyé trop de demandes. Réessayez dans un moment.' : 'You have sent too many requests. Please try again in a moment.';
      await telegramApi('sendMessage', { chat_id: chatId, text });
      return true;
    }
    throw error;
  }

  const reference = await createSupportRequest(firestore, {
    telegramUserId: userId,
    category: pending.category,
    details: String(messageText || ''),
    languageCode: from.language_code || null
  });
  await userRef.update({ pendingSupportRequest: null });
  const text = language === 'fr'
    ? `Votre demande d’assistance a bien été reçue.\nRéférence : ${reference}.\nNous allons l’examiner et vous répondre ici. Pour les questions juridiques ou formelles : contacts@digitalconcordia.com`
    : `Your support request has been received.\nReference: ${reference}.\nWe'll review it and get back to you here. For legal or formal matters: contacts@digitalconcordia.com`;
  await telegramApi('sendMessage', { chat_id: chatId, text });
  return true;
}

async function sendCommand(chatId, command, language) {
  if (command === 'help' || command === 'aide') {
    await telegramApi('sendMessage', { chat_id: chatId, text: helpText(language), parse_mode: 'HTML', reply_markup: { inline_keyboard: [[uiButton(language, null)]] } });
    return;
  }
  if (command === 'premium') {
    const text = language === 'fr'
      ? ['💎 <b>Bezy Premium</b>', '', 'Débloquez davantage de façons de faire de belles rencontres.', '', '✓ Voir qui vous a liké', '✓ Découverte avancée', '✓ Plus de Super Likes', '✓ Visibilité accrue', '✓ Découverte illimitée', '',
         'Le paiement se fait avec les Telegram Stars ⭐. Vous devez disposer de Stars sur votre solde (Réglages → Mes Stars).', '',
         '⚠️ Telegram Premium est un abonnement Telegram distinct et n’inclut pas Bezy Premium.', '', 'Ouvrez Bezy Premium pour choisir votre formule.'].join('\n')
      : ['💎 <b>Bezy Premium</b>', '', 'Unlock more ways to discover meaningful connections.', '', '✓ See who liked you', '✓ Advanced discovery', '✓ More Super Likes', '✓ Increased visibility', '✓ Unlimited discovery', '',
         'Payment is made with Telegram Stars ⭐. You need Stars in your balance (Settings → My Stars).', '',
         '⚠️ Telegram Premium is a separate Telegram subscription and does not include Bezy Premium.', '', 'Open Bezy Premium to choose your plan.'].join('\n');
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

// Telegram pushes `refunded_payment` inside a normal message update whenever a Stars
// payment is refunded — whether Bezy initiated it, the owner ran the refund script, or
// Telegram support processed it. This is therefore the authoritative revocation trigger:
// entitlement is withdrawn no matter where the refund came from.
async function handleRefundedPayment(message) {
  const refund = message.refunded_payment;
  const chargeId = refund?.telegram_payment_charge_id;
  const context = {
    telegramUserId: String(message.from?.id || ''),
    chargeId: chargeId || null,
    currency: refund?.currency,
    refundedAmount: Number(refund?.total_amount)
  };

  if (!chargeId) {
    logPayment('refund.rejected', { ...context, reason: 'missing_charge_id' });
    return null;
  }

  const result = await applyRefund(db(), chargeId, { source: 'telegram_webhook' });

  if (result.outcome === 'unknown_payment') {
    logPayment('refund.unknown_payment', context);
    return result;
  }
  if (result.outcome === 'already_refunded') {
    logPayment('refund.duplicate_ignored', { ...context, idempotent: true, planId: result.planId });
    return result;
  }

  logPayment('refund.revoked', {
    ...context,
    planId: result.planId,
    revoked: result.revoked,
    previousState: result.previousState,
    newState: result.newState,
    idempotent: false
  });
  return result;
}

async function confirmRefund(chatId, language) {
  const text = language === 'fr'
    ? '↩️ Votre abonnement Bezy Premium a été remboursé. L’accès Premium a été retiré de votre compte.\n\nVotre profil, vos matchs et vos conversations Telegram ne sont pas affectés.'
    : '↩️ Your Bezy Premium subscription has been refunded, and Premium access has been removed from your account.\n\nYour profile, your matches and your Telegram conversations are unaffected.';
  const label = language === 'fr' ? '💜 Ouvrir Bezy' : '💜 Open Bezy';
  await telegramApi('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: { inline_keyboard: [[{ text: label, web_app: { url: miniAppUrl('premium') } }]] }
  });
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

  // Support menu callbacks (CN-7). Answered first so the button press never hangs, then
  // acted on. Identity comes from the update context Telegram itself signed — never from
  // anything a client could forge.
  if (update.callback_query) {
    try {
      const query = update.callback_query;
      await telegramApi('answerCallbackQuery', { callback_query_id: query.id }).catch(() => {});
      const data = String(query?.data || '');
      if (data.startsWith('support:')) {
        const chatId = query.message?.chat?.id;
        const from = query.from;
        if (chatId && from) {
          const language = normalizedLanguage(from.language_code);
          const part = data.slice('support:'.length);
          if (part.startsWith('new:')) {
            await beginSupportIntake(chatId, language, from, part.slice(4), db());
          } else if (SUPPORT_CATEGORIES.includes(part)) {
            await handleSupportCategory(chatId, language, from, part, db());
          }
        }
      }
    } catch (error) {
      console.error('Callback handling failed:', error);
    }
    return res.status(200).json({ ok: true });
  }

  const message = update.message;
  if (!message?.chat?.id) return res.status(200).json({ ok: true });
  const language = normalizedLanguage(message.from?.language_code);

  if (message.refunded_payment) {
    try {
      const result = await handleRefundedPayment(message);
      // Only a refund that actually withdrew access is announced, so a redelivered
      // update cannot produce a second "your Premium was removed" message.
      if (result?.outcome === 'refunded' && result.revoked) await confirmRefund(message.chat.id, language);
    } catch (error) {
      console.error('Refund handling failed:', error);
    }
    return res.status(200).json({ ok: true });
  }

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
  if (command === 'support' || command === 'assistance') {
    await sendSupportMenu(message.chat.id, language);
    return res.status(200).json({ ok: true });
  }
  if (!Object.prototype.hasOwnProperty.call(COMMAND_VIEWS, command)) {
    // Not a command: if the user was mid support intake, this plain message is their
    // problem description. Anything else stays unanswered, as before.
    try {
      await handleSupportText(message.chat.id, language, message.from, db(), String(message.text || ''));
    } catch (error) {
      console.error('Support intake failed:', error);
    }
    return res.status(200).json({ ok: true });
  }

  if (command === 'start' || command === 'demarrer') {
    try { await configureLocalizedCommands(); }
    catch (error) { console.error('Unable to configure Telegram commands:', error); }
  }
  await sendCommand(message.chat.id, command, language);
  return res.status(200).json({ ok: true });
}
