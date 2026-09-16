import { GAME, LINES, LINE_X, QUICK_STYLES, SPECIALS, STYLES } from '../config/gameplay';
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
  /** How often the quicker one that goes straight on is slipped in. */
  armBallChance: number;
}

/** The two that turn. The arm ball is his too, and does neither. */
const TURNING: readonly DeliveryStyle[] = ['OFF_SPIN', 'LEG_SPIN'];
export const SPIN_STYLES: readonly DeliveryStyle[] = [...TURNING, 'ARM_BALL'];
const clampX = (v: number, limit: number) => Math.min(limit, Math.max(-limit, v));

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
export const CLASSIC_PLAN: BowlingPlan = { styles: STYLES, specials: SPECIALS, travelScale: GAME.travelScale };

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
  private chooseStyle(): DeliveryStyle {
    const { specials, styles } = this.plan;
    // His over is his. None of what follows — the yorker owed for a six, the
    // change-up owed for a spell of pace — belongs to a spinner, and a bouncer
    // least of all.
    if (this.spinnerOn) {
      const spell = this.plan.spin!;
      if (this.rng.next() < spell.armBallChance) return 'ARM_BALL';
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
    const line = this.aim(style) ?? this.bag.pop()!;
    if (QUICK_STYLES.includes(style)) this.quick++;
    const shape = this.plan.styles[style];
    const speedKph = Math.round(this.rng.range(shape.min, shape.max));
    const sign = style === 'SWING_IN' || style === 'OFF_SPIN' ? -1 : style === 'SWING_OUT' || style === 'LEG_SPIN' ? 1 : 0;
    // A ball that turns is not a ball that swings, so it is not drawn from the
    // same range: the off-spinner comes back in off the pitch by well over what
    // the seamer moves it through the air, and how far varies ball to ball
    // because a spinner who imparts identical revolutions every time is a
    // machine. The bag still deals him the odd line his aim did not ask for,
    // which is what keeps the over from being six of the same delivery.
    const spell = this.plan.spin;
    const turning = spell && TURNING.includes(style);
    const movement = sign * (turning
      ? this.rng.range(spell!.minTurn, spell!.maxTurn)
      : this.rng.range(GAME.movement * 0.65, GAME.movement));
    // However far it bites, it finishes inside the widest line the bag deals.
    // Turn on top of a line already wide is how a leg-break ends up a foot
    // outside off, and a wide is not a test of anything.
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
