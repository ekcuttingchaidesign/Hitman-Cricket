import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GAME } from '../config/gameplay';
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
// The bat has one transform. Both gloves are attached to its handle; the arms
// solve back from those grip anchors, so neither hand can leave the bat.
// The waiting stance: knees flexed, back bent forward over the ball, head out
// past the front foot, hands together at the waist, and the blade lifted behind
// the back shoulder rather than propped on the ground.
const GUARD: Pose = {
  hip: [-0.05, 0.90, -0.04], chest: [0.02, 1.235, 0.10],
  frontFoot: [-0.10, 0.08, 0.32], backFoot: [-0.14, 0.08, -0.30],
  grip: [0.24, 0.82, 0.14], batUp: [-0.19, -0.92, 0.34], batFace: [0.34, 0.10, -0.94],
  yaw: 1.28, face: 0, heel: 0, leadElbow: -.34,
};
const BACKLIFT: Pose = {
  ...GUARD, grip: [0.27, 0.90, 0.11], batUp: [-0.28, -0.82, 0.50], batFace: [0.45, 0.05, -0.89],
  chest: [0.01, 1.25, 0.08], leadElbow: -.24,
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
  private arms: { upper: THREE.Mesh; lower: THREE.Mesh; elbow: THREE.Mesh; cap: THREE.Mesh; glove: THREE.Group; shoulder: THREE.Vector3 }[] = [];
  private legs: { thigh: THREE.Mesh; shin: THREE.Mesh; knee: THREE.Mesh; cap: THREE.Mesh; pad: THREE.Group; shoe: THREE.Group }[] = [];
  private pose: Pose = GUARD;
  private swingFrom: Pose = GUARD;
  private shot: ShotType = 'STRAIGHT';
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
  };
  private palette = {
    shirt: new THREE.MeshStandardMaterial({ color: 0x19334a, roughness: .88 }),
    trousers: new THREE.MeshStandardMaterial({ color: 0xe7e2d3, roughness: .82 }),
    pad: new THREE.MeshStandardMaterial({ color: 0xfdfcf4, roughness: .72 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xb77950, roughness: .87 }),
    bat: new THREE.MeshStandardMaterial({ color: 0xe0b77a, roughness: .83 }),
    accent: new THREE.MeshStandardMaterial({ color: 0xed7044, roughness: .7 }),
    grille: new THREE.MeshStandardMaterial({ color: 0x8c9da0, metalness: .6, roughness: .4 }),
    handle: new THREE.MeshStandardMaterial({ color: 0x394f58, roughness: .95 }),
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
    // Bat: turned handle, rubber grip, and a blade with softened shoulders.
    this.mesh(this.bat, this.palette.handle, [.046, .34, .046], 'tube').position.y = .04;
    this.mesh(this.bat, this.palette.accent, [.052, .13, .052], 'tube').position.y = .15;
    this.mesh(this.bat, this.palette.bat, [.17, .70, .07], 'soft').position.y = -.48;
    this.mesh(this.bat, this.palette.accent, [.135, .16, .012], 'soft').position.set(0, -.33, -.038);
    this.mesh(this.bat, this.palette.trousers, [.115, .085, .014], 'soft').position.set(0, -.48, -.038);
    for (let i = 0; i < 2; i++) {
      const glove = new THREE.Group(); this.bat.add(glove);
      glove.position.set(0, i === 0 ? .105 : -.045, 0);
      this.mesh(glove, this.palette.pad, [.125, .11, .115], 'soft');
      this.mesh(glove, this.palette.accent, [.128, .028, .118], 'soft').position.y = .05;
      for (let finger = 0; finger < 3; finger++) this.mesh(glove, this.palette.trousers, [.026, .085, .026], 'tube').position.set(-.032 + finger * .032, 0, -.058);
      this.arms.push({ upper: this.mesh(this.root, this.palette.shirt, [1, 1, 1], 'tube'), lower: this.mesh(this.root, this.palette.skin, [1, 1, 1], 'tube'),
        elbow: this.mesh(this.root, this.palette.skin, [.05, .05, .05], 'ball'), cap: this.mesh(this.root, this.palette.shirt, [.086, .083, .09], 'ball'),
        glove, shoulder: new THREE.Vector3() });
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
    this.swingStart = -Infinity; this.contactTime = -Infinity; this.anticipation = 0;
    this.root.position.set(-.36, 0, .35); this.root.rotation.set(0, 0, 0);
    this.apply(GUARD);
  }
  prepare(progress: number) { this.anticipation = THREE.MathUtils.smoothstep(progress, .05, .72); }
  swing(shot: ShotType, now: number, finalBallX: number, ballY = .54, ballZ: number = GAME.contactZ) {
    this.shot = shot; this.swingStart = now; this.contactTime = now + STROKE_CONTACT_MS;
    this.swingFrom = this.pose; this.ballX = finalBallX; this.ballY = ballY; this.ballZ = ballZ;
  }
  get strikeAt() { return this.contactTime; }
  update(now: number) {
    const age = now - this.swingStart;
    if (!Number.isFinite(age) || age >= STROKE_DURATION_MS) {
      this.apply(mix(GUARD, BACKLIFT, Number.isFinite(age) ? 0 : this.anticipation)); return;
    }
    const stroke = STROKES[this.shot];
    // Place the middle of the blade at the ball's contact plane, not merely
    // somewhere along the selected sector. Wrong shots stay in their own reach.
    const zones: Record<ShotType, [number, number]> = {
      LEG: [-.55, -.05], LONG_ON: [-.55, .08], STRAIGHT: [-.17, .17],
      COVER_LONG_OFF: [-.08, .55], OFF: [.05, .55],
    };
    const targetX = THREE.MathUtils.clamp(this.ballX, ...zones[this.shot]);
    const contactGrip = new THREE.Vector3(targetX - this.root.position.x, this.ballY, this.ballZ - this.root.position.z)
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
      const pole = chest.clone().add(new THREE.Vector3(i === 0 ? .38 : -.30, i === 0 ? pose.leadElbow : -.24, i === 0 ? .42 : -.35));
      const elbow = solveJoint(arm.shoulder, hand, .32, .34, pole);
      this.segment(arm.upper, arm.shoulder, elbow, .14, .145);
      this.segment(arm.lower, elbow, hand, .095);
      arm.elbow.position.copy(elbow); arm.cap.position.copy(arm.shoulder);
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
  /** Read-only measurements used to catch detached grips and pose regressions. */
  inspect() {
    this.root.updateMatrixWorld(true);
    return {
      shot: this.shot, yaw: this.pose.yaw, grip: [...this.pose.grip], frontFoot: [...this.pose.frontFoot], backFoot: [...this.pose.backFoot],
      hands: this.arms.map(arm => arm.glove.getWorldPosition(new THREE.Vector3()).toArray()),
      armLengths: this.arms.map(arm => [arm.upper.scale.y, arm.lower.scale.y]),
      backToe: this.legs[1].shoe.localToWorld(new THREE.Vector3(0, -.07, .225)).toArray(),
      bladeContact: this.bat.localToWorld(new THREE.Vector3(0, -.44, 0)).toArray(),
      bladeTip: this.bat.localToWorld(new THREE.Vector3(0, -.83, 0)).toArray(),
      batUp: V(this.pose.batUp).normalize().toArray(),
      batFace: new THREE.Vector3(0, 0, 1).applyQuaternion(this.bat.quaternion).toArray(),
    };
  }
}
