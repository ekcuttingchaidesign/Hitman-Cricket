/**
 * The little films the match room plays, drawn as Lottie files.
 *
 *   node scripts/lottie-art.mjs        # writes public/lotties/*.json
 *
 * Five of them: a trophy going up under confetti for a win, the bails coming
 * off for a loss, two bats crossed for a dead heat, a ball bouncing while
 * somebody waits, and a tick for somebody arriving. They are written here
 * rather than downloaded because they have to be in the game's own colours —
 * the cyan of the keys, the orange of the ledge, the red of the ball, the
 * cream of the ink — and a film borrowed from a library is somebody else's
 * palette with a licence attached. Every shape is a rectangle, an ellipse, a
 * star or a short path, and every movement is a handful of keyframes, so the
 * five files together weigh less than one photograph.
 *
 * The format is Bodymovin's: `v`, frame rate, in and out points, and a list
 * of shape layers, each with a transform (`ks`) and a list of shapes. An
 * animated property is `{a:1, k:[keyframes]}`; a still one is `{a:0, k:v}`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';

const FR = 60;
const W = 400;
const H = 400;

/* The palette, as Lottie wants it: red, green, blue between nought and one. */
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
const C = {
  cyan: rgb('#4fcff2'), cyanLight: rgb('#a8ecff'), cyanDeep: rgb('#1c95b7'),
  orange: rgb('#e9582b'), orangeLight: rgb('#ff8a3d'),
  gold: rgb('#ffb03f'), goldDeep: rgb('#c77d16'), goldLight: rgb('#ffe1a3'),
  cream: rgb('#f7f0e5'), white: rgb('#ffffff'), ink: rgb('#0f2738'), navy: rgb('#152b3c'),
  red: rgb('#e5473a'), redDeep: rgb('#a8261c'),
  wood: rgb('#e6c58f'), woodDeep: rgb('#b8905a'), grip: rgb('#22303a'),
  quiet: rgb('#9fb2bd'), green: rgb('#12b45f'),
};

/* ── Properties ─────────────────────────────────────────────────────────── */

const still = v => ({ a: 0, k: v });
/** Keyframes with one easing for the lot: a quick start and a soft landing. */
const move = (frames, ease = [0.25, 1]) => ({
  a: 1,
  k: frames.map(([t, v], i) => {
    const dims = Array.isArray(v) ? v.length : 1;
    const key = { t, s: Array.isArray(v) ? v : [v] };
    if (i < frames.length - 1) {
      key.i = { x: Array(dims).fill(ease[0]), y: Array(dims).fill(ease[1]) };
      key.o = { x: Array(dims).fill(0.4), y: Array(dims).fill(0) };
    }
    return key;
  }),
});
/** Keyframes that hold, then jump: for a thing that appears rather than grows. */
const step = frames => ({ a: 1, k: frames.map(([t, v]) => ({ t, s: Array.isArray(v) ? v : [v], h: 1 })) });

/* ── Shapes ─────────────────────────────────────────────────────────────── */

const rect = (w, h, r = 0, p = [0, 0]) => ({ ty: 'rc', d: 1, s: still([w, h]), p: still(p), r: still(r) });
const ellipse = (w, h, p = [0, 0]) => ({ ty: 'el', d: 1, s: still([w, h]), p: still(p) });
const star = (outer, inner, points = 5, p = [0, 0], r = 0) => ({
  ty: 'sr', sy: 1, d: 1, pt: still(points), p: still(p), r: still(r),
  ir: still(inner), is: still(0), or: still(outer), os: still(0),
});
/** A path from vertices, each `[x, y]` or `[x, y, inX, inY, outX, outY]` with handles relative to the vertex. */
const path = (points, closed = true) => ({
  ty: 'sh', d: 1,
  ks: still({
    c: closed,
    v: points.map(p => [p[0], p[1]]),
    i: points.map(p => [p[2] ?? 0, p[3] ?? 0]),
    o: points.map(p => [p[4] ?? 0, p[5] ?? 0]),
  }),
});
const fill = (c, o = 100) => ({ ty: 'fl', c: still([...c, 1]), o: still(o), r: 1 });
const stroke = (c, w, o = 100) => ({ ty: 'st', c: still([...c, 1]), o: still(o), w: still(w), lc: 2, lj: 2 });
const trim = (start, end) => ({ ty: 'tm', s: start, e: end, o: still(0), m: 1 });
const transform = (over = {}) => ({
  ty: 'tr', p: still([0, 0]), a: still([0, 0]), s: still([100, 100]), r: still(0), o: still(100), sk: still(0), sa: still(0), ...over,
});
const group = (items, over = {}) => ({ ty: 'gr', it: [...items, transform(over)] });

/* ── Layers ─────────────────────────────────────────────────────────────── */

let ind = 0;
const layer = (nm, shapes, { p = [W / 2, H / 2], a = [0, 0], s = [100, 100], r = 0, o = 100, ip = 0, op = 100000 } = {}) => ({
  ddd: 0, ind: ++ind, ty: 4, nm, sr: 1,
  ks: {
    o: typeof o === 'number' ? still(o) : o,
    r: typeof r === 'number' ? still(r) : r,
    p: Array.isArray(p) ? still([...p, 0]) : p,
    a: still([...a, 0]),
    s: Array.isArray(s) ? still([...s, 100]) : s,
  },
  ao: 0, shapes, ip, op, st: 0, bm: 0,
});
const film = (nm, op, layers) => {
  ind = 0;
  return { v: '5.7.4', fr: FR, ip: 0, op, w: W, h: H, nm, ddd: 0, assets: [], layers: layers.reverse() };
};
/** Three-dimensional keyframes for position and scale. */
const move3 = (frames, ease) => move(frames.map(([t, v]) => [t, [...v, v.length === 2 ? 0 : 100]]), ease);
const scale3 = (frames, ease) => move(frames.map(([t, v]) => [t, [...v, 100]]), ease);

/** A seeded shuffle, so the confetti falls the same way every build. */
let seed = 7;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

/* ── Win: the trophy goes up ────────────────────────────────────────────── */

function win() {
  const OP = 170;
  const layers = [];

  // Rays behind it, turning slowly, faint.
  const rays = [];
  for (let i = 0; i < 8; i++) {
    rays.push(group([rect(10, 210, 5, [0, -105]), fill(C.goldLight)], { r: still(i * 45) }));
  }
  layers.push(layer('rays', rays, {
    p: [W / 2, H / 2 - 20],
    r: move([[0, 0], [OP, 40]], [1, 1]),
    s: scale3([[0, [0, 0]], [30, [112, 112]], [42, [100, 100]]]),
    o: move([[0, 0], [24, 42]]),
  }));

  // The ring that the trophy lands in.
  layers.push(layer('ring', [group([ellipse(60, 60), stroke(C.cyanLight, 5)])], {
    p: [W / 2, H / 2 - 10],
    s: scale3([[6, [40, 40]], [46, [520, 520]]]),
    o: move([[6, 70], [46, 0]]),
  }));

  // The trophy itself.
  const cup = group([
    path([[-64, -78], [64, -78], [50, 12, 0, 0, -18, 46], [-50, 12, 18, 46, 0, 0]]),
    fill(C.gold),
  ]);
  const cupShine = group([path([[-44, -66], [-26, -66], [-34, -4], [-46, -4]]), fill(C.goldLight, 55)]);
  const rim = group([rect(140, 16, 8, [0, -80]), fill(C.goldDeep)]);
  const handles = group([
    ellipse(58, 76, [-74, -36]), ellipse(58, 76, [74, -36]),
    stroke(C.gold, 13),
  ]);
  const stem = group([rect(28, 42, 6, [0, 52]), fill(C.goldDeep)]);
  const base = group([rect(104, 20, 7, [0, 80]), fill(C.gold)]);
  const plinth = group([rect(140, 16, 6, [0, 96]), fill(C.goldDeep)]);
  const badge = group([star(22, 10, 5, [0, -36]), fill(C.cream)]);
  layers.push(layer('trophy', [handles, cup, cupShine, rim, stem, base, plinth, badge], {
    p: move3([[0, [W / 2, H / 2 + 80]], [34, [W / 2, H / 2 - 22]], [46, [W / 2, H / 2 - 10]]]),
    s: scale3([[0, [30, 30]], [34, [112, 112]], [46, [100, 100]]]),
    r: move([[0, -14], [34, 5], [52, -2], [66, 0]]),
    o: move([[0, 0], [12, 100]]),
  }));

  // Sparkles on the cup, twinkling one after another.
  [[-40, -60], [46, -20], [8, 28]].forEach(([x, y], i) => {
    const at = 50 + i * 14;
    layers.push(layer(`sparkle ${i}`, [group([star(12, 3, 4), fill(C.white)])], {
      p: [W / 2 + x, H / 2 - 10 + y],
      s: scale3([[at, [0, 0]], [at + 10, [110, 110]], [at + 22, [0, 0]]]),
      r: move([[at, 0], [at + 22, 90]]),
    }));
  });

  // Confetti: a burst from behind the cup, out and down.
  const colours = [C.cyan, C.cyanLight, C.orange, C.orangeLight, C.gold, C.cream, C.green];
  for (let i = 0; i < 38; i++) {
    const angle = -Math.PI / 2 + (rand() - 0.5) * Math.PI * 1.6;
    const reach = 120 + rand() * 90;
    const px = Math.cos(angle) * reach;
    const py = Math.sin(angle) * reach;
    const start = 10 + Math.floor(rand() * 8);
    const wide = 7 + rand() * 6;
    const tall = 4 + rand() * 3;
    const colour = colours[i % colours.length];
    const shape = i % 5 === 0 ? ellipse(wide, wide) : rect(wide, tall, 1.5);
    layers.push(layer(`confetti ${i}`, [group([shape, fill(colour)])], {
      p: move3([
        [start, [W / 2, H / 2 - 10]],
        [start + 34, [W / 2 + px, H / 2 - 10 + py]],
        [OP - 10, [W / 2 + px + (rand() - 0.5) * 50, H / 2 - 10 + py + 150 + rand() * 60]],
      ], [0.3, 1]),
      r: move([[start, 0], [OP - 10, (rand() - 0.5) * 1200]], [1, 1]),
      s: scale3([[start, [0, 0]], [start + 8, [100, 100]]]),
      o: move([[start, 100], [OP - 40, 100], [OP - 10, 0]], [1, 1]),
      ip: start,
    }));
  }
  return film('win', OP, layers);
}

/* ── Lose: the bails come off ───────────────────────────────────────────── */

function lose() {
  const OP = 130;
  const hit = 32;
  const ground = H / 2 + 86;
  const layers = [];

  // The crease.
  layers.push(layer('crease', [group([rect(260, 6, 3), fill(C.quiet, 45)])], { p: [W / 2, ground + 3] }));

  // Three stumps, anchored at the foot so they lean rather than slide.
  const stump = (x, lean, at) => layer(`stump ${x}`, [
    group([rect(14, 150, 5, [0, -75]), fill(C.wood)]),
    group([rect(5, 150, 2, [-3, -75]), fill(C.woodDeep, 55)]),
  ], {
    p: [W / 2 + x, ground],
    r: lean ? move([[at, 0], [at + 10, lean * 1.15], [at + 22, lean]]) : 0,
  });
  layers.push(stump(-34, 0, hit));
  layers.push(stump(0, -24, hit));
  layers.push(stump(34, 7, hit + 3));

  // Two bails. They sit until the ball arrives, then go their separate ways.
  const bail = (x, flyX, flyY, spin, at) => layer(`bail ${x}`, [group([rect(34, 8, 4), fill(C.wood)])], {
    p: move3([
      [0, [W / 2 + x, ground - 154]],
      [at, [W / 2 + x, ground - 154]],
      [at + 22, [W / 2 + x + flyX, ground - 154 + flyY]],
      [at + 56, [W / 2 + x + flyX * 1.4, ground - 4]],
    ], [0.2, 1]),
    r: move([[at, 0], [at + 56, spin]], [1, 1]),
  });
  layers.push(bail(-17, -70, -110, -560, hit));
  layers.push(bail(17, 60, -95, 480, hit + 1));

  // The ball: in from the left, through the stumps, off to the right, spinning.
  layers.push(layer('ball', [
    group([ellipse(30, 30), fill(C.red)]),
    group([ellipse(18, 27), stroke(C.cream, 2.2, 85)]),
    group([ellipse(30, 30), stroke(C.redDeep, 2, 60)]),
  ], {
    p: move3([
      [0, [-30, ground - 60]],
      [hit, [W / 2 + 4, ground - 70]],
      [hit + 30, [W + 40, ground - 20]],
    ], [1, 1]),
    r: move([[0, 0], [hit + 30, 900]], [1, 1]),
    o: step([[0, 100], [hit + 30, 0]]),
  }));

  // Dust off the crease where the ball hits.
  [[-26, 0], [10, -8], [30, 4]].forEach(([x, y], i) => {
    layers.push(layer(`dust ${i}`, [group([ellipse(20, 20), fill(C.quiet)])], {
      p: move3([[hit, [W / 2 + x, ground - 14 + y]], [hit + 30, [W / 2 + x * 2.2, ground - 44 + y]]]),
      s: scale3([[hit, [0, 0]], [hit + 30, [180, 180]]]),
      o: move([[hit, 45], [hit + 30, 0]]),
      ip: hit,
    }));
  });
  return film('lose', OP, layers);
}

/* ── Draw: two bats crossed ─────────────────────────────────────────────── */

function draw() {
  const OP = 130;
  const layers = [];
  const bat = () => [
    group([rect(46, 156, 12, [0, 26]), fill(C.wood)]),
    group([rect(10, 130, 4, [-12, 26]), fill(C.woodDeep, 45)]),
    group([rect(18, 66, 6, [0, -82]), fill(C.grip)]),
    group([rect(18, 8, 2, [0, -60]), fill(C.cyan)]),
    group([rect(18, 8, 2, [0, -76]), fill(C.cyan)]),
  ];
  layers.push(layer('bat left', bat(), {
    p: move3([[0, [W / 2 - 150, H / 2 + 40]], [26, [W / 2 - 18, H / 2 + 4]], [36, [W / 2 - 12, H / 2]]]),
    r: move([[0, -70], [26, -20], [36, -28]]),
    o: move([[0, 0], [10, 100]]),
  }));
  layers.push(layer('bat right', bat(), {
    p: move3([[0, [W / 2 + 150, H / 2 + 40]], [26, [W / 2 + 18, H / 2 + 4]], [36, [W / 2 + 12, H / 2]]]),
    r: move([[0, 70], [26, 20], [36, 28]]),
    o: move([[0, 0], [10, 100]]),
  }));
  // The clash: a flash and six lines out of the crossing point.
  layers.push(layer('flash', [group([star(26, 12, 8), fill(C.white)])], {
    p: [W / 2, H / 2 - 20],
    s: scale3([[28, [0, 0]], [36, [130, 130]], [50, [0, 0]]]),
    r: move([[28, 0], [50, 40]]),
    ip: 28,
  }));
  for (let i = 0; i < 6; i++) {
    layers.push(layer(`spark ${i}`, [group([rect(6, 26, 3, [0, -40]), fill(C.cyanLight)])], {
      p: [W / 2, H / 2 - 20],
      r: i * 60 + 15,
      s: scale3([[30, [40, 40]], [56, [190, 190]]]),
      o: move([[30, 100], [56, 0]]),
      ip: 30,
    }));
  }
  // Two equal bars under the bats: level, and it says so.
  [[-38, C.cyan], [38, C.orangeLight]].forEach(([x, colour], i) => {
    layers.push(layer(`bar ${i}`, [group([rect(52, 12, 6), fill(colour)])], {
      p: [W / 2 + x, H / 2 + 150],
      s: scale3([[52 + i * 4, [0, 100]], [70 + i * 4, [100, 100]]]),
      o: move([[52, 0], [60, 100]]),
    }));
  });
  return film('draw', OP, layers);
}

/* ── Waiting: a ball bouncing ───────────────────────────────────────────── */

function waiting() {
  const OP = 84;
  const floor = H / 2 + 60;
  const layers = [];
  layers.push(layer('shadow', [group([ellipse(56, 16), fill(C.ink, 100)])], {
    p: [W / 2, floor + 6],
    s: scale3([[0, [100, 100]], [42, [55, 55]], [OP, [100, 100]]], [0.5, 1]),
    o: move([[0, 45], [42, 18], [OP, 45]], [0.5, 1]),
  }));
  layers.push(layer('ball', [
    group([ellipse(64, 64), fill(C.red)]),
    group([ellipse(38, 58), stroke(C.cream, 3.5, 85)]),
    group([ellipse(64, 64), stroke(C.redDeep, 3, 55)]),
  ], {
    a: [0, 32],
    p: move3([[0, [W / 2, floor]], [42, [W / 2, floor - 150]], [OP, [W / 2, floor]]], [0.5, 1]),
    s: scale3([[0, [122, 78]], [10, [96, 104]], [42, [100, 100]], [74, [96, 106]], [OP, [122, 78]]], [0.5, 1]),
    r: move([[0, 0], [OP, 180]], [1, 1]),
  }));
  return film('waiting', OP, layers);
}

/* ── Joined: a tick in a ring ───────────────────────────────────────────── */

function joined() {
  const OP = 70;
  const layers = [];
  layers.push(layer('ring', [group([ellipse(120, 120), stroke(C.cyan, 8)])], {
    s: scale3([[0, [30, 30]], [20, [110, 110]], [30, [100, 100]]]),
    o: move([[0, 0], [8, 100]]),
  }));
  layers.push(layer('halo', [group([ellipse(120, 120), stroke(C.cyanLight, 4)])], {
    s: scale3([[14, [100, 100]], [50, [200, 200]]]),
    o: move([[14, 60], [50, 0]]),
    ip: 14,
  }));
  layers.push(layer('tick', [group([
    path([[-34, 2], [-10, 26], [38, -26]], false),
    trim(still(0), move([[16, 0], [38, 100]])),
    stroke(C.cyanLight, 12),
  ])], { p: [W / 2, H / 2 + 2] }));
  return film('joined', OP, layers);
}

/* ── Out they go ────────────────────────────────────────────────────────── */

mkdirSync('public/lotties', { recursive: true });
for (const [name, make] of Object.entries({ win, lose, draw, waiting, joined })) {
  const json = JSON.stringify(make());
  writeFileSync(`public/lotties/${name}.json`, json);
  console.log(`  ${name.padEnd(8)} ${(json.length / 1024).toFixed(1)} KB`);
}
