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
  /** The stepped concrete the crowd sits on. */
  steps: 0xd9cfb6,
  /** Posts, rails, fretwork, eaves: painted white. */
  trim: 0xfbf8f0,
  /** The corrugated roofs and the tower's cap. */
  roof: 0x4f9a63,
  /** The ridges along them, a shade darker. */
  ridge: 0x3a7a4c,
  /** The back of each verandah, in its own shade under the ceiling. */
  back: 0xb49c76,
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

/** The towers: over the far corners of the pavilion and, out of shot, behind the batter. */
const TOWERS = [[-19, 64], [19, 64], [-25, -44], [25, -44]] as const;
const MAST = 15;

export function pavilionStands(world: THREE.Object3D): StadiumLights {
  return stadium(world, {
    commentary: false, towers: false,
    end: { skip: pavilionSkips, build: (b, seat, lights) => pavilion(b, seat, lights) },
  });
}

function pavilion(b: Batch, seat: SeatFn, lights: StadiumLights) {
  // The centre stand straight across the far end, square to the pitch, with
  // the clock tower; the wings from its corners turned in towards the bat.
  const centre = new THREE.Matrix4().makeTranslation(0, 0, CENTRE_Z + RING);
  verandahs(b, seat, centre, CENTRE_WIDTH, { tower: true, covered: true, n: 0 });
  const inner = new THREE.Vector2(CENTRE_WIDTH / 2 + .1, CENTRE_Z + RING);
  const outer = new THREE.Vector2(Math.sin(WING_END.angle) * WING_END.radius, CENTRE_Z + Math.cos(WING_END.angle) * WING_END.radius);
  const width = inner.distanceTo(outer), turn = Math.atan2(inner.y - outer.y, outer.x - inner.x);
  for (const side of [-1, 1]) {
    const wing = new THREE.Matrix4().compose(
      new THREE.Vector3(side * (inner.x + outer.x) / 2, 0, (inner.y + outer.y) / 2),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), side * turn),
      new THREE.Vector3(1, 1, 1),
    );
    verandahs(b, seat, wing, width, { tower: false, covered: false, n: side > 0 ? 500 : 900 });
  }
  trees(b);
  towers(b, lights);
}

/** One members' stand `w` wide in `frame`: the lower tier, two verandahs, the roof. */
function verandahs(b: Batch, seat: SeatFn, frame: THREE.Matrix4, w: number, { tower, covered, n }: { tower: boolean; covered: boolean; n: number }) {
  const { cream, steps, trim, roof, ridge, back, hands } = PAVILION;
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
    // Behind the bowler's arm the seats are boarded over, dark, as a ground at night has them.
    const rise = Math.atan2(LOWER.rise, LOWER.step);
    b.box(9.4, .1, Math.hypot(LOWER.rows * LOWER.step, LOWER.rows * LOWER.rise), STADIUM.tunnel, 0, LOWER.from + LOWER.rows * LOWER.rise / 2 + .05, LOWER.rows * LOWER.step / 2, frame, -rise);
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
    b.box(w, .22, DECK.depth + .4, cream, 0, ceiling - .05, DECK.z + DECK.depth / 2 - .4, frame);
    // The valance under the ceiling's front: a white board, and a bracket either side of every post.
    b.box(w, .3, .06, trim, 0, ceiling - .32, DECK.z - .12, frame);
    for (let x = -w / 2; x <= w / 2 + .01; x += BAY) {
      b.post(.09, ceiling - floor, trim, x, (floor + ceiling) / 2, DECK.z - .1, frame);
      for (const s of [-1, 1]) {
        if (Math.abs(x + s * .5) > w / 2) continue;
        b.add(new THREE.BoxGeometry(.9, .07, .06).rotateZ(s * .6).translate(x + s * .32, ceiling - .62, DECK.z - .12), trim, frame);
      }
      // A lamp hung from the ceiling in each bay, lit at night with the stadium's: the verandahs' warm light.
      if (x + BAY / 2 < w / 2) {
        b.post(.02, .35, trim, x + BAY / 2, ceiling - .3, DECK.z + .9, frame);
        b.box(.36, .26, .36, STADIUM.lamp, x + BAY / 2, ceiling - .58, DECK.z + .9, frame);
      }
    }
  }

  // The roof: a gable the stand's width, over the eaves at the front, with a ridge.
  const eave = DECK.top + .1, depth = DECK.depth + 2.2, mid = DECK.z + DECK.depth / 2 - .6, high = 3.2;
  b.add(new THREE.CylinderGeometry(1, 1, w + 1.2, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2)
    .scale(1, high / 1.5, depth / Math.sqrt(3)).translate(0, eave + high / 3, mid), roof, frame);
  b.box(w + 1.3, .18, .3, ridge, 0, eave + high, mid, frame);
  b.box(w + 1.2, .16, .16, trim, 0, eave - .02, mid - depth / 2 + .05, frame);
  if (!tower) {
    flagOn(b, frame, 0, eave + high, mid, 1.2);
    return;
  }
  // The clock tower over the middle of the ridge, a pyramid cap and a flag;
  // a turret with its own flag over each end.
  const base = eave + high * .45, tall = 3.4, side = 3.2;
  b.box(side, tall, side, cream, 0, base + tall / 2, mid, frame);
  b.box(side + .4, .3, side + .4, trim, 0, base + tall, mid, frame);
  b.peak(side + .6, 2.4, side + .6, roof, 0, base + tall + .15, mid, frame);
  const face = mid - side / 2 - .02, clockY = base + tall * .55;
  b.add(new THREE.CircleGeometry(1.05, 24).rotateY(Math.PI).translate(0, clockY, face - .01), PAVILION.dial, frame);
  b.add(new THREE.TorusGeometry(1.08, .09, 4, 24).translate(0, clockY, face - .02), hands, frame);
  b.add(new THREE.BoxGeometry(.09, .75, .04).translate(0, .3, 0).rotateZ(-.5).translate(0, clockY, face - .05), hands, frame);
  b.add(new THREE.BoxGeometry(.09, .5, .04).translate(0, .2, 0).rotateZ(2.1).translate(0, clockY, face - .05), hands, frame);
  flagOn(b, frame, 0, base + tall + 2.4, mid, 1.2);
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 3.5), foot = eave + high * .3;
    b.box(1.9, 2, 1.9, cream, x, foot + 1, mid, frame);
    b.peak(2.4, 1.7, 2.4, roof, x, foot + 2, mid, frame);
    flagOn(b, frame, x, foot + 3.6, mid, .9);
  }
}

/** A flagpole standing from `y`, its flag flying out to the side. */
function flagOn(b: Batch, frame: THREE.Matrix4, x: number, y: number, z: number, pole: number) {
  b.post(.05, pole + 1.2, PAVILION.trim, x, y + (pole + 1.2) / 2, z, frame);
  b.box(1.1, .66, .04, PAVILION.flag, x + .58, y + pole + .8, z, frame);
}

/** Trees behind the wings and the ends of the pavilion: clumps of round crowns in two greens. */
function trees(b: Batch) {
  const random = seeded(41);
  for (const side of [-1, 1]) {
    // A clump over each end of the pavilion's roof, where the wings meet it, standing up against the sky.
    for (let i = 0; i < 5; i++) {
      const r = 2.4 + random() * 1.6;
      b.add(new THREE.IcosahedronGeometry(r, 1).scale(1, .9, 1).translate(side * (13 + random() * 7), 12 + random() * 3, CENTRE_Z + RING + 13 + random() * 6), random() < .5 ? PAVILION.leaf : PAVILION.leafLight);
    }
    for (let i = 0; i < 26; i++) {
      // Round the far half of the ground behind the stands, thickest by the wings.
      const angle = side * (.5 + random() * 1.0), radius = RING + 16 + random() * 10;
      const r = 2.6 + random() * 2.4;
      const x = Math.sin(angle) * radius, z = CENTRE_Z + Math.cos(angle) * radius;
      const y = 6 + random() * 3;
      b.add(new THREE.IcosahedronGeometry(r, 1).scale(1, .9, 1).translate(x, y, z), random() < .5 ? PAVILION.leaf : PAVILION.leafLight);
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

