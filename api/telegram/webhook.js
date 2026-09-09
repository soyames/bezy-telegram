import { configureLocalizedCommands, miniAppUrl, normalizedLanguage, telegramApi } from '../_telegram.js';

const COMMAND_VIEWS = {
  start: null,
  demarrer: null,
  help: null,
  aide: null,
  profile: 'profile',
  profil: 'profile',
  discover: 'discover',
  decouvrir: 'discover',
  matches: 'matches',
  matchs: 'matches',
  premium: 'premium',
  settings: 'profile',
  parametres: 'profile'
};

function commandName(text) {
  const first = String(text || '').trim().split(/\s+/)[0];
  return first.replace(/^\//, '').split('@')[0].toLowerCase();
}

function uiButton(language, view) {
  return {
    text: language === 'fr' ? '💜 Ouvrir Bezy' : '💜 Open Bezy',
    web_app: { url: miniAppUrl(view) }
  };
}

function helpText(language) {
  if (language === 'fr') {
    return [
      '💜 <b>Comment fonctionne Bezy</b>',
      '',
      '1. Créez votre profil dans la Mini App.',
      '2. Découvrez des personnes compatibles.',
      '3. Likez ou passez.',
      '4. Un match apparaît lorsque l’intérêt est réciproque.',
      '5. Ouvrez ensuite la conversation directement dans Telegram.',
      '',
      'Bezy est réservé aux personnes de 18 ans et plus.'
    ].join('\n');
  }
  return [
    '💜 <b>How Bezy works</b>',
    '',
    '1. Create your profile in the Mini App.',
    '2. Discover compatible people.',
    '3. Like or pass.',
    '4. A match appears when interest is mutual.',
    '5. Then open the conversation directly in Telegram.',
    '',
    'Bezy is for adults aged 18 and over.'
  ].join('\n');
}

async function sendCommand(chatId, command, language) {
  if (command === 'help' || command === 'aide') {
    await telegramApi('sendMessage', {
      chat_id: chatId,
      text: helpText(language),
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[uiButton(language, null)]] }
    });
    return;
  }

  if (command === 'premium') {
    await telegramApi('sendMessage', {
      chat_id: chatId,
      text: language === 'fr'
        ? '✨ Bezy Premium arrive bientôt. Les achats seront intégrés à Telegram Stars.'
        : '✨ Bezy Premium is coming soon. Purchases will be integrated with Telegram Stars.',
      reply_markup: { inline_keyboard: [[uiButton(language, 'premium')]] }
    });
    return;
  }

  const view = COMMAND_VIEWS[command] ?? null;
  const text = language === 'fr'
    ? '💜 Bienvenue sur Bezy. Rencontrez quelqu’un qui mérite d’être connu.'
    : '💜 Welcome to Bezy. Meet someone worth knowing.';

  await telegramApi('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: { inline_keyboard: [[uiButton(language, view)]] }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.TELEGRAM_BOT_TOKEN) return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN is not configured' });

  const update = req.body || {};
  const message = update.message;
  if (!message?.chat?.id) return res.status(200).json({ ok: true });

  const language = normalizedLanguage(message.from?.language_code);
  const command = commandName(message.text);
  if (!COMMAND_VIEWS.hasOwnProperty(command)) return res.status(200).json({ ok: true });

  if (command === 'start' || command === 'demarrer') {
    try {
      await configureLocalizedCommands();
    } catch (error) {
      console.error('Unable to configure Telegram commands:', error);
    }
  }

  await sendCommand(message.chat.id, command, language);
  return res.status(200).json({ ok: true });
}
