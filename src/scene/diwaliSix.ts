/**
 * Diwali's six on the big screen: HAPPY DIWALI in gold under a marigold
 * toran, rockets going up and bursting behind it, and a row of diyas lit
 * along the foot from the middle out. It is drawn as the screen's own
 * moments are, on a screen laid out 1024 by 384 (the caller scales the
 * context to its canvas), and it is a function of how long ago the six was
 * hit and nothing else, so the screen can paint it at its fifteen frames a
 * second and any moment of it can be drawn on its own.
 *
 * It keeps the screen's rules: nothing flashes the whole screen, a burst's
 * glow is its own and a few of them never come closer together than a
 * third of a second (`MOST_FLASHES`), and under reduced motion one settled
 * frame stands still (`STILL_AT`). It lasts the six's moment
 * (`DIWALI_SIX_MS`, the `six` cue's), and lifts away up at the end as the
 * screen's good news does.
 */
export const DIWALI_SIX_MS = 2900;

const W = 1024, H = 384;
const JARO = (size: number) => `${size}px Jaro, "Arial Narrow", Impact, sans-serif`;
const SATOSHI = (size: number) => `800 ${size}px Satoshi, "Segoe UI", Arial, sans-serif`;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const fade = (t: number, from: number, to: number) => clamp01((t - from) / (to - from));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** When the words land, and when the whole lot starts to lift away. */
const WORDS_AT = 380, LINE_AT = 760, LEAVE_MS = 470;
/** The frame stood still under reduced motion: the words settled, every diya lit, bursts in the air. */
const STILL_AT = 1300;

/** The screen's slam, as `slamScale` in `arena.ts`: from big, overshooting once, settled in 370ms. */
const SLAM_MS = 370;
function slam(since: number) {
  if (since >= SLAM_MS) return 1;
  const t = since / SLAM_MS;
  const out = 1 - Math.pow(2, -10 * Math.min(1, t / .75));
  return t < .75 ? 2.2 - (2.2 - .94) * out : .94 + .06 * ((t - .75) / .25);
}

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

const GOLD = '#ffd34d', MAGENTA = '#ff4fa3', CYAN = '#4fe3ff', GREEN = '#7dff8a', ORANGE = '#ff8a2b';

/**
 * Each rocket: when it leaves the foot of the screen, where from, and where
 * it bursts. Bursts stand at least 340ms apart (three a second at the
 * most), the first three behind the words, the later, smaller ones up in
 * the corners.
 */
const ROCKETS = [
  { launch: 40, from: 250, x: 212, y: 116, colour: GOLD, size: 1 },
  { launch: 380, from: 790, x: 816, y: 102, colour: MAGENTA, size: 1 },
  { launch: 720, from: 520, x: 512, y: 72, colour: CYAN, size: 1.15 },
  { launch: 1120, from: 150, x: 120, y: 86, colour: GREEN, size: .8 },
  { launch: 1470, from: 880, x: 906, y: 80, colour: GOLD, size: .8 },
  { launch: 1820, from: 330, x: 330, y: 58, colour: ORANGE, size: .7 },
];
/** How long a rocket climbs, and how long its burst lasts. */
const RISE = 380, BURST = 1050;

interface Spark { angle: number; speed: number; white: boolean }
const sparks: Spark[][] = ROCKETS.map((rocket, r) => {
  const random = seeded(101 + r * 17);
  const count = Math.round(44 * rocket.size);
  // An outer ring and a slower inner one, so a burst is a full flower rather than a ring of dashes.
  return Array.from({ length: count }, (_, i) => {
    const inner = i % 3 === 2;
    return {
      angle: (i / count) * Math.PI * 2 + (random() - .5) * .18,
      speed: (inner ? 120 + random() * 60 : 240 + random() * 110) * rocket.size,
      white: inner || random() < .22,
    };
  });
});

/** Where a spark has got to `age` milliseconds into its burst: thrown out, slowed by the air, falling. */
function sparkAt(spark: Spark, age: number) {
  const s = age / 1000, drag = 2.1;
  const travel = spark.speed * (1 - Math.exp(-drag * s)) / drag;
  return { x: Math.cos(spark.angle) * travel, y: Math.sin(spark.angle) * travel + 34 * s * s };
}

/** A few points of light in the sky, twinkling slowly. */
const stars = (() => {
  const random = seeded(7);
  return Array.from({ length: 46 }, () => ({ x: random() * W, y: random() * H * .7, r: .8 + random() * 1.6, phase: random() * Math.PI * 2 }));
})();

/** The diyas along the foot, lit from the middle out. */
const DIYAS = Array.from({ length: 7 }, (_, i) => ({
  x: 112 + i * (800 / 6),
  width: i % 2 ? 56 : 68,
  lit: 640 + 95 * Math.abs(i - 3),
}));

/** The sparkles that pop round the words once they have landed. */
const GLINTS = [
  { x: 156, y: 128, at: 980, r: 14 }, { x: 872, y: 214, at: 1160, r: 12 },
  { x: 560, y: 96, at: 1420, r: 10 }, { x: 246, y: 230, at: 1640, r: 11 },
  { x: 790, y: 112, at: 1900, r: 13 }, { x: 430, y: 236, at: 2120, r: 9 },
];

/** The words drawn on a canvas of their own, so the shimmer runs over the letters and nowhere else. */
let wordsCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
function wordsLayer(width: number, height: number) {
  if (!wordsCanvas) {
    wordsCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(width, height);
  }
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
  sky(ctx, t);
  ctx.globalAlpha = shown;
  for (let r = 0; r < ROCKETS.length; r++) rocket(ctx, r, t, still);
  diyaGlow(ctx, t);
  toran(ctx, t, still);
  for (let i = 0; i < DIYAS.length; i++) diya(ctx, i, t, still);
  ctx.globalAlpha = 1;
  words(ctx, t, shown, -90 * easeOut(leaving), still);
  for (const glint of GLINTS) sparkle(ctx, glint, t, shown, still);
  ctx.restore();
}

/** A night sky going warm at the foot, and its stars. */
function sky(ctx: CanvasRenderingContext2D, t: number) {
  const ground = ctx.createLinearGradient(0, 0, 0, H);
  ground.addColorStop(0, '#120a33'); ground.addColorStop(.62, '#2a0c36'); ground.addColorStop(1, '#4a1024');
  ctx.fillStyle = ground; ctx.fillRect(0, 0, W, H);
  for (const star of stars) {
    ctx.globalAlpha = .35 + .3 * Math.sin(t * .003 + star.phase);
    ctx.fillStyle = '#fff4d6';
    ctx.beginPath(); ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** A rocket climbing on its trail, then its burst: sparks thrown out with short tails, falling and fading. */
function rocket(ctx: CanvasRenderingContext2D, r: number, t: number, still: boolean) {
  const { launch, from, x, y, colour, size } = ROCKETS[r];
  const age = t - launch;
  if (age < 0) return;
  // Under reduced motion only the bursts already in the air stand, as dots of light.
  if (age < RISE && !still) {
    const p = easeOut(age / RISE), back = easeOut(Math.max(0, age - 90) / RISE);
    const headX = from + (x - from) * p, headY = H + 10 + (y - H - 10) * p;
    const tailX = from + (x - from) * back, tailY = H + 10 + (y - H - 10) * back;
    const trail = ctx.createLinearGradient(tailX, tailY, headX, headY);
    trail.addColorStop(0, 'rgba(255,190,90,0)'); trail.addColorStop(1, 'rgba(255,230,170,.9)');
    ctx.strokeStyle = trail; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(headX, headY); ctx.stroke();
    ctx.fillStyle = '#fff6dc';
    ctx.beginPath(); ctx.arc(headX, headY, 3.2, 0, Math.PI * 2); ctx.fill();
    return;
  }
  const burst = age - RISE;
  if (burst > BURST || burst < 0) return;
  const life = burst / BURST;
  const saved = ctx.globalAlpha;
  // Sparks are light: they add to what is behind them and glow where they cross.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // The burst's own glow in its colour, soft and its own size: a bloom where it went off, never the whole screen.
  if (burst < 320) {
    const reach = 95 * size;
    const bloom = ctx.createRadialGradient(x, y, 0, x, y, reach);
    bloom.addColorStop(0, tint(colour, .42 * (1 - burst / 320))); bloom.addColorStop(1, tint(colour, 0));
    ctx.fillStyle = bloom; ctx.fillRect(x - reach, y - reach, reach * 2, reach * 2);
  }
  ctx.lineCap = 'round';
  for (const spark of sparks[r]) {
    const head = sparkAt(spark, burst), tail = sparkAt(spark, Math.max(0, burst - (still ? 60 : 150)));
    ctx.globalAlpha = saved * (1 - Math.pow(life, 1.6));
    ctx.strokeStyle = spark.white ? '#fff3cf' : colour;
    ctx.lineWidth = 3.4 * size * (1 - life * .5);
    ctx.beginPath(); ctx.moveTo(x + tail.x, y + tail.y); ctx.lineTo(x + head.x, y + head.y); ctx.stroke();
    // Late in the burst the tips glitter, slowly, as the sparks fall.
    if (life > .55) {
      ctx.globalAlpha = saved * (1 - life) * (.5 + .5 * Math.sin(burst * .02 + spark.angle * 5));
      ctx.fillStyle = '#fff3cf';
      ctx.beginPath(); ctx.arc(x + head.x, y + head.y, 2, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
  ctx.globalAlpha = saved;
}

/** A colour of the bursts' at an alpha. */
function tint(colour: string, alpha: number) {
  const n = parseInt(colour.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * The marigold toran over the top: four swags of orange and yellow flowers
 * with mango leaves where they are tied, dropping in from above and then
 * swaying a little.
 */
function toran(ctx: CanvasRenderingContext2D, t: number, still: boolean) {
  // Dropped in on a spring: down past its place, back, settled by about 600ms.
  const drop = still ? 0 : -96 * Math.exp(-t / 140) * Math.cos(t / 95);
  const ties = [-24, 244, 512, 780, 1048];
  ctx.save();
  ctx.translate(0, drop);
  for (let s = 0; s < ties.length - 1; s++) {
    const a = ties[s], b = ties[s + 1];
    const sag = 34 + (still ? 0 : 3 * Math.sin(t * .004 + s * 1.3));
    const yAt = (u: number) => 10 + sag * Math.sin(Math.PI * u);
    ctx.strokeStyle = '#8a5a12'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k <= 20; k++) { const u = k / 20; ctx[k ? 'lineTo' : 'moveTo'](a + (b - a) * u, yAt(u)); }
    ctx.stroke();
    const flowers = 12;
    for (let k = 0; k <= flowers; k++) {
      const u = k / flowers, fx = a + (b - a) * u, fy = yAt(u);
      ctx.fillStyle = k % 2 ? '#ffc21a' : '#ff7a00';
      ctx.beginPath(); ctx.arc(fx, fy, 9.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = k % 2 ? '#e09400' : '#d65800';
      ctx.beginPath(); ctx.arc(fx, fy, 3.4, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Mango leaves hanging where each swag is tied.
  for (let s = 1; s < ties.length - 1; s++) {
    const x = ties[s];
    for (const lean of [-.42, 0, .42]) {
      ctx.save();
      ctx.translate(x, 14); ctx.rotate(lean + (still ? 0 : .05 * Math.sin(t * .005 + s)));
      ctx.fillStyle = lean ? '#1f7a37' : '#2a9a46';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(11, 22, 0, 46); ctx.quadraticCurveTo(-11, 22, 0, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(0, 40); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = '#ffc21a';
    ctx.beginPath(); ctx.arc(x, 12, 12, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** How far a diya's flame has come up, nought to one. */
const flameUp = (i: number, t: number) => easeOut(fade(t, DIYAS[i].lit, DIYAS[i].lit + 260));

/** The warm light along the foot, coming up as the diyas are lit. */
function diyaGlow(ctx: CanvasRenderingContext2D, t: number) {
  let lit = 0;
  for (let i = 0; i < DIYAS.length; i++) lit += flameUp(i, t);
  if (!lit) return;
  const glow = ctx.createLinearGradient(0, H, 0, H - 150);
  glow.addColorStop(0, `rgba(255,140,40,${.28 * lit / DIYAS.length})`); glow.addColorStop(1, 'rgba(255,140,40,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, H - 150, W, 150);
}

/** A clay diya with its flame: the bowl always there, the flame coming up when its turn comes and moving gently. */
function diya(ctx: CanvasRenderingContext2D, i: number, t: number, still: boolean) {
  const { x, width } = DIYAS[i];
  const base = H - 30;
  const up = flameUp(i, t);
  if (up > 0) {
    // Moves, never flashes: a slow sway in its height, about twice a second.
    const breathe = still ? 1 : 1 + .07 * Math.sin(t * .013 + i * 1.7);
    const height = 36 * up * breathe, wide = 12 * up;
    const halo = ctx.createRadialGradient(x, base - height * .5, 0, x, base - height * .5, 52 * up);
    halo.addColorStop(0, 'rgba(255,170,60,.5)'); halo.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.fillStyle = halo; ctx.fillRect(x - 52, base - height * .5 - 52, 104, 104);
    const flame = ctx.createLinearGradient(x, base - height, x, base);
    flame.addColorStop(0, '#ff7a1a'); flame.addColorStop(.45, '#ffd34d'); flame.addColorStop(1, '#fff8e0');
    ctx.fillStyle = flame;
    const lean = still ? 0 : 2.5 * Math.sin(t * .009 + i);
    ctx.beginPath();
    ctx.moveTo(x + lean, base - height);
    ctx.bezierCurveTo(x + wide, base - height * .45, x + wide * .9, base - 2, x, base - 2);
    ctx.bezierCurveTo(x - wide * .9, base - 2, x - wide, base - height * .45, x + lean, base - height);
    ctx.fill();
  }
  // The bowl: a lip, then the clay under it, painted with three dots.
  const bowl = ctx.createLinearGradient(x, base, x, base + 24);
  bowl.addColorStop(0, '#d0621f'); bowl.addColorStop(1, '#6a1f08');
  ctx.fillStyle = bowl;
  ctx.beginPath(); ctx.ellipse(x, base, width / 2, 22, 0, 0, Math.PI); ctx.fill();
  ctx.fillStyle = '#f2a34c';
  ctx.beginPath(); ctx.ellipse(x, base, width / 2, 5.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3b1206';
  ctx.beginPath(); ctx.ellipse(x, base, width / 2 - 6, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffe2a8';
  for (const dx of [-12, 0, 12]) { ctx.beginPath(); ctx.arc(x + dx, base + 11, 2.2, 0, Math.PI * 2); ctx.fill(); }
}

/**
 * HAPPY DIWALI in gold, slammed on as the screen's words are, with a
 * shimmer run across the letters once they have landed; and SIX ✦ MAXIMUM
 * under it, so the six is still told.
 */
function words(ctx: CanvasRenderingContext2D, t: number, alpha: number, drift: number, still: boolean) {
  const since = t - WORDS_AT;
  if (since < 0 || alpha <= 0) return;
  const scale = still ? 1 : slam(since);
  // The words' own canvas at the screen's pixels, so they are as sharp as everything else on it.
  const m = ctx.getTransform();
  const px = Math.hypot(m.a, m.b) || 1;
  const layer = wordsLayer(Math.ceil(W * px), Math.ceil(H * px));
  const w = layer.getContext('2d') as CanvasRenderingContext2D;
  w.setTransform(1, 0, 0, 1, 0, 0);
  w.clearRect(0, 0, layer.width, layer.height);
  w.setTransform(px, 0, 0, px, 0, 0);
  const cx = W / 2, cy = 166 + drift;
  w.save();
  w.translate(cx, cy); w.scale(scale, scale);
  w.font = JARO(128); w.textAlign = 'center'; w.textBaseline = 'middle';
  const text = 'HAPPY DIWALI';
  const fit = Math.min(1, 880 / w.measureText(text).width);
  w.scale(fit, fit);
  w.lineJoin = 'round';
  w.shadowColor = 'rgba(255,130,20,.8)'; w.shadowBlur = 26;
  w.strokeStyle = '#3b0716'; w.lineWidth = 14;
  w.strokeText(text, 0, 0);
  w.shadowBlur = 0;
  const gold = w.createLinearGradient(0, -56, 0, 56);
  gold.addColorStop(0, '#fff6c4'); gold.addColorStop(.42, '#ffcb3d'); gold.addColorStop(.75, '#f08a00'); gold.addColorStop(1, '#c45a00');
  w.fillStyle = gold;
  w.fillText(text, 0, 0);
  // The shimmer: a pale band across the letters, once, after they land.
  const run = still ? -1 : fade(t, 1250, 1850);
  if (run > 0 && run < 1) {
    w.globalCompositeOperation = 'source-atop';
    const at = -620 + run * 1240;
    const band = w.createLinearGradient(at - 90, 0, at + 90, 0);
    band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(.5, 'rgba(255,255,240,.85)'); band.addColorStop(1, 'rgba(255,255,255,0)');
    w.fillStyle = band;
    w.save(); w.transform(1, 0, -.35, 1, 0, 0); w.fillRect(at - 120, -90, 240, 180); w.restore();
    w.globalCompositeOperation = 'source-over';
  }
  w.restore();
  line(w, t, drift, still);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.drawImage(layer as CanvasImageSource, 0, 0);
  ctx.restore();
}

/** SIX ✦ MAXIMUM, rising into place under the words. */
function line(w: CanvasRenderingContext2D, t: number, drift: number, still: boolean) {
  const up = still ? 1 : easeOut(fade(t, LINE_AT, LINE_AT + 240));
  if (up <= 0) return;
  const y = 262 + drift + 14 * (1 - up);
  w.save();
  w.globalAlpha = up;
  w.font = SATOSHI(34); w.textBaseline = 'middle';
  const spaced = w as CanvasRenderingContext2D & { letterSpacing?: string };
  spaced.letterSpacing = '10px';
  const left = 'SIX', right = 'MAXIMUM', gap = 64;
  const lw = w.measureText(left).width, rw = w.measureText(right).width;
  const start = W / 2 - (lw + gap + rw) / 2;
  w.fillStyle = '#ffe7b0';
  w.shadowColor = 'rgba(0,0,0,.55)'; w.shadowBlur = 8;
  w.textAlign = 'left';
  w.fillText(left, start, y);
  w.fillText(right, start + lw + gap, y);
  w.shadowBlur = 0;
  star(w, start + lw + gap / 2 - 5, y, 13, '#ffcb3d');
  spaced.letterSpacing = '0px';
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

/** A glint popping up and away round the words, half a second each. */
function sparkle(ctx: CanvasRenderingContext2D, glint: typeof GLINTS[number], t: number, alpha: number, still: boolean) {
  const age = still ? 250 : t - glint.at;
  if (age < 0 || age > 500 || alpha <= 0) return;
  const size = Math.sin(Math.PI * age / 500);
  ctx.save();
  ctx.globalAlpha = alpha * size;
  star(ctx, glint.x, glint.y, glint.r * size, '#fff3cf');
  ctx.restore();
}
