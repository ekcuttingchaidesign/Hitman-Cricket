/**
 * Batting gloves: the designs the batter wears, drawn from real gloves, one of
 * them his by default (`DEFAULT_GLOVE`) and the rest for the Dressing Room to
 * hand out. `Batter.wearGloves` puts one on.
 *
 * A glove is the closed fist on the handle and the gauntlet up the wrist, in
 * the frames `Batter` gives them: the fist in the bat's frame, the handle
 * through it along y and the flat face to +z (which way round each hand goes
 * is `buildGloveHand`'s); the gauntlet's y running from the wrist up the
 * forearm. Every fist fits the same space on the handle, so the grip, the
 * wrist socket and the tests that measure them never move with the design;
 * the heel to the wrist and the gauntlet are turned to the knuckles' side by
 * `Batter`.
 *
 * What a design colours:
 *  - the finger rolls, each its own colour or print, or a fade along every
 *    finger; the index finger's (the lowest on the handle, beside the other
 *    hand) often a fatter side bar of its own;
 *  - the knuckle bar across the base of the fingers, where the maker's badge is;
 *  - dashes printed across the rolls;
 *  - the thumb's tip and the ridges across its guard;
 *  - the gauntlet's knitted bands, the strap with its badge, the rim.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FREE_GLOVES, type GloveId } from '../game/dressing-ids';

export type { GloveId };
/** The pair he is built wearing: white and silver, so it goes with every kit and with the Test match's whites. */
export const DEFAULT_GLOVE: GloveId = FREE_GLOVES;

/** A print on some of the padding: a carbon-fibre weave in two greys. */
export interface GlovePrint { kind: 'carbon'; ground: string; ink: string }

export interface GloveDesign {
  id: GloveId;
  name: string;
  /** What it is, in a line. */
  line: string;
  /** The light the Dressing Room is lit in while it is on show. */
  glow: string;
  /** The padding everywhere nothing else is said. */
  base: string;
  /** Each finger's roll, little finger first and index last; a print in place of a colour prints it. */
  rolls: [Paint, Paint, Paint, Paint];
  /** Every roll's three pieces — over the knuckle, round the corner, down the finger — where they differ: a fade along the finger. */
  fade?: [Paint, Paint, Paint];
  /** The index finger's roll in its three pieces, where they differ from the rest. */
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

/** The weave on Carbon's rolls. */
const CARBON: GlovePrint = { kind: 'carbon', ground: '#232529', ink: '#4A5058' };

/** The catalogue, the default pair first. */
export const GLOVES: readonly GloveDesign[] = [
  {
    id: 'sterling', name: 'Sterling', line: 'White and silver: the rolls shading to silver down the fingers, a silver side bar, knuckle bar and thumb tip, and a white cuff with silver bands.',
    glow: '#C3CAD2',
    base: '#F9FAFB',
    rolls: ['#F9FAFB', '#F9FAFB', '#F9FAFB', '#C3CAD2'],
    fade: ['#F9FAFB', '#EDF0F3', '#D6DCE2'],
    index: ['#D6DCE2', '#C3CAD2', '#AEB6BF'],
    sideBar: true,
    tips: ['#D6DCE2', '#D6DCE2', '#D6DCE2', '#AEB6BF'],
    knuckleBar: { colour: '#C3CAD2', badge: '#F9FAFB' },
    thumb: '#F9FAFB', thumbTip: '#C3CAD2', ridges: '#AEB6BF',
    cuff: {
      base: '#F9FAFB', bands: [{ at: .046, depth: .014, colour: '#C3CAD2' }, { at: .070, depth: .008, colour: '#AEB6BF' }],
      strap: '#C3CAD2', badge: '#F9FAFB', rim: '#F9FAFB',
    },
  },
  {
    id: 'glacier', name: 'Glacier', line: 'Ice white, every roll fading from white at the knuckle to electric cyan at the tip, a silver knuckle bar and a cuff ringed cyan and silver.',
    glow: '#1FB6EA',
    base: '#F7FBFD',
    rolls: ['#F7FBFD', '#F7FBFD', '#F7FBFD', '#5FD2F5'],
    fade: ['#F7FBFD', '#BDEBFA', '#5FD2F5'],
    index: ['#5FD2F5', '#1FB6EA', '#0E9BD6'],
    sideBar: true,
    tips: ['#1FB6EA', '#1FB6EA', '#1FB6EA', '#0E9BD6'],
    knuckleBar: { colour: '#D7DEE3', badge: '#1FB6EA' },
    thumb: '#F7FBFD', thumbTip: '#1FB6EA', ridges: '#1FB6EA',
    cuff: {
      base: '#F7FBFD', bands: [{ at: .048, depth: .016, colour: '#1FB6EA' }, { at: .072, depth: .008, colour: '#C9D3DA' }],
      strap: '#1FB6EA', badge: '#F7FBFD', rim: '#F7FBFD',
    },
  },
  {
    id: 'fern', name: 'Fern', line: 'A lime index roll fading into bottle green, a deep green knuckle bar, and the cuff ringed green and lime.',
    glow: '#9AD22A',
    base: '#FAFAF6',
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
    id: 'carbon', name: 'Carbon', line: 'Black padding with a carbon-fibre weave across the rolls, a red index bar and tips, and a black cuff with a red strap.',
    glow: '#E0202A',
    base: '#17181B',
    rolls: [CARBON, CARBON, CARBON, '#E0202A'],
    sideBar: true,
    tips: ['#17181B', '#17181B', '#17181B', '#E0202A'],
    knuckleBar: { colour: '#17181B', badge: '#E0202A' },
    thumb: '#17181B', thumbTip: '#E0202A', ridges: '#E0202A',
    cuff: {
      base: '#17181B', bands: [{ at: .050, depth: .012, colour: '#E0202A' }, { at: .070, depth: .006, colour: '#5A5E66' }],
      strap: '#E0202A', badge: '#17181B', rim: '#17181B',
    },
  },
  {
    id: 'blaze', name: 'Blaze', line: 'Fluoro orange across every roll with black dashes, the piping in black, and a cuff knitted in orange and black stripes.',
    glow: '#FF4A1C',
    base: '#F5F4F1',
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
    glow: '#E3B341',
    base: '#1C2742',
    rolls: ['#1C2742', '#1C2742', '#1C2742', '#E3B341'],
    index: ['#E3B341', '#1C2742', '#1C2742'],
    sideBar: true,
    tips: ['#1C2742', '#1C2742', '#1C2742', '#E3B341'],
    knuckleBar: { colour: '#24325A', badge: '#E3B341' },
    thumb: '#1C2742', thumbTip: '#E3B341', ridges: '#E3B341',
    cuff: { base: '#1C2742', bands: [{ at: .062, depth: .010, colour: '#E3B341' }], strap: '#24325A', badge: '#E3B341', rim: '#1C2742' },
  },
];

export const gloveOf = (id: string | null | undefined): GloveDesign => GLOVES.find(g => g.id === id) ?? GLOVES.find(g => g.id === DEFAULT_GLOVE)!;

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
  // A carbon-fibre weave: squares of fibre lying across and along by turns,
  // each shaded from the ink to the ground along the fibre, so it reads as
  // woven rather than as a chequerboard.
  const cell = 16;
  for (let row = 0; row < size / cell; row++) for (let col = 0; col < size / cell; col++) {
    const across = (row + col) % 2 === 0, x = col * cell, y = row * cell;
    const shade = across ? g.createLinearGradient(x, y, x, y + cell) : g.createLinearGradient(x, y, x + cell, y);
    shade.addColorStop(0, print.ink); shade.addColorStop(.5, print.ground); shade.addColorStop(1, print.ink);
    g.fillStyle = shade; g.fillRect(x, y, cell, cell);
    g.strokeStyle = print.ground; g.lineWidth = 1;
    for (let n = 3; n < cell; n += 4) { g.beginPath(); if (across) { g.moveTo(x + n, y); g.lineTo(x + n, y + cell); } else { g.moveTo(x, y + n); g.lineTo(x + cell, y + n); } g.stroke(); }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(2, 2);
  prints.set(key, texture);
  return texture;
}

/**
 * Two materials for every glove: matte padding and the cuff's towelling, each
 * piece's colour baked into its vertices rather than a material of its own,
 * so a whole fist merges into one mesh (`compactRigidParts`) and a pair costs
 * the frame six draw calls, fewer than the old glove's. A print is the one
 * exception: it needs a map, so its pieces merge among themselves.
 */
const PADDING = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .62 });
const TOWELLING = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 });
const printed = new Map<string, THREE.MeshStandardMaterial>();
function printMaterial(print: GlovePrint) {
  const key = `${print.kind}:${print.ground}:${print.ink}`;
  let material = printed.get(key);
  if (!material) { material = new THREE.MeshStandardMaterial({ color: 0xffffff, map: printOf(print), roughness: .62 }); printed.set(key, material); }
  return material;
}
/** The heel's material, one a colour: the heel is re-aimed every frame and so never merged, and takes the padding's colour. */
const heels = new Map<string, THREE.MeshStandardMaterial>();
function heelMaterial(colour: string) {
  let material = heels.get(colour);
  if (!material) { material = new THREE.MeshStandardMaterial({ color: colour, roughness: .62 }); heels.set(colour, material); }
  return material;
}

/** A copy of `geometry` coloured all over. */
function coloured(geometry: THREE.BufferGeometry, colour: string) {
  const copy = geometry.clone(), count = copy.attributes.position.count, c = new THREE.Color(colour);
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { colours[i * 3] = c.r; colours[i * 3 + 1] = c.g; colours[i * 3 + 2] = c.b; }
  copy.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return copy;
}

/** A piece in `paint`: a colour baked into the shape, or a print on it. */
function made(parent: THREE.Object3D, geometry: THREE.BufferGeometry, paint: Paint, material = PADDING) {
  const mesh = typeof paint === 'string' ? new THREE.Mesh(coloured(geometry, paint), material) : new THREE.Mesh(geometry, printMaterial(paint));
  mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function piece(parent: THREE.Object3D, paint: Paint, scale: [number, number, number], shape: keyof typeof shapes = 'soft') {
  const mesh = made(parent, shapes[shape], paint);
  mesh.scale.set(...scale);
  return mesh;
}

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
 * both thumbs lie down the other edge pointing at the blade, so the two fists
 * are a left and a right hand, mirror images across the face, and the wrist
 * comes off the thumb's edge.
 *
 * A closed padded hand round the handle, and on it each finger as a roll in
 * three pieces — over the knuckle, round the corner, down the edge — with a
 * tip curled in onto the palm's side, and the knuckle bar across the base of
 * them on the back of the hand. The thumb is a roll in two pieces lying on
 * the outside of the fist: down the thumb's edge from the heel, then round
 * onto the palm's side, short of the fingertips, so it is on the hand rather
 * than in it.
 */
export function buildGloveHand(design: GloveDesign, top: boolean) {
  const hand = new THREE.Group();
  hand.name = `${design.name} glove`;
  const k = top ? -1 : 1;
  /** A point with its z given on the knuckles' side. */
  const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, k * z);
  /** A point with its z given on the palm's side. */
  const palm = (x: number, y: number, z: number) => new THREE.Vector3(x, y, -k * z);
  piece(hand, design.base, [.108, .100, .104]).name = 'Closed padded hand';
  for (let finger = 0; finger < 4; finger++) {
    const index = finger === 3, y = .034 - finger * .023;
    const roll = design.rolls[finger];
    const [knuckleOf, cornerOf, fingerOf] = index && design.index ? design.index : design.fade ?? [roll, roll, roll];
    // The side bar: the index roll fatter and standing a little proud, its
    // lower edge kept inside the fist so it never reaches the other glove.
    const bar = index && design.sideBar, depth = bar ? .023 : .0205, lift = bar ? -.0015 : 0, proud = bar ? .004 : .001;
    const knuckle = piece(hand, knuckleOf, [.074, depth, .036 + proud]);
    knuckle.position.copy(at(-.004, y + lift, .0505 + proud / 2));
    const corner = piece(hand, cornerOf, [.035 + proud, depth, .035 + proud]);
    corner.position.copy(at(.043 + proud / 3, y + lift, .041 + proud / 3)); corner.rotation.y = Math.PI / 4;
    const length = piece(hand, fingerOf, [.031 + proud, depth, .050]);
    length.position.copy(at(.0555 + proud / 2, y + lift, -.004));
    const tip = piece(hand, design.tips?.[finger] ?? design.base, [.042, depth * 1.05, .031]);
    tip.position.copy(at(.036, y + lift, -.043));
    if (design.flash?.fingers.includes(finger)) {
      // Dashes printed across the roll where it goes over the knuckle.
      for (let s = 0; s < design.flash.count; s++) {
        const dash = piece(hand, design.flash.colour, [.0045, depth * .62, .003], 'flat');
        dash.position.copy(at(-.026 + s * .014, y + lift, .0505 + (.036 + proud) / 2 + .0005));
      }
    }
  }
  // The knuckle bar: across the base of all four rolls on the back of the
  // hand, where the wrist comes off it, with the badge on its face. It stands
  // as high as the rolls and overhangs the wrist's edge, so it lies over the
  // cuff the way the back pad does on a real glove: lower and shorter, the
  // top hand's was swallowed by its cuff, which comes off the knuckles' side.
  const barOf = design.knuckleBar;
  const knuckleBar = piece(hand, barOf?.colour ?? design.base, [.036, .096, .030]);
  knuckleBar.position.copy(at(-.048, -.0005, .054));
  if (barOf?.badge) {
    const badge = piece(hand, barOf.badge, [.014, .050, .003], 'flat');
    badge.position.copy(at(-.048, -.0005, .0695));
  }
  // The thumb: down the edge the fingers do not go round, from the heel,
  // then round onto the palm's side, in two pieces and in the part of the
  // fist the fingers never reach.
  const first = [palm(-.057, .020, -.004), palm(-.056, -.014, .024)] as const;
  const second = [palm(-.052, -.016, .029), palm(-.026, -.044, .060)] as const;
  const thumb = piece(hand, design.thumb, [1, 1, 1]);
  thumb.name = 'Thumb opposed to curled fingers';
  segment(thumb, first[0], first[1], .034);
  segment(piece(hand, design.thumbTip ?? design.thumb, [1, 1, 1]), second[0], second[1], .031);
  // The thumb guard: two ridges across the first piece.
  for (const along of [.32, .68]) {
    const ridge = piece(hand, design.ridges, [.040, .007, .040], 'tube');
    ridge.position.copy(first[0]).lerp(first[1], along);
    ridge.quaternion.setFromUnitVectors(UP, first[1].clone().sub(first[0]).normalize());
  }
  return { hand, padding: heelMaterial(design.base) };
}

/**
 * The gauntlet, in its own frame: y from the wrist up the forearm, +z the
 * back of the wrist (`Batter` turns it to the knuckles' side every frame). A
 * towelling cuff hugging the forearm — wider at the hand than up the arm —
 * with the knitted bands round it, the strap closed over it with its badge on
 * the back of the wrist, and a soft rim at the top.
 */
export function buildGloveCuff(design: GloveDesign) {
  const cuff = new THREE.Group(), c = design.cuff;
  cuff.name = `${design.name} gauntlet`;
  made(cuff, new THREE.CylinderGeometry(.051, .055, CUFF_HEIGHT, 24), c.base, TOWELLING).position.y = CUFF_HEIGHT / 2;
  for (const stripe of c.bands) {
    const y = Math.min(stripe.at * (CUFF_HEIGHT / .105), CUFF_HEIGHT - stripe.depth / 2);
    const r = .0555 - .004 * (y / CUFF_HEIGHT);
    made(cuff, new THREE.CylinderGeometry(r, r + .0004, stripe.depth, 24), stripe.colour, TOWELLING).position.y = y;
  }
  if (c.strap) {
    piece(cuff, c.strap, [.118, .024, .118], 'tube').position.y = .026;
    // The strap's end over the back of the wrist, the badge on it.
    piece(cuff, c.strap, [.040, .024, .006]).position.set(0, .026, .059);
    if (c.badge) piece(cuff, c.badge, [.028, .014, .004]).position.set(0, .026, .063);
  }
  piece(cuff, c.rim, [.108, .012, .108], 'tube').position.y = CUFF_HEIGHT;
  return cuff;
}
/**
 * Where each forearm comes off the handle in his guard, in the glove's frame:
 * degrees round the handle from +x, the fingers' edge (-46 for the top hand,
 * -139 for the bottom). A new glove's fist is turned on the handle so its
 * thumb's edge faces there, which puts the back of the top hand to the bowler
 * and the back of the bottom hand to the ground, as a batter's are, and it
 * stays fixed to the handle through every stroke, as a real grip does: the
 * arms come off it from wherever the pose puts them. Turned to follow the
 * forearm instead, the backs of the hands swung in towards his body through
 * every follow-through, which read worse than an arm coming off the wrong
 * side under its cuff.
 */
export const WRIST_HOME = [-46, -139] as const;

/** How far the cuff reaches up the forearm from the wrist. */
const CUFF_HEIGHT = .074;

/**
 * The heel between a glove's fist and its wrist, which `Batter` stretches
 * from inside the fist to the wrist and turns to the knuckles' side every
 * frame: the back of the hand running on into the cuff, wider across the
 * fingers than it is thick, and tapering to the wrist.
 */
export function gloveHeelGeometry() { return new THREE.CylinderGeometry(.42, .5, 1, 20); }

function segment(mesh: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3, width: number) {
  const axis = end.clone().sub(start);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(UP, axis.clone().normalize());
  mesh.scale.set(width, axis.length(), width);
}
