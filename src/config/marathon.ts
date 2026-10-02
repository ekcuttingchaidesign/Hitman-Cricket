import { BANDS, SURVIVE } from './survive.js';

/**
 * Test Marathon: three wickets, as many balls as they last, as many runs as
 * they make.
 *
 * Everything this mode does differently from Test Survival is written here, the
 * way `survive.ts` holds everything Survival does differently from the Blast —
 * and nothing here is read by either of them. The ball itself is Survival's:
 * the same ladder in `Survive.ts` resolves it, the same damage table prices a
 * blow, the same bowling fills the first ten overs. What is new is that there
 * are three batters, that they get worse, and that the bowling gets harder the
 * longer they last.
 *
 * `docs/MARATHON.md` is the spec, and every number here is one it states or
 * one `scripts/marathon-sim.ts` settled. What it says now, over three thousand
 * innings of each (runs/balls per batter):
 *
 *            player       runs  balls   opener    no. 3     tail   all out  hurt  past ov 20
 *   expert · chasing       381    154   242/86    96/43    43/25     66%    34%      74%
 *   expert · measured      303    154   192/84    76/43    35/26     42%    58%      78%
 *   competent · chasing    130     61    71/29    39/19    20/13     88%    13%       4%
 *   competent · measured   108     62    56/28    34/20    18/14     75%    25%       3%
 *
 * Each wicket costs about half the runs the last batter made, which is the drop
 * in skill showing up where a player will see it. A good player meets the
 * express bowler three innings in four, a competent one rarely gets past the
 * swing — the bowling is a ladder to climb, not a wall at the start. And one
 * express over to a fresh opener carries him off between three and sixteen
 * times in a hundred, by player, inside the spec's one in six.
 */

export const MARATHON = {
  /** The hard stop. Eighty-three overs and two balls; nobody is meant to reach it. */
  maxBalls: 500,
  /** Three batters, and the innings ends with the third. */
  batters: 3,
  ballsPerOver: 6,
  /**
   * The first ball after which a player may declare: once twenty overs are
   * done, which is also where the express bowler's own spells begin. Before it
   * a declaration would be a way of banking a quick start rather than batting.
   */
  declareFrom: 120,
  /** How the flight is padded, and how long the innings holds between balls: Survival's. */
  travelScale: SURVIVE.travelScale,
  readyMs: SURVIVE.readyMs,
  resultMs: SURVIVE.resultMs,
} as const;

export type Role = 'OPENER' | 'NO_3' | 'TAILENDER';

export interface Batter {
  role: Role;
  /** What the screen calls him when he walks out. */
  title: string;
  /** His attacking windows, in milliseconds either side of the ball. */
  timing: { perfect: number; good: number; ok: number; poor: number };
  /** His block: inside `clean` the ball dies on the bat, beyond `beaten` it is past him. */
  bands: { clean: number; beaten: number };
}

/**
 * The three, in the order they bat, and the skill falling with each wicket.
 *
 * The tailender is Survival's own, unchanged, so the last man in a Marathon is
 * exactly the man a Survival innings is about. The opener's windows are close
 * to the Blast's, though not all the way: he still faces Survival's bowling,
 * and the Blast's windows against it make every ball a boundary.
 *
 * The block falls with them, though by less. Putting bat in front of stumps is
 * the one thing every batter can do, so the tailender's block is already wide —
 * but an opener who defends no better than a number eleven is not an opener,
 * and with one block for all three the express bowler carried off the best
 * batter in the side exactly as often as the worst.
 */
export const BATTERS: readonly Batter[] = [
  { role: 'OPENER', title: 'OPENER', timing: { perfect: 36, good: 70, ok: 122, poor: 195 }, bands: { clean: 104, beaten: 216 } },
  { role: 'NO_3', title: 'NO. 3', timing: { perfect: 27, good: 55, ok: 100, poor: 180 }, bands: { clean: 95, beaten: 203 } },
  { role: 'TAILENDER', title: 'TAILENDER', timing: SURVIVE.timing, bands: BANDS },
];

/** Which of the three bowlers has the over. */
export type OverKind = 'PACE' | 'SPIN' | 'EXPRESS';

/**
 * The bowling, in blocks of ten overs. The block is the innings' over number,
 * not the batter's: a tailender who walks out at over thirty faces over
 * thirty's bowling.
 *
 *   - **Level 1**, overs 1–10: Survival's, but for its last-two-overs barrage —
 *     those are the end of Survival's innings and the middle of this one.
 *     The spinner has the third over, as in Survival, and two more drawn.
 *   - **Level 2**, overs 11–20: the ball starts to swing, later and further,
 *     and the express bowler has one over to show what is coming.
 *   - **Level 3**, from over 21, every ten after: four of the ten are his.
 *
 * `swing` multiplies how far a swinging ball moves and `late` is how much of
 * its flight to the pitch it holds its line first — nought for Survival's
 * gentle curve from the hand, which is hardly noticeable, and a third for a
 * ball that goes straight and then goes.
 */
export interface Level {
  level: 1 | 2 | 3;
  pace: number;
  spin: number;
  express: number;
  swing: number;
  late: number;
  /** An over the spinner always has, counting from nought within the block. */
  spinFirst?: number;
}

export const LEVELS: readonly Level[] = [
  { level: 1, pace: 7, spin: 3, express: 0, swing: 1, late: 0, spinFirst: 2 },
  { level: 2, pace: 7, spin: 2, express: 1, swing: 1.8, late: 0.35 },
  { level: 3, pace: 4, spin: 2, express: 4, swing: 1.8, late: 0.35 },
];

export const BLOCK_OVERS = 10;

/** The level a block is bowled at. The third repeats for as long as the innings does. */
export const levelOf = (block: number): Level => LEVELS[Math.min(block, LEVELS.length - 1)];

/**
 * The express bowler's over: all six at his pace, the length the only thing
 * that changes.
 *
 * About four full-length express balls, one bouncer every over and a second in
 * about one in three, and now and then the yorker. The bouncer and the yorker
 * are the same deliveries as Survival's, bowled at his speed rather than their
 * own, so a blow off one is priced off his pace by `damageFor` with no extra
 * multiplier — the square of 180 over 140 is dear enough.
 */
export const EXPRESS_OVER = {
  min: 172,
  max: 186,
  bouncers: 1,
  secondBouncerChance: 1 / 3,
  yorkerChance: 0.3,
} as const;

/** How a Marathon innings finished. */
export type MarathonEnding = 'ALL_OUT' | 'RETIRED' | 'BALLS' | 'DECLARED';
