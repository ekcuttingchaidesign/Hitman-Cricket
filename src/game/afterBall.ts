import type { AfterBall, PlayedStroke } from '../entities/Batter';
import type { ShotOutcome } from './types';
import type { GameMode } from './modes';
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
  /** Four of them. */
  four?: boolean;
  /** The innings' last ball: the end card comes in over whatever he would do. */
  last?: boolean;
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

/** How the batter's habits run in a mode: see `PACES`. */
export interface Pace {
  /** How often a drive gets one: often enough to notice, not so often it is a tic. */
  chance: number;
  /** At least this many balls since the last, for a drive's. */
  gap: number;
}

/**
 * The Blast and a Rival Match are thirty balls, and half the drives that call
 * for one get it: a handful an innings, which reads as a man. A Test innings
 * runs to hundreds, where half would be the same eight things over and over,
 * so a quarter, and never within four balls of the last.
 */
export const PACES: Record<GameMode, Pace> = {
  CLASSIC: { chance: .5, gap: 0 }, SURVIVE: { chance: .25, gap: 4 }, MARATHON: { chance: .25, gap: 4 },
};

/** Beaten playing a drive or a block: most of the time, whatever the mode. */
export const BEATEN_CHANCE = .8;

/** A run of dot balls this long or longer, broken with a boundary, always gets one. */
export const DOTS_BROKEN = 6;

/**
 * Each of the Marathon's three batters has his own: the opener looks at his
 * bat and plays the stroke again, the No. 2 watches it go and scrubs at the
 * pitch, the No. 3 leans on his bat and plays it again. A favourite is twice
 * as likely, and picked first where two would do. They all do all of them.
 */
export const HABITS: readonly (readonly AfterBall[])[] = [['admire', 'shadow'], ['watch', 'scrub'], ['lean', 'shadow']];

/** What the game knows going into a ball's choice. */
export interface Habit {
  /** The one he did last, which is never done twice running, the pull's twirl apart. */
  last: AfterBall | null;
  /** Balls since he last did anything. */
  since: number;
  /** Sweeps and scoops scored off before this one: every other one gets the brush, the first of them. */
  sweeps: number;
  /** This batter's balls so far, this one included. */
  history: readonly ShotOutcome[];
  pace: Pace;
  /** His favourites: see `HABITS`. */
  favourites?: readonly AfterBall[];
}

/** The classic drives: the bat looked at after one along the ground, watching it go after one lofted. */
const DRIVES = new Set(['STRAIGHT', 'COVER_LONG_OFF', 'LONG_ON']);

/**
 * What the batter does once the ball is done with, if anything (see
 * `AfterBall`). Each kind belongs to the strokes it suits: looking at the bat,
 * or for a four leaning on it, to the classic drives along the ground, and
 * watching it go to the same drives lofted; the twirl to the pull; the pad
 * brushed to the sweep and the scoops; and, beaten playing one of the drives
 * or a block, the stroke rehearsed or the pitch scrubbed.
 *
 * How often is the stroke's too. The pull is hard to play and is twirled
 * every time. Every other sweep or scoop gets the brush, from the first.
 * Beaten, `BEATEN_CHANCE` of the time. Out close to a milestone (`heartbreak`)
 * he always looks to the sky. The drives are the common ones, and get it at
 * the mode's `Pace` — except the first four he hits, and a boundary that ends
 * `DOTS_BROKEN` dots, which always do, and twice as often while the
 * boundaries come one after another. Nothing on the innings' last ball, which
 * the end card comes in over. `roll` is a number in [0, 1), and where two
 * would do it picks between them too.
 */
export function afterBall(stroke: PlayedStroke | null, ended: BallEnded, habit: Habit, roll: number): AfterBall | null {
  if (!stroke || stroke.charging) return null;
  // Out close to a milestone: always, whatever the roll.
  if (ended.wicket && ended.heartbreak) return 'sky';
  if (ended.wicket || ended.milestone || ended.last) return null;
  if (ended.scored && stroke.pulled) return 'twirl';
  if (ended.scored && swept(stroke)) return habit.sweeps % 2 === 0 ? 'brush' : null;
  const kinds = choose(stroke, ended).filter(kind => kind !== habit.last);
  if (!kinds.length) return null;
  const favoured = kinds.filter(kind => habit.favourites?.includes(kind));
  let chance: number;
  if (ended.beaten) chance = BEATEN_CHANCE;
  else if (firstFour(habit.history) || dotsBroken(habit.history)) chance = 1;
  else if (habit.since < habit.pace.gap) return null;
  else chance = Math.min(.9, habit.pace.chance * (onARoll(habit.history) ? 2 : 1) * (favoured.length ? 2 : 1));
  if (roll >= chance) return null;
  // Where two would do, his favourite twice over.
  const weighted = [...kinds, ...favoured];
  return weighted[Math.floor(roll / chance * weighted.length)];
}

const swept = (stroke: PlayedStroke) => stroke.swept || stroke.shot === 'SCOOP' || stroke.shot === 'REVERSE_SCOOP';
const boundary = (ball: ShotOutcome) => !ball.isWicket && (ball.runs === 4 || ball.runs === 6);

/** This ball his first four. */
function firstFour(history: readonly ShotOutcome[]) {
  const ball = history[history.length - 1];
  return !!ball && !ball.isWicket && ball.runs === 4 && !history.slice(0, -1).some(b => !b.isWicket && b.runs === 4);
}
/** This ball a boundary, after `DOTS_BROKEN` or more without a run. */
function dotsBroken(history: readonly ShotOutcome[]) {
  const ball = history[history.length - 1];
  if (!ball || !boundary(ball)) return false;
  let dots = 0;
  for (let i = history.length - 2; i >= 0 && history[i].runs === 0 && !history[i].isWicket; i--) dots++;
  return dots >= DOTS_BROKEN;
}
/** This ball a boundary, and the one before it too. */
function onARoll(history: readonly ShotOutcome[]) {
  return history.length >= 2 && boundary(history[history.length - 1]) && boundary(history[history.length - 2]);
}

function choose(stroke: PlayedStroke, ended: BallEnded): AfterBall[] {
  // Beaten: outside the off stump driving, past the edge pushing forward, or
  // swinging away from a straight bat. Not for the cross-batted strokes.
  if (ended.beaten) return DRIVES.has(stroke.shot) || stroke.shot === 'DEFEND' ? ['shadow', 'scrub'] : [];
  if (!ended.scored || stroke.shot === 'DEFEND') return [];
  // A drive along the ground: the bat looked at, or, for four, leant on too.
  if (DRIVES.has(stroke.shot)) return stroke.lofted ? ['watch'] : ended.four ? ['admire', 'lean'] : ['admire'];
  return [];
}
