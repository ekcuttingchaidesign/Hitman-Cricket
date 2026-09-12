import { AVATARS, avatarSrc, kitColour } from '../config/board';
import { GAME } from '../config/gameplay';
import {
  BOARD_SIZE, decidedBy, packScore, type BoardRow, type Innings, type LadderKey,
} from '../game/leaderboard';

/**
 * The board, as a screen.
 *
 * Fifty rows and a line under the last one. Everything here is a string of HTML
 * built from figures and nothing else — no element is reached for, no row is
 * patched in place — which is how the rest of this interface is written and
 * what lets fifty rows be checked in a test with no browser in the room.
 *
 * The rows it is handed are invented until the endpoints land. Nothing in here
 * knows that, and nothing in here will have to change when they do.
 */

/**
 * A player's kit: their picture, on a disc the colour of that picture's own ring.
 *
 * The disc is not decoration and not a fallback letter. It is what fills the
 * space for the moment before the picture paints, and because its colour is
 * sampled off the ring in the picture itself, that moment is a continuous load
 * rather than a colour changing under the reader. A picture that will not load
 * at all leaves the disc behind, which still tells the five kits apart — and in
 * a board row the player's name is written beside it either way.
 */
export function kitMarkup(avatar: number, _name = '', extra = ''): string {
  return `<span class="board-kit${extra}" style="--kit:${kitColour(avatar)}" aria-hidden="true"><img src="${avatarSrc(avatar)}" alt="" loading="lazy" decoding="async" onerror="this.remove()"></span>`;
}

export interface BoardView {
  /** In board order, best first. Fifty of them, or fewer while it fills. */
  rows: readonly BoardRow[];
  /** Which row is the player's, if one of them is. */
  youId?: string | null;
  /** The innings the player just played, when it did not make the board. */
  yours?: Innings | null;
  /** Whether these rows are the board, on their way, or unavailable. */
  state?: 'ready' | 'loading' | 'offline';
  /**
   * Whether the sheet carries the innings-end keys. It does when the board is
   * opened straight after claiming a place, because at that moment the board is
   * the screen the player is on and playing again has to be reachable from it.
   */
  actions?: boolean;
}

/**
 * What actually separated a row from the one above it, once they are level on
 * runs. Rows that were split on runs get nothing: that is the board working
 * normally and needs no explaining. A pair that agree on every playing key were
 * split by the clock, which is worth saying outright, because two identical
 * innings sitting one above the other looks like a bug until it is labelled.
 */
export function tieNote(above: Innings, row: Innings): string | null {
  const key = decidedBy(above, row);
  if (key === 'runs') return null;
  // Short enough never to wrap a row at phone width, which is why the note does
  // not repeat the score: it is already the largest thing on the same row, and
  // "level" beside it says the two are the same number without printing it
  // twice. The figures are named the way their own columns are.
  const notes: Record<LadderKey, string> = {
    runs: '', sixes: 'fewer 6s', fours: 'fewer 4s',
    wickets: 'lost more', dots: 'more dots',
  };
  return `level · ${key ? notes[key] : 'later'}`;
}

/**
 * The figure a tie turned on, when it is one the row actually shows. Sixes and
 * fours have their own columns, and wickets ride alongside the runs; dots have
 * no column, so a tie on dots is carried by the note under the name instead of
 * a highlight that would have nothing to land on.
 */
export function decider(above: Innings | null, row: Innings): LadderKey | null {
  if (!above) return null;
  const key = decidedBy(above, row);
  return key && key !== 'runs' && key !== 'dots' ? key : null;
}

/** The score an innings has to beat to get on, or null while the board fills. */
export function cutoff(rows: readonly BoardRow[]): BoardRow | null {
  return rows.length >= BOARD_SIZE ? rows[BOARD_SIZE - 1] : null;
}

/**
 * The three rows around the player, for the innings-end card.
 *
 * Not the board — a glimpse of the part of it the player is standing in. The
 * row above and the row below are the whole point: "fifth has 106" is what
 * makes 101 mean something, and a place on its own does not. Each row carries
 * the same three figures the board does, so the peek is a true preview of the
 * screen the register key opens rather than a different thing that resembles it.
 *
 * The player's own row is synthesised, because until they register they are not
 * on the board at all.
 */
export function peekMarkup(
  rows: readonly BoardRow[], place: number, yours: Innings, kit: number | null = null, name = 'You',
): string {
  const lines: string[] = [];
  // `place` is where the innings would sit, counting from one. The row above it
  // is the one currently holding that place minus one; the row below is the one
  // currently holding it, since submitting pushes everything down.
  const above = rows[place - 2];
  const below = rows[place - 1];
  if (above) lines.push(peekRow(place - 1, above.name, above.avatar, above, false));
  lines.push(peekRow(place, name, kit, yours, true));
  if (below) lines.push(peekRow(place + 1, below.name, below.avatar, below, false));
  // At the very top there is nothing above, so the board's second row stands in
  // rather than leaving a gap where a row should be.
  if (!above && rows[place]) lines.push(peekRow(place + 2, rows[place].name, rows[place].avatar, rows[place], false));
  return `<ol class="board-list card-peek">${lines.join('')}</ol>`;
}

/**
 * A player who has not picked a kit yet gets the card's accent rather than the
 * first kit, or their row can end up the same colour as the neighbour it is
 * meant to stand out from.
 */
function peekRow(place: number, name: string, kit: number | null, figures: Innings, you: boolean): string {
  const disc = kit === null
    ? `<span class="board-kit is-unclaimed" aria-hidden="true">${initial(name)}</span>`
    : kitMarkup(kit, you ? name : '');
  return `
            <li class="board-row${you ? ' is-you' : ''}" style="--i:${place}"${you ? ' aria-current="true"' : ''}>
              <span class="board-place">${place}</span>
              ${disc}
              <span class="board-who"><b>${you ? escape(name) : '<i class="board-blank"></i>'}</b></span>
              <span class="board-runs">${figures.runs}</span>
              <span class="board-hits"><em>${figures.sixes}<small>6s</small></em><em>${figures.fours}<small>4s</small></em></span>
            </li>`;
}

/** The whole screen, header to footer. */
export function boardMarkup(view: BoardView): string {
  const { rows, youId = null, yours = null, state = 'ready', actions = false } = view;
  const edge = cutoff(rows);
  const yourPlace = rows.findIndex(row => row.playerId === youId);
  return `
    <div class="board-sheet" role="document">
      <div class="sheet-head">
        <p class="board-eyebrow">HITMAN OVAL</p>
        <h2 id="board-title">Top ${BOARD_SIZE}</h2>
        <button id="board-close" class="board-close" aria-label="Close the board">×</button>
      </div>
      <p class="board-line"${state === 'loading' ? ' aria-live="polite"' : ''}>${
        state === 'loading' ? 'Fetching the board…'
        : state === 'offline' ? 'The board could not be reached.'
        : standing(rows, yourPlace, yours, edge)}</p>
      <div class="board-scroll">${state === 'offline' ? offlineMarkup(yours) : ''}
        <ol class="board-list">${rows.map((row, i) => rowMarkup(row, i, rows[i - 1] ?? null, row.playerId === youId)).join('')}
        </ol>
        ${edge ? `<p class="board-cut">${cutLabel(edge)}</p>` : ''}
        ${yourPlace < 0 && yours ? missedMarkup(yours, edge) : ''}
      </div>
      <p class="board-foot">One innings a player, best only. Level scores are split on sixes, then fours, then wickets, then dot balls &mdash; and if all of that ties, whoever got there first stays above.</p>
      ${actions ? actionsMarkup() : ''}
    </div>`;
}

/** One row: place, kit, name, what the innings came to, and how it was made. */
export function rowMarkup(row: BoardRow, index: number, above: BoardRow | null, you: boolean): string {
  const note = above ? tieNote(above, row) : null;
  const split = decider(above, row);
  const classes = ['board-row', you ? 'is-you' : '', note ? 'is-level' : ''].filter(Boolean).join(' ');
  return `
          <li class="${classes}" style="--i:${index}"${you ? ' aria-current="true"' : ''}>
            <span class="board-place">${index + 1}</span>
            ${kitMarkup(row.avatar, row.name)}
            <span class="board-who"><b>${escape(row.name)}</b>${note ? `<small>${note}</small>` : ''}</span>
            <span class="board-runs${split === 'wickets' ? ' is-split' : ''}">${row.runs}<i>/${row.wickets}</i></span>
            <span class="board-hits">
              <em class="${split === 'sixes' ? 'is-split' : ''}">${row.sixes}<small>6s</small></em>
              <em class="${split === 'fours' ? 'is-split' : ''}">${row.fours}<small>4s</small></em>
            </span>
          </li>`;
}

/**
 * Play again, and the two ways of sending the innings out, pinned to the foot of
 * the sheet rather than sitting after the fiftieth row. Fifty rows is a long
 * scroll, and a player who has just been put on the board should not have to
 * reach the bottom of it to leave.
 *
 * Their ids are the card's own with a prefix, because the same two keys exist on
 * the card and one document cannot hold two of an id.
 */
function actionsMarkup(): string {
  return `
      <div class="board-actions">
        <button id="board-again" class="key-button">PLAY AGAIN</button>
        <div class="card-shares">
          <a id="board-whatsapp" class="whatsapp-key" href="https://wa.me/" target="_blank" rel="noopener noreferrer">SHARE</a>
          <button id="board-story" class="story-key">INSTA STORY</button>
        </div>
      </div>`;
}

/**
 * The words on the cut-off line. A board whose fiftieth row is a duck still has
 * a cut — you have to beat nought on the split to get past it — but "0 gets you
 * on the board" is not what that means, so it is said the other way round.
 */
export function cutLabel(edge: BoardRow): string {
  return edge.runs > 0 ? `${edge.runs} gets you on the board` : 'Any run gets you on the board';
}

/**
 * The board being down is never the player's problem, so this says what happened
 * and what is still true rather than apologising. The innings just played is
 * still shown, because it is the thing they came to look at.
 */
function offlineMarkup(yours: Innings | null): string {
  return `
        <p class="board-offline">Nothing is lost &mdash; your innings still counts on this device, and the board will have it next time. Try again in a moment.</p>${
          yours ? `
        <ol class="board-list board-missed">
          <li class="board-row is-you" style="--i:0">
            <span class="board-place">&mdash;</span>
            <span class="board-kit" style="--kit:${kitColour(0)}" aria-hidden="true">?</span>
            <span class="board-who"><b>This innings</b><small>not sent yet</small></span>
            <span class="board-runs">${yours.runs}<i>/${yours.wickets}</i></span>
            <span class="board-hits"><em>${yours.sixes}<small>6s</small></em><em>${yours.fours}<small>4s</small></em></span>
          </li>
        </ol>` : ''}`;
}

/**
 * The line under the title. It answers the one question the player opened the
 * board to ask, which is a different question depending on whether they are on
 * it: where am I, or what would it take.
 */
function standing(rows: readonly BoardRow[], place: number, yours: Innings | null, edge: BoardRow | null): string {
  if (place >= 0) return `You are <b>${ordinal(place + 1)}</b> with ${rows[place].runs}.`;
  if (!rows.length) return 'Nobody has batted yet. First innings takes the top.';
  if (!yours) return `${rows[0].name} leads with <b>${rows[0].runs}</b>.`;
  if (!edge) return `The board is not full. Any innings gets on it.`;
  const short = edge.runs - yours.runs;
  return short > 0
    ? `You are <b>${short}</b> short of the board.`
    : `Level with ${ordinal(BOARD_SIZE)} on runs &mdash; ${splitWord(edge, yours)} keeps you off.`;
}

/** Why a level score still misses, in the fewest words that are true. */
function splitWord(edge: Innings, yours: Innings): string {
  const key = decidedBy(edge, yours);
  return key === 'sixes' ? 'sixes' : key === 'fours' ? 'fours'
    : key === 'wickets' ? 'wickets lost' : key === 'dots' ? 'dot balls' : 'getting there first';
}

/** Your innings, shown below the line when it did not make it. */
function missedMarkup(yours: Innings, edge: BoardRow | null): string {
  const short = edge ? Math.max(0, edge.runs - yours.runs) : 0;
  return `
        <ol class="board-list board-missed" start="${BOARD_SIZE + 1}">
          <li class="board-row is-you" style="--i:0">
            <span class="board-place">&mdash;</span>
            <span class="board-kit" style="--kit:${kitColour(0)}" aria-hidden="true">?</span>
            <span class="board-who"><b>This innings</b><small>${short ? `${short} short` : 'level, and below on the split'}</small></span>
            <span class="board-runs">${yours.runs}<i>/${yours.wickets}</i></span>
            <span class="board-hits"><em>${yours.sixes}<small>6s</small></em><em>${yours.fours}<small>4s</small></em></span>
          </li>
        </ol>`;
}

/**
 * The five kits to choose from, on the innings-end card. One radio group, so a
 * keyboard arrows through it and a screen reader announces it as the one choice
 * it is rather than as five buttons.
 */
export function pickerMarkup(chosen: number): string {
  return `<div class="kit-picker" role="radiogroup" aria-label="Pick your kit">${
    Array.from({ length: AVATARS }, (_, i) => `
      <button type="button" class="kit-option${i === chosen ? ' is-chosen' : ''}" role="radio" aria-checked="${i === chosen}" data-kit="${i}" aria-label="Kit ${i + 1}">
        ${kitMarkup(i, '')}
      </button>`).join('')}</div>`;
}

/**
 * The letter in a disc that has no picture behind it — which is now only the
 * row of a player who has not registered yet, and so has not picked a kit.
 */
function initial(name: string) {
  return escape([...name.trim()][0]?.toUpperCase() ?? '');
}

function ordinal(n: number) {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/**
 * Names come off the board, which means they come from other players, so they
 * are written into the page as text and never as markup. The store will have
 * its own say about what a name may contain; this is the last line either way.
 */
export function escape(text: string) {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** The innings just played, as the board would rank it, for the "did I get on" line. */
export function asInnings(score: { runs: number; wickets: number; balls: number; fours: number; sixes: number; dots: number }): Innings {
  return {
    runs: score.runs, sixes: score.sixes, fours: score.fours,
    wickets: score.wickets, dots: score.dots, balls: Math.min(score.balls, GAME.totalBalls),
  };
}

/** Where an innings would sit, if it were submitted now. Used for the cover line. */
export function placeOf(rows: readonly BoardRow[], yours: Innings, atMs: number): number {
  const score = packScore(yours, atMs);
  const above = rows.filter(row => row.score > score).length;
  return above + 1;
}
