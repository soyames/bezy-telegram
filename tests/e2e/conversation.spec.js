import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// The Bezy conversation flow, Firestore-free: API responses are stubbed, so the suite runs
// on every engine without credentials or quota. It pins the chat screen behaviour end to
// end — opening a conversation, composing, sending (with retry), the Premium gate, the
// unavailable state, "Use this message" and the unread preview on the Messages list.
//
// The API-side authorization chain (initData-derived sender, match/blocks/premium gates,
// idempotent ids) is exercised by the backend suite and pinned by the contract suite.

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), '../..');
const en = JSON.parse(fs.readFileSync(path.join(root, 'locales/en.json'), 'utf8')).app;

// The account the stub user "a" loads on boot.
const ACCOUNT = {
  profile: { displayName: 'Ada', age: 29, city: 'Paris', gender: 'woman', seeking: 'men', interests: ['music'], languages: [], prompts: [], bio: '', discoverable: true },
  profileComplete: true,
  discoverable: true,
  needsProfile: false,
  photoUrl: '',
  firstName: 'Ada'
};

const MATCH_BO = {
  id: '900000002', displayName: 'Bo', age: 31, city: 'Paris', bio: 'E2E.', interests: ['music'], prompts: [], languages: [], photoUrl: '',
  username: 'bo_bezy_test',
  sharedSignals: [{ type: 'interests', values: ['music'] }, { type: 'city', values: ['Paris'] }, { type: 'age', values: [] }],
  matchId: 'match-bo', matchedAtMs: Date.now(), matchedAt: new Date().toISOString(),
  conversation: { lastMessagePreview: 'Hey there 👋', lastMessageAt: new Date().toISOString(), lastMessageSenderId: '900000002', unread: true }
};

async function stubApi(page, { matches, messages = [], premiumRequired = false, unavailable = false, failNextSend = false }) {
  const store = [...messages];
  let failNext = failNextSend;
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/profile/me') {
      return route.fulfill({ json: { profile: ACCOUNT, notifications: null, processingRestricted: false, processingObjection: false, needsAgeConfirmation: false } });
    }
    if (url.pathname === '/api/matches') return route.fulfill({ json: { ok: true, matches } });
    if (url.pathname === '/api/discover') return route.fulfill({ json: { ok: true, profiles: [], stats: null, preferences: null } });
    if (url.pathname === '/api/premium') return route.fulfill({ json: { ok: true, premium: { active: false }, plans: [] } });
    if (url.pathname === '/api/messages') {
      const body = route.request().postDataJSON() || {};
      if (premiumRequired) return route.fulfill({ status: 403, json: { error: 'PREMIUM_REQUIRED' } });
      if (unavailable) return route.fulfill({ status: 404, json: { error: 'CONVERSATION_UNAVAILABLE' } });
      if (body.action === 'read') return route.fulfill({ json: { ok: true } });
      if (body.action === 'list') return route.fulfill({ json: { ok: true, conversationId: body.conversationId, messages: store } });
      if (body.action === 'send') {
        if (failNext) { failNext = false; return route.fulfill({ status: 500, json: { error: 'DATABASE_UNAVAILABLE' } }); }
        const message = { id: body.clientId, senderId: '900000001', text: body.text, createdAt: new Date().toISOString() };
        store.push(message);
        return route.fulfill({ json: { ok: true, message } });
      }
      return route.fulfill({ status: 400, json: { error: 'INVALID_ACTION' } });
    }
    return route.fulfill({ json: { ok: true } });
  });
}

const openMessages = async (page) => {
  await page.locator('.nav button[data-view="messages"]').click();
  await expect(page.locator('#messages-view')).toHaveClass(/active/);
};
const openFirstConversation = async (page) => {
  await page.locator('#messages-view .match-card [data-open-chat]').first().click();
  await expect(page.locator('#chat-screen')).toBeVisible();
};

test('a matched user opens the Bezy conversation from the Messages tab', async ({ page }) => {
  await stubApi(page, { matches: [MATCH_BO], messages: [{ id: 'm1', senderId: '900000002', text: 'Hey there 👋', createdAt: new Date().toISOString() }] });
  await page.goto('/?as=a');
  await openMessages(page);
  await expect(page.locator('#messages-view .match-card [data-open-chat]')).toHaveText(en.start_conversation);
  await openFirstConversation(page);
  await expect(page.locator('#chat-name')).toHaveText('Bo');
  await expect(page.locator('#chat-why .why-label')).toHaveText(en.why_matched);
  // The stubbed history renders; the unread dot shows on the list card.
  await expect(page.locator('#chat-messages .msg')).toHaveCount(1);
  await expect(page.locator('#chat-messages .msg.received')).toContainText('Hey there 👋');
  await expect(page.locator('#messages-view .mf-preview.unread')).toHaveCount(1);
});

test('a Premium user can send a message and sees it immediately', async ({ page }) => {
  await stubApi(page, { matches: [MATCH_BO] });
  await page.goto('/?as=a');
  await openMessages(page);
  await openFirstConversation(page);

  const send = page.locator('#chat-send');
  await expect(send).toBeDisabled();
  await page.locator('#chat-draft').fill('Hello Bo!');
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.locator('#chat-draft')).toHaveValue('');
  await expect(page.locator('#chat-messages .msg.sent')).toHaveCount(1);
  await expect(page.locator('#chat-messages .msg.sent').first()).toContainText('Hello Bo!');
});

test('a failed send is recoverable with retry and no duplicate', async ({ page }) => {
  await stubApi(page, { matches: [MATCH_BO], failNextSend: true });
  await page.goto('/?as=a');
  await openMessages(page);
  await openFirstConversation(page);

  await page.locator('#chat-draft').fill('Will it send?');
  await page.locator('#chat-send').click();
  await expect(page.locator('#chat-messages .msg.failed')).toHaveCount(1);
  await page.locator('#chat-messages .msg.failed [data-retry]').click();
  await expect(page.locator('#chat-messages .msg.failed')).toHaveCount(0);
  await expect(page.locator('#chat-messages .msg.sent').last()).toContainText('Will it send?');
  // The retry carried the same idempotent client id: still exactly one confirmed message.
  await expect(page.locator('#chat-messages .msg.sent').filter({ hasText: 'Will it send?' })).toHaveCount(1);
});

test('messaging is Premium-gated: a matched non-Premium user sees the lock, not the composer', async ({ page }) => {
  await stubApi(page, { matches: [MATCH_BO], premiumRequired: true });
  await page.goto('/?as=a');
  await openMessages(page);
  await openFirstConversation(page);

  await expect(page.locator('#chat-locked')).toBeVisible();
  await expect(page.locator('#chat-locked')).toContainText(en.msg_premium_locked);
  await expect(page.locator('#chat-composer')).toBeHidden();
  await page.locator('#chat-unlock').click();
  await expect(page.locator('#premium-view')).toHaveClass(/active/);
});

test('an unavailable conversation says so instead of showing a dead composer', async ({ page }) => {
  await stubApi(page, { matches: [MATCH_BO], unavailable: true });
  await page.goto('/?as=a');
  await openMessages(page);
  await openFirstConversation(page);

  await expect(page.locator('#chat-status')).toHaveText(en.msg_conversation_unavailable);
  await expect(page.locator('#chat-composer')).toBeHidden();
});

test('"Use this message" fills the composer without sending', async ({ page }) => {
  // No messages yet: the empty state offers the starters, which is the moment a starter
  // matters most.
  await stubApi(page, { matches: [MATCH_BO] });
  await page.goto('/?as=a');
  await openMessages(page);
  await openFirstConversation(page);

  await page.locator('#chat-messages #chat-starters').click();
  const sheet = page.locator('.sheet');
  await expect(sheet.locator('[data-use="0"]')).toHaveText(en.msg_use_this_message);
  await sheet.locator('[data-use="0"]').click();
  await expect(page.locator('#chat-draft')).toHaveValue(en.starter_interest.replace('{value}', 'music'));
  // Nothing was sent: the message list is still empty.
  await expect(page.locator('#chat-messages .msg')).toHaveCount(0);
  await expect(page.locator('#chat-draft')).toBeFocused();
});

test('safety actions stay available from the conversation screen', async ({ page }) => {
  await stubApi(page, { matches: [MATCH_BO] });
  await page.goto('/?as=a');
  await openMessages(page);
  await openFirstConversation(page);

  await page.locator('#chat-menu').click();
  const sheet = page.locator('.sheet');
  await expect(sheet).toContainText(en.block);
  await expect(sheet).toContainText(en.report);
  await expect(sheet).toContainText(en.unmatch);
});

test('an unmatched user gets no conversation CTA', async ({ page }) => {
  await stubApi(page, { matches: [] });
  await page.goto('/?as=a');
  await openMessages(page);

  await expect(page.locator('#messages-view [data-open-chat]')).toHaveCount(0);
  await expect(page.locator('#message-empty')).toBeVisible();
  await expect(page.locator('#message-empty')).toHaveText(en.no_conversations);
});
