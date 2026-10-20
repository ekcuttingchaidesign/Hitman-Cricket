/**
 * The pull off the spinner, counted: what one innings did with the spinner's
 * ball dropped short and with the pull off him, kept a ball at a time and sent
 * to GoatCounter once, when the innings ends (`spinPullMarks`). Once an
 * innings rather than once a ball, so a long Marathon does not outweigh a
 * Blast; `spinshort-faced` is what the rest are read against.
 */
export interface SpinPullTally {
  /** Balls dropped short he faced. */
  faced: number;
  /** Balls he pulled, the short ball and the arm ball timed well enough. */
  pulled: number;
  /** Of those, the arm ball's. */
  arm: number;
  sixes: number;
  fours: number;
  /** Out off it. */
  outs: number;
  /** Swung at and beaten. */
  missed: number;
  /** The short ball met with any other stroke. */
  other: number;
}

export const freshSpinPulls = (): SpinPullTally => ({ faced: 0, pulled: 0, arm: 0, sixes: 0, fours: 0, outs: 0, missed: 0, other: 0 });

export interface SpinPullBall {
  dragged: boolean;
  armBall: boolean;
  /** Played as the pull off the spinner (`spinPull`). */
  pulled: boolean;
  /** Any stroke played at all. */
  swung: boolean;
  runs: number;
  out: boolean;
  /** No bat on it. */
  missed: boolean;
}

export function countSpinPull(tally: SpinPullTally, ball: SpinPullBall): SpinPullTally {
  if (!ball.dragged && !ball.pulled) return tally;
  const next = { ...tally };
  if (ball.dragged) next.faced++;
  if (ball.pulled) {
    next.pulled++;
    if (ball.armBall) next.arm++;
    if (ball.runs === 6) next.sixes++;
    else if (ball.runs === 4) next.fours++;
    if (ball.out) next.outs++;
    if (ball.missed) next.missed++;
  } else if (ball.swung) next.other++;
  return next;
}

/** The names and titles to count for one finished innings, nothing for one that never saw it. */
export function spinPullMarks(tally: SpinPullTally): [string, string][] {
  const marks: [string, string][] = [];
  if (tally.faced) marks.push(['spinshort-faced', 'Faced the spinner’s ball dropped short']);
  if (tally.other) marks.push(['spinshort-other', 'Met the short ball with another stroke']);
  if (!tally.pulled) return marks;
  marks.push(['spinpull-played', 'Played the pull off the spinner']);
  if (tally.arm) marks.push(['spinpull-arm', 'Pulled the arm ball']);
  if (tally.sixes) marks.push(['spinpull-six', 'Pulled the spinner for six']);
  if (tally.fours) marks.push(['spinpull-four', 'Pulled the spinner for four']);
  if (tally.outs) marks.push(['spinpull-out', 'Out pulling the spinner']);
  if (tally.missed) marks.push(['spinpull-missed', 'Beaten pulling the spinner']);
  return marks;
}
