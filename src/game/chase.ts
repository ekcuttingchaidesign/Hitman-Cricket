import type { CareerMode } from './career';

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
  if (beaten(chase, runs)) return { need: `Passed ${chase.name}`, off: null, done: true };
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
