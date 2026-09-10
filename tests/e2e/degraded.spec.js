import { test, expect } from '@playwright/test';

// Degraded-dependency states, driven deterministically through route interception — no
// Firestore, no network flakiness. The contract: any dependency failure degrades to a
// usable app with a typed message, never to a dead static page (app.js boot()).

const JSON_500 = (payload) => ({
  status: 500,
  contentType: 'application/json',
  body: JSON.stringify(payload)
});

test('the Mini App stays usable when the whole API is down', async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill(JSON_500({ error: 'DATABASE_UNAVAILABLE' })));
  await page.goto('/?as=a');
  await expect(page.locator('html')).toHaveAttribute('data-bezy-ready', 'true');

  // The failure is named, not generic, and comes from the locale catalogue.
  await expect(page.locator('#toast')).toContainText('could not reach its database');
  // The app degrades to a navigable shell rather than a dead page.
  await page.locator('.nav button[data-view="matches"]').click();
  await expect(page.locator('#matches-view')).toHaveClass(/active/);
  await page.locator('.nav button[data-view="profile"]').click();
  await expect(page.locator('#profile-view')).toHaveClass(/active/);
});

test('a locale outage falls back to the built-in English catalogue', async ({ page }) => {
  await page.route('**/locales/**', (route) => route.fulfill({ status: 500, body: 'unavailable' }));
  await page.route('**/api/**', (route) => route.fulfill(JSON_500({ error: 'DATABASE_UNAVAILABLE' })));
  await page.goto('/?as=a');
  await expect(page.locator('html')).toHaveAttribute('data-bezy-ready', 'true');

  // The fallback catalogue renders: no raw keys, no blank chrome, English labels.
  await expect(page.locator('.nav button[data-view="discover"]')).toContainText('Discover');
  await expect(page.locator('.nav button[data-view="matches"]')).toContainText('Matches');
  expect(await page.locator('body').innerText()).not.toMatch(/\bapp\.[a-z_]+\b/);
});

test('rate limiting names the wait instead of a generic failure', async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill({
    status: 429,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'RATE_LIMITED', retryAfter: 300 })
  }));
  await page.goto('/?as=a');
  await expect(page.locator('html')).toHaveAttribute('data-bezy-ready', 'true');
  // errorText() special-cases RATE_LIMITED: the user is told how long to wait.
  await expect(page.locator('#toast')).toContainText('about 5 minutes');
});
