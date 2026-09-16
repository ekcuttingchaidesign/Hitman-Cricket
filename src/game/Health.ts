import { HEALTH } from '../config/survive.js';
import type { ShotOutcome } from './types.js';

/**
 * How much of a battering the batter has left in him.
 *
 * Deliberately shaped like `Confidence` — it takes that meter's place on the
 * HUD and in the innings — but it is its opposite in every way that matters.
 * Confidence is earned and spent and can be earned again; this only ever goes
 * down. Nothing heals it, not an over's rest and not a boundary, and that is
 * the whole reason it is worth looking at: a number that can come back is a
 * resource, and a number that cannot is a clock.
 *
 * It ends an innings without a wicket falling, which no other rule in this game
 * does. `blows` is kept because an end card that says a batter retired hurt
 * should be able to say what it took, rather than naming the last ball as
 * though that one blow had been the whole of it.
 */
export class Health {
  value: number = HEALTH.full;
  /** Every blow taken this innings, in order. */
  blows: { where: string; damage: number }[] = [];

  get fraction() { return Math.max(0, this.value) / HEALTH.full; }
  /** One more blow and he is off. The screen says so from here on. */
  get critical() { return this.value > 0 && this.value <= HEALTH.critical; }
  get spent() { return this.value <= 0; }

  record(outcome: Pick<ShotOutcome, 'hit'>) {
    if (!outcome.hit) return;
    this.blows.push({ where: outcome.hit.where, damage: outcome.hit.damage });
    this.value = Math.max(0, this.value - outcome.hit.damage);
  }
}
