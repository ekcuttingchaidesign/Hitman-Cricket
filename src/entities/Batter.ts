import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ADVANCE, CUT, GAME } from '../config/gameplay';
import { solveJoint } from './rig';
import { bladeGeometry, gripGeometry } from './batGeometry';
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
  /** Chin down. Only the fall uses it, and without it a beaten man stares straight ahead. */
  headDown?: number;
  heel: number;
  backFootYaw?: number;
  leadElbow: number;
  /** Shoulder-led drives: elevation of the upper-arm bend plane, not bat roll. */
  armHinge?: number;
  armDrive?: number;
  shoulderLift?: number;
}
const V = (p: Point) => new THREE.Vector3(...p);
const UP = new THREE.Vector3(0, 1, 0);
// The top hand exits diagonally toward the handle butt. Two perpendicular
// wrist sockets made the stacked hands read as a rowing/paddle grip.
const wristSocket = (hand: number) => new THREE.Vector3(0,hand===0?.040:.018,hand===0?-.065:-.072);
const ease = (t: number) => t * t * (3 - 2 * t);
export const STROKE_CONTACT_MS = 110;
export const PULL_LOAD_MS = 120;
export const PULL_CONTACT_MS = 230;
export const STROKE_DURATION_MS = 940;
export const CHARGE_CONTACT_MS = 440;
export const CHARGE_DURATION_MS = 1320;

// A right-handed guard: left shoulder and left foot lead toward the bowler.
// The bat has one transform. Both fists are attached to its handle; the arms
// solve back from those grip anchors, so neither hand can leave the bat.
// The waiting stance is the raised pick-up: knees flexed, hands up off the front
// hip, and the bat cocked back over the shoulder so the toe points at first slip
// above the hands. The original pose orientations below are retained as motion
// guides so the approved blade path stays unchanged; apply() corrects the
// rendered face to face-down at pickup and flat-face-forward at drive contact.
const GUARD: Pose = {
  hip: [-0.05, 0.94, -0.03], chest: [0.02, 1.28, 0.03],
  frontFoot: [-0.10, 0.08, 0.27], backFoot: [-0.13, 0.08, -0.25],
  grip: [0.27, 0.90, 0.13], batUp: [-0.43, -0.67, 0.61], batFace: [0.30, 0.82, 0.35],
  yaw: 1.28, face: 0, heel: 0, leadElbow: -.34,
};
/**
 * Going down.
 *
 * Three shapes rather than one, because a man does not arrive on the floor — he
 * is hit, he folds, and then he ends up sitting there. `RECOIL` is the jolt off
 * the body with the weight still on his feet; `BUCKLED` is the knees giving and
 * the chest coming over; `FELLED` is what is left, down on the turf with his
 * knees drawn up and the bat still in his hands because nobody thinks to let go.
 *
 * The leg solve bends the knee towards a pole out on the off side, so a seated
 * pose reads best with the feet drawn back in rather than stretched out in
 * front: the knees splay up and outward, which is how somebody actually sits
 * down in pads.
 */
const RECOIL: Pose = {
  ...GUARD,
  hip: [-.06, .90, -.09], chest: [.01, 1.23, -.06],
  frontFoot: [-.11, .08, .26], backFoot: [-.14, .08, -.27],
  grip: [.24, .84, .06], batUp: [-.46, -.55, .70], batFace: [.26, .86, .28],
  face: .18, headDown: .16, heel: .10, leadElbow: -.18,
};
const BUCKLED: Pose = {
  ...GUARD,
  // The knees have gone and he is doubled over them, weight still going
  // forward. This is the frame between being hit and being down.
  hip: [-.04, .56, -.12], chest: [.02, .95, .12],
  frontFoot: [-.16, .08, .26], backFoot: [-.04, .08, -.12],
  grip: [.26, .56, .34], batUp: [-.20, .46, .86], batFace: [.84, .26, .48],
  face: .15, headDown: .34, heel: .15, leadElbow: -.05,
};
const FELLED: Pose = {
  ...GUARD,
  // Down on the turf with his legs out in front of him, one straighter than the
  // other, propped back on his hands with the bat let go across his shins and
  // his chin on his chest. The legs are what the shape is read from at this
  // camera: knees drawn up under him read as kneeling, and he is not kneeling.
  hip: [-.02, .25, -.22], chest: [.01, .60, -.30],
  frontFoot: [-.20, .09, .58], backFoot: [.12, .09, .40],
  grip: [.30, .15, .30], batUp: [.86, .12, .49], batFace: [-.12, .96, .24],
  face: .12, headDown: .44, heel: 0, leadElbow: .22,
};
/** How long each stage of going down lasts, cumulative from the blow. */
const FALL = { recoil: 130, buckle: 430, settled: 1260 } as const;


const BACKLIFT: Pose = {
  ...GUARD, grip: [0.28, 0.96, 0.11], batUp: [-0.39, -0.73, 0.56], batFace: [0.28, 0.86, 0.30],
  chest: [0.01, 1.29, 0.01], leadElbow: -.24,
};

/**
 * `recover` is the way back to the guard, for a stroke whose follow-through
 * ends somewhere the bat cannot travel home from in a straight line. Blending a
 * wrapped finish directly into the pick-up sweeps the blade through the head
 * and then the chest, because the two poses hold the bat on opposite sides of
 * the body and the shortest path between them goes through him. A stroke that
 * needs one names the shape the bat comes down through on its way back.
 */
interface Stroke { contact: Pose; finish: Pose; through?: Pose; recover?: Pose }
/**
 * The square cut, off the back foot. He rocks back and across so his weight is
 * over the back leg and his head is outside the line of the ball, frees his arms
 * at it, and strikes it square with a horizontal bat and the face turned behind
 * point. Then the arc keeps going: the wrists roll, the body unwinds on the back
 * foot, and the bat wraps up and over the front shoulder — which is where a cut
 * finishes, and what the off-side punch beside it deliberately does not do.
 *
 * The front shoulder is the left one, so the wrap crosses the chest. Both hands
 * stay in front of it: a two-handed grip cannot be taken round the back, and the
 * finish is high beside the head rather than behind it.
 */
const CUT_STROKE: Stroke = {
  contact: { ...GUARD, hip: [-.13, .74, -.20], chest: [.01, 1.04, -.02],
    frontFoot: [-.17, .08, .15], backFoot: [-.01, .08, -.42],
    grip: [.34, .86, .22], batUp: [-.93, .22, -.29], batFace: [.55, .10, -.83],
    yaw: 1.46, face: .54, heel: .04, leadElbow: .05 },
  // The hands finish high and in front of the chest with the blade wrapped up
  // over the front shoulder. Carrying the hands themselves round to that
  // shoulder is where the swing wants to take them, and it is a place a
  // two-handed grip cannot go: the arms end up across the back of the neck.
  finish: { ...GUARD, hip: [-.06, .87, -.24], chest: [.05, 1.26, -.14],
    frontFoot: [-.17, .08, .15], backFoot: [-.01, .08, -.42],
    grip: [.07, 1.35, .29], batUp: [.56, -.62, .55], batFace: [.74, .40, -.54],
    yaw: .35, face: .30, heel: .20, leadElbow: -.15 },
  // Forward off the shoulder, out in front of him, and only then down into the
  // pick-up. The finish holds the bat behind his front shoulder and the guard
  // holds it behind his back one, so every short path between the two goes
  // through his head or his chest. Swinging the blade out to where he can see
  // it first is both what a batter does with a bat he has just wrapped round
  // his neck, and the one route home that touches neither.
  recover: { ...GUARD, hip: [-.09, .90, -.16], chest: [.03, 1.24, -.07],
    frontFoot: [-.15, .08, .18], backFoot: [-.05, .08, -.38],
    grip: [.30, 1.14, .34], batUp: [-.15, -.80, -.58], batFace: [.86, -.22, .17],
    yaw: .86, face: .34, heel: .10, leadElbow: -.20 },
};
/**
 * The same stroke to a ball at the chest. Short and wide is the cut's own ball:
 * he stands up out of the crouch rather than reaching down, and cuts it square
 * from higher up — the difference between a cut off a length and one off a
 * bouncer is where he stands, not what he does.
 */
const CUT_HIGH: Stroke = {
  contact: { ...CUT_STROKE.contact, hip: [-.15, .90, -.20], chest: [-.06, 1.25, -.05],
    batUp: [-.86, .42, -.28], yaw: 1.42, heel: .06, leadElbow: -.06 },
  finish: { ...CUT_STROKE.finish, hip: [-.05, .92, -.23], chest: [.05, 1.31, -.13],
    grip: [.08, 1.43, .31], yaw: .32, heel: .22 },
  recover: CUT_STROKE.recover,
};
/**
 * How wide the cut reaches. It has to cover the off stump, because it is the
 * off side's square stroke and a ball there is cuttable off a length — but it
 * never comes back inside that: swung at one on middle or down the leg side the
 * bat goes square of the stumps anyway and the ball passes it, which is what
 * cutting at a straight one deserves.
 */
const CUT_REACH: readonly [number, number] = [.11, .62];
const STROKES: Record<ShotType, Stroke> = {
  STRAIGHT: {
    contact: { ...GUARD, hip: [-0.05, .83, .14], chest: [.12, 1.17, .23], frontFoot: [.02, .08, .63],
      grip: [.34, .98, .36], batUp: [.035, .985, -.17], batFace: [0, .12, 1], yaw: 1.08, face: 0, heel: .07, leadElbow: .13,
      armHinge: .85, armDrive: 1, shoulderLift: 0 },
    through: { ...GUARD, hip: [-.04,.84,.17], chest: [.10,1.18,.30], frontFoot: [.02,.08,.63],
      grip: [.30,1.32,.77], batUp: [0,.70,-.714], batFace: [0,.714,.70], yaw: .92, face: 0, heel: .15, leadElbow: .15,
      armHinge: .90, armDrive: 1, shoulderLift: .05 },
    // Continue beyond the upright presentation: hands above the helmet and
    // blade carried forward/up into the high finish in IMG_4057.
    finish: { ...GUARD, hip: [-.02,.85,.19], chest: [.10,1.20,.32], frontFoot: [.02,.08,.63],
      grip: [.34,1.62,.64], batUp: [0,.22,-.975], batFace: [0,.975,.22], yaw: .92, face: 0, heel: .18, leadElbow: .40,
      armHinge: 1.65, armDrive: 1, shoulderLift: .08 },
    recover: { ...GUARD, grip: [.38,1.12,.43], batUp: [-.15,-.80,-.58], batFace: [.86,-.22,.17], yaw: 1.10 },
  },
  LONG_ON: {
    // The handle leans off the body rather than across it. Leant the other way,
    // the hands come down beside his own chest and the blade swings up through
    // it: the bat turns end over end about the grip on its way to the finish,
    // and a grip against the trunk gives that half-circle nowhere to go but
    // through him.
    contact: { ...GUARD, hip: [-.16, .82, .13], chest: [-.035, 1.16, .21], frontFoot: [-.34, .08, .58],
      grip: [.15, .98, .35], batUp: [.10, .975, -.14], batFace: [-.42, .10, .90], yaw: 1.04, face: -.25, heel: .08, leadElbow: .10 },
    finish: { ...GUARD, hip: [-.19, .9, .20], chest: [-.17, 1.28, .29], frontFoot: [-.34, .08, .58],
      grip: [-.28, 1.54, .70], batUp: [.49, -.61, -.62], batFace: [-.42, .10, .90], yaw: .33, face: -.38, heel: .15 },
    // High over the leg-side shoulder is the far side of him from the guard, so
    // the bat comes home across the front where he can see it, and the front
    // foot comes back under him on the way.
    recover: { ...GUARD, hip: [-.14, .90, .10], chest: [-.03, 1.25, .16], frontFoot: [-.26, .08, .44],
      grip: [.22, 1.10, .42], batUp: [-.15, -.80, -.58], batFace: [.86, -.22, .17],
      yaw: .80, face: -.20, heel: .10, leadElbow: -.18 },
  },
  COVER_LONG_OFF: {
    contact: { ...GUARD, hip: [.05, .81, .13], chest: [.19, 1.15, .22], frontFoot: [.10, .08, .60],
      grip: [.50, .98, .35], batUp: [.34, .93, -.14], batFace: [.42, .10, .90], yaw: 1.42, face: .28, heel: .07, leadElbow: .12,
      armHinge: .85, armDrive: 1, shoulderLift: 0 },
    through: { ...GUARD, hip: [.06,.79,.16], chest: [.22,1.13,.28], frontFoot: [.10,.08,.60],
      grip: [.48,1.32,.75], batUp: [-.18,.975,-.10], batFace: [.42,.1,.90], yaw: 1.05, face: .28, heel: .16, leadElbow: .15,
      armHinge: .90, armDrive: 1, shoulderLift: .05 },
    finish: { ...GUARD, hip: [.08,.80,.20], chest: [.22,1.16,.30], frontFoot: [.10,.08,.60],
      grip: [.47,1.60,.60], batUp: [-.86,.22,-.46], batFace: [.05,.93,.35], yaw: .95, face: .30, heel: .20, leadElbow: .40,
      armHinge: 1.65, armDrive: 1, shoulderLift: .08 },
    recover: { ...GUARD, grip: [.38,1.10,.40], batUp: [-.15,-.80,-.58], batFace: [.86,-.22,.17], yaw: 1.16 },
  },
  LEG: {
    // Front-foot flick: open the front foot and roll the wrists to the leg side.
    // The bat comes down in front of him first. Swung straight from the pick-up
    // to the ball it takes the short way round, and the short way round at hip
    // height is through his hip.
    // The handle is laid further back so the blade meets the ball out in front
    // of him. Stood more upright the bat comes down round the side instead, and
    // at hip height the side of him is where his hip is.
    contact: { ...GUARD, hip: [-.16, .82, .09], chest: [.05, 1.17, .16], frontFoot: [-.38, .08, .48],
      grip: [.30, .94, .35], batUp: [.25, .88, -.40], batFace: [-.80, .12, .59], yaw: .82, face: -.5, heel: .05 },
    finish: { ...GUARD, hip: [-.20, .87, .13], chest: [-.17, 1.25, .20], frontFoot: [-.38, .08, .48],
      grip: [-.46, 1.18, .52], batUp: [.60, -.30, -.74], batFace: [-.80, .12, .59], yaw: -.15, face: -.75, heel: .10 },
  },
  DEFEND: {
    // The forward defensive: a short stride down the line, the head over the
    // ball, and the bat vertical and angled forward so the face closes down over
    // it. The hands stay in under the eyes and the blade drops in beside the
    // front pad — the whole point is that nothing goes anywhere.
    contact: { ...GUARD, hip: [-.06, .86, .10], chest: [.10, 1.20, .18], frontFoot: [.00, .08, .52],
      grip: [.37, .97, .41], batUp: [.03, .97, .24], batFace: [0, -.22, .97], yaw: 1.14, face: 0, heel: .04, leadElbow: .16 },
    // Soft hands: the bat gives with the ball rather than following through.
    finish: { ...GUARD, hip: [-.06, .87, .09], chest: [.09, 1.21, .16], frontFoot: [.00, .08, .52],
      grip: [.34, .97, .34], batUp: [.02, .98, .19], batFace: [0, -.20, .98], yaw: 1.16, face: 0, heel: .03, leadElbow: .14 },
  },
  SQUARE_CUT: CUT_STROKE,
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
  contact: { ...GUARD, hip: [-.13, .86, -.25], chest: [-.04, 1.20, -.32],
    frontFoot: [-.30, .08, .16], backFoot: [-.20, .08, -.36],
    grip: [-.30, 1.12, .02], batUp: [-.35, .12, -.93], batFace: [-.93, -.05, .35],
    yaw: .62, face: -.25, heel: .04, backFootYaw: 1.05, leadElbow: -.20 },
  // Extend through the ball before the elbows fold into the wrap. The head
  // stays over the loaded back leg rather than lunging after the hands.
  through: { ...GUARD, hip: [-.17, .88, -.22], chest: [-.12, 1.24, -.15],
    frontFoot: [-.30, .08, .16], backFoot: [-.20, .08, -.36],
    grip: [-.32, 1.19, .33], batUp: [.98, .08, -.18], batFace: [-.18, -.05, -.98],
    yaw: .05, face: -.65, heel: .08, backFootYaw: .55, leadElbow: -.12 },
  // Mirrored from the supplied left-handed demonstration: the hands fold beside
  // the left shoulder and the blade settles behind it, clear of the helmet.
  finish: { ...GUARD, hip: [-.17, .90, -.10], chest: [-.16, 1.26, .00],
    frontFoot: [-.30, .08, .16], backFoot: [-.20, .08, -.36],
    grip: [-.40, 1.48, .28], batUp: [.14, .10, .985], batFace: [.985, 0, -.14],
    yaw: -.38, face: -.80, heel: .10, backFootYaw: .25, leadElbow: -.10 },
  recover: { ...GUARD, grip: [.36, 1.10, .40], batUp: [-.15, -.80, -.58],
    batFace: [.86, -.22, .17], yaw: .70, heel: .04 },
};
const PULL_REACH: readonly [number, number] = [-.55, .32];
// Reference charge: gather and advance before impact, plant the lead foot,
// extend up the line, then fold the blade over the left shoulder.
const CHARGE: Stroke = {
  contact: { ...GUARD, hip: [-.06, .80, .16], chest: [.10, 1.16, .25], frontFoot: [.04, .08, .63], backFoot: [-.20, .08, -.26],
    grip: [.34, .98, .30], batUp: [.10, .98, -.14], batFace: [0, .16, .99], yaw: 1.02, face: 0, heel: .34, leadElbow: .18,
    armHinge: .85, armDrive: 1, shoulderLift: 0 },
  // Brace the front leg and rise onto the back toe; do not kick the lead leg
  // behind the body at the instant the bat finishes. The high hands extend
  // down the target line rather than folding the blade back into the torso.
  through: { ...GUARD, hip: [-.04, .85, .21], chest: [.06, 1.22, .36], frontFoot: [.04, .08, .63], backFoot: [-.20, .08, -.26],
    grip: [.16,1.46,.96], batUp: [-.10,-.58,-.81], batFace: [0,.82,-.58], yaw: .30, face: 0, heel: .24, leadElbow: .12,
    armHinge: .65, armDrive: 1, shoulderLift: .07 },
  finish: { ...GUARD, hip: [-.04, .85, .22], chest: [.04, 1.20, .35], frontFoot: [.04, .08, .63], backFoot: [-.20, .08, -.26],
    grip: [-.03,1.58,.68], batUp: [.10,-.94,.32], batFace: [0,-.32,-.94], yaw: .30, face: 0, heel: .24, backFootYaw: .80, leadElbow: .22,
    armHinge: 1.55, armDrive: 1, shoulderLift: .08 },
  recover: { ...GUARD, hip: [-.04, .88, .10], chest: [.04, 1.24, .15], frontFoot: [.00, .08, .44],
    grip: [.38, 1.10, .43], batUp: [-.15, -.80, -.58], batFace: [.86, -.22, .17], yaw: .8, heel: .10 },
};

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
    headDown: THREE.MathUtils.lerp(a.headDown ?? 0, b.headDown ?? 0, t),
    backFootYaw: THREE.MathUtils.lerp(a.backFootYaw ?? 1.38, b.backFootYaw ?? 1.38, t),
    leadElbow: THREE.MathUtils.lerp(a.leadElbow, b.leadElbow, t),
    armHinge: THREE.MathUtils.lerp(a.armHinge ?? -.6,b.armHinge ?? -.6,t),
    armDrive: THREE.MathUtils.lerp(a.armDrive ?? 0,b.armDrive ?? 0,t),
    shoulderLift: THREE.MathUtils.lerp(a.shoulderLift ?? 0,b.shoulderLift ?? 0,t),
  };
}

/** Time-aware cubic interpolation: contact/extension are pass-through keys,
 * not ease-in/ease-out stops. Quaternion components share the same tangents
 * and hemisphere, then normalize, avoiding an axis flip at a key boundary.
 * End tangents are zero only at the start and the final shoulder rest. */
function flowing(keys: readonly { time: number; pose: Pose }[], age: number, horizontalSweep = false): Pose {
  if (age >= keys[keys.length - 1].time) return keys[keys.length - 1].pose;
  const i = Math.max(0, keys.findIndex(k => k.time > age) - 1);
  const a = keys[i], b = keys[i + 1], dt = b.time - a.time;
  const t = THREE.MathUtils.clamp((age - a.time) / dt, 0, 1);
  const sample = (values: number[]) => {
    const slope = (n: number) => n === 0 || n === keys.length - 1 ? 0
      : (values[n + 1] - values[n - 1]) / (keys[n + 1].time - keys[n - 1].time);
    return (2*t*t*t - 3*t*t + 1)*values[i] + (t*t*t - 2*t*t + t)*dt*slope(i)
      + (-2*t*t*t + 3*t*t)*values[i+1] + (t*t*t - t*t)*dt*slope(i+1);
  };
  const pose = mix(a.pose, b.pose, t);
  for (const key of ['hip', 'chest', 'frontFoot', 'backFoot', 'grip'] as const)
    pose[key] = [0, 1, 2].map(axis => sample(keys.map(k => k.pose[key][axis]))) as unknown as Point;
  for (const key of ['yaw', 'face', 'heel', 'leadElbow'] as const) pose[key] = sample(keys.map(k => k.pose[key]));
  pose.backFootYaw = sample(keys.map(k => k.pose.backFootYaw ?? 1.38));
  for (const key of ['armHinge','armDrive','shoulderLift'] as const)
    pose[key] = sample(keys.map(k=>k.pose[key] ?? (key==='armHinge'?-.6:0)));
  const rotations = keys.map(k => batOrientation(k.pose).clone());
  for (let n = 1; n < rotations.length; n++) if (rotations[n-1].dot(rotations[n]) < 0)
    rotations[n].set(...rotations[n].toArray().map(v => -v) as [number, number, number, number]);
  pose.bat = new THREE.Quaternion(...[0,1,2,3].map(axis => sample(rotations.map(q => q.toArray()[axis]))) as [number, number, number, number]).normalize();
  pose.batUp = new THREE.Vector3(0,1,0).applyQuaternion(pose.bat).toArray() as unknown as Point;
  pose.batFace = new THREE.Vector3(0,0,1).applyQuaternion(pose.bat).toArray() as unknown as Point;
  if (horizontalSweep) {
    // A pull travels around the torso, not over/under it. Interpolating full
    // orientations can take a shorter route via a vertical dip of the blade.
    const azimuths = keys.map(k => Math.atan2(k.pose.batUp[0], k.pose.batUp[2]));
    for (let n=1;n<azimuths.length;n++) while (azimuths[n]>azimuths[n-1]) azimuths[n]-=2*Math.PI;
    const azimuth = sample(azimuths);
    const elevation = sample(keys.map(k => Math.asin(V(k.pose.batUp).normalize().y)));
    pose.batUp = [Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation),Math.cos(azimuth)*Math.cos(elevation)];
    const rolls = keys.map((k,n) => {
      const axis = V(k.pose.batUp).normalize();
      const tangent = new THREE.Vector3(Math.cos(azimuths[n]),0,-Math.sin(azimuths[n]));
      const face = new THREE.Vector3(0,0,1).applyQuaternion(batOrientation(k.pose));
      return Math.atan2(axis.dot(tangent.clone().cross(face)),tangent.dot(face));
    });
    pose.batFace = new THREE.Vector3(Math.cos(azimuth),0,-Math.sin(azimuth)).applyAxisAngle(V(pose.batUp),sample(rolls)).toArray() as unknown as Point;
    delete pose.bat; pose.bat=batOrientation(pose);
  }
  return pose;
}

/** Drive hands orbit the shoulder girdle. Bat pitch is a separate, restrained
 * wrist articulation: a vertical-bat drive must not become a wrist windmill. */
function shoulderDriven(keys: readonly {time: number; pose: Pose}[], age: number, impact: number): Pose {
  const centre = (p: Pose) => V(p.chest).addScaledVector(V(p.chest).sub(V(p.hip)).normalize(),.075+(p.shoulderLift??0));
  const encoded = keys.map(k=>{
    const offset=V(k.pose.grip).sub(centre(k.pose));
    return {time:k.time,pose:{...k.pose,grip:[offset.x,Math.hypot(offset.y,offset.z),Math.atan2(offset.y,offset.z)] as Point}};
  });
  const pose=flowing(keys,age), arc=flowing(encoded,age).grip;
  const orbit=centre(pose).add(new THREE.Vector3(arc[0],Math.sin(arc[2])*arc[1],Math.cos(arc[2])*arc[1]));
  pose.grip=V(pose.grip).lerp(orbit,ease(THREE.MathUtils.clamp((age-impact)/70,0,1))).toArray() as unknown as Point;
  return pose;
}

export { solveJoint } from './rig';

export class Batter {
  private poseAge = 0;
  readonly root = new THREE.Group();
  readonly bat = new THREE.Group();
  private torso = new THREE.Group();
  private hips = new THREE.Group();
  private head = new THREE.Group();
  private arms: { upper: THREE.Mesh; lower: THREE.Mesh; elbow: THREE.Mesh; cap: THREE.Mesh; glove: THREE.Group; palm: THREE.Mesh[]; cuff: THREE.Group; shoulder: THREE.Vector3; wrist: THREE.Vector3; socket: THREE.Vector3 }[] = [];
  private legs: { thigh: THREE.Mesh; shin: THREE.Mesh; knee: THREE.Mesh; cap: THREE.Mesh; pad: THREE.Group; shoe: THREE.Group }[] = [];
  private pose: Pose = GUARD;
  private swingFrom: Pose = GUARD;
  private shot: ShotType = 'STRAIGHT';
  /** A leg-side swing at a ball up around the chest is a pull, not a flick. */
  private pulling = false;
  /** A cut at a ball up around the chest is played standing tall, not crouched. */
  private cutting = false;
  /** A charge down the pitch: the confidence shot. */
  private charging = false;
  private swingStart = -Infinity;
  /** When he went down, and the shape he was in when it happened. */
  private felledAt = -Infinity;
  private felledFrom: Pose = GUARD;
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
    // The helmet is its own material rather than the shirt's, because it is navy
    // in both innings: a cricketer's lid does not change colour when the rest of
    // the kit does, and in whites a cream one read as a bald head.
    helmet: new THREE.MeshStandardMaterial({ color: 0x18314a, roughness: .62 }),
    trousers: new THREE.MeshStandardMaterial({ color: 0xe7e2d3, roughness: .82 }),
    pad: new THREE.MeshStandardMaterial({ color: 0xfdfcf4, roughness: .72 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xb77950, roughness: .87 }),
    bat: new THREE.MeshStandardMaterial({ color: 0xe0b77a, roughness: .83 }),
    accent: new THREE.MeshStandardMaterial({ color: 0xed7044, roughness: .7 }),
    grille: new THREE.MeshStandardMaterial({ color: 0x8c9da0, metalness: .6, roughness: .4 }),
    handle: new THREE.MeshStandardMaterial({ color: 0x2a3238, roughness: .95 }),
  };
  /**
   * Whites, for the Test match, or back into coloured clothing.
   *
   * The batter owns his materials outright rather than sharing the cached ones
   * the other figures use, so this is three colours rather than a re-dress —
   * and it can be called at any time, which is what lets the mode screen change
   * its mind without the scene being torn down and rebuilt around it.
   */
  dress(whites: boolean) {
    this.palette.shirt.color.setHex(whites ? 0xf2ece0 : 0x19334a);
    this.palette.trousers.color.setHex(whites ? 0xf4f0e4 : 0xe7e2d3);
    this.palette.accent.color.setHex(whites ? 0xd9d3c3 : 0xed7044);
  }

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
    const helmet = this.mesh(this.head, this.palette.helmet, [.188, .175, .195], 'ball'); helmet.position.set(0, .045, -.018);
    this.mesh(this.head, this.palette.helmet, [.34, .045, .20], 'soft').position.set(0, .045, .135);
    for (const y of [-.055, -.115]) {
      const bar = this.mesh(this.head, this.palette.grille, [.016, .30, .016], 'tube');
      bar.rotation.z = Math.PI / 2; bar.position.set(0, y, .175);
    }
    for (const x of [-.14, .14]) this.mesh(this.head, this.palette.grille, [.016, .19, .016], 'tube').position.set(x, -.045, .175);
    // Bat: a dark bound handle standing clear of a plain blade.
    const rubber=new THREE.Mesh(gripGeometry(),new THREE.MeshStandardMaterial({color:0x777e80,roughness:.94}));
    rubber.castShadow=true; rubber.receiveShadow=true; this.bat.add(rubber);
    this.mesh(this.bat,this.palette.handle,[.046,.018,.046],'tube').position.y=-.117;
    this.mesh(this.bat, this.palette.bat, [1, 1, 1], 'blade');
    for (let i = 0; i < 2; i++) {
      // Fingers and thumb webs stay registered to the spine. Wrist pronation
      // articulates the palm connection, not the entire grip around the bat.
      const glove = new THREE.Group(); this.bat.add(glove);
      glove.position.set(0, i === 0 ? .075 : -.035, 0);
      const side=i===0?1:-1;
      const palm=Array.from({length:4},()=>this.mesh(glove,this.palette.pad,[1,1,1],'soft'));
      this.mesh(glove,this.palette.pad,[.075,.090,.033],'soft').position.z=-.043;
      // Four individually curled fingers encircle the rubber, leaving a real
      // handle channel. Both thumb/index webs sit on -Z, the back spine.
      for(let finger=0;finger<4;finger++) {
        const y=.033-finger*.023;
        const points=Array.from({length:12},(_,n)=>{
          const angle=.7+n/11*4.4;
          return new THREE.Vector3(side*Math.sin(angle)*.036,y,-Math.cos(angle)*.036);
        });
        const mesh=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),16,.010,8,false),this.palette.pad);
        mesh.castShadow=true; glove.add(mesh);
      }
      const web=new THREE.Vector3(0,-.008,-.070);
      const thumb=this.mesh(glove,this.palette.pad,[1,1,1],'soft');
      this.segment(thumb,web,new THREE.Vector3(-side*.026,.043,-.060),.025,.025);
      const index=this.mesh(glove,this.palette.pad,[1,1,1],'soft');
      this.segment(index,web,new THREE.Vector3(side*.035,.039,-.059),.023,.023);
      // The wrist is what turns: a gauntlet at the hand aimed back up the forearm.
      const cuff = new THREE.Group(); this.root.add(cuff);
      this.mesh(cuff, this.palette.pad, [.113, .105, .113], 'tube').position.y = .052;
      this.mesh(cuff, this.palette.accent, [.121, .026, .121], 'tube').position.y = .014;
      this.arms.push({ upper: this.mesh(this.root, this.palette.shirt, [1, 1, 1], 'tube'), lower: this.mesh(this.root, this.palette.skin, [1, 1, 1], 'tube'),
        elbow: this.mesh(this.root, this.palette.shirt, [.073, .073, .073], 'ball'), cap: this.mesh(this.root, this.palette.shirt, [.086, .083, .09], 'ball'),
        glove, palm, cuff, shoulder: new THREE.Vector3(), wrist: new THREE.Vector3(), socket:wristSocket(i) });
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
  /**
   * He has taken one too many and cannot go on.
   *
   * Played from wherever he happened to be standing rather than from the guard,
   * so the blow that finished him flows into the fall instead of the figure
   * snapping back to a stance first. Once this starts nothing else moves him:
   * `update` answers here and returns, so no stroke, no walk-back and no return
   * to the pick-up can stand him up again. Only `reset` does, and that is a new
   * innings.
   */
  fall(now: number) {
    this.felledFrom = this.pose;
    this.felledAt = now;
  }
  /** Whether he is on his way down or already there. */
  get felled() { return Number.isFinite(this.felledAt); }

  reset() {
    this.poseAge = Infinity;
    this.felledAt = -Infinity;
    this.swingStart = -Infinity; this.contactTime = -Infinity; this.anticipation = 0; this.pulling = false; this.cutting = false; this.charging = false;
    this.root.position.set(GAME.stanceX, 0, GAME.stanceZ); this.root.rotation.set(0, 0, 0);
    this.apply(GUARD);
  }
  prepare(progress: number) { this.anticipation = THREE.MathUtils.smoothstep(progress, .05, .72); }
  swing(shot: ShotType, now: number, finalBallX: number, ballY = .54, ballZ: number = GAME.contactZ, charging = false) {
    this.shot = shot; this.charging = charging; this.pulling = !charging && shot === 'LEG' && ballY > .85;
    this.cutting = !charging && shot === 'SQUARE_CUT' && ballY > CUT.highBallY;
    this.swingStart = now; this.contactTime = now + (charging ? CHARGE_CONTACT_MS : this.pulling ? PULL_CONTACT_MS : STROKE_CONTACT_MS);
    this.swingFrom = this.pose; this.ballX = finalBallX; this.ballZ = ballZ + (charging ? ADVANCE.stride : 0);
    // Only the two cross-bat strokes go up after a bouncer — the pull to the leg
    // side and the cut to the off. Every other stroke plays at its own height and
    // the ball passes over the bat, rather than the arms stretching to chase a
    // ball that stroke was never going to reach.
    this.ballY = this.pulling || this.cutting ? ballY : Math.min(ballY, .62);
  }
  get strikeAt() { return this.contactTime; }
  get contactZ() { return this.ballZ; }
  /** The reference's advance happens BEFORE impact, then the feet hold the
   * stroke. A separate presentation contact plane keeps the ball at the blade. */
  private downPitch(age: number) {
    if (!this.charging || !Number.isFinite(age) || age <= 0) return 0;
    // Every one of these ranges has to be clamped. `ease` is a cubic, not a
    // curve that flattens: fed a number past 1 it turns and runs away, and the
    // walk back read as reaching the crease and then sprinting at the bowler.
    const out = age <= CHARGE_CONTACT_MS ? ease(age / CHARGE_CONTACT_MS)
      : age <= CHARGE_DURATION_MS ? 1
      : 1 - ease(THREE.MathUtils.clamp((age - CHARGE_DURATION_MS) / ADVANCE.walkBackMs, 0, 1));
    return out * ADVANCE.stride;
  }
  private travel(age: number) {
    this.root.position.set(GAME.stanceX, 0, GAME.stanceZ + this.downPitch(age));
  }
  /** World-space foot plants with lifted travelling feet, not feet attached to
   * a translating root. The gathering step precedes the final front-foot plant. */
  private approach(pose: Pose, age: number): Pose {
    const step = (from: number, to: number, start: number, end: number) => {
      const t = THREE.MathUtils.clamp((age-start)/(end-start), 0, 1);
      return { z: THREE.MathUtils.lerp(from, to, ease(t)), lift: .12*Math.sin(Math.PI*t)**2 };
    };
    const front = age < 230 ? step(.27, 1.05, 0, 220) : step(1.05, ADVANCE.stride+.63, 230, 425);
    const back = age < 310 ? step(-.25, 1.15, 45, 300) : step(1.15, ADVANCE.stride-.26, 310, 420);
    const down = this.downPitch(age);
    return { ...pose, frontFoot: [pose.frontFoot[0], .08+front.lift, front.z-down],
      backFoot: [pose.backFoot[0], .08+back.lift, back.z-down] };
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
    if (Number.isFinite(this.felledAt)) return this.applyFall(now - this.felledAt);
    const age = now - this.swingStart;
    this.poseAge = age;
    this.travel(age);
    if (!Number.isFinite(age) || age >= (this.charging ? CHARGE_DURATION_MS : STROKE_DURATION_MS)) {
      const guard = mix(GUARD, BACKLIFT, Number.isFinite(age) ? 0 : this.anticipation);
      this.apply(this.charging ? this.walking(guard, this.downPitch(age)) : guard);
      return;
    }
    const stroke = this.charging ? CHARGE : this.pulling ? PULL : this.cutting ? CUT_HIGH : STROKES[this.shot];
    // Place the middle of the blade at the ball's contact plane, not merely
    // somewhere along the selected sector. Wrong shots stay in their own reach.
    const zones: Record<ShotType, readonly [number, number]> = {
      LEG: [-.55, -.05], LONG_ON: [-.55, .08], STRAIGHT: [-.17, .17],
      COVER_LONG_OFF: [-.08, .55],
      // The cut is played square and wide of the body.
      SQUARE_CUT: CUT_REACH,
      // Defence covers the stumps and a little either side, not the whole crease.
      DEFEND: [-.30, .30],
    };
    const targetX = THREE.MathUtils.clamp(this.ballX, ...(this.pulling ? PULL_REACH : zones[this.shot]));
    // The bat meets the ball where he stands at contact. Reading the live root
    // instead drags the hands backwards out of a charge as it carries him on.
    const planted = GAME.stanceZ + this.downPitch(this.charging ? CHARGE_CONTACT_MS : STROKE_CONTACT_MS);
    const contactGrip = new THREE.Vector3(targetX - this.root.position.x, this.ballY, this.ballZ - planted)
      .addScaledVector(V(stroke.contact.batUp).normalize(), .44);
    const step = targetX * .65;
    const shift = (p: Point, amount: number): Point => [p[0] + amount, p[1], p[2]];
    const reachPose = (p: Pose): Pose => ({ ...p, hip: shift(p.hip, step), chest: shift(p.chest, step),
      frontFoot: shift(p.frontFoot, step), backFoot: this.pulling || this.charging || this.shot==='STRAIGHT' || this.shot==='COVER_LONG_OFF' ? shift(p.backFoot, step) : p.backFoot,
      grip: shift(p.grip, step) });
    const contact = { ...reachPose(stroke.contact), grip: contactGrip.toArray() as unknown as Point };
    const finish = reachPose(stroke.finish);
    if (this.pulling || this.charging) {
      const impact = this.charging ? CHARGE_CONTACT_MS : PULL_CONTACT_MS;
      const end = this.charging ? 740 : 500;
      const hold = this.charging ? 980 : 570;
      const duration = this.charging ? CHARGE_DURATION_MS : STROKE_DURATION_MS;
      const through = reachPose(stroke.through!);
      if (age < end) {
        const keys = [{ time: 0, pose: this.swingFrom }];
        if (this.charging) keys.push({ time: 330, pose: { ...BACKLIFT, hip: [-.05,.82,.02], chest: [.03,1.18,.06],
          frontFoot: [-.10,.08,.20], backFoot: [-.13,.13,-.08], grip: [.28,1.13,.10], yaw:1.48 } });
        else keys.push({ time: PULL_LOAD_MS, pose: reachPose({ ...BACKLIFT,
          hip: [-.09,.86,-.20], chest: [0,1.20,-.15],
          frontFoot: [-.24,.08,.20], backFoot: [-.20,.08,-.36],
          grip: [.26,1.03,-.12], batUp: [-.35,-.85,.39], batFace: [.65,.10,.80],
          yaw: 1.40, leadElbow: -.15 }) });
        keys.push({ time: impact, pose: contact }, { time: this.charging ? 560 : 340, pose: through });
        if (this.charging) keys.push({ time: 640, pose: reachPose({ ...CHARGE.finish,
          grip: [.04,1.55,.78], batUp: [0,-1,0], batFace: [0,0,-1] }) });
        keys.push({ time: end, pose: finish });
        const pose = this.charging ? shoulderDriven(keys,age,impact) : flowing(keys, age, true);
        this.apply(this.charging && age < impact ? this.approach(pose, age) : pose);
      } else if (age < hold) this.apply(finish);
      else {
        const recovery = reachPose(stroke.recover!);
        const mid = hold + (duration - hold) * .55;
        const guard = this.charging ? this.walking(GUARD, ADVANCE.stride) : GUARD;
        if (this.pulling) {
          const out = reachPose({ ...PULL.finish, grip: [-.20,1.38,.52], batUp: [1,0,0], batFace: [0,.25,-.97] });
          const first = hold+100, second=hold+240;
          this.apply(age<first ? mix(finish,out,(age-hold)/(first-hold))
            : age<second ? mix(out,recovery,(age-first)/(second-first)) : mix(recovery,guard,(age-second)/(duration-second)));
        } else {
          const out = reachPose({ ...CHARGE.finish, grip: [.22,1.48,.72], batUp: [0,-1,0], batFace: [0,0,-1],armHinge:.2,armDrive:1,shoulderLift:.04 });
          const clear = hold+90;
          this.apply(age<clear ? mix(finish,out,(age-hold)/(clear-hold))
            : age<mid ? mix(out,recovery,(age-clear)/(mid-clear)) : mix(recovery,guard,(age-mid)/(duration-mid)));
        }
      }
      return;
    }
    if (this.shot === 'STRAIGHT' || this.shot === 'COVER_LONG_OFF') {
      if (age < 410) {
        const keys = [{ time: 0, pose: this.swingFrom }, { time: STROKE_CONTACT_MS, pose: contact },
          { time: 220, pose: reachPose(stroke.through!) }];
        keys.push({ time: 410, pose: finish });
        this.apply(shoulderDriven(keys,age,STROKE_CONTACT_MS));
      } else if (age < 570) this.apply(finish);
      else if (age < 780) {
        const out=reachPose({ ...stroke.finish, grip: this.shot==='STRAIGHT'?[.42,1.45,.58]:[.50,1.45,.55], batUp: [-1,0,0], batFace: [0,0,1],armHinge:.2,armDrive:1,shoulderLift:.04 });
        const clear=this.shot==='COVER_LONG_OFF'?680:660;
        this.apply(age<clear?mix(finish,out,(age-570)/(clear-570)):mix(out,reachPose(stroke.recover!),(age-clear)/(780-clear)));
      } else this.apply(mix(reachPose(stroke.recover!),GUARD,(age-780)/(STROKE_DURATION_MS-780)));
      return;
    }
    if (age <= STROKE_CONTACT_MS) this.apply(mix(this.swingFrom, contact, age / STROKE_CONTACT_MS));
    else if (stroke.through && age < 220) this.apply(mix(contact, reachPose(stroke.through), (age - STROKE_CONTACT_MS) / (220 - STROKE_CONTACT_MS)));
    else if (age < 410) this.apply(mix(stroke.through ? reachPose(stroke.through) : contact, finish,
      (age - (stroke.through ? 220 : STROKE_CONTACT_MS)) / (410 - (stroke.through ? 220 : STROKE_CONTACT_MS))));
    else if (age < 570) this.apply(finish);
    else if (stroke.recover) {
      // Down through the recovery pose first, then home. The bat spends longer
      // coming down off the shoulder than it does settling into the pick-up.
      const through = 570 + (STROKE_DURATION_MS - 570) * .52;
      const recover = reachPose(stroke.recover);
      if (age < through) this.apply(mix(finish, recover, (age - 570) / (through - 570)));
      else this.apply(mix(recover, GUARD, (age - through) / (STROKE_DURATION_MS - through)));
    }
    else this.apply(mix(finish, GUARD, (age - 570) / (STROKE_DURATION_MS - 570)));
  }
  /** The fall, stage by stage, and then he stays where he lands. */
  private applyFall(age: number) {
    if (age <= FALL.recoil) return this.apply(mix(this.felledFrom, RECOIL, ease(age / FALL.recoil)));
    if (age <= FALL.buckle) {
      return this.apply(mix(RECOIL, BUCKLED, ease((age - FALL.recoil) / (FALL.buckle - FALL.recoil))));
    }
    if (age <= FALL.settled) {
      // The last stretch is the slowest: the knees have already gone, and what
      // is left is a man settling onto the turf rather than dropping onto it.
      return this.apply(mix(BUCKLED, FELLED, ease((age - FALL.buckle) / (FALL.settled - FALL.buckle))));
    }
    this.apply(FELLED);
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
    this.head.rotation.set(.09 + (pose.headDown ?? 0), pose.face, -.04);
    this.bat.position.set(...pose.grip);
    this.bat.quaternion.copy(batOrientation(pose));
    // Keep the approved blade axis/path, but orient its flat face in the
    // stroke plane. The former guard opened the face skyward and then rolled
    // it around the handle on the way down. A drive needs no such axial roll.
    const driveShot=this.charging || this.shot==='STRAIGHT' || this.shot==='COVER_LONG_OFF';
    const idle=!Number.isFinite(this.poseAge) || this.poseAge >= (this.charging?CHARGE_DURATION_MS:STROKE_DURATION_MS);
    if (!this.felled) {
      const up=UP.clone().applyQuaternion(this.bat.quaternion);
      const impact=this.charging?CHARGE_CONTACT_MS:STROKE_CONTACT_MS;
      const reference=this.charging?CHARGE.contact:this.shot==='COVER_LONG_OFF'?STROKES.COVER_LONG_OFF.contact:STROKES.STRAIGHT.contact;
      const referenceQ=batOrientation(STROKES.STRAIGHT.contact).clone().slerp(batOrientation(reference),idle?0:ease(THREE.MathUtils.clamp(this.poseAge/impact,0,1)));
      const referenceUp=UP.clone().applyQuaternion(referenceQ);
      const transported=new THREE.Quaternion().setFromUnitVectors(referenceUp,up).multiply(referenceQ);
      if(idle || (driveShot && this.poseAge<=impact)) this.bat.quaternion.copy(transported);
      else {
        // Return the same corrected guard without snapping the other strokes.
        const duration=this.charging?CHARGE_DURATION_MS:STROKE_DURATION_MS;
        const returnSpan=260;
        const returnWeight=ease(THREE.MathUtils.clamp((this.poseAge-(duration-returnSpan))/returnSpan,0,1));
        const entryWeight=driveShot?0:1-ease(THREE.MathUtils.clamp(this.poseAge/STROKE_CONTACT_MS,0,1));
        const guardPose=entryWeight>0?this.swingFrom:GUARD;
        const guardQ=batOrientation(guardPose), guardUp=UP.clone().applyQuaternion(guardQ);
        const corrected=new THREE.Quaternion().setFromUnitVectors(UP.clone().applyQuaternion(batOrientation(STROKES.STRAIGHT.contact)),guardUp)
          .multiply(batOrientation(STROKES.STRAIGHT.contact));
        const localFace=new THREE.Vector3(0,0,1).applyQuaternion(corrected).applyQuaternion(guardQ.clone().invert());
        let roll=Math.atan2(localFace.x,localFace.z);
        if(roll<0) roll+=Math.PI*2;
        if(entryWeight>0) roll-=Math.PI*2;
        this.bat.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(UP,roll*Math.max(entryWeight,returnWeight)));
      }
    }
    this.root.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) {
      const arm = this.arms[i];
      arm.shoulder.set(i === 0 ? -.163 : .163, .075+(pose.shoulderLift??0), 0).applyQuaternion(this.torso.quaternion).add(chest);
      const grip = arm.glove.position.clone().applyQuaternion(this.bat.quaternion).add(this.bat.position);
      const axis = UP.clone().applyQuaternion(this.bat.quaternion);
      // Solve the wrist beside the handle while keeping both Vs registered
      // to the bat. The palm bridge below accommodates wrist articulation.
      const radial = arm.shoulder.clone().sub(grip);
      radial.addScaledVector(axis, -radial.dot(axis)).normalize();
      const socket=wristSocket(i);
      const hand = grip.clone().addScaledVector(radial,-socket.z).addScaledVector(axis,socket.y);
      arm.wrist.copy(hand);
      arm.glove.rotation.set(0,0,0);
      let elbow = new THREE.Vector3();
      if (this.cutting) {
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
      const room = (point: THREE.Vector3) => {
        const axis = new THREE.Vector3(0,1,0).applyQuaternion(this.bat.quaternion);
        const alongBlade = THREE.MathUtils.clamp(point.clone().sub(this.bat.position).dot(axis), -.83, -.17);
        const bladeDistance = point.distanceTo(this.bat.position.clone().addScaledVector(axis, alongBlade));
        return Math.min(this.offSpine(point, hip, chest, spine) / .19, this.offHandle(point) / .11,
          this.pulling || this.charging ? bladeDistance / .17 : Infinity);
      };
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
      elbow = bend(hint);
      // Either hint can still bury the elbow on a stroke that wraps the hands
      // across the body — in the chest, or out along the handle past the knob.
      // Turn the bend around the arm until it clears, smallest turn first.
      for (let step = 1; step <= (this.pulling || this.charging ? 12 : 6) && room(elbow) < 1; step++)
        for (const side of [1, -1]) {
          const turned = bend(hint.clone().applyAxisAngle(along, side * step * .26));
          if (room(turned) > room(elbow)) elbow = turned;
        }
      }
      {
        // A continuous anatomical pole, not a per-frame clearance winner.
        // Choosing among discrete bend planes caused the visible elbow flips.
        const outward = arm.shoulder.clone().sub(chest).normalize();
        const forward = new THREE.Vector3(0,0,1).applyQuaternion(this.torso.quaternion);
        const pole = arm.shoulder.clone().addScaledVector(outward,.24)
          .addScaledVector(spine,-.30).addScaledVector(forward,.18);
        if (!this.charging && !this.pulling && i===0 && (this.shot==='STRAIGHT'||this.shot==='COVER_LONG_OFF'))
          pole.addScaledVector(spine,Math.max(0,pose.leadElbow)*1.1);
        const drive=THREE.MathUtils.clamp(pose.armDrive??0,0,1);
        if (drive>0 && i===0) {
          const hinge=pose.armHinge??-.6;
          const impact=this.charging?CHARGE_CONTACT_MS:STROKE_CONTACT_MS;
          const opening=.10+.65*(1-ease(THREE.MathUtils.clamp((this.poseAge-impact)/100,0,1)));
          const aim=new THREE.Vector3(opening,Math.sin(hinge),Math.cos(hinge)).normalize();
          pole.lerp(arm.shoulder.clone().addScaledVector(aim,.60),drive);
        }
        if (this.cutting) {
          // Preserve the square cut's raised clearance plane, easing into it
          // from the shared guard instead of changing solvers at shot input.
          const weight = ease(THREE.MathUtils.clamp(this.poseAge/60,0,1))
            * ease(THREE.MathUtils.clamp((STROKE_DURATION_MS-this.poseAge)/150,0,1));
          pole.lerp(elbow,weight);
        }
        for (let iteration=0;iteration<6;iteration++) {
          elbow=solveJoint(arm.shoulder,hand,.32,.34,pole);
          radial.copy(elbow).sub(grip).addScaledVector(axis,-elbow.clone().sub(grip).dot(axis)).normalize();
          socket.y=wristSocket(i).y*THREE.MathUtils.smoothstep(elbow.clone().sub(grip).dot(axis),-.08,.20);
          hand.copy(grip).addScaledVector(radial,-socket.z).addScaledVector(axis,socket.y);
        }
        elbow = solveJoint(arm.shoulder, hand, .32, .34, pole);
        arm.wrist.copy(hand);
        arm.socket.copy(hand).sub(grip).applyQuaternion(this.bat.quaternion.clone().invert());
        // The finger and thumb webs remain in the bat frame. Articulate the
        // palm around the handle to the wrist, instead of spinning the entire
        // fist and taking its V away from the spine. The curved bridge keeps
        // a handle channel rather than cutting straight through the rubber.
        const bearing=Math.atan2(arm.socket.x,-arm.socket.z);
        for(let n=0;n<arm.palm.length;n++) {
          const point=(t:number)=>new THREE.Vector3(Math.sin(bearing*t)*(.047+(.020*t)),arm.socket.y*t,-Math.cos(bearing*t)*(.047+(.020*t)));
          this.segment(arm.palm[n],point(n/4),point((n+1)/4),.042,.047);
        }
      }
      this.segment(arm.upper, arm.shoulder, elbow, .14, .145);
      this.segment(arm.lower, elbow, hand, .095);
      arm.elbow.position.copy(elbow); arm.cap.position.copy(arm.shoulder);
      // The gauntlet starts at the wrist socket, not inside the handle.
      const wrist = elbow.clone().sub(hand);
      arm.cuff.position.copy(hand);
      if (wrist.lengthSq() > .000001) arm.cuff.quaternion.setFromUnitVectors(UP, wrist.normalize());
      const leg = this.legs[i];
      const hipJoint = new THREE.Vector3(i === 0 ? -.135 : .135, -.045, 0).applyQuaternion(yaw).add(hip);
      const foot = V(i === 0 ? pose.frontFoot : pose.backFoot);
      const footPitch = i === 1 ? pose.heel * 2.4 : 0;
      // Lift the heel about a planted toe instead of lifting the entire shoe.
      foot.y += .225 * Math.sin(footPitch) + .07 * (Math.cos(footPitch) - 1);
      const driving = !this.pulling && (this.charging || this.shot==='STRAIGHT' || this.shot==='COVER_LONG_OFF');
      const kneePole = this.charging ? new THREE.Vector3(i === 0 ? .10 : .35, -.15, .65) : new THREE.Vector3(.65, -.15, .02);
      if (driving && !this.charging && !this.felled && Number.isFinite(this.poseAge)) {
        const weight=ease(THREE.MathUtils.clamp(this.poseAge/80,0,1))*ease(THREE.MathUtils.clamp((STROKE_DURATION_MS-this.poseAge)/160,0,1));
        kneePole.lerp(new THREE.Vector3(i===0 ? .04 : .35,-.15,.65),weight);
      }
      const knee = solveJoint(hipJoint, foot, .43, .44, hipJoint.clone().add(kneePole));
      this.segment(leg.thigh, hipJoint, knee, .175, .19);
      this.segment(leg.shin, knee, foot, .145, .16);
      leg.knee.position.copy(knee); leg.cap.position.copy(hipJoint);
      const lowerAxis = knee.clone().sub(foot).normalize();
      leg.pad.quaternion.setFromUnitVectors(UP, lowerAxis).multiply(new THREE.Quaternion().setFromAxisAngle(UP, 1.38));
      leg.pad.position.copy(foot).lerp(knee, .54).add(new THREE.Vector3(.012, 0, .01));
      leg.shoe.position.copy(foot);
      leg.shoe.quaternion.setFromAxisAngle(UP, i === 0 ? pose.yaw * .77 : (pose.backFootYaw ?? 1.38))
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
      shot: this.shot, pulling: this.pulling, cutting: this.cutting, yaw: this.pose.yaw, grip: [...this.pose.grip], frontFoot: [...this.pose.frontFoot], backFoot: [...this.pose.backFoot],
      hands: this.arms.map(arm => arm.glove.getWorldPosition(new THREE.Vector3()).toArray()),
      wrists: this.arms.map(arm => arm.wrist.toArray()),
      elbows: this.arms.map(arm => arm.elbow.position.toArray()),
      shoulders: this.arms.map(arm => arm.shoulder.toArray()),
      chest: [...this.pose.chest], hip: [...this.pose.hip],
      armLengths: this.arms.map(arm => [arm.upper.scale.y, arm.lower.scale.y]),
      elbowCoverage: this.arms.map(arm=>Math.min(arm.elbow.scale.x,arm.elbow.scale.y,arm.elbow.scale.z)
        - Math.max(arm.upper.scale.x,arm.upper.scale.z)*.5),
      legLengths: this.legs.map(leg => [leg.thigh.scale.y, leg.shin.scale.y]),
      charging: this.charging, downPitch: this.root.position.z - GAME.stanceZ,
      backToe: this.legs[1].shoe.localToWorld(new THREE.Vector3(0, -.07, .225)).toArray(),
      bladeContact: this.bat.localToWorld(new THREE.Vector3(0, -.44, 0)).toArray(),
      bladeTip: this.bat.localToWorld(new THREE.Vector3(0, -.83, 0)).toArray(),
      batUp: V(this.pose.batUp).normalize().toArray(),
      batFace: new THREE.Vector3(0, 0, 1).applyQuaternion(this.bat.quaternion).toArray(),
      // Rotation around the handle is allowed; tilting its grasp axis is not.
      gripAxis: this.arms.map(arm => UP.clone().applyQuaternion(arm.glove.quaternion).dot(UP)),
      gripRotation: this.arms.map(arm => arm.glove.quaternion.toArray()),
      vSpineAlignment: this.arms.map(arm=>new THREE.Vector3(0,0,-1).applyQuaternion(arm.glove.quaternion).dot(new THREE.Vector3(0,0,-1))),
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
        const hand = arm.wrist;
        const forearm = arm.elbow.position.clone().sub(hand).normalize();
        const cuff = new THREE.Vector3(0, 1, 0).applyQuaternion(arm.cuff.quaternion);
        const wristDirection = arm.socket.clone().normalize().applyQuaternion(arm.glove.quaternion).applyQuaternion(this.bat.quaternion);
        return { alongForearm: cuff.dot(forearm), flex: wristDirection.angleTo(forearm),
          socketError: arm.glove.localToWorld(arm.socket.clone()).sub(this.root.position).distanceTo(hand),
          elbowOffHandle: this.offHandle(arm.elbow.position) };
      }),
    };
  }
}
