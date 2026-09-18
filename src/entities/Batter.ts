import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ADVANCE, CUT, GAME, SQUARE_DRIVE as SQUARE_DRIVE_BALL } from '../config/gameplay';
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
export const SQUARE_DRIVE_CONTACT_MS = 130;
/**
 * Where the two fists sit on the handle, measured up the bat from its origin.
 * The top hand is the left one; the bottom hand follows it up, and the pair
 * holds the handle the way a right-hander's does. Shared by every stroke.
 */
const HAND = { top: .075, bottom: -.035 } as const;
/** How far apart the two fists sit. Photo-referenced, and the same for all shots. */
export const HAND_SPACING = HAND.top - HAND.bottom;
export const STROKE_DURATION_MS = 940;

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
interface Stroke {
  contact: Pose; finish: Pose; through?: Pose; recover?: Pose;
  /**
   * One more key between the extension and the finish, for a stroke whose blade
   * turns through more than a right angle on the way. Interpolating that much
   * rotation in one span lets the shortest path cut the corner — and the corner,
   * for a bat on the end of two raised arms, is the batter's own head.
   */
  carry?: Pose;
}
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
    /**
     * The straight drive, classic — the four.
     *
     * Every key here is solved for arm extension rather than eyeballed. Both
     * fists hold one handle, so the two arms cannot be posed independently:
     * the only place they can both be straight is directly out in front of the
     * sternum, at a shade under the length of an arm. Put the hands anywhere
     * else and one elbow folds to make up the difference, which is what the
     * old drive did for its whole length.
     *
     * At contact he is still side-on and the arms are still bent — that is what
     * the reference shows, and what a drive is: the elbows open THROUGH the
     * ball, not before it.
     */
    contact: { ...GUARD, hip: [-.19, .74, -.03], chest: [-.06, 1.08, .06],
      frontFoot: [.02, .08, .53], backFoot: [-.15, .08, -.34],
      grip: [.42, .97, .21], batUp: [.035, .985, -.17], batFace: [0, .12, 1], yaw: 1.28, face: .02, heel: .10, leadElbow: .20,
      armHinge: .90, armDrive: 1, shoulderLift: 0 },
    // Extension (220 ms): the shoulders have turned through, the chest faces down the
    // ground, and the hands are a full arm in front of the sternum, a stride
    // past the front foot. Both elbows are all but straight here.
    through: { ...GUARD, hip: [.02, .82, .14], chest: [.16, 1.16, .24],
      frontFoot: [.02, .08, .53], backFoot: [-.13, .08, -.30],
      grip: [.47, 1.03, .76], batUp: [.06, .62, -.78], batFace: [0, .78, .62], yaw: .52, face: .06, heel: .22, leadElbow: .24,
      armHinge: .55, armDrive: 1, shoulderLift: .04 },
    // Carry (310 ms). Up in front of him before it comes over him: more than a right angle of
    // blade rotation in one span lets the shortest path cut the corner, and the
    // corner is his own head.
    carry: { ...GUARD, hip: [.03, .84, .16], chest: [.17, 1.18, .27],
      frontFoot: [.02, .08, .53], backFoot: [-.12, .08, -.28],
      grip: [.43, 1.28, .82], batUp: [.02, -.26, -.965], batFace: [.04, .965, -.26], yaw: .32, face: .08, heel: .26,
      backFootYaw: 1.00, leadElbow: .26, armHinge: 1.00, armDrive: 1, shoulderLift: .05 },
    // Finish (410 ms). Controlled, not a heave: the hands stay high and in front of the
    // chest and the blade points up the ground after the ball. The lofted
    // version below is the one that swings all the way over the shoulder.
    finish: { ...GUARD, hip: [.04, .86, .17], chest: [.17, 1.20, .28],
      frontFoot: [.02, .08, .53], backFoot: [-.11, .08, -.26],
      grip: [.41, 1.44, .74], batUp: [.08, -.66, -.747], batFace: [.06, .75, -.66], yaw: .22, face: .10, heel: .30,
      backFootYaw: .92, leadElbow: .28, armHinge: 1.15, armDrive: 1, shoulderLift: .06 },
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
      armHinge: .92, armDrive: 1, shoulderLift: 0 },
    through: { ...GUARD, hip: [.00,.80,.20], chest: [.15,1.14,.30], frontFoot: [.10,.08,.60], backFoot: [-.12,.08,-.24],
      grip: [.58,1.18,.76], batUp: [-.18,.975,-.10], batFace: [.42,.1,.90], yaw: .98, face: .28, heel: .18, leadElbow: .15,
      armHinge: .80, armDrive: 1, shoulderLift: .05 },
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
    yaw: .62, face: -.25, heel: .10, backFootYaw: 1.05, leadElbow: -.20 },
  // Extend through the ball before the elbows fold into the wrap. The head
  // stays over the loaded back leg rather than lunging after the hands.
  through: { ...GUARD, hip: [-.17, .88, -.22], chest: [-.12, 1.24, -.15],
    frontFoot: [-.31, .08, .15], backFoot: [-.20, .08, -.36],
    grip: [-.32, 1.19, .33], batUp: [.975, .14, -.17], batFace: [-.18, -.05, -.98],
    yaw: .05, face: -.65, heel: .28, backFootYaw: .55, leadElbow: -.12 },
  // Mirrored from the supplied left-handed demonstration: the hands fold beside
  // the left shoulder and the blade settles behind it, clear of the helmet.
  //
  // The blade lifts out of the sweep here rather than staying dead level. Held
  // at the elevation it swung through, the bat finishes horizontal across his
  // chest and the stroke reads as a bat swung flat and then stopped; the elbows
  // folding is what takes the toe up and away behind the shoulder, and that
  // fold is the difference between a pull and a bunt. The hands go out wide
  // with it rather than up beside his ear, because a wrap that tight brings the
  // shaft down across the grille. The back foot has spun through with him too:
  // a pull is hit off a pivot, and a heel that never leaves the turf shears the
  // hips off the feet they are supposed to be turning on.
  finish: { ...GUARD, hip: [-.17, .90, -.10], chest: [-.16, 1.26, .00],
    frontFoot: [-.34, .08, .10], backFoot: [-.17, .08, -.33],
    grip: [-.48, 1.46, .42], batUp: [-.30, -.68, .67], batFace: [.93, -.22, .30],
    yaw: -.38, face: -.80, heel: .42, backFootYaw: .25, leadElbow: -.10 },
  recover: { ...GUARD, grip: [.36, 1.10, .40], batUp: [-.15, -.80, -.58],
    batFace: [.86, -.22, .17], yaw: .70, heel: .04 },
};
const PULL_REACH: readonly [number, number] = [-.55, .32];
/**
 * The square drive, off the front foot — the reference recording.
 *
 * It is the cover drive's ball moved wider and fuller: the same front-foot
 * stride, but planted across towards the off side rather than down the ground,
 * and the face opened until it is square. What makes it its own stroke is the
 * middle of it. A cover drive's hands leave contact climbing; these stay down.
 * He is driving a ball that is almost on the floor, so the extension runs flat
 * and square across him with the head still over it, and only once the arms are
 * out does the whole thing turn over and come up. That late turn is why the
 * finish is so much higher and more open than the cover drive's: the rotation
 * that a cover drive spends going forward, this one spends going round.
 *
 * The finish is the cut's — hands high beside the front shoulder, blade wrapped
 * up over it — because that is where an off-side stroke hit square ends up,
 * whichever foot it was played off. Both hands stay in front of the shoulder;
 * a two-handed grip cannot be taken round behind it.
 */
const SQUARE_DRIVE: Stroke = {
  // Contact. He does not get his body across to a wide ball — he stays inside
  // the line and frees his arms at it, which is the whole point of the stroke
  // and why it can be played to a ball a cover drive could not reach. Chest
  // square to the off side, head over the ball, front foot planted across.
  contact: { ...GUARD, hip: [-.09, .80, .21], chest: [.04, 1.14, .30],
    frontFoot: [.26, .08, .56], backFoot: [-.13, .08, -.25],
    grip: [.60, .90, .26], batUp: [.22, .96, -.17], batFace: [.88, .10, .46],
    yaw: 1.56, face: .42, heel: .10, leadElbow: .16,
    armHinge: .85, armDrive: 1, shoulderLift: 0 },
  // The stroke's own key: the arms punch out square with the blade still
  // hanging below the hands, both elbows straight, the hands almost a metre
  // off the chest. Flat and across — a cover drive's hands leave contact
  // climbing, and if these climb here the stroke is just a wide cover drive.
  through: { ...GUARD, hip: [.17, .78, .18], chest: [.31, 1.12, .28],
    frontFoot: [.26, .08, .56], backFoot: [-.11, .08, -.23],
    grip: [.90, 1.02, .58], batUp: [.52, .80, -.30], batFace: [.80, -.10, .59],
    yaw: 1.12, face: .48, heel: .20, leadElbow: .20,
    armHinge: .60, armDrive: 1, shoulderLift: .05 },
  // Only now does it turn over, and it turns over late: that is what makes the
  // finish so much higher and more open than the cover drive's.
  carry: { ...GUARD, hip: [.14, .82, .20], chest: [.26, 1.16, .26],
    frontFoot: [.26, .08, .56], backFoot: [-.10, .08, -.20],
    grip: [.80, 1.28, .52], batUp: [.34, -.18, -.92], batFace: [.30, .96, -.06],
    yaw: .70, face: .42, heel: .28, backFootYaw: .90, leadElbow: .06,
    armHinge: 1.20, armDrive: 1, shoulderLift: .06 },
  // Hands high in front of the front shoulder with the blade standing over
  // them, the body opened right up and the back heel off the turf.
  finish: { ...GUARD, hip: [.06, .86, .20], chest: [.10, 1.24, .22],
    frontFoot: [.26, .08, .56], backFoot: [-.08, .08, -.16],
    grip: [.30, 1.56, .48], batUp: [.22, -.92, .32], batFace: [.90, .34, .27],
    yaw: .34, face: .30, heel: .34, backFootYaw: .55, leadElbow: -.12,
    armHinge: 1.85, armDrive: 1, shoulderLift: .08 },
  // Off the shoulder and out in front before the pick-up, the same way the cut
  // comes home: the finish holds the bat behind the front shoulder and the
  // guard holds it behind the back one, and every short path between the two
  // goes through his head.
  recover: { ...GUARD, hip: [.02, .90, .14], chest: [.10, 1.24, .18],
    frontFoot: [.18, .08, .44], backFoot: [-.13, .08, -.25],
    grip: [.46, 1.14, .50], batUp: [-.15, -.80, -.58], batFace: [.86, -.22, .17],
    yaw: 1.05, face: .20, heel: .10, leadElbow: -.20 },
};
/**
 * How wide a ball has to be before the off-side drive is played square. Inside
 * this it is the cover drive, which is the same input: a stroke this open at a
 * ball on off stump drags it square of a wicket it is standing in front of.
 */
const SQUARE_DRIVE_REACH: readonly [number, number] = [.16, .62];
/**
 * The straight drive, lofted — the six.
 *
 * The same ball and the same contact as the classic drive: what separates them
 * is everything after impact. The bat keeps climbing through the line instead
 * of chasing it along the ground, the chest opens right up, the back foot comes
 * off the turf, and the blade finishes over the front shoulder with the hands
 * above the helmet. Timed anything less than perfectly it is the classic drive
 * that gets played, which is also the ball that is worth four rather than six.
 */
const STRAIGHT_LOFT: Stroke = {
  contact: STROKES.STRAIGHT.contact,
  // Extension is still extension — the arms straighten through the ball either
  // way. The difference is that the blade is already climbing by the time they
  // do, so the same swing sends it up rather than along.
  through: { ...STROKES.STRAIGHT.through!, grip: [.47, 1.08, .74], batUp: [.06, .44, -.896], batFace: [0, .90, .44],
    heel: .28, armHinge: .70, shoulderLift: .05 },
  carry: { ...GUARD, hip: [.03, .86, .16], chest: [.16, 1.20, .26],
    frontFoot: [.02, .08, .53], backFoot: [-.10, .08, -.24],
    grip: [.40, 1.42, .74], batUp: [.06, -.60, -.798], batFace: [.05, .80, -.60], yaw: .28, face: .10, heel: .38,
    backFootYaw: .90, leadElbow: .26, armHinge: 1.30, armDrive: 1, shoulderLift: .07 },
  finish: { ...GUARD, hip: [.03, .88, .16], chest: [.14, 1.22, .24],
    frontFoot: [.02, .08, .53], backFoot: [-.06, .10, -.20],
    grip: [.32, 1.64, .60], batUp: [.16, -.88, .45], batFace: [.95, .06, -.30], yaw: .10, face: .12, heel: .52,
    backFootYaw: .70, leadElbow: .24, armHinge: 1.55, armDrive: 1, shoulderLift: .09 },
  recover: STROKES.STRAIGHT.recover,
};
// Charging the bowler: a long stride out of the crease with the head over the
// ball, the bat swung straight through the line and up, and the whole body
// carried on down the pitch afterwards. The stride is as long as the leg will
// reach — any further and the shin stretches to meet the foot.
const CHARGE: Stroke = {
  contact: { ...GUARD, hip: [-.06, .80, .36], chest: [.10, 1.16, .40], frontFoot: [.04, .08, .92], backFoot: [-.20, .10, -.26],
    grip: [.34, .98, .30], batUp: [.10, .98, -.14], batFace: [0, .16, .99], yaw: 1.02, face: 0, heel: .34, leadElbow: .18 },
  // Charging is running: by the finish he has pushed off the front foot and
  // stepped through onto the back one, with the front leg trailing in the air.
  // The bat finishes the way the straight drive's does — blade up and pointing
  // away down the ground, hands high and out in front of the off shoulder.
  // Wrapping the blade down over the shoulder instead is what the swing wants
  // to do, and it is the one finish this stroke cannot take: the hands are in
  // front of the chest and the blade is behind it, so the shaft between them
  // lies through the trunk, and the sweep up to it drags the blade through him
  // on the way.
  //
  // Wider of his head than the straight drive's finish, too. He is running at
  // the ball rather than leaning into it, so the hands come up from further
  // forward and take a tighter line past the grille on their way; carried at
  // the drive's own width the top glove goes through the side of the helmet.
  finish: { ...GUARD, hip: [-.04, .86, .40], chest: [.04, 1.26, .42], frontFoot: [-.02, .30, -.06], backFoot: [-.22, .08, .30],
    grip: [.40, 1.58, .72], batUp: [-.10, -.62, -.78], batFace: [0, .14, .99], yaw: .70, face: -.10, heel: 0, leadElbow: -.06 },
  // Off the shoulder and down in front of him before the pick-up. He is walking
  // back up the pitch through this, so the hands come down the off side where
  // the camera can see them rather than across a chest that is moving.
  recover: { ...GUARD, hip: [-.06, .90, .20], chest: [.04, 1.26, .24], frontFoot: [-.04, .08, .34], backFoot: [-.18, .08, -.16],
    grip: [.34, 1.16, .46], batUp: [-.22, -.52, -.82], batFace: [.10, .84, -.53], yaw: .92, face: -.04, heel: .08, leadElbow: -.18 },
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
  private squaring = false;
  private lofted = false;
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
    glovePalm: new THREE.MeshStandardMaterial({ color: 0xd9d9cf, roughness: .95 }),
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
      // Photo reference IMG_4073: the LEFT top hand closes OVER the handle;
      // its padded knuckles face the spine. The RIGHT bottom hand wraps under
      // it. Mirroring two palm-up hands produces the rejected paddle grip.
      const glove = new THREE.Group(); this.bat.add(glove);
      glove.name = i === 0 ? 'Left top glove — overhand' : 'Right bottom glove — underhand';
      glove.position.set(0, i === 0 ? HAND.top : HAND.bottom, 0);
      const back = i === 0 ? -1 : 1;
      // A closed, soft glove envelope restores the original puffy silhouette.
      // The handle passes through the fist, rather than exposed finger hoops.
      const shell=this.mesh(glove,this.palette.pad,[.112,.103,.110],'soft');
      shell.name='Closed padded glove';
      const palm=[this.mesh(glove,this.palette.pad,[1,1,1],'soft')];
      const leather=this.mesh(glove,this.palette.glovePalm,[.077,.087,.022],'soft');
      leather.position.z=-back*.049;
      leather.name='Palm on inside of closed grip';
      for(let finger=0;finger<4;finger++) {
        const y=.034-finger*.023;
        const knuckle=this.mesh(glove,this.palette.pad,[.106,.025,.040],'soft');
        knuckle.position.set(0,y,back*.048);
        knuckle.name='Padded knuckle';
        // Curled tips close against the palm; they do not splay away from it.
        const tip=this.mesh(glove,this.palette.pad,[.043,.022,.032],'soft');
        tip.position.set(back*.036,y,-back*.042);
      }
      const thumb=this.mesh(glove,this.palette.pad,[1,1,1],'soft');
      thumb.name='Thumb opposed to curled fingers';
      this.segment(thumb,new THREE.Vector3(-back*.045,.024,-back*.028),
        new THREE.Vector3(back*.007,-.018,-back*.061),.039,.039);
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
    this.swingStart = -Infinity; this.contactTime = -Infinity; this.anticipation = 0; this.pulling = false; this.cutting = false; this.squaring = false; this.lofted = false; this.charging = false;
    this.root.position.set(GAME.stanceX, 0, GAME.stanceZ); this.root.rotation.set(0, 0, 0);
    this.apply(GUARD);
  }
  prepare(progress: number) { this.anticipation = THREE.MathUtils.smoothstep(progress, .05, .72); }
  swing(shot: ShotType, now: number, finalBallX: number, ballY = .54, ballZ: number = GAME.contactZ, charging = false, lofted = false) {
    this.shot = shot; this.charging = charging; this.pulling = !charging && shot === 'LEG' && ballY > .85;
    this.cutting = !charging && shot === 'SQUARE_CUT' && ballY > CUT.highBallY;
    // Wide and full off the off-side input: drive it square rather than through
    // cover. Charging overrides it, the way it overrides every other variation.
    this.squaring = !charging && shot === 'COVER_LONG_OFF'
      && finalBallX >= SQUARE_DRIVE_BALL.minWidth && ballY <= SQUARE_DRIVE_BALL.maxBallY;
    // The six's follow-through, chosen by the caller off the same timing rule
    // the score is worked out from. Charging overrides it, as it does everything.
    this.lofted = !charging && shot === 'STRAIGHT' && lofted;
    this.swingStart = now;
    this.contactTime = now + (this.pulling ? PULL_CONTACT_MS : this.squaring ? SQUARE_DRIVE_CONTACT_MS : STROKE_CONTACT_MS);
    this.swingFrom = this.pose; this.ballX = finalBallX; this.ballZ = ballZ;
    // Only the two cross-bat strokes go up after a bouncer — the pull to the leg
    // side and the cut to the off. Every other stroke plays at its own height and
    // the ball passes over the bat, rather than the arms stretching to chase a
    // ball that stroke was never going to reach.
    this.ballY = this.pulling || this.cutting ? ballY : Math.min(ballY, .62);
  }
  get strikeAt() { return this.contactTime; }
  get contactZ() { return this.ballZ; }
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
    if (Number.isFinite(this.felledAt)) return this.applyFall(now - this.felledAt);
    const age = now - this.swingStart;
    this.poseAge = age;
    this.travel(age);
    if (!Number.isFinite(age) || age >= STROKE_DURATION_MS) {
      const guard = mix(GUARD, BACKLIFT, Number.isFinite(age) ? 0 : this.anticipation);
      this.apply(this.charging ? this.walking(guard, this.downPitch(age)) : guard);
      return;
    }
    const stroke = this.charging ? CHARGE : this.pulling ? PULL : this.cutting ? CUT_HIGH
      : this.squaring ? SQUARE_DRIVE : this.lofted ? STRAIGHT_LOFT : STROKES[this.shot];
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
    const targetX = THREE.MathUtils.clamp(this.ballX,
      ...(this.pulling ? PULL_REACH : this.squaring ? SQUARE_DRIVE_REACH : zones[this.shot]));
    // The bat meets the ball where he stands at contact. Reading the live root
    // instead drags the hands backwards out of a charge as it carries him on.
    const impact = this.pulling ? PULL_CONTACT_MS : this.squaring ? SQUARE_DRIVE_CONTACT_MS : STROKE_CONTACT_MS;
    const planted = GAME.stanceZ + this.downPitch(STROKE_CONTACT_MS);
    const contactGrip = new THREE.Vector3(targetX - this.root.position.x, this.ballY, this.ballZ - planted)
      .addScaledVector(V(stroke.contact.batUp).normalize(), .44);
    // How far the body follows the ball sideways. The square drive tracks a wide
    // one further than the rest: its arms are already straight at impact, and a
    // body left behind a ball out at the edge of the reach stretches them past
    // their own length rather than extending them.
    const step = targetX * (this.squaring ? .78 : .65);
    const shift = (p: Point, amount: number): Point => [p[0] + amount, p[1], p[2]];
    // The charge keeps the production rig's planted back foot: it is the one
    // stroke whose feet are authored against a body that is already travelling.
    const shiftsBackFoot = !this.charging
      && (this.pulling || this.squaring || this.shot === 'STRAIGHT' || this.shot === 'COVER_LONG_OFF');
    const reachPose = (p: Pose): Pose => ({ ...p, hip: shift(p.hip, step), chest: shift(p.chest, step),
      frontFoot: shift(p.frontFoot, step), backFoot: shiftsBackFoot ? shift(p.backFoot, step) : p.backFoot,
      grip: shift(p.grip, step) });
    const contact = { ...reachPose(stroke.contact), grip: contactGrip.toArray() as unknown as Point };
    const finish = reachPose(stroke.finish);
    if (this.pulling) {
      const end = 500, hold = 570;
      const through = reachPose(stroke.through!);
      if (age < end) {
        const keys = [{ time: 0, pose: this.swingFrom },
          { time: PULL_LOAD_MS, pose: reachPose({ ...BACKLIFT,
            hip: [-.09,.86,-.20], chest: [0,1.20,-.15],
            frontFoot: [-.24,.08,.20], backFoot: [-.20,.08,-.36],
            grip: [.26,1.03,-.12], batUp: [-.35,-.85,.39], batFace: [.65,.10,.80],
            yaw: 1.40, leadElbow: -.15 }) },
          { time: PULL_CONTACT_MS, pose: contact },
          { time: 340, pose: through },
          { time: end, pose: finish }];
        this.apply(flowing(keys, age, true));
      } else if (age < hold) this.apply(finish);
      else {
        const recovery = reachPose(stroke.recover!);
        const out = reachPose({ ...PULL.finish, grip: [-.20,1.38,.52], batUp: [1,0,0], batFace: [0,.25,-.97] });
        const first = hold+100, second = hold+240;
        this.apply(age<first ? mix(finish,out,(age-hold)/(first-hold))
          : age<second ? mix(out,recovery,(age-first)/(second-first))
          : mix(recovery,GUARD,(age-second)/(STROKE_DURATION_MS-second)));
      }
      return;
    }
    if (this.squaring) {
      // Its own clock: the extension is longer and flatter than a cover drive's
      // and the turn that follows is what makes the stroke, so neither phase is
      // hurried into the drive's timings.
      const settle = 430;
      if (age < settle) {
        const keys = [{ time: 0, pose: this.swingFrom }, { time: impact, pose: contact },
          { time: 240, pose: reachPose(stroke.through!) }];
        if (stroke.carry) keys.push({ time: 330, pose: reachPose(stroke.carry) });
        keys.push({ time: settle, pose: finish });
        this.apply(shoulderDriven(keys, age, impact));
      } else if (age < 590) this.apply(finish);
      else if (age < 800) {
        const out = reachPose({ ...SQUARE_DRIVE.finish, grip: [.52,1.40,.50], batUp: [-.30,-.80,-.52],
          batFace: [.84,-.12,-.30], armHinge: .2, armDrive: 1, shoulderLift: .04 });
        const clear = 690;
        this.apply(age<clear ? mix(finish,out,(age-590)/(clear-590))
          : mix(out,reachPose(stroke.recover!),(age-clear)/(800-clear)));
      } else this.apply(mix(reachPose(stroke.recover!),GUARD,(age-800)/(STROKE_DURATION_MS-800)));
      return;
    }
    if (!this.charging && (this.shot === 'STRAIGHT' || this.shot === 'COVER_LONG_OFF')) {
      if (age < 410) {
        const keys = [{ time: 0, pose: this.swingFrom }, { time: STROKE_CONTACT_MS, pose: contact },
          { time: 220, pose: reachPose(stroke.through!) }];
        if (stroke.carry) keys.push({ time: 310, pose: reachPose(stroke.carry) });
        keys.push({ time: 410, pose: finish });
        this.apply(shoulderDriven(keys,age,STROKE_CONTACT_MS));
      } else if (age < (this.lofted ? 620 : 570)) this.apply(finish);
      else if (age < 800) {
        const hold=this.lofted?620:570;
        const out=reachPose({ ...stroke.finish, grip: this.shot==='STRAIGHT'?[.46,1.40,.66]:[.58,1.38,.68], batUp: [-1,0,0], batFace: [0,0,1],armHinge:.2,armDrive:1,shoulderLift:.04 });
        const clear=hold+(this.shot==='COVER_LONG_OFF'?110:90);
        this.apply(age<clear?mix(finish,out,(age-hold)/(clear-hold)):mix(out,reachPose(stroke.recover!),(age-clear)/(800-clear)));
      } else this.apply(mix(reachPose(stroke.recover!),GUARD,(age-800)/(STROKE_DURATION_MS-800)));
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
    const driveShot=!this.charging && (this.squaring || this.shot==='STRAIGHT' || this.shot==='COVER_LONG_OFF');
    const idle=!Number.isFinite(this.poseAge) || this.poseAge >= STROKE_DURATION_MS;
    if (!this.felled) {
      const up=UP.clone().applyQuaternion(this.bat.quaternion);
      const impact=this.squaring?SQUARE_DRIVE_CONTACT_MS:STROKE_CONTACT_MS;
      const reference=this.squaring?SQUARE_DRIVE.contact:this.shot==='COVER_LONG_OFF'?STROKES.COVER_LONG_OFF.contact:STROKES.STRAIGHT.contact;
      const referenceQ=batOrientation(STROKES.STRAIGHT.contact).clone().slerp(batOrientation(reference),idle?0:ease(THREE.MathUtils.clamp(this.poseAge/impact,0,1)));
      const referenceUp=UP.clone().applyQuaternion(referenceQ);
      const transported=new THREE.Quaternion().setFromUnitVectors(referenceUp,up).multiply(referenceQ);
      if(idle || (driveShot && this.poseAge<=impact)) this.bat.quaternion.copy(transported);
      else {
        // Return the same corrected guard without snapping the other strokes.
        const duration=STROKE_DURATION_MS;
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
        if (!this.charging && !this.pulling && i===0 && (this.squaring||this.shot==='STRAIGHT'||this.shot==='COVER_LONG_OFF'))
          pole.addScaledVector(spine,Math.max(0,pose.leadElbow)*1.1);
        const drive=THREE.MathUtils.clamp(pose.armDrive??0,0,1);
        if (drive>0 && i===0) {
          const hinge=pose.armHinge??-.6;
          const impact=this.squaring?SQUARE_DRIVE_CONTACT_MS:STROKE_CONTACT_MS;
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
        // Give the helmet room.
        //
        // The pole names the plane the elbow bends in, and nothing above knows
        // where his head is: on any finish that carries the hands up past the
        // ear, the plane that reads best for the swing is the one that folds
        // the upper arm straight through the grille. So as the hands come near
        // the head, lean the plane off it — smoothly, and towards a direction
        // that is defined for every pose, because picking a new clearing plane
        // per frame is exactly what made the elbows flip before.
        //
        // The trigger is measured off the shoulder-to-hand line rather than the
        // elbow, so it does not depend on the bend it is about to change.
        // Give the helmet room.
        //
        // The pole names the plane the elbow bends in, and nothing above knows
        // where his head is: on a finish that carries the hands up past the ear,
        // the plane that reads best for the swing is the one that folds the arm
        // straight through the grille.
        //
        // Measure the arm he would actually get, not the line from his shoulder
        // to his hands — that line passes close to the head on any stroke played
        // under the eyes, while the elbow bows well clear of it, and leaning off
        // a danger that is not there drags the front elbow down through every
        // drive contact. So: solve it, look at the two segments, and only then
        // lean the plane off the head, by an amount that varies smoothly with
        // how close it actually came.
        if (!this.charging) {
          const reach=(from: THREE.Vector3, to: THREE.Vector3) => {
            const line=to.clone().sub(from), span=line.lengthSq();
            const at=span>1e-9 ? THREE.MathUtils.clamp(this.head.position.clone().sub(from).dot(line)/span,0,1) : 0;
            return this.head.position.distanceTo(from.clone().addScaledVector(line,at));
          };
          const first=solveJoint(arm.shoulder,hand,.32,.34,pole);
          const clearance=Math.min(reach(arm.shoulder,first),reach(first,hand));
          const nearness=.9*(1-THREE.MathUtils.smoothstep(clearance,.15,.25));
          if (nearness>0) {
            const along=hand.clone().sub(arm.shoulder);
            if (along.lengthSq()>1e-6) {
              const axisAlong=along.normalize();
              // Away from the head, carrying the shoulder's own outward bearing
              // so that clearing the helmet never means bending into the chest.
              const away=arm.shoulder.clone().sub(this.head.position).normalize()
                .addScaledVector(arm.shoulder.clone().sub(chest).normalize(),.9);
              away.addScaledVector(axisAlong,-away.dot(axisAlong));
              if (away.lengthSq()>1e-6) pole.lerp(arm.shoulder.clone().addScaledVector(away.normalize(),.60),nearness);
            }
          }
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
        // A padded heel joins the closed hand to its wrist. It articulates
        // inside the glove envelope, so wrist movement cannot turn the left
        // knuckles into an open palm or flip the visible grip during a shot.
        this.segment(arm.palm[0],arm.socket.clone().multiplyScalar(.40),arm.socket,.081,.080);
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
      shot: this.shot, pulling: this.pulling, cutting: this.cutting, squaring: this.squaring, lofted: this.lofted, yaw: this.pose.yaw, grip: [...this.pose.grip], frontFoot: [...this.pose.frontFoot], backFoot: [...this.pose.backFoot],
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
      // The grip remains registered to the blade throughout the stroke.
      gripAxis: this.arms.map(arm => UP.clone().applyQuaternion(arm.glove.quaternion).dot(UP)),
      gripRotation: this.arms.map(arm => arm.glove.quaternion.toArray()),
      // Measure the actual padded side, not an arbitrary reference vector:
      // top-hand knuckles face the spine; bottom-hand knuckles face away.
      gloveBack: this.arms.map(arm=>new THREE.Vector3(0,0,
        Math.sign(arm.glove.getObjectByName('Padded knuckle')!.position.z))
        .applyQuaternion(arm.glove.quaternion).toArray()),
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
