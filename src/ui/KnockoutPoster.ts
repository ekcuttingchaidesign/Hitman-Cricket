/**
 * Super Knockout's home as a motion poster (Figma Battle Royale page, section
 * 55): the picture's own floodlights and beams, lit over it in CSS
 * (`.ko-stage`, `.ko-lamp`, `.ko-beams`, `.ko-haze` in `src/knockout.css`),
 * and what floats in the air painted here on one canvas (`.ko-air`): dust
 * hanging in the beams and brighter inside them, embers lifting off the turf
 * round the batter, and phone flashes popping in the stands. Every particle
 * is moved by the time since the last frame, so a slow phone sees the same
 * drift at fewer frames. It runs only while the home is up and the page is on
 * screen, and not at all under reduced motion, where the poster is the still
 * picture with its lights on.
 *
 * Places are the picture's, in design pixels of the 402-wide phone (`--u`):
 * the picture is 1024 by 1536 laid 402 wide and 50 up, so a point (x, y) in
 * it is (x, y) * 402 / 1024, less 50 down.
 */
const PIC = 402 / 1024;
const at = (x: number, y: number) => ({ x: x * PIC, y: y * PIC - 50 });

/** The six beams' lamps along the roof, and where the beams reach the turf. */
const BEAMS = [160, 243, 328, 697, 777, 857].map(x => at(x, 430).x);
const BEAM_TOP = at(0, 430).y, BEAM_FOOT = at(0, 820).y;
/** The turf the batter stands on, where the embers lift from. */
const TURF = at(0, 875).y;
/** The stands either side, where the flashes go off: clear of the beams and the batter. */
const STANDS = { top: at(0, 450).y, foot: at(0, 600).y, left: [4, 52], right: [350, 398] } as const;
/** How far down the canvas reaches: past the mark, under the fade. */
export const AIR_HEIGHT = 470;

interface Mote { x: number; y: number; r: number; a: number; phase: number; speed: number; drift: number }
interface Ember { x: number; y: number; vy: number; r: number; life: number; age: number; sway: number; phase: number; red: boolean }
interface Flash { x: number; y: number; age: number; life: number; r: number }

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class KnockoutPoster {
  private raf = 0;
  private last = 0;
  private motes: Mote[] = [];
  private embers: Ember[] = [];
  private flashes: Flash[] = [];
  private nextFlash = 0;
  private readonly ctx: CanvasRenderingContext2D | null;
  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d');
  }
  get running() { return this.raf !== 0; }
  start() {
    if (this.raf || !this.ctx || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.motes = Array.from({ length: 60 }, () => this.mote(rand(0, AIR_HEIGHT)));
    this.embers = Array.from({ length: 16 }, () => { const e = this.ember(); e.age = rand(0, e.life); return e; });
    this.flashes = [];
    this.nextFlash = 0;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }
  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  private mote(y: number): Mote {
    return { x: rand(0, 402), y, r: rand(.4, 1.3), a: rand(.16, .48), phase: rand(0, Math.PI * 2), speed: rand(.4, 1.2), drift: rand(-5, 5) };
  }
  private ember(): Ember {
    // Mostly from round his boots, some from further along the turf.
    const near = Math.random() < .6;
    const x = near ? 201 + rand(-70, 70) : rand(30, 372);
    return { x, y: TURF + rand(-14, 6), vy: rand(16, 34), r: rand(.6, 1.5), life: rand(3.2, 6.5), age: 0, sway: rand(4, 12), phase: rand(0, Math.PI * 2), red: Math.random() < .3 };
  }
  /** How much of a beam's light a point stands in: 1 on a beam's line, 0 outside them all. */
  private inBeam(x: number, y: number) {
    if (y < BEAM_TOP || y > BEAM_FOOT) return 0;
    const down = (y - BEAM_TOP) / (BEAM_FOOT - BEAM_TOP), half = 3 + down * 16;
    let most = 0;
    for (const [i, top] of BEAMS.entries()) {
      const lean = (i < 3 ? -1 : 1) * down * 10;
      const off = Math.abs(x - (top + lean)) / half;
      if (off < 1) most = Math.max(most, 1 - off);
    }
    return most * (1 - down * .4);
  }
  private readonly frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    if (document.hidden) { this.last = now; return; }
    const dt = Math.min(.05, (now - this.last) / 1000);
    this.last = now;
    const ctx = this.ctx!, c = this.canvas;
    const dpr = Math.min(2, devicePixelRatio || 1), wide = c.clientWidth, high = c.clientHeight;
    if (!wide || !high) return;
    if (c.width !== Math.round(wide * dpr) || c.height !== Math.round(high * dpr)) { c.width = Math.round(wide * dpr); c.height = Math.round(high * dpr); }
    const u = wide / 402, t = now / 1000;
    ctx.setTransform(dpr * u, 0, 0, dpr * u, 0, 0);
    ctx.clearRect(0, 0, 402, AIR_HEIGHT);
    ctx.globalCompositeOperation = 'lighter';

    // Dust, hanging and turning over slowly, lit where a beam falls through it.
    for (const m of this.motes) {
      m.x += (m.drift + Math.sin(t * .5 * m.speed + m.phase) * 4) * dt;
      m.y += (Math.cos(t * .4 * m.speed + m.phase) * 3 - 1.2) * dt;
      if (m.x < -4) m.x += 410; else if (m.x > 406) m.x -= 410;
      if (m.y < -4) Object.assign(m, this.mote(AIR_HEIGHT + 2));
      const lit = this.inBeam(m.x, m.y);
      const twinkle = .65 + .35 * Math.sin(t * 2.2 * m.speed + m.phase * 3);
      const a = Math.min(.9, m.a * twinkle * (1 + lit * 2.4));
      ctx.fillStyle = `rgba(255,${lit > .2 ? 214 : 190},${lit > .2 ? 196 : 170},${a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r * (1 + lit * .5), 0, Math.PI * 2); ctx.fill();
    }

    // Embers, off the turf and up, swaying, cooling from amber to red as they go.
    for (const [i, e] of this.embers.entries()) {
      e.age += dt;
      if (e.age >= e.life) { this.embers[i] = this.ember(); continue; }
      const k = e.age / e.life;
      e.y -= e.vy * dt;
      const x = e.x + Math.sin(e.age * 1.6 + e.phase) * e.sway * k;
      const fade = Math.min(1, e.age / .5) * (1 - k) ** 1.4;
      const g = e.red ? 60 : Math.round(170 - k * 110);
      ctx.fillStyle = `rgba(255,${g},40,${(fade * .22).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, e.y, e.r * 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,${g + 50},${e.red ? 70 : 110},${(fade * .95).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
    }

    // A phone's flash now and then in the stands, either side of the beams.
    if (now >= this.nextFlash) {
      const side = Math.random() < .5 ? STANDS.left : STANDS.right;
      this.flashes.push({ x: rand(side[0], side[1]), y: rand(STANDS.top, STANDS.foot), age: 0, life: rand(.16, .3), r: rand(1.4, 2.6) });
      this.nextFlash = now + rand(140, 520);
    }
    this.flashes = this.flashes.filter(f => (f.age += dt) < f.life);
    for (const f of this.flashes) {
      const k = f.age / f.life, a = k < .25 ? k / .25 : 1 - (k - .25) / .75, r = f.r * (.6 + a * .6);
      ctx.fillStyle = `rgba(255,240,235,${(a * .25).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(f.x, f.y, r * 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${(a * .9).toFixed(3)})`;
      ctx.fillRect(f.x - r * 1.8, f.y - .25, r * 3.6, .5);
      ctx.fillRect(f.x - .25, f.y - r * 1.8, .5, r * 3.6);
    }
    ctx.globalCompositeOperation = 'source-over';
  };
}
