import { getRow, listRows, seedRow, deleteRow, resetTestData, sql } from '../fixtures.mjs';
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Verifies the entire Mini App is localized: every view, in all five languages, with no raw
// translation keys and no English leaking into the French, German, Spanish or Italian UI.
// Focused locale coverage: the full view matrix runs in French and German, and Spanish and
// Italian get a representative screen sweep (nav, profile, Premium, filters, errors) rather
// than a fifth copy of every screen. URLs, API paths and stored enum values are deliberately
// NOT translated.


const storage = null;
const ADA = '900000001';
const root = path.resolve('.');
const en = JSON.parse(fs.readFileSync(path.join(root, 'locales/en.json'), 'utf8')).app;
const fr = JSON.parse(fs.readFileSync(path.join(root, 'locales/fr.json'), 'utf8')).app;
const de = JSON.parse(fs.readFileSync(path.join(root, 'locales/de.json'), 'utf8')).app;
const es = JSON.parse(fs.readFileSync(path.join(root, 'locales/es.json'), 'utf8')).app;
const it = JSON.parse(fs.readFileSync(path.join(root, 'locales/it.json'), 'utf8')).app;

const PROFILES = {
  a: { displayName: 'Ada', age: 29, city: 'Paris', gender: 'woman', seeking: 'men', interests: ['music'], bio: 'Bonjour.', discoverable: true },
  b: { displayName: 'Bo', age: 31, city: 'Paris', gender: 'man', seeking: 'women', interests: ['music'], bio: 'Salut.', discoverable: true }
};
async function cleanup() { await resetTestData(); }
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
async function openGerman(page) {
  await page.addInitScript(() => window.localStorage.setItem('bezy-language', 'de'));
  await page.goto('/?as=a');
  await expect(page.locator('html')).toHaveAttribute('data-bezy-ready', 'true');
}
async function openLocale(page, lang) {
  await page.addInitScript((value) => window.localStorage.setItem('bezy-language', value), lang);
  await page.goto('/?as=a');
  await expect(page.locator('html')).toHaveAttribute('data-bezy-ready', 'true');
}

test.beforeEach(async ({ page }) => { await cleanup(); await seed(page); });
test.afterAll(async () => { await cleanup(); });

test('locale catalogues are complete and non-empty', () => {
  expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
  expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  expect(Object.keys(en).sort()).toEqual(Object.keys(it).sort());
  for (const catalogue of [fr, de, es, it]) {
    for (const [key, value] of Object.entries(catalogue)) {
      expect(value, `${key} must not be empty`).toBeTruthy();
    }
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
  await seedRow('users', [ADA], {
    usage: { day: new Date().toISOString().slice(0, 10), discoveryActions: 30, superLikes: 1 }
  }, { merge: true });

  await openFrench(page);
  await expect(page.locator('#profile-card')).toBeVisible();
  await page.locator('#likeBtn').click();
  // The API returns the code DISCOVERY_LIMIT_REACHED; the user must see French prose.
  await expect(page.locator('#toast')).toHaveText(fr.discovery_limit);
  await expect(page.locator('#toast')).not.toContainText('DISCOVERY_LIMIT_REACHED');
});

test('German UI shows no raw keys and no English across every view', async ({ page }) => {
  await openGerman(page);
  expect(await page.getAttribute('html', 'lang')).toBe('de');

  // English strings that would be unmistakable regressions if they surfaced in German.
  // ("Profile" and "Matches" are deliberately absent: both are also legitimate German
  // nouns — "Profile zu entdecken", "Deine Matches"; the nav labels are asserted exactly
  // below.)
  const englishLeaks = [
    'Discover', 'Save profile', 'Display name', 'Looking for',
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
  await expect(page.locator('.nav')).toContainText('Entdecken');
  await expect(page.locator('.nav')).toContainText('Nachrichten');
  await expect(page.locator('.nav')).toContainText('Profil');

  // Accessible names follow the language too.
  await expect(page.locator('#settingsBtn')).toHaveAttribute('aria-label', de.settings);
  await expect(page.locator('.bottom')).toHaveAttribute('aria-label', de.navigation);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', de.meta_description);
});

test('German Premium screen and filter sheet are fully translated', async ({ page }) => {
  await openGerman(page);
  await page.locator('#premiumBtn').click();
  await expect(page.locator('.plan')).toHaveCount(3);
  const premium = await page.locator('#premium-view').innerText();
  expect(premium).not.toMatch(/\bapp\.[a-z_]+/);
  expect(premium).toContain('Plan wählen');
  expect(premium).toContain('Monatlich');
  expect(premium).toContain('Jährlich');
  expect(premium).toContain(de.best_value);
  // Stars is a Telegram product name and stays as-is; the sentence around it is German.
  expect(premium).toContain('Telegram Stars');

  await page.locator('#premium-back').click();
  await page.locator('#filterBtn').click();
  const sheet = await page.locator('#sheet-host').innerText();
  expect(sheet).not.toMatch(/\bapp\.[a-z_]+/);
  expect(sheet).toContain('Mindestalter');
  expect(sheet).toContain('Filter anwenden');
  await expect(page.locator('[data-sheet-close]')).toHaveAttribute('aria-label', de.close);
});

test('German error messages come from the catalogue, not the API', async ({ page }) => {
  await seedRow('users', [ADA], {
    usage: { day: new Date().toISOString().slice(0, 10), discoveryActions: 30, superLikes: 1 }
  }, { merge: true });

  await openGerman(page);
  await expect(page.locator('#profile-card')).toBeVisible();
  await page.locator('#likeBtn').click();
  // The API returns the code DISCOVERY_LIMIT_REACHED; the user must see German prose.
  await expect(page.locator('#toast')).toHaveText(de.discovery_limit);
  await expect(page.locator('#toast')).not.toContainText('DISCOVERY_LIMIT_REACHED');
});

// Focused Spanish coverage: the screens a Spanish user meets in the first minutes — the
// nav, the profile form with canonical option values, Premium and the filter sheet.
test('Spanish UI is translated across the representative screens', async ({ page }) => {
  await openLocale(page, 'es');
  expect(await page.getAttribute('html', 'lang')).toBe('es');

  await expect(page.locator('.nav')).toContainText('Descubrir');
  await expect(page.locator('.nav')).toContainText('Mensajes');
  await expect(page.locator('.nav')).toContainText('Perfil');
  await expect(page.locator('#settingsBtn')).toHaveAttribute('aria-label', es.settings);

  // Profile: labels Spanish, stored values canonical.
  await page.locator('.nav button[data-view="profile"]').click();
  const profileText = await page.locator('#profile-view').innerText();
  expect(profileText).not.toMatch(/\bapp\.[a-z_]+/);
  expect(profileText).toContain('Guardar perfil');
  await expect(page.locator('#gender option[value="woman"]')).toHaveText(es.woman);
  await expect(page.locator('#seeking option[value="everyone"]')).toHaveText(es.everyone);
  expect(await page.locator('#seeking option').evaluateAll((o) => o.map((x) => x.value)))
    .toEqual(['women', 'men', 'everyone']);

  // Premium screen (the hero CTA lives in the Discover view).
  await page.locator('.nav button[data-view="discover"]').click();
  await page.locator('#premiumBtn').click();
  const premium = await page.locator('#premium-view').innerText();
  expect(premium).not.toMatch(/\bapp\.[a-z_]+/);
  expect(premium).toContain('Elige tu plan');
  expect(premium).toContain('Mensual');
  expect(premium).toContain(es.best_value);

  // Filter sheet.
  await page.locator('#premium-back').click();
  await page.locator('#filterBtn').click();
  const sheet = await page.locator('#sheet-host').innerText();
  expect(sheet).not.toMatch(/\bapp\.[a-z_]+/);
  expect(sheet).toContain('Edad mínima');
  expect(sheet).toContain('Aplicar filtros');
  await expect(page.locator('[data-sheet-close]')).toHaveAttribute('aria-label', es.close);
});

// Focused Italian coverage: nav, profile, Premium and the catalogue-driven error mapping.
test('Italian UI is translated and errors come from the catalogue', async ({ page }) => {
  await seedRow('users', [ADA], {
    usage: { day: new Date().toISOString().slice(0, 10), discoveryActions: 30, superLikes: 1 }
  }, { merge: true });

  await openLocale(page, 'it');
  expect(await page.getAttribute('html', 'lang')).toBe('it');

  await expect(page.locator('.nav')).toContainText('Scopri');
  await expect(page.locator('.nav')).toContainText('Messaggi');
  await expect(page.locator('.nav')).toContainText('Profilo');
  await expect(page.locator('#settingsBtn')).toHaveAttribute('aria-label', it.settings);

  // Profile: labels Italian, stored values canonical.
  await page.locator('.nav button[data-view="profile"]').click();
  const profileText = await page.locator('#profile-view').innerText();
  expect(profileText).not.toMatch(/\bapp\.[a-z_]+/);
  expect(profileText).toContain('Salva profilo');
  await expect(page.locator('#gender option[value="man"]')).toHaveText(it.man);
  await expect(page.locator('#seeking option[value="everyone"]')).toHaveText(it.everyone);

  // Premium screen (the hero CTA lives in the Discover view).
  await page.locator('.nav button[data-view="discover"]').click();
  await page.locator('#premiumBtn').click();
  const premium = await page.locator('#premium-view').innerText();
  expect(premium).not.toMatch(/\bapp\.[a-z_]+/);
  expect(premium).toContain('Scegli il tuo piano');
  expect(premium).toContain('Mensile');
  expect(premium).toContain(it.best_value);

  // Error mapping: the API code must render as Italian prose.
  await page.locator('#premium-back').click();
  await expect(page.locator('#profile-card')).toBeVisible();
  await page.locator('#likeBtn').click();
  await expect(page.locator('#toast')).toHaveText(it.discovery_limit);
  await expect(page.locator('#toast')).not.toContainText('DISCOVERY_LIMIT_REACHED');
});

test('language switch updates the whole UI, the brand tagline and legal links', async ({ page }) => {
  await page.goto('/?as=a');
  await expect(page.locator('html')).toHaveAttribute('data-bezy-ready', 'true');
  await page.locator('.nav button[data-view="profile"]').click();
  await page.locator('#tab-settings').click();
  // The brand tagline follows the resolved locale like every other surface.
  await expect(page.locator('#tagline')).toHaveText(en.tagline);

  await page.locator('[data-language="fr"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('#save-profile')).toHaveText(fr.save_profile);
  await expect(page.locator('#tagline')).toHaveText(fr.tagline);
  // Locale is carried to the legal pages, but the URL path itself is never translated.
  await expect(page.locator('#privacy-link')).toHaveAttribute('href', '/privacy?lang=fr');

  await page.locator('[data-language="de"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.locator('#save-profile')).toHaveText(de.save_profile);
  await expect(page.locator('#tagline')).toHaveText(de.tagline);
  await expect(page.locator('#privacy-link')).toHaveAttribute('href', '/privacy?lang=de');

  await page.locator('[data-language="es"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('#save-profile')).toHaveText(es.save_profile);
  await expect(page.locator('#tagline')).toHaveText(es.tagline);
  await expect(page.locator('#privacy-link')).toHaveAttribute('href', '/privacy?lang=es');

  await page.locator('[data-language="it"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  await expect(page.locator('#save-profile')).toHaveText(it.save_profile);
  await expect(page.locator('#tagline')).toHaveText(it.tagline);
  await expect(page.locator('#privacy-link')).toHaveAttribute('href', '/privacy?lang=it');

  await page.locator('[data-language="en"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#save-profile')).toHaveText(en.save_profile);
  await expect(page.locator('#tagline')).toHaveText(en.tagline);
  await expect(page.locator('#privacy-link')).toHaveAttribute('href', '/privacy?lang=en');
});

test('a manual language choice overrides Telegram and persists across reloads', async ({ page }) => {
  // User "b" has Telegram language_code fr; the manual choice must beat it.
  await page.goto('/?as=b');
  await expect(page.locator('html')).toHaveAttribute('data-bezy-ready', 'true');
  expect(await page.getAttribute('html', 'lang')).toBe('fr');

  await page.locator('.nav button[data-view="profile"]').click();
  await page.locator('#tab-settings').click();
  await page.locator('[data-language="de"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.locator('#tagline')).toHaveText(de.tagline);

  // The explicit choice is cached: a fresh load still resolves German, not the
  // Telegram language, and nothing switches back after the account call.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-bezy-ready', 'true');
  expect(await page.getAttribute('html', 'lang')).toBe('de');
  await expect(page.locator('#tagline')).toHaveText(de.tagline);
});

test('the brand logo is the single lockup asset, never a per-language logo', async ({ page }) => {
  await page.goto('/?as=a');
  await expect(page.locator('html')).toHaveAttribute('data-bezy-ready', 'true');
  await expect(page.locator('img.brand-logo')).toHaveAttribute('src', '/assets/bezy-logo-without-tagline.png');
  const count = await page.locator('img[src*="bezy-logo"]').count();
  expect(count).toBe(1);
  for (const suffix of ['en', 'fr', 'de', 'es', 'it']) {
    await expect(page.locator(`img[src*="bezy-logo-${suffix}"]`)).toHaveCount(0);
  }
});

test('profile form option values stay canonical while labels translate', async ({ page }) => {
  await openFrench(page);
  await page.locator('.nav button[data-view="profile"]').click();
  // Labels are French...
  await expect(page.locator('#gender option[value="woman"]')).toHaveText(fr.woman);
  await expect(page.locator('#seeking option[value="everyone"]')).toHaveText(fr.everyone);
  // ...but the stored values remain the canonical English enums the API expects. The empty
  // first option is the "Choose…" placeholder, not a value that can be stored.
  expect(await page.locator('#gender option').evaluateAll((o) => o.map((x) => x.value)))
    .toEqual(['', 'woman', 'man', 'non_binary', 'prefer_not_to_say']);
  expect(await page.locator('#seeking option').evaluateAll((o) => o.map((x) => x.value)))
    .toEqual(['women', 'men', 'everyone']);
});

test('profile form option values stay canonical while German labels translate', async ({ page }) => {
  await openGerman(page);
  await page.locator('.nav button[data-view="profile"]').click();
  // Labels are German...
  await expect(page.locator('#gender option[value="woman"]')).toHaveText(de.woman);
  await expect(page.locator('#seeking option[value="everyone"]')).toHaveText(de.everyone);
  // ...but the stored values remain the canonical English enums the API expects. The empty
  // first option is the "Choose…" placeholder, not a value that can be stored.
  expect(await page.locator('#gender option').evaluateAll((o) => o.map((x) => x.value)))
    .toEqual(['', 'woman', 'man', 'non_binary', 'prefer_not_to_say']);
  expect(await page.locator('#seeking option').evaluateAll((o) => o.map((x) => x.value)))
    .toEqual(['women', 'men', 'everyone']);
});

test('legal pages fall back to English for de/es/it, not broken translated content', async ({ page }) => {
  // The formal legal documents deliberately have no German, Spanish or Italian version yet
  // (legal-review dependency): a user in any of those languages follows the Mini App link
  // and gets the existing English fallback, never raw keys or half-translated legal text.
  for (const lang of ['de', 'es', 'it']) {
    for (const route of ['/privacy', '/terms']) {
      await page.goto(`${route}?lang=${lang}`);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.locator('#content h1')).toBeVisible();
      expect(await page.title()).toContain('Bezy');
      expect(await page.locator('main').innerText()).not.toMatch(/\bapp\.[a-z_]+/);
    }
  }
});

test('legal pages are fully French, including chrome', async ({ page }) => {
  for (const [route, heading, other] of [['/privacy', /confidentialit[ée]/i, /conditions/i], ['/terms', /conditions/i, /confidentialit[ée]/i]]) {
    await page.goto(`${route}?lang=fr`);
    await expect(page.locator('#content h1')).toHaveText(heading);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.locator('#tagline')).toContainText('belle rencontre');
    await expect(page.locator('#other-link')).toHaveText(other);
    await expect(page.locator('#other-link')).toHaveAttribute('href', /\?lang=fr$/);
    expect(await page.title()).toContain('Bezy');
    const body = await page.locator('main').innerText();
    expect(body).not.toContain('Meet someone worth knowing');
    // The brand lockup asset is used rather than a placeholder letter or a per-language logo.
    await expect(page.locator('.brand-logo')).toHaveAttribute('src', '/assets/bezy-logo-without-tagline.png');
  }
});

test('the outside-Telegram gate shows the brand logo, tagline and links to the bot', async ({ page }) => {
  // ?plain=1 makes the harness serve the page without the Telegram script, which is exactly
  // what a web visitor gets at bezy-telegram.vercel.app.
  await page.goto('/?plain=1');
  await expect(page.locator('main')).toContainText('Open Bezy from Telegram to continue.');
  await expect(page.locator('main')).toContainText('Meet someone worth knowing.');
  const link = page.locator('main a[href="https://t.me/BezyDatingBot"]');
  await expect(link).toHaveCount(1);
  await expect(link).toContainText('Open Bezy in Telegram');
  await expect(page.locator('main img[src="/assets/bezy-logo-without-tagline.png"]')).toHaveCount(1);
});
