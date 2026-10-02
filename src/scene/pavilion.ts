import * as THREE from 'three';
import type { Batch } from './build';

/**
 * The pavilion at the bowler's end of the pavilion ground.
 *
 * A Victorian members' pavilion of the kind cricket grew up in front of: red
 * brick dressed in pale stone, a tower at either end under a bell-cast slate
 * roof with a lantern and a vane, and between them the members in tiers —
 * two balconies one over the other on slim white columns, the long rooms
 * behind them lit by tall arched windows, and a covered deck on the roof
 * under a canopy, with a clock in the attic over the middle and the flag
 * above it. Each tower has its dressing-room balcony, on stone brackets,
 * railed in iron.
 *
 * Everything that reads as depth from the striker's end is built as depth,
 * because nothing else will show it: the building stands outside the sun's
 * shadow frustum, so a flat front with windows painted on looks exactly that.
 * Sills, keystones, quoins and cornices stand proud of the brick, the
 * balconies are deep enough to see the rooms behind them, and their back
 * walls are a darker brick, because that is what the shade under a balcony
 * does to brick. The faceted shading does the rest: every top face catches
 * the light and every soffit falls dark.
 *
 * Laid out in the stage's own frame: the field is towards -z, and the main
 * front stands on `FRONT`. Nothing here is drawn on its own — it all goes into
 * the ground's `Batch`, so the whole building costs a draw call a colour.
 */

export const HALL = {
  brick: 0x9d4c35,
  /** Brick in the shade of a balcony. */
  shade: 0x733928,
  stone: 0xead9b5,
  slate: 0x56626c,
  paint: 0xf6f3ea,
  iron: 0x253129,
  glass: 0x26333e,
  /** Doorways and the arcade at ground level: open, and dark inside. */
  dark: 0x2a2623,
  terrace: 0xd9d3c4,
  flag: 0x2f5d46,
} as const;

/** The windows catch the sky: smooth and a little metallic, where the brick is faceted and dry. */
export const glassFinish = () => new THREE.MeshStandardMaterial({ color: HALL.glass, roughness: 0.18, metalness: 0.55 });

/** Somebody sitting at x, y, z, the `n`th of them for the colour of their shirt. */
export type Seat = (x: number, y: number, z: number, n: number) => void;

/** The main front, between the towers. The field is towards -z. */
const FRONT = 51;
/** The main block between the towers: half its width, and how deep it runs back. */
const HALF = 7.2;
const DEPTH = 6;
/** Floor levels: the first balcony, the second, the roof deck; the canopy over that; the towers' cornice. */
const L1 = 2.8, L2 = 5.6, L3 = 8.4, CANOPY = 10.6, TOWER_TOP = 11.4;
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
  roofDeck(b, seat);
  attic(b);
  for (const side of [-1, 1]) tower(b, side * TOWER_X);
}

/** The two balconies, the long rooms behind them, and the arcade under the first. */
function mainBlock(b: Batch, seat: Seat) {
  const { brick, shade, stone, paint, dark, terrace } = HALL;
  b.box(HALF * 2, L3, DEPTH, brick, 0, L3 / 2, FRONT + DEPTH / 2);
  b.box(HALF * 2 + 0.2, 0.5, DEPTH + 0.2, stone, 0, 0.25, FRONT + DEPTH / 2);
  // The arcade at ground level, mostly behind the sightscreen.
  for (const x of BAYS) arched(b, x, 0.5, FRONT, 1.5, 2.1, dark);

  let n = 0;
  for (const floor of [L1, L2]) {
    const deck = floor + 0.12;
    // The floor, its stone edge, and the rooms behind in the balcony's shade.
    b.box(HALF * 2, 0.24, BALCONY, stone, 0, floor, FRONT - BALCONY / 2);
    b.box(HALF * 2 + 0.1, 0.34, 0.14, stone, 0, floor - 0.02, FRONT - BALCONY);
    b.box(HALF * 2, L2 - L1 - 0.12, 0.02, shade, 0, deck + (L2 - L1 - 0.12) / 2, FRONT - 0.012);
    // The long room's windows, tall and arched, a bay apiece.
    for (const x of BAYS) arched(b, x, deck + 0.25, FRONT - 0.02, floor === L1 ? 1.1 : 1, floor === L1 ? 2.25 : 2.05, HALL.glass);
    // Two rows of members, the back one a step up.
    b.box(HALF * 2, 0.35, 0.8, terrace, 0, deck + 0.175, FRONT - 0.95);
    for (const [z, y] of [[FRONT - 1.75, deck], [FRONT - 0.95, deck + 0.35]] as const) {
      for (let x = -6.65; x <= 6.66; x += 0.7) seat(x, y + 0.28, z, n++);
    }
    rail(b, -HALF, FRONT - BALCONY + 0.08, HALF, FRONT - BALCONY + 0.08, deck, 0.85, paint, 0.2);
    // The columns along the edge, carrying the floor above.
    for (const x of COLUMNS) column(b, x, deck, floor + (L2 - L1) - 0.12, COLUMN_Z);
  }
}

/** The covered deck on the roof: three rows stepped back under a canopy on slim columns. */
function roofDeck(b: Batch, seat: Seat) {
  const { brick, shade, stone, paint, terrace } = HALL;
  const deck = L3 + 0.12;
  b.box(HALF * 2, 0.24, BALCONY + 0.6, stone, 0, L3, FRONT - BALCONY / 2 + 0.3);
  b.box(HALF * 2 + 0.1, 0.34, 0.14, stone, 0, L3 - 0.02, FRONT - BALCONY);
  let n = 400;
  for (let row = 0; row < 3; row++) {
    const top = deck + row * 0.4, z = FRONT - 1.75 + row * 0.85;
    if (row) b.box(HALF * 2, row * 0.4, 0.85, terrace, 0, deck + row * 0.2, z);
    for (let x = -6.65; x <= 6.66; x += 0.7) seat(x, top + 0.28, z, n++);
  }
  // The wall at the back of the deck, in the canopy's shade.
  b.box(HALF * 2, CANOPY - L3, 0.4, shade, 0, L3 + (CANOPY - L3) / 2, FRONT + 1.2);
  rail(b, -HALF, FRONT - BALCONY + 0.08, HALF, FRONT - BALCONY + 0.08, deck, 0.8, paint, 0.2);
  for (const x of COLUMNS) column(b, x, deck, CANOPY - 0.1, COLUMN_Z);
  // The canopy: a thin white roof, its stone fascia, and a stone balustrade along the top.
  b.box(HALF * 2 + 0.2, 0.2, 4, paint, 0, CANOPY, FRONT - 0.5);
  b.box(HALF * 2 + 0.3, 0.42, 0.14, stone, 0, CANOPY - 0.04, FRONT - BALCONY - 0.12);
  for (const [x0, x1] of [[-HALF, -2.7], [2.7, HALF]]) rail(b, x0, FRONT - BALCONY + 0.05, x1, FRONT - BALCONY + 0.05, CANOPY + 0.1, 0.55, stone, 0.3);

  // Behind it, the slate roof over the long rooms and the chimneys along it.
  const ridge = new THREE.CylinderGeometry(1, 1, HALF * 2, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2);
  b.add(ridge.scale(1, 1.1, 2.9).translate(0, CANOPY + 0.55, FRONT + DEPTH / 2 + 0.4), HALL.slate);
  for (const x of [-5.4, -2.2, 2.2, 5.4]) {
    b.box(0.7, 2.6, 0.95, brick, x, CANOPY + 1.2, FRONT + 3.4);
    b.box(0.9, 0.18, 1.15, stone, x, CANOPY + 2.55, FRONT + 3.4);
    for (const dz of [-0.2, 0.2]) b.post(0.09, 0.4, HALL.dark, x, CANOPY + 2.82, FRONT + 3.4 + dz);
  }
}

/** The attic over the middle of the canopy: the clock, a pediment over it, and the flag on top. */
function attic(b: Batch) {
  const { brick, stone, paint, iron, flag } = HALL;
  const base = CANOPY + 0.1, front = FRONT - BALCONY + 0.05;
  b.box(5.2, 1.5, 0.9, brick, 0, base + 0.75, front + 0.45);
  // Stone pilasters at its corners, a cornice over it.
  for (const x of [-2.45, 2.45]) b.box(0.4, 1.5, 1, stone, x, base + 0.75, front + 0.45);
  b.box(5.7, 0.2, 1.15, stone, 0, base + 1.6, front + 0.45);
  // The clock: a stone ring, a white face, two iron hands at ten to two.
  const clock = { x: 0, y: base + 0.75, z: front - 0.02 };
  b.add(new THREE.TorusGeometry(0.56, 0.08, 4, 20).translate(clock.x, clock.y, clock.z - 0.03), stone);
  b.add(new THREE.CircleGeometry(0.52, 20).rotateY(Math.PI).translate(clock.x, clock.y, clock.z - 0.02), paint);
  for (const [length, turn] of [[0.32, Math.PI / 3], [0.44, -Math.PI / 3]] as const) {
    const hand = new THREE.BoxGeometry(0.05, length, 0.02).translate(0, length / 2, 0).rotateZ(turn);
    b.add(hand.translate(clock.x, clock.y, clock.z - 0.05), iron);
  }
  // The pediment: a stone triangle with its raking cornices standing proud.
  const top = base + 1.7, span = 5.6, rise = 1.25;
  const tympanum = new THREE.CylinderGeometry(1, 1, 0.6, 3).rotateX(-Math.PI / 2).scale(span / Math.sqrt(3), rise / 1.5, 1);
  b.add(tympanum.translate(0, top + rise / 3, front + 0.5), stone);
  const slope = Math.atan2(rise, span / 2), rake = Math.hypot(rise, span / 2);
  for (const side of [-1, 1]) {
    const edge = new THREE.BoxGeometry(rake + 0.2, 0.18, 0.8).rotateZ(side * -slope);
    b.add(edge.translate(side * span / 4, top + rise / 2 + 0.06, front + 0.45), stone);
  }
  // The flag, on a pole from the apex.
  b.post(0.05, 3, paint, 0, top + rise + 1.4, front + 0.5);
  b.add(new THREE.SphereGeometry(0.09, 8, 6).translate(0, top + rise + 2.95, front + 0.5), stone);
  b.box(1.7, 1, 0.04, flag, 0.87, top + rise + 2.35, front + 0.5);
}

/**
 * A tower: brick with stone quoins at its front corners and stone courses at
 * every floor; arched windows, the dressing room's doors and their balcony
 * on the second floor; a bracketed cornice; and a bell-cast slate roof with a
 * dormer, a lantern, a finial and a vane.
 */
function tower(b: Batch, x: number) {
  const { brick, stone, slate, iron, dark, paint } = HALL;
  const half = TOWER_W / 2, z = TOWER_Z, face = TOWER_FRONT;
  b.box(TOWER_W, TOWER_TOP, TOWER_W, brick, x, TOWER_TOP / 2, z);
  b.box(TOWER_W + 0.24, 0.6, TOWER_W + 0.24, stone, x, 0.3, z);
  for (const y of [L1, L2, L3]) b.box(TOWER_W + 0.22, 0.2, TOWER_W + 0.22, stone, x, y, z);

  // Quoins: long and short stones in turn up each front corner, wrapping it.
  for (const corner of [-1, 1]) {
    const cx = x + corner * half;
    for (let y = 0.6, i = 0; y < TOWER_TOP - 0.3; y += 0.42, i++) {
      const long = i % 2 ? 0.36 : 0.62;
      b.box(long, 0.36, 0.07, stone, cx - corner * long / 2, y + 0.2, face - 0.035);
      b.box(0.07, 0.36, i % 2 ? 0.62 : 0.36, stone, cx + corner * 0.035, y + 0.2, face + (i % 2 ? 0.31 : 0.18));
    }
  }

  // The ground floor's door, the first floor's pair of windows.
  arched(b, x, 0.6, face, 1.2, 2, dark);
  for (const dx of [-0.85, 0.85]) arched(b, x + dx, L1 + 0.35, face, 0.8, 1.9, HALL.glass);
  // The dressing room: tall doors onto a balcony on two stone brackets, railed in iron.
  arched(b, x, L2 + 0.25, face, 1.5, 2.3, HALL.glass);
  const out = 1.3, ledge = L2 + 0.16;
  b.box(2.9, 0.18, out, stone, x, ledge, face - out / 2);
  for (const dx of [-1.15, 1.15]) {
    b.box(0.24, 0.32, out - 0.1, stone, x + dx, ledge - 0.25, face - (out - 0.1) / 2);
    b.box(0.24, 0.3, 0.5, stone, x + dx, ledge - 0.55, face - 0.25);
  }
  const rim = face - out + 0.06;
  rail(b, x - 1.38, rim, x + 1.38, rim, ledge + 0.09, 0.9, iron, 0.14);
  for (const side of [-1, 1]) rail(b, x + side * 1.38, rim, x + side * 1.38, face, ledge + 0.09, 0.9, iron, 0.14);
  // The top floor's three small windows.
  for (const dx of [-1.05, 0, 1.05]) arched(b, x + dx, L3 + 0.5, face, 0.6, 1.5, HALL.glass);

  // A cornice on stone brackets.
  for (let dx = -half + 0.2; dx <= half - 0.19; dx += 0.4) b.box(0.12, 0.18, 0.24, stone, x + dx, TOWER_TOP - 0.06, face - 0.1);
  b.box(TOWER_W + 0.3, 0.2, TOWER_W + 0.3, stone, x, TOWER_TOP + 0.1, z);
  b.box(TOWER_W + 0.62, 0.22, TOWER_W + 0.62, stone, x, TOWER_TOP + 0.31, z);

  // The roof, bell-cast: steep at the top, flaring out to the eaves.
  const eaves = TOWER_TOP + 0.42, corner = (TOWER_W + 0.5) / 2 * Math.SQRT2;
  const profile = [[1, 0], [0.9, 0.3], [0.67, 1], [0.44, 1.85], [0.27, 2.55], [0.18, 2.8]].map(([r, y]) => new THREE.Vector2(r * corner, y));
  b.add(new THREE.LatheGeometry(profile, 4, Math.PI / 4).translate(x, eaves, z), slate);
  // A dormer on its front slope.
  const dormer = { y: eaves + 0.55, z: z - 0.67 * corner * Math.SQRT1_2 - 0.15 };
  b.box(0.95, 0.9, 0.9, stone, x, dormer.y + 0.45, dormer.z + 0.3);
  arched(b, x, dormer.y + 0.15, dormer.z - 0.15, 0.42, 0.62, HALL.glass);
  b.peak(1.1, 0.45, 1.1, slate, x, dormer.y + 0.9, dormer.z + 0.3);
  // The lantern, its cap, the finial and the vane.
  const lantern = eaves + 2.8;
  b.box(0.8, 0.6, 0.8, paint, x, lantern + 0.3, z);
  for (const [w, d] of [[0.82, 0.3], [0.3, 0.82]]) b.box(w, 0.32, d, dark, x, lantern + 0.32, z);
  b.peak(1.05, 0.5, 1.05, slate, x, lantern + 0.6, z);
  b.post(0.035, 1, iron, x, lantern + 1.55, z);
  b.add(new THREE.SphereGeometry(0.09, 8, 6).translate(x, lantern + 1.3, z), iron);
  b.box(0.7, 0.05, 0.05, iron, x + 0.1, lantern + 1.85, z);
  b.add(new THREE.ConeGeometry(0.09, 0.22, 4).rotateZ(-Math.PI / 2).translate(x + 0.53, lantern + 1.85, z), iron);
}

/**
 * An arched window or doorway in a wall whose face is at `z`, looking down
 * the ground: the glass (or the dark of an open door), its glazing bars, a
 * stone surround with a keystone, and a sill that stands out from the wall.
 */
function arched(b: Batch, x: number, y: number, z: number, w: number, h: number, fill: number) {
  const { stone, paint } = HALL;
  const straight = h - w / 2, spring = y + straight;
  b.add(new THREE.PlaneGeometry(w, straight).rotateY(Math.PI).translate(x, y + straight / 2, z - 0.015), fill);
  b.add(new THREE.CircleGeometry(w / 2, 10, 0, Math.PI).rotateY(Math.PI).translate(x, spring, z - 0.015), fill);
  if (fill === HALL.glass) {
    b.box(0.045, h - 0.06, 0.035, paint, x, y + (h - 0.06) / 2, z - 0.035);
    b.box(w, 0.045, 0.035, paint, x, spring, z - 0.035);
    b.box(w, 0.04, 0.035, paint, x, y + straight * 0.45, z - 0.035);
  }
  for (const side of [-1, 1]) b.box(0.13, straight, 0.1, stone, x + side * (w / 2 + 0.065), y + straight / 2, z - 0.05);
  b.add(new THREE.TorusGeometry(w / 2 + 0.065, 0.07, 4, 12, Math.PI).translate(x, spring, z - 0.05), stone);
  b.box(0.2, 0.28, 0.14, stone, x, spring + w / 2 + 0.07, z - 0.07);
  b.box(w + 0.36, 0.1, 0.22, stone, x, y - 0.05, z - 0.11);
}

/**
 * A railing from one point to another at height `y`: a top rail, a bottom
 * rail, a baluster every `gap` and a stouter post every couple of metres.
 */
function rail(b: Batch, x0: number, z0: number, x1: number, z1: number, y: number, h: number, colour: number, gap: number) {
  const length = Math.hypot(x1 - x0, z1 - z0);
  const frame = new THREE.Matrix4().makeRotationY(Math.atan2(-(z1 - z0), x1 - x0)).setPosition((x0 + x1) / 2, 0, (z0 + z1) / 2);
  b.box(length, 0.07, 0.11, colour, 0, y + h, 0, frame);
  b.box(length, 0.06, 0.08, colour, 0, y + 0.1, 0, frame);
  const count = Math.max(1, Math.round(length / gap));
  for (let i = 0; i < count; i++) b.box(0.045, h - 0.13, 0.045, colour, -length / 2 + (i + 0.5) * length / count, y + 0.1 + (h - 0.13) / 2, 0, frame);
  const posts = Math.max(1, Math.round(length / 2.2));
  for (let i = 0; i <= posts; i++) b.box(0.11, h + 0.05, 0.11, colour, -length / 2 + i * length / posts, y + (h + 0.05) / 2, 0, frame);
}

/** A slim column from `y0` to `y1`: a plinth, the shaft, a capital. */
function column(b: Batch, x: number, y0: number, y1: number, z: number) {
  const { paint } = HALL;
  b.box(0.26, 0.14, 0.26, paint, x, y0 + 0.07, z);
  b.post(0.075, y1 - y0 - 0.3, paint, x, (y0 + y1) / 2, z);
  b.box(0.22, 0.1, 0.22, paint, x, y1 - 0.12, z);
  b.box(0.32, 0.06, 0.32, paint, x, y1 - 0.04, z);
}
