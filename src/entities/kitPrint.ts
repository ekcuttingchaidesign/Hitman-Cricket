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
 * A bolt of lightning: where its middle is on a panel, in metres from the
 * panel's centre (x across as you look at it, y up), how wide and long it is,
 * how far it leans from upright (degrees, clockwise), and its colour.
 */
export interface Bolt { x: number; y: number; w: number; h: number; lean: number; colour: string }

export interface KitPrint {
  /** Across the chest and across the back. */
  chest: Bolt[];
  back: Bolt[];
  /** The V of the collar: its colour, and a thinner line inside it. */
  collar?: { colour: string; inner?: string };
  /** A band round each sleeve's hem, with a thin line above it. */
  hem?: { colour: string; line?: string };
  /** On the outside of each sleeve, above the hem: x across the sleeve from its outside, y up from the hem. */
  sleeve?: Bolt[];
  /** Down the outside of each trouser leg: y down from the hip. */
  leg?: Bolt[];
}

/** The lightning icon's outline, in a unit square centred on nought. */
const ZAP: readonly [number, number][] = [[.04, -.42], [-.375, .08], [0, .08], [-.04, .42], [.375, -.08], [0, -.08]]
  .map(([x, y]) => [x, y] as [number, number]);

function bolt(ctx: CanvasRenderingContext2D, b: Bolt) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(-b.lean * Math.PI / 180);
  ctx.scale(b.w, b.h);
  ctx.beginPath();
  // The outline is drawn y down, the panel y up: flip it, so the bolt's head is at its top.
  ZAP.forEach(([x, y], i) => (i ? ctx.lineTo(x, -y) : ctx.moveTo(x, -y)));
  ctx.closePath();
  ctx.fillStyle = b.colour; ctx.fill();
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
export function paintKitPrint(print: KitPrint, shirt: HTMLCanvasElement, trousers: HTMLCanvasElement) {
  const s = shirt.getContext('2d')!, t = trousers.getContext('2d')!;
  s.clearRect(0, 0, shirt.width, shirt.height); t.clearRect(0, 0, trousers.width, trousers.height);
  const W = Math.round(shirt.width * TORSO_SHARE), H = shirt.height;
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
  for (let y = 0; y < H; y++) {
    const up = clothAt(1 - (y + .5) / H);
    s.drawImage(flat, 0, Math.min(FH - 1, Math.max(0, Math.floor((1 - up / CLOTH.tall) * FH))), W, 1, 0, y, W, 1);
  }
  // The sleeves: round each, and from the shoulder (the top) down.
  const sx = W, sw = shirt.width - W;
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
}

/**
 * Makes a garment's material able to wear a print. It reads `kitPrint` off
 * the geometry (`kitPrintRing`); with the print off it draws as it always
 * did. The print takes the floodlights' glow with it: lit at night the shirt
 * glows in its own colour (`kitsUnderLights`), and so does each bolt in its.
 */
export function printable(material: THREE.MeshStandardMaterial, split: number): PrintUniforms {
  const uniforms: PrintUniforms = { uKitPrint: { value: null }, uKitPrintOn: { value: 0 }, uKitSplit: { value: split } };
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `attribute vec4 kitPrint;\nvarying vec4 vKitPrint;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vKitPrint = kitPrint;');
    shader.fragmentShader = `uniform sampler2D uKitPrint;\nuniform float uKitPrintOn;\nuniform float uKitSplit;\nvarying vec4 vKitPrint;\n${shader.fragmentShader}`
      .replace('#include <color_fragment>', `#include <color_fragment>
  float kitInk = 0.; vec3 kitColour = vec3(0.);
  if (uKitPrintOn > .5 && dot(vKitPrint.xy, vKitPrint.xy) > .25) {
    vec2 cs = vKitPrint.xy;
    float r2 = dot(cs, cs);
    // Round the ring from the point on its circle, and its rate across the
    // pixel from the circle too, so the texture's mipmaps see no jump where
    // the angle wraps.
    float kitRound = atan(cs.y, cs.x) / 6.28318530718 + .5;
    vec2 dx = dFdx(cs), dy = dFdy(cs);
    float rx = (cs.x * dx.y - cs.y * dx.x) / (6.28318530718 * r2), ry = (cs.x * dy.y - cs.y * dy.x) / (6.28318530718 * r2);
    bool sleeve = vKitPrint.w > .5;
    float across = sleeve ? 1. - uKitSplit : uKitSplit;
    vec2 at = vec2((sleeve ? uKitSplit : 0.) + kitRound * across, vKitPrint.z);
    vec4 ink = textureGrad(uKitPrint, at, vec2(rx * across, dFdx(vKitPrint.z)), vec2(ry * across, dFdy(vKitPrint.z)));
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
