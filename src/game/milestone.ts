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

/**
 * How close he is to one of the moments, while he is close: the last ten runs
 * to a fifty or a hundred, or three sixes running and counting.
 *
 * The celebrations are the payoff; this is the wait for them. A hundred that
 * arrives out of nowhere is a surprise, and one watched coming from 92 is an
 * event — so for the ten runs before each mark, and from the third six in a
 * row, there is something on the screen saying so.
 *
 * One at a time, the most fragile first: a run of sixes ends on the very next
 * ball that is not one, where the nineties can last an over.
 */
export type Nearing =
  | { kind: 'century' | 'fifty'; runs: number; need: number }
  | { kind: 'six-sixes'; sixes: number };

/** How many runs short of a mark the wait begins. */
export const NEAR = 10;
/** How many sixes running before the slots go up. */
export const SIXES_SHOWN = 3;

/** Sixes on the trot, counted back from the last ball. */
export function sixStreak(history: readonly ShotOutcome[]) {
  let streak = 0;
  for (let i = history.length - 1; i >= 0 && history[i].runs === 6 && !history[i].isWicket; i--) streak++;
  return streak;
}

export function nearingOf(history: readonly ShotOutcome[]): Nearing | null {
  const sixes = sixStreak(history);
  if (sixes >= SIXES_SHOWN && sixes < 6) return { kind: 'six-sixes', sixes };
  const runs = batterRuns(history);
  if (runs >= CENTURY - NEAR && runs < CENTURY) return { kind: 'century', runs, need: CENTURY - runs };
  if (runs >= FIFTY - NEAR && runs < FIFTY) return { kind: 'fifty', runs, need: FIFTY - runs };
  return null;
}

/**
 * How a wait that was on the screen came off it, if it did: he got there, he
 * was out short of it, or the sixes stopped. Null while it is still on.
 */
export type NearingEnd = { how: 'reached'; runs: number } | { how: 'out'; runs: number } | { how: 'broken' };

export function nearingEnd(before: Nearing | null, history: readonly ShotOutcome[]): NearingEnd | null {
  if (!before) return null;
  const now = nearingOf(history);
  if (now?.kind === before.kind) return null;
  const reached = before.kind === 'six-sixes' ? sixSixes(history)
    : before.kind === 'century' ? reachedCentury(history) : reachedFifty(history);
  if (reached) return { how: 'reached', runs: batterRuns(history) };
  const last = history.at(-1);
  if (last?.isWicket) {
    // Out for what he had made, which the ball he was out to added nothing to.
    let runs = 0;
    for (const ball of history.slice(0, -1)) runs = ball.isWicket ? 0 : runs + ball.runs;
    return { how: 'out', runs };
  }
  return { how: 'broken' };
}
