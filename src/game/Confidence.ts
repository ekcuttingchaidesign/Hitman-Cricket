import { CONFIDENCE_FULL, CONFIDENCE_STEP } from '../config/gameplay';
import type { Delivery, ShotOutcome, ShotType } from './types';

/**
 * The batter's confidence: full, it buys one special stroke — a charge down
 * the pitch at a quick, or a slog sweep off the knee at a spinner. Spending it
 * empties it, and so does losing a wicket — the meter is a run of form, not a
 * bank balance, so it cannot be saved up across a collapse.
 */
/** One of the strokes a full meter buys: the charge, the slog sweep, a scoop. */
export function specialStroke(outcome: Pick<ShotOutcome, 'advance' | 'swept' | 'scooped'>) {
  return !!(outcome.advance || outcome.swept || outcome.scooped);
}

/**
 * A special stroke that found the bat and did not get him out: the ones that
 * get the flash of grey and fire (see `powerDoodle`). One he was out to is
 * not a moment to set on fire.
 */
export function landedSpecial(outcome: Pick<ShotOutcome, 'advance' | 'swept' | 'scooped' | 'madeBatContact' | 'isWicket'>) {
  return specialStroke(outcome) && outcome.madeBatContact && !outcome.isWicket;
}

/**
 * A bouncer pulled and hit: the one ordinary stroke that gets a flash of its
 * own (see `pullDoodle`) — focus lines, a swoosh behind the bat and a streak
 * behind the ball, in either mode. Only a middled pull hits a bouncer at all;
 * anything less goes through, over, or off the glove. So it is rare, and it
 * should feel it. A special stroke is never this: it has its own flash.
 */
export function pulledBouncer(delivery: Pick<Delivery, 'style'>, shot: ShotType | undefined,
  outcome: Pick<ShotOutcome, 'advance' | 'swept' | 'scooped' | 'madeBatContact' | 'isWicket' | 'runs'>) {
  return delivery.style === 'SHORT' && shot === 'LEG' && !specialStroke(outcome)
    && outcome.madeBatContact && !outcome.isWicket && outcome.runs > 0;
}

export class Confidence {
  value = 0;
  get full() { return this.value >= CONFIDENCE_FULL; }
  get fraction() { return this.value / CONFIDENCE_FULL; }
  record(outcome: Pick<ShotOutcome, 'runs' | 'isWicket' | 'advance' | 'swept' | 'scooped' | 'defended'>) {
    // Every special stroke spends the meter, whatever it was worth.
    if (outcome.isWicket || specialStroke(outcome)) { this.value = 0; return; }
    // A block is a decision, not a failure. It scores nothing and gains
    // nothing, but it does not cost what a ball beating the bat costs.
    if (outcome.defended) return;
    this.value = Math.max(0, Math.min(CONFIDENCE_FULL, this.value + (CONFIDENCE_STEP[outcome.runs] ?? 0)));
  }
}
