import { GAME } from '../config/gameplay.js';
import { LAUNCH_MS, type Innings } from './leaderboard.js';
import { SURVIVE } from '../config/survive.js';
import { standingOf, type SurviveInnings } from './survive-board.js';

/**
 * What a player has done over every innings, rather than in the best one.
 *
 * The two boards this game already had answer one question — what is the best
 * innings anybody has played — and they answer it by keeping exactly one row a
 * player and only writing when it improves. Nothing in that shape can hold a
 * total: a maximum and a sum are not the same arithmetic, and no amount of
 * `ZADD GT` will turn one into the other.
 *
 * So this is the other record, and it is deliberately *one* record rather than
 * one per thing shown. Most runs, most boundaries, the highest score anybody
 * has made, and the card a player opens to see their own figures are all views
 * of the same handful of numbers. Written as separate counters they would drift
 * the first time one of them was updated on a path the others were not.
 *
 * Nothing here imports three.js, for the same reason `leaderboard.ts` does not:
 * the store runs this file, and the store has no browser.
 */

/** A Blast career, and the six figures its card shows. */
export interface BlastCareer {
  innings: number;
  runs: number;
  balls: number;
  sixes: number;
  fours: number;
  wickets: number;
  dots: number;
  /** The biggest innings total, whatever it cost in wickets. 140/1 is 140. */
  highest: number;
  /** The biggest total made without losing a wicket at all. */
  notOut: number;
}

/**
 * A Test career. Wins, draws and losses are counted rather than derived on the
 * way out, because `standingOf` reads them off an innings and an innings is
 * exactly what a career no longer has: once the figures are added up there is
 * nothing left to ask which contest each of them ended in.
 */
export interface SurviveCareer {
  innings: number;
  runs: number;
  balls: number;
  sixes: number;
  fours: number;
  blows: number;
  wins: number;
  draws: number;
  losses: number;
}

/**
 * A Test innings as the career counts it: the five the board already ranks,
 * plus the two boundaries columns it never had.
 *
 * The Test board does not carry sixes and fours, because its ladder does not
 * rank on them — a chase is ranked on how few balls it took, not on how it was
 * made. The career does show them, so they travel with the tally rather than
 * being added to `SurviveInnings` and quietly widening a packed key that has
 * been measured to the bit.
 */
export interface SurviveTally extends SurviveInnings {
  sixes: number;
  fours: number;
}

/** A career with nothing in it yet, which is what a first innings folds into. */
export function emptyBlast(): BlastCareer {
  return { innings: 0, runs: 0, balls: 0, sixes: 0, fours: 0, wickets: 0, dots: 0, highest: 0, notOut: 0 };
}

export function emptySurvive(): SurviveCareer {
  return { innings: 0, runs: 0, balls: 0, sixes: 0, fours: 0, blows: 0, wins: 0, draws: 0, losses: 0 };
}

/**
 * One more innings, folded in.
 *
 * Pure and total: it is handed what is held and what was played and answers
 * with what is held now, so the whole of the accumulation can be tested without
 * a store, and the store's only job is to read, call this, and write. Nothing
 * is mutated — the record that came out of the database is left as it was,
 * which is what makes a failed write leave nothing half-applied.
 */
export function mergeBlast(held: BlastCareer | null, innings: Innings): BlastCareer {
  const was = held ?? emptyBlast();
  return {
    innings: was.innings + 1,
    runs: was.runs + innings.runs,
    balls: was.balls + innings.balls,
    sixes: was.sixes + innings.sixes,
    fours: was.fours + innings.fours,
    wickets: was.wickets + innings.wickets,
    dots: was.dots + innings.dots,
    highest: Math.max(was.highest, innings.runs),
    // Not out is the whole innings, not the wicket that ended it: three wickets
    // in hand at the last ball is unbeaten, and one lost on the first is not,
    // however the rest of it went.
    notOut: innings.wickets === 0 ? Math.max(was.notOut, innings.runs) : was.notOut,
  };
}

export function mergeSurvive(held: SurviveCareer | null, tally: SurviveTally): SurviveCareer {
  const was = held ?? emptySurvive();
  const standing = standingOf(tally);
  return {
    innings: was.innings + 1,
    runs: was.runs + tally.runs,
    balls: was.balls + tally.balls,
    sixes: was.sixes + tally.sixes,
    fours: was.fours + tally.fours,
    blows: was.blows + tally.blows,
    wins: was.wins + Number(standing === 'WON'),
    draws: was.draws + Number(standing === 'DRAWN'),
    losses: was.losses + Number(standing === 'LOST'),
  };
}

/**
 * Innings he came through: chased the hundred, or batted out the ten overs.
 *
 * Derived rather than counted, because it is the two tiers added together and
 * a third counter kept beside them is a third counter to keep in step.
 */
export function survivals(career: SurviveCareer): number {
  return career.wins + career.draws;
}

/**
 * How a career board is ranked, and it is the same shape for every one of them.
 *
 * The two innings ladders each pack five or six keys into a number sized to the
 * bit, because on those boards a tie is the common case — thirty balls cannot
 * produce many distinct scores, so almost everything is settled below the
 * first key. A career total is a much wider number and ties are rare, so this
 * one is deliberately plain: the figure the board is about, one figure to split
 * a tie on, and the clock underneath.
 *
 * Twenty bits over fourteen over fourteen is forty-eight, comfortably inside a
 * double's fifty-three, and the room left over is the point — a career board
 * added later can be packed with this same function rather than by finding two
 * spare bits somewhere.
 */
const PRIMARY_BITS = 20;
const SECONDARY_BITS = 14;
const DAY_BITS = 14;

export const PRIMARY_CAP = 2 ** PRIMARY_BITS - 1;
export const SECONDARY_CAP = 2 ** SECONDARY_BITS - 1;
const DAY_SPAN = 2 ** DAY_BITS;
const MAX_DAYS = DAY_SPAN - 1;

/** What the packed key comes to. A test holds this under a double's mantissa. */
export const CAREER_PACKED_BITS = PRIMARY_BITS + SECONDARY_BITS + DAY_BITS;

/**
 * The clock, in days rather than seconds.
 *
 * The innings boards stamp to the second because two players can finish the
 * same innings in the same minute and one of them has to be above the other. A
 * career total that is level today was level yesterday too, so the day it was
 * reached is all the resolution the tiebreak needs — and dropping the
 * twenty-eight bit stamp to fourteen is what pays for a twenty-bit total.
 *
 * Inverted underneath the figures, so whoever got to a total first stays above
 * whoever matched it later. Forty-four years of days, which is longer than this
 * will be running.
 */
export function daysSince(atMs: number): number {
  return clamp(Math.floor((atMs - LAUNCH_MS) / 86_400_000), 0, MAX_DAYS);
}

/** The whole of a career board's order as one number, highest first. */
export function packCareer(primary: number, secondary: number, atMs: number): number {
  return (clamp(Math.floor(primary), 0, PRIMARY_CAP) * DAY_SPAN
    + clamp(Math.floor(secondary), 0, SECONDARY_CAP)) * DAY_SPAN
    + (MAX_DAYS - daysSince(atMs));
}

/** A packed career score taken apart again, for tests and for reading a row. */
export function unpackCareer(score: number) {
  const day = MAX_DAYS - (score % DAY_SPAN);
  const above = Math.floor(score / DAY_SPAN);
  return {
    primary: Math.floor(above / DAY_SPAN),
    secondary: above % DAY_SPAN,
    day,
    atMs: LAUNCH_MS + day * 86_400_000,
  };
}

/**
 * One career board: what it is called, what it ranks on, what splits a tie, and
 * the columns a row actually shows.
 *
 * The figures are named here rather than in the markup so that the sheet can
 * draw any of these boards without knowing which one it has — a board added to
 * the list below appears as a tab with no change to the screen that draws it.
 */
export interface CareerBoard<C> {
  /** The key its ranking lives under, and the id its tab carries. */
  key: string;
  /** What the tab says. */
  name: string;
  /** The line under the title, saying what is being ranked and how. */
  blurb: string;
  /** The figure it ranks on, most first. */
  primary(career: C): number;
  /** What splits a tie on that figure. Higher stays above. */
  secondary(career: C): number;
  /** The big number on a row, and the two smaller ones beside it. */
  figures: readonly { label: string; of(career: C): number }[];
  /** Whether this player belongs on this board at all. */
  counts(career: C): boolean;
}

/** How a player's career is ranked on one board, as at a moment. */
export function rankCareer<C>(board: CareerBoard<C>, career: C, atMs: number): number {
  return packCareer(board.primary(career), board.secondary(career), atMs);
}

/**
 * Fewer innings, as something higher is better.
 *
 * Two players level on career runs are not level: the one who got there in
 * fifty innings played better than the one who took three hundred. Stored as
 * what is left of the cap rather than what was used, because every field in
 * every packed key in this repository reads the same way round.
 */
function fewerInnings(innings: number): number {
  return SECONDARY_CAP - clamp(Math.floor(innings), 0, SECONDARY_CAP);
}

/** The Blast's career ladders, in the order their tabs are drawn. */
export const BLAST_BOARDS: readonly CareerBoard<BlastCareer>[] = [
  {
    key: 'runs',
    name: 'Runs',
    blurb: 'Every run scored in the Blast, added up. Level totals are split on who took fewer innings.',
    primary: career => career.runs,
    secondary: career => fewerInnings(career.innings),
    figures: [
      { label: 'runs', of: career => career.runs },
      { label: 'inns', of: career => career.innings },
      { label: '6s', of: career => career.sixes },
    ],
    counts: career => career.runs > 0,
  },
  {
    key: 'boundaries',
    name: 'Boundaries',
    blurb: 'Most sixes, and fours where the sixes are level.',
    primary: career => career.sixes,
    secondary: career => clamp(career.fours, 0, SECONDARY_CAP),
    figures: [
      { label: '6s', of: career => career.sixes },
      { label: '4s', of: career => career.fours },
      { label: 'inns', of: career => career.innings },
    ],
    counts: career => career.sixes + career.fours > 0,
  },
  {
    key: 'highest',
    name: 'Highest',
    blurb: 'The biggest single innings anybody has played. A level best is split on the best unbeaten one.',
    primary: career => career.highest,
    secondary: career => clamp(career.notOut, 0, SECONDARY_CAP),
    figures: [
      { label: 'best', of: career => career.highest },
      { label: 'n.o.', of: career => career.notOut },
      { label: 'inns', of: career => career.innings },
    ],
    counts: career => career.highest > 0,
  },
];

/** The Test match's career ladders. */
export const SURVIVE_BOARDS: readonly CareerBoard<SurviveCareer>[] = [
  {
    key: 'balls',
    name: 'Balls',
    blurb: 'Every ball faced out there, added up. Level counts are split on who took fewer innings.',
    primary: career => career.balls,
    secondary: career => fewerInnings(career.innings),
    figures: [
      { label: 'balls', of: career => career.balls },
      { label: 'inns', of: career => career.innings },
      { label: 'runs', of: career => career.runs },
    ],
    counts: career => career.balls > 0,
  },
  {
    key: 'blows',
    name: 'Blows',
    blurb: 'Most blows taken and still come back. Level counts are split on balls faced.',
    primary: career => career.blows,
    secondary: career => clamp(career.balls, 0, SECONDARY_CAP),
    figures: [
      { label: 'blows', of: career => career.blows },
      { label: 'balls', of: career => career.balls },
      { label: 'inns', of: career => career.innings },
    ],
    counts: career => career.blows > 0,
  },
  {
    key: 'runs',
    name: 'Runs',
    blurb: 'Every run made against the short stuff. Level totals are split on balls faced.',
    primary: career => career.runs,
    secondary: career => clamp(career.balls, 0, SECONDARY_CAP),
    figures: [
      { label: 'runs', of: career => career.runs },
      { label: 'inns', of: career => career.innings },
      { label: 'won', of: career => career.wins },
    ],
    counts: career => career.runs > 0,
  },
  {
    key: 'boundaries',
    name: 'Boundaries',
    blurb: 'Most sixes, and fours where the sixes are level.',
    primary: career => career.sixes,
    secondary: career => clamp(career.fours, 0, SECONDARY_CAP),
    figures: [
      { label: '6s', of: career => career.sixes },
      { label: '4s', of: career => career.fours },
      { label: 'inns', of: career => career.innings },
    ],
    counts: career => career.sixes + career.fours > 0,
  },
];

/** Which career this is, which is the only thing that differs on the wire. */
export type CareerMode = 'classic' | 'survive';

/**
 * Whether a tally could have come from an innings of this mode at all.
 *
 * The same floor the two innings boards have, and the same disclaimer: the game
 * is a static page, so a determined person can post anything that passes. What
 * this refuses is the impossible, which is what keeps one forged request from
 * putting a number on a career board that no amount of playing could reach.
 *
 * It is stricter here than it is there in one way that matters. An innings
 * board holds a maximum, so a single absurd submission is capped by the mode's
 * own ceiling; a career is a sum, so the same submission repeated is unbounded.
 * The rate limit and the daily count in `career-store.ts` are the other half of
 * that answer — this half only says what one innings may contain.
 */
export function blastTallyPlausible(innings: Innings): boolean {
  const whole = [innings.runs, innings.sixes, innings.fours, innings.wickets, innings.dots, innings.balls];
  if (whole.some(n => !Number.isInteger(n) || n < 0)) return false;
  if (innings.balls > GAME.totalBalls || innings.wickets > GAME.maxWickets) return false;
  if (innings.sixes + innings.fours + innings.wickets + innings.dots > innings.balls) return false;
  return innings.runs <= innings.balls * 6;
}

export function surviveTallyPlausible(tally: SurviveTally): boolean {
  const whole = [tally.runs, tally.balls, tally.wickets, tally.blows, tally.health, tally.sixes, tally.fours];
  if (whole.some(n => !Number.isInteger(n) || n < 0)) return false;
  if (tally.balls > SURVIVE.totalBalls || tally.wickets > SURVIVE.maxWickets) return false;
  if (tally.blows > tally.balls) return false;
  if (tally.sixes + tally.fours > tally.balls) return false;
  return tally.runs <= tally.balls * 6;
}

/**
 * Everything the store needs to keep one mode's careers, so the plumbing is
 * written once and the mode is handed to it — the same arrangement `Ladder`
 * already has for the innings boards, and for the same reason.
 */
export interface CareerLadder<C, T> {
  mode: CareerMode;
  /** Where this mode's keys live. */
  scope: string;
  boards: readonly CareerBoard<C>[];
  merge(held: C | null, tally: T): C;
  plausible(tally: T): boolean;
  /** The totals alone, so a stored record never carries a field nobody shows. */
  figures(from: C): C;
}

export const BLAST_CAREER: CareerLadder<BlastCareer, Innings> = {
  mode: 'classic',
  scope: 'blast:',
  boards: BLAST_BOARDS,
  merge: mergeBlast,
  plausible: blastTallyPlausible,
  figures: from => ({
    innings: from.innings, runs: from.runs, balls: from.balls, sixes: from.sixes,
    fours: from.fours, wickets: from.wickets, dots: from.dots,
    highest: from.highest, notOut: from.notOut,
  }),
};

export const SURVIVE_CAREER: CareerLadder<SurviveCareer, SurviveTally> = {
  mode: 'survive',
  scope: 'survivecareer:',
  boards: SURVIVE_BOARDS,
  merge: mergeSurvive,
  plausible: surviveTallyPlausible,
  figures: from => ({
    innings: from.innings, runs: from.runs, balls: from.balls, sixes: from.sixes,
    fours: from.fours, blows: from.blows,
    wins: from.wins, draws: from.draws, losses: from.losses,
  }),
};

function clamp(value: number, low: number, high: number) {
  return value < low ? low : value > high ? high : value;
}
