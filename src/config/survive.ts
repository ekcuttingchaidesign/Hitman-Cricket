import type { BodyPart, DeliveryStyle, TimingGrade } from '../game/types.js';
import { GAME } from './gameplay.js';

/**
 * Survive: a tailender, one wicket, and ten overs to bat out.
 *
 * Everything this mode does differently from the innings in `gameplay.ts` is
 * written here, and nothing here is read by that mode. That separation is the
 * point: Survive shrinks the timing windows, reads the *sign* of a timing error
 * where the classic innings only reads its size, and can end an innings by
 * battering the batter rather than by dismissing him. None of that is an
 * improvement to the game everybody has already been playing, so none of it
 * reaches it — `GAME` is still exactly what it was, and `resolveShot` still
 * resolves a classic ball exactly as it did.
 *
 * The one thing borrowed wholesale is the pitch: `contactZ`, `releaseZ`,
 * `stanceX` and the rest are the geometry of a cricket field rather than rules
 * of a mode, so they are read straight off `GAME`.
 *
 * ## What the two win conditions are made of
 *
 * The chase and the draw are tuned by different dials, deliberately:
 *
 *   - **Whether 100 can be scored** is set by `STYLES` below — how many balls
 *     in an over are attackable at all. A competent player needs about thirty
 *     scoring shots to get there and has sixty balls to find them in, so the
 *     proportion of yorkers, express balls and bouncers decides the chase far
 *     more than any timing window does.
 *   - **Whether ten overs can be survived** is set by `DAMAGE.GLOVES`. Playing
 *     late is the safe mistake — the ball hits the glove rather than the
 *     stumps — so a batter who has worked out that blocking late keeps him in
 *     will do it all day. What stops him is that it hurts, a little, sixty
 *     times. That number is the price of the safe strategy and therefore the
 *     length of time the safe strategy lasts.
 *
 * Both were tuned against `scripts/survive-sim.ts` rather than by feel. What it
 * says at these numbers, over twenty-five thousand innings of each:
 *
 *            player        won   drawn  bowled  retire   runs  balls  health
 *   expert · chasing      73.2%    0.0%   26.8%    0.0%   86.9   27.5      90
 *   competent · chasing   18.7%    0.0%   81.3%    0.0%   48.2   19.3      91
 *   novice · chasing       0.3%    0.0%   99.7%    0.0%   16.2    8.9      95
 *   expert · blocking      0.0%   75.2%   12.5%   12.3%    0.0   54.8      38
 *   competent · blocking   0.0%    5.5%   54.8%   39.7%    0.0   29.5      34
 *
 * Which is the mode working as intended, in three readings. A competent player
 * chases it down about twice in ten. A good one blocking for the draw gets
 * there three times in four but arrives with a third of his health, and retires
 * hurt one time in eight — so the draw is survivable rather than safe. And
 * blocking does not save a middling player at all: he has to score.
 */

/** The innings, and what winning it means. */
export const SURVIVE = {
  totalBalls: 60,
  maxWickets: 1,
  ballsPerOver: 6,
  /** Runs to add to the score he walks out to. Always a hundred, so that two innings can be compared. */
  target: 100,
  /** The score at the other end, nine down. Cosmetic, but seeded so it survives a reload. */
  minTeamScore: 50,
  maxTeamScore: 250,
  /**
   * Less arcade padding on the flight than the classic innings carries. Raising
   * the speeds instead would put absurd numbers on the HUD; taking the padding
   * off makes a believable 155 arrive like a genuinely quick ball.
   */
  travelScale: 1.62,
  /**
   * A tailender's windows. Roughly two thirds of the classic ones, and the
   * reason the mode needs `Game.clockAt`: twenty-six milliseconds is under two
   * frames at sixty hertz, so a shot timed by the frame that noticed it rather
   * than by the press itself would be graded by rounding.
   */
  timing: { perfect: 26, good: 52, ok: 100, poor: 195 },
  /** Quick deliveries squeeze the windows further, but less brutally than classic's .82. */
  fastTimingScale: 0.86,
  /** How long an innings holds between balls. Trimmed, because sixty balls is a long sit. */
  readyMs: 420,
  resultMs: 760,
} as const;

/**
 * The block's own two thresholds, and they are deliberately *not* the attacking
 * windows above.
 *
 * A tailender cannot drive, but he can put bat in front of stumps — that is the
 * one thing he is for, and the mode says "he defends as he always could". Tying
 * the block to the attacking windows was the first thing tried and it made the
 * mode unplayable: at fifty-two milliseconds nearly half of all blocks failed,
 * and a batter with one wicket cannot fail at anything half the time.
 *
 * Inside `clean` the bat is on the ball and it dies. Between `clean` and
 * `beaten` there is bat involved but not enough of it: late it catches the
 * glove, early the ball is past the bat and into him or off the top edge.
 * Beyond `beaten` the bat is nowhere near and the ball does what it was always
 * going to do.
 */
export const BANDS = { clean: 86, beaten: 190 } as const;

/**
 * The batter's health, and what takes it away.
 *
 * `base` is what a blow costs at `nominalKph`; a faster ball costs more by the
 * square of its speed, because that is how the energy in a cricket ball
 * actually scales and because it produces the spread the mode wants without a
 * hand-written table — an express bouncer on the helmet is half an innings, the
 * same blow off a slower ball is a nuisance.
 *
 * Nothing heals. A batter who has been worked over stays worked over, which is
 * the whole of why the meter is worth watching.
 */
export const HEALTH = {
  full: 100,
  /** At or below this the screen keeps a red edge: one more blow and he is off. */
  critical: 25,
  nominalKph: 140,
} as const;

export const DAMAGE: Record<BodyPart, number> = {
  HELMET: 30,
  RIBS: 18,
  THIGH: 8,
  /**
   * The cheapest blow, and the most important number in the mode. See the note
   * at the top: this is what a batter pays for the safe mistake, so it decides
   * how long he can go on making it.
   */
  GLOVES: 11,
};

/** What a blow costs, by where it lands and how fast it arrived. */
export function damageFor(where: BodyPart, speedKph: number): number {
  const pace = speedKph / HEALTH.nominalKph;
  return Math.round(DAMAGE[where] * pace * pace);
}

/**
 * The bowling, and it is all quick. Two thirds of it is between 138 and 165,
 * which is the pace this mode is *about*; the slower ball is rare enough to
 * still be a surprise when it comes, and it is the ball this model punishes
 * hardest, because it is the one everybody plays early.
 *
 * `RIB` is the delivery the classic table never had: back of a length, climbing
 * to about eighty centimetres at the batter and still under the bails by the
 * time it reaches the stumps. That is the whole of why it exists — it is the
 * only ball in the game that can hit you in the ribs *and* bowl you, so it has
 * to be read rather than simply survived. Above a rise of about 2.2 it clears
 * the stumps and is a bouncer; below about 1.8 it is a length ball. The window
 * is narrow and these numbers sit in the middle of it.
 */
export const STYLES: Record<DeliveryStyle, { weight: number; min: number; max: number; label: string; rush?: number; tight?: boolean; bounce?: number; rise?: number }> = {
  NORMAL: { weight: 0.24, min: 138, max: 150, label: 'SEAM', rush: 0.86 },
  FAST: { weight: 0.19, min: 152, max: 165, label: 'FAST', rush: 0.78, tight: true },
  EXPRESS: { weight: 0.07, min: 168, max: 178, label: 'EXPRESS', rush: 0.70, tight: true },
  RIB: { weight: 0.13, min: 140, max: 158, label: 'BACK OF A LENGTH', rush: 0.84, bounce: 9.6, rise: 2.0 },
  SHORT: { weight: 0.09, min: 150, max: 165, label: 'BOUNCER', rush: 0.82, bounce: 10.4, rise: 2.9 },
  SLOWER: { weight: 0.06, min: 82, max: 100, label: 'SLOWER BALL', rush: 1.15 },
  SWING_IN: { weight: 0.11, min: 138, max: 152, label: 'INSWINGER', rush: 0.86 },
  SWING_OUT: { weight: 0.11, min: 138, max: 152, label: 'OUTSWINGER', rush: 0.86 },
  // Spin has no place in a spell this quick, and the yorker is earned rather
  // than rolled for — see SPECIALS.
  OFF_SPIN: { weight: 0, min: 72, max: 92, label: 'OFF SPIN' },
  LEG_SPIN: { weight: 0, min: 72, max: 92, label: 'LEG SPIN' },
  YORKER: { weight: 0, min: 158, max: 172, label: 'YORKER', rush: 0.64, tight: true, bounce: 1.6, rise: 0.28 },
};

/**
 * The bowler answering what is done to him. Both counters are slacker than the
 * classic innings', and they have to be: perfect timing pays six here, so sixes
 * come in clusters and a yorker every third one would be a yorker every over.
 * The same goes for the change-up — nearly every ball in this spell is quick,
 * so classic's threshold of four would fire the slower ball every fourth
 * delivery and it would stop being a surprise at all.
 *
 * `shortChance` is zero because the short ball is in the weight table above
 * rather than rolled for separately.
 */
export const SPECIALS = { sixesForYorker: 4, quickForSlower: 9, shortChance: 0 } as const;

/**
 * How close to the batter a ball has to finish before it is coming at him
 * rather than at the stumps. He stands at `GAME.stanceX`, outside leg, so this
 * is what makes a rising ball angled into the body a different proposition from
 * the same ball aimed at off stump — one hits him, the other is a dismissal.
 */
export const BODY_ZONE = 0.22;

/** How far outside off a ball has to finish before playing at it risks the edge. */
export const OFF_WIDTH = 0.16;

/**
 * What a mistake costs, once the sign and the line have decided what kind of
 * mistake it was.
 *
 * `mishitCaught` is far below the classic innings' .75 on purpose. Three
 * wickets can absorb a skied shot; one cannot, and at classic's rate a hundred
 * runs could not be chased by anybody. `nickCarries` is the same idea for the
 * outside edge: a feather to the keeper is the most common way a tailender
 * goes, so it has to be frequent enough to fear and rare enough to bat through.
 */
export const RISK = {
  mishitCaught: 0.26,
  nickCarries: 0.38,
  /** A ball that beats the bat on the stumps, with the batter's leg in the way. */
  lbwChance: 0.45,
  /**
   * Late on one that is straight. The ball catches the inside half of the bat
   * and almost always goes down into the pitch — this is the *common* way to
   * mistime, and making it a dismissal is what made the first build of this
   * mode end two innings in three inside an over.
   */
  playedOn: 0.10,
} as const;

/** A mistimed shot that goes up and lands safely is worth this, and never a boundary. */
export const SAFE_MISHIT: readonly (readonly [0 | 1, number])[] = [[0, 0.6], [1, 0.4]];

/** Middled, the grade still names the shot — but only these two are worth anything real. */
export const SURVIVE_TIMING: Record<TimingGrade, number> = { PERFECT: 1, GOOD: 0.82, OK: 0.58, POOR: 0.25, MISS: 0 };

/** The pitch is the pitch. Geometry comes from the classic config, unchanged. */
export const PITCH = {
  contactZ: GAME.contactZ, releaseZ: GAME.releaseZ, bounceZ: GAME.bounceZ,
  stumpZone: GAME.stumpZone, stumpHeight: GAME.stumpHeight, stanceX: GAME.stanceX,
} as const;

/** What the batter and bowler wear. Whites, and the ball stays red. */
export const WHITES = {
  shirt: 0xf2ece0, trousers: 0xf4f0e4, skin: 0xb77950,
  trim: 0xfbf7ec, cap: 0xe8e2d4, shoe: 0xfbf7ec,
} as const;
