import { test, expect } from '@playwright/test';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';
import path from 'node:path';

// Age & trust, driven through the real Mini App against the real API handlers.
//
// The contract under test: Bezy's only truthful age claim today is the 18+ self-declaration.
// The UI says exactly that — never "verified", never a bare trust score — and no client
// request, forged or not, can mark a user as age-verified (ADR 0010: Telegram age
// verification is not available to Bezy, so no verification surface exists).

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
const ar = JSON.parse(fs.readFileSync(path.join(root, 'locales/ar.json'), 'utf8')).app;

const ADA = '900000001';
const isTest = (v) => /^9000000\d\d$/.test(String(v));

const PROFILE = { displayName: 'Ada', age: 29, city: 'Paris', gender: 'woman', seeking: 'men', interests: ['music'], languages: [], bio: 'E2E.', prompts: [], discoverable: true };

async function cleanup() {
  for (const doc of (await db.collection('users').get()).docs) {
    if (isTest(doc.id)) await db.recursiveDelete(doc.ref);
  }
  for (const doc of (await db.collection('rateLimits').get()).docs) {
    if (isTest(doc.id)) await doc.ref.delete();
  }
}

async function seedDeclared(page) {
  const users = await (await page.request.get('/__test-users')).json();
  await page.request.post('/api/profile/me', { data: { initData: users.a.initData, ageEligibilityConfirmed: true } });
  await page.request.post('/api/profile/me', { data: { initData: users.a.initData, profile: PROFILE } });
  return users;
}

async function openApp(page, who = 'a') {
  await page.goto(`/?as=${who}`);
  await expect(page.locator('html')).toHaveAttribute('data-bezy-ready', 'true');
}

async function openSettings(page) {
  await page.locator('.nav button[data-view="profile"]').click();
  await page.locator('#tab-settings').click();
}

test.beforeEach(async () => { await cleanup(); });
test.afterAll(async () => { await cleanup(); });

test('a declared user is shown as 18+ self-declared — never verified', async ({ page }) => {
  const users = await seedDeclared(page);
  await openApp(page, 'a');
  await openSettings(page);

  const pill = page.locator('#age-status');
  await expect(pill).toHaveText(en.age_self_declared);
  await expect(page.locator('#age-status-note')).toHaveText(en.age_note);
  // The note names exactly what was NOT verified: identity and age.
  await expect(page.locator('.trust-status')).not.toContainText('Verified');

  // The server's machine state is the self-declaration — the only truthful value.
  const r = await (await page.request.post('/api/profile/me', { data: { initData: users.a.initData } })).json();
  expect(r.ageStatus).toBe('selfDeclared18Plus');
});

test('no client request, forged or not, can mark a user as Telegram-age-verified', async ({ page }) => {
  const users = await seedDeclared(page);

  const forged = await (await page.request.post('/api/profile/me', {
    data: {
      initData: users.a.initData,
      profile: { ...PROFILE, ageStatus: 'telegramAgeVerified18Plus', ageVerified: true, telegramAgeVerified: true },
      ageStatus: 'telegramAgeVerified18Plus',
      ageVerified: true
    }
  })).json();
  expect(forged.ageStatus).toBe('selfDeclared18Plus');

  // Nothing verification-shaped is persisted — not on the profile, not on the document.
  const stored = (await db.collection('users').doc(ADA).get()).data();
  expect(stored.profile.ageStatus).toBeUndefined();
  expect(stored.profile.ageVerified).toBeUndefined();
  expect(stored.ageStatus).toBeUndefined();
  expect(stored.ageVerified).toBeUndefined();
  expect(stored.telegramAgeVerified).toBeUndefined();
  // The declaration itself is untouched: still recorded as a self-declaration.
  expect(stored.ageEligibilityConfirmed).toBe(true);
  expect(stored.ageEligibilityMethod).toBe('self_declaration');
});

test('an unverified account falls back to the self-declaration gate as before', async ({ page }) => {
  // No ageEligibilityConfirmed: the account must land on the gate, not the profile.
  const users = await (await page.request.get('/__test-users')).json();
  await page.request.post('/api/profile/me', { data: { initData: users.a.initData, profile: PROFILE } });

  await openApp(page, 'a');
  await expect(page.locator('#age-view')).toBeVisible();
  await expect(page.locator('#age-view')).toContainText(en.age_gate_body);
  await page.locator('#age-confirm').click();
  // Declaring hands the user to their (still incomplete) profile, not to a dead gate.
  await expect(page.locator('#profile-view')).toBeVisible();

  // After declaring, the same precise status appears in settings.
  await openSettings(page);
  await expect(page.locator('#age-status')).toHaveText(en.age_self_declared);
});

test('the trust status is localized, including Arabic RTL', async ({ page }) => {
  await seedDeclared(page);
  await page.addInitScript(() => localStorage.setItem('bezy-language', 'ar'));
  await openApp(page, 'a');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await openSettings(page);
  await expect(page.locator('#age-status')).toHaveText(ar.age_self_declared);
  await expect(page.locator('#age-status-title')).toHaveText(ar.age_status_title);
  await expect(page.locator('#age-status-note')).toHaveText(ar.age_note);
});
