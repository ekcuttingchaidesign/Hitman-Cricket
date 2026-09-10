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
/** Hip to upper chest. One number, so every figure is the same person. */
export const SPINE = .46;

/**
 * A surface of revolution from a bottom-to-top `[height, radius]` profile,
 * flattened front to back. One of these is a whole trunk — shoulders, ribs,
 * waist and neck in a single unbroken skin — where a stack of ellipsoids leaves
 * a seam at every join and reads as exactly what it is.
 */
function lathe(profile: [number, number][], depth: number, segments = 32) {
  const geometry = new THREE.LatheGeometry(profile.map(([y, r]) => new THREE.Vector2(Math.max(r, .002), y)), segments);
  geometry.scale(1, 1, depth);
  geometry.computeVertexNormals();
  return geometry;
}

const SHAPES = {
  ball: new THREE.SphereGeometry(1, 28, 20),
  /**
   * A limb, tapering towards the joint it points at. `segment` puts the top of
   * this at the far end, so the top is the narrow one: an arm is thickest at
   * the shoulder and thinnest at the wrist, and getting that the wrong way
   * round is most of why a limb reads as a stack of parts rather than an arm.
   */
  limb: new THREE.CylinderGeometry(.5, .62, 1, 24, 1),
  tube: new THREE.CylinderGeometry(.5, .5, 1, 20, 1),
  soft: new RoundedBoxGeometry(1, 1, 1, 5, .3),
  /** Shoulders down to the waist, and up into the neck, in one piece. */
  trunk: lathe([
    [-.34, .02], [-.325, .112], [-.27, .142], [-.17, .163], [-.05, .190],
    [.055, .201], [.125, .186], [.170, .140], [.200, .098],
    [.245, .072], [.300, .067], [.325, .02],
  ], .74),
  /** The pelvis, wide enough at the top for the trunk to tuck inside it. */
  pelvis: lathe([
    [-.20, .02], [-.185, .098], [-.125, .146], [-.02, .170], [.075, .167],
    [.150, .150], [.200, .092], [.225, .02],
  ], .80),
  /** A head, rather than a ball with a jaw stuck under it. */
  head: lathe([
    [-.160, .02], [-.144, .066], [-.112, .105], [-.058, .129],
    [.011, .139], [.075, .132], [.126, .099], [.158, .02],
  ], .92),
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

/**
 * How wide each limb is, and the joint balls that close its ends. The taper is
 * .62 of the width at the anchor and .5 at the far joint, so a joint ball takes
 * the radius the two limbs meeting inside it actually arrive with.
 */
const ARM_UPPER = .132, ARM_LOWER = .106, LEG_UPPER = .195, LEG_LOWER = .150;
const ELBOW = ARM_UPPER * .5, KNEE = LEG_UPPER * .5;

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

    // Trunk and pelvis are one lathed skin each, and they overlap at the waist
    // with the trunk tucked inside the wider pelvis, so the join is buried
    // rather than shown. The neck is part of the trunk for the same reason.
    this.mesh(this.torso, shirt, [1, 1, 1], 'trunk');
    this.mesh(this.hips, trousers, [1, 1, 1], 'pelvis');
    // Collar and placket, so a turning body reads as turning.
    this.mesh(this.torso, trim, [.172, .036, .166], 'tube').position.y = .196;
    this.mesh(this.torso, trim, [.034, .26, .012], 'soft').position.set(0, .01, .142);
    this.mesh(this.torso, skin, [.128, .10, .118], 'tube').position.y = .27;

    // Head: one shape, with the cap sitting on it.
    this.mesh(this.head, skin, [1, 1, 1], 'head');
    for (const x of [-.127, .127]) this.mesh(this.head, skin, [.024, .044, .034], 'ball').position.set(x, -.005, -.012);
    const cap = material(kit.cap, .74);
    this.mesh(this.head, cap, [.144, .128, .152], 'ball').position.set(0, .050, -.004);
    // The peak: a flattened lobe out over the brow, its back half buried in the
    // dome. A band round a sphere would ring the whole head like a crest.
    const peak = this.mesh(this.head, cap, [.152, .030, .150], 'ball');
    peak.position.set(0, .046, .072); peak.rotation.x = -.18;
    this.mesh(this.head, cap, [.027, .027, .027], 'ball').position.set(0, .164, -.004);

    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      // A hand, small enough to read as a fist at this scale.
      const hand = new THREE.Group(); this.root.add(hand); this.hands.push(hand);
      this.mesh(hand, skin, [.058, .082, .05], 'ball');
      this.mesh(hand, skin, [.026, .048, .03], 'ball').position.set(side * .042, .02, .012);
      // Joint balls are sized to the radius the limbs actually arrive with, so
      // the sphere and the taper meet flush instead of stepping. A joint wider
      // than the limbs inside it is a bead on a string; one narrower is a gap.
      this.arms.push({
        upper: this.mesh(this.root, shirt, [1, 1, 1], 'limb'),
        lower: this.mesh(this.root, skin, [1, 1, 1], 'limb'),
        joint: this.mesh(this.root, skin, [ELBOW, ELBOW, ELBOW], 'ball'),
        cap: this.mesh(this.root, shirt, [.086, .082, .086], 'ball'),
        end: hand,
      });
      // The sleeve hem rides the upper arm, so it travels with the shoulder.
      this.mesh(this.arms[i].upper, trim, [1.04, .075, 1.04], 'tube').position.y = -.30;

      const foot = new THREE.Group(); this.root.add(foot);
      this.mesh(foot, shoe, [.09, .062, .165], 'soft').position.z = .042;
      this.mesh(foot, shoe, [.046, .034, .036], 'ball').position.set(0, -.012, .128);
      this.mesh(foot, sole, [.092, .024, .167], 'soft').position.set(0, -.038, .042);
      this.mesh(foot, material(kit.shirt, .7), [.094, .016, .05], 'soft').position.set(0, .014, 0);
      this.legs.push({
        upper: this.mesh(this.root, trousers, [1, 1, 1], 'limb'),
        lower: this.mesh(this.root, trousers, [1, 1, 1], 'limb'),
        joint: this.mesh(this.root, trousers, [KNEE, KNEE, KNEE], 'ball'),
        cap: this.mesh(this.root, trousers, [.121, .118, .121], 'ball'),
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
      hip: new THREE.Vector3(0, .845, 0), chest: new THREE.Vector3(0, .845 + SPINE, .015),
      yaw: 0, lean: 0,
      leftFoot: new THREE.Vector3(-.20, .05, .06), rightFoot: new THREE.Vector3(.20, .05, -.06),
      leftHand: new THREE.Vector3(-.25, .80, .12), rightHand: new THREE.Vector3(.25, .80, .12),
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
    pose.leftHand.set(-.15, THREE.MathUtils.lerp(.80, 1.98, r), THREE.MathUtils.lerp(.12, .16, r));
    pose.rightHand.set(.15, THREE.MathUtils.lerp(.80, 1.98, r), THREE.MathUtils.lerp(.12, .16, r));
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
    this.head.position.copy(chest).addScaledVector(spine.clone().applyQuaternion(roll), .33);
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
      segment(arm.upper, shoulder, elbow, ARM_UPPER, ARM_UPPER * 1.04);
      segment(arm.lower, elbow, hand, ARM_LOWER, ARM_LOWER * 1.04);
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
      segment(leg.upper, hipJoint, knee, LEG_UPPER, LEG_UPPER * 1.04);
      segment(leg.lower, knee, foot, LEG_LOWER, LEG_LOWER * 1.04);
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
