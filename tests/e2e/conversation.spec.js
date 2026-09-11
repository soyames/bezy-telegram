import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// The match → conversation flow, Firestore-free: API responses are stubbed, so the suite
// runs on every engine without credentials or quota. It pins the things a live Telegram
// client decides — the resolved conversation target is captured by the harness's Telegram
// stub (window.__lastTelegramLink) instead of actually opening Telegram.
//
// Pinned behaviour:
//   - a matched user always gets the Start/Continue conversation CTA, and it resolves to
//     the matched user's t.me link (username) or the bot match-message flow (no username —
//     the webview cannot fire tg:// deep links reliably);
//   - Ways to start always yields at least one usable opener plus the why-you-matched chips;
//   - safety actions stay available from the Messages tab;
//   - an unmatched user gets no conversation CTA at all;
//   - the CTA is not Premium-gated (the current design gates matching, not messaging).

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
  matchId: 'match-bo', matchedAtMs: Date.now(), matchedAt: new Date().toISOString()
};

// No @username: the hand-off must resolve Telegram's numeric-user deep link instead.
const MATCH_CY = {
  id: '900000003', displayName: 'Cy', age: 33, city: 'Lyon', bio: '', interests: [], prompts: [], languages: [], photoUrl: '',
  username: '',
  sharedSignals: [],
  matchId: 'match-cy', matchedAtMs: Date.now(), matchedAt: new Date().toISOString()
};

async function stubApi(page, { matches }) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/profile/me') {
      return route.fulfill({ json: { profile: ACCOUNT, notifications: null, processingRestricted: false, processingObjection: false, needsAgeConfirmation: false } });
    }
    if (url.pathname === '/api/matches') return route.fulfill({ json: { ok: true, matches } });
    if (url.pathname === '/api/discover') return route.fulfill({ json: { ok: true, profiles: [], stats: null, preferences: null } });
    if (url.pathname === '/api/premium') return route.fulfill({ json: { ok: true, premium: { active: false }, plans: [] } });
    return route.fulfill({ json: { ok: true } });
  });
}

const openMessages = async (page) => {
  await page.locator('.nav button[data-view="messages"]').click();
  await expect(page.locator('#messages-view')).toHaveClass(/active/);
};
const lastTelegramLink = (page) => page.evaluate(() => window.__lastTelegramLink);

test('a matched user reaches the actual Telegram conversation from the Messages tab', async ({ page }) => {
  await stubApi(page, { matches: [MATCH_BO] });
  await page.goto('/?as=a');
  await openMessages(page);

  await expect(page.locator('#messages-view .match-card')).toHaveCount(1);
  // The bridge copy says where the conversation happens; the CTA is the primary action.
  await expect(page.locator('#conversation-note')).toHaveText(en.conversation_hint);
  const cta = page.locator('#messages-view .match-card [data-chat]');
  await expect(cta).toHaveText(en.start_conversation);

  await cta.click();
  expect(await lastTelegramLink(page)).toBe('https://t.me/bo_bezy_test');
  // The device-local marker flips the label so a return visit reads "Continue conversation".
  await expect(cta).toHaveText(en.continue_conversation);
});

test('a match without a @username hands off through the bot match message', async ({ page }) => {
  await stubApi(page, { matches: [MATCH_CY] });
  await page.goto('/?as=a');
  await openMessages(page);

  const cta = page.locator('#messages-view .match-card [data-chat]');
  await expect(cta).toHaveText(en.start_conversation);
  await cta.click();
  // The webview cannot fire tg:// links reliably, so the CTA opens the bot with a start
  // payload; the bot re-sends the match notification with the client-resolved button.
  expect(await lastTelegramLink(page)).toBe('https://t.me/BezyDatingBot?start=match_match-cy');
});

test('a match without a @username explains the profile-first handoff', async ({ page }) => {
  await stubApi(page, { matches: [MATCH_CY] });
  await page.goto('/?as=a');
  await openMessages(page);
  await expect(page.locator('#messages-view .mf-handoff-hint')).toHaveText(en.chat_no_username_hint);
});

test('a match with a @username shows no handoff caveat', async ({ page }) => {
  await stubApi(page, { matches: [MATCH_BO] });
  await page.goto('/?as=a');
  await openMessages(page);
  await expect(page.locator('#messages-view .mf-handoff-hint')).toHaveCount(0);
});

test('Ways to start shows the why-you-matched chips and at least one usable opener', async ({ page }) => {
  await stubApi(page, { matches: [MATCH_BO] });
  await page.goto('/?as=a');
  await openMessages(page);

  await page.locator('#messages-view .match-card [data-starters]').click();
  const sheet = page.locator('.sheet');
  await expect(sheet.locator('.why-label')).toHaveText(en.why_matched);
  await expect(sheet.locator('.starter-head')).toHaveText(en.start_with);
  await expect(sheet.locator('.starter')).not.toHaveCount(0);
  await expect(sheet.locator('.starter p').first()).toContainText('music');
  await expect(sheet).toContainText(en.starters_hint);
  // The copy action is part of the promised flow.
  await expect(sheet.locator('[data-starter="0"]')).toHaveText(en.starter_copy);
});

test('a match with nothing in common still gets a usable generic opener', async ({ page }) => {
  await stubApi(page, { matches: [MATCH_CY] });
  await page.goto('/?as=a');
  await openMessages(page);

  await page.locator('#messages-view .match-card [data-starters]').click();
  const sheet = page.locator('.sheet');
  await expect(sheet.locator('.starter')).not.toHaveCount(0);
  await expect(sheet.locator('.starter p').first()).toHaveText(en.starter_generic);
  await expect(sheet).toContainText(en.why_none);
});

test('safety actions stay available from the Messages tab', async ({ page }) => {
  await stubApi(page, { matches: [MATCH_BO] });
  await page.goto('/?as=a');
  await openMessages(page);

  await page.locator('#messages-view .match-card [data-actions]').click();
  const sheet = page.locator('.sheet');
  await expect(sheet).toContainText(en.block);
  await expect(sheet).toContainText(en.report);
});

test('an unmatched user gets no conversation CTA', async ({ page }) => {
  await stubApi(page, { matches: [] });
  await page.goto('/?as=a');
  await openMessages(page);

  await expect(page.locator('#messages-view [data-chat]')).toHaveCount(0);
  await expect(page.locator('#message-empty')).toBeVisible();
  await expect(page.locator('#message-empty')).toHaveText(en.no_conversations);
});

test('the conversation CTA is not Premium-gated: matching is the gate, messaging follows it', async ({ page }) => {
  // The current design: Premium gates likes and swipe quota, never the conversation CTA
  // itself. This pins that an inactive-Premium matched user keeps the CTA, so the fix does
  // not accidentally change entitlement behaviour in either direction.
  await stubApi(page, { matches: [MATCH_BO] });
  await page.goto('/?as=a');
  await openMessages(page);
  await expect(page.locator('#messages-view .match-card [data-chat]')).toHaveCount(1);
});
