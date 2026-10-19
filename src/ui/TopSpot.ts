import { avatarSrc } from '../config/board';
import { buzz } from '../game/haptics';
import type { TopSpotView } from '../game/top-spot';
import { escape } from './Leaderboard';

/**
 * New #1 (Figma section 15): what plays over the end card when an innings
 * takes the top of a board, and then hands back to the card.
 *
 * Four acts on one clock — gather, the climb and the takeover, crowned, the
 * lockup — and the #1 flying down into the card's own place figure. Every
 * frame is drawn from the clock alone (`render`), so a tap that skips ahead
 * is a jump, and reduced motion is the lockup standing still for a moment.
 * The stage is the 402-wide phone it was drawn on, scaled to the screen.
 */

export interface TopSpotHooks {
  /** The end card under it, which steps back and comes forward again. */
  card(): HTMLElement | null;
  /** The card's place figure, which the #1 flies into. */
  target(): HTMLElement | null;
  /** The crowd at the takeover. */
  cheer(): void;
  done(): void;
}

const END = 4.8;
const EXIT = 4.0;
const SLOT0 = 240, SLOT_GAP = 72;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const outCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const inCubic = (p: number) => p * p * p;
const inOutCubic = (p: number) => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
const outBack = (p: number, s = 1.70158) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2);
/** A damped spring from 0 to 1: how a landing settles. */
const spring = (p: number, k = 14, z = .32) => p <= 0 ? 0 : 1 - Math.exp(-z * k * p) * Math.cos(k * Math.sqrt(1 - z * z) * p);

const CROWN = `<svg class="ts-crown" viewBox="0 0 120 72" aria-hidden="true">
  <defs><linearGradient id="ts-cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9b0"/><stop offset=".55" stop-color="#f5b83d"/><stop offset="1" stop-color="#b8740f"/></linearGradient></defs>
  <path d="M8 64 L4 16 L34 40 L60 6 L86 40 L116 16 L112 64 Z" fill="url(#ts-cg)" stroke="#7a4a0a" stroke-width="3" stroke-linejoin="round"/>
  <rect x="8" y="58" width="104" height="10" rx="4" fill="#c77d16"/>
  <circle cx="60" cy="40" r="7" fill="#ff5a4e"/><circle cx="32" cy="48" r="5" fill="#4fa3ff"/><circle cx="88" cy="48" r="5" fill="#5bd08f"/></svg>`;
const GLINT = '<svg class="ts-glint" viewBox="-15 -15 30 30" aria-hidden="true"><path d="M0-15 2.5-2.5 15 0 2.5 2.5 0 15-2.5 2.5-15 0-2.5-2.5Z" fill="#fff"/></svg>';
const PAPER = ['#f5b83d', '#ed7044', '#ffb08f', '#ffffff', '#4fa3ff', '#5bd08f', '#ffe1a3'];

interface Paper { t0: number; x0: number; vx: number; vy: number; w: number; h: number; c: string; r0: number; spin: number; flip: number }

export class TopSpot {
  private readonly root: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly el: Record<string, HTMLElement> = {};
  private readonly rows: HTMLElement[];
  private readonly mine: HTMLElement;
  private readonly papers: Paper[] = [];
  private readonly sparks: { a: number; v: number; c: string; s: number }[] = [];
  private readonly dust: { x: number; y: number; v: number; s: number; ph: number; g: boolean }[] = [];
  private readonly paperCtx: CanvasRenderingContext2D | null;
  private readonly dustCtx: CanvasRenderingContext2D | null;
  private readonly passAt: number[];
  private readonly youFrom: number;
  private readonly still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private t = 0;
  private last = 0;
  private raf = 0;
  private scale = 1;
  private fired = new Set<string>();
  private closed = false;

  constructor(private readonly host: HTMLElement, private readonly view: TopSpotView, private readonly hooks: TopSpotHooks) {
    const root = document.createElement('div');
    root.className = 'ts';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', `New number one: ${view.top.toLowerCase()}. ${view.sub}`);
    root.style.setProperty('--ts-mode', view.colour);
    const n = view.above.length;
    const rowMarkup = (cls: string, place: string, avatar: number, name: string, label: string) =>
      `<div class="ts-row ${cls}"><span class="ts-p">${place}</span><img alt="" src="${avatarSrc(avatar)}"><span class="ts-n">${escape(name)}</span><span class="ts-r">${escape(label)}</span></div>`;
    const from = view.you.from;
    root.innerHTML = `
      <div class="ts-scrim"></div>
      <div class="ts-stage">
        <div class="ts-bloom is-mode"></div><div class="ts-bloom is-gold"></div>
        <div class="ts-rays"></div><div class="ts-spot is-left"></div><div class="ts-spot is-right"></div>
        <canvas class="ts-dust" width="804" height="1748"></canvas>
        <div class="ts-ladder">
          <div class="ts-head">${escape(view.head)}</div>
          ${view.above.map((row, i) => rowMarkup(i === 0 ? 'is-top' : '', `#${i + 1}`, row.avatar, row.name, row.label)).join('')}
          ${from !== null && from > n + 1 ? `<div class="ts-gap" style="top:${SLOT0 + SLOT_GAP * n - 2}px">· · ·</div>` : ''}
          ${rowMarkup('is-you', from === null ? 'NEW' : `#${from}`, view.you.avatar, 'You', view.you.label)}
        </div>
        <div class="ts-streaks">${[70, 130, 210, 290, 340].map(x => `<i style="left:${x}px"></i>`).join('')}</div>
        <div class="ts-ring is-one"></div><div class="ts-ring is-two"></div>
        <div class="ts-slam">#1</div>
        <div class="ts-chip">${escape(view.clear)}</div>
        <div class="ts-podium">
          <i class="ts-beam is-2"></i><i class="ts-beam is-1"></i><i class="ts-beam is-3"></i>
          ${view.second ? `<img class="ts-pf is-2" alt="" src="${avatarSrc(view.second.avatar)}"><p class="ts-pn is-2">${escape(view.second.name)}<b>${escape(view.second.label)}</b></p><b class="ts-num is-2">2</b>` : ''}
          <img class="ts-pf is-1" alt="" src="${avatarSrc(view.you.avatar)}"><p class="ts-pn is-1">You<b>${escape(view.you.label)}</b></p><b class="ts-num is-1">1</b>
          ${view.third ? `<img class="ts-pf is-3" alt="" src="${avatarSrc(view.third.avatar)}"><p class="ts-pn is-3">${escape(view.third.name)}<b>${escape(view.third.label)}</b></p><b class="ts-num is-3">3</b>` : ''}
        </div>
        <img class="ts-hero" alt="" src="${avatarSrc(view.you.avatar)}">
        ${CROWN}${GLINT}
        <div class="ts-foil">#1</div>
        <div class="ts-top">${escape(view.top)}</div>
        <div class="ts-sub">${escape(view.sub)}</div>
        <canvas class="ts-paper" width="804" height="1748"></canvas>
        <div class="ts-skip">TAP TO SKIP</div>
      </div>
      <div class="ts-flash"></div>`;
    this.root = root;
    this.stage = root.querySelector('.ts-stage')!;
    const pick = (key: string, sel: string) => { this.el[key] = root.querySelector<HTMLElement>(sel)!; };
    [['scrim', '.ts-scrim'], ['bloomMode', '.ts-bloom.is-mode'], ['bloomGold', '.ts-bloom.is-gold'], ['rays', '.ts-rays'], ['spotL', '.ts-spot.is-left'],
      ['spotR', '.ts-spot.is-right'], ['ladder', '.ts-ladder'], ['head', '.ts-head'], ['ring1', '.ts-ring.is-one'], ['ring2', '.ts-ring.is-two'], ['slam', '.ts-slam'],
      ['chip', '.ts-chip'], ['podium', '.ts-podium'], ['hero', '.ts-hero'], ['crown', '.ts-crown'], ['glint', '.ts-glint'], ['foil', '.ts-foil'],
      ['top', '.ts-top'], ['sub', '.ts-sub'], ['skip', '.ts-skip'], ['flash', '.ts-flash'], ['gap', '.ts-gap']].forEach(([k, s]) => pick(k, s));
    this.rows = [...root.querySelectorAll<HTMLElement>('.ts-row:not(.is-you)')];
    this.mine = root.querySelector<HTMLElement>('.ts-row.is-you')!;
    this.paperCtx = root.querySelector<HTMLCanvasElement>('.ts-paper')!.getContext('2d');
    this.dustCtx = root.querySelector<HTMLCanvasElement>('.ts-dust')!.getContext('2d');
    this.paperCtx?.scale(2, 2); this.dustCtx?.scale(2, 2);

    // Where the player's row starts: under the rows it is about to go past, or below a gap.
    this.youFrom = SLOT0 + SLOT_GAP * n + (from !== null && from > n + 1 ? 32 : 0);
    this.passAt = this.rows.map((_, i) => { for (let t = .7; t < 1.3; t += .002) if (this.youY(t) <= SLOT0 + SLOT_GAP * i + 6) return t; return 1.2; });

    // Paper from both bottom corners, mostly up and leaning in; a burst out of #1; dust.
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (const side of [-1, 1]) for (let i = 0; i < 38; i++) {
      const off = (6 + rnd() * 24) * Math.PI / 180, v = 1900 + rnd() * 800;
      this.papers.push({ t0: 1.85 + rnd() * .1, x0: side < 0 ? -10 : 412, vx: Math.sin(off) * v * -side, vy: -Math.cos(off) * v,
        w: 7 + rnd() * 6, h: 4 + rnd() * 4, c: PAPER[Math.floor(rnd() * PAPER.length)], r0: rnd() * 6, spin: (rnd() - .5) * 16, flip: 6 + rnd() * 10 });
    }
    for (let i = 0; i < 22; i++) this.sparks.push({ a: i / 22 * Math.PI * 2 + rnd() * .2, v: 260 + rnd() * 240, c: i % 3 ? '#ffe1a3' : '#ffffff', s: 2 + rnd() * 3 });
    for (let i = 0; i < 60; i++) this.dust.push({ x: rnd() * 402, y: rnd() * 874, v: 22 + rnd() * 40, s: 1 + rnd() * 2.6, ph: rnd() * 6.28, g: rnd() < .7 });

    root.addEventListener('pointerdown', this.skip);
    addEventListener('keydown', this.key);
    addEventListener('resize', this.fit);
    host.append(root);
    this.fit();
    const target = hooks.target();
    if (target) target.style.visibility = 'hidden';
    this.render(0);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Jumps on to the way into the end card, as a tap anywhere does. */
  skip = () => { if (!this.still && this.t < EXIT) this.t = EXIT; };
  private key = (event: KeyboardEvent) => { if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') this.skip(); };

  private fit = () => {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.scale = Math.min(w / 402, h / 874);
    this.stage.style.transform = `translate(${(w - 402 * this.scale) / 2}px,${(h - 874 * this.scale) / 2}px) scale(${this.scale})`;
  };

  private frame = (now: number) => {
    if (this.closed) return;
    const dt = Math.min(.05, (now - this.last) / 1000);
    this.last = now;
    if (this.still) {
      // Still: the lockup stands for a moment and then the end card is back.
      this.t += dt;
      this.render(this.t < 1.5 ? 3.3 : END);
      if (this.t >= 1.5) return this.close();
    } else {
      this.t = Math.min(END, this.t + dt);
      this.render(this.t);
      if (this.t >= END) return this.close();
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  close() {
    if (this.closed) return;
    this.closed = true;
    cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this.key);
    removeEventListener('resize', this.fit);
    const card = this.hooks.card();
    if (card) { card.style.transform = ''; card.style.filter = ''; }
    const target = this.hooks.target();
    if (target) target.style.visibility = '';
    this.root.remove();
    this.hooks.done();
  }

  /** Your row's climb: the launch, then the top. */
  private youY(t: number) {
    if (t < .7) return this.youFrom;
    if (t < 1.15) return lerp(this.youFrom, SLOT0 - 8, inOutCubic(prog(t, .7, 1.15)));
    return lerp(SLOT0 - 8, SLOT0, spring(prog(t, 1.15, 1.6), 16, .35));
  }

  private once(key: string, at: number, t: number, then: () => void) {
    if (t >= at && !this.fired.has(key)) { this.fired.add(key); then(); }
  }

  private render(t: number) {
    const e = this.el;
    const tf = (el: HTMLElement | undefined, x: number, y: number, s = 1, r = 0, sx = s, sy = s) => { if (el) el.style.transform = `translate(${x}px,${y}px) rotate(${r}deg) scale(${sx},${sy})`; };
    const show = (el: HTMLElement | undefined, o: number) => { if (el) { el.style.opacity = String(o); el.style.visibility = o <= .001 ? 'hidden' : 'visible'; } };
    const exit = prog(t, EXIT, EXIT + .5), out = 1 - inCubic(prog(t, EXIT, EXIT + .3));

    // The end card steps back and dims, then comes forward again.
    const back = outCubic(prog(t, 0, .35)) * (1 - inOutCubic(exit));
    const card = this.hooks.card();
    if (card) { card.style.transform = back > .001 ? `scale(${1 - .06 * back})` : ''; card.style.filter = back > .01 ? `blur(${6 * back}px)` : ''; }
    show(e.scrim, .8 * back);
    show(e.bloomMode, outCubic(prog(t, 0, .4)) * out);
    show(e.bloomGold, prog(t, 1.18, 1.3) * (t < 1.6 ? 1 : .75) * out);

    // The ladder: the rows rise in, yours winds up and goes past them.
    const recede = inOutCubic(prog(t, 1.5, 1.9));
    const shake = t > 1.2 && t < 1.34 ? Math.sin((t - 1.2) * 110) * 7 * (1 - (t - 1.2) / .14) : 0;
    e.ladder.style.transform = `translate(${shake}px,0) scale(${1 - .1 * recede})`;
    show(e.ladder, 1 - recede);
    show(e.head, prog(t, .1, .3));
    show(e.gap, outCubic(prog(t, .4, .6)) * (1 - prog(t, .72, .8)));
    this.rows.forEach((row, i) => {
      const t0 = .15 + i * .06, inP = outCubic(prog(t, t0, t0 + .25));
      const knocked = prog(t, this.passAt[i], this.passAt[i] + .2);
      const top = i === 0;
      const y = SLOT0 + SLOT_GAP * i + SLOT_GAP * outBack(knocked, 2.2) + 40 * (1 - inP);
      const tilt = top ? -6 * outBack(knocked) : (i % 2 ? -2 : 2) * Math.sin(Math.PI * knocked);
      tf(row, 0, y, 1, tilt);
      show(row, inP * (top && knocked > 0 ? lerp(1, .55, knocked) : 1));
      row.classList.toggle('is-top', top && knocked < .3);
      row.querySelector('.ts-p')!.textContent = `#${i + 1 + (knocked > .3 ? 1 : 0)}`;
    });
    {
      const inP = outCubic(prog(t, .15 + this.rows.length * .06, .4 + this.rows.length * .06));
      const wind = prog(t, .55, .64) * (1 - prog(t, .66, .72));
      const hit = t > 1.15 ? 1 - spring(prog(t, 1.15, 1.6), 16, .35) : 0;
      const sy = 1 - .06 * wind - .08 * Math.max(0, hit), sx = 1 + .02 * wind + .08 * Math.max(0, hit);
      tf(this.mine, 0, this.youY(t) + 40 * (1 - inP), t > .7 && t < 1.15 ? 1.04 : 1, 0, sx, sy);
      show(this.mine, inP * (t < 1.5 ? 1 : 0));
      const passed = this.passAt.filter(at => t >= at).length;
      const placeNow = passed ? this.rows.length + 1 - passed : null;
      this.mine.querySelector('.ts-p')!.textContent = placeNow ? `#${placeNow}` : this.view.you.from === null ? 'NEW' : `#${this.view.you.from}`;
      const atTop = passed === this.rows.length && t >= 1.15;
      this.mine.classList.toggle('is-top', atTop);
      this.mine.classList.toggle('is-you', !atTop);
    }
    this.stage.querySelectorAll<HTMLElement>('.ts-streaks i').forEach((s, i) => {
      const p = prog(t, .74 + i * .03, 1.18);
      tf(s, 0, this.youY(t) + 62);
      show(s, (.5 - i * .04) * Math.sin(Math.PI * p));
    });

    // The takeover: rings, the slam, the flash, the chip, the crowd and the hand.
    ([[e.ring1, 1.2, 210], [e.ring2, 1.3, 150]] as const).forEach(([el, t0, r]) => {
      const p = prog(t, t0, t0 + .6);
      tf(el, 201 - r, SLOT0 + 31 - r, .2 + 1.1 * outCubic(p));
      show(el, p > 0 && p < 1 ? .9 * (1 - p) : 0);
    });
    const sp = prog(t, 1.2, 1.42), sOut = prog(t, 1.55, 1.75);
    tf(e.slam, 0, 520 - 30 * sOut, lerp(2.4, 1, outBack(sp, 2.2)));
    show(e.slam, clamp(sp * 5) * (1 - sOut));
    show(e.flash, t > 1.21 ? .14 * (1 - outCubic(prog(t, 1.21, 1.4))) : 0);
    const cp = prog(t, 1.3, 1.5);
    e.chip.style.transform = `scale(${outBack(cp, 2.4)})`;
    show(e.chip, cp > 0 ? 1 - recede : 0);
    this.once('climb', .7, t, () => buzz([8, 50, 10, 45, 14, 40, 18, 35, 24]));
    this.once('take', 1.2, t, () => { buzz(70); this.hooks.cheer(); });
    this.once('crown', 1.95, t, () => buzz([14, 70, 14]));

    // Crowned: the face out of the row, the crown, the rays, the spotlights.
    const lift = inOutCubic(prog(t, 1.5, 1.9)), lock = inOutCubic(prog(t, 2.3, 2.7));
    const fromY = SLOT0 + 31;
    const fx = lerp(97, 201, lift), fy = lerp(fromY, lerp(300, 236, lock), lift), fd = lerp(38, lerp(170, 140, lock), lift);
    const heroScale = 1 - .4 * inCubic(prog(t, EXIT, EXIT + .3));
    e.hero.style.width = e.hero.style.height = `${fd}px`;
    tf(e.hero, fx - fd / 2, fy - fd / 2, heroScale);
    show(e.hero, t >= 1.5 ? out : 0);
    const cw = fd * .72, ch = cw * .6, crownP = prog(t, 1.8, 2.3);
    const cy = fy - fd / 2 - ch * .72 - 300 * (1 - spring(crownP, 15, .3));
    e.crown.style.width = `${cw}px`; e.crown.style.height = `${ch}px`;
    tf(e.crown, fx - cw / 2, cy, heroScale, -14 * (1 - spring(crownP, 12, .3)));
    show(e.crown, crownP > 0 ? out : 0);
    const glintP = Math.max(prog(t, 2.2, 2.5), prog(t, 3.4, 3.7)), gs = Math.sin(Math.PI * glintP);
    tf(e.glint, fx + cw * .28 - 15, cy - 6, gs, 45 * glintP);
    show(e.glint, gs * out);
    const rp = outCubic(prog(t, 1.7, 2.2));
    tf(e.rays, fx - 320, fy - 320, .3 + .7 * rp, t * 14);
    show(e.rays, .85 * rp * out);
    const spP = outCubic(prog(t, 1.75, 2.35));
    tf(e.spotL, -40, -40, 1, lerp(-58, -26, spP)); tf(e.spotR, 242, -40, 1, lerp(58, 26, spP));
    show(e.spotL, .5 * spP * out); show(e.spotR, .5 * spP * out);

    // The lockup, and #1 flying into the card's place figure.
    const fp = prog(t, 2.4, 2.75);
    let x = 0, y = 312, s = lerp(.5, 1, outBack(fp, 2.2));
    const target = this.hooks.target();
    if (t >= EXIT && target) {
      const p = inOutCubic(prog(t, EXIT, EXIT + .5));
      const box = target.getBoundingClientRect(), stage = this.stage.getBoundingClientRect();
      const to = [(box.left + box.width / 2 - stage.left) / this.scale, (box.top + box.height / 2 - stage.top) / this.scale];
      const fromC = [201, 387], ctl = [96, 300];
      const bx = (1 - p) ** 2 * fromC[0] + 2 * (1 - p) * p * ctl[0] + p * p * to[0];
      const by = (1 - p) ** 2 * fromC[1] + 2 * (1 - p) * p * ctl[1] + p * p * to[1];
      x = bx - 201; y = by - 75; s = lerp(1, Math.max(.2, box.height / this.scale / 130), p);
    }
    tf(e.foil, x, y, s);
    show(e.foil, fp > 0 && t < EXIT + .5 ? clamp(fp * 3) * (target || t < EXIT ? 1 : out) : 0);
    const sh = t > 2.7 ? ((t - 2.7) % 1.2) / .5 : 2;
    e.foil.style.backgroundPosition = `${lerp(160, -60, clamp(sh))}% 0, 0 0`;
    if (target && t >= EXIT + .5 && target.style.visibility === 'hidden') {
      target.style.visibility = '';
      target.classList.remove('is-landed'); void target.offsetWidth; target.classList.add('is-landed');
    }
    const tp = outCubic(prog(t, 2.55, 3.0));
    e.top.style.letterSpacing = `${lerp(-.04, .16, tp)}em`;
    tf(e.top, 0, 476);
    show(e.top, tp * out);
    const sb = outCubic(prog(t, 2.75, 3.1));
    tf(e.sub, 0, 516 + 14 * (1 - sb));
    show(e.sub, sb * out);
    const pp = outCubic(prog(t, 2.6, 3.1));
    tf(e.podium, 0, 600 + 160 * (1 - pp));
    show(e.podium, pp * out);
    this.stage.querySelectorAll<HTMLElement>('.ts-pf.is-2, .ts-pf.is-3').forEach((img, i) => { img.style.transform = `scale(${outBack(prog(t, 2.85 + i * .1, 3.1 + i * .1), 2.2)})`; });

    this.drawPaper(t, out);
    this.drawDust(t, prog(t, 2.3, 2.8) * out);
    show(e.skip, t > .2 && t < EXIT - .1 && !this.still ? .8 : 0);
  }

  /** Closed-form flights: paper with drag and gravity, turning over as it goes. */
  private drawPaper(t: number, fade: number) {
    const ctx = this.paperCtx;
    if (!ctx) return;
    ctx.clearRect(0, 0, 402, 874);
    if (fade <= 0) return;
    const K = 1.7, G = 1500;
    for (const p of this.papers) {
      const s = t - p.t0;
      if (s <= 0) continue;
      const e = 1 - Math.exp(-K * s);
      const x = p.x0 + p.vx / K * e, y = 884 + (p.vy + G / K) / K * e - G / K * s;
      if (y > 900) continue;
      ctx.save();
      ctx.globalAlpha = fade * clamp(1 - (s - 2.2) / .6);
      ctx.translate(x, y); ctx.rotate(p.r0 + p.spin * s); ctx.scale(Math.cos(p.flip * s), 1);
      ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    const bs = t - 2.45;
    if (bs > 0 && bs < .7) for (const k of this.sparks) {
      const d = k.v * outCubic(clamp(bs / .7));
      ctx.globalAlpha = fade * (1 - bs / .7); ctx.fillStyle = k.c;
      ctx.beginPath(); ctx.arc(201 + Math.cos(k.a) * d, 382 + Math.sin(k.a) * d * .8, k.s, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawDust(t: number, o: number) {
    const ctx = this.dustCtx;
    if (!ctx) return;
    ctx.clearRect(0, 0, 402, 874);
    if (o <= 0) return;
    for (const d of this.dust) {
      ctx.globalAlpha = o * (.35 + .45 * (.5 + .5 * Math.sin(t * 4 + d.ph)));
      ctx.fillStyle = d.g ? '#f5b83d' : '#ffe1a3';
      ctx.beginPath(); ctx.arc(d.x + Math.sin(t * 1.3 + d.ph) * 8, (d.y + d.v * t) % 900 - 10, d.s, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
