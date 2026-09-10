import { test, expect } from '@playwright/test';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';
import path from 'node:path';

// Verifies the entire Mini App is localized: every view, in both languages, with no raw
// translation keys and no English leaking into the French UI.
// URLs, API paths and stored enum values are deliberately NOT translated.

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
const root = path.resolve('.');
const en = JSON.parse(fs.readFileSync(path.join(root, 'locales/en.json'), 'utf8')).app;
const fr = JSON.parse(fs.readFileSync(path.join(root, 'locales/fr.json'), 'utf8')).app;

const PROFILES = {
  a: { displayName: 'Ada', age: 29, city: 'Paris', gender: 'woman', seeking: 'men', interests: ['music'], bio: 'Bonjour.', discoverable: true },
  b: { displayName: 'Bo', age: 31, city: 'Paris', gender: 'man', seeking: 'women', interests: ['music'], bio: 'Salut.', discoverable: true }
};
async function cleanup() {
  for (const doc of (await db.collection('users').get()).docs) {
    if (/^9000000\d\d$/.test(doc.id)) await db.recursiveDelete(doc.ref);
  }
  for (const doc of (await db.collection('rateLimits').get()).docs) {
    if (/^9000000\d\d$/.test(doc.id)) await doc.ref.delete();
  }
  for (const col of ['matches', 'bezyPayments', 'bezyInvoices', 'reports']) {
    for (const doc of (await db.collection(col).get()).docs) {
      const d = doc.data();
      if ((d.participants || []).some((p) => /^9000000\d\d$/.test(p)) || /^9000000\d\d$/.test(String(d.telegramUserId)) || /^9000000\d\d$/.test(String(d.reporterId)) || /^9000000\d\d$/.test(String(d.targetId))) await doc.ref.delete();
    }
  }
}
async function seed(page) {
  const users = await (await page.request.get('/__test-users')).json();
  for (const key of ['a', 'b']) {
    await page.request.post('/api/profile/me', { data: { initData: users[key].initData, ageEligibilityConfirmed: true } });
    await page.request.post('/api/profile/me', { data: { initData: users[key].initData, profile: PROFILES[key] } });
  }
  return users;
}
async function openFrench(page) {
  await page.addInitScript(() => window.localStorage.setItem('bezy-language', 'fr'));
  await page.goto('/?as=a');
  await expect(page.locator('html')).toHaveAttribute('data-bezy-ready', 'true');
}

test.beforeEach(async ({ page }) => { await cleanup(); await seed(page); });
test.afterAll(async () => { await cleanup(); });

test('locale catalogues are complete and non-empty', () => {
  expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  for (const [key, value] of Object.entries(fr)) {
    expect(value, `fr.${key} must not be empty`).toBeTruthy();
  }
});

test('French UI shows no raw keys and no English across every view', async ({ page }) => {
  await openFrench(page);
  expect(await page.getAttribute('html', 'lang')).toBe('fr');

  // English strings that would be unmistakable regressions if they surfaced in French.
  const englishLeaks = [
    'Discover', 'Matches', 'Profile', 'Save profile', 'Display name', 'Looking for',
    'Filters', 'Apply filters', 'Choose your plan', 'Subscribe with Telegram Stars',
    'See who liked you', 'Active until', 'Days remaining', 'Loading', 'people to discover'
  ];

  for (const view of ['discover', 'matches', 'messages', 'profile']) {
    await page.locator(`.nav button[data-view="${view}"]`).click();
    await expect(page.locator(`#${view}-view`)).toHaveClass(/active/);
    const text = await page.locator(`#${view}-view`).innerText();
    expect(text, `${view} must not contain raw translation keys`).not.toMatch(/\bapp\.[a-z_]+/);
    for (const word of englishLeaks) {
      expect(text, `${view} leaked English: "${word}"`).not.toContain(word);
    }
  }

  // Bottom navigation labels.
  await expect(page.locator('.nav')).toContainText('Découvrir');
  await expect(page.locator('.nav')).toContainText('Matchs');
  await expect(page.locator('.nav')).toContainText('Profil');

  // Accessible names follow the language too.
  await expect(page.locator('#settingsBtn')).toHaveAttribute('aria-label', fr.settings);
  await expect(page.locator('.bottom')).toHaveAttribute('aria-label', fr.navigation);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', fr.meta_description);
});

test('French Premium screen and filter sheet are fully translated', async ({ page }) => {
  await openFrench(page);
  await page.locator('#premiumBtn').click();
  await expect(page.locator('.plan')).toHaveCount(3);
  const premium = await page.locator('#premium-view').innerText();
  expect(premium).not.toMatch(/\bapp\.[a-z_]+/);
  expect(premium).toContain('Choisissez votre formule');
  expect(premium).toContain('Mensuel');
  expect(premium).toContain('Annuel');
  expect(premium).toContain(fr.best_value);
  // Stars is a Telegram product name and stays as-is; the sentence around it is French.
  expect(premium).toContain('Telegram Stars');

  await page.locator('#premium-back').click();
  await page.locator('#filterBtn').click();
  const sheet = await page.locator('#sheet-host').innerText();
  expect(sheet).not.toMatch(/\bapp\.[a-z_]+/);
  expect(sheet).toContain('Âge minimum');
  expect(sheet).toContain('Appliquer les filtres');
  await expect(page.locator('[data-sheet-close]')).toHaveAttribute('aria-label', fr.close);
});

test('French error messages come from the catalogue, not the API', async ({ page }) => {
  await db.collection('users').doc(ADA).set({
    usage: { day: new Date().toISOString().slice(0, 10), discoveryActions: 30, superLikes: 1 }
  }, { merge: true });

  await openFrench(page);
  await expect(page.locator('#profile-card')).toBeVisible();
  await page.locator('#likeBtn').click();
  // The API returns the code DISCOVERY_LIMIT_REACHED; the user must see French prose.
  await expect(page.locator('#toast')).toHaveText(fr.discovery_limit);
  await expect(page.locator('#toast')).not.toContainText('DISCOVERY_LIMIT_REACHED');
});

test('language switch updates the whole UI and legal links', async ({ page }) => {
  await page.goto('/?as=a');
  await expect(page.locator('html')).toHaveAttribute('data-bezy-ready', 'true');
  await page.locator('.nav button[data-view="profile"]').click();

  await page.locator('[data-language="fr"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('#save-profile')).toHaveText(fr.save_profile);
  // Locale is carried to the legal pages, but the URL path itself is never translated.
  await expect(page.locator('#privacy-link')).toHaveAttribute('href', '/privacy?lang=fr');

  await page.locator('[data-language="en"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#save-profile')).toHaveText(en.save_profile);
  await expect(page.locator('#privacy-link')).toHaveAttribute('href', '/privacy?lang=en');
});

test('profile form option values stay canonical while labels translate', async ({ page }) => {
  await openFrench(page);
  await page.locator('.nav button[data-view="profile"]').click();
  // Labels are French...
  await expect(page.locator('#gender option[value="woman"]')).toHaveText(fr.woman);
  await expect(page.locator('#seeking option[value="everyone"]')).toHaveText(fr.everyone);
  // ...but the stored values remain the canonical English enums the API expects.
  expect(await page.locator('#gender option').evaluateAll((o) => o.map((x) => x.value)))
    .toEqual(['woman', 'man', 'non_binary', 'prefer_not_to_say']);
  expect(await page.locator('#seeking option').evaluateAll((o) => o.map((x) => x.value)))
    .toEqual(['women', 'men', 'everyone']);
});

test('legal pages are fully French, including chrome', async ({ page }) => {
  for (const [route, heading, other] of [['/privacy', /confidentialit[ée]/i, /conditions/i], ['/terms', /conditions/i, /confidentialit[ée]/i]]) {
    await page.goto(`${route}?lang=fr`);
    await expect(page.locator('#content h1')).toHaveText(heading);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.locator('#tagline')).toContainText('Rencontrez');
    await expect(page.locator('#other-link')).toHaveText(other);
    await expect(page.locator('#other-link')).toHaveAttribute('href', /\?lang=fr$/);
    expect(await page.title()).toContain('Bezy');
    const body = await page.locator('main').innerText();
    expect(body).not.toContain('Meet someone worth knowing');
    // The Bezy mark is used rather than the placeholder letter.
    await expect(page.locator('.logo img')).toHaveAttribute('src', '/assets/bezy-icon.png');
  }
});

test('the outside-Telegram gate shows the logo and links to the bot', async ({ page }) => {
  // No ?as= param: the harness serves the page without the Telegram stub, which is exactly
  // what a web visitor gets at bezy-telegram.vercel.app.
  await page.goto('/');
  await expect(page.locator('main')).toContainText('Open Bezy from Telegram to continue.');
  const link = page.locator('main a[href="https://t.me/BezyDatingBot"]');
  await expect(link).toHaveCount(1);
  await expect(link).toContainText('Open Bezy in Telegram');
  await expect(page.locator('main img[src="/assets/bezy-icon.png"]')).toHaveCount(1);
});
