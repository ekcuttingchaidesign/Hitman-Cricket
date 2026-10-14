import { cta } from './Kit';
import { escape } from './Leaderboard';
import { cardMarkup } from './StatsSheet';
import type { StatsFacts } from '../game/StatsCard';
import { buzz, stopBuzz } from '../game/haptics';
import {
  levelUpBeats, levelUpFx, levelUpHaptics, levelUpMetal, levelUpWords,
  type LevelUpBeats, type LevelUpFx,
} from '../game/levelup';

/**
 * Level Up, drawn: the full screen an innings ends on when it carried a career
 * onto a new rung, over the innings card it then hands back to.
 *
 * Arrows rush up the screen — the innings card's chevrons stood on end — and
 * the great ones sweep past and uncover LEVEL UP. The card the player held
 * rises into the middle, a seam of light climbs it in the same chevron, and
 * where it has passed the card is the new rung's: bronze turns to graphite and
 * silver, silver to black and gold, the figure counting on to where the innings
 * left it. Then the rung's name and the two ways on: SHARE STATS CARD, and GO
 * TO SCORECARD, which is the innings card waiting underneath.
 *
 * How big an occasion it is goes by the rung (`levelUpFx`): arrows, sweeps,
 * the held breath before the turn, the burst, the sparkles, the foil, the rays
 * behind the card, the flash, the shake and the buzz in the hand all climb.
 * A tap before the keys are up skips to them; reduced motion gets the turned
 * card and the keys, still, with one buzz.
 */
export interface LevelUpView {
  /** The career as it stood before this innings, and as it stands now. */
  before: StatsFacts;
  after: StatsFacts;
  /** Whose card it is, or null for a guest's. */
  who: { name: string; avatar: number } | null;
}

export interface LevelUpHandlers {
  /** SHARE STATS CARD: the new card, out as a picture. Says how it went in `status`. */
  share(status: HTMLElement): Promise<void> | void;
  /** GO TO SCORECARD, Escape, or the screen otherwise put away. */
  scorecard(): void;
  /** The crowd, at the turn. */
  cheer?(size: 'mid' | 'big', at: number): void;
}

type Arrow = { x: number; y: number; size: number; speed: number; alpha: number; layer: number };
type Bit = { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; c: string; life: number; chevron: boolean };
type Spark = { x: number; y: number; size: number; phase: number; speed: number };
type Phase = 'rush' | 'word' | 'card' | 'turn' | 'turned' | 'named' | 'ready';

/** The up-chevron, in the band's own proportions: 144 wide, 104 tall, arms 46 thick. */
const UP = [[0, 104], [0, 58], [72, 0], [144, 58], [144, 104], [72, 46]] as const;
const UP_PATH = 'M0 104V58L72 0L144 58V104L72 46Z';

export class LevelUp {
  readonly root: HTMLElement;
  private readonly back: HTMLCanvasElement;
  private readonly front: HTMLCanvasElement;
  private readonly fx: LevelUpFx;
  private readonly beats: LevelUpBeats;
  private readonly metal: { base: string; light: string; deep: string };
  private readonly reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private arrows: Arrow[] = [];
  private bits: Bit[] = [];
  private sparks: Spark[] = [];
  private raf = 0;
  private started = 0;
  private last = 0;
  private timers: number[] = [];
  private phase: Phase = 'rush';
  private closed = false;
  private burstDone = false;
  private readonly layout = new ResizeObserver(() => this.size());

  constructor(host: HTMLElement, private readonly view: LevelUpView, private readonly handlers: LevelUpHandlers) {
    const tier = view.after.tier;
    this.fx = levelUpFx(tier);
    this.beats = levelUpBeats(this.fx);
    this.metal = levelUpMetal(tier);
    const words = levelUpWords(view.after.mode, tier, view.after.nextLine);
    // The STAR and HITMAN cards carry the way to the next rung on their own
    // bar (`cardMarkup`), so saying it again under them would be saying it twice.
    const progressed = tier.key === 'star' || tier.key === 'hitman';
    this.root = document.createElement('div');
    this.root.id = 'levelup-overlay';
    this.root.className = `lu-overlay tier-${tier.key} is-${view.after.mode}`;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', words.label);
    this.root.dataset.tier = tier.key;
    this.root.dataset.phase = this.phase;
    const set = (name: string, value: string | number) => this.root.style.setProperty(name, String(value));
    set('--lu-base', this.metal.base); set('--lu-light', this.metal.light); set('--lu-deep', this.metal.deep);
    set('--lu-morph', `${this.fx.morph}ms`); set('--lu-flash', this.fx.flash); set('--lu-rays', this.fx.rays);
    set('--lu-shake', this.fx.shake);
    const chevron = `<svg viewBox="0 0 144 104" aria-hidden="true"><path d="${UP_PATH}"/></svg>`;
    this.root.innerHTML = `
      <i class="lu-bloom" aria-hidden="true"></i>
      <canvas class="lu-fx is-back" aria-hidden="true"></canvas>
      <div class="lu-stage">
        <div class="lu-head">
          <div class="lu-mark" aria-hidden="true">${chevron}${chevron}${chevron}</div>
          <h2 class="lu-word"><span>${escape(words.word)}</span></h2>
        </div>
        <div class="lu-card" inert>
          <i class="lu-rays" aria-hidden="true"></i>
          <i class="lu-halo" aria-hidden="true"></i>
          <div class="lu-face is-new">${cardMarkup(view.after, view.who, false)}</div>
          <div class="lu-face is-old">${cardMarkup(view.before, view.who, false)}</div>
          <svg class="lu-seam" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,40 50,0 100,40"/></svg>
        </div>
        <div class="lu-words" aria-hidden="true">
          <p class="lu-kicker">${escape(words.kicker)}</p>
          <p class="lu-title${words.title.length > 9 ? ' is-long' : ''}">${escape(words.title)}</p>
          <p class="lu-line">${escape(words.line)}</p>
          ${progressed ? '' : `<p class="lu-next">${escape(words.next)}</p>`}
        </div>
      </div>
      <canvas class="lu-fx is-front" aria-hidden="true"></canvas>
      <i class="lu-flash" aria-hidden="true"></i>
      <div class="lu-keys">
        ${cta({ kind: 'share-wide', label: 'SHARE STATS CARD', id: 'levelup-share' })}
        ${cta({ kind: 'secondary', label: 'GO TO SCORECARD', id: 'levelup-scorecard', icon: 'chart' })}
        <p id="levelup-status" class="lu-status" role="status" aria-live="polite"></p>
      </div>`;
    host.appendChild(this.root);
    this.back = this.root.querySelector('.lu-fx.is-back')!;
    this.front = this.root.querySelector('.lu-fx.is-front')!;
    this.root.addEventListener('click', this.click);
    document.addEventListener('keydown', this.key);
    this.layout.observe(this.root);
    this.size();
    this.seed();
    if (this.reducedMotion) {
      this.finish(true);
      buzz(levelUpHaptics(this.fx, this.beats).at(-1)!.pattern);
    } else {
      this.play();
    }
    this.started = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  /** Where the screen has got to, for the checks. */
  get at(): Phase { return this.phase; }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.timers.forEach(clearTimeout);
    cancelAnimationFrame(this.raf);
    this.layout.disconnect();
    document.removeEventListener('keydown', this.key);
    stopBuzz();
    this.root.remove();
  }

  /** The beats, each a class on the root that the stylesheet answers. */
  private play() {
    const { beats, fx } = this;
    this.later(beats.word, () => this.to('word'));
    this.later(beats.card, () => this.to('card'));
    this.later(beats.turn, () => this.to('turn'));
    this.later(beats.turned, () => this.turned());
    this.later(beats.named, () => this.to('named'));
    this.later(beats.ready, () => this.ready());
    for (const one of levelUpHaptics(fx, beats)) this.later(one.at, () => buzz(one.pattern));
  }

  private later(ms: number, then: () => void) {
    this.timers.push(window.setTimeout(() => { if (!this.closed) then(); }, ms));
  }

  private to(phase: Phase) {
    const order: Phase[] = ['rush', 'word', 'card', 'turn', 'turned', 'named', 'ready'];
    if (order.indexOf(phase) <= order.indexOf(this.phase)) return;
    this.phase = phase;
    this.root.dataset.phase = phase;
    for (const one of order.slice(1, order.indexOf(phase) + 1)) this.root.classList.add(`is-${one}`);
  }

  /** The seam is over the top: the new card, the flash, the burst, the crowd. */
  private turned(quiet = false) {
    this.to('turned');
    if (!quiet) {
      this.burst();
      if (this.fx.cheer) this.handlers.cheer?.(this.fx.cheer, 0);
      if (this.fx.encore) this.handlers.cheer?.('big', .9);
    }
    this.countOn(quiet);
  }

  private ready() {
    this.to('ready');
    (this.root.querySelector('#levelup-share') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  /** Straight to the keys: a tap before they are up, or reduced motion. */
  private finish(still = false) {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (still) this.root.classList.add('is-still');
    this.to('turned');
    this.countOn(true);
    if (!still && !this.burstDone) this.burst(.5);
    this.to('ready');
    (this.root.querySelector('#levelup-share') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  /** The new card's figure counts on from where the old one stood, and its bar fills. */
  private countOn(at = false) {
    const figure = this.root.querySelector<HTMLElement>('.lu-face.is-new .st-card-figure b');
    const bar = this.root.querySelector<HTMLElement>('.lu-face.is-new .st-card-track i');
    const from = this.view.before.ladder.measure, to = this.view.after.ladder.measure;
    if (bar) {
      const width = bar.style.width;
      bar.style.transition = 'none'; bar.style.width = at ? width : '0%';
      requestAnimationFrame(() => { bar.style.transition = ''; bar.style.width = width; });
    }
    if (!figure || at || from >= to) return;
    const begin = performance.now(), span = 900;
    const step = (now: number) => {
      if (this.closed) return;
      const t = Math.min(1, (now - begin) / span), eased = 1 - (1 - t) ** 3;
      figure.textContent = Math.round(from + (to - from) * eased).toLocaleString('en-US');
      if (t < 1) requestAnimationFrame(step);
    };
    figure.textContent = from.toLocaleString('en-US');
    requestAnimationFrame(step);
  }

  private click = (event: MouseEvent) => {
    const key = (event.target as HTMLElement).closest<HTMLElement>('button');
    if (this.phase !== 'ready') { this.finish(); return; }
    if (!key) return;
    if (key.id === 'levelup-scorecard') this.handlers.scorecard();
    else if (key.id === 'levelup-share') void this.handlers.share(this.root.querySelector('#levelup-status')!);
  };

  private key = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (this.phase !== 'ready') this.finish();
    else this.handlers.scorecard();
  };

  // ── The canvases ───────────────────────────────────────────────────────────

  private scale = 1;
  private size() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    for (const canvas of [this.back, this.front]) {
      const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (w && h && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; }
    }
    this.scale = (this.back.width || 402) / 402;
  }

  /** The field of arrows, most of it still below the screen so the first second is a rush up into it. */
  private seed() {
    const H = this.back.height || 874 * this.scale;
    this.arrows = Array.from({ length: this.fx.arrows }, () => this.arrow(H * (.2 + Math.random() * 1.6)));
    this.sparks = Array.from({ length: this.fx.sparkles }, () => ({
      x: Math.random(), y: Math.random(), size: 3 + Math.random() * 6, phase: Math.random() * 6.28, speed: 1.4 + Math.random() * 2.6,
    }));
  }

  private arrow(y: number): Arrow {
    const layer = Math.random();
    return {
      x: Math.random(), y, layer,
      size: 18 + layer * layer * 64,
      speed: 26 + layer * 90,
      alpha: .07 + layer * (this.fx.glow ? .38 : .26),
    };
  }

  private chevron(g: CanvasRenderingContext2D, x: number, y: number, width: number) {
    const k = width / 144;
    g.beginPath();
    UP.forEach(([px, py], i) => { const X = x + (px - 72) * k, Y = y + (py - 52) * k; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
    g.closePath();
  }

  /** The burst at the turn, out of the card's middle: chevrons and flakes in the metal. */
  private burst(share = 1) {
    if (this.reducedMotion || this.burstDone) return;
    this.burstDone = true;
    const box = this.root.querySelector('.lu-card')!.getBoundingClientRect(), root = this.root.getBoundingClientRect();
    const dpr = this.front.width / Math.max(1, root.width);
    const cx = (box.left - root.left + box.width / 2) * dpr, cy = (box.top - root.top + box.height / 2) * dpr;
    const colours = [this.metal.base, this.metal.light, '#ffffff', this.metal.deep, this.metal.light];
    const n = Math.round(this.fx.burst * share), s = this.scale;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, speed = (6 + Math.random() * 15) * s;
      this.bits.push({
        x: cx + Math.cos(a) * box.width * .3 * dpr * Math.random(), y: cy + Math.sin(a) * box.height * .3 * dpr * Math.random(),
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 5 * s, r: Math.random() * 6.28, vr: (Math.random() - .5) * .4,
        w: (6 + Math.random() * 8) * s, h: (3 + Math.random() * 4) * s, c: colours[i % colours.length], life: 1, chevron: i % 3 === 0,
      });
    }
    // The foil comes down after, from above the screen, slow and turning.
    const W = this.front.width;
    for (let i = 0; i < Math.round(this.fx.foil * share); i++) {
      this.bits.push({
        x: Math.random() * W, y: -Math.random() * this.front.height * .9 - 20 * s,
        vx: (Math.random() - .5) * 2 * s, vy: (1.5 + Math.random() * 2.5) * s, r: Math.random() * 6.28, vr: (Math.random() - .5) * .25,
        w: (5 + Math.random() * 6) * s, h: (8 + Math.random() * 7) * s, c: colours[(i + 1) % colours.length], life: 1.6, chevron: false,
      });
    }
  }

  private tick = (now: number) => {
    if (this.closed) return;
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(50, now - (this.last || now)) / 1000; this.last = now;
    const t = now - this.started;
    this.drawBack(t, dt);
    this.drawFront(t, dt);
  };

  private drawBack(t: number, dt: number) {
    const g = this.back.getContext('2d'); if (!g) return;
    const W = this.back.width, H = this.back.height, s = this.scale;
    g.clearRect(0, 0, W, H);
    // The rush: everything climbs at several times its pace for the first
    // second and a bit, and eases off into a steady drift for as long as the
    // screen is up. Still, under reduced motion.
    const rush = this.reducedMotion ? 0 : 1 + this.fx.rush * 7 * Math.max(0, 1 - t / 1400) ** 2;
    const fill = (alpha: number, top: number, bottom: number) => {
      const grad = g.createLinearGradient(0, top, 0, bottom);
      grad.addColorStop(0, this.metal.light); grad.addColorStop(.55, this.metal.base); grad.addColorStop(1, this.metal.deep);
      g.fillStyle = grad; g.globalAlpha = alpha;
    };
    for (const a of this.arrows) {
      if (!this.reducedMotion) a.y -= a.speed * s * rush * dt;
      const w = a.size * s;
      if (a.y < -w) Object.assign(a, this.arrow(H + w + Math.random() * H * .2));
      const x = a.x * W, y = a.y;
      if (this.fx.glow && a.layer > .65) { g.shadowColor = this.metal.base; g.shadowBlur = 16 * s * a.layer; } else g.shadowBlur = 0;
      fill(a.alpha, y - w * .36, y + w * .36);
      this.chevron(g, x, y, w);
      g.fill();
    }
    g.shadowBlur = 0;
    // The great chevrons: as wide as the screen and more, one after another,
    // the last of them over LEVEL UP as it is uncovered.
    if (!this.reducedMotion && t < this.beats.word + 700) {
      const gap = this.beats.word / Math.max(1, this.fx.sweeps), span = 820;
      for (let i = 0; i < this.fx.sweeps; i++) {
        const p = (t - i * gap) / span;
        if (p < 0 || p > 1) continue;
        const width = W * 1.5, eased = p * p * (3 - 2 * p);
        const y = H + width * .4 - eased * (H + width * .9);
        fill(.16 + .22 * (i % 2) + (i === this.fx.sweeps - 1 ? .12 : 0), y - width * .36, y + width * .36);
        this.chevron(g, W / 2, y, width);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  }

  private drawFront(t: number, dt: number) {
    const g = this.front.getContext('2d'); if (!g) return;
    const W = this.front.width, H = this.front.height, s = this.scale;
    g.clearRect(0, 0, W, H);
    // Sparkles, once the card has turned: four-pointed, twinkling in place.
    if (this.root.classList.contains('is-turned') && !this.reducedMotion) {
      g.fillStyle = '#ffffff';
      for (const one of this.sparks) {
        const twinkle = Math.max(0, Math.sin(t / 1000 * one.speed + one.phase));
        if (twinkle < .05) continue;
        const r = one.size * s * twinkle, x = one.x * W, y = one.y * H;
        g.globalAlpha = .85 * twinkle;
        g.shadowColor = this.metal.light; g.shadowBlur = 8 * s;
        g.beginPath();
        g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r);
        g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r);
        g.fill();
      }
      g.shadowBlur = 0;
    }
    const step = dt * 60;
    this.bits = this.bits.filter(b => b.life > 0 && b.y < H + 40 * s);
    for (const b of this.bits) {
      b.vy += .3 * s * step * (b.life > 1 ? .12 : 1);
      b.vx *= .985; b.vy *= b.life > 1 ? 1 : .985;
      if (b.life > 1) b.vy = Math.min(b.vy, 3.2 * s);
      b.x += b.vx * step; b.y += b.vy * step; b.r += b.vr * step; b.life -= dt / 4.2;
      g.save(); g.translate(b.x, b.y); g.rotate(b.r);
      g.globalAlpha = Math.min(1, b.life * 2);
      g.fillStyle = b.c;
      if (b.chevron) { this.chevron(g, 0, 0, b.w * 1.6); g.fill(); }
      else { g.scale(1, Math.cos(b.r * 2.3)); g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); }
      g.restore();
    }
    g.globalAlpha = 1;
  }
}
