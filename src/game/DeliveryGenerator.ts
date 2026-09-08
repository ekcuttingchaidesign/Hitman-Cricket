import { GAME, LINES, LINE_X, QUICK_STYLES, SPECIALS, STYLES } from '../config/gameplay';
import { SeededRandom } from './SeededRandom';
import type { BallLine, Delivery, DeliveryStyle, ShotOutcome } from './types';
export class DeliveryGenerator {
  private bag: BallLine[] = [];
  /** Sixes conceded since the last yorker, quick balls since the last change-up. */
  private punished = 0;
  private quick = 0;
  constructor(private rng: SeededRandom) {}
  /** The bowler watches what happens to him and answers it next ball. */
  record(outcome: ShotOutcome) { if (outcome.runs === 6) this.punished++; }
  private chooseStyle(): DeliveryStyle {
    if (this.punished >= SPECIALS.sixesForYorker) { this.punished = 0; return 'YORKER'; }
    // A change of pace only surprises once the batter has been fed quick ones.
    // Counting them consecutively would almost never fire, so they accumulate.
    if (this.quick >= SPECIALS.quickForSlower) { this.quick = 0; return 'SLOWER'; }
    if (this.rng.next() < SPECIALS.shortChance) return 'SHORT';
    let roll = this.rng.next();
    for (const [key, value] of Object.entries(STYLES)) {
      roll -= value.weight;
      if (roll <= 0) return key as DeliveryStyle;
    }
    return 'NORMAL';
  }
  next(releaseTimeMs: number): Delivery {
    if (!this.bag.length) this.bag = this.rng.shuffle(LINES);
    const line = this.bag.pop()!;
    const style = this.chooseStyle();
    if (QUICK_STYLES.includes(style)) this.quick++;
    const shape = STYLES[style];
    const speedKph = Math.round(this.rng.range(shape.min, shape.max));
    const sign = style === 'SWING_IN' || style === 'OFF_SPIN' ? -1 : style === 'SWING_OUT' || style === 'LEG_SPIN' ? 1 : 0;
    const movement = sign * this.rng.range(GAME.movement * 0.65, GAME.movement);
    const durationMs = (GAME.releaseZ - GAME.contactZ) / (speedKph / 3.6) * 1000 * GAME.travelScale * (shape.rush ?? 1);
    return { line, style, speedKph, baseTargetX: LINE_X[line], finalTargetX: LINE_X[line] + movement,
      bounceZ: shape.bounce ?? GAME.bounceZ, rise: shape.rise ?? GAME.rise,
      durationMs, releaseTimeMs, idealContactTimeMs: releaseTimeMs + durationMs };
  }
}
