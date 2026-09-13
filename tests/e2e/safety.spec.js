import { getRow, listRows, seedRow, deleteRow, resetTestData, sql } from '../fixtures.mjs';
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// Bezy-specific safety and privacy controls in the real Mini App: block, report, unmatch,
// data export and account deletion. Telegram's own safety stack is out of scope by design.


const storage = null;
const ADA = '900000001';
const BO = '900000002';
const isTest = (v) => /^9000000\d\d$/.test(String(v));

const PROFILES = {
  a: { displayName: 'Ada', age: 29, city: 'Paris', gender: 'woman', seeking: 'men', interests: ['music'], bio: 'E2E.', discoverable: true },
  b: { displayName: 'Bo', age: 31, city: 'Paris', gender: 'man', seeking: 'women', interests: ['music'], bio: 'E2E.', discoverable: true }
};

async function cleanup() { await resetTestData(); }

async function seedMatched(page) {
  const users = await (await page.request.get('/__test-users')).json();
  for (const key of ['a', 'b']) {
    await page.request.post('/api/profile/me', { data: { initData: users[key].initData, ageEligibilityConfirmed: true } });
    await page.request.post('/api/profile/me', { data: { initData: users[key].initData, profile: PROFILES[key] } });
  }
  await page.request.post('/api/swipe', { data: { initData: users.a.initData, targetId: BO, action: 'like' } });
  await page.request.post('/api/swipe', { data: { initData: users.b.initData, targetId: ADA, action: 'like' } });
  return users;
}

async function openApp(page) {
  await page.goto('/?as=a');
  await expect(page.locator('html')).toHaveAttribute('data-bezy-ready', 'true');
}

test.beforeEach(async () => { await cleanup(); });
test.afterAll(async () => { await cleanup(); });

test('a match can be blocked from the Mini App and disappears for both users', async ({ page }) => {
  const users = await seedMatched(page);
  await openApp(page);
  await page.locator('.nav button[data-view="matches"]').click();
  await expect(page.locator('#match-grid .match-info b')).toContainText('Bo');

  await page.locator('#match-grid [data-actions]').click();
  await page.locator('[data-act="block"]').click();
  await page.locator('[data-act="confirm"]').click();
  await expect(page.locator('#toast')).toContainText('Blocked');
  await expect(page.locator('.match-card')).toHaveCount(0);

  // Server-enforced, not just hidden: Bo can no longer reach Ada either.
  const bosMatches = await (await page.request.post('/api/matches', { data: { initData: users.b.initData } })).json();
  expect(bosMatches.matches).toHaveLength(0);
  const swipe = await page.request.post('/api/swipe', { data: { initData: users.b.initData, targetId: ADA, action: 'like' } });
  expect(swipe.status()).toBe(404);
  expect(Boolean(await getRow('blocks', ADA, BO))).toBe(true);
});

test('reporting a match stores the report and blocks the person', async ({ page }) => {
  await seedMatched(page);
  await openApp(page);
  await page.locator('.nav button[data-view="matches"]').click();
  await page.locator('#match-grid [data-actions]').click();
  await page.locator('[data-act="report"]').click();

  await page.locator('#report-reason').selectOption('harassment');
  await page.locator('#report-details').fill('Automated end-to-end test report.');
  await page.locator('#report-send').click();
  await expect(page.locator('#toast')).toContainText('Report sent');

  const reports = await listRows('reports', [], ['reporterId', '==', ADA]);
  expect(reports.length).toBe(1);
  const report = reports[0];
  expect(report.targetId).toBe(BO);
  expect(report.reason).toBe('harassment');
  expect(report.status).toBe('open');
  // Reporting blocks too, so the reporter stops seeing the person.
  expect(Boolean(await getRow('blocks', ADA, BO))).toBe(true);
});

test('unmatch ends the match for both sides', async ({ page }) => {
  const users = await seedMatched(page);
  await openApp(page);
  await page.locator('.nav button[data-view="matches"]').click();
  await page.locator('#match-grid [data-actions]').click();
  await page.locator('[data-act="unmatch"]').click();
  await page.locator('[data-act="confirm"]').click();
  await expect(page.locator('#toast')).toContainText('Unmatched');
  await expect(page.locator('.match-card')).toHaveCount(0);

  const bosMatches = await (await page.request.post('/api/matches', { data: { initData: users.b.initData } })).json();
  expect(bosMatches.matches).toHaveLength(0);
});

test('blocked people can be listed and unblocked', async ({ page }) => {
  const users = await seedMatched(page);
  await page.request.post('/api/relationship', { data: { initData: users.a.initData, action: 'block', targetId: BO } });

  await openApp(page);
  await page.locator('.nav button[data-view="profile"]').click();
  await page.locator('#tab-settings').click();
  await page.locator('#blocked-list-btn').click();
  await expect(page.locator('#sheet-host')).toContainText('Bo');

  await page.locator('[data-unblock]').click();
  await expect(page.locator('#toast')).toContainText('unblocked');
  expect(Boolean(await getRow('blocks', ADA, BO))).toBe(false);
});

test('a user can download their own data', async ({ page }) => {
  await seedMatched(page);
  await openApp(page);
  await page.locator('.nav button[data-view="profile"]').click();
  await page.locator('#tab-settings').click();

  const download = page.waitForEvent('download');
  await page.locator('#export-data-btn').click();
  const file = await download;
  expect(file.suggestedFilename()).toContain('bezy-my-data');

  const exported = JSON.parse(fs.readFileSync(await file.path(), 'utf8'));
  // Telegram numeric ids cross the JS boundary as strings end to end (BIGINT precision).
  expect(exported.account.telegramId).toBe(String(ADA));
  expect(exported.profile.displayName).toBe('Ada');
  expect(exported.ageEligibility.method).toBe('self_declaration');
  expect(exported.matches).toHaveLength(1);
  // Other people's identities are never disclosed in an export.
  expect(typeof exported.likesReceivedCount).toBe('number');
  expect(exported.reportsAboutYou).toBeUndefined();
});

test('account deletion requires typed confirmation and removes the account', async ({ page }) => {
  const users = await seedMatched(page);
  await openApp(page);
  await page.locator('.nav button[data-view="profile"]').click();
  await page.locator('#tab-settings').click();
  await page.locator('#delete-account-btn').click();

  // The consequences, including what is retained, are stated before confirming.
  await expect(page.locator('#sheet-host')).toContainText('cannot be undone');
  await expect(page.locator('#sheet-host')).toContainText('accounting');

  // Nothing happens without the typed word.
  await page.locator('#delete-go').click();
  await expect(page.locator('#toast')).toContainText('DELETE');
  expect(Boolean(await getRow('users', ADA))).toBe(true);

  await page.locator('#delete-confirm').fill('DELETE');
  await page.locator('#delete-go').click();

  await expect(page.locator('body')).toContainText('deleted');
  await expect.poll(async () => Boolean(await getRow('users', ADA))).toBe(false);

  // The counterpart no longer has a live match to a deleted account.
  const bosMatches = await (await page.request.post('/api/matches', { data: { initData: users.b.initData } })).json();
  expect(bosMatches.matches).toHaveLength(0);
});

test('the support card leads with the bot and files requests from the history sheet', async ({ page }) => {
  await seedMatched(page);
  await openApp(page);
  await page.locator('.nav button[data-view="profile"]').click();
  await page.locator('#tab-settings').click();
  // The primary support entry point is the canonical bot, not an email form.
  await expect(page.locator('#support-bot-btn')).toHaveAttribute('href', 'https://t.me/BezyDatingBot');
  await expect(page.locator('#support-bot-btn')).toHaveText('Get help');
  // Intake lives behind the history: one secondary CTA, no competing primary buttons.
  await page.locator('#support-history-btn').click();
  await page.locator('#support-new-btn').click();
  await page.locator('#support-category').selectOption('premium');
  await page.locator('#support-details').fill('E2E support test.');
  await page.locator('#support-submit').click();
  await expect(page.locator('#toast')).toContainText('BZ-');
  await page.locator('#support-history-btn').click();
  await expect(page.locator('#sheet-host')).toContainText('BZ-');
});

test('safety and privacy controls are localized in French', async ({ page }) => {
  await seedMatched(page);
  await page.addInitScript(() => window.localStorage.setItem('bezy-language', 'fr'));
  await openApp(page);

  await page.locator('.nav button[data-view="profile"]').click();
  const profile = await page.locator('#profile-view').innerText();
  expect(profile).not.toMatch(/\bapp\.[a-z_]+/);
  expect(profile).toContain('Paramètres et confidentialité');
  // The settings side of the profile sits behind the Settings & Privacy tab. The headings
  // are styled uppercase, so the assertions match the rendered text case-insensitively.
  await page.locator('#tab-settings').click();
  await expect(page.locator('#profile-view')).toContainText(/sécurité/i);
  await expect(page.locator('#profile-view')).toContainText('Confidentialité et vos données');
  await expect(page.locator('#profile-view')).toContainText('pas votre GPS');
  await expect(page.locator('#profile-view')).toContainText('Télécharger mes données');
  await expect(page.locator('#profile-view')).toContainText('Supprimer mon compte');
  await expect(page.locator('#profile-view')).toContainText('Aide juridique');
  await expect(page.locator('#profile-view')).toContainText(/aide et assistance/i);
  await expect(page.locator('#profile-view')).toContainText('3 jours ouvrés');
  // The support entry point is a machine token: it always links the canonical address.
  await expect(page.locator('#support-email-btn')).toHaveAttribute('href', 'mailto:contacts@digitalconcordia.com');
  // The two legal states sit behind one human-readable entry point.
  await page.locator('#data-controls-btn').click();
  await expect(page.locator('#sheet-host')).toContainText('Contrôles des données');
  await expect(page.locator('#controls-restrict')).toHaveText('Suspendre le traitement');
  await page.locator('.sheet-close').click();

  await page.locator('.nav button[data-view="matches"]').click();
  await page.locator('#match-grid [data-actions]').click();
  const sheet = await page.locator('#sheet-host').innerText();
  expect(sheet).not.toMatch(/\bapp\.[a-z_]+/);
  expect(sheet).toContain('Bloquer');
  expect(sheet).toContain('Signaler');
});
