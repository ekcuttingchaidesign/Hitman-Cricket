import * as THREE from 'three';
import { ARM_REACH, BUILD, Cricketer, Figure, Kit } from './Cricketer';
import { ease, settle, span } from './rig';

/**
 * A right-arm fast bowler, from the top of his mark to the end of his
 * follow-through.
 *
 * What was here before was not an action: the run-up spun both legs about the
 * hip like oars, the arm windmilled at a constant rate whatever the legs were
 * doing, and the delivery itself was a single line that parked the arm at
 * shoulder height and left it there. Nothing about it was wrong in the sense of
 * being a bug — it simply was not what a bowler does.
 *
 * A real action is five things in a fixed order, and the order is the whole
 * point of it. He runs in. He leaps, and turns side-on in the air with the
 * bowling arm swept down and back and the front arm reaching up at the target —
 * the gather, which is where the energy is stored. His back foot lands parallel
 * to the crease and takes the load. The front leg reaches out and braces
 * straight, the front arm is pulled down hard into the ribs, and that block is
 * what whips the shoulders round and the bowling arm over the top. The ball
 * leaves just past vertical. Then he falls away over the braced leg and the
 * back leg swings through.
 *
 * The bowling arm is modelled as a straight arm on a circle rather than as a
 * hand position solved by the limb solver, because that is what it physically
 * is: an arm that bends at the elbow through delivery is a throw, not a bowl,
 * and it is the one thing the laws of the game actually measure. Driving it by
 * angle means it cannot accidentally soften into one.
 */

/** Where he starts, and how far he travels before the ball leaves his hand. */
const START_Z = 26;
/** How far the follow-through carries him past the crease, and its landing marks. */
const FOLLOW = 1.7;
const travelledAt = (after: number) => RELEASE_ADVANCE + after * FOLLOW;
/**
 * Where his hips are when the ball leaves. Everything downstream is measured
 * back from this: the hand has to arrive at the trajectory's own release point,
 * or the ball appears out of thin air beside him.
 */
const RELEASE_HIP_Z = 18.31;
const RELEASE_ADVANCE = START_Z - RELEASE_HIP_Z;
/** Where each foot is planted, measured along the run from the top of the mark. */
const BACK_FOOT_PLANT = 6.75;
const FRONT_FOOT_PLANT = 7.92;
/** The two strides of the run-off, and where each of them puts a foot down. */
const BACK_LAND = .5, FRONT_LAND = .72;
const STRIDE = 1.78;
/** How far in front of the hips a running foot comes down. */
const FOOT_AHEAD = .30;

const BACK_MARK = travelledAt(BACK_LAND) + .32;
const FRONT_MARK = travelledAt(FRONT_LAND) + .40;

/** The phases of the action, as fractions of the run-up. */
const BOUND = .52, BACK_FOOT = .72, BACK_LIFT = .80, STRIDE_START = .86, FRONT_FOOT = .93;

/**
 * How far he has come at `t`. Not linear: he accelerates in, the bound covers
 * ground in one flat leap, and the delivery stride is a lunge that half stops
 * him. A constant speed reads as a conveyor belt.
 */
function advance(t: number) {
  if (t <= BOUND) return 4.3 * (t / BOUND) ** 1.35;
  if (t <= BACK_FOOT) return 4.3 + 2.3 * ease(span(t, BOUND, BACK_FOOT));
  if (t <= STRIDE_START) return 6.6 + .75 * span(t, BACK_FOOT, STRIDE_START);
  return 7.35 + (RELEASE_ADVANCE - 7.35) * settle(span(t, STRIDE_START, 1));
}

/**
 * The bowling arm's angle: 0 is straight up, positive carries it over towards
 * the batter, negative sweeps it back behind him. The whole delivery is this
 * one number moving from behind his hip, up through the vertical, and down
 * across his body.
 */
function armAngle(t: number) {
  // Through the run-up it drives against the legs. Tying the swing to the
  // stride rather than to a frequency of its own is what makes the arms and the
  // legs belong to the same runner: a right arm goes back as the right leg
  // comes through, and an arm on its own clock never quite does.
  if (t <= BOUND) return -Math.PI + Math.sin(advance(t) / STRIDE * Math.PI * 2) * .78;
  // Gather: down and back, the arm at its lowest as he leaves the ground.
  if (t <= BACK_FOOT) return THREE.MathUtils.lerp(-Math.PI, -2.42, ease(span(t, BOUND, BACK_FOOT)));
  // The climb behind him, and then over: slow off the bottom, fastest at the top.
  if (t <= FRONT_FOOT) return THREE.MathUtils.lerp(-2.42, -.72, ease(span(t, BACK_FOOT, FRONT_FOOT)) ** .82);
  return THREE.MathUtils.lerp(-.72, RELEASE_ANGLE, span(t, FRONT_FOOT, 1) ** .78);
}
/** Just past vertical, which is where a ball actually leaves the hand. */
const RELEASE_ANGLE = .20;

/** The front arm mirrors it: up at the target in the gather, then pulled down. */
function frontArmAngle(t: number) {
  if (t <= BOUND) return -Math.PI - Math.sin(advance(t) / STRIDE * Math.PI * 2) * .78;
  if (t <= BACK_FOOT) return THREE.MathUtils.lerp(Math.PI, -.26, ease(span(t, BOUND, BACK_FOOT)));
  // The pull-down: this is the block that turns the shoulders over.
  if (t <= 1) return THREE.MathUtils.lerp(-.26, -2.5, ease(span(t, BACK_FOOT, 1)) ** 1.25);
  return -2.5;
}

/**
 * How far round from facing the batter he is: side-on through the gather, then
 * driven back through by the front arm's pull and a little past it.
 */
function turnAt(t: number) {
  if (t <= BOUND) return .12 * ease(span(t, .3, BOUND));
  if (t <= BACK_FOOT) return THREE.MathUtils.lerp(.12, 1.02, ease(span(t, BOUND, BACK_FOOT)));
  return THREE.MathUtils.lerp(1.02, -.42, ease(span(t, BACK_FOOT, 1)) ** 1.15);
}
/** The way `across` points for a foot planted at `t` — frozen at that moment. */
const acrossAt = (t: number) => {
  const yaw = Math.PI + turnAt(t);
  return new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
};

const BACK_ACROSS = acrossAt(BACK_FOOT);
const FRONT_ACROSS = acrossAt(FRONT_FOOT);

/** A unit direction for an arm on its circle, in the bowler's own space. */
function armDirection(angle: number, tilt: number) {
  return new THREE.Vector3(tilt, Math.cos(angle), -Math.sin(angle)).normalize();
}

export class Bowler {
  readonly figure: Cricketer;
  readonly root: THREE.Group;
  private ball: THREE.Mesh;
  /** Where the run-up starts across the pitch: just wide of the stumps. */
  private laneX = .34;

  constructor(kit?: Kit) {
    this.figure = new Cricketer(kit);
    this.root = this.figure.root;
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(.037, 14, 10), new THREE.MeshStandardMaterial({ color: 0xc0341c, roughness: .5 }));
    this.figure.hands[1].add(this.ball);
    this.ball.position.set(0, .045, .03);
    this.reset();
  }

  reset() {
    this.ball.visible = true;
    this.runup(0);
  }

  /**
   * The run-up, the bound and the delivery stride, with `t` running 0 to 1 over
   * `GAME.runupMs`. The ball leaves at exactly `t === 1`, which is when the
   * delivery's own trajectory takes it over.
   */
  runup(t: number) {
    const clamped = THREE.MathUtils.clamp(t, 0, 1);
    this.apply(clamped, 0);
    this.ball.visible = clamped < 1;
  }

  /**
   * The follow-through, driven by how far the ball has flown. It is over well
   * before the ball reaches the batter — a bowler has finished falling away by
   * the time the stroke is played — so it runs on the first third of the flight
   * and then holds.
   */
  followThrough(progress: number) {
    this.ball.visible = false;
    this.apply(1, THREE.MathUtils.clamp(progress / .34, 0, 1));
  }

  /** Where the ball sits in his fingers, for a test that the two line up. */
  releasePoint() {
    this.figure.root.updateMatrixWorld(true);
    return this.ball.getWorldPosition(new THREE.Vector3());
  }

  private apply(t: number, after: number) {
    const travelled = after > 0 ? travelledAt(after) : advance(t);
    this.root.position.set(this.laneX, 0, START_Z - travelled);

    const pose = this.figure.stand();
    const turn = turnAt(t);
    pose.yaw = Math.PI + turn - after * .5;

    // He stands tallest at release and collapses over the front leg afterwards.
    const rise = t <= BACK_FOOT ? 0 : ease(span(t, BACK_FOOT, 1));
    const hipY = .865 + (t <= BOUND ? Math.abs(Math.sin(advance(t) / STRIDE * Math.PI)) * .045 : 0)
      + (t > BOUND && t <= BACK_FOOT ? Math.sin(span(t, BOUND, BACK_FOOT) * Math.PI) * .17 : 0)
      + rise * .065 - after * .17;
    pose.hip.set(0, hipY, 0);

    // The spine: upright running, coiled back away from the target through the
    // gather so the chest is still closed, then thrown forward over the front
    // leg on release and further still on the follow-through.
    const coil = t <= BOUND ? 0 : t <= BACK_FOOT ? ease(span(t, BOUND, BACK_FOOT)) : 1 - ease(span(t, BACK_FOOT, 1));
    const fall = ease(span(t, FRONT_FOOT, 1)) * .16 + after * .19;
    pose.chest.set(0, hipY + .52 - fall * .22, coil * .10 - fall * .58);
    pose.lean = coil * .22 - (ease(span(t, FRONT_FOOT, 1)) * .16 + after * .26);
    pose.headYaw = coil * -.5 + after * .35;
    pose.headPitch = .05 + coil * .06 + after * .22;

    this.feet(pose, t, after, travelled);
    this.arms(pose, t, after);
    this.figure.apply(pose);
  }

  /**
   * Feet, in world terms first and converted to his own space second. A planted
   * foot has to stay exactly where it was put while the body travels over it;
   * placing feet relative to the moving root instead is what makes a runner
   * skate, and it is the most obvious tell of a figure that is being dragged
   * along rather than running.
   */
  private feet(pose: Figure, t: number, after: number, travelled: number) {
    // Fore and aft is measured along the run, because that is the line he runs;
    // across is measured in his own frame and turned with him, because that is
    // what a hip does. Mixing the two up — a lateral offset left in unrotated
    // space while the hip joint it belongs to has turned with the body — puts
    // the right foot under the left hip once he is side-on, and the legs cross.
    const live = new THREE.Vector3(Math.cos(pose.yaw), 0, -Math.sin(pose.yaw));
    // A foot on the ground keeps the bearing it came down with. Taking the live
    // one instead swings the plant sideways as the body turns over it, which is
    // a foot sliding under load — small, but it is the same skate as any other.
    const place = (foot: THREE.Vector3, distance: number, lateral: number, height: number, across = live) =>
      foot.set(0, height, travelled - distance).addScaledVector(across, lateral);

    if (t <= BOUND) {
      const strides = advance(t) / STRIDE;
      // He stands at the top of his mark and the gait fades in under him, so the
      // first frame the batter sees is a bowler waiting rather than one frozen
      // in mid-stride.
      const gait = ease(span(t, 0, .12));
      const contact = .34;
      for (let i = 0; i < 2; i++) {
        const offset = i * .5;
        const phase = strides + offset;
        const cycle = Math.floor(phase), frac = phase - cycle;
        // Where this foot planted for this cycle. It has to be derived from the
        // moment the foot came down — when `frac` was zero, and the body had
        // reached `(cycle - offset) * STRIDE` — and not from the cycle number
        // alone: counting whole strides from the mark walks the plant a half
        // stride further from the hips on every step, and by the third one the
        // leg is stretched flat to reach the ground it is meant to stand on.
        const planted = (cycle - offset) * STRIDE + FOOT_AHEAD;
        const swing = frac < contact ? 0 : ease((frac - contact) / (1 - contact));
        const running = planted + STRIDE * swing;
        const lift = frac < contact ? 0 : Math.sin((frac - contact) / (1 - contact) * Math.PI) * .30;
        const stood = travelled - (i === 0 ? -.15 : .13);
        place(i === 0 ? pose.leftFoot : pose.rightFoot,
          THREE.MathUtils.lerp(stood, running, gait),
          i === 0 ? -.13 : .13,
          .06 + lift * gait);
      }
      return;
    }

    const boundT = span(t, BOUND, BACK_FOOT);

    // The back foot lands parallel to the crease and takes the load — and then
    // it has to leave. A foot cannot stay welded to its mark while the body runs
    // a metre past it: the leg is only so long, and holding the plant is what
    // tore the figure into the splits. So it is planted only while he is over
    // it, and from there it trails him through the air, where where it sits is
    // measured from the hips rather than from the ground.
    const lifted = span(t, BACK_LIFT, 1);
    const trailing = travelled - THREE.MathUtils.lerp(advance(BACK_LIFT) - BACK_FOOT_PLANT, .40, ease(lifted));
    // Where the trailing leg comes down once it has swung past the front one.
    const swingThrough = ease(span(after, 0, BACK_LAND));
    place(pose.rightFoot,
      t <= BACK_FOOT ? THREE.MathUtils.lerp(4.3, BACK_FOOT_PLANT, ease(boundT))
        : t <= BACK_LIFT ? BACK_FOOT_PLANT
        : after > 0 ? THREE.MathUtils.lerp(travelledAt(0) - .40, BACK_MARK, swingThrough)
        : trailing,
      .17,
      // At release the trailing foot is already a foot off the turf, so the
      // follow-through has to pick it up from there. Starting its swing from
      // the ground drops the leg through the pitch for a frame and, worse,
      // hands the leg a stance it has no length left to reach.
      .06 + (t <= BACK_FOOT ? Math.sin(boundT * Math.PI) * .42
        : after > 0 ? THREE.MathUtils.lerp(.30, 0, swingThrough) + Math.sin(swingThrough * Math.PI) * .32
        : ease(lifted) * .30),
      t > BACK_FOOT && t <= BACK_LIFT ? BACK_ACROSS : live);

    // The front leg: tucked up under him in the bound, then thrown out and
    // slammed down braced. It holds exactly where it lands through the release —
    // the brace is the whole delivery, and a front foot that creeps is a front
    // foot that is not braced against anything — and only then steps on.
    const stepOn = ease(span(after, .14, FRONT_LAND));
    const frontDistance = t <= BACK_FOOT
      ? THREE.MathUtils.lerp(4.3, 6.3, ease(boundT))
      : t <= FRONT_FOOT
        ? THREE.MathUtils.lerp(6.3, FRONT_FOOT_PLANT, ease(span(t, BACK_FOOT, FRONT_FOOT)))
        : THREE.MathUtils.lerp(FRONT_FOOT_PLANT, FRONT_MARK, stepOn);
    const frontLift = t <= BACK_FOOT ? Math.sin(boundT * Math.PI) * .30 + boundT * .34
      : t <= FRONT_FOOT ? .34 * (1 - ease(span(t, BACK_FOOT, FRONT_FOOT)) ** .6)
      : Math.sin(stepOn * Math.PI) * .30;
    place(pose.leftFoot, frontDistance, -.14, .06 + frontLift,
      t >= FRONT_FOOT && after === 0 ? FRONT_ACROSS : live);
  }

  /** Both arms, each on its own circle about its own shoulder. */
  private arms(pose: Figure, t: number, after: number) {
    const angle = after > 0 ? THREE.MathUtils.lerp(RELEASE_ANGLE, 2.55, ease(after)) : armAngle(t);
    const front = after > 0 ? THREE.MathUtils.lerp(-2.5, -2.05, ease(after)) : frontArmAngle(t);

    // Shoulders, from the trunk the pose has already described.
    const spine = pose.chest.clone().sub(pose.hip).normalize();
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pose.yaw);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(yaw);
    const roll = new THREE.Quaternion().setFromAxisAngle(forward, pose.lean);
    const trunk = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), spine.clone().applyQuaternion(roll)).multiply(yaw);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(trunk);
    const up = spine.clone().applyQuaternion(roll);
    const shoulder = (side: number) => pose.chest.clone().addScaledVector(right, side * BUILD.shoulderX).addScaledVector(up, BUILD.shoulderY);

    // The bowling arm is straight on its circle: hand at full reach from the
    // shoulder, so the limb solver has nothing left to bend.
    const bowlingArm = t > BOUND || after > 0;
    const reach = bowlingArm ? ARM_REACH - .004 : ARM_REACH * .60;
    pose.rightHand.copy(shoulder(1)).addScaledVector(armDirection(angle, -.175), reach);

    // The front arm reaches at full stretch in the gather and then folds as it
    // is pulled into the ribs, which is what a front arm actually does.
    const frontReach = after > 0 ? ARM_REACH * .5
      : t <= BOUND ? ARM_REACH * .60
      : THREE.MathUtils.lerp(ARM_REACH - .01, ARM_REACH * .5, ease(span(t, BACK_FOOT, 1)));
    pose.leftHand.copy(shoulder(-1)).addScaledVector(armDirection(front, -.16), frontReach);
  }
}

/** The top of his mark, and where his hips finish. Read by the action's tests. */
export const RUNUP_START_Z = START_Z;
export const RELEASE_Z = RELEASE_HIP_Z;
