/**
 * A stroke counted: what one innings did with the ball a stroke answers and
 * with the stroke itself, kept a ball at a time and sent to GoatCounter once,
 * when the innings ends (`strokeMarks`). Once an innings rather than once a
 * ball, so a long Marathon does not outweigh a Blast; `<ball>-faced` is what
 * the rest are read against.
 *
 * Two strokes are counted (`COUNTED`): the pull off the spinner, at his ball
 * dropped short (and the arm ball, timed well enough), and the hook, at a
 * bouncer on off stump or wider.
 */
export interface StrokeTally {
  /** Balls faced that the stroke answers. */
  faced: number;
  /** Times the stroke was played. */
  played: number;
  /** Of those, at the arm ball: the pull off the spinner's only. */
  arm: number;
  sixes: number;
  fours: number;
  /** Out playing it. */
  outs: number;
  /** Swung at and beaten. */
  missed: number;
  /** The stroke's ball met with any other stroke. */
  other: number;
}

export const freshTally = (): StrokeTally => ({ faced: 0, played: 0, arm: 0, sixes: 0, fours: 0, outs: 0, missed: 0, other: 0 });

export interface StrokeBall {
  /** The ball the stroke answers. */
  its: boolean;
  armBall: boolean;
  /** Played as the stroke. */
  played: boolean;
  /** Any stroke played at all. */
  swung: boolean;
  runs: number;
  out: boolean;
  /** No bat on it. */
  missed: boolean;
}

export function countStroke(tally: StrokeTally, ball: StrokeBall): StrokeTally {
  if (!ball.its && !ball.played) return tally;
  const next = { ...tally };
  if (ball.its) next.faced++;
  if (ball.played) {
    next.played++;
    if (ball.armBall) next.arm++;
    if (ball.runs === 6) next.sixes++;
    else if (ball.runs === 4) next.fours++;
    if (ball.out) next.outs++;
    if (ball.missed) next.missed++;
  } else if (ball.swung) next.other++;
  return next;
}

/** How a stroke's events are named and titled. */
export interface Counted {
  /** The ball's prefix, `spinshort`, and the stroke's, `spinpull`. */
  ball: string; stroke: string;
  /** The ball and the stroke in a title: "the spinner's ball dropped short", "the pull off the spinner". */
  ballSaid: string; strokeSaid: string;
}

export const COUNTED = {
  spinPull: { ball: 'spinshort', stroke: 'spinpull', ballSaid: 'the spinner’s ball dropped short', strokeSaid: 'the pull off the spinner' },
  hook: { ball: 'hookball', stroke: 'hook', ballSaid: 'a bouncer to hook', strokeSaid: 'the hook' },
} satisfies Record<string, Counted>;

/** The names and titles to count for one finished innings, nothing for one that never saw it. */
export function strokeMarks(tally: StrokeTally, { ball, stroke, ballSaid, strokeSaid }: Counted): [string, string][] {
  const marks: [string, string][] = [];
  if (tally.faced) marks.push([`${ball}-faced`, `Faced ${ballSaid}`]);
  if (tally.other) marks.push([`${ball}-other`, `Met ${ballSaid} with another stroke`]);
  if (!tally.played) return marks;
  marks.push([`${stroke}-played`, `Played ${strokeSaid}`]);
  if (tally.arm) marks.push([`${stroke}-arm`, `Played ${strokeSaid} at the arm ball`]);
  if (tally.sixes) marks.push([`${stroke}-six`, `Six off ${strokeSaid}`]);
  if (tally.fours) marks.push([`${stroke}-four`, `Four off ${strokeSaid}`]);
  if (tally.outs) marks.push([`${stroke}-out`, `Out playing ${strokeSaid}`]);
  if (tally.missed) marks.push([`${stroke}-missed`, `Beaten playing ${strokeSaid}`]);
  return marks;
}
