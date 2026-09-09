import { test, expect } from '@playwright/test';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';

// Bezy-specific safety and privacy controls in the real Mini App: block, report, unmatch,
// data export and account deletion. Telegram's own safety stack is out of scope by design.

if (!getApps().length) {
  if (process.env.BEZY_SERVICE_ACCOUNT) {
    const sa = JSON.parse(fs.readFileSync(process.env.BEZY_SERVICE_ACCOUNT, 'utf8'));
    initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
  } else {
    initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n') }) });
  }
}
const db = getFirestore();
const ADA = '900000001';
const BO = '900000002';
const isTest = (v) => /^9000000\d\d$/.test(String(v));

const PROFILES = {
  a: { displayName: 'Ada', age: 29, city: 'Paris', gender: 'woman', seeking: 'men', interests: ['music'], bio: 'E2E.', discoverable: true },
  b: { displayName: 'Bo', age: 31, city: 'Paris', gender: 'man', seeking: 'women', interests: ['music'], bio: 'E2E.', discoverable: true }
};

async function cleanup() {
  for (const doc of (await db.collection('users').get()).docs) {
    if (isTest(doc.id)) await db.recursiveDelete(doc.ref);
  }
  for (const col of ['matches', 'bezyPayments', 'bezyInvoices', 'reports']) {
    for (const doc of (await db.collection(col).get()).docs) {
      const d = doc.data();
      if ((d.participants || []).some(isTest) || isTest(d.telegramUserId) || isTest(d.reporterId) || isTest(d.targetId)) await doc.ref.delete();
    }
  }
}

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
  await expect(page.locator('.match-info b')).toContainText('Bo');

  await page.locator('[data-actions]').click();
  await page.locator('[data-act="block"]').click();
  await page.locator('[data-act="confirm"]').click();
  await expect(page.locator('#toast')).toContainText('Blocked');
  await expect(page.locator('.match-card')).toHaveCount(0);

  // Server-enforced, not just hidden: Bo can no longer reach Ada either.
  const bosMatches = await (await page.request.post('/api/matches', { data: { initData: users.b.initData } })).json();
  expect(bosMatches.matches).toHaveLength(0);
  const swipe = await page.request.post('/api/swipe', { data: { initData: users.b.initData, targetId: ADA, action: 'like' } });
  expect(swipe.status()).toBe(404);
  expect((await db.collection('users').doc(ADA).collection('blocks').doc(BO).get()).exists).toBe(true);
});

test('reporting a match stores the report and blocks the person', async ({ page }) => {
  await seedMatched(page);
  await openApp(page);
  await page.locator('.nav button[data-view="matches"]').click();
  await page.locator('[data-actions]').click();
  await page.locator('[data-act="report"]').click();

  await page.locator('#report-reason').selectOption('harassment');
  await page.locator('#report-details').fill('Automated end-to-end test report.');
  await page.locator('#report-send').click();
  await expect(page.locator('#toast')).toContainText('Report sent');

  const reports = await db.collection('reports').where('reporterId', '==', ADA).get();
  expect(reports.size).toBe(1);
  const report = reports.docs[0].data();
  expect(report.targetId).toBe(BO);
  expect(report.reason).toBe('harassment');
  expect(report.status).toBe('open');
  // Reporting blocks too, so the reporter stops seeing the person.
  expect((await db.collection('users').doc(ADA).collection('blocks').doc(BO).get()).exists).toBe(true);
});

test('unmatch ends the match for both sides', async ({ page }) => {
  const users = await seedMatched(page);
  await openApp(page);
  await page.locator('.nav button[data-view="matches"]').click();
  await page.locator('[data-actions]').click();
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
  await page.locator('#blocked-list-btn').click();
  await expect(page.locator('#sheet-host')).toContainText('Bo');

  await page.locator('[data-unblock]').click();
  await expect(page.locator('#toast')).toContainText('unblocked');
  expect((await db.collection('users').doc(ADA).collection('blocks').doc(BO).get()).exists).toBe(false);
});

test('a user can download their own data', async ({ page }) => {
  await seedMatched(page);
  await openApp(page);
  await page.locator('.nav button[data-view="profile"]').click();

  const download = page.waitForEvent('download');
  await page.locator('#export-data-btn').click();
  const file = await download;
  expect(file.suggestedFilename()).toContain('bezy-my-data');

  const exported = JSON.parse(fs.readFileSync(await file.path(), 'utf8'));
  expect(exported.account.telegramId).toBe(Number(ADA));
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
  await page.locator('#delete-account-btn').click();

  // The consequences, including what is retained, are stated before confirming.
  await expect(page.locator('#sheet-host')).toContainText('cannot be undone');
  await expect(page.locator('#sheet-host')).toContainText('accounting');

  // Nothing happens without the typed word.
  await page.locator('#delete-go').click();
  await expect(page.locator('#toast')).toContainText('DELETE');
  expect((await db.collection('users').doc(ADA).get()).exists).toBe(true);

  await page.locator('#delete-confirm').fill('DELETE');
  await page.locator('#delete-go').click();

  await expect(page.locator('body')).toContainText('deleted');
  await expect.poll(async () => (await db.collection('users').doc(ADA).get()).exists).toBe(false);

  // The counterpart no longer has a live match to a deleted account.
  const bosMatches = await (await page.request.post('/api/matches', { data: { initData: users.b.initData } })).json();
  expect(bosMatches.matches).toHaveLength(0);
});

test('safety and privacy controls are localized in French', async ({ page }) => {
  await seedMatched(page);
  await page.addInitScript(() => window.localStorage.setItem('bezy-language', 'fr'));
  await openApp(page);

  await page.locator('.nav button[data-view="profile"]').click();
  const profile = await page.locator('#profile-view').innerText();
  expect(profile).not.toMatch(/\bapp\.[a-z_]+/);
  expect(profile).toContain('Sécurité et confidentialité');
  expect(profile).toContain('Télécharger mes données');
  expect(profile).toContain('Supprimer mon compte');

  await page.locator('.nav button[data-view="matches"]').click();
  await page.locator('[data-actions]').click();
  const sheet = await page.locator('#sheet-host').innerText();
  expect(sheet).not.toMatch(/\bapp\.[a-z_]+/);
  expect(sheet).toContain('Bloquer');
  expect(sheet).toContain('Signaler');
});
