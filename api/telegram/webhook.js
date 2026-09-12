import { configureLocalizedCommands, miniAppUrl, normalizedLanguage, localized, telegramApi } from '../_telegram.js';
import { db } from '../_firebase.js';
import { parseInvoicePayload, premiumPlan, nextExpiry, applyRefund } from '../_premium.js';
import { SUPPORT_CATEGORIES, createSupportRequest, diagnosePremium, diagnoseDiscovery, diagnoseProfile } from '../_support.js';
import { enforceRateLimit } from '../_ratelimit.js';

const COMMAND_VIEWS = {
  start: null, demarrer: null, help: null, aide: null, hilfe: null, ayuda: null, aiuto: null,
  profile: 'profile', profil: 'profile', perfil: 'profile', profilo: 'profile',
  discover: 'discover', decouvrir: 'discover', entdecken: 'discover', descubrir: 'discover', scopri: 'discover',
  matches: 'matches', matchs: 'matches', premium: 'premium',
  settings: 'profile', parametres: 'profile', einstellungen: 'profile', ajustes: 'profile', impostazioni: 'profile'
};

function commandName(text) {
  const first = String(text || '').trim().split(/\s+/)[0];
  return first.replace(/^\//, '').split('@')[0].toLowerCase();
}
function uiButton(language, view) { return { text: localized(language, { en: '💜 Open Bezy', fr: '💜 Ouvrir Bezy', de: '💜 Bezy öffnen', es: '💜 Abrir Bezy', it: '💜 Apri Bezy' }), web_app: { url: miniAppUrl(view) } }; }

// Long dates in bot messages follow the user's language; the timezone is pinned to UTC
// because Premium expiry is a UTC timestamp.
const DATE_LOCALE = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', it: 'it-IT' };
function dateLocale(language) { return DATE_LOCALE[language] || DATE_LOCALE.en; }

// A support action that fails must still answer the user — a silent dead button is a dead
// end. This fallback is the last line: it says what to do next without disclosing why.
function supportFailureMessage(language) {
  return localized(language, {
    en: 'Bezy could not process that right now. Please try again in a moment, or write to contacts@digitalconcordia.com.',
    fr: 'Bezy n’a pas pu traiter cette demande pour le moment. Réessayez dans un instant, ou écrivez à contacts@digitalconcordia.com.',
    de: 'Bezy konnte das gerade nicht verarbeiten. Versuche es gleich noch einmal oder schreibe an contacts@digitalconcordia.com.',
    es: 'Bezy no ha podido procesar eso ahora mismo. Inténtalo de nuevo en un momento o escribe a contacts@digitalconcordia.com.',
    it: 'Bezy non è riuscito a elaborare la richiesta in questo momento. Riprova tra poco o scrivi a contacts@digitalconcordia.com.'
  });
}
function helpText(language) {
  return localized(language, {
    en: ['💜 <b>How Bezy works</b>', '', '1. Create your profile in the Mini App.', '2. Discover compatible people.', '3. Like or pass.', '4. A match appears when interest is mutual.', '5. Then open the conversation directly in Telegram.', '', 'Bezy is for adults aged 18 and over.', '', 'Having a problem? Send /support.'].join('\n'),
    fr: ['💜 <b>Comment fonctionne Bezy</b>', '', '1. Créez votre profil dans la Mini App.', '2. Découvrez des personnes compatibles.', '3. Likez ou passez.', '4. Un match apparaît lorsque l’intérêt est réciproque.', '5. Ouvrez ensuite la conversation directement dans Telegram.', '', 'Bezy est réservé aux personnes de 18 ans et plus.', '', 'Un problème ? Envoyez /assistance.'].join('\n'),
    de: ['💜 <b>So funktioniert Bezy</b>', '', '1. Erstelle dein Profil in der Mini-App.', '2. Entdecke kompatible Personen.', '3. Like oder überspringe.', '4. Ein Match entsteht, wenn das Interesse gegenseitig ist.', '5. Öffne dann die Unterhaltung direkt in Telegram.', '', 'Bezy ist nur für Erwachsene ab 18 Jahren.', '', 'Bei einem Problem sende /support.'].join('\n'),
    es: ['💜 <b>Cómo funciona Bezy</b>', '', '1. Crea tu perfil en la Mini App.', '2. Descubre personas compatibles.', '3. Da like o pasa.', '4. Un match aparece cuando el interés es mutuo.', '5. Después abre la conversación directamente en Telegram.', '', 'Bezy es solo para personas adultas de 18 años o más.', '', '¿Tienes un problema? Envía /soporte.'].join('\n'),
    it: ['💜 <b>Come funziona Bezy</b>', '', '1. Crea il tuo profilo nella Mini App.', '2. Scopri persone compatibili.', '3. Metti like o passa.', '4. Un match appare quando l’interesse è reciproco.', '5. Poi apri la conversazione direttamente su Telegram.', '', 'Bezy è solo per adulti di 18 anni o più.', '', 'Hai un problema? Invia /assistenza.'].join('\n')
  });
}

// ---------------------------------------------------------------------------
// Support (CN-7): the bot is the primary support channel. Categories are machine tokens;
// labels follow the user's language. Troubleshooting reads only the caller's own document.
// ---------------------------------------------------------------------------

function supportLabel(language, category) {
  const labels = {
    en: { premium: 'Premium & Telegram Stars', profile: 'Profile', likes_matches: 'Likes & Matches', discovery: 'Discovery', privacy_account: 'Privacy & Account', problem: 'Report a problem', contact: 'Contact support' },
    fr: { premium: 'Premium & Telegram Stars', profile: 'Profil', likes_matches: 'Likes & matchs', discovery: 'Découverte', privacy_account: 'Confidentialité & compte', problem: 'Signaler un problème', contact: 'Contacter le support' },
    de: { premium: 'Premium & Telegram Stars', profile: 'Profil', likes_matches: 'Likes & Matches', discovery: 'Entdecken', privacy_account: 'Datenschutz & Konto', problem: 'Problem melden', contact: 'Support kontaktieren' },
    es: { premium: 'Premium y Telegram Stars', profile: 'Perfil', likes_matches: 'Likes y matches', discovery: 'Descubrimiento', privacy_account: 'Privacidad y cuenta', problem: 'Denunciar un problema', contact: 'Contactar con soporte' },
    it: { premium: 'Premium e Telegram Stars', profile: 'Profilo', likes_matches: 'Like e match', discovery: 'Scoperta', privacy_account: 'Privacy e account', problem: 'Segnala un problema', contact: 'Contatta il supporto' }
  };
  return (labels[language] || labels.en)[category] || category;
}

function supportMenuKeyboard(language) {
  const row = (a, b) => b ? [{ text: supportLabel(language, a), callback_data: `support:${a}` }, { text: supportLabel(language, b), callback_data: `support:${b}` }] : [{ text: supportLabel(language, a), callback_data: `support:${a}` }];
  return { inline_keyboard: [row('premium', 'profile'), row('likes_matches', 'discovery'), row('privacy_account', 'problem'), row('contact')] };
}

async function sendSupportMenu(chatId, language) {
  const text = localized(language, {
    en: ['🛟 <b>Help & support</b>', '', 'Choose what this is about. Where possible, I’ll diagnose the problem right away.', ''].join('\n'),
    fr: ['🛟 <b>Aide et assistance</b>', '', 'Choisissez ce qui vous concerne. Quand c’est possible, je diagnostique le problème tout de suite.', ''].join('\n'),
    de: ['🛟 <b>Hilfe & Support</b>', '', 'Wähle, worum es geht. Wenn möglich, diagnostiziere ich das Problem sofort.', ''].join('\n'),
    es: ['🛟 <b>Ayuda y soporte</b>', '', 'Elige de qué se trata. Cuando es posible, diagnostico el problema al momento.', ''].join('\n'),
    it: ['🛟 <b>Aiuto e supporto</b>', '', 'Scegli di cosa si tratta. Quando possibile, diagnostico subito il problema.', ''].join('\n')
  });
  await telegramApi('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: supportMenuKeyboard(language) });
}

function stillNeedHelpRow(language, category) {
  return [{ text: localized(language, { en: 'Still need help?', fr: 'J’ai encore besoin d’aide', de: 'Brauchst du weitere Hilfe?', es: '¿Aún necesitas ayuda?', it: 'Ti serve ancora aiuto?' }), callback_data: `support:new:${category}` }];
}

// The explicit Bezy language choice lives on the user document (`locale`, written by the
// Mini App selector). Where the webhook only has update context, the document is read so an
// explicit choice wins over the Telegram language; failures fall back to the Telegram
// language, never to an error. Pre-checkout answers are the deliberate exception: Telegram
// allows ten seconds for an answer and shows its own error copy, so they use the update's
// language directly.
async function resolveChatLanguage(firestore, from) {
  const telegramLanguage = normalizedLanguage(from?.language_code);
  if (!from?.id || !firestore) return telegramLanguage;
  try {
    const snap = await firestore.collection('users').doc(String(from.id)).get();
    const data = snap.exists ? snap.data() : {};
    return normalizedLanguage(data.locale || data.languageCode || from.language_code);
  } catch (error) {
    console.warn('[bezy-webhook] language lookup failed, using Telegram language:', error.message);
    return telegramLanguage;
  }
}

async function sendDiagnosis(chatId, language, textLines, keyboard) {
  await telegramApi('sendMessage', { chat_id: chatId, text: textLines.join('\n'), parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
}

async function supportPremium(chatId, language, userData) {
  const diag = diagnosePremium(userData);
  const openPremium = { text: localized(language, { en: '💎 View Premium', fr: '💎 Voir Premium', de: '💎 Premium ansehen', es: '💎 Ver Premium', it: '💎 Vedi Premium' }), web_app: { url: miniAppUrl('premium') } };
  let text;
  if (diag.revoked) {
    text = localized(language, {
      en: ['💎 <b>Premium</b>', '', 'Your Bezy Premium was refunded, so Premium access was removed. You can subscribe again anytime in Bezy Premium.', '', 'ℹ️ Telegram Premium is a separate subscription: it does not include Bezy Premium.'],
      fr: ['💎 <b>Premium</b>', '', 'Votre Bezy Premium a été remboursé, l’accès Premium a donc été retiré. Vous pouvez vous réabonner à tout moment dans Bezy Premium.', '', 'ℹ️ Telegram Premium est un abonnement distinct : il n’inclut pas Bezy Premium.'],
      de: ['💎 <b>Premium</b>', '', 'Dein Bezy Premium wurde erstattet, daher wurde der Premium-Zugang entfernt. Du kannst dich jederzeit in Bezy Premium erneut anmelden.', '', 'ℹ️ Telegram Premium ist ein separates Abo: Es enthält kein Bezy Premium.'],
      es: ['💎 <b>Premium</b>', '', 'Tu Bezy Premium ha sido reembolsado, así que se ha retirado el acceso Premium. Puedes volver a suscribirte cuando quieras en Bezy Premium.', '', 'ℹ️ Telegram Premium es una suscripción aparte: no incluye Bezy Premium.'],
      it: ['💎 <b>Premium</b>', '', 'Il tuo Bezy Premium è stato rimborsato, quindi l’accesso Premium è stato rimosso. Puoi abbonarti di nuovo in qualsiasi momento in Bezy Premium.', '', 'ℹ️ Telegram Premium è un abbonamento separato: non include Bezy Premium.']
    });
  } else if (diag.active) {
    const until = diag.expiresAt ? new Intl.DateTimeFormat(dateLocale(language), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(diag.expiresAt)) : '';
    text = localized(language, {
      en: ['💎 <b>Premium</b>', '', `Your Bezy Premium is active${until ? ` until ${until}` : ''} (${diag.daysRemaining} day(s) remaining).`, '', 'For Stars questions: Stars are managed by Telegram (Settings → My Stars).'],
      fr: ['💎 <b>Premium</b>', '', `Votre Bezy Premium est actif${until ? ` jusqu’au ${until}` : ''} (${diag.daysRemaining} jour(s) restant(s)).`, '', 'Pour les questions de Stars : les Stars sont gérés par Telegram (Réglages → Mes Stars).'],
      de: ['💎 <b>Premium</b>', '', `Dein Bezy Premium ist aktiv${until ? ` bis ${until}` : ''} (${diag.daysRemaining} Tag(e) verbleibend).`, '', 'Zu Stars-Fragen: Stars werden von Telegram verwaltet (Einstellungen → Meine Stars).'],
      es: ['💎 <b>Premium</b>', '', `Tu Bezy Premium está activo${until ? ` hasta ${until}` : ''} (quedan ${diag.daysRemaining} día(s)).`, '', 'Sobre las Stars: las gestiona Telegram (Ajustes → Mis Stars).'],
      it: ['💎 <b>Premium</b>', '', `Il tuo Bezy Premium è attivo${until ? ` fino al ${until}` : ''} (${diag.daysRemaining} giorno/i rimanenti).`, '', 'Per domande sulle Stars: le Stars sono gestite da Telegram (Impostazioni → Le mie Stars).']
    });
  } else {
    text = localized(language, {
      en: ['💎 <b>Premium</b>', '', 'No active Bezy Premium was detected on your account.', '', '• To subscribe: open Bezy → “View membership” → choose a plan.', '• Payment is in Telegram Stars ⭐ (Settings → My Stars).', '• Telegram Premium is a separate subscription: it does not include Bezy Premium.'],
      fr: ['💎 <b>Premium</b>', '', 'Aucun Bezy Premium actif n’est détecté sur votre compte.', '', '• Pour souscrire : ouvrez Bezy → « Voir l’abonnement » → choisissez une formule.', '• Le paiement se fait en Telegram Stars ⭐ (Réglages → Mes Stars).', '• Telegram Premium est un abonnement distinct : il n’inclut pas Bezy Premium.'],
      de: ['💎 <b>Premium</b>', '', 'Auf deinem Konto ist kein aktives Bezy Premium zu sehen.', '', '• Zum Abonnieren: Öffne Bezy → „Mitgliedschaft ansehen“ → wähle einen Plan.', '• Bezahlt wird mit Telegram Stars ⭐ (Einstellungen → Meine Stars).', '• Telegram Premium ist ein separates Abo: Es enthält kein Bezy Premium.'],
      es: ['💎 <b>Premium</b>', '', 'No se ha detectado ningún Bezy Premium activo en tu cuenta.', '', '• Para suscribirte: abre Bezy → «Ver suscripción» → elige un plan.', '• El pago es con Telegram Stars ⭐ (Ajustes → Mis Stars).', '• Telegram Premium es una suscripción aparte: no incluye Bezy Premium.'],
      it: ['💎 <b>Premium</b>', '', 'Non è stato rilevato nessun Bezy Premium attivo sul tuo account.', '', '• Per abbonarti: apri Bezy → «Vedi abbonamento» → scegli un piano.', '• Il pagamento avviene con Telegram Stars ⭐ (Impostazioni → Le mie Stars).', '• Telegram Premium è un abbonamento separato: non include Bezy Premium.']
    });
  }
  await sendDiagnosis(chatId, language, text, [stillNeedHelpRow(language, 'premium'), [openPremium]]);
}

async function supportProfile(chatId, language, userData) {
  const diag = diagnoseProfile(userData);
  const openProfile = { text: localized(language, { en: '👤 Open my profile', fr: '👤 Ouvrir mon profil', de: '👤 Mein Profil öffnen', es: '👤 Abrir mi perfil', it: '👤 Apri il mio profilo' }), web_app: { url: miniAppUrl('profile') } };
  const fieldNames = {
    en: { displayName: 'name', age: 'age', city: 'city', gender: '“I am”', seeking: '“looking for”' },
    fr: { displayName: 'nom', age: 'âge', city: 'ville', gender: '« je suis »', seeking: '« je recherche »' },
    de: { displayName: 'Name', age: 'Alter', city: 'Stadt', gender: '„Ich bin“', seeking: '„Ich suche“' },
    es: { displayName: 'nombre', age: 'edad', city: 'ciudad', gender: '«Yo soy»', seeking: '«Busco»' },
    it: { displayName: 'nome', age: 'età', city: 'città', gender: '«Io sono»', seeking: '«Cerco»' }
  };
  let text;
  if (!diag.complete) {
    const names = diag.missing.map((f) => (fieldNames[language] || fieldNames.en)[f]).join(', ');
    text = localized(language, {
      en: ['👤 <b>Profile</b>', '', `Your profile is incomplete. Missing: ${names}.`, '', 'Open Bezy → Profile, fill in the fields and press “Save profile”. Your profile only appears in Discover once it is complete.'],
      fr: ['👤 <b>Profil</b>', '', `Votre profil est incomplet. Il manque : ${names}.`, '', 'Ouvrez Bezy → Profil, complétez les champs, puis « Enregistrer le profil ». Votre profil n’apparaît dans Découvrir que lorsqu’il est complet.'],
      de: ['👤 <b>Profil</b>', '', `Dein Profil ist unvollständig. Es fehlt: ${names}.`, '', 'Öffne Bezy → Profil, fülle die Felder aus und tippe auf „Profil speichern“. Dein Profil erscheint erst in Entdecken, wenn es vollständig ist.'],
      es: ['👤 <b>Perfil</b>', '', `Tu perfil está incompleto. Faltan: ${names}.`, '', 'Abre Bezy → Perfil, rellena los campos y pulsa «Guardar perfil». Tu perfil solo aparece en Descubrir cuando está completo.'],
      it: ['👤 <b>Profilo</b>', '', `Il tuo profilo è incompleto. Mancano: ${names}.`, '', 'Apri Bezy → Profilo, compila i campi e premi «Salva profilo». Il tuo profilo appare in Scopri solo quando è completo.']
    });
  } else {
    text = localized(language, {
      en: ['👤 <b>Profile</b>', '', 'Your profile is complete. You can edit it anytime in Bezy → Profile.', '', 'Your Telegram username is only shown after a match — that is by design.'],
      fr: ['👤 <b>Profil</b>', '', 'Votre profil est complet. Vous pouvez le modifier à tout moment dans Bezy → Profil.', '', 'Votre nom d’utilisateur Telegram n’est montré qu’après un match — c’est normal.'],
      de: ['👤 <b>Profil</b>', '', 'Dein Profil ist vollständig. Du kannst es jederzeit in Bezy → Profil bearbeiten.', '', 'Dein Telegram-Benutzername wird erst nach einem Match angezeigt — das ist Absicht.'],
      es: ['👤 <b>Perfil</b>', '', 'Tu perfil está completo. Puedes editarlo cuando quieras en Bezy → Perfil.', '', 'Tu nombre de usuario de Telegram solo se muestra después de un match: es a propósito.'],
      it: ['👤 <b>Profilo</b>', '', 'Il tuo profilo è completo. Puoi modificarlo in qualsiasi momento in Bezy → Profilo.', '', 'Il tuo nome utente Telegram viene mostrato solo dopo un match: è voluto.']
    });
  }
  await sendDiagnosis(chatId, language, text, [stillNeedHelpRow(language, 'profile'), [openProfile]]);
}

async function supportDiscovery(chatId, language, userData) {
  const diag = diagnoseDiscovery(userData);
  const openDiscover = { text: localized(language, { en: '💜 Open Discover', fr: '💜 Ouvrir Découvrir', de: '💜 Entdecken öffnen', es: '💜 Abrir Descubrir', it: '💜 Apri Scopri' }), web_app: { url: miniAppUrl('discover') } };
  const findings = [];
  if (!diag.profileComplete) findings.push(localized(language, { en: '• Your profile is incomplete — complete it in Bezy → Profile.', fr: '• Votre profil est incomplet — complétez-le dans Bezy → Profil.', de: '• Dein Profil ist unvollständig — vervollständige es in Bezy → Profil.', es: '• Tu perfil está incompleto: complétalo en Bezy → Perfil.', it: '• Il tuo profilo è incompleto: completalo in Bezy → Profilo.' }));
  if (!diag.ageEligibilityConfirmed) findings.push(localized(language, { en: '• You have not confirmed that you are 18 or over yet.', fr: '• Vous n’avez pas encore confirmé avoir 18 ans ou plus.', de: '• Du hast noch nicht bestätigt, dass du 18 oder älter bist.', es: '• Todavía no has confirmado que tienes 18 años o más.', it: '• Non hai ancora confermato di avere 18 anni o più.' }));
  if (diag.processingRestricted) findings.push(localized(language, { en: '• Processing is paused — resume it in Profile → Safety & privacy.', fr: '• Le traitement est suspendu — reprenez-le dans Profil → Sécurité et confidentialité.', de: '• Die Verarbeitung ist pausiert — setze sie unter Profil → Sicherheit & Datenschutz fort.', es: '• El tratamiento está pausado: reanúdalo en Perfil → Seguridad y privacidad.', it: '• Il trattamento è in pausa: riprendilo in Profilo → Sicurezza e privacy.' }));
  if (diag.processingObjection) findings.push(localized(language, { en: '• You have objected to processing — withdraw the objection in Profile → Safety & privacy.', fr: '• Vous vous êtes opposé·e au traitement — retirez l’opposition dans Profil → Sécurité et confidentialité.', de: '• Du hast der Verarbeitung widersprochen — ziehe den Widerspruch unter Profil → Sicherheit & Datenschutz zurück.', es: '• Te has opuesto al tratamiento: retira la oposición en Perfil → Seguridad y privacidad.', it: '• Ti sei opposto al trattamento: ritira l’opposizione in Profilo → Sicurezza e privacy.' }));
  if (!diag.discoverable) findings.push(localized(language, { en: '• “Show my profile in Discover” is switched off.', fr: '• « Montrer mon profil dans Découvrir » est désactivé.', de: '• „Mein Profil in Entdecken anzeigen“ ist ausgeschaltet.', es: '• «Mostrar mi perfil en Descubrir» está desactivado.', it: '• «Mostra il mio profilo in Scopri» è disattivato.' }));
  if (diag.discoveryRemaining === 0) findings.push(localized(language, { en: '• You have reached today’s discovery limit — it resets tomorrow (Premium removes it).', fr: '• Vous avez atteint la limite de découverte du jour — elle se réinitialise demain (Premium la supprime).', de: '• Du hast das heutige Entdecken-Limit erreicht — es wird morgen zurückgesetzt (Premium entfernt es).', es: '• Has alcanzado el límite de descubrimiento de hoy: se restablece mañana (Premium lo elimina).', it: '• Hai raggiunto il limite di scoperta di oggi: si azzera domani (Premium lo elimina).' }));
  if (diag.filtersActive) findings.push(localized(language, { en: '• Your filters (city, same-city, languages, age range) narrow the results.', fr: '• Vos filtres (ville, même ville, langues, tranche d’âge) réduisent les résultats.', de: '• Deine Filter (Stadt, gleiche Stadt, Sprachen, Altersspanne) schränken die Ergebnisse ein.', es: '• Tus filtros (ciudad, misma ciudad, idiomas, rango de edad) reducen los resultados.', it: '• I tuoi filtri (città, stessa città, lingue, fascia d’età) restringono i risultati.' }));
  const text = findings.length
    ? [localized(language, { en: '🔎 <b>Discovery — here is what I see</b>', fr: '🔎 <b>Découverte — voici ce que je vois</b>', de: '🔎 <b>Entdecken — das sehe ich</b>', es: '🔎 <b>Descubrimiento: esto es lo que veo</b>', it: '🔎 <b>Scoperta: ecco cosa vedo</b>' }), '', ...findings]
    : [localized(language, { en: '🔎 <b>Discovery</b>', fr: '🔎 <b>Découverte</b>', de: '🔎 <b>Entdecken</b>', es: '🔎 <b>Descubrimiento</b>', it: '🔎 <b>Scoperta</b>' }), '', localized(language, {
      en: 'Everything looks correct: your profile is complete, you are discoverable, and you still have discovery actions left today. If there are few people around you, it may simply mean there are not many profiles yet.',
      fr: 'Tout semble correct : profil complet, visible dans Découvrir, et il vous reste des actions de découverte aujourd’hui. S’il y a peu de monde autour de vous, cela peut simplement signifier qu’il n’y a pas encore beaucoup de profils.',
      de: 'Alles sieht gut aus: Dein Profil ist vollständig, du bist sichtbar, und du hast heute noch Entdecken-Aktionen übrig. Wenn es wenige Leute in deiner Nähe gibt, kann das einfach bedeuten, dass es noch nicht viele Profile gibt.',
      es: 'Todo parece correcto: tu perfil está completo, eres visible en Descubrir y todavía te quedan acciones de descubrimiento hoy. Si hay poca gente cerca de ti, puede significar simplemente que aún no hay muchos perfiles.',
      it: 'Tutto sembra corretto: il tuo profilo è completo, sei visibile in Scopri e oggi hai ancora azioni di scoperta a disposizione. Se ci sono poche persone vicino a te, può semplicemente voler dire che non ci sono ancora molti profili.'
    })];
  await sendDiagnosis(chatId, language, text, [stillNeedHelpRow(language, 'discovery'), [openDiscover]]);
}

async function supportMatches(chatId, language, matchCount) {
  const openMatches = { text: localized(language, { en: '💜 Open my matches', fr: '💜 Ouvrir mes matchs', de: '💜 Meine Matches öffnen', es: '💜 Abrir mis matches', it: '💜 Apri i miei match' }), web_app: { url: miniAppUrl('matches') } };
  const text = matchCount > 0
    ? localized(language, {
      en: ['💜 <b>Likes & Matches</b>', '', `You have ${matchCount} match(es). Open Bezy → Matches to see them. The conversation itself happens here in Telegram.`, '', 'A like alone does not create a match: the interest must be mutual.'],
      fr: ['💜 <b>Likes & matchs</b>', '', `Vous avez ${matchCount} match(s). Ouvrez Bezy → Matchs pour les voir. La conversation elle-même a lieu ici, dans Telegram.`, '', 'Un like seul ne crée pas de match : il faut que l’intérêt soit réciproque.'],
      de: ['💜 <b>Likes & Matches</b>', '', `Du hast ${matchCount} Match(es). Öffne Bezy → Matches, um sie zu sehen. Die Unterhaltung selbst findet hier in Telegram statt.`, '', 'Ein Like allein ergibt kein Match: Das Interesse muss gegenseitig sein.'],
      es: ['💜 <b>Likes y matches</b>', '', `Tienes ${matchCount} match(es). Abre Bezy → Matches para verlos. La conversación en sí tiene lugar aquí, en Telegram.`, '', 'Un like por sí solo no crea un match: el interés debe ser mutuo.'],
      it: ['💜 <b>Like e match</b>', '', `Hai ${matchCount} match. Apri Bezy → Match per vederli. La conversazione stessa avviene qui, su Telegram.`, '', 'Un like da solo non crea un match: l’interesse deve essere reciproco.']
    })
    : localized(language, {
      en: ['💜 <b>Likes & Matches</b>', '', 'No matches yet. A match happens when two people like each other.', '', '• Complete your profile: it only appears in Discover once complete.', '• Check your filters — too strict, and they narrow the results.', '• Keep liking: the more you discover, the better your chances.'],
      fr: ['💜 <b>Likes & matchs</b>', '', 'Aucun match pour l’instant. Un match naît quand deux personnes se likent mutuellement.', '', '• Complétez votre profil : il apparaît dans Découvrir uniquement s’il est complet.', '• Vérifiez vos filtres — trop stricts, ils réduisent les résultats.', '• Continuez à liker : plus vous découvrez, plus vous avez de chances.'],
      de: ['💜 <b>Likes & Matches</b>', '', 'Noch keine Matches. Ein Match entsteht, wenn sich zwei Personen gegenseitig liken.', '', '• Vervollständige dein Profil: Es erscheint nur in Entdecken, wenn es vollständig ist.', '• Prüfe deine Filter — zu streng, und sie schränken die Ergebnisse ein.', '• Like weiter: Je mehr du entdeckst, desto besser deine Chancen.'],
      es: ['💜 <b>Likes y matches</b>', '', 'Todavía no hay matches. Un match se produce cuando dos personas se dan like mutuamente.', '', '• Completa tu perfil: solo aparece en Descubrir cuando está completo.', '• Revisa tus filtros: si son demasiado estrictos, reducen los resultados.', '• Sigue dando like: cuanto más descubres, más posibilidades tienes.'],
      it: ['💜 <b>Like e match</b>', '', 'Ancora nessun match. Un match nasce quando due persone si mettono like a vicenda.', '', '• Completa il tuo profilo: appare in Scopri solo quando è completo.', '• Controlla i filtri: se troppo restrittivi, riducono i risultati.', '• Continua a mettere like: più scopri, più probabilità hai.']
    });
  await sendDiagnosis(chatId, language, text, [stillNeedHelpRow(language, 'likes_matches'), [openMatches]]);
}

async function supportPrivacy(chatId, language) {
  const openProfile = { text: localized(language, { en: '👤 Open my profile', fr: '👤 Ouvrir mon profil', de: '👤 Mein Profil öffnen', es: '👤 Abrir mi perfil', it: '👤 Apri il mio profilo' }), web_app: { url: miniAppUrl('profile') } };
  const text = localized(language, {
    en: ['🔐 <b>Privacy & Account</b>', '', 'Much of this is self-service in Bezy → Profile → Safety & privacy:', '', '• Download my data', '• Pause processing (and resume it)', '• Object to processing', '• Delete my account', '', 'For legal or formal requests: contacts@digitalconcordia.com'],
    fr: ['🔐 <b>Confidentialité & compte</b>', '', 'Beaucoup de choses se font vous-même dans Bezy → Profil → Sécurité et confidentialité :', '', '• Télécharger mes données', '• Suspendre le traitement (et le reprendre)', '• S’opposer au traitement', '• Supprimer mon compte', '', 'Pour les demandes juridiques ou formelles : contacts@digitalconcordia.com'],
    de: ['🔐 <b>Datenschutz & Konto</b>', '', 'Vieles davon erledigst du selbst unter Bezy → Profil → Sicherheit & Datenschutz:', '', '• Meine Daten herunterladen', '• Verarbeitung pausieren (und fortsetzen)', '• Der Verarbeitung widersprechen', '• Konto löschen', '', 'Für rechtliche oder formelle Anfragen: contacts@digitalconcordia.com'],
    es: ['🔐 <b>Privacidad y cuenta</b>', '', 'Gran parte de esto puedes hacerlo tú mismo en Bezy → Perfil → Seguridad y privacidad:', '', '• Descargar mis datos', '• Pausar el tratamiento (y reanudarlo)', '• Oponerse al tratamiento', '• Eliminar mi cuenta', '', 'Para solicitudes legales o formales: contacts@digitalconcordia.com'],
    it: ['🔐 <b>Privacy e account</b>', '', 'Gran parte di questo puoi farlo da solo in Bezy → Profilo → Sicurezza e privacy:', '', '• Scarica i miei dati', '• Metti in pausa il trattamento (e riprendilo)', '• Opponiti al trattamento', '• Elimina il mio account', '', 'Per richieste legali o formali: contacts@digitalconcordia.com']
  });
  await sendDiagnosis(chatId, language, text, [stillNeedHelpRow(language, 'privacy_account'), [openProfile]]);
}

async function handleSupportCategory(chatId, language, from, category, firestore) {
  const userSnap = await firestore.collection('users').doc(String(from.id)).get();
  const userData = userSnap.data() || {};
  // The document is already in hand: the explicit Bezy choice wins over the Telegram
  // language, matching how notifications resolve the recipient's language.
  language = normalizedLanguage(userData.locale || from.language_code);
  if (category === 'contact' || category === 'problem') {
    await beginSupportIntake(chatId, language, from, category, firestore);
    return;
  }
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
  const text = localized(language, {
    en: ['🛟 <b>Describe your problem</b>', '', 'Just reply here with your next message: what you did, what you saw, and what you expected.'].join('\n'),
    fr: ['🛟 <b>Décrivez votre problème</b>', '', 'Répondez simplement ici avec votre prochain message : ce que vous avez fait, ce que vous avez vu, et ce qui vous attendiez.'].join('\n'),
    de: ['🛟 <b>Beschreibe dein Problem</b>', '', 'Antworte einfach hier mit deiner nächsten Nachricht: was du getan hast, was du gesehen hast und was du erwartet hast.'].join('\n'),
    es: ['🛟 <b>Describe tu problema</b>', '', 'Responde aquí con tu siguiente mensaje: qué has hecho, qué has visto y qué esperabas.'].join('\n'),
    it: ['🛟 <b>Descrivi il tuo problema</b>', '', 'Rispondi qui con il prossimo messaggio: cosa hai fatto, cosa hai visto e cosa ti aspettavi.'].join('\n')
  });
  await telegramApi('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
}

async function handleSupportText(chatId, language, from, firestore, messageText) {
  const userId = String(from.id);
  const userRef = firestore.collection('users').doc(userId);
  const userSnap = await userRef.get();
  const userData = userSnap.data() || {};
  const pending = userData.pendingSupportRequest;
  if (!pending || !SUPPORT_CATEGORIES.includes(pending.category)) return false;
  // The document is already in hand: the explicit Bezy choice wins over the Telegram
  // language, matching how notifications resolve the recipient's language.
  language = normalizedLanguage(userData.locale || from.language_code);

  // Support spam protection: the same bucket as the Mini App, so neither channel can flood
  // the queue. Fails open like every rate limit.
  try {
    await enforceRateLimit(firestore, userId, 'support_create');
  } catch (error) {
    if (error.rateLimited) {
      const text = localized(language, { en: 'You have sent too many requests. Please try again in a moment.', fr: 'Vous avez envoyé trop de demandes. Réessayez dans un moment.', de: 'Du hast zu viele Anfragen gesendet. Versuche es gleich noch einmal.', es: 'Has enviado demasiadas solicitudes. Vuelve a intentarlo en un momento.', it: 'Hai inviato troppe richieste. Riprova tra un momento.' });
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
  const text = localized(language, {
    en: `Your support request has been received.\nReference: ${reference}.\nWe'll review it and get back to you here. For legal or formal matters: contacts@digitalconcordia.com`,
    fr: `Votre demande d’assistance a bien été reçue.\nRéférence : ${reference}.\nNous allons l’examiner et vous répondre ici. Pour les questions juridiques ou formelles : contacts@digitalconcordia.com`,
    de: `Deine Support-Anfrage ist eingegangen.\nReferenz: ${reference}.\nWir prüfen sie und melden uns hier bei dir. Für rechtliche oder formelle Anliegen: contacts@digitalconcordia.com`,
    es: `Hemos recibido tu solicitud de soporte.\nReferencia: ${reference}.\nLa revisaremos y te responderemos aquí. Para asuntos legales o formales: contacts@digitalconcordia.com`,
    it: `La tua richiesta di supporto è stata ricevuta.\nRiferimento: ${reference}.\nLa esamineremo e ti risponderemo qui. Per questioni legali o formali: contacts@digitalconcordia.com`
  });
  await telegramApi('sendMessage', { chat_id: chatId, text });
  return true;
}

async function sendCommand(chatId, command, language) {
  if (command === 'help' || command === 'aide') {
    await telegramApi('sendMessage', { chat_id: chatId, text: helpText(language), parse_mode: 'HTML', reply_markup: { inline_keyboard: [[uiButton(language, null)]] } });
    return;
  }
  if (command === 'premium') {
    const text = localized(language, {
      en: ['💎 <b>Bezy Premium</b>', '', 'Unlock more ways to discover meaningful connections.', '', '✓ See who liked you', '✓ Advanced discovery', '✓ More Super Likes', '✓ Increased visibility', '✓ Unlimited discovery', '',
         'Payment is made with Telegram Stars ⭐. You need Stars in your balance (Settings → My Stars).', '',
         '⚠️ Telegram Premium is a separate Telegram subscription and does not include Bezy Premium.', '', 'Open Bezy Premium to choose your plan.'].join('\n'),
      fr: ['💎 <b>Bezy Premium</b>', '', 'Débloquez davantage de façons de faire de belles rencontres.', '', '✓ Voir qui vous a liké', '✓ Découverte avancée', '✓ Plus de Super Likes', '✓ Visibilité accrue', '✓ Découverte illimitée', '',
         'Le paiement se fait avec les Telegram Stars ⭐. Vous devez disposer de Stars sur votre solde (Réglages → Mes Stars).', '',
         '⚠️ Telegram Premium est un abonnement Telegram distinct et n’inclut pas Bezy Premium.', '', 'Ouvrez Bezy Premium pour choisir votre formule.'].join('\n'),
      de: ['💎 <b>Bezy Premium</b>', '', 'Schalte weitere Wege frei, um besondere Verbindungen zu finden.', '', '✓ Sieh, wer dich geliked hat', '✓ Erweiterte Suche', '✓ Mehr Super Likes', '✓ Mehr Sichtbarkeit', '✓ Unbegrenztes Entdecken', '',
         'Bezahlt wird mit Telegram Stars ⭐. Du brauchst Stars auf deinem Guthaben (Einstellungen → Meine Stars).', '',
         '⚠️ Telegram Premium ist ein separates Telegram-Abo und enthält kein Bezy Premium.', '', 'Öffne Bezy Premium, um deinen Plan zu wählen.'].join('\n'),
      es: ['💎 <b>Bezy Premium</b>', '', 'Desbloquea más formas de encontrar conexiones especiales.', '', '✓ Ve quién te ha dado like', '✓ Descubrimiento avanzado', '✓ Más Super Likes', '✓ Más visibilidad', '✓ Descubrimiento ilimitado', '',
         'El pago se realiza con Telegram Stars ⭐. Necesitas Stars en tu saldo (Ajustes → Mis Stars).', '',
         '⚠️ Telegram Premium es una suscripción aparte de Telegram y no incluye Bezy Premium.', '', 'Abre Bezy Premium para elegir tu plan.'].join('\n'),
      it: ['💎 <b>Bezy Premium</b>', '', 'Sblocca altri modi per trovare connessioni speciali.', '', '✓ Vedi chi ti ha messo like', '✓ Scoperta avanzata', '✓ Più Super Like', '✓ Maggiore visibilità', '✓ Scoperta illimitata', '',
         'Il pagamento avviene con le Telegram Stars ⭐. Ti servono Stars nel tuo saldo (Impostazioni → Le mie Stars).', '',
         '⚠️ Telegram Premium è un abbonamento Telegram separato e non include Bezy Premium.', '', 'Apri Bezy Premium per scegliere il tuo piano.'].join('\n')
    });
    const label = localized(language, { en: '💎 View Premium', fr: '💎 Voir Premium', de: '💎 Premium ansehen', es: '💎 Ver Premium', it: '💎 Vedi Premium' });
    await telegramApi('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: label, web_app: { url: miniAppUrl('premium') } }]] } });
    return;
  }
  const view = COMMAND_VIEWS[command] ?? null;
  const text = localized(language, { en: '💜 Welcome to Bezy. Meet someone worth knowing.', fr: '💜 Bienvenue sur Bezy. Rencontrez quelqu’un qui mérite d’être connu.', de: '💜 Willkommen bei Bezy. Lerne jemanden kennen, der es wert ist.', es: '💜 Te damos la bienvenida a Bezy. Conoce a alguien que merece la pena.', it: '💜 Benvenuto su Bezy. Conosci qualcuno che valga la pena.' });
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
  },
  de: {
    invalid: 'Dieser Zahlungslink ist nicht gültig. Bitte öffne Bezy Premium erneut und versuche es noch einmal.',
    plan: 'Dieser Premium-Plan ist nicht mehr verfügbar.',
    account: 'Dieser Zahlungslink gehört zu einem anderen Telegram-Konto.',
    currency: 'Bezy Premium kann nur mit Telegram Stars gekauft werden.',
    price: 'Der Preis hat sich geändert. Bitte öffne Bezy Premium erneut und versuche es noch einmal.',
    expired: 'Dieser Zahlungslink ist abgelaufen. Bitte öffne Bezy Premium erneut.',
    unverified: 'Diese Zahlung konnte nicht bestätigt werden. Bitte öffne Bezy Premium erneut.'
  },
  es: {
    invalid: 'Este enlace de pago no es válido. Vuelve a abrir Bezy Premium e inténtalo de nuevo.',
    plan: 'Ese plan Premium ya no está disponible.',
    account: 'Este enlace de pago pertenece a otra cuenta de Telegram.',
    currency: 'Bezy Premium solo se puede comprar con Telegram Stars.',
    price: 'El precio ha cambiado. Vuelve a abrir Bezy Premium e inténtalo de nuevo.',
    expired: 'Este enlace de pago ha caducado. Vuelve a abrir Bezy Premium.',
    unverified: 'No se pudo verificar este pago. Vuelve a abrir Bezy Premium.'
  },
  it: {
    invalid: 'Questo link di pagamento non è valido. Riapri Bezy Premium e riprova.',
    plan: 'Questo piano Premium non è più disponibile.',
    account: 'Questo link di pagamento appartiene a un altro account Telegram.',
    currency: 'Bezy Premium può essere acquistato solo con le Telegram Stars.',
    price: 'Il prezzo è cambiato. Riapri Bezy Premium e riprova.',
    expired: 'Questo link di pagamento è scaduto. Riapri Bezy Premium.',
    unverified: 'Non è stato possibile verificare questo pagamento. Riapri Bezy Premium.'
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
  const text = localized(language, {
    en: '↩️ Your Bezy Premium subscription has been refunded, and Premium access has been removed from your account.\n\nYour profile, your matches and your Telegram conversations are unaffected.',
    fr: '↩️ Votre abonnement Bezy Premium a été remboursé. L’accès Premium a été retiré de votre compte.\n\nVotre profil, vos matchs et vos conversations Telegram ne sont pas affectés.',
    de: '↩️ Dein Bezy-Premium-Abo wurde erstattet, und der Premium-Zugang wurde von deinem Konto entfernt.\n\nDein Profil, deine Matches und deine Telegram-Unterhaltungen sind nicht betroffen.',
    es: '↩️ Tu suscripción de Bezy Premium ha sido reembolsada y el acceso Premium se ha retirado de tu cuenta.\n\nTu perfil, tus matches y tus conversaciones de Telegram no se ven afectados.',
    it: '↩️ Il tuo abbonamento Bezy Premium è stato rimborsato e l’accesso Premium è stato rimosso dal tuo account.\n\nIl tuo profilo, i tuoi match e le tue conversazioni Telegram non sono interessati.'
  });
  const label = localized(language, { en: '💜 Open Bezy', fr: '💜 Ouvrir Bezy', de: '💜 Bezy öffnen', es: '💜 Abrir Bezy', it: '💜 Apri Bezy' });
  await telegramApi('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: { inline_keyboard: [[{ text: label, web_app: { url: miniAppUrl('premium') } }]] }
  });
}

async function confirmPremium(chatId, language, expiresAt) {
  const date = expiresAt ? new Date(expiresAt.toMillis?.() ?? expiresAt) : null;
  const until = date
    ? new Intl.DateTimeFormat(dateLocale(language), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
    : '';
  const text = localized(language, {
    en: `💎 Bezy Premium is now active!${until ? `\n\nActive until ${until}.` : ''}`,
    fr: `💎 Bezy Premium est maintenant actif !${until ? `\n\nActif jusqu’au ${until}.` : ''}`,
    de: `💎 Bezy Premium ist jetzt aktiv!${until ? `\n\nAktiv bis ${until}.` : ''}`,
    es: `💎 ¡Bezy Premium ya está activo!${until ? `\n\nActivo hasta el ${until}.` : ''}`,
    it: `💎 Bezy Premium è ora attivo!${until ? `\n\nAttivo fino al ${until}.` : ''}`
  });
  const label = localized(language, { en: '💎 Open Bezy', fr: '💎 Ouvrir Bezy', de: '💎 Bezy öffnen', es: '💎 Abrir Bezy', it: '💎 Apri Bezy' });
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
          const language = await resolveChatLanguage(db(), from);
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
      try {
        const chatId = update.callback_query?.message?.chat?.id;
        const from = update.callback_query?.from;
        if (chatId && from) {
          await telegramApi('sendMessage', { chat_id: chatId, text: supportFailureMessage(normalizedLanguage(from.language_code)) });
        }
      } catch (replyError) {
        console.error('Support failure reply failed:', replyError);
      }
    }
    return res.status(200).json({ ok: true });
  }

  const message = update.message;
  if (!message?.chat?.id) return res.status(200).json({ ok: true });
  // The explicit Bezy choice wins over the Telegram language where the user document can
  // safely be read; every other bot reply falls back to the Telegram language.
  const language = await resolveChatLanguage(db(), message.from);

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
      try {
        await telegramApi('sendMessage', { chat_id: message.chat.id, text: supportFailureMessage(language) });
      } catch (replyError) {
        console.error('Support failure reply failed:', replyError);
      }
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
