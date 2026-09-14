// Bezy — THIS OR THAT: database, API, authorization and privacy suite.
//
// Drives the REAL game actions of /api/messages through the harness against the ISOLATED bezy_test
// database, and asserts DATABASE STATE with direct SQL wherever the claim is about the
// database rather than about a response. The point of this suite is that the invariants hold
// in PostgreSQL — one active round per conversation, one answer per participant per
// question, a finalized answer that cannot be rewritten, completion exactly once — and that
// an unrevealed answer is never in a response at all.
//
// Run through tests/run.mjs with TEST_DATABASE_URL or NEON_ENV_FILE.
import { seedRow, resetTestData, sql } from './fixtures.mjs';
import { startHarness, makeInitData, TEST_USERS } from './harness.mjs';
import { QUESTION_IDS, ROUND_SIZE, selectQuestions, roundView, summarize } from '../api/_thisorthat.js';

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `  -> ${String(detail).slice(0, 300)}` : ''}`); }
}
function section(title) { console.log(`\n== ${title} ==`); }

const harness = await startHarness({ port: Number(process.env.PORT || 3310) });
const BASE = harness.url;
const initData = Object.fromEntries(Object.entries(TEST_USERS).map(([k, u]) => [k, makeInitData(u)]));

async function call(path, who, body = {}) {
  const res = await fetch(BASE + path, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, initData: typeof who === 'string' && who.includes('=') ? who : initData[who] })
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const CID = '900000001_900000002';
const PROFILES = {
  a: { displayName: 'Ada', age: 29, city: 'Paris', gender: 'woman', seeking: 'men', interests: ['music'], bio: 'Testing Bezy.', discoverable: true },
  b: { displayName: 'Bo', age: 31, city: 'Paris', gender: 'man', seeking: 'women', interests: ['music'], bio: 'Bonjour.', discoverable: true },
  c: { displayName: 'Cy', age: 45, city: 'Lyon', gender: 'man', seeking: 'women', interests: ['hiking'], bio: 'Salut.', discoverable: true },
  d: { displayName: 'Dee', age: 28, city: 'Paris', gender: 'man', seeking: 'everyone', interests: ['books'], bio: 'Hi.', discoverable: true }
};
const premium = (userId) => seedRow('users', [String(userId)], { bezyPremium: { active: true, expiresAt: new Date(Date.now() + 86400000) } });

async function seedAll() {
  for (const key of ['a', 'b', 'c', 'd']) {
    await call('/api/profile/me', key, { ageEligibilityConfirmed: true });
    await call('/api/profile/me', key, { profile: PROFILES[key] });
  }
}

/** The documented starting point: Ada and Bo matched, both Premium, no round yet. */
async function matchedPair() {
  await resetTestData();
  await seedAll();
  await call('/api/swipe', 'a', { targetId: '900000002', action: 'like' });
  await call('/api/swipe', 'b', { targetId: '900000001', action: 'like' });
  await premium('900000001');
  await premium('900000002');
}

const rounds = () => sql('SELECT * FROM game_rounds ORDER BY created_at, round_id').then((r) => r.rows);
const answers = (roundId) => sql('SELECT * FROM game_answers WHERE round_id = $1 ORDER BY question_id, user_id', [roundId]).then((r) => r.rows);
const start = (who) => call('/api/messages', who, { action: 'game_start', conversationId: CID });
const state = (who, lang) => call('/api/messages', who, { action: 'game_state', conversationId: CID, ...(lang ? { lang } : {}) });
const answer = (who, roundId, questionId, choice) => call('/api/messages', who, { action: 'game_answer', conversationId: CID, roundId, questionId, choice });

/** Answers every question of a round for one participant. */
async function answerAll(who, round, choose = () => 'a') {
  let last = null;
  for (const question of round.questions) last = await answer(who, round.roundId, question.id, choose(question));
  return last;
}

try {
  // ------------------------------------------------------------------ pure logic
  section('Question bank (pure)');
  check('the bank holds 30 curated questions', QUESTION_IDS.length === 30, String(QUESTION_IDS.length));
  check('every question id is unique', new Set(QUESTION_IDS).size === QUESTION_IDS.length);
  check('question ids are machine tokens', QUESTION_IDS.every((id) => /^[a-z][a-z0-9_]{4,60}$/.test(id)),
    QUESTION_IDS.filter((id) => !/^[a-z][a-z0-9_]{4,60}$/.test(id)).join(','));
  check('a round is five questions', ROUND_SIZE === 5);
  check('selection returns five distinct bank questions', (() => {
    const picked = selectQuestions();
    return picked.length === 5 && new Set(picked).size === 5 && picked.every((id) => QUESTION_IDS.includes(id));
  })());
  check('selection prefers questions the previous round did not use', (() => {
    for (let i = 0; i < 40; i++) {
      const previous = selectQuestions();
      if (selectQuestions(previous).some((id) => previous.includes(id))) return false;
    }
    return true;
  })());
  check('an exhausted exclusion list still yields a full round',
    selectQuestions(QUESTION_IDS).length === 5, 'excluding the whole bank must not shrink a round');
  check('the summary counts same and different, never a percentage', (() => {
    const counted = summarize([
      { revealed: true, mine: 'a', theirs: 'a' }, { revealed: true, mine: 'b', theirs: 'b' },
      { revealed: true, mine: 'a', theirs: 'b' }, { revealed: false, mine: 'a', theirs: null }
    ]);
    return counted.same === 2 && counted.different === 1 && !('percent' in counted) && !('score' in counted);
  })());
  check('roundView redacts an unanswered counterpart choice even if handed one', (() => {
    const view = roundView(
      { round_id: 'r', game: 'this_or_that', initiator_id: '1', questions: ['food_coffee_tea'], status: 'active', created_at: new Date(), completed_at: null },
      '1', new Map(), new Map([['food_coffee_tea', 'b']]), new Set(['food_coffee_tea'])
    );
    return view.questions[0].theirs === null && view.questions[0].revealed === false && view.questions[0].theirAnswered === true;
  })());

  // ------------------------------------------------------------------ A, B
  section('A/B — a participant starts a round of five unique questions');
  await matchedPair();
  let r = await start('a');
  check('starting a round answers 200', r.status === 200 && r.data.ok === true, JSON.stringify(r.data));
  const first = r.data.round;
  check('the round is active and started by the caller', first?.status === 'active' && first.startedByMe === true, JSON.stringify(first));
  check('the round carries exactly five questions', first?.questions.length === 5, String(first?.questions.length));
  check('the five questions are unique', new Set(first.questions.map((q) => q.id)).size === 5);
  check('every question comes from the canonical bank', first.questions.every((q) => QUESTION_IDS.includes(q.id)));
  check('a fresh round reveals nothing', first.questions.every((q) => q.mine === null && q.theirs === null && q.revealed === false));
  check('a fresh round has no summary', first.summary === null, JSON.stringify(first.summary));
  let dbRounds = await rounds();
  check('exactly one round row exists', dbRounds.length === 1, String(dbRounds.length));
  check('the row is stored against the conversation', dbRounds[0].conversation_id === CID && dbRounds[0].game === 'this_or_that');
  check('the row stores canonical question ids only',
    dbRounds[0].questions.every((id) => QUESTION_IDS.includes(id)) && dbRounds[0].questions.length === 5, JSON.stringify(dbRounds[0].questions));
  check('the initiator is the authenticated caller', String(dbRounds[0].initiator_id) === '900000001');
  check('the counterpart sees the same round', (await state('b')).data.round?.roundId === first.roundId);
  check('the counterpart is not the initiator', (await state('b')).data.round?.startedByMe === false);

  // ------------------------------------------------------------------ C
  section('C — starting again is idempotent, never a second round');
  r = await start('a');
  check('a repeat start returns the same round', r.status === 200 && r.data.round.roundId === first.roundId, JSON.stringify(r.data.round?.roundId));
  r = await start('b');
  check('the counterpart starting joins the same round', r.data.round.roundId === first.roundId);
  check('still exactly one round row', (await rounds()).length === 1);

  // ------------------------------------------------------------------ D
  section('D — concurrent starts resolve to exactly one active round');
  await matchedPair();
  const concurrent = await Promise.all([start('a'), start('b'), start('a'), start('b')]);
  check('every concurrent start succeeded', concurrent.every((c) => c.status === 200), JSON.stringify(concurrent.map((c) => c.status)));
  check('they all returned the same round id', new Set(concurrent.map((c) => c.data.round?.roundId)).size === 1,
    JSON.stringify(concurrent.map((c) => c.data.round?.roundId)));
  dbRounds = await rounds();
  check('exactly one row was written', dbRounds.length === 1, String(dbRounds.length));
  check('exactly one ACTIVE round exists for the conversation',
    (await sql("SELECT count(*)::int AS n FROM game_rounds WHERE conversation_id = $1 AND status = 'active'", [CID])).rows[0].n === 1);
  // The invariant is the database's, not the handler's: a second active row is impossible.
  let rejected = false;
  try {
    await sql(`INSERT INTO game_rounds (round_id, conversation_id, game, initiator_id, questions, status, created_at)
               VALUES ('forced', $1, 'this_or_that', 900000001, $2, 'active', now())`, [CID, QUESTION_IDS.slice(0, 5)]);
  } catch { rejected = true; }
  check('PostgreSQL itself refuses a second active round', rejected);

  // ------------------------------------------------------------------ E, F, G, H
  section('E/F/G — an answer is recorded once and is final');
  await matchedPair();
  const round = (await start('a')).data.round;
  const q1 = round.questions[0].id;
  r = await answer('a', round.roundId, q1, 'a');
  check('an answer is accepted', r.status === 200 && r.data.ok === true, JSON.stringify(r.data));
  check('the answer comes back as the caller’s own pick', r.data.round.questions[0].mine === 'a');
  check('the answer is stored exactly once', (await answers(round.roundId)).length === 1);

  r = await answer('a', round.roundId, q1, 'a');
  check('F — a retried identical answer is idempotent', r.status === 200 && r.data.round.questions[0].mine === 'a', JSON.stringify(r.data));
  check('the retry wrote no second row', (await answers(round.roundId)).length === 1);

  r = await answer('a', round.roundId, q1, 'b');
  check('G — a changed answer is refused', r.status === 409 && r.data.error === 'ANSWER_FINAL', JSON.stringify(r.data));
  check('the stored answer is untouched', (await answers(round.roundId))[0].choice === 'a');
  check('the refusal still returns the round so nothing is lost', r.data.round?.questions[0].mine === 'a');

  section('H — an unrevealed answer is never in the response');
  r = await state('b');
  let theirQ1 = r.data.round.questions.find((q) => q.id === q1);
  check('the counterpart is told nothing about an answer they have not matched',
    theirQ1.theirs === null && theirQ1.revealed === false && theirQ1.mine === null, JSON.stringify(theirQ1));
  check('the counterpart can see THAT it was answered, never WHICH', theirQ1.theirAnswered === true);
  check('the database really does hold the hidden answer (the redaction is the API, not an empty table)',
    (await answers(round.roundId)).length === 1);
  check('no unrevealed choice appears anywhere in the payload',
    JSON.stringify(r.data.round.questions).split('"theirs":"').length === 1, JSON.stringify(r.data.round.questions));
  // The same question, answered the other way: B must still not learn A's pick until B answers.
  r = await answer('b', round.roundId, q1, 'b');
  check('I — answering reveals both picks to the answerer',
    r.data.round.questions[0].revealed === true && r.data.round.questions[0].mine === 'b' && r.data.round.questions[0].theirs === 'a',
    JSON.stringify(r.data.round.questions[0]));
  r = await state('a');
  check('I — and to the first answerer too',
    r.data.round.questions[0].revealed === true && r.data.round.questions[0].mine === 'a' && r.data.round.questions[0].theirs === 'b');
  check('unanswered questions stay unrevealed for both',
    r.data.round.questions.slice(1).every((q) => q.revealed === false && q.theirs === null));
  check('the round is not complete while questions remain', r.data.round.status === 'active' && r.data.round.state === 'your_turn');

  // ------------------------------------------------------------------ waiting state
  section('Round states are functional, never a countdown');
  await answerAll('a', round, () => 'a');
  r = await state('a');
  check('a participant who has answered everything is waiting', r.data.round.state === 'waiting', JSON.stringify(r.data.round.state));
  check('the waiting participant still sees no unrevealed pick',
    r.data.round.questions.filter((q) => !q.revealed).every((q) => q.theirs === null));
  r = await state('b');
  check('the other participant still has their turn', r.data.round.state === 'your_turn');
  check('no timer, deadline or score is published',
    !/expires|deadline|countdown|score|percent|points/i.test(JSON.stringify(r.data)), JSON.stringify(r.data).slice(0, 200));

  // ------------------------------------------------------------------ J
  section('J — the round completes exactly once');
  await answerAll('b', round, (q) => (q.id === q1 ? 'b' : 'b'));
  dbRounds = await rounds();
  check('the round is completed in the database', dbRounds[0].status === 'completed' && dbRounds[0].completed_at !== null);
  check('ten answers are stored — five each', (await answers(round.roundId)).length === 10);
  r = await state('a');
  check('both participants see the completed round', r.data.round.status === 'completed' && r.data.round.state === 'completed');
  check('every question is revealed', r.data.round.questions.every((q) => q.revealed === true && q.mine && q.theirs));
  check('the summary counts same and different',
    r.data.round.summary.same + r.data.round.summary.different === 5, JSON.stringify(r.data.round.summary));
  check('the summary is a count, not a compatibility verdict',
    Object.keys(r.data.round.summary).sort().join(',') === 'different,same', JSON.stringify(r.data.round.summary));
  const completedAt = dbRounds[0].completed_at;
  r = await answer('a', round.roundId, q1, 'a');
  check('answering a completed round is refused', r.status === 404 && r.data.error === 'GAME_UNAVAILABLE', JSON.stringify(r.data));
  check('the completion timestamp never moves', String((await rounds())[0].completed_at) === String(completedAt));

  // Simultaneous final answers: both participants land their last question at once.
  await matchedPair();
  const raceRound = (await start('a')).data.round;
  const lastQuestion = raceRound.questions[4].id;
  for (const question of raceRound.questions.slice(0, 4)) {
    await answer('a', raceRound.roundId, question.id, 'a');
    await answer('b', raceRound.roundId, question.id, 'b');
  }
  const raced = await Promise.all([
    answer('a', raceRound.roundId, lastQuestion, 'a'),
    answer('b', raceRound.roundId, lastQuestion, 'b')
  ]);
  check('both simultaneous final answers succeeded', raced.every((x) => x.status === 200), JSON.stringify(raced.map((x) => x.status)));
  dbRounds = await rounds();
  check('the racing round completed', dbRounds[0].status === 'completed' && dbRounds[0].completed_at !== null);
  check('the race stored exactly ten answers', (await answers(raceRound.roundId)).length === 10);
  check('no duplicate answer survived the race',
    (await sql('SELECT count(*)::int AS n FROM (SELECT round_id, question_id, user_id FROM game_answers GROUP BY 1,2,3 HAVING count(*) > 1) d')).rows[0].n === 0);

  // ------------------------------------------------------------------ O
  section('O — a new round may start once the previous one is complete');
  r = await start('b');
  check('a new round starts after completion', r.status === 200 && r.data.round.roundId !== raceRound.roundId, JSON.stringify(r.data.round?.roundId));
  const second = r.data.round;
  check('the new round is active with five questions', second.status === 'active' && second.questions.length === 5);
  check('the new round does not repeat the previous questions',
    second.questions.every((q) => !raceRound.questions.some((old) => old.id === q.id)),
    `${second.questions.map((q) => q.id)} vs ${raceRound.questions.map((q) => q.id)}`);
  check('the completed round is still stored', (await rounds()).length === 2);
  check('exactly one of the two is active',
    (await sql("SELECT count(*)::int AS n FROM game_rounds WHERE conversation_id = $1 AND status = 'active'", [CID])).rows[0].n === 1);
  check('the completed round’s answers were not touched', (await answers(raceRound.roundId)).length === 10);

  // ------------------------------------------------------------------ K
  section('K — authorization: only the two participants may touch a round');
  r = await call('/api/messages', 'c', { action: 'game_state', conversationId: CID });
  check('a stranger cannot read the round', r.status === 404 && r.data.error === 'CONVERSATION_UNAVAILABLE', JSON.stringify(r.data));
  r = await call('/api/messages', 'c', { action: 'game_start', conversationId: CID });
  check('a stranger cannot start a round in someone else’s conversation', r.status === 404 && r.data.error === 'CONVERSATION_UNAVAILABLE');
  r = await call('/api/messages', 'c', { action: 'game_answer', conversationId: CID, roundId: second.roundId, questionId: second.questions[0].id, choice: 'a' });
  check('a stranger cannot answer someone else’s round', r.status === 404 && r.data.error === 'CONVERSATION_UNAVAILABLE');
  check('the stranger wrote nothing', (await answers(second.roundId)).length === 0);
  r = await call('/api/messages', 'c', { action: 'game_state', conversationId: '900000003_900000001' });
  check('an unmatched pair has no game', r.status === 404 && r.data.error === 'CONVERSATION_UNAVAILABLE');
  r = await call('/api/messages', 'a', { action: 'game_state', conversationId: '900000002_900000003' });
  check('a participant cannot read a conversation they are not in', r.status === 404 && r.data.error === 'CONVERSATION_UNAVAILABLE');
  r = await call('/api/messages', 'a', { action: 'game_state', conversationId: '900000001_900000002/x' });
  check('a malformed conversation id is a 404, never a database error', r.status === 404 && r.data.error === 'CONVERSATION_UNAVAILABLE');
  r = await call('/api/messages', 'user=%7B%22id%22%3A1%7D&hash=deadbeef', { action: 'game_state', conversationId: CID });
  check('forged initData is rejected', r.status === 401 && r.data.error === 'INVALID_SESSION');
  r = await call('/api/messages', 'a', { action: 'game_answer', conversationId: CID, roundId: second.roundId, questionId: second.questions[0].id, choice: 'a', userId: '900000002' });
  check('a forged userId is ignored — the authenticated caller answers', r.status === 200 && r.data.round.questions[0].mine === 'a');
  check('the answer was attributed to the authenticated caller',
    (await answers(second.roundId)).every((row) => String(row.user_id) === '900000001'));

  // A round id belonging to another couple is unreachable from this conversation.
  await sql('DELETE FROM game_answers');
  await sql('DELETE FROM game_rounds');
  await seedRow('matches', ['900000003_900000004'], { participants: ['900000003', '900000004'], active: true, source: 'mutual_like' });
  await sql(`INSERT INTO conversations (conversation_id, participant_a, participant_b, match_id, status, created_at, updated_at)
             VALUES ('900000003_900000004', 900000003, 900000004, '900000003_900000004', 'open', now(), now())`);
  await sql(`INSERT INTO game_rounds (round_id, conversation_id, game, initiator_id, questions, status, created_at)
             VALUES ('other-couple', '900000003_900000004', 'this_or_that', 900000003, $1, 'active', now())`, [QUESTION_IDS.slice(0, 5)]);
  await sql(`INSERT INTO game_answers (round_id, question_id, user_id, choice, created_at)
             VALUES ('other-couple', $1, 900000003, 'a', now())`, [QUESTION_IDS[0]]);
  const mine = (await start('a')).data.round;
  r = await answer('a', 'other-couple', QUESTION_IDS[0], 'b');
  check('another couple’s round id is unreachable', r.status === 404 && r.data.error === 'GAME_UNAVAILABLE', JSON.stringify(r.data));
  check('nothing was written into the other couple’s round', (await answers('other-couple')).length === 1);
  check('and their answer is untouched', (await answers('other-couple'))[0].choice === 'a');

  section('Input validation refuses anything that is not a canonical id');
  r = await answer('a', mine.roundId, 'not_a_question', 'a');
  check('an unknown question id is rejected', r.status === 400 && r.data.error === 'INVALID_ACTION', JSON.stringify(r.data));
  r = await answer('a', mine.roundId, mine.questions[0].id, 'c');
  check('an unknown choice is rejected', r.status === 400 && r.data.error === 'INVALID_ACTION');
  r = await answer('a', mine.roundId, QUESTION_IDS.find((id) => !mine.questions.some((q) => q.id === id)), 'a');
  check('a valid question outside this round is refused', r.status === 404 && r.data.error === 'GAME_UNAVAILABLE');
  r = await call('/api/messages', 'a', { action: 'destroy', conversationId: CID });
  check('an unknown action is rejected', r.status === 400 && r.data.error === 'INVALID_ACTION');
  const getRes = await fetch(`${BASE}/api/messages`, { method: 'GET' });
  check('GET is not allowed', getRes.status === 405);
  // The game is served by the conversation route and is NOT a serverless function of its
  // own: the deployment ceiling is 12, and a 13th function fails the whole deploy.
  const gameRoute = await fetch(`${BASE}/api/game`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  check('there is no separate game route', gameRoute.status === 404, String(gameRoute.status));

  // ------------------------------------------------------------------ Premium
  section('The game follows the conversation’s Premium rule — it never routes around it');
  await matchedPair();
  await sql('UPDATE premium_memberships SET active = FALSE WHERE telegram_id = 900000001');
  r = await start('a');
  check('a matched user without Premium cannot start a round', r.status === 403 && r.data.error === 'PREMIUM_REQUIRED', JSON.stringify(r.data));
  r = await state('a');
  check('nor read one', r.status === 403 && r.data.error === 'PREMIUM_REQUIRED');
  check('no round was created', (await rounds()).length === 0);
  await premium('900000001');
  check('with Premium restored the round starts', (await start('a')).status === 200);

  // ------------------------------------------------------------------ L, M, N
  section('L/M/N — block, unmatch and a paused account close the game with the conversation');
  await matchedPair();
  const blockRound = (await start('a')).data.round;
  await answer('a', blockRound.roundId, blockRound.questions[0].id, 'a');
  await call('/api/relationship', 'b', { action: 'block', targetId: '900000001' });
  r = await state('a');
  check('L — the blocked participant loses the game', r.status === 404 && r.data.error === 'CONVERSATION_UNAVAILABLE', JSON.stringify(r.data));
  r = await state('b');
  check('L — and so does the blocker', r.status === 404 && r.data.error === 'CONVERSATION_UNAVAILABLE');
  r = await answer('b', blockRound.roundId, blockRound.questions[0].id, 'b');
  check('L — no answer can be submitted through a block', r.status === 404 && r.data.error === 'CONVERSATION_UNAVAILABLE');
  check('L — the round is untouched behind the block', (await answers(blockRound.roundId)).length === 1);

  await matchedPair();
  const unmatchRound = (await start('a')).data.round;
  await call('/api/relationship', 'a', { action: 'unmatch', targetId: '900000002' });
  r = await state('a');
  check('M — unmatching closes the game', r.status === 404 && r.data.error === 'CONVERSATION_UNAVAILABLE');
  r = await answer('b', unmatchRound.roundId, unmatchRound.questions[0].id, 'a');
  check('M — the counterpart cannot keep playing after an unmatch', r.status === 404 && r.data.error === 'CONVERSATION_UNAVAILABLE');
  r = await start('a');
  check('M — and no new round can be started', r.status === 404 && r.data.error === 'CONVERSATION_UNAVAILABLE');

  await matchedPair();
  const pausedRound = (await start('a')).data.round;
  await call('/api/account', 'b', { action: 'restrict' });
  r = await state('a');
  check('N — a paused counterpart closes the conversation and the game with it',
    r.status === 404 && r.data.error === 'CONVERSATION_UNAVAILABLE', JSON.stringify(r.data));
  r = await answer('b', pausedRound.roundId, pausedRound.questions[0].id, 'a');
  check('N — a paused participant cannot play either', r.status === 403 && r.data.error === 'PROCESSING_RESTRICTED', JSON.stringify(r.data));
  await call('/api/account', 'b', { action: 'unrestrict' });
  check('N — lifting the pause restores the same round', (await state('a')).data.round?.roundId === pausedRound.roundId);

  section('The export carries your own picks, and only yours');
  await matchedPair();
  const doomed = (await start('a')).data.round;
  await answer('a', doomed.roundId, doomed.questions[0].id, 'a');
  await answer('b', doomed.roundId, doomed.questions[0].id, 'b');
  r = await call('/api/account', 'a', { action: 'export' });
  const exportedGames = (r.data.data?.conversations || []).flatMap((c) => c.games || []);
  check('the export lists the round under its conversation', exportedGames.length === 1 && exportedGames[0].roundId === doomed.roundId,
    JSON.stringify(exportedGames));
  check('the export carries the caller’s own answer as canonical ids',
    exportedGames[0].yourAnswers.length === 1 && exportedGames[0].yourAnswers[0].choice === 'a'
      && QUESTION_IDS.includes(exportedGames[0].yourAnswers[0].questionId), JSON.stringify(exportedGames[0].yourAnswers));
  check('the export records who started the round', exportedGames[0].startedByYou === true);
  check('the export never carries the counterpart’s picks',
    !/theirAnswers|otherAnswers/.test(JSON.stringify(exportedGames)) && exportedGames[0].yourAnswers.length === 1);
  check('the export says so in plain words',
    (r.data.data?.notes || []).some((note) => /your own picks only/i.test(note)), JSON.stringify(r.data.data?.notes));

  section('Account deletion erases the rounds with the conversation');
  check('the round and its answers exist before deletion', (await rounds()).length === 1 && (await answers(doomed.roundId)).length === 2);
  r = await call('/api/account', 'a', { action: 'delete', confirm: 'DELETE' });
  check('the account is deleted', r.status === 200, JSON.stringify(r.data));
  check('the round row is gone', (await rounds()).length === 0);
  check('every answer is gone', (await sql('SELECT count(*)::int AS n FROM game_answers')).rows[0].n === 0);

  // ------------------------------------------------------------------ P
  section('P — one canonical round, whichever language each participant reads it in');
  await matchedPair();
  await seedRow('users', ['900000001'], { locale: 'fr' });
  await seedRow('users', ['900000002'], { locale: 'de' });
  const shared = (await start('a')).data.round;
  const frenchView = await call('/api/messages', 'a', { action: 'game_state', conversationId: CID, lang: 'fr' });
  const germanView = await call('/api/messages', 'b', { action: 'game_state', conversationId: CID, lang: 'de' });
  check('both participants are in the same round', frenchView.data.round.roundId === germanView.data.round.roundId);
  check('both see the same canonical question ids in the same order',
    JSON.stringify(frenchView.data.round.questions.map((q) => q.id)) === JSON.stringify(germanView.data.round.questions.map((q) => q.id)),
    JSON.stringify([frenchView.data.round.questions.map((q) => q.id), germanView.data.round.questions.map((q) => q.id)]));
  check('the API publishes ids, never display text',
    frenchView.data.round.questions.every((q) => QUESTION_IDS.includes(q.id) && Object.keys(q).sort().join(',') === 'id,mine,revealed,theirAnswered,theirs'),
    JSON.stringify(frenchView.data.round.questions[0]));
  check('no localized label is persisted with the round',
    (await rounds())[0].questions.every((id) => QUESTION_IDS.includes(id)));
  r = await answer('a', shared.roundId, shared.questions[0].id, 'a');
  check('an answer made in French is an option id', (await answers(shared.roundId))[0].choice === 'a');
  r = await answer('b', shared.roundId, shared.questions[0].id, 'a');
  check('the German reader answering the same canonical question reveals it',
    r.data.round.questions[0].revealed === true && r.data.round.questions[0].theirs === 'a');

  section('Every bank question is playable, and only bank questions are');
  await matchedPair();
  await start('a');
  // Coverage is a property of the selector, so it is exercised directly: hammering the API
  // for it would only prove that the anti-abuse limiter works, which is tested elsewhere.
  const reachable = new Set();
  for (let i = 0; i < 400 && reachable.size < QUESTION_IDS.length; i++) for (const id of selectQuestions()) reachable.add(id);
  check('selection can reach every question in the bank', reachable.size === QUESTION_IDS.length,
    QUESTION_IDS.filter((id) => !reachable.has(id)).join(','));
  check('the database refuses a round that is not five questions', await (async () => {
    try {
      await sql(`INSERT INTO game_rounds (round_id, conversation_id, game, initiator_id, questions, status, completed_at, created_at)
                 VALUES ('short', $1, 'this_or_that', 900000001, $2, 'completed', now(), now())`, [CID, QUESTION_IDS.slice(0, 3)]);
      return false;
    } catch { return true; }
  })());
  check('the database refuses a completed round with no completion time', await (async () => {
    try {
      await sql(`INSERT INTO game_rounds (round_id, conversation_id, game, initiator_id, questions, status, created_at)
                 VALUES ('nocompletion', $1, 'this_or_that', 900000001, $2, 'completed', now())`, [CID, QUESTION_IDS.slice(0, 5)]);
      return false;
    } catch { return true; }
  })());
  check('the database refuses a choice that is not an option id', await (async () => {
    const current = (await rounds())[0];
    try {
      await sql(`INSERT INTO game_answers (round_id, question_id, user_id, choice, created_at)
                 VALUES ($1, $2, 900000001, 'z', now())`, [current.round_id, current.questions[0]]);
      return false;
    } catch { return true; }
  })());
} catch (error) {
  fail++;
  failures.push(`suite error: ${error?.message || error}`);
  console.error(error);
} finally {
  await resetTestData();
  await harness.close();
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (fail) {
  console.log(`Failed:\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
process.exit(0);
