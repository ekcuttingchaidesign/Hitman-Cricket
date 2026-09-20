import { kitColour } from '../config/board';
import { HEALTH, SURVIVE } from '../config/survive';
import {
  SURVIVE_BOARD_SIZE, packSurvive, standingOf, surviveDecidedBy, surviveImprovesOn,
  surviveQualifies, type Standing, type SurviveInnings, type SurviveRow,
} from '../game/survive-board';
import { escape, kitMarkup, sheetKeys, type CardOffer } from './Leaderboard';

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
    // What it took, rather than what it left: the margin is the row's own
    // figure now, so the line would be saying it twice.
    if (innings.balls >= SURVIVE.totalBalls) return 'Won off the last ball';
    return `Won off ${innings.balls} ${innings.balls === 1 ? 'ball' : 'balls'}`;
  }
  if (standing === 'DRAWN') return 'Drew the match';
  return innings.wickets > 0 ? 'Bowled out' : 'Retired hurt';
}

/**
 * The result, as a letter — and the whole of what a row says about how the
 * innings ended.
 *
 * Three contests stacked into one list read as one list unless something marks
 * where each begins, and the tiers are always contiguous, so one column of
 * letters bands the sheet at a glance. There are four letters rather than three
 * because a loss comes two ways: bowled out, or carried off. That difference is
 * the whole of what the injury bar is for, and it used to be carried by a line
 * of prose under every name — a fourth letter says the same thing in a column
 * that was already there, for none of the room.
 *
 * The colour is the sheet's tier palette and never carries it alone: the letter
 * says it, and the word behind the letter says it in full to a screen reader,
 * which is the only voice a row has now that the prose is gone.
 */
export type Outcome = 'W' | 'D' | 'L' | 'R';

export function outcomeOf(innings: SurviveInnings): { letter: Outcome; word: string } {
  const standing = standingOf(innings);
  if (standing === 'WON') return { letter: 'W', word: 'Won' };
  if (standing === 'DRAWN') return { letter: 'D', word: 'Drew the match' };
  return innings.wickets > 0 ? { letter: 'L', word: 'Bowled out' } : { letter: 'R', word: 'Retired hurt' };
}

/** The three columns, named once at the head of the list rather than fifty times. */
export const FIGURES = ['runs', 'balls', 'blows'] as const;

/**
 * The figures, in fixed columns, the same size and the same weight on every row.
 *
 * Nothing here is emphasised, and that is the point. There is no one hero number
 * on this board — a win is judged on balls to spare, a draw on runs and a loss
 * on balls faced — so a row that blew up the figure it was judged on blew up a
 * different one from tier to tier, and the moving emphasis read as the ranking
 * itself. Three quiet columns say it in the same place every time: the letter
 * says which contest, and inside a contest the column that contest is judged on
 * runs down the block in order.
 *
 * The unit rides with every figure for a screen reader and is drawn only once,
 * at the head of the list, for everybody else.
 */
function figuresMarkup(innings: SurviveInnings, battered = false): string {
  const notOut = innings.wickets === 0 ? '<i>*</i>' : '';
  return `<span class="board-hits">
              <em>${innings.runs}${notOut}<b>runs</b></em>
              <em>${innings.balls}<b>balls</b></em>
              <em${battered ? ' class="is-split"' : ''}>${innings.blows}<b>blows</b></em>
            </span>`;
}

/** The letter, and the word it stands for, which is what a screen reader hears. */
function resultMarkup(innings: SurviveInnings): string {
  const { letter, word } = outcomeOf(innings);
  return `<span class="board-result"><i aria-hidden="true">${letter}</i><b>${word}</b></span>`;
}

/**
 * Where the sheet changes contest, and what the new one is judged on.
 *
 * The rule cannot live on the rows — it is the same rule for a whole block, and
 * fifty copies of it was the clutter that started this. It cannot live only in
 * the footer either, which is below the scroll and answers a question the reader
 * is asking here. So it is said once, where the block begins.
 */
const BAND: Record<Standing, string> = {
  WON: 'Wins &middot; fewest balls used',
  DRAWN: 'Draws &middot; most runs',
  LOST: 'Losses &middot; longest innings',
};

function bandMarkup(standing: Standing): string {
  return `<li class="board-band">${BAND[standing]}</li>`;
}

/** The head of the list: the three column names, said once. */
function figuresHead(): string {
  return `<li class="board-head" aria-hidden="true">
            <span class="board-hits">${FIGURES.map(name => `<em>${name}</em>`).join('')}</span>
          </li>`;
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
  const { rows, youId = null, yours = null, state = 'ready', atMs = Date.now() } = view;
  const edge = surviveCutoff(rows);
  const yourPlace = rows.findIndex(row => row.playerId === youId);
  const waiting = yourPlace < 0 && yours ? surviveQualifies(yours, atMs, rows) : false;
  return `
    <div class="board-sheet survive-sheet" role="document">
      <div class="sheet-head">
        <div class="sheet-title">
          <p class="board-eyebrow">TEST SURVIVAL</p>
          <h2 id="board-title">Top ${SURVIVE_BOARD_SIZE}</h2>
        </div>
        ${sheetKeys()}
      </div>
      <p class="board-line"${state === 'loading' ? ' aria-live="polite"' : ''}>${
        state === 'loading' ? 'Fetching the board…'
        : state === 'offline' ? 'The board could not be reached.'
        : surviveStanding(rows, yourPlace, yours, edge)}</p>
      <div class="board-scroll">${state === 'offline' ? surviveOffline(yours) : ''}
        <ol class="board-list survive-list">${figuresHead()}${
          rows.map((row, i) => {
            const above = rows[i - 1] ?? null;
            const band = !above || standingOf(above) !== standingOf(row) ? bandMarkup(standingOf(row)) : '';
            return band + surviveRowMarkup(row, i, row.playerId === youId, above);
          }).join('')}
        </ol>
        ${edge ? `<p class="board-cut">${surviveCutLabel(edge)}</p>` : ''}
        ${yourPlace < 0 && yours
          ? waiting
            ? surviveMine(yours, String(survivePlaceOf(rows, yours, atMs)), survivePlaceOf(rows, yours, atMs) === 1 ? 'takes the top' : 'yours to claim')
            : surviveMine(yours, '&mdash;', 'not good enough yet')
          : ''}
      </div>
      <p class="board-foot">A win beats a draw beats a loss. Wins are ranked on balls used &mdash; a chase is a race &mdash; draws on the runs made while surviving, and losses on how long the last man kept them out. Level innings are split on runs, then on who took the lesser battering, and if that ties too, whoever got there first stays above.</p>
    </div>`;
}

/**
 * Whether this row sits under the one above it because of the battering it took
 * — the one rung of the ladder that is not a figure on the row.
 *
 * With the prose gone there is nowhere to write it, so it is lit rather than
 * said, on the blows: the board's other sheet does exactly this where the figure
 * that settled a tie has a column of its own. Blows are not the meter — a helmet
 * costs more than a pad — but they are the meter's shadow, and a reader who
 * looks at the lit figure is looking at the right thing.
 */
export function splitOnBattering(above: SurviveInnings | null, row: SurviveInnings): boolean {
  return !!above && surviveDecidedBy(above, row) === 'health';
}

/** One row: place, result, kit, name, and the three figures. */
export function surviveRowMarkup(
  row: SurviveRow, index: number, you: boolean, above: SurviveInnings | null = null,
): string {
  const classes = ['board-row', tierClass(row), you ? 'is-you' : ''].filter(Boolean).join(' ');
  return `
          <li class="${classes}" style="--i:${index}"${you ? ' aria-current="true"' : ''}>
            <span class="board-place">${index + 1}</span>
            ${resultMarkup(row)}
            ${kitMarkup(row.avatar, row.name)}
            <span class="board-who"><b>${escape(row.name)}</b></span>
            ${figuresMarkup(row, splitOnBattering(above, row))}
          </li>`;
}

export function surviveActions(): string {
  return `
      <div class="board-actions" role="group" aria-label="What now">
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
              ${resultMarkup(figures)}
              ${disc}
              <span class="board-who"><b>${you ? escape(name) : '<i class="board-blank"></i>'}</b></span>
              ${figuresMarkup(figures)}
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
