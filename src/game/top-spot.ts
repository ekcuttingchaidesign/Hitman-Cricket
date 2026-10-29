/**
 * New #1: the moment an innings takes the top of a board it was not the top
 * of before (Figma section 15). What it shows is worked out here from the
 * board the store answered the post with, so the ladder, where the player's
 * row starts and what the lines say are unit tests; `src/ui/TopSpot.ts`
 * plays it.
 */
import type { CareerMode } from './career';

export interface TopSpotRow { name: string; avatar: number; label: string }

export interface TopSpotView {
  mode: CareerMode;
  /** The mode's own colour, for the bloom and the podium's top step. */
  colour: string;
  /** Over the ladder: THE BLAST · TOP OF THE BOARD. */
  head: string;
  /** The lockup's line: TOP OF THE BLAST. */
  top: string;
  /** And under it: by how much, or what it was. */
  sub: string;
  /** The chip at the takeover: +4 CLEAR. */
  clear: string;
  you: TopSpotRow & { from: number | null };
  /**
   * The ladder before the innings, top first: the rows that were above the
   * player and, under them, the player's own row at `start`. Rows below the
   * player's old place are left out: the climb is the story.
   */
  above: TopSpotRow[];
  /** The slot the player's row starts in; the ladder's last slot is a place below the rows shown. */
  start: number;
  /** The old leader and the one after, for the podium's second and third steps. */
  second: TopSpotRow | null;
  third: TopSpotRow | null;
}

/** How many rows the ladder shows above the player's own. */
export const LADDER = 4;

export const TOP_COLOURS: Record<CareerMode, string> = { classic: '#3f88f2', marathon: '#1f8a55', survive: '#ff5a4e', super10: '#8b5cf6' };
const BOARD: Record<CareerMode, { head: string; top: string }> = {
  classic: { head: 'THE BLAST · TOP OF THE BOARD', top: 'TOP OF THE BLAST' },
  marathon: { head: 'TEST MARATHON · THE TEAM BOARD', top: 'TOP OF THE MARATHON' },
  survive: { head: 'TEST SURVIVAL · THE BOARD', top: 'TOP OF TEST SURVIVAL' },
  super10: { head: 'SUPER10 · THE BOARD', top: 'TOP OF SUPER10' },
};

/** Whether the store's answer is the top taken: first now, and not first before. */
export function tookTheTop(rank: number | null | undefined, was: number | null | undefined): boolean {
  return rank === 1 && was !== 1;
}

export interface TopSpotInput {
  mode: CareerMode;
  you: { name: string; avatar: number };
  /** The board the store answered with, best first, the player's row at the top of it. */
  rows: readonly { name: string; avatar: number; runs: number; you: boolean; line?: string }[];
  /** Where the player stood before; null for a first row on this board. */
  was: number | null;
  /** Survival is ranked on its result, said in words; the others on runs. */
  measure: 'runs' | 'result';
}

export function topSpotView(input: TopSpotInput): TopSpotView | null {
  const mine = input.rows.find(row => row.you);
  if (!mine) return null;
  const others = input.rows.filter(row => !row.you);
  const label = (row: { runs: number; line?: string }) => input.measure === 'runs' ? row.runs.toLocaleString('en-US') : row.line ?? String(row.runs);
  const person = (row: { name: string; avatar: number; runs: number; line?: string }): TopSpotRow => ({ name: row.name, avatar: row.avatar, label: label(row) });
  // The rows that stood above the player before the innings: every one of
  // them is below the player now, in the order they were in.
  const above = others.slice(0, input.was === null ? LADDER : Math.min(LADDER, input.was - 1)).map(person);
  const leader = others[0] ?? null;
  const clearBy = leader && input.measure === 'runs' ? mine.runs - leader.runs : null;
  const sub = leader === null ? `${label(mine)} · the first on the board`
    : clearBy !== null ? `${label(mine)} · ${clearBy.toLocaleString('en-US')} clear of ${leader.name}`
    : `${label(mine)} · ahead of ${leader.name}`;
  return {
    mode: input.mode,
    colour: TOP_COLOURS[input.mode],
    head: BOARD[input.mode].head,
    top: BOARD[input.mode].top,
    sub,
    clear: clearBy !== null && clearBy > 0 ? `+${clearBy.toLocaleString('en-US')} CLEAR` : 'NEW LEADER',
    you: { name: input.you.name, avatar: input.you.avatar, label: label(mine), from: input.was },
    above,
    start: above.length,
    second: leader ? person(leader) : null,
    third: others[1] ? person(others[1]) : null,
  };
}
