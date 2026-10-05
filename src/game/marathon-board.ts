import { HEALTH } from '../config/survive.js';
import { MARATHON, type MarathonEnding } from '../config/marathon.js';
import { LAUNCH_MS } from './leaderboard.js';

/**
 * The Test Marathon's two ladders, and the one innings that writes both.
 *
 * A Marathon is three batters end to end, so it is two contests at once: what
 * the side made together, and what the best of them made on his own. Each has
 * a ladder (`docs/MARATHON.md`, "The leaderboards"):
 *
 *   Team       — total runs, then strike rate (fewer balls for the same runs),
 *                then boundaries, then whoever got there first.
 *   Individual — one batter's runs, then not out above out, then fewer balls,
 *                then whoever got there first.
 *
 * One row a player on each: their best team innings, and their best innings by
 * any one of the three. The game sends a whole innings once — every batter's
 * figures and how it ended — and the store writes both rows from it, so the two
 * boards can never disagree about an innings, and checks it could have happened
 * as a whole rather than as two halves that each look fine.
 *
 * Strike rate is shown and ranked on, but stored as balls: after total runs, a
 * higher strike rate is exactly fewer balls, and balls are a whole number with
 * no rounding in them. It is never the first key, or 24 off 6 would sit above
 * 400 off 450.
 */

/** One batter, as the innings is sent: what the card shows, and the meter's say. */
export interface MarathonBatterFigures {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
  retired: boolean;
  /** Blows taken. */
  blows: number;
  /** What was left on his meter, out of `HEALTH.full`. */
  health: number;
  left: boolean;
}

/** A whole Marathon innings, as the game sends it. */
export interface MarathonFigures {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  ending: MarathonEnding;
  /** One to three, in the order they batted. */
  batters: MarathonBatterFigures[];
}

/** What the team ladder ranks and shows. */
export interface TeamInnings {
  runs: number;
  balls: number;
  /** Fours and sixes together. */
  boundaries: number;
  ending: MarathonEnding;
}

/** What the individual ladder ranks and shows: the best of the three. */
export interface SoloInnings {
  runs: number;
  balls: number;
  out: boolean;
  /** Which of the three, counting from one. */
  order: number;
  left: boolean;
}

export interface TeamRow extends TeamInnings { playerId: string; name: string; avatar: number; score: number }
export interface SoloRow extends SoloInnings { playerId: string; name: string; avatar: number; score: number }

/** How many rows each ladder holds. The same fifty as the others. */
export const MARATHON_BOARD_SIZE = 50;

export const ENDINGS: readonly MarathonEnding[] = ['ALL_OUT', 'RETIRED', 'BALLS', 'DECLARED'];

/**
 * Field widths. Runs get eleven bits on both: 2047 is more than a whole
 * innings has ever come near, and the most a batter could make is six an over
 * for five hundred balls, which `clamp` holds at the top rather than letting
 * it wrap into the field above. Balls are stored as what was *not* used, out
 * of 511, so that fewer reads as more.
 */
const RUNS_BITS = 11;
const BALLS_BITS = 9;
const BOUNDARY_BITS = 9;
const NOT_OUT_BITS = 1;
const BALLS_LEFT = 2 ** BALLS_BITS - 1;

/**
 * The team ladder's clock is in minutes, which the other boards' is not. It is
 * a new ladder with no settled ties to reshuffle, and seconds would leave its
 * rank only twenty-five bits. Two innings level on runs, balls and boundaries
 * inside the same minute are a tie the clock does not split, and the store keeps
 * the first.
 */
const TEAM_TIME_BITS = 22;
const SOLO_TIME_BITS = 28;

const TEAM_RANK_BITS = RUNS_BITS + BALLS_BITS + BOUNDARY_BITS;
const SOLO_RANK_BITS = RUNS_BITS + NOT_OUT_BITS + BALLS_BITS;
/** Fifty-one and forty-nine: both inside a double's fifty-three. A test holds them there. */
export const TEAM_PACKED_BITS = TEAM_RANK_BITS + TEAM_TIME_BITS;
export const SOLO_PACKED_BITS = SOLO_RANK_BITS + SOLO_TIME_BITS;

const TEAM_SPAN = 2 ** TEAM_TIME_BITS, TEAM_LATEST = TEAM_SPAN - 1;
const SOLO_SPAN = 2 ** SOLO_TIME_BITS, SOLO_LATEST = SOLO_SPAN - 1;

/** The team innings' rank: runs, then balls saved, then boundaries. */
export function teamRankKey(innings: TeamInnings): number {
  return clamp(innings.runs, 0, 2 ** RUNS_BITS - 1) * 2 ** (BALLS_BITS + BOUNDARY_BITS)
    + (BALLS_LEFT - clamp(innings.balls, 0, BALLS_LEFT)) * 2 ** BOUNDARY_BITS
    + clamp(innings.boundaries, 0, 2 ** BOUNDARY_BITS - 1);
}

/** One batter's rank: runs, then not out, then balls saved. */
export function soloRankKey(innings: SoloInnings): number {
  return clamp(innings.runs, 0, 2 ** RUNS_BITS - 1) * 2 ** (NOT_OUT_BITS + BALLS_BITS)
    + (innings.out ? 0 : 1) * 2 ** BALLS_BITS
    + (BALLS_LEFT - clamp(innings.balls, 0, BALLS_LEFT));
}

/** The team ladder as one number, the store's minute inverted underneath so the first there wins a tie. */
export function packTeam(innings: TeamInnings, atMs: number): number {
  const minutes = clamp(Math.floor((atMs - LAUNCH_MS) / 60_000), 0, TEAM_LATEST);
  return teamRankKey(innings) * TEAM_SPAN + (TEAM_LATEST - minutes);
}

/** The individual ladder as one number, by the second, as the older boards are. */
export function packSolo(innings: SoloInnings, atMs: number): number {
  const seconds = clamp(Math.floor((atMs - LAUNCH_MS) / 1000), 0, SOLO_LATEST);
  return soloRankKey(innings) * SOLO_SPAN + (SOLO_LATEST - seconds);
}

/** A packed team score taken apart again, for tests and for reading a row. */
export function unpackTeam(score: number) {
  const rank = Math.floor(score / TEAM_SPAN);
  const minutes = TEAM_LATEST - (score - rank * TEAM_SPAN);
  return {
    runs: Math.floor(rank / 2 ** (BALLS_BITS + BOUNDARY_BITS)),
    balls: BALLS_LEFT - Math.floor(rank / 2 ** BOUNDARY_BITS) % 2 ** BALLS_BITS,
    boundaries: rank % 2 ** BOUNDARY_BITS,
    atMs: LAUNCH_MS + minutes * 60_000,
  };
}

/** A packed individual score taken apart again. */
export function unpackSolo(score: number) {
  const rank = Math.floor(score / SOLO_SPAN);
  const seconds = SOLO_LATEST - (score - rank * SOLO_SPAN);
  return {
    runs: Math.floor(rank / 2 ** (NOT_OUT_BITS + BALLS_BITS)),
    out: Math.floor(rank / 2 ** BALLS_BITS) % 2 === 0,
    balls: BALLS_LEFT - rank % 2 ** BALLS_BITS,
    atMs: LAUNCH_MS + seconds * 1000,
  };
}

/** The team row an innings makes. */
export function teamOf(innings: MarathonFigures): TeamInnings {
  return { runs: innings.runs, balls: innings.balls, boundaries: innings.fours + innings.sixes, ending: innings.ending };
}

/**
 * The individual row an innings makes: whichever of the three ranks highest on
 * the individual ladder. The earliest in the order wins an exact tie, which
 * nothing on the board can tell apart anyway.
 */
export function soloOf(innings: MarathonFigures): SoloInnings {
  let best: SoloInnings | null = null;
  innings.batters.forEach((b, i) => {
    const candidate: SoloInnings = { runs: b.runs, balls: b.balls, out: b.out, order: i + 1, left: b.left };
    if (!best || soloRankKey(candidate) > soloRankKey(best)) best = candidate;
  });
  return best ?? { runs: 0, balls: 0, out: false, order: 1, left: false };
}

/** The strike rate a row shows, to one place. Never ranked on directly: see the top of this file. */
export function strikeRate(runs: number, balls: number) {
  return balls ? Math.round(runs / balls * 1000) / 10 : 0;
}

/**
 * Whether a whole Marathon innings could have happened. The floor the other
 * boards have, and not an anti-cheat measure: the game is a static page, so a
 * determined person can post anything that passes. It refuses the shapes the
 * mode cannot produce (`docs/MARATHON.md`, "One submission, both rows"):
 *
 *   - more than five hundred balls, or more than six a ball;
 *   - the batters' figures not adding up to the side's;
 *   - a batter who went in before the last one and is not out or retired —
 *     the next man only walks out when the one before him is gone;
 *   - an ending its figures do not bear out: all out or retired is the third
 *     batter going, five hundred balls is five hundred balls, and a
 *     declaration is from over twenty with the man in still standing;
 *   - and the meter rules Test Survival enforces, batter by batter: a meter
 *     that moved with no blow, a batter carried off with something left on
 *     it, or one still standing with nothing left.
 */
export function marathonPlausible(innings: MarathonFigures): boolean {
  const { runs, balls, fours, sixes, ending, batters } = innings;
  const counts = (...values: number[]) => values.every(n => Number.isInteger(n) && n >= 0);
  if (!counts(runs, balls, fours, sixes)) return false;
  if (!ENDINGS.includes(ending)) return false;
  if (!Array.isArray(batters) || batters.length < 1 || batters.length > MARATHON.batters) return false;
  if (balls < 1 || balls > MARATHON.maxBalls || runs > balls * 6 || fours * 4 + sixes * 6 > runs) return false;

  const sum = (pick: (b: MarathonBatterFigures) => number) => batters.reduce((total, b) => total + pick(b), 0);
  for (const b of batters) {
    if (!counts(b.runs, b.balls, b.fours, b.sixes, b.blows, b.health)) return false;
    if (typeof b.out !== 'boolean' || typeof b.retired !== 'boolean' || typeof b.left !== 'boolean') return false;
    if (b.out && b.retired) return false;
    if (b.runs > b.balls * 6 || b.fours * 4 + b.sixes * 6 > b.runs) return false;
    if (b.blows > b.balls || b.health > HEALTH.full) return false;
    if (b.health < HEALTH.full && b.blows === 0) return false;
    // Carried off is the meter running out; standing with it run out is not a state.
    if (b.retired && b.health > 0) return false;
    if (!b.out && !b.retired && b.health === 0) return false;
  }
  if (sum(b => b.runs) !== runs || sum(b => b.balls) !== balls) return false;
  if (sum(b => b.fours) !== fours || sum(b => b.sixes) !== sixes) return false;
  if (batters.filter(b => b.left).length > 1) return false;

  const before = batters.slice(0, -1), last = batters[batters.length - 1];
  if (before.some(b => !b.out && !b.retired)) return false;
  // Nobody walks out to face no ball, except the one in when the innings stops.
  if (before.some(b => b.balls === 0)) return false;
  const full = batters.length === MARATHON.batters;
  switch (ending) {
    // The third batter's going decides it before the clock does.
    case 'ALL_OUT': return full && last.out;
    case 'RETIRED': return full && last.retired;
    // The five hundredth ball, with the third man still standing — or with
    // fewer than three used, where whoever was in last is in.
    case 'BALLS': return balls === MARATHON.maxBalls && !(full && (last.out || last.retired));
    case 'DECLARED': return balls >= MARATHON.declareFrom && balls < MARATHON.maxBalls && !last.out && !last.retired;
  }
  return false;
}

/**
 * A Marathon innings read off a request body: numbers and booleans, every
 * batter, and nothing else taken. `marathonPlausible` decides whether it could
 * have happened; anything that is not a boolean where one belongs arrives as
 * null, which it refuses. Shared by `api/score.ts` and the dev server, so the
 * two read a body the same way.
 */
export function readMarathonFigures(raw: unknown): MarathonFigures {
  const from = (raw ?? {}) as Record<string, unknown>;
  const read = (key: string) => Number(from[key]);
  const batters = Array.isArray(from.batters) ? from.batters.slice(0, MARATHON.batters + 1) : [];
  return {
    runs: read('runs'), balls: read('balls'), fours: read('fours'), sixes: read('sixes'),
    ending: String(from.ending ?? '') as MarathonEnding,
    batters: batters.map((b): MarathonBatterFigures => {
      const one = (b ?? {}) as Record<string, unknown>;
      const n = (key: string) => Number(one[key]);
      const yes = (key: string) => (typeof one[key] === 'boolean' ? one[key] : null) as boolean;
      return {
        runs: n('runs'), balls: n('balls'), fours: n('fours'), sixes: n('sixes'),
        out: yes('out'), retired: yes('retired'), blows: n('blows'), health: n('health'), left: yes('left'),
      };
    }),
  };
}

/** Whether an innings is worth offering a ladder: it would make the fifty. */
export function marathonQualifies(score: number, board: readonly { score: number }[]) {
  return board.length < MARATHON_BOARD_SIZE || score > board[MARATHON_BOARD_SIZE - 1].score;
}

function clamp(value: number, low: number, high: number) {
  return value < low ? low : value > high ? high : value;
}
