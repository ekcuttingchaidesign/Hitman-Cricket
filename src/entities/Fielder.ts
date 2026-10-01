import * as THREE from 'three';
import { BUILD, Cricketer, SPINE, restPose, standPose, type Figure, type Kit } from './Cricketer';
import { ease, settle, span } from './rig';

/**
 * A fielder who does something.
 *
 * The five men in the deep used to be scenery — built once, posed once, never
 * touched — and the one who took catches was a sixth, parked at a spot of his
 * own and moved to the ball on the frame it was hit. Both were visible. A man
 * standing perfectly still while a four runs between his feet reads as a
 * cardboard cut-out, and a man who vanishes from midwicket and reappears under
 * the ball reads as exactly what he was.
 *
 * So this is built the way an animator's rig is, out of three layers, and
 * nothing in it is a canned clip:
 *
 *  - **Controls.** A `Body` is the whole of what an animator would key: where
 *    he stands and which way he faces, how far he is tipped over, where his
 *    hips are, and the end of every limb. The joints in between are solved, by
 *    the same two-bone IK with a pole that the bowler and the batter use — the
 *    knee leads the way he faces, the elbow drops away from the ribs.
 *  - **Actions.** Each thing a fielder does — waiting, walking in, the split
 *    step, running, diving, getting up — is a function from time to a `Body`.
 *    They are functions rather than keyframe tables because two of them have to
 *    answer to the ground: a running foot is planted where it lands and stays
 *    there while the body goes over it, and a dive has to finish with his hands
 *    on the ball.
 *  - **A routine.** Actions in a row, each crossfading out of the last, the
 *    way an animation mixer blends one clip into the next. `planCatch` writes
 *    one: wait, read it, run, dive, hold it, get up.
 *
 * Every number is in metres and milliseconds, and nothing in here touches a
 * scene, so the whole of it can be measured by a test without a browser.
 */

const LEG = BUILD.thigh + BUILD.shin;
/** Hip joints sit this far under the hip centre (see `Cricketer.apply`). */
const HIP_DROP = .04;
const HIP_X = BUILD.hipX;
/** A foot on the turf: the ankle's height when the sole is flat. */
const SOLE = .06;
/** Nothing in a pose reads its root; this is only there to satisfy the type. */
const NOWHERE = new THREE.Group();
const X_AXIS = new THREE.Vector3(1, 0, 0);

/** Which way a heading points, and the side it treats as `+x`. */
const ahead = (heading: number) => new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
const across = (heading: number) => new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
/** The shortest turn from one heading to another. */
const turnTo = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const lerpAngle = (from: number, to: number, w: number) => from + turnTo(from, to) * w;

export interface Spot { x: number; z: number; heading: number }

/** Everything an animator keys. Everything else is solved. */
export interface Body extends Spot {
  /** Tipped forward about his hips: nought stood up, about a right angle laid out flat in a dive. */
  pitch: number;
  /** Where his hips are, in his own frame: `x` across, `y` up, `z` the way he faces. */
  anchor: THREE.Vector3;
  pose: Figure;
}

/** From the field into his own frame, turned but not tipped. */
function intoSpot(p: THREE.Vector3, spot: Spot) {
  const dx = p.x - spot.x, dz = p.z - spot.z, c = Math.cos(spot.heading), s = Math.sin(spot.heading);
  return new THREE.Vector3(dx * c - dz * s, p.y, dx * s + dz * c);
}
/** From his own frame back out onto the field. */
function outOfSpot(p: THREE.Vector3, spot: Spot) {
  const c = Math.cos(spot.heading), s = Math.sin(spot.heading);
  return new THREE.Vector3(spot.x + p.x * c + p.z * s, p.y, spot.z - p.x * s + p.z * c);
}
const tipOf = (pitch: number) => new THREE.Quaternion().setFromAxisAngle(X_AXIS, pitch);

/** A point of the figure — a hand, a foot — out on the field. */
export function onField(body: Body, point: THREE.Vector3) {
  const local = point.clone().sub(body.pose.hip).applyQuaternion(tipOf(body.pitch)).add(body.anchor);
  return outOfSpot(local, body);
}
/** A point on the field, as the figure's own limbs would have to reach it. */
function fromField(body: Body, point: THREE.Vector3) {
  return intoSpot(point, body).sub(body.anchor).applyQuaternion(tipOf(-body.pitch)).add(body.pose.hip);
}

function copyPose(pose: Figure): Figure {
  return {
    ...pose, hip: pose.hip.clone(), chest: pose.chest.clone(),
    leftFoot: pose.leftFoot.clone(), rightFoot: pose.rightFoot.clone(),
    leftHand: pose.leftHand.clone(), rightHand: pose.rightHand.clone(),
  };
}

/** Two bodies, `w` of the way from one to the other. The crossfade between actions. */
export function mixBodies(a: Body, b: Body, w: number): Body {
  if (w <= 0) return a;
  if (w >= 1) return b;
  const P = a.pose, Q = b.pose, l = (u: THREE.Vector3, v: THREE.Vector3) => u.clone().lerp(v, w);
  return {
    x: THREE.MathUtils.lerp(a.x, b.x, w), z: THREE.MathUtils.lerp(a.z, b.z, w),
    heading: lerpAngle(a.heading, b.heading, w),
    pitch: THREE.MathUtils.lerp(a.pitch, b.pitch, w), anchor: l(a.anchor, b.anchor),
    pose: {
      root: P.root, hip: l(P.hip, Q.hip), chest: l(P.chest, Q.chest),
      yaw: lerpAngle(P.yaw, Q.yaw, w), lean: THREE.MathUtils.lerp(P.lean, Q.lean, w),
      leftFoot: l(P.leftFoot, Q.leftFoot), rightFoot: l(P.rightFoot, Q.rightFoot),
      leftHand: l(P.leftHand, Q.leftHand), rightHand: l(P.rightHand, Q.rightHand),
      headYaw: THREE.MathUtils.lerp(P.headYaw, Q.headYaw, w), headPitch: THREE.MathUtils.lerp(P.headPitch, Q.headPitch, w),
    },
  };
}

/** Stood upright: the hips are where the pose puts them and nothing is tipped. */
const upright = (spot: Spot, pose: Figure): Body => ({ ...spot, pitch: 0, anchor: pose.hip.clone(), pose });

/**
 * Turn the head at something on the field — the ball, nearly always — within
 * what a neck will do. Only for a man the right way up; a dive sets its own.
 */
function watch(body: Body, target: THREE.Vector3 | null | undefined) {
  if (!target) return body;
  const eye = body.anchor.clone().add(new THREE.Vector3(0, SPINE + .3, 0));
  const to = intoSpot(target, body).sub(eye);
  const flat = Math.hypot(to.x, to.z);
  // The head only. Turning the body with it would turn the hips, and swing a
  // planted foot out from under a leg that is only so long.
  body.pose.headYaw = THREE.MathUtils.clamp(Math.atan2(to.x, to.z) - body.pose.yaw, -1.4, 1.4);
  body.pose.headPitch = THREE.MathUtils.clamp(-Math.atan2(to.y, Math.max(flat, .01)), -.95, .5);
  return body;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** One thing a fielder does, between two times. Sampled outside them, it holds its ends. */
export interface Action {
  name: string;
  start: number;
  end: number;
  /** How long it takes to fade in from whatever came before. */
  blend: number;
  at(t: number, look?: THREE.Vector3 | null): Body;
}

export type Idle = 'loose' | 'hips';

/**
 * Waiting between balls. Nobody stands still: he breathes, his weight drifts
 * from one foot to the other, and every so often he looks about. Each fielder
 * gets his own `seed`, so the field never breathes in unison — which is the
 * whole of what makes a crowd of figures read as people rather than a pattern.
 *
 * `hips` is the other thing fielders do with their hands while the bowler
 * walks back.
 */
export function idle(spot: Spot, style: Idle, seed: number, start = -Infinity, end = Infinity): Action {
  return {
    name: style === 'hips' ? 'Waiting, hands on hips' : 'Waiting', start, end, blend: 260,
    at(t, look) {
      const pose = restPose(NOWHERE);
      const s = (period: number, offset = 0) => Math.sin(t / period * Math.PI * 2 + seed * 2.39 + offset);
      const breath = s(3600), drift = s(7700, 1.3);
      pose.hip.x += drift * .028;
      pose.hip.y -= Math.abs(drift) * .012;
      pose.chest.x += drift * .010;
      pose.chest.y += breath * .007;
      pose.lean = -drift * .025;
      if (style === 'hips') {
        // Knuckles on the hip bones, elbows out: the hands sit at the waist and
        // just behind it, so the solver throws the elbows wide on its own.
        pose.leftHand.set(-.20, pose.hip.y + .06, -.015);
        pose.rightHand.set(.20, pose.hip.y + .06, -.015);
      } else {
        pose.leftHand.y += breath * .005; pose.rightHand.y += breath * .005;
        pose.leftHand.z += s(5300, 2) * .02; pose.rightHand.z += s(5900, 4) * .02;
      }
      // A glance round now and then: mostly still, then a look away and back.
      const glance = Math.max(0, s(9100, 2.2)) ** 6;
      pose.headYaw = glance * .7 * Math.sign(s(18200, .4) || 1);
      pose.headPitch = .03 - breath * .015;
      const body = upright(spot, pose);
      return look ? watch(body, look) : body;
    },
  };
}

/**
 * The ready position — what the split step lands in. Feet a shoulder and a
 * half apart, knees well bent, weight forward, hands low and in front. It is
 * the moment the ball is being played, and every fielder on a real ground does
 * it at once.
 */
export function readyPose(depth = 1): Figure {
  const pose = standPose(NOWHERE);
  const d = depth;
  pose.hip.y = THREE.MathUtils.lerp(pose.hip.y, .80, d);
  pose.hip.z = .02 * d;
  pose.chest.set(0, pose.hip.y + SPINE * Math.cos(.32 * d), pose.hip.z + SPINE * Math.sin(.32 * d));
  pose.leftFoot.set(-.25 * d - .185 * (1 - d), SOLE, .06);
  pose.rightFoot.set(.25 * d + .185 * (1 - d), SOLE, -.02);
  // Low and in front, palms to the ball — as low as arms this long reach from
  // shoulders tipped this far forward.
  pose.leftHand.set(-.20, THREE.MathUtils.lerp(pose.hip.y - .045, .74, d), THREE.MathUtils.lerp(.115, .38, d));
  pose.rightHand.set(.20, THREE.MathUtils.lerp(pose.hip.y - .045, .74, d), THREE.MathUtils.lerp(.115, .38, d));
  pose.headPitch = -.12 * d;
  return pose;
}

/**
 * The split step: a little hop as the bowler lets go, landing wide and low in
 * the ready position just as the ball reaches the bat. Then he holds it.
 */
export function splitStep(spot: Spot, start: number, hopMs = 280, end = Infinity): Action {
  return {
    name: 'Split step', start, end, blend: 120,
    at(t, look) {
      const u = span(t, start, start + hopMs);
      const pose = readyPose(ease(u));
      const hop = Math.sin(Math.min(1, u * 1.15) * Math.PI);
      pose.hip.y += hop * .05;
      pose.chest.y += hop * .05;
      pose.leftFoot.y += hop * .045;
      pose.rightFoot.y += hop * .045;
      const body = upright(spot, pose);
      return look ? watch(body, look) : body;
    },
  };
}

// --- Locomotion -------------------------------------------------------------

/**
 * How a man moves at a given speed. One gait from a stroll to a flat sprint,
 * with every number sliding: the stride lengthens, a foot spends less of each
 * stride on the ground (most of a walk, under a third of a sprint), the knees
 * come up and the heels kick, the trunk tips into it and the arms go from
 * swinging to pumping.
 */
function gait(speed: number) {
  const run = THREE.MathUtils.smoothstep(speed, 1.8, 3.6);
  const cycle = THREE.MathUtils.lerp(.5 + .45 * speed, 1.15 + .29 * speed, THREE.MathUtils.smoothstep(speed, 1.9, 2.7));
  const duty = THREE.MathUtils.lerp(.6, .29, run);
  return {
    run, cycle, duty,
    lift: THREE.MathUtils.lerp(.07, .36, run),
    hip: THREE.MathUtils.lerp(.935, .885, run),
    lean: .05 + .028 * Math.min(speed, 8),
  };
}

/**
 * The top of a fielder's pace. Quick men in the deep touch eight metres a
 * second; the planner never asks for more, and the tests hold it to that,
 * because a man who has to cover the ground faster than this to be under the
 * ball has appeared there rather than run there.
 */
export const SPRINT = 8;
/** The slowest a moving man steps, in strides a second. */
const CADENCE = 1.5;
/** How quickly he gets up to speed: most of it in under half a second. */
const PICKUP_MS = 420;

export type Pace = 'stop' | 'go';

interface Sample { t: number; x: number; z: number; heading: number; motion: number; speed: number; phase: number }
interface Plant { x: number; z: number; t: number }

/**
 * Covering ground: from one spot towards a point, starting stood still, and
 * either pulling up there (`stop`) or arriving flat out (`go`, into a dive).
 *
 * It is worked out ahead, once, at about a quarter of a millisecond's grain:
 * where he is, how fast, and where every footfall lands. Feet are placed on the
 * field, not on him — a foot that comes down stays exactly there until it
 * lifts, while the body goes over the top of it. Placing feet relative to a
 * moving body is what makes a figure skate, and it is the first thing anyone
 * notices about one.
 *
 * `face`, when given, holds the body to that heading whichever way he goes: a
 * fielder walking back to his mark goes backwards with his eyes on the batter.
 */
export function travel(from: Spot, to: { x: number; z: number }, start: number, duration: number,
  pace: Pace, options: { face?: number; feet?: [THREE.Vector3, THREE.Vector3]; name?: string } = {}): Action & {
    speedAt(t: number): number; topSpeed: number; feetAt(t: number): [THREE.Vector3, THREE.Vector3];
  } {
  const dx = to.x - from.x, dz = to.z - from.z, distance = Math.hypot(dx, dz);
  const motion = distance > .001 ? Math.atan2(dx, dz) : from.heading;
  const T = Math.max(duration, 1) / 1000, tau = PICKUP_MS / 1000;
  const goTop = distance / Math.max(.05, T - tau * (1 - Math.exp(-T / tau)));
  const covered = (s: number) => pace === 'go'
    ? goTop * (s - tau * (1 - Math.exp(-s / tau)))
    : distance * ease(s / T);
  const facing = (s: number) => options.face ?? lerpAngle(from.heading, motion, settle(Math.min(1, s / .32)));

  // Where each foot starts: from whatever he was doing, or stood on his mark.
  const stood = (side: -1 | 1) => {
    const p = new THREE.Vector3(from.x, SOLE, from.z).addScaledVector(across(from.heading), side * .16);
    return options.feet ? options.feet[side < 0 ? 0 : 1].clone() : p;
  };
  const step = 1000 / 240;
  // First the run itself: where he is, how fast, how far through his stride.
  const samples: Sample[] = [];
  // The left foot is the one that goes first: half a stride out of step with
  // the right, and starting at the very moment it leaves the ground.
  let phase = gait(0).duty;
  let previous = 0;
  for (let ms = 0; ; ms += step) {
    const s = Math.min(ms, duration) / 1000;
    const along = covered(s);
    const speed = Math.max(0, (along - previous) / (step / 1000));
    previous = along;
    // Never slower than a short shuffle while he is still on the move: a man
    // pulling up takes quick little steps to stop, rather than freezing with a
    // foot in the air because the ground under him has stopped going by.
    if (ms > 0 && ms < duration) phase += Math.max(speed / gait(speed).cycle, CADENCE) * (step / 1000);
    const x = from.x + Math.sin(motion) * along, z = from.z + Math.cos(motion) * along;
    samples.push({ t: start + Math.min(ms, duration), x, z, heading: facing(s), motion, speed, phase });
    if (ms >= duration) break;
  }
  // Then the footfalls. Each foot comes down under where his hips will be
  // halfway through the time it stays down — known, because the whole run
  // is. A foot put down for the pace he is going at the instant it lands is
  // too far ahead of a man who is pulling up, and the hips sag to reach it.
  const plants: Plant[][] = [[{ ...xz(stood(-1)), t: start }], [{ ...xz(stood(1)), t: start }]];
  for (let i = 0; i < 2; i++) {
    let cycle = Math.floor(samples[0].phase + i * .5);
    for (let j = 1; j < samples.length; j++) {
      const own = samples[j].phase + i * .5;
      if (Math.floor(own) <= cycle) continue;
      cycle = Math.floor(own);
      let lift = j;
      while (lift + 1 < samples.length) {
        const next = samples[lift + 1], frac = next.phase + i * .5 - cycle;
        if (frac >= gait(next.speed).duty) break;
        lift++;
      }
      const middle = samples[Math.round((j + lift) / 2)];
      // Running off the end into a dive, he is still going: carry on at pace.
      const over = pace === 'go' && lift === samples.length - 1 ? (lift - j) / 2 * step / 1000 * middle.speed : 0;
      const p = new THREE.Vector3(middle.x, 0, middle.z).addScaledVector(ahead(motion), over)
        .addScaledVector(across(middle.heading), (i ? 1 : -1) * .12);
      plants[i].push({ x: p.x, z: p.z, t: samples[j].t });
    }
  }

  const sampleAt = (t: number) => {
    const i = THREE.MathUtils.clamp(Math.round((t - start) / step), 0, samples.length - 1);
    return samples[i];
  };
  const footAt = (i: number, at: Sample): THREE.Vector3 => {
    const list = plants[i];
    // The plant this foot is on, or last left: the latest one down by now —
    // by the sample's clock, which is the clock the stride's phase was read
    // from. Asking with the raw time puts a foot that has just come down back
    // on the plant it left, a metre behind him.
    let k = 0;
    while (k + 1 < list.length && list[k + 1].t <= at.t) k++;
    const g = gait(at.speed);
    const own = at.phase + i * .5;
    const frac = own - Math.floor(own);
    // In the air only if there is somewhere for it to come down: a stride
    // the move ends before finishing is never started.
    const swinging = frac >= g.duty && k + 1 < list.length;
    if (!swinging) return new THREE.Vector3(list[k].x, SOLE, list[k].z);
    const from = list[k], to = list[k + 1];
    const u = (frac - g.duty) / (1 - g.duty);
    const carry = ease(u);
    // The heel comes up behind early in the swing and the knee drives through:
    // the top of the arc is early, not halfway.
    const arc = Math.sin(Math.pow(u, .75) * Math.PI);
    return new THREE.Vector3(THREE.MathUtils.lerp(from.x, to.x, carry), SOLE + arc * g.lift,
      THREE.MathUtils.lerp(from.z, to.z, carry));
  };

  const action = {
    name: options.name ?? (pace === 'go' ? 'Running' : 'Moving'), start, end: start + duration, blend: 140,
    topSpeed: Math.max(...samples.map(s => s.speed)),
    speedAt: (t: number) => sampleAt(t).speed,
    feetAt(t: number): [THREE.Vector3, THREE.Vector3] { const at = sampleAt(t); return [footAt(0, at), footAt(1, at)]; },
    at(t: number, look?: THREE.Vector3 | null): Body {
      const at = sampleAt(t);
      const g = gait(at.speed);
      const spot = { x: at.x, z: at.z, heading: at.heading };
      const pose = standPose(NOWHERE);
      const feet = [footAt(0, at), footAt(1, at)].map(f => intoSpot(f, spot));
      pose.leftFoot.copy(feet[0]); pose.rightFoot.copy(feet[1]);
      // The hips ride as high as the gait wants, and no higher than a leg on the
      // ground can reach: a planted foot a long way behind pulls them down.
      // This is what gives a walk its bob and stops a sprinting leg coming
      // away at the knee.
      const own = [at.phase, at.phase + .5].map(p => p - Math.floor(p));
      let hipY = g.hip;
      for (let i = 0; i < 2; i++) {
        const foot = feet[i];
        const lateral = foot.x - (i ? 1 : -1) * HIP_X;
        const flat = Math.hypot(lateral, foot.z);
        const room = Math.sqrt(Math.max(0, (LEG * .985) ** 2 - flat * flat));
        // A foot leaving the ground lets go of the hips over the first part
        // of its swing, not all at once: let go on the frame it lifts and the
        // hips jump.
        const letGo = own[i] < g.duty ? 0 : ease((own[i] - g.duty) / (1 - g.duty) / .3);
        const limit = THREE.MathUtils.lerp(foot.y + room + HIP_DROP, g.hip, letGo);
        // Never below a deep lunge, whatever a stray foot asks.
        hipY = Math.max(.72, Math.min(hipY, limit));
      }
      pose.hip.set(0, hipY, 0);
      // And no foot further from its hip than the leg is long: a heel kicked up
      // behind, or the last instant of a push-off, comes in towards him rather
      // than leaving the shin short of the boot.
      feet.forEach((foot, i) => {
        const joint = new THREE.Vector3((i ? 1 : -1) * HIP_X, hipY - HIP_DROP, 0);
        const reach = foot.clone().sub(joint);
        if (reach.length() > LEG * .995) foot.copy(joint).addScaledVector(reach.normalize(), LEG * .995);
      });
      pose.leftFoot.copy(feet[0]); pose.rightFoot.copy(feet[1]);
      const lean = g.lean + (pace === 'go' ? .08 * (1 - span(t, start, start + 500)) : 0);
      pose.chest.set(0, hipY + SPINE * Math.cos(lean), SPINE * Math.sin(lean));
      // Arms against the legs: the left hand comes forward as the right foot
      // does. Walking they hang and swing; running they bend and pump, the
      // forward hand coming up to the chest.
      for (const [hand, side, other] of [[pose.leftHand, -1, feet[1]], [pose.rightHand, 1, feet[0]]] as const) {
        const swing = THREE.MathUtils.clamp(other.z / .5, -1, 1);
        const pump = g.run;
        hand.set(side * THREE.MathUtils.lerp(.215, .19, pump),
          THREE.MathUtils.lerp(hipY - .03 + Math.abs(swing) * .03, hipY + .16 + Math.max(0, swing) * .24, pump),
          THREE.MathUtils.lerp(.05 + swing * .17, pose.chest.z * .6 + swing * .30, pump));
      }
      pose.headPitch = -lean * .7;
      const body = upright(spot, pose);
      return look ? watch(body, look) : body;
    },
  };
  return action;
}
const xz = (p: THREE.Vector3) => ({ x: p.x, z: p.z });

// --- The dive ---------------------------------------------------------------

/** The dive's own clock. The ball is in his hands at `CATCH`. */
export const DIVE = { takeoff: 120, catch: 400, land: 450, settled: 560, slid: 800 } as const;

/**
 * Full length, at the ball. He drives off the last stride, goes flat through
 * the air with both arms out past his head, takes it at full stretch just
 * before he hits the ground, lands on his side or his front, and slides.
 *
 * `twist` is how far he rolls onto his side: nought is flat on his front
 * (a ball dropping short in front of him), towards a right angle is a man who
 * has gone sideways and lands on his shoulder still facing the bat. `speed`
 * is how fast he was going when he took off; it carries him further.
 */
export function dive(spot: Spot, start: number, options: { twist?: number; speed?: number; hands?: 'cupped' | 'spill'; end?: number } = {}): Action {
  const twist = options.twist ?? 0, speed = options.speed ?? 6;
  const flight = THREE.MathUtils.clamp(.75 + .2 * speed, .9, 2.3);
  const slide = THREE.MathUtils.clamp(.05 * speed, .05, .4);
  const { takeoff, catch: caught, land, settled, slid } = DIVE;
  return {
    name: 'Diving catch', start, end: options.end ?? start + slid + 200, blend: 90,
    at(t) {
      const ms = THREE.MathUtils.clamp(t - start, 0, slid + 200);
      const off = span(ms, 0, takeoff), air = span(ms, takeoff, land), down = span(ms, land, settled), skid = span(ms, settled, slid);
      // The hips: dip to load, up and out, down onto the turf, then skid.
      const z = .3 * off + flight * ease(air) + .12 * down + slide * settle(skid);
      const y = ms < takeoff ? THREE.MathUtils.lerp(.84, .72, ease(off))
        : ms < land ? THREE.MathUtils.lerp(.72, .34, air) + Math.sin(air * Math.PI) * .30
        : THREE.MathUtils.lerp(.34, .175, settle(down));
      const pitch = ms < takeoff ? .45 * ease(off)
        : ms < land ? THREE.MathUtils.lerp(.45, 1.40, settle(air))
        : THREE.MathUtils.lerp(1.40, 1.50, settle(down));
      const roll = twist * ease(span(ms, 0, land));

      const pose = standPose(NOWHERE);
      const hip = pose.hip.set(0, .90, 0);
      pose.chest.set(0, hip.y + SPINE, 0);
      // Both arms out beyond his head along the line of the body, a hand's
      // width apart and closing on the ball as it arrives.
      const shoulderY = hip.y + SPINE + BUILD.shoulderY;
      const stretch = ease(span(ms, 0, takeoff + 120));
      const close = options.hands === 'spill' ? ease(span(ms, caught - 60, caught)) * (1 - ease(span(ms, land + 40, settled + 120)))
        : ease(span(ms, caught - 60, caught));
      const width = THREE.MathUtils.lerp(.15, .06, close);
      for (const [hand, side] of [[pose.leftHand, -1], [pose.rightHand, 1]] as const) {
        hand.set(side * width,
          THREE.MathUtils.lerp(hip.y + .05, shoulderY + .60, stretch),
          THREE.MathUtils.lerp(.30, .16, stretch));
      }
      if (options.hands === 'spill') {
        // The ball goes on landing, and the hands come apart with it.
        const lost = ease(span(ms, land, settled + 120));
        pose.leftHand.x -= lost * .12; pose.rightHand.x += lost * .16;
        pose.leftHand.y -= lost * .18; pose.rightHand.z += lost * .12;
      }
      // Legs trail out behind, one straight, the take-off leg bent at the knee;
      // once he is down they come to rest on the grass rather than sticking
      // up behind him.
      const trail = ease(span(ms, takeoff * .4, takeoff + 140)), rest = ease(span(ms, land, slid));
      pose.leftFoot.set(-.10, hip.y - .84, -.05).lerp(new THREE.Vector3(-.12, hip.y - .86, .02), rest);
      pose.rightFoot.set(.09, hip.y - .58, -.40).lerp(new THREE.Vector3(.12, hip.y - .78, -.14), rest);
      pose.yaw = roll;
      // Rolled, the legs and arms go round with the body.
      for (const p of [pose.leftFoot, pose.rightFoot, pose.leftHand, pose.rightHand]) p.applyAxisAngle(new THREE.Vector3(0, 1, 0), roll);
      // Until he leaves the ground the feet are on it, driving: written on the
      // turf and solved back into a body that is already tipping over them.
      const body: Body = { ...spot, pitch, anchor: new THREE.Vector3(0, y, z), pose };
      if (trail < 1) {
        const tip = tipOf(-pitch);
        const grounded = (p: THREE.Vector3) => p.sub(body.anchor).applyQuaternion(tip).add(hip);
        pose.leftFoot.lerpVectors(grounded(new THREE.Vector3(-.12, SOLE, .12)), pose.leftFoot, trail);
        pose.rightFoot.lerpVectors(grounded(new THREE.Vector3(.13, SOLE + .1 * off, -.30)), pose.rightFoot, trail);
      }
      // A leg asked for more than it has drives off the toe instead.
      pose.leftFoot.copy(withinReach(pose, -1, pose.leftFoot));
      pose.rightFoot.copy(withinReach(pose, 1, pose.rightFoot));
      // Eyes along the arms, at the ball.
      pose.headPitch = -.15 - .55 * ease(span(ms, 0, land));
      return ms > takeoff ? aboveGround(body) : body;
    },
  };
}

/**
 * The floor. A body is posed by its hands and feet and its joints are solved,
 * so nothing in a pose says where a knee will end up — and a man lying flat,
 * or getting up off the grass, puts his knees and elbows down by it. This
 * solves the pose once on a figure kept for measuring, finds whatever went
 * furthest under the turf, and lifts him by that much: the floor constraint
 * every rig has, for the same reason.
 */
let probe: Cricketer | null = null;
const CLEARANCE = { foot: .03, knee: .03, hand: .03, elbow: .04, hip: .15 } as const;
export function aboveGround(body: Body): Body {
  probe ??= new Cricketer();
  probe.apply(copyPose(body.pose));
  const at = probe.inspect();
  const tip = tipOf(body.pitch);
  const height = (p: number[]) => new THREE.Vector3(p[0], p[1], p[2]).sub(body.pose.hip).applyQuaternion(tip).add(body.anchor).y;
  const under = Math.min(
    ...at.feet.map(p => height(p) - CLEARANCE.foot), ...at.knees.map(p => height(p) - CLEARANCE.knee),
    ...at.hands.map(p => height(p) - CLEARANCE.hand), ...at.elbows.map(p => height(p) - CLEARANCE.elbow),
    height(at.hip) - CLEARANCE.hip,
  );
  if (under < 0) body.anchor.y -= under;
  return body;
}

/** A foot brought in towards its hip until the leg can reach it. */
function withinReach(pose: Figure, side: -1 | 1, foot: THREE.Vector3) {
  const joint = new THREE.Vector3(side * HIP_X, pose.hip.y - HIP_DROP, pose.hip.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), pose.yaw);
  joint.x += pose.hip.x;
  const reach = foot.clone().sub(joint);
  return reach.length() > LEG * .995 ? joint.addScaledVector(reach.normalize(), LEG * .995) : foot.clone();
}

/**
 * Getting up off the turf after a dive: three poses an animator would key —
 * lying where he landed, up on his knees, stood — blended one into the next,
 * with the floor keeping the knees out of the grass on the way. He finishes
 * either with the ball held up in one hand or with both hands on his head.
 */
export function rise(from: Body, start: number, mood: 'held' | 'spilled', duration = 950, end = Infinity): Action {
  const spot: Spot = { x: from.x, z: from.z, heading: from.heading };
  const base = from.anchor.clone();
  const planted = (body: Body, z: number, spread: number) => {
    for (const [foot, side] of [[body.pose.leftFoot, -1], [body.pose.rightFoot, 1]] as const) {
      foot.copy(fromField(body, outOfSpot(new THREE.Vector3(base.x + side * spread, SOLE, z + (side > 0 ? .04 : -.02)), spot)));
    }
  };
  // On his knees: torso nearly upright, thighs down to the turf, shins flat
  // out behind, hands on his thighs.
  const kneel = (() => {
    const pose = standPose(NOWHERE);
    pose.hip.set(0, .9, 0);
    pose.chest.set(0, .9 + SPINE * Math.cos(.12), SPINE * Math.sin(.12));
    pose.leftHand.set(-.19, .86, .26); pose.rightHand.set(.19, .86, .26);
    const body: Body = { ...spot, pitch: .18, anchor: new THREE.Vector3(base.x, .55, base.z - .12), pose };
    planted(body, body.anchor.z - .44, .13);
    return body;
  })();
  const stood = (() => {
    const pose = restPose(NOWHERE);
    const body: Body = { ...spot, pitch: 0, anchor: new THREE.Vector3(base.x, pose.hip.y, base.z - .1), pose };
    planted(body, body.anchor.z, .12);
    return body;
  })();
  return {
    name: mood === 'held' ? 'Up with the ball' : 'Up, hands on head', start, end, blend: 0,
    at(t) {
      const u = span(t, start, start + duration);
      const body = u < .45 ? mixBodies(from, kneel, ease(u / .45)) : mixBodies(kneel, stood, ease((u - .45) / .55));
      // Mixing hands back a body that is shared with the keyframes it came from.
      const pose = copyPose(body.pose);
      const head = pose.chest.clone().add(new THREE.Vector3(0, .33, 0));
      if (mood === 'held') {
        // The catching hand goes up with the ball in it; the other hangs.
        pose.rightHand.lerp(new THREE.Vector3(.22, head.y + .36, .06), ease(span(u, .55, 1)));
      } else {
        const hold = ease(span(u, .5, .9));
        pose.leftHand.lerp(new THREE.Vector3(-.13, head.y + .1, -.02), hold);
        pose.rightHand.lerp(new THREE.Vector3(.13, head.y + .1, -.02), hold);
        pose.headPitch = THREE.MathUtils.lerp(pose.headPitch, .25, hold);
      }
      return aboveGround({ ...body, anchor: body.anchor.clone(), pose });
    },
  };
}

/**
 * Settled under a skied ball and taking it above his head. The hands go up as
 * it comes down; on `catch` they close round it and bring it in to the chest.
 */
export function highCatch(spot: Spot, start: number, at: number, end = Infinity): Action {
  return {
    name: 'Taking it high', start, end, blend: 160,
    at(t, look) {
      const reach = ease(span(t, at - 420, at - 40));
      const bring = ease(span(t, at + 120, at + 520));
      const pose = standPose(NOWHERE);
      const hipY = pose.hip.y + reach * .045 - bring * .03;
      pose.hip.y = hipY;
      pose.chest.set(0, hipY + SPINE, .015 - reach * .05 + bring * .05);
      for (const [hand, side] of [[pose.leftHand, -1], [pose.rightHand, 1]] as const) {
        hand.set(side * THREE.MathUtils.lerp(.15, .07, bring),
          THREE.MathUtils.lerp(THREE.MathUtils.lerp(hipY - .045, hipY + 1.03, reach), hipY + .32, bring),
          THREE.MathUtils.lerp(THREE.MathUtils.lerp(.115, .16, reach), .26, bring));
      }
      pose.rightFoot.z -= reach * .05;
      const body = upright(spot, pose);
      if (look) watch(body, look);
      return body;
    },
  };
}

// ---------------------------------------------------------------------------
// A routine: actions in a row, crossfaded
// ---------------------------------------------------------------------------

export class Routine {
  constructor(readonly actions: Action[], readonly look?: (t: number) => THREE.Vector3 | null) {}
  /** The action running at `t`: the last one to have started. */
  current(t: number) {
    let i = 0;
    while (i + 1 < this.actions.length && this.actions[i + 1].start <= t) i++;
    return i;
  }
  at(t: number): Body {
    const i = this.current(t), action = this.actions[i];
    const look = this.look?.(t) ?? null;
    const body = action.at(t, look);
    if (i === 0 || action.blend <= 0) return body;
    const w = ease((t - action.start) / action.blend);
    return w >= 1 ? body : mixBodies(this.actions[i - 1].at(t, look), body, w);
  }
  get end() { return this.actions[this.actions.length - 1].end; }
}

// ---------------------------------------------------------------------------
// Planning a catch
// ---------------------------------------------------------------------------

/** How long a fielder takes to read the ball off the bat before he moves. */
export const REACTION_MS = 230;

export interface CatchPlan {
  routine: Routine;
  /** Where his hands are when the ball arrives — where the ball has to finish. */
  hands: THREE.Vector3;
  /** When that is. */
  catchAt: number;
  /** How he takes it. */
  style: 'dive' | 'high';
  /** How fast he had to go, at the most. */
  topSpeed: number;
}

/** How far a man gets from standing in `ms`, flat out the whole way. */
export function furthest(ms: number) {
  const T = ms / 1000, tau = PICKUP_MS / 1000;
  return SPRINT * .995 * (T - tau * (1 - Math.exp(-T / tau)));
}

/**
 * Where his hands will be, `DIVE.catch` into a dive that starts at the spot.
 * A template dive is posed once and measured, so the planner can work
 * backwards from the ball to where he has to leave the ground.
 */
function handsInDive(twist: number, speed: number) {
  const action = dive({ x: 0, z: 0, heading: 0 }, 0, { twist, speed });
  const body = action.at(DIVE.catch);
  return midpointOfHands(body);
}
export function midpointOfHands(body: Body) {
  return onField(body, body.pose.leftHand).add(onField(body, body.pose.rightHand)).multiplyScalar(.5);
}

/**
 * Plan a fielder's catch. He is on `home`, facing the bat. The ball is struck
 * at `hitAt` and will be at `ball` (on the field, at catching height) at
 * `arrives`. Close enough to settle under, he settles under it and takes it
 * high; further, he reads it, sprints, and dives the last of it.
 *
 * `ball` is where the ball is *going*. The plan answers with where his hands
 * actually are at that moment, and the flight should be bent to finish there.
 */
export function planCatch(home: Spot, ball: THREE.Vector3, hitAt: number, arrives: number,
  options: { dropped?: boolean; seed?: number; look?: (t: number) => THREE.Vector3 | null; batter?: { x: number; z: number } } = {}): CatchPlan {
  const batter = options.batter ?? { x: 0, z: 0 };
  const go = hitAt + REACTION_MS;
  const actions: Action[] = [];
  const ready = splitStep(home, hitAt - 300);
  actions.push(ready);
  const away = Math.hypot(ball.x - home.x, ball.z - home.z);
  const window = arrives - go;

  // Near enough to walk under it, and with time to: no need to throw himself.
  if (away < 2.2 || away / Math.max(.2, (window - 450) / 1000) < 2.6) {
    const heading = Math.atan2(batter.x - ball.x, batter.z - ball.z);
    const under: Spot = { x: ball.x, z: ball.z, heading };
    // He turns and goes, and squares up to the bat as he settles: holding his
    // heading while moving sideways crosses his legs.
    const move = travel(home, under, go, Math.max(300, window - 420), 'stop');
    const take = highCatch(under, move.end, arrives);
    actions.push(move, take);
    // Watching it into his hands and no further: once he holds it, the ball
    // goes where his hands go, and asking it where to look would ask him.
    const routine = new Routine(actions, t => (t < arrives ? options.look?.(t) ?? null : null));
    return { routine, hands: midpointOfHands(routine.at(arrives)), catchAt: arrives, style: 'high', topSpeed: move.topSpeed };
  }

  // Otherwise a sprint and a dive. He runs straight at it and goes the last of
  // the way through the air. He rolls to keep his chest to the bat, so a ball
  // going away from him is a dive on to his side and one dropping short of him
  // a dive on to his front.
  let heading = Math.atan2(ball.x - home.x, ball.z - home.z);
  const toBat = Math.atan2(batter.x - ball.x, batter.z - ball.z);
  const twist = THREE.MathUtils.clamp(turnTo(heading, toBat), -1.35, 1.35) * .9;
  let speed = 6;
  let takeoff = new THREE.Vector3();
  let run!: ReturnType<typeof travel>;
  for (let pass = 0; pass < 3; pass++) {
    const reach = handsInDive(twist, speed);
    // Leave the ground where the template's hands land on the ball.
    const back = outOfSpot(new THREE.Vector3(reach.x, 0, reach.z), { x: 0, z: 0, heading });
    takeoff = new THREE.Vector3(ball.x - back.x, 0, ball.z - back.z);
    heading = Math.atan2(takeoff.x - home.x, takeoff.z - home.z);
    // No further than a sprint gets him. Asked for more, he dives from as far
    // as he gets, and the hands the plan reports are short of the ball — the
    // caller bends the flight to them, or picks a fielder who can get there.
    const running = Math.max(200, window - DIVE.catch);
    const most = furthest(running);
    const want = Math.hypot(takeoff.x - home.x, takeoff.z - home.z);
    if (want > most) takeoff.set(home.x + Math.sin(heading) * most, 0, home.z + Math.cos(heading) * most);
    run = travel(home, takeoff, go, running, 'go', { name: 'Sprinting' });
    speed = run.speedAt(run.end);
  }
  const leap: Spot = { x: takeoff.x, z: takeoff.z, heading };
  const diveStart = run.end;
  const flying = dive(leap, diveStart, { twist, speed, hands: options.dropped ? 'spill' : 'cupped' });
  actions.push(run, flying);
  const lying = flying.at(diveStart + DIVE.slid + 200);
  actions.push(rise(lying, diveStart + DIVE.slid + 260, options.dropped ? 'spilled' : 'held'));
  const routine = new Routine(actions, t => (t < diveStart ? options.look?.(t) ?? null : null));
  return {
    routine, hands: midpointOfHands(flying.at(diveStart + DIVE.catch)), catchAt: diveStart + DIVE.catch,
    style: 'dive', topSpeed: run.topSpeed,
  };
}

// ---------------------------------------------------------------------------
// The figure
// ---------------------------------------------------------------------------

/**
 * A fielder on the field: the holder that stands on the turf and turns, and the
 * articulated figure inside it, which tips over and is posed. The holder is
 * what a contact shadow belongs on; the figure is what dives.
 */
export class Fielder {
  readonly root = new THREE.Group();
  readonly figure: Cricketer;
  constructor(kit?: Kit) {
    this.figure = new Cricketer(kit);
    this.root.name = 'Fielder';
    this.root.add(this.figure.root);
  }
  show(body: Body) {
    this.root.position.set(body.x, 0, body.z);
    this.root.rotation.set(0, body.heading, 0);
    const tip = tipOf(body.pitch);
    this.figure.root.quaternion.copy(tip);
    this.figure.root.position.copy(body.anchor).sub(body.pose.hip.clone().applyQuaternion(tip));
    this.figure.apply(copyPose(body.pose));
  }
}
