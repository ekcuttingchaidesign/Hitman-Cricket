import * as THREE from 'three';

/**
 * A kit's print: lightning bolts and trim drawn over the shirt and trousers,
 * for the Super10 kits (`src/game/super10-kits.ts`), and the Diwali kits' gold
 * butis, block print and florals (`dressing.ts`). Every other kit is plain colours, and wears none.
 *
 * The print rides the jersey and the trousers the batter already has, in
 * their own shaders: no mesh and no draw call more, one texture each. Both
 * garments are rings of vertices round the body that share their first and
 * last vertex, so a texture laid by ordinary coordinates wraps backwards
 * across one strip of them. Each vertex carries where it is round its ring as
 * a point on a circle instead (`kitPrint`: the cosine and sine of its angle,
 * how high it is, and which part it is on), which runs smoothly all the way
 * round, and the shader turns it back into a place on the texture.
 *
 * The texture is drawn in a canvas, as the bats' stickers and the gloves'
 * weave are: one for the shirt, the torso on its left three quarters and the
 * sleeves on the rest, and one for the trousers. What is not drawn is clear,
 * and the garment's own colour shows through it.
 */

/** The share of the shirt's texture the torso takes: the sleeves have the rest. */
export const TORSO_SHARE = .75;
/**
 * A clear strip either side of the sleeves' part of the shirt's texture, as a
 * share of its width. Where the torso's texture meets itself down his back it
 * is also next to the sleeves', and filtered across it took a sliver of the
 * sleeves' hem band and bolt into a dotted line down his back; the shader
 * keeps each part's reads inside it, and the strip keeps the coarser mipmaps'
 * reads off its neighbour.
 */
const GUTTER = 8 / 1024;

/**
 * A mark on a panel: where its middle is, in metres from the panel's centre
 * (x across as you look at it, y up), how wide and tall it is, how far it
 * leans from upright (degrees, clockwise), and its colour; and what it is
 * (`shape`), a bolt of lightning unless it says otherwise. Each team's print
 * is made of a few of them: the Panthers' and the Vipers' bolts, the Kings'
 * stars, the Falcons' wing chevrons, the Farmers' aura rings, the Vipers'
 * diamondback and the Mavericks' sash.
 *
 * - `bolt`: the lightning icon.
 * - `star`: a four-pointed sparkle.
 * - `chevron`: a V pointing down, its arms `thick` of its width.
 * - `bar`: a plain band.
 * - `diamond`: a diamond, its points at the middle of each side.
 * - `spike`: a long point, its base at the foot and its tip at the top.
 * - `zigzag`: a jagged band, `points` teeth along its width, `thick` of its
 *   height thick.
 * - `ring`: an arc round its middle, `w` its radius, `h` its thickness,
 *   `from` and `sweep` where it starts and how far it runs (degrees,
 *   anticlockwise from the right); `lean` is not used.
 * - `crown`: a band with a row of `points` sharp points along its top.
 * - `tile`: a square with rounded corners.
 */
export interface Mark {
  x: number; y: number; w: number; h: number; lean: number; colour: string;
  shape?: 'bolt' | 'star' | 'chevron' | 'bar' | 'diamond' | 'spike' | 'zigzag' | 'ring' | 'crown' | 'tile';
  thick?: number; from?: number; sweep?: number; points?: number;
}

export interface KitPrint {
  /** Across the chest and across the back. */
  chest: Mark[];
  back: Mark[];
  /** The colour of the number on the back, where a number is worn (`paintKitPrint`'s `number`). */
  number?: string;
  /** The V of the collar: its colour, and a thinner line inside it. */
  collar?: { colour: string; inner?: string };
  /** A band round each sleeve's hem, with a thin line above it. */
  hem?: { colour: string; line?: string };
  /** On the outside of each sleeve, above the hem: x across the sleeve from its outside, y up from the hem. */
  sleeve?: Mark[];
  /** Down the outside of each trouser leg: y down from the hip. */
  leg?: Mark[];
  /**
   * An all-over pattern under the marks, the top tier's (Royal Mavericks):
   * flowing waves round the whole shirt and its sleeves in `colour`, and
   * the shirt fading into `fade` towards the hem. The number on the back is
   * edged in `edge` over it, so it reads.
   */
  swirl?: { colour: string; fade?: string; edge?: string };
  /** A band of squares in `colour` round his side and across his chest, the Aura Farmers': see `squares` below. */
  squares?: { colour: string };
  /** Lightning, streaks and slashes all over, the Apex Vipers': see `shards` below. */
  shards?: { bolt: string; streak: string; slash: string };
  /**
   * Small round butis all over the shirt and its sleeves, the Diwali kurta's:
   * gold dots in staggered rows, each row half a step along from the one
   * under it, kept `clear` metres either side of the chest's middle, where
   * the placket runs. See `butis` below.
   */
  butis?: { colour: string; clear?: number };
  /**
   * The blue Diwali kurta's block print: long feathers leaning over to his
   * left shoulder, little flowering bushes between them, and diamonds in
   * fours in the gaps, all in `colour`, all over the shirt and its sleeves.
   * See `fronds` below.
   */
  fronds?: { colour: string };
  /**
   * The ivory Diwali kurta's floral print: flowers, paisleys, feathered
   * leaves, buds and sprigs scattered all over the shirt and its sleeves in
   * pastel `colours`, stippled as the cloth's are. See `florals` below.
   */
  florals?: { pink: string; blue: string; yellow: string; green: string };
  /** The sleeves in a colour of their own, down to the hem. */
  sleeves?: string;
  /** An outline round the number on the back, where it is worn over a pattern. */
  numberEdge?: string;
}

/** The lightning icon's outline, in a unit square centred on nought, y down. */
const ZAP: readonly [number, number][] = [[.04, -.42], [-.375, .08], [0, .08], [-.04, .42], [.375, -.08], [0, -.08]];
/** A four-pointed sparkle, y up: its waist is a sixth of its reach. */
const STAR: readonly [number, number][] = [[0, .5], [.085, .085], [.5, 0], [.085, -.085], [0, -.5], [-.085, -.085], [-.5, 0], [-.085, .085]];

/** A square `size` across centred on (x, y), its corners rounded by `round` of its size, added to the path. */
function roundedSquare(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, round: number) {
  const h = size / 2, r = size * round;
  ctx.moveTo(x - h + r, y - h);
  ctx.arcTo(x + h, y - h, x + h, y + h, r); ctx.arcTo(x + h, y + h, x - h, y + h, r);
  ctx.arcTo(x - h, y + h, x - h, y - h, r); ctx.arcTo(x - h, y - h, x + h, y - h, r);
}

function bolt(ctx: CanvasRenderingContext2D, b: Mark) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.fillStyle = b.colour;
  ctx.beginPath();
  if (b.shape === 'ring') {
    // Drawn in the panel's own metres, which are the same both ways, so the arc stays round.
    const from = (b.from ?? 0) * Math.PI / 180, to = from + (b.sweep ?? 360) * Math.PI / 180;
    ctx.arc(0, 0, b.w + b.h / 2, from, to); ctx.arc(0, 0, Math.max(0, b.w - b.h / 2), to, from, true);
    ctx.closePath(); ctx.fill(); ctx.restore();
    return;
  }
  ctx.rotate(-b.lean * Math.PI / 180);
  ctx.scale(b.w, b.h);
  const polygon = (points: readonly [number, number][]) => points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  switch (b.shape ?? 'bolt') {
    // The icon is drawn y down, the panel y up: flipped, so the bolt's head is at its top.
    case 'bolt': polygon(ZAP.map(([x, y]) => [x, -y] as [number, number])); break;
    case 'star': polygon(STAR); break;
    case 'bar': polygon([[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]]); break;
    case 'diamond': polygon([[0, .5], [.5, 0], [0, -.5], [-.5, 0]]); break;
    case 'spike': polygon([[-.5, -.5], [.5, -.5], [.15, .5]]); break;
    case 'zigzag': {
      // A line up and down `points` times, made a band by its thickness either side.
      const n = 2 * (b.points ?? 4), k = (b.thick ?? .3) / 2, line: [number, number][] = [];
      for (let i = 0; i <= n; i++) line.push([-.5 + i / n, i % 2 ? .5 - k : -.5 + k]);
      polygon([...line.map(([x, y]) => [x, y + k] as [number, number]), ...line.reverse().map(([x, y]) => [x, y - k] as [number, number])]);
      break;
    }
    case 'chevron': {
      const k = b.thick ?? .25;
      polygon([[-.5, .5], [-.5 + k, .5], [0, -.5 + 2 * k], [.5 - k, .5], [.5, .5], [0, -.5]]);
      break;
    }
    case 'tile': roundedSquare(ctx, 0, 0, 1, .22); break;
    case 'crown': {
      // The band's foot straight, its top a row of points with the valleys halfway down.
      const n = b.points ?? 5, top: [number, number][] = [];
      for (let i = 0; i <= 2 * n; i++) top.push([-.5 + i / (2 * n), i % 2 ? .5 : 0]);
      polygon([[-.5, -.5], ...top, [.5, -.5]]);
      break;
    }
  }
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

/**
 * How far up the cloth each ninth of the torso's rows is, in metres from the
 * hem, measured along the jersey's profile in front (`jerseyGeometry`): the
 * rows are even in the profile's own parameter, and its top three eighths are
 * the shoulders' slope in to the neck, so a print laid evenly on the rows was
 * squeezed up into the shoulders. The torso is painted in metres and its rows
 * are then taken from where each really is.
 */
const CLOTH_UP = [0, .0226, .1076, .2184, .3137, .3838, .4481, .4991, .5309];
const CLOTH = { round: 1.08, tall: CLOTH_UP[CLOTH_UP.length - 1] };
/** Where the sleeve's hem is up its texture: `SLEEVE_HEM` of its twenty rows. */
const HEM = .4;
/** And a sleeve's, round the arm and down from the shoulder to below the hem. */
const SLEEVE = { round: .5, tall: .62 };
/** And a trouser leg's: round the thigh, and from the hip to the ankle. */
const LEG = { round: .66, tall: .92 };

/** The number on the back: how tall, and where its middle is, in metres up the cloth. */
const NUMBER = { tall: .16, up: .25 };
/** Its face: the brand's lettering, Saira Black Italic, as the screen and the stumps have it. */
export const NUMBER_FONT = (px: number) => `italic 900 ${px}px Saira, "Arial Black", Impact, sans-serif`;

/**
 * Flowing waves across a stretch of canvas, `w` by `h` pixels from its
 * corner: bands of `colour` that ripple and pinch like a marbled print, each
 * a sum of waves that go round a whole number of times, so the stretch meets
 * itself where it wraps round him.
 */
function waves(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, colour: string, bands: number) {
  const gap = h / bands;
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
  ctx.strokeStyle = colour; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let k = -1; k <= bands; k++) {
    ctx.beginPath();
    for (let x = 0; x <= w; x += 3) {
      const t = x / w * Math.PI * 2;
      const y = (k + .5) * gap + gap * .85 * (Math.sin(2 * t + k * .9) + .45 * Math.sin(3 * t + k * 1.3 + .8 * Math.sin(2 * t + k)));
      if (x) ctx.lineTo(x0 + x, y0 + y); else ctx.moveTo(x0 + x, y0 + y);
    }
    ctx.lineWidth = gap * (.46 + .12 * Math.sin(k * 2.3));
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The Aura Farmers' squares, after the designer's concept shirt: a grid of
 * rounded squares in `colour` on the front of the shirt alone, packed tight
 * at the hem, so it reads as navy with thin orange lines through it, and
 * fading up the chest into the orange, the squares shrinking and going out,
 * a few strays above; softened at either side, where the front turns into
 * his sides. The back is left plain.
 */
const SQUARE_TURN = Math.atan2(2, 3), SQUARE_PITCH = .06;
/** In metres up from the hem: packed to `packed`, gone by `gone`; and across the front, out over its last `side` either side. */
const SQUARE_FADE = { packed: .07, gone: .4, half: .28, side: .07 };
function squares(ctx: CanvasRenderingContext2D, W: number, FH: number, colour: string) {
  const m = W / CLOTH.round, p = SQUARE_PITCH, middle = CLOTH.round / 2;
  const [c, s] = [Math.cos(SQUARE_TURN), Math.sin(SQUARE_TURN)];
  ctx.save();
  ctx.fillStyle = colour;
  const reach = Math.ceil(Math.hypot(SQUARE_FADE.half, CLOTH.tall) / p) + 2;
  for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) {
    const across = (i * c - j * s) * p, y = (i * s + j * c) * p;
    if (Math.abs(across) > SQUARE_FADE.half + p || y < -p || y > CLOTH.tall) continue;
    const up = Math.min(1, (SQUARE_FADE.gone - y) / (SQUARE_FADE.gone - SQUARE_FADE.packed));
    const side = Math.min(1, (SQUARE_FADE.half - Math.abs(across)) / SQUARE_FADE.side);
    let shown = Math.min(up, side);
    // A few strays above where the squares give out, as the concept has.
    const stray = Math.abs(Math.sin((i * 7 + j * 13) * 12.9898) * 43758.5453) % 1;
    if (shown <= 0 && side > 0 && y < SQUARE_FADE.gone + .07 && stray < .2) shown = .3;
    if (shown <= 0) continue;
    ctx.globalAlpha = Math.pow(shown, .8);
    ctx.save();
    ctx.translate((middle + across) * m, FH - y * m); ctx.rotate(-SQUARE_TURN);
    ctx.beginPath(); roundedSquare(ctx, 0, 0, p * m * (.55 + .32 * shown), .2); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** A stream of numbers from nought to one, the same every time for a seed. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The Apex Vipers' all-over print, after the designer's concept shirt: on
 * the lime, everything running up the diagonal to his left shoulder —
 * long yellow slashes, cherry streaks spattered along their edges, and big
 * purple lightning, jagged bands zigzagging up the diagonal with spatter
 * off them. Seeded, so it is the same print every time; drawn three times a
 * width apart so it meets itself down his back; and no lightning across the
 * middle of the back, where the number is.
 */
function shards(ctx: CanvasRenderingContext2D, W: number, FH: number, colours: { bolt: string; streak: string; slash: string }) {
  const m = W / CLOTH.round, L = CLOTH.round, T = CLOTH.tall, rand = seeded(10);
  const a = 58 * Math.PI / 180, d = [Math.cos(a), Math.sin(a)], n = [-Math.sin(a), Math.cos(a)];
  /** A point `along` the diagonal and `across` it from (x, y). */
  const at = (x: number, y: number, along: number, across: number): [number, number] => [x + d[0] * along + n[0] * across, y + d[1] * along + n[1] * across];
  const shapes: { colour: string; points: [number, number][] }[] = [];
  const spatter = (x: number, y: number, len: number, side: number, colour: string, count: number) => {
    for (let k = 0; k < count; k++) {
      const along = (rand() - .5) * len, off = side * (.004 + rand() * .035), size = .004 + rand() * .014;
      const [px, py] = at(x, y, along, off);
      const turn = rand() * Math.PI;
      shapes.push({ colour, points: [0, 1, 2].map(q => {
        const r = q === 0 ? size * 1.8 : size * .6, t = turn + q * 2.1;
        return [px + Math.cos(t) * r, py + Math.sin(t) * r] as [number, number];
      }) });
    }
  };
  for (let k = 0; k < 22; k++) {
    const x = rand() * L, y = rand() * T, len = .18 + rand() * .28, wide = .026 + rand() * .04;
    shapes.push({ colour: colours.slash, points: [at(x, y, -len / 2, -wide / 2), at(x, y, -len / 2, wide / 2), at(x, y, len / 2, 0)] });
  }
  for (let k = 0; k < 10; k++) {
    const x = rand() * L, y = rand() * T, len = .28 + rand() * .3, wide = .014 + rand() * .022;
    shapes.push({ colour: colours.streak, points: [at(x, y, -len / 2, -wide / 2), at(x, y, len / 2, -wide * .2), at(x, y, len / 2, wide * .2), at(x, y, -len / 2, wide / 2)] });
    spatter(x, y, len * .7, rand() < .5 ? 1 : -1, colours.streak, 20);
  }
  // Each bolt stands clear of the others: overlapping, two or three made one purple patch.
  const bolts: [number, number][] = [];
  const clear = (x: number, y: number) => bolts.every(([bx, by]) => {
    const dx = Math.min(Math.abs(x - bx), L - Math.abs(x - bx));
    return Math.hypot(dx, y - by) > .2;
  });
  for (let k = 0, tries = 0; k < 9 && tries < 400; tries++) {
    const x = rand() * L, y = .06 + rand() * (T - .12);
    // The number's place across the middle of his back is kept clear.
    if ((x < .16 || x > L - .16) && y > .1 && y < .42) continue;
    if (!clear(x, y)) continue;
    bolts.push([x, y]); k++;
    const len = .2 + rand() * .16, wide = .026 + rand() * .02, zig = .022 + rand() * .016, kinks = 4 + Math.floor(rand() * 3);
    // A jagged band zigzagging up the diagonal, thickest in its middle and sharp at both ends.
    const line = Array.from({ length: kinks + 1 }, (_, q) => {
      const t = q / kinks;
      return { along: (t - .5) * len, across: (q % 2 ? zig : -zig) * Math.sin(Math.PI * t), half: wide / 2 * Math.pow(Math.sin(Math.PI * t), .7) };
    });
    shapes.push({ colour: colours.bolt, points: [
      ...line.map(o => at(x, y, o.along, o.across + o.half)),
      ...line.slice().reverse().map(o => at(x, y, o.along + o.half * .6, o.across - o.half)),
    ] });
    spatter(x, y, len, rand() < .5 ? 1 : -1, colours.bolt, 10);
  }
  ctx.save();
  ctx.translate(0, FH); ctx.scale(m, -m);
  for (const { colour, points } of shapes) {
    ctx.fillStyle = colour;
    for (const shift of [-L, 0, L]) {
      ctx.beginPath();
      points.forEach(([x, y], i) => (i ? ctx.lineTo(x + shift, y) : ctx.moveTo(x + shift, y)));
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * The Diwali kurta's butis: dots `BUTI.size` across, `BUTI.round` to a row
 * round him (a whole number, so the rows meet themselves down his back),
 * rows `BUTI.row` apart up the cloth, every other row half a step along. A
 * kurta's are a centimetre across and a hand apart; on a batter a few hundred
 * pixels tall those vanish or shimmer, so these are bigger and fewer. Drawn
 * in metres on `ctx`, `across` metres round and `tall` up, from `from` up.
 */
const BUTI = { size: .026, round: 16, row: .062, sleeveRound: 8 };
function butis(ctx: CanvasRenderingContext2D, across: number, from: number, tall: number, count: number, colour: string, clearOf: number | null = null, clear = 0) {
  const step = across / count;
  ctx.save();
  ctx.fillStyle = colour;
  for (let r = 0; from + (r + .5) * BUTI.row + BUTI.size / 2 <= tall; r++) {
    const y = from + (r + .5) * BUTI.row;
    for (let i = -1; i <= count; i++) {
      const x = (i + .5 + (r % 2) * .5) * step;
      if (clearOf !== null && Math.abs(x - clearOf) < clear + BUTI.size / 2) continue;
      ctx.beginPath(); ctx.arc(x, y, BUTI.size / 2, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * The blue Diwali kurta's motifs, drawn in metres on `ctx` (y up), `across`
 * metres round and `tall` up from nought: a grid `count` to a row round him
 * (even, so the rows meet themselves down his back), feathers and bushes
 * taking turns along a row and the next row turned the other way, so the
 * feathers run up the diagonal as on the cloth; and four little diamonds
 * between each four motifs. The feather's spine and barbs are cut out of it,
 * so the shirt's blue shows through them close to; from the game's camera
 * it reads as a leaf. Bigger and fewer than the cloth's, as the butis are.
 */
const FROND = { row: .115, lean: 25, long: .118, wide: .032, bush: .023, diamond: .0075 };
function fronds(ctx: CanvasRenderingContext2D, across: number, tall: number, count: number, colour: string) {
  const step = across / count;
  ctx.save();
  ctx.fillStyle = colour; ctx.strokeStyle = colour;
  const feather = (x: number, y: number) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-FROND.lean * Math.PI / 180);
    const L = FROND.long / 2, W = FROND.wide / 2;
    // A long leaf, pointed at the top and rounded at the foot, with a ring under it.
    ctx.beginPath(); ctx.moveTo(0, L);
    ctx.bezierCurveTo(W * 1.3, L * .4, W * 1.1, -L * .7, 0, -L * .86);
    ctx.bezierCurveTo(-W * 1.1, -L * .7, -W * 1.3, L * .4, 0, L);
    ctx.fill();
    ctx.lineWidth = W * .32;
    ctx.beginPath(); ctx.arc(0, -L - W * .45, W * .42, 0, Math.PI * 2); ctx.stroke();
    // The spine and the barbs, cut out of it.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = W * .18; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, L * .8); ctx.lineTo(0, -L * .8); ctx.stroke();
    ctx.lineWidth = W * .12;
    for (let k = 0; k < 7; k++) {
      const at = -L * .62 + k * L * .21, reach = W * .78 * Math.sin(Math.PI * (k + 1) / 8);
      ctx.beginPath(); ctx.moveTo(-reach, at - W * .5); ctx.lineTo(0, at); ctx.lineTo(reach, at - W * .5); ctx.stroke();
    }
    ctx.restore();
  };
  const bush = (x: number, y: number) => {
    // A flowering bush: a round head of blossoms over a short stem.
    const r = FROND.bush;
    ctx.save(); ctx.translate(x, y);
    ctx.lineWidth = r * .16;
    ctx.beginPath(); ctx.moveTo(0, -r * 1.25); ctx.lineTo(0, r * .2); ctx.stroke();
    for (const [dx, dy, size] of [[0, .55, .34], [-.48, .25, .3], [.48, .25, .3], [-.3, -.2, .28], [.3, -.2, .28], [0, .05, .3], [-.68, -.25, .2], [.68, -.25, .2], [0, -.55, .22]]) {
      ctx.beginPath(); ctx.arc(dx * r, dy * r, size * r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  };
  const diamonds = (x: number, y: number) => {
    const d = FROND.diamond;
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const cx = x + dx * d * 1.2, cy = y + dy * d * 1.2;
      ctx.beginPath(); ctx.moveTo(cx, cy + d / 2); ctx.lineTo(cx + d / 2, cy); ctx.lineTo(cx, cy - d / 2); ctx.lineTo(cx - d / 2, cy); ctx.closePath(); ctx.fill();
    }
  };
  for (let r = 0; (r + .5) * FROND.row - FROND.bush <= tall; r++) {
    const y = (r + .5) * FROND.row;
    for (let i = -1; i <= count; i++) {
      const x = (i + .5) * step;
      if ((i + r) % 2 === 0) feather(x, y); else bush(x, y);
      if (y + FROND.row / 2 < tall) diamonds(x + step / 2, y + FROND.row / 2);
    }
  }
  ctx.restore();
}

/**
 * The ivory Diwali kurta's florals, drawn in metres on `ctx` (y up), `across`
 * metres round and `tall` up: one big motif a cell, `count` cells to a row
 * round him (each drawn a width either side too, so the print meets itself
 * down his back), dealt and nudged off a seed so it is the same print every
 * time, and a small one between each four. Big and few, as the other kurtas'
 * are, so they read from the game's camera.
 */
type Florals = NonNullable<KitPrint['florals']>;
const FLORAL = { row: .19, big: .165, small: .055 };
function florals(ctx: CanvasRenderingContext2D, across: number, tall: number, count: number, c: Florals, seed: number) {
  const rand = seeded(seed), step = across / count, TAU = Math.PI * 2;
  const blob = (x: number, y: number, rx: number, ry: number, turn: number, colour: string) => {
    ctx.fillStyle = colour; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, turn, 0, TAU); ctx.fill();
  };
  const stem = (points: [number, number][], width: number) => {
    ctx.strokeStyle = c.green; ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.beginPath(); points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  };
  // Each motif is drawn about nought, `r` its size, upright.
  const flower = (r: number) => {
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; blob(Math.cos(a) * r * .62, Math.sin(a) * r * .62, r * .36, r * .2, a, c.pink); }
    for (let k = 0; k < 6; k++) { const a = (k + .5) / 6 * TAU; blob(Math.cos(a) * r * .32, Math.sin(a) * r * .32, r * .22, r * .14, a, c.blue); }
    blob(0, 0, r * .2, r * .2, 0, c.yellow);
  };
  const paisley = (r: number) => {
    ctx.fillStyle = c.blue; ctx.beginPath();
    ctx.moveTo(0, r * .9); ctx.bezierCurveTo(r * .75, r * .55, r * .7, -r * .75, 0, -r * .8);
    ctx.bezierCurveTo(-r * .7, -r * .75, -r * .55, r * .1, -r * .1, r * .45); ctx.bezierCurveTo(r * .05, r * .6, -r * .1, r * .8, 0, r * .9); ctx.fill();
    ctx.fillStyle = c.pink; ctx.beginPath();
    ctx.moveTo(0, r * .45); ctx.bezierCurveTo(r * .48, r * .25, r * .42, -r * .55, 0, -r * .58);
    ctx.bezierCurveTo(-r * .42, -r * .55, -r * .35, r * .05, 0, r * .45); ctx.fill();
    blob(0, -r * .25, r * .14, r * .14, 0, c.yellow);
  };
  const leaf = (r: number) => {
    // A broad feathered leaf in bands, yellow, pink and green across it.
    ctx.save(); ctx.beginPath();
    ctx.moveTo(0, r); ctx.bezierCurveTo(r * .75, r * .4, r * .6, -r * .7, 0, -r); ctx.bezierCurveTo(-r * .6, -r * .7, -r * .75, r * .4, 0, r); ctx.clip();
    const bands = [c.yellow, c.pink, c.yellow, c.green, c.pink, c.yellow];
    bands.forEach((colour, k) => { ctx.fillStyle = colour; ctx.fillRect(-r, -r + k * r * 2 / bands.length, r * 2, r * 2 / bands.length + .001); });
    ctx.restore();
    stem([[0, -r * 1.15], [0, r * .9]], r * .06);
  };
  const bud = (r: number) => {
    stem([[0, -r * 1.1], [0, -r * .3]], r * .07);
    blob(-r * .35, -r * .75, r * .28, r * .12, .6, c.green); blob(r * .35, -r * .65, r * .28, r * .12, -.6, c.green);
    ctx.fillStyle = c.pink; ctx.beginPath();
    ctx.moveTo(0, r * .85); ctx.bezierCurveTo(r * .8, r * .2, r * .55, -r * .55, 0, -r * .35); ctx.bezierCurveTo(-r * .55, -r * .55, -r * .8, r * .2, 0, r * .85); ctx.fill();
    ctx.fillStyle = c.blue; ctx.beginPath();
    ctx.moveTo(0, r * .5); ctx.bezierCurveTo(r * .4, r * .1, r * .28, -r * .3, 0, -r * .2); ctx.bezierCurveTo(-r * .28, -r * .3, -r * .4, r * .1, 0, r * .5); ctx.fill();
  };
  const sprig = (r: number) => {
    stem([[0, -r], [0, r]], r * .1);
    for (let k = 0; k < 3; k++) { const y = -r * .5 + k * r * .5; blob(-r * .3, y, r * .28, r * .12, .5, c.green); blob(r * .3, y + r * .15, r * .28, r * .12, -.5, c.green); }
    blob(0, r, r * .22, r * .22, 0, c.pink);
  };
  const star = (r: number) => {
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; blob(Math.cos(a) * r * .45, Math.sin(a) * r * .45, r * .32, r * .18, a, c.blue); }
    blob(0, 0, r * .2, r * .2, 0, c.pink);
  };
  const BIG = [flower, paisley, leaf, bud, leaf, paisley], SMALL = [sprig, star, sprig];
  const put = (draw: (r: number) => void, x: number, y: number, r: number, turn: number) => {
    for (const shift of [-across, 0, across]) { ctx.save(); ctx.translate(x + shift, y); ctx.rotate(turn); draw(r); ctx.restore(); }
  };
  for (let row = 0; (row + .5) * FLORAL.row - FLORAL.big <= tall; row++) {
    for (let i = 0; i < count; i++) {
      const x = (i + .5 + (row % 2) * .5) * step + (rand() - .5) * step * .25, y = (row + .5) * FLORAL.row + (rand() - .5) * FLORAL.row * .2;
      put(BIG[Math.floor(rand() * BIG.length)], x, y, FLORAL.big / 2 * (.85 + rand() * .3), (rand() - .5) * 1.2);
      put(SMALL[Math.floor(rand() * SMALL.length)], x + step / 2, y + FLORAL.row / 2, FLORAL.small / 2 * (.85 + rand() * .3), (rand() - .5) * 1.4);
    }
  }
}

/**
 * Small holes punched through everything drawn in a stretch of canvas, `pitch`
 * pixels apart and staggered, so a print reads as the ivory kurta's stippled
 * one close to; from the game's camera it reads as a softer pastel.
 */
function stipple(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, pitch: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  for (let y = y0, r = 0; y < y0 + h; y += pitch * .87, r++)
    for (let x = x0 + (r % 2) * pitch / 2; x < x0 + w; x += pitch) { ctx.beginPath(); ctx.arc(x, y, pitch * .22, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

/** The metres up the cloth at a height `v` on the torso's texture (nought at the hem). */
function clothAt(v: number) {
  const at = Math.min(CLOTH_UP.length - 1.000001, Math.max(0, v * (CLOTH_UP.length - 1))), i = Math.floor(at);
  return CLOTH_UP[i] + (CLOTH_UP[i + 1] - CLOTH_UP[i]) * (at - i);
}

let flat: HTMLCanvasElement | null = null;

/**
 * Paints a print onto its two canvases: the shirt's and the trousers'. The
 * torso is drawn flat first, in metres, x round him as he is looked at and y
 * up the cloth from the hem, the chest's middle halfway round and the back's
 * at both edges; then each row of the shirt's texture is taken from where it
 * really is up the cloth (`CLOTH_UP`).
 */
export function paintKitPrint(print: KitPrint, shirt: HTMLCanvasElement, trousers: HTMLCanvasElement, number: string | null = null, mirrored = false) {
  const s = shirt.getContext('2d')!, t = trousers.getContext('2d')!;
  s.clearRect(0, 0, shirt.width, shirt.height); t.clearRect(0, 0, trousers.width, trousers.height);
  const gutter = Math.round(shirt.width * GUTTER);
  const W = Math.round(shirt.width * TORSO_SHARE) - gutter, H = shirt.height;
  flat ??= document.createElement('canvas');
  flat.width = W; flat.height = Math.round(W * CLOTH.tall / CLOTH.round);
  const f = flat.getContext('2d')!, FH = flat.height;
  f.clearRect(0, 0, W, FH);
  /** A panel in metres, centred `round` of the way round. */
  const panel = (round: number, draw: () => void) => {
    f.save();
    f.translate(round * W, FH);
    f.scale(W / CLOTH.round, -FH / CLOTH.tall);
    draw();
    f.restore();
  };
  if (print.swirl) {
    waves(f, 0, 0, W, FH, print.swirl.colour, 9);
    if (print.swirl.fade) {
      // Into the second colour towards the hem, from a little under halfway up.
      const fade = f.createLinearGradient(0, FH, 0, FH * .45);
      fade.addColorStop(0, print.swirl.fade); fade.addColorStop(1, `${print.swirl.fade}00`);
      f.fillStyle = fade; f.fillRect(0, 0, W, FH);
    }
  }
  if (print.squares) squares(f, W, FH, print.squares.colour);
  if (print.shards) shards(f, W, FH, print.shards);
  if (print.butis) {
    f.save(); f.translate(0, FH); f.scale(W / CLOTH.round, -FH / CLOTH.tall);
    butis(f, CLOTH.round, 0, CLOTH.tall, BUTI.round, print.butis.colour, CLOTH.round / 2, print.butis.clear ?? 0);
    f.restore();
  }
  if (print.florals) {
    f.save(); f.translate(0, FH); f.scale(W / CLOTH.round, -FH / CLOTH.tall);
    florals(f, CLOTH.round, CLOTH.tall, 6, print.florals, 23);
    f.restore();
    stipple(f, 0, 0, W, FH, 5);
  }
  if (print.fronds) {
    f.save(); f.translate(0, FH); f.scale(W / CLOTH.round, -FH / CLOTH.tall);
    fronds(f, CLOTH.round, CLOTH.tall, 12, print.fronds.colour);
    f.restore();
  }
  panel(.5, () => print.chest.forEach(b => bolt(f, b)));
  for (const round of [0, 1]) panel(round, () => print.back.forEach(b => bolt(f, b)));
  if (print.collar) panel(.5, () => {
    // The V from either side of the neck down to a point under the throat.
    const top = CLOTH.tall + .01;
    const v = (width: number, colour: string, drop: number) => {
      f.beginPath(); f.moveTo(-.07, top); f.lineTo(0, top - drop); f.lineTo(.07, top);
      f.lineWidth = width; f.strokeStyle = colour; f.lineJoin = 'miter'; f.stroke();
    };
    v(.03, print.collar!.colour, .1);
    if (print.collar!.inner) v(.01, print.collar!.inner, .084);
  });
  if (number && print.number) {
    // The flat canvas is metres both ways, so the number is set in its pixels:
    // across the back's middle, which is both edges of the torso's texture.
    const px = NUMBER.tall * W / CLOTH.round;
    f.font = NUMBER_FONT(px * 1.32); f.textAlign = 'center'; f.textBaseline = 'middle'; f.fillStyle = print.number;
    // On a mirrored stage (a right-hander's, `mirrorStickers`) everything is
    // seen the other way round, so the number is painted the other way round.
    for (const x of [0, W]) {
      f.save(); f.translate(x, FH * (1 - NUMBER.up / CLOTH.tall)); f.scale(mirrored ? -1 : 1, 1);
      const edge = print.numberEdge ?? print.swirl?.edge;
      if (edge) { f.lineWidth = px * .16; f.lineJoin = 'round'; f.strokeStyle = edge; f.strokeText(number, 0, 0); }
      f.fillText(number, 0, 0); f.restore();
    }
  }
  for (let y = 0; y < H; y++) {
    const up = clothAt(1 - (y + .5) / H);
    s.drawImage(flat, 0, Math.min(FH - 1, Math.max(0, Math.floor((1 - up / CLOTH.tall) * FH))), W, 1, 0, y, W, 1);
  }
  // The sleeves: round each, and from the shoulder (the top) down, clear of the gutters either side.
  const sx = W + 2 * gutter, sw = shirt.width - sx - gutter;
  s.save();
  s.beginPath(); s.rect(sx, 0, sw, H); s.clip();
  // Up a sleeve's texture is down the arm: nought at the shoulder, the hem at HEM.
  const down = (z: number) => H * (1 - z);
  // The waves down the sleeve too, from the shoulder to the hem.
  if (print.swirl) waves(s, sx, down(HEM), sw, H * HEM, print.swirl.colour, 3);
  if (print.butis) {
    // Down the sleeve from the shoulder to the hem, in the sleeve's own metres, so the dots stay round.
    s.save(); s.translate(sx, H); s.scale(sw / SLEEVE.round, -H / SLEEVE.tall);
    butis(s, SLEEVE.round, 0, HEM * SLEEVE.tall, BUTI.sleeveRound, print.butis.colour);
    s.restore();
  }
  if (print.florals) {
    s.save(); s.translate(sx, H); s.scale(sw / SLEEVE.round, -H / SLEEVE.tall);
    florals(s, SLEEVE.round, HEM * SLEEVE.tall, 3, print.florals, 41);
    s.restore();
    stipple(s, sx, down(HEM), sw, H * HEM, 5);
  }
  if (print.fronds) {
    s.save(); s.translate(sx, H); s.scale(sw / SLEEVE.round, -H / SLEEVE.tall);
    fronds(s, SLEEVE.round, HEM * SLEEVE.tall, 6, print.fronds.colour);
    s.restore();
  }
  if (print.sleeves) { s.fillStyle = print.sleeves; s.fillRect(sx, down(HEM + .02), sw, H * (HEM + .02)); }
  if (print.hem) {
    // The band just inside the hem, and the line on the shoulder's side of it.
    s.fillStyle = print.hem.colour; s.fillRect(sx, down(HEM - .006), sw, .05 * H);
    if (print.hem.line) { s.fillStyle = print.hem.line; s.fillRect(sx, down(HEM - .07), sw, .012 * H); }
  }
  if (print.sleeve) {
    s.translate(sx + sw * .5, down(HEM * .8));
    s.scale(sw / SLEEVE.round, -H / SLEEVE.tall);
    print.sleeve.forEach(b => bolt(s, b));
  }
  s.restore();
  if (print.leg) {
    // The outside of each leg is a quarter of the way round.
    for (const round of [.25, .75]) {
      t.save();
      t.translate(round * trousers.width, 0);
      // Down the leg is up its texture's rows from the ankle, so y is laid downwards.
      t.scale(trousers.width / LEG.round, -trousers.height / LEG.tall);
      if (round > .5) t.scale(-1, 1);
      print.leg.forEach(b => bolt(t, { ...b, y: -b.y }));
      t.restore();
    }
  }
}

/**
 * A print's two textures, the shirt's and the trousers', painted the first
 * time it is asked for and kept: the batter and the side in the field both
 * wear them from here, so a kit is painted once however many wear it.
 */
const painted = new WeakMap<KitPrint, { shirt: THREE.CanvasTexture; trousers: THREE.CanvasTexture }>();
export function printTextures(print: KitPrint) {
  let sheets = painted.get(print);
  if (!sheets) {
    const shirt = printSheet(1024, 512), trousers = printSheet(512, 512);
    paintKitPrint(print, shirt.canvas, trousers.canvas);
    sheets = { shirt: shirt.texture, trousers: trousers.texture };
    painted.set(print, sheets);
  }
  return sheets;
}

/** A canvas a print is painted into, and the texture the shader reads it from. */
export interface PrintSheet { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture }
export function printSheet(width: number, height: number): PrintSheet {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return { canvas, texture };
}

/** The uniforms a printable material reads: the print, whether it is on, and how the texture is split between the torso and the sleeves. */
export interface PrintUniforms {
  uKitPrint: { value: THREE.Texture | null };
  uKitPrintOn: { value: number };
  uKitSplit: { value: number };
  uKitGutter: { value: number };
}

/**
 * Makes a garment's material able to wear a print. It reads `kitPrint` off
 * the geometry (`kitPrintRing`); with the print off it draws as it always
 * did. The print takes the floodlights' glow with it: lit at night the shirt
 * glows in its own colour (`kitsUnderLights`), and so does each bolt in its.
 */
export function printable(material: THREE.MeshStandardMaterial, split: number): PrintUniforms {
  const uniforms: PrintUniforms = { uKitPrint: { value: null }, uKitPrintOn: { value: 0 }, uKitSplit: { value: split }, uKitGutter: { value: split < 1 ? GUTTER : 0 } };
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `attribute vec4 kitPrint;\nvarying vec4 vKitPrint;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vKitPrint = kitPrint;');
    shader.fragmentShader = `uniform sampler2D uKitPrint;\nuniform float uKitPrintOn;\nuniform float uKitSplit;\nuniform float uKitGutter;\nvarying vec4 vKitPrint;\n${shader.fragmentShader}`
      .replace('#include <color_fragment>', `#include <color_fragment>
  float kitInk = 0.; vec3 kitColour = vec3(0.);
  // The first ring of each sleeve is laid from the torso's armhole to the
  // sleeve's own first row, and everything about where it is on the texture
  // is mixed between the two across it, the sleeve's hem band smeared round
  // the shoulder as a line: so it is left plain, as the part is between parts.
  if (uKitPrintOn > .5 && dot(vKitPrint.xy, vKitPrint.xy) > .25 && (vKitPrint.w < .02 || vKitPrint.w > .98)) {
    vec2 cs = vKitPrint.xy;
    float r2 = dot(cs, cs);
    // Round the ring from the point on its circle, and its rate across the
    // pixel from the circle too, so the texture's mipmaps see no jump where
    // the angle wraps.
    float kitRound = atan(cs.y, cs.x) / 6.28318530718 + .5;
    vec2 dx = dFdx(cs), dy = dFdy(cs);
    float rx = (cs.x * dx.y - cs.y * dx.x) / (6.28318530718 * r2), ry = (cs.x * dy.y - cs.y * dy.x) / (6.28318530718 * r2);
    bool sleeve = vKitPrint.w > .5;
    // Each part's own stretch of the texture, its reads kept half a texel inside it.
    float lo = sleeve ? uKitSplit + uKitGutter : 0., hi = sleeve ? 1. - uKitGutter : uKitSplit - uKitGutter;
    float across = hi - lo, halfTexel = .5 / float(textureSize(uKitPrint, 0).x);
    vec2 at = vec2(clamp(lo + kitRound * across, lo + halfTexel, hi - halfTexel), vKitPrint.z);
    // Where a pixel straddles the join of two parts (the shoulder, where the
    // torso's ring becomes the sleeve's) the rates jump, and taken whole they
    // read the texture's coarsest mipmap, every colour in it at once, as a line
    // round the join: held to a few texels a pixel, no real stretch is cut.
    vec2 gx = clamp(vec2(rx * across, dFdx(vKitPrint.z)), -.02, .02), gy = clamp(vec2(ry * across, dFdy(vKitPrint.z)), -.02, .02);
    vec4 ink = textureGrad(uKitPrint, at, gx, gy);
    kitInk = ink.a; kitColour = ink.rgb;
    diffuseColor.rgb = mix(diffuseColor.rgb, ink.rgb, ink.a);
  }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  if (kitInk > 0.) {
    float kitGlow = dot(emissive, vec3(1.)) / max(dot(diffuse, vec3(1.)), 1e-4);
    totalEmissiveRadiance = mix(totalEmissiveRadiance, kitColour * kitGlow, kitInk);
  }`);
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}|kitPrint`;
  return uniforms;
}

/**
 * The `kitPrint` attribute for a ring of vertices: `angle` round it (0 in
 * front), `up` how high it is on the texture (0 at the foot, 1 at the top),
 * and `part` which part of the texture it reads (0 the torso or a trouser
 * leg, 1 a sleeve). A vertex left at nought round has no print.
 */
export function setPrint(attribute: THREE.BufferAttribute, index: number, angle: number, up: number, part: number) {
  attribute.setXYZW(index, Math.cos(angle), Math.sin(angle), up, part);
}
