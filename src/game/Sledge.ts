import type { ShotOutcome } from './types';

/** How many quiet balls in a row the fielders will take before they say so. */
export const SLEDGE_AFTER = 3;

/**
 * A ball the batter went nowhere with: blocked, left, or beaten. A wicket is
 * not one — there is nothing to needle a batter about once he is out.
 */
export const quietBall = (outcome: Pick<ShotOutcome, 'runs' | 'isWicket' | 'defended' | 'madeBatContact'>) =>
  !outcome.isWicket && outcome.runs === 0 && (!!outcome.defended || !outcome.madeBatContact);

/** Counts the run of balls the batter has not scored off. */
export class Sledger {
  private quiet = 0;
  /** True on the ball that completes a run, which then starts again from zero. */
  record(outcome: Parameters<typeof quietBall>[0]) {
    if (!quietBall(outcome)) { this.quiet = 0; return false; }
    if (++this.quiet < SLEDGE_AFTER) return false;
    this.quiet = 0;
    return true;
  }
}
