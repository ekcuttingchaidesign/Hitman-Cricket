/**
 * Diwali's six on the big screen. "Happy" in an italic serif, written in by
 * a travelling spark, over DIWALI in wide gold foil whose letters rise in one
 * by one; behind them a rangoli mandala drawing itself and turning slowly,
 * drifting aurora light and bokeh, glowing fireworks at the sides and gold
 * dust falling; SIX · MAXIMUM in a glass pill under it so the six is still
 * told, and a row of small diyas lit from the middle out along the foot.
 *
 * It is drawn as the screen's own moments are, on a screen laid out 1024 by
 * 384 (the caller scales the context to its canvas), and it is a function of
 * how long ago the six was hit and nothing else, so the screen can paint it
 * at its fifteen frames a second and any moment can be drawn on its own.
 *
 * It keeps the screen's rules: nothing flashes the whole screen, the bursts
 * are each their own size and never closer together than a third of a
 * second (`MOST_FLASHES`), and under reduced motion one settled frame stands
 * still (`STILL_AT`). It lasts the six's moment (`DIWALI_SIX_MS`, the `six`
 * cue's) and lifts away up at the end as the screen's good news does. Its two
 * faces, Instrument Serif Italic and Unbounded, are OFL and in `src/assets`;
 * they must be loaded before it is painted (`DIWALI_FONTS`).
 */
export const DIWALI_SIX_MS = 2900;

const W = 1024, H = 384;
const SERIF = (size: number) => `italic 400 ${size}px "Instrument Serif", Georgia, serif`;
const WIDE = (size: number) => `800 ${size}px Unbounded, "Arial Black", sans-serif`;
/** What to hand `document.fonts.load` before the first paint. */
export const DIWALI_FONTS = [SERIF(96), WIDE(116)];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const fade = (t: number, from: number, to: number) => clamp01((t - from) / (to - from));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
/** Out with a little overshoot, for the letters settling. */
const easeBack = (t: number) => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

/** The beats: the letters, the word over them, the pill, the shimmer, the leave. */
const LETTERS_AT = 260, LETTER_GAP = 60, LETTER_MS = 440;
const HAPPY_AT = 640, HAPPY_MS = 520;
const PILL_AT = 1020;
const SHIMMER = [1300, 1900] as const;
const LEAVE_MS = 470;
/** The frame stood still under reduced motion: everything in, the bursts in the air. */
const STILL_AT = 1500;

const CX = 512, CY = 192;
const GOLD_STOPS: [number, string][] = [[0, '#fff7da'], [.38, '#ffd98a'], [.7, '#f4ab42'], [1, '#c8741f']];

/** The same scatter every time: a six on any phone is the same film. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A colour at an alpha. */
function tint(colour: string, alpha: number) {
  const n = parseInt(colour.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * The rockets, at the sides where the words are not: when each leaves the
 * foot, where from, and where it bursts. A third of a second apart at least.
 */
const ROCKETS = [
  { launch: 0, from: 190, x: 150, y: 112, colour: '#ffcf5a', size: 1 },
  { launch: 340, from: 840, x: 880, y: 100, colour: '#ff4fa3', size: 1 },
  { launch: 680, from: 300, x: 290, y: 64, colour: '#3fe0d0', size: .85 },
  { launch: 1020, from: 720, x: 740, y: 58, colour: '#ffcf5a', size: .85 },
  { launch: 1360, from: 120, x: 104, y: 236, colour: '#c58bff', size: .75 },
  { launch: 1700, from: 930, x: 924, y: 226, colour: '#ff9a3c', size: .75 },
];
const RISE = 360, BURST = 1100;

interface Spark { angle: number; speed: number; white: boolean }
const sparks: Spark[][] = ROCKETS.map((rocket, r) => {
  const random = seeded(301 + r * 29);
  const count = Math.round(40 * rocket.size);
  // An outer ring and a slower inner one, so each burst is a flower.
  return Array.from({ length: count }, (_, i) => {
    const inner = i % 3 === 2;
    return {
      angle: (i / count) * Math.PI * 2 + (random() - .5) * .16,
      speed: (inner ? 110 + random() * 50 : 220 + random() * 100) * rocket.size,
      white: inner || random() < .2,
    };
  });
});
function sparkAt(spark: Spark, age: number) {
  const s = age / 1000, drag = 2.1;
  const travel = spark.speed * (1 - Math.exp(-drag * s)) / drag;
  return { x: Math.cos(spark.angle) * travel, y: Math.sin(spark.angle) * travel + 30 * s * s };
}

/** Soft discs of warm light drifting up behind everything. */
const bokeh = (() => {
  const random = seeded(17);
  const warm = ['#ffcf7a', '#ff8fb8', '#ffb15a', '#ffe7b0'];
  return Array.from({ length: 22 }, () => ({
    x: random() * W, y: random() * (H + 60), r: 8 + random() * 26,
    rise: 8 + random() * 18, alpha: .07 + random() * .14, colour: warm[Math.floor(random() * warm.length)],
  }));
})();

/** Gold dust falling slowly and swaying. */
const dust = (() => {
  const random = seeded(23);
  return Array.from({ length: 30 }, () => ({
    x: random() * W, y: random() * (H + 20), fall: 16 + random() * 26, sway: 5 + random() * 10,
    phase: random() * Math.PI * 2, size: 1.6 + random() * 2.6,
  }));
})();

/** The diyas along the foot, lit from the middle out. */
const DIYAS = Array.from({ length: 9 }, (_, i) => ({ x: 80 + i * 108, lit: 560 + 70 * Math.abs(i - 4) }));

/** Little stars that pop round the lockup once it has landed. */
const GLINTS = [
  { x: 176, y: 152, at: 1080, r: 12 }, { x: 858, y: 250, at: 1240, r: 11 },
  { x: 650, y: 86, at: 1480, r: 9 }, { x: 214, y: 262, at: 1700, r: 10 },
  { x: 826, y: 140, at: 1960, r: 12 }, { x: 420, y: 92, at: 2180, r: 8 },
];

/** The words drawn on a canvas of their own, so the shimmer runs over the letters and nowhere else. */
let wordsCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
function wordsLayer(width: number, height: number) {
  if (!wordsCanvas) wordsCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(width, height);
  if (wordsCanvas.width !== width || wordsCanvas.height !== height) { wordsCanvas.width = width; wordsCanvas.height = height; }
  return wordsCanvas;
}

/**
 * Paints the Diwali six `since` milliseconds after it was hit, onto a
 * context already scaled so the screen is 1024 by 384. `still` is reduced
 * motion: one settled frame, whatever the time.
 */
export function paintDiwaliSix(ctx: CanvasRenderingContext2D, since: number, still = false) {
  const t = still ? STILL_AT : Math.max(0, since);
  const leaving = still ? 0 : fade(t, DIWALI_SIX_MS - LEAVE_MS, DIWALI_SIX_MS);
  const shown = 1 - leaving;
  ctx.save();
  sky(ctx, t, still);
  ctx.globalAlpha = shown;
  ctx.globalCompositeOperation = 'lighter';
  for (const disc of bokeh) bokehDisc(ctx, disc, t, still);
  mandala(ctx, t, still);
  for (let r = 0; r < ROCKETS.length; r++) rocket(ctx, r, t, still);
  for (const mote of dust) dustMote(ctx, mote, t, still);
  ctx.globalCompositeOperation = 'source-over';
  diyas(ctx, t, still);
  ctx.globalAlpha = 1;
  words(ctx, t, shown, -70 * easeOut(leaving), still);
  ctx.globalCompositeOperation = 'lighter';
  for (const glint of GLINTS) sparkle(ctx, glint, t, shown, still);
  ctx.restore();
}

/** Midnight going to plum at the foot, with two slow pools of colour drifting across it. */
function sky(ctx: CanvasRenderingContext2D, t: number, still: boolean) {
  const ground = ctx.createLinearGradient(0, 0, 0, H);
  ground.addColorStop(0, '#090519'); ground.addColorStop(.55, '#1d0834'); ground.addColorStop(1, '#3d0f2c');
  ctx.fillStyle = ground; ctx.fillRect(0, 0, W, H);
  const a = still ? 0 : t * .0005;
  pool(ctx, 210 + 70 * Math.sin(a * 2.2), 70 + 24 * Math.cos(a * 1.7), 360, 'rgba(255,79,163,.20)');
  pool(ctx, 820 - 70 * Math.sin(a * 1.8), 340, 400, 'rgba(255,150,50,.22)');
  pool(ctx, CX, CY, 300 * (.6 + .4 * (still ? 1 : easeOut(fade(t, 200, 900)))), 'rgba(255,186,90,.16)');
}
function pool(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, colour); g.addColorStop(1, colour.replace(/[\d.]+\)$/, '0)'));
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function bokehDisc(ctx: CanvasRenderingContext2D, disc: typeof bokeh[number], t: number, still: boolean) {
  const span = H + 60;
  const y = ((disc.y - (still ? 0 : disc.rise * t / 1000)) % span + span) % span - 30;
  const g = ctx.createRadialGradient(disc.x, y, 0, disc.x, y, disc.r);
  g.addColorStop(0, tint(disc.colour, disc.alpha)); g.addColorStop(.65, tint(disc.colour, disc.alpha * .7)); g.addColorStop(1, tint(disc.colour, 0));
  ctx.fillStyle = g; ctx.fillRect(disc.x - disc.r, y - disc.r, disc.r * 2, disc.r * 2);
}

/** A rangoli mandala behind the words, drawing itself round once and then turning slowly. */
function mandala(ctx: CanvasRenderingContext2D, t: number, still: boolean) {
  const drawn = still ? 1 : easeOut(fade(t, 120, 1150));
  if (drawn <= 0) return;
  const turn = Math.PI * 2 * drawn;
  ctx.save();
  ctx.translate(CX, CY);
  ctx.rotate(-Math.PI / 2 + (still ? 0 : t * .00011));
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,206,130,.2)'; ctx.lineWidth = 1.5;
  for (const r of [58, 172]) { ctx.beginPath(); ctx.arc(0, 0, r, 0, turn); ctx.stroke(); }
  const petals = 16;
  for (let k = 0; k < petals; k++) {
    const at = (k / petals) * Math.PI * 2;
    if (at > turn) break;
    ctx.save(); ctx.rotate(at);
    // A long petal, and a short one between it and the next.
    ctx.strokeStyle = 'rgba(255,206,130,.22)';
    ctx.beginPath(); ctx.moveTo(66, 0); ctx.quadraticCurveTo(108, 24, 152, 0); ctx.quadraticCurveTo(108, -24, 66, 0); ctx.stroke();
    ctx.rotate(Math.PI / petals);
    ctx.strokeStyle = 'rgba(255,150,190,.18)';
    ctx.beginPath(); ctx.moveTo(66, 0); ctx.quadraticCurveTo(88, 12, 112, 0); ctx.quadraticCurveTo(88, -12, 66, 0); ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(255,214,150,.42)';
  for (let k = 0; k < 40; k++) {
    const at = (k / 40) * Math.PI * 2;
    if (at > turn) break;
    ctx.beginPath(); ctx.arc(Math.cos(at) * 184, Math.sin(at) * 184, k % 2 ? 1.4 : 2.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** A rocket climbing on its trail, then its burst: sparks thrown out glowing, falling and fading. */
function rocket(ctx: CanvasRenderingContext2D, r: number, t: number, still: boolean) {
  const { launch, from, x, y, colour, size } = ROCKETS[r];
  const age = t - launch;
  if (age < 0) return;
  if (age < RISE) {
    if (still) return;
    const p = easeOut(age / RISE), back = easeOut(Math.max(0, age - 110) / RISE);
    const at = (q: number) => ({ x: from + (x - from) * q, y: H + 10 + (y - H - 10) * q });
    const head = at(p), tail = at(back);
    const trail = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
    trail.addColorStop(0, tint(colour, 0)); trail.addColorStop(1, tint('#fff1d0', .9));
    ctx.strokeStyle = trail; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y); ctx.stroke();
    ctx.fillStyle = '#fff6dc'; ctx.beginPath(); ctx.arc(head.x, head.y, 3, 0, Math.PI * 2); ctx.fill();
    return;
  }
  const burst = age - RISE;
  if (burst > BURST) return;
  const life = burst / BURST;
  const saved = ctx.globalAlpha;
  // Its own bloom in its own colour: never the whole screen.
  if (burst < 300) {
    const reach = 84 * size;
    const bloom = ctx.createRadialGradient(x, y, 0, x, y, reach);
    bloom.addColorStop(0, tint(colour, .4 * (1 - burst / 300))); bloom.addColorStop(1, tint(colour, 0));
    ctx.fillStyle = bloom; ctx.fillRect(x - reach, y - reach, reach * 2, reach * 2);
  }
  ctx.lineCap = 'round';
  const fadeOut = 1 - Math.pow(life, 1.5);
  for (const spark of sparks[r]) {
    const head = sparkAt(spark, burst), tail = sparkAt(spark, Math.max(0, burst - (still ? 70 : 140)));
    // A wide faint stroke under a fine bright one: a glow without a blur.
    ctx.globalAlpha = saved * fadeOut * .22;
    ctx.strokeStyle = colour; ctx.lineWidth = 6 * size;
    ctx.beginPath(); ctx.moveTo(x + tail.x, y + tail.y); ctx.lineTo(x + head.x, y + head.y); ctx.stroke();
    ctx.globalAlpha = saved * fadeOut;
    ctx.strokeStyle = spark.white ? '#fff4d8' : colour; ctx.lineWidth = 2 * size;
    ctx.beginPath(); ctx.moveTo(x + tail.x, y + tail.y); ctx.lineTo(x + head.x, y + head.y); ctx.stroke();
    if (life > .5) {
      ctx.globalAlpha = saved * (1 - life) * (.5 + .5 * Math.sin(burst * .018 + spark.angle * 7));
      ctx.fillStyle = '#fff4d8';
      ctx.beginPath(); ctx.arc(x + head.x, y + head.y, 1.8, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = saved;
}

function dustMote(ctx: CanvasRenderingContext2D, mote: typeof dust[number], t: number, still: boolean) {
  const span = H + 20;
  const y = ((mote.y + (still ? 0 : mote.fall * t / 1000)) % span) - 10;
  const x = mote.x + mote.sway * Math.sin((still ? 0 : t * .0016) + mote.phase);
  const saved = ctx.globalAlpha;
  ctx.globalAlpha = saved * (still ? .7 : fade(t, 150, 700) * (.45 + .4 * Math.sin(t * .004 + mote.phase)));
  star(ctx, x, y, mote.size * 1.6, '#ffe2a0');
  ctx.globalAlpha = saved;
}

/** Small modern diyas: a flat gold bowl and a glowing flame, lit from the middle out. */
function diyas(ctx: CanvasRenderingContext2D, t: number, still: boolean) {
  const base = H - 22;
  // The light along the foot, coming up as they are lit.
  const lit = DIYAS.reduce((sum, d) => sum + (still ? 1 : easeOut(fade(t, d.lit, d.lit + 240))), 0) / DIYAS.length;
  if (lit > 0) {
    const glow = ctx.createLinearGradient(0, H, 0, H - 110);
    glow.addColorStop(0, `rgba(255,150,60,${.3 * lit})`); glow.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, H - 110, W, 110);
  }
  DIYAS.forEach((diya, i) => {
    const up = still ? 1 : easeOut(fade(t, diya.lit, diya.lit + 240));
    const { x } = diya;
    if (up > 0) {
      const breathe = still ? 1 : 1 + .08 * Math.sin(t * .012 + i * 1.9);
      const height = 20 * up * breathe;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(x, base - 8, 0, x, base - 8, 34 * up);
      halo.addColorStop(0, 'rgba(255,175,70,.55)'); halo.addColorStop(1, 'rgba(255,175,70,0)');
      ctx.fillStyle = halo; ctx.fillRect(x - 34, base - 42, 68, 68);
      ctx.restore();
      const flame = ctx.createLinearGradient(x, base - height - 4, x, base - 3);
      flame.addColorStop(0, '#ff8a2b'); flame.addColorStop(.5, '#ffd86a'); flame.addColorStop(1, '#fffbe8');
      ctx.fillStyle = flame;
      const lean = still ? 0 : 1.6 * Math.sin(t * .008 + i);
      ctx.beginPath();
      ctx.moveTo(x + lean, base - height - 3);
      ctx.bezierCurveTo(x + 7 * up, base - height * .4, x + 6 * up, base - 3, x, base - 3);
      ctx.bezierCurveTo(x - 6 * up, base - 3, x - 7 * up, base - height * .4, x + lean, base - height - 3);
      ctx.fill();
    }
    const bowl = ctx.createLinearGradient(x - 18, 0, x + 18, 0);
    bowl.addColorStop(0, '#b8651e'); bowl.addColorStop(.5, '#ffd27a'); bowl.addColorStop(1, '#b8651e');
    ctx.fillStyle = bowl;
    ctx.beginPath(); ctx.moveTo(x - 19, base - 2); ctx.quadraticCurveTo(x, base + 16, x + 19, base - 2); ctx.closePath(); ctx.fill();
  });
}

/** The lockup: "Happy" over DIWALI, the pill under, drawn on the words' layer with the shimmer, then laid on. */
function words(ctx: CanvasRenderingContext2D, t: number, alpha: number, drift: number, still: boolean) {
  if (alpha <= 0 || (!still && t < LETTERS_AT)) return;
  const m = ctx.getTransform();
  const px = Math.hypot(m.a, m.b) || 1;
  const layer = wordsLayer(Math.ceil(W * px), Math.ceil(H * px));
  const w = layer.getContext('2d') as CanvasRenderingContext2D;
  w.setTransform(1, 0, 0, 1, 0, 0);
  w.clearRect(0, 0, layer.width, layer.height);
  w.setTransform(px, 0, 0, px, 0, drift * px);
  diwali(w, t, px, still);
  happy(w, t, px, still);
  pill(w, t, still);
  // A pale band across everything on the layer, once, after it has landed.
  const run = still ? -1 : fade(t, SHIMMER[0], SHIMMER[1]);
  if (run > 0 && run < 1) {
    w.save();
    w.globalCompositeOperation = 'source-atop';
    const at = 40 + run * (W - 80);
    const band = w.createLinearGradient(at - 110, 0, at + 110, 0);
    band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(.5, 'rgba(255,255,245,.75)'); band.addColorStop(1, 'rgba(255,255,255,0)');
    w.fillStyle = band;
    w.transform(1, 0, -.4, 1, CY * .4, 0);
    w.fillRect(at - 140, 0, 280, H);
    w.restore();
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = alpha;
  ctx.drawImage(layer as CanvasImageSource, 0, 0);
  ctx.restore();
}

/** Where DIWALI's baseline sits, and how its letters are spread. */
const DIWALI_BASE = 238, TRACKING = 16;
function goldFill(w: CanvasRenderingContext2D, top: number, bottom: number) {
  const gold = w.createLinearGradient(0, top, 0, bottom);
  for (const [at, colour] of GOLD_STOPS) gold.addColorStop(at, colour);
  return gold;
}

/** DIWALI in wide gold, each letter rising in a beat after the last and settling with a little overshoot. */
function diwali(w: CanvasRenderingContext2D, t: number, px: number, still: boolean) {
  const text = 'DIWALI';
  w.save();
  w.font = WIDE(116); w.textAlign = 'center'; w.textBaseline = 'alphabetic';
  const widths = [...text].map(letter => w.measureText(letter).width);
  const total = widths.reduce((a, b) => a + b, 0) + TRACKING * (text.length - 1);
  const fit = Math.min(1, 820 / total);
  let left = CX - total * fit / 2;
  [...text].forEach((letter, i) => {
    const centre = left + widths[i] * fit / 2;
    left += (widths[i] + TRACKING) * fit;
    const p = still ? 1 : clamp01((t - LETTERS_AT - i * LETTER_GAP) / LETTER_MS);
    if (p <= 0) return;
    const settle = easeBack(p);
    w.save();
    w.globalAlpha = easeOut(Math.min(1, p * 1.8));
    w.translate(centre, DIWALI_BASE + (1 - settle) * 54);
    const grow = 1 + (1 - settle) * .3;
    w.scale(fit * grow, fit * grow);
    w.shadowColor = 'rgba(255,150,50,.65)'; w.shadowBlur = 30 * px;
    w.fillStyle = goldFill(w, -92, 4);
    w.fillText(letter, 0, 0);
    w.shadowBlur = 0;
    w.fillText(letter, 0, 0);
    w.restore();
  });
  w.restore();
}

/** "Happy" in the italic serif, written in left to right behind a travelling spark. */
function happy(w: CanvasRenderingContext2D, t: number, px: number, still: boolean) {
  const p = still ? 1 : easeOut(fade(t, HAPPY_AT, HAPPY_AT + HAPPY_MS));
  if (p <= 0) return;
  w.save();
  w.font = SERIF(100); w.textAlign = 'center'; w.textBaseline = 'alphabetic';
  const width = w.measureText('Happy').width;
  const x = CX, y = 138, left = x - width / 2 - 14;
  const edge = left + (width + 36) * p;
  w.beginPath(); w.rect(0, 0, edge, H); w.clip();
  w.shadowColor = 'rgba(255,90,170,.55)'; w.shadowBlur = 24 * px;
  w.fillStyle = goldFill(w, y - 70, y + 20);
  w.fillText('Happy', x, y);
  w.shadowBlur = 0;
  w.fillText('Happy', x, y);
  w.restore();
  if (p < 1) {
    // The spark writing it.
    w.save();
    w.globalCompositeOperation = 'lighter';
    const glow = w.createRadialGradient(edge, y - 30, 0, edge, y - 30, 40);
    glow.addColorStop(0, 'rgba(255,230,170,.75)'); glow.addColorStop(1, 'rgba(255,230,170,0)');
    w.fillStyle = glow; w.fillRect(edge - 40, y - 70, 80, 80);
    star(w, edge, y - 30, 16, '#fffaf0');
    w.restore();
  }
}

/** SIX · MAXIMUM in a glass pill with a gold edge. */
function pill(w: CanvasRenderingContext2D, t: number, still: boolean) {
  const p = still ? 1 : easeOut(fade(t, PILL_AT, PILL_AT + 280));
  if (p <= 0) return;
  w.save();
  w.globalAlpha = p;
  w.translate(CX, 292 + (1 - p) * 12);
  w.font = WIDE(21); w.textBaseline = 'middle'; w.textAlign = 'left';
  const spaced = w as CanvasRenderingContext2D & { letterSpacing?: string };
  spaced.letterSpacing = '6px';
  const left = 'SIX', right = 'MAXIMUM', gap = 38;
  const lw = w.measureText(left).width, rw = w.measureText(right).width;
  const inner = lw + gap + rw, wide = inner + 64, tall = 44;
  w.beginPath(); w.roundRect(-wide / 2, -tall / 2, wide, tall, tall / 2);
  w.fillStyle = 'rgba(28,10,48,.62)'; w.fill();
  const edge = w.createLinearGradient(-wide / 2, 0, wide / 2, 0);
  edge.addColorStop(0, 'rgba(255,210,120,.25)'); edge.addColorStop(.5, 'rgba(255,224,160,.95)'); edge.addColorStop(1, 'rgba(255,210,120,.25)');
  w.strokeStyle = edge; w.lineWidth = 1.6; w.stroke();
  w.fillStyle = '#fff1d6';
  const start = -inner / 2 + 3;
  w.fillText(left, start, 1);
  w.fillText(right, start + lw + gap, 1);
  spaced.letterSpacing = '0px';
  star(w, start + lw + gap / 2 - 3, 0, 8, '#ffcb5c');
  w.restore();
}

/** A four-pointed star. */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

/** A glint popping up and away round the lockup, half a second each. */
function sparkle(ctx: CanvasRenderingContext2D, glint: typeof GLINTS[number], t: number, alpha: number, still: boolean) {
  const age = still ? 250 : t - glint.at;
  if (age < 0 || age > 520 || alpha <= 0) return;
  const size = Math.sin(Math.PI * age / 520);
  const saved = ctx.globalAlpha;
  ctx.globalAlpha = alpha * size;
  star(ctx, glint.x, glint.y, glint.r * size, '#fff3cf');
  ctx.globalAlpha = saved;
}
