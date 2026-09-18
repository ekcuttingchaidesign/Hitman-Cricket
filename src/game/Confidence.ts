import { CONFIDENCE_FULL, CONFIDENCE_STEP } from '../config/gameplay';
import type { ShotOutcome } from './types';

/**
 * The batter's confidence: full, it buys one special stroke — a charge down
 * the pitch at a quick, or a slog sweep off the knee at a spinner. Spending it
 * empties it, and so does losing a wicket — the meter is a run of form, not a
 * bank balance, so it cannot be saved up across a collapse.
 */
export class Confidence {
  value = 0;
  get full() { return this.value >= CONFIDENCE_FULL; }
  get fraction() { return this.value / CONFIDENCE_FULL; }
  record(outcome: Pick<ShotOutcome, 'runs' | 'isWicket' | 'advance' | 'swept' | 'defended'>) {
    // Both special strokes spend the meter, whatever they were worth.
    if (outcome.isWicket || outcome.advance || outcome.swept) { this.value = 0; return; }
    // A block is a decision, not a failure. It scores nothing and gains
    // nothing, but it does not cost what a ball beating the bat costs.
    if (outcome.defended) return;
    this.value = Math.max(0, Math.min(CONFIDENCE_FULL, this.value + (CONFIDENCE_STEP[outcome.runs] ?? 0)));
  }
}
