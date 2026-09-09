import crypto from 'node:crypto';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function telegramApi(method, body) {
  return fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!TELEGRAM_TOKEN) return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN is not configured' });

  const update = req.body;
  const message = update?.message;
  if (!message?.chat?.id) return res.status(200).json({ ok: true });

  const chatId = message.chat.id;
  const text = message.text || '';

  if (text.startsWith('/start')) {
    await telegramApi('sendMessage', {
      chat_id: chatId,
      text: '💜 Welcome to Bezy. Meet someone worth knowing.',
      reply_markup: {
        inline_keyboard: [[{ text: '💜 Open Bezy', web_app: { url: process.env.BEZY_MINI_APP_URL || 'https://bezy-telegram.vercel.app' } }]]
      }
    });
  } else if (text === '/help') {
    await telegramApi('sendMessage', {
      chat_id: chatId,
      text: 'Use /start to open Bezy. Your dating experience stays inside Telegram.'
    });
  }

  return res.status(200).json({ ok: true });
}
