import { animate, stagger, utils } from 'animejs';
import { cta } from './Kit';
import { escape } from './Leaderboard';
import { cardMarkup } from './StatsSheet';
import type { StatsFacts } from '../game/StatsCard';
import { buzz, stopBuzz } from '../game/haptics';
import {
  levelUpBeats, levelUpFx, levelUpHaptics, levelUpMetal, levelUpWords,
  type LevelUpBeats, type LevelUpFx,
} from '../game/levelup';
import { LevelUpStage } from '../scene/LevelUpStage';

/**
 * Level Up, drawn: the full screen an innings ends on when it carried a career
 * onto a new rung, over the innings card it then hands back to.
 *
 * One card in a deep room. Behind it, the innings card's chevrons cast in the
 * rung's metal rush up past the camera and then drift into fog
 * (`LevelUpStage`, three.js); LEVEL UP comes up letter by letter as they
 * pass. The card the player held flies in out of the depth and hangs there,
 * floating and leaning, the light sliding across it as it leans; a seam of
 * light climbs it in the same chevron, and where it has passed the card is
 * the new rung's, the figure counting on to where the innings left it. It
 * swings forward as it lands with a few streaks off it, the room surges, and
 * the rung's name and the two ways on follow: SHARE STATS CARD, and GO TO
 * SCORECARD, which is the innings card waiting underneath.
 *
 * The choreography is anime.js (the entry, the swing, the letters, the
 * count); the hover is worked out a frame at a time so a finger or a tilt of
 * the phone can lean the card too. How much of everything there is goes by
 * the rung (`levelUpFx`). A tap before the keys are up skips to them; reduced
 * motion gets the turned card and the keys, still, with one buzz.
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

type Streak = { x: number; y: number; vx: number; vy: number; length: number; life: number };
type Box = { x: number; y: number; w: number; h: number };
type Phase = 'rush' | 'word' | 'card' | 'turn' | 'turned' | 'named' | 'ready';

/** A word as letters, each its own span, so they can come up one at a time. */
const lettered = (word: string) => [...word].map(ch => ch === ' '
  ? '<span class="lu-gap"> </span>' : `<span class="lu-letter">${escape(ch)}</span>`).join('');

export class LevelUp {
  readonly root: HTMLElement;
  private readonly front: HTMLCanvasElement;
  private readonly stage: LevelUpStage | null = null;
  private readonly fx: LevelUpFx;
  private readonly beats: LevelUpBeats;
  private readonly metal: { base: string; light: string; deep: string };
  private readonly reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly card: HTMLElement;
  private readonly tilt: HTMLElement;
  private readonly pop: HTMLElement;
  private streaks: Streak[] = [];
  /** When the card turned, on the screen's clock; the glints run from it. */
  private turnedAt = 0;
  /** When the card has landed and starts to hover. */
  private hoverAt = 0;
  private box: Box = { x: 0, y: 0, w: 0, h: 0 };
  /** Where a finger or the phone's tilt is leaning the card, each -1 to 1, and where it has got to. */
  private want = { x: 0, y: 0 };
  private lean = { x: 0, y: 0 };
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
      <i class="lu-veil" aria-hidden="true"></i>
      <i class="lu-bloom" aria-hidden="true"></i>
      <div class="lu-stage">
        <div class="lu-head">
          <h2 class="lu-word" aria-label="${escape(words.word)}">${lettered(words.word)}</h2>
        </div>
        <div class="lu-card" inert>
          <i class="lu-shadow" aria-hidden="true"></i>
          <div class="lu-tilt">
            <div class="lu-pop">
              <i class="lu-halo" aria-hidden="true"></i>${rings}
              <i class="lu-edge" aria-hidden="true"></i>
              <div class="lu-face is-new">${cardMarkup(view.after, view.who, false)}</div>
              <div class="lu-face is-old">${cardMarkup(view.before, view.who, false)}</div>
              <i class="lu-glare" aria-hidden="true"></i>
              <svg class="lu-seam" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,40 50,0 100,40"/></svg>
              <i class="lu-flash" aria-hidden="true"></i>
            </div>
          </div>
        </div>
        <div class="lu-words" aria-hidden="true">
          <p class="lu-kicker">${escape(words.kicker)}</p>
          <p class="lu-title${words.title.length > 9 ? ' is-long' : ''}">${lettered(words.title)}</p>
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
    // The room, where WebGL will have one; a plain dark ground where it will not.
    try {
      this.stage = new LevelUpStage(this.fx, this.metal);
      this.root.prepend(this.stage.canvas);
    } catch { this.stage = null; }
    host.appendChild(this.root);
    this.card = this.root.querySelector('.lu-card')!;
    this.tilt = this.root.querySelector('.lu-tilt')!;
    this.pop = this.root.querySelector('.lu-pop')!;
    // The new card reads the old figure until the turn counts it on, or the
    // seam would uncover the end of the count before it had started.
    const figure = this.root.querySelector<HTMLElement>('.lu-face.is-new .st-card-figure b');
    if (figure) figure.textContent = view.before.ladder.measure.toLocaleString('en-US');
    this.front = this.root.querySelector('.lu-fx.is-front')!;
    this.root.addEventListener('click', this.click);
    this.root.addEventListener('pointermove', this.point);
    this.root.addEventListener('pointerleave', this.unpoint);
    window.addEventListener('deviceorientation', this.orient);
    document.addEventListener('keydown', this.key);
    this.layout.observe(this.root);
    this.size();
    this.started = performance.now();
    if (this.reducedMotion) {
      this.finish(true);
      buzz(levelUpHaptics(this.fx, this.beats).at(-1)!.pattern);
    } else {
      this.play();
    }
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
    window.removeEventListener('deviceorientation', this.orient);
    utils.remove([...this.root.querySelectorAll('*')]);
    stopBuzz();
    this.stage?.dispose();
    this.root.remove();
  }

  // ── The beats ─────────────────────────────────────────────────────────────

  /** The beats, each a class on the root the stylesheet answers and a move anime.js makes. */
  private play() {
    const { beats, fx } = this;
    this.later(beats.word, () => { this.to('word'); this.letters('.lu-word .lu-letter', 1); });
    this.later(beats.card, () => { this.to('card'); this.enter(); });
    this.later(beats.turn, () => { this.to('turn'); this.charge(); });
    this.later(beats.turned, () => this.turned());
    this.later(beats.named, () => { this.to('named'); this.letters('.lu-title .lu-letter', .7); });
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

  /** Letters up one at a time from the middle out, each turning up off its back, then bobbing in a slow wave. */
  private letters(selector: string, weight: number) {
    const letters = [...this.root.querySelectorAll<HTMLElement>(selector)];
    if (!letters.length) return;
    animate(letters, {
      opacity: [0, 1], translateY: [46 * weight, 0], rotateX: [-100, 0], scale: [.5, 1],
      duration: 820, delay: stagger(42, { from: 'center' }), ease: 'outBack(1.9)',
      onComplete: () => {
        if (this.closed) return;
        animate(letters, {
          translateY: [0, -4 * weight], duration: 1300, delay: stagger(90), ease: 'inOutSine', alternate: true, loop: true,
        });
      },
    });
  }

  /** The card the player held, flying in out of the depth of the room and settling into its hover. */
  private enter() {
    animate(this.card, {
      opacity: { from: 0, to: 1, duration: 300, ease: 'outQuad' },
      translateZ: { from: -900, to: 0, duration: 1000, ease: 'outExpo' },
      translateY: { from: 160, to: 0, duration: 1000, ease: 'outExpo' },
      rotateX: { from: 62, to: 0, duration: 1500, ease: 'outElastic(1, .7)' },
      rotateY: { from: -28, to: 0, duration: 1500, ease: 'outElastic(1, .7)' },
      onComplete: () => { this.hoverAt = performance.now(); },
    });
  }

  /** The held breath while the seam climbs: drawn up and back, a little. */
  private charge() {
    animate(this.pop, { scale: 1.04, rotateX: -7, translateZ: 30, duration: this.fx.morph, ease: 'inQuad' });
  }

  /** The seam is over the top: the new card swings forward, the room surges, the streaks, the crowd. */
  private turned(quiet = false) {
    this.to('turned');
    this.turnedAt = performance.now();
    if (!quiet) {
      animate(this.pop, {
        scale: [1.14, 1], rotateX: [-7, 0], translateZ: [60, 0], duration: 1100, ease: 'outElastic(1, .55)',
      });
      if (this.fx.shake) {
        animate(this.pop, { rotateZ: [-this.fx.shake * .35, this.fx.shake * .35, -this.fx.shake * .2, 0], duration: 520, ease: 'outQuad' });
      }
      this.stage?.surge(performance.now());
      this.burst();
      if (this.fx.cheer) this.handlers.cheer?.(this.fx.cheer, 0);
      if (this.fx.encore) this.handlers.cheer?.('big', .9);
    }
    this.countOn(quiet);
  }

  private ready() {
    this.to('ready');
    if (!this.reducedMotion) {
      animate([...this.root.querySelectorAll('.lu-keys .k-cta')], {
        opacity: [0, 1], translateY: [36, 0], duration: 620, delay: stagger(90), ease: 'outBack(1.5)',
      });
    }
    (this.root.querySelector('#levelup-share') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  /** Straight to the keys: a tap before they are up, or reduced motion. */
  private finish(still = false) {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (still) this.root.classList.add('is-still');
    const letters = [...this.root.querySelectorAll<HTMLElement>('.lu-letter')];
    utils.remove([this.card, this.pop, ...letters]);
    utils.set(this.card, { opacity: 1, translateZ: 0, translateY: 0, rotateX: 0, rotateY: 0 });
    utils.set(this.pop, { scale: 1, rotateX: 0, rotateZ: 0, translateZ: 0 });
    utils.set(letters, { opacity: 1, translateY: 0, rotateX: 0, scale: 1 });
    this.to('turned');
    this.countOn(true);
    if (!this.turnedAt) this.turnedAt = performance.now();
    if (!this.hoverAt) this.hoverAt = performance.now();
    this.measure();
    this.to('named');
    this.ready();
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
    this.counting?.cancel();
    if (at || from >= to) { figure.textContent = to.toLocaleString('en-US'); return; }
    const count = { value: from };
    this.counting = animate(count, {
      value: to, duration: 1200, ease: 'outExpo',
      onUpdate: () => { figure.textContent = Math.round(count.value).toLocaleString('en-US'); },
      onComplete: () => { figure.textContent = to.toLocaleString('en-US'); },
    });
  }
  private counting: ReturnType<typeof animate> | null = null;

  // ── Input ─────────────────────────────────────────────────────────────────

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

  /** A finger or a pointer over the screen leans the card towards it. */
  private point = (event: PointerEvent) => {
    const box = this.root.getBoundingClientRect();
    this.want.x = Math.max(-1, Math.min(1, ((event.clientX - box.left) / box.width - .5) * 2));
    this.want.y = Math.max(-1, Math.min(1, ((event.clientY - box.top) / box.height - .5) * 2));
  };
  private unpoint = () => { this.want.x = 0; this.want.y = 0; };
  /** A phone held at a slant leans it too, where the browser says how it is held without asking. */
  private orient = (event: DeviceOrientationEvent) => {
    if (event.gamma === null || event.beta === null) return;
    this.want.x = Math.max(-1, Math.min(1, event.gamma / 25));
    this.want.y = Math.max(-1, Math.min(1, (event.beta - 45) / 25));
  };

  // ── The frame ─────────────────────────────────────────────────────────────

  private scale = 1;
  private size() {
    this.stage?.size(this.root.clientWidth, this.root.clientHeight);
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(this.front.clientWidth * dpr), h = Math.round(this.front.clientHeight * dpr);
    if (w && h && (this.front.width !== w || this.front.height !== h)) { this.front.width = w; this.front.height = h; }
    this.scale = (this.front.width || 402) / 402;
    this.measure();
  }

  /** Where the card stands, in the front canvas's pixels, as laid out rather than as it leans. */
  private measure() {
    const root = this.root.getBoundingClientRect();
    if (!root.width) return;
    const k = this.front.width / root.width;
    const parent = (this.card.offsetParent as HTMLElement | null)?.getBoundingClientRect() ?? root;
    this.box = {
      x: (parent.left - root.left + this.card.offsetLeft) * k, y: (parent.top - root.top + this.card.offsetTop) * k,
      w: this.card.offsetWidth * k, h: this.card.offsetHeight * k,
    };
  }

  private tick = () => {
    if (this.closed) return;
    this.raf = requestAnimationFrame(this.tick);
    // One clock for everything here, the one the beats were started on.
    const now = performance.now(), t = now - this.started;
    const dt = Math.min(50, now - (this.last || now)) / 1000; this.last = now;
    this.hover(now);
    this.stage?.render(t, now, this.reducedMotion);
    this.drawFront(dt, now);
  };

  /**
   * The hover: the card rising and falling a little and leaning in a slow
   * figure of eight, a finger or the phone's tilt leaning it further, and the
   * light sliding across it the way it would across a card in the hand.
   */
  private hover(now: number) {
    this.lean.x += (this.want.x - this.lean.x) * .08;
    this.lean.y += (this.want.y - this.lean.y) * .08;
    const on = this.reducedMotion ? 0 : this.hoverAt ? Math.min(1, (now - this.hoverAt) / 900) : 0;
    const deg = this.fx.hover, u = this.root.clientWidth / 402, reach = this.reducedMotion ? 0 : 1;
    const ry = on * Math.sin(now / 2300) * deg + reach * this.lean.x * deg * 1.3;
    const rx = on * Math.sin(now / 1700) * deg * .55 - reach * this.lean.y * deg;
    const y = on * Math.sin(now / 1100) * 7 * u;
    this.tilt.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    this.root.style.setProperty('--gx', `${(50 + ry * 4).toFixed(1)}%`);
    this.root.style.setProperty('--gy', `${(40 - rx * 4).toFixed(1)}%`);
    this.root.style.setProperty('--lift', (u ? y / (7 * u) : 0).toFixed(3));
    this.stage?.lean(ry / (deg * 2), rx / (deg * 2));
  }

  /** A few streaks off the card as it turns, from its edge outwards. */
  private burst() {
    if (this.reducedMotion || this.streaks.length) return;
    this.measure();
    const { x, y, w, h } = this.box, s = this.scale, n = this.fx.streaks;
    const cx = x + w / 2, cy = y + h / 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (Math.random() - .5) * .35;
      const speed = (8 + Math.random() * 6) * s;
      this.streaks.push({
        x: cx + Math.cos(a) * w * .5, y: cy + Math.sin(a) * h * .56,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, length: 2.4 + Math.random() * 1.6, life: 1,
      });
    }
  }

  private drawFront(dt: number, now: number) {
    const g = this.front.getContext('2d'); if (!g) return;
    const W = this.front.width, H = this.front.height, s = this.scale, step = dt * 60;
    g.clearRect(0, 0, W, H);
    // The streaks: quick, slowing, gone in half a second.
    if (this.streaks.length) {
      g.lineCap = 'round';
      g.strokeStyle = '#ffffff';
      g.shadowColor = this.metal.light; g.shadowBlur = 8 * s;
      for (const one of this.streaks) {
        one.x += one.vx * step; one.y += one.vy * step;
        one.vx *= .9; one.vy *= .9; one.life -= dt / .6;
        if (one.life <= 0) continue;
        g.globalAlpha = Math.min(1, one.life * 1.6);
        g.lineWidth = 2.6 * s * one.life;
        g.beginPath(); g.moveTo(one.x, one.y); g.lineTo(one.x - one.vx * one.length, one.y - one.vy * one.length); g.stroke();
      }
      this.streaks = this.streaks.filter(one => one.life > 0);
      g.shadowBlur = 0;
    }
    // The glints, on the card's corners, each twinkling in its turn.
    if (this.turnedAt && this.fx.glints && !this.reducedMotion) {
      const { x, y, w, h } = this.box, inset = 4 * s;
      const at = [[x + inset, y + inset], [x + w - inset, y + h - inset], [x + w - inset, y + inset], [x + inset, y + h - inset], [x + w * .5, y], [x + w, y + h * .5]];
      g.fillStyle = '#ffffff';
      g.shadowColor = this.metal.light; g.shadowBlur = 10 * s;
      for (let i = 0; i < this.fx.glints; i++) {
        const age = (now - this.turnedAt - 250 - i * 330) / 700;
        const cycle = age - Math.floor(age / 3.4) * 3.4;
        if (age < 0 || cycle > 1) continue;
        const r = 12 * s * Math.sin(Math.PI * cycle), [gx, gy] = at[i % at.length];
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
