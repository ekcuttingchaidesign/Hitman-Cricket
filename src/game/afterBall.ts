import type { AfterBall, PlayedStroke } from '../entities/Batter';

/** How the ball ended, which is the other half. */
export interface BallEnded {
  /** Runs off the bat. */
  scored: boolean;
  /** Played at it and missed it, or got only an edge, and is still in. */
  beaten: boolean;
  /** Out: he is leaving, not settling. */
  wicket: boolean;
  /** A milestone is about to be celebrated, which takes him from wherever he is. */
  milestone: boolean;
}

/** How often a ball that calls for one gets one: often enough to notice, not so often it is a tic. */
export const AFTER_BALL_CHANCE = .5;

/**
 * What the batter does once the ball is done with, if anything (see
 * `AfterBall`). Each kind belongs to the strokes it suits: the crease tap to
 * the classic drives along the ground, watching it go to the lofted ones, the
 * twirl to the pull, the pad brushed to the strokes played off a knee, and the
 * stroke rehearsed to being beaten. Only `AFTER_BALL_CHANCE` of the balls that
 * call for one get it (`roll` is a number in [0, 1)), and never the same one
 * twice running, so it reads as a man and not a loop.
 */
export function afterBall(stroke: PlayedStroke | null, ended: BallEnded, last: AfterBall | null, roll: number): AfterBall | null {
  if (!stroke || stroke.charging || ended.wicket || ended.milestone) return null;
  const kind = choose(stroke, ended);
  if (!kind || kind === last || roll >= AFTER_BALL_CHANCE) return null;
  return kind;
}

function choose(stroke: PlayedStroke, ended: BallEnded): AfterBall | null {
  if (stroke.shot === 'DEFEND') return null;
  if (ended.beaten) return 'shadow';
  if (!ended.scored) return null;
  if (stroke.swept || stroke.shot === 'SCOOP' || stroke.shot === 'REVERSE_SCOOP') return 'brush';
  if (stroke.pulled) return 'twirl';
  if (stroke.lofted) return 'watch';
  if (stroke.shot === 'STRAIGHT' || stroke.shot === 'COVER_LONG_OFF' || stroke.shot === 'LONG_ON') return 'admire';
  return null;
}
