import type { Rating, RatedThing } from './rating';

/**
 * The questionnaire, as data.
 *
 * Every question is a tap. That is the whole design rule and it decides most of
 * what is here: a form that asks somebody to type is a form somebody fills in on
 * a laptop later, which is to say never, and the people worth hearing from are
 * on a phone with one thumb free and an innings they have just lost. So there
 * are chips and one optional box at the end, and nothing between them.
 *
 * Nothing is asked that the page already knows. The mode played, the runs, the
 * balls faced, how many days this browser has come back — all of that rides
 * along as context rather than costing a screen, because a question whose answer
 * is already on the machine is a question that only buys a worse answer.
 *
 * The file is pure and imports nothing from the game, for the same reason
 * `leaderboard.ts` is: the server validates a submission against this same list,
 * so the browser and the endpoint can never disagree about what a valid answer
 * is. A second copy of the choices in `api/` would drift within a week.
 */

/** One tappable answer. The id is what is stored; the label is what is read. */
export interface Choice {
  id: string;
  label: string;
}

export interface Question {
  /** Short, because it is a column heading in the CSV that comes back out. */
  id: string;
  ask: string;
  /**
   * The same question asked of a thumb rather than a keyboard. Only the
   * controls question needs it, and it needs it badly: asking a phone player
   * whether the *keys* came out right is asking about a game they did not play.
   */
  touchAsk?: string;
  choices: readonly Choice[];
  /** How many may be picked. One unless it says otherwise. */
  pick?: number;
  /**
   * Who gets asked. `played` and `unplayed` are the two halves of the standalone
   * link: somebody who followed it from a friend and has never batted cannot
   * have an opinion on the timing window, and pretending otherwise fills the
   * answers with noise. `link` is the pair of questions the game itself already
   * knows the answer to. `rated` is never on the questionnaire: it is asked
   * only after a star rating, of the thing rated, and only at the marks named.
   */
  who?: 'all' | 'link' | 'played' | 'unplayed' | 'rated';
  /** For a `rated` question: which things it is asked about. Every one, if absent. */
  about?: readonly RatedThing[];
  /** For a `rated` question: the lowest and highest star it follows. */
  stars?: readonly [number, number];
}

/** How long the one thing anybody types may be. */
export const SUGGESTION_MAX = 280;

/**
 * The gate, and the only question whose answer changes which questions follow.
 * It is asked on the shared link and nowhere else — in the game, the answer is
 * that they are mid-innings.
 */
export const PLAYED = 'played';

export const QUESTIONS: readonly Question[] = [
  {
    id: PLAYED,
    ask: 'Have you played it yet?',
    who: 'link',
    choices: [
      { id: 'innings', label: 'Played a full innings' },
      { id: 'opened', label: 'Opened it, didn’t finish' },
      { id: 'no', label: 'Not yet' },
    ],
  },
  {
    id: 'source',
    ask: 'Where did you come from?',
    who: 'link',
    choices: [
      { id: 'friend', label: 'A friend sent it' },
      { id: 'social', label: 'Social post' },
      { id: 'search', label: 'Search' },
      { id: 'mine', label: 'I built it' },
      { id: 'other', label: 'Somewhere else' },
    ],
  },
  {
    id: 'fun',
    ask: 'Honestly, how much fun was that?',
    who: 'played',
    choices: [
      { id: '1', label: 'Not really' },
      { id: '2', label: 'It’s okay' },
      { id: '3', label: 'Good fun' },
      { id: '4', label: 'Loved it' },
      { id: '5', label: 'Couldn’t stop' },
    ],
  },
  {
    id: 'hard',
    ask: 'How hard did it feel?',
    who: 'played',
    choices: [
      { id: 'easy', label: 'Too easy' },
      { id: 'right', label: 'About right' },
      { id: 'fair', label: 'Tough but fair' },
      { id: 'hard', label: 'Too hard' },
      { id: 'brutal', label: 'Couldn’t middle a thing' },
    ],
  },
  {
    id: 'controls',
    ask: 'Did the keys play the shot you meant?',
    touchAsk: 'Did your swipes play the shot you meant?',
    who: 'played',
    choices: [
      { id: 'always', label: 'Every time' },
      { id: 'mostly', label: 'Mostly' },
      { id: 'half', label: 'About half' },
      { id: 'rarely', label: 'Rarely' },
    ],
  },
  {
    id: 'letdown',
    ask: 'What let you down most?',
    who: 'played',
    choices: [
      { id: 'timing', label: 'Timing the swing' },
      { id: 'line', label: 'Reading the line' },
      { id: 'view', label: 'Seeing the pitch' },
      { id: 'speed', label: 'Loading or stutter' },
      { id: 'sound', label: 'Sound' },
      { id: 'none', label: 'Nothing really' },
    ],
  },
  {
    id: 'shot',
    ask: 'Which shot felt best to play?',
    who: 'played',
    choices: [
      { id: 'straight', label: 'Straight drive' },
      { id: 'cover', label: 'Cover drive' },
      { id: 'leg', label: 'Leg side' },
      { id: 'cut', label: 'Square cut' },
      { id: 'block', label: 'The block' },
      { id: 'none', label: 'None of them' },
    ],
  },
  {
    id: 'return',
    ask: 'Would you come back tomorrow?',
    who: 'played',
    choices: [
      { id: 'yes', label: 'Definitely' },
      { id: 'maybe', label: 'Maybe' },
      { id: 'no', label: 'Probably not' },
    ],
  },
  {
    id: 'tell',
    ask: 'Would you send it to a friend?',
    who: 'played',
    choices: [
      { id: 'did', label: 'Already did' },
      { id: 'yes', label: 'Yes' },
      { id: 'maybe', label: 'Maybe' },
      { id: 'no', label: 'No' },
    ],
  },
  {
    /**
     * The one question that takes two answers, because it is the only one where
     * the second choice is worth as much as the first: what somebody wants next
     * is a shortlist, not a winner, and forcing it to one turns every answer
     * into whatever was nearest the thumb.
     */
    id: 'next',
    ask: 'What would you want next?',
    who: 'played',
    pick: 2,
    choices: [
      { id: 'overs', label: 'More overs' },
      { id: 'bowl', label: 'Bowl as well as bat' },
      { id: 'versus', label: 'Head-to-head with a friend' },
      { id: 'shots', label: 'More shots' },
      { id: 'career', label: 'A season or career' },
      { id: 'looks', label: 'Better looks' },
      { id: 'simple', label: 'Keep it simple' },
    ],
  },
  {
    id: 'tempt',
    ask: 'What would get you to have a go?',
    who: 'unplayed',
    choices: [
      { id: 'now', label: 'Nothing — I’ll play now' },
      { id: 'score', label: 'Seeing a friend’s score' },
      { id: 'quick', label: 'Knowing it’s two minutes' },
      { id: 'looks', label: 'If it looked better' },
      { id: 'cricket', label: 'I don’t like cricket' },
    ],
  },
];

/**
 * What follows a star rating, when the player asks to say more.
 *
 * Three or four screens, never the ten: somebody who has just rated has said the
 * most important thing already, and the follow-up is there to find out *why*.
 * Which questions depend on the stars — a low mark is asked what went wrong, a
 * middling one what would make it a five, a high one what to build next — and
 * then on the thing rated, because a question about a Marathon's length is
 * nonsense put to somebody rating Rival Matches.
 */
export const FOLLOW_UPS: readonly Question[] = [
  {
    id: 'wrong',
    ask: 'What let you down?',
    who: 'rated',
    stars: [1, 2],
    pick: 2,
    choices: [
      { id: 'timing', label: 'Timing the swing' },
      { id: 'controls', label: 'The controls' },
      { id: 'hard', label: 'Too hard' },
      { id: 'easy', label: 'Too easy' },
      { id: 'long', label: 'Too long' },
      { id: 'rules', label: 'Didn’t get the rules' },
      { id: 'speed', label: 'Loading or stutter' },
      { id: 'dull', label: 'Not much happens' },
    ],
  },
  {
    id: 'five',
    ask: 'What would make it a five?',
    who: 'rated',
    stars: [3, 3],
    pick: 2,
    choices: [
      { id: 'variety', label: 'More variety' },
      { id: 'controls', label: 'Better controls' },
      { id: 'easier', label: 'A bit easier' },
      { id: 'harder', label: 'A bit harder' },
      { id: 'shorter', label: 'Shorter' },
      { id: 'clearer', label: 'Clearer rules' },
      { id: 'rewards', label: 'More to earn' },
      { id: 'looks', label: 'Better looks' },
    ],
  },
  {
    id: 'build',
    ask: 'What should we build next?',
    who: 'rated',
    stars: [4, 5],
    pick: 2,
    choices: [
      { id: 'bowl', label: 'Bowl as well as bat' },
      { id: 'versus', label: 'Live head-to-head' },
      { id: 'shots', label: 'More shots' },
      { id: 'season', label: 'A season or tournament' },
      { id: 'teams', label: 'Pick a team' },
      { id: 'looks', label: 'Better looks' },
      { id: 'more', label: 'Just more of this' },
    ],
  },
  {
    id: 'mlength',
    ask: 'How did the length of a Marathon feel?',
    who: 'rated',
    about: ['marathon'],
    choices: [
      { id: 'short', label: 'Too short' },
      { id: 'right', label: 'About right' },
      { id: 'long', label: 'A bit long' },
      { id: 'toolong', label: 'Far too long' },
    ],
  },
  {
    id: 'mbest',
    ask: 'What made the Marathon?',
    who: 'rated',
    about: ['marathon'],
    pick: 2,
    choices: [
      { id: 'side', label: 'Batting a whole side' },
      { id: 'focus', label: 'The Focus meter' },
      { id: 'bowlers', label: 'Bowlers changing it up' },
      { id: 'declare', label: 'Choosing when to declare' },
      { id: 'card', label: 'The scorecard at the end' },
      { id: 'none', label: 'Nothing stood out' },
    ],
  },
  {
    id: 'sblows',
    ask: 'How did taking blows feel?',
    who: 'rated',
    about: ['survive'],
    choices: [
      { id: 'fair', label: 'Tough but fair' },
      { id: 'harsh', label: 'Too punishing' },
      { id: 'soft', label: 'Too soft' },
      { id: 'unseen', label: 'Didn’t notice them' },
    ],
  },
  {
    id: 'slength',
    ask: 'How long did the innings feel?',
    who: 'rated',
    about: ['survive'],
    choices: [
      { id: 'short', label: 'Over too soon' },
      { id: 'right', label: 'About right' },
      { id: 'long', label: 'Dragged on' },
    ],
  },
  {
    id: 'rfair',
    ask: 'Did the match feel fair?',
    who: 'rated',
    about: ['rivals'],
    choices: [
      { id: 'yes', label: 'Yes' },
      { id: 'mostly', label: 'Mostly' },
      { id: 'no', label: 'Not really' },
    ],
  },
  {
    id: 'rinvite',
    ask: 'How easy was it to get a friend in?',
    who: 'rated',
    about: ['rivals'],
    choices: [
      { id: 'easy', label: 'Easy' },
      { id: 'fiddly', label: 'A bit fiddly' },
      { id: 'gaveup', label: 'Gave up' },
      { id: 'notyet', label: 'Haven’t tried' },
    ],
  },
  {
    id: 'rback',
    ask: 'Would you come back tomorrow?',
    who: 'rated',
    about: ['game', 'classic'],
    choices: [
      { id: 'yes', label: 'Definitely' },
      { id: 'maybe', label: 'Maybe' },
      { id: 'no', label: 'Probably not' },
    ],
  },
];

/** The follow-up to a rating, in order: why the stars, then the thing itself. */
export function followUpFor(thing: RatedThing, stars: number): Question[] {
  return FOLLOW_UPS.filter(question =>
    (!question.about || question.about.includes(thing))
    && (!question.stars || (stars >= question.stars[0] && stars <= question.stars[1])));
}

const BY_ID = new Map([...QUESTIONS, ...FOLLOW_UPS].map(question => [question.id, question]));

/** Every question that can be answered, questionnaire and follow-ups: the columns of the sheet. */
export const ALL_QUESTIONS: readonly Question[] = [...QUESTIONS, ...FOLLOW_UPS];

/** Every answer given, as question id to the choice ids picked. */
export type FeedbackAnswers = Record<string, string[]>;

/**
 * What rides along without being asked. Every field is optional because the
 * standalone link knows almost none of it, and a form that refused to send
 * without an innings behind it would be a form a friend cannot fill in.
 */
export interface FeedbackContext {
  /** Which innings they last played, or nothing where they have not. */
  mode?: string;
  runs?: number;
  balls?: number;
  best?: number;
  /** Innings played in this session, and separate days this browser has visited. */
  innings?: number;
  days?: number;
  device?: 'touch' | 'keyboard';
  /** Whether this came from the shared link rather than from inside the game. */
  link?: boolean;
}

export interface Asked {
  /** The standalone form, which has to establish whether they have played. */
  standalone: boolean;
  /** Whether they have batted. Null on the link until the gate is answered. */
  played: boolean | null;
  touch: boolean;
}

/**
 * The questions to put, in order.
 *
 * On the link the gate comes back alone until it is answered, which is what
 * makes the branch possible: the form asks one question, learns whether it is
 * talking to a player or to somebody's curious friend, and then knows the rest
 * of its own length. Inside the game there is no branch and no gate — the
 * player is a player, and asking them to confirm it would be the worst possible
 * first question.
 */
export function questionsFor({ standalone, played, touch: _touch }: Asked): Question[] {
  if (!standalone) return QUESTIONS.filter(question => question.who === 'played' || !question.who || question.who === 'all');
  if (played === null) return QUESTIONS.filter(question => question.id === PLAYED);
  return QUESTIONS.filter(question => {
    if (question.who === 'link') return true;
    if (question.who === 'played') return played;
    if (question.who === 'unplayed') return !played;
    return true;
  });
}

/** How a question is put on this device. */
export function askOf(question: Question, touch: boolean): string {
  return touch && question.touchAsk ? question.touchAsk : question.ask;
}

/** Whether an answer to the gate means they have batted. */
export function playedFrom(answer: string | undefined): boolean {
  return answer === 'innings' || answer === 'opened';
}

/**
 * The answers, with everything the form did not offer thrown away.
 *
 * Run in the browser before sending and again in the endpoint before storing,
 * against the same list — so an answer that got there by any other route than
 * tapping a chip is dropped rather than stored. Unknown questions, unknown
 * choices, duplicates and picks past the limit all go the same way. It is the
 * reason a question id can be a CSV column heading without anybody worrying
 * about what is under it.
 */
export function cleanAnswers(raw: unknown): FeedbackAnswers {
  const from = (raw ?? {}) as Record<string, unknown>;
  const answers: FeedbackAnswers = {};
  for (const [id, value] of Object.entries(from)) {
    const question = BY_ID.get(id);
    if (!question) continue;
    const offered = new Set(question.choices.map(choice => choice.id));
    const picked = (Array.isArray(value) ? value : [value])
      .filter((one): one is string => typeof one === 'string' && offered.has(one));
    const kept = [...new Set(picked)].slice(0, question.pick ?? 1);
    if (kept.length) answers[id] = kept;
  }
  return answers;
}

/**
 * The one thing anybody types, made safe to keep and to read back.
 *
 * Control characters and the invisible formatting marks go — the same set
 * `cleanName` strips, and for the same reason: a directional override in a
 * suggestion turns the rest of a spreadsheet row around. Line breaks collapse to
 * spaces because the box is one line and a CSV cell is happier without them.
 *
 * Nothing here is an escape for HTML, deliberately. A suggestion is never
 * rendered into a page by this game — it is written to the store and read back
 * as a spreadsheet — and a value that is never put in a document cannot be an
 * injection into one. Anything that ever does show one on screen has to escape
 * it there, where the document is.
 */
export function cleanSuggestion(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SUGGESTION_MAX);
}

/** The context, coerced. Only these fields, and every number a sane one. */
export function cleanContext(raw: unknown): FeedbackContext {
  const from = (raw ?? {}) as Record<string, unknown>;
  const context: FeedbackContext = {};
  const mode = String(from.mode ?? '').toLowerCase();
  if (mode === 'classic' || mode === 'survive' || mode === 'marathon') context.mode = mode;
  for (const key of ['runs', 'balls', 'best', 'innings', 'days'] as const) {
    const value = Number(from[key]);
    // A figure that is not a figure is left out rather than stored as zero: a
    // missing innings and a duck are different things and must not become one.
    if (Number.isFinite(value) && value >= 0) context[key] = Math.min(9999, Math.floor(value));
  }
  if (from.device === 'touch' || from.device === 'keyboard') context.device = from.device;
  if (from.link === true) context.link = true;
  return context;
}

/** Whether anything was actually said. An empty form is not a submission; a star is. */
export function answered(answers: FeedbackAnswers, suggestion: string, rating: Rating | null = null): boolean {
  return Object.keys(answers).length > 0 || suggestion.length > 0 || rating !== null;
}

/** Where this browser remembers having had its say. */
export const FEEDBACK_KEY = 'hitman-feedback';

/**
 * Whether they have already answered. Asking twice is how a quiet link at the
 * foot of a card turns into nagging, so once it is answered the game stops
 * offering — and a browser that cannot remember is treated as one that has not
 * answered, because the alternative is silently never asking at all.
 */
export function feedbackGiven(): boolean {
  try { return localStorage.getItem(FEEDBACK_KEY) === '1'; } catch { return false; }
}

export function markFeedbackGiven() {
  try { localStorage.setItem(FEEDBACK_KEY, '1'); } catch { /* Then it asks again one day. */ }
}

/**
 * Whether this page load is the shared form rather than the game.
 *
 * Two spellings, and both are load-bearing. `/feedback` is the one written on
 * the link that gets sent to people, and it exists because Vercel rewrites it to
 * the same page. `?feedback=1` is the one that works everywhere else — the dev
 * server, a Pages build, a one-file preview — none of which has a rewrite rule
 * in front of it.
 */
export function feedbackRoute(where: { pathname: string; search: string }): boolean {
  if (/(^|\/)feedback\/?$/.test(where.pathname)) return true;
  return new URLSearchParams(where.search).get('feedback') === '1';
}
