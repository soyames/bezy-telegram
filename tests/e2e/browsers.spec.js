import { test, expect } from '@playwright/test';

// The Firestore-free surface, run on every engine (chromium, webkit, firefox): the
// outside-Telegram gate and the legal pages. Everything else in the e2e suite is
// Firestore-backed and Chromium-only by quota discipline (roadmap SC-2).

test('the outside-Telegram gate renders on every engine', async ({ page }) => {
  // ?plain=1 makes the harness serve the page without the Telegram script, which is exactly
  // what a web visitor gets at bezy-telegram.vercel.app.
  await page.goto('/?plain=1');
  await expect(page.locator('main')).toContainText('Open Bezy from Telegram to continue.');
  const link = page.locator('main a[href="https://t.me/BezyDatingBot"]');
  await expect(link).toHaveCount(1);
  await expect(page.locator('main img[src="/assets/bezy-icon.png"]')).toHaveCount(1);
});

test('the privacy page renders in both languages on every engine', async ({ page }) => {
  await page.goto('/privacy?lang=en');
  await expect(page.locator('#content h1')).toContainText('Privacy Policy');
  await expect(page.locator('#content')).toContainText('contacts@digitalconcordia.com');
  await page.goto('/privacy?lang=fr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('#content h1')).toContainText('Politique de confidentialité');
  await expect(page.locator('#content')).toContainText('contacts@digitalconcordia.com');
});

test('the terms page renders in both languages on every engine', async ({ page }) => {
  await page.goto('/terms?lang=en');
  await expect(page.locator('#content h1')).toContainText('Terms');
  await page.goto('/terms?lang=fr');
  await expect(page.locator('#content h1')).toContainText('Conditions');
});

test('the gender select never pre-selects a value on every engine', async ({ page }) => {
  // Regression for the live discovery failure: "I am" used to default to prefer_not_to_say,
  // which made new accounts invisible to everyone seeking a specific gender. The profile
  // form must start on the placeholder and require an explicit choice.
  await page.goto('/?as=a');
  const gender = page.locator('#gender');
  await expect(gender).toHaveValue('');
  await expect(gender.locator('option:checked')).toHaveText('Choose…');
  await expect(gender).toHaveJSProperty('required', true);
});
