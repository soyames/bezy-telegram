import { test, expect } from '@playwright/test';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';

// The Mini App under test is the real index.html + app.js talking to the real API
// handlers. Only the native Telegram payment sheet is stubbed (tests/harness.mjs).

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

const PROFILES = {
  a: { displayName: 'Ada', age: 29, city: 'Paris', gender: 'woman', seeking: 'men', interests: ['music', 'travel', 'books'], bio: 'E2E run.', discoverable: true },
  b: { displayName: 'Bo', age: 31, city: 'Paris', gender: 'man', seeking: 'women', interests: ['music', 'travel'], bio: 'Bonjour.', discoverable: true },
  d: { displayName: 'Dee', age: 28, city: 'Paris', gender: 'man', seeking: 'everyone', interests: ['books'], bio: 'Hi.', discoverable: true }
};

async function seed(page, key) {
  const users = await (await page.request.get('/__test-users')).json();
  await page.request.post('/api/profile/me', { data: { initData: users[key].initData, ageEligibilityConfirmed: true } });
  await page.request.post('/api/profile/me', { data: { initData: users[key].initData, profile: PROFILES[key] } });
  return users;
}
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
const setPremium = (membership) => db.collection('users').doc(ADA).set({ bezyPremium: membership }, { merge: true });

// Waits for initialization to finish so tests never race the startup routing.
async function openApp(page, { as = 'a', lang } = {}) {
  if (lang) await page.addInitScript((l) => window.localStorage.setItem('bezy-language', l), lang);
  await page.goto(`/?as=${as}`);
  await expect(page.locator('html')).toHaveAttribute('data-bezy-ready', 'true');
}

// The Mini App formats dates with Intl in the active locale, so the expectation is
// derived the same way instead of hard-coding one locale's word order.
function expectedDate(iso, locale) {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
}

test.beforeEach(async ({ page }) => {
  await cleanup();
  await seed(page, 'a');
  await seed(page, 'b');
  await seed(page, 'd');
});
test.afterAll(async () => { await cleanup(); });

test('new user is gated behind an explicit 18+ declaration', async ({ page }) => {
  // Wipe the declaration so this account looks brand new.
  await db.recursiveDelete(db.collection('users').doc(ADA));

  await page.goto('/?as=a');
  await expect(page.locator('html')).toHaveAttribute('data-bezy-ready', 'true');

  await expect(page.locator('#age-view')).toHaveClass(/active/);
  await expect(page.locator('#age-title')).toHaveText('Bezy is only available to people aged 18 and over.');
  await expect(page.locator('#age-body')).toHaveText('By continuing, I confirm that I am 18 or older.');
  // No pre-selected consent anywhere, and no way past the gate without choosing.
  await expect(page.locator('#age-view input[type=checkbox]')).toHaveCount(0);
  await expect(page.locator('.bottom')).toBeHidden();
  await expect(page.locator('#discover-view')).not.toHaveClass(/active/);
  await expect(page.locator('#profile-view')).not.toHaveClass(/active/);
  // The app must not claim it verifies anything.
  await expect(page.locator('#age-note')).toContainText('does not verify');

  await page.locator('#age-confirm').click();
  await expect(page.locator('#age-view')).not.toHaveClass(/active/);
  await expect(page.locator('.bottom')).toBeVisible();

  const status = await (await page.request.post('/api/profile/me', {
    data: { initData: (await (await page.request.get('/__test-users')).json()).a.initData }
  })).json();
  expect(status.needsAgeConfirmation).toBe(false);
  expect(status.ageEligibility.method).toBe('self_declaration');
});

test('declaring under 18 blocks access entirely', async ({ page }) => {
  await db.recursiveDelete(db.collection('users').doc(ADA));

  await page.goto('/?as=a');
  await expect(page.locator('html')).toHaveAttribute('data-bezy-ready', 'true');
  await page.locator('#age-deny').click();

  await expect(page.locator('.age-gate')).toContainText('Bezy is for adults aged 18 and over.');
  await expect(page.locator('#age-confirm')).toHaveCount(0);
  await expect(page.locator('.bottom')).toBeHidden();
  await expect(page.locator('#discover-view')).not.toHaveClass(/active/);

  // Nothing was recorded and the backend still refuses the account.
  const status = await (await page.request.post('/api/profile/me', {
    data: { initData: (await (await page.request.get('/__test-users')).json()).a.initData }
  })).json();
  expect(status.needsAgeConfirmation).toBe(true);
  expect(status.profile.profileComplete).toBeFalsy();
});

test('age gate is localized in French', async ({ page }) => {
  await db.recursiveDelete(db.collection('users').doc(ADA));
  await page.addInitScript(() => window.localStorage.setItem('bezy-language', 'fr'));
  await page.goto('/?as=a');
  await expect(page.locator('html')).toHaveAttribute('data-bezy-ready', 'true');

  await expect(page.locator('#age-title')).toHaveText('Bezy est réservé aux personnes âgées de 18 ans et plus.');
  await expect(page.locator('#age-body')).toHaveText('En continuant, je confirme avoir 18 ans ou plus.');
  await expect(page.locator('#age-confirm')).toHaveText('J’ai 18 ans ou plus');
  await expect(page.locator('#age-deny')).toHaveText('J’ai moins de 18 ans');
});

test('bottom navigation switches every view', async ({ page }) => {
  await openApp(page);
  for (const view of ['matches', 'messages', 'profile', 'discover']) {
    await page.locator(`.nav button[data-view="${view}"]`).click();
    await expect(page.locator(`#${view}-view`)).toHaveClass(/active/);
  }
});

test('free member sees plans and prices from the backend', async ({ page }) => {
  await openApp(page);
  await page.locator('#premiumBtn').click();
  await expect(page.locator('#premium-view')).toHaveClass(/active/);
  await expect(page.locator('.premium-hero h2')).toContainText('Bezy Premium');

  // Every advertised benefit is rendered.
  await expect(page.locator('.benefits li')).toHaveCount(5);
  await expect(page.locator('.premium-hero')).toContainText('See who liked you');
  await expect(page.locator('.premium-hero')).toContainText('Unlimited discovery');

  // Prices must match what /api/premium returns, not anything hard-coded in the UI.
  const status = await (await page.request.post('/api/premium', {
    data: { initData: (await (await page.request.get('/__test-users')).json()).a.initData, action: 'status' }
  })).json();
  await expect(page.locator('.plan')).toHaveCount(3);
  for (const plan of status.plans) {
    await expect(page.locator(`.plan[data-plan="${plan.id}"]`)).toContainText(String(plan.stars));
  }
  await expect(page.locator('.plan[data-plan="yearly"]')).toContainText('Best value');
  await expect(page.locator('#premium-buy')).toContainText('Subscribe with Telegram Stars');
});

test('plan selection updates the highlighted plan', async ({ page }) => {
  await openApp(page);
  await page.locator('#premiumBtn').click();
  await page.locator('.plan[data-plan="monthly"]').click();
  await expect(page.locator('.plan[data-plan="monthly"]')).toHaveClass(/selected/);
  await expect(page.locator('.plan[data-plan="yearly"]')).not.toHaveClass(/selected/);
});

test('free member cannot see who liked them', async ({ page }) => {
  const users = await (await page.request.get('/__test-users')).json();
  await page.request.post('/api/swipe', { data: { initData: users.b.initData, targetId: ADA, action: 'like' } });

  await openApp(page);
  await page.locator('#premiumBtn').click();
  await expect(page.locator('.locked')).toBeVisible();
  await expect(page.locator('.locked')).toContainText('1 people already liked you');
  // The gate is the API: no liker profile is present in the DOM at all.
  await expect(page.locator('.liker')).toHaveCount(0);
  await expect(page.locator('#premium-content')).not.toContainText('Bo');
});

test('premium member sees likers and can match from the Premium screen', async ({ page }) => {
  const users = await (await page.request.get('/__test-users')).json();
  await page.request.post('/api/swipe', { data: { initData: users.b.initData, targetId: ADA, action: 'like' } });
  await setPremium({ active: true, planId: 'monthly', expiresAt: new Date(Date.now() + 30 * 86400000) });

  await openApp(page);
  await page.locator('#premiumBtn').click();
  await expect(page.locator('.liker')).toHaveCount(1);
  await expect(page.locator('.liker-info b')).toContainText('Bo');

  await page.locator('[data-liker-like]').click();
  await expect(page.locator('#toast')).toContainText('match');

  await page.locator('.nav button[data-view="matches"]').click();
  await expect(page.locator('.match-info b')).toContainText('Bo');
});

test('active membership shows plan and expiry', async ({ page }) => {
  await setPremium({ active: true, planId: 'quarterly', expiresAt: new Date('2026-12-24T00:00:00Z') });
  await openApp(page);
  await page.locator('#premiumBtn').click();
  await expect(page.locator('.membership')).toContainText('Quarterly');
  await expect(page.locator('.membership')).toContainText(expectedDate('2026-12-24T00:00:00Z', 'en'));
  await expect(page.locator('#premium-buy')).toContainText('Renew with Telegram Stars');
});

test('expired membership is presented as free, and says why', async ({ page }) => {
  await setPremium({ active: true, planId: 'monthly', expiresAt: new Date(Date.now() - 86400000) });
  await openApp(page);
  await page.locator('#premiumBtn').click();
  await expect(page.locator('.membership')).toHaveCount(0);
  await expect(page.locator('#premium-buy')).toContainText('Subscribe with Telegram Stars');
  await expect(page.locator('#likers-host .locked')).toBeVisible();
  // A lapsed member must be told what happened rather than seeing the same screen as
  // someone who never subscribed.
  await expect(page.locator('.lapsed-notice')).toContainText('has expired');
});

test('a refunded membership explains that it was refunded', async ({ page }) => {
  await setPremium({
    active: false, planId: 'monthly', expiresAt: new Date(Date.now() + 30 * 86400000),
    revokedAt: new Date(), revocationReason: 'refund'
  });
  await openApp(page);
  await page.locator('#premiumBtn').click();
  await expect(page.locator('.lapsed-notice')).toContainText('refunded');
  // Even though the original expiry is still in the future, access is gone.
  await expect(page.locator('.membership')).toHaveCount(0);
  await expect(page.locator('#premium-buy')).toContainText('Subscribe with Telegram Stars');
});

test('checkout requests a Stars invoice and does not self-grant Premium', async ({ page }) => {
  await openApp(page);
  // Telegram reports "paid" but no webhook fires, so the backend never activates Premium.
  await page.evaluate(() => { window.__invoiceStatus = 'paid'; });
  await page.locator('#premiumBtn').click();
  await page.locator('.plan[data-plan="monthly"]').click();
  await page.locator('#premium-buy').click();

  await expect.poll(() => page.evaluate(() => window.__lastInvoiceUrl || '')).toContain('bezy_premium');

  const invoice = await page.evaluate(() => window.__lastInvoiceUrl);
  expect(decodeURIComponent(invoice)).toContain(`bezy_premium:v1:monthly:${ADA}`);

  // The app must still show the purchase CTA, never a fabricated active membership.
  await expect(page.locator('#premium-buy')).toContainText('Subscribe with Telegram Stars');
  await expect(page.locator('.membership')).toHaveCount(0);
  expect((await (await page.request.post('/api/premium', {
    data: { initData: (await (await page.request.get('/__test-users')).json()).a.initData, action: 'status' }
  })).json()).premium.active).toBe(false);
});

test('cancelled payment is reported and grants nothing', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { window.__invoiceStatus = 'cancelled'; });
  await page.locator('#premiumBtn').click();
  await page.locator('#premium-buy').click();
  await expect(page.locator('#toast')).toContainText('Payment cancelled');
  await expect(page.locator('.membership')).toHaveCount(0);
});

test('Premium activates once the backend confirms payment', async ({ page }) => {
  await openApp(page);
  await page.locator('#premiumBtn').click();

  // The stub calls this hook while the payment sheet is open; it delivers the Telegram
  // successful_payment webhook, which is the only thing that can grant Premium.
  await page.route('**/__simulate-payment', async (route) => {
    const users = await (await page.request.get('/__test-users')).json();
    const status = await (await page.request.post('/api/premium', { data: { initData: users.a.initData, action: 'status' } })).json();
    const calls = await (await page.request.get('/__telegram-calls')).json();
    const invoice = calls.filter((c) => c.method === 'createInvoiceLink').pop();
    await page.request.post('/api/telegram/webhook', {
      data: {
        message: {
          chat: { id: Number(ADA) }, from: { id: Number(ADA), language_code: 'en' },
          successful_payment: {
            currency: 'XTR',
            total_amount: status.plans.find((p) => p.id === 'monthly').stars,
            invoice_payload: invoice.body.payload,
            telegram_payment_charge_id: `e2e_charge_${Date.now()}`,
            provider_payment_charge_id: 'e2e_prov'
          }
        }
      }
    });
    await route.fulfill({ status: 200, body: '{}' });
  });
  await page.evaluate(() => { window.__invoiceStatus = 'paid'; window.__payHook = '/__simulate-payment'; });

  await page.locator('.plan[data-plan="monthly"]').click();
  await page.locator('#premium-buy').click();

  await expect(page.locator('.membership')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.membership')).toContainText('Monthly');
  await expect(page.locator('#premium-buy')).toContainText('Renew with Telegram Stars');
});

test('Premium screen is fully localized in French', async ({ page }) => {
  await setPremium({ active: true, planId: 'yearly', expiresAt: new Date('2026-12-24T00:00:00Z') });
  await openApp(page, { lang: 'fr' });
  await page.locator('#premiumBtn').click();
  await expect(page.locator('#premium-title')).toContainText('Bezy Premium');
  await expect(page.locator('.premium-hero')).toContainText('Voir qui vous a liké');
  await expect(page.locator('.premium-hero')).toContainText('Découverte illimitée');
  await expect(page.locator('.membership')).toContainText('Annuel');
  await expect(page.locator('.membership')).toContainText(expectedDate('2026-12-24T00:00:00Z', 'fr'));
  await expect(page.locator('#premium-buy')).toContainText('Telegram Stars');
  // No raw translation keys leaked into the UI.
  await expect(page.locator('#premium-content')).not.toContainText('app.');
});

test('free discovery limit pushes the user to Premium', async ({ page }) => {
  await db.collection('users').doc(ADA).set({
    usage: { day: new Date().toISOString().slice(0, 10), discoveryActions: 30, superLikes: 1 }
  }, { merge: true });

  await openApp(page);
  await expect(page.locator('#profile-card')).toBeVisible();
  await page.locator('#likeBtn').click();

  await expect(page.locator('#toast')).toContainText("today's discovery limit");
  await expect(page.locator('#premium-view')).toHaveClass(/active/);
});
