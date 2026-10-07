import type { ShotOutcome } from './types';

/**
 * The crowd: what it sounds like, ball by ball.
 *
 * Under everything a murmur, from the walk-out to the end card: the one ground
 * in both games, the Blast's a little louder, and both lifting a little as the
 * bowler runs in. Over it a cheer for each boundary, the size of it set by how many
 * have come in a row — a four on its own a small one, the third running the
 * biggest the stands have — and the murmur lifted with it, falling back over
 * seconds rather than at once, so a streak that keeps coming climbs. A wicket
 * goes quiet under a groan, and so, in a Test, does the express bowler's ball
 * that the bat only just missed. A milestone is the biggest cheer there is, a Test's too, which
 * is otherwise a size smaller all round.
 *
 * The decisions are made here and the sounds in `GameAudio`, which takes a
 * `Cheer` and plays it: a clip of the size asked for, cut in just short of its
 * peak, up to `peak` in a tenth of a second and down again on an exponential
 * with time constant `decay`.
 */
export type CheerSize = 'soft' | 'mid' | 'big';
export interface Cheer {
  size: CheerSize;
  /** How loud at the top, from nought to one. */
  peak: number;
  /** Seconds: the time constant it falls away on, after a short hold. */
  decay: number;
  /** How far the murmur is lifted with it, as a share of its own level. */
  swell: number;
}

/**
 * The murmur's level, in the same units as a cheer's `peak`: one recording for
 * both games, a Test's the quieter ground and the Blast's a little up on it.
 */
export const MURMUR = { blast: .1, test: .07 } as const;
/** The bowler running in: how far the murmur lifts, and how quickly it settles once the ball is gone. */
export const RUNUP = { swell: .22, settle: .9 } as const;
/**
 * A wicket: the groan (`GROAN`), and as it dies away, `after` seconds in, the
 * murmur down to `depth` of itself, held, and back over `recover` seconds.
 */
export const HUSH = { depth: .25, after: 1.3, hold: 1.4, recover: 2.5 } as const;
/** And for the one who goes close to a milestone, or is carried off: a soft cheer as he goes, once the quiet has come. */
export const SEND_OFF: Cheer & { after: number } = { size: 'soft', peak: .42, decay: 1.8, swell: .2, after: 3 };

/**
 * A groan: how loud, from nought to one, and the share of itself the murmur
 * gives way to while it sounds — it is the same crowd, not another one on top.
 */
export interface Groan { level: number; under: number }
/**
 * For a wicket, a Test's a little under the Blast's as all its cheers are; for
 * a near thing quieter again, an intake of breath rather than a loss, and the
 * murmur hardly giving way to it.
 */
export const GROAN = {
  out: { level: .8, under: .5 }, outTest: { level: .65, under: .5 }, near: { level: .5, under: .7 },
} as const satisfies Record<string, Groan>;
/**
 * Its shape, in seconds: up on a time constant of `rise`, falling from `falls`
 * on one of `fall`, the clip's own two seconds rounded off; the murmur dips
 * and comes back on the same curve.
 */
export const GROAN_SHAPE = { rise: .07, falls: 1.3, fall: .3 } as const;

/**
 * A near thing: in a Test, off the express bowler, a stroke played that the
 * ball went past without touching. Not a ball left alone, which was never near
 * the bat, nor one ducked under, nor one that hit him or got him out.
 */
export function nearMiss(ball: {
  test: boolean; express: boolean; attempted: boolean;
  outcome: Pick<ShotOutcome, 'madeBatContact' | 'isWicket' | 'defended' | 'hit'>;
}) {
  const { outcome } = ball;
  return ball.test && ball.express && ball.attempted && !outcome.madeBatContact && !outcome.isWicket && !outcome.defended && !outcome.hit;
}

/** Boundaries running, this ball the last of them: nought if this ball was not one. */
export function boundaryStreak(history: readonly Pick<ShotOutcome, 'runs' | 'isWicket'>[]) {
  let streak = 0;
  for (let i = history.length - 1; i >= 0 && !history[i].isWicket && (history[i].runs === 4 || history[i].runs === 6); i--) streak++;
  return streak;
}

const SIZES: readonly CheerSize[] = ['soft', 'mid', 'big'];
/**
 * A boundary's cheer: one size up for a six and one for each boundary before
 * it in the run, so the second in a row is a size up on the first and the
 * third is the biggest; a Test's a size down on all of it. Louder, longer and
 * lifting the murmur further as the run goes on.
 */
export function boundaryCheer(runs: 4 | 6, streak: number, test: boolean): Cheer {
  const run = Math.max(1, streak);
  const step = (runs === 6 ? 1 : 0) + Math.min(run - 1, 2) - (test ? 1 : 0);
  const size = SIZES[Math.max(0, Math.min(SIZES.length - 1, step))];
  const peak = Math.min(1, (test ? .42 : .55) + (runs === 6 ? .12 : 0) + .1 * (run - 1));
  return { size, peak, decay: Math.min(3.2, 1 + .45 * (run - 1) + (runs === 6 ? .3 : 0)), swell: Math.min(1.4, .35 * run + (runs === 6 ? .15 : 0)) };
}

/** A milestone: the biggest there is, in either game, falling away over about the celebration's length. */
export function milestoneCheer(seconds: number): Cheer {
  return { size: 'big', peak: 1, decay: 1 + seconds / 2, swell: 1.4 };
}
