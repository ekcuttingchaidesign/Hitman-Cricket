import * as THREE from 'three';

/**
 * A kit's print: lightning bolts and trim drawn over the shirt and trousers,
 * for the Super10 kits (`src/game/super10-kits.ts`). Every other kit is plain
 * colours, and wears none.
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
 * stars, the Falcons' wing chevrons, the Farmers' aura rings and the
 * Mavericks' crown points.
 *
 * - `bolt`: the lightning icon.
 * - `star`: a four-pointed sparkle.
 * - `chevron`: a V pointing down, its arms `thick` of its width.
 * - `bar`: a plain band.
 * - `ring`: an arc round its middle, `w` its radius, `h` its thickness,
 *   `from` and `sweep` where it starts and how far it runs (degrees,
 *   anticlockwise from the right); `lean` is not used.
 * - `crown`: a band with a row of `points` sharp points along its top.
 */
export interface Mark {
  x: number; y: number; w: number; h: number; lean: number; colour: string;
  shape?: 'bolt' | 'star' | 'chevron' | 'bar' | 'ring' | 'crown';
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
}

/** The lightning icon's outline, in a unit square centred on nought, y down. */
const ZAP: readonly [number, number][] = [[.04, -.42], [-.375, .08], [0, .08], [-.04, .42], [.375, -.08], [0, -.08]];
/** A four-pointed sparkle, y up: its waist is a sixth of its reach. */
const STAR: readonly [number, number][] = [[0, .5], [.085, .085], [.5, 0], [.085, -.085], [0, -.5], [-.085, -.085], [-.5, 0], [-.085, .085]];

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
    case 'chevron': {
      const k = b.thick ?? .25;
      polygon([[-.5, .5], [-.5 + k, .5], [0, -.5 + 2 * k], [.5 - k, .5], [.5, .5], [0, -.5]]);
      break;
    }
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
