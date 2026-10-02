import * as THREE from 'three';
import { Batch, box, colors, cylinder, mat } from './build';

/**
 * The stands and the building at the far end: what a ground is, once the
 * turf, the boards along the rope and the floodlights are taken as given.
 *
 * Two are built. **The pavilion ground** is the one every mode plays on now —
 * a red-brick pavilion with two towers and its balconies behind the bowler,
 * a white sightscreen in front of it, two-tier white stands with peaked tent
 * roofs down one side and a flat cantilever down the other, and a crowd
 * dressed for an English summer. It is a ground of that kind, not a copy of a
 * named one, and it is never called anything but the pavilion ground.
 *
 * **The bowl** is the ground before it: one tier of stands in a full ring, flat
 * roofs, and the low clubhouse with the flags. It is kept whole, line for line,
 * so it can be looked at again with `?ground=bowl` and stood beside the new
 * one, and so a later ground has two to be measured against.
 *
 * Both are laid out in the stage's own frame, which `GameScene` mirrors so the
 * leg side reads left: the bowler's end is +z, and both are symmetric enough
 * across x that the mirror changes nothing anybody would notice.
 */
export type GroundName = 'pavilion' | 'bowl';

export const GROUNDS: readonly GroundName[] = ['pavilion', 'bowl'];

/** The ground every innings is played on unless the link asks for another. */
export const DEFAULT_GROUND: GroundName = 'pavilion';

/** `?ground=bowl` puts the old ground back; anything else, or nothing, is the default. */
export function groundFrom(search: string): GroundName {
  const asked = new URLSearchParams(search).get('ground')?.toLowerCase();
  return GROUNDS.find(name => name === asked) ?? DEFAULT_GROUND;
}

export function buildGround(name: GroundName, world: THREE.Object3D) {
  if (name === 'bowl') bowl(world); else pavilion(world);
}

/** Where the stands stand: a ring this far from the middle of the ground, cut into this many sections. */
const RING = 39;
const SECTIONS = 28;
const CENTRE_Z = 10;

/** The ground as it was, unchanged. */
function bowl(world: THREE.Object3D) {
  const seatGeometry = new THREE.BoxGeometry(0.6, 0.55, 0.55);
  const crowd = new THREE.InstancedMesh(seatGeometry, mat(0xffffff), 1344);
  const dummy = new THREE.Object3D(); let index = 0;
  const seatColors = [0x22465a, 0xf5bf71, 0xc8dbce, 0xf4794c, 0xe9e0c9, 0x467787];
  for (let section = 0; section < 28; section++) {
    const a = section / 28 * Math.PI * 2;
    const group = new THREE.Group(); group.position.set(Math.sin(a) * 39, 0, 10 + Math.cos(a) * 39); group.rotation.y = a; world.add(group);
    for (let row = 0; row < 4; row++) {
      box(group, 8.5, 0.7 + row * 0.7, 1.4, 0x7d9397, 0, (0.7 + row * 0.7) / 2, -1.7 + row * 1.4);
      for (let col = 0; col < 12; col++) {
        dummy.position.set(-3.9 + col * 0.71, 1 + row * 0.7, -1.7 + row * 1.4);
        dummy.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), a).add(group.position);
        dummy.rotation.y = a; dummy.updateMatrix(); crowd.setMatrixAt(index, dummy.matrix);
        crowd.setColorAt(index, new THREE.Color(seatColors[(section * 13 + row * 7 + col * 3 + col % 2) % seatColors.length])); index++;
      }
    }
    if (section % 4 !== 0) {
      box(group, 9.1, 0.25, 7.5, 0xc7d3cd, 0, 5.3, 0.4).rotation.x = -0.07;
      [-3.9, 3.9].forEach(x => cylinder(group, 0.075, 5.2, 0x627d83, x, 2.6, 3.3));
    }
  }
  crowd.instanceMatrix.needsUpdate = true; world.add(crowd);
  // Clubhouse pavilion at the bowler's end.
  box(world, 13, 7, 5, 0xe0d7bc, 0, 3.5, 53);
  box(world, 15, 0.45, 6, colors.navy, 0, 7, 53);
  box(world, 9, 2, 0.08, colors.navy, 0, 4.1, 50.46);
  for (let i = -2; i <= 2; i++) box(world, 1.3, 1.6, 0.1, 0x406876, i * 2.4, 1.8, 50.45);
  for (let i = -1; i <= 1; i++) {
    cylinder(world, 0.05, 3, 0xe9e3cb, i * 4, 8.6, 53);
    box(world, 1.15, 0.65, 0.04, i === 0 ? colors.orange : colors.navy, i * 4 + 0.56, 9.5, 53);
  }
}

/** The pavilion ground's colours, in sRGB as a designer would pick them. */
const PAVILION = {
  brick: 0xb0603f,
  stone: 0xece2c8,
  slate: 0x4f5b63,
  /** Railings, the colonnade, the tents and the sightscreen. */
  white: 0xf7f4ea,
  /** Glass in shade: the windows and the rooms behind the balconies. */
  glass: 0x2b343a,
  /** The stands' concrete, painted. */
  terrace: 0xe4dfd2,
  steel: 0x8d989c,
  flag: 0x2f5d46,
  sightscreen: 0xf4f3ee,
} as const;

/**
 * Who is in the seats. Mostly summer whites and creams, because that is what
 * a full ground on a warm day looks like from the middle — but never only
 * those, or the stands read as empty seats rather than people in them.
 */
const SUMMER_CROWD = [0xf2ede1, 0x2f5d46, 0xe0d8c4, 0xc9d7de, 0x4a7a5e, 0xefe2bf, 0xf7f4ec, 0x7d9a8c, 0x2b4a63];

/**
 * The sections the pavilion stands in place of: the one straight behind the
 * bowler and one either side. Counted round from it, so `-1` is the last.
 */
const PAVILION_SECTIONS = new Set([SECTIONS - 1, 0, 1]);

/** Tent roofs down one side of the ground and a flat cantilever down the other. */
const tented = (section: number) => section >= 2 && section <= 14;

/** Rows of seats in a stand: the lower tier, then the upper behind and above it. */
const LOWER_ROWS = 4;
const UPPER_ROWS = 3;
const SEATS_A_ROW = 12;
/** How far the upper tier is lifted over the line the lower one rakes back on. */
const UPPER_LIFT = 0.9;

function pavilion(world: THREE.Object3D) {
  const scenery = new Batch();
  const seats: THREE.Matrix4[] = [];
  const seatColours: number[] = [];
  const seat = (frame: THREE.Matrix4, x: number, y: number, z: number, n: number) => {
    seats.push(frame.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z)));
    seatColours.push(SUMMER_CROWD[n % SUMMER_CROWD.length]);
  };

  for (let section = 0; section < SECTIONS; section++) {
    if (PAVILION_SECTIONS.has(section)) continue;
    const a = section / SECTIONS * Math.PI * 2;
    const frame = new THREE.Matrix4().compose(
      new THREE.Vector3(Math.sin(a) * RING, 0, CENTRE_Z + Math.cos(a) * RING),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a),
      new THREE.Vector3(1, 1, 1),
    );
    // Rows rake back from the rope; the upper tier carries on the same rake
    // from a little higher, with a white fascia across the break, which is
    // what makes it read as two tiers rather than one deep one.
    for (let row = 0; row < LOWER_ROWS + UPPER_ROWS; row++) {
      const lift = row >= LOWER_ROWS ? UPPER_LIFT : 0;
      const top = 0.7 + row * 0.7 + lift;
      const z = -1.7 + row * 1.4;
      scenery.box(8.5, top, 1.4, PAVILION.terrace, 0, top / 2, z, frame);
      for (let col = 0; col < SEATS_A_ROW; col++) {
        seat(frame, -3.9 + col * 0.71, top + 0.3, z, section * 13 + row * 7 + col * 3 + col % 2);
      }
    }
    const fascia = 0.7 * LOWER_ROWS + UPPER_LIFT;
    scenery.box(8.6, 0.55, 0.14, PAVILION.white, 0, fascia - 0.1, -1.7 + LOWER_ROWS * 1.4 - 0.75, frame);

    // The roof, held up from the back so nothing stands between a seat and the play.
    const eaves = 0.7 * (LOWER_ROWS + UPPER_ROWS) + UPPER_LIFT + 1.5;
    const depth = 9.4, middle = -1.2 + depth / 2;
    if (tented(section)) {
      // Two peaks a section, each on a mast that runs up through it.
      for (const x of [-2.15, 2.15]) {
        scenery.peak(4.3, 1.9, depth, PAVILION.white, x, eaves, middle, frame);
        scenery.post(0.06, 2.9, PAVILION.steel, x, eaves + 1.45, middle, frame);
      }
    } else {
      scenery.box(9.1, 0.28, depth, PAVILION.white, 0, eaves + 0.3, middle, frame, -0.06);
      scenery.box(9.1, 0.6, 0.12, PAVILION.stone, 0, eaves + 0.1, middle - depth / 2, frame);
    }
    for (const x of [-3.9, 3.9]) scenery.post(0.09, eaves, PAVILION.steel, x, eaves / 2, middle + depth / 2 - 0.3, frame);
  }

  // The building is drawn at full size and stood a little smaller and further
  // back: at full size from the striker's end it filled the sky over the
  // bowler, and a ground is the frame round the play rather than the picture.
  const building = new Batch();
  pavilionBuilding(building);
  const hall = new THREE.Group();
  building.build(hall);
  hall.scale.setScalar(HALL.scale);
  hall.position.z = HALL.front * (1 - HALL.scale) + HALL.setBack;
  world.add(hall);
  // Members' benches in front of it, and the sightscreen in front of those.
  const here = new THREE.Matrix4();
  for (let row = 0; row < 3; row++) {
    const top = 0.45 + row * 0.45;
    scenery.box(24, top, 0.75, PAVILION.terrace, 0, top / 2, 46.9 + row * 0.75);
    for (let col = 0; col < 32; col++) seat(here, -11.6 + col * 0.75, top + 0.3, 46.9 + row * 0.75, row * 5 + col * 3 + col % 2);
  }
  scenery.box(12.5, 4.4, 0.3, PAVILION.sightscreen, 0, 2.2, 46.1);
  scenery.build(world);

  const crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.55, 0.55), mat(0xffffff), seats.length);
  seats.forEach((matrix, i) => { crowd.setMatrixAt(i, matrix); crowd.setColorAt(i, new THREE.Color(seatColours[i])); });
  crowd.instanceMatrix.needsUpdate = true; world.add(crowd);
}

/** Where the pavilion's front is drawn, and how it is stood on the ground: smaller, and further back. */
const HALL = { front: 49.5, scale: 0.85, setBack: 1.5 } as const;

/**
 * Red brick between two towers: two tiers of balconies on a white colonnade
 * across the middle, a row of windows over them, a pediment with a clock and
 * the flag, and a slate pyramid on each tower. Drawn with its front on
 * `HALL.front`, straight behind the bowler; the sightscreen hides its ground floor.
 */
function pavilionBuilding(scenery: Batch) {
  const { brick, stone, slate, white, glass, flag } = PAVILION;
  const front = HALL.front, depth = 6, centre = front + depth / 2;
  const floors = [3.6, 7.1];

  // The middle block, and the stone courses that run across it.
  scenery.box(17, 10.5, depth, brick, 0, 5.25, centre);
  for (const y of [...floors, 10.5]) scenery.box(17.2, 0.35, depth + 0.1, stone, 0, y, centre);
  // Two tiers of balconies: the floor, a white rail along its edge, the rooms
  // behind in shade, and columns carrying the one above.
  for (const y of floors) {
    scenery.box(16, 0.22, 1.6, stone, 0, y, front - 0.8);
    scenery.box(16, 0.85, 0.07, white, 0, y + 0.53, front - 1.55);
    scenery.box(15.4, 2.6, 0.08, glass, 0, y + 1.6, front - 0.04);
    for (let i = 0; i < 7; i++) scenery.post(0.09, 3.3, white, -7.5 + i * 2.5, y + 1.75, front - 1.5);
  }
  // A stone canopy over the top of the colonnade.
  scenery.box(16, 0.22, 1.6, stone, 0, 10.5, front - 0.8);
  // The top floor's windows.
  for (let i = 0; i < 7; i++) scenery.box(1.1, 1.7, 0.08, glass, -6 + i * 2, 8.9, front - 0.04);
  // A slate roof behind the parapet, and the pediment over the middle with its clock.
  scenery.box(16.6, 0.5, depth - 1, slate, 0, 10.9, centre + 0.4);
  const pediment = new THREE.CylinderGeometry(1.4, 1.4, 0.5, 3).rotateX(-Math.PI / 2).scale(2.9, 1, 1);
  scenery.add(pediment.translate(0, 11.4, front + 0.1), stone);
  scenery.add(new THREE.CircleGeometry(0.62, 20).rotateY(Math.PI).translate(0, 11.25, front - 0.17), glass);
  scenery.add(new THREE.CircleGeometry(0.5, 20).rotateY(Math.PI).translate(0, 11.25, front - 0.18), white);
  scenery.post(0.06, 3.4, white, 0, 13.8, front + 0.4);
  scenery.box(1.6, 0.95, 0.04, flag, 0.82, 14.9, front + 0.4);

  // The towers, a little proud of the front, each under its own slate pyramid.
  for (const side of [-1, 1]) {
    const x = side * 10.8;
    scenery.box(4.6, 13.5, depth + 0.8, brick, x, 6.75, centre);
    for (const y of [...floors, 10.5]) scenery.box(4.8, 0.35, depth + 1, stone, x, y, centre);
    scenery.box(5, 0.4, depth + 1.2, stone, x, 13.7, centre);
    for (const y of [1.9, 5.4, 8.9, 12.1]) for (const dx of [-1.1, 1.1]) scenery.box(1, 1.9, 0.08, glass, x + dx, y, front - 0.44);
    scenery.peak(5, 3.6, depth + 1.2, slate, x, 13.9, centre);
    scenery.post(0.07, 1.4, white, x, 18.2, centre);
  }
}
