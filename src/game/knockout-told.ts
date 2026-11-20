/**
 * A finished match as a phone says it, off the result the store worked out
 * (`server/knockout-result.ts`): the room's Results, the lobby's card for the
 * match before, and what was paid, in words.
 *
 * A phone that batted the match has the same room in its own memory, but the
 * store's is the one points were paid on, and the only one a phone that
 * joined late, reloaded, or was beaten back to the lobby by another has at
 * all. Pure, so every line is held in `tests/knockout-told.test.ts`.
 */
import type { MatchResult, MatchResultRow } from '../server/knockout-result';
import { ordinal } from './knockout-points';

/** One row of the room's Results. A place of 0 is no place at all: somebody who ran away, listed at the foot. */
export interface ToldRow { place: number; name: string; face: number; runs: number | null; line: string; you: boolean; sub?: boolean; points?: number }
export interface ToldResults {
  rows: ToldRow[];
  you: { place: number; of: number; face: number; runs: number | null; line: string; sentence?: string };
  winner: { title: string; line: string };
  practice: boolean;
  again?: string;
  live: false;
  /** The ladder pill's words: the room's code. */
  pill?: string;
}

const points = (n: number) => `${n} ${n === 1 ? 'point' : 'points'}`;

/** WINNER's pill: what the win paid, or why it paid nothing. */
export function pointsWord(paid: number, counted: boolean): string {
  return paid > 0 ? `+${points(paid).toUpperCase()}` : counted ? 'NO POINTS THIS MATCH' : 'PRACTICE · NO POINTS';
}

/** The same, at the end of a line. */
export function pointsNote(paid: number, counted: boolean): string {
  return paid > 0 ? `+${points(paid)}` : counted ? 'no points this time' : 'practice, no points';
}

/** This player's seat in a result, by their own handle; null where they did not bat it. */
export function mineIn(result: MatchResult | null | undefined, handle: string): MatchResultRow | null {
  return result?.rows.find(row => row.handle === handle) ?? null;
}

/** How a seat's match ended, under its name. */
function lineOf(row: MatchResultRow): string {
  const end = row.place === 1 ? 'Won the final' : row.place === 2 ? 'Runner-up'
    : row.over === null ? 'Knocked out' : row.out ? `Out · cut after over ${row.over}` : `Cut after over ${row.over}, not out`;
  return row.stood && !row.ran ? `${end} · a sub finished` : end;
}

/** The lobby's card for the match before: who won it, and where this player came. */
export function lastCard(result: MatchResult, handle: string): { title: string; line: string; face: number } {
  const winner = result.rows[0], me = mineIn(result, handle);
  const won = !!me && me === winner && !me.stood;
  const mine = !me ? 'you sat it out' : me.ran ? 'you ran away' : won ? (me.points ? `+${points(me.points)}` : 'the room was yours')
    : `you were ${ordinal(me.place)}${me.points ? ` · +${points(me.points)}` : ''}`;
  return { title: won ? 'YOU WON IT' : `${winner.name.toUpperCase()} WON IT`, line: `${winner.runs} off ${winner.balls} · ${mine}`, face: winner.face };
}

/**
 * The room's Results off the store's result. A seat walked out of is the sub's
 * who finished it, and the one who left stands at the foot with no place:
 * RAN AWAY (`PRODUCT.md`).
 */
export function resultsOf(result: MatchResult, handle: string, code: string, again?: string): ToldResults {
  const me = mineIn(result, handle);
  const rows: ToldRow[] = result.rows.map(row => ({
    place: row.place, name: row.ran ? `${row.name}’s sub` : row.name, face: row.face, runs: row.runs, line: lineOf(row),
    you: row === me && !row.ran, sub: row.sub || row.ran, points: row.points,
  }));
  for (const row of result.rows) if (row.ran) rows.push({ place: 0, name: row.name, face: row.face, runs: null, line: 'Ran away', you: row === me, sub: false });
  const winner = result.rows[0], runner = result.rows.find(row => row.place === 2) ?? null, by = runner ? winner.runs - runner.runs : 0;
  const mineWon = !!me && me === winner && !me.stood;
  return {
    live: false, rows, practice: !result.counted, again, pill: `Room ${code}`,
    winner: {
      title: mineWon ? 'You won the room' : `${winner.ran ? `${winner.name}’s sub` : winner.name} won the room`,
      line: `${winner.runs} off ${winner.balls}${runner ? ` · outlasted ${runner === me && !me.ran ? 'you' : runner.name}${by > 0 ? ` by ${by}` : ''} in the final` : ''}`,
    },
    you: !me ? { place: 0, of: result.rows.length, face: 0, runs: null, line: 'You were not batting in this one', sentence: 'You <em>sat this one out</em>' }
      : me.ran ? { place: 0, of: result.rows.length, face: me.face, runs: null, line: 'No place and no points', sentence: 'You <em>ran away</em>' }
      : { place: me.place, of: result.rows.length, face: me.face, runs: me.runs,
        line: `${me.runs} off ${me.balls} · ${me.stood ? 'a sub finished for you, so no points' : pointsNote(me.points, result.counted)}` },
  };
}
