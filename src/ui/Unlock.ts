import { cta } from './Kit';
import { escape } from './Leaderboard';
import type { BatSkin, Outfit } from '../game/dressing';
import type { DressingStage, Moment } from '../scene/DressingStage';

/**
 * An unlock, celebrated: the stage plays the moment (`DressingStage.play`),
 * and this lays the rest over it — UNLOCKING… while it is scanned, then a
 * flash, confetti in its colours, and the words with the key to wear it.
 * Several from one innings follow one another; LATER goes on to the next.
 */
export interface UnlockItem {
  moment: Moment;
  /** What comes after it on the same shelf, for the line under the keys. */
  next: { name: string; short: string } | null;
}

export interface UnlockHandlers {
  /** TAKE IT IN or WEAR IT NOW: it goes on, and goes out to bat. */
  wear(shelf: 'kit' | 'bat', id: string): void;
  /** The last one put away. */
  done(): void;
}

type Bit = { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; c: string; life: number };

export function unlockWords(item: UnlockItem): { eyebrow: string; name: string; line: string; key: string; glow: string; next: string } {
  const thing: Outfit | BatSkin = item.moment.kind === 'bat' ? item.moment.bat : item.moment.to;
  return {
    eyebrow: item.moment.kind === 'bat' ? 'New bat unlocked' : 'New kit unlocked',
    name: thing.name.toUpperCase(),
    line: thing.line,
    key: item.moment.kind === 'bat' ? 'TAKE IT IN' : 'WEAR IT NOW',
    glow: thing.glow,
    next: item.next ? `Next: ${item.next.name} · ${item.next.short}` : '',
  };
}

export class UnlockMoment {
  private readonly root: HTMLElement;
  private readonly fx: HTMLCanvasElement;
  private bits: Bit[] = [];
  private raf = 0;
  private last = 0;
  private index = 0;
  private readonly reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(host: HTMLElement, private readonly items: UnlockItem[], private readonly stage: DressingStage, private readonly handlers: UnlockHandlers) {
    this.root = document.createElement('div');
    this.root.id = 'unlock-overlay'; this.root.className = 'ul-overlay';
    this.root.setAttribute('role', 'dialog'); this.root.setAttribute('aria-modal', 'true'); this.root.setAttribute('aria-live', 'polite');
    this.root.innerHTML = `<canvas class="ul-fx" aria-hidden="true"></canvas><div class="ul-flash" aria-hidden="true"></div>
      <p class="ul-scanning" aria-hidden="true">UNLOCKING…</p><div class="ul-words" id="unlock-words"></div>`;
    this.root.prepend(stage.canvas);
    host.appendChild(this.root);
    this.fx = this.root.querySelector('.ul-fx')!;
    this.root.addEventListener('click', this.click);
    this.raf = requestAnimationFrame(this.tick);
    this.start();
  }

  /** The one on show, for the checks. */
  get showing() { return this.items[this.index]; }

  close() {
    cancelAnimationFrame(this.raf);
    this.stage.dispose();
    this.root.remove();
  }

  private start() {
    const item = this.items[this.index], words = unlockWords(item);
    this.root.classList.remove('is-revealed');
    this.root.style.setProperty('--glow', words.glow);
    this.root.setAttribute('aria-label', words.eyebrow);
    this.root.querySelector('#unlock-words')!.innerHTML = `<span class="ul-eyebrow">${escape(words.eyebrow)}</span><h2 class="ul-name${words.name.length > 12 ? ' is-long' : ''}">${escape(words.name)}</h2>`
      + `<p class="ul-line">${escape(words.line)}</p>${cta({ kind: 'primary', label: words.key, id: 'unlock-take', wide: true })}`
      + `<button type="button" class="ul-later" id="unlock-later">${this.index < this.items.length - 1 ? 'NEXT' : 'LATER'}</button>${words.next ? `<span class="ul-next">${escape(words.next)}</span>` : ''}`;
    this.bits = [];
    this.stage.play(item.moment, () => this.reveal(words.glow, item));
  }

  private reveal(glow: string, item: UnlockItem) {
    this.root.classList.add('is-revealed');
    const m = item.moment, palette = m.kind === 'bat' ? [glow, '#FFFFFF', '#F5B83D', '#ED7044', glow, '#1E6BFF'] : [glow, '#FFFFFF', m.to.shirt, '#F5B83D', m.to.trousers, '#ED7044'];
    if (!this.reducedMotion) this.confetti(palette);
    (this.root.querySelector('#unlock-take') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  private click = (event: MouseEvent) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('button');
    if (!target || !this.root.classList.contains('is-revealed')) return;
    const m = this.items[this.index].moment;
    if (target.id === 'unlock-take') this.handlers.wear(m.kind, m.kind === 'bat' ? m.bat.id : m.to.id);
    else if (target.id !== 'unlock-later') return;
    this.index += 1;
    if (this.index < this.items.length) this.start();
    else this.handlers.done();
  };

  private confetti(colours: string[]) {
    const W = this.fx.width, H = this.fx.height, scale = W / 402;
    const burst = (x: number, y: number, direction: number, n: number, spread: number) => {
      for (let i = 0; i < n; i++) {
        const a = direction + (Math.random() - .5) * spread, speed = (9 + Math.random() * 13) * scale;
        this.bits.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: Math.random() * 6.28, vr: (Math.random() - .5) * .5,
          w: (6 + Math.random() * 7) * scale, h: (3 + Math.random() * 4) * scale, c: colours[i % colours.length], life: 1 });
      }
    };
    burst(0, H * .78, -Math.PI / 3.1, 90, .9); burst(W, H * .78, -Math.PI + Math.PI / 3.1, 90, .9); burst(W / 2, H * .42, -Math.PI / 2, 70, 2.6);
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(50, now - (this.last || now)); this.last = now;
    const fx = this.fx, w = Math.round(fx.clientWidth * Math.min(2, devicePixelRatio)), h = Math.round(fx.clientHeight * Math.min(2, devicePixelRatio));
    if (fx.width !== w || fx.height !== h) { fx.width = w; fx.height = h; }
    const g = fx.getContext('2d'); if (!g) return;
    g.clearRect(0, 0, fx.width, fx.height);
    this.bits = this.bits.filter(b => b.y < fx.height + 40 && b.life > 0);
    for (const b of this.bits) {
      b.vy += .32 * dt / 16; b.vx *= .985; b.vy *= .985; b.x += b.vx * dt / 16; b.y += b.vy * dt / 16; b.r += b.vr; b.life -= dt / 5200;
      g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.scale(1, Math.cos(b.r * 2.3)); g.globalAlpha = Math.min(1, b.life * 2); g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); g.restore();
    }
  };
}
