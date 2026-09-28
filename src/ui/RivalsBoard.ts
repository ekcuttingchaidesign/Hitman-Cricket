import type { RivalsRow } from '../game/challenge-api';
import { escape, kitMarkup, sheetKeys } from './Leaderboard';

/**
 * The Rivals board, as a screen: three figures a player, and nothing else.
 *
 * Matches won, matches lost, and the runs made in them — the order the board
 * is ranked in, left to right, so the row reads as the reason for its own
 * place. It is drawn like a career board because it is one: a total that only
 * grows, kept for good, over something the player did many times.
 *
 * A string of HTML built from figures, like every other sheet here, so the
 * whole of it can be checked in a test with no browser in the room.
 */

export interface RivalsBoardView {
  rows: readonly RivalsRow[];
  youId?: string | null;
  state?: 'ready' | 'loading' | 'offline';
  size?: number;
}

export function rivalsBoardMarkup(view: RivalsBoardView): string {
  const { rows, youId = null, state = 'ready', size = 50 } = view;
  const place = rows.findIndex(row => row.playerId === youId);
  return `
    <div class="board-sheet is-rivals" role="document">
      <div class="sheet-head">
        <div class="sheet-title">
          <p class="board-eyebrow">ALL TIME</p>
          <h2 id="board-title">Rivals</h2>
        </div>
        ${sheetKeys()}
      </div>
      <p class="board-line"${state === 'loading' ? ' aria-live="polite"' : ''}>${
        state === 'loading' ? 'Fetching the board…'
        : state === 'offline' ? 'The board could not be reached.'
        : standing(rows, place)}</p>
      <div class="board-scroll">
        <ol class="board-list">${rows.map((row, i) => rivalsRowMarkup(row, i, row.playerId === youId)).join('')}
        </ol>
        ${state === 'ready' && !rows.length
          ? '<p class="board-cut">Nobody is on it yet. Win a Rivals match and the top is yours.</p>' : ''}
      </div>
      <p class="board-foot">Top ${size}, ranked on matches won, then fewest lost, then runs. A match counts when somebody you played in it has a registered name. Register a name to appear here.</p>
    </div>`;
}

export function rivalsRowMarkup(row: RivalsRow, index: number, you: boolean): string {
  return `
          <li class="board-row is-career is-rivals${you ? ' is-you' : ''}" style="--i:${index}"${
  you ? ' aria-current="true"' : ''}>
            <span class="board-place">${index + 1}</span>
            ${kitMarkup(row.avatar, row.name)}
            <span class="board-who"><b>${escape(row.name)}</b></span>
            <span class="board-hits">${column(row.won, 'won')}${column(row.lost, 'lost')}${column(row.runs, 'runs')}</span>
          </li>`;
}

/** A figure with its label under it. Grouped, because runs reach four digits. */
function column(value: number, label: string): string {
  return `<em>${value.toLocaleString('en-US')}<small>${label}</small></em>`;
}

/** The line under the title: where the player stands, or who leads. */
function standing(rows: readonly RivalsRow[], place: number): string {
  if (place >= 0) return `You are <b>${ordinal(place + 1)}</b> with ${wins(rows[place].won)}.`;
  if (!rows.length) return 'Nobody is on this one yet. First win takes the top.';
  return `${escape(rows[0].name)} leads with <b>${wins(rows[0].won)}</b>.`;
}

function wins(n: number): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'win' : 'wins'}`;
}

function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}
