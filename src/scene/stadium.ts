import * as THREE from 'three';
import { Batch, mat } from './build';

/**
 * The stadium: one bowl of stands carried right round the ground, which is
 * what every innings is played in.
 *
 * Two tiers of crowd follow the curve of the boundary, with a band of glass
 * boxes between them, under one flat cantilever roof with a deep fascia. Over
 * the middle of the far end, the commentary box; behind it, two floodlight
 * towers; along the roof's edge, a row of lamps. In front of it all, the
 * sightscreen, with the seats behind it covered over in white.
 *
 * **Built for the phone first.** A phone held upright sees about seventeen
 * degrees either side of straight down the pitch, so the far end is all of
 * the ground it ever shows, and everything that makes this a stadium rather
 * than a ring of seats has to be in that stretch: the commentary box over
 * the sightscreen, the edges of the two tower heads at the sides of the
 * frame, the roof lamps across the top. A desktop sees the rest of the bowl.
 *
 * It replaced a Victorian pavilion behind the bowler, which on a phone read
 * as a banquet hall stood in the middle of a stadium; the research behind the
 * change is in the README. A real ground seen from behind the bowler is a
 * sightscreen with a stand full of people behind it, not a building's front.
 *
 * Every piece is laid into one `Batch` and drawn as a mesh a colour, and the
 * crowd is one instanced mesh, so the whole stadium is a couple of dozen draw
 * calls however much of it there is.
 */

export const STADIUM = {
  /** The stands' concrete, painted. */
  concrete: 0xe4dfd2,
  /** Fascias, the roof, the commentary box. */
  paint: 0xf7f4ea,
  steel: 0x8d989c,
  /** The boxes between the tiers, and the commentary box's window. */
  glass: 0x5f7380,
  /** The seats behind the sightscreen, covered over, and the sightscreen itself. */
  cover: 0xf4f3ee,
  /** The roof's underside: see `soffitFinish`. */
  soffit: 0xc4b6dc,
  /** The tunnels into the lower tier. */
  tunnel: 0x3b3936,
  /** Lamp housings and tower heads. */
  frame: 0x3a4650,
  /** The lamps: lit, a warm white that glows a little even by day (see `lampFinish`). */
  lamp: 0xfff4d9,
} as const;

/**
 * Who is in the seats. Mostly summer whites and creams, because that is what
 * a full ground on a warm day looks like from the middle — but never only
 * those, or the stands read as empty seats rather than people in them.
 */
const CROWD = [0xf2ede1, 0x2f5d46, 0xe0d8c4, 0xc9d7de, 0x4a7a5e, 0xefe2bf, 0xf7f4ec, 0x7d9a8c, 0x2b4a63];

/** The glass: smooth and a little metallic, so it catches the sky where the concrete is faceted and dry. */
const glassFinish = () => new THREE.MeshStandardMaterial({ color: STADIUM.glass, roughness: 0.3, metalness: 0.3 });
/** The lamps, lit. */
const lampFinish = () => new THREE.MeshStandardMaterial({ color: STADIUM.lamp, roughness: 0.4, emissive: 0xfff1c8, emissiveIntensity: 0.9 });
/**
 * The roof's underside. From the crease it is lit by nothing but the grass —
 * the hemisphere light's ground colour and the lower half of the sky's
 * environment map are both green — so in the roof's own white it drew an
 * olive band round the whole ground. It is painted the lilac that the green
 * light turns into a neutral shade, and lifted a little so that shade is a
 * soft grey under a white roof rather than a dark one.
 */
const soffitFinish = () => new THREE.MeshStandardMaterial({ color: STADIUM.soffit, roughness: 0.85, flatShading: true, emissive: 0x4a4744 });

/** The stands stand in a ring this far from the middle of the ground, cut into this many sections. */
const RING = 39;
const SECTIONS = 28;
const CENTRE_Z = 10;
/** How wide a section is at `z` behind its front, so the ring closes as it goes back. */
const span = (z: number) => 2 * Math.PI * (RING + z) / SECTIONS + 0.12;

/** Rows in each tier, and the upper tier: where its front row stands, how high it starts, how it rakes. */
const LOWER = 5, UPPER = 4;
const UPPER_Z = 3.4, UPPER_Y = 5.3, UPPER_STEP = { z: 1.2, y: 0.6 };
/** Where the roof sits. */
export const EAVES = UPPER_Y + UPPER * UPPER_STEP.y + 1.6;
/** How far either side of the middle the seats behind the sightscreen are covered. */
const COVERED = 3.8;
/** Half the width of the aisle down the middle of every section. */
const AISLE = 0.4;

/** Builds the stadium onto `world`, the stage's own frame: the bowler's end is +z. */
export function stadium(world: THREE.Object3D) {
  const b = new Batch();
  const seats: THREE.Matrix4[] = [];
  const colours: number[] = [];
  const seat = (frame: THREE.Matrix4, x: number, y: number, z: number, n: number) => {
    seats.push(frame.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z)));
    colours.push(CROWD[n % CROWD.length]);
  };

  for (let section = 0; section < SECTIONS; section++) {
    const a = section / SECTIONS * Math.PI * 2;
    const frame = new THREE.Matrix4().compose(
      new THREE.Vector3(Math.sin(a) * RING, 0, CENTRE_Z + Math.cos(a) * RING),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a),
      new THREE.Vector3(1, 1, 1),
    );
    stand(b, seat, frame, section);
  }
  sightscreen(b);
  commentary(b);
  floodlights(b);

  b.finish(STADIUM.glass, glassFinish());
  b.finish(STADIUM.lamp, lampFinish());
  b.finish(STADIUM.soffit, soffitFinish());
  b.build(world);

  const crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.55, 0.55), mat(0xffffff), seats.length);
  seats.forEach((matrix, i) => { crowd.setMatrixAt(i, matrix); crowd.setColorAt(i, new THREE.Color(colours[i])); });
  crowd.instanceMatrix.needsUpdate = true; world.add(crowd);
}

/** The seats across a row `w` wide, either side of the aisle down the middle. */
function across(w: number, skip: (x: number) => boolean, place: (x: number) => void) {
  const count = Math.floor((w - 0.4) / 0.71);
  for (let col = 0; col < count; col++) {
    const x = -(count - 1) * 0.355 + col * 0.71;
    if (Math.abs(x) < AISLE || skip(x)) continue;
    place(x);
  }
}

/**
 * One section of the stand, in that section's frame. Every other section has
 * a tunnel into the middle of its lower tier, so the ring has the rhythm a
 * real stand has rather than one unbroken band of crowd.
 */
function stand(b: Batch, seat: (frame: THREE.Matrix4, x: number, y: number, z: number, n: number) => void, frame: THREE.Matrix4, section: number) {
  const { concrete, paint, steel, glass, cover, tunnel } = STADIUM;
  const behindTheBowler = section === 0, tunnelled = section % 2 === 1;
  let n = section * 31;

  // The lower tier, raking back from the rope.
  for (let row = 0; row < LOWER; row++) {
    const top = 0.7 + row * 0.7, z = -1.7 + row * 1.4, w = span(z);
    b.box(w, top, 1.4, concrete, 0, top / 2, z, frame);
    const inTunnel = tunnelled && row >= 1 && row <= 2;
    across(w, x => (behindTheBowler && Math.abs(x) < COVERED) || (inTunnel && Math.abs(x) < 1.2), x => seat(frame, x, top + 0.3, z, n++));
  }
  if (tunnelled) {
    // The tunnel mouth: dark inside, a white lintel over it.
    b.box(1.7, 1.25, 1.6, tunnel, 0, 0.7 + 0.62, -1.7 + 1.5 * 1.4, frame);
    b.box(2.1, 0.2, 0.3, paint, 0, 0.7 + 1.35, -1.7 + 1.5 * 1.4 - 0.65, frame);
  }
  if (behindTheBowler) {
    // The seats behind the sightscreen, covered over in white.
    const rise = Math.atan2(0.7, 1.4);
    b.box(COVERED * 2 + 0.2, 0.12, Math.hypot(LOWER * 1.4, LOWER * 0.7), cover, 0, 0.75 + LOWER * 0.35, -2.4 + LOWER * 0.7, frame, -rise);
  }

  // Between the tiers, a band of glass boxes with white edges.
  const back = -1.7 + LOWER * 1.4, wb = span(back);
  b.box(wb, 0.3, 1, paint, 0, 0.7 * LOWER + 0.15, back - 0.2, frame);
  const band = UPPER_Y - 0.7 * LOWER - 0.55;
  b.box(wb, band, 0.15, glass, 0, 0.7 * LOWER + 0.3 + band / 2, back - 0.3, frame);
  b.box(wb, 0.4, 2.2, paint, 0, UPPER_Y - 0.35, UPPER_Z - 0.6, frame);
  b.box(wb, UPPER_Y, 1, concrete, 0, UPPER_Y / 2, back + 0.6, frame);

  // The upper tier, overhanging the boxes.
  for (let row = 0; row < UPPER; row++) {
    const z = UPPER_Z + row * UPPER_STEP.z, y = UPPER_Y + row * UPPER_STEP.y, w = span(z);
    b.box(w, 0.5, UPPER_STEP.z, concrete, 0, y - 0.25, z, frame);
    across(w, () => false, x => seat(frame, x, y + 0.3, z, n++));
  }

  // The back wall, the masts the roof hangs from, and the roof.
  const rear = UPPER_Z + UPPER * UPPER_STEP.z;
  b.box(span(rear), EAVES, 0.4, concrete, 0, EAVES / 2, rear, frame);
  for (const x of [-span(rear) / 2 + 0.3, span(rear) / 2 - 0.3]) b.post(0.12, EAVES + 1.2, steel, x, (EAVES + 1.2) / 2, rear - 0.2, frame);
  roof(b, frame, rear);
}

/** A flat cantilever roof over a section, its fascia, and three lamps along its edge. */
function roof(b: Batch, frame: THREE.Matrix4, rear: number) {
  const { paint, steel, soffit, frame: housing, lamp } = STADIUM;
  const depth = rear + 3.2, middle = rear - depth / 2 + 0.2, w = span(middle) + 0.1;
  b.box(w, 0.35, depth, paint, 0, EAVES + 0.3, middle, frame, -0.04);
  b.box(w, 0.08, depth, soffit, 0, EAVES + 0.08, middle, frame, -0.04);
  b.box(w, 0.9, 0.3, steel, 0, EAVES + 0.3, middle - depth / 2, frame);
  b.box(w, 0.2, 0.32, paint, 0, EAVES + 0.8, middle - depth / 2, frame);
  // The lamps, tipped down at the field: the floodlights a phone sees all the way across.
  const edge = middle - depth / 2 + 0.5;
  for (const x of [-w / 3, 0, w / 3]) {
    b.box(1.5, 0.5, 0.5, housing, x, EAVES + 1.15, edge, frame, 0.5);
    b.box(1.3, 0.34, 0.06, lamp, x, EAVES + 1.1, edge - 0.28, frame, 0.5);
  }
}

/** The sightscreen, behind the bowler's arm: tall enough for his hand, with a capping rail. */
function sightscreen(b: Batch) {
  const z = CENTRE_Z + RING - 3.3;
  b.box(12.5, 3.3, 0.3, STADIUM.cover, 0, 1.65, z);
  b.box(12.7, 0.12, 0.42, STADIUM.steel, 0, 3.32, z);
}

/**
 * The commentary box, on the roof over the middle of the far end: the one
 * place a phone is always looking. A white box, its front a band of glass
 * raked out at the ground the way a broadcast booth's is, a dark line of
 * shade under it, and two dishes on the roof turned up at the sky.
 */
function commentary(b: Batch) {
  const { paint, glass, frame, steel } = STADIUM;
  const front = CENTRE_Z + RING - 3, y = EAVES + 0.6;
  b.box(14, 3.2, 4, paint, 0, y + 1.6, front + 2.6);
  b.box(13.4, 1.7, 0.2, glass, 0, y + 1.7, front + 0.55, undefined, 0.22);
  b.box(14.2, 0.3, 0.9, paint, 0, y + 2.85, front + 0.75);
  b.box(14.2, 0.25, 0.9, frame, 0, y + 0.55, front + 0.75);
  for (const x of [-4.5, 5]) {
    b.post(0.06, 0.9, steel, x, y + 3.6, front + 3.3);
    // The dish: a disc turned to the camera and tipped up, on a feed arm.
    b.add(new THREE.CircleGeometry(0.85, 16).rotateY(Math.PI).rotateX(0.7).translate(x, y + 4.25, front + 3.1), paint);
    b.add(new THREE.CylinderGeometry(0.88, 0.5, 0.18, 16).rotateX(-Math.PI / 2 + 0.7).translate(x, y + 4.2, front + 3.25), steel);
  }
}

/**
 * Floodlight towers: a tapering steel mast and a head of lamps in a frame,
 * turned to the middle of the ground and tipped down at it.
 *
 * A real ground puts its towers at the corners, which a phone never sees. The
 * far pair stands in behind the end stand instead, close enough in that a
 * phone catches the edge of each head at the sides of its frame and a
 * desktop sees them whole; a matching pair stands behind the near end, out
 * of shot, so the ground is lit from both.
 */
const TOWERS = [[-19, 58], [19, 58], [-19, -38], [19, -38]] as const;
const MAST = 14;
function floodlights(b: Batch) {
  const { steel, frame: housing, lamp } = STADIUM;
  const centre = new THREE.Vector3(0, 0, CENTRE_Z);
  for (const [x, z] of TOWERS) {
    const at = new THREE.Vector3(x, 0, z);
    const yaw = Math.atan2(at.x - centre.x, at.z - centre.z);
    const frame = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
    b.add(new THREE.CylinderGeometry(0.3, 0.6, MAST, 8).translate(0, MAST / 2, 0), steel, frame);
    const head = new THREE.Matrix4().multiplyMatrices(frame, new THREE.Matrix4().compose(
      new THREE.Vector3(0, MAST + 1.6, -0.8), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.45), new THREE.Vector3(1, 1, 1)));
    b.box(6.6, 4, 0.5, housing, 0, 0, 0, head);
    for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) {
      b.box(0.82, 0.68, 0.12, lamp, -2.6 + col * 1.04, -1.38 + row * 0.92, -0.3, head);
    }
    b.box(1.1, 1.1, 1.1, housing, 0, MAST, 0, frame);
  }
}
