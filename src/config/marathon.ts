import type { BallLine, DeliveryStyle } from '../game/types.js';
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
 *   expert · chasing       411    162   256/90   107/46    48/27     66%    34%      77%
 *   expert · measured      355    164   216/89    95/47    43/28     46%    54%      80%
 *   competent · chasing    131     61    71/29    40/19    21/13     90%    10%       4%
 *   competent · measured   111     61    57/28    35/20    19/13     79%    21%       3%
 *
 * Each wicket costs about half the runs the last batter made, which is the drop
 * in skill showing up where a player will see it. A good player meets the
 * express bowler three innings in four, a competent one rarely gets past the
 * swing — the bowling is a ladder to climb, not a wall at the start. And one
 * express over to a fresh opener carries him off between three and fifteen
 * times in a hundred, by player, inside the spec's one in six. The simulated
 * batter always knows where the ball finishes, so how much harder the swing is
 * to read is the one thing it cannot say; that is for playtesting.
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
 * gentle curve from the hand, which is hardly noticeable, and two fifths for a
 * ball that goes straight and then goes.
 *
 * From Level 2 the pace bowler is a swing bowler, and `swingShare` is how much
 * of what he rolls for swings: two thirds, split evenly, so an over is about a
 * third inswingers, a third outswingers and a third straight — the seam, the
 * quick one, the ball into the ribs and the placed bouncer, on any line. The
 * two that swing start on the lines they swing from (`SWING_LINES`).
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
  /** How much of the pace bowler's roll swings, in and out evenly; absent leaves Survival's table. */
  swingShare?: number;
  /** And his reverse swing, placed in the over rather than rolled for: see `REVERSE`. */
  reverse?: { perOver: number; secondChance: number };
}

export const LEVELS: readonly Level[] = [
  { level: 1, pace: 7, spin: 3, express: 0, swing: 1, late: 0, spinFirst: 2 },
  { level: 2, pace: 7, spin: 2, express: 1, swing: 2.6, late: 0.4, swingShare: 0.6, reverse: { perOver: 1, secondChance: 0.5 } },
  { level: 3, pace: 4, spin: 2, express: 4, swing: 2.6, late: 0.4, swingShare: 0.6, reverse: { perOver: 1, secondChance: 0.5 } },
];

export const BLOCK_OVERS = 10;

/**
 * Where the swing bowler starts each of his two. The inswinger is pitched on
 * or outside off and comes back into the batter; the outswinger is pitched on
 * middle or leg and goes away from him, after the edge. A ball that swings
 * from where it would have to start to be any use is a ball worth reading.
 */
export const SWING_LINES: Partial<Record<DeliveryStyle, readonly BallLine[]>> = {
  SWING_IN: ['OFF', 'OUTSIDE_OFF'],
  SWING_OUT: ['LEG', 'MIDDLE'],
};

/**
 * Reverse swing: the swing bowler's variation, placed in his over the way the
 * bouncer is — one in every over he swings it, a second in about half of
 * them, never more, at positions drawn fresh each over and never on the
 * bouncer's. Where his ordinary swing bends in the air on the way down, this
 * one goes to the pitch dead straight and darts off it, late and a long way
 * — two to three stumps' width — at 142 to 156 kph (141 to 147 on the gun),
 * so it is on the batter before a player who has read the line off the hand
 * can change his mind.
 * The reverse inswinger starts on or outside off and comes back into him,
 * the reverse outswinger starts on middle or leg and goes away, as his
 * ordinary two do. Held to the same widest line, so it is never a wide.
 */
export const REVERSE = {
  min: 0.3,
  max: 0.42,
  lines: { REVERSE_IN: ['OFF', 'OUTSIDE_OFF'], REVERSE_OUT: ['LEG', 'MIDDLE'] } as Partial<Record<DeliveryStyle, readonly BallLine[]>>,
  /** How far through its flight it has finished moving: after the bounce, and before the bat. */
  settled: 0.92,
} as const;

export const isReverse = (style: DeliveryStyle) => style === 'REVERSE_IN' || style === 'REVERSE_OUT';

/** The level a block is bowled at. The third repeats for as long as the innings does. */
export const levelOf = (block: number): Level => LEVELS[Math.min(block, LEVELS.length - 1)];

/**
 * The over, counting from nought, from which the pace bowler swings it. The
 * first playtest found ten overs of Survival's gentle bowling too long a
 * start — an opener made 240 of 284 in twenty-two overs — so the swing comes
 * on after five, a block early. Only the swing: who bowls which over is
 * still the block's, so the express bowler waits for the eleventh as before.
 */
export const SWING_FROM = 5;

/**
 * The level over `over` is bowled at, which is its block's — except that the
 * overs of the first block from `SWING_FROM` on carry Level 2's swing.
 */
export function levelAt(over: number): Level {
  const block = Math.floor(over / BLOCK_OVERS);
  if (block > 0 || over < SWING_FROM) return levelOf(block);
  const swinging = LEVELS[1];
  return { ...LEVELS[0], level: 2, swing: swinging.swing, late: swinging.late, swingShare: swinging.swingShare, reverse: swinging.reverse };
}

/**
 * The express bowler's over: his pace, and the length the main thing that
 * changes.
 *
 * One bouncer every over and a second in about one in three, a yorker every
 * over, and in about one over in two a slower ball — the one change of pace an
 * express bowler has, and the more of a trap for everything round it being so
 * quick. The rest are full and fast. The bouncer and the yorker are Survival's
 * deliveries bowled at his speed rather than their own, so a blow off one is
 * priced off his pace by `damageFor` with no extra multiplier — the square of
 * 180 over 140 is dear enough. The slower ball has its own speed, below.
 */
export const EXPRESS_OVER = {
  min: 172,
  max: 186,
  bouncers: 1,
  secondBouncerChance: 1 / 3,
  yorkers: 1,
  slowerChance: 0.5,
  /** His slower ball: well off his pace, still quicker than a seamer's change-up. */
  slower: { min: 112, max: 126 },
} as const;

/**
 * Getting your eye in, and what comes of it.
 *
 * Every batter walks out unsettled, with no meter to spend and no special
 * stroke to play. Each ball he faces settles him a little — a block and a
 * leave as much as a four — and a blow knocks him back by the size of it, a
 * ball for every four points the blow costs his meter: a glove off a seamer is
 * about four balls, the express bowler on the helmet nearly twenty. Thirty
 * balls, five overs of it, and he is settled — thirty-six was tried first and
 * the playtest found it too long a wait.
 *
 * Settled, the same meter is his confidence, and it starts a quarter full. It
 * fills with the strokes he plays and with the balls he blocks, more slowly
 * than the Blast's — a Test innings is built, not slogged — and empties with
 * being beaten and being hit. Full, it buys one special stroke, exactly as in
 * the Blast. He never goes back to being unsettled: a battering costs him his
 * confidence, not the five overs it took to find his feet.
 */
export const SETTLE = {
  balls: 30,
  /** Balls of settling, or points of confidence, a blow costs per point of injury. */
  perBlowPoint: 1 / 4,
  /** Where his confidence starts the moment he is settled. */
  confidenceOnSettling: 25,
} as const;

export const CONFIDENCE = {
  full: 100,
  /** What each stroke adds, by the runs it was worth. */
  step: { 6: 12, 4: 10, 3: 6, 2: 4, 1: 2 } as Record<number, number>,
  /** A ball blocked: patience is part of it. */
  defended: 2,
  /** Played at and beaten, or edged for nothing. */
  beaten: -10,
} as const;

/**
 * The two moments the innings changes under the batter are put up on the
 * screen, the way a broadcast would: the ball starting to swing, with the
 * cloud coming over, and the express bowler's first over. Each is told once an
 * innings, at the top of the over it begins, and the bowler waits at his mark
 * for this long while it is up — a banner gone before it can be read is the
 * same as no banner.
 */
export const LEVEL_BANNER_MS = 2600;
export type LevelBanner = 'swing' | 'express';

/** How a Marathon innings finished. */
export type MarathonEnding = 'ALL_OUT' | 'RETIRED' | 'BALLS' | 'DECLARED';
