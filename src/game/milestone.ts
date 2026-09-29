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
export const FIFTY = 50;

/** The three moments the game stops for, biggest first. */
export type Milestone = 'six-sixes' | 'century' | 'fifty';

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
  return crossed(history, CENTURY);
}
/** His fifty, the same way: the ball that crosses it, and only that one. */
export function reachedFifty(history: readonly ShotOutcome[]) {
  return crossed(history, FIFTY);
}
function crossed(history: readonly ShotOutcome[], mark: number) {
  const last = history.at(-1);
  if (!last || last.isWicket) return false;
  const now = batterRuns(history);
  return now >= mark && now - last.runs < mark;
}

/**
 * Six sixes in a row — for Yuvraj Singh, who did it in an over at Durban in
 * 2007. Six balls running, each hit for six, and the ball before them not:
 * the seventh six in a row is a fine thing, but it is not the sixth.
 */
export function sixSixes(history: readonly ShotOutcome[]) {
  if (history.length < 6) return false;
  const run = history.slice(-6);
  if (!run.every(ball => ball.runs === 6 && !ball.isWicket)) return false;
  const before = history.at(-7);
  return !before || before.runs !== 6 || before.isWicket;
}

/** Which moment, if any, the ball just played was. Only the biggest is kept. */
export function milestoneOf(history: readonly ShotOutcome[]): Milestone | null {
  return sixSixes(history) ? 'six-sixes' : reachedCentury(history) ? 'century' : reachedFifty(history) ? 'fifty' : null;
}
