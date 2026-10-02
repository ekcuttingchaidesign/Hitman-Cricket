import * as THREE from 'three';
import type { Batch } from './build';

/**
 * Blockouts for the end behind the bowler, built as a stand rather than a
 * building: two tiers of crowd round the curve of the ground, a band of glass
 * boxes between them, the sightscreen in front, and one shape on the
 * skyline to know the ground by.
 *
 * - **members**: an English or Australian members' end. Five shallow white
 *   roof shells, one a section, with a small green-roofed cupola, clock and
 *   flag at the middle of the roofline; a grass hill with two trees round to
 *   one side.
 * - **modern**: a modern bowl. The same two tiers carried right round the
 *   ground, under one flat cantilever roof with a deep fascia: no screen, no
 *   building, the stand is the ground.
 *
 * These are blockouts for choosing between, not finished work: the shapes
 * and the proportions are what is being judged.
 */
export type EndStyle = 'members' | 'modern';

/** Whether a ground brings its own floodlights, in place of the four poles every other ground stands up. */
export const ownFloodlights = (ground: string) => ground === 'modern';

/**
 * A shell is a single curved sheet, so from below the crease sees its back
 * face; the underside is drawn from the back, in the soffit lilac that the
 * grass's green bounce light turns into a neutral shade (see `pavilion.ts`).
 */
/** The floodlights' lamps, lit. */
export const lampFinish = () => new THREE.MeshStandardMaterial({ color: END.lamp, roughness: 0.4, emissive: 0xfff1c8, emissiveIntensity: 0.9 });

export const shellUnderside = () => new THREE.MeshStandardMaterial({ color: END.under, roughness: 0.85, flatShading: true, side: THREE.BackSide, emissive: 0x4a4744 });

/** The sections the end stand takes over, counted round from straight behind the bowler. */
export const END_SECTIONS = new Set([26, 27, 0, 1, 2]);

/** Whether a section is built as the end stand: the members' end only behind the bowler, the modern bowl all the way round. */
export const isEnd = (section: number, style: EndStyle) => style === 'modern' || END_SECTIONS.has(section);

export const END = {
  concrete: 0xe4dfd2,
  paint: 0xf7f4ea,
  steel: 0x8d989c,
  glass: 0x5f7380,
  green: 0x55705f,
  cover: 0xf4f3ee,
  soffit: 0xc89cf0,
  /** The underside of a roof shell, drawn from its back face: see `shellUnderside`. */
  under: 0xc89cf1,
  screen: 0x1d2b36,
  frame: 0x3a4650,
  /** The lamps: lit, a warm white that glows a little even by day (see `lampFinish`). */
  lamp: 0xfff4d9,
  grass: 0x6f9a4c,
  leaf: 0x4f7a3d,
  trunk: 0x6b5a48,
} as const;

/** Somebody sitting at x, y, z in a section's frame, the `n`th for the colour of their shirt. */
export type SeatAt = (frame: THREE.Matrix4, x: number, y: number, z: number, n: number) => void;

const RING = 39;
const SECTIONS = 28;
/** How wide a section is at `z` behind its front, so the curve closes as it goes back. */
const span = (z: number) => 2 * Math.PI * (RING + z) / SECTIONS + 0.12;

const LOWER = 5, UPPER = 4;
/** The upper tier: where its front row stands, how high it starts, how it rakes. */
const UPPER_Z = 3.4, UPPER_Y = 5.3, UPPER_STEP = { z: 1.2, y: 0.6 };
/** Where the roof sits over it. */
const EAVES = UPPER_Y + UPPER * UPPER_STEP.y + 1.6;

/** One section of the end stand, in that section's frame. */
export function endSection(b: Batch, seat: SeatAt, frame: THREE.Matrix4, section: number, style: EndStyle) {
  const { concrete, paint, steel, glass, cover } = END;
  let n = section * 31;
  // The lower tier, raking back from the rope. Straight behind the bowler its
  // middle seats are covered over in white, as the seats behind a sightscreen are.
  for (let row = 0; row < LOWER; row++) {
    const top = 0.7 + row * 0.7, z = -1.7 + row * 1.4, w = span(z);
    b.box(w, top, 1.4, concrete, 0, top / 2, z, frame);
    const count = Math.floor((w - 0.4) / 0.71);
    for (let col = 0; col < count; col++) {
      const x = -(count - 1) * 0.355 + col * 0.71;
      if (section === 0 && Math.abs(x) < 3.8) continue;
      seat(frame, x, top + 0.3, z, n++);
    }
  }
  if (section === 0) {
    const rise = Math.atan2(0.7, 1.4);
    b.box(7.8, 0.12, Math.hypot(LOWER * 1.4, LOWER * 0.7), cover, 0, 0.75 + LOWER * 0.35, -2.4 + LOWER * 0.7, frame, -rise);
  }
  // Between the tiers, a band of glass boxes with white edges.
  const back = -1.7 + LOWER * 1.4;
  const wb = span(back);
  b.box(wb, 0.3, 1, paint, 0, 0.7 * LOWER + 0.15, back - 0.2, frame);
  const band = UPPER_Y - 0.7 * LOWER - 0.55;
  b.box(wb, band, 0.15, glass, 0, 0.7 * LOWER + 0.3 + band / 2, back - 0.3, frame);
  b.box(wb, 0.4, 2.2, paint, 0, UPPER_Y - 0.35, UPPER_Z - 0.6, frame);
  b.box(wb, UPPER_Y, 1, concrete, 0, UPPER_Y / 2, back + 0.6, frame);
  // The upper tier, overhanging the boxes.
  for (let row = 0; row < UPPER; row++) {
    const z = UPPER_Z + row * UPPER_STEP.z, y = UPPER_Y + row * UPPER_STEP.y, w = span(z);
    b.box(w, 0.5, UPPER_STEP.z, concrete, 0, y - 0.25, z, frame);
    const count = Math.floor((w - 0.4) / 0.71);
    for (let col = 0; col < count; col++) seat(frame, -(count - 1) * 0.355 + col * 0.71, y + 0.3, z, n++);
  }
  // The back wall, and the masts the roof hangs from.
  const rear = UPPER_Z + UPPER * UPPER_STEP.z;
  b.box(span(rear), EAVES, 0.4, concrete, 0, EAVES / 2, rear, frame);
  for (const x of [-span(rear) / 2 + 0.3, span(rear) / 2 - 0.3]) b.post(0.12, EAVES + 1.2, steel, x, (EAVES + 1.2) / 2, rear - 0.2, frame);

  if (style === 'members') shell(b, frame, rear);
  else cantilever(b, frame, rear);
}

/** A shallow white roof shell, one a section, curved across it: five in a row make the skyline. */
function shell(b: Batch, frame: THREE.Matrix4, rear: number) {
  const depth = rear + 3.2, middle = rear - depth / 2 + 0.2;
  const chord = span(middle) + 0.1, rise = 1.1;
  const radius = (chord * chord / 4 + rise * rise) / (2 * rise);
  const theta = 2 * Math.asin(chord / 2 / radius);
  const roof = () => new THREE.CylinderGeometry(radius, radius, depth, 14, 1, true, -theta / 2, theta)
    .rotateX(-Math.PI / 2).translate(0, -radius + EAVES + rise, middle);
  b.add(roof(), END.paint, frame);
  b.add(roof().translate(0, -0.06, 0), END.under, frame);
  // A white edge along its front.
  b.box(chord, 0.25, 0.25, END.paint, 0, EAVES + 0.1, middle - depth / 2, frame);
}

/** A flat cantilever roof with a deep fascia, for the modern bowl. */
function cantilever(b: Batch, frame: THREE.Matrix4, rear: number) {
  const depth = rear + 3.2, middle = rear - depth / 2 + 0.2, w = span(middle) + 0.1;
  b.box(w, 0.35, depth, END.paint, 0, EAVES + 0.3, middle, frame, -0.04);
  b.box(w, 0.08, depth, END.soffit, 0, EAVES + 0.08, middle, frame, -0.04);
  b.box(w, 0.9, 0.3, END.steel, 0, EAVES + 0.3, middle - depth / 2, frame);
  b.box(w, 0.2, 0.32, END.paint, 0, EAVES + 0.8, middle - depth / 2, frame);
  // Lamps along the roof's front edge, three a section, tipped down at the
  // field: the floodlights a phone sees, since its view never reaches the towers.
  const edge = middle - depth / 2 + 0.5;
  for (const x of [-w / 3, 0, w / 3]) {
    b.box(1.5, 0.5, 0.5, END.frame, x, EAVES + 1.15, edge, frame, 0.5);
    b.box(1.3, 0.34, 0.06, END.lamp, x, EAVES + 1.1, edge - 0.28, frame, 0.5);
  }
}

/**
 * Floodlight towers: a tapering steel mast and a head of lamps in a frame,
 * turned to the middle of the ground and tipped down at it.
 *
 * A phone sees only the end straight ahead — about seventeen degrees either
 * side — so towers at the corners, where a real ground puts them, never
 * reached its screen. These stand in behind the end stand, close enough in
 * that a phone catches the edge of each head at the sides of its frame and a
 * desktop sees them whole; a matching pair stands behind the near end, out
 * of shot, so the ground is lit from both.
 */
const TOWERS = [[-19, 58], [19, 58], [-19, -38], [19, -38]] as const;
const MAST = 14;
function floodlights(b: Batch) {
  const centre = new THREE.Vector3(0, 0, 10);
  for (const [x, z] of TOWERS) {
    const at = new THREE.Vector3(x, 0, z);
    const yaw = Math.atan2(at.x - centre.x, at.z - centre.z);
    const frame = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
    b.add(new THREE.CylinderGeometry(0.3, 0.6, MAST, 8).translate(0, MAST / 2, 0), END.steel, frame);
    // The head: a frame tipped towards the field, four rows of six lamps on its face.
    const head = new THREE.Matrix4().multiplyMatrices(frame, new THREE.Matrix4().compose(
      new THREE.Vector3(0, MAST + 1.6, -0.8), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.45), new THREE.Vector3(1, 1, 1)));
    b.box(6.6, 4, 0.5, END.frame, 0, 0, 0, head);
    for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) {
      b.box(0.82, 0.68, 0.12, END.lamp, -2.6 + col * 1.04, -1.38 + row * 0.92, -0.3, head);
    }
    b.box(1.1, 1.1, 1.1, END.frame, 0, MAST, 0, frame);
  }
}

/**
 * The commentary box, on the roof over the middle of the end stand: the one
 * place a phone is always looking. A white box, its front a band of glass
 * raked out at the ground the way a broadcast booth's is, a dark line of
 * shade under the glass, and two dishes on top.
 */
function commentary(b: Batch) {
  const front = 10 + RING - 3, y = EAVES + 0.6;
  b.box(14, 3.2, 4, END.paint, 0, y + 1.6, front + 2.6);
  b.box(13.4, 1.7, 0.2, END.glass, 0, y + 1.7, front + 0.55, undefined, 0.22);
  b.box(14.2, 0.3, 0.9, END.paint, 0, y + 2.85, front + 0.75);
  b.box(14.2, 0.25, 0.9, END.frame, 0, y + 0.55, front + 0.75);
  for (const x of [-4.5, 5]) {
    b.post(0.06, 1, END.steel, x, y + 3.7, front + 3.4);
    b.add(new THREE.CylinderGeometry(0.75, 0.2, 0.25, 10).rotateX(-1.1).translate(x, y + 4.3, front + 3.2), END.paint);
  }
}

/** What goes once at the end, in the ground's own frame: the sightscreen, and the end's landmark. */
export function endCentre(b: Batch, seat: SeatAt, style: EndStyle) {
  const front = 10 + RING;
  b.box(12.5, 3.3, 0.3, END.cover, 0, 1.65, front - 3.3);
  b.box(12.7, 0.12, 0.42, END.steel, 0, 3.32, front - 3.3);
  if (style === 'modern') { floodlights(b); commentary(b); }
  if (style === 'members') {
    // The cupola on the middle of the roofline: a white drum, a green roof, a clock, the flag.
    const y = EAVES + 1.1, z = front + 3;
    b.box(2.6, 1.7, 2.6, END.paint, 0, y + 0.85, z);
    b.add(new THREE.CircleGeometry(0.5, 20).rotateY(Math.PI).translate(0, y + 0.9, z - 1.32), END.cover);
    b.add(new THREE.TorusGeometry(0.54, 0.07, 4, 20).translate(0, y + 0.9, z - 1.33), END.green);
    b.peak(3.1, 1.8, 3.1, END.green, 0, y + 1.7, z);
    b.post(0.05, 2.6, END.paint, 0, y + 4.7, z);
    b.box(1.4, 0.85, 0.04, END.green, 0.72, y + 5.5, z);
    hill(b, seat);
  }
}

/**
 * A grass hill with two trees, round to one side of the end, standing in for
 * the sections either side of it: the older grounds' answer to a stand.
 */
const HILL_SECTIONS = new Set([4, 5]);
export const isHill = (section: number, style: EndStyle) => style === 'members' && HILL_SECTIONS.has(section);
function hill(b: Batch, _seat: SeatAt) {
  for (const section of HILL_SECTIONS) {
    const a = section / SECTIONS * Math.PI * 2;
    const frame = new THREE.Matrix4().compose(
      new THREE.Vector3(Math.sin(a) * RING, 0, 10 + Math.cos(a) * RING),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a),
      new THREE.Vector3(1, 1, 1),
    );
    b.box(span(3), 3, 9, END.grass, 0, 0.6, 2.5, frame, -0.3);
    for (const x of [-2.2, 2.6]) {
      b.post(0.25, 3.5, END.trunk, x, 3.4, 5, frame);
      b.add(new THREE.IcosahedronGeometry(2.6, 0).scale(1.2, 0.9, 1.2).translate(x, 6.4, 5), END.leaf, frame);
    }
  }
}
