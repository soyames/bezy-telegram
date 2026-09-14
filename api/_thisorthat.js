// Bezy — THIS OR THAT: the canonical question bank and the pure round logic.
//
// This is the first optional post-match conversation game. It is not a gamification system:
// there are no points, no streaks, no timers, no ranking and no compatibility score. Two
// people who already matched answer the same five small questions and then see each other's
// picks, which is a reason to talk — nothing more is claimed.
//
// Two rules govern everything in this file:
//
//   1. A question is a MACHINE IDENTIFIER. Only the id and the chosen option id ('a' | 'b')
//      are ever persisted or exchanged. The displayed text lives in the Mini App locale
//      catalogues under `tot_q_<id>_a` / `tot_q_<id>_b`, so two participants reading Bezy in
//      different languages take part in exactly the same canonical round, each in their own
//      language. Nothing here is translated, and nothing here reaches an LLM or the
//      translation provider — the value comes from the two people, not from generated text.
//
//   2. Answers are never interpreted. The bank is organized by category purely so it can be
//      curated and extended; a category is a content tag, never a psychological
//      classification, and it is not exposed to the client.
//
// Sensitive territory is deliberately absent: no religion, politics, ethnicity, health,
// sexual history, income, trauma, immigration or criminal-history questions, and nothing
// explicit. Alcohol is avoided too — the bank has to work for a global audience.

export const GAME_ID = 'this_or_that';

/** Five questions per round: enough to be interesting, short enough to finish in a minute. */
export const ROUND_SIZE = 5;

/** The two option identifiers. Stored as-is; the labels are resolved per viewer locale. */
export const CHOICES = ['a', 'b'];

/**
 * The v1 bank — 30 curated questions. Ids are stable forever: changing one would orphan the
 * answers already stored against it, so a reworded question gets a NEW id.
 */
export const QUESTIONS = [
  { id: 'travel_beach_mountains', category: 'travel' },
  { id: 'travel_city_countryside', category: 'travel' },
  { id: 'travel_planned_spontaneous', category: 'travel' },
  { id: 'travel_window_aisle', category: 'travel' },
  { id: 'travel_sunrise_sunset', category: 'travel' },

  { id: 'food_sweet_salty', category: 'food' },
  { id: 'food_cook_eatout', category: 'food' },
  { id: 'food_coffee_tea', category: 'food' },
  { id: 'food_spicy_mild', category: 'food' },
  { id: 'food_street_restaurant', category: 'food' },

  { id: 'comm_call_text', category: 'communication' },
  { id: 'comm_voice_typed', category: 'communication' },
  { id: 'comm_long_short', category: 'communication' },
  { id: 'comm_reply_now_later', category: 'communication' },

  { id: 'everyday_early_night', category: 'everyday' },
  { id: 'everyday_plan_spontaneous', category: 'everyday' },
  { id: 'everyday_tidy_lived_in', category: 'everyday' },
  { id: 'everyday_walk_ride', category: 'everyday' },
  { id: 'everyday_music_quiet', category: 'everyday' },

  { id: 'leisure_movie_series', category: 'leisure' },
  { id: 'leisure_reading_listening', category: 'leisure' },
  { id: 'leisure_museum_livemusic', category: 'leisure' },
  { id: 'leisure_indoors_outdoors', category: 'leisure' },
  { id: 'leisure_dancing_watching', category: 'leisure' },

  { id: 'social_big_small', category: 'social' },
  { id: 'social_host_guest', category: 'social' },
  { id: 'social_new_familiar', category: 'social' },
  { id: 'social_talk_listen', category: 'social' },

  { id: 'dating_walk_dinner', category: 'dating_light' },
  { id: 'dating_surprise_plan', category: 'dating_light' }
];

export const QUESTION_IDS = QUESTIONS.map((question) => question.id);
const QUESTION_SET = new Set(QUESTION_IDS);

export function isQuestionId(value) {
  return QUESTION_SET.has(String(value ?? ''));
}

export function isChoice(value) {
  return CHOICES.includes(String(value ?? ''));
}

/**
 * Picks `size` distinct question ids, preferring ones that were not in `exclude` (the
 * previous round of the same conversation, so a new round does not immediately repeat
 * itself). The exclusion is a preference, not a constraint: if it would leave too few
 * questions the excluded ones come back rather than the round failing.
 *
 * `random` is injectable so tests can pin the selection; production uses Math.random.
 */
export function selectQuestions(exclude = [], size = ROUND_SIZE, random = Math.random) {
  const excluded = new Set((exclude || []).map(String));
  const fresh = QUESTION_IDS.filter((id) => !excluded.has(id));
  const rest = QUESTION_IDS.filter((id) => excluded.has(id));
  const pool = [...shuffle(fresh, random), ...shuffle(rest, random)];
  return pool.slice(0, Math.min(size, pool.length));
}

function shuffle(values, random) {
  const items = [...values];
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * Builds the round exactly as one participant is allowed to see it.
 *
 * `theirAnswers` must ALREADY be redacted by the caller: api/game.js only ever reads the
 * counterpart's choice for a question the caller has answered, so an unrevealed choice never
 * enters this process at all. This function re-applies the rule anyway — a defence in depth
 * that makes the contract testable on its own: a question is revealed only when BOTH sides
 * have answered it.
 *
 * `theirAnswered` is the set of question ids the counterpart has answered. Knowing that they
 * answered is what drives the waiting state; it never says WHICH option they chose.
 */
export function roundView(round, viewerId, myAnswers = new Map(), theirAnswers = new Map(), theirAnswered = new Set()) {
  const questions = (round.questions || []).map((id) => {
    const mine = myAnswers.get(id) || null;
    const answeredByThem = theirAnswered.has(id);
    const revealed = Boolean(mine) && answeredByThem;
    return {
      id,
      mine,
      // The counterpart's pick exists in the payload only after the viewer has answered.
      theirs: revealed ? (theirAnswers.get(id) || null) : null,
      theirAnswered: answeredByThem,
      revealed
    };
  });
  const completed = round.status === 'completed';
  const mineOutstanding = questions.some((question) => !question.mine);
  return {
    roundId: String(round.round_id),
    game: String(round.game || GAME_ID),
    status: completed ? 'completed' : 'active',
    // A functional state, never a countdown or a nudge.
    state: completed ? 'completed' : (mineOutstanding ? 'your_turn' : 'waiting'),
    startedByMe: String(round.initiator_id) === String(viewerId),
    createdAt: toIso(round.created_at),
    completedAt: toIso(round.completed_at),
    questions,
    // A count of same and different picks — context for a conversation, not a score. It is
    // published only once the round is complete, so it can never leak an unrevealed answer.
    summary: completed ? summarize(questions) : null
  };
}

/** Same / different counts over revealed questions. Never a percentage, never a verdict. */
export function summarize(questions = []) {
  let same = 0;
  let different = 0;
  for (const question of questions) {
    if (!question.revealed || !question.mine || !question.theirs) continue;
    if (question.mine === question.theirs) same++;
    else different++;
  }
  return { same, different };
}

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}
