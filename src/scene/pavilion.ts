import * as THREE from 'three';
import type { Batch } from './build';

/**
 * The pavilion at the bowler's end of the pavilion ground.
 *
 * A Victorian members' pavilion of the kind cricket grew up in front of: a
 * tower at either end under a bell-cast slate roof, each with its
 * dressing-room balcony, and between them the members on two balconies one
 * over the other, on slim white columns in front of tall arched windows,
 * under a canopy with a clock over the middle and the flag above it.
 *
 * **It is part of the ground, not a picture stood behind it**, and two things
 * keep it that way. The palette is the stands': the same whites for the paint,
 * the same painted concrete for the stone and the terraces, slate in the
 * stands' steel-grey, and a dusty brick light enough to sit in the haze with
 * them rather than in front of it. And the detail stops at what reads from the
 * striker's end — the towers and their roofs, the balconies, the clock. A
 * richer first draft, with quoins, balusters, glazing bars, dormers and vanes,
 * was busier than everything around it put together, and from the crease it
 * read as noise rather than as a building.
 *
 * The depth that is there is built, because nothing else will show it: the
 * building stands outside the sun's shadow frustum, so a flat front with
 * windows on it looks exactly that. Sills, cornices and the balconies stand
 * proud of the wall; the walls behind the balconies are a shaded brick; the
 * faceted shading lights every top face and darkens every soffit.
 *
 * Laid out in the stage's own frame: the field is towards -z, and the main
 * front stands on `FRONT`. Nothing here is drawn on its own — it all goes into
 * the ground's `Batch`, so the whole building costs a draw call a colour.
 */

export const HALL = {
  /** A dusty terracotta: brick, but in the stands' light rather than against it. */
  brick: 0xae7660,
  /** The same brick in the shade of a balcony. */
  shade: 0x8a5c4b,
  /** Stone dressings, in the cream of the stands' concrete. */
  stone: 0xe6dfcf,
  /** The stands' white: columns, balcony fronts, the canopy. */
  paint: 0xf7f4ea,
  /** Slate, in the stands' steel-grey. */
  slate: 0x7f8b92,
  /** The windows: grey-blue, catching the sky rather than holes in the wall. */
  glass: 0x5f7380,
  /** The open doorways at ground level. */
  dark: 0x564c46,
  /** The members' terraces, the stands' painted concrete. */
  terrace: 0xe4dfd2,
  /** Undersides: a lilac that the green light off the grass turns to a neutral shade (see `soffit`). */
  soffit: 0xc89cf0,
  flag: 0x2f5d46,
} as const;

/** The windows catch the sky: smooth and a little metallic, where the brick is faceted and dry. */
export const glassFinish = () => new THREE.MeshStandardMaterial({ color: HALL.glass, roughness: 0.3, metalness: 0.3 });

/** Somebody sitting at x, y, z, the `n`th of them for the colour of their shirt. */
export type Seat = (x: number, y: number, z: number, n: number) => void;

/** The main front, between the towers. The field is towards -z. */
const FRONT = 51;
/** The main block between the towers: half its width, and how deep it runs back. */
const HALF = 7.2;
const DEPTH = 6;
/** Floor levels: the first balcony, the second; the canopy over that; the towers' cornice. */
const L1 = 2.8, L2 = 5.6, CANOPY = 8.4, TOWER_TOP = 9.3;
/** How far the balconies stand out from the main front, and where the columns under their edges stand. */
const BALCONY = 2.4;
const COLUMN_Z = FRONT - BALCONY + 0.15;
/** Seven columns across the middle, and the six bays between them. */
const COLUMNS = [-6.3, -4.2, -2.1, 0, 2.1, 4.2, 6.3];
const BAYS = [-5.25, -3.15, -1.05, 1.05, 3.15, 5.25];
/** The towers: where their middles stand, how wide they are, and their front, which brackets the balconies. */
const TOWER_X = 9.4, TOWER_W = 4.4, TOWER_FRONT = FRONT - BALCONY - 0.1;
const TOWER_Z = TOWER_FRONT + TOWER_W / 2;

export function pavilionHall(b: Batch, seat: Seat) {
  mainBlock(b, seat);
  roof(b);
  attic(b);
  for (const side of [-1, 1]) tower(b, side * TOWER_X);
}

/** The two balconies, the long rooms behind them, and the arcade under the first. */
function mainBlock(b: Batch, seat: Seat) {
  const { brick, shade, stone, paint, dark, terrace } = HALL;
  b.box(HALF * 2, CANOPY, DEPTH, brick, 0, CANOPY / 2, FRONT + DEPTH / 2);
  b.box(HALF * 2 + 0.2, 0.5, DEPTH + 0.2, stone, 0, 0.25, FRONT + DEPTH / 2);
  // The arcade at ground level, mostly behind the sightscreen.
  for (const x of BAYS) arched(b, x, 0.5, FRONT, 1.5, 2.1, dark);

  let n = 0;
  for (const floor of [L1, L2]) {
    const deck = floor + 0.12, storey = L2 - L1;
    // The floor and its edge, and the rooms behind in the balcony's shade.
    b.box(HALF * 2, 0.24, BALCONY, stone, 0, floor, FRONT - BALCONY / 2);
    ledge(b, HALF * 2 + 0.1, 0.3, 0.12, stone, 0, floor - 0.02, FRONT - BALCONY);
    b.box(HALF * 2, storey - 0.12, 0.02, shade, 0, deck + (storey - 0.12) / 2, FRONT - 0.012);
    // The long room's windows, tall and arched, a bay apiece.
    for (const x of BAYS) arched(b, x, deck + 0.3, FRONT - 0.02, 1.05, 2.1, HALL.glass);
    // Two rows of members, the back one a step up.
    b.box(HALF * 2, 0.35, 0.8, terrace, 0, deck + 0.175, FRONT - 0.95);
    for (const [z, y] of [[FRONT - 1.75, deck], [FRONT - 0.95, deck + 0.35]] as const) {
      for (let x = -6.65; x <= 6.66; x += 0.7) seat(x, y + 0.28, z, n++);
    }
    // A solid white front to the balcony, as the stands' fascias are, and
    // the columns along its edge carrying the floor above.
    // Low enough that the members show over it.
    b.box(HALF * 2, 0.5, 0.1, paint, 0, deck + 0.25, FRONT - BALCONY + 0.1);
    b.box(HALF * 2, 0.07, 0.2, paint, 0, deck + 0.52, FRONT - BALCONY + 0.1);
    for (const x of COLUMNS) column(b, x, deck + 0.5, floor + storey - 0.12, COLUMN_Z);
    soffit(b, HALF * 2, BALCONY, floor - 0.125, FRONT - BALCONY / 2);
  }
}

/** The canopy over the top balcony, the slate roof behind it, and two chimneys. */
function roof(b: Batch) {
  const { brick, stone, paint, slate } = HALL;
  b.box(HALF * 2 + 0.2, 0.2, BALCONY + 1, paint, 0, CANOPY, FRONT - BALCONY / 2 + 0.4);
  soffit(b, HALF * 2, BALCONY, CANOPY - 0.105, FRONT - BALCONY / 2);
  ledge(b, HALF * 2 + 0.3, 0.4, 0.12, stone, 0, CANOPY - 0.04, FRONT - BALCONY - 0.1);
  // A low parapet along the top, either side of the attic.
  for (const side of [-1, 1]) b.box(HALF - 2.7, 0.5, 0.25, stone, side * (2.7 + (HALF - 2.7) / 2), CANOPY + 0.35, FRONT - BALCONY + 0.05);
  const ridge = new THREE.CylinderGeometry(1, 1, HALF * 2, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2);
  b.add(ridge.scale(1, 1.1, 2.9).translate(0, CANOPY + 0.55, FRONT + DEPTH / 2), slate);
  for (const x of [-4.6, 4.6]) {
    b.box(0.7, 2.2, 0.95, brick, x, CANOPY + 1.1, FRONT + 2.6);
    ledge(b, 0.9, 0.16, 1.15, stone, x, CANOPY + 2.25, FRONT + 2.6);
  }
}

/** The attic over the middle of the canopy: the clock, a pediment over it, and the flag on top. */
function attic(b: Batch) {
  const { brick, stone, paint, flag } = HALL;
  const base = CANOPY + 0.1, front = FRONT - BALCONY + 0.05;
  b.box(5.2, 1.5, 0.9, brick, 0, base + 0.75, front + 0.45);
  for (const x of [-2.45, 2.45]) b.box(0.4, 1.5, 1, stone, x, base + 0.75, front + 0.45);
  ledge(b, 5.7, 0.2, 1.15, stone, 0, base + 1.6, front + 0.45);
  // The clock: a stone ring, a white face, two hands at ten to two.
  const clock = { y: base + 0.75, z: front - 0.02 };
  b.add(new THREE.TorusGeometry(0.56, 0.08, 4, 20).translate(0, clock.y, clock.z - 0.03), stone);
  b.add(new THREE.CircleGeometry(0.52, 20).rotateY(Math.PI).translate(0, clock.y, clock.z - 0.02), paint);
  for (const [length, turn] of [[0.32, Math.PI / 3], [0.44, -Math.PI / 3]] as const) {
    const hand = new THREE.BoxGeometry(0.05, length, 0.02).translate(0, length / 2, 0).rotateZ(turn);
    b.add(hand.translate(0, clock.y, clock.z - 0.05), HALL.slate);
  }
  // The pediment: a stone triangle with its raking cornices standing proud.
  const top = base + 1.7, span = 5.6, rise = 1.2;
  const tympanum = new THREE.CylinderGeometry(1, 1, 0.6, 3).rotateX(-Math.PI / 2).scale(span / Math.sqrt(3), rise / 1.5, 1);
  b.add(tympanum.translate(0, top + rise / 3, front + 0.5), stone);
  const slope = Math.atan2(rise, span / 2), rake = Math.hypot(rise, span / 2);
  for (const side of [-1, 1]) {
    const edge = new THREE.BoxGeometry(rake + 0.2, 0.16, 0.66).rotateZ(side * -slope);
    b.add(edge.translate(side * span / 4, top + rise / 2 + 0.06, front + 0.48), stone);
  }
  b.post(0.05, 2.6, paint, 0, top + rise + 1.2, front + 0.5);
  b.box(1.5, 0.9, 0.04, flag, 0.77, top + rise + 2.05, front + 0.5);
}

/**
 * A tower: brick on a stone plinth, a stone strip up each front corner and a
 * course at each floor; arched windows, the dressing room's doors onto its
 * balcony; a cornice; and a bell-cast slate roof with a lantern and a finial.
 */
function tower(b: Batch, x: number) {
  const { brick, stone, slate, dark, paint } = HALL;
  const half = TOWER_W / 2, z = TOWER_Z, face = TOWER_FRONT;
  b.box(TOWER_W, TOWER_TOP, TOWER_W, brick, x, TOWER_TOP / 2, z);
  b.box(TOWER_W + 0.24, 0.6, TOWER_W + 0.24, stone, x, 0.3, z);
  for (const y of [L1, L2]) ledge(b, TOWER_W + 0.2, 0.18, TOWER_W + 0.2, stone, x, y, z);
  for (const corner of [-1, 1]) b.box(0.34, TOWER_TOP - 0.6, 0.06, stone, x + corner * (half - 0.17), 0.6 + (TOWER_TOP - 0.6) / 2, face - 0.03);

  arched(b, x, 0.6, face, 1.2, 2, dark);
  for (const dx of [-0.85, 0.85]) arched(b, x + dx, L1 + 0.4, face, 0.8, 1.8, HALL.glass);
  // The dressing room: tall doors onto a balcony with a solid white front.
  arched(b, x, L2 + 0.3, face, 1.4, 2.3, HALL.glass);
  const out = 1.1, sill = L2 + 0.16;
  ledge(b, 2.7, 0.18, out, stone, x, sill, face - out / 2);
  for (const dx of [-1.05, 1.05]) b.box(0.22, 0.45, out - 0.15, stone, x + dx, sill - 0.3, face - (out - 0.15) / 2);
  b.box(2.7, 0.75, 0.08, paint, x, sill + 0.46, face - out + 0.04);
  for (const side of [-1, 1]) b.box(0.08, 0.75, out, paint, x + side * 1.31, sill + 0.46, face - out / 2);

  // A cornice, and the roof, bell-cast: steep at the top, flaring out to the eaves.
  ledge(b, TOWER_W + 0.3, 0.2, TOWER_W + 0.3, stone, x, TOWER_TOP + 0.1, z);
  ledge(b, TOWER_W + 0.56, 0.2, TOWER_W + 0.56, stone, x, TOWER_TOP + 0.3, z);
  const eaves = TOWER_TOP + 0.4, corner = (TOWER_W + 0.5) / 2 * Math.SQRT2;
  const profile = [[1, 0], [0.9, 0.28], [0.67, 0.95], [0.44, 1.75], [0.27, 2.4], [0.18, 2.62]].map(([r, y]) => new THREE.Vector2(r * corner, y));
  b.add(new THREE.LatheGeometry(profile, 4, Math.PI / 4).translate(x, eaves, z), slate);
  // The lantern, its cap and a finial.
  const lantern = eaves + 2.62;
  b.box(0.8, 0.55, 0.8, paint, x, lantern + 0.275, z);
  b.peak(1, 0.45, 1, slate, x, lantern + 0.55, z);
  b.post(0.035, 0.7, slate, x, lantern + 1.3, z);
}

/**
 * An arched window or doorway in a wall whose face is at `z`, looking down
 * the ground: the glass (or the dark of an open door), a stone surround, and a
 * sill that stands out from the wall.
 */
function arched(b: Batch, x: number, y: number, z: number, w: number, h: number, fill: number) {
  const { stone } = HALL;
  const straight = h - w / 2, spring = y + straight;
  b.add(new THREE.PlaneGeometry(w, straight).rotateY(Math.PI).translate(x, y + straight / 2, z - 0.015), fill);
  b.add(new THREE.CircleGeometry(w / 2, 10, 0, Math.PI).rotateY(Math.PI).translate(x, spring, z - 0.015), fill);
  for (const side of [-1, 1]) b.box(0.12, straight, 0.08, stone, x + side * (w / 2 + 0.06), y + straight / 2, z - 0.04);
  b.add(new THREE.TorusGeometry(w / 2 + 0.06, 0.06, 4, 12, Math.PI).translate(x, spring, z - 0.04), stone);
  ledge(b, w + 0.3, 0.1, 0.2, stone, x, y - 0.05, z - 0.1);
}

/**
 * The underside of a floor or a canopy, `w` by `d`, facing down at `y`.
 *
 * Seen from the crease, an underside is lit by the grass and nothing else —
 * the hemisphere light's ground colour and the lower half of the sky's
 * environment map are both green — so a cornice in the stone's own cream drew
 * an olive line under itself, a colour nothing else on the building has. The
 * soffit is painted the colour that light turns into a neutral shadow line:
 * lilac, which nobody will ever see as lilac, because nothing but the green
 * ever reaches it.
 */
function soffit(b: Batch, w: number, d: number, y: number, z: number, x = 0) {
  b.add(new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2).translate(x, y, z), HALL.soffit);
}

/** A box that stands out from the wall — a cornice, a course, a sill — with a soffit under it. */
function ledge(b: Batch, w: number, h: number, d: number, colour: number, x: number, y: number, z: number) {
  b.box(w, h, d, colour, x, y, z);
  soffit(b, w, d, y - h / 2 - 0.004, z, x);
}

/** A slim column from `y0` to `y1`, with a capital. */
function column(b: Batch, x: number, y0: number, y1: number, z: number) {
  const { paint } = HALL;
  b.post(0.075, y1 - y0 - 0.1, paint, x, (y0 + y1 - 0.1) / 2, z);
  b.box(0.26, 0.1, 0.26, paint, x, y1 - 0.05, z);
}
