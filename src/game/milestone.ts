import type { ShotOutcome } from './types';

/**
 * A hundred, which is one batter's, not the side's.
 *
 * The Blast has three wickets, and in cricket each of them is a new man walking
 * out with nought against his name: a hundred is what one batter makes, so it
 * is counted from the last wicket rather than from the first ball. The Test
 * match is simpler — he is the last man, so everything he scores is his — and
 * the same count gives that answer without being told which innings it is.
 */
export const CENTURY = 100;

/** What the man at the crease has made: every run since the last wicket fell. */
export function batterRuns(history: readonly ShotOutcome[]) {
  let runs = 0;
  for (const ball of history) runs = ball.isWicket ? 0 : runs + ball.runs;
  return runs;
}

/**
 * Whether the ball just played took him to his hundred. Only the ball that
 * crosses it: the next boundary after a hundred is not another one, and a ball
 * he is out to is the end of his innings, not a milestone in it.
 */
export function reachedCentury(history: readonly ShotOutcome[]) {
  const last = history.at(-1);
  if (!last || last.isWicket) return false;
  const now = batterRuns(history);
  return now >= CENTURY && now - last.runs < CENTURY;
}
