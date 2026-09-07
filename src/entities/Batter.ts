import * as THREE from 'three';
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
const GUARD: Pose = {
  hip: [-0.10, 0.94, 0], chest: [0.06, 1.25, 0.035],
  frontFoot: [-0.11, 0.08, 0.29], backFoot: [-0.13, 0.08, -0.27],
  grip: [0.31, 0.84, 0.22], batUp: [-0.04, 1, -0.035],
  yaw: 1.35, face: 0, heel: 0, leadElbow: -.30,
};
const BACKLIFT: Pose = {
  ...GUARD, grip: [0.32, 1.04, 0.03], batUp: [-0.32, 0.30, 0.90],
  chest: [0.05, 1.28, 0.015], leadElbow: -.08,
};

interface Stroke { contact: Pose; finish: Pose }
const STROKES: Record<ShotType, Stroke> = {
  STRAIGHT: {
    contact: { ...GUARD, hip: [-0.05, .83, .14], chest: [.12, 1.17, .23], frontFoot: [.02, .08, .63],
      grip: [.34, .98, .36], batUp: [.035, .985, -.17], yaw: 1.08, face: 0, heel: .07, leadElbow: .13 },
    finish: { ...GUARD, hip: [.0, .9, .21], chest: [.09, 1.28, .29], frontFoot: [.02, .08, .63],
      grip: [.21, 1.58, .61], batUp: [-.1, -.62, -.78], yaw: .74, face: 0, heel: .15 },
  },
  LONG_ON: {
    contact: { ...GUARD, hip: [-.16, .82, .13], chest: [-.035, 1.16, .21], frontFoot: [-.34, .08, .58],
      grip: [.15, .98, .35], batUp: [-.26, .955, -.14], yaw: 1.04, face: -.25, heel: .08, leadElbow: .10 },
    finish: { ...GUARD, hip: [-.19, .9, .20], chest: [-.17, 1.28, .29], frontFoot: [-.34, .08, .58],
      grip: [-.40, 1.55, .58], batUp: [.49, -.61, -.62], yaw: .33, face: -.38, heel: .15 },
  },
  COVER_LONG_OFF: {
    contact: { ...GUARD, hip: [.05, .81, .13], chest: [.19, 1.15, .22], frontFoot: [.30, .08, .60],
      grip: [.50, .98, .35], batUp: [.34, .93, -.14], yaw: 1.42, face: .28, heel: .07, leadElbow: .12 },
    finish: { ...GUARD, hip: [.08, .9, .19], chest: [.22, 1.28, .26], frontFoot: [.30, .08, .60],
      grip: [.60, 1.55, .57], batUp: [-.57, -.57, -.59], yaw: .88, face: .4, heel: .14 },
  },
  LEG: {
    // Front-foot flick: open the front foot and roll the wrists to the leg side.
    contact: { ...GUARD, hip: [-.16, .82, .09], chest: [.05, 1.17, .16], frontFoot: [-.38, .08, .48],
      grip: [.30, .94, .35], batUp: [.35, .90, -.25], yaw: .82, face: -.5, heel: .05 },
    finish: { ...GUARD, hip: [-.20, .87, .13], chest: [-.17, 1.25, .20], frontFoot: [-.38, .08, .48],
      grip: [-.46, 1.13, .35], batUp: [.60, -.30, -.74], yaw: -.15, face: -.75, heel: .10 },
  },
  OFF: {
    // Back-foot square cut: make room, bend the knees, extend into the off side.
    contact: { ...GUARD, hip: [-.16, .78, -.12], chest: [.01, 1.11, .07], frontFoot: [-.23, .08, .18],
      backFoot: [-.19, .08, -.43], grip: [.31, .85, .27], batUp: [-.88, .43, -.19], yaw: 1.65, face: .52, heel: .02 },
    finish: { ...GUARD, hip: [-.11, .85, -.10], chest: [.06, 1.21, .01], frontFoot: [-.23, .08, .18],
      backFoot: [-.19, .08, -.43], grip: [.63, 1.26, .26], batUp: [-.66, -.22, -.72], yaw: .83, face: .7, heel: .06 },
  },
};

function mix(a: Pose, b: Pose, amount: number): Pose {
  const t = ease(THREE.MathUtils.clamp(amount, 0, 1));
  const point = (x: Point, y: Point): Point => [
    THREE.MathUtils.lerp(x[0], y[0], t), THREE.MathUtils.lerp(x[1], y[1], t), THREE.MathUtils.lerp(x[2], y[2], t),
  ];
  return {
    hip: point(a.hip, b.hip), chest: point(a.chest, b.chest),
    frontFoot: point(a.frontFoot, b.frontFoot), backFoot: point(a.backFoot, b.backFoot),
    grip: point(a.grip, b.grip), batUp: point(a.batUp, b.batUp),
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
  private arms: { upper: THREE.Mesh; lower: THREE.Mesh; elbow: THREE.Mesh; glove: THREE.Group; shoulder: THREE.Vector3 }[] = [];
  private legs: { thigh: THREE.Mesh; shin: THREE.Mesh; knee: THREE.Mesh; pad: THREE.Group; shoe: THREE.Group }[] = [];
  private pose: Pose = GUARD;
  private swingFrom: Pose = GUARD;
  private shot: ShotType = 'STRAIGHT';
  private swingStart = -Infinity;
  private anticipation = 0;
  private contactTime = -Infinity;
  private ballX = 0;
  private ballY = .54;
  private ballZ: number = GAME.contactZ;
  private unitBox = new THREE.BoxGeometry(1, 1, 1);
  private unitSphere = new THREE.SphereGeometry(1, 10, 7);
  private palette = {
    shirt: new THREE.MeshStandardMaterial({ color: 0x19334a, roughness: .88 }),
    trousers: new THREE.MeshStandardMaterial({ color: 0xeeeadd, roughness: .9 }),
    pad: new THREE.MeshStandardMaterial({ color: 0xfaf8e9, roughness: .84 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xb77950, roughness: .87 }),
    bat: new THREE.MeshStandardMaterial({ color: 0xe0b77a, roughness: .83 }),
    accent: new THREE.MeshStandardMaterial({ color: 0xed7044, roughness: .7 }),
    grille: new THREE.MeshStandardMaterial({ color: 0x8c9da0, metalness: .6, roughness: .4 }),
    handle: new THREE.MeshStandardMaterial({ color: 0x394f58, roughness: .95 }),
  };
  constructor() {
    this.root.name = 'Articulated right-handed batter';
    this.root.add(this.torso, this.hips, this.head, this.bat);
    const body = this.mesh(this.torso, this.palette.shirt, [.40, .43, .27]);
    body.position.y = -.08;
    this.mesh(this.hips, this.palette.trousers, [.34, .20, .25]);
    const neck = this.mesh(this.torso, this.palette.skin, [.11, .15, .11]); neck.position.y = .22;
    // Jersey seam, collar, and back number make rotation legible from the camera.
    this.mesh(this.torso, this.palette.accent, [.38, .022, .28]).position.y = -.22;
    for (const x of [-.055, .055]) this.mesh(this.torso, this.palette.accent, [.035, .14, .008]).position.set(x, -.04, -.14);
    const face = this.mesh(this.head, this.palette.skin, [.16, .19, .16], true); face.position.y = -.035;
    const helmet = this.mesh(this.head, this.palette.shirt, [.215, .175, .22], true); helmet.position.set(0, .055, -.02);
    this.mesh(this.head, this.palette.shirt, [.37, .035, .22]).position.set(0, .055, .14);
    for (const y of [-.055, -.115]) this.mesh(this.head, this.palette.grille, [.32, .013, .018]).position.set(0, y, .18);
    for (const x of [-.15, .15]) this.mesh(this.head, this.palette.grille, [.012, .19, .016]).position.set(x, -.045, .18);
    this.mesh(this.bat, this.palette.handle, [.048, .34, .048]).position.y = .04;
    this.mesh(this.bat, this.palette.bat, [.17, .70, .065]).position.y = -.48;
    this.mesh(this.bat, this.palette.accent, [.135, .16, .008]).position.set(0, -.33, -.036);
    this.mesh(this.bat, this.palette.trousers, [.11, .08, .009]).position.set(0, -.48, -.036);
    for (let i = 0; i < 2; i++) {
      const glove = new THREE.Group(); this.bat.add(glove);
      glove.position.set(0, i === 0 ? .105 : -.045, 0);
      this.mesh(glove, this.palette.pad, [.12, .105, .11]);
      this.mesh(glove, this.palette.accent, [.125, .022, .115]).position.y = .048;
      for (let finger = 0; finger < 3; finger++) this.mesh(glove, this.palette.trousers, [.021, .082, .025]).position.set(-.032 + finger * .032, 0, -.06);
      this.arms.push({ upper: this.mesh(this.root, this.palette.shirt, [1, 1, 1]), lower: this.mesh(this.root, this.palette.skin, [1, 1, 1]),
        elbow: this.mesh(this.root, this.palette.skin, [.073, .073, .073], true), glove, shoulder: new THREE.Vector3() });
      const pad = new THREE.Group(); this.root.add(pad);
      this.mesh(pad, this.palette.pad, [.19, .38, .10]);
      for (let rib = 0; rib < 4; rib++) this.mesh(pad, this.palette.trousers, [.016, .33, .018]).position.set(-.064 + rib * .043, 0, .06);
      this.mesh(pad, this.palette.pad, [.205, .10, .12]).position.set(0, .23, .01);
      const shoe = new THREE.Group(); this.root.add(shoe);
      this.mesh(shoe, this.palette.pad, [.19, .13, .34]).position.z = .055;
      this.mesh(shoe, this.palette.handle, [.19, .025, .34]).position.set(0, -.057, .055);
      this.mesh(shoe, this.palette.accent, [.195, .018, .09]).position.set(0, .013, .12);
      this.legs.push({ thigh: this.mesh(this.root, this.palette.trousers, [1, 1, 1]), shin: this.mesh(this.root, this.palette.trousers, [1, 1, 1]),
        knee: this.mesh(this.root, this.palette.trousers, [.10, .10, .10], true), pad, shoe });
    }
    this.reset();
  }
  private mesh(parent: THREE.Object3D, material: THREE.Material, scale: Point, round = false) {
    const mesh = new THREE.Mesh(round ? this.unitSphere : this.unitBox, material);
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
    this.head.position.copy(chest).add(new THREE.Vector3(.045, .30, .035));
    this.head.rotation.set(.09, pose.face, -.04);
    this.bat.position.set(...pose.grip);
    // Preserve bat face orientation while the blade travels through its plane.
    const batUp = V(pose.batUp).normalize();
    this.bat.quaternion.setFromUnitVectors(UP, batUp);
    this.root.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) {
      const arm = this.arms[i];
      arm.shoulder.set(i === 0 ? -.20 : .20, .04, 0).applyQuaternion(this.torso.quaternion).add(chest);
      const hand = arm.glove.position.clone().applyQuaternion(this.bat.quaternion).add(this.bat.position);
      const pole = chest.clone().add(new THREE.Vector3(i === 0 ? .38 : -.30, i === 0 ? pose.leadElbow : -.24, i === 0 ? .42 : -.35));
      const elbow = solveJoint(arm.shoulder, hand, .32, .34, pole);
      this.segment(arm.upper, arm.shoulder, elbow, .14, .145);
      this.segment(arm.lower, elbow, hand, .095);
      arm.elbow.position.copy(elbow);
      const leg = this.legs[i];
      const hipJoint = new THREE.Vector3(i === 0 ? -.135 : .135, -.045, 0).applyQuaternion(yaw).add(hip);
      const foot = V(i === 0 ? pose.frontFoot : pose.backFoot);
      const footPitch = i === 1 ? pose.heel * 2.4 : 0;
      // Lift the heel about a planted toe instead of lifting the entire shoe.
      foot.y += .225 * Math.sin(footPitch) + .07 * (Math.cos(footPitch) - 1);
      const knee = solveJoint(hipJoint, foot, .43, .44, hipJoint.clone().add(new THREE.Vector3(.65, -.15, .02)));
      this.segment(leg.thigh, hipJoint, knee, .175, .19);
      this.segment(leg.shin, knee, foot, .145, .16);
      leg.knee.position.copy(knee);
      const lowerAxis = knee.clone().sub(foot).normalize();
      leg.pad.quaternion.setFromUnitVectors(UP, lowerAxis).multiply(new THREE.Quaternion().setFromAxisAngle(UP, 1.38));
      leg.pad.position.copy(foot).lerp(knee, .54).add(new THREE.Vector3(.075, 0, .012));
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
      batUp: V(this.pose.batUp).normalize().toArray(),
    };
  }
}
