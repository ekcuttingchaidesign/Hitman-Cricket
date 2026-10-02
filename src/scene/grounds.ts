import * as THREE from 'three';
import { Batch, box, colors, cylinder, mat } from './build';
import { HALL, glassFinish, pavilionHall } from './pavilion';
import { END, END_SECTIONS, type EndStyle, endCentre, endSection, isHill, shellUnderside } from './ends';

/**
 * The stands and the building at the far end: what a ground is, once the
 * turf, the boards along the rope and the floodlights are taken as given.
 *
 * Two are built. **The pavilion ground** is the one every mode plays on now —
 * a Victorian pavilion, cream under green roofs, behind the bowler (`pavilion.ts`), a white
 * sightscreen and members' benches in front of it, two-tier white stands with
 * peaked tent roofs down one side and a flat cantilever down the other, and a
 * crowd dressed for an English summer. It is a ground of that kind, not a copy
 * of a named one, and it is never called anything but the pavilion ground.
 *
 * **The bowl** is the ground before it: one tier of stands in a full ring, flat
 * roofs, and the low clubhouse with the flags. It is kept whole, line for line,
 * so it can be looked at again with `?ground=bowl` and stood beside the new
 * one, and because the covers need it: their before picture is the bowl,
 * photographed on this build (`scripts/unveil-shots.mjs`).
 *
 * Both are laid out in the stage's own frame, which `GameScene` mirrors so the
 * leg side reads left: the bowler's end is +z, and both are symmetric enough
 * across x that the mirror changes nothing anybody would notice.
 */
export type GroundName = 'pavilion' | 'bowl' | EndStyle;

export const GROUNDS: readonly GroundName[] = ['pavilion', 'bowl', 'members', 'modern'];

/** The ground every innings is played on unless the link asks for another. */
export const DEFAULT_GROUND: GroundName = 'pavilion';

/** `?ground=bowl` puts the old ground back; anything else, or nothing, is the default. */
export function groundFrom(search: string): GroundName {
  const asked = new URLSearchParams(search).get('ground')?.toLowerCase();
  return GROUNDS.find(name => name === asked) ?? DEFAULT_GROUND;
}

export function buildGround(name: GroundName, world: THREE.Object3D) {
  if (name === 'bowl') bowl(world); else stands(world, name);
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

/** The stands' colours, in sRGB as a designer would pick them. The pavilion's own are in `pavilion.ts`. */
const PAVILION = {
  stone: HALL.stone,
  /** The tents, the canopies and the fascias; the pavilion's paint is the same white. */
  white: HALL.paint,
  /** The stands' concrete, painted, as the members' terraces are. */
  terrace: HALL.terrace,
  steel: 0x8d989c,
  sightscreen: 0xf4f3ee,
  seam: 0xd6d3c8,
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

function stands(world: THREE.Object3D, end: 'pavilion' | EndStyle) {
  const scenery = new Batch();
  const seats: THREE.Matrix4[] = [];
  const seatColours: number[] = [];
  const seat = (frame: THREE.Matrix4, x: number, y: number, z: number, n: number) => {
    seats.push(frame.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z)));
    seatColours.push(SUMMER_CROWD[n % SUMMER_CROWD.length]);
  };

  for (let section = 0; section < SECTIONS; section++) {
    if (end === 'pavilion' && PAVILION_SECTIONS.has(section)) continue;
    const a = section / SECTIONS * Math.PI * 2;
    const frame = new THREE.Matrix4().compose(
      new THREE.Vector3(Math.sin(a) * RING, 0, CENTRE_Z + Math.cos(a) * RING),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a),
      new THREE.Vector3(1, 1, 1),
    );
    if (end !== 'pavilion' && END_SECTIONS.has(section)) { endSection(scenery, seat, frame, section, end); continue; }
    if (end !== 'pavilion' && isHill(section, end)) continue;
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

  if (end === 'pavilion') pavilionEnd(scenery, seat);
  else {
    endCentre(scenery, seat, end);
    scenery.finish(END.glass, glassFinish());
    scenery.finish(END.under, shellUnderside());
  }
  scenery.build(world);

  const crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.55, 0.55), mat(0xffffff), seats.length);
  seats.forEach((matrix, i) => { crowd.setMatrixAt(i, matrix); crowd.setColorAt(i, new THREE.Color(seatColours[i])); });
  crowd.instanceMatrix.needsUpdate = true; world.add(crowd);
}

/** The pavilion end: the building, the members' benches in front of it, and the sightscreen. */
function pavilionEnd(scenery: Batch, seat: (frame: THREE.Matrix4, x: number, y: number, z: number, n: number) => void) {
  const here = new THREE.Matrix4();
  pavilionHall(scenery, (x, y, z, n) => seat(here, x, y, z, n));
  scenery.finish(HALL.glass, glassFinish());
  // Members' benches in front of it, between its towers, and the sightscreen in front of those.
  for (let row = 0; row < 3; row++) {
    const top = 0.45 + row * 0.45;
    scenery.box(14.2, top, 0.75, PAVILION.terrace, 0, top / 2, 46.4 + row * 0.75);
    for (let col = 0; col < 19; col++) seat(here, -6.75 + col * 0.75, top + 0.3, 46.4 + row * 0.75, row * 5 + col * 3 + col % 2);
  }
  // The sightscreen: tall enough to stand behind the bowler's hand and no
  // taller, so the members on the first balcony still show over it. Panels,
  // a capping rail along the top.
  scenery.box(12.5, 3.3, 0.3, PAVILION.sightscreen, 0, 1.65, 45.7);
  scenery.box(12.7, 0.12, 0.42, PAVILION.steel, 0, 3.32, 45.7);
  for (let i = 1; i < 6; i++) scenery.box(0.05, 3.2, 0.02, PAVILION.seam, -6.25 + i * 12.5 / 6, 1.62, 45.54);
}
