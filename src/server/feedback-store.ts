import {
  answered, cleanAnswers, cleanContext, cleanSuggestion,
  QUESTIONS, type FeedbackAnswers, type FeedbackContext,
} from '../game/feedback.js';

/**
 * What a filled-in form is, on the store's side of the wire.
 *
 * Built the same way the board is, and for the same two reasons. Every command
 * it needs is named on `FeedbackStore` rather than reached for through a Redis
 * client, so the whole path can be tested with no network and backed by a map
 * while `npm run dev` is running. And the rules live here rather than in
 * `api/feedback.ts`, so the endpoint is a translation from a request to a call
 * and nothing else.
 *
 * The questions themselves are not restated here. They are imported from
 * `game/feedback.ts`, which is the list the form was drawn from — a second copy
 * would let the browser offer a choice the endpoint throws away, and the only
 * sign of it would be a column of blanks in a spreadsheet weeks later.
 */

/**
 * Forms allowed from one address an hour.
 *
 * Far below the board's hundred and twenty, because the shapes are different: an
 * innings is played over and over by the same person and a questionnaire is
 * answered once, twice if they change their mind. Ten leaves room for a family
 * on one connection and for somebody filling it in badly and starting again, and
 * it is nowhere near enough to be worth automating.
 */
export const FEEDBACK_RATE_LIMIT = 10;
export const FEEDBACK_RATE_WINDOW_SECONDS = 3600;

/**
 * How many answers are kept. The list is trimmed on every write, so the store
 * holds the most recent two thousand and cannot grow without limit on a free
 * tier — and two thousand answered questionnaires is a quantity of feedback
 * nobody has read to the end of.
 */
export const FEEDBACK_KEPT = 2000;

/** A form as it is kept: what was said, who by, and when the store stamped it. */
export interface StoredFeedback {
  /** The store's clock, never the browser's. */
  at: number;
  /** The browser's player id where there is one, so repeat answers can be seen. */
  playerId: string;
  answers: FeedbackAnswers;
  suggestion: string;
  context: FeedbackContext;
}

/** Everything the questionnaire needs from whatever is keeping it. */
export interface FeedbackStore {
  /** Keeps one form, and drops the oldest once the list is full. */
  save(entry: StoredFeedback): Promise<void>;
  /** The most recent `limit` forms, newest first. */
  read(limit: number): Promise<StoredFeedback[]>;
  /** How many forms this address has sent inside the window, counting this one. */
  hits(address: string, windowSeconds: number): Promise<number>;
}

/** A form as it arrives: nothing in it is trusted, and nothing in it is typed. */
export interface FeedbackInput {
  playerId: unknown;
  answers: unknown;
  suggestion: unknown;
  context: unknown;
  /** Whoever the edge says is asking. Used to rate limit, never as identity. */
  address: string;
}

export type FeedbackOutcome =
  | { ok: true; at: number }
  | { ok: false; status: number; reason: string };

/** Whether the form was turned down. A predicate for the same reason the board's is. */
export function refusedFeedback(outcome: FeedbackOutcome): outcome is { ok: false; status: number; reason: string } {
  return !outcome.ok;
}

/**
 * A submitted form, cleaned and kept.
 *
 * The order is the board's order and it is deliberate: the rate limit first, so
 * a script pays nothing to be turned away, then the cleaning, then the question
 * of whether anything was actually said. The clock is read here and nowhere
 * else — a browser's clock is wrong often enough that letting it stamp its own
 * submission would put yesterday's answers at the top of the list.
 *
 * Nothing is ever rejected for being the wrong answer. A form that arrives with
 * one question answered and the rest skipped is kept as it is: somebody who
 * tapped once and left has told you something, and turning it away to insist on
 * the whole questionnaire would lose the only thing they were willing to say.
 */
export async function takeFeedback(
  store: FeedbackStore, input: FeedbackInput, now = Date.now(),
): Promise<FeedbackOutcome> {
  if (await store.hits(input.address, FEEDBACK_RATE_WINDOW_SECONDS) > FEEDBACK_RATE_LIMIT) {
    return { ok: false, status: 429, reason: 'Thanks — that is plenty from here for one hour.' };
  }
  const answers = cleanAnswers(input.answers);
  const suggestion = cleanSuggestion(input.suggestion);
  if (!answered(answers, suggestion)) {
    return { ok: false, status: 400, reason: 'Nothing was answered.' };
  }
  await store.save({
    at: now,
    playerId: cleanPlayerId(input.playerId),
    answers,
    suggestion,
    context: cleanContext(input.context),
  });
  return { ok: true, at: now };
}

/**
 * The player id, if it looks like one this game minted.
 *
 * Not an identity and not checked as one — it is here so that the same browser
 * answering twice can be seen as one person changing their mind rather than two
 * people agreeing. Anything that does not have the shape is dropped instead of
 * stored, because a junk id in a column is worse than an empty one.
 */
export function cleanPlayerId(raw: unknown): string {
  return typeof raw === 'string' && /^[0-9a-z]{6,10}-[0-9a-z]{12,}$/.test(raw) ? raw : '';
}

/** The columns a sheet gets, in order: when, who, every question, then the words. */
const CONTEXT_COLUMNS = ['mode', 'runs', 'balls', 'best', 'innings', 'days', 'device', 'link'] as const;

/**
 * The answers as a spreadsheet.
 *
 * CSV rather than JSON because of what happens to it next: this is read by one
 * person, once a week, by pasting it into a spreadsheet and sorting a column.
 * One row per form, one column per question, the multi-pick question's choices
 * joined by a space — so counting how many people asked for a bowling mode is a
 * filter rather than a program.
 *
 * Every field is quoted and every quote inside one is doubled, which is the
 * whole of the CSV escaping rule. The suggestion is the only field anybody typed
 * and it is also the only one that could carry a comma, a quote or a leading
 * `=` that a spreadsheet would read as a formula — so it is prefixed with a
 * quote character when it starts with one of those, which is what stops a
 * suggestion being executed by the program that opens it.
 */
export function feedbackCsv(entries: readonly StoredFeedback[]): string {
  const questions = QUESTIONS.map(question => question.id);
  const header = ['at', 'playerId', ...questions, 'suggestion', ...CONTEXT_COLUMNS];
  const rows = entries.map(entry => [
    new Date(entry.at).toISOString(),
    entry.playerId,
    ...questions.map(id => (entry.answers[id] ?? []).join(' ')),
    entry.suggestion,
    ...CONTEXT_COLUMNS.map(key => {
      const value = entry.context[key];
      return value === undefined ? '' : String(value);
    }),
  ]);
  return [header, ...rows].map(row => row.map(cell).join(',')).join('\n');
}

/** One CSV field: quoted, escaped, and defused if a spreadsheet would run it. */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
