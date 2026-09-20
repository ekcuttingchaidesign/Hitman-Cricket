import {
  BLAST_BOARDS, SURVIVE_BOARDS,
  type BlastCareer, type CareerBoard, type CareerMode, type SurviveCareer,
} from '../game/career';
import type { CareerRow } from '../game/career-api';
import { escape, kitMarkup, sheetKeys } from './Leaderboard';

/**
 * The career boards and the card, as screens.
 *
 * They are one file because they are one record. Every figure on the card is a
 * figure some board ranks, and every board's row is three of the card's
 * figures — written apart, the two would eventually disagree about what a six
 * is called or how a nought reads, and the player would be looking at both in
 * the same sheet a tab apart.
 *
 * Everything here is a string of HTML built from figures and nothing else, the
 * way the rest of this interface is written, so the whole of it can be checked
 * in a test with no browser in the room.
 */

/**
 * Either mode's career, which is what the sheet deals in.
 *
 * The screen never reads a figure off one of these itself — it asks the board
 * for its own columns, and the board knows which shape it is ranking. So the
 * union is only ever carried, never inspected, which is why one screen can draw
 * seven ladders over two different records.
 */
export type AnyCareer = BlastCareer | SurviveCareer;

/**
 * What the sheet is showing, under the mode tabs: `best`, `you`, or a career
 * board's own key.
 *
 * `best` is the innings board this game opened with — the single best innings
 * anybody has played — and it stays the tab a player lands on, because it is
 * the board they have always known and the one an innings just played is
 * measured against. The career boards sit beside it, and `you` is the player's
 * own figures.
 *
 * Deliberately `string` rather than a union of the three. The career keys are
 * declared on the ladders in `game/career.ts` so that adding a board is one
 * entry in one array, and a union written out here would be a second list to
 * keep in step with the first — which is the thing that list exists to avoid.
 * An unknown key falls back to `best` rather than drawing nothing.
 */
export type LadderTab = string;

/**
 * The tabs one mode offers, in the order they are drawn.
 *
 * The player's own card is deliberately not among them. Every pill here answers
 * "where do I stand" and is read against the rows underneath it; the card
 * answers "what have I done", belongs to one person, and exists to be sent to
 * somebody. Sitting in this strip it read as a seventh ladder — and the one key
 * on the whole screen that leads somewhere rather than sorting it should not be
 * disguised as the six that do not. It has its own key under the sheet.
 */
export function laddersOf(mode: CareerMode): { key: LadderTab; name: string }[] {
  const career = mode === 'survive' ? SURVIVE_BOARDS : BLAST_BOARDS;
  return [
    // What the board has always been called in everything but name: the biggest
    // score anybody has put together in one innings. "Best innings" described
    // it accurately and conveyed nothing — players already know this board as
    // the one where the highest total stays on top.
    { key: 'best', name: 'Top score' },
    ...career.map(board => ({ key: board.key, name: board.name })),
  ];
}

/**
 * One career board's definition, by mode and key.
 *
 * The cast widens a board that reads one mode's record into one that claims to
 * read either, which TypeScript cannot check and the mode guarantees: a board
 * only ever reaches a row through the same mode that produced it, because the
 * mode chooses the list here and chooses the rows the endpoint answers with.
 * Written the honest way round, every caller would carry the mode twice — once
 * to pick the board and once to pick the record — and be able to get them out
 * of step. This is the one place they can be wrong, and it is four lines long.
 */
export function careerBoardOf(mode: CareerMode, key: string): CareerBoard<AnyCareer> | null {
  const boards = (mode === 'survive' ? SURVIVE_BOARDS : BLAST_BOARDS) as readonly CareerBoard<AnyCareer>[];
  return boards.find(board => board.key === key) ?? null;
}

/**
 * The second row of tabs: which ladder of this mode is being looked at.
 *
 * Two rows rather than one long row of eight, because the two questions are
 * different sizes. Which mode is a question about what you played; which ladder
 * is a question about what you want to be measured on, and it only exists
 * inside a mode. Flattened into one row they would read as eight equal
 * choices, and at phone width they would wrap into an unreadable block.
 */
export function ladderTabsMarkup(mode: CareerMode, active: LadderTab): string {
  return `
    <div class="ladder-tabs" role="tablist" aria-label="Which ladder">${laddersOf(mode).map(tab => {
      const on = tab.key === active;
      return `
      <button id="board-ladder-${tab.key}" class="ladder-tab${on ? ' is-on' : ''}" role="tab" type="button" aria-selected="${on}">${escape(tab.name)}</button>`;
    }).join('')}
    </div>`;
}

export interface CareerBoardView {
  mode: CareerMode;
  board: CareerBoard<AnyCareer>;
  rows: readonly CareerRow<AnyCareer>[];
  youId?: string | null;
  state?: 'ready' | 'loading' | 'offline';
  size?: number;
  /** Whether the sheet carries the innings-end keys, as it does after claiming. */
  actionsMarkup?: string;
}

/** A whole career board, header to footer. */
export function careerBoardMarkup(view: CareerBoardView): string {
  const { mode, board, rows, youId = null, state = 'ready', size = 50, actionsMarkup = '' } = view;
  const place = rows.findIndex(row => row.playerId === youId);
  return `
    <div class="board-sheet" role="document">
      <div class="sheet-head">
        <p class="board-eyebrow">${mode === 'survive' ? 'TEST SURVIVAL' : 'THE BLAST'} &middot; ALL TIME</p>
        <h2 id="board-title">${escape(board.name)}</h2>
        ${sheetKeys()}
      </div>
      <p class="board-line"${state === 'loading' ? ' aria-live="polite"' : ''}>${
        state === 'loading' ? 'Fetching the board…'
        : state === 'offline' ? 'The board could not be reached.'
        : careerStanding(board, rows, place)}</p>
      <div class="board-scroll">
        <ol class="board-list">${rows.map((row, i) => careerRowMarkup(board, row, i, row.playerId === youId)).join('')}
        </ol>
        ${state === 'ready' && !rows.length ? '<p class="board-cut">Nobody has a career here yet. Play an innings and it starts.</p>' : ''}
      </div>
      <p class="board-foot">Top ${size}, added up over every innings you have played on this device. ${escape(board.blurb)} Register a name to appear here.</p>
      ${actionsMarkup}
    </div>`;
}

/**
 * One row. The columns are the board's own, which is what lets a board added to
 * the ladder list appear here with no change to this function — and the shape
 * is the innings board's row on purpose, so the two read as one board with more
 * than one ladder rather than as two screens that happen to be tabbed together.
 */
export function careerRowMarkup(
  board: CareerBoard<AnyCareer>, row: CareerRow<AnyCareer>, index: number, you: boolean,
): string {
  const [lead, ...rest] = board.figures;
  return `
          <li class="board-row${you ? ' is-you' : ''}" style="--i:${index}"${you ? ' aria-current="true"' : ''}>
            <span class="board-place">${index + 1}</span>
            ${kitMarkup(row.avatar, row.name)}
            <span class="board-who"><b>${escape(row.name)}</b></span>
            <span class="board-runs">${lead.of(row.career)}</span>
            <span class="board-hits">${rest.map(figure =>
              `<em>${figure.of(row.career)}<small>${escape(figure.label)}</small></em>`).join('')}</span>
          </li>`;
}

/**
 * The line under the title: where the player stands, or what the board is
 * waiting for. The same question the innings board's line answers, asked of a
 * career.
 */
function careerStanding(
  board: CareerBoard<AnyCareer>, rows: readonly CareerRow<AnyCareer>[], place: number,
): string {
  const lead = board.figures[0];
  if (place >= 0) return `You are <b>${ordinal(place + 1)}</b> with ${lead.of(rows[place].career)} ${escape(lead.label)}.`;
  if (!rows.length) return 'Nobody is on this one yet. First career takes the top.';
  return `${escape(rows[0].name)} leads with <b>${lead.of(rows[0].career)}</b> ${escape(lead.label)}.`;
}

function ordinal(n: number) {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/** Where this player stands on each of a mode's career boards, one to fifty. */
export function placesOf(
  boards: Record<string, readonly CareerRow<AnyCareer>[]>, youId: string | null,
): Record<string, number> {
  if (!youId) return {};
  const places: Record<string, number> = {};
  for (const [key, rows] of Object.entries(boards)) {
    const at = rows.findIndex(row => row.playerId === youId);
    if (at >= 0) places[key] = at + 1;
  }
  return places;
}

/**
 * The best place this player holds on any of a mode's career ladders, as a
 * phrase — and only the best one. Naming all four would be four lines of the
 * same sentence on a card with no room for one; naming none would waste the
 * only line on it that says where they actually stand.
 */
export function bestStanding(mode: CareerMode, places: Record<string, number>): string | null {
  const best = Object.entries(places)
    .filter(([, place]) => place > 0)
    .sort((a, b) => a[1] - b[1])[0];
  if (!best) return null;
  return `${ordinal(best[1])} on ${careerBoardOf(mode, best[0])?.name ?? best[0]}`;
}
