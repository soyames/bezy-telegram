import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// THIS OR THAT — the optional post-match conversation game, driven through the real Mini App.
//
// PostgreSQL-free: the API is stubbed by a small in-memory model of the real game actions
// contract, including its anti-peeking rule (an unrevealed answer is simply not in the
// payload). The server-side enforcement of that rule — plus idempotency, finality,
// authorization and the block/unmatch lifecycle — is proved against the real database in
// tests/game.test.mjs; what this suite pins is the experience: entering from Ways to start,
// answering, the waiting state, progressive reveal, the completed summary, talking about a
// question, and the conversation staying usable throughout.

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), '../..');
const catalogue = (lang) => JSON.parse(fs.readFileSync(path.join(root, `locales/${lang}.json`), 'utf8')).app;
const en = catalogue('en');

const ACCOUNT = {
  profile: { displayName: 'Ada', age: 29, city: 'Paris', gender: 'woman', seeking: 'men', interests: ['music'], languages: [], prompts: [], bio: '', discoverable: true },
  profileComplete: true, discoverable: true, needsProfile: false, photoUrl: '', firstName: 'Ada'
};

const MATCH_BO = {
  id: '900000002', displayName: 'Bo', age: 31, city: 'Paris', bio: 'E2E.', interests: ['music'], prompts: [], languages: [], photoUrl: '',
  sharedSignals: [{ type: 'interests', values: ['music'] }],
  matchId: '900000001_900000002', matchedAtMs: Date.now(), matchedAt: new Date().toISOString(),
  conversation: { lastMessagePreview: '', lastMessageAt: null, lastMessageSenderId: '', unread: false }
};

const QUESTIONS = ['travel_beach_mountains', 'food_coffee_tea', 'comm_call_text', 'everyday_early_night', 'dating_surprise_plan'];
const ME = '900000001';
const THEM = '900000002';

/**
 * A faithful miniature of api/_game.js: the same states, the same redaction. `theirs` is
 * populated only for a question the viewer has already answered — exactly like the server,
 * where the counterpart's choice is not even SELECTed before that.
 */
function gameModel({ answers = {}, questions = QUESTIONS } = {}) {
  const round = { roundId: 'round-1', game: 'this_or_that', questions, answers: { ...answers }, completed: false };
  const viewFor = (viewer) => {
    const other = viewer === ME ? THEM : ME;
    const list = round.questions.map((id) => {
      const mine = round.answers[`${id}:${viewer}`] || null;
      const theirAnswered = Boolean(round.answers[`${id}:${other}`]);
      const revealed = Boolean(mine) && theirAnswered;
      return { id, mine, theirs: revealed ? round.answers[`${id}:${other}`] : null, theirAnswered, revealed };
    });
    const complete = list.every((q) => q.mine && q.theirAnswered);
    round.completed = complete;
    const summary = complete
      ? list.reduce((acc, q) => (q.mine === q.theirs ? { ...acc, same: acc.same + 1 } : { ...acc, different: acc.different + 1 }), { same: 0, different: 0 })
      : null;
    return {
      roundId: round.roundId, game: 'this_or_that', status: complete ? 'completed' : 'active',
      state: complete ? 'completed' : (list.some((q) => !q.mine) ? 'your_turn' : 'waiting'),
      startedByMe: viewer === ME, createdAt: new Date().toISOString(), completedAt: complete ? new Date().toISOString() : null,
      questions: list, summary
    };
  };
  return { round, viewFor };
}

async function stubApi(page, options = {}) {
  const { matches = [MATCH_BO], started = false, answers = {}, premiumRequired = false, failStart = false } = options;
  const model = gameModel({ answers });
  let exists = started;
  const messages = [];
  const calls = [];
  await page.exposeFunction('__gameCalls', () => calls);
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const body = route.request().postDataJSON() || {};
    if (url.pathname === '/api/profile/me') {
      return route.fulfill({ json: { profile: ACCOUNT, notifications: null, processingRestricted: false, processingObjection: false, needsAgeConfirmation: false } });
    }
    if (url.pathname === '/api/matches') return route.fulfill({ json: { ok: true, matches } });
    if (url.pathname === '/api/discover') return route.fulfill({ json: { ok: true, profiles: [], stats: null, preferences: null } });
    if (url.pathname === '/api/premium') return route.fulfill({ json: { ok: true, premium: { active: true }, plans: [] } });
    // The game rides the conversation route: same endpoint, same Premium gate, namespaced
    // `game_*` actions. There is no separate game function to stub.
    if (url.pathname === '/api/messages') {
      if (String(body.action || '').startsWith('game_')) calls.push(body.action);
      if (premiumRequired) return route.fulfill({ status: 403, json: { error: 'PREMIUM_REQUIRED' } });
      if (body.action === 'send') { messages.push({ id: body.clientId, senderId: ME, text: body.text, createdAt: new Date().toISOString() }); return route.fulfill({ json: { ok: true, message: messages.at(-1) } }); }
      if (body.action === 'list') return route.fulfill({ json: { ok: true, conversationId: body.conversationId, messages } });
      if (body.action === 'game_state') return route.fulfill({ json: { ok: true, round: exists ? model.viewFor(ME) : null } });
      if (body.action === 'game_start') {
        if (failStart) return route.fulfill({ status: 500, json: { error: 'DATABASE_UNAVAILABLE' } });
        exists = true; // idempotent: the same round comes back however often this is called
        return route.fulfill({ json: { ok: true, round: model.viewFor(ME) } });
      }
      if (body.action === 'game_answer') {
        const key = `${body.questionId}:${ME}`;
        if (model.round.answers[key] && model.round.answers[key] !== body.choice) {
          return route.fulfill({ status: 409, json: { error: 'ANSWER_FINAL', round: model.viewFor(ME) } });
        }
        model.round.answers[key] ||= body.choice;
        return route.fulfill({ json: { ok: true, round: model.viewFor(ME) } });
      }
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { ok: true } });
  });
  return { model, answerAsCounterpart: (id, choice) => { model.round.answers[`${id}:${THEM}`] = choice; } };
}

const openConversation = async (page) => {
  await page.locator('.nav button[data-view="messages"]').click();
  await page.locator('#messages-view .conversation-btn[data-open-chat]').first().click();
  await expect(page.locator('#chat-screen')).toBeVisible();
};
const openWaysToStart = async (page) => {
  await page.locator('#chat-starters-open').click();
  await expect(page.locator('.sheet')).toBeVisible();
};

// ----------------------------------------------------------------- the full journey

test('A starts a round from Ways to start, answers five questions and ends up waiting', async ({ page }) => {
  await stubApi(page);
  await page.goto('/?as=a');
  await openConversation(page);

  // The game is one of the ways to start — it never replaces the starters.
  await openWaysToStart(page);
  await expect(page.locator('.sheet [data-use="0"]')).toBeVisible();
  await expect(page.locator('#tot-play')).toHaveText(`✨ ${en.tot_play}`);
  await page.locator('#tot-play').click();

  await expect(page.locator('.sheet h3')).toHaveText(en.tot_title);
  await expect(page.locator('#tot-start')).toHaveText(en.tot_start);
  await page.locator('#tot-start').click();

  // Five questions, one at a time, each a pair of tappable options.
  for (let index = 0; index < 5; index++) {
    await expect(page.locator('.tot-progress')).toHaveText(en.tot_progress.replace('{n}', String(index + 1)).replace('{total}', '5'));
    await expect(page.locator('.tot-option')).toHaveCount(2);
    await expect(page.locator('.tot-option').first()).toHaveText(en[`tot_q_${QUESTIONS[index]}_a`]);
    await expect(page.locator('.tot-option').nth(1)).toHaveText(en[`tot_q_${QUESTIONS[index]}_b`]);
    await page.locator('.tot-option').first().click();
  }

  // Nothing is revealed yet, and the sheet says who it is waiting for — no countdown.
  await expect(page.locator('.tot-options')).toHaveCount(0);
  await expect(page.locator('.tot-intro')).toHaveText(en.tot_waiting_body.replace('{name}', 'Bo'));
  await expect(page.locator('.tot-reveal.pending').first()).toHaveText(en.tot_waiting_question.replace('{name}', 'Bo'));
  await expect(page.locator('.tot-reveal.same, .tot-reveal.different')).toHaveCount(0);

  // The conversation itself carries one compact card, not five system messages.
  await page.locator('.sheet-close').click();
  await expect(page.locator('#chat-game .tot-card')).toBeVisible();
  await expect(page.locator('#chat-game .tot-card-state')).toHaveText(en.tot_state_waiting.replace('{name}', 'Bo'));
  await expect(page.locator('#chat-messages .msg')).toHaveCount(0);
});

test('B cannot see A’s picks before answering, then the reveal arrives question by question', async ({ page }) => {
  // A has already answered everything; the viewer here is the second participant.
  const answered = Object.fromEntries(QUESTIONS.map((id) => [`${id}:${THEM}`, 'a']));
  await stubApi(page, { started: true, answers: answered });
  await page.goto('/?as=a');
  await openConversation(page);

  await expect(page.locator('#chat-game .tot-card-state')).toHaveText(en.tot_state_your_turn);
  await page.locator('#tot-open').click();

  // Nothing about the counterpart's picks is on the page — or in the payload behind it.
  const payload = await page.evaluate(async () => {
    const response = await fetch('/api/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'game_state', conversationId: '900000001_900000002' }) });
    return response.json();
  });
  expect(payload.round.questions.every((q) => q.theirs === null && q.revealed === false)).toBe(true);
  expect(payload.round.questions.every((q) => q.theirAnswered === true)).toBe(true);
  await expect(page.locator('.tot-reveal')).toHaveCount(0);

  // Answering the first question reveals that one, and only that one.
  await page.locator('.tot-option').first().click();
  await expect(page.locator('.tot-reveal.same')).toHaveCount(1);
  await expect(page.locator('.tot-reveal.same')).toHaveText(en.tot_same.replace('{choice}', en[`tot_q_${QUESTIONS[0]}_a`]));
  await expect(page.locator('.tot-progress')).toHaveText(en.tot_progress.replace('{n}', '2').replace('{total}', '5'));

  // A different pick is framed as something to talk about, never as a failure.
  await page.locator('.tot-option').nth(1).click();
  await expect(page.locator('.tot-reveal.different')).toHaveText(
    en.tot_different.replace('{mine}', en[`tot_q_${QUESTIONS[1]}_b`]).replace('{name}', 'Bo').replace('{theirs}', en[`tot_q_${QUESTIONS[1]}_a`]));
  await expect(page.locator('.tot-reveal-note').first()).toHaveText(en.tot_different_note);

  // Finishing the round produces a plain count — never a percentage or a verdict.
  for (let index = 2; index < 5; index++) await page.locator('.tot-option').first().click();
  await expect(page.locator('.tot-summary-line').first()).toHaveText(en.tot_summary_same.replace('{n}', '4'));
  await expect(page.locator('.tot-summary-line').nth(1)).toHaveText(en.tot_summary_different.replace('{n}', '1'));
  await expect(page.locator('.tot-summary')).not.toContainText('%');

  // "Talk about one" fills the composer and sends nothing.
  await page.locator('#tot-talk').click();
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page.locator('#chat-draft')).toHaveValue(
    en.tot_talk_message.replace('{a}', en[`tot_q_${QUESTIONS[1]}_a`]).replace('{b}', en[`tot_q_${QUESTIONS[1]}_b`]));
  await expect(page.locator('#chat-messages .msg')).toHaveCount(0);

  // And the conversation is still an ordinary conversation.
  await page.locator('#chat-send').click();
  await expect(page.locator('#chat-messages .msg.sent')).toHaveCount(1);
  await expect(page.locator('#chat-game .tot-card-state')).toHaveText(en.tot_state_completed);
});

test('a completed round can be followed by another, and results are announced once', async ({ page }) => {
  const done = {};
  for (const id of QUESTIONS) { done[`${id}:${ME}`] = 'a'; done[`${id}:${THEM}`] = 'a'; }
  await stubApi(page, { started: true, answers: done });
  await page.goto('/?as=a');
  await openConversation(page);

  // Freshly completed and not yet opened: results ready. Opening it makes it completed.
  await expect(page.locator('#chat-game .tot-card-state')).toHaveText(en.tot_state_results);
  await expect(page.locator('#tot-open')).toHaveText(en.tot_see_results);
  await page.locator('#tot-open').click();
  await expect(page.locator('#tot-again')).toHaveText(en.tot_new_round);
  await page.locator('.sheet-close').click();
  await expect(page.locator('#chat-game .tot-card-state')).toHaveText(en.tot_state_completed);
});

test('a double tap on Start never produces two rounds', async ({ page }) => {
  const stub = await stubApi(page);
  await page.goto('/?as=a');
  await openConversation(page);
  await openWaysToStart(page);
  await page.locator('#tot-play').click();
  await expect(page.locator('#tot-start')).toBeVisible();

  // Both taps in the same tick — the impatient double tap the in-flight guard exists for.
  // (The server is idempotent regardless; tests/game.test.mjs proves that against the
  // database, including two participants starting at the same moment.)
  await page.evaluate(() => { const button = document.getElementById('tot-start'); button.click(); button.click(); });

  await expect(page.locator('.tot-options')).toHaveCount(1);
  await expect(page.locator('.tot-progress')).toHaveText(en.tot_progress.replace('{n}', '1').replace('{total}', '5'));
  const starts = (await page.evaluate(() => window.__gameCalls())).filter((action) => action === 'game_start');
  expect(starts).toHaveLength(1);
  expect(stub.model.round.roundId).toBe('round-1');
});

test('a failed start says so and leaves the conversation alone', async ({ page }) => {
  await stubApi(page, { failStart: true });
  await page.goto('/?as=a');
  await openConversation(page);
  await openWaysToStart(page);
  await page.locator('#tot-play').click();
  await page.locator('#tot-start').click();
  await expect(page.locator('#toast')).toHaveText(en.error_database);
  await expect(page.locator('#tot-start')).toBeVisible();
  await page.locator('.sheet-close').click();
  await expect(page.locator('#chat-game')).toBeHidden();
  await expect(page.locator('#chat-composer')).toBeVisible();
});

test('the game is behind the same Premium gate as the conversation', async ({ page }) => {
  await stubApi(page, { premiumRequired: true, started: true });
  await page.goto('/?as=a');
  await openConversation(page);
  await expect(page.locator('#chat-locked')).toBeVisible();
  await expect(page.locator('#chat-game')).toBeHidden();
  await expect(page.locator('#chat-game .tot-card')).toHaveCount(0);
});

// ----------------------------------------------------------------- reach

test('the round is comfortable on a small phone', async ({ page }) => {
  await stubApi(page, { started: true });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/?as=a');
  await openConversation(page);
  await page.locator('#tot-open').click();

  for (const option of await page.locator('.tot-option').all()) {
    const box = await option.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(48); // comfortable one-handed tap target
    expect(box.width).toBeLessThanOrEqual(320);
  }
  const card = await page.locator('#chat-game .tot-card').boundingBox();
  expect(card.width).toBeLessThanOrEqual(320);
  // The composer still clears the navigation with the card on screen.
  const composer = await page.locator('#chat-composer').boundingBox();
  const nav = await page.locator('.bottom').boundingBox();
  expect(composer.y + composer.height).toBeLessThanOrEqual(nav.y + 1);
});

test('the round renders right-to-left in Arabic', async ({ page }) => {
  const ar = catalogue('ar');
  await stubApi(page, { started: true });
  await page.addInitScript(() => localStorage.setItem('bezy-language', 'ar'));
  await page.goto('/?as=a');
  await openConversation(page);

  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('#chat-game .tot-card-state')).toHaveText(ar.tot_state_your_turn);
  await page.locator('#tot-open').click();
  await expect(page.locator('.sheet h3')).toHaveText(ar.tot_title);
  await expect(page.locator('.tot-option').first()).toHaveText(ar[`tot_q_${QUESTIONS[0]}_a`]);
  const option = await page.locator('.tot-option').first().boundingBox();
  const sheet = await page.locator('.sheet').boundingBox();
  expect(option.x).toBeGreaterThanOrEqual(sheet.x - 1);
  expect(option.x + option.width).toBeLessThanOrEqual(sheet.x + sheet.width + 1);
});

test('the round renders in Japanese without overflowing', async ({ page }) => {
  const ja = catalogue('ja');
  await stubApi(page, { started: true });
  await page.addInitScript(() => localStorage.setItem('bezy-language', 'ja'));
  await page.goto('/?as=a');
  await openConversation(page);

  await expect(page.locator('#chat-game .tot-card-title')).toContainText(ja.tot_title);
  await page.locator('#tot-open').click();
  await expect(page.locator('.tot-option').first()).toHaveText(ja[`tot_q_${QUESTIONS[0]}_a`]);
  for (const node of await page.locator('.tot-option, .tot-card-state, .tot-progress').all()) {
    const overflow = await node.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});
