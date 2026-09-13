import { getRow, listRows, seedRow, deleteRow, resetTestData, sql } from '../fixtures.mjs';
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// User-generated profile-content translation, driven through the real Mini App against the
// real API handlers. The harness points BEZY_TRANSLATE_ENDPOINT at its own deterministic
// provider (/__translate), whose payload is `[<target>] <text>` — so the target locale is
// observable in the rendered card without depending on translate.googleapis.com.
//
// The product contract under test: a translated card never hides the author's words —
// the original is one tap away and labelled, and a same-language viewer sees no
// translation chrome at all.


const storage = null;
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), '../..');
const en = JSON.parse(fs.readFileSync(path.join(root, 'locales/en.json'), 'utf8')).app;
const ar = JSON.parse(fs.readFileSync(path.join(root, 'locales/ar.json'), 'utf8')).app;

const ADA = '900000001';
const BO = '900000002';
const isTest = (v) => /^9000000\d\d$/.test(String(v));
const FR_BIO = 'Je ne perds mon temps pour une cause sans vision';
const FR_PROMPT = 'Je ne perds pas mon temps pour une cause sans vision';

async function cleanup() { await resetTestData(); }

// Ada writes her profile in French too: for the French viewer the card is same-language and
// must show the original with no translation chrome.
async function seedProfiles(page) {
  const users = await (await page.request.get('/__test-users')).json();
  await page.request.post('/api/profile/me', { data: { initData: users.a.initData, ageEligibilityConfirmed: true } });
  await page.request.post('/api/profile/me', { data: { initData: users.b.initData, ageEligibilityConfirmed: true } });
  await page.request.post('/api/profile/me', {
    data: { initData: users.a.initData, profile: { displayName: 'Ada', age: 29, city: 'Paris', gender: 'woman', seeking: 'men', interests: ['music'], languages: [], bio: FR_BIO, prompts: [], discoverable: true } }
  });
  await page.request.post('/api/profile/me', {
    data: { initData: users.b.initData, profile: { displayName: 'Bo', age: 31, city: 'Paris', gender: 'man', seeking: 'women', interests: ['music'], languages: [], bio: FR_BIO, prompts: [{ id: 'should_know', answer: FR_PROMPT }], discoverable: true } }
  });
  return users;
}

async function seedMatched(page) {
  const users = await seedProfiles(page);
  await page.request.post('/api/swipe', { data: { initData: users.a.initData, targetId: BO, action: 'like' } });
  await page.request.post('/api/swipe', { data: { initData: users.b.initData, targetId: ADA, action: 'like' } });
}

async function openApp(page, who = 'a') {
  await page.goto(`/?as=${who}`);
  await expect(page.locator('html')).toHaveAttribute('data-bezy-ready', 'true');
}

test.beforeEach(async () => { await cleanup(); });
test.afterAll(async () => { await cleanup(); });

test('an English viewer sees a French profile translated, with the original one tap away', async ({ page }) => {
  await seedProfiles(page);
  await openApp(page, 'a');
  const card = page.locator('.profile-card');
  await expect(card).toBeVisible();

  // The bio is translated for the viewer and clearly labelled as a translation.
  const meta = card.locator('.profile-copy .tr-target');
  await expect(meta).toContainText(`[en] ${FR_BIO}`);
  await expect(card.locator('.profile-copy .tr-note')).toHaveText(en.translated_from.replace('{lang}', en.language_fr));
  await expect(card.locator('.profile-copy .tr-toggle')).toHaveText(en.show_original);

  // "Show original" reveals the author's exact words, relabels the note, and stays reversible.
  await card.locator('.profile-copy .tr-toggle').click();
  await expect(meta).toContainText(FR_BIO);
  await expect(card.locator('.profile-copy .tr-note')).toHaveText(en.original_label.replace('{lang}', en.language_fr));
  await expect(card.locator('.profile-copy .tr-toggle')).toHaveText(en.show_translation);
  await card.locator('.profile-copy .tr-toggle').click();
  await expect(meta).toContainText(`[en] ${FR_BIO}`);

  // The prompt answer follows the same treatment.
  const prompt = card.locator('.card-prompt');
  await expect(prompt.locator('.tr-target')).toContainText(`[en] ${FR_PROMPT}`);
  await prompt.locator('.tr-toggle').click();
  await expect(prompt.locator('.tr-target')).toHaveText(FR_PROMPT);

  // The original text the author saved is untouched in the database.
  const bo = (await getRow('users', BO)).profile;
  expect(bo.bio).toBe(FR_BIO);
  expect(bo.prompts[0].answer).toBe(FR_PROMPT);
});

test('a French viewer sees a French profile as written — no translation chrome', async ({ page }) => {
  await seedProfiles(page);
  await openApp(page, 'b');
  const card = page.locator('.profile-card');
  await expect(card).toBeVisible();
  await expect(card.locator('.profile-copy .tr-target')).toContainText(FR_BIO);
  await expect(card.locator('.tr-row')).toHaveCount(0);
  await expect(card.locator('.tr-toggle')).toHaveCount(0);
});

test('an Arabic viewer gets translated content inside the existing RTL layout', async ({ page }) => {
  await seedProfiles(page);
  await page.addInitScript(() => localStorage.setItem('bezy-language', 'ar'));
  await openApp(page, 'a');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const card = page.locator('.profile-card');
  await expect(card).toBeVisible();
  await expect(card.locator('.profile-copy .tr-target')).toContainText(`[ar] ${FR_BIO}`);
  await expect(card.locator('.profile-copy .tr-note')).toHaveText(ar.translated_from.replace('{lang}', ar.language_fr));
  await expect(card.locator('.profile-copy .tr-toggle')).toHaveText(ar.show_original);
});

test('switching the Bezy language refetches the deck for the new locale', async ({ page }) => {
  await seedProfiles(page);
  await openApp(page, 'a');
  await expect(page.locator('.profile-copy .tr-target')).toContainText(`[en] ${FR_BIO}`);

  await page.locator('.nav button[data-view="profile"]').click();
  await page.locator('#tab-settings').click();
  await page.locator('.language-list button[data-language="de"]').click();
  await page.locator('.nav button[data-view="discover"]').click();
  await expect(page.locator('.profile-copy .tr-target')).toContainText(`[de] ${FR_BIO}`);
});

test('a match card shows the translated icebreaker with the original preserved', async ({ page }) => {
  await seedMatched(page);
  await openApp(page, 'a');
  await page.locator('.nav button[data-view="matches"]').click();
  const card = page.locator('.match-card').first();
  await expect(card).toBeVisible();
  await expect(card.locator('.mf-icebreaker .tr-target')).toContainText(`[en] ${FR_PROMPT}`);
  await card.locator('.mf-icebreaker .tr-toggle').click();
  await expect(card.locator('.mf-icebreaker .tr-target')).toHaveText(FR_PROMPT);
  await expect(card.locator('.mf-icebreaker .tr-note')).toHaveText(en.original_label.replace('{lang}', en.language_fr));
});
