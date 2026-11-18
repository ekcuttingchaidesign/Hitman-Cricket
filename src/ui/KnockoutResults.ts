/**
 * The room's Results (Figma Battle Royale page, section 52, A4; the layout of
 * KO room · 6 and X6): where the room ends, whether the player was watching it
 * or waiting on the end screen. The podium rises first, the rows after it, the
 * player's own row last in the dock with PLAY AGAIN under it. A practice room
 * has no points, so the podium's line says sub (or you); a real room will say
 * the points and put the rematch strip back. Back is the end screen.
 */
import { avatarSrc } from '../config/board';
import CROWN from '../assets/knockout/crown.svg';
import { cta } from './Kit';
import { ordinal } from './KnockoutMoment';

export interface ResultsRow { place: number; name: string; face: number; runs: number; line: string; you: boolean }
export interface ResultsView {
  /** Every seat, by where they finished: 1 first. */
  rows: ResultsRow[];
  you: { place: number; of: number; face: number; runs: number; line: string };
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class KnockoutResults {
  private readonly root: HTMLElement;
  constructor(host: HTMLElement, view: ResultsView, keys: { again(): void; back(): void }) {
    this.root = document.createElement('div');
    this.root.className = 'ko-results';
    this.root.id = 'ko-results';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Results');
    const [first, second, third] = view.rows;
    const step = (row: ResultsRow | undefined, at: 1 | 2 | 3) => row ? `
      <div class="ko-res-step is-${at}${row.you ? ' is-you' : ''}">
        ${at === 1 ? `<img class="ko-res-crown" src="${CROWN}" alt="" aria-hidden="true">` : ''}
        <span class="ko-res-face"><img src="${avatarSrc(row.face)}" alt="" decoding="async"></span>
        <b class="ko-res-name">${esc(row.you ? 'You' : row.name)}</b>
        <span class="ko-res-runs">${row.runs}</span>
        <small>${row.you ? 'you' : 'sub'}</small>
        <i class="ko-res-place" aria-hidden="true">${at}</i>
      </div>` : '<div></div>';
    const rest = view.rows.slice(3).map((row, i) => `
      <li class="ko-res-row${row.you ? ' is-you' : ''}" style="--i:${i}">
        <span class="ko-res-at">${row.place}</span>
        <img src="${avatarSrc(row.face)}" alt="" decoding="async">
        <span class="ko-res-who"><b>${esc(row.you ? 'You' : row.name)}</b><small>${esc(row.line)}</small></span>
        <span class="ko-res-score">${row.runs}</span>
      </li>`).join('');
    this.root.innerHTML = `
      <div class="ko-res-top">
        <button type="button" class="ko-res-back" id="ko-res-back" aria-label="Back to the end screen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
        <h2>RESULTS</h2>
      </div>
      <div class="ko-res-chips"><span><i aria-hidden="true"></i>Super Knockout</span><span>Practice room</span></div>
      <div class="ko-res-podium">${step(second, 2)}${step(first, 1)}${step(third, 3)}</div>
      <ol class="ko-res-list" aria-label="Every place">${rest}</ol>
      <div class="ko-res-dock">
        <div class="ko-res-you">
          <img src="${avatarSrc(view.you.face)}" alt="" decoding="async">
          <span><b>You finished ${ordinal(view.you.place).toLowerCase()} of ${view.you.of}</b><small>${esc(view.you.line)}</small></span>
          <span class="ko-res-score">${view.you.runs}</span>
        </div>
        ${cta({ kind: 'primary', label: 'PLAY AGAIN', id: 'ko-res-again', moving: true })}
      </div>`;
    host.append(this.root);
    this.root.querySelector<HTMLButtonElement>('#ko-res-back')!.onclick = () => { this.close(); keys.back(); };
    this.root.querySelector<HTMLButtonElement>('#ko-res-again')!.onclick = () => { this.close(); keys.again(); };
  }
  close() { this.root.remove(); }
}
