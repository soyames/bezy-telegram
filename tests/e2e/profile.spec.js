import { test, expect } from '@playwright/test';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';
import path from 'node:path';

// Profile prompts, the "how others see you" preview, why-you-matched and the openers derived
// from it — driven through the real Mini App against the real API handlers.

if (!getApps().length) {
  if (process.env.BEZY_SERVICE_ACCOUNT) {
    const sa = JSON.parse(fs.readFileSync(process.env.BEZY_SERVICE_ACCOUNT, 'utf8'));
    initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
  } else {
    initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n') }) });
  }
}
const db = getFirestore();
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), '../..');
const en = JSON.parse(fs.readFileSync(path.join(root, 'locales/en.json'), 'utf8')).app;
const fr = JSON.parse(fs.readFileSync(path.join(root, 'locales/fr.json'), 'utf8')).app;

const ADA = '900000001';
const BO = '900000002';
const isTest = (v) => /^9000000\d\d$/.test(String(v));
const SUNDAY = 'A long walk and a longer lunch.';

// Ada and Bo share two interests and a city, and are two years apart — every signal type.
const PROFILES = {
  a: { displayName: 'Ada', age: 29, city: 'Paris', gender: 'woman', seeking: 'men', interests: ['music', 'travel'], bio: 'E2E.', discoverable: true },
  b: { displayName: 'Bo', age: 31, city: 'Paris', gender: 'man', seeking: 'women', interests: ['music', 'travel'], bio: 'E2E.', discoverable: true }
};

async function cleanup() {
  for (const doc of (await db.collection('users').get()).docs) {
    if (isTest(doc.id)) await db.recursiveDelete(doc.ref);
  }
  for (const doc of (await db.collection('rateLimits').get()).docs) {
    if (isTest(doc.id)) await doc.ref.delete();
  }
  for (const doc of (await db.collection('matches').get()).docs) {
    if ((doc.data().participants || []).some(isTest)) await doc.ref.delete();
  }
}

async function seedProfiles(page, { prompts = [], languages = [] } = {}) {
  const users = await (await page.request.get('/__test-users')).json();
  for (const key of ['a', 'b']) {
    await page.request.post('/api/profile/me', { data: { initData: users[key].initData, ageEligibilityConfirmed: true } });
    await page.request.post('/api/profile/me', {
      data: {
        initData: users[key].initData,
        profile: { ...PROFILES[key], prompts: key === 'a' ? prompts : [], languages: key === 'a' ? languages : [] }
      }
    });
  }
  return users;
}

async function seedMatched(page, options) {
  const users = await seedProfiles(page, options);
  await page.request.post('/api/swipe', { data: { initData: users.a.initData, targetId: BO, action: 'like' } });
  await page.request.post('/api/swipe', { data: { initData: users.b.initData, targetId: ADA, action: 'like' } });
  return users;
}

async function openApp(page, who = 'a') {
  await page.goto(`/?as=${who}`);
  await expect(page.locator('html')).toHaveAttribute('data-bezy-ready', 'true');
}

test.beforeEach(async () => { await cleanup(); });
test.afterAll(async () => { await cleanup(); });

// ------------------------------------------------------------------ prompts

test('a prompt answered on the profile form reaches the other person\'s deck', async ({ page }) => {
  const users = await seedProfiles(page);
  await openApp(page);
  await page.locator('.nav button[data-view="profile"]').click();

  const row = page.locator('#prompts-list .prompt-row').first();
  await expect(row.locator('select')).toHaveValue('');
  await row.locator('select').selectOption('perfect_sunday');
  await row.locator('input').fill(SUNDAY);
  await page.locator('#save-profile').click();
  await expect(page.locator('#toast')).toContainText(en.profile_saved);

  const deck = await (await page.request.post('/api/discover', { data: { initData: users.b.initData } })).json();
  const ada = deck.profiles.find((profile) => profile.id === ADA);
  expect(ada.prompts).toEqual([{ id: 'perfect_sunday', answer: SUNDAY }]);
});

test('an answered prompt is rendered on the discovery card under its question', async ({ page }) => {
  await seedProfiles(page, { prompts: [{ id: 'perfect_sunday', answer: SUNDAY }] });
  // Bo is the French-speaking test user, which is the point: only the id is stored, so the
  // same answer Ada wrote in English is presented under the French question.
  await openApp(page, 'b');
  await expect(page.locator('.card-prompt')).toHaveCount(1);
  await expect(page.locator('.card-prompt b')).toHaveText(fr.prompt_perfect_sunday);
  await expect(page.locator('.card-prompt p')).toHaveText(SUNDAY);
});

test('an unanswered profile shows no prompt block at all', async ({ page }) => {
  await seedProfiles(page);
  await openApp(page, 'b');
  await expect(page.locator('.profile-card')).toBeVisible();
  await expect(page.locator('.card-prompts')).toHaveCount(0);
});

test('a saved prompt is restored into the editor, and clearing the answer removes it', async ({ page }) => {
  const users = await seedProfiles(page, { prompts: [{ id: 'perfect_sunday', answer: SUNDAY }] });
  await openApp(page);
  await page.locator('.nav button[data-view="profile"]').click();

  const row = page.locator('#prompts-list .prompt-row').first();
  await expect(row.locator('select')).toHaveValue('perfect_sunday');
  await expect(row.locator('input')).toHaveValue(SUNDAY);

  await row.locator('input').fill('');
  await page.locator('#save-profile').click();
  await expect(page.locator('#toast')).toContainText(en.profile_saved);
  const saved = await (await page.request.post('/api/profile/me', { data: { initData: users.a.initData } })).json();
  expect(saved.profile.profile.prompts).toEqual([]);
});

// ------------------------------------------------------------------ preview

test('the preview shows the real discovery card and never the Telegram handle', async ({ page }) => {
  await seedProfiles(page, { prompts: [{ id: 'perfect_sunday', answer: SUNDAY }] });
  await openApp(page);
  await page.locator('.nav button[data-view="profile"]').click();
  await page.locator('#preview-profile-btn').click();

  const sheet = page.locator('.sheet');
  await expect(sheet.locator('.profile-card')).toBeVisible();
  await expect(sheet.locator('.profile-copy h2')).toContainText('Ada');
  await expect(sheet.locator('.card-prompt p')).toHaveText(SUNDAY);
  // A deck card carries no swipe controls for your own profile, and no handle anywhere.
  await expect(sheet.locator('.actions')).toHaveCount(0);
  expect(await sheet.textContent()).not.toContain('@');
});

test('the preview reflects unsaved edits, so it previews what you are about to publish', async ({ page }) => {
  await seedProfiles(page);
  await openApp(page);
  await page.locator('.nav button[data-view="profile"]').click();
  await page.locator('#city').fill('Marseille');
  await page.locator('#prompts-list .prompt-row').first().locator('select')
    .selectOption('first_date');
  await page.locator('#prompts-list .prompt-row').first().locator('input').fill('Coffee, then a walk.');
  await page.locator('#preview-profile-btn').click();

  const sheet = page.locator('.sheet');
  await expect(sheet.locator('.profile-copy p')).toContainText('Marseille');
  await expect(sheet.locator('.card-prompt b')).toHaveText(en.prompt_first_date);
});

test('an incomplete profile is told to finish rather than shown an empty card', async ({ page }) => {
  const users = await (await page.request.get('/__test-users')).json();
  await page.request.post('/api/profile/me', { data: { initData: users.a.initData, ageEligibilityConfirmed: true } });
  await openApp(page);
  await page.locator('.nav button[data-view="profile"]').click();
  await page.locator('#preview-profile-btn').click();
  await expect(page.locator('.sheet')).toContainText(en.preview_incomplete);
  await expect(page.locator('.sheet .profile-card')).toHaveCount(0);
});

// ------------------------------------------------------- why you matched / starters

test('a match explains itself with the signals both people actually share', async ({ page }) => {
  await seedMatched(page);
  await openApp(page);
  await page.locator('.nav button[data-view="matches"]').click();

  await expect(page.locator('.match-info b')).toContainText('Bo');
  await expect(page.locator('.why-label')).toHaveText(en.why_matched);
  const chips = await page.locator('.why-chip').allTextContents();
  expect(chips.join(' | ')).toContain('music');
  expect(chips.join(' | ')).toContain('Paris');
  expect(chips).toContain(en.why_age);
  // Gender and seeking are never an explanation.
  expect(chips.join(' ').toLowerCase()).not.toContain('woman');
  expect(chips.join(' ').toLowerCase()).not.toContain('man');
});

test('openers are offered from the shared signals and can be copied', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await seedMatched(page);
  await openApp(page);
  await page.locator('.nav button[data-view="matches"]').click();
  await page.locator('.match-card [data-starters]').click();

  const sheet = page.locator('.sheet');
  await expect(sheet.locator('.sheet-head h3')).toHaveText(en.starters_title);
  await expect(sheet.locator('.starter')).not.toHaveCount(0);
  const first = await sheet.locator('.starter p').first().textContent();
  expect(first).toContain('music');
  await expect(sheet).toContainText(en.starters_hint);

  await sheet.locator('[data-starter="0"]').click();
  await expect(page.locator('#toast')).toContainText(en.starter_copied);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(first);
});

test('openers are reachable from the Messages view too', async ({ page }) => {
  await seedMatched(page);
  await openApp(page);
  await page.locator('.nav button[data-view="messages"]').click();
  await page.locator('.conversation [data-starters]').click();
  await expect(page.locator('.sheet .starter')).not.toHaveCount(0);
});

test('nothing is explained or suggested before a mutual match', async ({ page }) => {
  await seedProfiles(page);
  await openApp(page);
  await expect(page.locator('.profile-card')).toBeVisible();
  await expect(page.locator('.why-matched')).toHaveCount(0);
  await expect(page.locator('[data-starters]')).toHaveCount(0);
});

// ------------------------------------------------------------ notification settings

test('notification categories default to on and can be switched off', async ({ page }) => {
  const users = await seedProfiles(page);
  await openApp(page);
  await page.locator('.nav button[data-view="profile"]').click();
  await page.locator('#tab-settings').click();

  const toggles = page.locator('#notification-list [data-notify]');
  await expect(toggles).toHaveCount(2);
  await expect(page.locator('[data-notify="matches"]')).toBeChecked();
  await expect(page.locator('[data-notify="super_likes"]')).toBeChecked();
  // Transactional messages are not the user's to switch off, so no toggle offers to.
  await expect(page.locator('[data-notify="account"]')).toHaveCount(0);

  await page.locator('[data-notify="super_likes"]').uncheck();
  await expect(page.locator('#toast')).toContainText(en.notifications_saved);
  const saved = await (await page.request.post('/api/profile/me', { data: { initData: users.a.initData } })).json();
  expect(saved.notifications).toEqual({ matches: true, super_likes: false });

  await openApp(page);
  await page.locator('.nav button[data-view="profile"]').click();
  await page.locator('#tab-settings').click();
  await expect(page.locator('[data-notify="super_likes"]')).not.toBeChecked();
  await expect(page.locator('[data-notify="matches"]')).toBeChecked();
});

test('notification settings are localized in French', async ({ page }) => {
  await seedProfiles(page);
  await page.addInitScript(() => window.localStorage.setItem('bezy-language', 'fr'));
  await openApp(page);
  await page.locator('.nav button[data-view="profile"]').click();
  await page.locator('#tab-settings').click();
  await expect(page.locator('#notifications-hint')).toHaveText(fr.notifications_hint);
  await expect(page.locator('.notify-row').first().locator('b')).toHaveText(fr.notify_matches);
  await expect(page.locator('.notify-row').nth(1).locator('b')).toHaveText(fr.notify_super_likes);
  await expect(page.locator('.notify-row').nth(1).locator('small')).toHaveText(fr.notify_super_likes_note);
});

// ------------------------------------------------------------------ languages (P1-3)

test('languages are chosen as chips and reach the other person\'s deck', async ({ page }) => {
  const users = await seedProfiles(page);
  await openApp(page);
  await page.locator('.nav button[data-view="profile"]').click();

  const chips = page.locator('#languages-list [data-language-chip]');
  await expect(chips).toHaveCount(10);
  await expect(page.locator('#languages-list [data-language-chip="en"]')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#languages-list [data-language-chip="en"]').click();
  await page.locator('#languages-list [data-language-chip="fr"]').click();
  await expect(page.locator('#languages-list [data-language-chip="fr"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#save-profile').click();
  await expect(page.locator('#toast')).toContainText(en.profile_saved);

  const deck = await (await page.request.post('/api/discover', { data: { initData: users.b.initData } })).json();
  expect(deck.profiles.find((p) => p.id === ADA).languages).toEqual(['en', 'fr']);
});

test('a sixth language cannot be selected', async ({ page }) => {
  await seedProfiles(page);
  await openApp(page);
  await page.locator('.nav button[data-view="profile"]').click();
  for (const id of ['en', 'fr', 'es', 'pt', 'ar']) await page.locator(`#languages-list [data-language-chip="${id}"]`).click();
  await page.locator('#languages-list [data-language-chip="de"]').click();
  await expect(page.locator('#languages-list [data-language-chip="de"]')).toHaveAttribute('aria-pressed', 'false');
  // Deselecting one frees the slot again.
  await page.locator('#languages-list [data-language-chip="ar"]').click();
  await page.locator('#languages-list [data-language-chip="de"]').click();
  await expect(page.locator('#languages-list [data-language-chip="de"]')).toHaveAttribute('aria-pressed', 'true');
});

test('the deck card names the language in the reader\'s own words', async ({ page }) => {
  await seedProfiles(page, { languages: ['fr'] });
  // Bo reads French, so Ada's stored `fr` shows as "Français", not as the code.
  await openApp(page, 'b');
  await expect(page.locator('.profile-card .tags')).toContainText(fr.language_fr);
  await expect(page.locator('.profile-card .tags')).not.toContainText('"fr"');
});

test('the language filter narrows the deck and is available without Premium', async ({ page }) => {
  const users = await seedProfiles(page);
  await page.request.post('/api/profile/me', { data: { initData: users.b.initData, profile: { ...PROFILES.b, languages: ['ru'] } } });
  await openApp(page);
  await expect(page.locator('.profile-card')).toBeVisible();

  await page.locator('#filterBtn').click();
  await expect(page.locator('#filter-languages [data-language-chip]')).toHaveCount(10);
  await page.locator('#filter-languages [data-language-chip="en"]').click();
  await page.locator('#filter-apply').click();
  await expect(page.locator('#toast')).toContainText(en.filters_applied);

  const stored = await (await page.request.post('/api/profile/me', { data: { initData: users.a.initData } })).json();
  expect(stored.profile.preferences.languages).toEqual(['en']);
  const deck = await (await page.request.post('/api/discover', { data: { initData: users.a.initData } })).json();
  expect(deck.isPremium).toBe(false);
  expect(deck.profiles.some((p) => p.id === BO)).toBe(false);
});

test('language chips are localized in French', async ({ page }) => {
  await seedProfiles(page);
  await page.addInitScript(() => window.localStorage.setItem('bezy-language', 'fr'));
  await openApp(page);
  await page.locator('.nav button[data-view="profile"]').click();
  await expect(page.locator('#languages-label')).toHaveText(fr.languages_label);
  await expect(page.locator('#languages-hint')).toHaveText(fr.languages_hint);
  await expect(page.locator('#languages-list [data-language-chip="es"]')).toHaveText(fr.language_es);
  await page.locator('#filterBtn').click();
  await expect(page.locator('#filter-languages-label')).toHaveText(fr.filter_languages);
});

// --------------------------------------------------- restriction of processing (RT-2)

test('processing can be paused and resumed from the data controls sheet', async ({ page }) => {
  const users = await seedProfiles(page);
  await openApp(page);
  await page.locator('.nav button[data-view="profile"]').click();
  await expect(page.locator('#restriction-notice .restricted-notice')).toHaveCount(0);

  await page.locator('#data-controls-btn').click();
  await expect(page.locator('#controls-restrict')).toHaveText(en.restrict_action);
  await page.locator('#controls-restrict').click();
  await expect(page.locator('.sheet')).toContainText(en.restrict_explain);
  await page.locator('#restrict-go').click();
  await expect(page.locator('#toast')).toContainText(en.restrict_done);

  await expect(page.locator('#restriction-notice .restricted-notice')).toContainText(en.restricted_badge);
  await page.locator('#data-controls-btn').click();
  await expect(page.locator('#controls-restrict')).toHaveText(en.unrestrict_action);
  await page.locator('[data-sheet-close]').last().click();
  // Server-enforced, not merely hidden.
  const me = await (await page.request.post('/api/profile/me', { data: { initData: users.a.initData } })).json();
  expect(me.processingRestricted).toBe(true);
  expect(me.profile.discoverable).toBe(false);

  // The deck says why it is empty rather than implying Bezy ran out of people.
  await page.locator('.nav button[data-view="discover"]').click();
  await expect(page.locator('#discover-content')).toContainText(en.restricted_badge);

  await page.locator('.nav button[data-view="profile"]').click();
  await page.locator('#data-controls-btn').click();
  await page.locator('#controls-restrict').click();
  await expect(page.locator('#toast')).toContainText(en.unrestrict_done);
  await expect(page.locator('#restriction-notice .restricted-notice')).toHaveCount(0);
  const resumed = await (await page.request.post('/api/profile/me', { data: { initData: users.a.initData } })).json();
  expect(resumed.processingRestricted).toBe(false);
  // Resuming restores the account without silently returning it to the deck.
  expect(resumed.profile.discoverable).toBe(false);
});

test('a paused account keeps its data and its own controls', async ({ page }) => {
  const users = await seedProfiles(page, { prompts: [{ id: 'perfect_sunday', answer: SUNDAY }] });
  await page.request.post('/api/account', { data: { initData: users.a.initData, action: 'restrict' } });
  await openApp(page);
  await page.locator('.nav button[data-view="profile"]').click();

  // Nothing was deleted: the profile form still holds everything.
  await expect(page.locator('#display-name')).toHaveValue('Ada');
  await expect(page.locator('#prompts-list .prompt-row').first().locator('input')).toHaveValue(SUNDAY);
  // And the export right is unaffected — restriction must not lock anyone out of their data.
  const exported = await (await page.request.post('/api/account', { data: { initData: users.a.initData, action: 'export' } })).json();
  expect(exported.data.processingRestriction.restricted).toBe(true);
  expect(exported.data.profile.displayName).toBe('Ada');
});

test('restriction of processing is localized in French', async ({ page }) => {
  await seedProfiles(page);
  await page.addInitScript(() => window.localStorage.setItem('bezy-language', 'fr'));
  await openApp(page);
  await page.locator('.nav button[data-view="profile"]').click();
  await page.locator('#data-controls-btn').click();
  await expect(page.locator('#controls-restrict')).toHaveText(fr.restrict_action);
  await page.locator('#controls-restrict').click();
  await expect(page.locator('.sheet .sheet-head h3')).toHaveText(fr.restrict_title);
  await expect(page.locator('.sheet')).toContainText(fr.restrict_explain);
  await expect(page.locator('#restrict-go')).toHaveText(fr.restrict_confirm);
  await page.locator('#restrict-go').click();
  await expect(page.locator('#restriction-notice .restricted-notice')).toContainText(fr.restricted_badge);
  await page.locator('#data-controls-btn').click();
  await expect(page.locator('#controls-restrict')).toHaveText(fr.unrestrict_action);
});

// ------------------------------------------------------- objection to processing (RT-3)

test('processing can be objected to and the objection withdrawn from the data controls sheet', async ({ page }) => {
  const users = await seedProfiles(page);
  await openApp(page);
  await page.locator('.nav button[data-view="profile"]').click();
  await expect(page.locator('#objection-notice .restricted-notice')).toHaveCount(0);

  await page.locator('#data-controls-btn').click();
  await expect(page.locator('#controls-object')).toHaveText(en.object_action);
  await page.locator('#controls-object').click();
  await expect(page.locator('.sheet')).toContainText(en.objection_explain);
  await page.locator('#objection-go').click();
  await expect(page.locator('#toast')).toContainText(en.objection_done);

  await expect(page.locator('#objection-notice .restricted-notice')).toContainText(en.objection_badge);
  await page.locator('#data-controls-btn').click();
  await expect(page.locator('#controls-object')).toHaveText(en.unobject_action);
  await page.locator('[data-sheet-close]').last().click();
  // Server-enforced, not merely hidden — and distinct from restriction.
  const me = await (await page.request.post('/api/profile/me', { data: { initData: users.a.initData } })).json();
  expect(me.processingObjection).toBe(true);
  expect(me.processingRestricted).toBe(false);
  expect(me.profile.discoverable).toBe(false);
  // An objecting account is unreachable from outside through the identical error as every
  // other unreachable case, so the objection is not detectable.
  const swipe = await page.request.post('/api/swipe', { data: { initData: users.b.initData, targetId: ADA, action: 'like' } });
  expect(swipe.status()).toBe(404);

  // The deck says why it is empty rather than implying Bezy ran out of people.
  await page.locator('.nav button[data-view="discover"]').click();
  await expect(page.locator('#discover-content')).toContainText(en.objection_badge);

  // Withdrawing restores the account without silently returning it to the deck.
  await page.locator('.nav button[data-view="profile"]').click();
  await page.locator('#data-controls-btn').click();
  await page.locator('#controls-object').click();
  await expect(page.locator('#toast')).toContainText(en.unobject_done);
  await expect(page.locator('#objection-notice .restricted-notice')).toHaveCount(0);
  const resumed = await (await page.request.post('/api/profile/me', { data: { initData: users.a.initData } })).json();
  expect(resumed.processingObjection).toBe(false);
  expect(resumed.profile.discoverable).toBe(false);
});

test('objection to processing is localized in French', async ({ page }) => {
  await seedProfiles(page);
  await page.addInitScript(() => window.localStorage.setItem('bezy-language', 'fr'));
  await openApp(page);
  await page.locator('.nav button[data-view="profile"]').click();
  await page.locator('#data-controls-btn').click();
  await expect(page.locator('#controls-object')).toHaveText(fr.object_action);
  await page.locator('#controls-object').click();
  await expect(page.locator('.sheet .sheet-head h3')).toHaveText(fr.objection_title);
  await expect(page.locator('.sheet')).toContainText(fr.objection_explain);
  await expect(page.locator('#objection-go')).toHaveText(fr.objection_confirm);
  await page.locator('#objection-go').click();
  await expect(page.locator('#objection-notice .restricted-notice')).toContainText(fr.objection_badge);
  await page.locator('#data-controls-btn').click();
  await expect(page.locator('#controls-object')).toHaveText(fr.unobject_action);
});

// ------------------------------------------------------------------ French

test('prompts, preview, explanations and openers are all localized in French', async ({ page }) => {
  await seedMatched(page, { prompts: [{ id: 'perfect_sunday', answer: SUNDAY }] });
  await page.addInitScript(() => window.localStorage.setItem('bezy-language', 'fr'));
  await openApp(page);

  await page.locator('.nav button[data-view="profile"]').click();
  await expect(page.locator('#prompts-title')).toHaveText(fr.prompts_title);
  await expect(page.locator('#prompts-hint')).toHaveText(fr.prompts_hint);
  await expect(page.locator('#preview-profile-btn')).toHaveText(fr.preview_profile);
  const row = page.locator('#prompts-list .prompt-row').first();
  await expect(row.locator('input')).toHaveAttribute('placeholder', fr.prompt_placeholder);
  await expect(row.locator('select option').nth(1)).toHaveText(fr.prompt_perfect_sunday);
  // The stored answer is a machine-keyed id, so the French reader sees the French question.
  await expect(row.locator('select')).toHaveValue('perfect_sunday');

  await page.locator('#preview-profile-btn').click();
  await expect(page.locator('.sheet .sheet-head h3')).toHaveText(fr.preview_title);
  await expect(page.locator('.sheet .card-prompt b')).toHaveText(fr.prompt_perfect_sunday);
  await expect(page.locator('.sheet')).toContainText(fr.preview_hint);
  await page.locator('[data-sheet-close]').click();

  await page.locator('.nav button[data-view="matches"]').click();
  await expect(page.locator('.why-label')).toHaveText(fr.why_matched);
  await expect(page.locator('.match-card [data-starters]')).toHaveText(fr.starters_title);
  await page.locator('.match-card [data-starters]').click();
  await expect(page.locator('.sheet .starter button').first()).toHaveText(fr.starter_copy);
  await expect(page.locator('.sheet')).toContainText(fr.starters_hint);
});
