import { SUPER10 } from '../config/super10.js';
import { LAUNCH_MS } from './leaderboard.js';
import { soloRankKey, type SoloInnings } from './marathon-board.js';
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

/**
 * Super10's second board, Batters: the best innings by one of the five, ranked
 * as the Marathon's individual ladder is — runs, then not out above out, then
 * fewer balls, then whoever got there first — and packed by the same function
 * (`packSolo`), so a row is a `SoloInnings` with `left` always false: all five
 * bat the player's way round.
 *
 * The innings is sent with each batter's figures beside the team's. They ride
 * along rather than replace anything: the team total is checked and written as
 * it always was, and the batters are only ever a second row. An innings whose
 * batters do not hold up — or a browser from before they were sent — still
 * goes on the team board, and simply puts nothing on this one.
 */
export interface Super10BatterFigures {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
}

/** A Super10 innings as the game sends it: the team's figures, and each batter's in the order they went in. */
export interface Super10Figures extends Super10Innings {
  batters?: Super10BatterFigures[];
}

/**
 * Each batter's figures off the innings ball by ball: every ball is the man
 * in's, the next goes in after a wicket, and is listed once he faces a ball.
 * Runs on a wicket ball are his too, so the five always add up to the side.
 */
export function battersOf(history: readonly { runs: number; isWicket: boolean }[]): Super10BatterFigures[] {
  const rows: Super10BatterFigures[] = [];
  let wickets = 0;
  for (const ball of history) {
    const at = Math.min(wickets, SUPER10.maxWickets - 1);
    const row = rows[at] ??= { runs: 0, balls: 0, fours: 0, sixes: 0, out: false };
    row.balls++;
    row.runs += ball.runs;
    if (ball.runs === 4) row.fours++;
    if (ball.runs === 6) row.sixes++;
    if (ball.isWicket) { row.out = true; wickets++; }
  }
  return rows;
}

/** The whole innings as it is posted: the team, and the five. */
export function super10FiguresFrom(score: ScoreManager): Super10Figures {
  return { ...super10From(score), batters: battersOf(score.history) };
}

/**
 * The Batters row an innings makes: whichever of the five ranks highest. The
 * earliest in the order wins an exact tie, which no row could tell apart.
 */
export function super10SoloOf(batters: readonly Super10BatterFigures[]): SoloInnings {
  let best: SoloInnings | null = null;
  batters.forEach((b, i) => {
    const candidate: SoloInnings = { runs: b.runs, balls: b.balls, out: b.out, order: i + 1, left: false };
    if (!best || soloRankKey(candidate) > soloRankKey(best)) best = candidate;
  });
  return best ?? { runs: 0, balls: 0, out: false, order: 1, left: false };
}

/**
 * Whether the batters bear out the team's figures: one to five of them, each
 * having faced a ball, every one but the last out (the next man only goes in
 * when one is gone), and runs, balls, fours, sixes and wickets adding up to
 * the side's. The team's
 * own figures are `super10Plausible`'s to judge, and are judged first.
 */
export function super10BattersPlausible(innings: Super10Innings, batters: unknown): batters is Super10BatterFigures[] {
  if (!Array.isArray(batters) || batters.length < 1 || batters.length > SUPER10.maxWickets) return false;
  const counts = (...values: number[]) => values.every(n => Number.isInteger(n) && n >= 0);
  for (const b of batters as Super10BatterFigures[]) {
    if (!b || typeof b !== 'object' || typeof b.out !== 'boolean') return false;
    if (!counts(b.runs, b.balls, b.fours, b.sixes)) return false;
    if (b.balls < 1 || b.runs > b.balls * 6 || b.fours * 4 + b.sixes * 6 > b.runs) return false;
  }
  const list = batters as Super10BatterFigures[];
  const sum = (pick: (b: Super10BatterFigures) => number) => list.reduce((total, b) => total + pick(b), 0);
  if (sum(b => b.runs) !== innings.runs || sum(b => b.balls) !== innings.balls) return false;
  if (sum(b => b.fours) !== innings.fours || sum(b => b.sixes) !== innings.sixes) return false;
  if (list.filter(b => b.out).length !== innings.wickets) return false;
  // With the outs adding up to the wickets, this also holds the last man to
  // being out only on the ball that ended it: all out, or the sixtieth.
  return list.slice(0, -1).every(b => b.out);
}

/** The figures off an untrusted request body: nothing defaulted, so a missing one is `NaN` and refused. */
export function readSuper10(raw: unknown): Super10Figures {
  const from = (raw ?? {}) as Record<string, unknown>;
  const read = (key: string) => Number(from[key]);
  const team = { runs: read('runs'), balls: read('balls'), wickets: read('wickets'), fours: read('fours'), sixes: read('sixes') };
  if (!Array.isArray(from.batters)) return team;
  // Numbers and booleans and nothing else taken: anything that is not a
  // boolean where one belongs arrives as null, which the check refuses.
  const batters = from.batters.slice(0, SUPER10.maxWickets + 1).map((b): Super10BatterFigures => {
    const one = (b ?? {}) as Record<string, unknown>;
    const n = (key: string) => Number(one[key]);
    return {
      runs: n('runs'), balls: n('balls'), fours: n('fours'), sixes: n('sixes'),
      out: (typeof one.out === 'boolean' ? one.out : null) as boolean,
    };
  });
  return { ...team, batters };
}

function clamp(value: number, low: number, high: number) {
  return value < low ? low : value > high ? high : value;
}
