import { CLASSIC_SPIN, GAME, LINES, LINE_X, QUICK_STYLES, SPECIALS, STYLES } from '../config/gameplay';
import {
  BOUNCERS, SPECIALS as SURVIVE_SPECIALS, SPIN, STYLES as SURVIVE_STYLES, SURVIVE,
} from '../config/survive';
import { SeededRandom } from './SeededRandom';
import type { BallLine, Delivery, DeliveryStyle, ShotOutcome } from './types';
/** What a mode's bowling is made of: the table to roll on and the two counters. */
export interface BowlingPlan {
  styles: typeof STYLES;
  specials: { sixesForYorker: number; quickForSlower: number; shortChance: number };
  /** How much arcade padding the flight carries. Survive uses less of it. */
  travelScale: number;
  /**
   * Whether a delivery may be aimed rather than drawn from the bag of lines.
   *
   * The bag deals all five lines evenly, which is right for a bowler trying to
   * take a wicket and wrong for one trying to hit somebody. A bouncer bowled at
   * fifth stump is a wide; the whole point of one is that it is coming at the
   * batter's head. Styles carrying `aimBody` or `aimWide` take that line instead
   * of the bag's, and the bag goes on dealing the rest — so the lines a batter
   * actually faces stay varied while the short ball stops being a free one.
   */
  aimed?: boolean;
  /** The spinner's spell, if this mode has one. See `SpinSpell`. */
  spin?: SpinSpell;
  /**
   * The short-pitched plan, when the mode bowls to one. Placed rather than
   * rolled for — see `ShortPlan` — and the two are mutually exclusive: a mode
   * with a plan takes the bouncer out of its weight table, or it gets both.
   */
  short?: ShortPlan;
}

/**
 * A bouncer quota per over, and a bigger one at the death.
 *
 * The count is placed rather than rolled for, which is the whole point: a
 * probability leaves innings with no short ball in them at all, and this
 * promises one an over and never two the same. `deathOvers` are the last overs
 * of the innings, which the spinner is kept out of so the quicks can finish.
 */
export interface ShortPlan {
  perOver: number;
  atTheDeath: number;
  deathOvers: number;
  ofOvers: number;
  ballsPerOver: number;
}

/** Whether this over is one of the last ones, which the quick bowlers keep. */
export function atTheDeath(over: number, plan: ShortPlan): boolean {
  return over >= plan.ofOvers - plan.deathOvers;
}

/**
 * A spell of spin measured in overs rather than in deliveries.
 *
 * Every other change in this game is per-ball: a yorker is earned, a bouncer is
 * rolled for, a slower ball is owed. Spin is not a ball, it is a bowler — so it
 * comes in whole overs, and inside one the seam bowler does not bowl at all.
 */
export interface SpinSpell {
  /** How many overs of the innings he is given. */
  overs: number;
  /** The first over he can have, counting from nought. */
  notBefore: number;
  /** How many overs the innings runs to. */
  ofOvers: number;
  ballsPerOver: number;
  /** How far the ball turns off the pitch, least and most. */
  minTurn: number;
  maxTurn: number;
  /** How wide a turning ball may finish, either side. */
  maxFinalX: number;
  /** How many of the six go straight on, and the chance of one more. */
  armBallsPerOver: number;
  secondArmBallChance: number;
}

/** The two that turn. The arm ball is his too, and does neither. */
const TURNING: readonly DeliveryStyle[] = ['OFF_SPIN', 'LEG_SPIN'];
export const SPIN_STYLES: readonly DeliveryStyle[] = [...TURNING, 'ARM_BALL'];

/**
 * Whether this is one of the spinner's three, the arm ball included.
 *
 * It lives here rather than with Survive's rules because both innings need it
 * now — the stationary action is the bowler's, not the mode's — and Survive.ts
 * says in its own first paragraph that nothing in it is reachable from the
 * classic innings, which has to stay true.
 */
export function spun(delivery: { style: DeliveryStyle }): boolean {
  return SPIN_STYLES.includes(delivery.style);
}
const clampX = (v: number, limit: number) => Math.min(limit, Math.max(-limit, v));

/**
 * The lines a ball turning this way can be pitched on and still bite.
 *
 * `sign` is -1 for the off break, which finishes further to leg, and +1 for the
 * leg break. A line qualifies when the gap between it and the tramline on the
 * side the ball is heading for is at least the smallest turn he bowls — so each
 * direction rules out exactly one line, the far one behind it, and keeps the
 * other four.
 */
function turnable(sign: number, spell: SpinSpell): BallLine[] {
  return LINES.filter(line => spell.maxFinalX - sign * LINE_X[line] >= spell.minTurn);
}

/**
 * Which overs the spinner gets, drawn once at the top of the innings.
 *
 * The first of them is not drawn at all: `notBefore` is always his, so the
 * change always comes at the same moment. Two overs of pace and then the ball
 * is tossed to the spinner — the batter has felt the quick bowling by then, and
 * taking it away is the point.
 *
 * The other two are drawn from everything after it, so when he comes *back* is
 * still an open question and nobody can bat to a timetable. They are shuffled
 * rather than rolled for independently, which would sometimes hand him the same
 * over twice and quietly bowl one of pace instead.
 */
export function spinOvers(rng: SeededRandom, spell: SpinSpell, keepForPace = 0): Set<number> {
  if (spell.overs <= 0) return new Set();
  const later: number[] = [];
  // The last overs are the quick bowlers'. A side nine down with two overs left
  // does not turn to spin, and the short-ball plan needs somewhere to land.
  for (let over = spell.notBefore + 1; over < spell.ofOvers - keepForPace; over++) later.push(over);
  return new Set([spell.notBefore, ...rng.shuffle(later).slice(0, spell.overs - 1)]);
}
export const CLASSIC_PLAN: BowlingPlan = {
  styles: STYLES, specials: SPECIALS, travelScale: GAME.travelScale, spin: CLASSIC_SPIN,
};

/**
 * How the Test match is bowled, beside the innings it is bowled in.
 *
 * It lives here rather than in `Game.ts` because it is not only the game that
 * bowls it: `scripts/survive-sim.ts` plays the mode a few hundred thousand
 * times to tune it, and when the plan was declared privately in `Game.ts` the
 * simulator kept a copy. The copy drifted the moment the short ball moved out
 * of the weight table and into a plan — the simulator went on reporting a mode
 * with no bouncers in it at all, which is the one number the change was made
 * to move. One declaration, imported by both, and that cannot happen again.
 */
export const SURVIVE_PLAN: BowlingPlan = {
  styles: SURVIVE_STYLES, specials: SURVIVE_SPECIALS, travelScale: SURVIVE.travelScale,
  // This bowler is aiming: the bouncer goes at the head and the express ball at
  // fifth stump, rather than both being dealt whatever line comes next.
  aimed: true,
  // The spell and the short-ball plan, each composed from the two halves that
  // know about it: SPIN and BOUNCERS say how they are bowled, SURVIVE says how
  // long the innings is, and neither has any business importing the other.
  spin: { ...SPIN, ofOvers: SURVIVE.totalBalls / SURVIVE.ballsPerOver, ballsPerOver: SURVIVE.ballsPerOver },
  short: { ...BOUNCERS, ofOvers: SURVIVE.totalBalls / SURVIVE.ballsPerOver, ballsPerOver: SURVIVE.ballsPerOver },
};

/** The lines that are at the batter rather than at the stumps: he stands outside leg. */
const BODY_LINES: BallLine[] = ['OUTSIDE_LEG', 'LEG'];
/** The lines that invite a drive at a ball he should be leaving. */
const WIDE_LINES: BallLine[] = ['OFF', 'OUTSIDE_OFF'];
export class DeliveryGenerator {
  private bag: BallLine[] = [];
  /** Sixes conceded since the last yorker, quick balls since the last change-up. */
  private punished = 0;
  private quick = 0;
  /** Deliveries bowled, which is how the generator knows which over it is in. */
  private bowled = 0;
  /** Which balls of the over now in progress go straight on. Drawn at its top. */
  private armBalls = new Set<number>();
  /** Which balls of the over now in progress are short. Drawn at its top. */
  private shortBalls = new Set<number>();
  /** The over those were drawn for, so they are drawn once and not per ball. */
  private shortOver = -1;
  private readonly spinning: Set<number>;
  constructor(private rng: SeededRandom, private plan: BowlingPlan = CLASSIC_PLAN) {
    this.spinning = plan.spin ? spinOvers(rng, plan.spin, plan.short?.deathOvers ?? 0) : new Set();
  }
  /** Whether the ball about to be bowled belongs to the spinner. */
  get spinnerOn() {
    return !!this.plan.spin && this.spinning.has(Math.floor(this.bowled / this.plan.spin.ballsPerOver));
  }
  /** The overs he was given, for the HUD and for a test that there are three. */
  get spell(): readonly number[] { return [...this.spinning].sort((a, b) => a - b); }
  /** The bowler watches what happens to him and answers it next ball. */
  record(outcome: ShotOutcome) { if (outcome.runs === 6) this.punished++; }
  /**
   * Where this delivery is being *put*, as opposed to where the bag would have
   * dealt it. Answers null for anything the bowler is not aiming, which is most
   * of the over.
   */
  private aim(style: DeliveryStyle): BallLine | null {
    if (!this.plan.aimed) return null;
    const shape = this.plan.styles[style];
    if (shape.aimBody && this.rng.next() < shape.aimBody) return this.pick(BODY_LINES);
    if (shape.aimWide && this.rng.next() < shape.aimWide) return this.pick(WIDE_LINES);
    return null;
  }
  private pick(lines: BallLine[]): BallLine { return lines[Math.floor(this.rng.next() * lines.length)]; }
  /**
   * Where in the over the ball that goes straight on comes. Placed rather than
   * rolled for, so it is never the whole over and never absent from it — and at
   * a position drawn fresh each time, so it is not the last ball every over.
   */
  private placeArmBalls(spell: SpinSpell): Set<number> {
    const positions = [];
    for (let ball = 0; ball < spell.ballsPerOver; ball++) positions.push(ball);
    const wanted = spell.armBallsPerOver + (this.rng.next() < spell.secondArmBallChance ? 1 : 0);
    return new Set(this.rng.shuffle(positions).slice(0, Math.min(wanted, spell.ballsPerOver)));
  }
  /**
   * Which balls of this over are short. The arm ball's idiom exactly: a count
   * placed at positions drawn fresh, so the over always has its quota and never
   * has it in the same place twice.
   */
  private placeShort(over: number, plan: ShortPlan): Set<number> {
    const positions = [];
    for (let ball = 0; ball < plan.ballsPerOver; ball++) positions.push(ball);
    const wanted = atTheDeath(over, plan) ? plan.atTheDeath : plan.perOver;
    return new Set(this.rng.shuffle(positions).slice(0, Math.min(wanted, plan.ballsPerOver)));
  }
  private chooseStyle(): DeliveryStyle {
    const { specials, styles } = this.plan;
    // His over is his. None of what follows — the yorker owed for a six, the
    // change-up owed for a spell of pace — belongs to a spinner, and a bouncer
    // least of all.
    if (this.spinnerOn) {
      const spell = this.plan.spin!;
      const ballInOver = this.bowled % spell.ballsPerOver;
      // The over is planned at the top of it rather than ball by ball, which is
      // the only way to promise the quicker one is in there somewhere.
      if (ballInOver === 0) this.armBalls = this.placeArmBalls(spell);
      if (this.armBalls.has(ballInOver)) return 'ARM_BALL';
      // And which way it turns is a coin, every ball. Nothing carries over from
      // the last one: two off breaks say nothing about the third.
      return this.rng.next() < 0.5 ? 'OFF_SPIN' : 'LEG_SPIN';
    }
    // The short ball is planned rather than rolled for where the mode says so,
    // and the plan is asked first — before the two owed deliveries, not after.
    // Asked after, a yorker earned by four sixes displaced the bouncer and the
    // over finished without one, which is the exact failure placing it was
    // meant to end. Neither debt is cleared by standing aside, so the yorker
    // simply arrives next ball.
    const short = this.plan.short;
    if (short) {
      const over = Math.floor(this.bowled / short.ballsPerOver);
      if (over !== this.shortOver) { this.shortOver = over; this.shortBalls = this.placeShort(over, short); }
      if (this.shortBalls.has(this.bowled % short.ballsPerOver)) return 'SHORT';
    }
    if (this.punished >= specials.sixesForYorker) { this.punished = 0; return 'YORKER'; }
    // A change of pace only surprises once the batter has been fed quick ones.
    // Counting them consecutively would almost never fire, so they accumulate.
    if (this.quick >= specials.quickForSlower) { this.quick = 0; return 'SLOWER'; }
    if (specials.shortChance > 0 && this.rng.next() < specials.shortChance) return 'SHORT';
    let roll = this.rng.next();
    for (const [key, value] of Object.entries(styles)) {
      roll -= value.weight;
      if (roll <= 0) return key as DeliveryStyle;
    }
    return 'NORMAL';
  }
  next(releaseTimeMs: number): Delivery {
    if (!this.bag.length) this.bag = this.rng.shuffle(LINES);
    const style = this.chooseStyle();
    const spell = this.plan.spin;
    const turning = !!spell && TURNING.includes(style);
    const sign = style === 'SWING_IN' || style === 'OFF_SPIN' ? -1 : style === 'SWING_OUT' || style === 'LEG_SPIN' ? 1 : 0;
    // A turning ball picks its line from the ones with somewhere to turn *to*,
    // rather than taking whatever the bag deals and being cut off at the
    // tramline afterwards. Clamping after the fact looked fine on the average
    // and was quietly broken at the edges: an off break dealt outside leg tried
    // to turn further into leg, lost all of it to the clamp, and came out dead
    // straight — a ball the over promises will turn, going nowhere, and not
    // even the arm ball. Three of the five lines are common to both directions,
    // so where it pitches still does not say which way it is going.
    const line = turning ? this.pick(turnable(sign, spell!)) : (this.aim(style) ?? this.bag.pop()!);
    if (QUICK_STYLES.includes(style)) this.quick++;
    const shape = this.plan.styles[style];
    const speedKph = Math.round(this.rng.range(shape.min, shape.max));
    // How much room this line leaves before the ball would finish wide, which
    // is what the turn is drawn against: every turning ball gets at least
    // `minTurn`, because the lines that could not offer that were not offered.
    const room = turning ? spell!.maxFinalX - sign * LINE_X[line] : 0;
    const movement = sign * (turning
      ? this.rng.range(spell!.minTurn, Math.min(spell!.maxTurn, room))
      : this.rng.range(GAME.movement * 0.65, GAME.movement));
    // Belt and braces: the line choice above already makes this unreachable.
    const finalTargetX = turning
      ? clampX(LINE_X[line] + movement, spell!.maxFinalX)
      : LINE_X[line] + movement;
    const durationMs = (GAME.releaseZ - GAME.contactZ) / (speedKph / 3.6) * 1000 * this.plan.travelScale * (shape.rush ?? 1);
    this.bowled++;
    return { line, style, speedKph, baseTargetX: LINE_X[line], finalTargetX,
      bounceZ: shape.bounce ?? GAME.bounceZ, rise: shape.rise ?? GAME.rise,
      durationMs, releaseTimeMs, idealContactTimeMs: releaseTimeMs + durationMs };
  }
}
