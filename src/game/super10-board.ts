import { SUPER10 } from '../config/super10.js';
import { LAUNCH_MS } from './leaderboard.js';
import type { ScoreManager } from './ScoreManager.js';

/**
 * Super10's board: the best team total a player has made in one innings of
 * ten overs, written once and imported by both sides, as `leaderboard.ts` is
 * for the Blast. Nothing here imports three.js: the store runs it.
 *
 * Ranked, agreed with the designer:
 *
 *   runs, most first
 *   wickets lost, fewest first
 *   sixes, most first
 *   earliest submission, first to get there stays above
 *
 * The Blast's packed key could not be reused: its fields are sized to thirty
 * balls and three wickets and fill a double's fifty-three bits exactly, and
 * sixty balls want wider ones.
 */

/** How many rows the board holds. */
export const SUPER10_BOARD_SIZE = 50;

/** The figures a Super10 innings is ranked on, and the ones its row shows. */
export interface Super10Innings {
  runs: number;
  balls: number;
  wickets: number;
  fours: number;
  sixes: number;
}

/** Field widths, in bits: 360 runs is sixty sixes, five wickets, sixty balls. */
const SIXES_BITS = 6;          // 0 to 60
const WICKETS_LEFT_BITS = 3;   // 0 to 5
const RUNS_BITS = 9;           // 0 to 360
/** Room for eight and a half years of second-resolution submissions, as the Blast's. */
const TIME_BITS = 28;

const WICKETS_SHIFT = 2 ** SIXES_BITS;
const RUNS_SHIFT = WICKETS_SHIFT * 2 ** WICKETS_LEFT_BITS;
const TIME_SPAN = 2 ** TIME_BITS;
const MAX_SECONDS = TIME_SPAN - 1;

/** Forty-six bits: inside a double's fifty-three, held there by a test. */
export const SUPER10_PACKED_BITS = RUNS_BITS + WICKETS_LEFT_BITS + SIXES_BITS + TIME_BITS;

/** The largest total the game can produce: every ball hit for six. */
export const SUPER10_MAX_RUNS = SUPER10.totalBalls * 6;

/** The playing keys, higher better: fewer wickets stored as wickets in hand. */
export function super10Rank(innings: Super10Innings): number {
  const wicketsLeft = SUPER10.maxWickets - clamp(innings.wickets, 0, SUPER10.maxWickets);
  return clamp(innings.runs, 0, SUPER10_MAX_RUNS) * RUNS_SHIFT
    + wicketsLeft * WICKETS_SHIFT
    + clamp(innings.sixes, 0, SUPER10.totalBalls);
}

/** The whole ladder as one number, the store's stamp inverted under it so the earlier stays above. */
export function packSuper10(innings: Super10Innings, atMs: number): number {
  const seconds = clamp(Math.floor((atMs - LAUNCH_MS) / 1000), 0, MAX_SECONDS);
  return super10Rank(innings) * TIME_SPAN + (MAX_SECONDS - seconds);
}

/** A packed score taken apart again, for tests and for reading a stored row. */
export function unpackSuper10(score: number) {
  const rank = Math.floor(score / TIME_SPAN);
  const seconds = MAX_SECONDS - (score - rank * TIME_SPAN);
  return {
    runs: Math.floor(rank / RUNS_SHIFT),
    wickets: SUPER10.maxWickets - Math.floor(rank / WICKETS_SHIFT) % 2 ** WICKETS_LEFT_BITS,
    sixes: rank % 2 ** SIXES_BITS,
    atMs: LAUNCH_MS + seconds * 1000,
  };
}

/** The figures, read off the innings the game just finished. */
export function super10From(score: ScoreManager): Super10Innings {
  return { runs: score.runs, balls: score.balls, wickets: score.wickets, fours: score.fours, sixes: score.sixes };
}

/**
 * Whether an innings could have happened at all: the floor, not anti-cheat,
 * as the Blast's `plausible` is. Ten overs or five wickets end it, and every
 * ball is a six, a four, a wicket or one worth nought to three.
 */
export function super10Plausible(innings: Super10Innings): boolean {
  const { runs, balls, wickets, fours, sixes } = innings;
  if ([runs, balls, wickets, fours, sixes].some(n => !Number.isInteger(n) || n < 0)) return false;
  if (balls > SUPER10.totalBalls || wickets > SUPER10.maxWickets) return false;
  if (balls < SUPER10.totalBalls && wickets < SUPER10.maxWickets) return false;
  if (sixes + fours + wickets > balls) return false;
  const rest = balls - sixes - fours - wickets;
  const fromRest = runs - sixes * 6 - fours * 4;
  return fromRest >= 0 && fromRest <= rest * 3;
}

/** The figures off an untrusted request body: nothing defaulted, so a missing one is `NaN` and refused. */
export function readSuper10(raw: unknown): Super10Innings {
  const from = (raw ?? {}) as Record<string, unknown>;
  const read = (key: string) => Number(from[key]);
  return { runs: read('runs'), balls: read('balls'), wickets: read('wickets'), fours: read('fours'), sixes: read('sixes') };
}

function clamp(value: number, low: number, high: number) {
  return value < low ? low : value > high ? high : value;
}
