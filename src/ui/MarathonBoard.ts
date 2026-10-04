import { kitColour } from '../config/board';
import { BATTERS, type MarathonEnding } from '../config/marathon';
import {
  MARATHON_BOARD_SIZE, marathonQualifies, packSolo, packTeam, strikeRate,
  type SoloInnings, type SoloRow, type TeamInnings, type TeamRow,
} from '../game/marathon-board';
import { escape, kitMarkup, sheetKeys, type CardOffer } from './Leaderboard';

/**
 * The Test Marathon's board, as a screen: two ladders behind a toggle.
 *
 * One figure a row, big, on the right — the runs, which is what both ladders
 * rank on first — and everything else said in words under the name: how the
 * innings ended, the balls it took and the boundaries in it on the team
 * ladder, which of the three he was on the individual one, with the strike
 * rate quiet under the runs. The first cut borrowed Test Survival's quiet
 * columns, four figures abreast at one size, and the playtest found them a
 * wall of numbers — "312 452 69.0 35" read as one long number — with letters
 * in front that only the footnote explained.
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
const ENDED: Record<MarathonEnding, { word: string }> = {
  ALL_OUT: { word: 'All out' },
  RETIRED: { word: 'Retired hurt' },
  BALLS: { word: 'Batted out' },
  DECLARED: { word: 'Declared' },
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
        <ol class="board-list marathon-list">${
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

export function teamRow(row: TeamRow, index: number, you: boolean): string {
  return `
          <li class="board-row marathon-row is-${endingClass(row.ending)}${you ? ' is-you' : ''}" style="--i:${index}"${you ? ' aria-current="true"' : ''}>
            <span class="board-place">${index + 1}</span>
            ${kitMarkup(row.avatar, row.name)}
            <span class="board-who"><b>${escape(row.name)}</b>${teamLine(row)}</span>
            ${total(row.runs, true, row.balls)}
          </li>`;
}

/** How a team innings ended, its balls and its boundaries, in words. */
function teamLine(innings: TeamInnings): string {
  const ended = ENDED[innings.ending] ?? ENDED.ALL_OUT;
  return `<small><i class="marathon-end">${ended.word}</i> · ${innings.balls} balls · ${innings.boundaries} 4s &amp; 6s</small>`;
}

const endingClass = (ending: MarathonEnding) => ending.toLowerCase().replace('_', '-');

/** The one big figure, the star when not out, and the strike rate quiet under it. */
function total(runs: number, out: boolean, balls: number): string {
  return `<span class="board-total"><b>${runs}${out ? '' : '<i aria-hidden="true">*</i>'}<span class="marathon-sr"> runs${out ? '' : ' not out'}</span></b><small>SR ${strikeRate(runs, balls).toFixed(1)}</small></span>`;
}

export function soloRow(row: SoloRow, index: number, you: boolean): string {
  return `
          <li class="board-row marathon-row${you ? ' is-you' : ''}" style="--i:${index}"${you ? ' aria-current="true"' : ''}>
            <span class="board-place">${index + 1}</span>
            ${kitMarkup(row.avatar, row.name)}
            <span class="board-who"><b>${escape(row.name)}</b>${soloLine(row)}</span>
            ${total(row.runs, row.out, row.balls)}
          </li>`;
}

/** Which of the three he was, which hand, and his balls, in words. */
function soloLine(innings: SoloInnings): string {
  const batter = BATTERS[innings.order - 1];
  const title = batter ? batter.title.charAt(0) + batter.title.slice(1).toLowerCase() : `Batter ${innings.order}`;
  return `<small><i class="marathon-order">${title}</i>${innings.left ? ' · left-handed' : ''} · ${innings.balls} balls</small>`;
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
  const line = team ? teamLine(yours.team) : soloLine(yours.solo);
  return `
        <ol class="board-list marathon-list board-missed">
          <li class="board-row marathon-row is-you${team ? ` is-${endingClass(yours.team.ending)}` : ''}" style="--i:0">
            <span class="board-place">${place}</span>
            <span class="board-kit" style="--kit:${kitColour(0)}" aria-hidden="true">?</span>
            <span class="board-who"><b>This innings <em>${note}</em></b>${line}</span>
            ${team ? total(yours.team.runs, true, yours.team.balls) : total(yours.solo.runs, yours.solo.out, yours.solo.balls)}
          </li>
        </ol>`;
}

/**
 * What the Marathon card has to say about the boards: the claim if the innings
 * would make either ladder and beat the row the player already holds there,
 * their standing row if they hold one and this did not beat it, and nothing
 * otherwise. The place it offers is the team ladder's where that one takes it,
 * since the total is what the card leads with, and the individual's where only
 * that one does.
 */
export function marathonOffer(
  reached: boolean, rows: { team: readonly TeamRow[]; solo: readonly SoloRow[] },
  yours: { team: TeamInnings; solo: SoloInnings }, atMs: number, youId: string | null = null,
): CardOffer {
  if (!reached) return { kind: 'silent' };
  const team = packTeam(yours.team, atMs), solo = packSolo(yours.solo, atMs);
  const heldTeam = youId ? rows.team.findIndex(row => row.playerId === youId) : -1;
  const heldSolo = youId ? rows.solo.findIndex(row => row.playerId === youId) : -1;
  const takesTeam = marathonQualifies(team, rows.team) && (heldTeam < 0 || team > rows.team[heldTeam].score);
  const takesSolo = marathonQualifies(solo, rows.solo) && (heldSolo < 0 || solo > rows.solo[heldSolo].score);
  if (takesTeam) return { kind: 'claim', place: rows.team.filter(row => row.score > team).length + 1 };
  if (takesSolo) return { kind: 'claim', place: rows.solo.filter(row => row.score > solo).length + 1 };
  if (heldTeam >= 0) return { kind: 'standing', runs: rows.team[heldTeam].runs, place: heldTeam + 1 };
  return { kind: 'silent' };
}

/** What a standing team row still says, for the card's "your best stands" line. */
export function marathonBest(row: TeamRow): string {
  return `${row.runs} ${(ENDED[row.ending] ?? ENDED.ALL_OUT).word.toLowerCase()}`;
}

function ordinal(n: number) {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}
