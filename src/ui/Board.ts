import { BATTERS } from '../config/marathon';
import { SURVIVE } from '../config/survive';
import type { CareerBoard } from '../game/career';
import type { CareerRow } from '../game/career-api';
import { BOARD_SIZE, packScore, qualifies, unpackScore, type BoardRow, type Innings } from '../game/leaderboard';
import {
  MARATHON_BOARD_SIZE, marathonQualifies, packSolo, packTeam, strikeRate, unpackSolo, unpackTeam,
  type SoloInnings, type SoloRow, type TeamInnings, type TeamRow,
} from '../game/marathon-board';
import {
  SURVIVE_BOARD_SIZE, packSurvive, standingOf, surviveQualifies, unpackSurvive, type SurviveInnings, type SurviveRow,
} from '../game/survive-board';
import type { AnyCareer } from './CareerBoard';
import { cta, icon } from './Kit';
import { escape, kitMarkup } from './Leaderboard';
import artBlast from '../assets/board/art-blast.webp';
import artMarathon from '../assets/entry/poster-marathon.webp';
import artSurvive from '../assets/survive-cover.webp';
import crown from '../assets/board/crown.svg?raw';
import wifiOff from '../assets/board/wifi-off.svg?raw';

/**
 * The leaderboard as UI v1 draws it (the handover's section 06).
 *
 * One screen for every board: a top bar, the mode and ladder pills, the pager,
 * a podium of three under spotlights, the list in a sheet tinted to the mode,
 * and a dock at the foot with the player's own line and the key to play. Every
 * board the game has — the three modes' innings ladders, the Marathon's two,
 * and the careers — is turned into the one description below (`BoardScreen`)
 * and drawn by the one function, so they cannot drift apart.
 *
 * Strings of HTML from figures and nothing else, as the rest of the interface
 * is written, so a board can be checked in a unit test with no browser.
 */

export type BoardMode = 'classic' | 'marathon' | 'survive';

/** Each mode's name, colour, poster and key, in the pager's order. */
export const BOARD_MODES: Record<BoardMode, { name: string; colour: string; art: string; play: string }> = {
  classic: { name: 'The Blast', colour: '#3f88f2', art: artBlast, play: 'PLAY THE BLAST' },
  marathon: { name: 'Test Marathon', colour: '#1f8a55', art: artMarathon, play: 'PLAY TEST MARATHON' },
  survive: { name: 'Test Survival', colour: '#ff5a4e', art: artSurvive, play: 'PLAY TEST SURVIVAL' },
};
export const MODE_ORDER: readonly BoardMode[] = ['classic', 'marathon', 'survive'];

/**
 * One row, whichever board it came from: its place, who, the line under the
 * name, and the one big figure. Survival carries its result as a chip, and a
 * row can carry a tag — NEW, the places climbed, BEST — when it is the
 * player's and the innings just played moved it.
 */
export interface BoardEntry {
  place: number;
  name: string;
  avatar: number | null;
  sub: string;
  score: string;
  /** Survival's result letter. */
  chip?: 'W' | 'D' | 'L' | 'R' | null;
  you?: boolean;
  tag?: { text: string; tone: 'new' | 'up' | 'best' } | null;
  /** An innings with no name to it yet, drawn where it would stand. */
  ghost?: boolean;
  /** The podium's own line, where it says more than the row does. */
  podiumSub?: string;
}

/** The line at the head of the list that says what just happened. */
export interface BoardBanner {
  icon: string;
  tone: 'gold' | 'green' | 'grey';
  title: string;
  line: string;
}

/** The player's own card in the dock. */
export interface BoardDock {
  avatar: number | null;
  /** Markup: the place is coloured. */
  sentence: string;
  detail: string;
  score: string;
  /** No name yet: the card is green and dashed, and asks for one. */
  ghost?: boolean;
  /** A link inside the detail: bring a record back. */
  restore?: boolean;
}

export interface BoardScreen {
  mode: BoardMode;
  /** The modes this build plays, each with what the menu says about the player on it. */
  modes: readonly { mode: BoardMode; rank: string }[];
  ladder: string;
  ladders: readonly { key: string; name: string; blurb: string }[];
  rows: readonly BoardEntry[];
  state: 'ready' | 'loading' | 'offline';
  banner: BoardBanner | null;
  dock: BoardDock | null;
  /** The key at the foot; none mid-innings, where the board is a look and nothing more. */
  play: { id: 'board-again' | 'board-play'; label: string } | null;
  /** Opened on the player's row rather than at the podium. */
  focus: 'top' | 'you';
  /** How the ladder ranks, for the (i) key. */
  rules: string;
  /** Laid over the dock: the key toast, when a key has just been minted. */
  extra?: string;
}

/** The ladder picker's short lines, per mode and key. */
const BLURBS: Record<BoardMode, Record<string, string>> = {
  classic: {
    best: 'Best single innings', runs: 'All innings added up', boundaries: 'Most sixes and fours', individual: 'Best innings by a batter',
  },
  survive: {
    best: 'Best result: wins, then draws', balls: 'Every ball faced, added up', blows: 'Most blows taken and still standing',
    runs: 'All innings added up', boundaries: 'Most sixes and fours',
  },
  marathon: { team: 'Best team total', solo: 'Best innings by one of the three', runs: 'All innings added up' },
};

export function blurbOf(mode: BoardMode, key: string, fallback = ''): string {
  return BLURBS[mode][key] ?? fallback;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const grouped = (n: number) => n.toLocaleString('en-US');

// ── The screen ───────────────────────────────────────────────────────────────

export function boardScreenMarkup(s: BoardScreen): string {
  const meta = BOARD_MODES[s.mode];
  const ladder = s.ladders.find(one => one.key === s.ladder) ?? s.ladders[0];
  const empty = s.state === 'ready' && s.rows.length === 0;
  const offline = s.state === 'offline' && s.rows.length === 0;
  const loading = s.state === 'loading' && s.rows.length === 0;
  const top = s.rows.slice(0, 3);
  const rest = s.rows.slice(3);
  return `
    <div class="lb-screen is-${s.mode}${offline ? ' is-offline' : ''}" style="--mode:${meta.colour}" role="document">
      <div class="lb-bg" aria-hidden="true"><img src="${meta.art}" alt="" decoding="async"><i class="lb-fade"></i><i class="lb-glow"></i><i class="lb-grain"></i></div>
      <header class="lb-head">
        <div class="lb-bar">
          <button id="board-close" type="button" class="k-icon-button" aria-label="Back">${icon('arrow-left')}</button>
          <h2 id="board-title" class="lb-title">LEADERBOARD</h2>
          <button id="board-info" type="button" class="k-icon-button" aria-label="How ranking works" aria-haspopup="dialog">${icon('info')}</button>
          <button id="board-sound" type="button" class="k-icon-button" aria-label="Sound">${icon('volume')}</button>
        </div>
        <div class="lb-filters">
          <button id="board-mode" type="button" class="k-pill lb-pill is-mode" style="--dot:${meta.colour}" aria-haspopup="listbox" aria-expanded="false">
            <span class="k-pill-dot" aria-hidden="true"></span><span class="k-pill-label">${escape(meta.name)}</span>${icon('chevron-down')}</button>
          <button id="board-ladder" type="button" class="k-pill lb-pill is-ladder" aria-haspopup="dialog" aria-expanded="false">
            <span class="k-pill-label">${escape(ladder?.name ?? '')}</span>${icon('chevron-down')}</button>
        </div>
        ${s.modes.length > 1 && !offline ? `<div class="lb-pager" aria-hidden="true">${s.modes.map(one =>
          `<i class="${one.mode === s.mode ? 'is-on' : ''}"></i>`).join('')}</div>` : ''}
      </header>
      <div class="lb-body" id="board-body">
        ${offline ? '' : `
        <div class="lb-podium${loading ? ' is-loading' : ''}">${podiumMarkup(top, s.mode, loading)}</div>
        <div class="lb-chips" aria-hidden="true">${top.map(row => chipMarkup(row)).join('')}</div>`}
        <section class="lb-sheet${offline ? ' is-offline' : ''}" aria-label="${escape(`${meta.name}, ${ladder?.name ?? ''}`)}">
          ${offline ? offlineMarkup() : loading ? skeletonRows() : empty || s.rows.length < 3 ? fewMarkup(s.rows.length) : ''}
          ${s.banner && !offline && !loading ? bannerMarkup(s.banner) : ''}
          ${rest.length ? `<ol class="lb-list">${rest.map(row => rowMarkup(row)).join('')}</ol>` : ''}
        </section>
      </div>
      <div class="lb-dock">
        ${s.extra ?? ''}
        ${s.dock ? dockMarkup(s.dock) : ''}
        ${s.play ? cta({ kind: 'primary', label: s.play.label, id: s.play.id, wide: true }) : ''}
      </div>
    </div>`;
}

/** The three steps, drawn 2–1–3, with an open spot wherever nobody stands yet. */
function podiumMarkup(top: readonly BoardEntry[], mode: BoardMode, loading: boolean): string {
  const slots = [1, 0, 2].map(i => {
    const place = i + 1;
    const row = top[i];
    const cls = `lb-step is-${place}`;
    const beam = `<i class="lb-beam" aria-hidden="true"></i>`;
    const numeral = `<b class="lb-numeral" aria-hidden="true">${place}</b>`;
    if (loading) return `<div class="${cls} is-skeleton">${beam}<span class="lb-face"></span><i class="lb-bone is-name"></i><i class="lb-bone is-score"></i></div>`;
    if (!row) {
      return `<div class="${cls} is-open">${beam}<span class="lb-face is-open" aria-hidden="true">?</span><span class="lb-name">Open spot</span><span class="lb-score">&mdash;</span>${numeral}</div>`;
    }
    if (row.ghost) {
      return `<div class="${cls} is-ghost" aria-current="true">${beam}<span class="lb-face is-open" aria-hidden="true"></span>
            <span class="lb-name">Your innings</span><span class="lb-score">${escape(row.score)}</span><span class="lb-sub">No name yet</span>${numeral}</div>`;
    }
    const crownMark = place === 1 ? `<span class="lb-crown" aria-hidden="true">${crown}</span>` : '';
    const badge = row.chip ? `<i class="lb-badge is-${row.chip}" aria-hidden="true">${row.chip}</i>` : '';
    const you = row.you ? '<i class="lb-you" aria-hidden="true">YOU</i>' : '';
    return `<div class="${cls}${row.you ? ' is-you' : ''}"${row.you ? ' aria-current="true"' : ''}>${beam}${crownMark}
            <span class="lb-face">${row.avatar === null ? '' : kitMarkup(row.avatar, row.name)}${badge}${you}</span>
            <span class="lb-name">${escape(row.you ? 'You' : row.name)}</span>
            <span class="lb-score">${escape(row.score)}</span>
            <span class="lb-sub">${escape(row.podiumSub ?? row.sub)}</span>${numeral}</div>`;
  });
  void mode;
  return slots.join('');
}

/** The podium, folded to three chips once the list is scrolled under it. */
function chipMarkup(row: BoardEntry): string {
  return `<span class="lb-chip is-${row.place}"><span class="lb-chip-face">${row.avatar === null ? '' : kitMarkup(row.avatar, row.name)}</span>
            <span class="lb-chip-text"><small>${row.place}&nbsp;&nbsp;${escape(row.you ? 'You' : row.name)}</small><b>${escape(row.score)}</b></span></span>`;
}

export function rowMarkup(row: BoardEntry): string {
  const classes = ['lb-row', row.you ? 'is-you' : '', row.ghost ? 'is-ghost' : ''].filter(Boolean).join(' ');
  const face = row.ghost || row.avatar === null ? '<span class="board-kit is-empty" aria-hidden="true"></span>' : kitMarkup(row.avatar, row.name);
  const tag = row.tag ? `<i class="lb-tag is-${row.tag.tone}">${escape(row.tag.text)}</i>` : '';
  const name = row.ghost ? 'Your innings' : row.you ? 'You' : row.name;
  return `
          <li class="${classes}"${row.you || row.ghost ? ' aria-current="true"' : ''}>
            <span class="lb-place">${row.place}</span>
            ${row.chip ? `<i class="lb-result is-${row.chip}" aria-label="${RESULT_WORD[row.chip]}">${row.chip}</i>` : ''}
            ${face}
            <span class="lb-who"><span class="lb-who-name"><b>${escape(name)}</b>${tag}</span><small>${escape(row.sub)}</small></span>
            <span class="lb-figure">${escape(row.score)}</span>
          </li>`;
}

const RESULT_WORD = { W: 'Won', D: 'Drew', L: 'Bowled out', R: 'Retired hurt' } as const;

export function bannerMarkup(b: BoardBanner): string {
  return `<div class="lb-banner" role="status"><span class="lb-banner-icon is-${b.tone}" aria-hidden="true">${escape(b.icon)}</span>
            <span class="lb-banner-text"><b>${escape(b.title)}</b><small>${escape(b.line)}</small></span></div>`;
}

function dockMarkup(d: BoardDock): string {
  const face = d.avatar === null ? '<span class="board-kit is-empty" aria-hidden="true"></span>' : kitMarkup(d.avatar, '');
  const restore = d.restore ? ' <button id="board-restore-go" type="button" class="lb-link">Played before? Restore your record.</button>' : '';
  return `<div id="board-you" class="lb-you-card${d.ghost ? ' is-ghost' : ''}">
          ${face}
          <span class="lb-you-text"><b>${d.sentence}</b><small>${escape(d.detail)}${restore}</small></span>
          ${d.ghost ? '<button id="board-claim" type="button" class="lb-add">Add name</button>' : d.score ? `<span class="lb-figure">${escape(d.score)}</span>` : ''}
        </div>`;
}

function skeletonRows(): string {
  return `<ol class="lb-list is-skeleton" aria-label="Fetching the board" aria-busy="true">${Array.from({ length: 7 }, () =>
    '<li class="lb-row"><i class="lb-bone is-place"></i><i class="lb-bone is-face"></i><span class="lb-who"><i class="lb-bone is-name"></i><i class="lb-bone is-sub"></i></span><i class="lb-bone is-figure"></i></li>').join('')}</ol>`;
}

/** Nobody yet, or only one or two: what the empty steps are waiting for. */
function fewMarkup(count: number): string {
  if (count === 0) {
    return `<div class="lb-message"><span class="lb-message-icon" aria-hidden="true">${icon('trophy')}</span>
          <h3>THE BOARD IS WIDE OPEN</h3><p>Nobody has played this ladder yet. Finish one innings and the top spot is yours.</p></div>`;
  }
  const next = count === 1 ? 2 : 3;
  return `<div class="lb-message is-few"><h3>#${next} IS UP FOR GRABS</h3><p>Only ${count === 1 ? 'one innings' : 'two innings'} on the board. Any finished innings takes ${next === 2 ? 'second' : 'third'}.</p></div>`;
}

function offlineMarkup(): string {
  return `<div class="lb-message is-offline"><span class="lb-message-icon is-offline" aria-hidden="true">${wifiOff}</span>
          <h3>CAN&rsquo;T REACH THE BOARD</h3><p>Check your connection. Your innings still count and will appear once you&rsquo;re back online.</p>
          ${cta({ kind: 'secondary', label: 'TRY AGAIN', id: 'board-retry' })}</div>`;
}

/** The mode menu, opened from the mode pill. */
export function modeMenuMarkup(current: BoardMode, modes: BoardScreen['modes']): string {
  return `<div class="lb-scrim" data-close></div>
    <div id="board-mode-menu" class="lb-menu" role="listbox" aria-label="Which board">${modes.map(one => {
      const meta = BOARD_MODES[one.mode];
      const on = one.mode === current;
      return `<button type="button" class="lb-menu-item${on ? ' is-on' : ''}" role="option" aria-selected="${on}" data-mode="${one.mode}" style="--tone:${meta.colour}">
          <span class="lb-menu-art"><img src="${meta.art}" alt="" decoding="async"></span>
          <span class="lb-menu-text"><b>${escape(meta.name)}</b><small>${escape(one.rank)}</small></span>${on ? icon('check') : ''}</button>`;
    }).join('')}
      ${modes.length > 1 ? '<p class="lb-menu-tip">Tip: swipe the board left or right to switch modes</p>' : ''}
    </div>`;
}

/** The ladder picker, a sheet from the foot. */
export function ladderSheetMarkup(mode: BoardMode, current: string, ladders: BoardScreen['ladders']): string {
  return `<div class="lb-scrim" data-close></div>
    <div id="board-ladder-sheet" class="lb-pick" role="dialog" aria-label="Rank ${escape(BOARD_MODES[mode].name)} by">
      <i class="lb-grab" aria-hidden="true"></i>
      <h3 class="lb-pick-title">RANK ${escape(BOARD_MODES[mode].name.toUpperCase())} BY</h3>${ladders.map(one => {
        const on = one.key === current;
        return `<button id="board-ladder-${escape(one.key)}" type="button" class="lb-pick-item${on ? ' is-on' : ''}" aria-pressed="${on}" data-ladder="${escape(one.key)}">
          <span class="lb-pick-text"><b>${escape(one.name)}</b><small>${escape(one.blurb)}</small></span>${on ? icon('check') : ''}</button>`;
      }).join('')}
    </div>`;
}

/** How ranking works, from the (i) key. */
export function rulesSheetMarkup(rules: string): string {
  return `<div class="lb-scrim" data-close></div>
    <div id="board-rules" class="lb-pick" role="dialog" aria-label="How ranking works" tabindex="-1">
      <i class="lb-grab" aria-hidden="true"></i>
      <h3 class="lb-pick-title">HOW RANKING WORKS</h3>
      <p class="lb-rules">${escape(rules)}</p>
      <p class="lb-rules">Only your best innings is on a board; an innings that does not beat it leaves your place where it was.</p>
      <button id="board-new" type="button" class="lb-link lb-rules-new">What&rsquo;s new in the game</button>
    </div>`;
}

// ── Each board, as the screen's rows ─────────────────────────────────────────

/** What the game knows about the player and the innings just played, for the dock and banner. */
export interface BoardContext {
  /** A player with a name; nobody else is on a board. */
  you: { name: string; avatar: number } | null;
  /** The kit of a player who has not claimed a name. */
  kit: number | null;
  /** Where the store has this player on this mode's whole board, when it is beyond the rows shown. */
  rank: number | null;
  /** The innings just played on this board, as the store answered its post. */
  posted: {
    rank: number; total: number; was: { rank: number; score: number } | null; improved: boolean; first: boolean;
  } | null;
  /** Whether this browser has played this mode at all. */
  played: boolean;
  /** Offer to bring a record back, to a player with no name. */
  restore: boolean;
  /** The mode's name, for "Finish one Test Marathon innings". */
  modeName: string;
}

export const NO_CONTEXT: BoardContext = { you: null, kit: null, rank: null, posted: null, played: false, restore: false, modeName: '' };

/** What an adapter hands back: the rows and the parts of the screen that depend on them. */
export interface BoardBody {
  rows: BoardEntry[];
  banner: BoardBanner | null;
  dock: BoardDock | null;
  focus: 'top' | 'you';
  rules: string;
}

/** The Blast's Top score board. */
export function blastBody(
  rows: readonly BoardRow[], youId: string | null, yours: Innings | null, ctx: BoardContext, atMs = Date.now(),
): BoardBody {
  const sixes = (n: number) => plural(n, 'six', 'sixes');
  const entries: BoardEntry[] = rows.map((row, i) => ({
    place: i + 1, name: row.name, avatar: row.avatar, sub: sixes(row.sixes), score: String(row.runs), you: row.playerId === youId,
  }));
  const mine = entries.findIndex(row => row.you);
  const edge = rows.length >= BOARD_SIZE ? rows[BOARD_SIZE - 1] : null;
  const wasRuns = ctx.posted?.was ? unpackScore(ctx.posted.was.score).runs : null;
  const need = edge && yours ? Math.max(1, edge.runs - yours.runs + 1) : null;
  return finish(entries, mine, {
    unit: 'runs', yours: yours ? { runs: yours.runs, label: `${yours.runs}`, sub: sixes(yours.sixes) } : null,
    wasLabel: wasRuns === null ? null : String(wasRuns),
    needLine: need ? `${plural(need, 'more run')} would have made it.` : 'A bigger innings gets you on.', need,
    guestPlace: yours && mine < 0 && qualifies(yours, atMs, rows) ? rows.filter(row => row.score > packScore(yours, atMs)).length + 1 : null,
    gap: i => (i > 0 ? `${Number(entries[i - 1].score) - Number(entries[i].score)} behind #${i}` : null),
    lead: () => (entries.length > 1 ? `${Number(entries[0].score) - Number(entries[1].score)} runs clear of ${entries[1].name}.` : 'Nobody else has a score yet.'),
    size: BOARD_SIZE,
    rules: 'Each player’s best innings counts. Ties are broken by sixes, then fours, then wickets lost, then dot balls; if everything is level, whoever got there first stays ahead.',
  }, ctx);
}

/** Test Survival's board. */
export function surviveBody(
  rows: readonly SurviveRow[], youId: string | null, yours: SurviveInnings | null, ctx: BoardContext, atMs = Date.now(),
): BoardBody {
  const entries: BoardEntry[] = rows.map((row, i) => ({
    place: i + 1, name: row.name, avatar: row.avatar, chip: resultOf(row), sub: surviveSub(row),
    score: `${row.runs}${row.wickets ? '' : '*'}`, you: row.playerId === youId,
  }));
  const mine = entries.findIndex(row => row.you);
  const wasRuns = ctx.posted?.was ? unpackSurvive(ctx.posted.was.score).runs : null;
  return finish(entries, mine, {
    unit: 'runs',
    yours: yours ? { runs: yours.runs, label: `${yours.runs}${yours.wickets ? '' : '*'}`, sub: surviveSub(yours) } : null,
    wasLabel: wasRuns === null ? null : String(wasRuns),
    needLine: 'Survive longer, or win, to get on.',
    guestPlace: yours && mine < 0 && surviveQualifies(yours, atMs, rows) ? rows.filter(row => row.score > packSurvive(yours, atMs)).length + 1 : null,
    gap: () => null,
    lead: () => (entries.length > 1 ? `Ahead of ${entries[1].name}. Play to stretch the lead.` : 'Nobody else has a result yet.'),
    size: SURVIVE_BOARD_SIZE,
    rules: 'Wins rank by fewest balls, draws by most runs, losses by longest survival. Ties go to runs, then less battering, then the earlier finish.',
  }, ctx);
}

function resultOf(innings: SurviveInnings): 'W' | 'D' | 'L' | 'R' {
  const standing = standingOf(innings);
  return standing === 'WON' ? 'W' : standing === 'DRAWN' ? 'D' : innings.wickets > 0 ? 'L' : 'R';
}

function surviveSub(innings: SurviveInnings): string {
  const standing = standingOf(innings);
  if (standing === 'WON') return `Won · ${plural(innings.balls, 'ball')}`;
  if (standing === 'DRAWN') return innings.balls >= SURVIVE.totalBalls ? `Drew · survived all ${SURVIVE.totalBalls}` : `Drew · ${plural(innings.balls, 'ball')}`;
  return `${innings.wickets ? 'Bowled out' : 'Retired hurt'} · ${plural(innings.balls, 'ball')}`;
}

const ENDED: Record<string, string> = { ALL_OUT: 'All out', RETIRED: 'Retired hurt', BALLS: 'Batted out', DECLARED: 'Declared' };

/** The Test Marathon's Team or Batters ladder. */
export function marathonBody(
  ladder: 'team' | 'solo', team: readonly TeamRow[], solo: readonly SoloRow[], youId: string | null,
  yours: { team: TeamInnings; solo: SoloInnings } | null, ctx: BoardContext, atMs = Date.now(),
): BoardBody {
  const titled = (order: number) => {
    const title = BATTERS[order - 1]?.title ?? `Batter ${order}`;
    return title.charAt(0) + title.slice(1).toLowerCase();
  };
  const sr = (runs: number, balls: number) => `SR ${strikeRate(runs, balls).toFixed(1)}`;
  if (ladder === 'team') {
    const entries: BoardEntry[] = team.map((row, i) => ({
      place: i + 1, name: row.name, avatar: row.avatar, sub: `${ENDED[row.ending] ?? 'All out'} · ${plural(row.balls, 'ball')}`,
      podiumSub: sr(row.runs, row.balls), score: String(row.runs), you: row.playerId === youId,
    }));
    const mine = entries.findIndex(row => row.you);
    const edge = team.length >= MARATHON_BOARD_SIZE ? team[MARATHON_BOARD_SIZE - 1] : null;
    const wasRuns = ctx.posted?.was ? unpackTeam(ctx.posted.was.score).runs : null;
    const need = edge && yours ? Math.max(1, edge.runs - yours.team.runs + 1) : null;
    const mineScore = yours ? packTeam(yours.team, atMs) : null;
    return finish(entries, mine, {
      unit: 'runs',
      yours: yours ? { runs: yours.team.runs, label: String(yours.team.runs), sub: `${ENDED[yours.team.ending] ?? 'All out'} · ${plural(yours.team.balls, 'ball')}` } : null,
      wasLabel: wasRuns === null ? null : String(wasRuns),
      needLine: need ? `${plural(need, 'more run')} would have made it.` : 'A bigger total gets you on.', need,
      guestPlace: mineScore !== null && mine < 0 && marathonQualifies(mineScore, team) ? team.filter(row => row.score > mineScore).length + 1 : null,
      gap: i => (i > 0 ? `${Number(entries[i - 1].score) - Number(entries[i].score)} behind #${i}` : null),
      lead: () => (entries.length > 1 ? `${Number(entries[0].score) - Number(entries[1].score)} runs clear of ${entries[1].name}.` : 'Nobody else has a total yet.'),
      size: MARATHON_BOARD_SIZE,
      rules: 'Ranked on total runs, then strike rate, then boundaries, then whoever got there first.',
    }, ctx);
  }
  const entries: BoardEntry[] = solo.map((row, i) => ({
    place: i + 1, name: row.name, avatar: row.avatar, sub: `${titled(row.order)} · ${plural(row.balls, 'ball')}`,
    podiumSub: `${titled(row.order)} · ${sr(row.runs, row.balls)}`, score: `${row.runs}${row.out ? '' : '*'}`, you: row.playerId === youId,
  }));
  const mine = entries.findIndex(row => row.you);
  const wasRuns = ctx.posted?.was ? unpackSolo(ctx.posted.was.score).runs : null;
  const mineScore = yours ? packSolo(yours.solo, atMs) : null;
  return finish(entries, mine, {
    unit: 'runs',
    yours: yours ? { runs: yours.solo.runs, label: `${yours.solo.runs}${yours.solo.out ? '' : '*'}`, sub: `${titled(yours.solo.order)} · ${plural(yours.solo.balls, 'ball')}` } : null,
    wasLabel: wasRuns === null ? null : String(wasRuns),
    needLine: 'A bigger innings by one of the three gets you on.',
    guestPlace: mineScore !== null && mine < 0 && marathonQualifies(mineScore, solo) ? solo.filter(row => row.score > mineScore).length + 1 : null,
    gap: () => null,
    lead: () => (entries.length > 1 ? `Ahead of ${entries[1].name}. Play to stretch the lead.` : 'Nobody else has an innings yet.'),
    size: MARATHON_BOARD_SIZE,
    rules: 'The best of the three batters. Ranked on runs, then not out above out, then fewer balls, then whoever got there first.',
  }, ctx);
}

/** A career ladder: one big figure, and the rest under the name. */
export function careerBody(
  board: CareerBoard<AnyCareer>, rows: readonly CareerRow<AnyCareer>[], youId: string | null, ctx: BoardContext, size = 50,
): BoardBody {
  const [lead, ...rest] = board.figures;
  const entries: BoardEntry[] = rows.map((row, i) => ({
    place: i + 1, name: row.name, avatar: row.avatar, score: grouped(lead.of(row.career)),
    sub: rest.map(one => `${grouped(one.of(row.career))} ${one.label}`).join(' · '), you: row.playerId === youId,
  }));
  const mine = entries.findIndex(row => row.you);
  return finish(entries, mine, {
    unit: lead.label, yours: null, wasLabel: null, needLine: '', guestPlace: null,
    gap: i => (i > 0 ? `${grouped(lead.of(rows[i - 1].career) - lead.of(rows[i].career))} behind #${i}` : null),
    lead: () => (entries.length > 1 ? `Ahead of ${entries[1].name}. Play to stretch the lead.` : 'Nobody else is on this one yet.'),
    size,
    rules: `The top ${size}, added up over every innings you have played. ${board.blurb}`,
  }, { ...ctx, posted: null });
}

interface Shape {
  /** What the big figure counts, for the dock's line. */
  unit: string;
  yours: { runs: number; label: string; sub: string } | null;
  wasLabel: string | null;
  needLine: string;
  /** Runs short of the fiftieth row, where that is a number worth saying. */
  need?: number | null;
  /** Where an innings with no name to it would stand, if it qualifies. */
  guestPlace: number | null;
  gap: (index: number) => string | null;
  lead: () => string;
  size: number;
  rules: string;
}

/**
 * The parts every board shares: the player's row named "You" and tagged, the
 * banner for the innings just played, and the dock. One function, so the three
 * modes and the careers say the same things the same way.
 */
function finish(entries: BoardEntry[], mine: number, shape: Shape, ctx: BoardContext): BoardBody {
  const posted = ctx.posted;
  let banner: BoardBanner | null = null;
  let dock: BoardDock | null = null;
  let focus: 'top' | 'you' = 'top';
  const row = mine >= 0 ? entries[mine] : null;
  const kit = ctx.you?.avatar ?? ctx.kit;

  if (posted && shape.yours) {
    const rank = posted.rank;
    const outside = mine < 0 && rank > entries.length;
    const up = posted.was ? posted.was.rank - rank : 0;
    if (outside) {
      banner = posted.improved
        ? { icon: String(shape.size), tone: 'grey', title: `Your ${shape.yours.runs} is outside the top ${shape.size}`, line: shape.needLine }
        : { icon: String(shape.size), tone: 'grey', title: `${shape.yours.runs} this innings. Your best is #${rank}`, line: 'The board keeps your best innings, not your latest.' };
    } else if (posted.improved && rank === 1) {
      banner = { icon: '1', tone: 'gold', title: 'New best. Top of the board', line: shape.lead() };
    } else if (posted.improved && !posted.was) {
      banner = { icon: '↓', tone: 'green', title: `You entered the board at #${rank}`, line: rank > 3 ? 'Opened on your row. Pull down for the top 3.' : 'Straight onto the podium.' };
      if (row) { row.tag = { text: 'NEW', tone: 'new' }; if (posted.first) row.sub = `Your first innings · ${row.sub}`; }
    } else if (posted.improved && up > 0) {
      banner = {
        icon: '▲', tone: 'gold', title: `New best. Up ${up} ${up === 1 ? 'place' : 'places'} to #${rank}`,
        line: shape.wasLabel ? `${shape.yours.runs} ${shape.unit} beat your ${shape.wasLabel}.` : 'Your new best is on the board.',
      };
      if (row) { row.tag = { text: `▲ ${up}`, tone: 'up' }; if (shape.wasLabel) row.sub = `New best · was ${shape.wasLabel}`; }
    } else if (posted.improved) {
      banner = { icon: '▲', tone: 'gold', title: `New best. Still #${rank}`, line: shape.wasLabel ? `${shape.yours.runs} ${shape.unit} beat your ${shape.wasLabel}.` : 'Your new best is on the board.' };
      if (row && shape.wasLabel) row.sub = `New best · was ${shape.wasLabel}`;
    } else {
      banner = { icon: '=', tone: 'grey', title: `${shape.yours.runs} this innings. Your best still holds #${rank}`, line: 'The board keeps your best innings, not your latest.' };
      if (row) { row.tag = { text: 'BEST', tone: 'best' }; row.sub = `Your best · ${row.sub}`; }
    }
    if (row && row.place > 3) focus = 'you';
    if (outside) {
      dock = {
        avatar: kit, sentence: `You are <em>#${rank}</em> on the leaderboard`,
        detail: `${shape.yours.label} ${shape.unit} · ${shape.need ? `${shape.need} off the top ${shape.size}` : `outside the top ${shape.size}`}`, score: shape.yours.label,
      };
    }
  } else if (row && row.place === 1 && ctx.you) {
    banner = { icon: '1', tone: 'gold', title: 'Top of the board', line: shape.lead() };
  }

  if (!dock && row) {
    const gap = shape.gap(mine);
    dock = { avatar: kit, sentence: `You are <em>#${row.place}</em> on the leaderboard`, detail: gap ? `${row.score} ${shape.unit} · ${gap}` : row.sub, score: row.score };
  } else if (!dock && !ctx.you && shape.yours) {
    // No name: the innings is drawn where it would stand, and the dock asks for a name.
    if (shape.guestPlace !== null) {
      const at = shape.guestPlace;
      entries.splice(at - 1, 0, { place: at, name: 'Your innings', avatar: null, sub: 'No name yet', score: shape.yours.label, ghost: true });
      for (let i = at; i < entries.length; i++) entries[i].place = i + 1;
      dock = { avatar: null, sentence: `Your ${shape.yours.label} would be <em>#${at}</em>`, detail: 'Add a name to take the place.', score: '', ghost: true, restore: ctx.restore };
      if (at > 3) focus = 'you';
    } else {
      dock = { avatar: kit, sentence: `Your ${shape.yours.label} is outside the top ${shape.size}`, detail: 'Add a name to keep a record of every innings.', score: '', ghost: true, restore: ctx.restore };
    }
  } else if (!dock && ctx.you && ctx.rank) {
    dock = { avatar: kit, sentence: `You are <em>#${ctx.rank}</em> on the leaderboard`, detail: `Outside the top ${shape.size}`, score: '' };
  } else if (!dock) {
    dock = ctx.played || !ctx.you
      ? { avatar: kit, sentence: 'You’re not on the board yet', detail: ctx.you ? 'Your best innings goes up here.' : 'Play one innings to see where you stand', score: '', restore: !ctx.you && ctx.restore }
      : { avatar: kit, sentence: 'You’re not on this board yet', detail: ctx.modeName ? `Finish one ${ctx.modeName} innings to get a place` : 'Finish one innings to get a place', score: '' };
  }
  return { rows: entries, banner, dock, focus, rules: shape.rules };
}

/** "You are #12" for the mode menu, from what the game knows. */
export function menuRank(rank: number | null | undefined, named: boolean): string {
  if (!named) return 'No name yet';
  return rank ? `You are #${rank}` : 'Not on this board yet';
}
