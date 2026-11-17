/**
 * Super Knockout's two moments at the end of the player's match: KNOCKED OUT
 * and WINNER. Each ends exactly on its Figma frame — "Super Knockout · Final",
 * F3: K9 v2 · Knocked out · the end frame (`858:6160`) and K11 · Last one
 * standing (`858:6267`) — every place, size and colour below is read off those
 * frames, in the 402 by 874 they were drawn on. The way there is the game's
 * motion language (the claude.ai artifact "Knockout Moments"): every frame
 * from one clock on that stage fitted to the screen, so any moment can be
 * drawn on its own, a tap skips to the last of it, and reduced motion is that
 * last frame standing still.
 *
 * Knocked out is DEFEAT's sting: the standings with the player dropping
 * through the cut line, the lights going out on their match, their face alone
 * under the one light left, flattened and cracked, their place stamped on it,
 * KNOCKED OUT falling in with the last T toppled flat. Winner is VICTORY: the
 * last two clash, the crown drops and hops, rings, turning rays, WINNER
 * slammed in, paper from both bottom corners.
 */
import crownUrl from '../assets/knockout/crown.svg';
import grainUrl from '../assets/entry/grain.webp';
import { avatarSrc } from '../config/board';
import { buzz } from '../game/haptics';
import { cta } from './Kit';

export interface MomentRow { place: number; name: string; runs: number; face: number; you: boolean; out: boolean; sub: boolean }
export interface MomentView {
  won: boolean;
  place: number;
  of: number;
  you: { name: string; face: number; runs: number; balls: number; sixes: number };
  /** What happened, in one line under the title. */
  line: string;
  /** Under WINNER's line: the innings in figures. */
  figures: string;
  /** Over the standings: END OF OVER 3, or SUDDEN DEATH. */
  heading: string;
  /** A few rows round the player's, and how many of them stand above the line. */
  rows: MomentRow[];
  above: number;
  /** The one who finished second, for WINNER's clash. */
  other: { name: string; face: number; runs: number } | null;
  /** WINNER's pill: points, or why there are none. */
  points: string;
}

const W = 402, H = 874, CX = 201;
/** Where the clash happens, and where the winner's face stands at the end (K11: 150 round at 126, 186). */
const CLASH_Y = 330, WIN = { x: 201, y: 261, d: 150 };
/** K11's crown: 87.4 by 50.5, turned 8° to the left, its middle at 197.9, 155.4. */
const CROWN = { dx: -3.1, dy: -105.6, w: 87.4, h: 50.5, turn: -8 };
/** K9 v2's face, flattened: 132 by 124 at 135, 340. */
const LOST = { x: 201, y: 402, w: 132, h: 124 };
const C = { red: '#EE2A2A', gold: '#FFB020', ink: '#0C0809', cream: '#F5EFE6', dark: '#050404' };
const PAPER = ['#ffb020', '#ee2a2a', '#ffffff'];

/* The game's motion helpers, as `MatchEnd.ts` has them. */
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const outCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const inCubic = (p: number) => p * p * p;
const inOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const outBack = (p: number, s = 1.70158) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2);
const rad = (d: number) => d * Math.PI / 180;
function rng(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/** 1ST, 2ND, 3RD, 4TH … 11TH, 12TH. */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH'}`;
}

type Ctx = CanvasRenderingContext2D;
function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, h / 2, w / 2);
  c.beginPath(); c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
/**
 * Where to put a line's baseline so it sits in its Figma text box: a box `h`
 * high from `top`, the font's own ascent and descent centred in it, as
 * Figma's auto line height lays it.
 */
function baselineIn(c: Ctx, font: string, top: number, h: number) {
  c.font = font;
  const m = c.measureText('Hg');
  const asc = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent, desc = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
  return top + (h - (asc + desc)) / 2 + asc;
}
/** Text centred on `x` in a Figma box; `depth` is an extrusion, Figma's stacked hard shadows. */
function boxText(c: Ctx, s: string, x: number, top: number, h: number, font: string, fill: string, o: { depth?: string; steps?: number; dx?: number; dy?: number; tracking?: number } = {}) {
  const y = baselineIn(c, font, top, h);
  c.textBaseline = 'alphabetic'; c.textAlign = 'center';
  const draw = (dx: number, dy: number) => {
    if (!o.tracking) { c.fillText(s, x + dx, y + dy); return; }
    const chars = [...s], ws = chars.map(ch => c.measureText(ch).width);
    let at = x - (ws.reduce((a, b) => a + b, 0) + o.tracking * (chars.length - 1)) / 2;
    c.textAlign = 'left';
    chars.forEach((ch, i) => { c.fillText(ch, at + dx, y + dy); at += ws[i] + o.tracking!; });
    c.textAlign = 'center';
  };
  if (o.depth) { c.fillStyle = o.depth; for (let k = o.steps ?? 1; k >= 1; k--) draw((o.dx ?? 0) * k, (o.dy ?? 0) * k); }
  c.fillStyle = fill; draw(0, 0);
}
function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16), f = (v: number) => Math.round(v * k);
  return `rgb(${f(n >> 16 & 255)},${f(n >> 8 & 255)},${f(n & 255)})`;
}
const load = (src: string) => new Promise<HTMLImageElement | null>(done => { const i = new Image(); i.onload = () => done(i); i.onerror = () => done(null); i.src = src; });
function greyOf(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = c.height = 160;
  const x = c.getContext('2d')!; x.drawImage(img, 0, 0, 160, 160);
  try {
    const d = x.getImageData(0, 0, 160, 160), p = d.data;
    for (let i = 0; i < p.length; i += 4) { const l = p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11; p[i] = p[i + 1] = p[i + 2] = l; }
    x.putImageData(d, 0, 0);
  } catch { x.globalCompositeOperation = 'saturation'; x.fillStyle = '#888'; x.fillRect(0, 0, 160, 160); }
  return c;
}

/** The moments' clocks: when the keys come up, where a tap skips to, and when nothing moves any more. */
const TIMES = { lost: { keys: 3.3, lock: 3.5, end: 4.4 }, won: { keys: 2.6, lock: 3.0, end: 6.0 } } as const;

export class KnockoutMoment {
  /** `__cricket.knockoutAt(t)`: holds the clock at `t` seconds, for the checks to photograph a beat. */
  static pinned: number | null = null;
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: Ctx;
  private faces = new Map<number, HTMLImageElement | null>();
  private greys = new Map<number, HTMLCanvasElement>();
  private crown: HTMLImageElement | null = null;
  private grain: CanvasPattern | null = null;
  private t = 0;
  private from = 0;
  private frame = 0;
  private ready = false;
  private buzzed = new Set<number>();
  private readonly still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly times;
  private readonly waves;

  constructor(host: HTMLElement, private readonly view: MomentView, keys: { again(): void; card(): void }) {
    this.times = view.won ? TIMES.won : TIMES.lost;
    this.root = document.createElement('div');
    this.root.className = `ko-moment ${view.won ? 'is-won' : 'is-lost'}`;
    this.root.id = 'ko-moment';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', view.won ? 'Winner' : `Knocked out, ${ordinal(view.place).toLowerCase()} of ${view.of}`);
    this.root.innerHTML = `<canvas class="ko-moment-stage" aria-hidden="true"></canvas>
      <p class="ko-moment-said">${view.won ? 'Winner.' : `Knocked out. ${ordinal(view.place)} of ${view.of}.`} ${view.line}</p>
      <div class="ko-moment-keys">${cta({ kind: 'secondary', label: 'SCORECARD', id: 'ko-card' })}${cta({ kind: 'primary', label: 'PLAY AGAIN', id: 'ko-again', moving: true })}</div>`;
    host.append(this.root);
    // The card waits underneath, out of sight: what shows through the dark is the match.
    document.body.classList.add('ko-up');
    this.canvas = this.root.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.root.querySelector<HTMLButtonElement>('#ko-again')!.onclick = event => { event.stopPropagation(); this.close(); keys.again(); };
    this.root.querySelector<HTMLButtonElement>('#ko-card')!.onclick = event => { event.stopPropagation(); this.close(); keys.card(); };
    // A tap skips to the end, as a tap does over every celebration in the game.
    this.root.onclick = () => { if (this.t < this.times.lock) { this.from -= (this.times.lock - this.t) * 1000; } };
    this.waves = [{ t0: 1.6, bits: paperWave(3, 90) }, { t0: 1.98, bits: paperWave(11, 56) }];
    void this.prepare();
  }

  /** Where the clock is, for the checks. */
  get at() { return this.t; }

  close() {
    cancelAnimationFrame(this.frame);
    this.root.remove();
    document.body.classList.remove('ko-up');
  }

  private async prepare() {
    const wanted = new Set([this.view.you.face, ...this.view.rows.map(r => r.face), ...(this.view.other ? [this.view.other.face] : [])]);
    await Promise.all([...wanted].map(async face => {
      const img = await load(avatarSrc(face));
      this.faces.set(face, img);
      if (img) this.greys.set(face, greyOf(img));
    }));
    this.crown = await load(crownUrl);
    const grain = await load(grainUrl);
    if (grain) this.grain = this.ctx.createPattern(grain, 'repeat');
    try { await Promise.all([document.fonts.load('64px Jaro'), document.fonts.load('900 13px Satoshi'), document.fonts.load('600 15px Satoshi')]); } catch { /* Drawn in the fallback, then. */ }
    this.ready = true;
    this.from = performance.now();
    const tick = (now: number) => {
      this.t = KnockoutMoment.pinned ?? (this.still ? this.times.end : (now - this.from) / 1000);
      this.draw();
      this.root.classList.toggle('keys-up', this.t >= this.times.keys);
      this.root.classList.toggle('lights-out', this.t >= 1.6);
      if (this.t < this.times.end || KnockoutMoment.pinned !== null) this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private draw() {
    if (!this.ready) return;
    const box = this.root.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const w = Math.round(box.width * dpr), h = Math.round(box.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
    // The stage stands centred and as tall as the screen allows, as the Verdict's does.
    const s = Math.min(w / W, h / H);
    c.setTransform(s, 0, 0, s, (w - W * s) / 2, (h - H * s) / 2);
    // The screen's own edges, in the stage's units, for what fills it edge to edge.
    const edge = { x: -(w / s - W) / 2, y: -(h / s - H) / 2, w: w / s, h: h / s };
    if (this.view.won) this.drawWon(c, this.t, edge); else this.drawLost(c, this.t, edge);
  }

  private haptic(at: number, pattern: number | number[]) {
    if (this.still || this.t < at || this.buzzed.has(at)) return;
    this.buzzed.add(at); buzz(pattern);
  }

  private face(c: Ctx, face: number, x: number, y: number, w: number, o: { h?: number; grey?: number; ring?: string | null; ringWidth?: number; alpha?: number; rot?: number; glow?: string; dim?: number } = {}) {
    const h = o.h ?? w, img = this.faces.get(face), grey = this.greys.get(face);
    const ring = o.ring === undefined ? 'rgba(245,239,230,.9)' : o.ring, rw = o.ringWidth ?? Math.max(2, w * 0.03);
    c.save(); c.globalAlpha *= o.alpha ?? 1; c.translate(x, y); if (o.rot) c.rotate(o.rot);
    const oval = (grow: number) => { c.beginPath(); c.ellipse(0, 0, w / 2 + grow, h / 2 + grow, 0, 0, Math.PI * 2); };
    if (o.glow) { c.save(); c.shadowColor = o.glow; c.shadowBlur = 30; oval(0); c.fillStyle = '#1d1517'; c.fill(); c.restore(); }
    // The ring stands outside the face, as Figma's outside stroke does.
    if (ring) { oval(rw / 2); c.lineWidth = rw; c.strokeStyle = ring; c.stroke(); }
    oval(0); c.fillStyle = '#2a1c1e'; c.fill();
    c.save(); c.clip();
    if (img) c.drawImage(img, -w / 2, -h / 2, w, h);
    if (o.grey && grey) { c.globalAlpha *= o.grey; c.drawImage(grey, -w / 2, -h / 2, w, h); }
    if (o.dim) { c.globalAlpha = o.dim; c.fillStyle = '#0a0c10'; c.fillRect(-w / 2, -h / 2, w, h); }
    c.restore();
    c.restore();
  }

  /* ---------- Knocked out: K9 v2 ---------- */
  private drawLost(c: Ctx, t: number, edge: { x: number; y: number; w: number; h: number }) {
    const [sx, sy] = shakeAt(t, [[2.32, 0.2, 7], [2.85, 0.14, 3], [3.3, 0.12, 3]]);
    // The match dims behind the standings, then its lights go out: K9 v2's dark, top to foot.
    const dim = 0.72 * outCubic(prog(t, 0, 0.3));
    const lo = inOutCubic(prog(t, 1.6, 2.05));
    c.fillStyle = `rgba(5,4,4,${dim * (1 - lo)})`; c.fillRect(edge.x, edge.y, edge.w, edge.h);
    if (lo > 0) {
      const g = c.createLinearGradient(0, edge.y, 0, edge.y + edge.h);
      g.addColorStop(0, `rgba(5,4,4,${0.55 + (dim - 0.55) * (1 - lo)})`);
      g.addColorStop(0.35, `rgba(5,4,4,${lerp(dim, 0.88, lo)})`);
      g.addColorStop(1, `rgba(5,4,4,${lerp(dim, 0.97, lo)})`);
      c.fillStyle = g; c.fillRect(edge.x, edge.y, edge.w, edge.h);
    }
    c.save(); c.translate(sx, sy);
    this.ladder(c, t, 1 - prog(t, 1.6, 1.85));
    if (lo > 0) {
      // Their floodlights, still on.
      for (const [x, y] of [[60, 60], [342, 72]]) {
        const fl = c.createRadialGradient(x, y, 0, x, y, 20);
        fl.addColorStop(0, `rgba(255,255,255,${0.5 * lo})`); fl.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = fl; c.fillRect(x - 20, y - 20, 40, 40);
      }
    }
    // Your spotlight, the one left, and its pool.
    const sp = prog(t, 1.85, 2.1);
    if (sp > 0) {
      const beam = c.createLinearGradient(0, -40, 0, 520);
      beam.addColorStop(0, `rgba(221,230,240,${0.2 * sp})`); beam.addColorStop(0.8, `rgba(221,230,240,${0.05 * sp})`); beam.addColorStop(1, 'rgba(221,230,240,0)');
      c.fillStyle = beam; c.beginPath(); c.moveTo(92, -40); c.lineTo(130, -40); c.lineTo(258, 520); c.lineTo(0, 520); c.closePath(); c.fill();
      const pool = c.createRadialGradient(0, 0, 0, 0, 0, 1);
      pool.addColorStop(0, `rgba(221,230,240,${0.18 * sp})`); pool.addColorStop(1, 'rgba(221,230,240,0)');
      c.save(); c.translate(201, 498); c.scale(150, 30); c.fillStyle = pool; c.beginPath(); c.arc(0, 0, 1, 0, Math.PI * 2); c.fill(); c.restore();
    }
    // Your face drops in alone, is stamped, greys and flattens.
    if (t >= 1.7) {
      const p = prog(t, 1.7, 2.12), flat = outCubic(prog(t, 2.32, 2.9)), gy = prog(t, 2.32, 2.8);
      this.face(c, this.view.you.face, LOST.x, lerp(-110, LOST.y, outBack(p, 1.5)), LOST.w, {
        h: lerp(LOST.w, LOST.h, flat), grey: gy, dim: 0.28 * gy, ring: gy > 0.5 ? '#8a8f96' : 'rgba(245,239,230,.9)', ringWidth: 3,
      });
      // The crack across it.
      const k = outCubic(prog(t, 2.32, 2.46));
      if (k > 0) {
        const pts: [number, number][] = [[152, 357], [170, 376], [163, 392], [186, 404], [178, 420], [199, 432], [212, 444]];
        const upto = k * (pts.length - 1);
        c.save(); c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
        for (let j = 1; j <= Math.ceil(upto); j++) { const f = Math.min(1, upto - (j - 1)); c.lineTo(lerp(pts[j - 1][0], pts[j][0], f), lerp(pts[j - 1][1], pts[j][1], f)); }
        c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = 'rgba(245,247,250,.9)'; c.lineWidth = 1.6; c.stroke(); c.restore();
      }
    }
    if (t >= 2.1) {
      const p = prog(t, 2.1, 2.32), q = prog(t, 2.32, 2.52);
      const s = p < 1 ? lerp(2.6, 1, inCubic(p)) : 1 + 0.07 * Math.sin(Math.PI * q) * (1 - q);
      c.save(); c.globalAlpha = 0.92 * clamp(p * 4); c.translate(229.4, 437.8); c.rotate(rad(-14)); c.scale(s, s);
      rr(c, -59, -30, 118, 60, 8); c.lineWidth = 4; c.strokeStyle = C.red; c.stroke();
      boxText(c, ordinal(this.view.place), 0, -29, 58, `${this.view.place >= 10 ? 40 : 46}px Jaro`, C.red);
      c.restore();
      if (t >= 2.32) {
        this.haptic(2.32, [50, 30, 20]);
        const e = outCubic(prog(t, 2.32, 2.5));
        c.fillStyle = 'rgba(238,42,42,.85)';
        for (const [x, y, r] of INK) { c.beginPath(); c.arc(lerp(229.4, x, e), lerp(437.8, y, e), r * e, 0, Math.PI * 2); c.fill(); }
      }
    }
    // KNOCKED OUT, a letter at a time, where K9 v2 sets each one; the T topples flat.
    const word = (letters: [string, number][], top: number, t0: number, topple: boolean) => {
      letters.forEach(([ch, x], i) => {
        const s0 = t0 + i * 0.035, land = s0 + 0.2;
        if (t < s0) return;
        const p = prog(t, s0, land), q = prog(t, land, land + 0.16), sq = Math.sin(Math.PI * q);
        c.save(); c.globalAlpha *= clamp(p * 3);
        const base = baselineIn(c, '50px Jaro', top, 63);
        c.font = '50px Jaro'; const w = c.measureText(ch).width;
        c.translate(x + w / 2, base - 300 * (1 - p * p));
        if (topple && i === letters.length - 1) {
          // Over on to its side, about the foot of its right edge, and down with a thud.
          // It lands lying just after the U, where K9 v2 has it.
          const f = prog(t, land + 0.25, land + 0.6);
          c.translate(w / 2 - 16 * inCubic(f), 0); c.rotate(rad(90) * inCubic(f)); c.translate(-w / 2, 0);
        }
        c.scale(1 + 0.1 * sq, 1 - 0.2 * sq);
        c.textAlign = 'center'; c.textBaseline = 'alphabetic';
        c.fillStyle = '#3a0408'; for (let k = 4; k >= 1; k--) c.fillText(ch, 0.7 * k, 1.05 * k);
        c.fillStyle = C.red; c.fillText(ch, 0, 0);
        c.restore();
      });
    };
    word([['K', 113], ['N', 140], ['O', 166], ['C', 193], ['K', 213], ['E', 240], ['D', 263]], 548, 2.5, false);
    word([['O', 156], ['U', 183], ['T', 209]], 602, 2.68, true);
    if (t >= 3.3) this.haptic(3.3, 25);
    const sub = prog(t, 3.0, 3.3);
    if (sub > 0) { c.save(); c.globalAlpha = sub; boxText(c, this.view.line, CX, 690 + 8 * (1 - sub), 16, '600 13px Satoshi', '#8a8f96'); c.restore(); }
    c.restore();
    if (t >= 2.32 && t < 2.42) { c.fillStyle = `rgba(238,42,42,${0.18 * (1 - (t - 2.32) / 0.1)})`; c.fillRect(edge.x, edge.y, edge.w, edge.h); }
  }

  /** The standings round the player's place, the player dropping through the cut line into it. */
  private ladder(c: Ctx, t: number, fade: number) {
    const a = outCubic(prog(t, 0.1, 0.38)); if (a <= 0 || fade <= 0) return;
    const { rows, above, heading } = this.view, RH = 44, PX = 24, PW = 354, PY = 250;
    const slotY = (i: number) => PY + 46 + i * RH + (i >= above ? 22 : 0);
    const you = rows.findIndex(r => r.you), from = Math.max(0, above - 1);
    const sw = inOutCubic(prog(t, 0.55, 0.95)), bump = Math.exp(-Math.pow((t - 0.75) / 0.07, 2));
    const slot = (i: number) => (i === you ? lerp(from, i, sw) : i >= from && i < you ? lerp(i + 1, i, sw) : i);
    const y = (i: number) => { const s = slot(i), lo = Math.floor(s), f = s - lo; return lerp(slotY(lo), slotY(lo + 1), f); };
    c.save(); c.globalAlpha = a * fade; c.translate(0, 30 * (1 - a));
    rr(c, PX, PY, PW, 46 + rows.length * RH + 32, 22); c.fillStyle = 'rgba(12,8,9,.94)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 1; c.stroke();
    c.textAlign = 'left'; c.font = '800 11px Satoshi'; c.fillStyle = 'rgba(245,239,230,.6)'; c.fillText(heading, PX + 18, PY + 28);
    const ly = slotY(above) - 14;
    c.fillStyle = 'rgba(238,42,42,.08)'; c.fillRect(PX + 1, ly, PW - 2, (rows.length - above) * RH + 10);
    rows.forEach((r, i) => { if (i !== you) this.row(c, r, y(i), PX, PW, RH, false); });
    if (you >= 0) this.row(c, rows[you], y(you), PX, PW, RH, sw > 0.5);
    c.save(); c.strokeStyle = C.red; c.lineWidth = 2 + 3 * bump; c.setLineDash([6, 5]); c.shadowColor = C.red; c.shadowBlur = 16 * bump;
    c.beginPath(); c.moveTo(PX + 58, ly); c.lineTo(PX + PW - 14, ly); c.stroke(); c.restore();
    rr(c, PX + 12, ly - 10, 40, 20, 10); c.fillStyle = C.red; c.fill();
    c.textAlign = 'center'; c.font = '800 10px Satoshi'; c.fillStyle = '#fff'; c.fillText('CUT', PX + 32, ly + 4);
    c.restore();
  }

  private row(c: Ctx, r: MomentRow, y: number, PX: number, PW: number, RH: number, cut: boolean) {
    const h = RH - 6, x = PX + 8, w = PW - 16, cy = y + h / 2, dim = r.out && !r.you ? 0.55 : 1;
    if (r.you) {
      rr(c, x, y, w, h, 12); c.fillStyle = cut ? 'rgba(238,42,42,.22)' : 'rgba(255,255,255,.1)'; c.fill();
      c.strokeStyle = cut ? C.red : 'rgba(255,255,255,.7)'; c.lineWidth = 1.5; c.stroke();
    }
    c.textBaseline = 'alphabetic';
    c.textAlign = 'center'; c.font = '18px Jaro'; c.fillStyle = `rgba(245,239,230,${0.7 * dim})`; c.fillText(String(r.place), x + 20, cy + 6);
    this.face(c, r.face, x + 52, cy, 28, { grey: r.out ? 1 : 0, ring: null, alpha: dim });
    c.textAlign = 'left'; c.font = `${r.you ? 800 : 600} 15px Satoshi`; c.fillStyle = `rgba(245,239,230,${dim})`; c.fillText(r.you ? 'You' : r.name, x + 74, cy + 5);
    c.textAlign = 'right'; c.font = '20px Jaro'; c.fillText(String(r.runs), x + w - 14, cy + 7);
    const label = r.out ? 'OUT' : r.sub ? 'SUB' : null;
    if (label) {
      c.font = '800 10px Satoshi'; const tw = c.measureText(label).width + 16, tx = x + w - 50 - tw;
      rr(c, tx, cy - 9, tw, 18, 9); c.fillStyle = r.out ? (r.you ? C.red : 'rgba(255,255,255,.12)') : 'rgba(255,255,255,.08)'; c.fill();
      c.textAlign = 'center'; c.fillStyle = r.out ? '#fff' : 'rgba(245,239,230,.6)'; c.fillText(label, tx + tw / 2, cy + 3.5);
    }
  }

  /* ---------- Winner: K11 ---------- */
  private drawWon(c: Ctx, t: number, edge: { x: number; y: number; w: number; h: number }) {
    const [sx, sy] = shakeAt(t, [[0.82, 0.3, 9], [1.88, 0.18, 4]]);
    c.fillStyle = C.ink; c.fillRect(edge.x, edge.y, edge.w, edge.h);
    c.save(); c.translate(sx, sy);
    // Before the last ball the edges beat; the rays and the glow come with the crown.
    if (t < 1) {
      const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 1.4)), 6), ea = (0.3 + 0.5 * beat) * (1 - prog(t, 0.82, 1));
      const v = c.createRadialGradient(CX, H / 2, 260, CX, H / 2, 560); v.addColorStop(0, 'rgba(238,42,42,0)'); v.addColorStop(1, `rgba(238,42,42,${0.5 * ea})`);
      c.fillStyle = v; c.fillRect(edge.x, edge.y, edge.w, edge.h);
    }
    const ra = outCubic(prog(t, 1.25, 1.7));
    if (ra > 0) this.rays(c, ra, this.still ? 0 : t);
    if (this.grain) { c.save(); c.globalAlpha = 0.5 * ra; c.fillStyle = this.grain; c.fillRect(edge.x, edge.y, edge.w, edge.h); c.restore(); }
    const eb = prog(t, 0.05, 0.3) * (1 - prog(t, 1.0, 1.2));
    if (eb > 0) { c.save(); c.globalAlpha = eb; boxText(c, `${this.view.heading} · LAST TWO`, CX, 158, 18, '800 13px Satoshi', C.red, { tracking: 1.3 }); c.restore(); }
    // The last two swing in, wind up and clash.
    const e = outBack(prog(t, 0.1, 0.55), 1.3), back = 20 * outCubic(prog(t, 0.55, 0.74)), f = inCubic(prog(t, 0.74, 0.82));
    const gapX = (74 + back) - f * (back + 14);
    const other = this.view.other;
    if (other && t < 1.7) {
      const k = prog(t, 0.82, 1.6), x = t < 0.82 ? lerp(W + 110, CX + gapX, e) : CX + 60 + 380 * k, y = t < 0.82 ? CLASH_Y : CLASH_Y - 260 * k + 900 * k * k;
      this.face(c, other.face, x, y, 120, { grey: prog(t, 0.82, 0.95), rot: t < 0.82 ? 0 : 9 * k, ring: t < 0.82 ? 'rgba(245,239,230,.9)' : C.red, ringWidth: 3 });
      const nl = prog(t, 0.45, 0.6) * (1 - prog(t, 0.82, 0.9));
      if (nl > 0) { c.save(); c.globalAlpha = nl; boxText(c, `${other.name} · ${other.runs}`, x, CLASH_Y + 74, 19, '700 15px Satoshi', 'rgba(245,239,230,.8)'); c.restore(); }
    }
    let yx: number, yy: number, yd: number;
    if (t < 0.82) { yx = lerp(-110, CX - gapX, e); yy = CLASH_Y; yd = 120; }
    else { const r = inOutCubic(prog(t, 0.95, 1.35)); yx = lerp(CX - 60 - 10 * Math.sin(Math.PI * prog(t, 0.82, 0.95)), WIN.x, r); yy = lerp(CLASH_Y, WIN.y, r); yd = lerp(120, WIN.d, r); }
    const won = prog(t, 1.25, 1.5);
    this.face(c, this.view.you.face, yx, yy, yd, { ring: won > 0 ? C.gold : 'rgba(245,239,230,.9)', ringWidth: lerp(3, 4, won), glow: won > 0 ? `rgba(255,176,32,${0.5 * won})` : undefined });
    const yl = prog(t, 0.45, 0.6) * (1 - prog(t, 0.82, 0.9));
    if (yl > 0) { c.save(); c.globalAlpha = yl; boxText(c, `You · ${this.view.you.runs}`, yx, CLASH_Y + 74, 19, '800 15px Satoshi', C.cream); c.restore(); }
    if (t >= 0.82) this.haptic(0.82, 70);
    if (t >= 0.82 && t < 1.1) {
      const p = outCubic(prog(t, 0.82, 1.0)), a = 1 - prog(t, 0.86, 1.08);
      c.save(); c.translate(CX, CLASH_Y); c.strokeStyle = `rgba(255,236,190,${a})`; c.lineWidth = 3; c.lineCap = 'round';
      for (let i = 0; i < 12; i++) { const an = i / 12 * Math.PI * 2 + 0.2; c.beginPath(); c.moveTo(Math.cos(an) * 30 * p, Math.sin(an) * 30 * p); c.lineTo(Math.cos(an) * (40 + 90 * p), Math.sin(an) * (40 + 90 * p)); c.stroke(); }
      c.restore();
    }
    for (const s0 of [1.4, 1.52]) {
      const p = prog(t, s0, s0 + 0.6); if (p <= 0 || p >= 1) continue;
      c.strokeStyle = `rgba(255,176,32,${1 - p})`; c.lineWidth = 3; c.beginPath(); c.arc(yx, yy, yd / 2 + 4 + 130 * outCubic(p), 0, Math.PI * 2); c.stroke();
    }
    // The crown drops under gravity on to K11's place over the face, turned 8° to the left, and hops once.
    if (t >= 1.3 && this.crown) {
      const scale = yd / WIN.d, cw = CROWN.w * scale, ch = CROWN.h * scale;
      const restX = yx + CROWN.dx * scale, restY = yy + CROWN.dy * scale;
      const p = prog(t, 1.3, 1.6), h = prog(t, 1.6, 1.85);
      const y = lerp(-120, restY, p * p) - Math.sin(Math.PI * h) * 14;
      const sq = p >= 1 ? Math.sin(Math.PI * prog(t, 1.6, 1.7)) * (1 - h) : 0;
      c.save(); c.translate(restX, y); c.rotate(rad(CROWN.turn) + 0.3 * (1 - p)); c.scale(1 + 0.08 * sq, 1 - 0.12 * sq);
      c.drawImage(this.crown, -cw / 2, -ch / 2, cw, ch); c.restore();
    }
    // LAST ONE STANDING, then WINNER slammed in under it, in K11's places.
    const ls = prog(t, 1.45, 1.75);
    if (ls > 0) { c.save(); c.globalAlpha = ls; boxText(c, 'LAST ONE STANDING', CX, 372 + 14 * (1 - outCubic(ls)), 43, '34px Jaro', C.cream); c.restore(); }
    if (t >= 1.6) {
      this.haptic(1.88, 30);
      const p = prog(t, 1.6, 1.88), s = lerp(2.4, 1, outBack(p, 2.2));
      c.save(); c.globalAlpha = prog(t, 1.6, 1.66); c.translate(CX, 455); c.scale(s, s);
      boxText(c, 'WINNER', 0, -45, 90, '72px Jaro', C.gold, { depth: '#8a5200', steps: 5, dx: 0.84, dy: 1.26 });
      c.restore();
    }
    if (t >= 2.05) {
      const s = outBack(prog(t, 2.05, 2.3), 2);
      c.save(); c.translate(CX, 525); c.scale(s, s);
      c.font = '900 13px Satoshi';
      const tw = [...this.view.points].reduce((a, ch) => a + c.measureText(ch).width, 0) + 1.04 * (this.view.points.length - 1);
      const pw = Math.max(140, tw + 58);
      rr(c, -pw / 2, -17, pw, 34, 17); c.fillStyle = 'rgba(255,176,32,.14)'; c.fill();
      rr(c, -pw / 2 + 0.75, -16.25, pw - 1.5, 32.5, 16.25); c.lineWidth = 1.5; c.strokeStyle = C.gold; c.stroke();
      boxText(c, this.view.points, 0, -8, 16, '900 13px Satoshi', C.gold, { tracking: 1.04 });
      c.restore();
    }
    const st = prog(t, 2.2, 2.5);
    if (st > 0) {
      c.save(); c.globalAlpha = st;
      boxText(c, this.view.line, CX, 568, 19, '600 15px Satoshi', C.cream);
      boxText(c, this.view.figures, CX, 592, 18, '500 14px Satoshi', '#bfaeb1');
      c.restore();
    }
    if (!this.still) paper(c, t, this.waves);
    c.restore();
    if (t >= 0.82 && t < 1.0) { c.fillStyle = `rgba(255,255,255,${0.5 * (1 - (t - 0.82) / 0.18)})`; c.fillRect(edge.x, edge.y, edge.w, edge.h); }
  }

  /**
   * K11's light: sixteen rays from a thousand-wide disc round 201, 210, gold
   * at a fifth fading to nothing and back, turning slowly; the disc darkened
   * from its middle out to the page; and over it the 520-wide glow, gold to red.
   */
  private rays(c: Ctx, a: number, t: number) {
    const ox = 201, oy = 210;
    c.save(); c.globalAlpha = a;
    c.beginPath(); c.arc(ox, oy, 500, 0, Math.PI * 2); c.clip();
    const turn = rad(t * 14);
    if (typeof c.createConicGradient === 'function') {
      const g = c.createConicGradient(turn - Math.PI / 2, ox, oy);
      for (let i = 0; i <= 32; i++) g.addColorStop(i / 32, i % 2 ? 'rgba(255,176,32,0)' : 'rgba(255,176,32,.2)');
      c.fillStyle = g; c.fillRect(ox - 500, oy - 500, 1000, 1000);
    } else {
      c.translate(ox, oy); c.rotate(turn); c.fillStyle = 'rgba(255,176,32,.12)';
      for (let i = 0; i < 16; i++) { c.rotate(Math.PI / 8); c.beginPath(); c.moveTo(0, 0); c.lineTo(-40, -520); c.lineTo(40, -520); c.closePath(); c.fill(); }
    }
    c.restore();
    const v = c.createRadialGradient(ox, oy, 0, ox, oy, 500);
    v.addColorStop(0, 'rgba(12,8,9,0)'); v.addColorStop(0.3, 'rgba(12,8,9,.3)'); v.addColorStop(0.62, 'rgba(12,8,9,.92)'); v.addColorStop(1, 'rgba(12,8,9,1)');
    c.save(); c.globalAlpha = a; c.fillStyle = v; c.beginPath(); c.arc(ox, oy, 500, 0, Math.PI * 2); c.fill();
    const glow = c.createRadialGradient(ox, oy, 0, ox, oy, 260);
    glow.addColorStop(0, 'rgba(255,176,32,.28)'); glow.addColorStop(0.5, 'rgba(238,42,42,.12)'); glow.addColorStop(1, 'rgba(238,42,42,0)');
    c.fillStyle = glow; c.beginPath(); c.arc(ox, oy, 260, 0, Math.PI * 2); c.fill();
    c.restore();
  }
}

function shakeAt(t: number, list: [number, number, number][]): [number, number] {
  let x = 0, y = 0;
  for (const [t0, dur, amp] of list) if (t >= t0 && t < t0 + dur) { const a = (1 - (t - t0) / dur) * amp; x += Math.sin((t - t0) * 95) * a; y += Math.cos((t - t0) * 71) * a * 0.6; }
  return [x, y];
}

/** K9 v2's ink, where each spot lands: x, y and radius. */
const INK: [number, number, number][] = [[179, 473, 3], [302, 404, 2], [292.5, 472.5, 2.5], [185.5, 389.5, 1.5]];

interface Bit { side: number; vx: number; vy: number; w: number; h: number; col: string; back: string; spin: number; flip: number; ph: number; sw: number }
/** K11's paper: 8 by 13, gold, red and white. */
function paperWave(seed: number, n: number): Bit[] {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const side = i % 2 ? 1 : -1, col = PAPER[Math.floor(r() * PAPER.length)];
    return { side, vx: -side * (260 + r() * 640), vy: -(1500 + r() * 1100), w: 8, h: 13, col, back: shade(col, 0.62), spin: (r() - 0.5) * 14, flip: 6 + r() * 12, ph: r() * 6.28, sw: 2 + r() * 3 };
  });
}
/** Paper from both bottom corners: a closed-form flight with drag, as Level Up's confetti is. */
function paper(c: Ctx, t: number, waves: { t0: number; bits: Bit[] }[]) {
  const K = 1.7, G = 1500;
  for (const w of waves) {
    const tt = t - w.t0; if (tt < 0) continue;
    const e = 1 - Math.exp(-K * tt);
    for (const b of w.bits) {
      const x0 = b.side < 0 ? -10 : W + 10;
      const x = x0 + b.vx * e / K + Math.sin(tt * b.sw + b.ph) * 12 * Math.min(1, tt);
      const y = H + 10 + G * tt / K + (b.vy - G / K) * e / K;
      if (y > H + 40 && tt > 0.3) continue;
      const fx = Math.cos(b.flip * tt + b.ph);
      c.save(); c.translate(x, y); c.rotate(b.spin * tt + b.ph); c.scale(fx, 1);
      c.fillStyle = fx < 0 ? b.back : b.col; c.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); c.restore();
    }
  }
}
