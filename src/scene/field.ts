import * as THREE from 'three';
import type { Kit } from '../entities/Cricketer';
import {
  DIVE, Fielder, REACTION_MS, Routine, diveReach, furthest, idle, midpointOfHands, onField, planCatch, splitStep, travel,
  type Action, type CatchPlan, type Idle, type Spot,
} from '../entities/Fielder';

/**
 * The fielding side: six men with somewhere to be.
 *
 * Four on the ring, where the camera can see them and where a mishit comes
 * down, and two in the deep. Six because that is how many figures the scene
 * already carried — five that stood and a sixth that was moved to the ball —
 * and a seventh is another fifty draw calls the frame budget does not have.
 *
 * Each of them follows a `Routine`, and this is what writes them: waiting on
 * the mark, walking in with the bowler, the split step as the ball arrives,
 * and then either going for it or watching it and walking back. Nobody is
 * ever put anywhere; everywhere a fielder goes, he gets to.
 */

/** A mark on the field, by its angle from straight and its distance from the bat. */
function mark(angle: number, distance: number): Spot {
  const a = angle * Math.PI / 180, x = Math.sin(a) * distance, z = Math.cos(a) * distance;
  return { x, z, heading: Math.atan2(-x, -z) };
}

/**
 * Where they stand. Negative angles are the leg side. The ring is set where
 * the strokes go: midwicket for the sweeps and the leg-side swipe, mid-on and
 * mid-off either side of straight, cover for the drive square of it.
 */
export const MARKS: readonly { name: string; spot: Spot; style: Idle; deep: boolean }[] = [
  { name: 'Midwicket', spot: mark(-66, 18.5), style: 'hips', deep: false },
  { name: 'Mid-on', spot: mark(-26, 19), style: 'loose', deep: false },
  { name: 'Mid-off', spot: mark(15, 19), style: 'loose', deep: false },
  { name: 'Cover', spot: mark(52, 19.5), style: 'hips', deep: false },
  { name: 'Long-on', spot: mark(-12, 33), style: 'loose', deep: true },
  { name: 'Long-off', spot: mark(20, 33), style: 'hips', deep: true },
];

const SEEDS = [.4, 1.9, 3.1, 4.4, 5.2, 6.6];
/** How long walking in takes. The run-up is shorter, so he is still coming as the ball is let go. */
const WALK_IN_MS = 1300;
/** Back to the mark once the ball is dead. */
const WALK_BACK_MS = 1200;

const away = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

export class Field {
  readonly fielders = MARKS.map(() => new Fielder());
  private routines = MARKS.map((m, i) => new Routine([idle(m.spot, m.style, SEEDS[i])]));
  /** Who is under the ball this delivery, and the catch he is taking. */
  private catching: { index: number; plan: CatchPlan; dropped: boolean } | null = null;

  dress(kit: Kit) { for (const fielder of this.fielders) fielder.figure.dress(kit); }

  /** Pose everyone for this instant. */
  update(now: number) {
    this.fielders.forEach((fielder, i) => fielder.show(this.routines[i].at(now)));
  }

  /** A fresh delivery: whoever was under the last one is no longer catching it. */
  reset() { this.catching = null; }

  /**
   * The bowler sets off, and everyone stood on his mark walks in with him: the
   * ring a couple of strides, the deep a little less.
   */
  walkIn(now: number) {
    MARKS.forEach((m, i) => {
      const routine = this.routines[i];
      const body = routine.at(now);
      // Only a man waiting on his mark; one still on his way back from the
      // last ball carries on getting there.
      if (away(body, m.spot) > .3 || !routine.actions[routine.current(now)].name.startsWith('Waiting')) return;
      const forward = new THREE.Vector3(Math.sin(m.spot.heading), 0, Math.cos(m.spot.heading)).multiplyScalar(m.deep ? 1.3 : 2);
      const walk = travel(m.spot, { x: m.spot.x + forward.x, z: m.spot.z + forward.z }, now, WALK_IN_MS, 'stop', { name: 'Walking in' });
      this.routines[i] = new Routine([...recent(routine, now), walk]);
    });
  }

  /**
   * The ball is on its way: a split step from each of them, timed to land as
   * it reaches the bat.
   */
  set(now: number, contactAt: number) {
    this.routines.forEach((routine, i) => {
      const last = routine.actions[routine.actions.length - 1];
      if (last.name !== 'Walking in') return;
      const at = routine.at(last.end);
      const step = splitStep({ x: at.x, z: at.z, heading: MARKS[i].spot.heading }, Math.max(last.end, contactAt - 300, now));
      this.routines[i] = new Routine([...recent(routine, now), step]);
    });
  }

  /**
   * Off the bat. If it is going up to somebody, the fielder best placed sets
   * off after it; everyone else watches it, and when it is dead they all walk
   * back to their marks.
   *
   * `target` is where the stroke sends it. The answer is where the catcher's
   * hands actually are when it arrives — the flight should finish there, so
   * the ball comes down to a man who ran to it rather than a man appearing
   * under it.
   */
  struck(now: number, deadAt: number, look: (t: number) => THREE.Vector3 | null,
    take?: { target: THREE.Vector3; arrives: number; dropped: boolean }): CatchPlan | null {
    let plan: CatchPlan | null = null;
    let catcher = -1;
    if (take) {
      catcher = this.choose(now, take.target, take.arrives);
      const routine = this.routines[catcher];
      const from = routine.at(now);
      const spot: Spot = { x: from.x, z: from.z, heading: from.heading };
      // As far as he can get: a ball beyond a sprint and a dive is a ball he
      // gets as near to as he can, and the flight is bent to meet him there.
      const reach = furthest(Math.max(0, take.arrives - now - REACTION_MS - DIVE.catch)) + diveReach() * .95;
      const target = take.target.clone();
      const gap = away(spot, target);
      if (gap > reach) {
        const t = reach / gap;
        target.set(spot.x + (target.x - spot.x) * t, target.y, spot.z + (target.z - spot.z) * t);
      }
      plan = planCatch(spot, target, now, take.arrives, { dropped: take.dropped, look });
      // His own lead-in, then the plan without the split step it opens with:
      // he has already done that.
      const after = plan.routine.actions.slice(1);
      const end = after[after.length - 1];
      const back = this.homeward(catcher, plan.routine, end.start + (plan.style === 'dive' ? 1400 : 700));
      this.routines[catcher] = new Routine([...recent(routine, now), ...after, ...back], plan.routine.look);
      this.catching = { index: catcher, plan, dropped: take.dropped };
    }
    // Caught, the ball is dead in his hands, and the rest can go back then.
    const over = plan && !take?.dropped ? Math.min(deadAt, plan.catchAt + 250) : deadAt + 200;
    this.routines.forEach((routine, i) => {
      if (i === catcher) return;
      const back = this.homeward(i, routine, over);
      this.routines[i] = new Routine([...recent(routine, now), ...back], look);
    });
    return plan;
  }

  /**
   * The ball in the catcher's hands, for as long as he has it: between them
   * as he lands and slides, then up in the right one as he gets up with it.
   */
  held(now: number): THREE.Vector3 | null {
    if (!this.catching || this.catching.dropped || now < this.catching.plan.catchAt) return null;
    const routine = this.routines[this.catching.index];
    const body = routine.at(now);
    const middle = midpointOfHands(body);
    const rising = routine.actions.find(a => a.name.startsWith('Up') && a.start > this.catching!.plan.catchAt - 1);
    if (!rising || now < rising.start) return middle;
    return middle.lerp(onField(body, body.pose.rightHand), THREE.MathUtils.smoothstep(now, rising.start, rising.start + 500));
  }

  /**
   * Where everyone is and what they are doing, for the browser checks: each
   * man's hips on the field (which is where he really is, mid-dive and all),
   * and who is taking the catch.
   */
  state(now: number) {
    return {
      fielders: this.routines.map((routine, i) => {
        const body = routine.at(now);
        const hip = onField(body, body.pose.hip);
        return { name: MARKS[i].name, x: +hip.x.toFixed(3), y: +hip.y.toFixed(3), z: +hip.z.toFixed(3),
          action: routine.actions[routine.current(now)].name, home: +away(hip, MARKS[i].spot).toFixed(2) };
      }),
      held: this.held(now)?.toArray().map(v => +v.toFixed(3)) ?? null,
      catcher: this.catching ? MARKS[this.catching.index].name : null,
      catchAt: this.catching ? Math.round(this.catching.plan.catchAt) : null,
      style: this.catching?.plan.style ?? null,
      hands: this.catching ? this.catching.plan.hands.toArray().map(v => +v.toFixed(3)) : null,
    };
  }

  /** Who is best placed: whoever has least far to go to be under it. */
  private choose(now: number, target: THREE.Vector3, arrives: number) {
    let best = 0, score = Infinity;
    this.routines.forEach((routine, i) => {
      const at = routine.at(now);
      // Deep fielders are a last resort for a ball that comes down on the ring.
      const cost = away(at, target) / Math.max(.1, furthest(arrives - now - REACTION_MS) + diveReach()) + (MARKS[i].deep ? .25 : 0);
      if (cost < score) { score = cost; best = i; }
    });
    return best;
  }

  /** From wherever this routine leaves him at `from`, back to his mark and waiting there. */
  private homeward(i: number, routine: Routine, from: number): Action[] {
    const { spot, style } = MARKS[i];
    const there = routine.at(from);
    const distance = away(there, spot);
    if (distance < .15) return [idle(spot, style, SEEDS[i], from)];
    // A step or two he takes backwards, eyes on the bat; further than that he
    // turns and jogs.
    const near = distance < 4;
    const duration = near ? WALK_BACK_MS : Math.max(WALK_BACK_MS, distance / 3.4 * 1000);
    const back = travel({ x: there.x, z: there.z, heading: there.heading }, spot, from, duration, 'stop',
      { face: near ? spot.heading : undefined, name: 'Walking back' });
    return [back, idle(spot, style, SEEDS[i], from + duration)];
  }
}

/**
 * What a routine is doing at `now`, and the action before it if it is still
 * fading in: everything a new routine needs to carry on from it smoothly, and
 * nothing older, so a routine does not grow a ball at a time all innings.
 */
function recent(routine: Routine, now: number): Action[] {
  const i = routine.current(now);
  const current = routine.actions[i];
  return i > 0 && now - current.start < current.blend ? routine.actions.slice(i - 1, i + 1) : [current];
}
