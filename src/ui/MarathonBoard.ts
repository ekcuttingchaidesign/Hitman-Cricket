import { kitColour } from '../config/board';
import { BATTERS, type MarathonEnding } from '../config/marathon';
import {
  MARATHON_BOARD_SIZE, marathonQualifies, packSolo, packTeam, strikeRate,
  type SoloInnings, type SoloRow, type TeamInnings, type TeamRow,
} from '../game/marathon-board';
import { escape, kitMarkup, sheetKeys } from './Leaderboard';

/**
 * The Test Marathon's board, as a screen: two ladders behind a toggle.
 *
 * Built out of the same pieces as the Test Survival sheet — a letter for how
 * it ended, then quiet fixed columns, named once at the head — so the three
 * boards read as one board with three ladders. The team ladder's letter is
 * how the innings ended; the individual ladder's is which of the three he was,
 * because the opener's hundred and the tailender's are different days.
 */

/** Which of the two ladders is up. */
export type MarathonLadder = 'team' | 'solo';

export const MARATHON_LADDERS: readonly { key: MarathonLadder; name: string }[] = [
  { key: 'team', name: 'Team' },
  { key: 'solo', name: 'Individual' },
];

/** The toggle, drawn as the career ladders' strip so it sits where that one does. */
export function marathonLaddersMarkup(active: MarathonLadder): string {
  return `
    <div class="ladder-tabs" role="tablist" aria-label="Which ladder">${MARATHON_LADDERS.map(tab => {
      const on = tab.key === active;
      return `
      <button id="board-ladder-${tab.key}" class="ladder-tab${on ? ' is-on' : ''}" role="tab" type="button" aria-selected="${on}">${tab.name}</button>`;
    }).join('')}
    </div>`;
}

export interface MarathonBoardView {
  ladder: MarathonLadder;
  team: readonly TeamRow[];
  solo: readonly SoloRow[];
  youId?: string | null;
  /** The innings just played, on each ladder's terms, when it is not already a row. */
  yours?: { team: TeamInnings; solo: SoloInnings } | null;
  state?: 'ready' | 'loading' | 'offline';
  atMs?: number;
}

/** How an innings ended, as a letter and the words behind it. */
const ENDED: Record<MarathonEnding, { letter: string; word: string }> = {
  ALL_OUT: { letter: 'O', word: 'All out' },
  RETIRED: { letter: 'R', word: 'Last man retired hurt' },
  BALLS: { letter: 'B', word: '500 balls' },
  DECLARED: { letter: 'D', word: 'Declared' },
};

/** The whole screen, header to footer, for whichever ladder is up. */
export function marathonBoardMarkup(view: MarathonBoardView): string {
  const { ladder, youId = null, yours = null, state = 'ready', atMs = Date.now() } = view;
  const team = ladder === 'team';
  const rows: readonly (TeamRow | SoloRow)[] = team ? view.team : view.solo;
  const place = rows.findIndex(row => row.playerId === youId);
  const edge = rows.length >= MARATHON_BOARD_SIZE ? rows[MARATHON_BOARD_SIZE - 1] : null;
  const mine = yours ? (team ? packTeam(yours.team, atMs) : packSolo(yours.solo, atMs)) : null;
  const waiting = place < 0 && mine !== null && marathonQualifies(mine, rows);
  const wouldBe = mine === null ? 0 : rows.filter(row => row.score > mine).length + 1;
  return `
    <div class="board-sheet survive-sheet marathon-sheet is-${ladder}" role="document">
      <div class="sheet-head">
        <div class="sheet-title">
          <p class="board-eyebrow">MARATHON &middot; ${team ? 'TEAM' : 'BATTERS'}</p>
          <h2 id="board-title">Top ${MARATHON_BOARD_SIZE}</h2>
        </div>
        ${sheetKeys()}
      </div>
      <p class="board-line"${state === 'loading' ? ' aria-live="polite"' : ''}>${
        state === 'loading' ? 'Fetching the board…'
        : state === 'offline' ? 'The board could not be reached.'
        : standing(rows, place, team, !!yours, edge)}</p>
      <div class="board-scroll">${state === 'offline' ? '<p class="board-offline">Try again in a moment.</p>' : ''}
        <ol class="board-list survive-list marathon-list">${head(team)}${
          rows.map((row, i) => (team ? teamRow(row as TeamRow, i, row.playerId === youId) : soloRow(row as SoloRow, i, row.playerId === youId))).join('')}
        </ol>
        ${edge ? `<p class="board-cut">${cutLabel(edge, team)}</p>` : ''}
        ${place < 0 && yours
          ? thisInnings(team, yours, waiting ? String(wouldBe) : '&mdash;', waiting ? (wouldBe === 1 ? 'takes the top' : 'yours to claim') : 'not good enough yet')
          : ''}
      </div>
      <p class="board-foot">${team
        ? 'Ranked on total runs, then strike rate, then boundaries, then whoever got there first.'
        : 'The best of the three batters. Ranked on runs, then not out above out, then fewer balls, then whoever got there first.'}</p>
    </div>`;
}

/** The column names, said once at the head of the list. */
function head(team: boolean): string {
  const names = team ? ['runs', 'balls', 'SR', '4s+6s'] : ['runs', 'balls'];
  return `<li class="board-head" aria-hidden="true">
            <span class="board-hits">${names.map(name => `<em${name === 'SR' ? ' class="is-rate"' : ''}>${name}</em>`).join('')}</span>
          </li>`;
}

export function teamRow(row: TeamRow, index: number, you: boolean): string {
  const ended = ENDED[row.ending] ?? ENDED.ALL_OUT;
  return `
          <li class="board-row is-${row.ending.toLowerCase().replace('_', '-')}${you ? ' is-you' : ''}" style="--i:${index}"${you ? ' aria-current="true"' : ''}>
            <span class="board-place">${index + 1}</span>
            <span class="board-result"><i aria-hidden="true">${ended.letter}</i><b>${ended.word}</b></span>
            ${kitMarkup(row.avatar, row.name)}
            <span class="board-who"><b>${escape(row.name)}</b></span>
            ${teamFigures(row)}
          </li>`;
}

function teamFigures(innings: TeamInnings): string {
  return `<span class="board-hits">
              <em>${innings.runs}<b>runs</b></em>
              <em>${innings.balls}<b>balls</b></em>
              <em class="is-rate">${strikeRate(innings.runs, innings.balls).toFixed(1)}<b>strike rate</b></em>
              <em>${innings.boundaries}<b>fours and sixes</b></em>
            </span>`;
}

export function soloRow(row: SoloRow, index: number, you: boolean): string {
  return `
          <li class="board-row${you ? ' is-you' : ''}" style="--i:${index}"${you ? ' aria-current="true"' : ''}>
            <span class="board-place">${index + 1}</span>
            ${orderMarkup(row)}
            ${kitMarkup(row.avatar, row.name)}
            <span class="board-who"><b>${escape(row.name)}</b>${row.left ? '<small>left-handed</small>' : ''}</span>
            ${soloFigures(row)}
          </li>`;
}

/** Which of the three he was: the number, and his title behind it for a reader. */
function orderMarkup(innings: SoloInnings): string {
  const batter = BATTERS[innings.order - 1];
  return `<span class="board-result"><i aria-hidden="true">${innings.order}</i><b>${batter ? batter.title.toLowerCase() : `batter ${innings.order}`}</b></span>`;
}

function soloFigures(innings: SoloInnings): string {
  return `<span class="board-hits">
              <em>${innings.runs}${innings.out ? '' : '<i>*</i>'}<b>runs${innings.out ? '' : ' not out'}</b></em>
              <em>${innings.balls}<b>balls</b></em>
            </span>`;
}

/** The line under the title: where am I, who leads, or what it takes. */
function standing(rows: readonly (TeamRow | SoloRow)[], place: number, team: boolean, played: boolean, edge: TeamRow | SoloRow | null): string {
  const said = (row: TeamRow | SoloRow) => team
    ? `${(row as TeamRow).runs} ${(ENDED[(row as TeamRow).ending] ?? ENDED.ALL_OUT).word.toLowerCase()}`
    : `${row.runs}${(row as SoloRow).out ? '' : '*'} off ${row.balls}`;
  if (place >= 0) return `You are <b>${ordinal(place + 1)}</b> &mdash; ${said(rows[place])}.`;
  if (!rows.length) return 'Nobody has batted yet. First innings takes the top.';
  if (!played) return `${escape(rows[0].name)} leads &mdash; ${said(rows[0])}.`;
  if (!edge) return 'The board is not full. Any innings gets on it.';
  return `${cutLabel(edge, team)}.`;
}

function cutLabel(edge: TeamRow | SoloRow, team: boolean): string {
  return team ? `Beat ${edge.runs} to get on the board` : `Beat ${edge.runs} by one batter to get on the board`;
}

/** The innings just played, below the list: waiting for a name, or short of it. */
function thisInnings(team: boolean, yours: { team: TeamInnings; solo: SoloInnings }, place: string, note: string): string {
  return `
        <ol class="board-list survive-list marathon-list board-missed">
          <li class="board-row is-you" style="--i:0">
            <span class="board-place">${place}</span>
            ${team ? `<span class="board-result"><i aria-hidden="true">${(ENDED[yours.team.ending] ?? ENDED.ALL_OUT).letter}</i><b>${(ENDED[yours.team.ending] ?? ENDED.ALL_OUT).word}</b></span>` : orderMarkup(yours.solo)}
            <span class="board-kit" style="--kit:${kitColour(0)}" aria-hidden="true">?</span>
            <span class="board-who"><b>This innings</b><small>${note}</small></span>
            ${team ? teamFigures(yours.team) : soloFigures(yours.solo)}
          </li>
        </ol>`;
}

function ordinal(n: number) {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}
