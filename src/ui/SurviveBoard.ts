import { kitColour } from '../config/board';
import { HEALTH, SURVIVE } from '../config/survive';
import {
  SURVIVE_BOARD_SIZE, packSurvive, standingOf, surviveDecidedBy, surviveImprovesOn, surviveQualifies,
  type Standing, type SurviveInnings, type SurviveRow,
} from '../game/survive-board';
import { escape, kitMarkup, type CardOffer } from './Leaderboard';

/**
 * The Test board, as a screen.
 *
 * It is the other sheet's twin and deliberately not the other sheet. The five
 * over board is a list of scores and the score is the whole story, so its rows
 * read runs, sixes, fours. A Test row's story is which of three contests the
 * innings ended up in — and a hundred off thirty-eight balls, a draw made of
 * sixty blocked ones and a man carried off on twelve are three different
 * achievements that happen to be written in the same digits. So every row here
 * leads with what happened and carries the figures underneath it, and the sheet
 * is built out of the same pieces as the other one so that the two feel like one
 * board with two ladders rather than two boards.
 */

export interface SurviveBoardView {
  /** In board order, best first. Fifty of them, or fewer while it fills. */
  rows: readonly SurviveRow[];
  /** Which row is the player's, if one of them is. */
  youId?: string | null;
  /** The innings just played, when it is not already a row. */
  yours?: SurviveInnings | null;
  /** When the sheet is being drawn. Only a test ever needs to say. */
  atMs?: number;
  state?: 'ready' | 'loading' | 'offline';
  /** Whether the sheet carries the innings-end keys, as it does after claiming. */
  actions?: boolean;
}

/**
 * What the innings was, in the fewest words that are true — and the one line
 * every row, every peek and the header are all written from, so the board never
 * describes the same innings two ways.
 *
 * A loss is told apart on the wicket rather than on the balls: nine down and a
 * wicket makes ten, and no wicket at all with balls still to bowl means he was
 * carried off. That difference is the whole of what the injury bar is for, so
 * the board is not allowed to flatten it into "out".
 */
export function surviveLine(innings: SurviveInnings): string {
  const standing = standingOf(innings);
  if (standing === 'WON') {
    const spare = SURVIVE.totalBalls - innings.balls;
    return spare > 0 ? `Won, ${spare} ${spare === 1 ? 'ball' : 'balls'} to spare` : 'Won off the last ball';
  }
  if (standing === 'DRAWN') return 'Drew the match';
  return innings.wickets > 0 ? 'Bowled out' : 'Retired hurt';
}

/** The row's tier, as a class, so the line above can be coloured by it. */
function tierClass(innings: SurviveInnings): string {
  return `is-${standingOf(innings).toLowerCase()}`;
}

/** The score an innings has to beat to get on, or null while the board fills. */
export function surviveCutoff(rows: readonly SurviveRow[]): SurviveRow | null {
  return rows.length >= SURVIVE_BOARD_SIZE ? rows[SURVIVE_BOARD_SIZE - 1] : null;
}

/**
 * The words on the cut-off line. What it takes to get on depends on which
 * contest the fiftieth row is sitting in, because that is the row an innings has
 * to get past — so the sentence names that contest rather than quoting a number
 * from a ladder the reader is not on.
 */
export function surviveCutLabel(edge: SurviveRow): string {
  const standing = standingOf(edge);
  if (standing === 'WON') return `A win inside ${edge.balls} balls gets you on the board`;
  if (standing === 'DRAWN') return `A draw with ${edge.runs} gets you on the board`;
  return edge.balls > 0 ? `${edge.balls} balls faced gets you on the board` : 'Any ball faced gets you on the board';
}

/** The whole screen, header to footer. */
export function surviveBoardMarkup(view: SurviveBoardView): string {
  const { rows, youId = null, yours = null, state = 'ready', actions = false, atMs = Date.now() } = view;
  const edge = surviveCutoff(rows);
  const yourPlace = rows.findIndex(row => row.playerId === youId);
  const waiting = yourPlace < 0 && yours ? surviveQualifies(yours, atMs, rows) : false;
  return `
    <div class="board-sheet survive-sheet" role="document">
      <div class="sheet-head">
        <p class="board-eyebrow">HITMAN OVAL &middot; TEST SURVIVAL</p>
        <h2 id="board-title">Top ${SURVIVE_BOARD_SIZE}</h2>
        <button id="board-close" class="board-close" aria-label="Close the board">×</button>
      </div>
      <p class="board-line"${state === 'loading' ? ' aria-live="polite"' : ''}>${
        state === 'loading' ? 'Fetching the board…'
        : state === 'offline' ? 'The board could not be reached.'
        : surviveStanding(rows, yourPlace, yours, edge)}</p>
      <div class="board-scroll">${state === 'offline' ? surviveOffline(yours) : ''}
        <ol class="board-list survive-list">${
          rows.map((row, i) => surviveRowMarkup(row, i, row.playerId === youId, rows[i - 1] ?? null)).join('')}
        </ol>
        ${edge ? `<p class="board-cut">${surviveCutLabel(edge)}</p>` : ''}
        ${yourPlace < 0 && yours
          ? waiting
            ? surviveMine(yours, String(survivePlaceOf(rows, yours, atMs)), survivePlaceOf(rows, yours, atMs) === 1 ? 'takes the top' : 'yours to claim')
            : surviveMine(yours, '&mdash;', 'not good enough yet')
          : ''}
      </div>
      <p class="board-foot">A win beats a draw beats a loss. Wins are ranked on balls used &mdash; a chase is a race &mdash; draws on the runs made while surviving, and losses on how long the last man kept them out. Level innings are split on runs, then on who took the lesser battering, and if that ties too, whoever got there first stays above.</p>
      ${actions ? surviveActions() : ''}
    </div>`;
}

/**
 * Why this row sits under the one above it, in the two cases where nothing on
 * the row says so.
 *
 * A pair split by the tier, by the tier's own figure or by runs needs no note:
 * the line and the columns already carry all three, and labelling what the
 * reader can see is noise. The other two are invisible. Level on everything a
 * scorecard holds and split on the meter reads as an arbitrary order until the
 * battering is named, and level on the meter too means the clock decided, which
 * is worth admitting outright rather than leaving as a pair of identical rows
 * that look like a bug.
 */
export function surviveTieNote(above: SurviveInnings | null, row: SurviveInnings): string | null {
  if (!above) return null;
  const key = surviveDecidedBy(above, row);
  if (key) return key === 'health' ? 'more hurt' : null;
  return 'later';
}

/** One row: place, kit, name, what happened, and the figures under it. */
export function surviveRowMarkup(
  row: SurviveRow, index: number, you: boolean, above: SurviveInnings | null = null,
): string {
  const note = surviveTieNote(above, row);
  const classes = ['board-row', tierClass(row), you ? 'is-you' : ''].filter(Boolean).join(' ');
  return `
          <li class="${classes}" style="--i:${index}"${you ? ' aria-current="true"' : ''}>
            <span class="board-place">${index + 1}</span>
            ${kitMarkup(row.avatar, row.name)}
            <span class="board-who"><b>${escape(row.name)}</b><small><span>${surviveLine(row)}</span>${
              note ? `<i>&middot; ${note}</i>` : ''}</small></span>
            <span class="board-runs">${row.runs}<i>${row.wickets ? '' : '*'}</i></span>
            <span class="board-hits">
              <em>${row.balls}<small>balls</small></em>
              <em>${row.blows}<small>blows</small></em>
            </span>
          </li>`;
}

function surviveActions(): string {
  return `
      <div class="board-actions">
        <button id="board-again" class="key-button">PLAY AGAIN</button>
        <button id="board-modes" class="ghost-link">Mode selection</button>
      </div>`;
}

/**
 * The line under the title: where am I, or what would it take. The same question
 * the other sheet answers, asked of a ladder where "short of the board" cannot
 * be said in runs — an innings can miss by being slower, by scoring less or by
 * not lasting, and which one it was is exactly what the tiers are for.
 */
function surviveStanding(
  rows: readonly SurviveRow[], place: number, yours: SurviveInnings | null, edge: SurviveRow | null,
): string {
  if (place >= 0) return `You are <b>${ordinal(place + 1)}</b> &mdash; ${lower(surviveLine(rows[place]))}.`;
  if (!rows.length) return 'Nobody has batted yet. First innings takes the top.';
  if (!yours) return `${escape(rows[0].name)} leads &mdash; ${lower(surviveLine(rows[0]))}.`;
  if (!edge) return 'The board is not full. Any innings gets on it.';
  return surviveCutLabel(edge) + '.';
}

/**
 * The board being down is never the player's problem, and the innings just
 * played is still the thing they came to look at.
 */
function surviveOffline(yours: SurviveInnings | null): string {
  return `
        <p class="board-offline">Nothing is lost &mdash; your innings still counts on this device, and the board will have it next time. Try again in a moment.</p>${
          yours ? surviveMine(yours, '&mdash;', 'not sent yet') : ''}`;
}

/**
 * Your innings, shown below the line: waiting for a name, missed, or stranded by
 * a board that would not answer. One shape for all three, because they differ
 * only in what the place reads and what the note says.
 */
function surviveMine(yours: SurviveInnings, place: string, note: string): string {
  return `
        <ol class="board-list survive-list board-missed">
          <li class="board-row is-you ${tierClass(yours)}" style="--i:0">
            <span class="board-place">${place}</span>
            <span class="board-kit" style="--kit:${kitColour(0)}" aria-hidden="true">?</span>
            <span class="board-who"><b>This innings</b><small>${note}</small></span>
            <span class="board-runs">${yours.runs}<i>${yours.wickets ? '' : '*'}</i></span>
            <span class="board-hits">
              <em>${yours.balls}<small>balls</small></em>
              <em>${yours.blows}<small>blows</small></em>
            </span>
          </li>
        </ol>`;
}

/**
 * The three rows around the player, for the innings-end card. The same peek the
 * other card draws: the row above and the row below are what make a place mean
 * anything.
 */
export function survivePeekMarkup(
  rows: readonly SurviveRow[], place: number, yours: SurviveInnings, kit: number | null = null, name = 'You',
): string {
  const lines: string[] = [];
  const above = rows[place - 2];
  const below = rows[place - 1];
  if (above) lines.push(peekRow(place - 1, above.name, above.avatar, above, false));
  lines.push(peekRow(place, name, kit, yours, true));
  if (below) lines.push(peekRow(place + 1, below.name, below.avatar, below, false));
  if (!above && rows[place]) lines.push(peekRow(place + 2, rows[place].name, rows[place].avatar, rows[place], false));
  return `<ol class="board-list survive-list card-peek">${lines.join('')}</ol>`;
}

function peekRow(place: number, name: string, kit: number | null, figures: SurviveInnings, you: boolean): string {
  const disc = kit === null
    ? `<span class="board-kit is-unclaimed" aria-hidden="true">${initial(name)}</span>`
    : kitMarkup(kit, you ? name : '');
  return `
            <li class="board-row ${tierClass(figures)}${you ? ' is-you' : ''}" style="--i:${place}"${you ? ' aria-current="true"' : ''}>
              <span class="board-place">${place}</span>
              ${disc}
              <span class="board-who"><b>${you ? escape(name) : '<i class="board-blank"></i>'}</b><small>${surviveLine(figures)}</small></span>
              <span class="board-runs">${figures.runs}<i>${figures.wickets ? '' : '*'}</i></span>
              <span class="board-hits"><em>${figures.balls}<small>balls</small></em><em>${figures.blows}<small>blows</small></em></span>
            </li>`;
}

/** The three rows around the row a player already holds, for the standing state. */
export function surviveStandingPeek(rows: readonly SurviveRow[], place: number): string {
  const mine = rows[place - 1];
  return survivePeekMarkup(rows.filter(row => row !== mine), place, mine, mine.avatar, mine.name);
}

/** Where an innings would sit, if it were submitted now. */
export function survivePlaceOf(rows: readonly SurviveRow[], yours: SurviveInnings, atMs: number): number {
  const score = packSurvive(yours, atMs);
  return rows.filter(row => row.score > score).length + 1;
}

/**
 * What the Test card has to say about the board, if anything. The other card's
 * three answers, with one rule dropped: a duck is silent there because nought
 * runs off a slog is nothing, and here it is a man who took a ball on the arm
 * and stayed in. What an innings was worth is the ladder's business, so this
 * asks the ladder and nothing else.
 */
export function surviveOffer(
  reached: boolean, rows: readonly SurviveRow[], yours: SurviveInnings, atMs: number, youId: string | null = null,
): CardOffer {
  if (!reached) return { kind: 'silent' };
  const mine = youId ? rows.findIndex(row => row.playerId === youId) : -1;
  if (mine >= 0 && !surviveImprovesOn(yours, atMs, rows[mine])) {
    return { kind: 'standing', runs: rows[mine].runs, place: mine + 1 };
  }
  if (!surviveQualifies(yours, atMs, rows)) return { kind: 'silent' };
  return { kind: 'claim', place: survivePlaceOf(rows, yours, atMs) };
}

/**
 * The innings just played, as the board ranks it. The five figures and nothing
 * else — and the wicket is capped at one because he is the last man in, so a
 * scorecard reading two would be refused by the store as an innings nobody
 * could have batted. The meter is clamped the same way and for the same reason:
 * it is read off a live object, and a negative reading is a row the store would
 * throw out.
 */
export function asSurvive(
  score: { runs: number; balls: number; wickets: number }, blows: number, health: number,
): SurviveInnings {
  return {
    runs: score.runs,
    balls: Math.min(score.balls, SURVIVE.totalBalls),
    wickets: Math.min(score.wickets, SURVIVE.maxWickets),
    blows: Math.min(blows, Math.min(score.balls, SURVIVE.totalBalls)),
    health: Math.max(0, Math.min(Math.round(health), HEALTH.full)),
  };
}

/** What a standing row still says, for the card's "your best stands" line. */
export function surviveBest(rows: readonly SurviveRow[], place: number): string {
  return lower(surviveLine(rows[place - 1]));
}

function lower(line: string) { return line.charAt(0).toLowerCase() + line.slice(1); }

function initial(name: string) {
  return escape([...name.trim()][0]?.toUpperCase() ?? '');
}

function ordinal(n: number) {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}

export type { Standing };
