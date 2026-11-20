/**
 * Super Knockout's leaderboard (Figma Battle Royale page, K13 and section 42's
 * L1 to L3): the game's own leaderboard screen (`boardScreenMarkup`) in
 * Knockout red, as the room's Results are, over the ladders the store keeps
 * (`server/knockout-ledger.ts`): Points and Wins, this week and all time, the
 * highest total, and the win rate from ten matches. The ladder pill opens the
 * picker; the dock says where the player stands and what the place above is
 * ahead by, or how the first points come.
 *
 * What it says is `knockoutBoardView`, a function of the store's two answers
 * and nothing else, so it is held in a unit test with no browser.
 */
import { ownsHandle } from '../game/handle';
import type { KnockoutBoards, KnockoutRow, KnockoutStanding } from '../server/knockout-ledger';
import { boardScreenMarkup, type BoardDock, type BoardEntry } from './Board';
import { icon } from './Kit';
import { LIVE_RULES, ordinal } from '../game/knockout-points';
import hero from '../assets/knockout/hero.webp';

/** Knockout Red, the knockout's own colour. */
const RED = '#ee2a2a';

/** A ladder as the picker offers it: which list, and over what stretch of time. */
export type KnockoutPick = 'points-week' | 'points-all' | 'wins-week' | 'wins-all' | 'best' | 'rate';
export const KNOCKOUT_PICKS: readonly { key: KnockoutPick; name: string; blurb: string }[] = [
  { key: 'points-week', name: 'Points · This week', blurb: 'Points from matches since Monday' },
  { key: 'points-all', name: 'Points · All time', blurb: 'Every point ever won' },
  { key: 'wins-week', name: 'Wins · This week', blurb: 'Matches won since Monday' },
  { key: 'wins-all', name: 'Wins · All time', blurb: 'Every match won' },
  { key: 'best', name: 'Highest total', blurb: 'The most runs in one match' },
  { key: 'rate', name: 'Win rate', blurb: 'Share of matches won, from 10 matches' },
];

/** What an all but empty ladder says, in the knockout's words: the board's own speak of innings. */
const FEW: Record<KnockoutPick, { none: string; one: string; two: string }> = (() => {
  const of = (what: string, how: string) => ({
    none: `Nobody is on this ladder yet. ${how} and the top spot is yours.`,
    one: `Only one player on it ${what}. ${how} to take second.`,
    two: `Only two players on it ${what}. ${how} to take third.`,
  });
  const points = 'Finish top 3 in a match with friends', win = 'Win a match with friends';
  return {
    'points-week': of('this week', points), 'points-all': of('so far', points), 'wins-week': of('this week', win), 'wins-all': of('so far', win),
    best: of('so far', 'Bat a match with friends to its end'), rate: of('so far', 'Play ten matches with friends'),
  };
})();

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const rate = (row: { wins: number; played: number }) => (row.played ? Math.round(row.wins / row.played * 100) : 0);

function rowsOf(boards: KnockoutBoards, pick: KnockoutPick): KnockoutRow[] {
  const b = boards.boards;
  return pick === 'points-week' ? b.points.week : pick === 'points-all' ? b.points.all : pick === 'wins-week' ? b.wins.week : pick === 'wins-all' ? b.wins.all : pick === 'best' ? b.best : b.rate;
}

/** The big figure and the line under a name, by ladder. */
function figureOf(row: KnockoutRow, pick: KnockoutPick): { score: string; sub: string } {
  const matches = plural(row.played, 'match', 'matches');
  if (pick.startsWith('points')) return { score: String(row.points), sub: `${plural(row.wins, 'win')} · ${matches}` };
  if (pick.startsWith('wins')) return { score: String(row.wins), sub: `${plural(row.points, 'point')} · ${matches}` };
  if (pick === 'best') return { score: String(row.best), sub: `${plural(row.wins, 'win')} · ${matches}` };
  return { score: `${rate(row)}%`, sub: `${plural(row.wins, 'win')} in ${matches}` };
}

export interface KnockoutBoardView {
  rows: BoardEntry[];
  dock: BoardDock | null;
  ladder: string;
}

/**
 * The board as drawn: the picked ladder's rows, and the player's own line.
 * `me` is the player's id, hashed here to find their row and never sent
 * anywhere; `standing` is their own record, or null for a guest or while the
 * store has not answered.
 */
export function knockoutBoardView(boards: KnockoutBoards | null, standing: KnockoutStanding | null, pick: KnockoutPick,
  me: { playerId: string; avatar: number } | null, pointsFrom: number): KnockoutBoardView {
  const ladder = KNOCKOUT_PICKS.find(one => one.key === pick)!.name;
  const list = boards ? rowsOf(boards, pick) : [];
  const rows: BoardEntry[] = list.map((row, i) => {
    const { score, sub } = figureOf(row, pick);
    return { place: i + 1, name: row.name, avatar: row.avatar, sub, score, you: !!me && ownsHandle(row.handle, me.playerId), handle: row.handle, podiumSub: sub.split(' · ')[0] };
  });
  if (!me) return { rows, dock: null, ladder };
  const career = standing?.career ?? null;
  const week = pick.endsWith('week');
  const place = !standing ? null
    : pick === 'points-week' ? standing.places.points.week : pick === 'points-all' ? standing.places.points.all
    : pick === 'wins-week' ? standing.places.wins.week : pick === 'wins-all' ? standing.places.wins.all
    : pick === 'best' ? standing.places.best : standing.places.rate;
  if (!career || !career.played) {
    return { rows, ladder, dock: { avatar: me.avatar, sentence: 'You are <em>not on the board</em> yet',
      detail: `Finish top 3 in a match of ${pointsFrom} or more real players for your first points.`, score: '–' } };
  }
  const mine = { points: week ? career.weekPoints : career.points, wins: week ? career.weekWins : career.wins, played: week ? career.weekPlayed : career.played, best: career.best };
  const score = pick.startsWith('points') ? String(mine.points) : pick.startsWith('wins') ? String(mine.wins) : pick === 'best' ? String(career.best) : `${rate(career)}%`;
  const when = week ? ' this week' : '';
  const figures = `${plural(mine.points, 'pt')} · ${plural(mine.wins, 'win')}`;
  if (place === null) {
    const why = pick === 'rate' && career.played < 10 ? `${plural(10 - career.played, 'more match', 'more matches')} for a win rate`
      : week && !mine.played ? 'No match yet this week' : figures;
    return { rows, ladder, dock: { avatar: me.avatar, sentence: `You are <em>not ranked</em>${when}`, detail: why, score } };
  }
  // Level on points with the place above (the tie went to them): said as level, not as nothing behind.
  const gap = pick === 'points-week' && place > 1 ? standing?.behind ?? null : null;
  const behind = gap === null ? '' : gap > 0 ? ` · ${gap} behind #${place - 1}` : ` · level with #${place - 1}`;
  return { rows, ladder, dock: { avatar: me.avatar, sentence: `You are <em>#${place}</em>${when}`, detail: `${figures}${behind}`, score } };
}

interface BoardKeys {
  back(): void;
  /** PLAY SUPER KNOCKOUT at the foot; absent where the board is only a look (opened over the Leaderboard). */
  play?(): void;
  /** A named row, a step or a chip tapped: that player's profile, risen over this board from the face tapped. */
  open(row: { handle: string; name: string; avatar: number | null }, from: HTMLElement): void;
  /** The player's own row: My profile. */
  mine(): void;
}

export class KnockoutBoard {
  private readonly root: HTMLElement;
  private pick: KnockoutPick = 'points-week';
  private boards: KnockoutBoards | null = null;
  private standing: KnockoutStanding | null = null;
  private state: 'loading' | 'ready' | 'offline' = 'loading';
  /** How many real players a match needs before it pays: the game's own figure until the store says its own. */
  private pointsFrom = LIVE_RULES.pointsFrom;
  constructor(host: HTMLElement, private readonly me: { playerId: string; avatar: number } | null, private readonly keys: BoardKeys) {
    this.root = document.createElement('div');
    this.root.className = 'ko-results ko-board';
    this.root.id = 'ko-board';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Super Knockout leaderboard');
    host.append(this.root);
    this.draw();
  }
  /** The store's answers, as they arrive: the ladders, and the player's own standing. A null board is the store out of reach. */
  fill(boards: KnockoutBoards | null, standing: KnockoutStanding | null) {
    this.boards = boards; this.standing = standing;
    if (boards?.pointsFrom) this.pointsFrom = boards.pointsFrom;
    this.state = boards ? 'ready' : 'offline';
    this.draw();
  }
  get ladder() { return this.pick; }
  private draw() {
    const view = knockoutBoardView(this.boards, this.standing, this.pick, this.me, this.pointsFrom);
    const markup = boardScreenMarkup({
      mode: 'classic', modes: [], ladder: 'room', ladders: [], rows: view.rows, state: this.state, banner: null,
      dock: this.state === 'ready' ? view.dock : null,
      play: this.keys.play ? { id: 'board-play', label: 'PLAY SUPER KNOCKOUT' } : null, focus: 'top', rules: '',
      look: { cls: 'knockout', colour: RED, art: hero, name: 'Super Knockout', title: 'LEADERBOARD', ladder: view.ladder, few: FEW[this.pick] },
    });
    this.root.innerHTML = `${markup.replace(/id="board-/g, 'id="ko-board-')}
      <div class="ko-sheet-scrim hidden" id="ko-board-sheet">
        <div class="ko-sheet ko-picks" role="dialog" aria-modal="true" aria-label="Choose a ladder">
          <i class="ko-sheet-grip" aria-hidden="true"></i>
          <h3 class="ko-picks-head">RANK BY</h3>
          <ul role="listbox">${KNOCKOUT_PICKS.map(one => `
            <li><button type="button" role="option" data-pick="${one.key}" aria-selected="${one.key === this.pick}" class="ko-pick${one.key === this.pick ? ' is-on' : ''}">
              <span><b>${one.name}</b><small>${one.blurb}</small></span>${one.key === this.pick ? icon('check') : ''}</button></li>`).join('')}
          </ul>
        </div>
      </div>`;
    const el = <T extends HTMLElement>(id: string) => this.root.querySelector<T>(`#${id}`)!;
    el<HTMLButtonElement>('ko-board-close').onclick = () => { this.close(); this.keys.back(); };
    const play = this.root.querySelector<HTMLButtonElement>('#ko-board-play');
    if (play) play.onclick = () => { this.close(); this.keys.play?.(); };
    const sheet = el('ko-board-sheet');
    el<HTMLButtonElement>('ko-board-ladder').onclick = () => sheet.classList.remove('hidden');
    sheet.onclick = event => {
      const target = event.target as HTMLElement;
      if (target === sheet) { sheet.classList.add('hidden'); return; }
      const key = target.closest<HTMLElement>('[data-pick]');
      if (!key) return;
      this.pick = key.dataset.pick as KnockoutPick;
      this.draw();
    };
    // The mode's own pill names the mode and opens nothing here: the other boards are the Leaderboard's.
    el('ko-board-mode').setAttribute('aria-disabled', 'true');
    this.root.querySelector<HTMLElement>('.lb-screen')!.addEventListener('click', event => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-handle], [data-mine]');
      if (!row || this.root.querySelector('.lb-pop')) return;
      if (row.dataset.mine) { this.keys.mine(); return; }
      const entry = view.rows.find(one => one.handle === row.dataset.handle);
      if (entry?.handle) this.keys.open({ handle: entry.handle, name: entry.name, avatar: entry.avatar }, row);
    });
    const body = el('ko-board-body');
    body.addEventListener('scroll', () => this.fold(), { passive: true });
    this.fold();
    requestAnimationFrame(() => this.fold());
  }
  /** As the board folds (`foldBoard` in the HUD): the podium to chips, the art to the page, the dock card aside while the row shows. */
  private fold() {
    const shell = this.root.querySelector<HTMLElement>('.lb-screen'), body = this.root.querySelector<HTMLElement>('#ko-board-body');
    if (!shell || !body) return;
    const podium = shell.querySelector<HTMLElement>('.lb-podium');
    shell.classList.toggle('is-folded', !!podium && body.scrollTop > podium.offsetHeight - 56);
    const reach = podium ? Math.max(1, podium.offsetHeight - 56) : 1;
    shell.style.setProperty('--fade', Math.min(1, body.scrollTop / reach).toFixed(3));
    shell.style.setProperty('--head', `${shell.querySelector<HTMLElement>('.lb-head')?.offsetHeight ?? 0}px`);
    const row = shell.querySelector<HTMLElement>('.lb-row.is-you'), dock = shell.querySelector<HTMLElement>('.lb-dock');
    if (!row || !dock) { shell.classList.remove('is-you-seen'); return; }
    const r = row.getBoundingClientRect(), b = body.getBoundingClientRect(), d = dock.getBoundingClientRect();
    shell.classList.toggle('is-you-seen', r.top >= b.top && r.bottom <= Math.min(b.bottom, d.top + 60));
  }
  close() { this.root.remove(); }
}

/** A finish in the last five, as its chip says it: 1st, 9th, or RAN for a match run away from. */
export function finishWord(place: number): string { return place > 0 ? ordinal(place).toLowerCase() : 'ran'; }
