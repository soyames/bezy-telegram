import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Premium UX consistency, Firestore-free. The single entitlement source is the backend
// /api/premium verdict, stubbed here. Pinned behaviour:
//   - an active member never sees an "Unlock Premium" pitch anywhere — the promo cards show
//     membership status and their buttons read "View membership";
//   - the Premium page shows status for active members and purchase UI for free/expired;
//   - the canonical benefits include Bezy messaging in EN and FR;
//   - the messaging lock follows the server verdict: free members are locked, active
//     members open the conversation with the composer.

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), '../..');
const en = JSON.parse(fs.readFileSync(path.join(root, 'locales/en.json'), 'utf8')).app;
const fr = JSON.parse(fs.readFileSync(path.join(root, 'locales/fr.json'), 'utf8')).app;

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
  conversation: { lastMessagePreview: '', lastMessageAt: null, lastMessageSenderId: '', unread: false }
};

const PLANS = [
  { id: 'monthly', stars: 100, durationMonths: 1 },
  { id: 'quarterly', stars: 250, durationMonths: 3 },
  { id: 'yearly', stars: 800, durationMonths: 12, bestValue: true }
];
const ACTIVE = { premium: { active: true, planId: 'yearly', expiresAt: '2027-09-11T00:00:00.000Z', daysRemaining: 365 }, plans: PLANS };
const FREE = { premium: { active: false }, plans: PLANS };
const EXPIRED = { premium: { active: false, planId: 'yearly', expiresAt: '2026-09-01T00:00:00.000Z', daysRemaining: 0 }, plans: PLANS };

async function stubApi(page, { premium, messagingLocked = false }) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/profile/me') {
      return route.fulfill({ json: { profile: ACCOUNT, notifications: null, processingRestricted: false, processingObjection: false, needsAgeConfirmation: false } });
    }
    if (url.pathname === '/api/premium') return route.fulfill({ json: { ok: true, ...premium } });
    if (url.pathname === '/api/likes') {
      return route.fulfill(premium.premium.active
        ? { json: { ok: true, likes: [], likeCount: 0 } }
        : { status: 403, json: { error: 'PREMIUM_REQUIRED', likeCount: 0 } });
    }
    if (url.pathname === '/api/matches') return route.fulfill({ json: { ok: true, matches: [MATCH_BO] } });
    if (url.pathname === '/api/discover') return route.fulfill({ json: { ok: true, profiles: [], stats: null, preferences: null } });
    if (url.pathname === '/api/messages') {
      if (messagingLocked) return route.fulfill({ status: 403, json: { error: 'PREMIUM_REQUIRED' } });
      const body = route.request().postDataJSON() || {};
      if (body.action === 'read') return route.fulfill({ json: { ok: true } });
      if (body.action === 'list') return route.fulfill({ json: { ok: true, conversationId: body.conversationId, messages: [] } });
      if (body.action === 'send') return route.fulfill({ json: { ok: true, message: { id: body.clientId, senderId: '900000001', text: body.text, createdAt: new Date().toISOString() } } });
    }
    return route.fulfill({ json: { ok: true } });
  });
}

test('an active Premium member never sees an Unlock Premium pitch', async ({ page }) => {
  await stubApi(page, { premium: ACTIVE });
  await page.goto('/?as=a');

  await expect(page.locator('#discover-view')).toHaveClass(/active/);
  await expect(page.locator('#discover-view')).not.toContainText(en.unlock_premium);
  await expect(page.locator('#premium-copy')).toHaveText(en.premium_active_intro);
  await page.locator('.nav button[data-view="matches"]').click();
  await expect(page.locator('#matches-premium-copy')).toHaveText(en.premium_active_intro);
  await expect(page.locator('#matches-view .premium-action')).toHaveText(en.view_membership);
  await expect(page.locator('#matches-view')).not.toContainText(en.unlock_premium);
});

test('the Premium page shows membership status and messaging among the benefits', async ({ page }) => {
  await stubApi(page, { premium: ACTIVE });
  await page.goto('/?as=a');
  await page.locator('#premiumBtn').click();
  await expect(page.locator('#premium-view')).toHaveClass(/active/);

  await expect(page.locator('#premium-content')).toContainText(en.active_until);
  await expect(page.locator('#premium-content')).toContainText('365');
  await expect(page.locator('#premium-content')).not.toContainText(en.subscribe_with_stars);
  await expect(page.locator('#premium-content')).toContainText(en.benefit_messaging);
});

test('the Premium benefits include Bezy messaging in French', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('bezy-language', 'fr'));
  await stubApi(page, { premium: ACTIVE });
  await page.goto('/?as=a');
  await page.locator('#premiumBtn').click();
  await expect(page.locator('#premium-content')).toContainText(fr.benefit_messaging);
});

test('a free user keeps the upgrade UI and the messaging lock', async ({ page }) => {
  await stubApi(page, { premium: FREE, messagingLocked: true });
  await page.goto('/?as=a');

  await expect(page.locator('#premium-copy')).toHaveText(en.premium_copy);
  await page.locator('.nav button[data-view="messages"]').click();
  await page.locator('#messages-view .match-card [data-open-chat]').first().click();
  await expect(page.locator('#chat-locked')).toBeVisible();
  await expect(page.locator('#chat-locked')).toContainText(en.msg_premium_locked);
  await page.locator('#chat-unlock').click();
  await expect(page.locator('#premium-view')).toHaveClass(/active/);
  await expect(page.locator('#premium-content')).toContainText(en.subscribe_with_stars);
});

test('an expired membership reads as free', async ({ page }) => {
  await stubApi(page, { premium: EXPIRED, messagingLocked: true });
  await page.goto('/?as=a');
  await page.locator('.nav button[data-view="matches"]').click();
  await expect(page.locator('#matches-view .premium-action')).toHaveText(en.unlock_premium);
  await page.locator('#matches-view .premium-action').click();
  await expect(page.locator('#premium-content')).toContainText(en.subscribe_with_stars);
});

test('an active Premium member opens a matched conversation with the composer', async ({ page }) => {
  await stubApi(page, { premium: ACTIVE });
  await page.goto('/?as=a');
  await page.locator('.nav button[data-view="messages"]').click();
  await page.locator('#messages-view .match-card [data-open-chat]').first().click();

  await expect(page.locator('#chat-screen')).toBeVisible();
  await expect(page.locator('#chat-locked')).toBeHidden();
  await page.locator('#chat-draft').fill('Bonjour Bo!');
  await page.locator('#chat-send').click();
  await expect(page.locator('#chat-messages .msg.sent')).toHaveCount(1);
  await expect(page.locator('#chat-messages .msg.sent').first()).toContainText('Bonjour Bo!');
});
