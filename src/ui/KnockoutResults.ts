/**
 * The room's Results (Figma Battle Royale page, section 52, A4): where the room
 * ends, whether the player won it, was watching it or was waiting on the end
 * screen. It is the leaderboard's own screen (`boardScreenMarkup`), so it
 * scrolls as the boards do: the podium of three folds to chips as the list
 * rises under it, the sheet is the board's sheet in Knockout red, and the
 * player's finish stands in the dock with PLAY AGAIN under it; the dock card
 * steps aside while their own row is on screen. A practice room has no points,
 * so the podium's line says sub; a real room will say the points and put the
 * rematch strip back. Back is the end screen.
 */
import { boardScreenMarkup, type BoardEntry } from './Board';
import { ordinal } from './KnockoutMoment';
import hero from '../assets/knockout/hero.webp';

/** A place of 0 is no place at all (somebody who ran away, at the foot), and runs of null no total to show. */
export interface ResultsRow { place: number; name: string; face: number; runs: number | null; line: string; you: boolean; sub?: boolean; points?: number }
export interface ResultsView {
  /** Every seat, by where they finished: 1 first. */
  rows: ResultsRow[];
  you: { place: number; of: number; face: number; runs: number | null; line: string; sentence?: string };
  /** The banner at the head of the list: who won it and how. */
  winner: { title: string; line: string };
  /** A practice room of subs; a match with friends is false. */
  practice?: boolean;
  /** The key in the dock: PLAY AGAIN, or BACK TO ROOM in a match with friends. */
  again?: string;
  /** The room is still being played: the standings as they are, kept up as balls arrive (LEADERBOARD on the end screen). */
  live?: boolean;
  /** The ladder pill's words, where they are not "With friends" or "Practice room": the room's code. */
  pill?: string;
}

/** Knockout Red, the knockout's own colour. */
const RED = '#ee2a2a';

export class KnockoutResults {
  private readonly root: HTMLElement;
  private shown = '';
  /** Whether it is the standings of a room still being played. */
  live = false;
  constructor(host: HTMLElement, view: ResultsView, private readonly keys: { again(): void; back(): void }) {
    this.root = document.createElement('div');
    this.root.className = 'ko-results';
    this.root.id = 'ko-results';
    this.root.setAttribute('role', 'dialog');
    host.append(this.root);
    this.update(view);
  }
  /** Drawn, or drawn again where it stands as the room moves on under it: where the list was scrolled to is kept. */
  update(view: ResultsView) {
    const key = JSON.stringify(view);
    if (key === this.shown) return;
    const first = !this.shown;
    this.shown = key;
    this.live = !!view.live;
    this.root.classList.toggle('is-live', this.live);
    this.root.classList.toggle('is-redrawn', !first);
    this.root.setAttribute('aria-label', view.live ? 'Leaderboard' : 'Results');
    const at = this.root.querySelector<HTMLElement>('#ko-res-body')?.scrollTop ?? 0;
    const keys = this.keys;
    const rows: BoardEntry[] = view.rows.map(row => ({
      place: row.place, name: row.name, avatar: row.face, sub: row.line, score: row.runs === null ? '–' : String(row.runs), you: row.you,
      // Gold is a reward: the podium says what a place paid, and who it was where it paid nothing.
      podiumSub: row.points ? `+${row.points} ${row.points === 1 ? 'pt' : 'pts'}` : row.you ? 'you' : row.sub === false ? 'friend' : 'sub', podiumGold: !!row.points,
    }));
    const markup = boardScreenMarkup({
      mode: 'classic', modes: [], ladder: 'room', ladders: [], rows, state: 'ready',
      banner: { icon: view.live ? '🏏' : '👑', tone: 'gold', title: view.winner.title, line: view.winner.line },
      dock: { avatar: view.you.face, sentence: view.you.sentence ?? `You finished <em>${ordinal(view.you.place).toLowerCase()}</em> of ${view.you.of}`, detail: view.you.line, score: view.you.runs === null ? '–' : String(view.you.runs) },
      play: { id: 'board-again', label: view.again ?? 'PLAY AGAIN' }, focus: 'top', rules: '',
      look: { cls: 'knockout', colour: RED, art: hero, name: 'Super Knockout', title: view.live ? 'LEADERBOARD' : 'RESULTS', ladder: view.pill ?? (view.practice === false ? 'With friends' : 'Practice room') },
    });
    // The board's ids are the board's: these are this screen's own, so the two never answer for each other.
    this.root.innerHTML = markup.replace(/id="board-/g, 'id="ko-res-');
    this.root.querySelector<HTMLButtonElement>('#ko-res-close')!.onclick = () => { this.close(); keys.back(); };
    this.root.querySelector<HTMLButtonElement>('#ko-res-again')!.onclick = () => { this.close(); keys.again(); };
    const body = this.root.querySelector<HTMLElement>('#ko-res-body')!;
    body.addEventListener('scroll', () => this.fold(), { passive: true });
    if (at) body.scrollTop = at;
    this.fold();
    requestAnimationFrame(() => this.fold());
  }
  /** As the board folds (`foldBoard` in the HUD): the podium to chips, the art to the page, the dock card aside while the row shows. */
  private fold() {
    const shell = this.root.querySelector<HTMLElement>('.lb-screen'), body = this.root.querySelector<HTMLElement>('#ko-res-body');
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
