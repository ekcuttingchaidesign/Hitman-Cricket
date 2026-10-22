import type { BallLine } from '../game/types.js';
import { BATTERS as MARATHON_BATTERS, type Level, type OverKind } from './marathon.js';

/**
 * Super10: ten overs, three wickets, five bowlers.
 *
 * The ball is the Blast's — its ladder (`resolveShot`), its confidence meter
 * and its charge — and everything Super10 does differently is written here, the
 * way `marathon.ts` holds what the Marathon does differently from Survival.
 * Nothing here is read by any other mode.
 *
 * What is here so far is the mode and its bowling. The field that will keep
 * its totals believable (boundary riders, the captain, Power Surge) is still
 * being designed, so until it arrives the innings is played but never posted
 * or counted: see `practising` in `Game.ts`.
 */
export const SUPER10 = {
  overs: 10,
  ballsPerOver: 6,
  totalBalls: 60,
  maxWickets: 3,
  /** The first three overs are the Powerplay: two men out, when the field arrives. */
  powerplay: 3,
  /** And the last two the death, where the timing is a little harder (`DEATH_TIMING`). */
  deathFrom: 8,
} as const;

export type Windows = { perfect: number; good: number; ok: number; poor: number };

/**
 * How much narrower the window for a six is than the Marathon batter's own.
 *
 * In the Blast a perfect swing is a six and a good one a four, and over ten
 * overs that is three hundred runs: a simulated strong player hit twenty-five
 * sixes an innings. A narrower perfect window turns most of them into fours,
 * and the field (still to come) turns most fours into ones and twos.
 */
export const SIX_WINDOW = 0.6;

export interface Super10Batter {
  title: string;
  timing: Windows;
}

/**
 * The three, in the order they bat: the Marathon's opener, No. 3 and
 * tailender, each worse than the last, with the six window narrowed for all
 * three. Who is in is simply how many wickets have fallen.
 */
export const BATTERS: readonly Super10Batter[] = MARATHON_BATTERS.map(b => ({
  title: b.title,
  timing: { ...b.timing, perfect: Math.round(b.timing.perfect * SIX_WINDOW) },
}));

/**
 * The last two overs: every window but the miss a shade narrower, for the
 * yorkers and the pace. A big finish has to be earned.
 */
export const DEATH_TIMING = 0.85;

/** The man in, by wickets down: the tailender stays in once he is. */
export const batterAt = (wickets: number): Super10Batter => BATTERS[Math.min(wickets, BATTERS.length - 1)];

/** The windows the ball about to be played is graded on: whoever is in, and the death's. */
export function windowsAt(wickets: number, balls: number): Windows {
  const { timing } = batterAt(wickets);
  if (Math.floor(balls / SUPER10.ballsPerOver) < SUPER10.deathFrom) return timing;
  return {
    perfect: Math.round(timing.perfect * DEATH_TIMING),
    good: Math.round(timing.good * DEATH_TIMING),
    ok: Math.round(timing.ok * DEATH_TIMING),
    poor: timing.poor,
  };
}

/** Who bowls an over: the five, as the players will come to know them by their actions. */
export type Bowler = 'SWING' | 'SEAM' | 'SPIN' | 'SLING' | 'DEATH';

/**
 * Five bowlers, two overs each, and nobody bowls two running. The Powerplay
 * opens with the new ball swinging; the spinner always has the fourth and the
 * sling bowler the fifth, so every innings meets every bowler; the sixth and
 * seventh are the spinner's second and the seamer's, in an order drawn off the
 * seed; and the death bowler and the sling bowler close it.
 */
export function scheduleOf(rng: { next(): number }): Bowler[] {
  const middle: Bowler[] = rng.next() < 0.5 ? ['SPIN', 'SEAM'] : ['SEAM', 'SPIN'];
  return ['SWING', 'SEAM', 'SWING', 'SPIN', 'SLING', ...middle, 'DEATH', 'SLING', 'DEATH'];
}

/** What the generator calls each of them: pace, spin, the express bowler's over, or the death bowler's. */
export const KIND: Record<Bowler, OverKind> = { SWING: 'PACE', SEAM: 'PACE', SPIN: 'SPIN', SLING: 'EXPRESS', DEATH: 'DEATH' };

/**
 * The seamer bowls the Blast's own over: the Blast's table, swinging as
 * gently as it always has.
 */
export const SEAM_LEVEL: Level = { level: 1, pace: 0, spin: 0, express: 0, swing: 1, late: 0 };
/**
 * The swing bowler with the new ball: the Marathon's swing, later and further,
 * two thirds of what he rolls for swinging, and the Marathon's swing bowler's
 * own balls, at his speeds and with his time to the bat (`bowledAs` in
 * `SUPER10_PLAN`). No reverse: a ten-over ball is never old enough for it.
 */
export const SWING_LEVEL: Level = { level: 2, pace: 0, spin: 0, express: 0, swing: 2.6, late: 0.4, swingShare: 0.6 };

/**
 * The death bowler's over, planned at the top of it the way the express
 * bowler's is: two yorkers, one of them often wide of off stump, a slower ball
 * that dips, and in half his overs a slower bouncer; the rest full and quick.
 * About 135 to 145 on the gun.
 */
export const DEATH_OVER = {
  min: 135,
  max: 145,
  yorkers: 2,
  /** How often one of the yorkers is the wide one, outside off. */
  wideChance: 0.5,
  wideLine: 'OUTSIDE_OFF' as BallLine,
  slower: { min: 108, max: 118 },
  slowBouncerChance: 0.5,
  slowBouncer: { min: 118, max: 126 },
} as const;

/**
 * Each bowler bowling to his field (`fieldFor` in `src/game/super10-field.ts`),
 * by the field: this share of his balls aimed at these lines, the rest dealt
 * from the bag. A field is set for the stroke its lines ask for, so the
 * natural stroke goes into the men and the gap is against the line, which the
 * steering's stretch makes the riskier hit. With the new ball, men round the
 * off side and the ball outside off; the hard length and the square riders
 * straighter, nothing wide to cut; the cutters and the straight field at the
 * stumps and the pads, long-on and deep midwicket out; the wide yorker wide of
 * off, long-off and deep cover out. The spinner's lines are his turn's and the
 * sling bowler's his bouncers' (`aimBody`), so neither's fields are listed.
 */
export const BOWL_TO: Partial<Record<string, { lines: readonly BallLine[]; share: number }>> = {
  'new-ball': { lines: ['OFF', 'OUTSIDE_OFF'], share: .5 },
  'square-riders': { lines: ['MIDDLE', 'OFF'], share: .45 },
  'hard-length': { lines: ['MIDDLE', 'OFF'], share: .45 },
  cutters: { lines: ['MIDDLE', 'LEG'], share: .45 },
  straight: { lines: ['MIDDLE', 'LEG'], share: .5 },
  'wide-yorker': { lines: ['OFF', 'OUTSIDE_OFF'], share: .5 },
};
