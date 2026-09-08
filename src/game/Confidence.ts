import { CONFIDENCE_FULL, CONFIDENCE_STEP } from '../config/gameplay';
import type { ShotOutcome } from './types';

/**
 * The batter's confidence: full, it buys one charge down the pitch. Spending it
 * empties it, and so does losing a wicket — the meter is a run of form, not a
 * bank balance, so it cannot be saved up across a collapse.
 */
export class Confidence {
  value = 0;
  get full() { return this.value >= CONFIDENCE_FULL; }
  get fraction() { return this.value / CONFIDENCE_FULL; }
  record(outcome: Pick<ShotOutcome, 'runs' | 'isWicket' | 'advance'>) {
    if (outcome.isWicket || outcome.advance) { this.value = 0; return; }
    this.value = Math.max(0, Math.min(CONFIDENCE_FULL, this.value + (CONFIDENCE_STEP[outcome.runs] ?? 0)));
  }
}
