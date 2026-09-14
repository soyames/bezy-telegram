import crypto from 'node:crypto';
import { ApiError } from './_db.js';
import { GAME_ID, isQuestionId, isChoice, selectQuestions, roundView } from './_thisorthat.js';

// Bezy — post-match conversation game (THIS OR THAT).
//
// The game is a capability OF a conversation, not a separate product — and it is served by
// the conversation's own route rather than one of its own. api/messages.js dispatches the
// `game_*` actions here and hands in the conversation gate, which is the one authorization
// chain the product has: the caller comes from validated Telegram initData, the counterpart
// is derived from the conversation id, and the match, the block mirrors, the reciprocal
// likes, the processing-restriction state, the age declaration and the Premium entitlement
// are all re-verified inside a transaction that holds the match row. Nothing about the game
// can outlive a block, an unmatch, a closed conversation or a lapsed membership, because
// none of it is checked here — it is checked there, once, for messaging and the game alike.
//
// The gate is injected rather than imported so that this module and api/messages.js do not
// import each other. That also keeps the game off the route table: an `_`-prefixed module is
// not a serverless function, and the deployment has a hard 12-function ceiling.
//
// Three rules the code below exists to enforce:
//
//   1. ANTI-PEEKING. The counterpart's choice for a question is never SELECTed until the
//      caller has answered that same question. The redaction is in the SQL, not in the
//      response mapper and certainly not in the Mini App, so an unrevealed answer is never
//      in the response at all.
//   2. ONE ACTIVE ROUND. Creation is idempotent: the match-row lock serializes concurrent
//      "Start" taps and a partial unique index is the database-level backstop.
//   3. A FINALIZED ANSWER IS FINAL. One row per (round, question, participant), inserted
//      with ON CONFLICT DO NOTHING; resubmitting the same choice is a safe retry, submitting
//      a different one is refused and changes nothing.

const MAX_CONVERSATION_ID = 64;

/** A round the caller may not touch answers with — unknown, stale, or not theirs. */
function gameUnavailable() {
  return new ApiError('GAME_UNAVAILABLE', 404);
}

async function readRound(q, conversationId) {
  const result = await q(
    `SELECT round_id, conversation_id, game, initiator_id, questions, status, created_at, completed_at
       FROM game_rounds WHERE conversation_id = $1 AND game = $2
      ORDER BY created_at DESC, round_id DESC LIMIT 1`,
    [conversationId, GAME_ID]
  );
  return result.rows[0] || null;
}

/**
 * Loads one round as the caller is allowed to see it.
 *
 * Two reads, deliberately asymmetric:
 *   - the caller's own answers, in full;
 *   - the counterpart's answers with the choice column NULLed for every question the caller
 *     has not answered yet. The row still tells us THAT they answered (which is what the
 *     waiting state needs) without disclosing WHICH option they picked.
 */
async function viewOf(q, round, me) {
  if (!round) return null;
  const mine = await q('SELECT question_id, choice FROM game_answers WHERE round_id = $1 AND user_id = $2', [round.round_id, me]);
  const theirs = await q(
    `SELECT ga.question_id,
            CASE WHEN EXISTS (
              SELECT 1 FROM game_answers own
               WHERE own.round_id = ga.round_id AND own.question_id = ga.question_id AND own.user_id = $2
            ) THEN ga.choice END AS choice
       FROM game_answers ga
      WHERE ga.round_id = $1 AND ga.user_id <> $2`,
    [round.round_id, me]
  );
  const myAnswers = new Map(mine.rows.map((row) => [String(row.question_id), String(row.choice)]));
  const theirAnswers = new Map(theirs.rows.filter((row) => row.choice).map((row) => [String(row.question_id), String(row.choice)]));
  const theirAnswered = new Set(theirs.rows.map((row) => String(row.question_id)));
  return roundView(round, me, myAnswers, theirAnswers, theirAnswered);
}

function conversationIdOf(req) {
  const value = String(req.body?.conversationId || '');
  if (value.length > MAX_CONVERSATION_ID) throw new ApiError('CONVERSATION_UNAVAILABLE', 404);
  return value;
}

/** The current round of a conversation, or null when there has never been one. */
async function readState(req, res, user, { inConversation }) {
  const conversationId = conversationIdOf(req);
  const round = await inConversation(user, conversationId, async (q, context) => {
    const current = await readRound(q, conversationId);
    return viewOf(q, current, context.me);
  });
  return res.status(200).json({ ok: true, conversationId, game: GAME_ID, round });
}

/**
 * Starts a round — idempotently. The match-row lock taken by inConversation() serializes
 * every conversation write for the pair, so two simultaneous taps (or both participants
 * starting at once) resolve to the same single active round; the partial unique index
 * `game_rounds_active_idx` is the database's own guarantee of the same invariant.
 */
async function startRound(req, res, user, { inConversation, ensureConversation }) {
  const conversationId = conversationIdOf(req);
  const round = await inConversation(user, conversationId, async (q, context) => {
    const current = await readRound(q, conversationId);
    // An unfinished round is the answer to "start a round": never a second, competing one.
    if (current && current.status === 'active') return viewOf(q, current, context.me);

    // The conversation row may not exist yet — a match can open its first round before its
    // first message. Same lazy creation the message path uses (and the FK that carries
    // erasure: deleting the conversation deletes its rounds and answers).
    await ensureConversation(q, conversationId);
    const questions = selectQuestions(current?.questions || []);
    const inserted = await q(
      `INSERT INTO game_rounds (round_id, conversation_id, game, initiator_id, questions, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'active', now())
       ON CONFLICT DO NOTHING
       RETURNING round_id, conversation_id, game, initiator_id, questions, status, created_at, completed_at`,
      [crypto.randomUUID(), conversationId, GAME_ID, context.me, questions]
    );
    // DO NOTHING means the unique index caught a concurrent creation: adopt the winner.
    const created = inserted.rows[0] || await readRound(q, conversationId);
    return viewOf(q, created, context.me);
  });
  return res.status(200).json({ ok: true, conversationId, game: GAME_ID, round });
}

/**
 * Records one answer. The choice becomes final the moment it is stored: a repeat of the same
 * choice is an idempotent retry, a different choice is refused with ANSWER_FINAL and the
 * stored answer is returned untouched, so no one can revise a pick after seeing the reveal.
 */
async function submitAnswer(req, res, user, { inConversation }) {
  const conversationId = conversationIdOf(req);
  const roundId = String(req.body?.roundId || '');
  const questionId = String(req.body?.questionId || '');
  const choice = String(req.body?.choice || '');
  if (!roundId || roundId.length > 64 || !isQuestionId(questionId) || !isChoice(choice)) {
    return res.status(400).json({ error: 'INVALID_ACTION' });
  }

  const result = await inConversation(user, conversationId, async (q, context) => {
    const current = await readRound(q, conversationId);
    // The round must be THIS conversation's current round: a round id belonging to another
    // couple answers exactly like an unknown one.
    if (!current || String(current.round_id) !== roundId) throw gameUnavailable();
    if (current.status !== 'active') throw gameUnavailable();
    if (!(current.questions || []).includes(questionId)) throw gameUnavailable();

    await q(
      `INSERT INTO game_answers (round_id, question_id, user_id, choice, created_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (round_id, question_id, user_id) DO NOTHING`,
      [roundId, questionId, context.me, choice]
    );
    const stored = await q(
      'SELECT choice FROM game_answers WHERE round_id = $1 AND question_id = $2 AND user_id = $3',
      [roundId, questionId, context.me]
    );
    const finalChoice = String(stored.rows[0]?.choice || '');
    const conflict = finalChoice !== choice;

    // Completion is derived from the answers themselves, inside the same serialized
    // transaction, and the guarded UPDATE makes the transition happen exactly once.
    const counted = await q('SELECT count(*)::int AS answered FROM game_answers WHERE round_id = $1', [roundId]);
    if (counted.rows[0].answered >= (current.questions || []).length * 2) {
      await q("UPDATE game_rounds SET status = 'completed', completed_at = now() WHERE round_id = $1 AND status = 'active'", [roundId]);
    }
    const refreshed = await readRound(q, conversationId);
    return { conflict, round: await viewOf(q, refreshed, context.me) };
  });

  if (result.conflict) return res.status(409).json({ error: 'ANSWER_FINAL', round: result.round });
  return res.status(200).json({ ok: true, conversationId, game: GAME_ID, round: result.round });
}

/**
 * The game actions of the conversation route. They are namespaced rather than plain
 * (`game_start`, not `start`) so they can never collide with a messaging action.
 */
export const GAME_ACTIONS = ['game_state', 'game_start', 'game_answer'];

/**
 * Reads ride the conversation polling loop, so they get the looser bucket; starting a round
 * and answering write rows and get the tighter one. The game keeps its own buckets: polling
 * a round must never consume someone's ability to send a message.
 */
export function gameRateLimitBucket(action) {
  return action === 'game_state' ? 'game_read' : 'game';
}

/**
 * Dispatches one game action. `gate` carries the conversation authorization chain
 * (`inConversation`, `ensureConversation`) from api/messages.js — injected, so the two
 * modules never import each other, and so there is visibly only ONE gate.
 *
 * Throws typed errors; api/messages.js's handler maps them, exactly as it does for
 * messaging, so a database or driver detail never reaches the browser.
 */
export function handleGameAction(action, req, res, user, gate) {
  if (action === 'game_state') return readState(req, res, user, gate);
  if (action === 'game_start') return startRound(req, res, user, gate);
  return submitAnswer(req, res, user, gate);
}
