import { cta } from './Kit';
import { escape } from './Leaderboard';
import { cardMarkup } from './StatsSheet';
import type { StatsFacts } from '../game/StatsCard';
import { buzz, stopBuzz } from '../game/haptics';
import {
  LIFT_GAP, levelUpBeats, levelUpFx, levelUpHaptics, levelUpMetal, levelUpWords,
  type LevelUpBeats, type LevelUpFx,
} from '../game/levelup';

/**
 * Level Up, drawn: the full screen an innings ends on when it carried a career
 * onto a new rung, over the innings card it then hands back to.
 *
 * One thing on a quiet dark ground, the way a game's rank-up is one badge.
 * A few chevrons — the innings card's, stood on end — rise through the middle
 * and LEVEL UP pops in as the last of them passes; they are gone before it is
 * read. The card the player held rises into the middle, a seam of light climbs
 * it in the same chevron, and where it has passed the card is the new rung's,
 * the figure counting on to where the innings left it. It pops as it lands,
 * a few streaks fly off it, and the rung's name and the two ways on follow:
 * SHARE STATS CARD, and GO TO SCORECARD, which is the innings card waiting
 * underneath.
 *
 * Nothing is drawn behind the words once they are up: the dust the higher
 * rungs bring drifts up the screen's edges, out of focus, and the glints sit
 * on the card's corners. How much finish there is goes by the rung
 * (`levelUpFx`). A tap before the keys are up skips to them; reduced motion
 * gets the turned card and the keys, still, with one buzz.
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

type Mote = { x: number; y: number; size: number; speed: number; alpha: number; phase: number };
type Streak = { x: number; y: number; vx: number; vy: number; length: number; life: number };
type Box = { x: number; y: number; w: number; h: number };
type Phase = 'rush' | 'word' | 'card' | 'turn' | 'turned' | 'named' | 'ready';

/** The up-chevron, the band's own turned on end: 144 wide, 104 tall, arms 46 thick. */
const UP = [[0, 104], [0, 58], [72, 0], [144, 58], [144, 104], [72, 46]] as const;

export class LevelUp {
  readonly root: HTMLElement;
  private readonly back: HTMLCanvasElement;
  private readonly front: HTMLCanvasElement;
  private readonly fx: LevelUpFx;
  private readonly beats: LevelUpBeats;
  private readonly metal: { base: string; light: string; deep: string };
  private readonly reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private motes: Mote[] = [];
  private streaks: Streak[] = [];
  /** When the card turned, on the screen's clock; the dust and the glints run from it. */
  private turnedAt = 0;
  /** The card, and the word's middle, in the canvases' pixels. */
  private card: Box = { x: 0, y: 0, w: 0, h: 0 };
  private wordY = 0;
  private raf = 0;
  private started = 0;
  private last = 0;
  private timers: number[] = [];
  private phase: Phase = 'rush';
  private closed = false;
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
    set('--lu-morph', `${this.fx.morph}ms`); set('--lu-flash', this.fx.flash); set('--lu-shake', this.fx.shake);
    const rings = Array.from({ length: this.fx.rings }, (_, i) => `<i class="lu-ring" style="--i:${i}" aria-hidden="true"></i>`).join('');
    this.root.innerHTML = `
      <i class="lu-bloom" aria-hidden="true"></i>
      <canvas class="lu-fx is-back" aria-hidden="true"></canvas>
      <div class="lu-stage">
        <div class="lu-head">
          <h2 class="lu-word"><span>${escape(words.word)}</span></h2>
        </div>
        <div class="lu-card" inert>
          <i class="lu-halo" aria-hidden="true"></i>${rings}
          <div class="lu-face is-new">${cardMarkup(view.after, view.who, false)}</div>
          <div class="lu-face is-old">${cardMarkup(view.before, view.who, false)}</div>
          <svg class="lu-seam" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,40 50,0 100,40"/></svg>
          <i class="lu-flash" aria-hidden="true"></i>
        </div>
        <div class="lu-words" aria-hidden="true">
          <p class="lu-kicker">${escape(words.kicker)}</p>
          <p class="lu-title${words.title.length > 9 ? ' is-long' : ''}">${escape(words.title)}</p>
          <p class="lu-line">${escape(words.line)}</p>
          ${progressed ? '' : `<p class="lu-next">${escape(words.next)}</p>`}
        </div>
      </div>
      <canvas class="lu-fx is-front" aria-hidden="true"></canvas>
      <div class="lu-keys">
        ${cta({ kind: 'share-wide', label: 'SHARE STATS CARD', id: 'levelup-share' })}
        ${cta({ kind: 'secondary', label: 'GO TO SCORECARD', id: 'levelup-scorecard', icon: 'chart' })}
        <p id="levelup-status" class="lu-status" role="status" aria-live="polite"></p>
      </div>`;
    host.appendChild(this.root);
    // The new card reads the old figure until the turn counts it on, or the
    // seam would uncover the end of the count before it had started.
    const figure = this.root.querySelector<HTMLElement>('.lu-face.is-new .st-card-figure b');
    if (figure) figure.textContent = view.before.ladder.measure.toLocaleString('en-US');
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
    this.turnedAt = performance.now();
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
    if (!this.turnedAt) this.turnedAt = performance.now();
    this.measure();
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
    if (!figure) return;
    if (at || from >= to) { figure.textContent = to.toLocaleString('en-US'); return; }
    const begin = performance.now(), span = 900;
    const step = () => {
      if (this.closed) return;
      const t = Math.min(1, Math.max(0, (performance.now() - begin) / span)), eased = 1 - (1 - t) ** 3;
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
    this.measure();
  }

  /** Where the card and the word stand, in the canvases' pixels. */
  private measure() {
    const root = this.root.getBoundingClientRect();
    if (!root.width) return;
    const k = this.back.width / root.width;
    const card = this.root.querySelector('.lu-card')!.getBoundingClientRect();
    const word = this.root.querySelector('.lu-word')!.getBoundingClientRect();
    // The card's box as laid out, not as it is scaled mid-pop.
    const el = this.root.querySelector<HTMLElement>('.lu-card')!;
    const w = el.offsetWidth * k, h = el.offsetHeight * k;
    this.card = { x: (card.left - root.left + card.width / 2) * k - w / 2, y: (card.top - root.top + card.height / 2) * k - h / 2, w, h };
    this.wordY = (word.top - root.top + word.height / 2) * k;
  }

  /** The dust, scattered up the edges of the screen and never the column the words stand in. */
  private seed() {
    const H = this.back.height || 874 * this.scale;
    this.motes = Array.from({ length: this.fx.dust }, (_, i) => this.mote(Math.random() * H, i));
  }

  private mote(y: number, i: number): Mote {
    const x = i % 2 ? .8 + Math.random() * .18 : .02 + Math.random() * .18;
    return { x, y, size: 3 + Math.random() * 7, speed: 8 + Math.random() * 16, alpha: .1 + Math.random() * .16, phase: Math.random() * 6.28 };
  }

  private chevron(g: CanvasRenderingContext2D, x: number, y: number, width: number) {
    const k = width / 144;
    g.beginPath();
    UP.forEach(([px, py], i) => { const X = x + (px - 72) * k, Y = y + (py - 52) * k; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
    g.closePath();
  }

  /** A few streaks off the card as it turns, from its edge outwards. */
  private burst() {
    if (this.reducedMotion || this.streaks.length) return;
    this.measure();
    const { x, y, w, h } = this.card, s = this.scale, n = this.fx.streaks;
    const cx = x + w / 2, cy = y + h / 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (Math.random() - .5) * .35;
      const speed = (7 + Math.random() * 5) * s;
      this.streaks.push({
        x: cx + Math.cos(a) * w * .5, y: cy + Math.sin(a) * h * .56,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, length: 2.2 + Math.random() * 1.6, life: 1,
      });
    }
  }

  private tick = () => {
    if (this.closed) return;
    this.raf = requestAnimationFrame(this.tick);
    // One clock for everything here, the one the beats were started on: a
    // frame's own timestamp can be earlier than a moment taken just before it.
    const now = performance.now();
    const dt = Math.min(50, now - (this.last || now)) / 1000; this.last = now;
    this.drawBack(now - this.started, dt, now);
    this.drawFront(dt, now);
  };

  private drawBack(t: number, dt: number, now: number) {
    const g = this.back.getContext('2d'); if (!g) return;
    const W = this.back.width, H = this.back.height, s = this.scale;
    g.clearRect(0, 0, W, H);
    // The lift: a few chevrons up through the middle, the last of them over
    // LEVEL UP as it pops, faded in from the foot and out by the top.
    if (!this.reducedMotion && t < this.beats.word + 900) {
      const travel = 820, wordY = this.wordY || H * .2;
      for (let i = 0; i < this.fx.lift; i++) {
        const width = W * (.34 + .06 * i), from = H + width * .5, to = -width * .5;
        const crosses = (from - wordY) / (from - to);
        const start = this.beats.word - (this.fx.lift - 1 - i) * LIFT_GAP - crosses * travel;
        const p = (t - start) / travel;
        if (p <= 0 || p >= 1) continue;
        const y = from + (to - from) * p;
        const grad = g.createLinearGradient(0, y - width * .36, 0, y + width * .36);
        grad.addColorStop(0, this.metal.light); grad.addColorStop(.6, this.metal.base); grad.addColorStop(1, this.metal.deep);
        g.fillStyle = grad;
        g.globalAlpha = (.28 + .14 * i) * Math.sin(Math.PI * p);
        if (this.fx.glow) { g.shadowColor = this.metal.base; g.shadowBlur = 22 * s; }
        this.chevron(g, W / 2, y, width);
        g.fill();
        g.shadowBlur = 0;
      }
    }
    // The dust, once the card has turned: soft, out of focus, drifting up the edges.
    if (this.turnedAt && this.motes.length) {
      const fade = Math.min(1, (now - this.turnedAt) / 900);
      for (const m of this.motes) {
        if (!this.reducedMotion) m.y -= m.speed * s * dt;
        const r = m.size * s;
        if (m.y < -r * 2) Object.assign(m, this.mote(H + r * 2, Math.round(m.x * 10) % 2 ? 1 : 0), { y: H + r * 2 });
        const x = m.x * W + Math.sin(now / 1300 + m.phase) * 8 * s;
        const dot = g.createRadialGradient(x, m.y, 0, x, m.y, r);
        dot.addColorStop(0, this.metal.light); dot.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = dot;
        g.globalAlpha = m.alpha * fade;
        g.beginPath(); g.arc(x, m.y, r, 0, Math.PI * 2); g.fill();
      }
    }
    g.globalAlpha = 1;
  }

  private drawFront(dt: number, now: number) {
    const g = this.front.getContext('2d'); if (!g) return;
    const W = this.front.width, H = this.front.height, s = this.scale, step = dt * 60;
    g.clearRect(0, 0, W, H);
    // The streaks: quick, slowing, gone in half a second.
    if (this.streaks.length) {
      g.lineCap = 'round';
      g.strokeStyle = '#ffffff';
      g.shadowColor = this.metal.light; g.shadowBlur = 6 * s;
      for (const one of this.streaks) {
        one.x += one.vx * step; one.y += one.vy * step;
        one.vx *= .9; one.vy *= .9; one.life -= dt / .55;
        if (one.life <= 0) continue;
        g.globalAlpha = Math.min(1, one.life * 1.6);
        g.lineWidth = 2.4 * s * one.life;
        g.beginPath(); g.moveTo(one.x, one.y); g.lineTo(one.x - one.vx * one.length, one.y - one.vy * one.length); g.stroke();
      }
      this.streaks = this.streaks.filter(one => one.life > 0);
      g.shadowBlur = 0;
    }
    // The glints, on the card's corners, each twinkling in its turn.
    if (this.turnedAt && this.fx.glints && !this.reducedMotion) {
      const { x, y, w, h } = this.card, inset = 4 * s;
      const at = [[x + inset, y + inset], [x + w - inset, y + h - inset], [x + w - inset, y + inset], [x + inset, y + h - inset], [x + w * .5, y], [x + w, y + h * .5]];
      g.fillStyle = '#ffffff';
      g.shadowColor = this.metal.light; g.shadowBlur = 10 * s;
      for (let i = 0; i < this.fx.glints; i++) {
        const age = (now - this.turnedAt - 250 - i * 330) / 700;
        const cycle = age - Math.floor(age / 3.4) * 3.4;
        if (age < 0 || cycle > 1) continue;
        const r = 11 * s * Math.sin(Math.PI * cycle), [gx, gy] = at[i % at.length];
        g.globalAlpha = .95;
        g.beginPath();
        g.moveTo(gx, gy - r); g.quadraticCurveTo(gx, gy, gx + r, gy); g.quadraticCurveTo(gx, gy, gx, gy + r);
        g.quadraticCurveTo(gx, gy, gx - r, gy); g.quadraticCurveTo(gx, gy, gx, gy - r);
        g.fill();
      }
      g.shadowBlur = 0;
    }
    g.globalAlpha = 1;
  }
}
