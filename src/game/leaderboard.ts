import { GAME } from '../config/gameplay';
import type { ScoreManager } from './ScoreManager';

/**
 * How fifty innings are put in order, written once and imported by both sides.
 *
 * The browser runs this to decide whether an innings is worth asking a name for.
 * The store runs it to decide what the board actually is. If those two ever
 * disagreed about who is fiftieth the board would be wrong in a way that is
 * miserable to find, so there is one function and both of them call it.
 *
 * The whole ladder collapses into a single number, which is what lets the store
 * sort the board natively with no comparator in the query path:
 *
 *   runs, most first
 *   sixes, most first
 *   fours, most first
 *   wickets lost, fewest first
 *   dot balls, fewest first
 *   earliest submission, first to get there stays above
 *
 * Strike rate is deliberately absent. The innings ends at thirty balls or three
 * wickets, so fewer balls faced means he got out, and ranking on strike rate
 * would put the player who threw it away above the one who saw it through.
 * Wickets lost already carries that, the right way round.
 */

/** How many rows the board holds. */
export const BOARD_SIZE = 50;

/** Runs off one ball: the game deals in these six and no others. */
const MAX_BALL_RUNS = 6;

/**
 * Field widths, in bits, low to high. Every one is sized to the most the game
 * can produce: 180 runs is thirty sixes, and no innings is longer than thirty
 * balls or costs more than three wickets.
 */
const DOTS_AVOIDED_BITS = 5;   // 0 to 30
const WICKETS_LEFT_BITS = 2;   // 0 to 3
const FOURS_BITS = 5;          // 0 to 30
const SIXES_BITS = 5;          // 0 to 30
const RUNS_BITS = 8;           // 0 to 180
/** Room for eight and a half years of second-resolution submissions. */
const TIME_BITS = 28;

const WICKETS_LEFT_SHIFT = 2 ** DOTS_AVOIDED_BITS;
const FOURS_SHIFT = WICKETS_LEFT_SHIFT * 2 ** WICKETS_LEFT_BITS;
const SIXES_SHIFT = FOURS_SHIFT * 2 ** FOURS_BITS;
const RUNS_SHIFT = SIXES_SHIFT * 2 ** SIXES_BITS;
const TIME_SPAN = 2 ** TIME_BITS;
const MAX_SECONDS = TIME_SPAN - 1;

/**
 * Twenty-five bits of rank over twenty-eight of time. Fifty-three is exactly a
 * double's mantissa, which is the whole reason this fits in one number at all,
 * and there is nothing spare: widening any field above costs a second of clock
 * resolution or an exact integer. A test holds this to fifty-three so that a
 * future field cannot quietly push it over.
 */
export const PACKED_BITS =
  RUNS_BITS + SIXES_BITS + FOURS_BITS + WICKETS_LEFT_BITS + DOTS_AVOIDED_BITS + TIME_BITS;

/** Second zero. Submissions are stamped as seconds after this. */
export const LAUNCH_MS = Date.UTC(2026, 0, 1);

/** The six figures the board ranks an innings on, and nothing else. */
export interface Innings {
  runs: number;
  sixes: number;
  fours: number;
  wickets: number;
  /** Balls that scored nothing and were not wickets, so this stays independent. */
  dots: number;
  balls: number;
}

/** Everything the board needs about a row, once it has a place and an owner. */
export interface BoardRow extends Innings {
  playerId: string;
  name: string;
  avatar: number;
  /** The packed number this row is sorted on. */
  score: number;
}

/** The six figures, read off an innings the game just finished. */
export function inningsFrom(score: ScoreManager): Innings {
  return {
    runs: score.runs, sixes: score.sixes, fours: score.fours,
    wickets: score.wickets, dots: score.dots, balls: score.balls,
  };
}

/**
 * The five playing keys, packed into twenty-five bits. Higher is better, which
 * is why the two "fewest wins" keys are stored as what is left rather than what
 * was lost: three wickets in hand beats one, and thirty balls that were not dots
 * beats twenty.
 */
export function rankKey(innings: Innings): number {
  const wicketsLeft = GAME.maxWickets - clamp(innings.wickets, 0, GAME.maxWickets);
  const dotsAvoided = GAME.totalBalls - clamp(innings.dots, 0, GAME.totalBalls);
  return clamp(innings.runs, 0, maxRuns()) * RUNS_SHIFT
    + clamp(innings.sixes, 0, GAME.totalBalls) * SIXES_SHIFT
    + clamp(innings.fours, 0, GAME.totalBalls) * FOURS_SHIFT
    + wicketsLeft * WICKETS_LEFT_SHIFT
    + dotsAvoided;
}

/**
 * The whole ladder as one number: the five playing keys, then the submission
 * time inverted underneath them so that on an exact tie the earlier innings
 * carries the bigger tail and stays above.
 *
 * The stamp has to come from the store rather than the browser, or a wrong clock
 * would decide a tiebreak.
 *
 * Twenty-five bits of rank over twenty-eight of time is fifty-three, which is
 * exactly a double's mantissa, so the number survives being stored as one.
 * That is also why the last step multiplies: JavaScript's shift operators are
 * thirty-two bit, and a `<<` here would silently wrap and scramble the board.
 */
export function packScore(innings: Innings, atMs: number): number {
  const seconds = clamp(Math.floor((atMs - LAUNCH_MS) / 1000), 0, MAX_SECONDS);
  return rankKey(innings) * TIME_SPAN + (MAX_SECONDS - seconds);
}

/** A packed score taken apart again, for tests and for reading a stored row. */
export function unpackScore(score: number) {
  const rank = Math.floor(score / TIME_SPAN);
  const seconds = MAX_SECONDS - (score - rank * TIME_SPAN);
  const runs = Math.floor(rank / RUNS_SHIFT);
  const sixes = Math.floor(rank / SIXES_SHIFT) % 2 ** SIXES_BITS;
  const fours = Math.floor(rank / FOURS_SHIFT) % 2 ** FOURS_BITS;
  const wicketsLeft = Math.floor(rank / WICKETS_LEFT_SHIFT) % 2 ** WICKETS_LEFT_BITS;
  const dotsAvoided = rank % 2 ** DOTS_AVOIDED_BITS;
  return {
    rank, seconds, runs, sixes, fours,
    wickets: GAME.maxWickets - wicketsLeft,
    dots: GAME.totalBalls - dotsAvoided,
    atMs: LAUNCH_MS + seconds * 1000,
  };
}

/**
 * The keys in the order they are read, so one place decides what is looked at
 * first. Which way each one points is rankKey's business, not this list's.
 */
const LADDER = [
  { key: 'runs', of: (i: Innings) => i.runs },
  { key: 'sixes', of: (i: Innings) => i.sixes },
  { key: 'fours', of: (i: Innings) => i.fours },
  { key: 'wickets', of: (i: Innings) => i.wickets },
  { key: 'dots', of: (i: Innings) => i.dots },
] as const;

export type LadderKey = (typeof LADDER)[number]['key'];

/**
 * Which figure actually separated two innings, so a row can point at the reason
 * it sits where it does rather than leaving the player to work it out. Null when
 * the two innings are identical on every playing key and only the clock split
 * them.
 */
export function decidedBy(a: Innings, b: Innings): LadderKey | null {
  for (const rung of LADDER) if (rung.of(a) !== rung.of(b)) return rung.key;
  return null;
}

/**
 * Board order: sort with this and the best innings comes first. Ties on every
 * playing key fall through to the stamp, where earlier wins.
 */
export function compareRows(a: BoardRow, b: BoardRow) {
  return b.score - a.score;
}

/**
 * Whether an innings is worth asking a name for. The browser answers this from
 * the board it already has on screen, so nothing waits on the network at the one
 * moment a wait would be felt. The store answers it again on submit and is the
 * one that counts.
 */
export function qualifies(innings: Innings, atMs: number, board: { score: number }[]) {
  if (board.length < BOARD_SIZE) return true;
  const cutoff = board[BOARD_SIZE - 1].score;
  return packScore(innings, atMs) > cutoff;
}

/** The largest score the game can produce: every ball hit for six. */
export function maxRuns() {
  return GAME.totalBalls * MAX_BALL_RUNS;
}

/**
 * Whether an innings could have happened at all. This is not an anti-cheat
 * measure and should not be mistaken for one: the game is a static page, so a
 * determined person can post any innings that passes. It rejects the ones that
 * could not exist, which is the floor, not the ceiling.
 *
 * The game deals in balls worth 0, 1, 2, 3, 4 or 6. So every ball is a six, a
 * four, a wicket, a dot, or one of the rest worth between one and three, and the
 * runs have to fall inside what those leftover balls could have produced.
 */
export function plausible(innings: Innings): boolean {
  const { runs, sixes, fours, wickets, dots, balls } = innings;
  const whole = [runs, sixes, fours, wickets, dots, balls];
  if (whole.some(n => !Number.isInteger(n) || n < 0)) return false;
  if (balls > GAME.totalBalls || wickets > GAME.maxWickets) return false;
  // The innings only ends two ways, so anything short of thirty balls is all out.
  if (balls < GAME.totalBalls && wickets < GAME.maxWickets) return false;
  if (wickets > balls) return false;

  const scoring = sixes + fours;
  const runners = balls - scoring - wickets - dots;
  if (runners < 0) return false;
  const fromRunners = runs - sixes * 6 - fours * 4;
  return fromRunners >= runners && fromRunners <= runners * 3;
}

function clamp(value: number, low: number, high: number) {
  return value < low ? low : value > high ? high : value;
}
