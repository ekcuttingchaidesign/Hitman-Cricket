import * as THREE from 'three';
import { ARM_REACH, BUILD, Cricketer, Figure, Kit, SPINE } from './Cricketer';
import { GAME } from '../config/gameplay';
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

/**
 * Where his hips are when the ball leaves. Everything downstream is measured
 * back from this: the hand has to arrive at the trajectory's own release point,
 * or the ball appears out of thin air beside him.
 */
const RELEASE_HIP_Z = 18.31;
/**
 * The approach, and the three fixed strides in front of it. Only the approach
 * is a choice — the bound and the delivery stride are the length of a man's
 * legs, so shortening the run in means shortening the run in, not squashing
 * the action that follows it.
 */
const APPROACH = 2.6;
/**
 * And the spinner's, which is not a run at all.
 *
 * The comment above is the whole design of this: only the approach is a choice.
 * A spinner bowls the same action off the same braced front leg — the bound,
 * the gather and the delivery stride are the length of a man's legs whoever he
 * is — so he keeps every one of them and simply has almost nothing in front of
 * them. Two paces and a hop, covered in the time the quick bowler spends
 * running four metres, which is what turns the run into a walk without touching
 * a frame of the action that follows it.
 */
const SPIN_APPROACH = 0.78, SPIN_BOUND = 0.34;
/**
 * The bound, the gather and the delivery stride.
 *
 * What matters here is not any one of these numbers but the shape they make
 * against the clock: 5.9 m/s in, 8.2 through the leap, 7.2 through the gather
 * and 7.1 through the delivery stride. He is quickest at the leap and never
 * drops back below the speed he ran in at, which is what a bowler accelerating
 * into the crease looks like, and it is the only way the action reads as one
 * movement rather than a run followed by a bowl. Getting there meant slowing
 * the approach as much as it meant quickening the delivery — at 6.9 in and 6.1
 * through the stride the arithmetic was nearly level, and it still looked like
 * a man losing momentum, because against a fast run-in anything short of
 * faster reads as slower.
 */
const BOUND_LEAP = 1.5, GATHER = .85, DELIVERY_STRIDE = .70;
/** The two strides of the run-off, and where each of them puts a foot down. */
const BACK_LAND = .5, FRONT_LAND = .72;
/** How far the follow-through carries him past the crease. */
const FOLLOW = 1.7;

/**
 * Everything about a run that depends on how long it is.
 *
 * The release point is fixed — the ball has to leave from the crease whoever
 * bowled it — so a shorter approach does not move where he finishes, it moves
 * where he starts. Every mark below is measured along the run from the top of
 * his mark, so they all shift together and the action lands in the same place.
 */
export interface Run {
  approach: number; bound: number; releaseAdvance: number; startZ: number;
  backFootPlant: number; frontFootPlant: number; backMark: number; frontMark: number;
}
function runOf(approach: number, bound: number): Run {
  const releaseAdvance = approach + bound + GATHER + DELIVERY_STRIDE;
  const travelled = (after: number) => releaseAdvance + after * FOLLOW;
  return {
    approach, bound, releaseAdvance,
    startZ: RELEASE_HIP_Z + releaseAdvance,
    backFootPlant: approach + bound + .30,
    frontFootPlant: releaseAdvance + .07,
    backMark: travelled(BACK_LAND) + .32,
    frontMark: travelled(FRONT_LAND) + .40,
  };
}
const travelledAt = (after: number, run: Run) => run.releaseAdvance + after * FOLLOW;

/** How far through `followThrough` the falling-away ends and standing up begins. */
const FOLLOWED = .34;
/** And how far through it he is back on his feet. */
const RECOVERED = .78;
const STRIDE = 1.30;
/**
 * The action's own two durations. The run-up shares the game's, because the
 * ball is handed over to its trajectory at the end of it and the two have to
 * agree on when that is; the follow-through answers to nothing but itself.
 */
const RUNUP_MS = GAME.runupMs;
const FOLLOW_MS = 1400;
/** How much of the run-up he spends leaving the standing pose behind. */
const WALK_UP = .12;
/** How far in front of the hips a running foot comes down. */
const FOOT_AHEAD = .30;

/** The quick bowler's run, and the spinner's. */
export const PACE_RUN = runOf(APPROACH, BOUND_LEAP);
export const SPIN_RUN = runOf(SPIN_APPROACH, SPIN_BOUND);

/** The phases of the action, as fractions of the run-up. */
const BOUND = .525, BACK_FOOT = .743, BACK_LIFT = .80, STRIDE_START = .883, FRONT_FOOT = .955;

/**
 * The shape of one bowler's action: the numbers that make one fast bowler
 * look unlike another, on a run-up and a clock they share.
 *
 * Only the shape. The phases above, the run, the release point and the moment
 * the ball leaves are the same for every action, because they are the game's:
 * the ball is handed to its trajectory at the end of the run-up from a fixed
 * point, and a batter times the ball off the release. What an action is free
 * to change is everything a batter watches on the way there — how high he
 * leaps, how far he turns, where his arms are and how hard the arm whips over.
 */
export interface ActionStyle {
  /** The bowling arm at the bottom of the gather: see `armAngle`. */
  gatherAngle: number;
  /** How hard the sweep from the gather to the release accelerates. */
  whip: number;
  /** Where the ball leaves, just past vertical. */
  release: number;
  /** Where the arm finishes coming down across the body after it. */
  through: number;
  /** The front arm at the top of the gather, and pulled down at release and after. */
  frontUp: number; frontPull: number; frontAfter: number;
  /** How far round he turns: a little running in, most at the gather, and back past square at release. */
  runTurn: number; gatherTurn: number; releaseTurn: number;
  /** The hips' rise through the bound, and their drop into the follow-through. */
  leap: number; followDrop: number;
  /** The coil away from the target through the gather: the chest back, the lean, the head. */
  coilBack: number; coilLean: number; coilHead: number;
  /** How far he folds over the front leg after the ball has gone, and leans away with it. */
  fold: number; foldLean: number;
  /** How high the back leg kicks up behind him as he falls away. */
  backKick: number;
  /**
   * What the hands do running in: pump against the legs, or carry the ball at
   * the chest in both hands until the last stride before the leap.
   */
  carry: 'run' | 'chest';
  /** Where the run-up lies across the pitch: just wide of the stumps, or wider. */
  lane: number;
  /** How far forward he leans running in, as a sprinter does, gone by the time he lands from the leap. */
  runLean: number;
  /** How hard the arms pump running in: one is the fast bowler's. */
  pump: number;
  /** When the front arm goes up, as fractions of the run-up: from the bound to the back foot, or earlier. */
  frontRise: readonly [number, number];
  /** How high the front knee drives in the leap: one is the fast bowler's. */
  kneeDrive: number;
  /**
   * How far he tilts away to his non-bowling side as the ball goes, in
   * radians, and from where in the run-up it builds: the fast bowler's comes
   * on with the front foot, a slinger's from the back foot, so that he is
   * already leaning away as the chest opens.
   */
  releaseTilt: number; tiltFrom: number;
  /**
   * How the chest opens from the gather to the release: the power the easing
   * is raised to, so that less than one opens it early and more holds it
   * side-on until late. And how much further it turns after the ball has
   * gone, with where the head looks through the release and after it.
   */
  open: number; throughTurn: number; releaseHead: number; throughHead: number;
  /**
   * How far the bowling arm leans out from the vertical on its way over: nought
   * is straight over the top, and a slinger's is most of the way to level.
   * `throughTilt` is where it leans once the ball has gone, so a slung arm can
   * finish across the body.
   */
  armTilt: number; throughTilt: number;
  /**
   * The back leg kicked up behind him as he pitches forward over the front
   * one, how high, and for how much of the falling-away it hangs there before
   * it swings through. Nought for an action that just runs on.
   */
  kick: number; kickHold: number;
  /**
   * How far he veers off across the pitch to his non-bowling side as he runs
   * off, in metres. Only once the front foot has left its mark, so the brace
   * never slides.
   */
  followAcross: number;
}

/** The fast bowler every mode has had: the action this file was written for. */
export const PACE_ACTION: ActionStyle = {
  gatherAngle: -2.42, whip: 2.4, release: .20, through: 2.55,
  frontUp: -.26, frontPull: -2.5, frontAfter: -2.05,
  runTurn: .12, gatherTurn: 1.02, releaseTurn: -.42,
  leap: .17, followDrop: .17,
  coilBack: .10, coilLean: .22, coilHead: -.5,
  fold: .19, foldLean: .26,
  backKick: .32,
  carry: 'run', lane: .34,
  runLean: 0, pump: 1,
  frontRise: [BOUND, BACK_FOOT], kneeDrive: 1, releaseTilt: .16, tiltFrom: FRONT_FOOT, armTilt: -.175, throughTilt: -.175,
  open: 1.15, throughTurn: .5, releaseHead: 0, throughHead: .35,
  kick: 0, kickHold: 0, followAcross: 0,
};

/**
 * The Marathon's express bowler: a slinger, after a slow-motion reference of
 * the most famous one — the same run-up and clock, and everything else his own.
 *
 * The first cut of this was the fast bowler's action with every number nudged
 * the same way, and a playtest could not tell the two apart: at 840 ms from
 * twenty metres, ten degrees more turn is nothing. A sling is a different
 * shape altogether, and reads from the far end.
 *
 *   - **The run.** The ball carried at the chest in both hands, upright.
 *   - **The leap.** The hands part: the front arm goes straight up in front of
 *     his face, the ball arm drops away behind, and the front knee drives high.
 *   - **The gather.** Side-on, arched away from the target, the ball arm
 *     hanging low and wide behind him.
 *   - **The sling.** The arm comes through round rather than over — leaning
 *     well out from the vertical the whole way — while the front arm is chopped
 *     down in front of him to the chest. The chest is open past square and the
 *     body already tilted hard away to his left before the front foot lands,
 *     bowling shoulder high, eyes on the batter; a bowler who is square and
 *     upright until the last frame is not slinging it. The ball still leaves
 *     at the same moment as every other ball, and from the same point: he runs
 *     in from a wider lane, so that an arm swinging in from out there arrives
 *     where an arm coming straight over the top does.
 *   - **The follow-through.** The chest keeps turning, round past the batter,
 *     the arm carried on across his body to the far hip and the head still
 *     falling away — a spin rather than the fast bowler's fold over the front
 *     leg — and he runs off across the pitch.
 *
 * What a sling cannot have here is a release at shoulder height: the ball is
 * handed to its trajectory at a fixed point over his head, so the arm leans
 * out as far as still reaches it, which is about thirty-five degrees.
 */
export const EXPRESS_ACTION: ActionStyle = {
  gatherAngle: -2.55, whip: 3.2, release: .16, through: 2.7,
  frontUp: -.1, frontPull: 2.35, frontAfter: 2.75,
  runTurn: .14, gatherTurn: 1.25, releaseTurn: -.7,
  leap: .3, followDrop: .3,
  coilBack: .22, coilLean: .4, coilHead: -.7,
  fold: .2, foldLean: -.35,
  backKick: .4,
  carry: 'chest', lane: .6,
  runLean: .1, pump: 1,
  frontRise: [.46, .64], kneeDrive: 1.5, releaseTilt: -.5, tiltFrom: BACK_FOOT, armTilt: -.8, throughTilt: .5,
  open: .7, throughTurn: 1.1, releaseHead: .5, throughHead: .7,
  kick: .25, kickHold: .25, followAcross: .5,
};

/**
 * How far he has come at `t`. Not linear: he accelerates in, the bound covers
 * ground in one flat leap, and the delivery stride is a lunge that half stops
 * him. A constant speed reads as a conveyor belt.
 */
function advance(t: number, run: Run) {
  const bound = run.approach + run.bound, gathered = bound + GATHER;
  if (t <= BOUND) return run.approach * (t / BOUND) ** 1.35;
  if (t <= BACK_FOOT) return run.approach + run.bound * ease(span(t, BOUND, BACK_FOOT));
  if (t <= STRIDE_START) return bound + GATHER * span(t, BACK_FOOT, STRIDE_START);
  return gathered + DELIVERY_STRIDE * settle(span(t, STRIDE_START, 1));
}

/**
 * The bowling arm's angle: 0 is straight up, positive carries it over towards
 * the batter, negative sweeps it back behind him. The whole delivery is this
 * one number moving from behind his hip, up through the vertical, and down
 * across his body.
 */
function armAngle(t: number, run: Run, style: ActionStyle) {
  // Through the run-up it drives against the legs. Tying the swing to the
  // stride rather than to a frequency of its own is what makes the arms and the
  // legs belong to the same runner: a right arm goes back as the right leg
  // comes through, and an arm on its own clock never quite does.
  if (t <= BOUND) return -Math.PI + Math.sin(advance(t, run) / STRIDE * Math.PI * 2) * .78;
  // Gather: down and back, the arm at its lowest as he leaves the ground.
  if (t <= BACK_FOOT) return THREE.MathUtils.lerp(-Math.PI, style.gatherAngle, ease(span(t, BOUND, BACK_FOOT)));
  // And then one accelerating sweep, all the way from the gather to the ball
  // leaving the hand. It used to be two: a climb at 8 rad/s and a last flick at
  // 18, which meant the arm was still gathering pace at the exact moment the
  // ball went — and then fell off a cliff to 5 on the far side of it. An arm
  // that reaches its fastest at release and carries on through is the whole
  // difference between a bowler and someone putting a ball down the pitch.
  // How hard it accelerates is `style.whip`: the arm covers most of its arc in
  // the last fraction of it, which is why it is a whip and not a windmill — at
  // the fast bowler's 2.4 it is doing about 24 rad/s as the ball goes. Where it
  // hangs at the bottom of the gather is `gatherAngle`, behind and below him,
  // and where it lets go is `release`, just past vertical, which is where a
  // ball actually leaves the hand.
  return THREE.MathUtils.lerp(style.gatherAngle, style.release, span(t, BACK_FOOT, 1) ** style.whip);
}
/** How much of the follow-through the arm spends coming down across the body. */
const ARM_THROUGH = .36;

/** The front arm mirrors it: up at the target in the gather, then pulled down. */
function frontArmAngle(t: number, run: Run, style: ActionStyle) {
  const rise = ease(span(t, style.frontRise[0], style.frontRise[1]));
  // Running, it pumps; an action that puts it up before the leap takes it up
  // from wherever the pump had it, the long way round over the front. The
  // stride count lands the pump on straight down at the bound, so the two
  // halves meet there.
  if (t <= BOUND) return THREE.MathUtils.lerp(-Math.PI - Math.sin(advance(t, run) / STRIDE * Math.PI * 2) * .78 + (rise > 0 ? 2 * Math.PI : 0), style.frontUp, rise);
  if (t <= BACK_FOOT) return THREE.MathUtils.lerp(Math.PI, style.frontUp, rise);
  // The pull-down: this is the block that turns the shoulders over.
  if (t <= 1) return THREE.MathUtils.lerp(style.frontUp, style.frontPull, ease(span(t, BACK_FOOT, 1)) ** 1.8);
  return style.frontPull;
}

/**
 * How far round from facing the batter he is: side-on through the gather, then
 * driven back through by the front arm's pull and a little past it.
 */
function turnAt(t: number, style: ActionStyle) {
  if (t <= BOUND) return style.runTurn * ease(span(t, .3, BOUND));
  if (t <= BACK_FOOT) return THREE.MathUtils.lerp(style.runTurn, style.gatherTurn, ease(span(t, BOUND, BACK_FOOT)));
  return THREE.MathUtils.lerp(style.gatherTurn, style.releaseTurn, ease(span(t, BACK_FOOT, 1)) ** style.open);
}
/** The way `across` points for a foot planted at `t` — frozen at that moment. */
const acrossAt = (t: number, style: ActionStyle) => {
  const yaw = Math.PI + turnAt(t, style);
  return new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
};

/** A unit direction for an arm on its circle, in the bowler's own space. */
function armDirection(angle: number, tilt: number) {
  return new THREE.Vector3(tilt, Math.cos(angle), -Math.sin(angle)).normalize();
}

export class Bowler {
  readonly figure: Cricketer;
  readonly root: THREE.Group;
  private ball: THREE.Mesh;
  /**
   * Which run he is walking back to the top of. Set before the action starts
   * and held for the whole of it, so a delivery cannot change its own geometry
   * halfway through and slide him down the pitch.
   */
  private run: Run = PACE_RUN;

  /** Hand the ball to the spinner, or take it back. */
  spinner(on: boolean) { this.run = on ? SPIN_RUN : PACE_RUN; }
  /**
   * Whose action he bowls with, and the two feet it plants side-on and braced,
   * frozen at the moment each comes down. Set before the action starts and
   * held for the whole of it, like the run.
   */
  private style: ActionStyle = PACE_ACTION;
  private backAcross = acrossAt(BACK_FOOT, PACE_ACTION);
  private frontAcross = acrossAt(FRONT_FOOT, PACE_ACTION);
  /** Bowl with this action from the next ball: the express bowler's, or back to the fast bowler's. */
  action(style: ActionStyle) {
    this.style = style;
    this.backAcross = acrossAt(BACK_FOOT, style);
    this.frontAcross = acrossAt(FRONT_FOOT, style);
  }
  /** Whose action it is, for the scene and the checks. */
  get actionStyle() { return this.style; }

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
   * The whole action on one clock of its own, `ms` counted from the first step
   * of the run-up. Nothing about it is a function of the delivery.
   *
   * That is the point, and it is the point in cricket rather than in code. The
   * action is the disguise: a bowler runs in and bowls at the same tempo every
   * ball, and what changes is the ball. A slower one is bowled out of the same
   * arm at the same speed — that is the whole trick of it, and a batter reads
   * the action, commits, and finds the ball is not where the action said it
   * would be. An action that slowed down with the ball would announce every
   * variation a full second before it arrived, and there would be nothing left
   * to be deceived by.
   *
   * So the ball is never passed in here, and the two durations below are its
   * own. The delivery's flight time cannot reach this code even by accident.
   */
  animate(ms: number) {
    if (ms <= RUNUP_MS) this.runup(ms / RUNUP_MS);
    else this.followThrough((ms - RUNUP_MS) / FOLLOW_MS);
  }

  /**
   * The run-up, the bound and the delivery stride, with `t` running 0 to 1 over
   * `RUNUP_MS`. The ball leaves at exactly `t === 1`, which is when the
   * delivery's own trajectory takes it over.
   */
  runup(t: number) {
    const clamped = THREE.MathUtils.clamp(t, 0, 1);
    this.apply(clamped, 0, 0);
    this.ball.visible = clamped < 1;
  }

  /**
   * The follow-through, and then standing back up out of it. `progress` runs 0
   * to 1 over `FOLLOW_MS` from the moment of release.
   */
  followThrough(progress: number) {
    this.ball.visible = false;
    this.apply(1, span(progress, 0, FOLLOWED), span(progress, FOLLOWED, RECOVERED));
  }

  /** Where the ball sits in his fingers, for a test that the two line up. */
  releasePoint() {
    this.figure.root.updateMatrixWorld(true);
    return this.ball.getWorldPosition(new THREE.Vector3());
  }

  private apply(t: number, after: number, recover = 0) {
    const travelled = after > 0 ? travelledAt(after, this.run) : advance(t, this.run);
    // His left is +x here, the side away from the stumps.
    const veer = after > 0 ? ease(span(after, .14, .7)) * this.style.followAcross : 0;
    this.root.position.set(this.style.lane + veer, 0, this.run.startZ - travelled);

    const pose = this.figure.stand();
    const style = this.style;
    const turn = turnAt(t, style);
    pose.yaw = Math.PI + turn - after * style.throughTurn;

    // He stands tallest at release and collapses over the front leg afterwards.
    // He is at his lowest as the front foot lands and his tallest as the ball
    // goes: the hips travel up and over the braced leg, which is both what a
    // delivery stride is for and the only way a leg this long reaches a foot
    // planted that far in front of it. Standing tall the whole way through, the
    // leg is stretched flat before the foot ever gets down.
    const hipY = .865 + (t <= BOUND ? Math.abs(Math.sin(advance(t, this.run) / STRIDE * Math.PI)) * .045 : 0)
      + (t > BOUND && t <= BACK_FOOT ? Math.sin(span(t, BOUND, BACK_FOOT) * Math.PI) * style.leap : 0)
      + ease(span(t, STRIDE_START, 1)) * .118 - after * style.followDrop;
    pose.hip.set(0, hipY, 0);

    // The spine: upright running, coiled back away from the target through the
    // gather so the chest is still closed, then thrown forward over the front
    // leg on release and further still on the follow-through.
    const coil = t <= BOUND ? 0 : t <= BACK_FOOT ? ease(span(t, BOUND, BACK_FOOT)) : 1 - ease(span(t, BACK_FOOT, 1));
    const fall = ease(span(t, FRONT_FOOT, 1)) * .16 + after * style.fold;
    // Running in, a sprinter's lean: in as he gets going, out through the leap.
    const sprint = style.runLean * ease(span(t, 0, .3)) * (1 - ease(span(t, BOUND, BACK_FOOT)));
    pose.chest.set(0, hipY + SPINE - fall * .16 - sprint * .1, coil * style.coilBack - fall * .58 - sprint);
    // A deep fold is a spine bent, not a spine stretched: past the length the
    // coil already gave it the chest is drawn back in, or the torso and the
    // shoulders come apart. The fast bowler's fold never reaches it.
    const spine = pose.chest.clone().sub(pose.hip), longest = Math.hypot(SPINE, coil * style.coilBack);
    if (spine.length() > longest) pose.chest.copy(pose.hip).addScaledVector(spine.normalize(), longest);
    const tilting = ease(span(t, style.tiltFrom, 1));
    pose.lean = coil * style.coilLean - (tilting * style.releaseTilt + after * style.foldLean);
    pose.headYaw = coil * style.coilHead + tilting * style.releaseHead + after * style.throughHead;
    pose.headPitch = .05 + coil * .06 + after * .22;

    this.feet(pose, t, after, travelled);
    this.arms(pose, t, after);
    // He is stood still at both ends of this: waiting at the top of his mark,
    // and back on his feet once the ball has gone. Holding a frame of the run
    // instead — which is what waiting used to be — leaves him stopped mid-stride
    // with his weight on nothing and both elbows out, for the half second the
    // batter spends looking straight at him before every ball.
    this.stand(pose, after > 0 ? ease(recover) : 1 - ease(span(t, 0, WALK_UP)));
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
      const strides = advance(t, this.run) / STRIDE;
      // He stands at the top of his mark and the gait fades in under him, so the
      // first frame the batter sees is a bowler waiting rather than one frozen
      // in mid-stride.
      const gait = ease(span(t, 0, WALK_UP));
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
    const trailing = travelled - THREE.MathUtils.lerp(advance(BACK_LIFT, this.run) - this.run.backFootPlant, .40, ease(lifted));
    // Where the trailing leg comes down once it has swung past the front one —
    // held up behind him first, by an action that kicks it there.
    const { kick, kickHold } = this.style;
    const swingThrough = ease(span(after, kickHold, BACK_LAND + kickHold * .6));
    const kicked = kick * (after <= kickHold ? ease(span(after, 0, kickHold * .6)) : 1 - swingThrough);
    place(pose.rightFoot,
      t <= BACK_FOOT ? THREE.MathUtils.lerp(this.run.approach, this.run.backFootPlant, ease(boundT))
        : t <= BACK_LIFT ? this.run.backFootPlant
        // Held up, it trails the hips rather than a mark on the ground, which
        // they are leaving behind.
        : after > 0 ? THREE.MathUtils.lerp(travelledAt(Math.min(after, kickHold), this.run) - .40, this.run.backMark, swingThrough) - kicked * .5
        : trailing,
      .17,
      // At release the trailing foot is already a foot off the turf, so the
      // follow-through has to pick it up from there. Starting its swing from
      // the ground drops the leg through the pitch for a frame and, worse,
      // hands the leg a stance it has no length left to reach.
      .06 + (t <= BACK_FOOT ? Math.sin(boundT * Math.PI) * .42
        : after > 0 ? THREE.MathUtils.lerp(.30, 0, swingThrough) + Math.sin(swingThrough * Math.PI) * this.style.backKick + kicked
        : ease(lifted) * .30),
      t > BACK_FOOT && t <= BACK_LIFT ? this.backAcross : live);

    // The front leg: tucked up under him in the bound, then thrown out and
    // slammed down braced. It holds exactly where it lands through the release —
    // the brace is the whole delivery, and a front foot that creeps is a front
    // foot that is not braced against anything — and only then steps on.
    const stepOn = ease(span(after, .14, FRONT_LAND));
    const frontDistance = t <= BACK_FOOT
      ? THREE.MathUtils.lerp(this.run.approach, this.run.backFootPlant + .06, ease(boundT))
      : t <= FRONT_FOOT
        ? THREE.MathUtils.lerp(this.run.backFootPlant + .06, this.run.frontFootPlant, ease(span(t, BACK_FOOT, FRONT_FOOT)))
        : THREE.MathUtils.lerp(this.run.frontFootPlant, this.run.frontMark, stepOn);
    const frontLift = t <= BACK_FOOT ? (Math.sin(boundT * Math.PI) * .30 + boundT * .34) * (1 + (this.style.kneeDrive - 1) * Math.sin(boundT * Math.PI))
      : t <= FRONT_FOOT ? .34 * (1 - ease(span(t, BACK_FOOT, FRONT_FOOT)) ** 1.5)
      : Math.sin(stepOn * Math.PI) * .30;
    // Braced, it keeps the bearing it landed on through the release and after
    // it, and only turns with him as it steps on: switching to the live bearing
    // the moment the ball went slid it sideways under him at the release.
    place(pose.leftFoot, frontDistance, -.10, .06 + frontLift,
      after > 0 ? this.frontAcross.clone().lerp(live, stepOn) : t >= FRONT_FOOT ? this.frontAcross : live);
  }

  /**
   * Straightening up out of the follow-through. He unbends over the front leg,
   * squares up to watch the ball, drops his arms, and brings his feet back
   * under him — as a step rather than a slide, since a foot on the ground is
   * still a foot on the ground.
   */
  private stand(pose: Figure, amount: number) {
    if (amount <= 0) return;
    // The rest pose is the fielders' own, not a second one written out beside
    // it: the bowler is the same body, and two hand-copied versions of "stood
    // still" drift apart the moment either is touched. It is only turned into
    // his frame on the way in — his lateral offsets are measured across a body
    // facing the batter, and dropping the fielder's straight in would put his
    // right foot under his left hip.
    const target = this.figure.rest();
    // Square up first: he finishes the follow-through turned off the pitch, and
    // a man standing still watching the ball is facing down it. `across` has to
    // be taken from where he ends up, not where he was, or the feet settle on
    // the bearing he was turning away from.
    pose.yaw = THREE.MathUtils.lerp(pose.yaw, Math.PI, amount);
    const across = new THREE.Vector3(Math.cos(pose.yaw), 0, -Math.sin(pose.yaw));
    const settle = (point: THREE.Vector3, to: THREE.Vector3) =>
      point.lerp(new THREE.Vector3(0, to.y, to.z).addScaledVector(across, to.x), amount);

    settle(pose.hip, target.hip);
    settle(pose.chest, target.chest);
    pose.lean = THREE.MathUtils.lerp(pose.lean, target.lean, amount);
    pose.headYaw = THREE.MathUtils.lerp(pose.headYaw, target.headYaw, amount);
    pose.headPitch = THREE.MathUtils.lerp(pose.headPitch, target.headPitch, amount);
    settle(pose.leftHand, target.leftHand);
    settle(pose.rightHand, target.rightHand);
    settle(pose.leftFoot, target.leftFoot);
    settle(pose.rightFoot, target.rightFoot);
    // Each foot arcs on its way home so it steps rather than slides. The arc
    // closes itself at both ends, so a pose already settled stays put.
    const lift = Math.sin(amount * Math.PI) * .11;
    pose.leftFoot.y += lift;
    pose.rightFoot.y += lift;
  }

  /** Both arms, each on its own circle about its own shoulder. */
  private arms(pose: Figure, t: number, after: number) {
    // Past release the arm keeps the speed it went over at and bleeds it off,
    // rather than stopping at the moment of release and strolling down. Easing
    // in from nothing here is what made a 24 rad/s arm read as a slow one: the
    // eye follows it through the ball, and what it saw was the arm stop.
    const style = this.style;
    const swept = settle(span(after, 0, ARM_THROUGH));
    const angle = after > 0 ? THREE.MathUtils.lerp(style.release, style.through, swept) : armAngle(t, this.run, style);
    const tilt = after > 0 ? THREE.MathUtils.lerp(style.armTilt, style.throughTilt, swept) : style.armTilt;
    const front = after > 0 ? THREE.MathUtils.lerp(style.frontPull, style.frontAfter, ease(after)) : frontArmAngle(t, this.run, style);

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
    pose.rightHand.copy(shoulder(1)).addScaledVector(armDirection(angle, tilt), reach);

    // The front arm reaches at full stretch in the gather and then folds as it
    // is pulled into the ribs, which is what a front arm actually does.
    // An action that puts it up before the leap straightens it on the way.
    const rising = ease(span(t, style.frontRise[0], style.frontRise[1]));
    const frontReach = after > 0 ? ARM_REACH * .5
      : t <= BOUND ? THREE.MathUtils.lerp(ARM_REACH * .60, ARM_REACH - .01, rising)
      : THREE.MathUtils.lerp(ARM_REACH - .01, ARM_REACH * .5, ease(span(t, BACK_FOOT, 1)));
    pose.leftHand.copy(shoulder(-1)).addScaledVector(armDirection(front, -.16), frontReach);
    // Running in, his arms run: they pump against his legs — the left hand
    // forward as the right foot comes through — with the elbows driving back
    // past his ribs and the hands clear of his sides. Held at a fixed bend
    // from the shoulder instead, both forearms stuck out level at his waist
    // for the whole approach. They hand over to the bowling arm and the front
    // arm before the bound, so the gather and the delivery are untouched.
    if (after === 0 && t < BOUND) {
      const w = 1 - ease(span(t, BOUND - .14, BOUND));
      const gait = ease(span(t, 0, WALK_UP));
      const turn = new THREE.Vector3(0, 1, 0);
      const local = (p: THREE.Vector3) => p.clone().applyAxisAngle(turn, -pose.yaw);
      const hipY = pose.hip.y, chestZ = local(pose.chest).z;
      for (const [hand, side, other] of [[pose.leftHand, -1, pose.rightFoot], [pose.rightHand, 1, pose.leftFoot]] as const) {
        const swing = THREE.MathUtils.clamp((local(other).z - local(pose.hip).z) / .5, -1, 1) * gait;
        const running = new THREE.Vector3(side * .27, hipY + .14 + Math.max(0, swing) * .24 * style.pump, chestZ * .6 + .04 + swing * .3 * style.pump)
          .applyAxisAngle(turn, pose.yaw);
        // The front arm leaves the run as it goes up, however early that is.
        hand.lerp(running, side < 0 ? w * (1 - rising) : w);
      }
      pose.elbowsBack = .5 * w;
    }
    // The slinger's carry: the ball held at the chest in both hands all the
    // way in, let go of in the last stride before the leap — the front hand
    // to go up, the ball hand to drop away behind. Measured in his own frame,
    // right is +x and forward +z, and turned with him.
    if (style.carry === 'chest' && after === 0) {
      const held = 1 - ease(span(t, .42, .56));
      if (held > 0) {
        const turn = new THREE.Vector3(0, 1, 0);
        const local = (p: THREE.Vector3) => p.clone().applyAxisAngle(turn, -pose.yaw);
        const chest = local(pose.chest);
        const at = (x: number) => new THREE.Vector3(x, chest.y - .06, chest.z + .3).applyAxisAngle(turn, pose.yaw);
        pose.rightHand.lerp(at(.03), held);
        pose.leftHand.lerp(at(-.06), held);
        // Hands together in front of the chest want the elbows down and out,
        // not driven back like a runner's.
        pose.elbowsBack = (pose.elbowsBack ?? 0) * (1 - held);
      }
    }
  }
}

/**
 * Where the phases fall, as fractions of the run-up. Exported so the tests can
 * sample the moment a foot is actually planted rather than a number typed in
 * beside it, which goes stale the first time the action is re-timed.
 */
export const PHASES = { BOUND, BACK_FOOT, BACK_LIFT, STRIDE_START, FRONT_FOOT } as const;
/** And the follow-through's, as fractions of it: fallen away, then back on his feet. */
export const FOLLOW_PHASES = { FOLLOWED, RECOVERED } as const;
/** The action's length end to end, for anything that needs to wait it out. */
export const ACTION_MS = RUNUP_MS + FOLLOW_MS;
/** The top of his mark, and where his hips finish. Read by the action's tests. */
export const RUNUP_START_Z = PACE_RUN.startZ;
export const RELEASE_Z = RELEASE_HIP_Z;
