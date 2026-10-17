/**
 * Batting gloves: the pair he has always worn ("Classic", built in `Batter`'s
 * own constructor and left there) and new designs drawn from real gloves, for
 * the Dressing Room to hand out. `Batter.wearGloves` puts one on.
 *
 * A glove is the closed fist on the handle and the gauntlet up the wrist, in
 * the frames `Batter` already gives them: the fist in the bat's frame, the
 * handle through it along y and the flat face to +z (which way round each
 * hand goes is `buildGloveHand`'s); the gauntlet's y running from the wrist up
 * the forearm. A new fist fits in the space the Classic's does, so the grip,
 * the wrist socket and the tests that measure them stay put.
 *
 * What a real glove has that the Classic does not, and what a design colours:
 *  - the finger rolls, each its own colour, the index finger's (the lowest on
 *    the handle, beside the other hand) often a fatter side bar of its own;
 *  - the knuckle bar across the base of the fingers, where the maker's badge is;
 *  - stripes printed across the rolls;
 *  - the thumb's tip and the ridges across its guard;
 *  - the gauntlet's knitted bands, the strap with its badge, the padded rim.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type GloveId = 'classic' | 'sky' | 'fern' | 'contour' | 'blaze' | 'midnight';

/** A print on some of the padding: contour lines, or pinstripes. */
export interface GlovePrint { kind: 'contour' | 'pinstripe'; ground: string; ink: string }

export interface GloveDesign {
  id: GloveId;
  name: string;
  /** What it is, in a line. */
  line: string;
  /** The padding everywhere nothing else is said. */
  base: string;
  /** The leather palm inside the fist. */
  palm: string;
  /** Each finger's roll, little finger first and index last; a print in place of a colour prints it. */
  rolls: [Paint, Paint, Paint, Paint];
  /** The index finger's roll in its three pieces — over the knuckle, round the corner, down the finger — where they differ. */
  index?: [Paint, Paint, Paint];
  /** The index roll made a fatter side bar, as most gloves have it. */
  sideBar?: boolean;
  /** The fingertips, little finger first. */
  tips?: [string, string, string, string];
  /** Across the base of the fingers, over the knuckles, and the badge on it. */
  knuckleBar?: { colour: Paint; badge?: string };
  /** Short stripes printed across each finger roll over the knuckle. */
  flash?: { colour: string; count: number; fingers: number[] };
  thumb: string;
  thumbTip?: string;
  ridges: string;
  cuff: {
    base: string;
    /** Knitted bands round the gauntlet: where up it from the wrist, how deep, what colour. */
    bands: { at: number; depth: number; colour: string }[];
    strap?: string;
    badge?: string;
    rim: string;
  };
}

type Paint = string | GlovePrint;

/**
 * The catalogue, Classic first. Classic's colours here only describe it for a
 * swatch: on the batter it is the glove `Batter` was built with, whose cuff
 * band follows the kit's trim.
 */
export const GLOVES: readonly GloveDesign[] = [
  {
    id: 'classic', name: 'Classic', line: 'The pair from day one. Plain white padding, the cuff band in your kit\'s trim.',
    base: '#FDFCF4', palm: '#D9D9CF', rolls: ['#FDFCF4', '#FDFCF4', '#FDFCF4', '#FDFCF4'],
    thumb: '#FDFCF4', ridges: '#FDFCF4',
    cuff: { base: '#FDFCF4', bands: [{ at: .014, depth: .026, colour: '#ED7044' }], strap: '#ED7044', rim: '#FDFCF4' },
  },
  {
    id: 'sky', name: 'Skyline', line: 'White with a sky-blue side bar and fingertip, a gold pinstripe flash, and a navy band round the cuff.',
    base: '#FBFBF7', palm: '#ECEBE4',
    rolls: ['#FBFBF7', '#FBFBF7', { kind: 'pinstripe', ground: '#F6E7C4', ink: '#E7A93A' }, '#1E9BE0'],
    sideBar: true,
    tips: ['#FBFBF7', '#FBFBF7', '#FBFBF7', '#1E9BE0'],
    knuckleBar: { colour: '#1E9BE0', badge: '#FBFBF7' },
    thumb: '#FBFBF7', thumbTip: '#1E9BE0', ridges: '#1E9BE0',
    cuff: { base: '#FBFBF7', bands: [{ at: .072, depth: .014, colour: '#1B2A6B' }], strap: '#FBFBF7', badge: '#1B2A6B', rim: '#FBFBF7' },
  },
  {
    id: 'fern', name: 'Fern', line: 'A lime index roll fading into bottle green, a deep green knuckle bar, and the cuff ringed green and lime.',
    base: '#FAFAF6', palm: '#F1F0EA',
    rolls: ['#FAFAF6', '#FAFAF6', '#FAFAF6', '#9AD22A'],
    index: ['#9AD22A', '#3E9A3A', '#0E6B5C'],
    sideBar: true,
    tips: ['#FAFAF6', '#FAFAF6', '#FAFAF6', '#9AD22A'],
    knuckleBar: { colour: '#0E6B5C', badge: '#FAFAF6' },
    thumb: '#FAFAF6', thumbTip: '#9AD22A', ridges: '#0E6B5C',
    cuff: {
      base: '#FAFAF6', bands: [{ at: .050, depth: .018, colour: '#0E6B5C' }, { at: .074, depth: .008, colour: '#9AD22A' }],
      strap: '#FAFAF6', badge: '#0E6B5C', rim: '#FAFAF6',
    },
  },
  {
    id: 'contour', name: 'Contour', line: 'An orange index roll beside a charcoal one printed with orange contour lines, and a black band round the cuff.',
    base: '#FCFBF8', palm: '#EEEDE8',
    rolls: ['#FCFBF8', '#FCFBF8', { kind: 'contour', ground: '#3A3D41', ink: '#F08A4B' }, '#F07C3C'],
    sideBar: true,
    tips: ['#FCFBF8', '#FCFBF8', '#3A3D41', '#F07C3C'],
    knuckleBar: { colour: '#FCFBF8', badge: '#17191B' },
    thumb: '#FCFBF8', thumbTip: '#F07C3C', ridges: '#3A3D41',
    cuff: { base: '#FCFBF8', bands: [{ at: .066, depth: .012, colour: '#17191B' }], strap: '#FCFBF8', badge: '#F07C3C', rim: '#FCFBF8' },
  },
  {
    id: 'blaze', name: 'Blaze', line: 'Fluoro orange across every roll with black dashes, the piping in black, and a cuff knitted in orange and black stripes.',
    base: '#F5F4F1', palm: '#E6E4DF',
    rolls: ['#FF4A1C', '#FF4A1C', '#FF4A1C', '#FF4A1C'],
    index: ['#FF4A1C', '#F5F4F1', '#F5F4F1'],
    flash: { colour: '#1A1A1A', count: 3, fingers: [0, 1, 2, 3] },
    knuckleBar: { colour: '#F5F4F1', badge: '#1A1A1A' },
    thumb: '#F5F4F1', thumbTip: '#FF4A1C', ridges: '#1A1A1A',
    cuff: {
      base: '#FF4A1C', bands: [{ at: .022, depth: .012, colour: '#1A1A1A' }, { at: .046, depth: .010, colour: '#1A1A1A' }, { at: .068, depth: .010, colour: '#1A1A1A' }],
      strap: '#1A1A1A', badge: '#FF4A1C', rim: '#1A1A1A',
    },
  },
  {
    id: 'midnight', name: 'Midnight', line: 'Coloured clothing gloves: navy padding, gold piping and fingertip, a gold band and a navy cuff.',
    base: '#1C2742', palm: '#E9E6DE',
    rolls: ['#1C2742', '#1C2742', '#1C2742', '#E3B341'],
    index: ['#E3B341', '#1C2742', '#1C2742'],
    sideBar: true,
    tips: ['#1C2742', '#1C2742', '#1C2742', '#E3B341'],
    knuckleBar: { colour: '#24325A', badge: '#E3B341' },
    thumb: '#1C2742', thumbTip: '#E3B341', ridges: '#E3B341',
    cuff: { base: '#1C2742', bands: [{ at: .062, depth: .010, colour: '#E3B341' }], strap: '#24325A', badge: '#E3B341', rim: '#1C2742' },
  },
];

export const gloveOf = (id: string | null | undefined): GloveDesign => GLOVES.find(g => g.id === id) ?? GLOVES[0];

const shapes = {
  soft: new RoundedBoxGeometry(1, 1, 1, 2, .3),
  tube: new THREE.CylinderGeometry(.5, .5, 1, 20, 1),
  flat: new THREE.BoxGeometry(1, 1, 1),
};

/** A print drawn once into a canvas, at the size of a roll's face. */
const prints = new Map<string, THREE.Texture>();
function printOf(print: GlovePrint): THREE.Texture {
  const key = `${print.kind}:${print.ground}:${print.ink}`;
  const known = prints.get(key);
  if (known) return known;
  const size = 128, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = print.ground; g.fillRect(0, 0, size, size);
  if (print.kind === 'pinstripe') {
    g.strokeStyle = print.ink; g.lineWidth = 2.2;
    for (let x = -size; x < size * 2; x += 9) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + size * .45, size); g.stroke(); }
  } else {
    // Contour lines: a smooth hill, every level of it inked.
    const image = g.getImageData(0, 0, size, size), ink = new THREE.Color(print.ink);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size * 6.3, v = y / size * 6.3;
      const h = Math.sin(u * 1.1 + Math.sin(v * .9)) + Math.cos(v * 1.3 - Math.sin(u * .7) * 1.4) + .5 * Math.sin((u + v) * 1.7);
      const level = h * 3.2 - Math.floor(h * 3.2);
      if (Math.abs(level - .5) < .09) {
        const at = (y * size + x) * 4;
        image.data[at] = ink.r * 255; image.data[at + 1] = ink.g * 255; image.data[at + 2] = ink.b * 255;
      }
    }
    g.putImageData(image, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  prints.set(key, texture);
  return texture;
}

/** One material a paint, for the glove being built, so like pieces batch together. */
function palette() {
  const made = new Map<string, THREE.MeshStandardMaterial>();
  return (paint: Paint, roughness = .6) => {
    const key = `${typeof paint === 'string' ? paint : `${paint.kind}:${paint.ground}:${paint.ink}`}:${roughness}`;
    let material = made.get(key);
    if (!material) {
      material = typeof paint === 'string'
        ? new THREE.MeshStandardMaterial({ color: paint, roughness })
        : new THREE.MeshStandardMaterial({ color: 0xffffff, map: printOf(paint), roughness });
      made.set(key, material);
    }
    return material;
  };
}

function piece(parent: THREE.Object3D, material: THREE.Material, scale: [number, number, number], shape: keyof typeof shapes = 'soft') {
  const mesh = new THREE.Mesh(shapes[shape], material);
  mesh.scale.set(...scale); mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Round the handle: a point `radius` out from its axis at `angle` (degrees, 90 on the knuckles' side), `y` up it. */
const round = (radius: number, angle: number, y: number, knuckles: number) =>
  new THREE.Vector3(radius * Math.cos(angle * Math.PI / 180), y, knuckles * radius * Math.sin(angle * Math.PI / 180));

/** A padded roll bent round the handle, from one angle to another, `y` up it. */
function arc(radius: number, tube: number, from: number, to: number, y: number, knuckles: number) {
  // Angles turned onto the hand's own side here, rather than the mesh scaled
  // by -1, which would come out inside out once the glove is batched.
  const [a, b] = knuckles > 0 ? [from, to] : [-from, -to];
  const start = Math.min(a, b) * Math.PI / 180, sweep = Math.abs(b - a) * Math.PI / 180;
  return new THREE.TorusGeometry(radius, tube, 10, Math.max(6, Math.round(sweep * 10)), sweep)
    .rotateZ(start).rotateX(Math.PI / 2).translate(0, y, 0);
}

/** The handle's radius under the glove, and how far out a finger's roll runs round it. */
const CORE = .025;
/**
 * The phalanges as arcs round the handle (degrees, 90 the middle of the
 * knuckles' side, 0 the edge the fingers go round), a few degrees apart so
 * each joint shows as a pinch in the roll.
 */
const PHALANGES: [number, number][] = [[100, 40], [34, -16], [-22, -64]];

/**
 * The fist of one glove, in the glove group's frame. Hands back the padding's
 * material too, for the heel `Batter` re-aims at the wrist every frame.
 *
 * Which way round each hand goes is the point of it, and it is a right-
 * hander's grip photographed from the side: the bat's flat face is +z, the
 * back of the top hand is on the curved back with its fingers curling round
 * onto the face, and the bottom hand is the other way round, its knuckles on
 * the face and its fingers curling onto the back. Both hands' fingers go round
 * the same edge of the handle (+x here, where the stage's mirror puts it) and
 * both thumbs point down it at the blade, so the two fists are a left and a
 * right hand, mirror images across the face.
 *
 * Each finger is a roll bent round the handle in three pieces with a capped
 * tip, so which way it curls is the shape itself. The thumb is a roll of its
 * own off the heel of the hand, round the other edge and down the handle, in
 * the part of the fist the fingers do not reach, so it lies on the glove
 * rather than in it. Under them, only a slim pad on the back of the hand with
 * the knuckle roll across it: no block for anything to sink into, and between
 * the rolls the bat's own grip.
 */
export function buildGloveHand(design: GloveDesign, top: boolean) {
  const paint = palette(), hand = new THREE.Group();
  hand.name = `${design.name} glove`;
  const k = top ? -1 : 1;
  const base = paint(design.base);
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true; mesh.receiveShadow = true; hand.add(mesh);
    return mesh;
  };
  for (let finger = 0; finger < 4; finger++) {
    const index = finger === 3, y = .034 - finger * .023;
    const bar = index && design.sideBar;
    // Thicker towards the index; the side bar thicker again and standing out.
    const tube = bar ? .0136 : .0112 + finger * .0004, radius = CORE + tube;
    const roll = design.rolls[finger];
    const pieces: Paint[] = index && design.index ? design.index : [roll, roll, roll];
    const tip = design.tips?.[finger];
    PHALANGES.forEach(([from, to], at) => {
      const paintOf = at === 2 && tip ? tip : pieces[at];
      const material = paint(paintOf);
      // Each piece a little thinner than the one before it, and capped at both
      // ends a shade under its own thickness, so the joints pinch.
      const t = tube * (1 - at * .06);
      add(arc(radius, t, from, to, y, k), material);
      for (const end of [from, to]) {
        const cap = add(new THREE.SphereGeometry(t * (end === PHALANGES[2][1] ? 1 : .93), 12, 8), material);
        cap.position.copy(round(radius, end, y, k));
      }
    });
    if (design.flash?.fingers.includes(finger)) {
      // Dashes printed across the roll over the first joint.
      const ink = paint(design.flash.colour, .7);
      for (let s = 0; s < design.flash.count; s++) {
        const angle = 88 - s * 16;
        const dash = add(new THREE.BoxGeometry(.004, tube * 1.2, .003), ink);
        dash.position.copy(round(radius + tube * .92, angle, y, k));
        dash.rotation.y = -k * (angle - 90) * Math.PI / 180;
      }
    }
  }
  // The back of the hand: a slim pad from the knuckles back towards the heel,
  // and the knuckle roll across the base of all four fingers.
  const back = add(new RoundedBoxGeometry(.052, .102, .026, 3, .012), base);
  back.position.set(-.027, -.0005, k * (CORE + .011));
  back.name = 'Back of the hand';
  const knuckle = add(new THREE.CapsuleGeometry(.0125, .082, 6, 14), paint(design.knuckleBar?.colour ?? design.base));
  knuckle.position.copy(round(CORE + .016, 106, -.0005, k));
  if (design.knuckleBar?.badge) {
    const badge = add(new RoundedBoxGeometry(.016, .046, .004, 2, .0015), paint(design.knuckleBar.badge, .5));
    badge.position.set(-.031, -.0005, k * (CORE + .024));
  }
  // The thumb: off the heel, round the edge the fingers do not go round, and
  // down the handle at the blade, its tip short of theirs.
  const thumbAt = (angle: number, y: number) => round(CORE + .013, angle, y, k);
  const first = new THREE.CatmullRomCurve3([thumbAt(150, .026), thumbAt(168, .016), thumbAt(186, .002)]);
  const second = new THREE.CatmullRomCurve3([thumbAt(190, -.002), thumbAt(204, -.016), thumbAt(214, -.028)]);
  const thumbPaint = paint(design.thumb), tipPaint = paint(design.thumbTip ?? design.thumb);
  add(new THREE.TubeGeometry(first, 12, .0132, 10), thumbPaint).name = 'Thumb opposed to curled fingers';
  add(new THREE.TubeGeometry(second, 10, .012, 10), tipPaint);
  for (const [curve, paintOf, t] of [[first, thumbPaint, .0132], [second, tipPaint, .012]] as const) {
    for (const end of [0, 1]) add(new THREE.SphereGeometry(t * (end ? .96 : 1), 12, 8), paintOf).position.copy(curve.getPoint(end));
  }
  // The guard's ridges, rings round the first piece.
  for (const along of [.35, .7]) {
    const ridge = add(new THREE.TorusGeometry(.0136, .0022, 6, 18), paint(design.ridges));
    ridge.position.copy(first.getPoint(along));
    ridge.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), first.getTangent(along));
  }
  return { hand, padding: base };
}

/** The gauntlet, in its own frame: y from the wrist up the forearm. */
export function buildGloveCuff(design: GloveDesign) {
  const paint = palette(), cuff = new THREE.Group(), c = design.cuff;
  cuff.name = `${design.name} gauntlet`;
  piece(cuff, paint(c.base, .8), [.113, .105, .113], 'tube').position.y = .052;
  for (const band of c.bands) piece(cuff, paint(band.colour, .8), [.1165, band.depth, .1165], 'tube').position.y = band.at;
  if (c.strap) {
    // The strap closes over the wrist, the badge on it.
    piece(cuff, paint(c.strap, .55), [.121, .030, .121], 'tube').position.y = .018;
    if (c.badge) piece(cuff, paint(c.badge, .5), [.034, .018, .006], 'soft').position.set(0, .018, .061);
  }
  piece(cuff, paint(c.rim, .7), [.122, .014, .122], 'tube').position.y = .104;
  return cuff;
}
