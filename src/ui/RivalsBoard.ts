import type { RivalsRow } from '../game/challenge-api';
import { escape, kitMarkup } from './Leaderboard';
import { cta, icon } from './Kit';
import { RIVALS_NEED_REGISTERED_RIVAL } from '../config/rivals';

/**
 * The Rivals ranking: three figures a player, and nothing else.
 *
 * Matches won, matches lost, and the runs made in them — the order it is
 * ranked in, left to right, so the row reads as the reason for its own place.
 * It is drawn like a career board because it is one: a total that only grows,
 * kept for good, over something the player did many times.
 *
 * It used to be a tab on the leaderboard sheet. Rivals is played from Rival
 * Matches and nowhere else, so its ranking lives there now, behind a trophy
 * key at the top of that screen, in a sheet of its own; the leaderboard's tab
 * went to the Test Marathon (`docs/MARATHON.md`, "The sheet's tabs"). It sat
 * in the list under the record for a while, the top ten and a key for the
 * rest, and a playtest asked for it behind an icon, so the matches are the
 * screen's first thing.
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

export function rivalsRankingMarkup(view: RivalsBoardView): string {
  const { rows, youId = null, state = 'ready', size = 50 } = view;
  return `
    <section class="rival-ranking rv-ranking" aria-labelledby="rivals-ranking-title">
      <div class="rv-top">
        <button id="rivals-ranking-close" class="k-icon-button" type="button" aria-label="Back">${icon('arrow-left')}</button>
        <h2 id="rivals-ranking-title" class="rv-title">RIVALS RANKING</h2>
      </div>
      <p class="rival-ranking-line rv-line"${state === 'loading' ? ' aria-live="polite"' : ''}>${
        state === 'loading' ? 'Fetching the board…'
        : state === 'offline' ? 'The board could not be reached.'
        : `Top ${size} by matches won, then fewest lost, then runs.`}</p>
      <div class="rival-ranking-scroll rv-table">
        <div class="rv-table-head" aria-hidden="true"><span>#</span><span>PLAYER</span><span>W</span><span>L</span><span>RUNS</span></div>
      ${rows.length ? `<ol class="board-list rival-ranking-list">${rows.map((row, i) => rivalsRowMarkup(row, i, row.playerId === youId)).join('')}
      </ol>` : ''}
      ${state === 'ready' && !rows.length
        ? '<p class="board-cut rv-empty">Nobody is on it yet. Win a Rivals match and the top is yours.</p>' : ''}
      </div>
      <p class="rival-ranking-foot rv-foot">${
        RIVALS_NEED_REGISTERED_RIVAL ? 'A match counts when somebody you played in it has a registered name. ' : ''
      }Register a name to appear here.</p>
      <div class="rv-keys">${cta({ kind: 'primary', label: 'START A NEW MATCH', id: 'rivals-ranking-new', wide: true })}</div>
    </section>`;
}

export function rivalsRowMarkup(row: RivalsRow, index: number, you: boolean): string {
  return `
          <li class="board-row is-career is-rivals rv-rank-row${you ? ' is-you' : ''}" style="--i:${index}"${
  you ? ' aria-current="true"' : ''}>
            <span class="board-place">${index + 1}</span>
            <span class="rv-rank-who">${kitMarkup(row.avatar, row.name)}<b>${escape(you ? 'You' : row.name)}</b></span>
            <span class="rv-rank-w">${row.won.toLocaleString('en-US')}</span>
            <span class="rv-rank-l">${row.lost.toLocaleString('en-US')}</span>
            <span class="rv-rank-runs">${row.runs.toLocaleString('en-US')}</span>
          </li>`;
}
