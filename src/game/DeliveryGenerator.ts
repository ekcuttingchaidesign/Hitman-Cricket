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
  constructor(private rng: SeededRandom, private plan: BowlingPlan = CLASSIC_PLAN) {}
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
    const movement = sign * this.rng.range(GAME.movement * 0.65, GAME.movement);
    const durationMs = (GAME.releaseZ - GAME.contactZ) / (speedKph / 3.6) * 1000 * this.plan.travelScale * (shape.rush ?? 1);
    return { line, style, speedKph, baseTargetX: LINE_X[line], finalTargetX: LINE_X[line] + movement,
      bounceZ: shape.bounce ?? GAME.bounceZ, rise: shape.rise ?? GAME.rise,
      durationMs, releaseTimeMs, idealContactTimeMs: releaseTimeMs + durationMs };
  }
}
