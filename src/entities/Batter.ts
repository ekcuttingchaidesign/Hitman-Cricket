import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ADVANCE, CUT, GAME, LINE_X, PUNCH, SQUARE_DRIVE as SQUARE_DRIVE_BALL } from '../config/gameplay';
import { solveJoint } from './rig';
import { bladeGeometry, gripGeometry } from './batGeometry';
import { BendingLimb } from './BendingLimb';
import { ConnectedJersey } from './ConnectedJersey';
import { ConnectedTrousers } from './ConnectedTrousers';
import { clothMaterial, willowMaterial } from './characterMaterials';
import { GRILLE_MOUNT, helmetGeometry, helmetGrilleGeometry, helmetPeakGeometry, helmetRimGeometry } from './helmetGeometry';
import { compactRigidParts } from './compactParts';
import { buildGloveCuff, buildGloveHand, DEFAULT_GLOVE, gloveHeelGeometry, gloveOf, WRIST_HOME, type GloveDesign } from './gloves';
import type { BodyPart, ShotType } from '../game/types';

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
  /**
   * Chin down too, but about his own shoulders' line. `headDown` tips the head
   * about the ground's, which is a nod only while he faces the bowler: turned
   * round to the camera, it put a man looking at the sky to looking at his
   * boots, and one looking at his boots to the sky.
   */
  look?: number;
  heel: number;
  backFootYaw?: number;
  /** The front heel up off a planted toe, as `heel` lifts the back one: the hook's front foot coming round. */
  toe?: number;
  /** Which way the front shoe points, where a stroke turns it further than the body's own share of it. */
  frontFootYaw?: number;
  leadElbow: number;
  /** Shoulder-led drives: elevation of the upper-arm bend plane, not bat roll. */
  armHinge?: number;
  armDrive?: number;
  shoulderLift?: number;
  /**
   * How far the top hand has let go of the bat: nought on the handle, one at
   * `fist`. Only the celebration lets go; every stroke is played two-handed.
   */
  release?: number;
  /** Where the free hand's wrist is, in the batter's own space. */
  fist?: Point;
  /**
   * The bat turned about its own handle, in the bottom hand: the twirl. The
   * gloves are turned back the other way, so the hand holds still and the
   * blade turns in it.
   */
  spin?: number;
  /**
   * Down on both knees, from nought to one: the knees bent forward and down to
   * the turf rather than out towards the off side, and both shoes up on their
   * toes with the shins flat behind. The retired-hurt fall ends there.
   */
  kneel?: number;
  /**
   * How far the bat keeps the face this pose gives it, between balls. Then the
   * face is otherwise the straight drive's, carried onto the handle's line,
   * which has the blade on its edge whatever a pose asks: the scrub's bat,
   * laid on his shoulder on its back with the face to the sky, needs its own.
   */
  ownFace?: number;
}
const V = (p: Point) => new THREE.Vector3(...p);
const UP = new THREE.Vector3(0, 1, 0);
// The top hand exits diagonally toward the handle butt. Two perpendicular
// wrist sockets made the stacked hands read as a rowing/paddle grip.
const wristSocket = (hand: number) => new THREE.Vector3(0,hand===0?.040:.018,hand===0?-.065:-.072);
const ease = (t: number) => t * t * (3 - 2 * t);
export const STROKE_CONTACT_MS = 110;
export const PULL_LOAD_MS = 100;
export const PULL_CONTACT_MS = 200;
export const SQUARE_DRIVE_CONTACT_MS = 130;
/** The sweep takes longer to arrive: he has to get down to it first. */
export const SWEEP_CONTACT_MS = 240;
/**
 * The charge takes longest of all: he has to get down the pitch first. The skip,
 * the stride and the downswing all happen between the swipe and the ball, so
 * the ball is drawn to where he meets it while he comes at it.
 */
export const CHARGE_CONTACT_MS = 300;
/**
 * How far down the pitch of the crease contact the charge meets the ball. He is
 * a third of a metre out of his ground by contact and the ball is met level
 * with the front foot rather than beside the pad, which is where a lofted
 * drive off a charge is hit: on the full, out in front.
 */
export const CHARGE_MEETS_AT = .76;
/**
 * Where the two fists sit on the handle, measured up the bat from its origin.
 * The top hand is the left one; the bottom hand follows it up, and the pair
 * holds the handle the way a right-hander's does. Shared by every stroke.
 */
const HAND = { top: .075, bottom: -.035 } as const;
/** The hand that lets go of the bat to punch the air: the top one, his left. */
const FREE_HAND = 0;
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
 * is hit, he folds, and then he ends up there. The jolt off the body with the
 * free hand already gone to where it hurts; bent over it with the knees
 * giving; and down on both knees, the bat let down in front of him to lean
 * on, the hand still there and the head hanging. He used to finish sitting on
 * the turf with the bat across his shins, which from behind is a heap.
 *
 * The leg solve bends the knee towards a pole out on the off side; `kneel`
 * turns it forward and down, and puts both shoes up on their toes.
 */
const RECOIL: Pose = {
  ...GUARD,
  hip: [-.06, .90, -.09], chest: [.01, 1.23, -.06],
  frontFoot: [-.11, .08, .26], backFoot: [-.14, .08, -.25],
  grip: [.24, .84, .06], batUp: [-.46, -.55, .70], batFace: [.26, .86, .28],
  face: .18, headDown: .16, heel: .10, leadElbow: -.18,
};
/** Where a blow can land: the helmet, the ribs, the gloves, the thigh. */
export type Hurt = BodyPart;
/** Where the free hand goes for a blow on `where`, on the body `body`. */
function clutch(body: Pose, where: Hurt) {
  const ahead = new THREE.Vector3(Math.sin(body.yaw), 0, Math.cos(body.yaw));
  const chest = V(body.chest), spine = chest.clone().sub(V(body.hip)).normalize();
  if (where === 'HELMET') return point(chest.clone().addScaledVector(spine, .30).addScaledVector(outwards(body, 0), .22).addScaledVector(ahead, .02));
  if (where === 'GLOVES') return point(chest.clone().addScaledVector(spine, -.22).addScaledVector(ahead, .22).addScaledVector(outwards(body, 0), .02));
  if (where === 'THIGH') return point(V(body.hip).addScaledVector(ahead, .17).addScaledVector(outwards(body, 0), .08).addScaledVector(UP, -.10));
  return point(shoulderOf(body, 0).addScaledVector(spine, -.19).addScaledVector(outwards(body, 0), .04).addScaledVector(ahead, .07));
}
/** The fall's three shapes, for a blow on `where`. */
function fallPoses(where: Hurt) {
  const look = where === 'HELMET' ? -.32 : .22;
  const recoil: Pose = { ...RECOIL, release: 1, look, fist: clutch(RECOIL, where) };
  // Bent over it, the knees going, the bat coming down in front of him, and
  // turning away from the bowler: from behind, the hand on the hurt was on his
  // far side, out of sight.
  const turning = 2.1, across = new THREE.Vector3(Math.sin(turning), 0, Math.cos(turning));
  const bent: Pose = { ...RECOIL, hip: [-.07, .72, -.08], chest: point(new THREE.Vector3(-.07, 1.02, -.08).addScaledVector(across, .14)),
    yaw: turning, face: turning, heel: .2, grip: [.30, .68, .02], ...hanging(UP.clone().addScaledVector(across, -.8)), release: 1, look: .35 };
  const stagger: Pose = { ...bent, fist: clutch(bent, where) };
  // On both knees, three-quarters to the camera: the hips over the knees, the
  // chest bent forward, the shins flat behind, and the bat stood in front of
  // him with its toe on the turf.
  const yaw = 2.8, ahead = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const hip = new THREE.Vector3(-.10, .50, -.04);
  const chest = hip.clone().add(new THREE.Vector3(0, .26, 0)).addScaledVector(ahead, .20);
  const foot = (s: number) => point(hip.clone().addScaledVector(side, s * .135).addScaledVector(ahead, -.30).setY(.10));
  const batUp = UP.clone().multiplyScalar(.70).addScaledVector(ahead, -.62).normalize();
  const grip = hip.clone().addScaledVector(ahead, .34).addScaledVector(side, .17).setY(.62);
  const body: Pose = { ...RECOIL, hip: point(hip), chest: point(chest), frontFoot: foot(-1), backFoot: foot(1), heel: 0,
    yaw, face: yaw, backFootYaw: yaw, grip: point(grip), batUp: point(batUp), batFace: point(side.clone().negate()), release: 1, kneel: 1, look: .6 };
  const knelt: Pose = { ...body, fist: clutch(body, where) };
  return { recoil, stagger, knelt };
}
/** How long each stage of going down lasts, cumulative from the blow. */
const FALL = { recoil: 140, buckle: 560, settled: 1300 } as const;


const BACKLIFT: Pose = {
  ...GUARD, grip: [0.28, 0.96, 0.11], batUp: [-0.39, -0.73, 0.56], batFace: [0.28, 0.86, 0.30],
  chest: [0.01, 1.29, 0.01], leadElbow: -.24,
};

/**
 * Alive in his guard: between balls he is not a statue. Built from a net clip
 * filmed from in front. In the raised stance the bat is rocked up and down
 * from the wrists (`WAGGLE`), the toe tipping up and back down, and the rest
 * of him goes with it a little (`STIRS`): the knees give with each rock, the
 * weight rolls slowly between his feet, and the shoulders ease round and back,
 * his head staying on the bowler. Before some balls (`TAP.share`) he lets it
 * down until the toe is on the turf behind his back foot, sinking a little
 * over it (`TAPPED`), taps it twice, and lifts it back into the guard. A long
 * wait, before an innings's first ball, has him tap again every so often.
 * The wait between balls is a second or two once a stroke is home, so a tap
 * fits after most balls, though not after the longest things he does then.
 *
 * The bowler waits for a tap he has begun (`tapping`), as a bowler waits for
 * a batter to settle, so it is seen whole rather than cut to a dip.
 *
 * Still by the delivery stride: a tap is not begun once the bowler has set
 * off and is put away by a third of the run-up, the waggle by two-thirds
 * (`still`), so every stroke starts from the guard it always did.
 * Only in the game (`alive`): the previews and the Dressing Room stand still.
 */
const WAGGLE = {
  /** The toe tipped either way, about the hands. */
  tip: .15,
  /** The hands with it, up as the toe goes up. */
  lift: .010,
  /** One rock up and down, drawn afresh each wait. */
  period: [640, 820],
  /** In over this long once he is back in his guard. */
  settle: 600,
  /** Out between these points of the run-up. */
  still: [.50, .68],
} as const;
/**
 * The body with the waggle, so it is not the wrists alone: the hips sink and
 * the chest and hands with them, a little less, once each rock; the weight
 * rolls back and forward between his feet and the shoulders turn with it,
 * over a few rocks. The head's own turn is the world's, not the shoulders',
 * so his eyes stay on the bowler through it.
 */
const STIRS = {
  /** How far the hips, chest and hands sink with each rock. */
  sink: { hip: .012, chest: .009, grip: .007 },
  /** The weight's roll, hips and chest, across and along the crease; and the shoulders' turn with it. */
  roll: { x: .010, z: .014, chest: .7, turn: .035 },
  /** One roll of the weight, in rocks. */
  rocks: 3.3,
} as const;
const TAP = {
  /** The share of balls he taps before. */
  share: .55,
  /** From back in his guard to the bat going down; then down, each tap, and up again. */
  at: 300, down: 380, beat: 240, taps: 2, up: 420,
  /** How high each tap lifts the toe off the turf, and for how much of its beat it is off it. */
  lift: .035, air: .55,
  /** And again every so long, in a long wait. */
  every: 4200,
  /** Put away between these points of the run-up; and never begun once he has set off. */
  still: [.22, .42],
} as const;
/** From the bat's origin, where the hands hold it, to its toe: the blade's own length (`bladeGeometry`). */
const BLADE_TOE = .834;
const TAPPED: Pose = (() => {
  const grip = new THREE.Vector3(.22, .65, .08);
  // On the turf behind his back foot, the blade sloping back to it from the hands.
  const back = new THREE.Vector3(.04, 0, -1).normalize(), drop = grip.y - .015;
  const toe = grip.clone().setY(.015).addScaledVector(back, Math.sqrt(BLADE_TOE ** 2 - drop ** 2));
  const up = grip.clone().sub(toe).normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(V(GUARD.batUp).normalize(), up);
  // Sunk a little more on his knees and over the bat, the head with it.
  return { ...GUARD, hip: [-.06, .87, -.04], chest: [.05, 1.15, .09], grip: grip.toArray() as Point,
    batUp: up.toArray() as Point, batFace: V(GUARD.batFace).applyQuaternion(turn).normalize().toArray() as Point, leadElbow: -.2, headDown: .06 };
})();

/**
 * Stood up out of his stance with the bat let down to hang from the same grip,
 * turned upright: the guard's own bat brought down off his shoulder rather
 * than a new way of holding it. Watching a loft go, and scrubbing the pitch,
 * start from here.
 */
const hanging = (toe: THREE.Vector3) => {
  // `batUp` runs from the toe to the handle, so a hanging bat's points up.
  const to = toe.normalize(), turn = new THREE.Quaternion().setFromUnitVectors(V(GUARD.batUp).normalize(), to);
  return { batUp: to.toArray() as Point, batFace: V(GUARD.batFace).applyQuaternion(turn).normalize().toArray() as Point };
};
const SETTLE_BAT = hanging(new THREE.Vector3(-.08, 1, -.15));
const STANDING: Pose = {
  ...GUARD, hip: [-0.05, 0.99, -0.03], chest: [0.00, 1.37, 0.01],
  grip: [0.24, 0.845, 0.17], ...SETTLE_BAT, yaw: 1.16, leadElbow: -.2,
};
/** How much longer a classic drive holds its finish, for the photograph, when he admires it. */
export const ADMIRE_MS = 400;
/** Where in the drive the hold is taken: inside the finish every drive holds anyway. */
const ADMIRE_AT = 480;
/** When a drive's finish is reached, for keeping it to rehearse. */
const STROKE_FINISH_MS = 410;
/**
 * The cover drive's front foot going down before the bat does. At `at` the
 * foot is planted and the hips are `hips` of the way to contact, while the bat
 * is only `bat` of the way down its arc. The chest keeps pace with the bat, not
 * the hips: leaning out over the ball that early put it in the bat's way on a
 * wide one coming down from high. The finish is held
 * until `hold`, longer than the straight drive's, because the recording holds
 * it so.
 */
const COVER_PLANT = { at: 55, bat: .55, batV3: .62, hips: .85, chest: .45, hold: 600 } as const;
/**
 * Which version of the two strokes off the cover input he plays. One is the
 * game's own cover drive and charge over cover as they always were; two is
 * the cover drive rebuilt from the recording (`STROKES.COVER_LONG_OFF`) and
 * the charge over cover carrying its bat up into the finish without turning
 * it in his hands. The game picks one at each cover swipe, half and half; it
 * is how he plays the stroke, not how well, so nothing scored depends on it.
 */
export type CoverVersion = 1 | 2 | 3;
/** How often each version of the cover strokes is played, by the cover swipe. */
export const COVER_ODDS: Record<CoverVersion, number> = { 1: .4, 2: .2, 3: .4 };
/** The version a roll of the dice in [0, 1) plays, by `COVER_ODDS`. */
export function coverVersionOf(roll: number): CoverVersion {
  return roll < COVER_ODDS[1] ? 1 : roll < COVER_ODDS[1] + COVER_ODDS[2] ? 2 : 3;
}
/**
 * The roll for the ball an innings has reached, from its seed: the same ball
 * of the same innings always rolls the same, so two rivals on one seed play
 * the same version off it, and nothing is taken from the seed's own stream,
 * which would move every ball bowled after it. (A 32-bit mix, murmur's last
 * step, over the seed and the ball.)
 */
export function coverRoll(seed: number, ball: number) {
  let h = (seed ^ Math.imul(ball + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ h >>> 16, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ h >>> 13, 0xc2b2ae35) >>> 0;
  return ((h ^ h >>> 16) >>> 0) / 2 ** 32;
}
/**
 * Version three of the cover drive meets the ball this much further down the
 * pitch than every other drive: beside the front pad, under his eyes, where
 * the recording meets it, rather than a stride behind it. The swipe is judged
 * as for the other two all the same: the version is drawn after the swipe,
 * so a player cannot time for it. Like version two it keeps the ball down,
 * so it goes for four at most (`ShotAttempt.grounded`).
 */
export const COVER_V3_MEETS_AT = .28;
/**
 * The on drive meets the ball this much further down the pitch than the
 * straight drive: beside the front pad, at the end of a stride turned towards
 * mid-on (`STROKES.LONG_ON`), lofted or along the ground. Met where the
 * straight drive meets it, the hands were pulled back into him and the top
 * arm ran out of length.
 */
export const ON_DRIVE_MEETS_AT = .16;
/**
 * The cover drive as it was before it was rebuilt: version one. Its contact
 * is also the face the charge over cover brings the bat down with, in either
 * version, which is what that charge was drawn against.
 */
const COVER_DRIVE_V1: Stroke = {
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
};
/** When the cover drive's way home passes back through its own keys. */
const COVER_HOME = { carry: 670, through: 740, under: 828 } as const;
/**
 * The on drive's six, on its own clock after the ball: into the wrap a little
 * later than a drive reaches its finish, the wrap held, and home back over his
 * head to the carry, down the line and under him. From over the shoulder the
 * bat has the whole of the way over his head to come back first, which on the
 * cover drive's clock it was given fifty milliseconds for, and the elbows
 * flipped doing it.
 */
const ON_LOFT_CLOCK = { rolls: 200, wrapped: 440, hold: 580, carry: 700, through: 770, under: 866 };
/** When the six's wrap is let go: until then nothing turns the bat in his hands but the roll through the carry. */
export const ON_LOFT_HOLD = ON_LOFT_CLOCK.hold;
/** When the six's bottom hand rolls over the top one: through the carry, from the extension to the wrap. */
export const ON_LOFT_ROLL = [ON_LOFT_CLOCK.rolls, ON_LOFT_CLOCK.wrapped] as const;
/** How close the grip may come to the middle of the helmet: its radius, a forearm's, and a little air. */
const HANDS_CLEAR = .36;
/** The middle of the helmet's dome, from the head's own origin. */
const HELMET_CENTRE = new THREE.Vector3(0, .04, 0);
/** The bottom of the grille, under the chin, from the head's own origin. */
const CHIN_GUARD = new THREE.Vector3(0, -.18, .13);
/** How far the handle's end is from the grip, along the bat. */
const KNOB = .23;
/** How close the handle's end may come to the bottom of the grille: round it, and a little air. */
const KNOB_CLEAR = .14;

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
 * over the back leg, his head leaning away outside the line of the ball, and
 * strikes it square with a horizontal bat, the arms out straight at it and the
 * flat face looking back up the pitch at the ball, a little over it. Then the
 * arc keeps going: the wrists roll, the body unwinds on the back foot, and the
 * bat wraps up and over the front shoulder with the curved back of the blade
 * against it — which is where a cut finishes, and what the off-side punch beside
 * it deliberately does not do.
 *
 * The front shoulder is the left one, so the wrap crosses the chest. Both hands
 * stay in front of it: a two-handed grip cannot be taken round the back, and the
 * finish is high beside the head rather than behind it.
 *
 * The face rides the handle (`riding`, in `update`) and turns only twice: to
 * the bowler as the bat comes down, and over as the elbows fold into the wrap.
 * Drawn from these keys alone it looked at the keeper, so the back of the blade
 * met the ball.
 */
const CUT_STROKE: Stroke = {
  contact: { ...GUARD, hip: [-.13, .74, -.20], chest: [-.05, 1.06, -.02],
    frontFoot: [-.17, .08, .15], backFoot: [-.09, .08, -.42],
    grip: [.34, .86, .22], batUp: [-.93, .22, -.29], batFace: [0, -.25, 1],
    yaw: 1.46, face: .54, heel: .04, leadElbow: .05 },
  // The hands finish high and in front of the chest with the blade wrapped up
  // over the front shoulder. Carrying the hands themselves round to that
  // shoulder is where the swing wants to take them, and it is a place a
  // two-handed grip cannot go: the arms end up across the back of the neck.
  finish: { ...GUARD, hip: [-.06, .87, -.24], chest: [.05, 1.26, -.14],
    frontFoot: [-.17, .08, .15], backFoot: [-.09, .08, -.42],
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
    grip: [.30, 1.14, .34], batUp: [-.15, -.80, -.58], batFace: [-.66, .52, -.55],
    yaw: .86, face: .34, heel: .10, leadElbow: -.20 },
};
/**
 * The same stroke to a ball at the chest. Short and wide is the cut's own ball:
 * he stands up out of the crouch rather than reaching down, and cuts it square
 * from higher up — the difference between a cut off a length and one off a
 * bouncer is where he stands, not what he does.
 */
const CUT_HIGH: Stroke = {
  contact: { ...CUT_STROKE.contact, hip: [-.15, .90, -.20], chest: [-.18, 1.27, -.05],
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
/**
 * How far the ball is left out from where his body goes. He follows it across
 * by this much less than its width, rather than by the drives' share of it, so
 * the arms are out straight at every ball: by the share, the hands were under
 * his chin, the elbows bent to 60 degrees off a length and 25 at the chest.
 */
const CUT_ROOM = .3;
/**
 * The cut off the spinner, from a net session filmed from in front. The ball
 * is slower, so he has time to make room for it: as the bat goes up high he
 * steps away to leg, the back foot back to his stumps and the front one out
 * wide, until the ball, on whatever line, is out on his off side the same
 * distance away (`SPIN_CUT_ROOM`). Then off the back foot, the weight sunk on
 * that leg and the front one long: the bat comes down from high and meets the
 * ball low and away towards off with both arms straight, and carries on level
 * to off, then rises upright in front of him as the chest comes round
 * square, the hands up beside his face, and tips back past the leg side of
 * his head onto the front shoulder, the gloves stopping at the peak of the
 * helmet with the elbows down either side of his face. The hands never go
 * over his head, and the bat never goes over it: built first that way, it
 * read as forced. Held there (`SPIN_CUT_HOLD_MS`), as the hook is, then home
 * the way it came. The face rides the handle, as the hook's does: the
 * forearms square it to the ball on the way down, and the bottom hand rolls
 * it over as the bat tips back, so the back of the blade lies on the shoulder.
 */
export const SPIN_CUT_LOAD_MS = 100;
export const SPIN_CUT_CONTACT_MS = 190;
/** How far out on his off side the ball is left once he has made room: what a cut wants. */
const SPIN_CUT_ROOM = .32;
/** The time the bat is held on the shoulder past the stroke's own clock, and the way home slowed with it, as the hook's is. */
export const SPIN_CUT_HOLD_MS = 300;
const SPIN_CUT_CLOCK = { load: SPIN_CUT_LOAD_MS, contact: SPIN_CUT_CONTACT_MS, through: 260, rise: 350, up: 435, tip: 478, finish: 520, hold: 680, untip: 722, unwrap: 770, upright: 825, lowered: 880 } as const;
const SPIN_CUT: Stroke & { load: Pose; rise: Pose; up: Pose; tip: Pose; off: Pose; upright: Pose; lowered: Pose } = {
  // Room made, the bat high: the back foot back to his stumps, the front one out wide to leg.
  load: { ...BACKLIFT, hip: [0, .86, -.14], chest: [.04, 1.21, -.10],
    frontFoot: [-.50, .08, .04], backFoot: [.08, .08, -.30],
    grip: [.34, 1.42, -.04], batUp: [-.15, -.85, .50], batFace: [.85, .05, .50],
    yaw: .95, face: 1.0, heel: .04, backFootYaw: 1.2, leadElbow: -.10 },
  // Down on the back foot, the arms straight out and down to the ball, the bat sloping to it.
  contact: { ...GUARD, hip: [-.04, .82, -.17], chest: [.04, 1.13, -.14],
    frontFoot: [-.50, .08, .04], backFoot: [.08, .08, -.30],
    grip: [.28, .77, .15], batUp: [-.78, .52, -.34], batFace: [.10, .40, .91],
    yaw: 1.20, face: 1.15, heel: .05, backFootYaw: 1.2, leadElbow: 0 },
  // On through it, level, out towards off,
  through: { ...GUARD, hip: [-.04, .83, -.15], chest: [.08, 1.15, -.06],
    frontFoot: [-.50, .08, .04], backFoot: [.08, .08, -.30],
    grip: [.40, .98, .30], batUp: [-.98, .05, -.15], batFace: [.15, .20, .97],
    yaw: .75, face: .95, heel: .08, backFootYaw: 1.15, leadElbow: 0 },
  // then up in front of him as the chest comes round,
  rise: { ...GUARD, hip: [-.04, .84, -.14], chest: [.04, 1.18, -.04],
    frontFoot: [-.50, .08, .04], backFoot: [.08, .08, -.30],
    grip: [.18, 1.25, .38], batUp: [.05, -.95, -.20], batFace: [.10, -.20, .97],
    yaw: .35, face: .45, heel: .10, backFootYaw: 1.05, leadElbow: -.05 },
  // the hands up beside his face and the blade tipping back over the leg side,
  up: { ...GUARD, hip: [-.04, .86, -.13], chest: [.02, 1.20, -.05],
    frontFoot: [-.50, .08, .04], backFoot: [.08, .08, -.30],
    grip: [.16, 1.52, .38], batUp: [.40, -.85, .25], batFace: [.10, .50, .86],
    yaw: .12, face: .15, heel: .10, backFootYaw: 1.0, leadElbow: -.10, look: -.05 },
  // out to the leg side past his ear rather than back over the top of his head,
  tip: { ...GUARD, hip: [-.04, .86, -.13], chest: [.015, 1.20, -.055],
    frontFoot: [-.50, .08, .04], backFoot: [.08, .08, -.30],
    grip: [.12, 1.60, .34], batUp: [.85, -.35, .10], batFace: [0, .27, .96],
    yaw: .06, face: .08, heel: .09, backFootYaw: 1.0, leadElbow: -.10 },
  // and back past his head onto the front shoulder, the gloves at the peak of
  // the helmet and the elbows down either side of his face.
  finish: { ...GUARD, hip: [-.04, .86, -.13], chest: [.01, 1.20, -.06],
    frontFoot: [-.50, .08, .04], backFoot: [.08, .08, -.30],
    grip: [.08, 1.64, .28], batUp: [.80, .25, .55], batFace: [.45, -.80, -.40],
    yaw: 0, face: 0, heel: .08, backFootYaw: 1.0, leadElbow: -.10 },
  // Home: off the shoulder out to the leg side the way it came, the hands
  // pushed out in front of his face to stand it up clear of the helmet, then
  // upright in front of him, then let down into his guard.
  off: { ...GUARD, hip: [-.04, .86, -.12], chest: [.02, 1.21, -.04],
    frontFoot: [-.50, .08, .04], backFoot: [.08, .08, -.30],
    grip: [.14, 1.58, .42], batUp: [.35, -.80, .45], batFace: [.10, .50, .86],
    yaw: .12, face: .15, heel: .10, backFootYaw: 1.0, leadElbow: -.10 },
  upright: { ...GUARD, hip: [-.03, .91, -.08], chest: [.0, 1.27, -.02],
    frontFoot: [-.30, .08, .12], backFoot: [.0, .08, -.32],
    grip: [.02, 1.62, .44], batUp: [0, -1, .10], batFace: [0, .10, 1],
    yaw: .25, face: .10, heel: .08, backFootYaw: 1.0, leadElbow: -.10 },
  lowered: { ...GUARD, hip: [-.05, .92, -.06], chest: [0, 1.28, 0],
    frontFoot: [-.16, .08, .18], backFoot: [-.05, .08, -.28],
    grip: [.22, 1.20, .36], batUp: [-.25, -.85, .45], batFace: [.20, .45, .87],
    yaw: .60, face: -.05, heel: .08, backFootYaw: .95, leadElbow: -.20 },
};
/** How far the spinner's cut will go for a ball: from outside leg, which is a long way to go, to wide of off. */
const SPIN_CUT_REACH: readonly [number, number] = [-.30, .45];
/**
 * The late cut, from a coaching film shot from in front, square on the off
 * side, and from the bowler's end. Off the back foot, the ball let come past
 * him: the back foot goes a long way back towards his stumps and across
 * towards off, and he sinks on it until the back knee is nearly on the turf,
 * the front leg left where it was, bent at the knee, the weight all down on
 * the back one. The bat is held up high while he goes down, and comes down
 * late and steep, the hands out on the off side at his hip, to meet the ball
 * beside the back pad (`LATE_CUT_MEETS_AT` behind the other strokes' contact)
 * with the face open to third man. Not struck: the ball is shown the way, and
 * the blade goes on down to point at the turf behind him, held there with the
 * head down over the hands and the eyes after the ball, before he gets up out
 * of it into his guard.
 */
export const LATE_CUT_LOAD_MS = 110;
export const LATE_CUT_CONTACT_MS = 230;
/** How far behind the other strokes' contact the ball is met: beside the back pad, let come past him. */
export const LATE_CUT_MEETS_AT = -.40;
const LATE_CUT_CLOCK = { load: LATE_CUT_LOAD_MS, contact: LATE_CUT_CONTACT_MS, down: 310, hold: 620, rise: 740, upright: 830 } as const;
const LATE_CUT: Stroke & { load: Pose; rise: Pose; upright: Pose } = {
  // Back and across, going down, the bat still up.
  load: { ...BACKLIFT, hip: [.00, .76, -.24], chest: [.08, 1.10, -.14],
    frontFoot: [-.10, .08, .26], backFoot: [.10, .08, -.60],
    grip: [.34, 1.06, .18], batUp: [-.35, -.82, .45], batFace: [.80, -.10, .58],
    yaw: .95, face: .60, heel: .02, backFootYaw: 1.15, leadElbow: .05, look: .15 },
  // Low on the back knee, the hands out at the hip, the bat trailing back to
  // the ball beside the back pad with the face open.
  contact: { ...GUARD, hip: [.02, .60, -.30], chest: [.15, .93, -.15],
    frontFoot: [-.10, .08, .26], backFoot: [.12, .08, -.62],
    grip: [.40, .66, .26], batUp: [-.55, .20, .81], batFace: [.83, -.05, .56],
    yaw: 1.25, face: 1.10, heel: .05, backFootYaw: 1.10, leadElbow: .15, look: .35 },
  // On down: the toe to the turf behind him, held.
  finish: { ...GUARD, hip: [.02, .58, -.31], chest: [.15, .91, -.17],
    frontFoot: [-.10, .08, .26], backFoot: [.12, .08, -.62],
    grip: [.42, .62, .22], batUp: [-.45, .55, .70], batFace: [.85, .00, .55],
    yaw: 1.25, face: 1.25, heel: .05, backFootYaw: 1.10, leadElbow: .15, look: .45 },
  // Up out of it: the toe lifted off the turf and out towards point, clear of
  // the back arm, as he stands,
  rise: { ...GUARD, hip: [-.01, .78, -.20], chest: [.07, 1.12, -.09],
    frontFoot: [-.10, .08, .26], backFoot: [.06, .08, -.52],
    grip: [.36, .88, .30], batUp: [-.85, .05, .52], batFace: [.45, .55, .70],
    yaw: 1.05, face: .70, heel: .04, backFootYaw: 1.20, leadElbow: -.10, look: .15 },
  // and back across into his crease.
  upright: { ...GUARD, hip: [-.04, .90, -.08], chest: [.03, 1.25, -.01],
    frontFoot: [-.10, .08, .27], backFoot: [-.08, .08, -.32],
    grip: [.28, .94, .14], batUp: [-.40, -.62, .66], batFace: [.35, .78, .52],
    yaw: 1.22, face: .20, heel: .02, backFootYaw: 1.30, leadElbow: -.30 },
};
/** How wide the late cut reaches: off stump and outside it, where its ball is. */
const LATE_CUT_REACH: readonly [number, number] = [.08, .60];
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
  /**
   * The on drive: the straight drive played to long-on. Every key is the
   * straight drive's turned 24 degrees about his back foot, which is how the
   * stroke goes: the back foot stays where it is and the front foot strides
   * down the line of a ball on leg stump, pointing towards mid-on, the head
   * over the ball; the bat comes down straight with its face closed towards
   * mid-on and meets the ball beside the front pad. After the ball the arms go
   * out along the line to long-on and the hands finish high in front of him,
   * the blade pointing up the ground after the ball. Turned as one, the arms
   * keep every relation to the trunk the straight drive has. It used to meet
   * the ball and then whip the bat across the front of him and over the
   * leg-side shoulder, a flick's finish, with the blade turning in his hands.
   * Keyed for the ball on leg stump: the reach moves him from there.
   */
  LONG_ON: {
    contact: { ...GUARD, hip: [-.08, .74, -.073], chest: [.003, 1.08, .062], frontFoot: [-.116, .08, .524], backFoot: [.083, .08, -.34],
      grip: [.38, .97, .394], batUp: [.101, .985, -.141], batFace: [-.407, .12, .914], yaw: .86, face: -.15, heel: .10,
      backFootYaw: .86, leadElbow: .20, armHinge: .90, armDrive: .8, shoulderLift: 0 },
    through: { ...GUARD, hip: [.043, .82, .168], chest: [.13, 1.16, .316], frontFoot: [-.116, .08, .524], backFoot: [.085, .08, -.295],
      grip: [.202, 1.03, .917], batUp: [.372, .62, -.688], batFace: [-.252, .78, .566], yaw: .10, face: -.30, heel: .22,
      backFootYaw: .44, leadElbow: .24, armHinge: .55, armDrive: 1, shoulderLift: .04 },
    carry: { ...GUARD, hip: [.044, .84, .19], chest: [.127, 1.18, .347], frontFoot: [-.116, .08, .524], backFoot: [.086, .08, -.273],
      grip: [.141, 1.28, .956], batUp: [.411, -.26, -.873], batFace: [.142, .965, -.221], yaw: -.10, face: -.33, heel: .26,
      backFootYaw: .58, leadElbow: .26, armHinge: 1.00, armDrive: 1, shoulderLift: .05 },
    finish: { ...GUARD, hip: [.049, .86, .203], chest: [.123, 1.20, .357], frontFoot: [-.116, .08, .524], backFoot: [.087, .08, -.251],
      grip: [.155, 1.54, .874], batUp: [.377, -.66, -.65], batFace: [.323, .75, -.579], yaw: -.20, face: -.36, heel: .30,
      backFootYaw: .50, leadElbow: .28, armHinge: 1.65, armDrive: 1, shoulderLift: .06 },
    // The lofted on drive's way home, which takes this: from high over the
    // leg-side shoulder, the far side of him from the guard, the bat comes
    // home across the front where he can see it, and the front foot comes
    // back under him on the way. The on drive along the ground goes home back
    // along its own swing, as the cover drive does.
    recover: { ...GUARD, hip: [-.14, .90, .10], chest: [-.03, 1.25, .16], frontFoot: [-.26, .08, .44],
      grip: [.22, 1.10, .42], batUp: [-.15, -.80, -.58], batFace: [.86, -.22, .17],
      yaw: .80, face: -.20, heel: .10, leadElbow: -.18 },
  },
  /**
   * The cover drive, from a broadcast recording of a right-hander filmed
   * side-on from the off side in slow motion, and from the bowler's end at
   * match speed.
   *
   * He gets down into it: a long stride with the front knee bent over the
   * foot, the hips low and forward, the back leg long behind him with the
   * heel up and the foot on its toe, and the head and chest out over the
   * line of the ball rather than stood up over the hips. The front foot is
   * down before the bat comes (`COVER_PLANT`). After the ball the hands go
   * up first along the line to cover with the blade still hanging under
   * them; the blade comes up last, and the finish is the hands just over
   * the helmet with the bat pointing out after the ball to cover and down,
   * held — a checked drive, not one swung over the shoulder.
   */
  COVER_LONG_OFF: {
    contact: { ...GUARD, hip: [.08, .82, .16], chest: [.23, 1.16, .24], frontFoot: [.15, .08, .60], backFoot: [-.15, .08, -.40],
      grip: [.50, .98, .35], batUp: [.30, .95, -.06], batFace: [.42, .10, .90], yaw: 1.40, face: .28, heel: .36, backFootYaw: 1.20, leadElbow: .14,
      look: .22, armHinge: .92, armDrive: 1, shoulderLift: 0 },
    through: { ...GUARD, hip: [.09, .80, .20], chest: [.25, 1.14, .30], frontFoot: [.15, .08, .60], backFoot: [-.15, .08, -.40],
      grip: [.66, 1.12, .86], batUp: [-.20, .97, -.12], batFace: [.42, .1, .90], yaw: 1.02, face: .28, heel: .46, backFootYaw: 1.10, leadElbow: .16,
      look: .20, armHinge: .80, armDrive: 1, shoulderLift: .05 },
    // Hands up to the chin before the blade comes up: it still points down and
    // out after the ball.
    carry: { ...GUARD, hip: [.10, .80, .22], chest: [.27, 1.14, .34], frontFoot: [.15, .08, .60], backFoot: [-.15, .08, -.40],
      grip: [.62, 1.30, .78], batUp: [-.35, .80, -.48], batFace: [.45, .45, .77], yaw: .98, face: .29, heel: .52, backFootYaw: 1.05, leadElbow: .30,
      look: .16, armHinge: 1.30, armDrive: 1, shoulderLift: .07 },
    finish: { ...GUARD, hip: [.11, .80, .23], chest: [.28, 1.14, .35], frontFoot: [.15, .08, .60], backFoot: [-.15, .08, -.40],
      grip: [.54, 1.54, .68], batUp: [-.62, .48, -.62], batFace: [.20, .88, .44], yaw: .95, face: .30, heel: .56, backFootYaw: 1.00, leadElbow: .42,
      look: .12, armHinge: 1.65, armDrive: 1, shoulderLift: .08 },
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
  // The block: two strokes, the forward defence and the back-foot defence, by
  // the length of the ball. See `DEFENCE_FRONT` and `DEFENCE_BACK`.
  DEFEND: null as unknown as Stroke,
  SQUARE_CUT: CUT_STROKE,
  // Both run their own branch of `update` off their own clocks; they sit in
  // the table so every shot has a stroke, and are set below where they are
  // authored, after the sweep whose kneel the reverse borrows.
  SCOOP: null as unknown as Stroke,
  REVERSE_SCOOP: null as unknown as Stroke,
  HOOK: null as unknown as Stroke,
  LATE_CUT: LATE_CUT,
};
/**
 * Version three: version two's stroke with the whole body gone forward to the
 * ball, met beside the front pad (`COVER_V3_MEETS_AT`). The hips and chest are
 * a sixth of a metre further on, the head over the ball and the front knee,
 * the front knee bent deeper over the foot; and the back foot slides back less
 * than version two's, because the hips are nearer it.
 */
const COVER_DRIVE_V3: Stroke = (() => {
  const v2 = { contact: { hip: [.08, .80, .30], chest: [.25, 1.16, .38], frontFoot: [.15, .08, .62], backFoot: [-.15, .08, -.34] },
    through: { hip: [.09, .79, .33], chest: [.27, 1.12, .44], grip: [.68, 1.10, 1.00] },
    carry: { hip: [.10, .79, .34], chest: [.28, 1.13, .46], grip: [.64, 1.28, .92] },
    finish: { hip: [.11, .79, .34], chest: [.29, 1.13, .46], grip: [.56, 1.52, .80] } } as const;
  const feet = { frontFoot: v2.contact.frontFoot as Point, backFoot: v2.contact.backFoot as Point };
  const stroke = (key: 'contact' | 'through' | 'carry' | 'finish') => ({ ...STROKES.COVER_LONG_OFF[key]!, ...feet, ...(v2[key] as Partial<Pose>) });
  return { contact: stroke('contact'), through: stroke('through'), carry: stroke('carry'), finish: stroke('finish'), recover: STROKES.COVER_LONG_OFF.recover };
})();

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
// A bouncer on the body or the stumps is pulled, on the leg-side input, so it
// needs its own reach as well. It comes in two versions (`PullVersion`):
// version two is the hook's stroke, after the hook's, below; version one is
// played off the back foot without the turn, here.
/**
 * Pull version one: the first build's body — back onto the back leg, side
 * on, the hips opening only as far as square — with the bat swung as the net
 * clip swings it. The bat goes up high behind the back shoulder, comes down
 * level, and meets the ball with the flat face to the bowler and the arms out
 * at it; it goes on round flat, out in front and then out to leg with the arms
 * long, and only then do the elbows fold and the bat wrap over the front
 * shoulder, the bottom hand rolling over the top one so that the curved back
 * of the blade lies on it. No turn after it: he holds it standing where he
 * hit it. The first build's backlift stopped at his hip, it met the ball with
 * the face looking at square leg and the hands at his chest, and the bat
 * finished upright beside the shoulder with its face side on to it.
 */
export const PULL_V1_LOAD_MS = 120;
export const PULL_V1_CONTACT_MS = 230;
/** How long version one holds the wrap past the stroke's own clock before it comes home, at its own pace. */
export const PULL_V1_HOLD_MS = 250;
const PULL_V1_CLOCK = { load: PULL_V1_LOAD_MS, down: 180, contact: PULL_V1_CONTACT_MS, front: 285, through: 340, rise: 420, finish: 500, hold: 570 } as const;
const PULL_V1: Stroke & { load: Pose; down: Pose; front: Pose; rise: Pose } = {
  load: { ...BACKLIFT, hip: [-.09, .86, -.20], chest: [0, 1.20, -.15],
    frontFoot: [-.24, .08, .20], backFoot: [-.20, .08, -.36],
    grip: [.30, 1.36, -.18], batUp: [-.20, -.88, .43], batFace: [.65, .10, .80],
    yaw: 1.40, leadElbow: -.15 },
  // The hands come down in front of his chest with the bat sloping up behind
  // them, before they go across to the ball: from the backlift straight to a
  // ball on leg stump they crossed in front of his face.
  down: { ...GUARD, hip: [-.11, .86, -.23], chest: [-.02, 1.20, -.25],
    frontFoot: [-.28, .08, .17], backFoot: [-.20, .08, -.36],
    grip: [.18, 1.22, .06], batUp: [-.70, -.30, .65], batFace: [.66, .05, .75],
    yaw: 1.00, face: .05, heel: .06, backFootYaw: 1.20, leadElbow: -.12 },
  contact: { ...GUARD, hip: [-.13, .86, -.25], chest: [-.04, 1.20, -.32],
    frontFoot: [-.30, .08, .16], backFoot: [-.20, .08, -.36],
    grip: [-.04, 1.16, .12], batUp: [-.90, .08, -.42], batFace: [-.42, .02, .91],
    yaw: .62, face: -.25, heel: .10, backFootYaw: 1.05, leadElbow: -.10 },
  front: { ...GUARD, hip: [-.15, .87, -.24], chest: [-.08, 1.22, -.24],
    frontFoot: [-.30, .08, .16], backFoot: [-.20, .08, -.36],
    grip: [-.24, 1.18, .40], batUp: [-.10, .02, -.99], batFace: [-.99, .02, .10],
    yaw: .30, face: -.45, heel: .18, backFootYaw: .80, leadElbow: -.05 },
  through: { ...GUARD, hip: [-.17, .88, -.22], chest: [-.12, 1.24, -.15],
    frontFoot: [-.31, .08, .15], backFoot: [-.20, .08, -.36],
    grip: [-.55, 1.24, .34], batUp: [.95, -.10, -.30], batFace: [-.30, -.05, -.95],
    yaw: .05, face: -.65, heel: .28, backFootYaw: .55, leadElbow: -.05 },
  rise: { ...GUARD, hip: [-.17, .89, -.16], chest: [-.14, 1.25, -.07],
    frontFoot: [-.33, .08, .12], backFoot: [-.18, .08, -.34],
    grip: [-.55, 1.48, .30], batUp: [.30, -.75, .59], batFace: [.95, .20, -.24],
    yaw: -.20, face: -.75, heel: .36, backFootYaw: .38, leadElbow: -.08 },
  finish: { ...GUARD, hip: [-.17, .90, -.10], chest: [-.16, 1.26, .00],
    frontFoot: [-.34, .08, .10], backFoot: [-.17, .08, -.33],
    grip: [-.42, 1.62, .26], batUp: [-.30, -.40, .87], batFace: [.93, -.22, .30],
    yaw: -.38, face: -.80, heel: .42, backFootYaw: .25, leadElbow: -.10 },
  recover: { ...GUARD, grip: [.36, 1.10, .40], batUp: [-.15, -.80, -.58],
    batFace: [.86, -.22, .17], yaw: .70, heel: .04 },
};
const PULL_REACH: readonly [number, number] = [-.55, .32];
/**
 * The hook, at a bouncer on or outside off: Tendulkar's off Caddick in 2003,
 * and a net session filmed end on in slow motion, for the hands. He goes back
 * and across first, the back foot over towards off stump and the front one
 * drawn back and opened, with the bat taken high over the back shoulder. The
 * hands come down and out, and the ball is met well away from him, out in
 * front and towards off, with both arms straight and the bat level, its face
 * to the bowler. Then the arms swing it round flat, like a baseball bat: out
 * in front of him, then to leg, then round behind square, the arms still
 * long and the chest turning with them, the face going round with the body
 * and never turning in his hands. Only then do the elbows fold and the bat
 * wraps behind his head, the hands up over the front shoulder, his head
 * turned after the ball to fine leg. Met at `HOOK_MEETS_AT` down the pitch,
 * in front of him, so that a ball going away to fine leg climbs over him
 * rather than through him.
 */
export const HOOK_LOAD_MS = 100;
export const HOOK_CONTACT_MS = 200;
/** How far down the pitch of the crease the hook meets the ball: out in front, arms straight. */
export const HOOK_MEETS_AT = .45;
/**
 * How much longer the hook takes than the other strokes, all of it once he
 * has turned round, which runs that much slower: the hold, and home,
 * unhurried rather than snapped out of, as admiring a drive holds its finish
 * the longer. The swing and the turn keep the swing's own tempo: slowed from
 * the wrap, the turn after it went into slow motion half way through a stroke.
 */
export const HOOK_HOLD_MS = 420;
const HOOK_CLOCK = { load: HOOK_LOAD_MS, down: 160, contact: HOOK_CONTACT_MS, front: 255, leg: 315, round: 395, rise: 450, finish: 520, turned: 600, faced: 720, hold: 770, unwrap: 850, lowered: 895 } as const;
const HOOK: Stroke & { load: Pose; down: Pose; front: Pose; leg: Pose; round: Pose; rise: Pose; turned: Pose; faced: Pose; unwrap: Pose; lowered: Pose } = {
  // Back and across, the front foot drawn back and opened, the bat high over the back shoulder.
  load: { ...BACKLIFT, hip: [-.12, .95, -.14], chest: [-.10, 1.30, -.10],
    frontFoot: [-.26, .08, .02], backFoot: [.10, .08, -.38],
    grip: [.20, 1.58, -.05], batUp: [-.18, -.85, .49], batFace: [.85, -.05, .40],
    yaw: .75, face: .35, heel: .04, backFootYaw: .95, leadElbow: -.10 },
  // The hands come down and out, the bat level behind them pointing off and back.
  down: { ...GUARD, hip: [-.15, .95, -.10], chest: [-.14, 1.30, -.02],
    frontFoot: [-.26, .08, .02], backFoot: [.10, .08, -.38],
    grip: [.14, 1.30, .24], batUp: [-.70, .05, .71], batFace: [.71, .05, .70],
    yaw: .45, face: .35, heel: .06, backFootYaw: .90, leadElbow: -.04 },
  // Met out in front and towards off, both arms long, the bat level, the face to the bowler.
  contact: { ...GUARD, hip: [-.21, .95, -.08], chest: [-.22, 1.30, -.02],
    frontFoot: [-.26, .08, .02], backFoot: [.10, .08, -.38],
    grip: [.06, 1.16, .58], batUp: [-.92, .05, -.38], batFace: [-.38, .05, .92],
    yaw: .20, face: .35, heel: .10, backFootYaw: .85, leadElbow: 0 },
  // Swung round flat with the arms still long: straight out in front of him,
  front: { ...GUARD, hip: [-.20, .95, -.08], chest: [-.21, 1.31, -.01],
    frontFoot: [-.26, .08, .02], backFoot: [.10, .08, -.38],
    grip: [-.22, 1.22, .70], batUp: [-.05, 0, -1], batFace: [-1, .05, -.05],
    yaw: -.10, face: 0, heel: .18, backFootYaw: .75, leadElbow: 0 },
  // then out to leg, the bat climbing a little,
  leg: { ...GUARD, hip: [-.20, .95, -.06], chest: [-.24, 1.31, 0],
    frontFoot: [-.26, .08, .02], backFoot: [.10, .08, -.37],
    grip: [-.66, 1.30, .60], batUp: [.85, -.25, -.46], batFace: [-.48, .10, -.87],
    yaw: -.45, face: -.50, heel: .26, backFootYaw: .60, leadElbow: 0 },
  // then round behind square, the arms still out, the chest turned to leg.
  round: { ...GUARD, hip: [-.20, .95, -.07], chest: [-.26, 1.32, -.04],
    frontFoot: [-.26, .08, .02], backFoot: [.10, .08, -.36],
    grip: [-.60, 1.48, 0], batUp: [.55, -.45, .70], batFace: [.79, .10, -.62],
    yaw: -1.05, face: -1.35, heel: .38, backFootYaw: .38, leadElbow: 0, look: -.15 },
  // The elbows fold, the hands coming up in front of his face on the leg side
  // and the bat still going round, behind him now,
  rise: { ...GUARD, hip: [-.20, .95, -.08], chest: [-.25, 1.32, -.05],
    frontFoot: [-.26, .08, .02], backFoot: [.10, .08, -.36],
    grip: [-.52, 1.72, .22], batUp: [.05, -.20, .98], batFace: [.95, .15, -.02],
    yaw: -1.25, face: -1.70, heel: .44, backFootYaw: .24, leadElbow: -.05, look: -.25 },
  // and the bat wraps behind his head, the hands over the front shoulder.
  finish: { ...GUARD, hip: [-.20, .95, -.08], chest: [-.25, 1.32, -.06],
    frontFoot: [-.26, .08, .0], backFoot: [.10, .08, -.35],
    grip: [-.52, 1.90, -.06], batUp: [-.62, .45, .64], batFace: [.62, .78, 0],
    yaw: -1.40, face: -1.95, heel: .50, backFootYaw: .14, leadElbow: -.08, look: -.30, toe: .12, frontFootYaw: -1.20 },
  // And he goes on turning after it, on his feet as well as his shoulders:
  // the hands staying up over the front shoulder as the body turns under
  // them, the hips going round with the chest, the back foot pivoting up on
  // its toe and the front foot lifting and coming round behind him. Square
  // to the leg side here, the bat up behind his head pointing away to off,
  turned: { ...GUARD, hip: [-.14, .97, -.16], chest: [-.18, 1.34, -.14],
    frontFoot: [-.18, .11, -.24], backFoot: [.08, .09, -.29],
    grip: [-.39, 1.90, -.04], batUp: [-.75, -.62, .22], batFace: [.62, -.78, 0],
    yaw: -1.80, face: -2.05, heel: .45, backFootYaw: -.60, leadElbow: -.10, look: -.40, toe: .25, frontFootYaw: -1.70 },
  // and on round until his back is to the bowler and his hips to the
  // stumps: the front foot come round to off stump on its toe, the back one
  // turned to leg stump, his head up after the ball over his shoulder.
  faced: { ...GUARD, hip: [.05, 1.00, -.27], chest: [.02, 1.37, -.29],
    frontFoot: [.27, .08, -.40], backFoot: [-.12, .08, -.15],
    grip: [-.20, 1.94, -.41], batUp: [-.59, -.62, -.51], batFace: [.34, -.78, .52],
    yaw: -2.75, face: -2.30, heel: .10, backFootYaw: -2.20, leadElbow: -.10, look: -.45, toe: .22, frontFootYaw: -2.40 },
  // Home, unhurried: back up over his head with the bat upright, then the
  // hands let down in front of him into his guard, the bat tipping back over
  // the shoulder as it goes. The guard's bat is up behind him already, so it
  // hardly has to turn: straight from the wrap the blade goes through him,
  // and round by the leg side it had a long way to swing in no time at all.
  unwrap: { ...GUARD, hip: [-.16, .95, -.06], chest: [-.18, 1.31, -.02],
    frontFoot: [-.24, .08, .06], backFoot: [.06, .08, -.33],
    grip: [-.36, 1.70, .44], batUp: [0, -1, .10], batFace: [0, .10, 1],
    yaw: -.40, face: -.60, heel: .26, backFootYaw: .50, leadElbow: -.10 },
  lowered: { ...GUARD, hip: [-.10, .95, -.05], chest: [-.06, 1.30, .0],
    frontFoot: [-.16, .08, .18], backFoot: [-.05, .08, -.28],
    grip: [.04, 1.24, .34], batUp: [-.25, -.85, .45], batFace: [.20, .45, .87],
    yaw: .55, face: -.10, heel: .08, backFootYaw: .95, leadElbow: -.20 },
  recover: { ...GUARD, grip: [.36, 1.10, .40], batUp: [-.15, -.80, -.58],
    batFace: [.86, -.22, .17], yaw: .70, heel: .04 },
};
/**
 * How far the hook reaches: off stump and out to the wide bouncer. It never
 * comes back inside off stump, because inside it the ball is the pull's.
 */
const HOOK_REACH: readonly [number, number] = [.10, .45];
/**
 * The hook's keys from the ball to the end of the turn, as they are played:
 * one turn of the body from the ball to his back to the bowler, fastest
 * through the ball and slowing all the way, with nothing stopped in between.
 * The keys above are the shapes, each authored at the body's own angle; the
 * swing then carries each round about his hips (`swungRound`) to its place on
 * that one turn, the arms and the bat going with the body, and gives it its
 * feet. Turned the way the keys first were, the body slowed into the wrap and
 * then spun on round after it, nearly three times as fast: the swing stopped,
 * and a second movement started.
 *
 * The feet go round with him, both about the middle of his stance: the back
 * foot pivots up onto its toe and comes round to leg stump, the front one
 * lifts and is carried round behind him to off stump, so the two finish the
 * other way round from where he hit it.
 */
function swungRound(pose: Pose, by: number, shift: readonly [number, number],
  feet: { front: Point; back: Point; toe: number; heel: number; frontFootYaw: number; backFootYaw: number }): Pose {
  const about = V(pose.hip).add(new THREE.Vector3(shift[0], 0, shift[1]));
  const carried = (p: Point) => V(p).add(new THREE.Vector3(shift[0], 0, shift[1])).sub(about).applyAxisAngle(UP, by).add(about).toArray() as unknown as Point;
  const turned = (p: Point) => V(p).applyAxisAngle(UP, by).toArray() as unknown as Point;
  return { ...pose, hip: about.toArray() as unknown as Point, chest: carried(pose.chest), grip: carried(pose.grip),
    batUp: turned(pose.batUp), batFace: turned(pose.batFace), yaw: pose.yaw + by, face: pose.face + by,
    frontFoot: feet.front, backFoot: feet.back, toe: feet.toe, heel: feet.heel, frontFootYaw: feet.frontFootYaw, backFootYaw: feet.backFootYaw };
}
const HOOK_SWUNG = {
  front: swungRound(HOOK.front, -.21, [0, 0], { front: [-.26, .08, .02], back: [.10, .08, -.38], toe: 0, heel: .18, frontFootYaw: -.30, backFootYaw: .75 }),
  leg: swungRound(HOOK.leg, -.36, [0, 0], { front: [-.26, .08, .02], back: [.10, .08, -.38], toe: 0, heel: .30, frontFootYaw: -.70, backFootYaw: .50 }),
  round: swungRound(HOOK.round, -.36, [.012, -.007], { front: [-.29, .08, -.04], back: [.16, .08, -.33], toe: .05, heel: .42, frontFootYaw: -1.15, backFootYaw: .15 }),
  rise: swungRound(HOOK.rise, -.52, [.03, -.018], { front: [-.315, .09, -.15], back: [.215, .08, -.246], toe: .12, heel: .48, frontFootYaw: -1.50, backFootYaw: -.25 }),
  finish: swungRound(HOOK.finish, -.77, [.068, -.04], { front: [-.22, .11, -.38], back: [.19, .08, -.07], toe: .22, heel: .45, frontFootYaw: -1.95, backFootYaw: -.85 }),
  turned: swungRound(HOOK.turned, -.69, [.11 - .06, -.067 + .06], { front: [.05, .11, -.50], back: [.016, .08, 0], toe: .25, heel: .30, frontFootYaw: -2.25, backFootYaw: -1.60 }),
};
/**
 * The pull, at a bouncer on the body or the stumps: a net session filmed from
 * the bowler's end, square on the off side and close on the arms. It is the
 * hook's stroke and runs on the hook's clock: back and across with the bat
 * high, square to the bowler, the ball met out in front of him with both arms
 * long and the flat face to the bowler, swung round flat out to leg with the
 * arms still long, wrapped behind his head with the curved back of the blade
 * on the front shoulder, and on round until his back is to the bowler. The
 * hook meets its ball outside off; the pull meets it in front of the body.
 *
 * The first build met the ball beside him with the elbows bent to 57 and 66
 * degrees and the face looking at square leg, from a backlift at his hip, and
 * stopped with the bat upright beside his front shoulder.
 */
/** How far down the pitch of the crease the pull meets the ball: out in front of him, the arms straight. */
export const PULL_MEETS_AT = .35;
/** How high a ball on the leg-side input has to be met to be pulled rather than flicked. */
export const PULL_HEIGHT = .85;
const PULL: typeof HOOK = { ...HOOK,
  // Round to leg with the arms still long and the hands out wide: on the
  // hook's line the back elbow came within a forearm's width of the handle.
  round: { ...HOOK.round, grip: [-.70, 1.45, .12] },
  // And home with the hands let down a little further out in front: on the
  // hook's line the bat came down past the side of his helmet.
  lowered: { ...HOOK.lowered, grip: [.10, 1.20, .36] },
};
const PULL_SWUNG = {
  front: swungRound(PULL.front, -.21, [0, 0], { front: [-.26, .08, .02], back: [.10, .08, -.38], toe: 0, heel: .18, frontFootYaw: -.30, backFootYaw: .75 }),
  leg: swungRound(PULL.leg, -.36, [0, 0], { front: [-.26, .08, .02], back: [.10, .08, -.38], toe: 0, heel: .30, frontFootYaw: -.70, backFootYaw: .50 }),
  round: swungRound(PULL.round, -.36, [.012, -.007], { front: [-.29, .08, -.04], back: [.16, .08, -.33], toe: .05, heel: .42, frontFootYaw: -1.15, backFootYaw: .15 }),
  rise: swungRound(PULL.rise, -.52, [.03, -.018], { front: [-.315, .09, -.15], back: [.215, .08, -.246], toe: .12, heel: .48, frontFootYaw: -1.50, backFootYaw: -.25 }),
  finish: swungRound(PULL.finish, -.77, [.068, -.04], { front: [-.22, .11, -.38], back: [.19, .08, -.07], toe: .22, heel: .45, frontFootYaw: -1.95, backFootYaw: -.85 }),
  turned: swungRound(PULL.turned, -.69, [.11 - .06, -.067 + .06], { front: [.05, .11, -.50], back: [.016, .08, 0], toe: .25, heel: .30, frontFootYaw: -2.25, backFootYaw: -1.60 }),
};
/**
 * The pull off the spinner (`SPIN_PULL` in the config): the leg-side input at
 * his ball dropped short, and at the arm ball timed well enough for it. Built
 * from a net session filmed from the bowler's end. The back foot steps back
 * and across towards off stump and takes his weight, as pull v2's does, and
 * the front foot stays where it stood in his guard: he meets the ball on it.
 * The bat is pull v2's (`PULL`, on the hook's clock): high, down and out, met
 * out in front with both arms long and the flat face to the bowler, swung
 * round flat out to leg, then up over the front shoulder and wrapped behind
 * his head with the curved back of the blade on it. The front foot goes with
 * the swing: up on its toe as the bat comes through, then lifted and carried
 * round on the leg side about the back foot, to land behind it on a line
 * across the pitch about 45cm in front of the stumps (`SPIN_PULL_LANDS`), his
 * hips going back over the back foot as it does. He turns as far as square to
 * the leg side, and no further: pull v2 goes on round until his back is to
 * the bowler. He stands up through all of it. The spinner's ball arrives at
 * the waist and the arm ball at the knee, not a bouncer's chest, so the swing
 * is drawn lower than pull v2's (`SPIN_PULL_GRIP`), and climbs to its wrap in
 * one even curve. Held there (`SPIN_PULL_HOLD_MS`), then home as pull v2 goes
 * home, the bat upright over his head and let down into his guard.
 */
export const SPIN_PULL_CONTACT_MS = HOOK_CONTACT_MS;
/**
 * How far out in front of him it is met, the arms long: nearer than pull v2's
 * bouncer, which is met at the chest, as a ball at the waist or the knee is
 * reached with the arms going down to it as well as out.
 */
export const SPIN_PULL_MEETS_AT = .21;
/** The time the wrap is held past the stroke's own clock, the way home slowed with it, as the cut off the spinner's is. */
export const SPIN_PULL_HOLD_MS = 300;
const SPIN_PULL_CLOCK = { load: HOOK_LOAD_MS, down: 160, contact: SPIN_PULL_CONTACT_MS, front: 255, leg: 315, round: 395, rise: 450, finish: 520, hold: 680, unwrap: 780, lowered: 860 } as const;
/** Where the front foot lands, from where he stands: on a line across the pitch about 45cm in front of the stumps, behind the back foot and a little to leg of it. */
export const SPIN_PULL_LANDS: Point = [-.02, .08, -.55];
/** The back foot, stepped back and across towards off stump: pull v2's. */
const SPIN_PULL_BACK: Point = [.10, .08, -.38];
/** The front foot in his guard's place, where he meets the ball on it, turned out a little as the back foot goes. */
const SPIN_PULL_FRONT: Point = [-.13, .08, .22];
/**
 * The hands' way from the ball to the wrap at the short ball, before the step
 * back carries them: out in front, out to leg, round, up, and over the front
 * shoulder, the last three climbing evenly. Pull v2's own climb from round
 * came forward and up in one surge and then back again, which at the waist
 * read as the hands jerked up past the bat.
 */
const SPIN_PULL_GRIP = { front: [-.22, .90, .70], leg: [-.66, 1.02, .60], round: [-.72, 1.28, .20], rise: [-.62, 1.60, .05] } as const;
/**
 * One key of the stroke: pull v2's shape, its hands drawn where `grip` says,
 * carried back and across by `by` (his hips going back over the back foot)
 * and stood on the feet given.
 */
function spinPullKey(pose: Pose, by: readonly [number, number], front: Point,
  feet: { toe: number; frontFootYaw: number }, grip: readonly number[] = pose.grip): Pose {
  const carried = (p: readonly number[]) => [p[0] + by[0], p[1], p[2] + by[1]] as unknown as Point;
  return { ...pose, hip: [pose.hip[0] + by[0], Math.min(pose.hip[1], .93), pose.hip[2] + by[1]], chest: carried(pose.chest), grip: carried(grip),
    frontFoot: front, backFoot: SPIN_PULL_BACK, heel: Math.min(pose.heel, .25), toe: feet.toe, frontFootYaw: feet.frontFootYaw };
}
const SPIN_PULL: Stroke & { load: Pose; down: Pose; front: Pose; leg: Pose; round: Pose; rise: Pose; unwrap: Pose; lowered: Pose } = {
  load: spinPullKey(PULL.load, [.05, 0], SPIN_PULL_FRONT, { toe: 0, frontFootYaw: .30 }),
  down: spinPullKey(PULL.down, [.05, 0], SPIN_PULL_FRONT, { toe: 0, frontFootYaw: .25 }, [.09, 1.20, .36]),
  contact: spinPullKey(PULL.contact, [.05, 0], SPIN_PULL_FRONT, { toe: 0, frontFootYaw: .15 }),
  // Up on its toe as the bat comes through,
  front: spinPullKey(PULL.front, [.10, -.04], SPIN_PULL_FRONT, { toe: .14, frontFootYaw: -.10 }, SPIN_PULL_GRIP.front),
  // then lifted and carried round on the leg side, back towards the stumps,
  leg: spinPullKey(PULL.leg, [.13, -.12], [-.22, .12, .04], { toe: .10, frontFootYaw: -.60 }, SPIN_PULL_GRIP.leg),
  round: spinPullKey(PULL.round, [.16, -.22], [-.17, .12, -.30], { toe: .06, frontFootYaw: -1.05 }, SPIN_PULL_GRIP.round),
  rise: spinPullKey(PULL.rise, [.19, -.28], [-.07, .10, -.50], { toe: .02, frontFootYaw: -1.35 }, SPIN_PULL_GRIP.rise),
  // and down behind the back foot as the bat wraps.
  finish: spinPullKey(PULL.finish, [.20, -.30], SPIN_PULL_LANDS, { toe: 0, frontFootYaw: -1.45 }),
  unwrap: spinPullKey(PULL.unwrap, [.14, -.22], SPIN_PULL_LANDS, { toe: 0, frontFootYaw: -1.20 }),
  lowered: PULL.lowered, recover: PULL.recover,
};
/**
 * The same at the arm ball, which arrives at the knee: met with the bat
 * sloping down to it from the hands, as the cut off the spinner meets that
 * ball, rather than level, which took the hands down to the ball and the back
 * elbow down after them faster than an arm moves; the chest leans out over it
 * a little so the arms reach it long, the hips still standing.
 */
const SPIN_PULL_LOW: typeof SPIN_PULL = { ...SPIN_PULL, contact: { ...SPIN_PULL.contact, chest: [SPIN_PULL.contact.chest[0] + .02, 1.22, .06], batUp: [-.80, .48, -.36] },
  front: { ...SPIN_PULL.front, chest: [SPIN_PULL.front.chest[0] + .01, 1.24, SPIN_PULL.front.chest[2] + .04] } };
/** Below this the ball is the arm ball's, at the knee, and met with the bat sloping down to it. */
const SPIN_PULL_LOW_BALL = .7;
/**
 * How much of the way down from the short ball to the one this is each key
 * of the swing after the ball is carried: all of it straight out in front,
 * less as it goes round, none from the climb on.
 */
const SPIN_PULL_SUNK = { down: .15, front: 1, leg: .6, round: .12 } as const;
/** The height his ball dropped short reaches him at, which the keys are drawn for. */
const SPIN_PULL_BALL = .81;
/** How far the pull off the spinner will go for a ball: every line he bowls. */
const SPIN_PULL_REACH: readonly [number, number] = [-.42, .45];
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
  /**
   * Contact. He drops into it: the front foot strides across and takes the
   * weight, the knee folds over it, and the back leg is left straight behind
   * with the heel off the turf. The hips sink about a third of a metre — the
   * old pose stood almost upright over the ball, which is the one thing the
   * reference recordings never do.
   *
   * He stays inside the line rather than getting his body across. That is what
   * frees the arms at a ball a cover drive could not reach, and it is why the
   * chest is barely off the leg side while the hands are half a metre outside
   * it.
   */
  contact: { ...GUARD, hip: [-.14, .64, .22], chest: [-.01, .98, .31],
    frontFoot: [.30, .08, .62], backFoot: [-.26, .08, -.30],
    grip: [.54, .83, .23], batUp: [.18, .97, -.15], batFace: [.86, -.08, .50],
    yaw: 1.58, face: .44, heel: .18, backFootYaw: 1.30, leadElbow: .16,
    armHinge: .85, armDrive: 1, shoulderLift: 0 },
  /**
   * Extension, and the key the stroke turns on. Both arms come out straight and
   * the hands run square at hip height with the blade still hanging under them.
   * They do not climb: a cover drive's hands leave contact rising, and if these
   * rise the stroke is only a cover drive played at a wider ball. He is at his
   * lowest here, still over the front knee.
   */
  through: { ...GUARD, hip: [.06, .74, .17], chest: [.19, 1.08, .26],
    frontFoot: [.30, .08, .62], backFoot: [-.26, .08, -.30],
    grip: [.72, .84, .58], batUp: [-.50, .80, -.33], batFace: [.87, .47, -.17],
    yaw: .95, face: .46, heel: .44, backFootYaw: 1.00, leadElbow: .20,
    armHinge: .60, armDrive: 1, shoulderLift: .04 },
  // Only now does the blade come up, and the body rises out of the lunge with
  // it. Turning any earlier is a cover drive; turning this late is what puts
  // the finish so much higher and so much more open.
  carry: { ...GUARD, hip: [.11, .78, .19], chest: [.24, 1.12, .28],
    frontFoot: [.30, .08, .62], backFoot: [-.18, .08, -.22],
    grip: [.60, 1.10, .72], batUp: [.10, -.30, -.95], batFace: [.99, -.06, .12],
    yaw: .70, face: .40, heel: .52, backFootYaw: .80, leadElbow: .04,
    armHinge: .05, armDrive: 1, shoulderLift: .05 },
  /**
   * The finish is over the FRONT shoulder — the left one, for a right-hander —
   * with the blade wrapped up and behind it and the hands beside his ear. The
   * stroke used to finish over the back shoulder, which is the shoulder the
   * bat came down from: a swing that goes out square and then returns the way
   * it came is not a stroke, and every other cross-batted shot in the rig was
   * already finishing on the correct side.
   *
   * The back foot has dragged in under him as the body comes up out of the
   * lunge, and his weight is through onto the front leg.
   */
  finish: { ...GUARD, hip: [.14, .80, .24], chest: [.27, 1.16, .32],
    frontFoot: [.30, .08, .62], backFoot: [-.12, .08, -.12],
    grip: [.29, 1.36, .74], batUp: [.56, -.62, .55], batFace: [-.04, .64, .76],
    yaw: .34, face: .26, heel: .58, backFootYaw: .45, leadElbow: -.10,
    armHinge: -.35, armDrive: 1, shoulderLift: .07 },
  // Down in front of him before the pick-up. The finish holds the bat behind
  // the front shoulder and the guard holds it behind the back one, so every
  // short path between the two goes through his head.
  recover: { ...GUARD, hip: [.08, .90, .16], chest: [.18, 1.24, .20],
    frontFoot: [.24, .08, .42], backFoot: [-.13, .08, -.22],
    grip: [.56, 1.16, .62], batUp: [-.15, -.80, -.58], batFace: [.86, -.22, .17],
    yaw: 1.05, face: .20, heel: .14, leadElbow: -.20 },
};
/**
 * How wide a ball has to be before the off-side drive is played square. Inside
 * this it is the cover drive, which is the same input: a stroke this open at a
 * ball on off stump drags it square of a wicket it is standing in front of.
 */
const SQUARE_DRIVE_REACH: readonly [number, number] = [.16, .62];
/**
 * The sweep's kneel, and the stroke the slog sweep was before it was rebuilt
 * from a recording (see `SLOG_SWEEP`). The orthodox sweep is still built on
 * it, its blade levelled (`FLAT_SWEEP`).
 *
 * He goes down to it rather than reaching for it: the back knee folds to the
 * turf with the shin flat along it, the front leg braces out towards the off
 * side, and the hips drop the better part of half a metre. From there the bat
 * comes round flat and hard — a horizontal arc across the line of the ball,
 * met low and in front of the front pad — and carries on up and over the FRONT
 * shoulder, which for a right-hander is the left one.
 *
 * It is the pull's geometry played from the floor: the same cross-batted sweep
 * round the body, the same unwrapped azimuth so the blade never takes the short
 * way through the torso, and the same wrapped finish. What it is not is the
 * pull's pose list — a man on one knee has a different set of problems, chiefly
 * that his own front pad is now in the swing's way.
 */
const KNEELING_SWEEP: Stroke = {
  // Down, and swinging. The blade is horizontal and the face is already aimed
  // at midwicket; the hands are inside the line with the toe trailing round.
  contact: { ...GUARD, hip: [-.053, .565, -.251], chest: [-.023, .905, -.151],
    frontFoot: [.18, .08, -0.12], backFoot: [-.155, .08, -.738],
    grip: [-.075, .48, .300], batUp: [-.99, -.10, 0], batFace: [-.01, .10, .99],
    yaw: .78, face: -.34, heel: .62, backFootYaw: 1.55, leadElbow: -.22,
    armHinge: -.30, armDrive: 1, shoulderLift: 0 },
  // Through it, and already climbing. The toe used to drop 24cm BELOW the hands
  // here and sit there until the finish yanked it a metre back up — down at
  // 430ms, up at 590ms, which is two movements rather than one. A swing is one
  // arc: the toe leaves the ball and rises from that moment, all the way round.
  through: { ...GUARD, hip: [-.103, .575, -.211], chest: [-.103, .925, -.091],
    frontFoot: [.18, .08, -0.12], backFoot: [-.169, .08, -.632],
    grip: [-.34, .64, .30], batUp: [.82, -.21, -.53], batFace: [-.49, .20, -.85],
    yaw: .22, face: -.62, heel: .66, backFootYaw: 1.30, leadElbow: -.16,
    armHinge: -.10, armDrive: 1, shoulderLift: .03 },
  // Then it climbs, and the chest comes up with it.
  carry: { ...GUARD, hip: [-.123, .585, -.171], chest: [-.143, .945, -.051],
    frontFoot: [.18, .08, -0.12], backFoot: [-.188, .08, -.539],
    grip: [-.44, .96, .34], batUp: [.71, -.44, .55], batFace: [.70, .52, -.49],
    yaw: -.18, face: -.78, heel: .70, backFootYaw: 1.05, leadElbow: -.12,
    armHinge: .55, armDrive: 1, shoulderLift: .05 },
  // High and OUTSIDE the front shoulder, with the blade wrapped away behind
  // it — not beside the ear. The hands finishing in front of the face read as
  // the right picture and are not one: they carry the back glove within 19cm
  // of the helmet and drag both forearms across it on the way. Taking the
  // finish out past the shoulder, on the line the carry was already on, keeps
  // the bat travelling the way it was going instead of reversing back across
  // him. Still down on the knee: he does not stand up out of a slog sweep, he
  // watches it from there.
  finish: { ...GUARD, hip: [-.063, .60, -.131], chest: [-.043, .965, -.011],
    frontFoot: [.18, .08, -0.12], backFoot: [-.134, .08, -.478],
    grip: [-.46, 1.15, .48], batUp: [.53, -.64, .55], batFace: [.80, .60, -.06],
    yaw: -.34, face: -.72, heel: .70, backFootYaw: .95, leadElbow: -.10,
    armHinge: .20, armDrive: 1, shoulderLift: .06 },
  // Up off the knee and back to the guard, with the bat brought down in front
  // of him rather than back across the shoulder it is wrapped behind. Most of
  // the way up, not half: the stage after this one is fifty milliseconds, and
  // with the hips at .78 here he had to find the last sixteen centimetres of
  // his height in three frames and hopped into his guard to do it.
  recover: { ...GUARD, hip: [-.06, .86, -.02], chest: [-.02, 1.20, .04],
    frontFoot: [.06, .08, .30], backFoot: [-.14, .08, -.30],
    grip: [.26, 1.06, .34], batUp: [-.15, -.80, -.58], batFace: [.86, -.22, .17],
    yaw: .92, face: -.10, heel: .24, leadElbow: -.20 },
};

/** How far off the horizontal the level blade is held, all the way round. */
const LEVEL_TILT = -.10;
/**
 * One pose of a sweep, with the blade brought back to the horizontal.
 *
 * The bat is turned about the axis that levels it and the face is carried round
 * with it, which is the whole reason this is a rotation rather than a rewrite:
 * the two vectors stay exactly perpendicular, so the blade keeps the roll the
 * stroke was authored with and only its climb is taken away. Editing `batUp` by
 * hand and leaving `batFace` where it was is how a bat ends up twisted off its
 * own handle.
 *
 * The bearing is untouched. The blade goes round the same way, through the same
 * arc, at the same moments — it simply never rises out of the horizontal.
 */
function levelled(pose: Pose): Pose {
  const up = new THREE.Vector3(...pose.batUp).normalize();
  const flat = new THREE.Vector3(up.x, 0, up.z);
  if (flat.lengthSq() < 1e-9) return pose;
  flat.normalize().multiplyScalar(Math.sqrt(1 - LEVEL_TILT * LEVEL_TILT)).setY(LEVEL_TILT);
  const face = new THREE.Vector3(...pose.batFace)
    .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, flat));
  return { ...pose, batUp: [flat.x, flat.y, flat.z], batFace: [face.x, face.y, face.z] };
}
/**
 * The orthodox sweep. Every key here is the slog's key, and that is deliberate:
 * the user asked for one stroke with two endings, so the body — the knee on the
 * ground, the head over the ball, the front leg folded, the back foot dragging
 * round — is not re-authored, it is inherited. What changes is the bat.
 *
 * The blade is levelled at every key and the hands are held at the height they
 * meet the ball at, so the swing goes round him instead of up over his
 * shoulder. That is the whole stroke: a slog sweep is a sweep that climbs, and
 * this is the one that does not.
 */
const FLAT_SWEEP: Stroke = {
  // Already level at the moment of contact — the slog's own contact key, taken
  // as it stands, which is what makes the two strokes indistinguishable up to
  // the instant the ball is hit.
  contact: KNEELING_SWEEP.contact,
  through: { ...levelled(KNEELING_SWEEP.through!), grip: [-.34, .48, .30], armHinge: -.12, shoulderLift: 0 },
  carry: { ...levelled(KNEELING_SWEEP.carry!), grip: [-.44, .49, .34], armHinge: .05, shoulderLift: 0 },
  // Round behind the front shoulder at the height it started, rather than high
  // and outside it. He is still down on the knee watching it run square.
  finish: { ...levelled(KNEELING_SWEEP.finish!), grip: [-.46, .50, .44], armHinge: .10, shoulderLift: 0 },
  recover: KNEELING_SWEEP.recover,
};
/**
 * The slog sweep, from a broadcast recording filmed side on from the leg side,
 * from behind the bowler and from behind the stumps.
 *
 * A long lunge down the pitch: the front foot goes well out towards the
 * bowler and across to the line of the ball, the front shin upright and the
 * knee over the foot, while the back knee sinks to the turf far behind him
 * and he leans out over the front knee. As he strides the bat goes up high
 * behind the back shoulder; the hands come down by the back hip with the bat
 * still cocked, then out in front of him with the arms long, and it comes
 * down outside off and sweeps through flat, out in front of the front pad with the arms long — the
 * ball met a long way from his body, further down the pitch than any drive
 * (`SLOG_MEETS_AT`). The blade keeps going round after it: out at the
 * bowler at chest height an arm's length in front of him, then up and out
 * over the leg side with the hands out that way at his shoulder, upright
 * beside his head, and only then over the top and down behind it, the hands
 * finishing high over his head and his chest turned square to the leg side,
 * still on the knee, watching it go.
 *
 * The face rides the handle (`riding`): into the ball the swing turns it,
 * never his wrists, so it leads the bat round to the leg side. After it the
 * forearms roll it over once, evenly, as the bat climbs, so that behind his
 * head the flat face looks at the sky and the curved back lies against him:
 * riding the handle alone, it came down there face first onto his shoulders.
 * He holds it there (`SLOG_HOLD_MS`), the sole of the back shoe to the keeper.
 *
 * Clock: the backlift up and the stride landing by `lift`, the hands down by
 * the back hip with the bat still cocked by `drop`, out in front of him with
 * the bat coming down by `down`, the ball at `SWEEP_CONTACT_MS`, at the bowler
 * by `through`, up over the leg side by `carry`, upright beside his head by
 * `over` and down behind it by `finish`, held to `hold`; then down in front of
 * his face by `back`, upright in front of him by `front`, up off the knee by
 * `up` and into the guard.
 */
export const SLOG_CLOCK = { lift: 110, drop: 150, down: 190, through: 310, carry: 390, over: 470, finish: 560, hold: 680, back: 750, front: 820, up: 885 } as const;
/**
 * How much longer than the other strokes the slog sweep takes. From the
 * finish on his clock runs slower, as the hook's does once he has turned
 * (`HOOK_HOLD_MS`): the bat is held behind his head a good while, and he goes
 * home unhurried. Run at the strokes' own clock the hold was a twelfth of a
 * second and the way home a snap.
 */
export const SLOG_HOLD_MS = 400;
/**
 * How much further down the pitch than the drives the slog sweep meets the
 * ball: out in front of the front pad at the end of the lunge. Met where the
 * drives meet it, the foot could not go forward at all — the ball would have
 * been behind it — and he knelt where he stood.
 */
export const SLOG_MEETS_AT = .50;
const SLOG_SWEEP: Stroke & { lift: Pose; drop: Pose; down: Pose; over: Pose; back: Pose; front: Pose } = {
  // The bat up high behind the back shoulder, the toe out over the off side,
  // as the front foot goes out down the pitch. Leaning back over his head,
  // the bat came down through the back arm.
  lift: { ...GUARD, hip: [.00, .72, -.10], chest: [.02, 1.04, -.04],
    frontFoot: [.16, .14, .32], backFoot: [-.13, .08, -.42],
    grip: [.25, 1.20, -.08], batUp: [-.25, -.90, .35], batFace: [.70, -.05, .71],
    yaw: 1.15, face: .10, heel: .35, backFootYaw: 1.45, leadElbow: -.20, look: .15 },
  // The hands come down by the back hip with the bat still cocked up behind
  // him, before they drive forward.
  drop: { ...GUARD, hip: [.01, .64, -.06], chest: [.04, .96, .04],
    frontFoot: [.20, .10, .42], backFoot: [-.12, .08, -.60],
    grip: [.36, .92, .10], batUp: [-.40, -.40, .82], batFace: [.95, .05, .30],
    yaw: 1.12, face: .15, heel: .50, backFootYaw: 1.50, leadElbow: -.20, look: .20 },
  // The stride landed and the knee going down, the back shoe on its toes with
  // the sole to the keeper, the hands out in front of him
  // at his hip with the arms long, and the bat coming down outside the off
  // stump, the toe to the turf behind him, ready to come round. With the
  // hands in at his chest here, it was swung from a quarter of a metre.
  down: { ...GUARD, hip: [.02, .57, -.02], chest: [.06, .86, .12],
    frontFoot: [.24, .08, .48], backFoot: [-.12, .08, -.71],
    grip: [.24, .70, .56], batUp: [-.45, .70, .55], batFace: [.80, .55, .00],
    yaw: 1.10, face: .20, heel: .62, backFootYaw: .10, leadElbow: -.20, look: .25 },
  // Out in front of the front pad with the arms long, the blade about level
  // and reaching across to the ball, the face to midwicket.
  contact: { ...GUARD, hip: [.02, .51, -.02], chest: [.08, .79, .16],
    frontFoot: [.24, .08, .48], backFoot: [-.12, .08, -.67],
    grip: [.00, .60, .55], batUp: [-.92, .25, -.30], batFace: [-.55, .25, .80],
    yaw: .60, face: .30, heel: .62, backFootYaw: .10, leadElbow: -.18, look: .30 },
  // Round at the bowler at chest height, an arm's length out in front of
  // him.
  through: { ...GUARD, hip: [.00, .54, .02], chest: [.04, .88, .20],
    frontFoot: [.24, .08, .48], backFoot: [-.12, .08, -.65],
    grip: [-.02, .88, .80], batUp: [.15, -.15, -.98], batFace: [-.95, .10, -.05],
    yaw: .60, face: -.20, heel: .62, frontFootYaw: .46, backFootYaw: .10, leadElbow: -.12, look: .10 },
  // On round and up over the leg side, at forty-five degrees, the hands out
  // that way at his shoulder and the arms long, his chest turning after it.
  // Taken straight up the pitch from here instead, it was another stroke.
  carry: { ...GUARD, hip: [-.01, .54, .09], chest: [.02, .92, .25],
    frontFoot: [.24, .08, .48], backFoot: [-.12, .08, -.48],
    grip: [-.38, 1.12, .62], batUp: [.62, -.68, -.38], batFace: [-.95, .10, -.05],
    yaw: -.10, face: -.45, heel: .62, frontFootYaw: .46, backFootYaw: .10, leadElbow: -.05, look: -.10 },
  // Upright beside his head on the leg side, his chest turned to it.
  over: { ...GUARD, hip: [-.02, .55, .10], chest: [.00, .94, .20],
    frontFoot: [.24, .08, .48], backFoot: [-.12, .08, -.42],
    grip: [-.32, 1.30, .66], batUp: [.25, -.95, .10], batFace: [-.95, .10, -.05],
    yaw: -.50, face: -.60, heel: .62, frontFootYaw: .46, backFootYaw: .10, leadElbow: .00, look: -.20 },
  // Over the top and down behind his head, the bat lying back out towards
  // the off with the flat face to the sky, the hands high over it, his chest
  // turned square to the leg side so the back arm comes up in front of his
  // face rather than past the helmet, still on the knee and watching it go.
  finish: { ...GUARD, hip: [-.02, .55, .16], chest: [-.01, .95, .29],
    frontFoot: [.24, .08, .48], backFoot: [-.12, .08, -.36],
    grip: [-.30, 1.56, .62], batUp: [-.50, .30, .81], batFace: [.16, .95, -.25],
    yaw: -1.00, face: -.70, heel: .62, frontFootYaw: .46, backFootYaw: .10, leadElbow: .00, look: -.25 },
  // Home with the hands brought forward and down in front of his face and
  // the bat up, then upright out in front of him.
  back: { ...GUARD, hip: [-.02, .57, .11], chest: [.00, .97, .24],
    frontFoot: [.24, .08, .48], backFoot: [-.12, .08, -.42],
    grip: [-.15, 1.25, .72], batUp: [.10, -.90, .42], batFace: [-.95, .10, -.05],
    yaw: -.20, face: -.40, heel: .62, frontFootYaw: .46, backFootYaw: .10, leadElbow: .00, look: -.10 },
  front: { ...GUARD, hip: [-.03, .70, -.06], chest: [.00, 1.05, .05],
    frontFoot: [.16, .08, .40], backFoot: [-.12, .08, -.62],
    grip: [-.04, 1.30, .55], batUp: [.00, -.98, -.20], batFace: [-.95, .10, -.05],
    yaw: .40, face: -.20, heel: .50, backFootYaw: 1.45, leadElbow: -.05, look: .00 },
  // Up off the knee, the front foot drawn back under him, the bat in front of
  // him on its way into the guard.
  recover: { ...GUARD, hip: [-.04, .84, -.02], chest: [.00, 1.18, .04],
    frontFoot: [.06, .08, .30], backFoot: [-.14, .08, -.30],
    grip: [.26, 1.06, .34], batUp: [-.15, -.80, -.58], batFace: [.86, -.22, .17],
    yaw: .92, face: -.10, heel: .24, leadElbow: -.20 },
};
/**
 * Halfway home from the orthodox sweep.
 *
 * The finish holds the bat wrapped behind the front shoulder and the guard
 * holds it behind the back one, and the straight line between those two runs
 * through the front shoulder itself — the blade came out 0.25 of a shoulder's
 * radius from its centre, which is to say inside it. So he unwraps it the way
 * anyone does: out in front, where he can see it, blade down, and only then
 * back across into the pick-up.
 */
const SWEEP_UNWRAP: Pose = { ...GUARD,
  hip: [-.11, .70, -.06], chest: [-.06, 1.04, .02],
  frontFoot: [.16, .08, .34], backFoot: [-.13, .08, -.34],
  grip: [-.16, .86, .62], batUp: [.30, .30, -.90], batFace: [-.47, .87, .13],
  yaw: .66, face: -.30, heel: .34, backFootYaw: 1.10, leadElbow: -.16 };
/** How wide a ball can be and still be swept: it is a straight-ish ball's stroke. */
const SWEEP_REACH: readonly [number, number] = [-.30, .26];
/**
 * The scoop — the first of the two strokes played behind the wicket, from a
 * net session filmed from the off side and from behind the stumps.
 *
 * He gets out of the ball's way first: the back foot goes across to the off
 * side and the front foot opens, so he stands square to the bowler on a wide
 * base, knees bent and low, with his body outside the line of a ball on the
 * stumps. The bat comes down early in front of him. At the ball it is laid
 * back almost flat, pointing at the bowler with the face turned up — a ramp —
 * the hands low beside the front thigh, and the ball is met at knee height and
 * ridden up off the face over his leg-side shoulder to fine leg. Then the bat
 * lifts toe first without turning in his hands, one turn about the line of
 * his shoulders, until it stands upright in front of the front shoulder with
 * the hands at his chin; he holds it there and turns his head to watch the
 * ball go behind him.
 *
 * The step across is what keeps the ball out of him: it goes back towards
 * fine leg from in front of the stumps, and standing where he takes guard he
 * was in its path (`tests/flight.test.ts` flies it against him now).
 *
 * Clock: across and down by `set` (any sooner and the front elbow outruns
 * the frame), the ball at `contact`, the lift through
 * `through` and `carry` to the upright `finish`, held to `hold`; then home in
 * front of him and into the pick-up.
 */
export const SCOOP_CONTACT_MS = 150;
export const SCOOP_CLOCK = { set: 95, contact: SCOOP_CONTACT_MS, through: 240, carry: 330, finish: 430, hold: 600, unwrap: 700, across: 790, up: 870 } as const;
const SCOOP: Stroke & { set: Pose; unwrap: Pose; across: Pose } = {
  // Across and down: square to the bowler on a wide base outside the line,
  // the bat brought down upright in front of him, face to the bowler.
  set: { ...GUARD, hip: [.55, .70, -.30], chest: [.57, 1.02, -.20],
    frontFoot: [.28, .08, .00], backFoot: [.78, .08, -.12],
    grip: [.36, .68, .04], batUp: [.00, .88, -.47], batFace: [.00, .47, .88],
    yaw: .05, frontFootYaw: .10, backFootYaw: .25, face: .00, heel: .10, leadElbow: .00, look: .15 },
  // The ramp: laid back almost flat, pointing at the bowler, face up, the
  // hands low beside the front thigh. The ball rides off it over his shoulder.
  contact: { ...GUARD, hip: [.55, .66, -.32], chest: [.57, .98, -.22],
    frontFoot: [.28, .08, .00], backFoot: [.78, .08, -.12],
    grip: [.43, .70, .02], batUp: [-.12, .35, -.93], batFace: [.00, .93, .35],
    yaw: .00, frontFootYaw: .10, backFootYaw: .25, face: -.10, heel: .10, leadElbow: .05, look: .20 },
  // Lifting toe first: the blade a little above level, out in front.
  through: { ...GUARD, hip: [.55, .70, -.28], chest: [.56, 1.02, -.18],
    frontFoot: [.28, .08, .00], backFoot: [.78, .08, -.12],
    grip: [.43, .95, .26], batUp: [-.05, -.30, -.95], batFace: [.00, .95, -.30],
    yaw: .00, frontFootYaw: .10, backFootYaw: .25, face: -.25, heel: .14, leadElbow: .15, look: .05 },
  carry: { ...GUARD, hip: [.54, .74, -.18], chest: [.54, 1.08, -.10],
    frontFoot: [.28, .08, .00], backFoot: [.78, .08, -.12],
    grip: [.33, 1.10, .20], batUp: [-.03, -.80, -.60], batFace: [.00, .60, -.80],
    yaw: .00, frontFootYaw: .10, backFootYaw: .25, face: -.45, heel: .18, leadElbow: .20, look: -.10 },
  // Upright in front of the front shoulder, the hands at his chin, his head
  // turned to watch it go behind him.
  finish: { ...GUARD, hip: [.53, .78, -.16], chest: [.52, 1.12, -.10],
    frontFoot: [.28, .08, .00], backFoot: [.78, .08, -.12],
    grip: [.27, 1.24, .24], batUp: [.00, -.99, .10], batFace: [.00, -.10, -.99],
    yaw: .00, frontFootYaw: .10, backFootYaw: .25, face: -.75, heel: .20, leadElbow: .20, look: -.30 },
  // Home: back across into his crease with the bat lowered in front of him,
  // then into the pick-up.
  unwrap: { ...GUARD, hip: [.22, .84, -.12], chest: [.22, 1.16, -.05],
    frontFoot: [.00, .08, .12], backFoot: [.38, .08, -.18],
    grip: [.24, 1.16, .28], batUp: [.00, -.90, -.44], batFace: [.00, .44, -.90],
    yaw: .45, frontFootYaw: .40, backFootYaw: .70, face: -.30, heel: .10, leadElbow: .10 },
  across: { ...GUARD, hip: [.05, .90, -.08], chest: [.08, 1.22, .00],
    frontFoot: [-.06, .08, .22], backFoot: [-.02, .08, -.22],
    grip: [.30, 1.10, .40], batUp: [.10, -.75, -.65], batFace: [.10, .65, -.75],
    yaw: .90, face: -.10, heel: .05, backFootYaw: 1.10, leadElbow: .05 },
  recover: { ...GUARD, grip: [.38, 1.12, .43], batUp: [-.15, -.80, -.58], batFace: [.86, -.22, .17], yaw: 1.10 },
};
/** A ball on the stumps or the leg stump line: the scoop's reach. */
const SCOOP_REACH: readonly [number, number] = [-.30, .17];
/**
 * The reverse scoop, from a net session filmed from the bowler's end. It is
 * played as a left-hander would play it.
 *
 * The bat comes down to hang toe down in front of the pads, then swings out
 * to the leg side and up — outside him, the hands going out beside the front
 * hip, never across him under the front arm — until it stands upright beside
 * the front shoulder: a left-hander's backlift, the front arm long and the
 * back one across his chest, his chest open to the bowler. Meanwhile the
 * front foot strides a long way out to the off and forward and the front leg
 * stretches nearly straight, and as the bat comes down past his legs the back
 * knee goes down to the turf. The ball is met out beside the front knee with
 * the arms long, the blade level and pointing out to the off, angled a little
 * back towards third man, the face open to the sky. The bat follows it up and
 * back over the slips until it stands upright out in front of him at chest
 * height, the arms still long towards the off and the face to the keeper, and
 * he holds it there on the knee with the leg stretched out, his head turned
 * to watch the ball go.
 *
 * The face rides the handle (`riding`). Into the ball it does not turn in his
 * hands at all: the swing brings it round to the face he meets the ball with.
 * The first build gave the backlift a face of its own and it rolled in his
 * wrists one way and back again on the way down; it also tucked the bat under
 * the front arm and played the ball with the hands in at his body. After the
 * ball the forearms roll it over to the keeper, one way and evenly across the
 * climb; then what it has to turn to be back in his guard it turns evenly over
 * the whole way home.
 *
 * Clock: down in front by `drop`, out to the leg side by `flip`, up beside the
 * front shoulder with the stride planted by `lift`, past his legs with the
 * knee on the turf by `down`, the ball at `contact`, up and back through
 * `through` and `carry` to the upright `finish`, held to `hold`; then up off
 * the knee by `up` and into the guard.
 */
export const REVERSE_CONTACT_MS = 240;
export const REVERSE_CLOCK = { drop: 48, flip: 90, lift: 140, down: 180, contact: REVERSE_CONTACT_MS, through: 310, carry: 400, finish: 520, hold: 650, up: 800 } as const;
const REVERSE_SCOOP: Stroke & { drop: Pose; flip: Pose; lift: Pose; down: Pose } = {
  // Out of the guard the bat comes down to hang toe down in front of the
  // pads, out in front of the front knee, which is about to lift.
  drop: { ...GUARD, hip: [-.03, .90, -.05], chest: [.00, 1.24, .00],
    frontFoot: [-.04, .10, .30], backFoot: [-.13, .08, -.27],
    grip: [.06, .92, .38], batUp: [.00, .96, -.26], batFace: [.00, .26, .96],
    yaw: 1.00, face: .05, heel: .10, backFootYaw: 1.38, leadElbow: -.25, look: .15 },
  // The toe swings up to the leg side outside him, the hands going out
  // beside the front hip — not across him under the front arm — as the
  // front foot goes out to the off.
  flip: { ...GUARD, hip: [.02, .80, -.09], chest: [.02, 1.13, -.05],
    frontFoot: [.22, .12, .38], backFoot: [-.12, .08, -.32],
    grip: [-.10, .90, .50], batUp: [.96, .10, .10], batFace: [.00, .20, -.98],
    yaw: .55, face: .10, heel: .20, backFootYaw: 1.35, frontFootYaw: .90, leadElbow: -.20, look: .15 },
  // A left-hander's backlift: upright beside the front shoulder, the hands
  // out in front of him, his chest open to the bowler and the front foot
  // planted far out. Kept side-on here, the hands came in to the front
  // shoulder to stay in front of both, and that arm folded shut and threw
  // its elbow about.
  lift: { ...GUARD, hip: [.12, .57, -.14], chest: [.09, .91, -.10],
    frontFoot: [.48, .08, .47], backFoot: [-.11, .08, -.48],
    grip: [-.12, .84, .42], batUp: [.25, -.95, .18], batFace: [.00, .18, -.98],
    yaw: .45, face: .20, heel: .45, backFootYaw: 1.45, frontFootYaw: .90, leadElbow: -.20, look: .20 },
  // Down past his legs with the knee on the turf, the toe low and forward
  // under the hands, still on the leg side of them.
  down: { ...GUARD, hip: [.10, .585, -.16], chest: [.08, .93, -.11],
    frontFoot: [.48, .08, .47], backFoot: [-.10, .08, -.64],
    grip: [.08, .77, .40], batUp: [.62, .45, -.64], batFace: [.31, .61, .73],
    yaw: .70, face: .40, heel: .62, backFootYaw: 1.55, frontFootYaw: .90, leadElbow: -.20, look: .25 },
  // Under it beside the front knee with the arms long: level, pointing out
  // to the off and angled a little back towards third man, the face open to
  // the sky.
  contact: { ...GUARD, hip: [.07, .55, -.11], chest: [.02, .89, -.03],
    frontFoot: [.48, .08, .47], backFoot: [-.10, .08, -.66],
    grip: [.10, .64, .30], batUp: [-.95, .10, .28], batFace: [.08, .97, .07],
    yaw: .55, face: .60, heel: .62, backFootYaw: 1.55, frontFootYaw: .90, leadElbow: -.18, look: .25 },
  // After the ball, up and back the way it went, over the slips, the arms
  // reaching out to the off.
  through: { ...GUARD, hip: [.10, .57, -.17], chest: [.07, .91, -.13],
    frontFoot: [.48, .08, .47], backFoot: [-.10, .08, -.66],
    grip: [.30, .80, .36], batUp: [-.70, -.45, .55], batFace: [.10, .72, -.68],
    yaw: .80, face: .90, heel: .62, backFootYaw: 1.55, frontFootYaw: .90, leadElbow: -.12, look: .15 },
  carry: { ...GUARD, hip: [.09, .58, -.18], chest: [.05, .93, -.14],
    frontFoot: [.48, .08, .47], backFoot: [-.10, .08, -.66],
    grip: [.38, .94, .28], batUp: [-.40, -.85, .35], batFace: [.05, .38, -.92],
    yaw: .95, face: 1.30, heel: .62, backFootYaw: 1.55, frontFootYaw: .90, leadElbow: -.08, look: .00 },
  // Upright out in front of him at chest height, the arms long towards the
  // off, the face to the keeper; held on the knee with the leg stretched
  // out, his head turned to watch it go over the slips.
  finish: { ...GUARD, hip: [.08, .59, -.20], chest: [.03, .95, -.16],
    frontFoot: [.48, .08, .47], backFoot: [-.10, .08, -.66],
    grip: [.46, 1.00, .22], batUp: [-.22, -.96, .10], batFace: [.00, -.10, -.99],
    yaw: 1.05, face: 1.80, heel: .62, backFootYaw: 1.55, frontFootYaw: .90, leadElbow: -.05, look: -.05 },
  // Up off the knee, the front foot drawn back under him and the bat lowered
  // in front of him on its way into the guard.
  recover: { ...GUARD, hip: [.00, .80, -.10], chest: [.03, 1.13, -.04],
    frontFoot: [.10, .08, .32], backFoot: [-.13, .08, -.36],
    grip: [.26, 1.00, .18], batUp: [-.35, -.80, .48], batFace: [.20, .50, .84],
    yaw: 1.30, face: .40, heel: .30, backFootYaw: 1.30, leadElbow: -.25 },
};
/** Off stump and outside it: the reverse scoop's reach. */
const REVERSE_REACH: readonly [number, number] = [.05, .62];
STROKES.SCOOP = SCOOP; STROKES.REVERSE_SCOOP = REVERSE_SCOOP; STROKES.HOOK = HOOK;
/**
 * The block comes in two, by the length of the ball, from two net clips in
 * slow motion: the forward defence at a ball pitched up (full or a good
 * length), the back-foot defence at one short of a length or a bouncer. Which
 * is which is the ball's height where it is met (`DEFENCE_BACK_HEIGHT`): every
 * ball pitched up reaches him at the knee, a ball back of a length at the hip
 * and a bouncer at the chest, so the line between them is wide.
 *
 * The forward defence (`DEFENCE_FRONT`): a long stride down the line of the
 * ball, the front knee bent over the front foot and the head over the ball, the
 * back leg left long behind with its heel up. The bat comes down straight and
 * meets the ball beside the front pad (`DEFENCE_FRONT_MEETS_AT`), angled with
 * the handle ahead of the blade so the face looks down at the pitch, the top
 * hand's elbow up at the bowler and the bottom hand soft. He holds it, the bat
 * giving a little with the ball, and gets up into his guard.
 *
 * The back-foot defence (`DEFENCE_BACK`): back and across, the back foot to
 * off stump and the front foot drawn back beside it, and up tall on the back
 * leg. The bat comes down straight in front of his chest, under his eyes, the
 * top hand up by his chin with its elbow high and the bottom hand soft, the
 * face angled down; the ball is let come on and met late beside the body
 * (`DEFENCE_BACK_MEETS_AT`), at the hip off a length and at the chest off a
 * bouncer, and drops at his feet. He holds it, tall, and settles back.
 *
 * The first build was one stroke for every ball, a short step with the bat
 * tucked against him at his waist: at a bouncer it stayed there, and the ball
 * went through his chest.
 */
export const DEFENCE_BACK_HEIGHT = .7;
/** How far down the pitch the forward defence meets the ball: beside the front pad, at the end of the stride. */
export const DEFENCE_FRONT_MEETS_AT = .26;
/** And the back-foot defence: let come on, under his eyes beside the body. */
export const DEFENCE_BACK_MEETS_AT = -.12;
export const DEFENCE_FRONT_CONTACT_MS = 130;
export const DEFENCE_BACK_CONTACT_MS = 150;
/**
 * How far off the shortest way home the defences' bat is swung, out towards
 * the off side: at this the face carried along with the handle arrives at the
 * guard's own, so the way home turns nothing in his hands (the batter tests
 * hold it to a few degrees).
 */
const DEFENCE_HOME_OUT = -.42;
const DEFENCE_CLOCK = { front: { press: 60, met: DEFENCE_FRONT_CONTACT_MS, give: 240, hold: 560 }, back: { press: 75, met: DEFENCE_BACK_CONTACT_MS, give: 260, hold: 560 } } as const;
const DEFENCE_FRONT: Stroke & { press: Pose; give: Pose } = {
  // Weight forward as the front foot lifts, the bat up out of the guard.
  press: { ...BACKLIFT, hip: [-.07, .91, .05], chest: [.04, 1.25, .12],
    frontFoot: [-.06, .14, .42], backFoot: [-.13, .08, -.25],
    grip: [.30, .98, .16], batUp: [-.36, -.62, .70], batFace: [.28, .78, .55],
    yaw: 1.25, heel: .06, leadElbow: -.10 },
  contact: { ...GUARD, hip: [-.12, .74, .18], chest: [.06, 1.05, .40],
    frontFoot: [.04, .08, .66], backFoot: [-.15, .08, -.30],
    grip: [.36, .95, .70], batUp: [0, .94, .33], batFace: [0, -.33, .94],
    yaw: 1.20, face: 0, heel: .30, backFootYaw: 1.10, leadElbow: .60, look: .30 },
  // Soft hands: the bat gives back a little with the ball and stays there.
  give: { ...GUARD, hip: [-.12, .74, .17], chest: [.06, 1.05, .38],
    frontFoot: [.04, .08, .66], backFoot: [-.15, .08, -.30],
    grip: [.36, .93, .66], batUp: [0, .95, .30], batFace: [0, -.30, .95],
    yaw: 1.20, face: 0, heel: .34, backFootYaw: 1.10, leadElbow: .58, look: .30 },
  finish: null as unknown as Pose,
};
DEFENCE_FRONT.finish = DEFENCE_FRONT.give;
const DEFENCE_BACK: Stroke & { press: Pose; give: Pose } = {
  // Back and across, the bat taken up as he goes.
  press: { ...BACKLIFT, hip: [-.03, .96, -.14], chest: [.04, 1.31, -.08],
    frontFoot: [-.08, .09, .14], backFoot: [.04, .08, -.42],
    grip: [.30, 1.08, .08], batUp: [-.36, -.66, .66], batFace: [.28, .78, .55],
    yaw: 1.20, heel: .04, backFootYaw: 1.25, leadElbow: -.05 },
  contact: { ...GUARD, hip: [-.02, .98, -.14], chest: [.06, 1.34, -.06],
    frontFoot: [-.10, .10, .10], backFoot: [.04, .08, -.42],
    grip: [.36, 1.25, .30], batUp: [0, .95, .30], batFace: [0, -.30, .95],
    yaw: 1.05, face: 0, heel: .10, backFootYaw: 1.25, leadElbow: .30, look: .35, toe: .10 },
  give: { ...GUARD, hip: [-.02, .98, -.15], chest: [.06, 1.34, -.07],
    frontFoot: [-.10, .10, .10], backFoot: [.04, .08, -.42],
    grip: [.36, 1.25, .27], batUp: [0, .96, .27], batFace: [0, -.27, .96],
    yaw: 1.05, face: 0, heel: .10, backFootYaw: 1.25, leadElbow: .28, look: .35, toe: .10 },
  finish: null as unknown as Pose,
};
DEFENCE_BACK.finish = DEFENCE_BACK.give;
STROKES.DEFEND = DEFENCE_FRONT;

/**
 * The back-foot punch (`PUNCH` in the config): the cover drive's swipe at a ball
 * short of a length, from two net sessions, one filmed from the bowler's end and
 * from behind, one from the bowler's end. The back foot takes a step straight
 * back towards the stumps and the front foot is left where it is; he stands up
 * tall with the weight on the back leg and the bat taken up high. It comes down
 * straight, the hands close in front of the front hip, and meets the ball late
 * (`PUNCH_MEETS_AT`) by the front thigh, the face to cover and the handle a
 * little ahead of the blade so it stays down; a bouncer is met up the face
 * (`PUNCH_HIGHEST`), the body a little further from it (`PUNCH_HIGH_ROOM`).
 * Then it is driven: the toe swings out towards cover, the hands coming up close
 * to him, by his chest and then up by his face with the top elbow high, where it
 * stops (`PUNCH_CLOCK.finish`): carried on up over the helmet it read as forced.
 * The front foot slides back to close the gap with the back one, so the feet
 * finish together. The bat finishes leant out towards
 * cover, toe down. The wrists never roll it (`riding`): the arms take it through
 * and up. Held there (`PUNCH_HOLD_MS`), it comes home in one movement through the
 * bat hanging from his hands (`PUNCH_HOME_VIA`).
 */
export const PUNCH_MEETS_AT = -.05;
export const PUNCH_CONTACT_MS = 150;
/** How much longer than the stroke's own clock he holds the punch's high finish. */
export const PUNCH_HOLD_MS = 120;
/**
 * The highest the middle of the blade goes to meet the ball. A bouncer, at his
 * chest, is met higher up the face with the hands by his chest rather than up
 * at his chin, where the bat came down from behind him through the back elbow.
 */
export const PUNCH_HIGHEST = 1.0;
/** How much less far across he steps to a ball met that high: up by his chest, closer still, the top arm folded shut and its elbow flipped. */
const PUNCH_HIGH_ROOM = .08;
/**
 * Where the punch's bat points halfway home: hanging from his hands, the toe a
 * little back towards the keeper, as he lets them down from over his head and
 * before it goes back up into the guard. Through here the face carried along with
 * the handle arrives at the guard's own, so the way home turns nothing in his hands.
 */
const PUNCH_HOME_VIA: Point = [.13, .93, .35];
/** How far the punch's hands come down from over his head before the bat starts back into the guard, as a share of the way home. */
const PUNCH_HOME_LAG = .35;
/** The highest the hands go as he punches through, before they rise to the finish. */
const PUNCH_THROUGH_TOP = 1.6;
/** The pick-up's hands no further below where the ball is met than this. */
const PUNCH_PICKUP_BELOW = 9;
export const PUNCH_CLOCK = { load: 80, met: PUNCH_CONTACT_MS, through: 240, finish: 330, hold: 520 } as const;
const PUNCH_STROKE: Stroke & { load: Pose; through: Pose } = {
  // A step straight back with the back foot, the front foot left where it is for now, tall, the bat up high.
  load: { ...BACKLIFT, hip: [.04, .97, -.14], chest: [.11, 1.33, -.09],
    frontFoot: [-.06, .09, .22], backFoot: [.12, .08, -.45],
    grip: [.30, 1.20, -.02], batUp: [-.32, -.76, .56], batFace: [.28, .86, .30],
    yaw: 1.18, heel: .04, backFootYaw: 1.25, leadElbow: .30 },
  // The hands come down close in front of the front hip, the ball met by the front thigh.
  contact: { ...GUARD, hip: [.10, .99, -.13], chest: [.19, 1.34, -.05],
    frontFoot: [.02, .11, .16], backFoot: [.14, .08, -.45],
    grip: [.38, 1.20, .25], batUp: [-.05, .96, .27], batFace: [.62, -.22, .75],
    yaw: 1.05, face: 0, heel: .04, toe: .12, backFootYaw: 1.25, leadElbow: .40, look: .35 },
  // Driven: the toe swung out towards cover, the hands coming up close to him, and the front foot sliding back to the back one.
  through: { ...GUARD, hip: [.11, .99, -.15], chest: [.20, 1.35, -.06],
    frontFoot: [.05, .10, -.05], backFoot: [.14, .08, -.45],
    grip: [.44, 1.35, .28], batUp: [-.45, .72, -.50], batFace: [.62, .62, .40],
    yaw: .98, face: 0, heel: .04, toe: .10, backFootYaw: 1.25, leadElbow: .50, look: .30 },
  // The stroke ends here, the hands up by his face, the bat leant out towards cover, the
  // feet together: going on up to over the helmet read as forced.
  finish: { ...GUARD, hip: [.11, .99, -.16], chest: [.19, 1.35, -.07],
    frontFoot: [.07, .09, -.15], backFoot: [.14, .08, -.45],
    grip: [.46, 1.65, .29], batUp: [-.46, .69, -.56], batFace: [.43, .72, .55],
    yaw: .94, face: 0, heel: .04, toe: .06, backFootYaw: 1.25, leadElbow: .60, look: .25 },
};
/** A turn of the face about the handle inside `window`, so that at `at` (the window's end if not given) it looks `away`: see `riding`. */
type Roll = { window: readonly [number, number]; away: (pose: Pose, up: THREE.Vector3) => THREE.Vector3; at?: number };
/**
 * Home from a held stroke in one movement, eased out of it and into the guard
 * with nothing between: the bat swung back into the guard on a curve through
 * the point halfway along the shortest way, bent off it by `out` (or through\n * `out` itself, where it is the bat's direction there). The bend is
 * what brings the face, carried along with the handle (`riding`), round to the
 * guard's own, so nothing turns the bat in his hands on the way. Read by time,
 * from `hold` to the end of the stroke's clock. `lag` holds the bat back on
 * that curve while the hands start down, as a share of the way: the punch's
 * hands come down from over his head first, the bat hanging from them, and it
 * is swung back into the guard as they arrive, low and clear of the back elbow.
 */
function liftedHome(held: Pose, hold: number, out: number | Point, lag = 0): (at: number) => Pose {
  const from = V(held.batUp).normalize(), to = V(GUARD.batUp).normalize();
  const half = typeof out === 'number' ? from.clone().add(to).normalize().addScaledVector(from.clone().cross(to).normalize(), out).normalize() : V(out).normalize();
  // A curve on the sphere through `half` at its middle, so the blade's way round has no corner.
  const bend = half.clone().multiplyScalar(2).addScaledVector(from.clone().add(to), -.5).normalize();
  const slerp = (a: THREE.Vector3, b: THREE.Vector3, s: number) => {
    const angle = a.angleTo(b); if (angle < 1e-6) return a.clone();
    return a.clone().multiplyScalar(Math.sin((1 - s) * angle)).addScaledVector(b, Math.sin(s * angle)).divideScalar(Math.sin(angle));
  };
  const keys = [{ time: hold, pose: held }, { time: STROKE_DURATION_MS, pose: GUARD }];
  return (at: number): Pose => {
    const u = THREE.MathUtils.clamp((at - hold) / (STROKE_DURATION_MS - hold), 0, 1), s = ease(THREE.MathUtils.clamp((u - lag) / (1 - lag), 0, 1));
    const up = slerp(slerp(from, bend, s), slerp(bend, to, s), s).normalize();
    const bat = new THREE.Quaternion().setFromUnitVectors(from, up).multiply(batOrientation(held));
    return { ...flowing(keys, at), bat, batUp: up.toArray() as unknown as Point };
  };
}

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
/**
 * The straight drive lofted, version two: built from Kohli's six over the
 * bowler's head at Adelaide, side on and from behind the bowler.
 *
 * A long stride first — the front foot down the line and planted before the
 * bat arrives (`LOFT_V2_CLOCK.plant`), the head over the front knee and the
 * back foot left where it was — then a straight bat met under his eyes. The
 * arms go out after the ball up the line and the stroke ends there: both arms
 * long, the hands high in front of him over the front shoulder and clear of
 * his face, the back arm crossing under his chin, the head upright and the chin
 * up after the ball, and the blade carried on up
 * the line after the ball, its toe to the sky over the bowler. No wrap over
 * the shoulder or behind the head. He holds it a long while, low on the bent
 * front leg with the back foot up on its toe, and watches it go; then the bat
 * comes home down the line and up into his guard. From the ball on the face
 * rides the handle (`riding`), so the bat never turns in his hands. Version
 * one (`STRAIGHT_LOFT`) finishes over the front shoulder.
 */
export type LoftVersion = 1 | 2;
/** How often each version of the lofted straight drive is played: three in ten the old finish, seven in ten the new. Both are the same six. */
export const LOFT_ODDS: Record<LoftVersion, number> = { 1: .3, 2: .7 };
/**
 * The version a ball plays, off the innings' seed and the ball it has reached
 * as the cover strokes' is (`coverRoll`), mixed with a constant of its own so
 * the two are not rolled together.
 */
export function loftVersionOf(seed: number, ball: number): LoftVersion {
  return coverRoll(seed ^ 0x1f7d2b9, ball) < LOFT_ODDS[1] ? 1 : 2;
}
/** The pull's two versions: one standing where he hit it (`PULL_V1`), two the hook's stroke with the turn (`PULL`). */
export type PullVersion = 1 | 2;
/** How often each is played: half the pulls version one, half version two. Both score the same. */
export const PULL_ODDS: Record<PullVersion, number> = { 1: .5, 2: .5 };
/** The version a ball plays, off the seed and the ball as the lofted drive's is, with a constant of its own. */
export function pullVersionOf(seed: number, ball: number): PullVersion {
  return coverRoll(seed ^ 0x2c9e4a7, ball) < PULL_ODDS[1] ? 1 : 2;
}
/**
 * The flick's two versions: one the flick as it always was, the front foot
 * opened to leg and the bat whipped round level (`STROKES.LEG`); two the flick
 * off the pads rebuilt from a coaching film in four angles (`FLICK_V2`).
 */
export type FlickVersion = 1 | 2 | 3;
/** How often each is played: seven flicks in ten version one, three version two. */
export const FLICK_ODDS: Record<1 | 2, number> = { 1: .7, 2: .3 };
/**
 * The version a ball plays, off the seed and the ball as the pull's is, with a
 * constant of its own. Version two is scored its own way (`FLICK`), so like
 * the cover strokes' the same ball plays the same version for everybody on
 * that seed, rivals included.
 */
export function flickVersionOf(seed: number, ball: number): 1 | 2 {
  return coverRoll(seed ^ 0x3b8f1d5, ball) < FLICK_ODDS[1] ? 1 : 2;
}
/**
 * Version two of the flick meets the ball this much further down the pitch
 * than the drives: beside the front pad, at the end of the stride, under his
 * eyes, as the film meets it.
 */
export const FLICK_MEETS_AT = .18;
/**
 * The flick's clock: the front foot down before the bat (`plant`), the ball,
 * the bat out low after it to midwicket (`through`), up in front of him with
 * the bat upright, where it stops (`up`), held, and home as the hook goes home.
 */
export const FLICK_CLOCK = { plant: 55, through: 200, up: 320, hold: 560, rising: 660, down: 760 } as const;
/** How much longer than the stroke's own clock the flick's finish is held, before he comes home. */
export const FLICK_HOLD_MS = 160;
/**
 * The flick off the pads, version two, from a coaching film shot side on from
 * the off side, from the bowler's end, from behind the bowler and from square
 * leg, in slow motion.
 *
 * A long stride straight down the line of a ball on his pads, the front foot
 * down before the bat comes and the knee bent over it, the back leg long with
 * its heel up, and his head over the front knee. The bat comes down straight
 * and meets the ball beside the front pad, under his eyes, the hands a little
 * ahead of the blade and the face to the bowler. Then the wrists do it: the
 * ball's own pace sends it, and the bottom hand rolls over the top one, closing
 * the face, as the hands push the bat out low after the ball to midwicket.
 * Only then does it come up, and it stops there, the bat upright in front of
 * him with the hands out ahead of his chest, below his chin: taken on over the
 * front shoulder, the bat went into the shoulder and the bottom hand into the
 * grille. He stays down through all of it, bent over the front leg with his
 * head down where he met the ball, and holds it (`FLICK_HOLD_MS`). From the
 * stance on the face rides the handle (`riding`): turned to the bowler on the
 * way down, and the one roll after the ball, closing the face, as the bat goes
 * out to midwicket, carried on the same way as it comes up, so it stops with
 * the flat face to the bowler and the curved back to his helmet: left to ride,
 * it stopped with its edge to him.
 *
 * Keyed for the ball on leg stump: the reach moves him from there.
 */
const FLICK_V2: Stroke & { through: Pose } = {
  contact: { ...GUARD, hip: [-.10, .86, .16], chest: [-.05, 1.25, .27], frontFoot: [-.08, .08, .58], backFoot: [-.23, .08, -.38],
    grip: [.33, .97, .58], batUp: [.05, .97, .22], batFace: [-.25, -.20, .95], yaw: 1.30, face: .20, heel: .30,
    backFootYaw: 1.15, leadElbow: -.10, look: .55, armHinge: -.85, armDrive: 1, shoulderLift: 0 },
  through: { ...GUARD, hip: [-.06, .82, .19], chest: [.00, 1.18, .32], frontFoot: [-.08, .08, .58], backFoot: [-.23, .08, -.36],
    grip: [.18, .92, .86], batUp: [.58, .44, -.63], batFace: [-.70, -.50, .50], yaw: .90, face: .10, heel: .40,
    backFootYaw: 1.00, leadElbow: 0, look: .40, armHinge: -.45, armDrive: 1, shoulderLift: .03 },
  finish: { ...GUARD, hip: [-.03, .79, .20], chest: [.07, 1.10, .36], frontFoot: [-.08, .08, .58], backFoot: [-.22, .08, -.34],
    grip: [.04, 1.20, .88], batUp: [-.22, -.92, .33], batFace: [-.85, 0, .50], yaw: .55, face: .05, heel: .46,
    backFootYaw: .90, leadElbow: .22, look: .30, armHinge: .40, armDrive: 1, shoulderLift: .04 },
};
/**
 * The flick's way home, as the hook goes home: stood up out of the stoop with
 * the hands up over the front shoulder and the bat upright over them
 * (`FLICK_UNWRAP`), then the hands let down in front of his chest with the bat
 * tipping back over the back shoulder (`FLICK_LOWERED`), and into the guard.
 * Taken home still bent over, the blade went through his head whichever way
 * it was swung.
 */
const FLICK_UNWRAP: Pose = { ...GUARD, hip: [-.06, .92, .08], chest: [-.08, 1.28, .12],
  frontFoot: [-.06, .08, .36], backFoot: [-.14, .08, -.30],
  grip: [-.20, 1.74, .50], batUp: [0, -1, .10], batFace: [0, .10, 1],
  yaw: -.40, face: -.40, heel: .20, backFootYaw: .80, leadElbow: -.10, armHinge: .90, armDrive: 1, shoulderLift: .06 };
const FLICK_LOWERED: Pose = { ...GUARD, hip: [-.06, .93, .02], chest: [-.02, 1.28, .06],
  frontFoot: [-.08, .08, .30], backFoot: [-.13, .08, -.27],
  grip: [.10, 1.22, .36], batUp: [-.40, -.80, .45], batFace: [.20, .45, .87],
  yaw: .75, face: 0, heel: .06, backFootYaw: 1.10, leadElbow: -.20, armHinge: .20, armDrive: .5, shoulderLift: .02 };
/**
 * Version three of the flick is not drawn by the roll: it is the flick at a
 * ball short of a length, one that reaches him above `DEFENCE_BACK_HEIGHT`
 * and below `PULL_HEIGHT` (back of a length, rising to his thigh), played off
 * the back foot (`FLICK_V3`). A ball pitched up keeps the two front-foot
 * versions; a bouncer is pulled.
 */
export const flickBackFoot = (ballY: number) => ballY > DEFENCE_BACK_HEIGHT && ballY <= PULL_HEIGHT;
/** Version three meets the ball late, under his eyes just in front of the front pad, the feet back in the crease. */
export const FLICK_V3_MEETS_AT = -.05;
export const FLICK_V3_CONTACT_MS = 150;
/**
 * Its clock: back and across with the bat up (`load`), the ball, the bat
 * lifted straight up after it (`lift`), tipped over across the front of his
 * helmet (`across`), on up to the diagonal finish (`finish`), held, and home.
 */
export const FLICK_V3_CLOCK = { load: 85, lift: 240, across: 340, finish: 430, hold: 640 } as const;
/** How much longer than the stroke's own clock he holds the back-foot flick's finish. */
export const FLICK_V3_HOLD_MS = 120;
/**
 * The flick off the back foot, version three, from a net clip filmed from
 * the bowler's end, at a ball short of a length rising to the thigh.
 *
 * The back foot goes back and across towards off stump and the front foot is
 * drawn back beside it, so at the ball the feet are side by side, shoulder
 * width apart, and his hips and chest are opened towards the bowler. He stands
 * up tall on the back leg; nothing goes down the pitch. The bat comes down
 * straight from a high pick-up, the top elbow up, and meets the ball late,
 * just in front of the front pad and under his eyes, the wrists having turned
 * the flat face to square leg to send it there. Then the hands lift the bat
 * straight up, still upright, the face turned back to the bowler; the toe
 * tips over to the off side until the bat lies across the front of his helmet
 * with the hands by the front shoulder, and goes on up until it stands
 * diagonally in front of his helmet, the toe up over the back shoulder, the
 * flat face to the bowler and the curved back to him. The front heel comes up
 * and the knee turns in as he holds it, the weight left on the back foot.
 * The face rides the handle (`riding`): to square leg at the ball, and to
 * the bowler at every key after it.
 *
 * Keyed for the ball on leg stump: the reach moves him from there.
 */
const FLICK_V3: Stroke & { load: Pose; lift: Pose; across: Pose } = {
  load: { ...BACKLIFT, hip: [.08, .96, -.18], chest: [.12, 1.31, -.12], frontFoot: [-.04, .10, -.04], backFoot: [.26, .08, -.40],
    grip: [.30, 1.14, .08], batUp: [-.30, -.70, .65], batFace: [.28, .70, .66],
    yaw: .95, heel: .04, backFootYaw: .90, leadElbow: .10 },
  contact: { ...GUARD, hip: [.14, .95, -.30], chest: [.20, 1.26, -.08], frontFoot: [.00, .08, -.22], backFoot: [.30, .08, -.40],
    grip: [.22, 1.12, .38], batUp: [-.05, .95, .30], batFace: [0, -.30, .95],
    yaw: .60, face: .10, heel: .06, backFootYaw: .60, frontFootYaw: .30, leadElbow: .65, look: .50 },
  lift: { ...GUARD, hip: [.14, .98, -.28], chest: [.17, 1.31, -.15], frontFoot: [.00, .08, -.22], backFoot: [.30, .08, -.40],
    grip: [.18, 1.25, .38], batUp: [-.08, .97, .22], batFace: [0, -.22, .97],
    yaw: .52, face: .05, heel: .06, toe: .10, backFootYaw: .60, frontFootYaw: .30, leadElbow: .85, look: .30 },
  across: { ...GUARD, hip: [.14, .98, -.28], chest: [.16, 1.31, -.17], frontFoot: [.00, .08, -.22], backFoot: [.30, .08, -.40],
    grip: [.14, 1.46, .28], batUp: [-.88, .08, .47], batFace: [.47, 0, .88],
    yaw: .48, face: 0, heel: .06, toe: .30, backFootYaw: .60, frontFootYaw: .20, leadElbow: .70, look: .10 },
  finish: { ...GUARD, hip: [.14, .98, -.28], chest: [.16, 1.31, -.18], frontFoot: [.00, .08, -.22], backFoot: [.30, .08, -.40],
    grip: [.08, 1.48, .20], batUp: [-.74, -.64, .12], batFace: [.12, 0, .99],
    yaw: .48, face: 0, heel: .06, toe: .45, backFootYaw: .60, frontFootYaw: .10, leadElbow: .55, look: 0 },
};
export const LOFT_V2_CLOCK = { plant: 70, through: 220, finish: 320, hold: 650, down: 760, under: 870 } as const;
const STRAIGHT_LOFT_V2: Stroke = {
  // Down the line on a long stride, the weight over the front knee.
  contact: { ...STROKES.STRAIGHT.contact, hip: [-.13, .70, .08], chest: [.00, 1.03, .22],
    frontFoot: [.03, .08, .66], backFoot: [-.15, .08, -.34], heel: .22, yaw: 1.22, face: .02, look: .15 },
  // Out after the ball: both arms long up the line, the blade already rising.
  through: { ...STROKES.STRAIGHT.through!, hip: [.02, .76, .20], chest: [.12, 1.10, .36],
    frontFoot: [.03, .08, .66], backFoot: [-.14, .08, -.30],
    grip: [.32, 1.20, 1.00], batUp: [.06, .30, -.952], batFace: [0, .952, .30], heel: .34, armHinge: .65, shoulderLift: .05, look: .05 },
  // The end of it, held: the arms long and high up the line, the hands over the
  // front shoulder and clear of his face, the back arm crossing under the chin
  // rather than across the grille, the chin up after the ball, the toe up over the bowler.
  finish: { ...STROKES.STRAIGHT.through!, hip: [.04, .78, .30], chest: [.04, 1.12, .22],
    frontFoot: [.03, .08, .66], backFoot: [-.12, .10, -.28],
    grip: [-.20, 1.53, 1.00], batUp: [.05, -.40, -.915], batFace: [0, .915, -.40], heel: .52,
    backFootYaw: .80, yaw: -.25, armHinge: 1.10, leadElbow: .28, armDrive: 1, shoulderLift: .02, look: -.60 },
  recover: STROKES.STRAIGHT.recover,
};
/**
 * The on drive, lofted: the six.
 *
 * The on drive's own ball and contact, and the lofted straight drive's
 * extension and carry turned to long-on with it, the blade already climbing as
 * the arms straighten. Then it wraps: the arms carry on up and over, the
 * elbows bent rather than reaching for the sky, and the finish is the hands
 * just above the front shoulder with the bat lying back over the top of it
 * and behind his head, the chest open to long-on and the back foot up on its
 * toe, watching it go. The arms do it, not the wrists: from the ball on the
 * face rides the handle (`riding`), and the one turn in his hands is the
 * bottom hand rolling over the top one through the carry, so that the curved
 * back of the blade, not its face, lies against the shoulder. Timed
 * anything less than perfectly it is the on drive along the ground that gets
 * played, which is also the ball that is worth less than six.
 */
const ON_LOFT: Stroke = {
  contact: STROKES.LONG_ON.contact,
  through: { ...STROKES.LONG_ON.through!, grip: [.210, 1.08, .899], batUp: [.419, .44, -.794], batFace: [-.179, .90, .402],
    heel: .28, armHinge: .70, shoulderLift: .05 },
  carry: { ...GUARD, hip: [.044, .86, .19], chest: [.122, 1.20, .334], frontFoot: [-.116, .08, .524], backFoot: [.088, .08, -.228],
    grip: [.146, 1.42, .87], batUp: [.379, -.60, -.705], batFace: [.29, .80, -.528], yaw: -.14, face: -.36, heel: .38,
    backFootYaw: .48, leadElbow: .26, armHinge: 1.30, armDrive: 1, shoulderLift: .07 },
  finish: { ...GUARD, hip: [.04, .88, .17], chest: [.08, 1.22, .29], frontFoot: [-.116, .08, .524], backFoot: [.09, .12, -.21],
    grip: [-.10, 1.62, .46], batUp: [-.40, -.66, .64], batFace: [.85, 0, .53], yaw: -.40, face: -.45, heel: .55,
    backFootYaw: .40, leadElbow: .30, armHinge: 1.60, armDrive: 1, shoulderLift: .10 },
  recover: STROKES.LONG_ON.recover,
};
/**
 * The advance charge — the reference recordings, from behind and from the front.
 *
 * Both show the same stroke. The back foot skips up to the front one first,
 * then the front foot strides out a long way down the pitch, and the bat goes
 * up high behind him while the feet are moving — by the time the front foot
 * lands the toe is pointing at the sky over his back shoulder. From there it is
 * a lofted straight drive played on the move: down and through the line, the
 * ball met on the full level with the front pad, the arms opening out straight
 * up the ground, and the blade climbing all the way over the FRONT shoulder,
 * where the hands finish high beside the helmet and the toe hangs down behind
 * his back. The chest has turned to face the bowler by then, the back foot has
 * come through past the front one, and he stands there and watches it go.
 *
 * The keys are on the charge's own clock, `CHARGE_CLOCK`, and every foot in
 * them is authored on the ground he is actually covering: `CHARGE_TRAVEL` is
 * where the root has got to at each key, and a planted foot is written a little
 * further back in each successive key by exactly that much, so that it stays
 * where it was put while the body runs on over it.
 */
export const CHARGE_CLOCK = { skip: 110, plant: 190, drop: 228, under: 266, contact: CHARGE_CONTACT_MS, through: 400, carry: 495,
  over: 565, finish: 615, hold: 690, unwrap: 775, across: 835, recover: 890 } as const;
/**
 * The straight charge's wrap, held: `held` milliseconds still at the hold, the
 * bat laid back on his shoulder, then `home` to come back to his guard, where
 * the clock gives it 250. The walk back to the crease starts that much later,
 * at its own pace: he is back in his crease well before the next run-up, which
 * waits on the six's flight and the result. Quickened to make up the time, the
 * walk moved a foot further a frame than the walk's own test allows.
 */
export const STRAIGHT_CHARGE_HOLD = { held: 220, home: 380 } as const;
/** How far down the pitch the root has travelled at each key, in metres. */
const CHARGE_TRAVEL = { skip: .06, plant: .20, drop: .26, under: .31, contact: .34, through: .60, carry: .85, over: .96, finish: 1.05 } as const;
/**
 * Every pose of the charge, in order. Not a `Stroke`: it has more keys than one
 * names, and it never runs through the shared clock.
 */
const CHARGE_KEYS: readonly { time: number; pose: Pose }[] = [
  // The skip. The back foot has come up beside the front one — from a quarter
  // of a metre behind it to level with it — and the bat is on its way up over
  // the shoulder. The front foot has not moved: he skips TO it, then strides
  // off it. He is only just out of his ground.
  { time: CHARGE_CLOCK.skip, pose: { ...GUARD, hip: [-.05, .93, .02], chest: [.02, 1.27, .09],
    frontFoot: [-.10, .08, .21], backFoot: [-.19, .11, .04],
    grip: [.30, 1.14, -.01], batUp: [-.28, -.86, .42], batFace: [.30, .82, .35],
    yaw: 1.28, face: 0, heel: .12, backFootYaw: 1.38, leadElbow: -.24 } },
  // The plant. The front foot has landed a stride and a half down the pitch,
  // the back foot is up on its toe where the skip left it, and the bat is at
  // the very top — toe to the sky behind him, hands up at the shoulder. The
  // hips are already dropping into the lunge and the head is going forward
  // over the front knee.
  { time: CHARGE_CLOCK.plant, pose: { ...GUARD, hip: [-.07, .82, .12], chest: [.03, 1.16, .23],
    frontFoot: [-.04, .08, .75], backFoot: [-.22, .08, -.10],
    grip: [.32, 1.14, .06], batUp: [-.12, -.90, .42], batFace: [.32, .78, .34],
    yaw: 1.24, face: .02, heel: .30, backFootYaw: 1.34, leadElbow: -.10,
    // The drive's elbow aim is on from the top of the backlift, not switched
    // on in the forty milliseconds of the downswing: turned on that late it
    // swung the front elbow a fifth of a metre in a frame.
    armHinge: .60, armDrive: 1, shoulderLift: 0 } },
  // The downswing, in two keys. From the top the toe has to travel half a
  // turn to the ball — up behind him, back, under, and through — and half a
  // turn keyed end to end has no shortest way round: interpolated in one span
  // the blade swung out flat to the off side and came in across the line.
  // These pin the plane. First the hands drop and the toe trails behind him,
  // pointing back up the pitch at the keeper...
  { time: CHARGE_CLOCK.drop, pose: { ...GUARD, hip: [-.08, .79, .13], chest: [.04, 1.13, .25],
    frontFoot: [-.03, .08, .69], backFoot: [-.22, .08, -.16],
    grip: [.40, 1.02, .22], batUp: [-.20, .35, .91], batFace: [.10, .92, -.35],
    yaw: 1.20, face: .02, heel: .36, backFootYaw: 1.32, leadElbow: .04,
    armHinge: .80, armDrive: 1, shoulderLift: 0 } },
  // ...then it is under him, toe to the turf behind the front pad, an instant
  // before it comes through.
  { time: CHARGE_CLOCK.under, pose: { ...GUARD, hip: [-.08, .77, .14], chest: [.05, 1.11, .26],
    frontFoot: [-.02, .08, .64], backFoot: [-.22, .08, -.21],
    grip: [.40, .95, .50], batUp: [-.12, .99, .08], batFace: [0, .12, -.99],
    yaw: 1.17, face: .02, heel: .42, backFootYaw: 1.31, leadElbow: .14,
    armHinge: .90, armDrive: 1, shoulderLift: 0 } },
  // Contact. Low in the lunge with the weight through the front knee, the back
  // leg stretched out behind on its toe, the head over the ball. The blade is
  // laid back a shade further than a drive's so the face is under the ball —
  // this one is going up — and the arms are still bent: they open THROUGH it.
  { time: CHARGE_CLOCK.contact, pose: { ...GUARD, hip: [-.08, .76, .14], chest: [.06, 1.10, .26],
    frontFoot: [-.02, .08, .61], backFoot: [-.22, .08, -.24],
    grip: [.40, .94, .62], batUp: [.04, .95, -.31], batFace: [0, .31, .95],
    yaw: 1.15, face: .02, heel: .45, backFootYaw: 1.30, leadElbow: .20,
    armHinge: .90, armDrive: 1, shoulderLift: 0 } },
  // Extension. Both arms out straight up the ground, the shoulders turned
  // through, the blade climbing after the ball. The back foot has left the turf
  // — he is running through the shot, not standing on it.
  { time: CHARGE_CLOCK.through, pose: { ...GUARD, hip: [.00, .78, .16], chest: [.16, 1.14, .30],
    frontFoot: [-.02, .08, .35], backFoot: [-.14, .13, -.30],
    grip: [.42, 1.02, .82], batUp: [.06, .60, -.80], batFace: [0, .80, .60],
    yaw: .55, face: .06, heel: .60, backFootYaw: 1.00, leadElbow: .24,
    armHinge: .55, armDrive: 1, shoulderLift: .04 } },
  // Carry. Up in front of him before it comes over him — the same reason the
  // drives have this key — with the chest opening to the bowler and the back
  // foot swinging through level with the front one.
  { time: CHARGE_CLOCK.carry, pose: { ...GUARD, hip: [.03, .84, .06], chest: [.14, 1.20, .14],
    frontFoot: [-.02, .08, .10], backFoot: [-.22, .16, .00],
    grip: [.24, 1.40, .68], batUp: [.02, -.30, -.95], batFace: [.04, .95, -.30],
    yaw: .30, face: .04, heel: .30, backFootYaw: .90, leadElbow: .26,
    // The aim is already letting go here, and the hinge already coming down
    // from the extension's high elbow, so that the rest of the fade to the
    // wrap is short in angle: let go all at once between here and the top,
    // the front elbow fell a quarter of a metre in thirty milliseconds.
    armHinge: .80, armDrive: .80, shoulderLift: .05 } },
  // Over the top. Toe to the sky above the front shoulder, an instant before it
  // drops down behind him. Keyed because the other half-turn in this stroke —
  // from up in front to down behind — has no shortest way round either, and
  // the way it found went through his hips: the toe came over the shoulder and
  // straight down through the middle of him. This holds it up and outside the
  // shoulder, so that what comes down behind him comes down BEHIND him.
  { time: CHARGE_CLOCK.over, pose: { ...GUARD, hip: [.03, .87, .05], chest: [.06, 1.23, .10],
    frontFoot: [-.02, .08, -.01], backFoot: [-.22, .12, .12],
    grip: [-.06, 1.64, .46], batUp: [.20, -.95, .24], batFace: [.97, .20, .10],
    yaw: .18, face: .02, heel: .10, backFootYaw: .50, leadElbow: .24,
    // The drive aim is off by here. Kept on into the wrap it is the exact
    // opposite of the way the helmet guard leans the arm as the hands pass the
    // head, and a part-way turn between two opposite directions swaps sides —
    // the front elbow crossed a third of a metre in one frame. The anatomical
    // bend the wrap is solved on instead — down, out and forward — agrees with
    // the guard.
    armHinge: .60, armDrive: 0, shoulderLift: .07 } },
  // The finish. Square to the bowler, the back foot planted through in front
  // of the other one, the hands high and wide beside the front shoulder and
  // the blade laid back across it, resting on the shoulder and pointing back
  // at the keeper. Hanging straight down his back, it lay on its edge. Both
  // hands stay in front of the shoulder line: a two-handed grip cannot be
  // taken round behind it, and the hands go out wide rather than tight beside
  // the ear, where the shaft would come down across the grille.
  { time: CHARGE_CLOCK.finish, pose: { ...GUARD, hip: [.02, .86, .05], chest: [.02, 1.22, .08],
    frontFoot: [-.02, .08, -.10], backFoot: [-.20, .08, .20],
    grip: [-.22, 1.62, .36], batUp: [.08, .35, .93], batFace: [.96, -.02, -.14],
    yaw: .10, face: 0, heel: 0, backFootYaw: .30, leadElbow: .20,
    shoulderLift: .08 } },
];
const CHARGE_CONTACT = CHARGE_KEYS.find(k => k.time === CHARGE_CLOCK.contact)!.pose;
const CHARGE_FINISH = CHARGE_KEYS.find(k => k.time === CHARGE_CLOCK.finish)!.pose;
/**
 * Home from the wrap, back the way it came. The finish holds the bat behind
 * the front shoulder and the guard holds it behind the back one, and every
 * short path between the two goes through his head. The first way home
 * dropped the blade past the outside of the front shoulder to hang beside the
 * left hip, toe to the turf, which read as the bat sliding down the shoulder.
 * So he now does what the recording does: the bat comes back up over the top
 * on the arc it went over on — the over-the-top key again, toe to the sky
 * above the front shoulder — and only then comes down in front of him, the
 * hands falling to the chest with the toe still up, straight into the
 * pick-up.
 */
const CHARGE_UNWRAP: Pose = { ...GUARD, hip: [.00, .88, .02], chest: [.02, 1.23, .06],
  frontFoot: [-.03, .08, -.12], backFoot: [-.21, .08, .18],
  grip: [-.08, 1.64, .44], batUp: [.20, -.90, .38], batFace: [.97, .20, .10],
  yaw: .18, face: .02, heel: .10, backFootYaw: .50, leadElbow: .22,
  armHinge: .60, armDrive: 0, shoulderLift: .07 };
/**
 * Down in front of him, toe still up. From the top to the pick-up is a short
 * turn with the blade kept up; taken with the toe down it was most of a half
 * turn, and the short way round it swung the knob back into his chest.
 */
const CHARGE_ACROSS: Pose = { ...GUARD, hip: [-.02, .90, .00], chest: [.02, 1.25, .04],
  frontFoot: [-.05, .08, .00], backFoot: [-.19, .08, .04],
  grip: [.06, 1.34, .50], batUp: [.18, -.72, -.67], batFace: [.95, .20, .08],
  yaw: .55, face: 0, heel: 0, backFootYaw: .80, leadElbow: .05, armHinge: .50 };
const CHARGE_RECOVER: Pose = { ...GUARD, hip: [-.04, .92, -.02], chest: [.02, 1.26, .02],
  frontFoot: [-.06, .08, .12], backFoot: [-.18, .08, -.10],
  grip: [.34, 1.08, .44], batUp: [-.15, -.80, -.58], batFace: [.86, -.22, .17],
  yaw: .85, face: 0, heel: 0, backFootYaw: 1.10, leadElbow: -.20 };
/**
 * The charge over cover — the second pair of recordings, from behind and from
 * the bowler's end.
 *
 * The same walk at the ball: the skip, the stride, the bat to the sky, the
 * downswing along the line. What changes is everything from the ball onwards.
 * The face is opened to cover at contact and the body stays closed — he is
 * hitting inside out, across the line of a ball on the stumps, so the
 * shoulders turn far less than the straight charge's. The arms extend out
 * towards extra cover rather than up the ground, and the hands lift the bat
 * level, as a net clip filmed from the bowler's end has it: parallel to the
 * ground from the extension to the finish, never upright, the hands just
 * above the helmet at the end with the toe pointing up the pitch over extra
 * cover, the chest and head left leaning to the off side. No wrap. The first
 * build took the arms straight up and stood the bat on end over the off
 * shoulder.
 *
 * The front foot lands a little to the off side of where the straight charge
 * puts it, which is what opens the hips enough to get the arms out that way.
 */
const COVER_CHARGE_CLOCK = { finish: 580, down: 760, recover: 830 } as const;
const COVER_CHARGE_KEYS: readonly { time: number; pose: Pose }[] = [
  ...CHARGE_KEYS.filter(k => k.time < CHARGE_CLOCK.under).map(k => k.time === CHARGE_CLOCK.plant || k.time === CHARGE_CLOCK.drop
    ? { time: k.time, pose: { ...k.pose, frontFoot: [k.pose.frontFoot[0] + .08, k.pose.frontFoot[1], k.pose.frontFoot[2]] as Point } }
    : k),
  // Under him, toe to the turf, with the hands already a shade further to the
  // off side: the swing is going out that way from here.
  { time: CHARGE_CLOCK.under, pose: { ...GUARD, hip: [-.07, .77, .14], chest: [.07, 1.11, .26],
    frontFoot: [.06, .08, .64], backFoot: [-.22, .08, -.21],
    grip: [.44, .95, .50], batUp: [-.12, .99, .08], batFace: [.30, .12, -.94],
    yaw: 1.20, face: .02, heel: .42, backFootYaw: 1.31, leadElbow: .14,
    armHinge: .90, armDrive: 1, shoulderLift: 0 } },
  // Contact. Low in the lunge, the head over the ball, the face opened to
  // cover and the blade laid back under it. Still side-on: the inside-out
  // shot is played with the body closed and the arms doing the reaching.
  { time: CHARGE_CLOCK.contact, pose: { ...GUARD, hip: [-.06, .76, .14], chest: [.10, 1.10, .26],
    frontFoot: [.06, .08, .61], backFoot: [-.22, .08, -.24],
    grip: [.44, .94, .62], batUp: [.10, .94, -.32], batFace: [.55, .25, .80],
    yaw: 1.30, face: .06, heel: .45, backFootYaw: 1.30, leadElbow: .20,
    armHinge: .90, armDrive: 1, shoulderLift: 0 } },
  // Extension, out towards extra cover: both arms straight, the blade already
  // climbing, the shoulders only part-way round.
  { time: CHARGE_CLOCK.through, pose: { ...GUARD, hip: [.02, .78, .16], chest: [.16, 1.14, .28],
    frontFoot: [.06, .08, .35], backFoot: [-.16, .13, -.30],
    grip: [.58, 1.06, .68], batUp: [-.55, .30, -.78], batFace: [.55, .72, -.42],
    yaw: .80, face: .10, heel: .60, backFootYaw: 1.00, leadElbow: .24,
    armHinge: .55, armDrive: 1, shoulderLift: .04 } },
  // The hands go up and out, the bat lifted level in them, out in front.
  { time: CHARGE_CLOCK.carry, pose: { ...GUARD, hip: [.04, .84, .10], chest: [.20, 1.18, .16],
    frontFoot: [.06, .08, .10], backFoot: [-.20, .16, .00],
    grip: [.56, 1.42, .66], batUp: [-.55, .05, -.83], batFace: [.62, .52, -.57],
    yaw: .60, face: .12, heel: .30, backFootYaw: .90, leadElbow: .26,
    armHinge: .70, armDrive: .80, shoulderLift: .06 } },
  // The finish. Hands just above the helmet and out in front of it, the bat
  // level and pointing up the pitch over extra cover, the head still over to
  // the off side — held.
  { time: COVER_CHARGE_CLOCK.finish, pose: { ...GUARD, hip: [.04, .88, .06], chest: [.18, 1.20, .12],
    frontFoot: [.06, .08, -.04], backFoot: [-.20, .08, .18],
    grip: [.40, 1.78, .52], batUp: [-.28, .02, -.96], batFace: [.70, -.20, -.68],
    yaw: .55, face: .15, heel: 0, backFootYaw: .40, leadElbow: .30,
    // The aim stays on here: it is what carries the upper arms up with the
    // hands rather than letting the front elbow bow forward. It is let go on
    // the way down.
    armHinge: 1.20, armDrive: .60, shoulderLift: .08 } },
];
/**
 * Down from the high finish, out in front of the face with the bat still
 * level. Straight from above the helmet to the pick-up, the knob came down
 * through the grille.
 */
const COVER_CHARGE_DOWN: Pose = { ...GUARD, hip: [.02, .90, .04], chest: [.08, 1.25, .08],
  frontFoot: [.04, .08, .02], backFoot: [-.19, .08, .06],
  grip: [.46, 1.42, .72], batUp: [-.45, -.25, -.86], batFace: [.80, -.20, -.15],
  yaw: .75, face: .08, heel: 0, backFootYaw: .80, leadElbow: .05,
  // Half let go, with the hinge coming down with the hands. Let go all at
  // once between the finish and here the front elbow moved too fast.
  armHinge: .60, armDrive: .40, shoulderLift: .03 };
/** And across into the pick-up. No wrap to undo. */
const COVER_CHARGE_RECOVER: Pose = { ...GUARD, hip: [-.02, .92, .00], chest: [.04, 1.26, .04],
  frontFoot: [.00, .08, .10], backFoot: [-.18, .08, -.10],
  grip: [.40, 1.10, .44], batUp: [-.15, -.80, -.58], batFace: [.86, -.22, .17],
  yaw: .95, face: .05, heel: 0, backFootYaw: 1.10, leadElbow: -.20 };
const COVER_CHARGE_CONTACT = COVER_CHARGE_KEYS.find(k => k.time === CHARGE_CLOCK.contact)!.pose;

/**
 * A hundred.
 *
 * He turns towards the camera, puts the bat up beside his head in his right
 * hand, and punches the sky with his left; pumps it twice; looks round the
 * ground at it; then takes the bat in both hands again in front of him and is
 * back in his guard — a second and a half, because it is a moment inside an
 * innings and the next ball is coming.
 *
 * It is the only thing in the game played one-handed: the top hand lets go
 * of the handle by `release` and goes to `fist`, and the bat is held up by
 * the bottom hand alone. Turned three-quarters to the camera, so the player
 * sees his front, which from behind the stumps is otherwise only ever his back.
 */
export const CELEBRATION_MS = 1550;
/**
 * A shoulder, where `apply` will put it for this body. The celebration's hands
 * are placed off the shoulders rather than written in as numbers: he turns
 * right round to face the camera for it, and a hand written for one turn is
 * in the wrong place for any other.
 */
function shoulderOf(body: Pose, side: 0 | 1) {
  const chest = V(body.chest), spine = chest.clone().sub(V(body.hip)).normalize();
  const torso = new THREE.Quaternion().setFromUnitVectors(UP, spine)
    .multiply(new THREE.Quaternion().setFromAxisAngle(UP, body.yaw));
  return new THREE.Vector3(side === 0 ? -.163 : .163, .075 + (body.shoulderLift ?? 0), 0).applyQuaternion(torso).add(chest);
}
/** Level, from the chest out through a shoulder. */
const outwards = (body: Pose, side: 0 | 1) => shoulderOf(body, side).sub(V(body.chest)).setY(0).normalize();
const point = (v: THREE.Vector3) => v.toArray() as unknown as Point;
/** Feet under the hips, a little wider than them, for a body turned `yaw`. */
function standing(body: Pose): Pose {
  const hip = V(body.hip);
  const foot = (side: 0 | 1) => point(hip.clone().addScaledVector(outwards(body, side), .19).setY(.08));
  return { ...body, frontFoot: foot(0), backFoot: foot(1), backFootYaw: body.yaw - .1 };
}
/**
 * The bat up beside his head in his right hand, the left fist punching the
 * sky: `bat` and `fist` are how far up and how far out from each shoulder.
 */
function aloft(body: Pose, bat: [up: number, out: number], fist: [up: number, out: number]): Pose {
  const right = shoulderOf(body, 1), left = shoulderOf(body, 0);
  const outR = outwards(body, 1), outL = outwards(body, 0);
  // Toe to the sky, leaning a little away from his head.
  const toe = UP.clone().addScaledVector(outR, .22).normalize();
  return { ...body,
    grip: point(right.addScaledVector(UP, bat[0]).addScaledVector(outR, bat[1])),
    batUp: point(toe.clone().negate()), batFace: [0, 0, -1],
    fist: point(left.addScaledVector(UP, fist[0]).addScaledVector(outL, fist[1])), release: 1 };
}
/** Turned to face the camera, stood up tall, chin up. */
const FACING: Pose = standing({ ...GUARD, hip: [-.02, .97, -.02], chest: [.00, 1.31, .00],
  yaw: 2.4, face: 2.4, headDown: -.24, heel: 0, leadElbow: .20,
  armHinge: -.6, armDrive: 0, shoulderLift: .10 });

/**
 * What he does once a ball is done with, besides going home to his guard, and
 * on only some of the balls that call for it (`afterBall` in
 * `src/game/afterBall.ts` decides which):
 *
 * - `admire`: a classic drive held at the finish while his head follows the
 *   ball away, then the bat held out in both hands to look at its face, where
 *   he middled it;
 * - `lean`: a classic drive for four, the same hold, then stood leaning on the
 *   bat with his legs crossed and a hand on his hip, looking after it;
 * - `watch`: a lofted shot watched all the way, stood tall, the bat lowered
 *   in the bottom hand;
 * - `twirl`: a pull, the bat spun once in the bottom hand on the way home;
 * - `brush`: up off a knee from a sweep or a scoop, a hand down the front pad;
 * - `shadow`: beaten, the stroke rehearsed slowly, without the ball;
 * - `scrub`: beaten, stood over the crease looking down at it, the bat on his
 *   shoulder, scraping the pitch with the front foot;
 * - `sky`: out close to a milestone, in the nineties or the ball after five
 *   sixes: turned to the camera, head right back to the sky, arms hanging.
 *
 * Every one starts and ends in the guard, so it can begin the moment the
 * stroke is home and the next ball can find him where it always does.
 */
export type AfterBall = 'admire' | 'lean' | 'watch' | 'twirl' | 'brush' | 'shadow' | 'scrub' | 'sky' | 'down' | 'ribs' | 'sting' | 'dazed';
/** What kind of stroke it was, which is half of what decides the `AfterBall`. */
export interface PlayedStroke { shot: ShotType; charging: boolean; lofted: boolean; swept: boolean; pulled: boolean }
/**
 * When each part is done, and the pose it is done in. A third entry is the
 * curve into that key, for a movement meant to pass through it without
 * stopping (`leave` and `arrive`); otherwise each part settles at its key.
 */
type Keys = [number, Pose, ((t: number) => number)?][];

/**
 * The admired drive's end: the bat held out in front of him in both hands, at
 * arm's length and tilted up and away, its face turned to him, his head up to
 * look at where he middled it. Held close in one hand, it was in his face.
 */
const CHECKING: Pose = (() => {
  const body: Pose = { ...STANDING, chest: [0.0, 1.37, -0.02], headDown: -.18 };
  const ahead = new THREE.Vector3(Math.sin(body.yaw), 0, Math.cos(body.yaw));
  const grip = V(body.chest).addScaledVector(ahead, .44).addScaledVector(UP, -.20).addScaledVector(outwards(body, 1), .06);
  // Toe to handle: the blade up and leaning away from him, so the handle comes back down to his hands.
  return { ...body, grip: point(grip), batUp: point(ahead.clone().multiplyScalar(-.35).addScaledVector(UP, -1).normalize()),
    batFace: point(ahead) };
})();
const CHECK_KEYS: Keys = [[0, GUARD], [450, CHECKING], [1050, CHECKING], [1450, GUARD]];
/**
 * A drive for four: turned towards the camera, as for a celebration, so the
 * crossed legs can be seen at all, he stands leaning on the bat planted at his
 * side, the far foot crossed over in front of the near one on its toe, his
 * free hand on his hip, looking up after the ball.
 */
const LEAN_KEYS: Keys = (() => {
  const turned = standing({ ...STANDING, hip: [-.03, .99, -.03], chest: [.0, 1.375, -.03], yaw: 2.05, face: 2.35, headDown: -.2, release: 1 });
  const ahead = new THREE.Vector3(Math.sin(turned.yaw), 0, Math.cos(turned.yaw));
  const hip = V(turned.hip).setY(.08), near = outwards(turned, 0), far = outwards(turned, 1);
  const crossed: Pose = { ...turned,
    frontFoot: point(hip.clone().addScaledVector(near, .05)),
    // The far foot over in front of the other and out beyond it, on its toe.
    backFoot: point(hip.clone().addScaledVector(near, .19).addScaledVector(ahead, .11)), heel: .32, backFootYaw: turned.yaw - .5,
    // Planted out at his side, the toe a little further out than the handle.
    grip: point(V(turned.hip).setY(.88).addScaledVector(far, .30).addScaledVector(ahead, .04)),
    batUp: point(UP.clone().addScaledVector(far, -.16).normalize()), batFace: point(ahead),
    fist: onHip(turned) };
  // The bat down first and then the turn, as for the sky.
  return [[0, GUARD], [280, STANDING], [620, crossed], [1350, crossed], [1650, STANDING], [1950, GUARD]];
})();
/** The free (top) hand let go and hanging loose by his side. */
function hangingFist(body: Pose) { return point(shoulderOf(body, 0).addScaledVector(UP, -.52).addScaledVector(outwards(body, 0), .10)); }
/** Where he looks to follow a lofted shot: down the ground, or out to either side of it. */
const LOOK: Partial<Record<ShotType, number>> = { STRAIGHT: 0, LONG_ON: -.45, COVER_LONG_OFF: .45, LEG: -.9 };
/** The free hand on his hip, the elbow out: a man with nothing to do but watch. */
function onHip(body: Pose) { return point(shoulderOf(body, 0).addScaledVector(UP, -.40).addScaledVector(outwards(body, 0), .17)); }
function watchKeys(shot: ShotType): Keys {
  // Chin up after the ball, the chest leaning back and turned a little after
  // it too. Not the head tipped right back: from behind, the peak of the
  // helmet then shows above the crown at both sides like a pair of ears.
  const look = LOOK[shot] ?? 0;
  const body: Pose = { ...STANDING, chest: [0.0, 1.38, -0.05], yaw: STANDING.yaw + look * .3, release: 1, face: look, headDown: -.2 };
  const watching: Pose = { ...body, fist: onHip(body) };
  return [[0, GUARD], [380, watching], [1000, watching], [1350, GUARD]];
}
/**
 * The bat held up in front of his chest in the bottom hand, blade to the sky
 * and the handle down, the top hand let go, ready to spin it: the way the
 * great batters hold it up between balls, not hanging at the pitch.
 */
const TWIRLING: Pose = (() => {
  const body: Pose = { ...STANDING, chest: [0.0, 1.38, 0.0], release: 1 };
  const ahead = new THREE.Vector3(Math.sin(body.yaw), 0, Math.cos(body.yaw));
  const grip = shoulderOf(body, 1).addScaledVector(ahead, .30).addScaledVector(UP, -.14);
  // `batUp` runs from the toe to the handle: with the blade up, it points down.
  return { ...body, grip: point(grip), batUp: point(new THREE.Vector3(0, -1, 0).addScaledVector(ahead, -.12).normalize()),
    batFace: point(ahead), fist: hangingFist(body) };
})();
const TWIRL_KEYS: Keys = [
  [0, GUARD], [300, TWIRLING], [340, { ...TWIRLING, spin: 0 }], [780, { ...TWIRLING, spin: Math.PI * 2 }],
  // Home with the turn kept: a whole turn is no turn, and blending it back to
  // nought would spin the bat the other way.
  [1180, { ...GUARD, spin: Math.PI * 2 }],
];
/** Bent over the front pad, the top hand brushing down it. */
const BRUSH_KEYS: Keys = (() => {
  const body: Pose = { ...GUARD, hip: [-0.07, 0.87, -0.03], chest: [-0.04, 1.12, 0.19], release: 1, headDown: .25 };
  const pad = (up: number) => point(V(GUARD.frontFoot).add(new THREE.Vector3(.02, up, .07)));
  const high: Pose = { ...body, fist: pad(.52) }, low: Pose = { ...body, fist: pad(.24) };
  return [[0, GUARD], [300, high], [440, low], [560, high], [690, low], [1050, GUARD]];
})();
/**
 * The stroke he was beaten by, played again from the guard: out to the full
 * contact and a little way through, held there while he checks the line, and
 * home. Short of the contact and slowed, it read as unfinished.
 */
function shadowKeys(struck: Pose, followed: Pose, shot: ShotType): Keys {
  // To the full contact and on through it into a little of the follow-through
  // without stopping at the ball: briskly, as the stroke is meant, not slowed.
  const through = mix(struck, followed, .35);
  // The on-drive's goes through round the front leg, and straight home from
  // there the bat swung through his chest: it comes back down the line of the
  // stroke, by the contact, and home from that.
  if (shot === 'LONG_ON') return [[0, GUARD], [380, struck, leave], [560, through, arrive], [900, through], [1120, struck], [1450, GUARD]];
  return [[0, GUARD], [380, struck, leave], [560, through, arrive], [900, through], [1300, GUARD]];
}
/** The scrub's bat on the shoulder: toe to handle, forward, down and in. */
const SCRUB_LIE = [.85, .35, .12] as const;
/** Out along the shoulder, up to its top, up off it to the blade's middle line, and on from there along the blade to the hands. */
const SCRUB_REST = [.02, .09, .05, .30] as const;
/** Up and out from there, on the way on and off the shoulder. */
const SCRUB_LIFT = [.14, .06] as const;
/**
 * Beaten, stood over the crease looking down at the pitch, the bat on his
 * shoulder in the bottom hand, and the front foot scraping the turf forward
 * and back twice, as if the ball had done something off a mark there.
 */
const SCRUB_KEYS: Keys = (() => {
  // The bat over his shoulder in the one hand, the other hand hanging well
  // clear: plainly one-handed from behind. The blade lies on the shoulder on
  // its back, the face to the sky: the handle comes forward and down to his
  // hand in front, and the toe runs back behind him and a little out, away
  // from the helmet. Laid on its edge with the handle on the shoulder's own
  // line, the blade went down through the shoulder.
  const body: Pose = { ...STANDING, hip: [-0.06, 0.95, -0.03], chest: [0.02, 1.31, 0.10], headDown: .45, release: 1 };
  const ahead = new THREE.Vector3(Math.sin(body.yaw), 0, Math.cos(body.yaw)), out = outwards(body, 1);
  const handle = ahead.clone().multiplyScalar(SCRUB_LIE[0]).addScaledVector(UP, -SCRUB_LIE[1]).addScaledVector(out, -SCRUB_LIE[2]).normalize();
  const face = UP.clone().addScaledVector(handle, -UP.dot(handle)).normalize();
  // Where it rests: on top of the shoulder, the back of the blade there and
  // its middle line that much further up, at a point a hand's width below
  // the shoulder of the blade.
  const rest = shoulderOf(body, 1).addScaledVector(out, SCRUB_REST[0]).addScaledVector(UP, SCRUB_REST[1]).addScaledVector(face, SCRUB_REST[2]);
  const grip = rest.addScaledVector(handle, SCRUB_REST[3]);
  const over: Pose = { ...body, grip: point(grip), batUp: point(handle), batFace: point(face), ownFace: 1,
    fist: point(shoulderOf(body, 0).addScaledVector(UP, -.50).addScaledVector(outwards(body, 0), .20)) };
  // Lifted on and off over the top: swung straight up from the guard onto
  // the shoulder, the blade came up through it.
  const lifted: Pose = { ...over, grip: point(grip.clone().addScaledVector(UP, SCRUB_LIFT[0]).addScaledVector(out, SCRUB_LIFT[1])) };
  // Across the crease more than along it: along it, the scrape runs straight
  // away from the camera behind him, and cannot be seen.
  const foot = (by: number): Pose => ({ ...over, frontFoot: [GUARD.frontFoot[0] + by, GUARD.frontFoot[1] + .008, GUARD.frontFoot[2] + by * .45] });
  const on = foot(0), off = { ...lifted, frontFoot: on.frontFoot };
  return [[0, GUARD], [260, off], [400, on], [580, foot(.16)], [780, foot(-.02)], [980, foot(.16)], [1160, on], [1300, off], [1560, GUARD]];
})();
/**
 * Out close to a milestone: turned three-quarters to the camera, as for a
 * celebration, because from behind a man looking at the sky is only the back
 * of a helmet. Head right back, arms hanging, the bat loose in one hand; held;
 * and he turns back.
 */
const SKY_KEYS: Keys = (() => {
  const turned = standing({ ...STANDING, hip: [-.02, .97, -.02], chest: [.00, 1.35, -.03], yaw: 2.2, face: 2.2, release: 1 });
  const ahead = new THREE.Vector3(Math.sin(turned.yaw), 0, Math.cos(turned.yaw));
  // The bat held out a little in front of him, its toe angled away from his
  // legs, so it does not sweep through them as he turns: at his side, his
  // hand cut the corner past his hip on the way round.
  const bat = { grip: point(shoulderOf(turned, 1).addScaledVector(UP, -.48).addScaledVector(outwards(turned, 1), .12).addScaledVector(ahead, .20)),
    ...hanging(UP.clone().addScaledVector(outwards(turned, 1), -.22)) };
  const skyward: Pose = { ...turned, ...bat, look: -.72, fist: hangingFist(turned) };
  // The bat down first, as for the other things he does between balls, and
  // only then the turn: both at once swung the bat through his hips. Just the
  // look to the sky: with the head dropping after it as well, it was two
  // moments where one says it, and too long.
  return [[0, GUARD], [280, STANDING], [650, skyward], [1550, skyward], [1900, STANDING], [2250, GUARD]];
})();
/**
 * Out close to a milestone bowled, or taken behind: turned three-quarters to
 * the camera as for the sky, which is to his stumps and the keeper, and the
 * head dropped on his chest, the shoulders gone with it, the bat hanging from
 * the one hand and the other on his hip; held; and he turns back.
 */
const DOWN_KEYS: Keys = (() => {
  const hip = new THREE.Vector3(-.03, .95, -.03), yaw = 2.3;
  const ahead = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  // Slumped: the chest forward of the hips and a little lower than he stands.
  const chest = hip.clone().add(new THREE.Vector3(0, .33, 0)).addScaledVector(ahead, .07);
  const turned = standing({ ...STANDING, hip: point(hip), chest: point(chest), yaw, face: yaw, release: 1 });
  const bat = { grip: point(shoulderOf(turned, 1).addScaledVector(UP, -.50).addScaledVector(outwards(turned, 1), .11).addScaledVector(ahead, .18)),
    ...hanging(UP.clone().addScaledVector(outwards(turned, 1), -.2)) };
  const slumped: Pose = { ...turned, ...bat, look: .78, fist: onHip(turned) };
  // The bat down and then the turn, as for the sky.
  return [[0, GUARD], [280, STANDING], [650, slumped], [1550, slumped], [1900, STANDING], [2250, GUARD]];
})();
/**
 * Hit and still in. He turns away from the bowler, towards the keeper and so
 * three-quarters to the camera, as a man does to have a moment with it, and
 * the free hand goes where it hurts: rubbing at the ribs, shaking out a hand
 * that took it on the glove, or held to the side of the helmet while he shakes
 * his head clear. The bat hangs from the other hand. Then back to it.
 */
function hurtKeys(where: Hurt): Keys {
  const yaw = 2.6, ahead = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const hip = new THREE.Vector3(-.03, .99, -.03);
  // A little hunched, and over to the side the ball hit.
  const chest = hip.clone().add(new THREE.Vector3(0, .345, 0)).addScaledVector(ahead, where === 'HELMET' ? .02 : .07);
  const turned = standing({ ...STANDING, hip: point(hip), chest: point(chest), yaw, face: yaw, release: 1 });
  const bat = { grip: point(shoulderOf(turned, 1).addScaledVector(UP, -.48).addScaledVector(outwards(turned, 1), .12).addScaledVector(ahead, .20)),
    ...hanging(UP.clone().addScaledVector(outwards(turned, 1), -.22)) };
  const body: Pose = { ...turned, ...bat, look: where === 'HELMET' ? .1 : .32 };
  const spine = chest.clone().sub(hip).normalize();
  const at = (fist: THREE.Vector3, more: Partial<Pose> = {}): Pose => ({ ...body, fist: point(fist), ...more });
  const spot = V(clutch(body, where));
  const start: Keys = [[0, GUARD], [260, STANDING]];
  const home: Keys = [[1900, STANDING], [2200, GUARD]];
  if (where === 'GLOVES') {
    // The hand off the bat in front of him and shaken out, hard and quick,
    // then held and looked at.
    const shaken = (d: number) => at(chest.clone().addScaledVector(ahead, .30).addScaledVector(outwards(body, 0), .10).addScaledVector(UP, -.12 + d), { look: .45 });
    return [...start, [480, shaken(0)], [570, shaken(.08)], [650, shaken(-.06)], [730, shaken(.08)], [810, shaken(-.06)], [890, shaken(.08)],
      [1050, shaken(0)], [1550, shaken(.02)], ...home];
  }
  if (where === 'HELMET') {
    // The hand to the side of the helmet, and the head shaken to clear it.
    const held = (shake: number) => at(spot, { face: yaw + shake });
    return [...start, [520, held(0)], [680, held(.28)], [840, held(-.24)], [1000, held(.22)], [1160, held(-.16)], [1350, held(0)], [1600, held(0)], ...home];
  }
  // Rubbing at it, up and down along his side.
  const rub = (d: number) => at(spot.clone().addScaledVector(spine, d));
  return [...start, [500, rub(0)], [660, rub(.05)], [820, rub(-.04)], [980, rub(.05)], [1140, rub(-.04)], [1300, rub(.04)], [1600, rub(0)], ...home];
}
const keysFor = (kind: AfterBall, shot: ShotType, struck: Pose | null, followed: Pose | null = null): Keys =>
  kind === 'admire' ? CHECK_KEYS : kind === 'lean' ? LEAN_KEYS : kind === 'watch' ? watchKeys(shot) : kind === 'twirl' ? TWIRL_KEYS
    : kind === 'brush' ? BRUSH_KEYS : kind === 'scrub' ? SCRUB_KEYS : kind === 'sky' ? SKY_KEYS : kind === 'down' ? DOWN_KEYS
    : kind === 'ribs' ? hurtKeys('RIBS') : kind === 'sting' ? hurtKeys('GLOVES') : kind === 'dazed' ? hurtKeys('HELMET')
    : shadowKeys(struck ?? GUARD, followed ?? struck ?? GUARD, shot);
/** How long each takes once the stroke is home: the same whatever stroke it follows. */
/** How long `kind` takes after `shot`: the on-drive's shadow comes home the long way. */
const lengthOf = (kind: AfterBall, shot: ShotType = 'STRAIGHT') => { const keys = keysFor(kind, shot, GUARD); return keys[keys.length - 1][0]; };
/** Longest of them, for whatever has to wait them out. */
export const AFTER_BALL_MS = Math.max(...(['admire', 'lean', 'watch', 'twirl', 'brush', 'shadow', 'scrub', 'sky', 'down', 'ribs', 'sting', 'dazed'] as AfterBall[])
  .flatMap(kind => [lengthOf(kind), lengthOf(kind, 'LONG_ON')])) + ADMIRE_MS;
const RAISED = aloft(FACING, [.33, .10], [.54, .28]);
/** The pump: fist and bat drawn down together, the knees giving with them. */
const PUMPED = aloft({ ...FACING, hip: [-.03, .93, -.03], chest: [-.01, 1.27, -.01], headDown: -.14 }, [.26, .10], [.38, .26]);
const LOOKING: Pose = { ...RAISED, face: RAISED.face + .35, headDown: -.28 };
/**
 * On the way up, turning, with both hands still on the bat and the bat coming
 * up his right side. From the guard it sits behind the back shoulder, and the
 * straight line from there to beside his head runs through the helmet.
 */
const LIFTING: Pose = (() => {
  const body = standing({ ...GUARD, hip: [-.04, .95, -.02], chest: [.00, 1.29, .01],
    yaw: 1.85, face: 1.5, headDown: -.10, heel: 0, leadElbow: .05, armDrive: 0, shoulderLift: .05 });
  const out = outwards(body, 1), ahead = new THREE.Vector3(Math.sin(body.yaw), 0, Math.cos(body.yaw));
  // Out in front of the right shoulder rather than beside it, with the left
  // hand already coming off: taken right across while both hands held it, the
  // bat dragged the left arm across his chest.
  return { ...body, grip: point(shoulderOf(body, 1).addScaledVector(out, .14).addScaledVector(ahead, .24).add(new THREE.Vector3(0, .03, 0))),
    batUp: [0, -1, 0], batFace: [0, 0, -1], release: .35 };
})();
/** The same place on the way down, with the left hand all the way back on the handle. */
const RETURNING: Pose = { ...LIFTING, release: 0 };
/**
 * First up in front of him, both hands, the toe to the sky, still mostly
 * side-on. Straight from the guard to beside his right shoulder, the bat went
 * across him at hip height and through them.
 */
const RISING: Pose = { ...GUARD, hip: [-.04, .95, -.02], chest: [.01, 1.29, .02],
  grip: [.32, 1.28, -.02], batUp: [0, -1, 0], batFace: [.2, 0, -1],
  yaw: 1.45, face: .8, headDown: -.05, heel: 0, leadElbow: -.10, armDrive: 0, shoulderLift: .02, release: 0 };
/** Both hands on it again, the bat down in front of him, turning back. */
const LOWERED: Pose = { ...GUARD, hip: [-.04, .94, -.01], chest: [.02, 1.28, .03],
  frontFoot: [-.08, .08, .27], backFoot: [-.15, .08, -.22],
  grip: [.30, 1.30, .02], batUp: [-.15, -.95, .25], batFace: [.70, -.25, .66],
  yaw: 1.6, face: .05, headDown: 0, heel: 0, backFootYaw: 1.45, leadElbow: -.20,
  armDrive: 0, shoulderLift: 0, release: 0 };
const SETTLING: Pose = { ...COVER_CHARGE_RECOVER, hip: [-.05, .94, -.02], chest: [.02, 1.28, .03],
  frontFoot: [-.10, .08, .27], backFoot: [-.13, .08, -.25], yaw: 1.2, backFootYaw: 1.35, release: 0 };
/**
 * A fifty: the same gesture, half of it. The bat goes up beside his head in
 * his right hand to say thank you, the left hand stays down by his side, he
 * turns less and holds it less, and he is back in his guard in a little over
 * a second. The way up and the way down are the hundred's, which already go
 * round him rather than through him.
 */
export const FIFTY_MS = 1150;
const NODDING: Pose = (() => {
  const body = standing({ ...GUARD, hip: [-.03, .96, -.02], chest: [.00, 1.30, .01],
    yaw: 2.0, face: 2.0, headDown: -.08, heel: 0, leadElbow: .10, armDrive: 0, shoulderLift: .06 });
  const raised = aloft(body, [.26, .08], [0, 0]);
  const down = shoulderOf(body, 0).addScaledVector(UP, -.50).addScaledVector(outwards(body, 0), .10);
  return { ...raised, fist: point(down) };
})();
const NODDED: Pose = { ...NODDING, face: NODDING.face + .25, headDown: .06 };

/**
 * The Marathon's three big ones, each a pose of its own, because a double, a
 * triple and four hundred are three different days and a man who did the
 * same thing for each would be a man who had not noticed.
 *
 * **A double hundred:** both arms up and flexed, the fists beside his helmet
 * and the elbows out at the shoulders, the bat stood up in his right fist —
 * the strongman's double biceps — squeezed twice and shown to each side.
 */
const FLEXING: Pose = (() => {
  // Square on to the camera, which a three-quarter turn foreshortens the upper arms out of.
  const body = standing({ ...FACING, hip: [-.02, .97, -.02], chest: [.00, 1.31, .00], yaw: 2.95, face: 2.95, headDown: -.10, shoulderLift: .12 });
  const outR = outwards(body, 1), outL = outwards(body, 0);
  const ahead = new THREE.Vector3(Math.sin(body.yaw), 0, Math.cos(body.yaw));
  // Toe to the sky out of the fist, leaning a little away from his head.
  const toe = UP.clone().addScaledVector(outR, .14).normalize();
  return { ...body,
    grip: point(shoulderOf(body, 1).addScaledVector(outR, .29).addScaledVector(UP, .26).addScaledVector(ahead, .05)),
    batUp: point(toe.negate()), batFace: [0, 0, -1],
    fist: point(shoulderOf(body, 0).addScaledVector(outL, .29).addScaledVector(UP, .28).addScaledVector(ahead, .05)), release: 1 };
})();
/** The squeeze: knees giving, chest down over it, fists drawn in and down. */
const FLEX_SQUEEZE: Pose = (() => {
  const body: Pose = { ...FLEXING, hip: [-.03, .93, -.03], chest: [-.01, 1.26, .01], headDown: .04 };
  const outR = outwards(body, 1), outL = outwards(body, 0);
  const ahead = new THREE.Vector3(Math.sin(body.yaw), 0, Math.cos(body.yaw));
  return { ...body,
    grip: point(shoulderOf(body, 1).addScaledVector(outR, .25).addScaledVector(UP, .21).addScaledVector(ahead, .08)),
    fist: point(shoulderOf(body, 0).addScaledVector(outL, .25).addScaledVector(UP, .23).addScaledVector(ahead, .08)) };
})();
const FLEX_LEFT: Pose = { ...FLEXING, face: FLEXING.face + .45, headDown: -.04 };
const FLEX_RIGHT: Pose = { ...FLEXING, face: FLEXING.face - .45, headDown: -.04 };
/**
 * **A triple hundred:** arms flung wide and a little above the shoulders, the
 * bat out along the line of his right arm and the left hand open, head back —
 * taking it all in.
 */
const WIDE: Pose = (() => {
  const body: Pose = { ...FACING, hip: [-.02, .98, -.02], chest: [.00, 1.32, .00], headDown: -.40 };
  const right = shoulderOf(body, 1), left = shoulderOf(body, 0), outR = outwards(body, 1), outL = outwards(body, 0);
  return { ...body,
    grip: point(right.addScaledVector(outR, .53).addScaledVector(UP, .18)),
    // The blade carries on along the line of the arm, tipped up a little.
    batUp: point(outR.clone().negate().addScaledVector(UP, -.30).normalize()), batFace: [0, 0, -1],
    fist: point(left.addScaledVector(outL, .55).addScaledVector(UP, .20)), release: 1 };
})();
const WIDE_LOOK: Pose = { ...WIDE, face: WIDE.face + .4, headDown: -.32 };
const WIDE_BACK: Pose = { ...WIDE, face: WIDE.face - .3, headDown: -.36 };
/**
 * **Four hundred:** the champion. Feet set wide, chest out, the bat held
 * straight up at the full stretch of his right arm and his eyes on it, the
 * left elbow tucked in and the fist pumped down by his hip — then the roar, knees giving and head
 * thrown back as the fist drives down again.
 */
const wide = (body: Pose, apart: number): Pose => {
  const hip = V(body.hip);
  const foot = (side: 0 | 1) => point(hip.clone().addScaledVector(outwards(body, side), apart).setY(.08));
  return { ...body, frontFoot: foot(0), backFoot: foot(1), backFootYaw: body.yaw - .1 };
};
function champion(body: Pose, fist: [out: number, up: number, ahead: number]): Pose {
  const outR = outwards(body, 1), outL = outwards(body, 0);
  const ahead = new THREE.Vector3(Math.sin(body.yaw), 0, Math.cos(body.yaw));
  const toe = UP.clone().addScaledVector(outR, .06).normalize();
  return { ...body,
    grip: point(shoulderOf(body, 1).addScaledVector(UP, .55).addScaledVector(outR, .09)),
    batUp: point(toe.negate()), batFace: [0, 0, -1],
    fist: point(shoulderOf(body, 0).addScaledVector(outL, fist[0]).addScaledVector(UP, fist[1]).addScaledVector(ahead, fist[2])), release: 1 };
}
const CHAMPION: Pose = champion(wide({ ...FACING, hip: [-.02, .95, -.02], chest: [.00, 1.30, .00], yaw: 2.75, face: 2.75, headDown: -.42, shoulderLift: .14 }, .30), [.08, -.38, .26]);
const ROARING: Pose = champion(wide({ ...FACING, hip: [-.03, .89, -.03], chest: [-.01, 1.23, -.02], yaw: 2.75, face: 2.75, headDown: -.58, shoulderLift: .14 }, .32), [.10, -.42, .24]);
const CHAMPION_LOOK: Pose = { ...CHAMPION, face: CHAMPION.face + .4, headDown: -.30 };
/** The fist up in front of his chest on the way down, ready to take the handle again. */
const CHAMPION_DONE: Pose = champion({ ...CHAMPION, headDown: -.20 }, [.08, -.10, .30]);

/** The five celebrations: the fifty's nod, the hundred, and the Marathon's three big ones. */
export type Celebration = 'fifty' | 'hundred' | 'double' | 'triple' | 'four';
/**
 * How each one goes. The way up and the hold are keyframes of its own; the
 * way down is the hundred's for all of them — out to his right, where the
 * left hand takes the handle again, and only then in front of him.
 */
interface Routine { keys: readonly { time: number; pose: Pose }[]; back: number; down: number; settle: number; total: number }
const FIFTY = { rise: 110, lift: 220, up: 360, hold: 640, back: 770, down: 890, settle: 1010 } as const;
const CELEBRATION = { rise: 110, lift: 230, up: 390, pump: 540, again: 690, pump2: 840, look: 990, back: 1130, down: 1260, settle: 1400 } as const;
const ROUTINES: Record<Celebration, Routine> = {
  fifty: { keys: [{ time: FIFTY.rise, pose: RISING }, { time: FIFTY.lift, pose: LIFTING }, { time: FIFTY.up, pose: NODDING }, { time: FIFTY.hold, pose: NODDED }],
    back: FIFTY.back, down: FIFTY.down, settle: FIFTY.settle, total: FIFTY_MS },
  hundred: { keys: [{ time: CELEBRATION.rise, pose: RISING }, { time: CELEBRATION.lift, pose: LIFTING }, { time: CELEBRATION.up, pose: RAISED },
      { time: CELEBRATION.pump, pose: PUMPED }, { time: CELEBRATION.again, pose: RAISED }, { time: CELEBRATION.pump2, pose: PUMPED }, { time: CELEBRATION.look, pose: LOOKING }],
    back: CELEBRATION.back, down: CELEBRATION.down, settle: CELEBRATION.settle, total: CELEBRATION_MS },
  double: { keys: [{ time: 110, pose: RISING }, { time: 230, pose: LIFTING }, { time: 400, pose: RAISED }, { time: 560, pose: FLEXING },
      { time: 700, pose: FLEX_SQUEEZE }, { time: 840, pose: FLEXING }, { time: 1040, pose: FLEX_LEFT }, { time: 1240, pose: FLEX_RIGHT },
      { time: 1400, pose: FLEXING }, { time: 1520, pose: FLEX_SQUEEZE }, { time: 1640, pose: FLEXING }, { time: 1800, pose: RAISED }],
    back: 1920, down: 2060, settle: 2200, total: 2360 },
  triple: { keys: [{ time: 110, pose: RISING }, { time: 230, pose: LIFTING }, { time: 400, pose: RAISED }, { time: 640, pose: WIDE },
      { time: 900, pose: WIDE_LOOK }, { time: 1150, pose: WIDE }, { time: 1400, pose: WIDE_BACK }, { time: 1600, pose: WIDE }, { time: 1780, pose: RAISED }],
    back: 1920, down: 2060, settle: 2200, total: 2400 },
  four: { keys: [{ time: 110, pose: RISING }, { time: 230, pose: LIFTING }, { time: 520, pose: CHAMPION },
      { time: 760, pose: ROARING }, { time: 980, pose: CHAMPION }, { time: 1200, pose: ROARING }, { time: 1420, pose: CHAMPION },
      { time: 1700, pose: CHAMPION_LOOK }, { time: 1960, pose: CHAMPION }, { time: 2140, pose: CHAMPION_DONE }],
    back: 2300, down: 2440, settle: 2580, total: 2760 },
};
/** How long each celebration holds the next ball back. */
export const CELEBRATION_LENGTHS: Record<Celebration, number> = {
  fifty: FIFTY_MS, hundred: CELEBRATION_MS, double: ROUTINES.double.total, triple: ROUTINES.triple.total, four: ROUTINES.four.total,
};
export const celebrationLength = (kind: Celebration) => CELEBRATION_LENGTHS[kind];
const COVER_CHARGE_FINISH = COVER_CHARGE_KEYS[COVER_CHARGE_KEYS.length - 1].pose;
/**
 * The charge over long-on — the third recording, from behind the batter.
 *
 * The same walk at the ball again. From the ball onwards it is the mirror of
 * the shot over cover up to the carry: the face closed towards mid-on at
 * contact, the arms extended out that way with the blade climbing, the chest
 * opening to mid-on rather than to the bowler, and the front foot landing a
 * little further to the leg side, which is what lets the hips turn that way.
 * Then it finishes the way the straight charge does, and the way the user
 * asked for: the bat comes up over the top and wraps over the FRONT shoulder
 * — the left one, for a right-hander — with the hands high beside it and the
 * toe hanging down behind his back. The over-the-top key and the wrap are the
 * straight charge's own, on this stroke's feet and facing. The way home is
 * not: see `ON_CHARGE_UNWRAP`.
 */
const ON_CHARGE_KEYS: readonly { time: number; pose: Pose }[] = [
  ...CHARGE_KEYS.filter(k => k.time < CHARGE_CLOCK.under).map(k => k.time === CHARGE_CLOCK.plant || k.time === CHARGE_CLOCK.drop
    ? { time: k.time, pose: { ...k.pose, frontFoot: [k.pose.frontFoot[0] - .06, k.pose.frontFoot[1], k.pose.frontFoot[2]] as Point } }
    : k),
  { time: CHARGE_CLOCK.under, pose: { ...GUARD, hip: [-.09, .77, .14], chest: [.05, 1.11, .26],
    frontFoot: [-.08, .08, .64], backFoot: [-.22, .08, -.21],
    grip: [.36, .95, .50], batUp: [-.12, .99, .08], batFace: [-.20, .12, -.97],
    yaw: 1.12, face: .00, heel: .42, backFootYaw: 1.31, leadElbow: .14,
    armHinge: .90, armDrive: 1, shoulderLift: 0 } },
  // Contact. Low in the lunge, the head over it, the face closed towards
  // mid-on and the blade laid back under the ball. The shoulders are a shade
  // further round than the straight charge's already.
  { time: CHARGE_CLOCK.contact, pose: { ...GUARD, hip: [-.10, .76, .14], chest: [.02, 1.10, .26],
    frontFoot: [-.08, .08, .61], backFoot: [-.22, .08, -.24],
    grip: [.36, .94, .62], batUp: [-.02, .94, -.34], batFace: [-.35, .28, .90],
    yaw: 1.02, face: -.04, heel: .45, backFootYaw: 1.30, leadElbow: .20,
    armHinge: .90, armDrive: 1, shoulderLift: 0 } },
  // Extension, out towards long-on: both arms straight, the blade climbing.
  { time: CHARGE_CLOCK.through, pose: { ...GUARD, hip: [-.02, .78, .16], chest: [.08, 1.14, .28],
    frontFoot: [-.08, .08, .35], backFoot: [-.18, .13, -.30],
    grip: [.16, 1.08, .84], batUp: [.32, .58, -.75], batFace: [-.50, .70, .50],
    yaw: .45, face: -.10, heel: .60, backFootYaw: 1.00, leadElbow: .24,
    armHinge: .55, armDrive: 1, shoulderLift: .04 } },
  // The hands go up and across to the leg side, the blade with them. The
  // drive aim is already letting go here, as it is on the straight charge,
  // so the wrap that follows is solved on the anatomical bend.
  { time: CHARGE_CLOCK.carry, pose: { ...GUARD, hip: [.00, .84, .10], chest: [.04, 1.20, .16],
    frontFoot: [-.08, .08, .10], backFoot: [-.22, .16, .00],
    grip: [-.02, 1.42, .68], batUp: [.30, -.32, -.90], batFace: [-.45, .82, -.35],
    yaw: .30, face: -.12, heel: .30, backFootYaw: .90, leadElbow: .26,
    armHinge: .80, armDrive: .80, shoulderLift: .06 } },
  // Up and over into the wrap, with less turn than the straight charge
  // gives it. The straight charge stands the bat vertical over the front
  // shoulder before it drops behind; this one carries it back over the
  // shoulder barely above the level — toe up and behind, a fifth of a turn
  // short of vertical — and settles nearly level behind the shoulder, the
  // toe a little below the hands rather than hanging down behind the back.
  // The hands and feet are the straight charge's, facing mid-on.
  { time: CHARGE_CLOCK.over, pose: { ...CHARGE_KEYS.find(k => k.time === CHARGE_CLOCK.over)!.pose,
    frontFoot: [-.08, .08, -.01], backFoot: [-.24, .12, .12], yaw: .24, face: -.10,
    batUp: [.28, -.32, .90], batFace: [.95, .25, -.10] } },
  { time: CHARGE_CLOCK.finish, pose: { ...CHARGE_FINISH,
    frontFoot: [-.08, .08, -.10], backFoot: [-.24, .08, .20], yaw: .16, face: -.12,
    batUp: [.18, .25, .95], batFace: [.98, -.10, -.12] } },
];
const ON_CHARGE_CONTACT = ON_CHARGE_KEYS.find(k => k.time === CHARGE_CLOCK.contact)!.pose;
const ON_CHARGE_FINISH = ON_CHARGE_KEYS[ON_CHARGE_KEYS.length - 1].pose;
/**
 * Home from the wrap, the straight charge's way — back up over the top on the
 * arc it went over on, then down in front — but out of a shallower wrap and
 * facing mid-on, so the first key is this stroke's own: the toe comes back up
 * behind the shoulder to where its over-the-top key held it. The second is
 * the straight charge's.
 */
const ON_CHARGE_UNWRAP: Pose = { ...GUARD, hip: [.00, .88, .02], chest: [.02, 1.23, .06],
  frontFoot: [-.06, .08, -.12], backFoot: [-.22, .08, .18],
  grip: [-.14, 1.62, .42], batUp: [.26, -.50, .83], batFace: [.95, .25, -.10],
  yaw: .24, face: -.06, heel: 0, backFootYaw: .50, leadElbow: .22,
  armHinge: .60, armDrive: 0, shoulderLift: .07 };

/**
 * The two halves of a way home through a recovery pose: away from the
 * follow-through gathering speed, and into the guard losing it. Eased at both
 * ends as every other blend is, the bat stopped dead at the recovery pose
 * halfway home and set off again, which is what made the return look jerky.
 * These leave and arrive at rest as before, pass the recovery pose still
 * moving, and are never faster than the smoothstep they replace.
 */
// Declarations, not arrows: the after-ball keys above use them as the file loads.
function leave(t: number) { return (3 * t * t - t * t * t) / 2; }
function arrive(t: number) { return 1 - leave(1 - t); }
function mix(a: Pose, b: Pose, amount: number, curve = ease): Pose {
  const t = curve(THREE.MathUtils.clamp(amount, 0, 1));
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
    look: THREE.MathUtils.lerp(a.look ?? 0, b.look ?? 0, t),
    backFootYaw: THREE.MathUtils.lerp(a.backFootYaw ?? 1.38, b.backFootYaw ?? 1.38, t),
    toe: THREE.MathUtils.lerp(a.toe ?? 0, b.toe ?? 0, t),
    frontFootYaw: a.frontFootYaw === undefined && b.frontFootYaw === undefined ? undefined
      : THREE.MathUtils.lerp(a.frontFootYaw ?? a.yaw * .77, b.frontFootYaw ?? b.yaw * .77, t),
    leadElbow: THREE.MathUtils.lerp(a.leadElbow, b.leadElbow, t),
    armHinge: THREE.MathUtils.lerp(a.armHinge ?? -.6,b.armHinge ?? -.6,t),
    armDrive: THREE.MathUtils.lerp(a.armDrive ?? 0,b.armDrive ?? 0,t),
    shoulderLift: THREE.MathUtils.lerp(a.shoulderLift ?? 0,b.shoulderLift ?? 0,t),
    release: THREE.MathUtils.lerp(a.release ?? 0, b.release ?? 0, t),
    spin: THREE.MathUtils.lerp(a.spin ?? 0, b.spin ?? 0, t),
    kneel: THREE.MathUtils.lerp(a.kneel ?? 0, b.kneel ?? 0, t),
    ownFace: THREE.MathUtils.lerp(a.ownFace ?? 0, b.ownFace ?? 0, t),
    // A pose that never let go has no fist of its own: it takes the other's,
    // so the hand leaves the handle for where it is going, not for the origin.
    fist: a.fist || b.fist ? point(a.fist ?? b.fist!, b.fist ?? a.fist!) : undefined,
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
  pose.toe = sample(keys.map(k => k.pose.toe ?? 0));
  if (keys.some(k => k.pose.frontFootYaw !== undefined)) pose.frontFootYaw = sample(keys.map(k => k.pose.frontFootYaw ?? k.pose.yaw * .77));
  for (const key of ['armHinge','armDrive','shoulderLift'] as const)
    pose[key] = sample(keys.map(k=>k.pose[key] ?? (key==='armHinge'?-.6:0)));
  pose.release = THREE.MathUtils.clamp(sample(keys.map(k => k.pose.release ?? 0)), 0, 1);
  const anyFist = keys.find(k => k.pose.fist)?.pose.fist;
  if (anyFist) pose.fist = [0, 1, 2].map(axis => sample(keys.map(k => (k.pose.fist ?? anyFist)[axis]))) as unknown as Point;
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

/** The kits the batter can be dressed in. */
export type BatterKit = 'home' | 'whites' | 'green' | 'purple' | 'blue';

/**
 * Shirt and helmet, trousers, and the accent that does the seam, the collar,
 * the number, the pad straps and the shoe flashes. Home is the navy and orange
 * the game has always worn; whites are the Test match. Green, purple and blue
 * were the seats of a Rivals room before each player batted in their own
 * Dressing Room kit (`wear`); `__cricket.kit` still puts them on.
 */
export const BATTER_KITS: Record<BatterKit, { shirt: number; helmet: number; trousers: number; accent: number; number: number }> = {
  // A mid navy: the near-black it replaced lost the shape of the shirt under the
  // day's light, and a navy he can be seen in is still a navy.
  home: { shirt: 0x2f5a88, helmet: 0x2a527c, trousers: 0xf4f0e4, accent: 0xed7044, number: 0xed7044 },
  whites: { shirt: 0xf2ece0, helmet: 0x2a527c, trousers: 0xf4f0e4, accent: 0xd9d3c3, number: 0xd9d3c3 },
  green: { shirt: 0x0a2f24, helmet: 0x09291f, trousers: 0xf1eee6, accent: 0x061c15, number: 0xffffff },
  purple: { shirt: 0x5a2fb4, helmet: 0x4d27a3, trousers: 0xf1eee6, accent: 0x3f1e86, number: 0xffffff },
  blue: { shirt: 0x1f6fd6, helmet: 0x1a5fbd, trousers: 0xf1eee6, accent: 0x1657ad, number: 0xffffff },
};

/**
 * The heel between a fist and its wrist, re-aimed every frame: where it starts
 * as a share of the way out to the wrist, and how wide and deep it is. It
 * starts inside the fist, so the hand runs on into the wrist whichever side
 * of the handle the arm comes from, and is the back of the hand, wide across
 * the fingers and thin, tapering to the wrist, turned so its thin way is the
 * knuckles' (`rollToward`).
 */
const GLOVE_HEEL = { from: .30, width: .096, depth: .064 };

export class Batter {
  private poseAge = 0;
  /** The blade, for turning its stickers the right way round: see `mirrorStickers`. */
  private blade!: THREE.Mesh;
  /** The plain label a bare bat wears on its face, hidden under a sticker sheet. */
  private readonly batLabel: THREE.Mesh[] = [];
  readonly root = new THREE.Group();
  readonly bat = new THREE.Group();
  private torso = new THREE.Group();
  private hips = new THREE.Group();
  private head = new THREE.Group();
  private arms: { upper: THREE.Mesh; lower: THREE.Mesh; elbow: THREE.Mesh; cap: THREE.Mesh; glove: THREE.Group; palm: THREE.Mesh[]; cuff: THREE.Group; knuckles: number; shoulder: THREE.Vector3; wrist: THREE.Vector3; socket: THREE.Vector3 }[] = [];
  private legs: { thigh: THREE.Mesh; shin: THREE.Mesh; knee: THREE.Mesh; cap: THREE.Mesh; pad: THREE.Group; padding: THREE.Group; shoe: THREE.Group }[] = [];
  private pose: Pose = GUARD;
  private swingFrom: Pose = GUARD;
  private shot: ShotType = 'STRAIGHT';
  /** A leg-side swing at a ball up around the chest is a pull, not a flick. */
  private pulling = false;
  /** The block at a ball met above `DEFENCE_BACK_HEIGHT`: the back-foot defence, not the forward one. */
  private backDefence = false;
  /** The back-foot punch: see `PUNCH_STROKE`. */
  private punching = false;
  /** The cut off the spinner: see `SPIN_CUT`. */
  private spinCutting = false;
  /** The pull off the spinner, the caller having established that it is (`spinPull`). */
  private spinPulling = false;
  /** A cut at a ball up around the chest is played standing tall, not crouched. */
  private cutting = false;
  private squaring = false;
  private lofted = false;
  private sweeping = false;
  /** The sweep that stays level: same body, same clock, a blade that never climbs. */
  private levelled = false;
  /** A charge down the pitch: the confidence shot. */
  private charging = false;
  /** Down on the back knee: the sweeps, and the reverse scoop, which borrows their kneel. */
  private get kneeling() { return this.sweeping || this.shot === 'REVERSE_SCOOP'; }
  private swingStart = -Infinity;
  /** When he went down, and the shape he was in when it happened. */
  private felledAt = -Infinity;
  private felledFrom: Pose = GUARD;
  /** Where the blow that put him down landed, which is where his hand goes: see `fallPoses`. */
  private felledBy: Hurt = 'RIBS';
  private fallKeys: { recoil: Pose; stagger: Pose; knelt: Pose } | null = null;
  private celebratedAt = -Infinity;
  /** What he is doing once the ball is done with, and from when: see `afterBall`. */
  private afterward: { from: number; kind: AfterBall; keys: Keys | null } | null = null;
  /** A classic drive's finish held a moment longer: see `ADMIRE_MS`. */
  private admiring = false;
  /** A new ball's reset, put off until he has finished: see `reset`. */
  private resetDue = false;
  /** The pose he met the ball with, and the finish he went on to, for rehearsing it after a miss. */
  private struck: Pose | null = null;
  private followed: Pose | null = null;
  private celebratedFrom: Pose = GUARD;
  /** Which celebration is on: see `ROUTINES`. */
  private celebration: Celebration = 'hundred';
  private anticipation = 0;
  /** Alive in his guard between balls: the game's batter is. See `WAGGLE`. */
  alive = false;
  /** What draws each wait's rhythm and whether it taps: the tests fix it. */
  idleRandom = Math.random;
  /** This wait in his guard: from when, its rhythm, and the tap under way or due. */
  private idle: { from: number; period: number; phase: number; tapFrom: number; nextTap: number } | null = null;
  /** Where the bowler is in his run-up, as the scene last said, and when it last did: see `runup`. */
  private runupAt = 0; private runupFresh = false; private runupSeen = -Infinity;
  /** The clock of the last `update`, for asking about the wait between frames. */
  private lastNow = -Infinity;
  private contactTime = -Infinity;
  private ballX = 0;
  private ballY = .54;
  private ballZ: number = GAME.contactZ;
  // Every part is modelled from one of four smooth unit primitives, scaled into
  // place. Nothing is a bare cube, so the figure reads as sculpted clay.
  private sleeves: BendingLimb[] = [];
  private connectedJersey!: ConnectedJersey;
  private connectedTrousers!: ConnectedTrousers;
  private trouserLegs: BendingLimb[] = [];
  private limbStart = new THREE.Vector3();
  /** Whether the clothes fit the pose last applied: see `drape`. */
  private draped = false;
  private shapes = {
    soft: new RoundedBoxGeometry(1, 1, 1, 2, .3),
    ball: new THREE.SphereGeometry(1, 24, 16),
    helmet: helmetGeometry(),
    helmetRim: helmetRimGeometry(),
    peak: helmetPeakGeometry(),
    grille: helmetGrilleGeometry(),
    vent: new THREE.TorusGeometry(1, .32, 6, 16),
    trouser: new THREE.CylinderGeometry(.44, .55, 1, 20, 1),
    collar: new THREE.TorusGeometry(.071, .012, 6, 24).rotateX(Math.PI / 2),
    tube: new THREE.CylinderGeometry(.5, .5, 1, 20, 1),
    flat: new THREE.BoxGeometry(1, 1, 1),
    blade: bladeGeometry(),
    heel: gloveHeelGeometry(),
  };
  private palette = {
    shirt: clothMaterial(new THREE.MeshStandardMaterial({ color: 0x2f5a88, roughness: .88 })),
    // The helmet is its own material rather than the shirt's, because it is navy
    // in both innings: a cricketer's lid does not change colour when the rest of
    // the kit does, and in whites a cream one read as a bald head.
    // Matte: a helmet's shell is covered in fabric, so it takes the light the
    // way the cap would rather than shining like a motorbike lid.
    // Both sides drawn: from below, the inside of the shell is what closes the
    // view up under the peak, where a one-sided shell showed straight through.
    helmet: new THREE.MeshStandardMaterial({ color: 0x2a527c, roughness: .92, side: THREE.DoubleSide }),
    trousers: clothMaterial(new THREE.MeshStandardMaterial({ color: 0xf4f0e4, roughness: .82 })),
    pad: new THREE.MeshStandardMaterial({ color: 0xfdfcf4, roughness: .6 }),
    // The leg pads: coloured with the gloves as one guard (`wearGloves`), the
    // pad itself and its piping, knee roll and ankle flap apart. The two
    // colours are in the vertices (`padPiece`), so each pad stays one mesh and
    // one draw; the shoes, which share `pad`, stay white.
    legPad: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6 }),
    grip: new THREE.MeshStandardMaterial({ color: 0x777e80, roughness: .94 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xb77950, roughness: .87 }),
    bat: willowMaterial(new THREE.MeshStandardMaterial({ color: 0xe0b77a, roughness: .62 })),
    accent: new THREE.MeshStandardMaterial({ color: 0xed7044, roughness: .7 }),
    // The number on his back is its own colour: white on an away kit, where the
    // accent that does the shoe flashes would vanish into the shirt.
    number: new THREE.MeshStandardMaterial({ color: 0xed7044, roughness: .7 }),
    grille: new THREE.MeshStandardMaterial({ color: 0x8c9da0, metalness: .6, roughness: .4 }),
    handle: new THREE.MeshStandardMaterial({ color: 0x2a3238, roughness: .95 }),
  };
  /**
   * What he bats in: the home kit, whites for the Test match, or one of the
   * three away kits a Rivals room hands out by seat.
   *
   * The batter owns his materials outright rather than sharing the cached ones
   * the other figures use, so this is four colours rather than a re-dress —
   * and it can be called at any time, which is what lets the mode screen change
   * its mind without the scene being torn down and rebuilt around it.
   */
  dress(kit: BatterKit) {
    const colours = BATTER_KITS[kit];
    this.palette.shirt.color.setHex(colours.shirt);
    this.palette.helmet.color.setHex(colours.helmet);
    this.palette.trousers.color.setHex(colours.trousers);
    this.palette.accent.color.setHex(colours.accent);
    this.palette.number.color.setHex(colours.number);
  }

  /**
   * A kit from the Dressing Room, over whatever `dress` put on: the same
   * parts, or only some of them (the Test match keeps its whites and takes
   * the helmet). Colours as the catalogue writes them. The leg pads are not
   * the kit's: they go with the gloves (`wearGloves`).
   */
  wear(look: Partial<Record<'shirt' | 'helmet' | 'trousers' | 'pads' | 'trim' | 'number', string>>) {
    if (look.shirt) this.palette.shirt.color.set(look.shirt);
    if (look.helmet) this.palette.helmet.color.set(look.helmet);
    if (look.trousers) this.palette.trousers.color.set(look.trousers);
    if (look.trim) this.palette.accent.color.set(look.trim);
    if (look.number) this.palette.number.color.set(look.number);
  }

  /**
   * A bat from the Dressing Room: the grip's colour and the sticker sheet on
   * the blade (`SKIN` in batGeometry.ts), or bare willow with no sheet. The
   * sheet carries the willow under its stickers, so the blade's own colour
   * goes to white while it is on, and lights the glow under the floodlights
   * too: glowing in plain white, a stickered bat came out a pale blur.
   */
  holdBat(grip: string, sheet: THREE.Texture | null) {
    this.palette.grip.color.set(grip);
    const blade = this.palette.bat;
    blade.map = sheet; blade.emissiveMap = sheet;
    blade.color.set(sheet ? 0xffffff : 0xe0b77a);
    blade.needsUpdate = true;
    for (const label of this.batLabel) label.visible = !sheet;
  }

  /**
   * A guard from the catalogue (`gloves.ts`), the gloves and the leg pads in
   * one colourway: the default for null. Every fist sits in the same groups
   * and the same space on the handle, so the grip and the wrist are where
   * they always were; what a design changes is the look of the fist and the
   * cuff (`buildGloveHand`, `buildGloveCuff`), and the pads' colours. The
   * heel `update` re-aims at the wrist takes the padding's colour.
   */
  wearGloves(design: GloveDesign | null) {
    for (const part of this.wornGloves) part.removeFromParent();
    this.wornGloves = [];
    const worn = design ?? gloveOf(DEFAULT_GLOVE);
    for (const leg of this.legs) this.buildPadding(leg.padding, worn.pads.body, worn.pads.trim);
    this.arms.forEach((arm, i) => {
      const { hand, padding } = buildGloveHand(worn, i === 0), cuff = buildGloveCuff(worn);
      compactRigidParts(hand); compactRigidParts(cuff);
      arm.glove.add(hand); arm.cuff.add(cuff);
      arm.palm[0].material = padding;
      this.wornGloves.push(hand, cuff);
      // The thumb's edge is built at 180°; turned by this it faces the forearm.
      this.fistTurn[i] = (180 - WRIST_HOME[i]) * Math.PI / 180;
      hand.rotation.y = this.fistTurn[i];
    });
  }
  private wornGloves: THREE.Object3D[] = [];
  /**
   * The padding of one leg pad, built anew in a guard's two colours: the pad
   * and its rolls in the body colour, the knee roll, the piping, the knee
   * stitching and the ankle flap in the trim's, every colour in the vertices
   * so the lot merges into one mesh. Built anew rather than recoloured in
   * place: a new mesh is uploaded whole, where an update to a buffer already
   * on the GPU was lost on an iPhone, which kept the pads in the colours of
   * the guard before. The straps round the back are the darker of the two,
   * whichever that is: black on Ember's red pads, navy on Midnight's, silver
   * on Sterling's white. They used to be the kit's accent, which clashed with
   * every guard but the one that happened to match.
   */
  private buildPadding(group: THREE.Group, body: string, trim: string) {
    for (const part of [...group.children]) { part.removeFromParent(); (part as THREE.Mesh).geometry?.dispose?.(); }
    const light = (hex: string) => { const c = new THREE.Color(hex); return .2126 * c.r + .7152 * c.g + .0722 * c.b; };
    const darker = light(body) <= light(trim) ? body : trim;
    for (const y of [-.10, .06]) this.padPiece(group, darker, [.185, .026, .17], 'soft').position.set(0, y, -.008);
    this.padPiece(group, body, [.20, .38, .175], 'soft');
    for (let roll = 0; roll < 5; roll++) this.padPiece(group, body, [.028, .34, .035], 'tube').position.set(-.064 + roll * .032, 0, .082);
    this.padPiece(group, trim, [.205, .095, .135], 'soft').position.set(0, .20, .025);
    for (const x of [-.085, .085]) this.padPiece(group, trim, [.009, .34, .012], 'soft').position.set(x, 0, .087);
    for (const y of [.181, .207, .23]) this.padPiece(group, trim, [.13, .006, .01], 'flat').position.set(0, y, .093);
    this.padPiece(group, trim, [.18, .042, .026], 'soft').position.set(0, -.179, .083);
    compactRigidParts(group);
  }
  /** A piece of a leg pad in one colour, carried in its vertices. */
  private padPiece(parent: THREE.Object3D, colour: string, scale: Point, shape: keyof Batter['shapes'] = 'soft') {
    const geometry = this.shapes[shape].clone(), count = geometry.attributes.position.count, colours = new Float32Array(count * 3), c = new THREE.Color(colour);
    for (let i = 0; i < count; i++) { colours[i * 3] = c.r; colours[i * 3 + 1] = c.g; colours[i * 3 + 2] = c.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    const mesh = new THREE.Mesh(geometry, this.palette.legPad);
    mesh.scale.set(...scale); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  /** Each fist's turn on the handle, to face its forearm: see `WRIST_HOME`. */
  private fistTurn = [0, 0];
  /** Which way the knuckles face in the glove's frame, after the fist's turn: for the heel and the cuff. */
  private knucklesOf(i: number) { return new THREE.Vector3(0, 0, this.arms[i].knuckles).applyAxisAngle(UP, this.fistTurn[i]); }

  /**
   * Turns the stickers the right way round when the stage is mirrored: a
   * right-hander's world is flipped side to side (GameScene's `world`), which
   * would print every word on the bat backwards. The blade is the same shape
   * either way round, so flipping it back changes nothing else.
   */
  mirrorStickers(mirrored: boolean) { this.blade.scale.x = mirrored ? -1 : 1; }

  /** The materials a kit colours, for the Dressing Room's scan that changes one kit into another. */
  get kitMaterials(): THREE.MeshStandardMaterial[] {
    const p = this.palette;
    return [p.shirt, p.helmet, p.trousers, p.accent, p.number];
  }

  constructor() {
    this.root.name = 'Articulated right-handed batter';
    this.root.add(this.torso, this.hips, this.head, this.bat);
    // Torso and arms are one connected garment below; these groups retain
    // the original IK transforms and carry the rigid kit details.
    const neck = this.mesh(this.torso, this.palette.skin, [.115, .17, .115], 'tube'); neck.position.y = .175;
    // Jersey seam, collar, and back number make rotation legible from the camera.
    this.mesh(this.torso, this.palette.accent, [1, 1, .93], 'collar').position.y = .154;
    this.mesh(this.torso, this.palette.accent, [.017, .045, .007], 'flat').position.set(0, .112, .116);
    this.mesh(this.torso, this.palette.accent, [.028, .034, .008], 'soft').position.set(-.087, .015, .133);
    for (const x of [-.055, .055]) this.mesh(this.torso, this.palette.number, [.028, .125, .008], 'soft').position.set(x, -.04, -.143);
    const face = this.mesh(this.head, this.palette.skin, [.148, .17, .15], 'ball'); face.position.y = -.03;
    // No nose, no chin: behind the grille the face is one smooth shape.
    this.mesh(this.head, this.palette.helmet, [1, 1, 1], 'helmet');
    this.mesh(this.head, this.palette.handle, [1, 1, 1], 'helmetRim');
    // A cricket helmet: the peak following the shell round the front, the
    // grille bolted on at either temple and wrapping the face down to a point
    // under the chin, and the vent on the crown.
    this.mesh(this.head, this.palette.helmet, [1, 1, 1], 'peak');
    this.mesh(this.head, this.palette.grille, [1, 1, 1], 'grille');
    for (const s of [-1, 1]) {
      const mount = this.mesh(this.head, this.palette.grille, [.012, .026, .085], 'soft');
      mount.position.copy(GRILLE_MOUNT).setX(GRILLE_MOUNT.x * s * 1.02).add(new THREE.Vector3(0, .004, -.012));
      mount.rotation.y = s * -.32;
    }
    const vent = this.mesh(this.head, this.palette.handle, [.014, .014, .014], 'vent');
    vent.position.set(0, .197, .05); vent.rotation.x = -Math.PI / 2 + .34;
    // Bat: a dark bound handle standing clear of a plain blade.
    const rubber=new THREE.Mesh(gripGeometry(),this.palette.grip);
    rubber.castShadow=true; rubber.receiveShadow=true; this.bat.add(rubber);
    this.mesh(this.bat,this.palette.handle,[.046,.018,.046],'tube').position.y=-.117;
    this.blade = this.mesh(this.bat, this.palette.bat, [1, 1, 1], 'blade');
    // Inset bat label: the blade silhouette and contact face stay put. No toe
    // guard: its straight top edge across the face cut the toe's curve off flat.
    // Hidden while a sticker sheet is on (`holdBat`), which has labels of its own.
    this.batLabel.push(this.mesh(this.bat, this.palette.helmet, [.075, .12, .002], 'flat'), this.mesh(this.bat, this.palette.accent, [.054, .016, .003], 'flat'));
    this.batLabel[0].position.set(0, -.25, .0228); this.batLabel[1].position.set(0, -.28, .024);
    for (let i = 0; i < 2; i++) {
      // The hands: a group on the handle for each fist, dressed by `wearGloves`
      // below; the top hand's knuckles face the bat's back (`knuckles` -1), the
      // bottom hand's its face. Only the heel to the wrist lives here: it is
      // re-aimed every frame, so never merged into the glove.
      const glove = new THREE.Group(); this.bat.add(glove);
      glove.name = i === 0 ? 'Left top glove — overhand' : 'Right bottom glove — underhand';
      glove.position.set(0, i === 0 ? HAND.top : HAND.bottom, 0);
      const back = i === 0 ? -1 : 1;
      const palm=[this.mesh(glove,this.palette.pad,[1,1,1],'heel')];
      palm[0].userData.moving=true;
      // The wrist is what turns: the gauntlet at the hand aimed back up the forearm.
      const cuff = new THREE.Group(); this.root.add(cuff);
      cuff.name = i === 0 ? 'Left gauntlet' : 'Right gauntlet';
      this.arms.push({ upper: this.mesh(this.root, this.palette.shirt, [1, 1, 1], 'tube'), lower: this.mesh(this.root, this.palette.skin, [1, 1, 1], 'tube'),
        elbow: this.mesh(this.root, this.palette.shirt, [.073, .073, .073], 'ball'), cap: this.mesh(this.root, this.palette.shirt, [.086, .078, .088], 'ball'),
        glove, palm, cuff, knuckles: back, shoulder: new THREE.Vector3(), wrist: new THREE.Vector3(), socket:wristSocket(i) });
      const pad = new THREE.Group(); this.root.add(pad);
      // The padding and its straps are the guard's, built by `wearGloves` (`buildPadding`).
      const padding = new THREE.Group(); padding.name = 'Padding'; pad.add(padding);
      const shoe = new THREE.Group(); this.root.add(shoe);
      this.mesh(shoe, this.palette.pad, [.185, .125, .33], 'soft').position.z = .055;
      this.mesh(shoe, this.palette.handle, [.185, .035, .33], 'soft').position.set(0, -.055, .055);
      this.mesh(shoe, this.palette.accent, [.19, .022, .09], 'soft').position.set(0, .015, .12);
      for (const z of [.065, .093, .121]) this.mesh(shoe, this.palette.pad, [.075, .009, .013], 'flat').position.set(0, .063, z);
      this.legs.push({ thigh: this.mesh(this.root, this.palette.trousers, [1, 1, 1], 'trouser'), shin: this.mesh(this.root, this.palette.trousers, [1, 1, 1], 'tube'),
        knee: this.mesh(this.root, this.palette.trousers, [.078, .078, .078], 'ball'), cap: this.mesh(this.root, this.palette.trousers, [.098, .10, .105], 'ball'),
        pad, padding, shoe });
    }
    // These details move together. The glove palm and named knuckles remain
    // separate because the grip solver and its inspection hooks use them.
    for (const group of [this.torso, this.hips, this.head, this.bat,
      ...this.arms.map(a => a.glove), ...this.arms.map(a => a.cuff), ...this.legs.flatMap(l => [l.pad, l.shoe])]) compactRigidParts(group);

    for (let i = 0; i < 2; i++) {
      const arm = this.arms[i], leg = this.legs[i];
      // Keep the established IK controls and measurements, but do not draw
      // their separate cylinders or ball joints. The surface spans the chain.
      for (const control of [arm.upper, arm.lower, arm.elbow, arm.cap, leg.thigh, leg.shin, leg.knee, leg.cap]) control.visible = false;
      const sleeve = new BendingLimb([this.palette.shirt, this.palette.skin], [.09, .062, .046], 24, false, true);
      const trouser = new BendingLimb(this.palette.trousers, [.109, .072, .059], 16, true);
      this.sleeves.push(sleeve); this.trouserLegs.push(trouser);
    }
    this.connectedJersey = new ConnectedJersey([this.palette.shirt, this.palette.skin]);
    this.connectedTrousers = new ConnectedTrousers(this.palette.trousers);
    this.root.add(this.connectedJersey.mesh, this.connectedTrousers.mesh);
    this.wearGloves(null);
    this.reset();
  }
  private mesh(parent: THREE.Object3D, material: THREE.Material, scale: Point, shape: keyof Batter['shapes'] = 'soft') {
    const mesh = new THREE.Mesh(this.shapes[shape], material);
    mesh.scale.set(...scale); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  /**
   * Turns `part` about its own `axis` (a unit vector, in its parent's frame)
   * until its local +z lies as near `want` as it can: the heel and the
   * gauntlet are aimed up the forearm by `segment` and `setFromUnitVectors`,
   * which say nothing about which way round they sit, so this makes it the
   * hand's way round. Left alone when the arm runs along the line asked for,
   * where there is no side to pick.
   */
  private rollToward(part: THREE.Object3D, axis: THREE.Vector3, want: THREE.Vector3) {
    const target = want.clone().addScaledVector(axis, -want.dot(axis));
    if (target.lengthSq() < .01) return;
    target.normalize();
    const now = new THREE.Vector3(0, 0, 1).applyQuaternion(part.quaternion);
    const angle = Math.atan2(now.clone().cross(target).dot(axis), now.dot(target));
    part.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
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
  fall(now: number, where: Hurt = 'RIBS') {
    this.idle = null;
    this.felledFrom = this.pose;
    this.felledAt = now;
    this.felledBy = where; this.fallKeys = fallPoses(where);
  }
  /** Whether he is on his way down or already there. */
  get felled() { return Number.isFinite(this.felledAt); }
  /** His hundred, or any of the others: up, held, and back into his guard. See `ROUTINES`. */
  celebrate(now: number, kind: Celebration = 'hundred') {
    // A celebration takes him from wherever he is; what he was doing after the
    // ball is not resumed.
    this.afterward = null; this.idle = null;
    this.celebratedFrom = this.pose;
    this.celebratedAt = now;
    this.celebration = kind;
    // The stroke he got there with is over, and its flags bend the arms its
    // own way — a pull's, a cut's, a sweep's. The charge stays: it is what
    // walks him back to his crease if he went down the pitch for it.
    this.pulling = this.cutting = this.squaring = this.lofted = this.sweeping = this.levelled = this.spinCutting = this.spinPulling = this.backDefence = this.punching = false;
  }

  /**
   * Back to the guard for a new ball. `carryOn`, as the bowler starts his
   * run-up, lets whatever he is doing after the last ball finish first: the
   * stroke it follows still shapes his arms and knees, so it is put away only
   * once he is done, and he comes back into the guard he is by then waiting in.
   */
  reset(carryOn = false) {
    // A new ball's run-up keeps the wait he is in; anything else begins one.
    if (!carryOn) this.idle = null;
    if (carryOn && this.afterward && !this.felled) { this.resetDue = true; return; }
    this.clear(); this.anticipation = 0;
    this.apply(GUARD);
  }
  private clear() {
    this.poseAge = Infinity; this.resetDue = false;
    this.felledAt = -Infinity;
    this.celebratedAt = -Infinity; this.afterward = null; this.admiring = false; this.struck = null; this.followed = null;
    this.swingStart = -Infinity; this.contactTime = -Infinity; this.pulling = false; this.backDefence = false; this.punching = false; this.cutting = false; this.spinCutting = false; this.spinPulling = false; this.squaring = false; this.lofted = false; this.sweeping = false; this.levelled = false; this.charging = false;
    this.root.position.set(GAME.stanceX, 0, GAME.stanceZ); this.root.rotation.set(0, 0, 0);
  }
  /** The stroke last played, as `afterBall` needs it. */
  get played(): PlayedStroke {
    return { shot: this.shot, charging: this.charging, lofted: this.lofted, swept: this.sweeping || this.levelled, pulled: this.crossBat };
  }
  prepare(progress: number) { this.anticipation = THREE.MathUtils.smoothstep(progress, .05, .72); }
  /**
   * Where the bowler is, from nought at his mark to one at the release and
   * after it, said each frame he is coming: it is what stills the guard by
   * his delivery stride. Not said for a few frames, he is not coming.
   */
  runup(progress: number) { this.runupAt = progress; this.runupFresh = true; }
  /** Down tapping the turf, or on the way down or back up: the bowler waits for it. */
  get tapping() {
    return !!this.idle && this.lastNow - this.idle.tapFrom < TAP.down + TAP.taps * TAP.beat + TAP.up;
  }
  /**
   * Once the stroke is home, do `kind` (see `AfterBall`) and come back to the
   * guard, rather than stand frozen in it until the next ball. Not after a
   * charge, which walks back to the crease instead. A drive's held finish only
   * if it is asked for before the finish is reached: it cannot be taken back.
   */
  afterBall(kind: AfterBall, now: number) {
    if (this.charging) return now;
    // A ball left alone: the bat lowered out of the leave as he goes.
    if (!Number.isFinite(this.swingStart)) this.anticipation = 0;
    if ((kind === 'admire' || kind === 'lean') && now - this.swingStart <= ADMIRE_AT) this.admiring = true;
    const home = this.swingStart + STROKE_DURATION_MS + (this.admiring ? ADMIRE_MS : this.turning ? HOOK_HOLD_MS : this.pulling ? PULL_V1_HOLD_MS : this.punching ? PUNCH_HOLD_MS : this.spinCutting ? SPIN_CUT_HOLD_MS : this.spinPulling ? SPIN_PULL_HOLD_MS
      : this.sweeping && !this.levelled ? SLOG_HOLD_MS : 0);
    // The keys are drawn up when he starts, not now: asked for before the
    // stroke has met the ball, there is no stroke yet for `shadow` to rehearse.
    this.afterward = { from: Math.max(now, home), kind, keys: null };
    return this.afterward.from + lengthOf(kind, this.shot);
  }
  swing(shot: ShotType, now: number, finalBallX: number, ballY = .54, ballZ: number = GAME.contactZ, charging = false, lofted = false, sweeping = false, levelled = false, version: CoverVersion = 2, spinCut = false, spinPull = false) {
    this.coverVersion = version;
    // Three charges, one per drive input: straight, over cover, over long-on.
    // Each is one stroke on one line whichever way the ball was actually going.
    this.shot = charging ? (shot === 'COVER_LONG_OFF' || shot === 'LONG_ON' ? shot : 'STRAIGHT') : shot;
    this.afterward = null; this.resetDue = false; this.admiring = false; this.struck = null; this.followed = null; this.idle = null;
    this.charging = charging; this.pulling = !charging && shot === 'LEG' && ballY > PULL_HEIGHT && version !== 3;
    // Version three of the leg-side input is the back-foot flick, the game
    // having judged the ball short of a length at the crease (`flickBackFoot`):
    // still rising where it is met, it may be up past pull height there.
    this.backDefence = !charging && shot === 'DEFEND' && ballY > DEFENCE_BACK_HEIGHT;
    // The cover drive's swipe at a ball short of a length: the back-foot punch (`PUNCH`).
    this.punching = !charging && shot === 'COVER_LONG_OFF' && ballY > PUNCH.minBallY;
    this.cutting = !charging && shot === 'SQUARE_CUT' && ballY > CUT.highBallY;
    // The spinner's cut, the caller having established the ball is a spinner's (`spinCut`).
    this.spinCutting = !charging && shot === 'SQUARE_CUT' && spinCut;
    if (this.spinCutting) this.cutting = false;
    // Wide and full off the off-side input: drive it square rather than through
    // cover. Charging overrides it, the way it overrides every other variation.
    this.squaring = !charging && shot === 'COVER_LONG_OFF'
      && finalBallX >= SQUARE_DRIVE_BALL.minWidth && ballY <= SQUARE_DRIVE_BALL.maxBallY;
    // The six's follow-through, chosen by the caller off the same timing rule
    // the score is worked out from. Charging overrides it, as it does everything.
    this.lofted = !charging && (shot === 'STRAIGHT' || shot === 'LONG_ON') && lofted;
    // The second special stroke. Its caller has already established the ball,
    // the meter and the timing; here it only has to displace the pull.
    // Both sweeps run the same branch on the same clock, because below the
    // hands they are the same stroke. `levelled` only picks which set of bat
    // keys that branch reads.
    this.levelled = !charging && levelled && !sweeping;
    this.sweeping = !charging && (sweeping || this.levelled);
    if (this.sweeping) this.pulling = false;
    // The pull off the spinner, the caller having established the ball and the timing (`spinPull`).
    this.spinPulling = !charging && !this.sweeping && shot === 'LEG' && spinPull;
    if (this.spinPulling) this.pulling = false;
    this.swingStart = now;
    this.contactTime = now + (charging ? CHARGE_CONTACT_MS : this.sweeping ? SWEEP_CONTACT_MS : this.pulling ? (this.pullV2 ? PULL_CONTACT_MS : PULL_V1_CONTACT_MS)
      : this.squaring ? SQUARE_DRIVE_CONTACT_MS : this.shot === 'SCOOP' ? SCOOP_CONTACT_MS : this.shot === 'REVERSE_SCOOP' ? REVERSE_CONTACT_MS
      : this.shot === 'HOOK' ? HOOK_CONTACT_MS : this.spinCutting ? SPIN_CUT_CONTACT_MS : this.spinPulling ? SPIN_PULL_CONTACT_MS : this.shot === 'LATE_CUT' ? LATE_CUT_CONTACT_MS : this.shot === 'DEFEND' ? (this.backDefence ? DEFENCE_BACK_CONTACT_MS : DEFENCE_FRONT_CONTACT_MS) : this.punching ? PUNCH_CONTACT_MS : this.flickV3 ? FLICK_V3_CONTACT_MS : STROKE_CONTACT_MS);
    this.swingFrom = this.pose; this.ballX = finalBallX; this.ballZ = ballZ;
    // Only the cross-bat strokes go up after a bouncer — the pull to the leg
    // side, the hook round behind it and the cut to the off. Every other stroke plays at its own height and
    // the ball passes over the bat, rather than the arms stretching to chase a
    // ball that stroke was never going to reach.
    this.ballY = this.crossBat || this.cutting || this.backDefence || this.flickV3 ? ballY : this.punching ? Math.min(ballY, PUNCH_HIGHEST) : Math.min(ballY, .62);
  }
  /**
   * The bat from `from` to the guard, the face carried along with the handle
   * frame by frame from `start`, so it does not turn in his hands: the cover
   * drive's way home, from its held finish, and the charge over cover from the
   * ball on. Whatever turn about the handle is left between the carried face
   * and the guard's at the end is taken inside `unwind` rather than at the
   * last, and the last frame is the guard's exactly, so he settles into it
   * without a flick. Worked out once a stroke and read by time, so any frame
   * can be drawn on its own.
   *
   * `rolling`, where a stroke asks for it, turns the face on the way to
   * somewhere, the short way and evenly inside its window: the six's bottom
   * hand rolling over the top one as the arms carry the bat up into the wrap,
   * which puts the back of the blade against the shoulder rather than its face.
   * `at`, where a roll asks for it, is when the face is to look `away` if that
   * is after the window: a turn about the handle made earlier is carried along
   * with it unchanged, so the punch turns its face to cover in the pick-up and
   * meets the ball with it, the downswing turning nothing.
   */
  private riding(from: number, poseAt: (age: number) => Pose, start: THREE.Quaternion, unwind: readonly [number, number], age: number,
    rolling?: Roll | readonly Roll[]) {
    const step = 2, key = `${this.shot}:${this.charging}:${this.coverVersion}:${this.swingStart}:${this.ballX}:${this.ballY}:${this.ballZ}`;
    if (this.homeRide?.key !== key) {
      const turns: THREE.Quaternion[] = [], ups: THREE.Vector3[] = [];
      for (let time = from; time <= STROKE_DURATION_MS; time += step)
        ups.push(UP.clone().applyQuaternion(batOrientation(poseAt(Math.min(time, STROKE_DURATION_MS - 1e-6)))));
      turns.push(start.clone());
      for (let n = 1; n < ups.length; n++)
        turns.push(new THREE.Quaternion().setFromUnitVectors(ups[n - 1], ups[n]).multiply(turns[n - 1]));
      // Each in turn, in order, so a later one turns the face the earlier left.
      for (const roll of rolling ? ('window' in rolling ? [rolling] : rolling) : []) {
        const [rolls, rolled] = roll.window.map(time => Math.round((time - from) / step));
        const judged = Math.round(((roll.at ?? roll.window[1]) - from) / step);
        const up = ups[judged], face = new THREE.Vector3(0, 0, 1).applyQuaternion(turns[judged]);
        const want = roll.away(poseAt(roll.at ?? roll.window[1]), up);
        want.addScaledVector(up, -want.dot(up)).normalize();
        const turn = Math.atan2(up.dot(face.clone().cross(want)), face.dot(want));
        turns.forEach((at, n) => at.multiply(new THREE.Quaternion().setFromAxisAngle(UP, turn * ease(THREE.MathUtils.clamp((n - rolls) / (rolled - rolls), 0, 1)))));
      }
      // The guard's face, as it is drawn once he is back in it.
      const straight = batOrientation(STROKES.STRAIGHT.contact);
      const guard = new THREE.Quaternion().setFromUnitVectors(UP.clone().applyQuaternion(straight), ups[ups.length - 1]).multiply(straight);
      const left = turns[turns.length - 1].clone().invert().multiply(guard);
      const roll = 2 * Math.atan2(left.y, left.w);
      const shortest = Math.atan2(Math.sin(roll), Math.cos(roll));
      // Only inside `unwind`: before it and after it the face only rides the handle.
      const [begins, ends] = unwind.map(time => (time - from) / step);
      turns.forEach((turn, n) => turn.multiply(new THREE.Quaternion().setFromAxisAngle(UP, shortest * ease(THREE.MathUtils.clamp((n - begins) / (ends - begins), 0, 1)))));
      turns[turns.length - 1].copy(guard);
      this.homeRide = { key, turns };
    }
    const at = THREE.MathUtils.clamp((age - from) / step, 0, this.homeRide.turns.length - 1), n = Math.min(Math.floor(at), this.homeRide.turns.length - 2);
    return this.homeRide.turns[n].clone().slerp(this.homeRide.turns[n + 1], at - n);
  }
  private homeRide: { key: string; turns: THREE.Quaternion[] } | null = null;
  /** Which version of the cover strokes this swing plays: see `CoverVersion`. */
  private coverVersion: CoverVersion = 2;
  /** Version two or three of a stroke off the cover input, not driven square: the strokes the versions differ in. */
  private get coverV2() { return this.shot === 'COVER_LONG_OFF' && !this.squaring && !this.punching && this.coverVersion >= 2; }
  /** The square cut at pace: not the cut off the spinner, which makes room first. */
  private get paceCut() { return this.shot === 'SQUARE_CUT' && !this.spinCutting && !this.charging; }
  /** The two cross-bat strokes at a bouncer that wrap round to the leg side: the pull and the hook. */
  private get crossBat() { return this.pulling || this.shot === 'HOOK' || this.spinPulling; }
  /** Version two of the pull: the hook's stroke at a ball on the body. The swing's version argument is the pull's for it (Game.shoot). */
  private get pullV2() { return this.pulling && this.coverVersion >= 2; }
  /**
   * Version two of the flick (`FLICK_V2`): the leg-side input at a ball below
   * pull height, swung with a version of two or more. The swing's version is
   * the flick's for it (`flickVersionOf`, in Game.shoot).
   */
  private get flickV2() {
    return this.shot === 'LEG' && !this.charging && !this.pulling && !this.sweeping && !this.spinPulling && this.coverVersion === 2;
  }
  /**
   * Version three of the flick (`FLICK_V3`): the leg-side input at a ball short
   * of a length, off the back foot. The swing's version is three for it
   * (`flickBackFoot`, in Game.shoot).
   */
  private get flickV3() {
    return this.shot === 'LEG' && !this.charging && !this.pulling && !this.sweeping && !this.spinPulling && this.coverVersion === 3;
  }
  /** Either of the flicks worked off with the wrists and the top elbow up: versions two and three. */
  private get wristFlick() { return this.flickV2 || this.flickV3; }
  /** The hook and the pull's version two: swung round flat, wrapped, and turned on round after it, on the hook's clock. */
  private get turning() { return this.pullV2 || this.shot === 'HOOK'; }
  /** The on drive along the ground: not the six, and not the charge over long-on, which have their own. */
  private get onDrive() { return this.shot === 'LONG_ON' && !this.charging && !this.lofted; }
  /** The on drive lofted for six, which wraps over the front shoulder with the face riding the handle. */
  private get onLoft() { return this.shot === 'LONG_ON' && this.lofted && !this.charging; }
  /**
   * The straight drive's six, version two (`STRAIGHT_LOFT_V2`): a lofted straight drive swung with a
   * version of two or more. The swing's version is the cover strokes' for them and the loft's
   * (`loftVersionOf`) for this.
   */
  private get straightLoftV2() { return this.shot === 'STRAIGHT' && this.lofted && !this.charging && this.coverVersion >= 2; }
  /** The rebuilt drives, which go home back along their own swing: the cover drive's versions two and three, and the on drive. */
  private get rebuiltDrive() { return this.coverV2 || this.onDrive; }
  get strikeAt() { return this.contactTime; }
  get contactZ() { return this.ballZ; }
  /**
   * Where down the pitch the charge has carried him.
   *
   * A third of a metre by contact — the skip and the stride — then the drive
   * runs him on through the ball to the finish, a metre out of his ground,
   * where he stops and watches it. He walks back to his crease with the ball
   * still in the air.
   *
   * Piecewise between the keys the feet are authored against, so that a foot
   * written as planted in two successive keys is planted: the root moves
   * between them by exactly the distance the key moved the foot back.
   */
  private downPitch(age: number) {
    if (!this.charging || !Number.isFinite(age) || age <= 0) return 0;
    // Every one of these ranges has to be clamped. `ease` is a cubic, not a
    // curve that flattens: fed a number past 1 it turns and runs away, and the
    // walk back read as reaching the crease and then sprinting at the bowler.
    if (age >= STROKE_DURATION_MS)
      return ADVANCE.stride * (1 - ease(THREE.MathUtils.clamp((age - STROKE_DURATION_MS) / ADVANCE.walkBackMs, 0, 1)));
    const legs: readonly [number, number][] = [[0, 0], [CHARGE_CLOCK.skip, CHARGE_TRAVEL.skip], [CHARGE_CLOCK.plant, CHARGE_TRAVEL.plant],
      [CHARGE_CLOCK.drop, CHARGE_TRAVEL.drop], [CHARGE_CLOCK.under, CHARGE_TRAVEL.under],
      [CHARGE_CLOCK.contact, CHARGE_TRAVEL.contact], [CHARGE_CLOCK.through, CHARGE_TRAVEL.through],
      [CHARGE_CLOCK.carry, CHARGE_TRAVEL.carry], [CHARGE_CLOCK.over, CHARGE_TRAVEL.over],
      [CHARGE_CLOCK.finish, CHARGE_TRAVEL.finish], [STROKE_DURATION_MS, ADVANCE.stride]];
    // Linear between keys, not eased: he is running, and a run that eases to a
    // stop at every key reads as seven separate steps. The ends are eased by
    // the keys themselves being closer together where he is slower.
    const i = legs.findIndex(([time]) => time >= age);
    if (i <= 0) return 0;
    const [t0, d0] = legs[i - 1], [t1, d1] = legs[i];
    return d0 + (d1 - d0) * THREE.MathUtils.clamp((age - t0) / (t1 - t0), 0, 1);
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
    const settle = ease(THREE.MathUtils.clamp(left / .4, 0, 1));
    if (settle <= 0) return pose;
    const step = .54, walked = ADVANCE.stride - left;
    const foot = (base: Point, offset: number): Point => {
      const phase = (walked / step + offset) % 1;
      const swing = THREE.MathUtils.clamp((phase - .5) * 2, 0, 1);
      // During stance the foot cancels root travel. The swing closes at both
      // ends, and starts at the authored foot position, without the old pop.
      const along = (phase - ease(swing) - offset) * step;
      const lift = Math.sin(swing * Math.PI) * .065;
      return [base[0], base[1] + lift * settle, base[2] + along * settle];
    };
    const bob = Math.sin(walked / step * Math.PI * 2) * .022 * settle;
    const frontFoot = foot(pose.frontFoot, 0), backFoot = foot(pose.backFoot, .5);
    let hipY = pose.hip[1] + bob;
    // Let the pelvis settle over each planted foot instead of asking the
    // shin to stretch when the longer return step passes beneath him.
    for (const [target, side] of [[frontFoot, -1], [backFoot, 1]] as const) {
      const dx = target[0] - pose.hip[0] - side * .135 * Math.cos(pose.yaw);
      const dz = target[2] - pose.hip[2] + side * .135 * Math.sin(pose.yaw);
      hipY = Math.min(hipY, target[1] + .045 + Math.sqrt(Math.max(0, .867 ** 2 - dx * dx - dz * dz)));
    }
    return { ...pose,
      frontFoot, backFoot,
      hip: [pose.hip[0], hipY, pose.hip[2]],
      chest: [pose.chest[0], pose.chest[1] + hipY - pose.hip[1], pose.chest[2]] };
  }
  private waiting(pose: Pose, now: number, age: number): Pose {
    const sinceStroke = Number.isFinite(age) ? age - STROKE_DURATION_MS - (this.charging ? ADVANCE.walkBackMs : 0) : Infinity;
    const sinceSettle = this.afterward ? now - this.afterward.from - lengthOf(this.afterward.kind, this.shot) : Infinity;
    const sinceCelebration = now - this.celebratedAt - CELEBRATION_LENGTHS[this.celebration];
    // Readied for a ball only while that ball is coming: once he has played
    // at it, what `prepare` left behind is the last ball's, as the guard's own
    // mix in `update` takes it. Read after a stroke, it held him still for the
    // whole wait that followed.
    const readied = Number.isFinite(age) ? 0 : this.anticipation;
    const weight = ease(THREE.MathUtils.clamp(Math.min(sinceStroke, sinceCelebration, sinceSettle) / 450, 0, 1)) * (1 - readied);
    const breath = Math.sin(now * Math.PI * 2 / 3700) * weight;
    const drift = Math.sin(now * Math.PI * 2 / 7300) * weight;
    const waiting: Pose = { ...pose, hip: [pose.hip[0] + drift * .004, pose.hip[1], pose.hip[2]],
      chest: [pose.chest[0] + drift * .003, pose.chest[1] + breath * .003, pose.chest[2]],
      grip: [pose.grip[0], pose.grip[1] + breath * .0015, pose.grip[2]],
      face: pose.face + drift * .012 };
    return this.alive ? this.lively(waiting, now, weight) : waiting;
  }
  /** The waggle and the taps, over the guard he waits in, by `weight`: see `WAGGLE`. */
  private lively(pose: Pose, now: number, weight: number): Pose {
    if (!this.idle) {
      const [shortest, longest] = WAGGLE.period, random = this.idleRandom;
      this.idle = { from: now, period: THREE.MathUtils.lerp(shortest, longest, random()), phase: random() * Math.PI * 2,
        tapFrom: -Infinity, nextTap: now + TAP.at + (random() < TAP.share ? 0 : TAP.every) };
    }
    const idle = this.idle;
    // Where the bowler is: nought while nobody has said for a few frames.
    const running = now - this.runupSeen < 200 ? this.runupAt : 0;
    if (now >= idle.nextTap) {
      if (running === 0) idle.tapFrom = now;
      idle.nextTap = now + TAP.every;
    }
    const s = now - idle.tapFrom, tapping = TAP.down + TAP.taps * TAP.beat;
    const down = s < 0 ? 0 : s < TAP.down ? ease(s / TAP.down) : s < tapping ? 1 : ease(THREE.MathUtils.clamp(1 - (s - tapping) / TAP.up, 0, 1));
    // Each tap a quick lift and drop, then a rest on the turf: a sine the whole beat read as a slow bob.
    const beat = ((s - TAP.down) / TAP.beat) % 1;
    const lift = s > TAP.down && s < tapping && beat < TAP.air ? Math.sin(Math.PI * beat / TAP.air) * TAP.lift : 0;
    const tap = down * (1 - THREE.MathUtils.smoothstep(running, ...TAP.still)) * weight;
    const alive = THREE.MathUtils.smoothstep(now - idle.from, 0, WAGGLE.settle) * (1 - tap) * weight
      * (1 - THREE.MathUtils.smoothstep(running, ...WAGGLE.still));
    const turn = Math.PI * 2 * (now - idle.from) / idle.period + idle.phase;
    const rock = alive * Math.sin(turn);
    // The knees giving once a rock, down as the toe comes down; and the weight's slower roll.
    const sink = alive * (.5 - .5 * Math.sin(turn)), roll = alive * Math.sin(turn / STIRS.rocks + idle.phase * .7);
    const { sink: by, roll: rolled } = STIRS;
    const hip: Point = [pose.hip[0] + roll * rolled.x, pose.hip[1] - sink * by.hip, pose.hip[2] - roll * rolled.z];
    const chest: Point = [pose.chest[0] + roll * rolled.x * rolled.chest, pose.chest[1] - sink * by.chest, pose.chest[2] - roll * rolled.z * rolled.chest];
    // The toe tipped towards the sky about the hands, and the hands a touch up with it.
    const toe = V(pose.batUp).negate().normalize(), about = toe.clone().cross(UP).normalize();
    const rocked: Pose = { ...pose, hip, chest, yaw: pose.yaw + roll * rolled.turn,
      grip: [pose.grip[0], pose.grip[1] + rock * WAGGLE.lift - sink * by.grip, pose.grip[2]],
      bat: new THREE.Quaternion().setFromAxisAngle(about, rock * WAGGLE.tip).multiply(batOrientation(pose)) };
    if (tap <= 0) return rocked;
    const tapped = mix(rocked, TAPPED, tap);
    return { ...tapped, grip: [tapped.grip[0], tapped.grip[1] + lift * tap, tapped.grip[2]] };
  }
  update(now: number) {
    this.lastNow = now;
    if (this.runupFresh) { this.runupSeen = now; this.runupFresh = false; }
    if (Number.isFinite(this.felledAt)) return this.applyFall(now - this.felledAt);
    let age = now - this.swingStart;
    // A drive admired holds its finish the longer, and everything after the
    // hold happens that much later. Still, head and all: his head turned after
    // the ball, the helmet's round shell showed nothing of it from behind, and
    // only the peak came out past it and went back, as if the helmet stretched.
    if (this.admiring && age > ADMIRE_AT) age = Math.max(ADMIRE_AT, age - ADMIRE_MS);
    // Pull version one holds the wrap a moment longer, then comes home at its own pace: see `PULL_V1_HOLD_MS`.
    else if (this.pulling && !this.pullV2 && age > PULL_V1_CLOCK.hold) age = Math.max(PULL_V1_CLOCK.hold, age - PULL_V1_HOLD_MS);
    // The straight charge holds its wrap a moment longer, then comes home the slower: see `STRAIGHT_CHARGE_HOLD`.
    else if (this.charging && this.shot === 'STRAIGHT' && age > CHARGE_CLOCK.hold) {
      const { hold } = CHARGE_CLOCK, { held, home } = STRAIGHT_CHARGE_HOLD, drawn = STROKE_DURATION_MS - hold;
      age = age < hold + held ? hold : age < hold + held + home ? hold + (age - hold - held) * drawn / home : age - held - home + drawn;
    }
    // The punch holds its high finish a moment longer: see `PUNCH_HOLD_MS`.
    else if (this.punching && age > PUNCH_CLOCK.hold) age = Math.max(PUNCH_CLOCK.hold, age - PUNCH_HOLD_MS);
    // And the flick its wrap: see `FLICK_HOLD_MS`.
    else if (this.flickV2 && age > FLICK_CLOCK.hold) age = Math.max(FLICK_CLOCK.hold, age - FLICK_HOLD_MS);
    // And the back-foot flick its finish in front of his helmet: see `FLICK_V3_HOLD_MS`.
    else if (this.flickV3 && age > FLICK_V3_CLOCK.hold) age = Math.max(FLICK_V3_CLOCK.hold, age - FLICK_V3_HOLD_MS);
    // The hook, once he has turned round, holds and goes home the slower: see `HOOK_HOLD_MS`.
    else if (this.turning && age > HOOK_CLOCK.faced) {
      const { faced } = HOOK_CLOCK;
      age = faced + (age - faced) * (STROKE_DURATION_MS - faced) / (STROKE_DURATION_MS + HOOK_HOLD_MS - faced);
    }
    // And the spinner's cut once the bat is on his shoulder: see `SPIN_CUT_HOLD_MS`.
    else if (this.spinCutting && age > SPIN_CUT_CLOCK.finish) {
      const { finish } = SPIN_CUT_CLOCK;
      age = finish + (age - finish) * (STROKE_DURATION_MS - finish) / (STROKE_DURATION_MS + SPIN_CUT_HOLD_MS - finish);
    }
    // And the pull off the spinner once the bat is behind his head: see `SPIN_PULL_HOLD_MS`.
    else if (this.spinPulling && age > SPIN_PULL_CLOCK.finish) {
      const { finish } = SPIN_PULL_CLOCK;
      age = finish + (age - finish) * (STROKE_DURATION_MS - finish) / (STROKE_DURATION_MS + SPIN_PULL_HOLD_MS - finish);
    }
    // And the slog sweep from its finish behind his head: see `SLOG_HOLD_MS`.
    else if (this.sweeping && !this.levelled && age > SLOG_CLOCK.finish) {
      const { finish } = SLOG_CLOCK;
      age = finish + (age - finish) * (STROKE_DURATION_MS - finish) / (STROKE_DURATION_MS + SLOG_HOLD_MS - finish);
    }
    this.poseAge = age;
    this.travel(age);
    const celebrating = now - this.celebratedAt;
    if (celebrating >= 0 && celebrating < CELEBRATION_LENGTHS[this.celebration]) {
      // Nothing about the stroke he hit it with is left to shape the legs:
      // an unfinished stroke's age would have them bent its way.
      this.poseAge = Infinity;
      return this.applyCelebration(celebrating);
    }
    const after = this.afterward, since = after ? now - after.from : -1;
    if (after && since >= 0 && since < lengthOf(after.kind, this.shot) && !this.charging && age >= STROKE_DURATION_MS) {
      this.idle = null;
      // From where he is: still up in the leave, for a ball left alone.
      const keys = after.keys ??= [[0, this.pose], ...keysFor(after.kind, this.shot, this.struck, this.followed).slice(1)];
      let k = 1; while (k < keys.length - 1 && since >= keys[k][0]) k++;
      const [from, a] = keys[k - 1], [to, guard, curve] = keys[k];
      // The bowler already running in: home to the guard he waits in now,
      // the bat on its way up, rather than the one he left.
      const b = this.resetDue && k === keys.length - 1 ? mix(GUARD, BACKLIFT, this.anticipation) : guard;
      this.apply(mix(a, b, (since - from) / (to - from), curve));
      return;
    }
    // Done, with the next ball on its way: the reset the run-up asked for.
    if (this.resetDue) { this.clear(); age = now - this.swingStart; }
    // The pose he met the ball with, kept for rehearsing it if he missed.
    if (!this.struck && age >= STROKE_CONTACT_MS && age < STROKE_DURATION_MS) this.struck = this.pose;
    if (!this.followed && age >= STROKE_FINISH_MS && age < STROKE_DURATION_MS) this.followed = this.pose;
    if (!Number.isFinite(age) || age >= STROKE_DURATION_MS) {
      const guard = this.waiting(mix(GUARD, BACKLIFT, Number.isFinite(age) ? 0 : this.anticipation), now, age);
      this.apply(this.charging ? this.walking(guard, this.downPitch(age)) : guard);
      return;
    }
    const overCover = this.charging && this.shot === 'COVER_LONG_OFF';
    const overLongOn = this.charging && this.shot === 'LONG_ON';
    const stroke = overCover ? { contact: COVER_CHARGE_CONTACT, finish: COVER_CHARGE_FINISH }
      : overLongOn ? { contact: ON_CHARGE_CONTACT, finish: ON_CHARGE_FINISH }
      : this.charging ? { contact: CHARGE_CONTACT, finish: CHARGE_FINISH }
      : this.sweeping ? (this.levelled ? FLAT_SWEEP : SLOG_SWEEP) : this.pulling ? (this.pullV2 ? PULL : PULL_V1) : this.cutting ? CUT_HIGH
      : this.squaring ? SQUARE_DRIVE : this.lofted ? (this.shot === 'LONG_ON' ? ON_LOFT : this.straightLoftV2 ? STRAIGHT_LOFT_V2 : STRAIGHT_LOFT)
      : this.spinCutting ? SPIN_CUT : this.spinPulling ? (this.ballY < SPIN_PULL_LOW_BALL ? SPIN_PULL_LOW : SPIN_PULL)
      : this.shot === 'SCOOP' ? SCOOP : this.shot === 'REVERSE_SCOOP' ? REVERSE_SCOOP : this.shot === 'HOOK' ? HOOK : this.punching ? PUNCH_STROKE
      : this.shot === 'COVER_LONG_OFF' && this.coverVersion === 1 ? COVER_DRIVE_V1
      : this.shot === 'COVER_LONG_OFF' && this.coverVersion === 3 ? COVER_DRIVE_V3 : this.backDefence ? DEFENCE_BACK : this.flickV2 ? FLICK_V2 : this.flickV3 ? FLICK_V3 : STROKES[this.shot];
    // Place the middle of the blade at the ball's contact plane, not merely
    // somewhere along the selected sector. Wrong shots stay in their own reach.
    const zones: Record<ShotType, readonly [number, number]> = {
      LEG: [-.55, -.05], LONG_ON: [-.55, .08], STRAIGHT: [-.17, .17],
      COVER_LONG_OFF: [-.08, .55],
      // The cut is played square and wide of the body.
      SQUARE_CUT: CUT_REACH,
      // Defence covers the stumps and a little either side, not the whole crease.
      DEFEND: [-.30, .30],
      SCOOP: SCOOP_REACH, REVERSE_SCOOP: REVERSE_REACH, HOOK: HOOK_REACH, LATE_CUT: LATE_CUT_REACH,
    };
    // Both charges reach the straight drive's zone: a chargeable ball is on
    // the stumps, and the one over cover is hit inside out from that line
    // rather than fetched from the cover drive's wider, off-side reach.
    const targetX = THREE.MathUtils.clamp(this.ballX,
      ...(this.sweeping ? SWEEP_REACH : this.pulling ? PULL_REACH : this.squaring ? SQUARE_DRIVE_REACH : this.charging ? zones.STRAIGHT
        : this.spinCutting ? SPIN_CUT_REACH : this.spinPulling ? SPIN_PULL_REACH : zones[this.shot]));
    // The bat meets the ball where he stands at contact. Reading the live root
    // instead drags the hands backwards out of a charge as it carries him on.
    const impact = this.charging ? CHARGE_CONTACT_MS : this.sweeping ? SWEEP_CONTACT_MS : this.pulling ? (this.pullV2 ? PULL_CONTACT_MS : PULL_V1_CONTACT_MS)
      : this.squaring ? SQUARE_DRIVE_CONTACT_MS : this.shot === 'SCOOP' ? SCOOP_CONTACT_MS : this.shot === 'REVERSE_SCOOP' ? REVERSE_CONTACT_MS
      : this.shot === 'HOOK' ? HOOK_CONTACT_MS : this.spinCutting ? SPIN_CUT_CONTACT_MS : this.spinPulling ? SPIN_PULL_CONTACT_MS : this.shot === 'LATE_CUT' ? LATE_CUT_CONTACT_MS : this.shot === 'DEFEND' ? (this.backDefence ? DEFENCE_BACK_CONTACT_MS : DEFENCE_FRONT_CONTACT_MS) : this.punching ? PUNCH_CONTACT_MS : this.flickV3 ? FLICK_V3_CONTACT_MS : STROKE_CONTACT_MS;
    const planted = GAME.stanceZ + this.downPitch(impact);
    const contactGrip = new THREE.Vector3(targetX - this.root.position.x, this.ballY, this.ballZ - planted)
      .addScaledVector(V(stroke.contact.batUp).normalize(), .44);
    // How far the body follows the ball sideways. The square drive tracks a wide
    // one further than the rest: its arms are already straight at impact, and a
    // body left behind a ball out at the edge of the reach stretches them past
    // their own length rather than extending them.
    // The slog sweep goes all the way: the lunge takes the front foot to the
    // ball's line, and a body left short of a ball on the pads brought the
    // bat down onto the front knee. Pull version one goes all the way too: by
    // the drives' share, a ball outside leg was met with the hands across his
    // chest and the front elbow swung over the top of it.
    // The punch steps across to the ball's line, but a little less across to one up at his chest (`PUNCH_HIGH_ROOM`).
    const step = this.spinCutting ? targetX - SPIN_CUT_ROOM : this.spinPulling ? targetX : this.paceCut ? targetX - CUT_ROOM
      : this.flickV3 ? targetX - LINE_X.LEG : this.punching ? targetX - PUNCH_HIGH_ROOM * THREE.MathUtils.clamp((this.ballY - .81) / (PUNCH_HIGHEST - .81), 0, 1) : targetX * (this.squaring ? .86 : this.sweeping && !this.levelled ? 1 : this.pulling && !this.pullV2 ? 1 : this.shot === 'DEFEND' || this.flickV2 ? 1 : .65);
    const shift = (p: Point, amount: number): Point => [p[0] + amount, p[1], p[2]];
    const shiftsBackFoot = this.pulling || this.wristFlick || this.squaring || this.sweeping || this.charging || this.lofted || this.shot === 'STRAIGHT' || this.shot === 'COVER_LONG_OFF'
      || this.shot === 'SCOOP' || this.shot === 'REVERSE_SCOOP' || this.turning || this.spinCutting || this.spinPulling || this.onDrive || this.shot === 'LATE_CUT' || this.shot === 'DEFEND';
    const reachPose = (p: Pose): Pose => ({ ...p, hip: shift(p.hip, step), chest: shift(p.chest, step),
      frontFoot: shift(p.frontFoot, step), backFoot: shiftsBackFoot ? shift(p.backFoot, step) : p.backFoot,
      grip: shift(p.grip, step) });
    const contact = { ...reachPose(stroke.contact), grip: contactGrip.toArray() as unknown as Point };
    const finish = reachPose(stroke.finish);
    if (this.charging) {
      // Its own clock from end to end. The approach is part of the stroke —
      // there is no charge without the skip and the stride — so it is keyed
      // like the swing rather than blended in from the guard, and the hands
      // orbit the shoulders through the drive the way the other drives' do.
      const { hold, unwrap, across, recover } = CHARGE_CLOCK;
      const keys = overCover ? COVER_CHARGE_KEYS : overLongOn ? ON_CHARGE_KEYS : CHARGE_KEYS;
      const settle = keys[keys.length - 1].time;
      // The way home, as the poses it passes through and when it reaches
      // each. The wrap needs three — up out of it, across, and down into the
      // pick-up — because every straight line from behind one shoulder to
      // behind the other goes through him, so the bat goes back up over the
      // top on the arc it went over on, then down in front. The charge over
      // long-on wraps shallower and has its own first key. The high finish
      // over cover needs two: down in front of the face, then across into
      // the pick-up.
      const home: readonly [number, Pose][] = overCover
        ? [[COVER_CHARGE_CLOCK.down, COVER_CHARGE_DOWN], [COVER_CHARGE_CLOCK.recover, COVER_CHARGE_RECOVER]]
        : overLongOn ? [[unwrap, ON_CHARGE_UNWRAP], [across, CHARGE_ACROSS], [recover, CHARGE_RECOVER]]
        : [[unwrap, CHARGE_UNWRAP], [across, CHARGE_ACROSS], [recover, CHARGE_RECOVER]];
      const poseAt = (at: number): Pose => {
        if (at < settle) return shoulderDriven([{ time: 0, pose: this.swingFrom },
          ...keys.map(({ time, pose }) => ({ time, pose: time === CHARGE_CLOCK.contact ? contact : reachPose(pose) }))], at, CHARGE_CONTACT_MS);
        if (at < hold) return finish;
        // The straight charge comes home on one smooth curve through its keys,
        // easing out of the hold and into the guard, each key placed by how
        // far the hands go to reach it: on the keys' own times it changed
        // speed at every one, and came into the guard fastest and stopped dead.
        if (!overCover && !overLongOn) {
          const path = [finish, ...home.map(([, pose]) => reachPose(pose)), GUARD];
          const along = path.map((_, n) => path.slice(1, n + 1).reduce((sum, pose, m) => sum + V(pose.grip).distanceTo(V(path[m].grip)), 0));
          const span = STROKE_DURATION_MS - hold, total = along[along.length - 1];
          return flowing(path.map((pose, n) => ({ time: hold + span * along[n] / total, pose })),
            hold + span * ease(THREE.MathUtils.clamp((at - hold) / span, 0, 1)));
        }
        let from: Pose = finish, since: number = hold;
        for (const [until, pose] of home) {
          if (at < until) return mix(from, reachPose(pose), (at - since) / (until - since));
          from = reachPose(pose); since = until;
        }
        return mix(from, GUARD, (at - since) / (STROKE_DURATION_MS - since));
      };
      const pose = { ...poseAt(age) };
      // Over cover, from the ball on, the face rides the handle, in every
      // version: there is no wrist roll after the ball. Version one used to
      // turn it in his hands, a quarter of a turn up into the finish and more
      // than a full turn coming home. What it has to turn to be back in his
      // guard it turns on the way down from the hold.
      if (overCover && age > CHARGE_CONTACT_MS) {
        const reference = batOrientation(COVER_DRIVE_V1.contact), up = UP.clone().applyQuaternion(batOrientation(poseAt(CHARGE_CONTACT_MS)));
        const met = new THREE.Quaternion().setFromUnitVectors(UP.clone().applyQuaternion(reference), up).multiply(reference);
        pose.bat = this.riding(CHARGE_CONTACT_MS, poseAt, met, [hold, COVER_CHARGE_CLOCK.recover], age);
      }
      // The straight charge rides it too, from the face the keys meet the ball
      // with, and turns it once: the bottom hand rolling over the top one as
      // the bat goes over him, so that laid back on the front shoulder the
      // flat face looks at the sky and the curved back rests on him. Drawn from
      // the keys it turned more than a turn and a quarter in his hands between
      // the ball and the hold, and wrapped with the face on him.
      else if (!overCover && !overLongOn && age > CHARGE_CONTACT_MS)
        pose.bat = this.riding(CHARGE_CONTACT_MS, poseAt, batOrientation(poseAt(CHARGE_CONTACT_MS)), [hold, recover], age,
          { window: [CHARGE_CLOCK.through, CHARGE_CLOCK.finish], away: () => new THREE.Vector3(0, 1, 0) });
      this.apply(pose);
      return;
    }
    if (this.shot === 'SCOOP') {
      // Across and down, ramp, lift to upright and hold it; then back across
      // into the pick-up. From the ball on the face rides the handle
      // (`riding`), and what it has to turn to be back in his guard it turns
      // evenly over the whole of the way home, never in a flick at the end.
      const { set, through, carry, finish: end, hold, unwrap, across, up } = SCOOP_CLOCK;
      const over = reachPose(SCOOP.unwrap), front = reachPose(SCOOP.across), recovery = reachPose(SCOOP.recover!);
      const poseAt = (at: number): Pose => at < end
        ? flowing([{ time: 0, pose: this.swingFrom }, { time: set, pose: reachPose(SCOOP.set) },
          { time: SCOOP_CONTACT_MS, pose: contact }, { time: through, pose: reachPose(SCOOP.through!) },
          { time: carry, pose: reachPose(SCOOP.carry!) }, { time: end, pose: finish }], at)
        : at < hold ? finish
        : at < unwrap ? mix(finish, over, (at - hold) / (unwrap - hold))
        : at < across ? mix(over, front, (at - unwrap) / (across - unwrap))
        : at < up ? mix(front, recovery, (at - across) / (up - across), leave)
        : mix(recovery, GUARD, (at - up) / (STROKE_DURATION_MS - up), arrive);
      const pose = { ...poseAt(age) };
      if (age > SCOOP_CONTACT_MS) pose.bat = this.riding(SCOOP_CONTACT_MS, poseAt, batOrientation(poseAt(SCOOP_CONTACT_MS)), [hold, STROKE_DURATION_MS], age);
      this.apply(pose);
      return;
    }
    if (this.shot === 'REVERSE_SCOOP') {
      // Over and up on the leg side, down across him onto the knee, under it
      // on the off side and up the off side to upright, held; then up off the
      // knee and home. The face rides the handle the whole way (`riding`),
      // from the bat as his guard draws it. The swing alone brings it to
      // within a few degrees of the face he meets the ball with, and that is
      // all it turns before the ball: given a face of its own at the top of
      // the backlift as well, it rolled in his wrists one way and back again
      // on the way there. After the ball the forearms roll it over to face
      // the keeper, evenly across the whole climb, and it goes back into the
      // guard across the way home.
      const { drop, flip, lift, down, through, carry, finish: end, hold, up } = REVERSE_CLOCK;
      const recovery = reachPose(REVERSE_SCOOP.recover!);
      const poseAt = (at: number): Pose => at < end
        ? flowing([{ time: 0, pose: this.swingFrom }, { time: drop, pose: reachPose(REVERSE_SCOOP.drop) }, { time: flip, pose: reachPose(REVERSE_SCOOP.flip) },
          { time: lift, pose: reachPose(REVERSE_SCOOP.lift) }, { time: down, pose: reachPose(REVERSE_SCOOP.down) },
          { time: REVERSE_CONTACT_MS, pose: contact }, { time: through, pose: reachPose(REVERSE_SCOOP.through!) },
          { time: carry, pose: reachPose(REVERSE_SCOOP.carry!) }, { time: end, pose: finish }], at)
        : at < hold ? finish
        : at < up ? mix(finish, recovery, (at - hold) / (up - hold), leave)
        : mix(recovery, GUARD, (at - up) / (STROKE_DURATION_MS - up), arrive);
      const straight = batOrientation(STROKES.STRAIGHT.contact), from = batOrientation(this.swingFrom);
      const drawn = new THREE.Quaternion().setFromUnitVectors(UP.clone().applyQuaternion(straight), UP.clone().applyQuaternion(from)).multiply(straight);
      if (this.swingFrom.ownFace) drawn.slerp(from, this.swingFrom.ownFace);
      const own = (key: Pose) => V(key.batFace);
      const pose = { ...poseAt(age) };
      pose.bat = this.riding(0, poseAt, drawn, [hold, STROKE_DURATION_MS], age,
        [{ window: [0, REVERSE_CONTACT_MS], away: own }, { window: [REVERSE_CONTACT_MS, end], away: own }]);
      this.apply(pose);
      return;
    }
    if (this.sweeping && !this.levelled) {
      // The lunge and the high backlift, the hands down by the back hip and
      // out in front, through flat out in front of the front pad, round at
      // the bowler and up over the leg side, upright beside his head, over it
      // and down behind it; held, then down in front of his face, up off the
      // knee and home. The face rides the handle from the swipe (`riding`),
      // and the forearms roll it over once on the way up to the finish.
      const { lift, drop, down, through, carry, over, finish: end, hold, back, front, up } = SLOG_CLOCK;
      const swing = [{ time: 0, pose: this.swingFrom }, { time: lift, pose: reachPose(SLOG_SWEEP.lift) },
        { time: drop, pose: reachPose(SLOG_SWEEP.drop) }, { time: down, pose: reachPose(SLOG_SWEEP.down) }, { time: SWEEP_CONTACT_MS, pose: contact },
        { time: through, pose: reachPose(SLOG_SWEEP.through!) }, { time: carry, pose: reachPose(SLOG_SWEEP.carry!) },
        { time: over, pose: reachPose(SLOG_SWEEP.over) }, { time: end, pose: finish }];
      const home = [{ time: hold, pose: finish }, { time: back, pose: reachPose(SLOG_SWEEP.back) }, { time: front, pose: reachPose(SLOG_SWEEP.front) },
        { time: up, pose: reachPose(SLOG_SWEEP.recover!) }, { time: STROKE_DURATION_MS, pose: GUARD }];
      const poseAt = (at: number): Pose => at < end ? flowing(swing, at) : at < hold ? finish : flowing(home, at);
      const straight = batOrientation(STROKES.STRAIGHT.contact), from = batOrientation(this.swingFrom);
      const drawn = new THREE.Quaternion().setFromUnitVectors(UP.clone().applyQuaternion(straight), UP.clone().applyQuaternion(from)).multiply(straight);
      if (this.swingFrom.ownFace) drawn.slerp(from, this.swingFrom.ownFace);
      const pose = { ...poseAt(age) };
      pose.bat = this.riding(0, poseAt, drawn, [hold, STROKE_DURATION_MS], age,
        [{ window: [0, SWEEP_CONTACT_MS], away: (key: Pose) => V(key.batFace) }, { window: [through, end], away: (key: Pose) => V(key.batFace) }]);
      this.apply(pose);
      return;
    }
    if (this.sweeping) {
      // Going down is part of the stroke, so it gets a key of its own: the knee
      // is on the turf and the bat is up behind the shoulder before the swing
      // starts. `horizontalSweep` keeps the blade going round the body rather
      // than letting the interpolation take the short way through it.
      // Longer after the ball than the drives are. The swing itself is the
      // same brutal hurry, but a bat travelling that fast round a kneeling body
      // carries the elbows round with it, and a follow-through crammed into the
      // drives' window moved the front elbow eighteen metres a second. He is
      // not stopping it dead; he is letting it run out.
      const end = 560, hold = 620;
      const through = reachPose(stroke.through!);
      if (age < end) {
        const keys = [{ time: 0, pose: this.swingFrom },
          { time: 130, pose: reachPose({ ...BACKLIFT,
            hip: [-.05,.78,-.14], chest: [-.02,1.12,-.04],
            frontFoot: [.06,.08,.20], backFoot: [-.10,.08,-.60],
            grip: [.34,1.06,.24], batUp: [-.30,-.86,.41], batFace: [.41,.27,.87],
            yaw: 1.22, face: -.10, heel: .50, backFootYaw: 1.55, leadElbow: -.18 }) },
          { time: SWEEP_CONTACT_MS, pose: contact },
          { time: 390, pose: through },
          { time: 470, pose: reachPose(stroke.carry!) },
          { time: end, pose: finish }];
        this.apply(flowing(keys, age, true));
      } else if (age < hold) this.apply(finish);
      else {
        const recovery = reachPose(stroke.recover!);
        const out = hold + 130, up = hold + 270;
        this.apply(age < out ? mix(finish, SWEEP_UNWRAP, (age - hold) / (out - hold))
          : age < up ? mix(SWEEP_UNWRAP, recovery, (age - out) / (up - out), leave)
          : mix(recovery, GUARD, (age - up) / (STROKE_DURATION_MS - up), arrive));
      }
      return;
    }
    if (this.shot === 'LATE_CUT') {
      const { load, contact: met, down, hold, rise, upright } = LATE_CUT_CLOCK;
      const keys = [{ time: 0, pose: this.swingFrom }, { time: load, pose: reachPose(LATE_CUT.load) }, { time: met, pose: contact },
        { time: down, pose: finish }];
      // Held down there, then up out of it: one list, so it eases out of the hold.
      const home = [{ time: hold, pose: finish }, { time: rise, pose: reachPose(LATE_CUT.rise) },
        { time: upright, pose: reachPose(LATE_CUT.upright) }, { time: STROKE_DURATION_MS, pose: GUARD }];
      const poseAt = (at: number): Pose => at < down ? flowing(keys, at) : at < hold ? finish : flowing(home, at);
      const pose = { ...poseAt(age) };
      const straight = batOrientation(STROKES.STRAIGHT.contact);
      const start = new THREE.Quaternion().setFromUnitVectors(UP.clone().applyQuaternion(straight), UP.clone().applyQuaternion(batOrientation(this.swingFrom))).multiply(straight);
      // The face rides the handle, opened to third man as it comes down to the ball.
      pose.bat = this.riding(0, poseAt, start, [hold, STROKE_DURATION_MS], age, { window: [0, met], away: () => new THREE.Vector3(...LATE_CUT.contact.batFace) });
      this.apply(pose);
      return;
    }
    // The cut keeps the shared clock, and the face rides the handle
    // (`riding`): drawn from the keys, it turned to the keeper and the back
    // of the blade met the ball.
    if (this.paceCut) {
      const met = STROKE_CONTACT_MS, end = 410, hold = 570, through = hold + (STROKE_DURATION_MS - hold) * .52;
      const recover = reachPose(stroke.recover!);
      // Up in front of his face on the way to the shoulder, the toe to the
      // sky: held out at the ball, the arms leave the bat further from him,
      // and the straight way from there to the wrap went through his helmet.
      const half = mix(contact, finish, .5);
      const carry: Pose = { ...half, bat: undefined, grip: [half.grip[0], half.grip[1] + .05, half.grip[2] + .12], batUp: [-.20, -.80, -.56] };
      const lift = 260;
      const poseAt = (at: number): Pose => at <= met ? mix(this.swingFrom, contact, at / met)
        : at < lift ? mix(contact, carry, (at - met) / (lift - met)) : at < end ? mix(carry, finish, (at - lift) / (end - lift)) : at < hold ? finish
        : at < through ? mix(finish, recover, (at - hold) / (through - hold), leave) : mix(recover, GUARD, (at - through) / (STROKE_DURATION_MS - through), arrive);
      const pose = { ...poseAt(age) };
      const straight = batOrientation(STROKES.STRAIGHT.contact);
      const start = new THREE.Quaternion().setFromUnitVectors(UP.clone().applyQuaternion(straight), UP.clone().applyQuaternion(batOrientation(this.swingFrom))).multiply(straight);
      pose.bat = this.riding(0, poseAt, start, [hold, STROKE_DURATION_MS], age, [
        // The forearms turn the flat face to the bowler as the bat comes down,
        // a little over the ball to keep it down,
        { window: [30, met], away: (key: Pose) => V(key.batFace) },
        // and the bottom hand rolls over the top one as the elbows fold, so
        // that wrapped, the curved back of the blade lies on the front shoulder.
        { window: [200, end], away: (wrap, up) => V(wrap.grip).addScaledVector(up, -.45).sub(shoulderOf(wrap, 0)) },
      ]);
      this.apply(pose);
      return;
    }
    if (this.spinPulling) {
      const { load, down, contact: met, front, leg, round, rise, finish: end, hold, unwrap, lowered } = SPIN_PULL_CLOCK;
      const S = this.ballY < SPIN_PULL_LOW_BALL ? SPIN_PULL_LOW : SPIN_PULL;
      // Down from his ball dropped short to the ball this one is.
      const below = this.ballY - SPIN_PULL_BALL;
      const sunk = (pose: Pose, by: number): Pose => { const p = reachPose(pose); return { ...p, grip: [p.grip[0], p.grip[1] + below * by, p.grip[2]] }; };
      const out = [{ time: 0, pose: this.swingFrom }, { time: load, pose: reachPose(S.load) }, { time: down, pose: sunk(S.down, SPIN_PULL_SUNK.down) },
        { time: met, pose: contact }, { time: front, pose: sunk(S.front, SPIN_PULL_SUNK.front) }, { time: leg, pose: sunk(S.leg, SPIN_PULL_SUNK.leg) },
        { time: round, pose: sunk(S.round, SPIN_PULL_SUNK.round) }, { time: rise, pose: reachPose(S.rise) }, { time: end, pose: finish }];
      // Home as pull v2 goes home: up over his head with the bat upright, then down.
      const home = [{ time: hold, pose: finish }, { time: unwrap, pose: reachPose(S.unwrap) }, { time: lowered, pose: reachPose(S.lowered) },
        { time: STROKE_DURATION_MS, pose: GUARD }];
      const poseAt = (at: number): Pose => at < end ? flowing(out, at) : at < hold ? finish : flowing(home, at);
      const pose = { ...poseAt(age) };
      const straight = batOrientation(STROKES.STRAIGHT.contact);
      const start = new THREE.Quaternion().setFromUnitVectors(UP.clone().applyQuaternion(straight), UP.clone().applyQuaternion(batOrientation(this.swingFrom))).multiply(straight);
      // Pull v2's face: turned square to the bowler on the way down and never
      // in his hands through the ball and the swing round, then the bottom
      // hand rolling over the top one as the elbows fold, so the curved back
      // of the blade lies on the front shoulder at the wrap.
      pose.bat = this.riding(0, poseAt, start, [hold, STROKE_DURATION_MS], age, [
        { window: [load, met], away: () => new THREE.Vector3(0, 0, 1) },
        { window: [leg, end], away: (wrap, up) => V(wrap.grip).addScaledVector(up, -.45).sub(shoulderOf(wrap, 0)) },
      ]);
      this.apply(pose);
      return;
    }
    if (this.spinCutting) {
      const { load, contact: met, through, rise, up, tip, finish: end, hold, unwrap, lowered } = SPIN_CUT_CLOCK;
      const out = [{ time: 0, pose: this.swingFrom }, { time: load, pose: reachPose(SPIN_CUT.load) }, { time: met, pose: contact },
        { time: through, pose: reachPose(SPIN_CUT.through!) }, { time: rise, pose: reachPose(SPIN_CUT.rise) },
        { time: up, pose: reachPose(SPIN_CUT.up) }, { time: tip, pose: reachPose(SPIN_CUT.tip) }, { time: end, pose: finish }];
      // Home off the shoulder the way it came, then down in front: from
      // behind his neck every shorter way goes through him.
      const home = [{ time: hold, pose: finish }, { time: SPIN_CUT_CLOCK.untip, pose: reachPose(SPIN_CUT.tip) }, { time: unwrap, pose: reachPose(SPIN_CUT.off) }, { time: SPIN_CUT_CLOCK.upright, pose: reachPose(SPIN_CUT.upright) },
        { time: lowered, pose: reachPose(SPIN_CUT.lowered) }, { time: STROKE_DURATION_MS, pose: GUARD }];
      const poseAt = (at: number): Pose => at < end ? flowing(out, at) : at < hold ? finish : flowing(home, at);
      const pose = { ...poseAt(age) };
      const straight = batOrientation(STROKES.STRAIGHT.contact);
      const start = new THREE.Quaternion().setFromUnitVectors(UP.clone().applyQuaternion(straight), UP.clone().applyQuaternion(batOrientation(this.swingFrom))).multiply(straight);
      pose.bat = this.riding(0, poseAt, start, [hold, STROKE_DURATION_MS], age, [
        // The face sliced down on the ball, to the bowler and the ground, as it comes down to it,
        { window: [0, met], away: () => new THREE.Vector3(.2, -.5, .85) },
        // and the back of the blade on the front shoulder once it is over.
        { window: [rise, end], away: (wrap, up) => V(wrap.grip).addScaledVector(up, -.45).sub(shoulderOf(wrap, 0)) },
      ]);
      this.apply(pose);
      return;
    }
    if (this.turning) {
      const { load, down, contact: met, front, leg, round, rise, finish: end, turned, faced, hold, unwrap, lowered } = HOOK_CLOCK;
      const keys = this.pulling ? PULL : HOOK, swung = this.pulling ? PULL_SWUNG : HOOK_SWUNG;
      const round_ = reachPose(keys.faced);
      const out = [{ time: 0, pose: this.swingFrom }, { time: load, pose: reachPose(keys.load) }, { time: down, pose: reachPose(keys.down) },
        { time: met, pose: contact }, { time: front, pose: reachPose(swung.front) }, { time: leg, pose: reachPose(swung.leg) },
        { time: round, pose: reachPose(swung.round) }, { time: rise, pose: reachPose(swung.rise) }, { time: end, pose: reachPose(swung.finish) },
        // One list from the ball to the end of the turn, so nothing comes to
        // rest on the way: a key list eases to a stop at its last key, and the
        // wrap as the end of one list and the start of the next stopped dead.
        { time: turned, pose: reachPose(swung.turned) }, { time: faced, pose: round_ }];
      // Home: unwound with the bat brought upright over his head, then down.
      const home = [{ time: hold, pose: round_ }, { time: unwrap, pose: reachPose(keys.unwrap) }, { time: lowered, pose: reachPose(keys.lowered) },
        { time: STROKE_DURATION_MS, pose: GUARD }];
      const poseAt = (at: number): Pose => at < faced ? flowing(out, at) : at < hold ? round_ : flowing(home, at);
      const pose = { ...poseAt(age) };
      // The face never turns in his hands: it rides the handle from his
      // stance, as his guard draws it, the whole way round, and only the
      // forearms turning it square to the bowler on the way down to the ball
      // and back to his guard on the way home move it about the handle.
      const straight = batOrientation(STROKES.STRAIGHT.contact);
      const start = new THREE.Quaternion().setFromUnitVectors(UP.clone().applyQuaternion(straight), UP.clone().applyQuaternion(batOrientation(this.swingFrom))).multiply(straight);
      pose.bat = this.riding(0, poseAt, start, [hold, STROKE_DURATION_MS], age, [
        { window: [load, met], away: () => new THREE.Vector3(0, 0, 1) },
        // And the bottom hand rolling over the top one as the elbows fold, so
        // that wrapped the flat face looks out and the curved back of the
        // blade lies against his front shoulder, as the on drive's six does.
        { window: [leg, end], away: (wrap, up) => V(wrap.grip).addScaledVector(up, -.45).sub(shoulderOf(wrap, 0)) },
      ]);
      this.apply(pose);
      return;
    }
    // The block: the forward defence or the back-foot one, on clocks of their
    // own, the face riding the handle and turned down to the bowler as the
    // bat comes down. See `DEFENCE_FRONT`.
    if (this.shot === 'DEFEND') {
      const clock = this.backDefence ? DEFENCE_CLOCK.back : DEFENCE_CLOCK.front, keys = this.backDefence ? DEFENCE_BACK : DEFENCE_FRONT;
      const give = reachPose(keys.give);
      const out = [{ time: 0, pose: this.swingFrom }, { time: clock.press, pose: reachPose(keys.press) }, { time: clock.met, pose: contact }, { time: clock.give, pose: give }];
      // Home in one movement, the bat lifted straight back into the guard as a
      // backlift is: halfway, the toe points back past him on the off side, a
      // little wider than the shortest way (`DEFENCE_HOME_OUT`), so nothing
      // turns it in his hands (`liftedHome`). Taken up and over in front of him
      // first, after a stop for the elbow, it read as the wrists twirling it.
      const homeAt = liftedHome(give, clock.hold, DEFENCE_HOME_OUT);
      const poseAt = (at: number): Pose => at < clock.give ? flowing(out, at) : at < clock.hold ? give : homeAt(at);
      const pose = { ...poseAt(age) };
      const straight = batOrientation(STROKES.STRAIGHT.contact);
      const start = new THREE.Quaternion().setFromUnitVectors(UP.clone().applyQuaternion(straight), UP.clone().applyQuaternion(batOrientation(this.swingFrom))).multiply(straight);
      pose.bat = this.riding(0, poseAt, start, [clock.hold, STROKE_DURATION_MS], age, { window: [0, clock.met], away: () => V(keys.contact.batFace) });
      this.apply(pose);
      return;
    }
    // The back-foot punch: back and across and tall, down straight onto the
    // ball beside the back hip, punched on through towards cover and up until
    // the hands are over his helmet with the bat hanging from them, held, then
    // home in one movement. The face rides the handle the whole way (`riding`),
    // turned to cover only as the bat comes down: after the ball the arms take
    // the bat up and the wrists never roll it. See `PUNCH_STROKE`.
    if (this.punching) {
      const { load, met, through: pushed, finish: end, hold } = PUNCH_CLOCK, keys = PUNCH_STROKE;
      // The punch out and up goes on from wherever the ball was met: a bouncer's
      // is met with the hands up by his chin, one back of a length's at his chest.
      const along = (key: Pose): Point => V(contact.grip).add(V(key.grip).sub(V(keys.contact.grip))).toArray() as unknown as Point;
      // Punched on and up from there, though never past his chin on the way: a bouncer, met by it, is driven out rather than up.
      const out = along(keys.through), driven: Point = [out[0], Math.min(out[1], PUNCH_THROUGH_TOP), out[2]];
      const through = { ...reachPose(keys.through), grip: driven };
      // And it stops where the hands are up by his face, a little above where they were punched through to.
      const ends = reachPose(keys.finish), finish = { ...ends, grip: [ends.grip[0], Math.max(ends.grip[1], driven[1] + .05), ends.grip[2]] as Point };
      // At a ball up at his chest the bat is picked up higher, so the downswing is not climbing to it.
      const lifted = reachPose(keys.load), picked = { ...lifted, grip: [lifted.grip[0], Math.max(lifted.grip[1], contact.grip[1] - PUNCH_PICKUP_BELOW), lifted.grip[2]] as Point };
      const swing = [{ time: 0, pose: this.swingFrom }, { time: load, pose: picked }, { time: met, pose: contact },
        { time: pushed, pose: through }, { time: end, pose: finish }];
      const homeAt = liftedHome(finish, hold, PUNCH_HOME_VIA, PUNCH_HOME_LAG);
      const poseAt = (at: number): Pose => at < end ? flowing(swing, at) : at < hold ? finish : homeAt(at);
      const pose = { ...poseAt(age) };
      const straight = batOrientation(STROKES.STRAIGHT.contact);
      const start = new THREE.Quaternion().setFromUnitVectors(UP.clone().applyQuaternion(straight), UP.clone().applyQuaternion(batOrientation(this.swingFrom))).multiply(straight);
      // Turned to cover in the pick-up, so the downswing carries it onto the ball unturned.
      pose.bat = this.riding(0, poseAt, start, [hold, STROKE_DURATION_MS], age, { window: [0, load], at: met, away: () => V(keys.contact.batFace) });
      this.apply(pose);
      return;
    }    // Pull version one: the first build's body on its own clock, the bat
    // swung round flat with the arms long and wrapped over the front shoulder.
    if (this.pulling) {
      const { load, down, contact: met, front, through, rise, finish: end, hold } = PULL_V1_CLOCK;
      const keys = [{ time: 0, pose: this.swingFrom }, { time: load, pose: reachPose(PULL_V1.load) }, { time: down, pose: reachPose(PULL_V1.down) }, { time: met, pose: contact },
        { time: front, pose: reachPose(PULL_V1.front) }, { time: through, pose: reachPose(PULL_V1.through!) },
        { time: rise, pose: reachPose(PULL_V1.rise) }, { time: end, pose: finish }];
      // Home: the bat swung out level in front of him, then down into the pick-up.
      const recovery = reachPose(stroke.recover!);
      const out = reachPose({ ...PULL_V1.finish, grip: [-.20, 1.38, .52], batUp: [1, 0, 0], batFace: [0, .25, -.97] });
      const first = hold + 100, second = hold + 240;
      const poseAt = (at: number): Pose => at < end ? flowing(keys, at) : at < hold ? finish
        : at < first ? mix(finish, out, (at - hold) / (first - hold))
        : at < second ? mix(out, recovery, (at - first) / (second - first), leave)
        : mix(recovery, GUARD, (at - second) / (STROKE_DURATION_MS - second), arrive);
      const pose = { ...poseAt(age) };
      // The face rides the handle: turned to the bowler as the bat comes down,
      // and over as the elbows fold, so the back of the blade lies on the
      // front shoulder; the first build's met the ball looking at square leg.
      const straight = batOrientation(STROKES.STRAIGHT.contact);
      const start = new THREE.Quaternion().setFromUnitVectors(UP.clone().applyQuaternion(straight), UP.clone().applyQuaternion(batOrientation(this.swingFrom))).multiply(straight);
      pose.bat = this.riding(0, poseAt, start, [hold, STROKE_DURATION_MS], age, [
        { window: [load, met], away: () => new THREE.Vector3(0, -.1, 1) },
        { window: [through, end], away: (wrap, up) => V(wrap.grip).addScaledVector(up, -.45).sub(shoulderOf(wrap, 0)) },
      ]);
      this.apply(pose);
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
        if (stroke.carry) keys.push({ time: 350, pose: reachPose(stroke.carry) });
        keys.push({ time: settle, pose: finish });
        this.apply(shoulderDriven(keys, age, impact));
      } else if (age < 590) this.apply(finish);
      else {
        // Down through the recovery pose and then home, the same route the cut
        // takes off the same shoulder: the finish holds the bat behind the
        // front one and the guard holds it behind the back one, so the bat is
        // swung out in front where he can see it before it drops into the
        // pick-up. Every shorter path between those two goes through him.
        const recovery = reachPose(stroke.recover!);
        const through = 590 + (STROKE_DURATION_MS - 590) * .52;
        this.apply(age < through ? mix(finish, recovery, (age - 590) / (through - 590), leave)
          : mix(recovery, GUARD, (age - through) / (STROKE_DURATION_MS - through), arrive));
      }
      return;
    }
    // The on drive's six: the on drive's front foot down first and its contact,
    // up through the lofted extension and carry into the wrap over the front
    // shoulder, held, and home back down the way it went. From the ball on the
    // face rides the handle (`riding`): the arms take the bat over, and the one
    // turn in his hands is the bottom hand rolling over through the carry. What
    // it has to turn to be back in his guard it turns on the way down from the
    // hold.
    if (this.onLoft) {
      const { wrapped, hold, carry, through, under } = ON_LOFT_CLOCK;
      const body = (pose: Pose, home: number): Pose => {
        const settled = mix(pose, GUARD, home);
        return { ...pose, hip: settled.hip, chest: settled.chest, frontFoot: settled.frontFoot, backFoot: settled.backFoot, heel: settled.heel,
          backFootYaw: settled.backFootYaw, look: settled.look };
      };
      const out = [{ time: 0, pose: this.swingFrom },
        { time: COVER_PLANT.at, pose: { ...mix(this.swingFrom, contact, COVER_PLANT.bat), frontFoot: contact.frontFoot, backFoot: contact.backFoot,
          hip: mix(this.swingFrom, contact, COVER_PLANT.hips).hip, chest: mix(this.swingFrom, contact, COVER_PLANT.chest).chest } },
        { time: STROKE_CONTACT_MS, pose: contact }, { time: 220, pose: reachPose(stroke.through!) },
        { time: 310, pose: reachPose(stroke.carry!) }, { time: wrapped, pose: finish }];
      const home = [{ time: hold, pose: finish },
        { time: carry, pose: body(reachPose(stroke.carry!), .2) },
        { time: through, pose: body(reachPose(stroke.through!), .45) },
        { time: under, pose: body(contact, .7) },
        { time: STROKE_DURATION_MS, pose: GUARD }];
      const poseAt = (at: number): Pose => at < wrapped ? shoulderDriven(out, at, STROKE_CONTACT_MS)
        : at < hold ? finish : shoulderDriven(home, at, hold - 70);
      const pose = { ...poseAt(age) };
      if (age > STROKE_CONTACT_MS) {
        const reference = batOrientation(STROKES.LONG_ON.contact), up = UP.clone().applyQuaternion(batOrientation(poseAt(STROKE_CONTACT_MS)));
        const met = new THREE.Quaternion().setFromUnitVectors(UP.clone().applyQuaternion(reference), up).multiply(reference);
        // The face away from the front shoulder by the wrap, the back of the
        // blade against it, as a lofted follow-through finishes.
        pose.bat = this.riding(STROKE_CONTACT_MS, poseAt, met, [hold, under], age, {
          window: [ON_LOFT_CLOCK.rolls, wrapped],
          away: (wrap, up) => V(wrap.grip).addScaledVector(up, -.45).sub(shoulderOf(wrap, 0)),
        });
      }
      this.apply(pose);
      return;
    }
    // The flick, version two: the front foot down first, the ball met beside
    // the front pad, the bat out low after it to midwicket as the wrists roll,
    // up in front of him and stopped there, held, and home. See `FLICK_V2`.
    if (this.flickV2) {
      const { plant, through, up, hold, rising, down } = FLICK_CLOCK, keys = FLICK_V2;
      const out = [{ time: 0, pose: this.swingFrom },
        { time: plant, pose: { ...mix(this.swingFrom, contact, COVER_PLANT.bat), frontFoot: contact.frontFoot, backFoot: contact.backFoot,
          hip: mix(this.swingFrom, contact, COVER_PLANT.hips).hip, chest: mix(this.swingFrom, contact, COVER_PLANT.chest).chest } },
        { time: STROKE_CONTACT_MS, pose: contact }, { time: through, pose: reachPose(keys.through) },
        { time: up, pose: finish }];
      // Home, as the hook goes home: up out of his stoop with the hands up
      // over the front shoulder and the bat upright over them, then the hands
      // let down in front of him into his guard, the bat tipping back over the
      // back shoulder as it goes. See `FLICK_UNWRAP`.
      const home = [{ time: hold, pose: finish }, { time: rising, pose: reachPose(FLICK_UNWRAP) },
        { time: down, pose: reachPose(FLICK_LOWERED) }, { time: STROKE_DURATION_MS, pose: GUARD }];
      const poseAt = (at: number): Pose => at < up ? shoulderDriven(out, at, STROKE_CONTACT_MS)
        : at < hold ? finish : shoulderDriven(home, at, hold - 70);
      const pose = { ...poseAt(age) };
      const straight = batOrientation(STROKES.STRAIGHT.contact);
      const start = new THREE.Quaternion().setFromUnitVectors(UP.clone().applyQuaternion(straight), UP.clone().applyQuaternion(batOrientation(this.swingFrom))).multiply(straight);
      // Square to the bowler on the way down; then the roll, the bottom hand
      // over the top, closing the face onto the leg side and down as the bat
      // goes out after the ball, carried on the same way as it comes up until
      // the flat face looks at the bowler. Nothing turns it after that until he goes home.
      pose.bat = this.riding(0, poseAt, start, [hold, STROKE_DURATION_MS], age, [
        { window: [plant, STROKE_CONTACT_MS], away: () => V(keys.contact.batFace) },
        { window: [STROKE_CONTACT_MS, through], away: () => V(keys.through.batFace) },
        { window: [through, up], away: () => new THREE.Vector3(0, 0, 1) },
      ]);
      this.apply(pose);
      return;
    }
    // The flick off the back foot, version three: back and across, the ball
    // met late in front of the front pad, the bat lifted straight up after it,
    // tipped across the front of his helmet and on up to the diagonal, held,
    // and home. The face is kept to the bowler throughout. See `FLICK_V3`.
    if (this.flickV3) {
      const { load, lift, across, finish: up, hold } = FLICK_V3_CLOCK, keys = FLICK_V3;
      const out = [{ time: 0, pose: this.swingFrom }, { time: load, pose: reachPose(keys.load) },
        { time: FLICK_V3_CONTACT_MS, pose: contact }, { time: lift, pose: reachPose(keys.lift) },
        { time: across, pose: reachPose(keys.across) }, { time: up, pose: finish }];
      const home = [{ time: hold, pose: finish }, { time: STROKE_DURATION_MS, pose: GUARD }];
      const poseAt = (at: number): Pose => at < up ? shoulderDriven(out, at, FLICK_V3_CONTACT_MS)
        : at < hold ? finish : flowing(home, at);
      const pose = { ...poseAt(age) };
      const straight = batOrientation(STROKES.STRAIGHT.contact);
      const start = new THREE.Quaternion().setFromUnitVectors(UP.clone().applyQuaternion(straight), UP.clone().applyQuaternion(batOrientation(this.swingFrom))).multiply(straight);
      const bowler = () => new THREE.Vector3(0, 0, 1), squareLeg = () => new THREE.Vector3(-1, 0, 0);
      // The face turned to square leg by the wrists on the way down, to send
      // the ball square; back to the bowler as the hands lift it. The contact
      // key's own face is left to the bowler, since the keys' faces still
      // shape the way down: given square leg's, the blade came down through
      // the back shoulder and the hip.
      pose.bat = this.riding(0, poseAt, start, [hold, STROKE_DURATION_MS], age, [
        { window: [load, FLICK_V3_CONTACT_MS], away: squareLeg }, { window: [FLICK_V3_CONTACT_MS, lift], away: bowler },
        { window: [lift, across], away: bowler }, { window: [across, up], away: bowler },
      ]);
      this.apply(pose);
      return;
    }
    // The straight drive's six, version two: the front foot down first on a
    // long stride, the ball met under his eyes, out after it up the line and
    // held there, arms long and high, and home down the line into his guard.
    // From the ball on the face rides the handle (`riding`).
    if (this.straightLoftV2) {
      const { plant, through, finish: ended, hold, down, under } = LOFT_V2_CLOCK;
      const body = (pose: Pose, home: number): Pose => {
        const settled = mix(pose, GUARD, home);
        return { ...pose, hip: settled.hip, chest: settled.chest, frontFoot: settled.frontFoot, backFoot: settled.backFoot, heel: settled.heel,
          backFootYaw: settled.backFootYaw, look: settled.look };
      };
      const out = [{ time: 0, pose: this.swingFrom },
        { time: plant, pose: { ...mix(this.swingFrom, contact, COVER_PLANT.bat), frontFoot: contact.frontFoot, backFoot: contact.backFoot,
          hip: mix(this.swingFrom, contact, COVER_PLANT.hips).hip, chest: mix(this.swingFrom, contact, COVER_PLANT.chest).chest } },
        { time: STROKE_CONTACT_MS, pose: contact }, { time: through, pose: reachPose(stroke.through!) }, { time: ended, pose: finish }];
      const home = [{ time: hold, pose: finish },
        { time: down, pose: body(mix(finish, reachPose(stroke.through!), .6), .4) },
        { time: under, pose: body(mix(contact, GUARD, .4), .7) },
        { time: STROKE_DURATION_MS, pose: GUARD }];
      const poseAt = (at: number): Pose => at < ended ? shoulderDriven(out, at, STROKE_CONTACT_MS)
        : at < hold ? finish : shoulderDriven(home, at, hold - 70);
      const pose = { ...poseAt(age) };
      if (age > STROKE_CONTACT_MS) {
        const reference = batOrientation(STROKES.STRAIGHT.contact), up = UP.clone().applyQuaternion(batOrientation(poseAt(STROKE_CONTACT_MS)));
        const met = new THREE.Quaternion().setFromUnitVectors(UP.clone().applyQuaternion(reference), up).multiply(reference);
        pose.bat = this.riding(STROKE_CONTACT_MS, poseAt, met, [hold, under], age);
      }
      this.apply(pose);
      return;
    }
    // The on drive runs the drives' clock, lofted or along the ground: it is
    // a drive.
    if (this.shot === 'STRAIGHT' || this.shot === 'COVER_LONG_OFF' || this.shot === 'LONG_ON') {
      const cover = this.rebuiltDrive;
      const hold = this.lofted ? 620 : cover ? COVER_PLANT.hold : 570;
      if (age < 410) {
        const keys = [{ time: 0, pose: this.swingFrom }, { time: STROKE_CONTACT_MS, pose: contact },
          { time: 220, pose: reachPose(stroke.through!) }];
        // The cover drive's front foot is down, and his weight going onto it,
        // while the bat is still on its way down: the bat keeps the path it
        // has, and only the legs and hips get there first.
        // Version three's bat has further to come, to a ball further on, so it is
        // further down its arc by then and the elbows do not have to hurry.
        if (cover) keys.splice(1, 0, { time: COVER_PLANT.at, pose: { ...mix(this.swingFrom, contact, this.coverV2 && this.coverVersion === 3 ? COVER_PLANT.batV3 : COVER_PLANT.bat),
          frontFoot: contact.frontFoot, backFoot: contact.backFoot,
          hip: mix(this.swingFrom, contact, COVER_PLANT.hips).hip, chest: mix(this.swingFrom, contact, COVER_PLANT.chest).chest } });
        if (stroke.carry) keys.push({ time: 310, pose: reachPose(stroke.carry) });
        keys.push({ time: 410, pose: finish });
        this.apply(shoulderDriven(keys,age,STROKE_CONTACT_MS));
      } else if (age < hold) this.apply(finish);
      else if (cover) {
        // Home the way it came: back down through the carry and the
        // extension, under him through where he met the ball, and up into the
        // pick-up behind, the bat never turning in his hands. Taken over the
        // top instead, down in front of the face, it turned over twice on the
        // way. The feet and hips come back under him as it goes.
        const back = (pose: Pose, home: number): Pose => {
          const body = mix(pose, GUARD, home);
          return { ...pose, hip: body.hip, chest: body.chest, frontFoot: body.frontFoot, backFoot: body.backFoot, heel: body.heel,
            backFootYaw: body.backFootYaw, look: body.look };
        };
        // The on drive's carry is the straight drive's, the blade up in front
        // of him rather than hanging, and passed through on the way down it
        // laid the handle along the back forearm: from the high finish it goes
        // straight down into the extension.
        const keys = [{ time: hold, pose: finish },
          ...(this.onDrive ? [] : [{ time: COVER_HOME.carry, pose: back(reachPose(stroke.carry!), .2) }]),
          { time: COVER_HOME.through, pose: back(reachPose(stroke.through!), .45) },
          { time: COVER_HOME.under, pose: back(contact, .7) },
          { time: STROKE_DURATION_MS, pose: GUARD }];
        const pose = shoulderDriven(keys, age, hold - 70);
        pose.bat = this.riding(hold, at => shoulderDriven(keys, at, hold - 70), batOrientation(finish), [hold, COVER_HOME.through], age);
        this.apply(pose);
      } else if (age < 800) {
        // Down off the high finish. The on drive's comes down out in front of
        // the face, toe up and forward, because from above the helmet the knob
        // points down at him and the short way to the pick-up is through the
        // grille.
        const out=reachPose(this.shot==='LONG_ON'
          ? { ...stroke.finish, grip: [.02,1.42,.74], batUp: [-.15,-.55,-.82], batFace: [.90,-.30,.30], armHinge:.4, armDrive:.5, shoulderLift:.04 }
          : { ...stroke.finish, grip: this.shot==='STRAIGHT'?[.46,1.40,.66]:[.58,1.38,.68], batUp: [-1,0,0], batFace: [0,0,1],armHinge:.2,armDrive:1,shoulderLift:.04 });
        const clear=hold+(this.shot==='COVER_LONG_OFF'?110:90);
        this.apply(age<clear?mix(finish,out,(age-hold)/(clear-hold)):mix(out,reachPose(stroke.recover!),(age-clear)/(800-clear), leave));
      } else this.apply(mix(reachPose(stroke.recover!),GUARD,(age-800)/(STROKE_DURATION_MS-800), arrive));
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
      if (age < through) this.apply(mix(finish, recover, (age - 570) / (through - 570), leave));
      else this.apply(mix(recover, GUARD, (age - through) / (STROKE_DURATION_MS - through), arrive));
    }
    else this.apply(mix(finish, GUARD, (age - 570) / (STROKE_DURATION_MS - 570)));
  }
  /** The fall, stage by stage, and then he stays where he lands. */
  private applyFall(age: number) {
    const { recoil, stagger, knelt } = this.fallKeys ??= fallPoses(this.felledBy);
    if (age <= FALL.recoil) return this.apply(mix(this.felledFrom, recoil, age / FALL.recoil));
    if (age <= FALL.buckle) return this.apply(mix(recoil, stagger, (age - FALL.recoil) / (FALL.buckle - FALL.recoil)));
    // The last stretch is the slowest: the knees have already gone, and what
    // is left is a man going down onto them rather than dropping.
    if (age <= FALL.settled) return this.apply(mix(stagger, knelt, (age - FALL.buckle) / (FALL.settled - FALL.buckle)));
    // Down there, breathing hard.
    const heave = Math.sin((age - FALL.settled) * Math.PI * 2 / 1400) * .008;
    this.apply({ ...knelt, chest: [knelt.chest[0], knelt.chest[1] + heave, knelt.chest[2]] });
  }

  private applyCelebration(age: number) {
    const { keys, back, down, settle, total } = ROUTINES[this.celebration];
    const last = keys[keys.length - 1];
    if (age < last.time) return this.apply(flowing([{ time: 0, pose: this.celebratedFrom }, ...keys], age));
    // Down the way it came up: out to his right, where the left hand takes the
    // handle again, and only then in front of him. Straight from beside his
    // head to in front of his chest, the handle went through him.
    this.apply(age < back ? mix(last.pose, RETURNING, (age - last.time) / (back - last.time))
      : age < down ? mix(RETURNING, LOWERED, (age - back) / (down - back))
      : age < settle ? mix(LOWERED, SETTLING, (age - down) / (settle - down))
      : mix(SETTLING, GUARD, (age - settle) / (total - settle)));
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
    if (pose.look) this.head.rotateX(pose.look);
    this.bat.position.set(...pose.grip);
    // Hands clear of the helmet. The cover drive's high finish carried the
    // fists back round the head close enough for the forearms to pass through
    // the helmet's side; held for the photograph it showed. Through its
    // follow-through, long after the ball, the grip is eased straight out from
    // the helmet wherever it comes within `HANDS_CLEAR`, by no more than it is
    // short. Not at the contact, which has to meet the ball where it is, and
    // not the other strokes, whose finishes keep their distance already.
    //
    // The on-drive's is the same, for the end of the handle: its finish held
    // the knob against the bottom of the grille, under his chin, so through
    // either drive's follow-through the bat is eased out from there too.
    if ((this.shot === 'COVER_LONG_OFF' || this.shot === 'LONG_ON' || this.straightLoftV2) && !this.charging && !this.punching && Number.isFinite(this.poseAge)) {
      const clearing = THREE.MathUtils.smoothstep(this.poseAge, 260, 340) * (1 - THREE.MathUtils.smoothstep(this.poseAge, 760, STROKE_DURATION_MS));
      if (clearing > 0) {
        const helmet = this.head.position.clone().add(HELMET_CENTRE);
        const fromHelmet = this.bat.position.clone().sub(helmet), near = fromHelmet.length();
        if ((this.shot === 'COVER_LONG_OFF' || this.onDrive || this.onLoft || this.straightLoftV2) && near < HANDS_CLEAR && near > 1e-6) this.bat.position.addScaledVector(fromHelmet, clearing * (HANDS_CLEAR - near) / near);
        const chin = CHIN_GUARD.clone().applyEuler(this.head.rotation).add(this.head.position);
        const fromChin = this.bat.position.clone().addScaledVector(UP.clone().applyQuaternion(batOrientation(pose)), KNOB).sub(chin), short = KNOB_CLEAR - fromChin.length();
        if (short > 0 && short < KNOB_CLEAR) this.bat.position.addScaledVector(fromChin.normalize(), clearing * short);
      }
    }
    this.bat.quaternion.copy(batOrientation(pose));
    // Keep the approved blade axis/path, but orient its flat face in the
    // stroke plane. The former guard opened the face skyward and then rolled
    // it around the handle on the way down. A drive needs no such axial roll.
    const driveShot=this.charging || this.squaring || this.lofted || this.shot==='STRAIGHT' || (this.shot==='COVER_LONG_OFF' && !this.punching) || this.shot==='LONG_ON';
    const idle=!Number.isFinite(this.poseAge) || this.poseAge >= STROKE_DURATION_MS;
    if (!this.felled) {
      const up=UP.clone().applyQuaternion(this.bat.quaternion);
      const impact=this.charging?CHARGE_CONTACT_MS:this.squaring?SQUARE_DRIVE_CONTACT_MS:this.shot==='SCOOP'?SCOOP_CONTACT_MS:this.shot==='REVERSE_SCOOP'?REVERSE_CONTACT_MS:STROKE_CONTACT_MS;
      const reference=this.squaring?SQUARE_DRIVE.contact:this.shot==='COVER_LONG_OFF'?(!this.coverV2||this.charging?COVER_DRIVE_V1.contact:this.coverVersion===3?COVER_DRIVE_V3.contact:STROKES.COVER_LONG_OFF.contact)
        :this.charging&&this.shot==='LONG_ON'?ON_CHARGE_CONTACT:this.shot==='LONG_ON'?STROKES.LONG_ON.contact:STROKES.STRAIGHT.contact;
      const referenceQ=batOrientation(STROKES.STRAIGHT.contact).clone().slerp(batOrientation(reference),idle?0:ease(THREE.MathUtils.clamp(this.poseAge/impact,0,1)));
      const referenceUp=UP.clone().applyQuaternion(referenceQ);
      const transported=new THREE.Quaternion().setFromUnitVectors(referenceUp,up).multiply(referenceQ);
      if(idle || (driveShot && this.poseAge<=impact)) {
        this.bat.quaternion.copy(transported);
        // Turned about the handle to the pose's own face, as far as it asks.
        if(idle && pose.ownFace) this.bat.quaternion.slerp(batOrientation(pose),pose.ownFace);
      }
      else if((this.rebuiltDrive && (this.charging || this.poseAge>=COVER_PLANT.hold)) || (this.charging && (this.shot === 'COVER_LONG_OFF' || this.shot === 'STRAIGHT')) || this.onLoft || this.wristFlick || this.turning || this.pulling || this.shot === 'DEFEND' || this.punching || this.spinCutting || this.spinPulling || this.shot === 'LATE_CUT' || this.shot === 'REVERSE_SCOOP' || (this.sweeping && !this.levelled) || this.paceCut) {
        // The cover drive's way home, and the charge over cover from the ball
        // on, already hold their face (`riding`):
        // the roll the other strokes take into the guard is up to a full turn,
        // and it spun the blade about the handle as it came up into the pick-up.
      }
      else {
        // Return the same corrected guard without snapping the other strokes.
        const duration=STROKE_DURATION_MS;
        const returnSpan=260;
        // The scoop rides its face home (`riding`) and takes no roll here on the
        // way back: this one turned the blade in his hands in its last quarter
        // second.
        const returnWeight=this.shot==='SCOOP'?0:ease(THREE.MathUtils.clamp((this.poseAge-(duration-returnSpan))/returnSpan,0,1));
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
    // The twirl: the blade turned about its handle, last, so nothing above
    // takes it back out.
    if (pose.spin) this.bat.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(UP, pose.spin));
    this.root.updateMatrixWorld(true);
    /**
     * Keep the bat inside the arms that are holding it.
     *
     * Both fists are fixed to the handle and the arms solve back from there, so
     * a grip further from a shoulder than that arm is long does not stretch —
     * it detaches, and the limb is drawn past its own length. Authored keys can
     * be checked for this one at a time; the curve between two of them cannot,
     * because the interpolation overshoots, and a stroke whose hands travel as
     * far as a square drive's overshoots between every pair.
     *
     * So the reach is answered where it arises rather than by tuning each key
     * until the curve happens to fit: draw the bat back towards the shoulder it
     * has run away from, by exactly the distance it is out by. It costs nothing
     * while the arms can reach, which is almost always and includes every
     * contact, so the blade still meets the ball where the stroke says it does.
     */
    const shoulders = [0, 1].map(i => new THREE.Vector3(i === 0 ? -.163 : .163, .075+(pose.shoulderLift??0), 0)
      .applyQuaternion(this.torso.quaternion).add(chest));
    // Both gloves back on the handle every frame; only a hand that has let go
    // is moved off it, below, and only for as long as it is let go.
    this.arms.forEach((arm, i) => arm.glove.position.set(0, i === 0 ? HAND.top : HAND.bottom, 0));
    for (let pass = 0; pass < 5; pass++) for (let i = 0; i < 2; i++) {
      // A hand mostly off the bat has no say in where the bat can go.
      if (i === FREE_HAND && (pose.release ?? 0) > .5) continue;
      // Measured at the wrist the solver is about to place, which is neither
      // the bat's origin nor the fist: it sits beside the handle, and how far
      // beside depends on where the arm is coming from.
      const axis = UP.clone().applyQuaternion(this.bat.quaternion);
      const anchor = this.arms[i].glove.position.clone().applyQuaternion(this.bat.quaternion).add(this.bat.position);
      const socket = wristSocket(i);
      const radial = shoulders[i].clone().sub(anchor);
      radial.addScaledVector(axis, -radial.dot(axis));
      if (radial.lengthSq() < 1e-9) continue;
      const wrist = anchor.clone().addScaledVector(radial.normalize(), -socket.z).addScaledVector(axis, socket.y);
      const out = wrist.sub(shoulders[i]);
      const excess = out.length() - .652;
      if (excess > 0) this.bat.position.addScaledVector(out.normalize(), -excess);
    }
    this.root.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) {
      const arm = this.arms[i];
      arm.shoulder.copy(shoulders[i]);
      const grip = arm.glove.position.clone().applyQuaternion(this.bat.quaternion).add(this.bat.position);
      const axis = UP.clone().applyQuaternion(this.bat.quaternion);
      // Solve the wrist beside the handle while keeping both Vs registered
      // to the bat. The palm bridge below accommodates wrist articulation.
      /**
       * Which way round the handle the wrist sits, and how far to believe it:
       * the arm's own bearing on the bat, with the part along the handle taken
       * out.
       *
       * That subtraction has a hole in it. When the arm arrives along the
       * handle — which a flat sweep does, because the bat is horizontal and the
       * arms are stretched out down the same line, and which the back arm does
       * on a pull at head height — what is left is a centimetre or two, and
       * normalising that gives a direction that swings round through nothing.
       *
       * The fix is not to substitute a direction for it. This used to fade into
       * a fixed across-the-body bearing, and a fixed bearing has to be given a
       * side: the side came from the sign of a dot product, that dot product
       * crossed zero at 244ms into the pull, and the wrist moved 15cm in one
       * frame with the elbow behind it. Picking a side more carefully would not
       * have helped, because there is no side to pick — a shoulder sitting on
       * the handle's own line genuinely has no bearing off it.
       *
       * So fade the OFFSET instead, and keep the honest direction all the way
       * down. A wrist that cannot say which way round the handle it sits ends
       * up on the handle, which is where the geometry was heading anyway, and
       * nothing has to choose anything.
       */
      const steady = (from: THREE.Vector3) => {
        from.addScaledVector(axis, -from.dot(axis));
        const perp = from.length();
        return perp > 1e-9
          ? from.multiplyScalar(THREE.MathUtils.smoothstep(perp, .02, .09) / perp)
          : from.set(0, 0, 0);
      };
      const radial = steady(arm.shoulder.clone().sub(grip));
      const socket=wristSocket(i);
      const hand = grip.clone().addScaledVector(radial,-socket.z).addScaledVector(axis,socket.y);
      arm.wrist.copy(hand);
      // Turned back against the bat's own spin, so the hand holds still in a twirl.
      arm.glove.rotation.set(0,-(pose.spin ?? 0),0);
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
          this.crossBat ? bladeDistance / .17 : Infinity);
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
      for (let step = 1; step <= (this.crossBat ? 12 : 6) && room(elbow) < 1; step++)
        for (const side of [1, -1]) {
          const turned = bend(hint.clone().applyAxisAngle(along, side * step * .26));
          if (room(turned) > room(elbow)) elbow = turned;
        }
      }
      {
        const outward = arm.shoulder.clone().sub(chest).normalize();
        const forward = new THREE.Vector3(0,0,1).applyQuaternion(this.torso.quaternion);
        const drive = THREE.MathUtils.clamp(pose.armDrive??0,0,1);
        const pole = arm.shoulder.clone().addScaledVector(outward,.24)
          .addScaledVector(spine,-.30).addScaledVector(forward,.18);
        {
        // A continuous anatomical pole, not a per-frame clearance winner.
        // Choosing among discrete bend planes caused the visible elbow flips.
        //
        // The pole names a plane, not a place: all `solveJoint` reads off it is
        // the direction from the shoulder square to the arm. Every hint below
        // therefore names a *direction* to bend in, and each one turns the
        // running direction about the arm rather than dragging a point towards
        // its own.
        //
        // That distinction is the whole of the elbow tearing. A weighted mix of
        // two pole *points* travels the straight line between them, and when
        // those two poles sit on opposite sides of the arm that line runs
        // through the arm itself: the bend plane passes through undefined and
        // comes out reversed, and the elbow crosses a third of a metre between
        // two frames. Nothing upstream is discontinuous — the head guard that
        // exposed it ramps from 0.003 to 0.9 over five frames — so no amount of
        // smoothing the weights could have helped. Turning about the arm takes
        // the same two ends round the short way instead, always square to the
        // arm, and there is no crossing to fall into.
        const armAxis = hand.clone().sub(arm.shoulder);
        if (armAxis.lengthSq() > 1e-9) armAxis.normalize(); else armAxis.copy(outward);
        // The plane the arm can always bend in, whatever it is doing: square to
        // the arm because it is crossed out of it, and square to the spine, so
        // it runs round the body the way the hands do. It only runs out for an
        // arm lying along the spine — hanging straight down — where the
        // torso's own forward bearing stands in.
        const steadyBend = () => {
          const round = new THREE.Vector3().crossVectors(armAxis, spine);
          const width = round.length();
          const flat = new THREE.Vector3().crossVectors(armAxis, forward);
          if (flat.lengthSq() < 1e-9) flat.crossVectors(armAxis, new THREE.Vector3(1,0,0));
          flat.normalize();
          if (width > 1e-9) round.divideScalar(width); else round.copy(flat);
          if (round.dot(flat) < 0) flat.negate();
          const trust = THREE.MathUtils.smoothstep(width, .05, .30);
          round.multiplyScalar(trust).addScaledVector(flat, 1 - trust);
          if (round.lengthSq() < 1e-9) round.copy(flat); else round.normalize();
          // Deliberately NOT turned to face outwards here. Testing the sign
          // against the shoulder's own bearing looks harmless and is the last
          // threshold switch in the chain: as the arm swings across, that dot
          // product passes through zero, and at 210ms into the sweep it did —
          // flipping the plane, and the elbow with it, 10cm inside one frame.
          // A cross product is already continuous. Whoever needs a side can
          // turn towards one; nobody needs to snap this.
          return round;
        };
        const base = steadyBend();
        /** Turn one bend direction towards another, about the arm. */
        const turn = (from: THREE.Vector3, to: THREE.Vector3, weight: number) => {
          const w = THREE.MathUtils.clamp(weight, 0, 1);
          if (w <= 0) return from;
          const angle = Math.acos(THREE.MathUtils.clamp(from.dot(to), -1, 1));
          if (angle < 1e-6) return from.copy(to);
          if (w >= 1) return from.copy(to);
          const way = Math.sign(new THREE.Vector3().crossVectors(from, to).dot(armAxis)) || 1;
          return from.applyAxisAngle(armAxis, way * angle * w).normalize();
        };
        /**
         * The part of a hint that is square to the arm, as a direction. A hint
         * the arm has swung almost parallel to names no plane worth having, so
         * fade back to the plane the arm can always bend in rather than let
         * what is left of it — mostly rounding error — set the elbow.
         */
        const bendTowards = (hint: THREE.Vector3) => {
          hint.addScaledVector(armAxis, -hint.dot(armAxis));
          const size = hint.length();
          if (size < 1e-9) return base.clone();
          hint.divideScalar(size);
          return turn(base.clone(), hint, THREE.MathUtils.smoothstep(size, .04, .18));
        };
        const anatomical = outward.clone().multiplyScalar(.24)
          .addScaledVector(spine,-.30).addScaledVector(forward,.18);
        // The drives ride the front elbow up on `leadElbow`, and so does the
        // scoop: its wrists roll the bat back under a high front elbow, and
        // with the elbow hanging the blade swept through the forearm. So does
        // the late cut, whose hands come down to his hip with the bat behind
        // them: hanging, the front elbow closed onto the back one. And so does
        // the block, whose top hand leads with its elbow up in both clips. And
        // the flick's version two, whose top elbow rides up over the hands and
        // leads towards the bowler from the ball to the finish.
        if (!this.pulling && i===0 && (this.charging||this.squaring||this.lofted||this.shot==='STRAIGHT'||this.shot==='COVER_LONG_OFF'||this.shot==='SCOOP'||this.shot==='LATE_CUT'||this.shot==='DEFEND'||this.wristFlick))
          anatomical.addScaledVector(spine,Math.max(0,pose.leadElbow)*1.1);
        const bend = bendTowards(anatomical);
        if (drive>0 && i===0) {
          const hinge=pose.armHinge??-.6;
          const impact=this.charging?CHARGE_CONTACT_MS:this.squaring?SQUARE_DRIVE_CONTACT_MS:STROKE_CONTACT_MS;
          const opening=.10+.65*(1-ease(THREE.MathUtils.clamp((this.poseAge-impact)/100,0,1)));
          const aim=new THREE.Vector3(opening,Math.sin(hinge),Math.cos(hinge)).normalize();
          turn(bend, bendTowards(aim), drive);
        }
        // After the drive aim, and that ordering is not incidental. The drive
        // aim is stated in world axes and taken outright on the front arm, so
        // ahead of it the sweep's plane is simply discarded for that arm — and
        // the aim, which knows about driving through the line and nothing about
        // swinging from the knees, walked the front elbow into the helmet
        // through the follow-through: 7.5cm of clearance at the carry, left for
        // the head guard to rescue in four frames. Taking the sweep's plane
        // last leaves 16cm and the guard almost nothing to do.
        if (this.sweeping) {
          /**
           * The sweep's own plane. `round` runs the way the hands are going and
           * `lift` is the spine's own component square to the arm, so a hint
           * mixed from the two is square to the arm by construction however far
           * he swings through it. Elbows down and behind the swing, which is
           * where they are in the reference: he drops on the back knee and the
           * arms hinge under the ball rather than round the top of it.
           */
          // The two elbows splay, they do not point the same way: one arm wraps
          // round the front of the chest and the other round the back of it, so
          // the sideways lean is taken in opposite directions. Its sign comes
          // from which arm this is, which cannot change mid-stroke — not from a
          // dot product against the body, which can and did.
          // Wide, both of them. A sweep is hit with the elbows out and apart —
          // pinch them in and the two forearms bunch onto one line and he reads
          // as paddling a raft, not swinging a bat. They used to fold under the
          // old slog's wrap as the bat came over the shoulder; the rebuilt one
          // swings round to the leg side and turns his chest after it, which
          // takes the elbows clear without folding them.
          const lift = new THREE.Vector3().crossVectors(base, armAxis).normalize();
          const round = base.clone().multiplyScalar(i === 0 ? 1 : -1)
            .addScaledVector(lift, .10).normalize();
          // Eased in and out, because switching a bend plane on at the instant
          // of input moves the elbow without moving anything that holds it: the
          // pose at 0ms is still the guard, and the plane alone shifted the
          // elbow 18cm inside one frame. He leans into the shot's own plane
          // over the backlift and lets it go again on the way back to guard.
          // Taken outright, not mixed in at some fraction. The sweep's plane and
          // the anatomical one are very nearly opposite through the middle of
          // the shot — he is swinging the elbow round to the far side of the arm
          // — and a part-way turn between two opposite directions has no
          // well-defined way round: the shorter way swaps at the crossing and
          // the elbow lurches. A full turn lands on the target whichever way it
          // goes, so there is nothing left to swap.
          turn(bend, round.normalize(),
            ease(THREE.MathUtils.clamp(this.poseAge/130,0,1))
               * ease(THREE.MathUtils.clamp((STROKE_DURATION_MS-this.poseAge)/200,0,1)));
        }
        if (this.cutting) {
          // Preserve the square cut's raised clearance plane, easing into it
          // from the shared guard instead of changing solvers at shot input.
          const weight = ease(THREE.MathUtils.clamp(this.poseAge/60,0,1))
            * ease(THREE.MathUtils.clamp((STROKE_DURATION_MS-this.poseAge)/150,0,1));
          turn(bend, bendTowards(elbow.clone().sub(arm.shoulder)), weight);
        }
        pole.copy(arm.shoulder).addScaledVector(bend, .60);
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
        {
          const reach=(from: THREE.Vector3, to: THREE.Vector3) => {
            const line=to.clone().sub(from), span=line.lengthSq();
            const at=span>1e-9 ? THREE.MathUtils.clamp(this.head.position.clone().sub(from).dot(line)/span,0,1) : 0;
            return this.head.position.distanceTo(from.clone().addScaledVector(line,at));
          };
          const first=solveJoint(arm.shoulder,hand,.32,.34,pole);
          const clearance=Math.min(reach(arm.shoulder,first),reach(first,hand));
          // Wide, and deliberately so. A narrow band is a guard that does nothing
            // until the head is nearly hit and then does all of it at once: at the
            // sweep's finish the clearance falls from 0.25m to 0.06m in six frames,
            // so a band of 0.15-0.25 asked for a hundred and thirty degrees of plane
            // inside four of them, and the elbow travelled a third of a metre. Start
            // leaning while there is still room to lean gently — it costs nothing
            // where there was never any danger, because the lean is proportional.
            const nearness=.75*(1-THREE.MathUtils.smoothstep(clearance,.15,.25));
          if (nearness>0) {
            // Away from the head, carrying the shoulder's own outward bearing
            // so that clearing the helmet never means bending into the chest.
            // Straight away from the head, and only lightly outward. Leaning
            // hard on the shoulder's outward bearing works while the arm is on
            // its own side of the body, but on a finish that carries the hands
            // across to the far shoulder that term dominates and, once the
            // along-arm part is removed, resolves UPWARD — which lifted the
            // trailing elbow over the helmet instead of tucking it under.
            const away=arm.shoulder.clone().sub(this.head.position).normalize()
              .addScaledVector(outward,.55);
            pole.copy(arm.shoulder).addScaledVector(turn(bend, bendTowards(away), nearness), .60);
          }
        }
        }
        for (let iteration=0;iteration<6;iteration++) {
          elbow=solveJoint(arm.shoulder,hand,.32,.34,pole);
          steady(radial.copy(elbow).sub(grip));
          socket.y=wristSocket(i).y*THREE.MathUtils.smoothstep(elbow.clone().sub(grip).dot(axis),-.08,.20);
          hand.copy(grip).addScaledVector(radial,-socket.z).addScaledVector(axis,socket.y);
        }
        elbow = solveJoint(arm.shoulder, hand, .32, .34, pole);
        arm.wrist.copy(hand);
        arm.socket.copy(hand).sub(grip).applyQuaternion(this.bat.quaternion.clone().invert());
        // A padded heel joins the closed hand to its wrist. It articulates
        // inside the glove envelope, so wrist movement cannot turn the left
        // knuckles into an open palm or flip the visible grip during a shot.
        const palm = arm.socket.clone().applyAxisAngle(UP, pose.spin ?? 0);
        this.segment(arm.palm[0],palm.clone().multiplyScalar(GLOVE_HEEL.from),palm,GLOVE_HEEL.width,GLOVE_HEEL.depth);
        this.rollToward(arm.palm[0], palm.clone().normalize(), this.knucklesOf(i));
      }
      /**
       * The free hand, punching the air.
       *
       * Solved as if still on the handle first, then taken from there to the
       * fist by `release`, with the elbow's bend taken the same way: from where
       * the handle put it to out beside the shoulder. So the hand leaves the
       * bat and comes back to it along a line rather than jumping, and at
       * nought nothing here moves anything. The glove goes with the wrist,
       * on down the forearm. It keeps the bat's own turn rather than taking
       * the forearm's: held up to the sky the bat's axis points straight back
       * down the arm, and a turn between two opposite directions has no one
       * way round, so it spun. The glove is round enough not to need one.
       */
      const release = i === FREE_HAND && pose.fist ? ease(THREE.MathUtils.clamp(pose.release ?? 0, 0, 1)) : 0;
      if (release > 0) {
        const outward = arm.shoulder.clone().sub(chest).normalize();
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.torso.quaternion);
        const fist = V(pose.fist!);
        const reach = fist.clone().sub(arm.shoulder);
        if (reach.length() > .64) fist.copy(arm.shoulder).addScaledVector(reach.normalize(), .64);
        const out = arm.shoulder.clone().addScaledVector(outward, .45).addScaledVector(forward, .12).addScaledVector(spine, -.10);
        const pole = elbow.clone().lerp(out, release);
        hand.lerp(fist, release);
        elbow = solveJoint(arm.shoulder, hand, .32, .34, pole);
        arm.wrist.copy(hand);
        const forearm = hand.clone().sub(elbow).normalize();
        const onHandle = arm.glove.position.clone().applyQuaternion(this.bat.quaternion).add(this.bat.position);
        const gloveAt = onHandle.lerp(hand.clone().addScaledVector(forearm, .06), release);
        const inverse = this.bat.quaternion.clone().invert();
        arm.glove.position.copy(gloveAt).sub(this.bat.position).applyQuaternion(inverse);
        arm.socket.copy(hand).sub(gloveAt).applyQuaternion(inverse);
        const palm = arm.socket.clone().applyAxisAngle(UP, pose.spin ?? 0);
        this.segment(arm.palm[0], palm.clone().multiplyScalar(GLOVE_HEEL.from), palm, GLOVE_HEEL.width, GLOVE_HEEL.depth);
        this.rollToward(arm.palm[0], palm.clone().normalize(), this.knucklesOf(i));
      }
      this.segment(arm.upper, arm.shoulder, elbow, .14, .145);
      this.segment(arm.lower, elbow, hand, .095);
      arm.elbow.position.copy(elbow); arm.cap.position.copy(arm.shoulder);
      this.sleeves[i].aim(arm.shoulder, elbow, hand, this.connectedJersey.reference(i, this.torso));
      // The gauntlet starts at the wrist socket, not inside the handle.
      const wrist = elbow.clone().sub(hand);
      arm.cuff.position.copy(hand);
      if (wrist.lengthSq() > .000001) {
        arm.cuff.quaternion.setFromUnitVectors(UP, wrist.normalize());
        // Turned so the back of the wrist is on the knuckles' side of the hand.
        const knuckles = this.knucklesOf(i).applyQuaternion(arm.glove.quaternion).applyQuaternion(this.bat.quaternion);
        this.rollToward(arm.cuff, wrist, knuckles);
      }
      const leg = this.legs[i];
      const hipJoint = new THREE.Vector3(i === 0 ? -.135 : .135, -.045, 0).applyQuaternion(yaw).add(hip);
      const foot = V(i === 0 ? pose.frontFoot : pose.backFoot);
      const footPitch = Math.max(i === 1 ? pose.heel * 2.4 : (pose.toe ?? 0) * 2.4, (pose.kneel ?? 0) * 1.15);
      // Lift the heel about a planted toe instead of lifting the entire shoe.
      foot.y += .225 * Math.sin(footPitch) + .07 * (Math.cos(footPitch) - 1);
      const driving = !this.pulling && !this.punching && (this.charging || this.lofted || this.shot==='STRAIGHT' || this.shot==='COVER_LONG_OFF');
      // Kneeling is a different bend entirely. The default pole throws both
      // knees out towards the off side, which is right for a man standing on
      // them and wrong for one with a shin flat on the turf: the back knee has
      // to drop straight down and forward, under the hip, or the leg folds out
      // sideways and he reads as sitting rather than kneeling.
      //
      // How much of that bend he gets is read off his hips, not off the stroke.
      // `kneeling` stays true from the swipe until the next ball resets it, so
      // taken as a switch it bent a standing man's knees the kneeling way: the
      // back leg twisted as he got up, held twisted through the whole wait in
      // his guard, and then flipped straight in one frame when the next ball
      // came. Down on the knee the hips are below .62 and the bend is all
      // kneeling; by .84, still well short of the guard's .94, it is all
      // standing, so the last push up to his full height moves nothing but
      // the height. Going down it is taken whole from the swipe, as it always
      // was: the drop to the knee is the stroke, and it is only the way back
      // up that was wrong.
      const goingDown = this.poseAge <= this.contactTime - this.swingStart;
      const kneel = !this.kneeling ? 0
        : goingDown ? 1 : ease(THREE.MathUtils.clamp((.84 - pose.hip[1]) / (.84 - .62), 0, 1));
      const kneePole = new THREE.Vector3(.65, -.15, .02)
        .lerp(new THREE.Vector3(i === 0 ? .10 : .06, i === 0 ? .95 : -.85, i === 0 ? .30 : .42), kneel);
      if (driving && !this.felled && Number.isFinite(this.poseAge)) {
        const weight=ease(THREE.MathUtils.clamp(this.poseAge/80,0,1))*ease(THREE.MathUtils.clamp((STROKE_DURATION_MS-this.poseAge)/160,0,1));
        kneePole.lerp(new THREE.Vector3(i===0 ? .04 : .35,-.15,.65),weight);
      }
      // Down on the late cut the front knee goes forward over its foot, towards
      // the bowler, and the back one down towards the turf on the off side.
      // Thrown out to off as a standing knee is, the front one rose to his hips
      // out where the bat comes down.
      if (this.shot === 'LATE_CUT' && !this.felled && Number.isFinite(this.poseAge)) {
        const weight = ease(THREE.MathUtils.clamp(this.poseAge / 120, 0, 1)) * ease(THREE.MathUtils.clamp((STROKE_DURATION_MS - this.poseAge) / 200, 0, 1));
        // The front one is turned out to leg until the ball is hit, clear of
        // the bat laid flat beside it, and comes round over the toe for the hold.
        const round = ease(THREE.MathUtils.clamp((this.poseAge - SCOOP_CONTACT_MS) / (SCOOP_CLOCK.carry - SCOOP_CONTACT_MS), 0, 1));
        kneePole.lerp(i === 0 ? new THREE.Vector3(-.55, -.10, .35).lerp(new THREE.Vector3(-.25, -.10, .65), round) : new THREE.Vector3(.25, -.10, .65), weight);
      }
      // Squared up for the scoop the knees bend forward over the toes, each a
      // little out to its own side. Left bending out to off as a side-on
      // stance's do, the off-side knee bent along its own thigh and folded it.
      if (this.shot === 'SCOOP' && !this.felled && Number.isFinite(this.poseAge)) {
        const weight = ease(THREE.MathUtils.clamp(this.poseAge / SCOOP_CLOCK.set, 0, 1))
          * ease(THREE.MathUtils.clamp((STROKE_DURATION_MS - this.poseAge) / (STROKE_DURATION_MS - SCOOP_CLOCK.hold), 0, 1));
        // The front one is turned out to leg until the ball is hit, clear of
        // the bat laid flat beside it, and comes round over the toe for the hold.
        const round = ease(THREE.MathUtils.clamp((this.poseAge - SCOOP_CONTACT_MS) / (SCOOP_CLOCK.carry - SCOOP_CONTACT_MS), 0, 1));
        kneePole.lerp(i === 0 ? new THREE.Vector3(-.55, -.10, .35).lerp(new THREE.Vector3(-.25, -.10, .65), round) : new THREE.Vector3(.25, -.10, .65), weight);
      }
      // The hook turns him right round on his feet, and a knee bent out to off
      // whichever way he faces folds backwards once he faces leg: bent the way
      // he faces, from the guard's own bend.
      // The pull off the spinner turns him to the leg side on his back foot, and the same holds.
      if ((this.turning || this.spinPulling) && Number.isFinite(this.poseAge) && this.poseAge < STROKE_DURATION_MS) kneePole.applyAxisAngle(UP, pose.yaw - GUARD.yaw);
      // On both knees: forward of him and down to the turf.
      if (pose.kneel) kneePole.lerp(new THREE.Vector3(Math.sin(pose.yaw) * .55, -.35, Math.cos(pose.yaw) * .55), pose.kneel);
      const knee = solveJoint(hipJoint, foot, .43, .44, hipJoint.clone().add(kneePole));
      this.segment(leg.thigh, hipJoint, knee, .175, .19);
      this.segment(leg.shin, knee, foot, .145, .16);
      leg.knee.position.copy(knee); leg.cap.position.copy(hipJoint);
      // Bury the fuller thigh roots inside the pelvis for a continuous trouser silhouette.
      this.limbStart.copy(hipJoint).lerp(hip, .5).addScaledVector(spine, .09);
      this.trouserLegs[i].aim(this.limbStart, knee, foot, this.connectedTrousers.reference(i, this.hips));
      const lowerAxis = knee.clone().sub(foot).normalize();
      const shoeYaw = i === 0 ? pose.frontFootYaw ?? pose.yaw * .77 : (pose.backFootYaw ?? 1.38);
      /**
       * Which way the front pad faces.
       *
       * A pad is strapped to a shin, so the shin says which way is up it — and
       * nothing else. `setFromUnitVectors` picks the roll about that axis for
       * you, and what it picks is whatever falls out of the shortest turn from
       * vertical. With the shin lying diagonally that lands somewhere
       * plausible, which is why this went unnoticed for so long. With the shin
       * UPRIGHT, which is exactly where a properly folded front leg puts it,
       * the turn collapses to nothing and the roll is left to a fixed 79-degree
       * twist that points the front of the pad across him. Worse, the roll then
       * swings the OPPOSITE way to the leg as the shin tips through the stroke.
       *
       * The shoe never had the problem because the shoe is yawed outright, and
       * the two are on the same leg — measured against it, the pad was out by
       * up to 95 degrees on the sweep and 92 on the pull. So give the pad the
       * shoe's own bearing and build the rest of its frame around the shin:
       * front where the toes are, whatever the shin happens to be doing.
       */
      if (i === 0) {
        const facing = new THREE.Vector3(Math.sin(shoeYaw), 0, Math.cos(shoeYaw));
        facing.addScaledVector(lowerAxis, -facing.dot(lowerAxis));
        // Only a shin pointing exactly where the toes do, which is no shin.
        if (facing.lengthSq() < 1e-6) facing.set(0, 0, 1).addScaledVector(lowerAxis, -lowerAxis.z);
        facing.normalize();
        leg.pad.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
          new THREE.Vector3().crossVectors(lowerAxis, facing), lowerAxis, facing));
      } else {
        leg.pad.quaternion.setFromUnitVectors(UP, lowerAxis).multiply(new THREE.Quaternion().setFromAxisAngle(UP, 1.38));
      }
      leg.pad.position.copy(foot).lerp(knee, .54).add(new THREE.Vector3(.012, 0, .01));
      leg.shoe.position.copy(foot);
      leg.shoe.quaternion.setFromAxisAngle(UP, shoeYaw)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), footPitch));
    }
    this.draped = false;
  }
  /**
   * The shirt and trousers fitted to the pose last applied. They are one
   * surface each, bent vertex by vertex, and that is most of what posing him
   * costs; so it is done here, once, just before a frame is drawn, rather than
   * every time the pose is set. Whatever draws him calls this first.
   */
  drape() {
    if (this.draped) return;
    this.draped = true;
    this.sleeves.forEach(sleeve => sleeve.draw());
    this.trouserLegs.forEach(leg => leg.draw());
    this.connectedJersey.update(this.torso, this.sleeves);
    this.connectedTrousers.update(this.hips, this.trouserLegs, this.torso);
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
      felled: this.felled, shot: this.shot, pulling: this.pulling, spinPulling: this.spinPulling, cutting: this.cutting, squaring: this.squaring, lofted: this.lofted, sweeping: this.sweeping, levelled: this.levelled, yaw: this.pose.yaw, grip: [...this.pose.grip], frontFoot: [...this.pose.frontFoot], backFoot: [...this.pose.backFoot],
      hands: this.arms.map(arm => arm.glove.getWorldPosition(new THREE.Vector3()).toArray()),
      wrists: this.arms.map(arm => arm.wrist.toArray()),
      elbows: this.arms.map(arm => arm.elbow.position.toArray()),
      knees: this.legs.map(leg => leg.knee.position.toArray()),
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
      gloveBack: this.arms.map(arm=>new THREE.Vector3(0,0,arm.knuckles)
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
