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

export interface ResultsRow { place: number; name: string; face: number; runs: number; line: string; you: boolean }
export interface ResultsView {
  /** Every seat, by where they finished: 1 first. */
  rows: ResultsRow[];
  you: { place: number; of: number; face: number; runs: number; line: string };
  /** The banner at the head of the list: who won it and how. */
  winner: { title: string; line: string };
}

/** Knockout Red, the knockout's own colour. */
const RED = '#ee2a2a';

export class KnockoutResults {
  private readonly root: HTMLElement;
  constructor(host: HTMLElement, view: ResultsView, keys: { again(): void; back(): void }) {
    this.root = document.createElement('div');
    this.root.className = 'ko-results';
    this.root.id = 'ko-results';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Results');
    const rows: BoardEntry[] = view.rows.map(row => ({
      place: row.place, name: row.name, avatar: row.face, sub: row.line, score: String(row.runs), you: row.you,
      podiumSub: row.you ? 'you' : 'sub',
    }));
    const markup = boardScreenMarkup({
      mode: 'classic', modes: [], ladder: 'room', ladders: [], rows, state: 'ready',
      banner: { icon: '👑', tone: 'gold', title: view.winner.title, line: view.winner.line },
      dock: { avatar: view.you.face, sentence: `You finished <em>${ordinal(view.you.place).toLowerCase()}</em> of ${view.you.of}`, detail: view.you.line, score: String(view.you.runs) },
      play: { id: 'board-again', label: 'PLAY AGAIN' }, focus: 'top', rules: '',
      look: { cls: 'knockout', colour: RED, art: hero, name: 'Super Knockout', title: 'RESULTS', ladder: 'Practice room' },
    });
    // The board's ids are the board's: these are this screen's own, so the two never answer for each other.
    this.root.innerHTML = markup.replace(/id="board-/g, 'id="ko-res-');
    host.append(this.root);
    this.root.querySelector<HTMLButtonElement>('#ko-res-close')!.onclick = () => { this.close(); keys.back(); };
    this.root.querySelector<HTMLButtonElement>('#ko-res-again')!.onclick = () => { this.close(); keys.again(); };
    const body = this.root.querySelector<HTMLElement>('#ko-res-body')!;
    body.addEventListener('scroll', () => this.fold(), { passive: true });
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
