/**
 * Watching the room after a knock-out (Figma Battle Royale page, section 51,
 * "Watching the room, as stories"). Two pieces, both drawn here and driven by
 * the game (`spectate` in `src/Game.ts`):
 *
 * - `Rings`, the room as a row of story rings on the end screen: those still
 *   in, best first. A ring whose batter is out greys and says OUT; one the cut
 *   takes greys, shrinks and leaves the row, and the rest close up.
 * - `WatchView`, a player's game full screen as a story: a bar an over, their
 *   face, their figures and place, ✕ back to the end screen; their neighbours'
 *   faces at the edges, a swipe left or right to them, a swipe down back; and a
 *   tray of reactions. Nothing is laid over the pitch or the ball.
 */
import { avatarSrc } from '../config/board';
import { KNOCKOUT } from '../game/knockout';

export interface RingView { id: number; name: string; face: number; out: boolean }
export interface WatchHeader {
  id: number; name: string; face: number;
  /** Their figures and place, in one line: 41* off 18 · 1st of 10. */
  line: string;
  /** Balls the room has bowled, for the bars. */
  bowled: number;
  prev: { name: string; face: number } | null;
  next: { name: string; face: number } | null;
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The rings on the end screen. A tap on one asks to watch that seat. */
export class Rings {
  private readonly root: HTMLElement;
  private readonly row: HTMLElement;
  private shown = new Map<number, HTMLElement>();
  constructor(host: HTMLElement, private readonly watch: (id: number) => void) {
    this.root = document.createElement('div');
    this.root.className = 'ko-rings';
    this.root.id = 'ko-rings';
    this.root.hidden = true;
    this.root.innerHTML = '<p class="ko-rings-head">STILL IN · TAP TO WATCH</p><div class="ko-rings-row" role="list"></div>';
    this.row = this.root.querySelector('.ko-rings-row')!;
    host.append(this.root);
  }
  /** Shown once the sting has landed: never before the keys have settled. */
  reveal(on: boolean) { this.root.hidden = !on || this.shown.size === 0; }
  /** The room as it stands: rings added, greyed for a batter out, and let go for a seat the cut took. */
  show(rings: RingView[]) {
    const ids = new Set(rings.map(ring => ring.id));
    for (const [id, el] of this.shown) if (!ids.has(id)) this.leave(id, el);
    rings.forEach((ring, i) => {
      let el = this.shown.get(ring.id);
      if (!el) {
        const key = document.createElement('button'); key.type = 'button'; el = key;
        el.className = 'ko-ring'; el.setAttribute('role', 'listitem');
        el.innerHTML = `<span class="ko-ring-face"><img src="${avatarSrc(ring.face)}" alt="" decoding="async"></span><span class="ko-ring-out">OUT</span><b>${esc(ring.name)}</b>`;
        el.onclick = event => { event.stopPropagation(); this.watch(ring.id); };
        this.shown.set(ring.id, el);
      }
      el.classList.toggle('is-out', ring.out);
      el.setAttribute('aria-label', `${ring.name}${ring.out ? ', out' : ''}: watch`);
      el.style.order = String(i);
      if (el.parentElement !== this.row) this.row.append(el);
    });
    if (!this.shown.size) this.root.hidden = true;
  }
  get count() { return this.shown.size; }
  private leave(id: number, el: HTMLElement) {
    this.shown.delete(id);
    el.classList.add('is-out', 'is-leaving');
    const gone = () => el.remove();
    if (still()) { gone(); return; }
    el.animate([{ transform: 'scale(1)', opacity: 1, width: `${el.offsetWidth}px` }, { transform: 'scale(.4)', opacity: 0, width: '0px', marginInline: '0px' }],
      { duration: 520, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }).finished.then(gone, gone);
  }
  remove() { this.root.remove(); }
}

/** A player's game watched full screen, as a story. */
export class WatchView {
  private readonly root: HTMLElement;
  private readonly bars: HTMLElement[];
  private start: { x: number; y: number; id: number } | null = null;
  constructor(host: HTMLElement, private readonly on: { close(): void; step(by: 1 | -1): void; react(emoji: string): void }) {
    this.root = document.createElement('div');
    this.root.className = 'ko-watch';
    this.root.id = 'ko-watch';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Watching');
    const overs = KNOCKOUT.cuts.length + 1;
    this.root.innerHTML = `<div class="ko-watch-swipe" aria-hidden="true"></div>
      <div class="ko-watch-head">
        <div class="ko-watch-bars">${Array.from({ length: overs }, () => '<i><b></b></i>').join('')}</div>
        <div class="ko-watch-who"><img class="ko-watch-face" alt="" decoding="async"><span><b class="ko-watch-name"></b><small class="ko-watch-line"></small></span>
          <button type="button" class="ko-watch-close" id="ko-watch-close" aria-label="Back to the end screen">✕</button></div>
      </div>
      <button type="button" class="ko-watch-edge is-prev" aria-label="Watch the one before"><img alt="" decoding="async"><span>‹</span></button>
      <button type="button" class="ko-watch-edge is-next" aria-label="Watch the next"><img alt="" decoding="async"><span>›</span></button>
      <div class="ko-watch-tray" role="group" aria-label="React">${['😂', '🔥', '👏', '😱', '🦆'].map(e => `<button type="button" data-react="${e}">${e}</button>`).join('')}</div>`;
    host.append(this.root);
    this.bars = [...this.root.querySelectorAll<HTMLElement>('.ko-watch-bars b')];
    this.root.querySelector<HTMLButtonElement>('.ko-watch-close')!.onclick = () => this.on.close();
    this.root.querySelector<HTMLButtonElement>('.is-prev')!.onclick = () => this.on.step(-1);
    this.root.querySelector<HTMLButtonElement>('.is-next')!.onclick = () => this.on.step(1);
    for (const key of this.root.querySelectorAll<HTMLButtonElement>('[data-react]')) key.onclick = () => this.react(key);
    // Swipes over the game: left for the next, right for the one before, down to go back.
    const swipe = this.root.querySelector<HTMLElement>('.ko-watch-swipe')!;
    swipe.addEventListener('pointerdown', event => { this.start = { x: event.clientX, y: event.clientY, id: event.pointerId }; });
    swipe.addEventListener('pointerup', event => {
      const start = this.start; this.start = null;
      if (!start || start.id !== event.pointerId) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (dy > 80 && dy > Math.abs(dx) * 1.2) this.on.close();
      else if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) this.on.step(dx < 0 ? 1 : -1);
    });
    swipe.addEventListener('pointercancel', () => { this.start = null; });
  }
  get open() { return !this.root.hidden; }
  show(header: WatchHeader, turned: 1 | -1 | 0 = 0) {
    this.root.hidden = false;
    const face = this.root.querySelector<HTMLImageElement>('.ko-watch-face')!;
    if (face.dataset.face !== String(header.face)) { face.src = avatarSrc(header.face); face.dataset.face = String(header.face); }
    this.root.querySelector('.ko-watch-name')!.textContent = header.name;
    this.root.querySelector('.ko-watch-line')!.textContent = header.line;
    this.root.dataset.watching = String(header.id);
    this.bars.forEach((bar, i) => { bar.style.width = `${Math.max(0, Math.min(1, (header.bowled - i * KNOCKOUT.ballsPerOver) / KNOCKOUT.ballsPerOver)) * 100}%`; });
    const edge = (cls: string, who: WatchHeader['prev']) => {
      const el = this.root.querySelector<HTMLElement>(`.ko-watch-edge.${cls}`)!;
      el.hidden = !who;
      if (who) { el.querySelector('img')!.src = avatarSrc(who.face); el.setAttribute('aria-label', `Watch ${who.name}`); }
    };
    edge('is-prev', header.prev); edge('is-next', header.next);
    // Turning to the next one, as stories turn: a beat of the picture swept aside.
    if (turned && !still()) {
      const wipe = document.createElement('div'); wipe.className = `ko-watch-turn ${turned > 0 ? 'is-next' : 'is-prev'}`; this.root.append(wipe);
      wipe.animate([{ transform: `translateX(${turned > 0 ? 100 : -100}%)`, opacity: .9 }, { transform: 'translateX(0)', opacity: .9, offset: .45 }, { transform: `translateX(${turned > 0 ? -100 : 100}%)`, opacity: 0 }],
        { duration: 520, easing: 'cubic-bezier(.4,0,.2,1)' }).finished.then(() => wipe.remove(), () => wipe.remove());
    }
  }
  hide() { this.root.hidden = true; this.start = null; }
  /** A reaction sent: it rises from the tray and goes. */
  private react(key: HTMLButtonElement) {
    const emoji = key.dataset.react!;
    this.on.react(emoji);
    if (still()) return;
    const flying = document.createElement('span'); flying.className = 'ko-watch-sent'; flying.textContent = emoji;
    const box = key.getBoundingClientRect(), root = this.root.getBoundingClientRect();
    flying.style.left = `${box.left - root.left + box.width / 2}px`; flying.style.top = `${box.top - root.top}px`;
    this.root.append(flying);
    flying.animate([{ transform: 'translate(-50%,0) scale(.8)', opacity: 1 }, { transform: 'translate(-50%,-160px) scale(1.4)', opacity: 0 }],
      { duration: 1100, easing: 'cubic-bezier(.2,.7,.3,1)' }).finished.then(() => flying.remove(), () => flying.remove());
  }
  remove() { this.root.remove(); }
}
