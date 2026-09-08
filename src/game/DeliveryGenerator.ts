import { GAME, LINES, LINE_X, STYLES } from '../config/gameplay';
import { SeededRandom } from './SeededRandom';
import type { BallLine, Delivery, DeliveryStyle } from './types';
export class DeliveryGenerator {
  private bag: BallLine[] = [];
  constructor(private rng: SeededRandom) {}
  next(releaseTimeMs: number): Delivery {
    if (!this.bag.length) this.bag = this.rng.shuffle(LINES);
    const line = this.bag.pop()!;
    let roll = this.rng.next();
    let style: DeliveryStyle = 'NORMAL';
    for (const [key, value] of Object.entries(STYLES)) {
      roll -= value.weight;
      if (roll <= 0) { style = key as DeliveryStyle; break; }
    }
    const speedKph = Math.round(this.rng.range(STYLES[style].min, STYLES[style].max));
    const sign = style === 'SWING_IN' || style === 'OFF_SPIN' ? -1 : style === 'SWING_OUT' || style === 'LEG_SPIN' ? 1 : 0;
    const movement = sign * this.rng.range(GAME.movement * 0.65, GAME.movement);
    const durationMs = (GAME.releaseZ - GAME.contactZ) / (speedKph / 3.6) * 1000 * GAME.travelScale * (STYLES[style].rush ?? 1);
    return { line, style, speedKph, baseTargetX: LINE_X[line], finalTargetX: LINE_X[line] + movement,
      bounceZ: GAME.bounceZ, releaseTimeMs, durationMs, idealContactTimeMs: releaseTimeMs + durationMs };
  }
}
