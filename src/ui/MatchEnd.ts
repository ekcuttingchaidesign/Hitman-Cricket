import { avatarSrc } from '../config/board';
import { buzz } from '../game/haptics';
import type { ChaseEnd, VerdictKind, VerdictView } from '../game/match-end';
import { escape } from './Leaderboard';
import { CROWN } from './TopSpot';

/**
 * The end of a challenge, on screen.
 *
 * `chaseEndMarkup` is the moment on the gameplay screen, the ball a chase
 * ends: TARGET CHASED in gold, FELL SHORT in raspberry, SCORES LEVEL in white,
 * with the plate under it and one line, over the ground as the PASSED moment
 * is.
 *
 * `Verdict` is what a player sees the first time they open the settled match,
 * over its result: the two faces in from either side and a clash, then
 * VICTORY (theirs knocked down and away, yours lifted to the middle and
 * crowned, paper up from both bottom corners), DEFEAT (the same the other way
 * round, in steel and raspberry, no paper), or DRAW (both thrown back level,
 * side by side, in silver). Every frame of it is drawn from one clock, as New
 * #1's is (`TopSpot`), on the same 402 by 874 stage scaled to the screen; a
 * tap, Escape or Enter skips to the hand-over, and reduced motion is the
 * lockup standing still for a moment.
 */

export function chaseEndMarkup(end: ChaseEnd, mode: 'classic' | 'super10'): string {
  return `<div id="chase-end" class="ce is-${end.kind} is-${mode}" role="status" aria-label="${escape(`${end.title.toLowerCase()}, ${end.chip.toLowerCase()}`)}">
      ${end.kind === 'won' ? '<i class="ce-rays" aria-hidden="true"></i>' : ''}<i class="ce-wave" aria-hidden="true"></i>
      <div class="ce-stamp"><b>${escape(end.title)}</b><span>${escape(end.chip)}</span></div>
      <p class="ce-line">${escape(end.line)}</p>
    </div>`;
}

export interface VerdictHooks {
  /** The crowd at the clash: a cheer, a groan, a murmur. */
  sound(kind: VerdictKind): void;
  /** WIN IT BACK on a defeat: the rematch, straight away. */
  rematch?(): void;
  done(): void;
}

/** When the lockup is all in; the hand-over waits on `release` from here. A defeat holds longer, for its key. */
const HOLD = 3.4;
const LOST_HOLD = 5.4;
/** When a defeat is all in: a tap before it skips to it, after it hands over. */
const LOST_IN = 2.9;
const EXIT = 0.5;
const W = 402, H = 874, CX = 201, FACE_Y = 330, TOP_Y = 290;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const outCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const inCubic = (p: number) => p * p * p;
const inOutCubic = (p: number) => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
const outBack = (p: number, s = 1.70158) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2);
const spring = (p: number, k = 14, z = .32) => p <= 0 ? 0 : 1 - Math.exp(-z * k * p) * Math.cos(k * Math.sqrt(1 - z * z) * p);

const PAPER = ['#f5b83d', '#ffe1a3', '#ffffff', '#ed7044', '#5bd08f', '#4fa3ff'];
interface Paper { t0: number; x0: number; vx: number; vy: number; w: number; h: number; c: string; r0: number; spin: number; flip: number }

export class Verdict {
  private readonly root: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly el: Record<string, HTMLElement> = {};
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly papers: Paper[] = [];
  private readonly sparks: { a: number; v: number; s: number; c: string }[] = [];
  private readonly still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly kind: VerdictKind;
  private readonly hold: number;
  /** A defeat's rain: where each drop starts across the cloud, and its own speed. */
  private readonly drops: { x: number; v: number; ph: number }[] = [];
  private t = 0;
  private last = 0;
  private raf = 0;
  private scale = 1;
  private released = false;
  /** When the hand-over began, on the clock; null until then. */
  private leaving: number | null = null;
  private fired = new Set<string>();
  private closed = false;

  constructor(private readonly host: HTMLElement, view: VerdictView, private readonly hooks: VerdictHooks) {
    this.kind = view.kind;
    const root = document.createElement('div');
    root.className = `vc is-${view.kind} is-${view.mode}`;
    root.id = 'verdict';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', `${view.title.toLowerCase()}. ${view.sub}`);
    root.style.setProperty('--vc-mode', view.colour);
    root.innerHTML = `
      <div class="vc-scrim"></div>
      <div class="vc-stage">
        <div class="vc-bloom is-mode"></div><div class="vc-bloom is-glow"></div>
        <div class="vc-rays"></div>
        <div class="vc-ring is-one"></div><div class="vc-ring is-two"></div>
        <img class="vc-face is-them" alt="" src="${avatarSrc(view.them.avatar)}">
        <img class="vc-face is-you" alt="" src="${avatarSrc(view.you.avatar)}">
        <b class="vc-vs">VS</b>
        ${CROWN.replace('ts-crown', 'vc-crown').replace(/ts-cg/g, 'vc-cg')}
        ${view.kind === 'lost' ? `<svg class="vc-cloud" viewBox="0 0 220 110" aria-hidden="true"><path d="M48 98c-24 0-40-14-40-32s16-31 36-31c6-19 24-31 45-31 22 0 40 13 46 32 4-1 8-2 12-2 23 0 41 15 41 34s-18 30-41 30z" fill="#5d6773"/><path d="M48 98c-24 0-40-14-40-32 0-3 0-5 1-8 4 15 19 26 39 26h119c18 0 33-8 38-21 1 3 1 5 1 8 0 16-15 27-36 27z" fill="#454e59"/></svg>
        <div class="vc-bubble">${escape(view.taunt ?? '')}</div>` : ''}
        <div class="vc-title">${view.kind === 'lost' ? `<span class="vc-w">${escape(view.title.slice(0, -1))}</span><span class="vc-t">${escape(view.title.slice(-1))}</span>` : escape(view.title)}</div>
        <div class="vc-sub">${escape(view.sub)}</div>
        <div class="vc-how">${escape(view.how)}</div>
        <canvas class="vc-paper" width="${W * 2}" height="${H * 2}"></canvas>
        ${view.kind === 'lost' && hooks.rematch ? '<button type="button" class="vc-again k-cta k-cta--primary"><span class="k-cta-face"><span>WIN IT BACK</span></span></button>' : ''}
        <div class="vc-skip">TAP TO SKIP</div>
      </div>
      <div class="vc-flash"></div>`;
    this.root = root;
    this.stage = root.querySelector('.vc-stage')!;
    for (const [key, sel] of [['scrim', '.vc-scrim'], ['bloomMode', '.vc-bloom.is-mode'], ['glow', '.vc-bloom.is-glow'], ['rays', '.vc-rays'],
      ['ring1', '.vc-ring.is-one'], ['ring2', '.vc-ring.is-two'], ['them', '.vc-face.is-them'], ['you', '.vc-face.is-you'], ['vs', '.vc-vs'],
      ['crown', '.vc-crown'], ['title', '.vc-title'], ['sub', '.vc-sub'], ['how', '.vc-how'], ['skip', '.vc-skip'], ['flash', '.vc-flash'],
      ['cloud', '.vc-cloud'], ['bubble', '.vc-bubble'], ['tee', '.vc-t'], ['again', '.vc-again']]) {
      const el = root.querySelector<HTMLElement>(sel);
      if (el) this.el[key] = el;
    }
    this.hold = view.kind === 'lost' ? LOST_HOLD : HOLD;
    // WIN IT BACK: its own tap, never the skip the rest of the screen is.
    this.el.again?.addEventListener('pointerdown', event => event.stopPropagation());
    this.el.again?.addEventListener('click', () => { this.hooks.rematch?.(); this.close(); });
    this.ctx = root.querySelector<HTMLCanvasElement>('.vc-paper')!.getContext('2d');
    this.ctx?.scale(2, 2);

    let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    if (view.kind === 'won') for (const side of [-1, 1]) for (let i = 0; i < 40; i++) {
      const off = (6 + rnd() * 26) * Math.PI / 180, v = 1900 + rnd() * 850;
      this.papers.push({ t0: 1.5 + rnd() * .12, x0: side < 0 ? -10 : W + 10, vx: Math.sin(off) * v * -side, vy: -Math.cos(off) * v,
        w: 7 + rnd() * 6, h: 4 + rnd() * 4, c: PAPER[Math.floor(rnd() * PAPER.length)], r0: rnd() * 6, spin: (rnd() - .5) * 16, flip: 6 + rnd() * 10 });
    }
    const spark = view.kind === 'lost' ? ['#c9d2db', '#ff6b7f'] : view.kind === 'drawn' ? ['#e9eef3', '#ffffff'] : ['#ffe1a3', '#ffffff'];
    for (let i = 0; i < 20; i++) this.sparks.push({ a: i / 20 * Math.PI * 2 + rnd() * .25, v: 150 + rnd() * 170, s: 2 + rnd() * 3, c: spark[i % 3 ? 0 : 1] });
    if (view.kind === 'lost') for (let i = 0; i < 34; i++) this.drops.push({ x: CX - 82 + rnd() * 164, v: 1.3 + rnd() * .8, ph: rnd() });

    root.addEventListener('pointerdown', this.skip);
    addEventListener('keydown', this.key);
    addEventListener('resize', this.fit);
    host.append(root);
    this.fit();
    this.render(this.still ? this.hold : 0);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  get open() { return !this.closed; }

  /** The result is up underneath: the verdict may hand over once its lockup is in. */
  release() { this.released = true; }

  /** On to the lockup, or to the hand-over once the result is there, as a tap does. */
  skip = () => {
    if (this.still || this.leaving !== null) return;
    const allIn = this.kind === 'lost' ? LOST_IN : 2.3;
    this.t = Math.max(this.t, this.released && this.t >= allIn ? this.hold : allIn);
  };
  private key = (event: KeyboardEvent) => { if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') this.skip(); };

  private fit = () => {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.scale = Math.min(w / W, h / H);
    this.stage.style.transform = `translate(${(w - W * this.scale) / 2}px,${(h - H * this.scale) / 2}px) scale(${this.scale})`;
  };

  private frame = (now: number) => {
    if (this.closed) return;
    const dt = Math.min(.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    if (this.still) {
      // The lockup, still, for a moment once the result is there; then gone.
      if (this.released && this.leaving === null) this.leaving = this.t + 1.2;
      this.render(this.hold, this.leaving !== null ? prog(this.t, this.leaving, this.leaving + .2) : 0);
      if (this.leaving !== null && this.t >= this.leaving + .2) return this.close();
    } else {
      if (this.t >= this.hold && this.leaving === null && this.released) this.leaving = this.t;
      const exit = this.leaving !== null ? prog(this.t, this.leaving, this.leaving + EXIT) : 0;
      // Held on the lockup while the result is on its way: the rays turn and the foil glints, nothing else moves.
      this.render(this.t, exit);
      if (exit >= 1) return this.close();
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  close() {
    if (this.closed) return;
    this.closed = true;
    cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this.key);
    removeEventListener('resize', this.fit);
    this.root.remove();
    this.hooks.done();
  }

  private once(key: string, at: number, t: number, then: () => void) {
    if (t >= at && !this.fired.has(key)) { this.fired.add(key); then(); }
  }

  private render(t: number, exit = 0) {
    if (this.kind === 'lost') return this.renderDefeat(t, exit);
    const e = this.el, kind = this.kind;
    const tf = (el: HTMLElement, x: number, y: number, s = 1, r = 0) => { el.style.transform = `translate(${x}px,${y}px) rotate(${r}deg) scale(${s})`; };
    const show = (el: HTMLElement, o: number) => { el.style.opacity = String(o); el.style.visibility = o <= .001 ? 'hidden' : 'visible'; };
    const out = 1 - inCubic(exit);

    show(e.scrim, .9 * outCubic(prog(t, 0, .3)) * (1 - inOutCubic(exit)));
    show(e.bloomMode, outCubic(prog(t, 0, .4)) * (1 - .5 * prog(t, 1.4, 1.9)) * out);
    show(e.glow, outCubic(prog(t, 1.35, 1.8)) * (kind === 'won' ? 1 : .7) * out);
    show(e.flash, t > .82 ? .5 * (1 - outCubic(prog(t, .82, 1.05))) : 0);
    const shake = t > .82 && t < 1.0 ? Math.sin((t - .82) * 120) * 9 * (1 - (t - .82) / .18) : 0;
    this.stage.style.translate = `${shake}px 0`;

    // In from either side, a wind-up, the clash: each face's centre while they meet.
    const inP = outBack(prog(t, .1, .55), 1.3), wind = inOutCubic(prog(t, .55, .72)), rush = inCubic(prog(t, .72, .82));
    const gap = 81 + 14 * wind - 41 * rush;
    const meet = (side: -1 | 1) => CX + side * lerp(W / 2 + 120, gap, inP);
    const d0 = 120;
    const recoil = t > .82 ? 10 * Math.sin(Math.PI * prog(t, .82, 1.0)) : 0;
    const lift = inOutCubic(prog(t, .95, 1.45)), settle = spring(prog(t, 1.25, 1.7), 15, .35);
    const fall = prog(t, .82, 1.7);

    /** The one knocked down and away, off its own side, turning, gone grey. */
    const fallen = (el: HTMLElement, side: -1 | 1) => {
      const x = meet(side) + side * 230 * outCubic(fall), y = FACE_Y - 120 * fall + 520 * fall * fall;
      el.style.width = el.style.height = `${d0}px`;
      tf(el, x - d0 / 2, y - d0 / 2, 1 - .25 * fall, side * 75 * fall);
      el.style.filter = fall > 0 ? `grayscale(${clamp(fall * 3)}) brightness(${1 - .4 * fall})` : '';
      show(el, prog(t, .1, .2) * (1 - prog(t, 1.1, 1.6)));
    };
    /** The one lifted to the middle and grown, to be crowned. */
    const risen = (el: HTMLElement, side: -1 | 1) => {
      const x = lerp(meet(side) - side * recoil, CX, lift), y = lerp(FACE_Y, TOP_Y, lift);
      const d = lerp(d0, 168, lift) * (1 + .05 * (1 - settle) * (lift >= 1 ? 1 : 0));
      el.style.width = el.style.height = `${d}px`;
      el.style.filter = '';
      tf(el, x - d / 2, y - d / 2, 1 - .2 * inCubic(exit));
      show(el, prog(t, .1, .2) * out);
    };
    /** Thrown back level: both to their own side, side by side under the lockup. */
    const level = (el: HTMLElement, side: -1 | 1) => {
      const back = spring(prog(t, .82, 1.5), 12, .4);
      const x = lerp(meet(side), CX + side * 92, back), y = lerp(FACE_Y, TOP_Y, inOutCubic(prog(t, .95, 1.45)));
      const d = lerp(d0, 140, inOutCubic(prog(t, .95, 1.45)));
      el.style.width = el.style.height = `${d}px`;
      el.style.filter = '';
      tf(el, x - d / 2, y - d / 2, 1 - .2 * inCubic(exit));
      show(el, prog(t, .1, .2) * out);
    };
    if (kind === 'won') { risen(e.you, -1); fallen(e.them, 1); }
    else { level(e.you, -1); level(e.them, 1); }

    const vp = prog(t, .4, .6);
    tf(e.vs, CX - 26, FACE_Y - 26, outBack(vp, 2.2) * (1 - .4 * prog(t, .82, .95)));
    show(e.vs, clamp(vp * 4) * (1 - prog(t, .82, .95)));

    ([[e.ring1, 1.4, 170], [e.ring2, 1.52, 125]] as const).forEach(([el, t0, r]) => {
      const p = prog(t, t0, t0 + .6);
      tf(el, CX - r, TOP_Y - r, .25 + 1.05 * outCubic(p));
      show(el, p > 0 && p < 1 ? .9 * (1 - p) : 0);
    });
    const rp = outCubic(prog(t, 1.35, 1.9));
    tf(e.rays, CX - 320, TOP_Y - 320, .3 + .7 * rp, t * 14);
    show(e.rays, (kind === 'won' ? .85 : kind === 'drawn' ? .35 : 0) * rp * out);

    // A crown for whoever won, none for a draw.
    // Dropped under gravity and landed with a hop: never past the head, where a spring's overshoot put it over the face.
    const cw = 168 * .66, ch = cw * .6, crownP = prog(t, 1.3, 1.8);
    const fallP = prog(t, 1.3, 1.6), hop = prog(t, 1.6, 1.85);
    const cy = TOP_Y - 84 - ch * .72 - 320 * (1 - fallP * fallP) - 14 * Math.sin(Math.PI * hop) * (1 - hop);
    e.crown.style.width = `${cw}px`; e.crown.style.height = `${ch}px`;
    tf(e.crown, CX - cw / 2, cy, 1 - .2 * inCubic(exit), -14 * (1 - outCubic(fallP)) + 4 * Math.sin(Math.PI * hop) * (1 - hop));
    show(e.crown, kind !== 'drawn' && crownP > 0 ? out : 0);

    const sp = prog(t, 1.6, 1.88);
    tf(e.title, 0, 430, lerp(2.4, 1, outBack(sp, 2.2)));
    show(e.title, clamp(sp * 5) * out);
    const sh = t > 2.0 ? ((t - 2.0) % 1.4) / .6 : 2;
    e.title.style.backgroundPosition = `${lerp(160, -60, clamp(sh))}% 0, 0 0`;
    const sb = outCubic(prog(t, 1.85, 2.15));
    tf(e.sub, 0, 528 + 14 * (1 - sb));
    show(e.sub, sb * out);
    const hb = outCubic(prog(t, 2.0, 2.3));
    tf(e.how, 0, 566 + 14 * (1 - hb));
    show(e.how, hb * out);
    show(e.skip, t > .2 && t < this.hold - .1 && !this.still ? .8 : 0);

    this.once('in', .1, t, () => buzz(10));
    this.once('clash', .82, t, () => { buzz(70); this.hooks.sound(kind); });
    this.once('lock', 1.6, t, () => buzz(kind === 'won' ? [14, 70, 14] : kind === 'drawn' ? [14, 60, 14, 60] : 30));
    this.drawPaper(t, out);
  }

  /**
   * DEFEAT, its own scene: no clash and no crown for you. Your face drops in
   * alone, a rain cloud drifts over and rains on it, and it greys and sags;
   * DEFEAT lands with a thud and its last letter comes loose and hangs; the
   * winner pops up small in the corner, crowned, laughing, with a line in a
   * bubble; and WIN IT BACK rises under it all.
   */
  private renderDefeat(t: number, exit: number) {
    const e = this.el;
    const tf = (el: HTMLElement | undefined, x: number, y: number, s = 1, r = 0, sx = s, sy = s) => { if (el) el.style.transform = `translate(${x}px,${y}px) rotate(${r}deg) scale(${sx},${sy})`; };
    const show = (el: HTMLElement | undefined, o: number) => { if (el) { el.style.opacity = String(o); el.style.visibility = o <= .001 ? 'hidden' : 'visible'; } };
    const out = 1 - inCubic(exit);
    for (const k of ['rays', 'ring1', 'ring2', 'vs', 'glow'] as const) show(e[k], 0);
    show(e.scrim, .94 * outCubic(prog(t, 0, .3)) * (1 - inOutCubic(exit)));
    show(e.bloomMode, .6 * outCubic(prog(t, 0, .5)) * out);
    show(e.flash, t > 1.25 ? .22 * (1 - outCubic(prog(t, 1.25, 1.45))) : 0);
    this.stage.style.translate = t > 1.85 && t < 1.97 ? `0 ${Math.sin((t - 1.85) * 130) * 5 * (1 - (t - 1.85) / .12)}px` : '0 0';

    // Yours: dropped in alone, then rained on, greyed and sagging.
    const d = 150, fy = 300;
    const drop = outBack(prog(t, .1, .55), 1.2), sag = inOutCubic(prog(t, 1.0, 1.7));
    const shiver = t > 1.7 ? Math.sin(t * 22) * .6 : 0;
    e.you.style.width = e.you.style.height = `${d}px`;
    tf(e.you, CX - d / 2, lerp(-d - 40, fy, drop) - d / 2 + 16 * sag, 1 - .15 * inCubic(exit), -9 * sag + shiver, 1 + .03 * sag, 1 - .06 * sag);
    e.you.style.filter = sag > 0 ? `grayscale(${.85 * sag}) brightness(${1 - .28 * sag})` : '';
    show(e.you, prog(t, .1, .18) * out);

    // The cloud drifts in over it and stays, bobbing.
    const cp = outCubic(prog(t, .5, 1.0));
    tf(e.cloud, lerp(W + 30, CX - 110, cp), 108 + Math.sin(t * 2.4) * 3);
    show(e.cloud, cp > 0 ? out : 0);

    // Theirs: small, in the corner below yours, crowned and laughing.
    const td = 78, tx = 318, ty = 386;
    const pop = outBack(prog(t, 1.95, 2.2), 2.4);
    const laugh = t > 2.2 ? Math.abs(Math.sin((t - 2.2) * 9)) * 5 * Math.max(.35, 1 - (t - 2.2) / 2) : 0;
    e.them.style.width = e.them.style.height = `${td}px`;
    e.them.style.filter = '';
    tf(e.them, tx - td / 2, ty - td / 2 - laugh, pop * (1 - .15 * inCubic(exit)), Math.sin((t - 2.2) * 9) * (t > 2.2 ? 4 : 0));
    show(e.them, pop > 0 ? out : 0);
    const cw = td * .7, ch = cw * .6;
    e.crown.style.width = `${cw}px`; e.crown.style.height = `${ch}px`;
    tf(e.crown, tx - cw / 2 + 6, ty - td / 2 - ch * .74 - laugh, pop, 14);
    show(e.crown, pop > 0 ? out : 0);
    const bp = outBack(prog(t, 2.25, 2.45), 2.2);
    if (e.bubble) { e.bubble.style.transformOrigin = '88% 100%'; tf(e.bubble, 0, 0, bp); }
    show(e.bubble, bp > 0 ? out : 0);

    // DEFEAT: dropped heavy, a thud, and the last letter comes loose.
    const fall = prog(t, 1.6, 1.85), thud = prog(t, 1.85, 2.1);
    const squash = t >= 1.85 ? (1 - spring(thud, 18, .35)) * .16 : 0;
    tf(e.title, 0, 446 - 520 * (1 - fall * fall), 1, 0, 1 + squash * .6, 1 - squash);
    show(e.title, fall > 0 ? out : 0);
    e.title.style.backgroundPosition = '200% 0, 0 0';
    if (e.tee) e.tee.style.transform = `rotate(${18 * spring(prog(t, 2.4, 3.1), 9, .28)}deg) translateY(${4 * prog(t, 2.4, 2.6)}px)`;
    const sb = outCubic(prog(t, 2.0, 2.3));
    tf(e.sub, 0, 548 + 14 * (1 - sb));
    show(e.sub, sb * out);
    const hb = outCubic(prog(t, 2.15, 2.45));
    tf(e.how, 0, 584 + 14 * (1 - hb));
    show(e.how, hb * out);
    const kp = outCubic(prog(t, 2.6, 2.9));
    const breathe = t > 3.2 ? 1 + .025 * Math.sin((t - 3.2) * 4) : 1;
    tf(e.again, CX - 120, 650 + 40 * (1 - kp), breathe);
    show(e.again, kp * out);
    if (e.again) e.again.style.pointerEvents = kp > .5 && exit === 0 ? 'auto' : 'none';
    show(e.skip, t > .2 && t < LOST_IN && !this.still ? .8 : 0);

    this.once('in', .45, t, () => buzz(20));
    this.once('thunder', 1.25, t, () => buzz([10, 30, 10]));
    this.once('thud', 1.85, t, () => { buzz(60); this.hooks.sound('lost'); });
    this.once('laugh', 2.25, t, () => buzz([8, 40, 8, 40, 8]));
    this.drawRain(t, out);
  }

  /** The rain off the cloud onto your face, a line a drop, from the cloud's arrival on. */
  private drawRain(t: number, fade: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const on = prog(t, .95, 1.25) * fade;
    if (on <= 0 || this.still) return;
    ctx.strokeStyle = '#a9c2dc';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const d of this.drops) {
      const p = (t * d.v + d.ph) % 1;
      const y = lerp(186, 300, p), x = d.x - 10 * p;
      ctx.globalAlpha = on * .75 * Math.sin(Math.PI * p);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 12); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawPaper(t: number, fade: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    if (fade <= 0 || this.still) return;
    const K = 1.7, G = 1500;
    for (const p of this.papers) {
      const s = t - p.t0;
      if (s <= 0) continue;
      const k = 1 - Math.exp(-K * s);
      const x = p.x0 + p.vx / K * k, y = H + 10 + (p.vy + G / K) / K * k - G / K * s;
      if (y > H + 30) continue;
      ctx.save();
      ctx.globalAlpha = fade * clamp(1 - (s - 2.2) / .6);
      ctx.translate(x, y); ctx.rotate(p.r0 + p.spin * s); ctx.scale(Math.cos(p.flip * s), 1);
      ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    // The clash's sparks, out from between the two faces.
    const bs = t - .82;
    if (bs > 0 && bs < .6) for (const k of this.sparks) {
      const d = k.v * outCubic(clamp(bs / .6));
      ctx.globalAlpha = fade * (1 - bs / .6); ctx.fillStyle = k.c;
      ctx.beginPath(); ctx.arc(CX + Math.cos(k.a) * d, FACE_Y + Math.sin(k.a) * d * .8, k.s, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
