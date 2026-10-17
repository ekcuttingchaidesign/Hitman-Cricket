/**
 * Batting gloves: the pair he has always worn ("Classic", built in `Batter`'s
 * own constructor and left there) and new designs drawn from real gloves, for
 * the Dressing Room to hand out. `Batter.wearGloves` puts one on.
 *
 * A glove is the closed fist on the handle and the gauntlet up the wrist, in
 * the frames `Batter` already gives them: the fist in the bat's frame, the
 * handle through it along y, the knuckles to +z on the bottom hand and to -z
 * on the top one (`back`); the gauntlet's y running from the wrist up the
 * forearm. Every piece of a new glove sits where the Classic's piece of the
 * same name does, so a design changes how the glove looks and never where it
 * is: the grip, the wrist socket and the tests that measure them stay put.
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

const UP = new THREE.Vector3(0, 1, 0);
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

/**
 * The fist of one glove, in the glove group's frame. `back` is the side the
 * knuckles face: -1 for the top hand, 1 for the bottom. Also hands back the
 * padding's material, for the heel `Batter` re-aims at the wrist every frame.
 */
export function buildGloveHand(design: GloveDesign, back: number) {
  const paint = palette(), hand = new THREE.Group();
  hand.name = `${design.name} glove`;
  const base = paint(design.base);
  piece(hand, base, [.112, .103, .110]).name = 'Closed padded glove';
  piece(hand, paint(design.palm, .95), [.077, .087, .022]).position.z = -back * .049;
  for (let finger = 0; finger < 4; finger++) {
    const index = finger === 3, y = .034 - finger * .023;
    const roll = design.rolls[finger];
    const [knuckleOf, cornerOf, fingerOf] = index && design.index ? design.index : [roll, roll, roll];
    // The side bar: the index roll fatter and standing a little proud, its
    // lower edge kept inside the fist so it never reaches the other glove.
    const bar = index && design.sideBar, depth = bar ? .023 : .0198, lift = bar ? -.0015 : 0, proud = bar ? .004 : .001;
    const knuckle = piece(hand, paint(knuckleOf), [.076, depth, .036 + proud]);
    knuckle.position.set(-back * .004, y + lift, back * (.0505 + proud / 2));
    const corner = piece(hand, paint(cornerOf), [.035 + proud, depth, .035 + proud]);
    corner.position.set(back * (.043 + proud / 3), y + lift, back * (.041 + proud / 3)); corner.rotation.y = Math.PI / 4;
    const length = piece(hand, paint(fingerOf), [.031 + proud, depth, .050]);
    length.position.set(back * (.0555 + proud / 2), y + lift, -back * .004);
    const tip = piece(hand, paint(design.tips?.[finger] ?? design.base), [.043, .022, .032]);
    tip.position.set(back * .036, y + lift, -back * .042);
    if (design.flash?.fingers.includes(finger)) {
      // Dashes across the roll where it goes over the knuckle, printed on its face.
      const ink = paint(design.flash.colour, .7), n = design.flash.count;
      for (let s = 0; s < n; s++) {
        const dash = piece(hand, ink, [.0045, depth * .62, .003], 'flat');
        dash.position.set(-back * (.026 - s * .014), y + lift, back * (.0505 + (.036 + proud) / 2));
      }
    }
  }
  if (design.knuckleBar) {
    // Across the base of all four fingers, on the corner of the fist the back
    // of the hand comes round, with the badge on its face.
    const bar = piece(hand, paint(design.knuckleBar.colour), [.026, .094, .040]);
    bar.position.set(-back * .047, -.0005, back * .043); bar.rotation.y = Math.PI / 4;
    if (design.knuckleBar.badge) {
      const badge = piece(hand, paint(design.knuckleBar.badge, .5), [.003, .05, .014], 'flat');
      badge.position.copy(bar.position).add(new THREE.Vector3(-back, 0, back).normalize().multiplyScalar(.0205));
      badge.rotation.y = bar.rotation.y;
    }
  }
  const thumbFrom = new THREE.Vector3(-back * .045, .024, -back * .028), thumbTo = new THREE.Vector3(back * .007, -.018, -back * .061);
  const thumb = piece(hand, paint(design.thumb), [1, 1, 1]);
  thumb.name = 'Thumb opposed to curled fingers';
  segment(thumb, thumbFrom, thumbTo, .039);
  if (design.thumbTip) {
    const tip = piece(hand, paint(design.thumbTip), [1, 1, 1]);
    segment(tip, thumbFrom.clone().lerp(thumbTo, .8), thumbTo.clone().lerp(thumbFrom, -.08), .041);
  }
  for (const at of [.38, .72]) {
    const ridge = piece(hand, paint(design.ridges), [.047, .008, .047], 'tube');
    ridge.position.copy(thumbFrom).lerp(thumbTo, at);
    ridge.quaternion.setFromUnitVectors(UP, thumbTo.clone().sub(thumbFrom).normalize());
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

function segment(mesh: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3, width: number) {
  const axis = end.clone().sub(start);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(UP, axis.clone().normalize());
  mesh.scale.set(width, axis.length(), width);
}
