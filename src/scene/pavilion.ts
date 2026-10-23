import * as THREE from 'three';
import type { Batch } from './build';
import { STADIUM, stadium, type SeatFn, type StadiumLights } from './stadium';
import { seeded } from './turf';

/**
 * The pavilion: the stadium's bowl with an old ground's far end, drawn from
 * the reference the game's designer gave for it — a members' pavilion of
 * cream verandahs under green roofs, a clock tower over the middle with a
 * flag, a wing either side turned in to the ground, trees behind them, and
 * two tall floodlight towers with round lamps standing over it all.
 *
 * A pavilion was tried behind the bowler once before and read on a phone as a
 * banquet hall stood in a stadium: a building's front, its windows and its
 * walls. What the reference has that it did not is people. Every tier is a
 * stand: the lower one raked from the rope, and two verandahs over it, each
 * full of crowd on its own steps, lit warm from the ceiling at night. The
 * building is what frames them — posts, rails and fretwork in white, the
 * roofs, the tower — and there is no wall anywhere a phone looks that does
 * not have people in front of it.
 *
 * It takes the sections of the bowl straight behind the bowler (`skip`) and
 * builds itself into the stadium's batch and its crowd, so it is the same
 * couple of dozen draw calls and the same crowd that cheers and moves; the
 * rest of the ring is the stadium's. No commentary box and no stadium towers:
 * the pavilion is the far end, and its own towers light it.
 */

/** Where the bowl's stands stand from the middle of the ground, as in `stadium.ts`. */
const RING = 39;
const CENTRE_Z = 10;

export const PAVILION = {
  /** Walls, the tower and the turrets: the cream of an old members' stand. */
  cream: 0xeee2c4,
  /** The stepped concrete the crowd sits on: grey, so the crowd stands off it (in the cream it was, crowd and stand were one beige block). */
  steps: 0xa39c8f,
  /** Posts, rails, fretwork, eaves: painted white. */
  trim: 0xfbf8f0,
  /** The corrugated roofs and the tower's cap. */
  roof: 0x4f9a63,
  /** The ridges along them, a shade darker. */
  ridge: 0x3a7a4c,
  /** The back of each verandah, in its own shade under the ceiling; lit warm at night. */
  back: 0xb49c76,
  /** The verandahs' ceilings and the eaves' undersides, lit warm at night. */
  ceiling: 0xe2d2ae,
  /** The lamps in every bay and the towers' windows: dark glass by day (pale, they read as blank panels), lit at night. */
  light: 0x56626b,
  /** The seats behind the bowler's arm, under a green cover rather than boarded black. */
  cover: 0x2f5a3e,
  /** The clock's face, its hands and its rim. */
  dial: 0xfdfbf3,
  hands: 0x1d2228,
  /** The trees behind, two greens. */
  leaf: 0x2f5233,
  leafLight: 0x3e6b40,
  /** The towers: white masts and a dark head frame. */
  mast: 0xe9edf0,
  head: 0x2b333b,
  /** The flags over the tower and the turrets. */
  flag: 0x2f8a4e,
} as const;

/**
 * A stand's levels, in its own frame: the front of it at the origin, the
 * ground behind it +z, up +y. The lower tier rakes back from the rope; the
 * verandahs' decks stand behind it, one over the other, and the roof over all.
 */
const LOWER = { rows: 6, rise: .55, step: .95, from: .7 } as const;
const DECK = { z: 5.9, first: 3.7, second: 6.9, top: 10.1, rows: 4, rise: .5, step: .95, depth: 5.2 } as const;
/** Posts along the verandahs' fronts, this far apart. */
const BAY = 3.6;

/**
 * The centre stand's width, and where each wing ends: from the centre's
 * corner it runs round towards the bat to the edge of the bowl's third
 * section, so a phone has the pavilion in the middle of its picture and the
 * inner end of a wing at either edge, as the reference does.
 */
const CENTRE_WIDTH = 22.5;
const WING_END = { angle: .56, radius: 40.5 } as const;
/** The bowl's sections the pavilion stands in: straight behind the bowler and two either side. */
export const pavilionSkips = (section: number) => section <= 2 || section >= 26;

/**
 * The towers: behind the joins of the stands and, out of shot, behind the
 * batter. Over the far corners and taller, their heads stood behind the score
 * bar and the keys at the top of a phone's picture.
 */
const TOWERS = [[-14, 63], [14, 63], [-25, -44], [25, -44]] as const;
const MAST = 12.5;

/** A home crowd in its colours, which stand out from the cream of the stand: the stadium's summer whites were the stand's own colour. */
const CROWD = [0x1f3b73, 0x2f7d4a, 0xc8342b, 0x2b6cb0, 0xf2c230, 0xf4f1ea, 0x1b1f24, 0x7a2d5c, 0x2aa198, 0xf4f1ea, 0xe8762c] as const;

export function pavilionStands(world: THREE.Object3D): StadiumLights {
  // Lit only at night (`warm` on the lights): the verandahs' back walls, their ceilings and eaves, and the lamps and windows.
  const warm = {
    back: new THREE.MeshStandardMaterial({ color: PAVILION.back, roughness: .9, emissive: 0x8a6438, emissiveIntensity: 0 }),
    ceiling: new THREE.MeshStandardMaterial({ color: PAVILION.ceiling, roughness: .85, emissive: 0xb08a58, emissiveIntensity: 0 }),
    light: new THREE.MeshStandardMaterial({ color: PAVILION.light, roughness: .4, emissive: 0xffe2b0, emissiveIntensity: 0 }),
  };
  const spots: THREE.Vector3[] = [];
  const lights = stadium(world, {
    commentary: false, towers: false, crowd: CROWD,
    end: {
      skip: pavilionSkips,
      build: (b, seat, l) => {
        b.finish(PAVILION.back, warm.back); b.finish(PAVILION.ceiling, warm.ceiling); b.finish(PAVILION.light, warm.light);
        pavilion(b, seat, l, spots);
      },
    },
  });
  lights.spots = spots;
  lights.warm = [warm.back, warm.ceiling, warm.light];
  return lights;
}

function pavilion(b: Batch, seat: SeatFn, lights: StadiumLights, spots: THREE.Vector3[]) {
  // The centre stand straight across the far end, square to the pitch, with
  // the clock tower; the wings from its corners turned in towards the bat.
  const centre = new THREE.Matrix4().makeTranslation(0, 0, CENTRE_Z + RING);
  verandahs(b, seat, centre, CENTRE_WIDTH, { tower: true, covered: true, n: 0 }, spots);
  const inner = new THREE.Vector2(CENTRE_WIDTH / 2 + .1, CENTRE_Z + RING);
  const outer = new THREE.Vector2(Math.sin(WING_END.angle) * WING_END.radius, CENTRE_Z + Math.cos(WING_END.angle) * WING_END.radius);
  const width = inner.distanceTo(outer), turn = Math.atan2(inner.y - outer.y, outer.x - inner.x);
  for (const side of [-1, 1]) {
    const wing = new THREE.Matrix4().compose(
      new THREE.Vector3(side * (inner.x + outer.x) / 2, 0, (inner.y + outer.y) / 2),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), side * turn),
      new THREE.Vector3(1, 1, 1),
    );
    verandahs(b, seat, wing, width, { tower: false, covered: false, n: side > 0 ? 500 : 900 }, spots);
    // A stair tower over the join: turned in to the ground, the wing's roof and
    // the centre's pulled apart behind their fronts and left a wedge of sky and
    // trees between the stands.
    const join = new THREE.Matrix4().compose(
      new THREE.Vector3(side * inner.x, 0, inner.y),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), side * turn / 2),
      new THREE.Vector3(1, 1, 1),
    );
    stairTower(b, join, spots);
  }
  trees(b);
  towers(b, lights);
}

/** One members' stand `w` wide in `frame`: the lower tier, two verandahs, the roof. */
function verandahs(b: Batch, seat: SeatFn, frame: THREE.Matrix4, w: number, { tower, covered, n }: { tower: boolean; covered: boolean; n: number }, spots: THREE.Vector3[]) {
  const { cream, steps, trim, roof, ridge, back, hands, ceiling: soffit, light } = PAVILION;
  const row = (y: number, z: number, skip: (x: number) => boolean) => {
    const count = Math.floor((w - .6) / .71);
    for (let col = 0; col < count; col++) {
      const x = -(count - 1) * .355 + col * .71;
      if (skip(x)) continue;
      seat(frame, x, y + .3, z, n++);
    }
  };
  // The lower tier, raked back from the rope to the foot of the first deck;
  // the middle of the centre stand left empty behind the sightscreen.
  for (let r = 0; r < LOWER.rows; r++) {
    const top = LOWER.from + r * LOWER.rise, z = .65 + r * LOWER.step;
    b.box(w, top, LOWER.step, steps, 0, top / 2, z, frame);
    row(top, z, x => covered && Math.abs(x) < 4.6);
  }
  if (covered) {
    // Behind the bowler's arm the seats are under a green cover: boarded black, it read as a slot cut in the stand over the sightscreen.
    const rise = Math.atan2(LOWER.rise, LOWER.step);
    b.box(9.4, .1, Math.hypot(LOWER.rows * LOWER.step, LOWER.rows * LOWER.rise), PAVILION.cover, 0, LOWER.from + LOWER.rows * LOWER.rise / 2 + .05, LOWER.rows * LOWER.step / 2, frame, -rise);
  }
  // The lower tier runs up under the first deck: a wall behind its top row and nothing else.
  b.box(w, DECK.first, .4, back, 0, DECK.first / 2, DECK.z + .1, frame);

  // The two verandahs: a deck, its steps and the crowd on them, the back wall,
  // the rail along the front, and the ceiling over it with a lamp in every bay.
  for (const [floor, ceiling] of [[DECK.first, DECK.second], [DECK.second, DECK.top]] as const) {
    b.box(w, .3, DECK.depth, cream, 0, floor, DECK.z + DECK.depth / 2 - .3, frame);
    for (let r = 0; r < DECK.rows; r++) {
      const y = floor + .15 + r * DECK.rise, z = DECK.z + .7 + r * DECK.step;
      if (r > 0) b.box(w, r * DECK.rise, DECK.step, steps, 0, floor + .15 + r * DECK.rise / 2, z, frame);
      // The first deck's front row is left empty behind the bowler's arm, as the tier under it is.
      row(y, z, x => covered && floor === DECK.first && r === 0 && Math.abs(x) < 4.6);
    }
    b.box(w, ceiling - floor, .3, back, 0, (floor + ceiling) / 2, DECK.z + DECK.depth - .2, frame);
    // The rail: a top rail and a bottom one, white, at the deck's edge.
    b.box(w, .08, .08, trim, 0, floor + 1.05, DECK.z + .05, frame);
    b.box(w, .08, .08, trim, 0, floor + .45, DECK.z + .05, frame);
    b.box(w, .22, DECK.depth + .4, soffit, 0, ceiling - .05, DECK.z + DECK.depth / 2 - .4, frame);
    // The valance under the ceiling's front: a white board, and a bracket either side of every post.
    b.box(w, .3, .06, trim, 0, ceiling - .32, DECK.z - .12, frame);
    for (let x = -w / 2; x <= w / 2 + .01; x += BAY) {
      b.post(.09, ceiling - floor, trim, x, (floor + ceiling) / 2, DECK.z - .1, frame);
      for (const s of [-1, 1]) {
        if (Math.abs(x + s * .5) > w / 2) continue;
        b.add(new THREE.BoxGeometry(.9, .07, .06).rotateZ(s * .6).translate(x + s * .32, ceiling - .62, DECK.z - .12), trim, frame);
      }
      // A lamp hung from the ceiling in each bay, off by day and lit warm at night, with a glow of its own.
      if (x + BAY / 2 < w / 2) {
        b.post(.02, .35, trim, x + BAY / 2, ceiling - .3, DECK.z + .9, frame);
        b.box(.36, .26, .36, light, x + BAY / 2, ceiling - .58, DECK.z + .9, frame);
        spots.push(new THREE.Vector3(x + BAY / 2, ceiling - .62, DECK.z + .9).applyMatrix4(frame));
      }
    }
  }

  // The roof: a gable the stand's width, over the eaves at the front, with a ridge.
  const eave = DECK.top + .1, depth = DECK.depth + 2.2, mid = DECK.z + DECK.depth / 2 - .6, high = 3.2;
  b.add(new THREE.CylinderGeometry(1, 1, w + 1.2, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2)
    .scale(1, high / 1.5, depth / Math.sqrt(3)).translate(0, eave + high / 3, mid), roof, frame);
  b.box(w + 1.3, .18, .3, ridge, 0, eave + high, mid, frame);
  // Corrugated: a rib down the front slope every so often, so it reads as a tin roof and not a slab.
  const slope = Math.atan2(high, depth / 2), run = Math.hypot(depth / 2, high);
  for (let x = -w / 2 - .4; x <= w / 2 + .4; x += .75) {
    b.add(new THREE.BoxGeometry(.09, .06, run).rotateX(-slope)
      .translate(x, eave + high / 2 + Math.cos(slope) * .04, mid - depth / 4 - Math.sin(slope) * .04), ridge, frame);
  }
  // A white fascia board along the eave, the eave's underside lit at night, and cresting along the ridge.
  b.box(w + 1.2, .34, .1, trim, 0, eave - .08, mid - depth / 2 + .02, frame);
  b.box(w + 1.1, .08, mid - depth / 2 > DECK.z ? .1 : DECK.z - (mid - depth / 2), soffit, 0, eave - .2, (DECK.z + mid - depth / 2) / 2, frame);
  for (let x = -w / 2 + 1; x <= w / 2 - 1; x += 1.6) b.peak(.22, .45, .22, trim, x, eave + high + .08, mid, frame);
  if (!tower) {
    flagOn(b, frame, 0, eave + high, mid, 1.2);
    return;
  }
  // The clock tower over the middle of the ridge: a shaft with pilasters at
  // its corners and a band at the clock, the clock with its hours marked, a
  // belfry with two lit openings over it under a pyramid cap and a flag; a
  // turret with a lit window, its own cap and flag over each end.
  const base = eave + high * .45, tall = 3.4, side = 3.2;
  b.box(side, tall, side, cream, 0, base + tall / 2, mid, frame);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(.3, tall, .3, trim, sx * (side / 2 - .05), base + tall / 2, mid + sz * (side / 2 - .05), frame);
  b.box(side + .4, .3, side + .4, trim, 0, base + tall, mid, frame);
  b.box(side + .2, .16, side + .2, trim, 0, base + .1, mid, frame);
  const face = mid - side / 2 - .02, clockY = base + tall * .55;
  b.add(new THREE.CircleGeometry(1.05, 24).rotateY(Math.PI).translate(0, clockY, face - .01), PAVILION.dial, frame);
  b.add(new THREE.TorusGeometry(1.08, .09, 4, 24).translate(0, clockY, face - .02), hands, frame);
  for (let h = 0; h < 12; h++) {
    const a = h / 12 * Math.PI * 2, long = h % 3 === 0;
    b.add(new THREE.BoxGeometry(long ? .08 : .05, long ? .22 : .13, .03).rotateZ(-a)
      .translate(Math.sin(a) * .86, clockY + Math.cos(a) * .86, face - .04), hands, frame);
  }
  b.add(new THREE.BoxGeometry(.09, .75, .04).translate(0, .3, 0).rotateZ(-.5).translate(0, clockY, face - .05), hands, frame);
  b.add(new THREE.BoxGeometry(.09, .5, .04).translate(0, .2, 0).rotateZ(2.1).translate(0, clockY, face - .05), hands, frame);
  const belfry = base + tall + .15, bell = 1.7, bw = side - .5;
  b.box(bw, bell, bw, cream, 0, belfry + bell / 2, mid, frame);
  for (const x of [-.55, .55]) b.box(.62, 1.05, .06, light, x, belfry + bell / 2 - .05, mid - bw / 2 - .02, frame);
  b.box(bw + .4, .22, bw + .4, trim, 0, belfry + bell, mid, frame);
  b.peak(bw + .6, 2.2, bw + .6, roof, 0, belfry + bell + .1, mid, frame);
  flagOn(b, frame, 0, belfry + bell + 2.2, mid, 1.2);
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 3.5), foot = eave + high * .3, tt = 2.6, tw = 2.4;
    b.box(tw, tt, tw, cream, x, foot + tt / 2, mid, frame);
    b.box(tw + .3, .18, tw + .3, trim, x, foot + tt, mid, frame);
    b.box(.7, 1.1, .06, light, x, foot + tt * .55, mid - tw / 2 - .02, frame);
    b.peak(tw + .5, 2.1, tw + .5, roof, x, foot + tt + .05, mid, frame);
    flagOn(b, frame, x, foot + tt + 2.1, mid, .9);
  }
}

/**
 * A stair tower over the join of the centre stand and a wing, in `frame`
 * (the join at its origin, turned halfway between the two): cream, banded at
 * each deck, a lit window to every floor on its face and a green pyramid cap
 * with a flag. It fills the wedge the two stands' roofs and decks open
 * behind their fronts, where the sky and the trees showed through.
 */
function stairTower(b: Batch, frame: THREE.Matrix4, spots: THREE.Vector3[]) {
  const { cream, trim, roof, light } = PAVILION;
  // Set back behind the lower tier and no wider than the gap: at the full
  // height and width of the stands it stood over the wings as two slabs.
  const w = 3.6, front = DECK.z - 1.4, back = DECK.z + DECK.depth + 2.2, top = DECK.top + 3;
  const z = (front + back) / 2, depth = back - front;
  b.box(w, top, depth, cream, 0, top / 2, z, frame);
  for (const sx of [-1, 1]) b.box(.3, top, .3, trim, sx * (w / 2 - .05), top / 2, front - .05, frame);
  for (const y of [DECK.first, DECK.second, DECK.top]) b.box(w + .2, .2, .2, trim, 0, y, front - .08, frame);
  b.box(w + .5, .3, depth + .5, trim, 0, top, z, frame);
  // A window to each floor on the face, and a tall one up the stair.
  for (const [y, h] of [[(DECK.first + DECK.second) / 2, 1.7], [(DECK.second + DECK.top) / 2, 1.7], [DECK.top + 1.5, 1.6]] as const) {
    b.box(1, h, .06, light, 0, y, front - .1, frame);
    b.box(1.2, .12, .14, trim, 0, y - h / 2 - .06, front - .12, frame);
  }
  spots.push(new THREE.Vector3(0, DECK.top + 1.5, front - .4).applyMatrix4(frame));
  b.peak(w + .8, 2.4, depth * .5, roof, 0, top + .15, z, frame);
  flagOn(b, frame, 0, top + 2.55, z, .9);
}

/** A flagpole standing from `y`, its flag flying out to the side. */
function flagOn(b: Batch, frame: THREE.Matrix4, x: number, y: number, z: number, pole: number) {
  b.post(.05, pole + 1.2, PAVILION.trim, x, y + (pole + 1.2) / 2, z, frame);
  b.box(1.1, .66, .04, PAVILION.flag, x + .58, y + pole + .8, z, frame);
}

/**
 * Trees behind the stands: each a cluster of three rounder crowns in two
 * greens, so it reads as a tree and not as one low-poly blob; a clump over
 * each end of the pavilion where the joins are, and the rest round the far
 * half of the ground, thickest by the wings.
 */
function trees(b: Batch) {
  const random = seeded(41);
  const tree = (x: number, y: number, z: number, r: number) => {
    for (let i = 0; i < 3; i++) {
      const a = random() * Math.PI * 2, d = r * (i === 0 ? 0 : .55);
      const rr = r * (i === 0 ? 1 : .72 + random() * .15);
      b.add(new THREE.IcosahedronGeometry(rr, 2).scale(1, .88, 1).translate(x + Math.cos(a) * d, y + (i === 0 ? 0 : r * .35), z + Math.sin(a) * d * .6),
        i === 1 ? PAVILION.leafLight : random() < .5 ? PAVILION.leaf : PAVILION.leafLight);
    }
  };
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) tree(side * (14 + random() * 7), 11.5 + random() * 3, CENTRE_Z + RING + 14 + random() * 6, 2.2 + random() * 1.3);
    for (let i = 0; i < 18; i++) {
      const angle = side * (.5 + random() * 1.0), radius = RING + 16 + random() * 10;
      tree(Math.sin(angle) * radius, 6 + random() * 3, CENTRE_Z + Math.cos(angle) * radius, 2.4 + random() * 2);
    }
  }
}

/**
 * The floodlights: a tall white mast and a head of round lamps in a dark
 * frame, turned to the middle and tipped down at it, as in the reference —
 * the far pair standing over the pavilion's corners, in the top of a phone's
 * picture, and a pair behind the batter out of it.
 */
function towers(b: Batch, lights: StadiumLights) {
  const { mast, head: housing } = PAVILION;
  const centre = new THREE.Vector3(0, 0, CENTRE_Z);
  for (const [x, z] of TOWERS) {
    const at = new THREE.Vector3(x, 0, z);
    const yaw = Math.atan2(at.x - centre.x, at.z - centre.z);
    const frame = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
    b.add(new THREE.CylinderGeometry(.32, .7, MAST, 8).translate(0, MAST / 2, 0), mast, frame);
    const head = new THREE.Matrix4().multiplyMatrices(frame, new THREE.Matrix4().compose(
      new THREE.Vector3(0, MAST + 2.4, -.6), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), .32), new THREE.Vector3(1, 1, 1)));
    b.box(6.4, 5.4, .5, housing, 0, 0, 0, head);
    b.box(6.8, .25, .7, mast, 0, 2.8, 0, head);
    b.box(6.8, .25, .7, mast, 0, -2.8, 0, head);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
      b.add(new THREE.CircleGeometry(.5, 16).rotateY(Math.PI).translate(-2.4 + c * 1.2, -1.85 + r * 1.23, -.27), STADIUM.lamp, head);
    }
    lights.towers.push(new THREE.Vector3(0, 0, -.9).applyMatrix4(head));
  }
}

