import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Point, UP, segment, solveJoint } from './rig';

/**
 * Everyone on the field who is not the batter: the bowler and the fielders.
 *
 * The figure they replace was a stack — a few ellipsoids threaded on the spine,
 * two rigid legs with no knee in them, and one arm that could bend. Stacking is
 * what made it read as low-poly: not the triangle count, which was never low,
 * but the fact that nothing joined onto anything. A shoulder was a ball resting
 * beside a torso, a shin was a tube starting where a thigh stopped, and a leg
 * swung from the hip in one piece like an oar.
 *
 * So this is a skeleton rather than a stack. Every limb is solved between two
 * points and drawn as a tapered segment with a sphere sitting in the joint at
 * each end, which is what closes the surface: the joint sphere is wider than
 * the two segments meeting inside it, so the seam is buried and an elbow reads
 * as a bend rather than as a gap. The taper is the other half — an arm that
 * narrows from shoulder to wrist and a thigh that narrows to the knee carry
 * more of the read than any amount of extra detail bolted on top.
 */
export interface Figure {
  root: THREE.Group;
  /** Pelvis centre and upper-chest centre; the spine runs between them. */
  hip: THREE.Vector3;
  chest: THREE.Vector3;
  yaw: number;
  /** Roll about the direction of travel: a bowler falls away on his follow-through. */
  lean: number;
  /** Feet, in the figure's own space. `left` leads for a right-arm bowler. */
  leftFoot: THREE.Vector3;
  rightFoot: THREE.Vector3;
  leftHand: THREE.Vector3;
  rightHand: THREE.Vector3;
  headYaw: number;
  headPitch: number;
}

/** Limb lengths, shared so a bowler and a fielder are the same person. */
export const BUILD = {
  thigh: .44, shin: .45,
  upperArm: .32, foreArm: .34,
  /** Shoulder half-width and its height above the chest anchor. */
  shoulderX: .175, shoulderY: .085,
  hipX: .125,
} as const;
export const ARM_REACH = BUILD.upperArm + BUILD.foreArm;

const SHAPES = {
  ball: new THREE.SphereGeometry(1, 24, 16),
  /** A unit tube that tapers to 55% at the top: every limb narrows towards its joint. */
  limb: new THREE.CylinderGeometry(.55, .5, 1, 18, 1),
  tube: new THREE.CylinderGeometry(.5, .5, 1, 18, 1),
  soft: new RoundedBoxGeometry(1, 1, 1, 4, .3),
  /** The peak of a cap: a shallow arc, wider than it is deep, curving down at the sides. */
  peak: new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, Math.PI * .38, Math.PI * .12),
};

export interface Kit {
  shirt: number;
  trousers: number;
  skin: number;
  trim: number;
  cap: number;
  shoe: number;
}
export const KIT: Kit = { shirt: 0xe4703a, trousers: 0xf4f0e4, skin: 0xb77950, trim: 0xfbf7ec, cap: 0xe4703a, shoe: 0xfbf7ec };

const cache = new Map<string, THREE.MeshStandardMaterial>();
function material(color: number, roughness: number) {
  const key = `${color}:${roughness}`;
  if (!cache.has(key)) cache.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
  return cache.get(key)!;
}

/** A limb: the tapered shaft, plus the joint balls that close both of its ends. */
interface Limb { upper: THREE.Mesh; lower: THREE.Mesh; joint: THREE.Mesh; cap: THREE.Mesh; end: THREE.Group }

export class Cricketer {
  readonly root = new THREE.Group();
  private torso = new THREE.Group();
  private hips = new THREE.Group();
  private head = new THREE.Group();
  private arms: Limb[] = [];
  private legs: Limb[] = [];
  /** Handed to the bowler so he can put the ball in his fingers. */
  readonly hands: THREE.Group[] = [];
  private pose: Figure;
  /** Where each limb was anchored last frame, kept so `inspect` can measure it. */
  private shoulders = [new THREE.Vector3(), new THREE.Vector3()];
  private hipJoints = [new THREE.Vector3(), new THREE.Vector3()];

  constructor(kit: Kit = KIT) {
    const skin = material(kit.skin, .86);
    const shirt = material(kit.shirt, .82);
    const trousers = material(kit.trousers, .8);
    const trim = material(kit.trim, .78);
    const shoe = material(kit.shoe, .7);
    const sole = material(0x3d4046, .85);
    this.root.name = 'Articulated cricketer';
    this.root.add(this.hips, this.torso, this.head);

    // Torso: a ribcage that is wide at the shoulders and narrows into the waist,
    // with the pelvis as its own block below. Two ellipsoids rather than one is
    // what gives the figure a waist to turn at.
    this.mesh(this.torso, shirt, [.215, .25, .155], 'ball').position.y = -.03;
    this.mesh(this.torso, shirt, [.185, .13, .135], 'ball').position.y = -.235;
    this.mesh(this.hips, trousers, [.175, .145, .142], 'ball');
    // Collar, sleeve trim and a placket, so a turning body reads as turning.
    this.mesh(this.torso, trim, [.108, .036, .108], 'tube').position.y = .175;
    this.mesh(this.torso, trim, [.036, .30, .012], 'soft').position.set(0, -.05, .142);
    this.mesh(this.torso, skin, [.062, .09, .062], 'tube').position.y = .20;

    // Head: a skull, a jaw that is narrower than it, ears, and a real cap — a
    // dome with a peak curving away from it, rather than a slab across the brow.
    this.mesh(this.head, skin, [.125, .145, .131], 'ball');
    this.mesh(this.head, skin, [.10, .08, .112], 'ball').position.set(0, -.082, .018);
    for (const x of [-.123, .123]) this.mesh(this.head, skin, [.024, .04, .03], 'ball').position.set(x, -.01, -.01);
    const dome = this.mesh(this.head, material(kit.cap, .74), [.133, .127, .139], 'ball');
    dome.position.set(0, .048, -.006);
    const peak = this.mesh(this.head, material(kit.cap, .74), [.135, .16, .175], 'peak');
    peak.position.set(0, .09, .056); peak.rotation.x = -.30;
    this.mesh(this.head, material(kit.cap, .74), [.026, .026, .026], 'ball').position.set(0, .16, -.006);

    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      // Hand: a palm with a thumb, small enough to read as a fist at this scale.
      const hand = new THREE.Group(); this.root.add(hand); this.hands.push(hand);
      this.mesh(hand, skin, [.062, .085, .048], 'ball');
      this.mesh(hand, skin, [.028, .05, .03], 'ball').position.set(side * .045, .022, .012);
      this.arms.push({
        upper: this.mesh(this.root, shirt, [1, 1, 1], 'limb'),
        lower: this.mesh(this.root, skin, [1, 1, 1], 'limb'),
        joint: this.mesh(this.root, skin, [.060, .060, .060], 'ball'),
        cap: this.mesh(this.root, shirt, [.098, .092, .1], 'ball'),
        end: hand,
      });
      // The sleeve hem sits on the upper arm, so it travels with the shoulder.
      this.mesh(this.arms[i].upper, trim, [1.06, .07, 1.06], 'tube').position.y = -.36;

      const foot = new THREE.Group(); this.root.add(foot);
      this.mesh(foot, shoe, [.088, .058, .16], 'soft').position.z = .04;
      this.mesh(foot, shoe, [.045, .032, .035], 'ball').position.set(0, -.012, .125);
      this.mesh(foot, sole, [.09, .022, .162], 'soft').position.set(0, -.036, .04);
      this.mesh(foot, material(kit.shirt, .7), [.092, .016, .05], 'soft').position.set(0, .012, .0);
      this.legs.push({
        upper: this.mesh(this.root, trousers, [1, 1, 1], 'limb'),
        lower: this.mesh(this.root, trousers, [1, 1, 1], 'limb'),
        joint: this.mesh(this.root, trousers, [.098, .098, .098], 'ball'),
        cap: this.mesh(this.root, trousers, [.128, .124, .128], 'ball'),
        end: foot,
      });
    }
    this.pose = this.stand();
    this.apply(this.pose);
  }

  private mesh(parent: THREE.Object3D, mat: THREE.Material, scale: Point, shape: keyof typeof SHAPES = 'soft') {
    const mesh = new THREE.Mesh(SHAPES[shape], mat);
    mesh.scale.set(...scale); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }

  /** A fielder waiting on the ball: knees soft, hands ready, weight forward. */
  stand(): Figure {
    return {
      root: this.root,
      hip: new THREE.Vector3(0, .845, 0), chest: new THREE.Vector3(0, 1.215, .015),
      yaw: 0, lean: 0,
      leftFoot: new THREE.Vector3(-.20, .05, .06), rightFoot: new THREE.Vector3(.20, .05, -.06),
      leftHand: new THREE.Vector3(-.27, .74, .13), rightHand: new THREE.Vector3(.27, .74, .13),
      headYaw: 0, headPitch: .04,
    };
  }

  /**
   * Taking a catch: from the waiting crouch to both hands up over the head,
   * eyes on the ball. `reach` runs 0 to 1.
   */
  catchAt(reach: number) {
    const r = THREE.MathUtils.clamp(reach, 0, 1);
    const pose = this.stand();
    pose.hip.y += r * .10;
    pose.chest.set(0, pose.chest.y + r * .12, .015 - r * .05);
    pose.leftFoot.set(-.20, .05 + r * .03, .06);
    pose.rightFoot.set(.20, .05, -.06 - r * .10);
    pose.leftHand.set(-.14, THREE.MathUtils.lerp(.74, 1.92, r), THREE.MathUtils.lerp(.13, .16, r));
    pose.rightHand.set(.14, THREE.MathUtils.lerp(.74, 1.92, r), THREE.MathUtils.lerp(.13, .16, r));
    pose.headPitch = .04 - r * .34;
    this.apply(pose);
  }

  /**
   * Place every part from a pose. Arms and legs are solved between their anchor
   * and their end point, so a limb never overshoots its own length: reaching
   * past it straightens rather than stretching, which is the one thing a stack
   * of fixed-length tubes cannot do.
   */
  apply(pose: Figure) {
    this.pose = pose;
    const { hip, chest } = pose;
    const yaw = new THREE.Quaternion().setFromAxisAngle(UP, pose.yaw);
    const spine = chest.clone().sub(hip);
    if (spine.lengthSq() < .000001) spine.set(0, 1, 0);
    spine.normalize();
    // Lean rolls the whole trunk about the way the body faces, so a bowler
    // falling away over his front leg takes his head and shoulders with him.
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(yaw);
    const roll = new THREE.Quaternion().setFromAxisAngle(forward, pose.lean);
    const trunk = new THREE.Quaternion().setFromUnitVectors(UP, spine.clone().applyQuaternion(roll)).multiply(yaw);

    this.hips.position.copy(hip);
    this.hips.quaternion.copy(yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), pose.lean * .5));
    this.torso.position.copy(chest);
    this.torso.quaternion.copy(trunk);
    this.head.position.copy(chest).addScaledVector(spine.clone().applyQuaternion(roll), .325);
    this.head.quaternion.copy(trunk).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.headPitch, pose.headYaw, 0)));

    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(trunk);
    const up = spine.clone().applyQuaternion(roll);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const arm = this.arms[i];
      const shoulder = chest.clone().addScaledVector(right, side * BUILD.shoulderX).addScaledVector(up, BUILD.shoulderY);
      this.shoulders[i].copy(shoulder);
      const hand = i === 0 ? pose.leftHand : pose.rightHand;
      // Elbows bend down and out, away from the ribs. Pushing the hint square to
      // the arm keeps that true when the hand is above the head, where a fixed
      // downward pole would fold the elbow straight through the chest.
      const along = hand.clone().sub(shoulder);
      if (along.lengthSq() < .000001) along.copy(up).negate();
      along.normalize();
      const hint = up.clone().negate().addScaledVector(right, side * .55);
      hint.addScaledVector(along, -hint.dot(along));
      if (hint.lengthSq() < .0001) hint.copy(right).multiplyScalar(side);
      hint.normalize();
      const elbow = solveJoint(shoulder, hand, BUILD.upperArm, BUILD.foreArm, shoulder.clone().addScaledVector(hint, .5));
      segment(arm.upper, shoulder, elbow, .128, .134);
      segment(arm.lower, elbow, hand, .101, .105);
      arm.joint.position.copy(elbow);
      arm.cap.position.copy(shoulder);
      // The hand keeps the forearm's own direction, so the wrist never snaps.
      arm.end.position.copy(hand);
      const wrist = hand.clone().sub(elbow);
      if (wrist.lengthSq() > .000001) arm.end.quaternion.setFromUnitVectors(UP, wrist.normalize());

      const leg = this.legs[i];
      const hipJoint = hip.clone().addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(yaw), side * BUILD.hipX).addScaledVector(UP, -.04);
      this.hipJoints[i].copy(hipJoint);
      const foot = i === 0 ? pose.leftFoot : pose.rightFoot;
      // Knees lead forward, in the direction the body faces.
      const knee = solveJoint(hipJoint, foot, BUILD.thigh, BUILD.shin,
        hipJoint.clone().addScaledVector(forward, .8).addScaledVector(UP, -.15));
      segment(leg.upper, hipJoint, knee, .188, .196);
      segment(leg.lower, knee, foot, .142, .150);
      leg.joint.position.copy(knee);
      leg.cap.position.copy(hipJoint);
      leg.end.position.copy(foot);
      // The foot points along the shin's own fall, so a lifted leg shows a
      // pointed toe and a planted one sits flat.
      const shin = foot.clone().sub(knee);
      const pitch = shin.lengthSq() > .000001 ? Math.asin(THREE.MathUtils.clamp(-shin.clone().normalize().dot(forward), -1, 1)) : 0;
      leg.end.quaternion.setFromAxisAngle(UP, pose.yaw);
      leg.end.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.clamp(pitch, -.9, .9)));
    }
  }

  /** Read-only measurements, for tests that check the action rather than watch it. */
  inspect() {
    this.root.updateMatrixWorld(true);
    return {
      hip: this.pose.hip.toArray(), chest: this.pose.chest.toArray(),
      hands: this.arms.map(a => a.end.position.toArray()),
      shoulders: this.shoulders.map(v => v.toArray()),
      elbows: this.arms.map(a => a.joint.position.toArray()),
      knees: this.legs.map(l => l.joint.position.toArray()),
      feet: this.legs.map(l => l.end.position.toArray()),
      armLengths: this.arms.map(a => [a.upper.scale.y, a.lower.scale.y]),
      legLengths: this.legs.map(l => [l.upper.scale.y, l.lower.scale.y]),
      lean: this.pose.lean, yaw: this.pose.yaw,
      // How far each limb is asked to reach, as a fraction of its own length.
      // Past 1 the two-bone solver clamps and the shin stops short of the foot,
      // which on screen is a leg that has come off at the knee — so this is the
      // one number every pose has to stay under.
      armReach: this.arms.map((a, i) => this.shoulders[i].distanceTo(a.end.position) / (BUILD.upperArm + BUILD.foreArm)),
      legReach: this.legs.map((l, i) => this.hipJoints[i].distanceTo(l.end.position) / (BUILD.thigh + BUILD.shin)),
    };
  }
}

/**
 * The primitives and materials every figure shares. They outlive any one scene,
 * so a scene tearing itself down has to leave them alone: disposing them takes
 * the geometry out from under every other cricketer still standing.
 */
export const FIGURE_ASSETS = {
  shapes: Object.values(SHAPES) as THREE.BufferGeometry[],
  materials: cache,
};
