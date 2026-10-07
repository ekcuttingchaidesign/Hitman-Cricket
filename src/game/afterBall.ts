import type { AfterBall, PlayedStroke } from '../entities/Batter';
import type { ShotOutcome } from './types';
import { batterRuns } from './milestone';

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
  /** Out close to a milestone: see `outNearMilestone`. */
  heartbreak?: boolean;
}

/**
 * Whether the ball that got him out (the last in `history`, his own balls
 * only) got him out close to a milestone: in the nineties of any hundred, or
 * on the ball after five sixes in a row, with the sixth one there for the
 * taking. Not in the forties: a fifty is not worth the sky.
 */
export function outNearMilestone(history: readonly ShotOutcome[]) {
  const out = history[history.length - 1];
  if (!out?.isWicket) return false;
  const before = history.slice(0, -1);
  const runs = batterRuns(before);
  if (runs >= 90 && runs % 100 >= 90) return true;
  let sixes = 0;
  for (let i = before.length - 1; i >= 0 && before[i].runs === 6 && !before[i].isWicket; i--) sixes++;
  return sixes >= 5;
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
 * as a man and not a loop. Out close to a milestone (`heartbreak`) he always
 * does something: looks to the sky, or sinks to his haunches.
 */
export function afterBall(stroke: PlayedStroke | null, ended: BallEnded, last: AfterBall | null, roll: number): AfterBall | null {
  if (!stroke || stroke.charging) return null;
  // Out close to a milestone: always, whatever the roll, and the other of the
  // two from last time.
  if (ended.wicket && ended.heartbreak) {
    const kinds = (['sky', 'crouch'] as AfterBall[]).filter(kind => kind !== last);
    return kinds[Math.min(kinds.length - 1, Math.floor(roll * kinds.length))];
  }
  if (ended.wicket || ended.milestone || roll >= AFTER_BALL_CHANCE) return null;
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
