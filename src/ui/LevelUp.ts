import { badgeSrc, cta, roadToHitman } from './Kit';
import { escape } from './Leaderboard';
import { cardMarkup } from './StatsSheet';
import type { StatsFacts } from '../game/StatsCard';
import { buzz, stopBuzz } from '../game/haptics';
import { roadOf, TIERS } from '../game/tier';
import {
  ROAD, RUSH, SIX, levelUpBeats, levelUpFx, levelUpHaptics, levelUpMetal, levelUpWords, sixSpinMs, spring,
  type LevelUpBeats, type LevelUpFx, type SpringKind,
} from '../game/levelup';

/**
 * Level Up, drawn: the full screen an innings ends on when it carried a career
 * onto a new rung, over the innings card it then hands back to.
 *
 * Each rung opens its own way (`levelUpFx(tier).opening`, the whole story in
 * `src/game/levelup.ts`): EMERGING PLAYER's Road to Hitman filling to the next
 * medallion, STAR's ball hitting the card, HITMAN's rush of chevrons. All
 * three end the same way: the card the player held flips over to the new
 * rung, the cannons go, the figure counts on, the rung's name, and the two
 * ways on — SHARE STATS CARD, and GO TO SCORECARD, the innings card waiting
 * underneath.
 *
 * Everything on the screen is worked out from one clock, `t` ms since it went
 * up — every move a closed-form spring, every piece of confetti a closed-form
 * flight — so any moment can be drawn on its own: a tap before the keys are
 * up jumps to them, and reduced motion is the last frame, still. The page is
 * DOM (the words, the real Road to Hitman, the medallion, the card) with one
 * canvas over it for what is drawn (the chevrons, the ball, the rings, the
 * confetti).
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

type Phase = 'rush' | 'word' | 'card' | 'turn' | 'turned' | 'named' | 'ready';
const PHASES: Phase[] = ['rush', 'word', 'card', 'turn', 'turned', 'named', 'ready'];
type Box = { x: number; y: number; w: number; h: number };
type Paper = {
  at: number; x: number; y: number; vx: number; vy: number; k: number; w: number; h: number; colour: string;
  r0: number; vr: number; flip: number; phase: number; sway: number; swayW: number; kind: 'paper' | 'ribbon' | 'dot';
};
/** Where a letter stands at a moment. */
type Pose = { o?: number; x?: number; y?: number; s?: number; sx?: number; sy?: number; r?: number };
type CardPose = { o: number; y?: number; z?: number; rx?: number; rz?: number; s?: number; flip: number };
type Frame = {
  letter: (i: number, n: number) => Pose;
  card: CardPose;
  road?: { o: number; y: number; at: number; count: number; tag: number; rung: (i: number) => { s: number; o: number }; lit: boolean };
  medal?: { o: number; x: number; y: number; s: number; spin: number; glow: number } | null;
  shake: number;
  zoom: number;
};

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const outCubic = (p: number) => 1 - (1 - p) ** 3;
const inCubic = (p: number) => p * p * p;
const inOutCubic = (p: number) => p < .5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
const outQuart = (p: number) => 1 - (1 - p) ** 4;
const outExpo = (p: number) => p >= 1 ? 1 : 1 - 2 ** (-10 * p);
const sp = (t: number, at: number, kind: SpringKind = 'bouncy') => spring(t - at, kind);
const rnd = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** The end card's band chevron, stood on end: 144 by 104, arms 46 thick. */
const UP = [[0, 104], [0, 58], [72, 0], [144, 58], [144, 104], [72, 46]] as const;
/** Confetti falls this hard, and the air holds it back to a flutter. */
const GRAVITY = 1500;

/** A word as letters, each its own span, so they can come in one at a time. */
const lettered = (word: string) => [...word].map(ch => ch === ' '
  ? '<span class="lu-gap"> </span>' : `<span class="lu-letter">${escape(ch)}</span>`).join('');

export class LevelUp {
  readonly root: HTMLElement;
  private readonly fx: LevelUpFx;
  private readonly beats: LevelUpBeats;
  private readonly haptics: { at: number; pattern: number[] }[];
  private readonly metal: { base: string; light: string; deep: string };
  private readonly reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly canvas: HTMLCanvasElement;
  private readonly letters: HTMLElement[];
  private readonly card: HTMLElement;
  private readonly flip: HTMLElement;
  private readonly tilt: HTMLElement;
  private readonly road: HTMLElement | null;
  private readonly medal: HTMLElement;
  private readonly named: HTMLElement;
  private readonly keys: HTMLElement;
  private readonly figure: HTMLElement | null;
  private readonly shaker: HTMLElement;
  private readonly rung: number;
  private paper: Paper[] = [];
  private raf = 0;
  private started = 0;
  private phase: Phase = 'rush';
  private buzzed = 0;
  private cheered = false;
  private closed = false;
  /** Where things stand on the page, in CSS px of the overlay; `u` is one design pixel. */
  private u = 1;
  private size = { w: 402, h: 874 };
  private box: Box = { x: 20, y: 268, w: 362, h: 214 };
  private wordY = 205;
  private pill = { x: 330, y: 294 };
  private rungAt: { x: number; y: number }[] = [];
  private want = { x: 0, y: 0 };
  private lean = { x: 0, y: 0 };
  private readonly layout = new ResizeObserver(() => this.measure());

  constructor(host: HTMLElement, private readonly view: LevelUpView, private readonly handlers: LevelUpHandlers) {
    const tier = view.after.tier;
    this.fx = levelUpFx(tier);
    this.beats = levelUpBeats(this.fx);
    this.haptics = levelUpHaptics(this.fx, this.beats);
    this.metal = levelUpMetal(tier);
    this.rung = Math.max(1, TIERS.findIndex(one => one.key === tier.key));
    const words = levelUpWords(view.after.mode, tier, view.after.nextLine);
    this.root = document.createElement('div');
    this.root.id = 'levelup-overlay';
    this.root.className = `lu-overlay tier-${tier.key} is-${view.after.mode} opens-${this.fx.opening}`;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', words.label);
    this.root.dataset.tier = tier.key;
    this.root.dataset.opening = this.fx.opening;
    this.root.dataset.phase = this.phase;
    const set = (name: string, value: string | number) => this.root.style.setProperty(name, String(value));
    set('--lu-base', this.metal.base); set('--lu-light', this.metal.light); set('--lu-deep', this.metal.deep);
    set('--lu-shake', this.fx.shake);
    const road = this.fx.opening === 'road' ? `<div class="lu-road" aria-hidden="true">${roadToHitman(view.before.mode, view.before.ladder)}</div>` : '';
    this.root.innerHTML = `
      <i class="lu-bloom" aria-hidden="true"></i>
      <div class="lu-shaker">
        <div class="lu-stage">
          <div class="lu-head"><h2 class="lu-word" aria-label="${escape(words.word)}">${lettered(words.word)}</h2></div>
          <div class="lu-slot">
            <div class="lu-card" inert>
              <div class="lu-tilt"><div class="lu-flip">
                <div class="lu-face is-old">${cardMarkup(view.before, view.who, false)}</div>
                <div class="lu-face is-new">${cardMarkup(view.after, view.who, false)}<i class="lu-glare" aria-hidden="true"></i><i class="lu-flash" aria-hidden="true"></i></div>
              </div></div>
            </div>
            ${road}
          </div>
          <div class="lu-words" aria-hidden="true">
            <p class="lu-kicker">${escape(words.kicker)}</p>
            <p class="lu-title${words.title.length > 9 ? ' is-long' : ''}">${escape(words.title)}</p>
            <p class="lu-line">${escape(words.line)}</p>
          </div>
        </div>
        <div class="lu-medal" aria-hidden="true"><i></i><img src="${badgeSrc(tier.key, true)}" alt="" draggable="false"></div>
        <canvas class="lu-fx" aria-hidden="true"></canvas>
      </div>
      <div class="lu-keys">
        ${cta({ kind: 'share-wide', label: 'SHARE STATS CARD', id: 'levelup-share' })}
        ${cta({ kind: 'secondary', label: 'GO TO SCORECARD', id: 'levelup-scorecard', icon: 'chart' })}
        <p id="levelup-status" class="lu-status" role="status" aria-live="polite"></p>
      </div>`;
    host.appendChild(this.root);
    const q = <T extends HTMLElement>(sel: string) => this.root.querySelector<T>(sel)!;
    this.canvas = q('.lu-fx');
    this.letters = [...this.root.querySelectorAll<HTMLElement>('.lu-letter')];
    this.card = q('.lu-card'); this.flip = q('.lu-flip'); this.tilt = q('.lu-tilt');
    this.road = this.root.querySelector<HTMLElement>('.lu-road');
    this.medal = q('.lu-medal'); this.named = q('.lu-words'); this.keys = q('.lu-keys'); this.shaker = q('.lu-shaker');
    this.figure = this.root.querySelector<HTMLElement>('.lu-face.is-new .st-card-figure b');
    this.root.addEventListener('click', this.click);
    this.root.addEventListener('pointermove', this.point);
    this.root.addEventListener('pointerleave', this.unpoint);
    window.addEventListener('deviceorientation', this.orient);
    document.addEventListener('keydown', this.key);
    this.layout.observe(this.root);
    this.measure();
    this.started = performance.now();
    if (this.reducedMotion) { this.root.classList.add('is-still'); this.skip(); buzz(this.haptics[this.haptics.length - 1].pattern); }
    this.raf = requestAnimationFrame(this.tick);
  }

  /** Where the screen has got to, for the checks. */
  get at(): Phase { return this.phase; }

  close() {
    if (this.closed) return;
    this.closed = true;
    cancelAnimationFrame(this.raf);
    this.layout.disconnect();
    document.removeEventListener('keydown', this.key);
    window.removeEventListener('deviceorientation', this.orient);
    stopBuzz();
    this.root.remove();
  }

  // ── The clock ─────────────────────────────────────────────────────────────

  /** Straight to the keys: a tap before they are up, or reduced motion. Nothing is buzzed or cheered on the way. */
  private skip() {
    this.started = performance.now() - this.beats.ready - (this.reducedMotion ? 4000 : 0);
    this.buzzed = this.haptics.length;
    this.cheered = true;
  }

  private tick = () => {
    if (this.closed) return;
    this.raf = requestAnimationFrame(this.tick);
    const now = performance.now(), t = now - this.started, b = this.beats;
    // The phases, for the stylesheet and the checks.
    const reached: Phase = t >= b.ready ? 'ready' : t >= b.named ? 'named' : t >= b.turned ? 'turned' : t >= b.turn ? 'turn' : t >= b.card ? 'card' : t >= b.word ? 'word' : 'rush';
    if (PHASES.indexOf(reached) > PHASES.indexOf(this.phase)) {
      this.phase = reached; this.root.dataset.phase = reached;
      for (const one of PHASES.slice(1, PHASES.indexOf(reached) + 1)) this.root.classList.add(`is-${one}`);
      if (reached === 'ready') (this.root.querySelector('#levelup-share') as HTMLElement | null)?.focus({ preventScroll: true });
    }
    while (this.buzzed < this.haptics.length && t >= this.haptics[this.buzzed].at) buzz(this.haptics[this.buzzed++].pattern);
    if (!this.cheered && t >= b.turned) {
      this.cheered = true;
      if (this.fx.cheer) this.handlers.cheer?.(this.fx.cheer, 0);
      if (this.fx.encore) this.handlers.cheer?.('big', .9);
    }
    const frame = this.fx.opening === 'road' ? this.roadFrame(t) : this.fx.opening === 'six' ? this.sixFrame(t) : this.rushFrame(t);
    this.apply(frame, t, now);
    this.draw(t);
  };

  // ── The three openings, as poses at `t` ──────────────────────────────────

  /** The ending all three share: the count, the name, the keys, the hover and the flash, timed from the turn. */
  private ending(t: number) {
    const b = this.beats;
    return {
      named: clamp(sp(t, b.count + 150, 'snappy')),
      keys: sp(t, b.count + 500),
      hover: seg(t, b.count + 400, b.count + 1400),
      count: seg(t, b.count, b.count + 1100),
      sheen: seg(t, b.turned, b.turned + 1100),
      flash: t > b.turned ? (1 - seg(t, b.turned, b.turned + 550)) * this.fx.flash : 0,
    };
  }
  /** LEVEL UP dropping in, a letter at a time from the middle out, each landing with a squash. */
  private drop(t: number, at: number) {
    const u = this.u;
    return (i: number, n: number): Pose => {
      const s = at + Math.abs(i - (n - 1) / 2) * 38, p = sp(t, s), land = seg(t, s + 140, s + 320);
      const squash = land > 0 && land < 1 ? Math.sin(Math.PI * land) * .14 : 0;
      return { o: clamp((t - s) / 90), y: lerp(-70 * u, 0, p), sx: 1 + squash, sy: 1 - squash };
    };
  }
  /** LEVEL UP bursting out of its middle, each letter flung to its place. */
  private burst(t: number, at: number) {
    const u = this.u;
    return (i: number, n: number): Pose => {
      const off = i - (n - 1) / 2, s = at + Math.abs(off) * 26, p = sp(t, s);
      return { o: clamp((t - s) / 70), x: lerp(-off * 40 * u, 0, p), y: lerp(10 * u, 0, p), s: lerp(.15, 1, p), r: lerp(off * 14, 0, p) };
    };
  }

  /**
   * EMERGING PLAYER: the Road to Hitman the player has been on, its fill
   * running on to the next medallion. The medallion squats, lights, pops, and
   * flies off the track spinning like a coin to land big in the middle — the
   * cannons go and LEVEL UP drops in over it. The card rises; the medallion
   * flies into its badge, and the card flips over.
   */
  private roadFrame(t: number): Frame {
    const u = this.u, L = this.rung, box = this.box;
    const from = roadOf(this.view.before.mode, this.view.before.ladder).position, to = L / (TIERS.length - 1);
    const run = inOutCubic(seg(t, ...ROAD.fill));
    const rungAt = this.rungAt[L] ?? { x: box.x + box.w, y: box.y + box.h / 2 };
    const mid = { x: box.x + box.w / 2, y: box.y + box.h / 2 - 20 * u };
    const arc = outCubic(seg(t, ROAD.lift, ROAD.land)), into = inOutCubic(seg(t, ROAD.flip - 430, ROAD.flip));
    const grow = sp(t, ROAD.lift, 'soft'), land = sp(t, ROAD.land, 'wobbly');
    const big = 120 / 46;
    const medalS = t < ROAD.land ? lerp(1, 1.08 * big, grow) : lerp(1.08 * big, big, land);
    return {
      letter: this.drop(t, ROAD.word),
      road: {
        o: clamp(t / 200) * (1 - seg(t, ROAD.lift + 50, ROAD.lift + 400)),
        y: lerp(40 * u, 0, sp(t, 0, 'snappy')) + 40 * u * inCubic(seg(t, ROAD.lift + 50, ROAD.lift + 400)),
        at: lerp(from, to, run),
        count: lerp(this.view.before.ladder.measure, this.view.after.tier.at[this.view.after.mode], run),
        tag: 1 - seg(t, ROAD.fill[1], ROAD.fill[1] + 200),
        lit: t >= ROAD.pop,
        rung: i => {
          const pop = sp(t, 60 + i * 70);
          if (i !== L) return { s: lerp(.4, 1, pop), o: clamp(pop * 2) };
          // The next medallion: a squat as the fill reaches it, then the pop; then it is off the track.
          const s = t < ROAD.pop ? lerp(1, .78, outCubic(seg(t, ROAD.fill[1], ROAD.pop))) : lerp(.78, 1.35, sp(t, ROAD.pop, 'wobbly'));
          return { s: lerp(.4, 1, pop) * s, o: t >= ROAD.lift ? 0 : clamp(pop * 2) };
        },
      },
      medal: t >= ROAD.lift && t < ROAD.flip + 80 ? {
        o: 1 - seg(t, ROAD.flip - 40, ROAD.flip + 60),
        x: lerp(lerp(rungAt.x, mid.x, arc), this.pill.x, into),
        y: lerp(lerp(rungAt.y, mid.y, arc) - Math.sin(Math.PI * arc) * 90 * u, this.pill.y, into),
        s: medalS * lerp(1, .22, into),
        spin: t < ROAD.land ? 720 * outQuart(seg(t, ROAD.lift, ROAD.land)) : 0,
        glow: seg(t, ROAD.lift, ROAD.land) * (1 - into),
      } : null,
      card: {
        o: clamp((t - ROAD.card) / 120), y: lerp(560 * u, 0, sp(t, ROAD.card, 'soft')), rx: lerp(30, 0, sp(t, ROAD.card)),
        flip: 180 * sp(t, ROAD.flip), s: 1 + .05 * Math.sin(Math.PI * seg(t, ROAD.flip, ROAD.flip + 260)),
      },
      shake: t > ROAD.land && t < ROAD.land + 250 ? this.fx.shake * (1 - seg(t, ROAD.land, ROAD.land + 250)) : 0,
      zoom: 1 + .02 * Math.sin(Math.PI * seg(t, ROAD.land, ROAD.land + 240)),
    };
  }

  /**
   * STAR: the card waits with the old rung showing, and the ball comes in from
   * the corner already at full speed and hits it square. It squashes flat and
   * is gone; the card is knocked back and spins like a struck coin, slowing,
   * onto the new rung, and LEVEL UP bursts out of the impact.
   */
  private sixFrame(t: number): Frame {
    const T = SIX.hit + sixSpinMs();
    const spun = 1 - (1 - seg(t, SIX.hit, T)) ** 2.6, total = 180 + 360 * (SIX.spins - 1);
    const knock = t > SIX.hit ? Math.exp(-(((t - SIX.hit) / 160) ** 2)) : 0;
    return {
      letter: this.burst(t, SIX.hit + 60),
      card: {
        o: clamp(t / 150), y: lerp(40 * this.u, 0, sp(t, 0, 'snappy')),
        s: lerp(.92, 1, sp(t, 0)) * (1 - .1 * knock) * (t > T ? lerp(1.06, 1, sp(t, T, 'wobbly')) : 1),
        z: -120 * knock, rz: t > SIX.hit && t < T ? Math.sin(spun * Math.PI * 2) * 4 * (1 - spun) : 0,
        flip: t < SIX.hit ? 0 : total * spun,
      },
      shake: t > SIX.hit && t < SIX.hit + 300 ? (this.fx.shake + 2) * (1 - seg(t, SIX.hit, SIX.hit + 300)) : 0,
      zoom: 1 + .04 * knock,
    };
  }
  /** The ball, in from the bottom-left corner on a slight curve to the middle of the card, at full speed from its first frame. */
  private ballAt(t: number): [number, number] {
    const u = this.u, p = seg(t, SIX.ball, SIX.hit), m = 1 - p, cy = this.box.y + this.box.h / 2;
    const P0 = [-40 * u, this.size.h + 100 * u], P1 = [40 * u, cy + 185 * u], P2 = [this.box.x + this.box.w / 2, cy];
    return [m * m * P0[0] + 2 * m * p * P1[0] + p * p * P2[0], m * m * P0[1] + 2 * m * p * P1[1] + p * p * P2[1]];
  }

  /**
   * HITMAN: the end card's chevron springs up in gold, squats and charges, and
   * fires — a train of chevrons rushes up the screen with a gold flash as it
   * passes, uncovering LEVEL UP, and bursts into chevron fireworks off the
   * top. The card is pulled up in its wake; a last chevron dives into it, and
   * it flips over with three shockwaves, two waves of cannons and gold falling.
   */
  private rushFrame(t: number): Frame {
    const [, hit] = RUSH.dive;
    return {
      letter: this.burst(t, this.beats.word),
      card: {
        o: clamp((t - RUSH.card) / 100), y: lerp(620 * this.u, 0, sp(t, RUSH.card, 'soft')), rx: lerp(40, 0, sp(t, RUSH.card)),
        flip: 180 * sp(t, hit), s: 1 + .06 * Math.sin(Math.PI * seg(t, hit, hit + 260)),
      },
      shake: (t > RUSH.launch && t < RUSH.launch + 260 ? 4 * (1 - seg(t, RUSH.launch, RUSH.launch + 260)) : 0)
        + (t > hit && t < hit + 320 ? this.fx.shake * (1 - seg(t, hit, hit + 320)) : 0),
      zoom: 1 + .03 * Math.sin(Math.PI * seg(t, hit, hit + 300)),
    };
  }
  /** Where the rush starts, under the card, and where the train goes off the top: set so the head passes LEVEL UP at `beats.word`. */
  private rushLine() {
    const u = this.u, from = Math.min(this.size.h - 120 * u, this.box.y + this.box.h + 158 * u);
    const crossing = (this.beats.word - RUSH.launch) / RUSH.travel;
    return { from, to: from - (from - this.wordY) / crossing ** 3 };
  }
  private carriage(t: number, i: number) {
    const { from, to } = this.rushLine(), go = RUSH.launch + i * RUSH.gap, p = seg(t, go, go + RUSH.travel);
    return { y: lerp(from, to, inCubic(p)), v: p > 0 && p < 1 ? 3 * p * p : 0, on: t >= go && p < 1 };
  }

  // ── The page, from a frame ──────────────────────────────────────────────

  private apply(f: Frame, t: number, now: number) {
    const end = this.ending(t), u = this.u;
    this.letters.forEach((el, i) => {
      const p = f.letter(i, this.letters.length);
      el.style.opacity = String(p.o ?? 1);
      el.style.transform = `translate(${(p.x ?? 0).toFixed(1)}px,${(p.y ?? 0).toFixed(1)}px) scale(${(p.sx ?? p.s ?? 1).toFixed(3)},${(p.sy ?? p.s ?? 1).toFixed(3)}) rotate(${(p.r ?? 0).toFixed(1)}deg)`;
    });
    const c = f.card;
    this.card.style.opacity = String(c.o);
    this.card.style.transform = `translate3d(0,${(c.y ?? 0).toFixed(1)}px,${(c.z ?? 0).toFixed(1)}px) rotateX(${(c.rx ?? 0).toFixed(2)}deg) rotateZ(${(c.rz ?? 0).toFixed(2)}deg) scale(${(c.s ?? 1).toFixed(3)})`;
    this.flip.style.transform = `rotateY(${c.flip.toFixed(2)}deg)`;
    // Which face is towards us: the new one past a quarter turn, until the next quarter.
    const facing = ((c.flip % 360) + 360) % 360;
    this.root.classList.toggle('is-flipped', facing > 90 && facing < 270);
    // The hover, once it stands: rising and falling a little, leaning, a finger leaning it further.
    this.lean.x += (this.want.x - this.lean.x) * .08; this.lean.y += (this.want.y - this.lean.y) * .08;
    const on = this.reducedMotion ? 0 : end.hover;
    const ry = on * (Math.sin(now / 2300) * 6 + this.lean.x * 8), rx = on * (Math.sin(now / 1700) * 3.5 - this.lean.y * 6);
    this.tilt.style.transform = `translate3d(0,${(on * Math.sin(now / 1100) * 5 * u).toFixed(2)}px,0) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    this.root.style.setProperty('--gx', `${(50 + ry * 4).toFixed(1)}%`);
    this.root.style.setProperty('--gy', `${(40 - rx * 4).toFixed(1)}%`);
    if (this.figure) this.figure.textContent = fmt(lerp(this.view.before.ladder.measure, this.view.after.ladder.measure, outExpo(end.count)));
    this.root.style.setProperty('--sheen', `${lerp(-130, 130, end.sheen).toFixed(1)}%`);
    this.root.style.setProperty('--flash', end.flash.toFixed(3));
    if (this.road && f.road) {
      const r = f.road;
      this.road.style.opacity = String(r.o);
      this.road.style.transform = `translateY(${r.y.toFixed(1)}px)`;
      this.road.querySelector<HTMLElement>('.k-road-track')?.style.setProperty('--at', r.at.toFixed(4));
      // The line over the track says it as it happens: what was left to do, then that it is done.
      const goal = this.road.querySelector<HTMLElement>('.k-road-goal');
      if (goal && r.lit && !goal.dataset.reached) { goal.dataset.reached = '1'; goal.innerHTML = `<span>${escape(TIERS[this.rung].short)}</span> reached`; }
      const pin = this.road.querySelector<HTMLElement>('.k-road-you');
      if (pin) { pin.style.opacity = String(r.tag); const tag = pin.querySelector('span'); if (tag) tag.textContent = fmt(r.count); }
      this.road.querySelectorAll<HTMLElement>('.k-road-rung').forEach((el, i) => {
        const pose = r.rung(i), badge = el.querySelector<HTMLElement>('.k-badge');
        if (badge) { badge.style.transform = `scale(${pose.s.toFixed(3)})`; badge.style.opacity = String(pose.o); }
        if (i === this.rung) {
          el.classList.toggle('is-reached', r.lit); el.classList.toggle('is-here', r.lit);
          const img = el.querySelector('img'), src = badgeSrc(TIERS[i].key, r.lit);
          if (img && img.getAttribute('src') !== src) img.setAttribute('src', src);
        } else if (i === this.rung - 1) el.classList.toggle('is-here', !r.lit);
      });
    }
    const m = f.medal;
    this.medal.style.opacity = m ? String(m.o) : '0';
    if (m) {
      this.medal.style.transform = `translate(${m.x.toFixed(1)}px,${m.y.toFixed(1)}px) scale(${m.s.toFixed(3)}) rotateY(${m.spin.toFixed(1)}deg)`;
      this.medal.style.setProperty('--glow', m.glow.toFixed(3));
    }
    this.named.style.opacity = String(end.named);
    this.named.style.transform = `translateY(${((1 - end.named) * 16 * u).toFixed(1)}px)`;
    this.keys.style.opacity = String(clamp(end.keys));
    this.keys.style.transform = `translateY(${((1 - end.keys) * 34 * u).toFixed(1)}px)`;
    this.root.style.setProperty('--bloom', (.35 + .65 * seg(t, this.beats.turned - 200, this.beats.turned + 500)).toFixed(3));
    this.shaker.style.scale = f.zoom.toFixed(4);
    this.shaker.style.translate = f.shake && !this.reducedMotion ? `${(f.shake * u * Math.sin(t / 17)).toFixed(1)}px ${(f.shake * u * Math.cos(t / 23) * .6).toFixed(1)}px` : '0 0';
  }

  // ── Measuring ───────────────────────────────────────────────────────────

  /** Where the word, the card, its badge and the road's medallions stand, as laid out rather than as they move. */
  private measure() {
    const root = this.root.getBoundingClientRect();
    if (!root.width) return;
    this.size = { w: root.width, h: root.height };
    this.u = root.width / 402;
    const k = Math.min(2, devicePixelRatio || 1);
    const cw = Math.round(root.width * k), ch = Math.round(root.height * k);
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    const still = [this.card, this.flip, this.shaker, ...(this.road ? [this.road] : [])].map(el => [el, el.style.transform, el.style.scale, el.style.translate] as const);
    for (const [el] of still) { el.style.transform = 'none'; el.style.scale = '1'; el.style.translate = '0 0'; }
    const card = this.card.getBoundingClientRect();
    this.box = { x: card.left - root.left, y: card.top - root.top, w: card.width, h: card.height };
    const word = this.root.querySelector('.lu-head')!.getBoundingClientRect();
    this.wordY = word.top - root.top + word.height / 2;
    // The badge on the card, read off the old face, which is the one not turned.
    const pill = this.root.querySelector('.lu-face.is-old .st-card-tier')?.getBoundingClientRect();
    if (pill) this.pill = { x: pill.left - root.left + pill.width / 2, y: pill.top - root.top + pill.height / 2 };
    if (this.road) {
      this.rungAt = [...this.road.querySelectorAll('.k-road-rung .k-badge')].map(el => {
        const r = el.getBoundingClientRect(); return { x: r.left - root.left + r.width / 2, y: r.top - root.top + r.height / 2 };
      });
    }
    for (const [el, transform, scale, translate] of still) { el.style.transform = transform; el.style.scale = scale; el.style.translate = translate; }
    this.paper = this.confetti();
  }

  // ── The canvas: chevrons, the ball, rings, confetti ───────────────────────

  private draw(t: number) {
    const g = this.canvas.getContext('2d'); if (!g) return;
    const k = this.canvas.width / (this.size.w || 1);
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, this.size.w, this.size.h);
    if (this.reducedMotion) return;
    const u = this.u, box = this.box, cx = box.x + box.w / 2, cy = box.y + box.h / 2, b = this.beats;
    if (this.fx.opening === 'road') {
      const at = this.rungAt[this.rung];
      if (at) { this.pulse(g, t, ROAD.pop, 430, at.x, at.y, 22 * u, 72 * u); this.sparkle(g, at.x, at.y, 26 * u * Math.sin(Math.PI * seg(t, ROAD.pop, ROAD.pop + 230))); }
      for (let i = 0; i < this.fx.rings; i++) this.pulse(g, t, ROAD.land + i * 90, 550, cx, cy - 20 * u, 40 * u, 190 * u, i ? this.metal.light : '#fff');
      this.pulse(g, t, ROAD.flip, 370, this.pill.x, this.pill.y, 10 * u, 56 * u, this.metal.light);
    } else if (this.fx.opening === 'six') {
      if (t > SIX.ball && t < SIX.hit) {
        const [x, y] = this.ballAt(t);
        for (let i = 5; i >= 1; i--) { const [gx, gy] = this.ballAt(t - i * 16); this.ball(g, gx, gy, 22 * u, t / 30 - i * .3, { alpha: .22 * (1 - i / 6) }); }
        const [tx, ty] = this.ballAt(t - 110), tail = g.createLinearGradient(x, y, tx, ty);
        tail.addColorStop(0, '#ffffffaa'); tail.addColorStop(1, '#ffffff00');
        g.save(); g.strokeStyle = tail; g.lineWidth = 20 * u; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(tx, ty); g.stroke(); g.restore();
        this.ball(g, x, y, (22 + 6 * seg(t, SIX.ball, SIX.hit)) * u, t / 30);
      }
      const hit = seg(t, SIX.hit, SIX.hit + 90);
      if (hit > 0 && hit < 1) this.ball(g, cx, cy, 28 * u, 0, { sx: 1.5, sy: .45, alpha: 1 - hit });
      this.sparkle(g, cx, cy, 70 * u * Math.sin(Math.PI * seg(t, SIX.hit, SIX.hit + 260)));
      for (let i = 0; i <= this.fx.rings; i++) this.pulse(g, t, SIX.hit + i * 80, 600, cx, cy, 30 * u, 250 * u, i ? this.metal.light : '#fff', 4);
    } else {
      this.drawRush(g, t);
    }
    this.confettiDraw(g, t);
    // Glints on the card's corners once it has turned, each in its turn.
    if (this.fx.glints && t > b.turned) {
      const inset = 4 * u, pts = [[box.x + inset, box.y + inset], [box.x + box.w - inset, box.y + box.h - inset], [box.x + box.w - inset, box.y + inset], [box.x + inset, box.y + box.h - inset], [cx, box.y], [box.x + box.w, cy]];
      for (let i = 0; i < this.fx.glints; i++) {
        const age = (t - b.turned - 250 - i * 330) / 700, cycle = age - Math.floor(age / 3.4) * 3.4;
        if (age >= 0 && cycle <= 1) this.sparkle(g, pts[i % pts.length][0], pts[i % pts.length][1], 12 * u * Math.sin(Math.PI * cycle));
      }
    }
  }

  private drawRush(g: CanvasRenderingContext2D, t: number) {
    const u = this.u, box = this.box, cx = box.x + box.w / 2, { from } = this.rushLine();
    // The charge: springing in, squatting, shaking, light drawn in from round it.
    if (t < RUSH.launch) {
      const inP = sp(t, 0), squat = seg(t, RUSH.charge, RUSH.launch) ** 2, jitter = Math.sin(t / 16) * 3 * u * squat;
      if (t > RUSH.charge) {
        for (let i = 0; i < 12; i++) {
          const q = (t / 520 + rnd(i)) % 1, a = rnd(i + 3) * 6.28, d = lerp(130, 10, q) * u;
          g.save(); g.globalAlpha = q * squat; g.fillStyle = this.metal.light;
          g.beginPath(); g.arc(cx + Math.cos(a) * d, from + Math.sin(a) * d * .6, 2.5 * u, 0, Math.PI * 2); g.fill(); g.restore();
        }
      }
      this.chevron(g, cx + jitter, from + 24 * u * squat, 130 * u * inP, { sx: 1 + .14 * squat, sy: 1 - .3 * squat, glow: 30 * squat });
    }
    for (let i = 0; i < this.fx.rings; i++) this.pulse(g, t, RUSH.launch + i * 80, 520, cx, from + 20 * u, 30 * u, 190 * u, i ? this.metal.light : '#fff');
    // The train: each stretched by its speed, two streaks off its shoulders and a copy fading behind it.
    for (let i = RUSH.train - 1; i >= 0; i--) {
      const c = this.carriage(t, i);
      if (!c.on) continue;
      const w = (134 - i * 12) * u, stretch = 1 + .9 * c.v;
      g.save(); g.strokeStyle = this.metal.light; g.lineCap = 'round'; g.lineWidth = 3 * u; g.globalAlpha = .6 * c.v;
      for (const side of [-1, 1]) { g.beginPath(); g.moveTo(cx + side * w * .42, c.y + 30 * u); g.lineTo(cx + side * w * .42, c.y + (30 + 120 * c.v) * u); g.stroke(); }
      g.restore();
      this.chevron(g, cx, c.y + 40 * u * c.v, w, { sy: stretch * .9, alpha: .25 * c.v });
      this.chevron(g, cx, c.y, w, { sy: stretch, glow: 18 });
    }
    // A gold flash over everything as the head of the train passes LEVEL UP.
    const pass = seg(t, this.beats.word, this.beats.word + 380);
    if (pass > 0 && pass < 1) {
      const glow = g.createRadialGradient(cx, this.wordY, 0, cx, this.wordY, this.size.h * .7);
      glow.addColorStop(0, `${this.metal.light}88`); glow.addColorStop(1, `${this.metal.base}00`);
      g.save(); g.globalAlpha = (1 - pass) * .9; g.fillStyle = glow; g.fillRect(0, 0, this.size.w, this.size.h); g.restore();
    }
    // Off the top, the train bursts into chevron fireworks.
    const pop = RUSH.launch + RUSH.travel * .92, fq = seg(t, pop, pop + 900);
    if (fq > 0 && fq < 1) {
      const y = 70 * u;
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * Math.PI * 2 + rnd(i) * .2, d = (30 + 130 * outCubic(fq)) * u * (.7 + rnd(i + 2) * .5);
        this.chevron(g, cx + Math.cos(a) * d, y + Math.sin(a) * d + 60 * u * fq * fq, 22 * u, { rot: a + Math.PI / 2, alpha: 1 - fq, glow: 10 });
      }
      this.sparkle(g, cx, y, 40 * u * Math.sin(Math.PI * Math.min(1, fq * 2.4)));
    }
    // The last chevron diving back into the card, and the shockwaves as it hits.
    const [d0, d1] = RUSH.dive;
    if (t >= d0 && t < d1) {
      const p = inCubic(seg(t, d0, d1));
      this.chevron(g, cx, lerp(-120 * u, box.y + 30 * u, p), 96 * u, { rot: Math.PI, sy: 1 + 1.2 * p, glow: 24 });
    }
    for (let i = 0; i < this.fx.rings; i++) this.pulse(g, t, d1 + i * 110, 650, cx, box.y + box.h / 2, 30 * u, 260 * u, i ? this.metal.light : '#fff', 4);
  }

  private chevron(g: CanvasRenderingContext2D, x: number, y: number, w: number, o: { sx?: number; sy?: number; alpha?: number; rot?: number; glow?: number } = {}) {
    const { sx = 1, sy = 1, alpha = 1, rot = 0, glow = 0 } = o;
    if (alpha <= 0 || w <= 0) return;
    const k = w / 144;
    const path = () => { g.beginPath(); UP.forEach(([px, py], i) => { const X = (px - 72) * k, Y = (py - 52) * k; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }); g.closePath(); };
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(sx, sy); g.globalAlpha = alpha;
    // A ledge in the deep cast, then the face in the metal, lit along its top edges.
    g.save(); g.translate(0, 9 * k); path(); g.fillStyle = this.metal.deep; g.fill(); g.restore();
    path();
    const fill = g.createLinearGradient(0, -52 * k, 0, 52 * k);
    fill.addColorStop(0, this.metal.light); fill.addColorStop(.6, this.metal.base); fill.addColorStop(1, this.metal.deep);
    if (glow) { g.shadowColor = this.metal.light; g.shadowBlur = glow * this.u; }
    g.fillStyle = fill; g.fill(); g.shadowBlur = 0;
    g.strokeStyle = '#ffffff99'; g.lineWidth = 4.4 * k; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(-72 * k + 3, 6 * k); g.lineTo(0, -52 * k + 3); g.lineTo(72 * k - 3, 6 * k); g.stroke();
    g.restore();
  }
  /** The Blast ball: orange-red leather lit from the top left, its seam turning one way with `spin`. */
  private ball(g: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number, o: { sx?: number; sy?: number; alpha?: number } = {}) {
    const { sx = 1, sy = 1, alpha = 1 } = o;
    g.save(); g.translate(x, y); g.scale(sx, sy); g.globalAlpha = alpha;
    const fill = g.createRadialGradient(-r * .35, -r * .4, r * .1, 0, 0, r);
    fill.addColorStop(0, '#ff9b7c'); fill.addColorStop(.45, '#e84829'); fill.addColorStop(1, '#6e1406');
    g.fillStyle = fill; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.save(); g.beginPath(); g.arc(0, 0, r * .98, 0, Math.PI * 2); g.clip(); g.rotate(spin);
    g.strokeStyle = '#fff4e6'; g.lineWidth = Math.max(.8, r * .06);
    for (const off of [-.1, .1]) { g.beginPath(); g.ellipse(off * r, 0, r * .42, r * 1.05, 0, -Math.PI / 2, Math.PI / 2); g.stroke(); }
    g.setLineDash([Math.max(1, r * .07), Math.max(1, r * .09)]); g.lineWidth = Math.max(1, r * .13); g.strokeStyle = '#fff4e6aa';
    g.beginPath(); g.ellipse(0, 0, r * .42, r * 1.05, 0, -Math.PI / 2, Math.PI / 2); g.stroke(); g.setLineDash([]);
    g.restore();
    g.globalAlpha = .5 * alpha; g.fillStyle = '#fff';
    g.beginPath(); g.ellipse(-r * .38, -r * .42, r * .22, r * .13, -.6, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  /** A shockwave out of `x, y` over `dur` ms from `at`, thinning and fading; nothing before or after. */
  private pulse(g: CanvasRenderingContext2D, t: number, at: number, dur: number, x: number, y: number, r0: number, r1: number, colour = '#fff', width = 3) {
    const q = seg(t, at, at + dur);
    if (q <= 0 || q >= 1) return;
    g.save(); g.globalAlpha = 1 - q; g.strokeStyle = colour; g.lineWidth = (width * (1 - q) + .5) * this.u;
    g.beginPath(); g.arc(x, y, lerp(r0, r1, outCubic(q)), 0, Math.PI * 2); g.stroke(); g.restore();
  }
  private sparkle(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
    if (r <= 0) return;
    g.save(); g.fillStyle = '#fff'; g.shadowColor = this.metal.light; g.shadowBlur = r;
    g.beginPath(); g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r);
    g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r); g.fill(); g.restore();
  }

  // ── Confetti: paper, not dots ─────────────────────────────────────────────

  /** Every piece this screen will throw, worked out once: the cannons, the burst out of the moment, the shower. */
  private confetti(): Paper[] {
    const u = this.u, W = this.size.w, H = this.size.h, box = this.box, b = this.beats, fx = this.fx;
    const colours = [this.metal.base, this.metal.light, '#ed7044', '#3f88f2', '#5bd08f', '#f5b83d', '#f5efe6', this.metal.base];
    const cannon = (seed: number, n: number, at: number, x: number, y: number, angle: number, spread: number, speed: number): Paper[] =>
      Array.from({ length: Math.round(n) }, (_, i) => {
        const s = seed + i * 7.3, a = (angle + (rnd(s) - .5) * spread) * Math.PI / 180, v = speed * u * (.55 + rnd(s + 1) * .6);
        const kind: Paper['kind'] = rnd(s + 12) < .18 ? 'ribbon' : rnd(s + 12) < .28 ? 'dot' : 'paper';
        return {
          at: at + rnd(s + 2) * 60, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, k: 2.6 + rnd(s + 3) * 1.6,
          w: (7 + rnd(s + 4) * 6) * u, h: (4 + rnd(s + 5) * 4) * u, colour: colours[i % colours.length],
          r0: rnd(s + 6) * 6.28, vr: (rnd(s + 7) - .5) * 9, flip: 7 + rnd(s + 8) * 9, phase: rnd(s + 9) * 6.28,
          sway: (14 + rnd(s + 10) * 26) * u, swayW: 3 + rnd(s + 11) * 3, kind,
        };
      });
    // The party popper: both bottom corners at once, aimed up and in.
    const corners = (seed: number, at: number) => [
      ...cannon(seed, fx.confetti / 2, at, -10 * u, H + 10 * u, -62, 26, 2300),
      ...cannon(seed + 500, fx.confetti / 2, at, W + 10 * u, H + 10 * u, -118, 26, 2300),
    ];
    const out: Paper[] = [];
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    if (fx.opening === 'road') out.push(...corners(11, ROAD.land), ...cannon(301, fx.burst, ROAD.flip, cx, box.y, -90, 120, 1100));
    else if (fx.opening === 'six') out.push(...cannon(41, fx.burst, SIX.hit, cx, cy, -90, 360, 1500), ...corners(57, b.turned - 120));
    else {
      out.push(...cannon(23, fx.burst, RUSH.dive[1], cx, box.y, -90, 160, 1400));
      for (let w = 0; w < fx.waves; w++) out.push(...corners(23 + w * 40, RUSH.dive[1] + w * 420));
    }
    // The shower, the top rung's: paper in its metal, falling from the top.
    for (let i = 0; i < fx.shower; i++) {
      const s = 91 + i * 5.1;
      out.push({
        at: b.turned + rnd(s) * 1400, x: rnd(s + 1) * W, y: -20 * u, vx: (rnd(s + 2) - .5) * 80 * u, vy: 0, k: 3.4 + rnd(s + 3) * 1.4,
        w: (7 + rnd(s + 4) * 6) * u, h: (4 + rnd(s + 5) * 4) * u, colour: i % 3 ? this.metal.base : this.metal.light,
        r0: rnd(s + 6) * 6.28, vr: (rnd(s + 7) - .5) * 7, flip: 6 + rnd(s + 8) * 8, phase: rnd(s + 9) * 6.28,
        sway: (18 + rnd(s + 10) * 22) * u, swayW: 2.5 + rnd(s + 11) * 2.5, kind: 'paper',
      });
    }
    return out;
  }
  /**
   * Each piece where it is `t` ms on: fired, held back by the air to a slow
   * fall, swaying, turning over — its back a shade darker than its face.
   */
  private confettiDraw(g: CanvasRenderingContext2D, t: number) {
    const H = this.size.h, u = this.u;
    for (const p of this.paper) {
      const tau = (t - p.at) / 1000;
      if (tau <= 0) continue;
      const fade = 1 - clamp((tau - 2.4) / .8);
      if (fade <= 0) continue;
      const e = Math.exp(-p.k * tau), fall = GRAVITY * u / p.k / 2.2;
      const x = p.x + p.vx / p.k * (1 - e) + p.sway * Math.sin(p.swayW * tau + p.phase) * (1 - Math.exp(-2 * tau));
      const y = p.y + fall * tau + (p.vy - fall) / p.k * (1 - e);
      if (y > H + 30 * u) continue;
      const turn = Math.cos(p.flip * tau + p.phase);
      g.save(); g.translate(x, y); g.rotate(p.r0 + p.vr * tau); g.globalAlpha = fade;
      g.fillStyle = turn > 0 ? p.colour : shade(p.colour, .62);
      if (p.kind === 'dot') { g.beginPath(); g.arc(0, 0, p.h * .7, 0, Math.PI * 2); g.fill(); }
      else if (p.kind === 'ribbon') {
        g.strokeStyle = g.fillStyle; g.lineWidth = 2.6 * u; g.lineCap = 'round'; g.beginPath();
        for (let s = 0; s <= 6; s++) { const yy = (s - 3) * 3.2 * u, xx = Math.sin(s * 1.2 + tau * 9) * 3.5 * u * Math.abs(turn); if (s) g.lineTo(xx, yy); else g.moveTo(xx, yy); }
        g.stroke();
      } else { g.scale(1, Math.max(.08, Math.abs(turn))); g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
      g.restore();
    }
  }

  // ── Input ───────────────────────────────────────────────────────────────

  private click = (event: MouseEvent) => {
    const key = (event.target as HTMLElement).closest<HTMLElement>('button');
    if (this.phase !== 'ready') { this.skip(); return; }
    if (!key) return;
    if (key.id === 'levelup-scorecard') this.handlers.scorecard();
    else if (key.id === 'levelup-share') void this.handlers.share(this.root.querySelector('#levelup-status')!);
  };
  private key = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (this.phase !== 'ready') this.skip();
    else this.handlers.scorecard();
  };
  /** A finger or a pointer over the screen leans the card towards it. */
  private point = (event: PointerEvent) => {
    const box = this.root.getBoundingClientRect();
    this.want.x = clamp(((event.clientX - box.left) / box.width - .5) * 2, -1, 1);
    this.want.y = clamp(((event.clientY - box.top) / box.height - .5) * 2, -1, 1);
  };
  private unpoint = () => { this.want.x = 0; this.want.y = 0; };
  /** A phone held at a slant leans it too, where the browser says how it is held without asking. */
  private orient = (event: DeviceOrientationEvent) => {
    if (event.gamma === null || event.beta === null) return;
    this.want.x = clamp(event.gamma / 25, -1, 1);
    this.want.y = clamp((event.beta - 45) / 25, -1, 1);
  };
}

/** A colour a shade darker: the back of a piece of confetti. */
function shade(hex: string, by: number) {
  const n = parseInt(hex.slice(1, 7), 16), f = (c: number) => Math.round(c * by);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
