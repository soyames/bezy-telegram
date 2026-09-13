import { ApiError } from './_db.js';
import { requirePost, requireTelegramUser } from './_telegram.js';
import { rateLimit } from './_ratelimit.js';
import { normalizeSupportRequest, createSupportRequest, listSupportRequests } from './_support.js';

// Mini App side of the support flow (CN-7). The bot is the primary channel — the webhook
// creates the same requests from Telegram update context — and this endpoint lets the Mini
// App Help & support card do two things: file a request, and list the caller's own requests.
//
// Identity comes only from validated initData, so a caller can never read or write another
// user's requests, and creation is rate-limited against support spam.

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const user = requireTelegramUser(req, res);
  if (!user) return;

  const action = String(req.body?.action || '');
  try {
    if (action === 'create') {
      if (!(await rateLimit(null, res, user.id, 'support_create'))) return;
      const request = normalizeSupportRequest(req.body);
      if (!request.category || !request.details) {
        return res.status(400).json({ error: 'INVALID_ACTION' });
      }
      const reference = await createSupportRequest(null, {
        telegramUserId: user.id,
        category: request.category,
        details: request.details,
        languageCode: user.language_code || null
      });
      return res.status(200).json({ ok: true, reference });
    }
    if (action === 'list') {
      return res.status(200).json({ ok: true, requests: await listSupportRequests(null, user.id) });
    }
    return res.status(400).json({ error: 'INVALID_ACTION' });
  } catch (error) {
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message });
    console.error('Support request failed:', error);
    return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
  }
}
