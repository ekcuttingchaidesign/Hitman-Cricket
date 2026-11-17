/**
 * Super Knockout's two moments at the end of the player's match: KNOCKED OUT
 * and WINNER (Figma section 37 and F4, the claude.ai artifact "Knockout
 * Moments"). Both are drawn the way the Verdict and Level Up are: every frame
 * from one clock on a 402 by 874 stage fitted to the screen, so any moment can
 * be drawn on its own, a tap skips to the last of it, and reduced motion is
 * that last frame standing still.
 *
 * Knocked out is DEFEAT's sting: the standings with the player dropping
 * through the cut line, the lights going out, their face alone under one cold
 * light, their place stamped on it, KNOCKED OUT falling with the last T left
 * hanging. Winner is VICTORY: the last two clash, the crown drops and hops,
 * rings, turning rays, WINNER slammed in, paper from both bottom corners.
 */
import crownUrl from '../assets/knockout/crown.svg';
import { avatarSrc } from '../config/board';
import { buzz } from '../game/haptics';
import { cta } from './Kit';

export interface MomentRow { place: number; name: string; runs: number; face: number; you: boolean; out: boolean; sub: boolean }
export interface MomentView {
  won: boolean;
  place: number;
  of: number;
  you: { name: string; face: number; runs: number };
  /** What happened, in one line under the title. */
  line: string;
  /** Over the standings: END OF OVER 3, or SUDDEN DEATH. */
  heading: string;
  /** A few rows round the player's, and how many of them stand above the line. */
  rows: MomentRow[];
  above: number;
  /** The one who finished second, for WINNER's clash, or who won, for the knocked out. */
  other: { name: string; face: number; runs: number } | null;
  /** Under WINNER: points, or why there are none. */
  points: string;
}

const W = 402, H = 874, CX = 201, FY = 330, TOPY = 290;
const C = { red: '#EE2A2A', blood: '#560610', gold: '#FFB020', ink: '#0C0809', cream: '#FFF4EE' };
const PAPER = ['#f5b83d', '#ffe1a3', '#ffffff', '#ed7044', '#5bd08f', '#4fa3ff'];

/* The game's motion helpers, as `MatchEnd.ts` has them. */
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const outCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const inCubic = (p: number) => p * p * p;
const inOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const outBack = (p: number, s = 1.70158) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2);
const spring = (p: number, k = 14, z = 0.32) => (p <= 0 ? 0 : 1 - Math.exp(-z * k * p) * Math.cos(k * Math.sqrt(1 - z * z) * p));
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
function txt(c: Ctx, s: string, x: number, y: number, o: { font: string; fill: string | CanvasGradient; align?: CanvasTextAlign; depth?: string; dy?: number }) {
  c.font = o.font; c.textAlign = o.align ?? 'left'; c.textBaseline = 'alphabetic';
  if (o.depth) { c.fillStyle = o.depth; c.fillText(s, x, y + (o.dy ?? 5)); }
  c.fillStyle = o.fill; c.fillText(s, x, y);
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
    for (let i = 0; i < p.length; i += 4) { const l = (p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11) * 0.78 + 18; p[i] = p[i + 1] = p[i + 2] = l; }
    x.putImageData(d, 0, 0);
  } catch { x.globalCompositeOperation = 'saturation'; x.fillStyle = '#888'; x.fillRect(0, 0, 160, 160); }
  return c;
}

/** The moments' clocks: when the keys come up, where a tap skips to, and when nothing moves any more. */
const TIMES = { lost: { keys: 3.1, lock: 3.3, end: 4.4 }, won: { keys: 2.6, lock: 3.0, end: 6.0 } } as const;

export class KnockoutMoment {
  /** `__cricket.knockoutAt(t)`: holds the clock at `t` seconds, for the checks to photograph a beat. */
  static pinned: number | null = null;
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: Ctx;
  private faces = new Map<number, HTMLImageElement | null>();
  private greys = new Map<number, HTMLCanvasElement>();
  private crown: HTMLImageElement | null = null;
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
  }

  private async prepare() {
    const wanted = new Set([this.view.you.face, ...this.view.rows.map(r => r.face), ...(this.view.other ? [this.view.other.face] : [])]);
    await Promise.all([...wanted].map(async face => {
      const img = await load(avatarSrc(face));
      this.faces.set(face, img);
      if (img) this.greys.set(face, greyOf(img));
    }));
    this.crown = await load(crownUrl);
    try { await Promise.all([document.fonts.load('64px Jaro'), document.fonts.load('700 15px Satoshi')]); } catch { /* Drawn in the fallback, then. */ }
    this.ready = true;
    this.from = performance.now();
    const tick = (now: number) => {
      this.t = KnockoutMoment.pinned ?? (this.still ? this.times.end : (now - this.from) / 1000);
      this.draw();
      this.root.classList.toggle('keys-up', this.t >= this.times.keys);
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
    if (this.view.won) this.drawWon(c, this.t); else this.drawLost(c, this.t, w / s, h / s);
  }

  private haptic(at: number, pattern: number | number[]) {
    if (this.still || this.t < at || this.buzzed.has(at)) return;
    this.buzzed.add(at); buzz(pattern);
  }

  private face(c: Ctx, face: number, x: number, y: number, d: number, o: { grey?: number; ring?: string | null; alpha?: number; rot?: number } = {}) {
    const ring = o.ring === undefined ? 'rgba(255,244,238,.9)' : o.ring, img = this.faces.get(face), grey = this.greys.get(face);
    c.save(); c.globalAlpha *= o.alpha ?? 1; c.translate(x, y); if (o.rot) c.rotate(o.rot);
    c.beginPath(); c.arc(0, 0, d / 2, 0, Math.PI * 2); c.fillStyle = '#2a1c1e'; c.fill();
    c.save(); c.clip();
    if (img) c.drawImage(img, -d / 2, -d / 2, d, d);
    if (o.grey && grey) { c.globalAlpha *= o.grey; c.drawImage(grey, -d / 2, -d / 2, d, d); }
    c.restore();
    if (ring) { c.lineWidth = Math.max(2, d * 0.04); c.strokeStyle = ring; c.beginPath(); c.arc(0, 0, d / 2, 0, Math.PI * 2); c.stroke(); }
    c.restore();
  }

  /* ---------- Knocked out ---------- */
  private drawLost(c: Ctx, t: number, sw: number, sh: number) {
    const [sx, sy] = shakeAt(t, [[2.32, 0.2, 7], [2.85, 0.14, 3]]);
    const ox = -(sw - W) / 2, oy = -(sh - H) / 2;
    // The game dims behind it, then the lights go out on it.
    const dark = 0.78 * outCubic(prog(t, 0, 0.3)) + 0.17 * inOutCubic(prog(t, 1.6, 2.05));
    c.fillStyle = `rgba(8,5,6,${dark})`; c.fillRect(ox, oy, sw, sh);
    c.save(); c.translate(sx, sy);
    this.ladder(c, t, 1 - prog(t, 1.6, 1.85));
    const sp = prog(t, 1.85, 2.1);
    if (sp > 0) {
      const cone = c.createLinearGradient(0, 0, 0, 470); cone.addColorStop(0, `rgba(210,225,255,${0.02 * sp})`); cone.addColorStop(1, `rgba(210,225,255,${0.12 * sp})`);
      c.fillStyle = cone; c.beginPath(); c.moveTo(CX - 26, oy); c.lineTo(CX + 26, oy); c.lineTo(CX + 150, 450); c.lineTo(CX - 150, 450); c.closePath(); c.fill();
      c.fillStyle = `rgba(210,225,255,${0.09 * sp})`; c.beginPath(); c.ellipse(CX, 450, 150, 22, 0, 0, Math.PI * 2); c.fill();
    }
    if (t >= 1.7) {
      const p = prog(t, 1.7, 2.12), sag = outCubic(prog(t, 2.32, 2.9)), gy = prog(t, 2.32, 2.8);
      this.face(c, this.view.you.face, CX, lerp(-110, FY, outBack(p, 1.5)) + 14 * sag, 150, { grey: gy, ring: `rgba(255,244,238,${0.9 - 0.55 * gy})`, rot: -0.12 * sag });
    }
    if (t >= 2.1) {
      const p = prog(t, 2.1, 2.32), q = prog(t, 2.32, 2.52);
      const s = p < 1 ? lerp(2.6, 1, inCubic(p)) : 1 + 0.07 * Math.sin(Math.PI * q) * (1 - q);
      c.save(); c.globalAlpha = clamp(p * 4); c.translate(CX + 48, FY + 54); c.rotate(-0.17); c.scale(s, s);
      rr(c, -64, -35, 128, 70, 12); c.fillStyle = 'rgba(238,42,42,.14)'; c.fill(); c.lineWidth = 5; c.strokeStyle = C.red; c.stroke();
      txt(c, ordinal(this.view.place), 0, 20, { font: `${this.view.place >= 10 ? 46 : 56}px Jaro`, fill: C.red, align: 'center' });
      for (const [x, y, r] of SPECK) { c.fillStyle = 'rgba(12,8,9,.5)'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
      c.restore();
      if (t >= 2.32) {
        this.haptic(2.32, [50, 30, 20]);
        const e = outCubic(prog(t, 2.32, 2.5));
        c.fillStyle = 'rgba(238,42,42,.85)';
        for (const sp of SPLAT) { c.beginPath(); c.arc(CX + 48 + Math.cos(sp.a) * sp.d * e, FY + 54 + Math.sin(sp.a) * sp.d * e * 0.7, sp.r * e, 0, Math.PI * 2); c.fill(); }
      }
    }
    fallWord(c, 'KNOCKED', 66, 524, C.cream, 'rgba(0,0,0,.6)', 2.5, 0.03, false, t);
    fallWord(c, 'OUT', 112, 628, C.red, C.blood, 2.65, 0.04, true, t);
    if (t >= 2.85) this.haptic(2.85, 25);
    const sub = prog(t, 2.95, 3.25);
    if (sub > 0) { c.save(); c.globalAlpha = sub; txt(c, this.view.line, CX, 682 + 10 * (1 - sub), { font: '600 15px Satoshi', fill: 'rgba(255,244,238,.78)', align: 'center' }); c.restore(); }
    c.restore();
    if (t >= 2.32 && t < 2.42) { c.fillStyle = `rgba(238,42,42,${0.18 * (1 - (t - 2.32) / 0.1)})`; c.fillRect(ox, oy, sw, sh); }
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
    txt(c, heading, PX + 18, PY + 28, { font: '800 11px Satoshi', fill: 'rgba(255,244,238,.6)' });
    const ly = slotY(above) - 14;
    c.fillStyle = 'rgba(238,42,42,.08)'; c.fillRect(PX + 1, ly, PW - 2, (rows.length - above) * RH + 10);
    rows.forEach((r, i) => { if (i !== you) this.row(c, r, y(i), PX, PW, RH, false); });
    if (you >= 0) this.row(c, rows[you], y(you), PX, PW, RH, sw > 0.5);
    c.save(); c.strokeStyle = C.red; c.lineWidth = 2 + 3 * bump; c.setLineDash([6, 5]); c.shadowColor = C.red; c.shadowBlur = 16 * bump;
    c.beginPath(); c.moveTo(PX + 58, ly); c.lineTo(PX + PW - 14, ly); c.stroke(); c.restore();
    rr(c, PX + 12, ly - 10, 40, 20, 10); c.fillStyle = C.red; c.fill();
    txt(c, 'CUT', PX + 32, ly + 4, { font: '800 10px Satoshi', fill: '#fff', align: 'center' });
    c.restore();
  }

  private row(c: Ctx, r: MomentRow, y: number, PX: number, PW: number, RH: number, cut: boolean) {
    const h = RH - 6, x = PX + 8, w = PW - 16, cy = y + h / 2, dim = r.out && !r.you ? 0.55 : 1;
    if (r.you) {
      rr(c, x, y, w, h, 12); c.fillStyle = cut ? 'rgba(238,42,42,.22)' : 'rgba(255,255,255,.1)'; c.fill();
      c.strokeStyle = cut ? C.red : 'rgba(255,255,255,.7)'; c.lineWidth = 1.5; c.stroke();
    }
    txt(c, String(r.place), x + 20, cy + 6, { font: '18px Jaro', fill: `rgba(255,244,238,${0.7 * dim})`, align: 'center' });
    this.face(c, r.face, x + 52, cy, 28, { grey: r.out ? 1 : 0, ring: null, alpha: dim });
    txt(c, r.you ? 'You' : r.name, x + 74, cy + 5, { font: `${r.you ? 800 : 600} 15px Satoshi`, fill: `rgba(255,244,238,${dim})` });
    txt(c, String(r.runs), x + w - 14, cy + 7, { font: '20px Jaro', fill: `rgba(255,244,238,${dim})`, align: 'right' });
    const label = r.out ? 'OUT' : r.sub ? 'SUB' : null;
    if (label) {
      c.font = '800 10px Satoshi'; const tw = c.measureText(label).width + 16, tx = x + w - 50 - tw;
      rr(c, tx, cy - 9, tw, 18, 9); c.fillStyle = r.out ? (r.you ? C.red : 'rgba(255,255,255,.12)') : 'rgba(255,255,255,.08)'; c.fill();
      txt(c, label, tx + tw / 2, cy + 3.5, { font: '800 10px Satoshi', fill: r.out ? '#fff' : 'rgba(255,244,238,.6)', align: 'center' });
    }
  }

  /* ---------- Winner ---------- */
  private drawWon(c: Ctx, t: number) {
    const [sx, sy] = shakeAt(t, [[0.82, 0.3, 9], [1.88, 0.18, 4]]);
    const ox = -400, oy = -400;
    c.fillStyle = C.ink; c.fillRect(ox, oy, W + 800, H + 800);
    c.save(); c.translate(sx, sy);
    const bloom = c.createRadialGradient(CX, 280, 10, CX, 280, 560);
    bloom.addColorStop(0, 'rgba(238,42,42,.30)'); bloom.addColorStop(0.5, 'rgba(86,6,16,.34)'); bloom.addColorStop(1, 'rgba(12,8,9,0)');
    c.fillStyle = bloom; c.fillRect(ox, oy, W + 800, H + 800);
    const eb = prog(t, 0.05, 0.3) * (1 - prog(t, 1.0, 1.2));
    if (eb > 0) { c.save(); c.globalAlpha = eb; txt(c, `${this.view.heading} · LAST TWO`, CX, 168, { font: '800 13px Satoshi', fill: C.red, align: 'center' }); c.restore(); }
    const ra = outCubic(prog(t, 1.25, 1.7));
    if (ra > 0) {
      c.save(); c.translate(CX, TOPY); c.rotate(rad((this.still ? 1.6 : t) * 14));
      const rg = c.createRadialGradient(0, 0, 0, 0, 0, 560); rg.addColorStop(0, `rgba(255,176,32,${0.26 * ra})`); rg.addColorStop(1, 'rgba(255,176,32,0)');
      c.fillStyle = rg;
      for (let i = 0; i < 16; i++) { c.rotate(Math.PI * 2 / 16); c.beginPath(); c.moveTo(0, 0); c.lineTo(-30, -580); c.lineTo(30, -580); c.closePath(); c.fill(); }
      c.restore();
      const glow = c.createRadialGradient(CX, TOPY, 0, CX, TOPY, 170); glow.addColorStop(0, `rgba(255,196,80,${0.34 * ra})`); glow.addColorStop(1, 'rgba(255,196,80,0)');
      c.fillStyle = glow; c.fillRect(CX - 170, TOPY - 170, 340, 340);
    }
    const e = outBack(prog(t, 0.1, 0.55), 1.3), back = 20 * outCubic(prog(t, 0.55, 0.74)), f = inCubic(prog(t, 0.74, 0.82));
    const gapX = (74 + back) - f * (back + 14);
    const other = this.view.other;
    if (other && t < 1.7) {
      const k = prog(t, 0.82, 1.6), x = t < 0.82 ? lerp(W + 110, CX + gapX, e) : CX + 60 + 380 * k, y = t < 0.82 ? FY : FY - 260 * k + 900 * k * k;
      this.face(c, other.face, x, y, 120, { grey: prog(t, 0.82, 0.95), rot: t < 0.82 ? 0 : 9 * k, ring: t < 0.82 ? 'rgba(255,244,238,.9)' : C.red });
      const nl = prog(t, 0.45, 0.6) * (1 - prog(t, 0.82, 0.9));
      if (nl > 0) { c.save(); c.globalAlpha = nl; txt(c, `${other.name} · ${other.runs}`, x, FY + 92, { font: '700 15px Satoshi', fill: 'rgba(255,244,238,.8)', align: 'center' }); c.restore(); }
    }
    let yx: number, yy: number, yd: number;
    if (t < 0.82) { yx = lerp(-110, CX - gapX, e); yy = FY; yd = 120; }
    else { const r = inOutCubic(prog(t, 0.95, 1.35)); yx = lerp(CX - 60 - 10 * Math.sin(Math.PI * prog(t, 0.82, 0.95)), CX, r); yy = lerp(FY, TOPY, r); yd = lerp(120, 168, r); }
    this.face(c, this.view.you.face, yx, yy, yd, { ring: t > 1.3 ? C.gold : 'rgba(255,244,238,.9)' });
    const yl = prog(t, 0.45, 0.6) * (1 - prog(t, 0.82, 0.9));
    if (yl > 0) { c.save(); c.globalAlpha = yl; txt(c, `You · ${this.view.you.runs}`, yx, FY + 92, { font: '800 15px Satoshi', fill: C.cream, align: 'center' }); c.restore(); }
    if (t >= 0.82) this.haptic(0.82, 70);
    if (t >= 0.82 && t < 1.1) {
      const p = outCubic(prog(t, 0.82, 1.0)), a = 1 - prog(t, 0.86, 1.08);
      c.save(); c.translate(CX, FY); c.strokeStyle = `rgba(255,236,190,${a})`; c.lineWidth = 3; c.lineCap = 'round';
      for (let i = 0; i < 12; i++) { const an = i / 12 * Math.PI * 2 + 0.2; c.beginPath(); c.moveTo(Math.cos(an) * 30 * p, Math.sin(an) * 30 * p); c.lineTo(Math.cos(an) * (40 + 90 * p), Math.sin(an) * (40 + 90 * p)); c.stroke(); }
      c.restore();
    }
    for (const s0 of [1.4, 1.52]) {
      const p = prog(t, s0, s0 + 0.6); if (p <= 0 || p >= 1) continue;
      c.strokeStyle = `rgba(255,176,32,${1 - p})`; c.lineWidth = 3; c.beginPath(); c.arc(CX, TOPY, 84 + 130 * outCubic(p), 0, Math.PI * 2); c.stroke();
    }
    if (t >= 1.3 && this.crown) {
      const cw = 132, ch = cw * 72 / 124, rest = yy - yd / 2 - ch * 0.74;
      const p = prog(t, 1.3, 1.6), h = prog(t, 1.6, 1.85);
      const y = lerp(-120, rest, p * p) - Math.sin(Math.PI * h) * 16;
      const sq = p >= 1 ? Math.sin(Math.PI * prog(t, 1.6, 1.7)) * (1 - h) : 0;
      c.save(); c.translate(yx, y + ch / 2); c.rotate(-0.08 + 0.3 * (1 - p)); c.scale(1 + 0.08 * sq, 1 - 0.12 * sq);
      c.drawImage(this.crown, -cw / 2, -ch / 2, cw, ch); c.restore();
    }
    if (t >= 1.6) {
      this.haptic(1.88, 30);
      const p = prog(t, 1.6, 1.88), s = lerp(2.4, 1, outBack(p, 2.2));
      c.save(); c.globalAlpha = prog(t, 1.6, 1.66); c.translate(CX, 528); c.scale(s, s);
      const gg = c.createLinearGradient(0, -80, 0, 4); gg.addColorStop(0, '#FFEFB0'); gg.addColorStop(0.55, '#FFB020'); gg.addColorStop(1, '#E08A00');
      txt(c, 'WINNER', 0, 0, { font: '108px Jaro', fill: gg, depth: C.blood, dy: 7, align: 'center' });
      c.restore();
    }
    const sb = prog(t, 1.95, 2.25);
    if (sb > 0) { c.save(); c.globalAlpha = sb; txt(c, `Last one standing of ${this.view.of}`, CX, 576 + 10 * (1 - sb), { font: '700 16px Satoshi', fill: 'rgba(255,244,238,.82)', align: 'center' }); c.restore(); }
    if (t >= 2.05) {
      const s = outBack(prog(t, 2.05, 2.3), 2);
      c.save(); c.translate(CX, 626); c.scale(s, s);
      c.font = '20px Jaro'; const pw = c.measureText(this.view.points).width + 40;
      rr(c, -pw / 2, -20, pw, 40, 20); c.lineWidth = 2; c.strokeStyle = C.gold; c.stroke(); c.fillStyle = 'rgba(255,176,32,.12)'; c.fill();
      txt(c, this.view.points, 0, 7, { font: '20px Jaro', fill: C.gold, align: 'center' });
      c.restore();
    }
    const st = prog(t, 2.3, 2.6);
    if (st > 0) { c.save(); c.globalAlpha = st; txt(c, this.view.line, CX, 684, { font: '600 14px Satoshi', fill: 'rgba(255,244,238,.6)', align: 'center' }); c.restore(); }
    if (!this.still) paper(c, t, this.waves);
    c.restore();
    if (t >= 0.82 && t < 1.0) { c.fillStyle = `rgba(255,255,255,${0.5 * (1 - (t - 0.82) / 0.18)})`; c.fillRect(ox, oy, W + 800, H + 800); }
  }
}

function shakeAt(t: number, list: [number, number, number][]): [number, number] {
  let x = 0, y = 0;
  for (const [t0, dur, amp] of list) if (t >= t0 && t < t0 + dur) { const a = (1 - (t - t0) / dur) * amp; x += Math.sin((t - t0) * 95) * a; y += Math.cos((t - t0) * 71) * a * 0.6; }
  return [x, y];
}

/** A word that falls a letter at a time and lands with a thud; the last letter can come loose and hang. */
function fallWord(c: Ctx, word: string, size: number, baseY: number, fill: string, depth: string, t0: number, step: number, hang: boolean, t: number) {
  c.font = `${size}px Jaro`;
  const ch = [...word], ws = ch.map(s => c.measureText(s).width), gap = size * 0.03;
  let x = CX - (ws.reduce((a, b) => a + b, 0) + gap * (ch.length - 1)) / 2;
  ch.forEach((s, i) => {
    const w = ws[i], s0 = t0 + i * step, land = s0 + 0.2;
    if (t >= s0) {
      const p = prog(t, s0, land), q = prog(t, land, land + 0.16), sq = Math.sin(Math.PI * q);
      c.save(); c.globalAlpha *= clamp(p * 3); c.translate(x + w / 2, baseY - 300 * (1 - p * p));
      if (hang && i === ch.length - 1) { const top = size * 0.72; c.translate(-w / 2, -top); c.rotate(rad(18) * spring(prog(t, land + 0.12, land + 1.1))); c.translate(w / 2, top); }
      c.scale(1 + 0.1 * sq, 1 - 0.2 * sq);
      txt(c, s, 0, 0, { font: `${size}px Jaro`, fill, depth, dy: size * 0.06, align: 'center' });
      c.restore();
    }
    x += w + gap;
  });
}

const R3 = rng(5);
const SPECK = Array.from({ length: 26 }, () => [(R3() - 0.5) * 120, (R3() - 0.5) * 64, 0.6 + R3() * 1.6] as const);
const SPLAT = Array.from({ length: 12 }, () => ({ a: R3() * Math.PI * 2, d: 70 + R3() * 50, r: 1.5 + R3() * 4 }));

interface Bit { side: number; vx: number; vy: number; w: number; h: number; col: string; back: string; spin: number; flip: number; ph: number; sw: number }
function paperWave(seed: number, n: number): Bit[] {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const side = i % 2 ? 1 : -1, col = PAPER[Math.floor(r() * PAPER.length)];
    return { side, vx: -side * (260 + r() * 640), vy: -(1500 + r() * 1100), w: 7 + r() * 7, h: 4 + r() * 5, col, back: shade(col, 0.62), spin: (r() - 0.5) * 14, flip: 6 + r() * 12, ph: r() * 6.28, sw: 2 + r() * 3 };
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
