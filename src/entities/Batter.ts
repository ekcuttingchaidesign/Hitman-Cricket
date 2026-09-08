import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ADVANCE, GAME } from '../config/gameplay';
import type { ShotType } from '../game/types';

type Point = readonly [number, number, number];
interface Pose {
  hip: Point;
  chest: Point;
  frontFoot: Point;
  backFoot: Point;
  grip: Point;
  batUp: Point;
  batFace: Point;
  /** Set by `mix`; authored poses derive theirs from `batUp` and `batFace`. */
  bat?: THREE.Quaternion;
  yaw: number;
  face: number;
  heel: number;
  leadElbow: number;
}
const V = (p: Point) => new THREE.Vector3(...p);
const UP = new THREE.Vector3(0, 1, 0);
const ease = (t: number) => t * t * (3 - 2 * t);
export const STROKE_CONTACT_MS = 110;
export const STROKE_DURATION_MS = 940;

// A right-handed guard: left shoulder and left foot lead toward the bowler.
// The bat has one transform. Both fists are attached to its handle; the arms
// solve back from those grip anchors, so neither hand can leave the bat.
// The waiting stance is the raised pick-up: knees flexed, hands up off the front
// hip, and the bat cocked back over the shoulder so the toe points at first slip
// with the face opened to the sky. A handle held out square while the blade is
// lifted is the one thing wrists cannot do.
const GUARD: Pose = {
  hip: [-0.05, 0.94, -0.03], chest: [0.02, 1.28, 0.03],
  frontFoot: [-0.10, 0.08, 0.27], backFoot: [-0.13, 0.08, -0.25],
  grip: [0.27, 0.90, 0.13], batUp: [-0.43, -0.67, 0.61], batFace: [0.30, 0.82, 0.35],
  yaw: 1.28, face: 0, heel: 0, leadElbow: -.34,
};
const BACKLIFT: Pose = {
  ...GUARD, grip: [0.28, 0.96, 0.11], batUp: [-0.39, -0.73, 0.56], batFace: [0.28, 0.86, 0.30],
  chest: [0.01, 1.29, 0.01], leadElbow: -.24,
};

interface Stroke { contact: Pose; finish: Pose }
const STROKES: Record<ShotType, Stroke> = {
  STRAIGHT: {
    contact: { ...GUARD, hip: [-0.05, .83, .14], chest: [.12, 1.17, .23], frontFoot: [.02, .08, .63],
      grip: [.34, .98, .36], batUp: [.035, .985, -.17], batFace: [0, .12, 1], yaw: 1.08, face: 0, heel: .07, leadElbow: .13 },
    finish: { ...GUARD, hip: [.0, .9, .21], chest: [.09, 1.28, .29], frontFoot: [.02, .08, .63],
      grip: [.21, 1.58, .61], batUp: [-.1, -.62, -.78], batFace: [0, .12, 1], yaw: .74, face: 0, heel: .15 },
  },
  LONG_ON: {
    contact: { ...GUARD, hip: [-.16, .82, .13], chest: [-.035, 1.16, .21], frontFoot: [-.34, .08, .58],
      grip: [.15, .98, .35], batUp: [-.26, .955, -.14], batFace: [-.42, .10, .90], yaw: 1.04, face: -.25, heel: .08, leadElbow: .10 },
    finish: { ...GUARD, hip: [-.19, .9, .20], chest: [-.17, 1.28, .29], frontFoot: [-.34, .08, .58],
      grip: [-.40, 1.55, .58], batUp: [.49, -.61, -.62], batFace: [-.42, .10, .90], yaw: .33, face: -.38, heel: .15 },
  },
  COVER_LONG_OFF: {
    contact: { ...GUARD, hip: [.05, .81, .13], chest: [.19, 1.15, .22], frontFoot: [.30, .08, .60],
      grip: [.50, .98, .35], batUp: [.34, .93, -.14], batFace: [.42, .10, .90], yaw: 1.42, face: .28, heel: .07, leadElbow: .12 },
    finish: { ...GUARD, hip: [.08, .9, .19], chest: [.22, 1.28, .26], frontFoot: [.30, .08, .60],
      grip: [.60, 1.55, .57], batUp: [-.57, -.57, -.59], batFace: [.42, .10, .90], yaw: .88, face: .4, heel: .14 },
  },
  LEG: {
    // Front-foot flick: open the front foot and roll the wrists to the leg side.
    contact: { ...GUARD, hip: [-.16, .82, .09], chest: [.05, 1.17, .16], frontFoot: [-.38, .08, .48],
      grip: [.30, .94, .35], batUp: [.35, .90, -.25], batFace: [-.80, .12, .59], yaw: .82, face: -.5, heel: .05 },
    finish: { ...GUARD, hip: [-.20, .87, .13], chest: [-.17, 1.25, .20], frontFoot: [-.38, .08, .48],
      grip: [-.46, 1.13, .35], batUp: [.60, -.30, -.74], batFace: [-.80, .12, .59], yaw: -.15, face: -.75, heel: .10 },
  },
  OFF: {
    // Back-foot square cut: make room, bend the knees, extend into the off side.
    contact: { ...GUARD, hip: [-.16, .78, -.12], chest: [.01, 1.11, .07], frontFoot: [-.23, .08, .18],
      backFoot: [-.19, .08, -.43], grip: [.31, .85, .27], batUp: [-.88, .43, -.19], batFace: [.10, .18, .98], yaw: 1.65, face: .52, heel: .02 },
    finish: { ...GUARD, hip: [-.11, .85, -.10], chest: [.06, 1.21, .01], frontFoot: [-.23, .08, .18],
      backFoot: [-.19, .08, -.43], grip: [.63, 1.26, .26], batUp: [-.66, -.22, -.72], batFace: [.10, .18, .98], yaw: .83, face: .7, heel: .06 },
  },
};

/**
 * The bat's orientation as one rotation: `batUp` is the handle axis and
 * `batFace` squares the blade around it. Blending the two directions separately
 * cannot work — a stroke that reverses the blade drives the axis through zero,
 * and a face that drifts parallel to the axis has no squaring left to give — so
 * poses are turned into rotations here and slerped as rotations.
 */
const orientations = new WeakMap<Pose, THREE.Quaternion>();
function batOrientation(pose: Pose) {
  if (pose.bat) return pose.bat;
  const cached = orientations.get(pose);
  if (cached) return cached;
  const up = V(pose.batUp).normalize();
  const face = V(pose.batFace);
  face.addScaledVector(up, -face.dot(up));
  if (face.lengthSq() < .0001) {
    // Degenerate authoring: square the blade to whichever axis the handle leans on least.
    const axis = Math.abs(up.z) < .9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    face.copy(axis).addScaledVector(up, -axis.dot(up));
  }
  face.normalize();
  const side = new THREE.Vector3().crossVectors(up, face).normalize();
  const rotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, up, face));
  orientations.set(pose, rotation);
  return rotation;
}
// A bouncer is played off the back foot with a horizontal bat: hands inside the
// line, blade swung across the body, and the whole frame opening up to follow it
// round. It is played on the leg-side input, so it needs its own reach as well.
const PULL: Stroke = {
  contact: { ...GUARD, hip: [-.13, .86, -.12], chest: [-.04, 1.20, -.02],
    frontFoot: [-.30, .08, .26], backFoot: [-.20, .08, -.36],
    grip: [-.30, 1.12, .02], batUp: [-.93, .30, -.20], batFace: [-.86, .18, .48],
    yaw: .42, face: -.55, heel: .22, leadElbow: -.52 },
  // The bat finishes high with the hands together in front of the chest and the
  // blade pointing up over the off shoulder. Wrapping them round behind the back
  // is where the arms end up if the grip is left on the leg side, and no shoulder
  // bends that way.
  finish: { ...GUARD, hip: [-.17, .90, -.10], chest: [-.16, 1.26, .00],
    frontFoot: [-.30, .08, .26], backFoot: [-.20, .08, -.36],
    grip: [.02, 1.36, .20], batUp: [-.71, -.71, .10], batFace: [-.62, .42, .66],
    yaw: -.15, face: -.80, heel: .30, leadElbow: -.10 },
};
const PULL_REACH: readonly [number, number] = [-.55, .32];
// Charging the bowler: a long stride out of the crease with the head over the
// ball, the bat swung straight through the line and up, and the whole body
// carried on down the pitch afterwards. The stride is as long as the leg will
// reach — any further and the shin stretches to meet the foot.
const CHARGE: Stroke = {
  contact: { ...GUARD, hip: [-.06, .80, .36], chest: [.10, 1.16, .40], frontFoot: [.04, .08, .92], backFoot: [-.20, .10, -.26],
    grip: [.34, .98, .30], batUp: [.10, .98, -.14], batFace: [0, .16, .99], yaw: 1.02, face: 0, heel: .34, leadElbow: .18 },
  // Charging is running: by the finish he has pushed off the front foot and
  // stepped through onto the back one, with the front leg trailing in the air.
  // The hands finish high and in front of the chest with the bat wrapped down
  // over the shoulder. Carried round behind the back — where the swing wants to
  // take them — no shoulder reaches, and both arms end up somewhere no body goes.
  finish: { ...GUARD, hip: [-.04, .86, .40], chest: [.04, 1.26, .42], frontFoot: [-.02, .30, -.06], backFoot: [-.22, .08, .30],
    grip: [-.22, 1.42, .78], batUp: [.42, .32, .85], batFace: [.55, .55, -.45], yaw: .50, face: -.18, heel: 0, leadElbow: -.06 },
};

/**
 * A bat outline rather than a rounded slab: near-parallel edges down the middle,
 * a domed toe, and a taper into the shoulder where the blade meets the handle.
 * Extruded with a bevel so the edges round over the way a bat's do.
 */
function bladeGeometry() {
  const edge: readonly (readonly [number, number])[] = [
    [.028, -.134], [.046, -.160], [.061, -.222], [.067, -.340],
    [.068, -.560], [.066, -.720], [.058, -.788], [.038, -.820],
  ];
  const outline = new THREE.Shape();
  outline.moveTo(0, -.832);
  for (let i = edge.length - 1; i >= 0; i--) outline.lineTo(edge[i][0], edge[i][1]);
  for (const [x, y] of edge) outline.lineTo(-x, y);
  outline.lineTo(0, -.832);
  const blade = new THREE.ExtrudeGeometry(outline, {
    depth: .044, bevelEnabled: true, bevelSize: .011, bevelThickness: .009, bevelSegments: 3, curveSegments: 8,
  });
  blade.translate(0, 0, -.022);
  return blade;
}

function mix(a: Pose, b: Pose, amount: number): Pose {
  const t = ease(THREE.MathUtils.clamp(amount, 0, 1));
  const point = (x: Point, y: Point): Point => [
    THREE.MathUtils.lerp(x[0], y[0], t), THREE.MathUtils.lerp(x[1], y[1], t), THREE.MathUtils.lerp(x[2], y[2], t),
  ];
  const bat = batOrientation(a).clone().slerp(batOrientation(b), t);
  return {
    bat,
    hip: point(a.hip, b.hip), chest: point(a.chest, b.chest),
    frontFoot: point(a.frontFoot, b.frontFoot), backFoot: point(a.backFoot, b.backFoot),
    grip: point(a.grip, b.grip),
    batUp: new THREE.Vector3(0, 1, 0).applyQuaternion(bat).toArray() as unknown as Point,
    batFace: new THREE.Vector3(0, 0, 1).applyQuaternion(bat).toArray() as unknown as Point,
    yaw: THREE.MathUtils.lerp(a.yaw, b.yaw, t), face: THREE.MathUtils.lerp(a.face, b.face, t), heel: THREE.MathUtils.lerp(a.heel, b.heel, t),
    leadElbow: THREE.MathUtils.lerp(a.leadElbow, b.leadElbow, t),
  };
}

/** Two-bone joint with a stable bend plane and fixed segment lengths. */
export function solveJoint(start: THREE.Vector3, end: THREE.Vector3, upper: number, lower: number, pole: THREE.Vector3) {
  const axis = end.clone().sub(start);
  const distance = THREE.MathUtils.clamp(axis.length(), .001, upper + lower - .001);
  axis.normalize();
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  const bend = pole.clone().sub(start);
  bend.addScaledVector(axis, -bend.dot(axis));
  if (bend.lengthSq() < .0001) bend.set(1, 0, 0).cross(axis);
  bend.normalize();
  return start.clone().addScaledVector(axis, along).addScaledVector(bend, height);
}

export class Batter {
  readonly root = new THREE.Group();
  readonly bat = new THREE.Group();
  private torso = new THREE.Group();
  private hips = new THREE.Group();
  private head = new THREE.Group();
  private arms: { upper: THREE.Mesh; lower: THREE.Mesh; elbow: THREE.Mesh; cap: THREE.Mesh; glove: THREE.Group; cuff: THREE.Group; shoulder: THREE.Vector3 }[] = [];
  private legs: { thigh: THREE.Mesh; shin: THREE.Mesh; knee: THREE.Mesh; cap: THREE.Mesh; pad: THREE.Group; shoe: THREE.Group }[] = [];
  private pose: Pose = GUARD;
  private swingFrom: Pose = GUARD;
  private shot: ShotType = 'STRAIGHT';
  /** A leg-side swing at a ball up around the chest is a pull, not a flick. */
  private pulling = false;
  /** A charge down the pitch: the confidence shot. */
  private charging = false;
  private swingStart = -Infinity;
  private anticipation = 0;
  private contactTime = -Infinity;
  private ballX = 0;
  private ballY = .54;
  private ballZ: number = GAME.contactZ;
  // Every part is modelled from one of four smooth unit primitives, scaled into
  // place. Nothing is a bare cube, so the figure reads as sculpted clay.
  private shapes = {
    soft: new RoundedBoxGeometry(1, 1, 1, 4, .3),
    ball: new THREE.SphereGeometry(1, 26, 18),
    tube: new THREE.CylinderGeometry(.5, .5, 1, 20, 1),
    flat: new THREE.BoxGeometry(1, 1, 1),
    blade: bladeGeometry(),
  };
  private palette = {
    shirt: new THREE.MeshStandardMaterial({ color: 0x19334a, roughness: .88 }),
    trousers: new THREE.MeshStandardMaterial({ color: 0xe7e2d3, roughness: .82 }),
    pad: new THREE.MeshStandardMaterial({ color: 0xfdfcf4, roughness: .72 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xb77950, roughness: .87 }),
    bat: new THREE.MeshStandardMaterial({ color: 0xe0b77a, roughness: .83 }),
    accent: new THREE.MeshStandardMaterial({ color: 0xed7044, roughness: .7 }),
    grille: new THREE.MeshStandardMaterial({ color: 0x8c9da0, metalness: .6, roughness: .4 }),
    handle: new THREE.MeshStandardMaterial({ color: 0x2a3238, roughness: .95 }),
  };
  constructor() {
    this.root.name = 'Articulated right-handed batter';
    this.root.add(this.torso, this.hips, this.head, this.bat);
    // Torso: a single trunk on the spine. A second, wider ellipsoid up at the
    // shoulders sounds right but breaks the surface all the way round and, once
    // the batter bends forward, humps out behind the neck. The deltoid caps on
    // the arms carry the shoulder line instead.
    this.mesh(this.hips, this.palette.trousers, [.185, .145, .135], 'ball');
    this.mesh(this.torso, this.palette.shirt, [.205, .275, .145], 'ball').position.y = -.075;
    const neck = this.mesh(this.torso, this.palette.skin, [.115, .17, .115], 'tube'); neck.position.y = .175;
    // Jersey seam, collar, and back number make rotation legible from the camera.
    this.mesh(this.torso, this.palette.accent, [.37, .026, .27], 'soft').position.y = -.33;
    for (const x of [-.055, .055]) this.mesh(this.torso, this.palette.accent, [.035, .14, .012], 'soft').position.set(x, -.03, -.135);
    const face = this.mesh(this.head, this.palette.skin, [.148, .17, .15], 'ball'); face.position.y = -.03;
    this.mesh(this.head, this.palette.skin, [.075, .10, .075], 'ball').position.set(0, -.10, .075);
    const helmet = this.mesh(this.head, this.palette.shirt, [.188, .175, .195], 'ball'); helmet.position.set(0, .045, -.018);
    this.mesh(this.head, this.palette.shirt, [.34, .045, .20], 'soft').position.set(0, .045, .135);
    for (const y of [-.055, -.115]) {
      const bar = this.mesh(this.head, this.palette.grille, [.016, .30, .016], 'tube');
      bar.rotation.z = Math.PI / 2; bar.position.set(0, y, .175);
    }
    for (const x of [-.14, .14]) this.mesh(this.head, this.palette.grille, [.016, .19, .016], 'tube').position.set(x, -.045, .175);
    // Bat: a dark bound handle standing clear of a plain blade.
    this.mesh(this.bat, this.palette.handle, [.040, .36, .040], 'tube').position.y = .05;
    this.mesh(this.bat, this.palette.handle, [.048, .20, .048], 'tube').position.y = .10;
    this.mesh(this.bat, this.palette.handle, [.058, .038, .058], 'tube').position.y = .225;
    this.mesh(this.bat, this.palette.bat, [1, 1, 1], 'blade');
    for (let i = 0; i < 2; i++) {
      // A fist wrapping the handle, locked to the bat: knuckles lined up along
      // the handle, fingers curled over the face side. Turning each hand to face
      // its own forearm instead lets the two disagree about how they hold the
      // same stick — which is the twist no grip can make.
      const glove = new THREE.Group(); this.bat.add(glove);
      glove.position.set(0, i === 0 ? .10 : -.035, 0);
      this.mesh(glove, this.palette.pad, [.118, .150, .124], 'soft');
      for (let roll = 0; roll < 3; roll++)
        this.mesh(glove, this.palette.pad, [.112, .034, .034], 'soft').position.set(0, .046 - roll * .046, .050);
      this.mesh(glove, this.palette.pad, [.046, .10, .052], 'soft').position.set(.052, -.026, -.042);
      // The wrist is what turns: a gauntlet at the hand aimed back up the forearm.
      const cuff = new THREE.Group(); this.root.add(cuff);
      this.mesh(cuff, this.palette.pad, [.113, .105, .113], 'tube').position.y = .052;
      this.mesh(cuff, this.palette.accent, [.121, .026, .121], 'tube').position.y = .014;
      this.arms.push({ upper: this.mesh(this.root, this.palette.shirt, [1, 1, 1], 'tube'), lower: this.mesh(this.root, this.palette.skin, [1, 1, 1], 'tube'),
        elbow: this.mesh(this.root, this.palette.skin, [.05, .05, .05], 'ball'), cap: this.mesh(this.root, this.palette.shirt, [.086, .083, .09], 'ball'),
        glove, cuff, shoulder: new THREE.Vector3() });
      const pad = new THREE.Group(); this.root.add(pad);
      this.mesh(pad, this.palette.pad, [.20, .38, .175], 'soft');
      for (let roll = 0; roll < 3; roll++) this.mesh(pad, this.palette.pad, [.045, .34, .045], 'tube').position.set(-.048 + roll * .048, 0, .082);
      for (const y of [-.10, .06]) this.mesh(pad, this.palette.accent, [.185, .026, .17], 'soft').position.set(0, y, -.008);
      this.mesh(pad, this.palette.pad, [.115, .07, .10], 'ball').position.set(0, .21, .03);
      const shoe = new THREE.Group(); this.root.add(shoe);
      this.mesh(shoe, this.palette.pad, [.185, .125, .33], 'soft').position.z = .055;
      this.mesh(shoe, this.palette.pad, [.085, .055, .06], 'ball').position.set(0, -.03, .215);
      this.mesh(shoe, this.palette.handle, [.185, .035, .33], 'soft').position.set(0, -.055, .055);
      this.mesh(shoe, this.palette.accent, [.19, .022, .09], 'soft').position.set(0, .015, .12);
      this.legs.push({ thigh: this.mesh(this.root, this.palette.trousers, [1, 1, 1], 'tube'), shin: this.mesh(this.root, this.palette.trousers, [1, 1, 1], 'tube'),
        knee: this.mesh(this.root, this.palette.trousers, [.078, .078, .078], 'ball'), cap: this.mesh(this.root, this.palette.trousers, [.115, .115, .115], 'ball'),
        pad, shoe });
    }
    this.reset();
  }
  private mesh(parent: THREE.Object3D, material: THREE.Material, scale: Point, shape: keyof Batter['shapes'] = 'soft') {
    const mesh = new THREE.Mesh(this.shapes[shape], material);
    mesh.scale.set(...scale); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  private segment(mesh: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3, width: number, depth = width) {
    const axis = end.clone().sub(start);
    mesh.position.copy(start).add(end).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(UP, axis.clone().normalize());
    mesh.scale.set(width, axis.length(), depth);
  }
  reset() {
    this.swingStart = -Infinity; this.contactTime = -Infinity; this.anticipation = 0; this.pulling = false; this.charging = false;
    this.root.position.set(GAME.stanceX, 0, GAME.stanceZ); this.root.rotation.set(0, 0, 0);
    this.apply(GUARD);
  }
  prepare(progress: number) { this.anticipation = THREE.MathUtils.smoothstep(progress, .05, .72); }
  swing(shot: ShotType, now: number, finalBallX: number, ballY = .54, ballZ: number = GAME.contactZ, charging = false) {
    this.shot = shot; this.charging = charging; this.pulling = !charging && shot === 'LEG' && ballY > .85;
    this.swingStart = now; this.contactTime = now + STROKE_CONTACT_MS;
    this.swingFrom = this.pose; this.ballX = finalBallX; this.ballZ = ballZ;
    // Only the pull goes up after a bouncer. Every other stroke plays at its own
    // height and the ball passes over the bat, rather than the arms stretching
    // to chase a ball that stroke was never going to reach.
    this.ballY = this.pulling ? ballY : Math.min(ballY, .62);
  }
  get strikeAt() { return this.contactTime; }
  /**
   * Where down the pitch the charge has carried him. Barely anything before
   * contact — the ball arrives where it arrives, and walking the body into it
   * would leave the hands behind the chest — then the drive carries him out, and
   * he walks back to his crease with the ball still in the air.
   */
  private downPitch(age: number) {
    if (!this.charging || !Number.isFinite(age) || age <= 0) return 0;
    const at = (from: number, to: number, start: number, end: number) => from + (to - from) * ease((age - start) / (end - start));
    // Every one of these ranges has to be clamped. `ease` is a cubic, not a
    // curve that flattens: fed a number past 1 it turns and runs away, and the
    // walk back read as reaching the crease and then sprinting at the bowler.
    const out = age <= STROKE_CONTACT_MS ? at(0, .04, 0, STROKE_CONTACT_MS)
      : age <= 410 ? at(.04, .92, STROKE_CONTACT_MS, 410)
      : age <= STROKE_DURATION_MS ? at(.92, 1, 410, STROKE_DURATION_MS)
      : 1 - ease(THREE.MathUtils.clamp((age - STROKE_DURATION_MS) / ADVANCE.walkBackMs, 0, 1));
    return out * ADVANCE.stride;
  }
  private travel(age: number) {
    this.root.position.set(GAME.stanceX, 0, GAME.stanceZ + this.downPitch(age));
  }
  /**
   * The walk back to the crease, as steps rather than a slide. Each foot plants
   * and stays where it was put while the body moves over it, then swings back a
   * stride and plants again; the hips rise and fall with the cycle. Translating
   * the whole batter instead leaves his feet frozen to the turf, skating.
   */
  private walking(pose: Pose, left: number): Pose {
    const settle = Math.min(1, left / .4);
    if (settle <= 0) return pose;
    const step = .54, walked = ADVANCE.stride - left;
    const foot = (base: Point, offset: number): Point => {
      const phase = (walked / step + offset) % 1;
      const along = (phase < .5 ? phase : 1 - phase) * step - .25 * step;
      const lift = phase < .5 ? 0 : Math.sin((phase - .5) * Math.PI) * .072;
      return [base[0], base[1] + lift * settle, base[2] + along * settle];
    };
    const bob = Math.sin(walked / step * Math.PI * 2) * .022 * settle;
    return { ...pose,
      frontFoot: foot(pose.frontFoot, 0), backFoot: foot(pose.backFoot, .5),
      hip: [pose.hip[0], pose.hip[1] + bob, pose.hip[2]],
      chest: [pose.chest[0], pose.chest[1] + bob, pose.chest[2]] };
  }
  update(now: number) {
    const age = now - this.swingStart;
    this.travel(age);
    if (!Number.isFinite(age) || age >= STROKE_DURATION_MS) {
      const guard = mix(GUARD, BACKLIFT, Number.isFinite(age) ? 0 : this.anticipation);
      this.apply(this.charging ? this.walking(guard, this.downPitch(age)) : guard);
      return;
    }
    const stroke = this.charging ? CHARGE : this.pulling ? PULL : STROKES[this.shot];
    // Place the middle of the blade at the ball's contact plane, not merely
    // somewhere along the selected sector. Wrong shots stay in their own reach.
    const zones: Record<ShotType, [number, number]> = {
      LEG: [-.55, -.05], LONG_ON: [-.55, .08], STRAIGHT: [-.17, .17],
      COVER_LONG_OFF: [-.08, .55], OFF: [.05, .55],
    };
    const targetX = THREE.MathUtils.clamp(this.ballX, ...(this.pulling ? PULL_REACH : zones[this.shot]));
    // The bat meets the ball where he stands at contact. Reading the live root
    // instead drags the hands backwards out of a charge as it carries him on.
    const planted = GAME.stanceZ + this.downPitch(STROKE_CONTACT_MS);
    const contactGrip = new THREE.Vector3(targetX - this.root.position.x, this.ballY, this.ballZ - planted)
      .addScaledVector(V(stroke.contact.batUp).normalize(), .44);
    const step = targetX * .65;
    const shift = (p: Point, amount: number): Point => [p[0] + amount, p[1], p[2]];
    const reachPose = (p: Pose): Pose => ({ ...p, hip: shift(p.hip, step), chest: shift(p.chest, step),
      frontFoot: shift(p.frontFoot, step), grip: shift(p.grip, step) });
    const contact = { ...reachPose(stroke.contact), grip: contactGrip.toArray() as unknown as Point };
    const finish = reachPose(stroke.finish);
    if (age <= STROKE_CONTACT_MS) this.apply(mix(this.swingFrom, contact, age / STROKE_CONTACT_MS));
    else if (age < 410) this.apply(mix(contact, finish, (age - STROKE_CONTACT_MS) / (410 - STROKE_CONTACT_MS)));
    else if (age < 570) this.apply(finish);
    else this.apply(mix(finish, GUARD, (age - 570) / (STROKE_DURATION_MS - 570)));
  }
  private apply(pose: Pose) {
    this.pose = pose;
    const hip = V(pose.hip), chest = V(pose.chest);
    const yaw = new THREE.Quaternion().setFromAxisAngle(UP, pose.yaw);
    const spine = chest.clone().sub(hip).normalize();
    this.hips.position.copy(hip); this.hips.quaternion.copy(yaw);
    this.torso.position.copy(chest);
    this.torso.quaternion.setFromUnitVectors(UP, spine).multiply(yaw);
    this.head.position.copy(chest).addScaledVector(spine, .31).add(new THREE.Vector3(.01, .01, .025));
    this.head.rotation.set(.09, pose.face, -.04);
    this.bat.position.set(...pose.grip);
    this.bat.quaternion.copy(batOrientation(pose));
    this.root.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) {
      const arm = this.arms[i];
      arm.shoulder.set(i === 0 ? -.163 : .163, .075, 0).applyQuaternion(this.torso.quaternion).add(chest);
      const hand = arm.glove.position.clone().applyQuaternion(this.bat.quaternion).add(this.bat.position);
      // Elbows bend towards these hints. The back arm's has to follow the hands
      // round the body — pinned to one side it folds the arm through the chest
      // on any stroke that wraps to the other, so take the hand's own bearing
      // from the spine and push the hint out along it.
      // Elbows bend towards this hint. Pinning it to a fixed offset folds the arm
      // through the chest on any stroke whose follow-through wraps the hands
      // round to the other side, so push it straight out from the body, square
      // to the arm itself. `leadElbow` then rides the front elbow up or down.
      const along = hand.clone().sub(arm.shoulder).normalize();
      const square = (direction: THREE.Vector3) => {
        direction.addScaledVector(along, -direction.dot(along));
        if (direction.lengthSq() < .0001) direction.copy(spine).negate();
        return direction.normalize();
      };
      const bend = (hint: THREE.Vector3) => {
        const pole = arm.shoulder.clone().addScaledVector(hint, .60);
        if (i === 0) pole.addScaledVector(spine, pose.leadElbow);
        return solveJoint(arm.shoulder, hand, .32, .34, pole);
      };
      // How much room an elbow leaves itself: clear of the trunk, and clear of
      // the handle it would otherwise lie along.
      const room = (point: THREE.Vector3) =>
        Math.min(this.offSpine(point, hip, chest, spine) / .19, this.offHandle(point) / .11);
      let hint = square(arm.shoulder.clone().sub(chest));
      // Out from the body alone puts the back elbow on the off side, which is
      // exactly where a raised blade already is, and the forearm ends up lying
      // across the bat. Lean the hint off the blade — the bat's own up axis —
      // and keep that lean unless it costs more room than it buys: on a square
      // cut the bat lies across the body and points the lean straight into the
      // chest.
      if (i === 1) {
        const leaning = square(new THREE.Vector3(0, 1, 0).applyQuaternion(this.bat.quaternion).multiplyScalar(.85).add(hint));
        if (room(bend(leaning)) >= Math.min(room(bend(hint)), 1)) hint = leaning;
      }
      let elbow = bend(hint);
      // Either hint can still bury the elbow on a stroke that wraps the hands
      // across the body — in the chest, or out along the handle past the knob.
      // Turn the bend around the arm until it clears, smallest turn first.
      for (let step = 1; step <= 6 && room(elbow) < 1; step++)
        for (const side of [1, -1]) {
          const turned = bend(hint.clone().applyAxisAngle(along, side * step * .26));
          if (room(turned) > room(elbow)) elbow = turned;
        }
      this.segment(arm.upper, arm.shoulder, elbow, .14, .145);
      this.segment(arm.lower, elbow, hand, .095);
      arm.elbow.position.copy(elbow); arm.cap.position.copy(arm.shoulder);
      // The fists ride the bat; only the wrists turn. The gauntlet sits at the
      // hand and points back up the forearm, so the arm meets the hand at the
      // wrist however the stroke has rolled the bat over.
      const wrist = elbow.clone().sub(hand);
      arm.cuff.position.copy(hand);
      if (wrist.lengthSq() > .000001) arm.cuff.quaternion.setFromUnitVectors(UP, wrist.normalize());
      const leg = this.legs[i];
      const hipJoint = new THREE.Vector3(i === 0 ? -.135 : .135, -.045, 0).applyQuaternion(yaw).add(hip);
      const foot = V(i === 0 ? pose.frontFoot : pose.backFoot);
      const footPitch = i === 1 ? pose.heel * 2.4 : 0;
      // Lift the heel about a planted toe instead of lifting the entire shoe.
      foot.y += .225 * Math.sin(footPitch) + .07 * (Math.cos(footPitch) - 1);
      const knee = solveJoint(hipJoint, foot, .43, .44, hipJoint.clone().add(new THREE.Vector3(.65, -.15, .02)));
      this.segment(leg.thigh, hipJoint, knee, .175, .19);
      this.segment(leg.shin, knee, foot, .145, .16);
      leg.knee.position.copy(knee); leg.cap.position.copy(hipJoint);
      const lowerAxis = knee.clone().sub(foot).normalize();
      leg.pad.quaternion.setFromUnitVectors(UP, lowerAxis).multiply(new THREE.Quaternion().setFromAxisAngle(UP, 1.38));
      leg.pad.position.copy(foot).lerp(knee, .54).add(new THREE.Vector3(.012, 0, .01));
      leg.shoe.position.copy(foot);
      leg.shoe.quaternion.setFromAxisAngle(UP, i === 0 ? pose.yaw * .77 : 1.38)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), footPitch));
    }
  }
  /** How far a point sits from the handle, and so from inside the bat. */
  private offHandle(point: THREE.Vector3) {
    const handle = new THREE.Vector3(0, 1, 0).applyQuaternion(this.bat.quaternion);
    const along = THREE.MathUtils.clamp(point.clone().sub(this.bat.position).dot(handle), -.134, .245);
    return point.distanceTo(this.bat.position.clone().addScaledVector(handle, along));
  }
  /** How far a point sits from the spine, and so from inside the trunk. */
  private offSpine(point: THREE.Vector3, hip: THREE.Vector3, chest: THREE.Vector3, spine: THREE.Vector3) {
    const along = THREE.MathUtils.clamp(point.clone().sub(hip).dot(spine), 0, chest.distanceTo(hip));
    return point.distanceTo(hip.clone().addScaledVector(spine, along));
  }
  /** Read-only measurements used to catch detached grips and pose regressions. */
  inspect() {
    this.root.updateMatrixWorld(true);
    return {
      shot: this.shot, pulling: this.pulling, yaw: this.pose.yaw, grip: [...this.pose.grip], frontFoot: [...this.pose.frontFoot], backFoot: [...this.pose.backFoot],
      hands: this.arms.map(arm => arm.glove.getWorldPosition(new THREE.Vector3()).toArray()),
      elbows: this.arms.map(arm => arm.elbow.position.toArray()),
      shoulders: this.arms.map(arm => arm.shoulder.toArray()),
      chest: [...this.pose.chest], hip: [...this.pose.hip],
      armLengths: this.arms.map(arm => [arm.upper.scale.y, arm.lower.scale.y]),
      legLengths: this.legs.map(leg => [leg.thigh.scale.y, leg.shin.scale.y]),
      charging: this.charging, downPitch: this.root.position.z - GAME.stanceZ,
      backToe: this.legs[1].shoe.localToWorld(new THREE.Vector3(0, -.07, .225)).toArray(),
      bladeContact: this.bat.localToWorld(new THREE.Vector3(0, -.44, 0)).toArray(),
      bladeTip: this.bat.localToWorld(new THREE.Vector3(0, -.83, 0)).toArray(),
      batUp: V(this.pose.batUp).normalize().toArray(),
      batFace: new THREE.Vector3(0, 0, 1).applyQuaternion(this.bat.quaternion).toArray(),
      // A fist that has turned away from the bat is a hand that has let go of it.
      gripTwist: this.arms.map(arm => arm.glove.quaternion.angleTo(new THREE.Quaternion())),
      // Where each hand sits on the handle, measured up it from the blade.
      handGrip: this.arms.map(arm => arm.glove.position.y),
      // How far in front of each shoulder the hand is carried. A shoulder cannot
      // take a two-handed grip round behind the back, so this going deeply
      // negative on both arms at once is a pose no body makes.
      handsForward: this.arms.map(arm => {
        const hand = arm.glove.getWorldPosition(new THREE.Vector3()).sub(this.root.position);
        return hand.sub(arm.shoulder).dot(new THREE.Vector3(0, 0, 1).applyQuaternion(this.torso.quaternion));
      }),
      // Whether the gauntlet meets the arm, and how far the elbow keeps off the
      // handle: a forearm lying along the handle runs through the bat.
      cuffAim: this.arms.map(arm => {
        const hand = arm.glove.getWorldPosition(new THREE.Vector3()).sub(this.root.position);
        const forearm = arm.elbow.position.clone().sub(hand).normalize();
        const cuff = new THREE.Vector3(0, 1, 0).applyQuaternion(arm.cuff.quaternion);
        return { alongForearm: cuff.dot(forearm), elbowOffHandle: this.offHandle(arm.elbow.position) };
      }),
    };
  }
}
