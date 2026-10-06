import * as THREE from 'three';
import { ConnectedTrousers } from './ConnectedTrousers';
import { compactRigidParts } from './compactParts';
import { BendingLimb } from './BendingLimb';
import { ConnectedJersey } from './ConnectedJersey';
import { clothMaterial } from './characterMaterials';
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
 * The IK controls retain their original measurements. Visible clothing uses
 * the same connected shoulders and trousers as the batter, with fewer arm
 * rings for field distance. The old segment/joint meshes stay hidden for the
 * action inspector; they no longer form the rendered surface.
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
  /**
   * Which way the elbows point: nought is down and out, away from the ribs,
   * which is what a hanging or bowling arm does; one is straight back behind
   * him, which is what a running arm does. Left out, nought.
   */
  elbowsBack?: number;
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
/** Hip height stood upright, with the legs very nearly straight. */
export const REST_HIP = .9525;

const SHAPES = {
  ball: new THREE.SphereGeometry(1, 16, 12),
  /**
   * A limb, tapering towards the joint it points at. `segment` puts the top of
   * this at the far end, so the top is the narrow one: an arm is thickest at
   * the shoulder and thinnest at the wrist, and getting that the wrong way
   * round is most of why a limb reads as a stack of parts rather than an arm.
   */
  limb: new THREE.CylinderGeometry(.5, .62, 1, 12, 1),
  tube: new THREE.CylinderGeometry(.5, .5, 1, 12, 1),
  soft: new RoundedBoxGeometry(1, 1, 1, 2, .3),
  // Thin sewn details need only six faces; keep rounding for large forms.
  detail: new THREE.BoxGeometry(1, 1, 1),
    collar: new THREE.TorusGeometry(.071, .012, 6, 24).rotateX(Math.PI / 2),
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
/**
 * The parts of a kit a figure can be re-dressed in. `flash` is the strip of
 * shirt colour across the toe of the boot — it is the one place a kit colour is
 * used at a different roughness, so it needs naming separately or a change of
 * shirt would leave it behind.
 */
export type DressRole = keyof Kit | 'flash';

const cache = new Map<string, THREE.MeshStandardMaterial>();
function material(color: number, roughness: number) {
  const key = `${color}:${roughness}`;
  if (!cache.has(key)) cache.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
  return cache.get(key)!;
}
function cloth(color: number, roughness: number) { return clothMaterial(material(color, roughness)); }

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
  private connectedJersey: ConnectedJersey;
  private connectedTrousers: ConnectedTrousers;
  private sleeves: BendingLimb[] = [];
  private trouserLegs: BendingLimb[] = [];
  private limbStart = new THREE.Vector3();
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

  /** Every mesh that wears a kit colour, and what it is wearing it as. */
  private dressable: THREE.Mesh[] = [];
  private palette: { role: DressRole; mat: THREE.Material }[] = [];

  constructor(kit: Kit = KIT) {
    const skin = material(kit.skin, .86);
    const shirt = cloth(kit.shirt, .82);
    const trousers = cloth(kit.trousers, .8);
    const trim = material(kit.trim, .78);
    const shoe = material(kit.shoe, .7);
    const sole = material(0x3d4046, .85);
    const flash = material(kit.shirt, .7);
    // Recorded before the first mesh is made, because `mesh` reads it to label
    // what it builds. The sole is not here: it is the same dark rubber whatever
    // the kit, so nothing should ever repaint it.
    this.palette = [
      { role: 'skin', mat: skin }, { role: 'shirt', mat: shirt }, { role: 'trousers', mat: trousers },
      { role: 'trim', mat: trim }, { role: 'shoe', mat: shoe }, { role: 'flash', mat: flash },
    ];
    this.root.name = 'Articulated cricketer';
    this.root.add(this.hips, this.torso, this.head);

    // Match the batter's jersey, preserving the existing animation anchors.
    this.mesh(this.torso, trim, [1, 1, .93], 'collar').position.y = .154;
    this.mesh(this.torso, trim, [.024, .06, .008], 'detail').position.set(0, .105, .123);
    this.mesh(this.torso, skin, [.115, .17, .115], 'tube').position.y = .205;
    // Club badge and a sewn back number, baked into the collar's trim mesh.
    this.mesh(this.torso, trim, [.035, .043, .008], 'detail').position.set(-.087, .015, .134);
    for (const x of [-.055, .055]) this.mesh(this.torso, trim, [.028, .125, .008], 'detail').position.set(x, -.04, -.143);

    // Rounded face and jaw follow the batter, with a fielding cap.
    this.mesh(this.head, skin, [.139, .17, .14], 'ball').position.y = -.015;
    this.mesh(this.head, skin, [.069, .08, .058], 'ball').position.set(0, -.09, .075);
    for (const x of [-.127, .127]) this.mesh(this.head, skin, [.024, .044, .034], 'ball').position.set(x, -.005, -.012);
    this.mesh(this.head, skin, [.023, .037, .036], 'ball').position.set(0, -.033, .126);
    const cap = material(kit.cap, .74);
    this.palette.push({ role: 'cap', mat: cap });
    this.mesh(this.head, cap, [.144, .128, .152], 'ball').position.set(0, .050, -.004);
    // The peak: a flattened lobe out over the brow, its back half buried in the
    // dome. A band round a sphere would ring the whole head like a crest.
    const peak = this.mesh(this.head, cap, [.152, .030, .150], 'ball');
    peak.position.set(0, .046, .072); peak.rotation.x = -.18;
    this.mesh(this.head, cap, [.019, .014, .019], 'ball').position.set(0, .175, -.004);
    this.mesh(this.head, trim, [.032, .033, .009], 'detail').position.set(0, .101, .135);

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
      this.mesh(foot, shoe, [.15, .10, .26], 'soft').position.z = .042;
      this.mesh(foot, shoe, [.071, .047, .07], 'ball').position.set(0, -.012, .143);
      this.mesh(foot, sole, [.154, .026, .28], 'soft').position.set(0, -.052, .052);
      this.mesh(foot, flash, [.153, .018, .07], 'soft').position.set(0, .027, .02);
      for (const z of [.07, .10, .13]) this.mesh(foot, shoe, [.066, .008, .01], 'detail').position.set(0, .053, z);
      this.legs.push({
        upper: this.mesh(this.root, trousers, [1, 1, 1], 'limb'),
        lower: this.mesh(this.root, trousers, [1, 1, 1], 'limb'),
        joint: this.mesh(this.root, trousers, [KNEE, KNEE, KNEE], 'ball'),
        cap: this.mesh(this.root, trousers, [.121, .118, .121], 'ball'),
        end: foot,
      });
    }
    for (const group of [this.torso, this.hips, this.head, ...this.hands, ...this.legs.map(l => l.end)]) {
      const merged = compactRigidParts(group);
      this.dressable = this.dressable.filter(mesh => mesh.parent !== null);
      this.dressable.push(...merged.filter(mesh => mesh.userData.role));
    }
    for (let i = 0; i < 2; i++) {
      for (const control of [this.arms[i].upper, this.arms[i].lower, this.arms[i].joint, this.arms[i].cap,
        this.legs[i].upper, this.legs[i].lower, this.legs[i].joint, this.legs[i].cap]) control.visible = false;
      this.sleeves.push(new BendingLimb([shirt, skin], [.087, .061, .045], 24));
      const trouser = new BendingLimb(trousers, [.109, .072, .057], 16, true);
      this.trouserLegs.push(trouser);
    }
    this.connectedJersey = new ConnectedJersey([shirt, skin], true);
    this.connectedTrousers = new ConnectedTrousers(trousers);
    this.connectedTrousers.mesh.userData.role = 'trousers'; this.dressable.push(this.connectedTrousers.mesh);
    this.root.add(this.connectedJersey.mesh, this.connectedTrousers.mesh);
    this.pose = this.stand();
    this.apply(this.pose);
  }

  /**
   * Every piece of the figure is made here, which is what makes `dress` possible:
   * the role a material was playing is recorded on the mesh as it is built, so a
   * later change of kit can find every shirt panel without a list of them having
   * to be kept by hand and kept in step.
   */
  private mesh(parent: THREE.Object3D, mat: THREE.Material, scale: Point, shape: keyof typeof SHAPES = 'soft') {
    const mesh = new THREE.Mesh(SHAPES[shape], mat);
    const role = this.palette.find(entry => entry.mat === mat)?.role;
    if (role) { mesh.userData.role = role; this.dressable.push(mesh); }
    mesh.scale.set(...scale); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }

  /**
   * Put the figure in a different kit.
   *
   * Survive is played in whites, and the alternative to this was building a
   * second batter and a second bowler — or tearing down a scene that holds a
   * stadium and fourteen hundred instanced seats — every time somebody changed
   * their mind on the mode screen. Materials are cached by colour, so two
   * figures in the same kit still share one material each and this costs a
   * handful of assignments.
   */
  dress(kit: Kit) {
    const swatch: Record<DressRole, THREE.Material> = {
      skin: material(kit.skin, .86), shirt: cloth(kit.shirt, .82), trousers: cloth(kit.trousers, .8),
      trim: material(kit.trim, .78), shoe: material(kit.shoe, .7), cap: material(kit.cap, .74),
      flash: material(kit.shirt, .7),
    };
    for (const mesh of this.dressable) {
      const role = mesh.userData.role as DressRole | undefined;
      if (role) mesh.material = swatch[role];
    }
    this.connectedJersey.mesh.material = [swatch.shirt, swatch.skin];
  }

  /**
   * A man simply standing: feet under his hips, legs all but straight, arms
   * hanging. This is what waiting looks like — a bowler at the top of his mark,
   * or anyone stood still — and the knees are the whole of it. A leg carrying
   * weight at 86% of its length is a crouch, and a figure that crouches while
   * doing nothing reads as braced for something that never comes.
   */
  rest(): Figure { return restPose(this.root); }

  /**
   * A fielder waiting on the ball, which is not the same thing as standing: he
   * is watching a batter about to hit it, so the stance widens and the knees
   * soften ready to move. It is the resting pose bent, rather than a second
   * pose written out beside it — the difference between the two is the crouch
   * and nothing else.
   */
  stand(): Figure { return standPose(this.root); }

  /**
   * Taking a catch: from the waiting crouch to both hands up over the head,
   * eyes on the ball. `reach` runs 0 to 1.
   */
  catchAt(reach: number) {
    const r = THREE.MathUtils.clamp(reach, 0, 1);
    // He comes up out of the ready crouch to take it, so the pose is built from
    // the crouch rather than from a set of numbers of its own: the rise has to
    // be measured against where the knees actually were, or a trailing leg
    // pushed back off a hip that has already lifted runs out of length.
    const pose = this.stand();
    const hipY = pose.hip.y + r * .045;
    pose.hip.y = hipY;
    pose.chest.set(0, hipY + SPINE, .015 - r * .05);
    pose.leftFoot.y += r * .02;
    pose.rightFoot.z -= r * .05;
    for (const [hand, side] of [[pose.leftHand, -1], [pose.rightHand, 1]] as const)
      hand.set(side * .15, THREE.MathUtils.lerp(hipY - .045, hipY + 1.03, r), THREE.MathUtils.lerp(.115, .16, r));
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
      // A runner's elbows drive back past the ribs rather than flaring out:
      // with the outward pole a pumping arm rolls its forearm across his body.
      const back = THREE.MathUtils.clamp(pose.elbowsBack ?? 0, 0, 1);
      const hint = up.clone().negate().addScaledVector(right, side * .55 * (1 - back)).addScaledVector(forward, -1.6 * back);
      hint.addScaledVector(along, -hint.dot(along));
      if (hint.lengthSq() < .0001) hint.copy(right).multiplyScalar(side);
      hint.normalize();
      const elbow = solveJoint(shoulder, hand, BUILD.upperArm, BUILD.foreArm, shoulder.clone().addScaledVector(hint, .5));
      segment(arm.upper, shoulder, elbow, ARM_UPPER, ARM_UPPER * 1.04);
      segment(arm.lower, elbow, hand, ARM_LOWER, ARM_LOWER * 1.04);
      arm.joint.position.copy(elbow);
      arm.cap.position.copy(shoulder);
      this.sleeves[i].update(shoulder, elbow, hand, this.connectedJersey.reference(i, this.torso));
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
      this.limbStart.copy(hipJoint).lerp(hip, .5).addScaledVector(up, .065);
      this.trouserLegs[i].update(this.limbStart, knee, foot, this.connectedTrousers.reference(i, this.hips));
      leg.end.position.copy(foot);
      // The foot points along the shin's own fall, so a lifted leg shows a
      // pointed toe and a planted one sits flat.
      const shin = foot.clone().sub(knee);
      const pitch = shin.lengthSq() > .000001 ? Math.asin(THREE.MathUtils.clamp(-shin.clone().normalize().dot(forward), -1, 1)) : 0;
      leg.end.quaternion.setFromAxisAngle(UP, pose.yaw);
      const lifted = THREE.MathUtils.smoothstep(foot.y, .065, .20);
      leg.end.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.clamp(pitch, -.9, .9) * lifted));
    }
    this.connectedJersey.update(this.torso, this.sleeves);
    this.connectedTrousers.update(this.hips, this.trouserLegs, this.torso);
  }

  /** The pose last applied, for handing a figure from one kind of control to another. */
  get posed(): Figure { return this.pose; }

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
 * The two standing poses, out here so a pose can be built without a figure to
 * hang it on: the fielders' planner works out where a man will be a second from
 * now, and building a whole set of meshes to ask that would be absurd. `root` is
 * only carried along — nothing in a pose reads it.
 */
export function restPose(root: THREE.Group): Figure {
  return {
    root,
    hip: new THREE.Vector3(0, REST_HIP, 0), chest: new THREE.Vector3(0, REST_HIP + SPINE, .012),
    yaw: 0, lean: 0,
    leftFoot: new THREE.Vector3(-.115, .05, .025), rightFoot: new THREE.Vector3(.115, .05, -.025),
    leftHand: new THREE.Vector3(-.205, REST_HIP - .055, .06), rightHand: new THREE.Vector3(.205, REST_HIP - .055, .06),
    headYaw: 0, headPitch: .03,
  };
}

export function standPose(root: THREE.Group): Figure {
  const pose = restPose(root);
  const crouch = .052;
  pose.hip.y -= crouch;
  pose.chest.set(0, pose.hip.y + SPINE, .015);
  pose.leftFoot.set(-.185, .05, .06);
  pose.rightFoot.set(.185, .05, -.06);
  pose.leftHand.set(-.245, pose.hip.y - .045, .115);
  pose.rightHand.set(.245, pose.hip.y - .045, .115);
  pose.headPitch = .04;
  return pose;
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
