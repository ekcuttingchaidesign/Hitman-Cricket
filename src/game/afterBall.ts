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

/** The classic drives: the crease tap after one along the ground, watching it go after one lofted. */
const DRIVES = new Set(['STRAIGHT', 'COVER_LONG_OFF', 'LONG_ON']);

/**
 * What the batter does once the ball is done with, if anything (see
 * `AfterBall`). Each kind belongs to the strokes it suits: the crease tap to
 * the classic drives along the ground and watching it go to the same drives
 * lofted; the twirl to the pull; the pad brushed to the strokes played off a
 * knee; and, beaten playing one of those drives or a block, the stroke
 * rehearsed or the pitch scrubbed. Only `AFTER_BALL_CHANCE` of the balls that
 * call for one get it (`roll` is a number in [0, 1), and where two would do it
 * picks between them too), and never the same one twice running, so it reads
 * as a man and not a loop.
 */
export function afterBall(stroke: PlayedStroke | null, ended: BallEnded, last: AfterBall | null, roll: number): AfterBall | null {
  if (!stroke || stroke.charging || ended.wicket || ended.milestone || roll >= AFTER_BALL_CHANCE) return null;
  const kinds = choose(stroke, ended).filter(kind => kind !== last);
  return kinds.length ? kinds[Math.floor(roll / AFTER_BALL_CHANCE * kinds.length)] : null;
}

function choose(stroke: PlayedStroke, ended: BallEnded): AfterBall[] {
  // Beaten: outside the off stump driving, past the edge pushing forward, or
  // swinging away from a straight bat. Not for the cross-batted strokes.
  if (ended.beaten) return DRIVES.has(stroke.shot) || stroke.shot === 'DEFEND' ? ['shadow', 'scrub'] : [];
  if (!ended.scored || stroke.shot === 'DEFEND') return [];
  if (stroke.swept || stroke.shot === 'SCOOP' || stroke.shot === 'REVERSE_SCOOP') return ['brush'];
  if (stroke.pulled) return ['twirl'];
  if (DRIVES.has(stroke.shot)) return [stroke.lofted ? 'watch' : 'admire'];
  return [];
}
