import type { CareerMode } from './career.js';
import { standingOf, type SurviveInnings } from './survive-board.js';
import { SURVIVE } from '../config/survive.js';

/**
 * A chase: an innings batted with another player's best as the target, from
 * CHASE on their profile (section 14, lane B). A normal innings in every way —
 * the scoreboard is untouched, the board takes it as any other — with the
 * target under the scoreboard as a chip, a moment when it is passed, and the
 * end card saying how it went. What it says is worked out here, from figures,
 * so it is tested without a browser; the store judges the chase again on the
 * post and that is the verdict that reaches the other player.
 */

export interface Chase {
  handle: string;
  name: string;
  avatar: number | null;
  mode: CareerMode;
  /** Their best in this mode: beaten by one more. */
  target: number;
  /** Their place on the mode's board, where the board said. */
  theirPlace?: number | null;
  /** Their rung, for the intro's line under their face. */
  theirRung?: string | null;
  /** A Test Marathon chasing their best batter's innings rather than their side's total. */
  ladder?: 'solo';
  /** Test Survival: their result, which is what is chased there, not their runs. */
  result?: SurviveResult | null;
  /** Started by WIN IT BACK: played to the end, it answers the Rank down card. */
  answers?: boolean;
}

/** What the player brings to it: their own best and place in the mode, where they have them. */
export interface Mine { best: number | null; place: number | null }

const MODE_NAME: Record<CareerMode, string> = { classic: 'The Blast', marathon: 'the Test Marathon', survive: 'Test Survival' };

/** Runs still wanted to beat it: one more than the target, less what is made. Nought once it is beaten. */
export function wanted(chase: Pick<Chase, 'target'>, runs: number): number {
  return Math.max(0, chase.target + 1 - runs);
}

/** Whether the runs have gone past it. Level is not past: the key said beat. */
export function beaten(chase: Pick<Chase, 'target'>, runs: number): boolean {
  return runs > chase.target;
}

/**
 * The chip's line under the scoreboard: what is wanted, and off how many where
 * the innings is counted in balls. The Blast has thirty; Survival and the
 * Marathon end on wickets and say only what is wanted.
 */
export function chipLine(chase: Chase, runs: number, ballsLeft: number | null): { need: string; off: string | null; done: boolean } {
  if (beaten(chase, runs)) return { need: `Surpassed ${chase.name}`, off: null, done: true };
  const need = wanted(chase, runs);
  return { need: String(need), off: ballsLeft !== null && chase.mode === 'classic' ? String(Math.max(0, ballsLeft)) : null, done: false };
}

/** How far along the chip's bar is, nought to one. */
export function chaseProgress(chase: Pick<Chase, 'target'>, runs: number): number {
  return Math.min(1, Math.max(0, runs / (chase.target + 1)));
}

/** Inside ten to go, the chip beats with each ball. */
export const CLOSE = 10;
export function close(chase: Pick<Chase, 'target'>, runs: number): boolean {
  const need = wanted(chase, runs);
  return need > 0 && need <= CLOSE;
}

/** The intro's last line: what beating it is worth. */
export function introLine(chase: Chase, mine: Mine): string {
  const behind = chase.theirPlace && (mine.place === null || mine.place > chase.theirPlace);
  if (behind) return `Beat it and you pass ${chase.name} to go #${chase.theirPlace} on ${MODE_NAME[chase.mode]}.`;
  if (mine.best !== null && mine.best > chase.target) return `You’re already above ${chase.name}. Beat ${chase.target} again to prove it.`;
  return `Beat it and ${chase.name} will hear about it.`;
}

/** The intro's line under your own face. */
export function mineLine(mine: Mine): string {
  if (mine.best === null) return 'No best yet';
  return mine.place ? `Best ${mine.best} · #${mine.place}` : `Best ${mine.best}`;
}

/** Where the player stands once it is passed: their place, if the board has it, or the one they took. */
export function placeOnPassing(chase: Chase, mine: Mine): number | null {
  if (!chase.theirPlace) return mine.place;
  return mine.place !== null && mine.place < chase.theirPlace ? mine.place : chase.theirPlace;
}

/** The end card's strip: the verdict, and the line under it. */
export interface ChaseVerdict {
  beat: boolean;
  title: string;
  line: string;
  /** How far short, for the bar; nought when beaten. */
  short: number;
}

export function verdict(chase: Chase, runs: number, place: { now: number | null; was: number | null }): ChaseVerdict {
  if (beaten(chase, runs)) {
    const moved = place.now && place.was && place.was > place.now ? ` · up from #${place.was}`
      : place.now ? ` · now #${place.now}` : '';
    return { beat: true, title: `You beat ${chase.name} by ${runs - chase.target}`, line: `${runs} vs ${chase.target}${moved}`, short: 0 };
  }
  const short = chase.target - runs;
  const still = place.now ? ` · still #${place.now} on ${MODE_NAME[chase.mode]}` : '';
  if (short === 0) return { beat: false, title: `Level with ${chase.name}`, line: `${runs} vs ${chase.target} · one more beats it`, short: 0 };
  return { beat: false, title: `${short} short of ${chase.name}`, line: `${runs} vs ${chase.target}${still}`, short };
}

/** The key that takes the chase on again: CHASE 187 AGAIN. */
export function againLabel(chase: Pick<Chase, 'target'>): string {
  return `CHASE ${chase.target.toLocaleString('en-US')} AGAIN`;
}

// ── Test Survival: beat their result, not their runs ─────────────────────────
//
// A Survival innings is not ranked on runs: a win ranks on fewest balls, a draw
// (all sixty survived) on most runs, a loss on how long it lasted. So a chase
// there is a chase of their result, judged the way the board ranks it, and the
// goal changes with what they did: win faster than a win, outscore a draw, or
// outlast a loss. The store judges it again on the board's own packed score.

export type SurviveKind = 'won' | 'drawn' | 'lost';
/** A Survival innings as a chase reads it: how it ended, in how many balls, with how many runs. */
export interface SurviveResult { kind: SurviveKind; balls: number; runs: number }

/** A Survival innings's result. */
export function surviveResultOf(innings: SurviveInnings): SurviveResult {
  const standing = standingOf(innings);
  return { kind: standing === 'WON' ? 'won' : standing === 'DRAWN' ? 'drawn' : 'lost', balls: innings.balls, runs: innings.runs };
}

const TIERS: Record<SurviveKind, number> = { lost: 0, drawn: 1, won: 2 };

/** Whether one result ranks above another, as the board ranks them: the tier, then what the tier ranks on, then runs. */
export function surviveBeaten(theirs: SurviveResult, mine: SurviveResult): boolean {
  if (TIERS[mine.kind] !== TIERS[theirs.kind]) return TIERS[mine.kind] > TIERS[theirs.kind];
  if (mine.kind === 'won') return mine.balls < theirs.balls || (mine.balls === theirs.balls && mine.runs > theirs.runs);
  if (mine.kind === 'drawn') return mine.runs > theirs.runs;
  return mine.balls > theirs.balls || (mine.balls === theirs.balls && mine.runs > theirs.runs);
}

/**
 * Whether an innings still going has already passed them for certain: only a
 * loss can be passed between balls — lasting one ball longer ranks above it
 * however this innings ends. A win or a draw is passed on the ball that ends it.
 */
export function surviveSurely(theirs: SurviveResult, balls: number): boolean {
  return theirs.kind === 'lost' && balls > theirs.balls;
}

/** What beating them asks, for the intro, the key and the chip. */
export interface SurviveGoal {
  /** The figure the intro is built round. */
  figure: number;
  unit: string;
  /** What the figure is for: TO OUTLAST, AND SURVIVE, TO WIN IN. */
  aim: string;
  /** Their result, said: Kabir lasted 40 balls. */
  theirs: string;
  /** The same without the name: They lasted 40 balls. */
  theirsShort: string;
  /** The verb on the keys: OUTLAST KABIR, and again. */
  key: string;
  /** The key without the name, for a name too long for it: OUTLAST THEM. */
  short: string;
  again: string;
}

export function surviveGoal(name: string, theirs: SurviveResult): SurviveGoal {
  const upper = name.toUpperCase();
  if (theirs.kind === 'won') {
    return { figure: Math.max(1, theirs.balls - 1), unit: 'BALLS', aim: 'TO WIN IN', theirs: `${name} won in ${theirs.balls} balls`, theirsShort: `They won in ${theirs.balls} balls`, key: `WIN FASTER THAN ${upper}`, short: 'WIN FASTER THAN THEM', again: 'WIN FASTER AGAIN' };
  }
  if (theirs.kind === 'drawn') {
    return { figure: theirs.runs + 1, unit: 'RUNS', aim: 'AND SURVIVE', theirs: `${name} drew with ${theirs.runs}`, theirsShort: `They drew with ${theirs.runs}`, key: `OUTSCORE ${upper}’S DRAW`, short: 'OUTSCORE THEIR DRAW', again: 'OUTSCORE AGAIN' };
  }
  return { figure: theirs.balls + 1, unit: 'BALLS', aim: 'TO OUTLAST', theirs: `${name} lasted ${theirs.balls} balls`, theirsShort: `They lasted ${theirs.balls} balls`, key: `OUTLAST ${upper}`, short: 'OUTLAST THEM', again: 'OUTLAST AGAIN' };
}

/**
 * The chip's line in Survival: what is still wanted, and the goal under it.
 * Each line that names them has a short form without the name (`needShort`,
 * `smallShort`), for a name too long for the chip; their face is beside it.
 */
export function surviveChip(name: string, theirs: SurviveResult, now: { balls: number; runs: number }, target = SURVIVE.target): {
  need: string; needShort: string; off: string | null; small: string; smallShort: string; done: boolean; progress: number;
} {
  const upper = name.toUpperCase();
  if (surviveSurely(theirs, now.balls)) {
    return { need: `Outlasted ${name}`, needShort: 'Outlasted them', off: null, small: '', smallShort: '', done: true, progress: 1 };
  }
  if (theirs.kind === 'lost') {
    const more = theirs.balls + 1 - now.balls;
    const need = `Survive ${more} more`;
    return {
      need, needShort: need, off: null, small: `TO OUTLAST ${upper} · ${theirs.balls} BALLS`, smallShort: `TO OUTLAST THEM · ${theirs.balls} BALLS`,
      done: false, progress: now.balls / (theirs.balls + 1),
    };
  }
  if (theirs.kind === 'drawn') {
    const runs = Math.max(0, theirs.runs + 1 - now.runs);
    const need = runs ? `Need ${runs}` : 'Now survive';
    return {
      need, needShort: need, off: null, small: `TO OUTSCORE ${upper}’S DRAW OF ${theirs.runs}`, smallShort: `TO OUTSCORE THEIR DRAW OF ${theirs.runs}`,
      done: false, progress: Math.min(1, now.runs / (theirs.runs + 1)),
    };
  }
  const left = theirs.balls - 1 - now.balls;
  const runs = Math.max(0, target - now.runs);
  const need = left > 0 ? `${runs} off ${left}` : 'Too late to win faster';
  return {
    need, needShort: need, off: null, small: `TO BEAT ${upper}’S ${theirs.balls}-BALL WIN`, smallShort: `TO BEAT THEIR ${theirs.balls}-BALL WIN`,
    done: false, progress: Math.min(1, now.runs / target),
  };
}

/** A result in a few words: won in 48 balls, drew with 96, lasted 40 balls. */
export function surviveSaid(result: SurviveResult): string {
  return result.kind === 'won' ? `won in ${result.balls} balls` : result.kind === 'drawn' ? `drew with ${result.runs}` : `lasted ${result.balls} balls`;
}

/** The end card's verdict on a Survival chase. */
export function surviveVerdict(name: string, theirs: SurviveResult, mine: SurviveResult, place: { now: number | null; was: number | null }): ChaseVerdict {
  const line = `You ${surviveSaid(mine)} · ${name} ${surviveSaid(theirs)}`;
  if (surviveBeaten(theirs, mine)) {
    const moved = place.now && place.was && place.was > place.now ? ` · up from #${place.was}` : '';
    const title = mine.kind !== theirs.kind ? `You beat ${name}’s result`
      : mine.kind === 'won' ? `You won ${theirs.balls - mine.balls} balls faster than ${name}`
      : mine.kind === 'drawn' ? `You outscored ${name}’s draw by ${mine.runs - theirs.runs}`
      : `You outlasted ${name} by ${mine.balls - theirs.balls} ball${mine.balls - theirs.balls === 1 ? '' : 's'}`;
    return { beat: true, title, line: line + moved, short: 0 };
  }
  const title = mine.kind === 'lost' && theirs.kind === 'lost' && theirs.balls > mine.balls
    ? `${theirs.balls - mine.balls} ball${theirs.balls - mine.balls === 1 ? '' : 's'} short of ${name}`
    : `Short of ${name}’s result`;
  return { beat: false, title, line, short: 0 };
}
