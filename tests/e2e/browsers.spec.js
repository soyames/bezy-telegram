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
  await expect(page.locator('main img[src="/assets/bezy-logo-without-tagline.png"]')).toHaveCount(1);
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

test('the story share action opens Telegram story editor with the official event', async ({ page }) => {
  // The only Mini-App-supported Telegram Stories surface is web_app_share_to_story: the
  // client opens its native story editor with the Bezy media, a localized caption and the
  // canonical bot widget link. The button exists only on supporting clients.
  // Firestore-free: the API is stubbed so the suite runs on every engine without
  // credentials — a real account API would gate an unseeded user at the 18+ declaration,
  // which is correct product behavior and not what this spec pins.
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/profile/me') {
      return route.fulfill({ json: { profile: { displayName: 'Ada', age: 29, city: 'Paris', gender: 'woman', seeking: 'men', interests: [], bio: '', prompts: [], languages: [], discoverable: true, profileComplete: true }, notifications: null, processingRestricted: false, processingObjection: false, needsAgeConfirmation: false } });
    }
    if (url.pathname === '/api/premium') return route.fulfill({ json: { ok: true, premium: { active: false }, plans: [] } });
    if (url.pathname === '/api/matches') return route.fulfill({ json: { ok: true, matches: [] } });
    if (url.pathname === '/api/discover') return route.fulfill({ json: { ok: true, profiles: [], stats: null, preferences: null } });
    if (url.pathname === '/api/likes') return route.fulfill({ json: { ok: true, likes: [], likeCount: 0 } });
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto('/?as=a');
  await page.locator('.nav button[data-view="profile"]').click();
  await page.locator('#tab-settings').click();
  const button = page.locator('#share-story-btn');
  await expect(button).toBeVisible();
  await expect(button).toHaveText('Share Bezy to your story');
  await button.click();
  const story = await page.evaluate(() => window.__lastStory);
  expect(story).toBeTruthy();
  expect(story.mediaUrl).toContain('/assets/bezy-icon.png');
  expect(story.params.text).toContain('Bezy');
  expect(story.params.widget_link.url).toBe('https://t.me/BezyDatingBot');
  expect(story.params.widget_link.name).toBe('Bezy');
});
