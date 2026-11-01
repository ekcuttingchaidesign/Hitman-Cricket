import { avatarSrc } from '../config/board';
import { buzz } from '../game/haptics';
import type { ChaseEnd, VictoryView } from '../game/match-end';
import { escape } from './Leaderboard';
import { CROWN } from './TopSpot';

/**
 * The end of a challenge's chase, on screen.
 *
 * `chaseEndMarkup` is the moment on the gameplay screen, the ball the chase
 * ends: TARGET CHASED in gold, FELL SHORT in raspberry, SCORES LEVEL in white,
 * with the plate under it and one line, over the ground as the PASSED moment
 * is. `Victory` is what follows a chase won and hands over to the room's
 * result: the two faces in from either side, a clash, theirs knocked down and
 * away, yours lifted to the middle and crowned, VICTORY slammed in under it,
 * paper up from both bottom corners. Every frame of it is drawn from one
 * clock, as New #1's is (`TopSpot`), on the same 402 by 874 stage scaled to
 * the screen; a tap, Escape or Enter skips to the hand-over, and reduced
 * motion is the lockup standing still for a moment.
 */

export function chaseEndMarkup(end: ChaseEnd, mode: 'classic' | 'super10'): string {
  return `<div id="chase-end" class="ce is-${end.kind} is-${mode}" role="status" aria-label="${escape(`${end.title.toLowerCase()}, ${end.chip.toLowerCase()}`)}">
      ${end.kind === 'won' ? '<i class="ce-rays" aria-hidden="true"></i>' : ''}<i class="ce-wave" aria-hidden="true"></i>
      <div class="ce-stamp"><b>${escape(end.title)}</b><span>${escape(end.chip)}</span></div>
      <p class="ce-line">${escape(end.line)}</p>
    </div>`;
}

export interface VictoryHooks {
  /** The crowd, at the clash. */
  cheer(): void;
  done(): void;
}

/** When the lockup is all in; the hand-over waits on `release` from here. */
const HOLD = 3.4;
const EXIT = 0.5;
const W = 402, H = 874, CX = 201, FACE_Y = 330;

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

export class Victory {
  private readonly root: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly el: Record<string, HTMLElement> = {};
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly papers: Paper[] = [];
  private readonly sparks: { a: number; v: number; s: number; c: string }[] = [];
  private readonly still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private t = 0;
  private last = 0;
  private raf = 0;
  private scale = 1;
  private released = false;
  /** When the hand-over began, on the clock; null until then. */
  private leaving: number | null = null;
  private fired = new Set<string>();
  private closed = false;

  constructor(private readonly host: HTMLElement, view: VictoryView, private readonly hooks: VictoryHooks) {
    const root = document.createElement('div');
    root.className = `vc is-${view.mode}`;
    root.id = 'victory';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', `Victory. ${view.sub}`);
    root.style.setProperty('--vc-mode', view.colour);
    root.innerHTML = `
      <div class="vc-scrim"></div>
      <div class="vc-stage">
        <div class="vc-bloom is-mode"></div><div class="vc-bloom is-gold"></div>
        <div class="vc-rays"></div>
        <div class="vc-ring is-one"></div><div class="vc-ring is-two"></div>
        <img class="vc-face is-them" alt="" src="${avatarSrc(view.them.avatar)}">
        <img class="vc-face is-you" alt="" src="${avatarSrc(view.you.avatar)}">
        <b class="vc-vs">VS</b>
        ${CROWN.replace('ts-crown', 'vc-crown').replace(/ts-cg/g, 'vc-cg')}
        <div class="vc-title">VICTORY</div>
        <div class="vc-sub">${escape(view.sub)}</div>
        <div class="vc-how">${escape(view.how)}</div>
        <canvas class="vc-paper" width="${W * 2}" height="${H * 2}"></canvas>
        <div class="vc-skip">TAP TO SKIP</div>
      </div>
      <div class="vc-flash"></div>`;
    this.root = root;
    this.stage = root.querySelector('.vc-stage')!;
    for (const [key, sel] of [['scrim', '.vc-scrim'], ['bloomMode', '.vc-bloom.is-mode'], ['bloomGold', '.vc-bloom.is-gold'], ['rays', '.vc-rays'],
      ['ring1', '.vc-ring.is-one'], ['ring2', '.vc-ring.is-two'], ['them', '.vc-face.is-them'], ['you', '.vc-face.is-you'], ['vs', '.vc-vs'],
      ['crown', '.vc-crown'], ['title', '.vc-title'], ['sub', '.vc-sub'], ['how', '.vc-how'], ['skip', '.vc-skip'], ['flash', '.vc-flash']]) {
      this.el[key] = root.querySelector<HTMLElement>(sel)!;
    }
    this.ctx = root.querySelector<HTMLCanvasElement>('.vc-paper')!.getContext('2d');
    this.ctx?.scale(2, 2);

    let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (const side of [-1, 1]) for (let i = 0; i < 40; i++) {
      const off = (6 + rnd() * 26) * Math.PI / 180, v = 1900 + rnd() * 850;
      this.papers.push({ t0: 1.5 + rnd() * .12, x0: side < 0 ? -10 : W + 10, vx: Math.sin(off) * v * -side, vy: -Math.cos(off) * v,
        w: 7 + rnd() * 6, h: 4 + rnd() * 4, c: PAPER[Math.floor(rnd() * PAPER.length)], r0: rnd() * 6, spin: (rnd() - .5) * 16, flip: 6 + rnd() * 10 });
    }
    for (let i = 0; i < 20; i++) this.sparks.push({ a: i / 20 * Math.PI * 2 + rnd() * .25, v: 150 + rnd() * 170, s: 2 + rnd() * 3, c: i % 3 ? '#ffe1a3' : '#ffffff' });

    root.addEventListener('pointerdown', this.skip);
    addEventListener('keydown', this.key);
    addEventListener('resize', this.fit);
    host.append(root);
    this.fit();
    this.render(this.still ? HOLD : 0);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  get open() { return !this.closed; }

  /** The result is up underneath: the victory may hand over once its lockup is in. */
  release() { this.released = true; }

  /** On to the lockup, or to the hand-over once the result is there, as a tap does. */
  skip = () => {
    if (this.still || this.leaving !== null) return;
    this.t = Math.max(this.t, this.released ? HOLD : 2.3);
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
      this.render(HOLD, this.leaving !== null ? prog(this.t, this.leaving, this.leaving + .2) : 0);
      if (this.leaving !== null && this.t >= this.leaving + .2) return this.close();
    } else {
      if (this.t >= HOLD && this.leaving === null) {
        if (this.released) this.leaving = this.t;
      }
      const exit = this.leaving !== null ? prog(this.t, this.leaving, this.leaving + EXIT) : 0;
      // Held on the lockup while the result is still on its way: the rays turn and the foil glints, nothing else moves.
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
    const e = this.el;
    const tf = (el: HTMLElement, x: number, y: number, s = 1, r = 0) => { el.style.transform = `translate(${x}px,${y}px) rotate(${r}deg) scale(${s})`; };
    const show = (el: HTMLElement, o: number) => { el.style.opacity = String(o); el.style.visibility = o <= .001 ? 'hidden' : 'visible'; };
    const out = 1 - inCubic(exit);

    show(e.scrim, .9 * outCubic(prog(t, 0, .3)) * (1 - inOutCubic(exit)));
    show(e.bloomMode, outCubic(prog(t, 0, .4)) * (1 - .5 * prog(t, 1.4, 1.9)) * out);
    show(e.bloomGold, outCubic(prog(t, 1.35, 1.8)) * out);
    show(e.flash, t > .82 ? .5 * (1 - outCubic(prog(t, .82, 1.05))) : 0);
    const shake = t > .82 && t < 1.0 ? Math.sin((t - .82) * 120) * 9 * (1 - (t - .82) / .18) : 0;
    this.stage.style.translate = `${shake}px 0`;

    // In from either side, a wind-up, the clash.
    const inP = outBack(prog(t, .1, .55), 1.3), wind = inOutCubic(prog(t, .55, .72)), rush = inCubic(prog(t, .72, .82));
    const gap = 81 + 14 * wind - 41 * rush;
    const d0 = 120;
    // Theirs, after the clash: knocked back and down, turning, gone grey.
    const fall = prog(t, .82, 1.7);
    const tx = CX + lerp(W / 2 + 120, gap, inP) + 230 * outCubic(fall);
    const ty = FACE_Y - 120 * fall + 520 * fall * fall;
    e.them.style.width = e.them.style.height = `${d0}px`;
    tf(e.them, tx - d0 / 2, ty - d0 / 2, 1 - .25 * fall, 75 * fall);
    e.them.style.filter = fall > 0 ? `grayscale(${clamp(fall * 3)}) brightness(${1 - .4 * fall})` : '';
    show(e.them, prog(t, .1, .2) * (1 - prog(t, 1.1, 1.6)));
    // Yours: held at the clash a moment, then lifted to the middle and grown.
    const lift = inOutCubic(prog(t, .95, 1.45)), settle = spring(prog(t, 1.25, 1.7), 15, .35);
    const recoil = t > .82 ? 10 * Math.sin(Math.PI * prog(t, .82, 1.0)) : 0;
    const yx = lerp(CX - lerp(W / 2 + 120, gap, inP) - recoil, CX, lift);
    const yy = lerp(FACE_Y, 290, lift);
    const yd = lerp(d0, 168, lift) * (1 + .05 * (1 - settle) * (lift >= 1 ? 1 : 0));
    e.you.style.width = e.you.style.height = `${yd}px`;
    tf(e.you, yx - yd / 2, yy - yd / 2, 1 - .2 * inCubic(exit));
    show(e.you, prog(t, .1, .2) * out);
    const vp = prog(t, .4, .6);
    tf(e.vs, CX - 26, FACE_Y - 26, outBack(vp, 2.2) * (1 - .4 * prog(t, .82, .95)));
    show(e.vs, clamp(vp * 4) * (1 - prog(t, .82, .95)));

    ([[e.ring1, 1.4, 170], [e.ring2, 1.52, 125]] as const).forEach(([el, t0, r]) => {
      const p = prog(t, t0, t0 + .6);
      tf(el, CX - r, 290 - r, .25 + 1.05 * outCubic(p));
      show(el, p > 0 && p < 1 ? .9 * (1 - p) : 0);
    });
    const rp = outCubic(prog(t, 1.35, 1.9));
    tf(e.rays, CX - 320, 290 - 320, .3 + .7 * rp, t * 14);
    show(e.rays, .85 * rp * out);

    const cw = 168 * .66, ch = cw * .6, crownP = prog(t, 1.3, 1.8);
    const cy = 290 - 84 - ch * .72 - 320 * (1 - spring(crownP, 15, .3));
    e.crown.style.width = `${cw}px`; e.crown.style.height = `${ch}px`;
    tf(e.crown, CX - cw / 2, cy, 1 - .2 * inCubic(exit), -14 * (1 - spring(crownP, 12, .3)));
    show(e.crown, crownP > 0 ? out : 0);

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
    show(e.skip, t > .2 && t < HOLD - .1 && !this.still ? .8 : 0);

    this.once('in', .1, t, () => buzz(10));
    this.once('clash', .82, t, () => { buzz(70); this.hooks.cheer(); });
    this.once('crown', 1.62, t, () => buzz([14, 70, 14]));
    this.drawPaper(t, out);
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
