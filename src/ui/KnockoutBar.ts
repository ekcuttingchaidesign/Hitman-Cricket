/**
 * Super Knockout's bar along the foot of the screen (Figma "Super Knockout ·
 * Final", F2, and section 46; the claude.ai artifact "Knockout Bar Motion"):
 * every seat of the room in a row, worst on the left, the cut between the drop
 * and the safe, and the player's face riding it by their place. It reacts to
 * where they stand (`Track.mood`): a slow green breath when calm, an amber
 * pulse and a line crawling from the cut when close to it, a teeter when level
 * on the line, and a heartbeat in the drop that quickens as the over runs out,
 * with flames and embers coming off the red seats; in sudden death a fuse
 * burns along the bar to the face instead. Between two answers it plays what
 * happened: climbing out, falling in, and the cut.
 *
 * Everything that loops is CSS on transforms and opacity, its tempo one custom
 * property (`--beat`); the moments are Web Animations, which restart nothing
 * by class and so never force a layout mid-ball. The fire is one canvas, drawn
 * only while the player is in the drop and for the embers after. Under reduced
 * motion the colours, the cut and the words stay and nothing moves.
 */
import type { Track, TrackMood } from '../game/knockout';
import { buzz } from '../game/haptics';

/** The design's measures, in design pixels: the seats' row is 338 wide with 3 between seats. */
const ROW = 338, GAP = 3;
/** Heartbeats a minute with six balls left before the cut, and each ball nearer adds this; sudden death is the top. */
const BPM = { slow: 72, step: 12, sudden: 140 };

const hot = (m: TrackMood | undefined) => m === 'drop' || m === 'sudden';
const stillNow = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The bar's markup, in the HUD's stage. */
export const knockoutBarMarkup = () => `
  <div class="ko-track" id="ko-track" data-mood="calm" hidden>
    <canvas class="ko-fx" aria-hidden="true"></canvas>
    <span class="ko-brow" id="ko-brow"></span>
    <span class="ko-place" aria-hidden="true"><b id="ko-at"></b><span id="ko-of"></span></span>
    <div class="ko-seats" id="ko-rail" role="img">
      <span class="ko-sheen"></span><span class="ko-tether"></span><span class="ko-cut"></span>
      <span class="ko-you"><span class="ko-wave"></span><span class="ko-wave w2"></span><span class="ko-ring"></span><img alt="" decoding="async"></span>
    </div>
    <span class="ko-zone is-gone" aria-hidden="true">GONE</span><span class="ko-zone is-drop" aria-hidden="true">DROP</span><span class="ko-zone is-safe" aria-hidden="true">SAFE</span>
    <p class="ko-say" id="ko-say" aria-live="polite" hidden></p>
  </div>`;

interface Ember { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; ph: number; spark: boolean }

export class KnockoutBar {
  private track: Track | null = null;
  private readonly seats: HTMLElement;
  private readonly you: HTMLElement;
  private readonly say: HTMLElement;
  private readonly fx: HTMLCanvasElement;
  private readonly pen: CanvasRenderingContext2D | null;
  private segs: HTMLElement[] = [];
  private embers: Ember[] = [];
  private heat = 0;
  private spark: number | null = null;
  private frame = 0;
  private last = 0;

  constructor(private readonly box: HTMLElement, private readonly beatOn: HTMLElement) {
    this.seats = box.querySelector('.ko-seats')!;
    this.you = box.querySelector('.ko-you')!;
    this.say = box.querySelector('.ko-say')!;
    this.fx = box.querySelector('.ko-fx')!;
    this.pen = this.fx.getContext('2d');
  }

  /** A seat's left edge and middle, as a share of the row. */
  private leftOf(i: number, n: number) { const sw = (ROW - GAP * (n - 1)) / n; return (i * (sw + GAP)) / ROW; }
  private midOf(i: number, n: number) { const sw = (ROW - GAP * (n - 1)) / n; return (i * (sw + GAP) + sw / 2) / ROW; }

  /** Draw the room as it now stands, and play what changed since the last time. Null puts it away. */
  show(next: Track | null, face: string) {
    const prev = this.track;
    this.track = next;
    this.box.hidden = !next;
    if (!next) { this.beatOn.style.removeProperty('--ko-beat'); this.stopFire(); return; }
    const n = next.seats, pct = (x: number) => `${(x * 100).toFixed(3)}%`;
    if (this.segs.length !== n) {
      this.segs.forEach(s => s.remove());
      this.segs = Array.from({ length: n }, (_, i) => {
        const s = document.createElement('i');
        s.className = 'ko-seat';
        s.style.left = pct(this.leftOf(i, n));
        s.style.width = pct((ROW - GAP * (n - 1)) / n / ROW);
        return s;
      });
      // Under the cut and the face.
      this.seats.prepend(...this.segs);
    }
    next.pips.forEach((pip, i) => { this.segs[i].dataset.zone = pip.zone; });
    const line = next.gone + next.drop;
    const cut = line >= n ? 1 : this.leftOf(line, n) - GAP / 2 / ROW;
    const at = this.midOf(next.you, n);
    // Shares of the seats' row, unitless: the stylesheet lays them on its 338 design pixels.
    const style = this.box.style, share = (x: number) => x.toFixed(4);
    style.setProperty('--ko-cut', share(cut));
    style.setProperty('--ko-at', share(at));
    style.setProperty('--ko-tether', share(Math.max(0, at - cut - 15 / ROW)));
    const zone = (cls: string, from: number, to: number) => {
      const z = this.box.querySelector<HTMLElement>(`.ko-zone.${cls}`)!;
      z.hidden = to < from;
      if (to >= from) z.style.setProperty('--ko-mid', share((this.midOf(from, n) + this.midOf(to, n)) / 2));
      return z;
    };
    zone('is-gone', 0, next.gone - 1);
    zone('is-drop', next.gone, line - 1).textContent = next.mood === 'sudden' ? 'OUT' : 'DROP';
    zone('is-safe', line, n - 1);
    this.box.dataset.mood = next.mood;
    this.box.querySelector('#ko-brow')!.textContent = next.eyebrow;
    this.box.querySelector('#ko-at')!.textContent = `#${next.place}`;
    this.box.querySelector('#ko-of')!.textContent = `OF ${next.of}`;
    const img = this.you.querySelector('img')!;
    if (img.getAttribute('src') !== face) img.src = face;
    // What it takes over the face, kept inside the bar's ends, its tip on the face.
    this.say.hidden = !next.say;
    this.say.textContent = next.say?.words ?? '';
    this.say.dataset.tone = next.say?.tone ?? '';
    // The heartbeat's tempo is the deadline: 72 a minute with six balls left, 132 on the last, sudden death at the top.
    const bpm = next.mood === 'sudden' ? BPM.sudden : BPM.slow + (6 - next.ballsLeft) * BPM.step;
    this.beatOn.style.setProperty('--ko-beat', `${(60 / bpm).toFixed(3)}s`);
    this.seats.setAttribute('aria-label', `Place ${next.place} of ${next.of}. ${
      next.mood === 'drop' || next.mood === 'sudden' ? 'In the drop' : next.mood === 'level' ? 'Level on the line, safe' : 'Safe'}${
      next.say && next.say.tone !== 'level' ? `: ${next.say.words.toLowerCase()}` : ''}. ${next.eyebrow.toLowerCase()}.`);
    if (prev) this.moment(prev, next);
    if (hot(next.mood) || this.embers.length) this.startFire();
  }

  /** The over's cut, climbing out, falling in, or the need ticking down: what changed between two answers. */
  private moment(prev: Track, next: Track) {
    if (stillNow()) return;
    const n = next.seats;
    if (next.gone > prev.gone) {
      // The cut: the seats it took flash white, sink and go grey, and you came through.
      for (let i = prev.gone, k = 0; i < next.gone; i++, k++) {
        this.segs[i]?.animate([
          { background: '#fff', transform: 'translateY(0)' },
          { background: '#fff', transform: 'translateY(0)', offset: 0.3 },
          { transform: 'translateY(calc(var(--u, 1px) * 6))', opacity: 0.2, offset: 0.75 },
          { transform: 'translateY(0)', opacity: 1 },
        ], { duration: 900, delay: k * 120, easing: 'ease-in' });
      }
      buzz([20, 60, 20]);
      window.setTimeout(() => { this.floaty('SURVIVED', '#3ddc84'); this.burst('#3ddc84', 0); }, 520 + (next.gone - prev.gone) * 120);
      return;
    }
    if (hot(prev.mood) && !hot(next.mood)) {
      // Climbing out: the face jumps the line on a spring and lands, the seats it passed flash.
      this.you.animate([
        { transform: 'translateY(0) scale(1)' },
        { transform: 'translateY(calc(var(--u, 1px) * -12)) scale(1.15)', offset: 0.45 },
        { transform: 'translateY(calc(var(--u, 1px) * 2)) scale(.95)', offset: 0.8 },
        { transform: 'translateY(0) scale(1)' },
      ], { duration: 560, easing: 'ease-out', composite: 'add' });
      for (let i = prev.you + 1; i <= next.you && i < n; i++) {
        this.segs[i]?.animate([{ filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], { duration: 420, delay: (i - prev.you) * 50 });
      }
      window.setTimeout(() => { this.burst('#3ddc84'); this.floaty('SAFE', '#3ddc84'); }, 300);
      buzz(25);
      return;
    }
    if (!hot(prev.mood) && hot(next.mood)) {
      // Falling in: a stumble back across the line, the line flashing, a shudder, and the pill dropping in.
      this.you.animate([
        { transform: 'rotate(0)' }, { transform: 'rotate(-14deg) translateY(calc(var(--u, 1px) * 2))', offset: 0.4 },
        { transform: 'rotate(6deg)', offset: 0.7 }, { transform: 'rotate(0)' },
      ], { duration: 520, easing: 'ease-out', composite: 'add' });
      this.box.querySelector('.ko-cut')?.animate([{ boxShadow: '0 0 calc(var(--u, 1px) * 16) #fff', background: '#fff' }, { boxShadow: '0 0 0 #fff' }], { duration: 500 });
      this.box.animate([
        { translate: '0' }, { translate: 'calc(var(--u, 1px) * -4) 0' }, { translate: 'calc(var(--u, 1px) * 4) 0' },
        { translate: 'calc(var(--u, 1px) * -2) 0' }, { translate: '0' },
      ], { duration: 360, delay: 120 });
      this.say.animate([{ transform: 'translateY(calc(var(--u, 1px) * -14))', opacity: 0 }, { transform: 'translateY(calc(var(--u, 1px) * 3))', opacity: 1, offset: 0.6 }, { transform: 'none' }],
        { duration: 420, easing: 'ease-out' });
      this.burst('#ee2a2a', 0);
      buzz([30, 40, 30]);
      return;
    }
    if (hot(next.mood) && prev.say && next.say && next.say.words !== prev.say.words) {
      // A single, still in the drop: the need ticks down.
      this.say.animate([{ transform: 'translateY(calc(var(--u, 1px) * -8))', opacity: 0.2 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.3,1.5,.5,1)' });
      buzz(10);
    }
  }

  /** A ring and a few sparks off the face. */
  private burst(colour: string, sparks = 8) {
    const ring = document.createElement('span');
    ring.className = 'ko-burst';
    ring.style.borderColor = colour;
    this.seats.append(ring);
    ring.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(3.2)', opacity: 0 }], { duration: 600, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => ring.remove();
    for (let i = 0; i < sparks; i++) {
      const s = document.createElement('span');
      s.className = 'ko-spark';
      s.style.background = colour;
      this.seats.append(s);
      const a = -Math.PI / 2 + (i / (sparks - 1) - 0.5) * Math.PI * 1.1, d = 26 + Math.random() * 14;
      s.animate([{ translate: '0 0', opacity: 1 }, { translate: `calc(var(--u, 1px) * ${(Math.cos(a) * d).toFixed(1)}) calc(var(--u, 1px) * ${(Math.sin(a) * d).toFixed(1)})`, opacity: 0 }],
        { duration: 520 + Math.random() * 200, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = () => s.remove();
    }
  }

  /** Words floating up off the face: SAFE, SURVIVED. */
  private floaty(words: string, colour: string) {
    const f = document.createElement('span');
    f.className = 'ko-floaty';
    f.textContent = words;
    f.style.color = colour;
    this.seats.append(f);
    f.animate([
      { translate: '-50% calc(var(--u, 1px) * 6)', opacity: 0 }, { translate: '-50% 0', opacity: 1, offset: 0.2 },
      { translate: '-50% calc(var(--u, 1px) * -22)', opacity: 0 },
    ], { duration: 1300, easing: 'ease-out' }).onfinish = () => f.remove();
  }

  // ── The fire ────────────────────────────────────────────────────────────

  private startFire() {
    if (this.frame || !this.pen) return;
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.draw);
  }
  private stopFire() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.embers = [];
    this.heat = 0;
    this.spark = null;
    this.pen?.clearRect(0, 0, this.fx.width, this.fx.height);
  }

  private readonly draw = (now: number) => {
    this.frame = 0;
    const g = this.pen!, t = this.track;
    // A frame's time can be from before the loop was started: never a step back.
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000)); this.last = Math.max(this.last, now);
    // Out of sight (the pause sheet, the card): stop, and start again with the next answer.
    if (!t || this.box.hidden || !this.box.offsetParent) { this.stopFire(); return; }
    const box = this.fx.getBoundingClientRect(), row = this.seats.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(box.width * dpr), h = Math.round(box.height * dpr);
    if (this.fx.width !== w || this.fx.height !== h) { this.fx.width = w; this.fx.height = h; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, box.width, box.height);
    const u = row.width / ROW, still = stillNow();
    const burning = hot(t.mood);
    this.heat += ((burning ? 1 : 0) - this.heat) * Math.min(1, dt * 4);
    const n = t.seats, X = (share: number) => row.left - box.left + share * row.width;
    const fy = row.top - box.top, faceX = X(this.midOf(t.you, n));
    const k = t.mood === 'sudden' ? 1 : Math.max(0, Math.min(1, (6 - t.ballsLeft) / 5));
    const beat = parseFloat(getComputedStyle(this.beatOn).getPropertyValue('--ko-beat')) || 0.83;
    const ph = (now / 1000 % beat) / beat;
    const pulse = still ? 0 : Math.max(Math.exp(-(((ph - 0.12) / 0.05) ** 2)), 0.7 * Math.exp(-(((ph - 0.36) / 0.05) ** 2)));
    const x0 = X(this.leftOf(t.gone, n)), x1 = X(this.leftOf(Math.min(n - 1, t.gone + t.drop - 1), n) + (ROW - GAP * (n - 1)) / n / ROW);
    g.globalCompositeOperation = 'lighter';
    if (this.heat > 0.01 && still) {
      // Reduced motion: one still glow under the drop.
      const gl = g.createRadialGradient((x0 + x1) / 2, fy, 2, (x0 + x1) / 2, fy, 40 * u);
      gl.addColorStop(0, `rgba(255,120,40,${0.35 * this.heat})`); gl.addColorStop(1, 'rgba(238,42,42,0)');
      g.fillStyle = gl; g.fillRect(x0 - 40 * u, fy - 40 * u, x1 - x0 + 80 * u, 60 * u);
    } else if (this.heat > 0.01 && t.mood === 'sudden') {
      this.fuse(g, t, u, faceX, fy - 4 * u, row, box, dt, now / 1000, pulse, k);
    } else if (this.heat > 0.01) {
      this.spark = null;
      this.flames(g, x0, x1, fy, u, now / 1000, pulse, k);
      const rate = (8 + 50 * k) * this.heat * (1 + pulse);
      for (let m = rate * dt + Math.random(); m >= 1; m--) this.ember(x0 + Math.random() * (x1 - x0), fy, k, u);
    }
    // The embers: rise, sway, cool from gold to red, and go. The fuse's sparks fall.
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i]; e.life += dt;
      if (e.life >= e.max || still) { this.embers.splice(i, 1); continue; }
      e.vy += (e.spark ? 140 : -10) * u * dt;
      e.x += (e.vx + Math.sin(now / 1000 * 3 + e.ph) * 10 * u) * dt; e.y += e.vy * dt;
      const f = e.life / e.max, a = (1 - f) * Math.max(this.heat, 0.4);
      const col = f < 0.3 ? `255,${Math.round(220 - f * 200)},${Math.round(120 - f * 300)}` : f < 0.7 ? '255,120,40' : '238,42,42';
      g.fillStyle = `rgba(${col},${a.toFixed(3)})`;
      g.beginPath(); g.arc(e.x, e.y, e.r * (1 - f * 0.5), 0, Math.PI * 2); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    if (burning || this.heat > 0.01 || this.embers.length) this.frame = requestAnimationFrame(this.draw);
    else this.stopFire();
  };

  private ember(x: number, y: number, k: number, u: number) {
    if (this.embers.length > 160) return;
    this.embers.push({ x, y, vx: (Math.random() - 0.5) * 14 * u, vy: -(22 + Math.random() * 36) * (0.8 + k * 0.6) * u,
      life: 0, max: 0.9 + Math.random() * 1.1, r: (1 + Math.random() * 1.8 + k) * u, ph: Math.random() * 6.28, spark: false });
  }

  /** Low flames licking up off the red seats, red outside and gold in, jumping on the beat; their tips stay under the words. */
  private flames(g: CanvasRenderingContext2D, x0: number, x1: number, fy: number, u: number, t: number, pulse: number, k: number) {
    const noise = (x: number, s: number) => 0.5 + 0.25 * Math.sin(x * 0.21 + s * 7.3) + 0.15 * Math.sin(x * 0.47 - s * 11.1) + 0.1 * Math.sin(x * 0.93 + s * 17.3);
    for (const [scale, inner, outer] of [[1, 'rgba(255,70,30,', 'rgba(238,42,42,'], [0.55, 'rgba(255,230,140,', 'rgba(255,150,40,']] as const) {
      const top = Math.min(14, (7 + 6 * k) * (1 + 0.3 * pulse)) * scale * this.heat * u;
      const grad = g.createLinearGradient(0, fy + 2 * u, 0, fy - top - 6 * u);
      grad.addColorStop(0, `${inner}${(0.95 * this.heat).toFixed(3)})`); grad.addColorStop(0.55, `${outer}${(0.55 * this.heat).toFixed(3)})`); grad.addColorStop(1, `${outer}0)`);
      g.fillStyle = grad; g.beginPath(); g.moveTo(x0 - 2 * u, fy + 3 * u);
      for (let x = x0 - 2 * u; x <= x1 + 2 * u; x += 2 * u) {
        const edge = Math.min(1, (x - x0 + 4 * u) / (8 * u), (x1 + 4 * u - x) / (8 * u));
        g.lineTo(x, fy - top * noise(x / u * (scale < 1 ? 1.6 : 1), t * (scale < 1 ? 1.3 : 1)) * Math.max(0, edge));
      }
      g.lineTo(x1 + 2 * u, fy + 3 * u); g.closePath(); g.fill();
    }
    const glow = g.createRadialGradient((x0 + x1) / 2, fy + 4 * u, 2, (x0 + x1) / 2, fy + 4 * u, (50 + 30 * k) * u);
    glow.addColorStop(0, `rgba(255,90,30,${(0.28 * this.heat).toFixed(3)})`); glow.addColorStop(1, 'rgba(255,90,30,0)');
    g.fillStyle = glow; g.fillRect(x0 - 80 * u, fy - 60 * u, x1 - x0 + 160 * u, 90 * u);
  }

  /**
   * Sudden death's fuse: from the end of the bar further from the face, over
   * the grey seats of those already gone, to the face, its spark burning down
   * it as the balls run out. The length left is the balls left.
   */
  private fuse(g: CanvasRenderingContext2D, t: Track, u: number, faceX: number, y: number, row: DOMRect, box: DOMRect, dt: number, s: number, pulse: number, k: number) {
    const left = row.left - box.left, right = left + row.width;
    const fromLeft = faceX - left > right - faceX;
    const end = fromLeft ? left : right, from = faceX + (fromLeft ? -16 : 16) * u;
    const share = Math.max(0.08, Math.min(1, t.ballsLeft / 6));
    const target = from + (end - from) * share;
    this.spark = this.spark === null ? target : this.spark + (target - this.spark) * Math.min(1, dt * 5);
    const sp = this.spark;
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(70,60,58,.9)'; g.lineWidth = 2 * u; g.setLineDash([2 * u, 3 * u]);
    g.beginPath(); g.moveTo(sp, y); g.lineTo(end, y); g.stroke();
    g.setLineDash([]); g.strokeStyle = 'rgba(230,186,120,1)'; g.lineWidth = 2.6 * u; g.beginPath();
    for (let x = Math.min(from, sp); x <= Math.max(from, sp); x += 3 * u) g.lineTo(x, y + Math.sin(x / u * 0.9) * 0.8 * u);
    g.stroke();
    g.globalCompositeOperation = 'lighter';
    const fl = 1 + 0.4 * Math.sin(s * 40) + 0.3 * pulse;
    const sg = g.createRadialGradient(sp, y, 0, sp, y, 12 * fl * u);
    sg.addColorStop(0, `rgba(255,255,220,${this.heat.toFixed(3)})`); sg.addColorStop(0.3, `rgba(255,180,60,${(0.8 * this.heat).toFixed(3)})`); sg.addColorStop(1, 'rgba(238,42,42,0)');
    g.fillStyle = sg; g.beginPath(); g.arc(sp, y, 12 * fl * u, 0, Math.PI * 2); g.fill();
    for (let m = (30 + 40 * k) * this.heat * dt + Math.random(); m >= 1; m--) {
      if (this.embers.length > 160) break;
      this.embers.push({ x: sp, y, vx: (Math.random() - 0.3) * 70 * u * (fromLeft ? -1 : 1), vy: (-20 - Math.random() * 50) * u,
        life: 0, max: 0.25 + Math.random() * 0.35, r: (0.8 + Math.random() * 1.2) * u, ph: 0, spark: true });
    }
  }
}
