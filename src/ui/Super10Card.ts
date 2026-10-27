/**
 * Super10's card on Choose a mode, on release day: the coming-soon card made
 * the mode's PLAY card (Figma section 20, 616:5495; the claude.ai artifact
 * "Super10 PLAY Card" is the approved motion). The whole card plays Super10.
 * NEW for a browser that has not batted one, its best and place once it has,
 * as the posters say theirs.
 *
 * Every four seconds the bat in the picture charges, an arc jumps from the
 * blade to the PLAY key, the key flashes and pops, a ring goes out from it and
 * a light crosses the logo, and sparks float off. The first time a browser
 * sees the card it slams in with a ring of arcs round the logo, once. All of it
 * is drawn from one clock (`frame`), the arcs on a canvas between the picture
 * and the logo, redrawn every two frames as the stings' are; it runs only
 * while Choose a mode is open, and under reduced motion the card stands still.
 */

const LOOP = 4000;
/** The release-day entrance's length, before the loop begins. */
const INTRO_MS = 900;
const SEEN_KEY = 'hitman-super10-card';
const TRI = '<svg viewBox="0 0 14 16" aria-hidden="true"><path d="M2 1.5 12.5 8 2 14.5Z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';

/** The card, drawn once into Choose a mode; its words are `mode-super10-tag` and `mode-super10-line`. */
export function super10CardMarkup(picture: string, logo: string): string {
  return `<button id="mode-super10" class="ms-super10" type="button" data-mode="SUPER10" aria-label="Play Super10">
              <img class="ms-art" src="${picture}" alt="" decoding="async">
              <canvas class="ms-super10-fx" aria-hidden="true"></canvas>
              <img class="ms-super10-logo" src="${logo}" alt="" decoding="async">
              <span class="ms-super10-sweep" aria-hidden="true"></span>
              <span class="ms-super10-row"><span id="mode-super10-tag" class="ms-super10-tag">NEW</span><span id="mode-super10-line" class="ms-super10-line">10 overs · 5 wickets</span></span>
              <span class="ms-super10-ring" aria-hidden="true"></span>
              <span class="ms-super10-play" aria-hidden="true">${TRI}PLAY</span>
            </button>`;
}

/** What the card says: NEW and the format, or the best and the place on the board. */
export function super10CardWords(best: string | null, rank: number | null): { tag: string; line: string } {
  if (!best) return { tag: 'NEW', line: '10 overs · 5 wickets' };
  return { tag: `BEST ${best}`, line: rank ? `#${rank} on the board` : '10 overs · 5 wickets' };
}

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ramp = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
/** A spring with one overshoot, from 0 to 1. */
const spring = (x: number) => (x >= 1 ? 1 : 1 - Math.exp(-6 * x) * Math.cos(7.5 * x));
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Point = [number, number];
/** A jagged arc from a to b, its kinks tapering to nothing at both ends. */
function arcPoints(a: Point, b: Point, n: number, amp: number, rand: () => number, bow = 0): Point[] {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, taper = Math.sin(Math.PI * t), off = i === 0 || i === n ? 0 : (rand() - 0.5) * 2 * amp * taper + bow * taper;
    return [a[0] + dx * t + nx * off, a[1] + dy * t + ny * off] as Point;
  });
}
/** Drawn as the stings draw it: a violet haze, a Volt glow, a Volt line and a white core. */
function strokeArc(ctx: CanvasRenderingContext2D, pts: Point[], k: number, alpha: number, upTo = 1) {
  const last = Math.max(1, Math.round((pts.length - 1) * upTo));
  const trace = () => { ctx.beginPath(); ctx.moveTo(pts[0][0] * k, pts[0][1] * k); for (let i = 1; i <= last; i++) ctx.lineTo(pts[i][0] * k, pts[i][1] * k); };
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = alpha * 0.55; ctx.strokeStyle = '#8b5cf6'; ctx.lineWidth = 4.2 * k; ctx.shadowColor = '#8b5cf6'; ctx.shadowBlur = 6 * k; trace(); ctx.stroke();
  ctx.globalAlpha = alpha * 0.9; ctx.strokeStyle = '#c6ff1a'; ctx.lineWidth = 2.2 * k; ctx.shadowColor = '#c6ff1a'; ctx.shadowBlur = 9 * k; trace(); ctx.stroke();
  ctx.shadowBlur = 0; ctx.globalAlpha = alpha; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.9 * k; trace(); ctx.stroke();
  ctx.restore();
}
function spark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, k: number, alpha: number) {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(x * k, y * k, 0, x * k, y * k, r * 2.6 * k);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#c6ff1a'); g.addColorStop(1, '#c6ff1a00');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x * k, y * k, r * 2.6 * k, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

// Where things are on the card, in card units (362 × 110): the blade, from the gloves to where it leaves the card's top.
const BAT = { glove: [296, 46] as Point, top: [324, -2] as Point };
const STRIKE_FROM: Point = [318, 6];

/** The card's motion, attached to the drawn card. */
export class Super10Spark {
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly canvas: HTMLCanvasElement;
  private readonly play: HTMLElement;
  private readonly ring: HTMLElement;
  private readonly sweep: HTMLElement;
  private k = 1;
  private dpr = 1;
  private key = { x: 316, y: 74, w: 64, h: 24 };
  private raf = 0;

  constructor(private readonly card: HTMLElement) {
    this.canvas = card.querySelector<HTMLCanvasElement>('.ms-super10-fx')!;
    this.ctx = this.canvas.getContext('2d');
    this.play = card.querySelector<HTMLElement>('.ms-super10-play')!;
    this.ring = card.querySelector<HTMLElement>('.ms-super10-ring')!;
    this.sweep = card.querySelector<HTMLElement>('.ms-super10-sweep')!;
  }

  /** Choose a mode is up: measure, and run. The entrance only the first time this browser sees the card. */
  start() {
    if (this.raf) return;
    this.measure();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { this.rest(); return; }
    let seen = true;
    try { seen = !!localStorage.getItem(SEEN_KEY); localStorage.setItem(SEEN_KEY, '1'); } catch { /* Then no entrance. */ }
    const started = performance.now();
    // The loop's clock starts once the entrance, if there is one, is over.
    const loopFrom = seen ? started : started + INTRO_MS;
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      if (now < loopFrom) this.frame(0, now - started);
      else this.frame((now - loopFrom) % LOOP, null);
    };
    this.raf = requestAnimationFrame(tick);
  }
  /** Choose a mode put away: stopped, and left as it stands at rest. */
  stop() {
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.rest();
  }

  /** The canvas sized to the card, and the key's place: off the layout, so a card mid-entrance measures true. */
  private measure() {
    const w = this.card.clientWidth || 362;
    this.k = w / 362;
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(this.card.clientHeight * this.dpr);
    const p = this.play;
    this.key = { x: (p.offsetLeft + p.offsetWidth / 2) / this.k, y: p.offsetTop / this.k, w: p.offsetWidth / this.k, h: p.offsetHeight / this.k };
    Object.assign(this.ring.style, { left: `${p.offsetLeft}px`, top: `${p.offsetTop}px`, width: `${p.offsetWidth}px`, height: `${p.offsetHeight}px` });
  }

  /** One frame, wholly from the loop's clock (t, ms) and the entrance's (ms, or null). */
  frame(t: number, intro: number | null) {
    const ctx = this.ctx; if (!ctx) return;
    if (this.canvas.width !== Math.round(this.card.clientWidth * this.dpr)) this.measure();
    const k = this.k * this.dpr, key = this.key;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const step = Math.floor(t / 66);
    const charge = ramp(t, 400, 900) * (1 - ramp(t, 1000, 1350));
    this.card.style.setProperty('--charge', charge.toFixed(3));

    // Ambient: a few motes drifting off the bat, always.
    const amb = seeded(99);
    for (let i = 0; i < 5; i++) {
      const life = 2600 + amb() * 1400, ph = ((t + amb() * life) % life) / life;
      spark(ctx, 286 + amb() * 50 + Math.sin(ph * 6 + i) * 4, 50 - ph * 44, 0.9 + amb() * 0.6, k, 0.45 * Math.sin(Math.PI * ph));
    }
    // The charge: short arcs crawling up the blade.
    if (charge > 0.02) {
      const r = seeded(1000 + step);
      for (let i = 0, n = 1 + Math.round(charge * 3); i < n; i++) {
        const u = r(), len = 0.22 + r() * 0.25;
        const at = (s: number): Point => [BAT.glove[0] + (BAT.top[0] - BAT.glove[0]) * s + (r() - 0.5) * 8, BAT.glove[1] + (BAT.top[1] - BAT.glove[1]) * s];
        strokeArc(ctx, arcPoints(at(u * 0.7), at(Math.min(1, u * 0.7 + len)), 5, 5, r), k, charge * (0.6 + r() * 0.4));
      }
    }
    // The strike: one arc from the blade to the key, grown in its first 60 ms.
    if (t >= 900 && t < 1180) {
      const r = seeded(5000 + Math.floor(t / 50));
      const grow = easeOut(ramp(t, 900, 960)), fade = 1 - ramp(t, 1060, 1180);
      strokeArc(ctx, arcPoints(STRIKE_FROM, [key.x - 4, key.y + 1], 9, 8, r, 11), k, fade, grow);
      if (t > 940) {
        strokeArc(ctx, arcPoints([key.x - 4, key.y + 2], [key.x - 22, key.y - 14], 3, 4, r), k, fade * 0.8);
        strokeArc(ctx, arcPoints([key.x + 6, key.y + 2], [key.x + 22, key.y - 12], 3, 4, r), k, fade * 0.8);
      }
    }
    if (t >= 955 && t < 1150) { const h = ramp(t, 955, 1150); spark(ctx, key.x - 4, key.y - 3, 9 * (1 - h) + 3, k, 1 - h); }
    this.play.classList.toggle('is-flash', t >= 960 && t < 1027);
    const pop = t < 990 ? 1 : 1 + 0.08 * Math.sin(Math.PI * clamp((t - 990) / 320));
    this.play.style.transform = `scale(${pop.toFixed(4)})`;
    // The pulse: the ring out from the key; the sweep over the logo.
    const rp = ramp(t, 1050, 1600);
    this.ring.style.opacity = rp > 0 && rp < 1 ? (1 - easeOut(rp) * 0.85).toFixed(3) : '0';
    this.ring.style.transform = `scale(${(1 + 0.45 * easeOut(rp)).toFixed(3)}, ${(1 + 1.0 * easeOut(rp)).toFixed(3)})`;
    const sw = ramp(t, 1100, 1700);
    this.sweep.style.opacity = sw > 0 && sw < 1 ? '1' : '0';
    this.sweep.style.left = `${-28 + 72 * (sw < 0.5 ? 2 * sw * sw : 1 - Math.pow(-2 * sw + 2, 2) / 2)}%`;
    // The settle: sparks thrown up off the key and the blade, floating out.
    if (t >= 960 && t < 2500) {
      const r = seeded(77);
      for (let i = 0; i < 11; i++) {
        const fromKey = i < 7, ox = fromKey ? key.x + (r() - 0.5) * key.w * 0.8 : 300 + r() * 22, oy = fromKey ? key.y : 30 + r() * 14;
        const vx = (r() - 0.5) * 46, vy = -(26 + r() * 44), start = 960 + r() * 120, life = 900 + r() * 600;
        const p = (t - start) / life; if (p <= 0 || p >= 1) continue;
        const s = (t - start) / 1000;
        spark(ctx, ox + vx * s, oy + vy * s + 10 * s * s, 0.8 + r() * 0.9, k, (1 - p) * 0.9);
      }
    }
    // The release-day entrance, once: in from 1.15 with one overshoot, a ring of arcs round the logo.
    if (intro !== null) {
      this.card.style.transform = `scale(${(1.15 - 0.15 * spring(clamp(intro / 700))).toFixed(4)})`;
      this.card.style.opacity = clamp(intro / 150).toFixed(3);
      if (intro > 140 && intro < 900) {
        const r = seeded(3000 + Math.floor(intro / 66)), grow = easeOut(ramp(intro, 140, 520)), fade = 1 - ramp(intro, 560, 900);
        const R = 30 + 44 * grow;
        for (let j = 0; j < 7; j++) {
          const a0 = (j / 7) * Math.PI * 2 + r() * 0.3, a1 = a0 + 0.45 + r() * 0.25;
          const pts = Array.from({ length: 6 }, (_, q) => { const a = a0 + ((a1 - a0) * q) / 5, rr = R + (r() - 0.5) * 8; return [83 + rr * Math.cos(a), 64 + rr * 0.55 * Math.sin(a)] as Point; });
          strokeArc(ctx, pts, k, fade);
        }
      }
    } else if (this.card.style.transform) { this.card.style.transform = ''; this.card.style.opacity = ''; }
  }

  /** Still, as K1. */
  private rest() {
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.play.style.transform = ''; this.ring.style.opacity = '0'; this.sweep.style.opacity = '0';
    this.card.style.transform = ''; this.card.style.opacity = ''; this.card.style.setProperty('--charge', '0');
    this.play.classList.remove('is-flash');
  }
}
