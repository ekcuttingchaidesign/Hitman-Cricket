import { CLASSIC_SPIN, GAME, LINES, LINE_X, QUICK_STYLES, SPECIALS, STYLES } from '../config/gameplay';
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
export function spinOvers(rng: SeededRandom, spell: SpinSpell): Set<number> {
  if (spell.overs <= 0) return new Set();
  const later: number[] = [];
  for (let over = spell.notBefore + 1; over < spell.ofOvers; over++) later.push(over);
  return new Set([spell.notBefore, ...rng.shuffle(later).slice(0, spell.overs - 1)]);
}
export const CLASSIC_PLAN: BowlingPlan = {
  styles: STYLES, specials: SPECIALS, travelScale: GAME.travelScale, spin: CLASSIC_SPIN,
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
  private readonly spinning: Set<number>;
  constructor(private rng: SeededRandom, private plan: BowlingPlan = CLASSIC_PLAN) {
    this.spinning = plan.spin ? spinOvers(rng, plan.spin) : new Set();
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
