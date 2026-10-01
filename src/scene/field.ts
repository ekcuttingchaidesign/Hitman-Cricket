import * as THREE from 'three';
import type { Kit } from '../entities/Cricketer';
import {
  DIVE, Fielder, REACTION_MS, Routine, diveReach, furthest, idle, midpointOfHands, onField, planCatch, splitStep, travel,
  type Action, type CatchPlan, type Idle, type Spot,
} from '../entities/Fielder';

/**
 * The fielding side: six men with somewhere to be.
 *
 * Six because that is how many figures the scene already carried — five that
 * stood and a sixth that was moved to the ball — and a seventh is another
 * fifty draw calls the frame budget does not have.
 *
 * Each of them follows a `Routine`, and this is what writes them: waiting on
 * the mark, walking in with the bowler, the split step as the ball arrives,
 * and then either going for it or watching it and walking back. Nobody is
 * ever put anywhere; everywhere a fielder goes, he gets to. And nobody does
 * anything on the same frame as anybody else: each man's walk in, split step
 * and walk back is his own, dealt fresh every ball, because six figures
 * moving in step read as one machine.
 */

export interface Mark { name: string; spot: Spot; style: Idle; deep: boolean }

/** A mark on the field, by its angle from straight and its distance from the bat. */
function mark(angle: number, distance: number): Spot {
  const a = angle * Math.PI / 180, x = Math.sin(a) * distance, z = Math.cos(a) * distance;
  return { x, z, heading: Math.atan2(-x, -z) };
}

/**
 * The Blast: a slogger's field. Two saving the single on the ring and four
 * back on the rope, because the man at the crease is trying to clear it.
 * Negative angles are the leg side. The rope is forty metres away straight and
 * about thirty-five square, so the deep men stand a few metres inside it.
 */
export const BLAST_FIELD: readonly Mark[] = [
  { name: 'Mid-on', spot: mark(-25, 22), style: 'loose', deep: false },
  { name: 'Mid-off', spot: mark(24, 22), style: 'hips', deep: false },
  { name: 'Long-on', spot: mark(-11, 34), style: 'hips', deep: true },
  { name: 'Long-off', spot: mark(12, 34), style: 'loose', deep: true },
  { name: 'Deep midwicket', spot: mark(-52, 31), style: 'loose', deep: true },
  { name: 'Deep cover', spot: mark(50, 31), style: 'hips', deep: true },
];

/**
 * The Test match: an attacking field for a batter trying to survive. Four on
 * the ring to stop him getting off strike and catch anything in the air, two
 * back for the one he does middle.
 */
export const TEST_FIELD: readonly Mark[] = [
  { name: 'Midwicket', spot: mark(-66, 18.5), style: 'hips', deep: false },
  { name: 'Mid-on', spot: mark(-26, 19), style: 'loose', deep: false },
  { name: 'Mid-off', spot: mark(15, 19), style: 'loose', deep: false },
  { name: 'Cover', spot: mark(52, 19.5), style: 'hips', deep: false },
  { name: 'Long-on', spot: mark(-12, 33), style: 'loose', deep: true },
  { name: 'Long-off', spot: mark(20, 33), style: 'hips', deep: true },
];

const SEEDS = [.4, 1.9, 3.1, 4.4, 5.2, 6.6];
/** Back to the mark once the ball is dead, before each man's own pace is laid on it. */
const WALK_BACK_MS = 1150;

const away = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * A number in [0, 1) that is the same every time for the same fielder, ball
 * and question, and unrelated to the next. Dealt rather than drawn from
 * `Math.random`, so a seeded innings plays the same field twice and a check
 * can watch it.
 */
function deal(fielder: number, ball: number, salt: number) {
  const x = Math.sin(fielder * 12.9898 + ball * 78.233 + salt * 37.719) * 43758.5453;
  return x - Math.floor(x);
}

/** Whether the camera can see a point on the field. */
export type Visible = (point: THREE.Vector3) => boolean;

export class Field {
  readonly fielders = BLAST_FIELD.map(() => new Fielder());
  private marks: readonly Mark[] = BLAST_FIELD;
  private routines = this.marks.map((m, i) => new Routine([idle(m.spot, m.style, SEEDS[i])]));
  /** Who is under the ball this delivery, and the catch he is taking. */
  private catching: { index: number; plan: CatchPlan; dropped: boolean } | null = null;
  /** Deliveries walked in for, so every ball deals each man a different walk. */
  private ball = 0;

  dress(kit: Kit) { for (const fielder of this.fielders) fielder.figure.dress(kit); }

  /**
   * Set the field for an innings. They are put on their marks rather than
   * walked there: this happens on the way out of the mode screen, before
   * anybody is watching.
   */
  setField(marks: readonly Mark[]) {
    if (marks === this.marks) return;
    this.marks = marks;
    this.routines = marks.map((m, i) => new Routine([idle(m.spot, m.style, SEEDS[i])]));
    this.catching = null;
  }

  /** Pose everyone for this instant. */
  update(now: number) {
    this.fielders.forEach((fielder, i) => fielder.show(this.routines[i].at(now)));
  }

  /** A fresh delivery: whoever was under the last one is no longer catching it. */
  reset() { this.catching = null; }

  /**
   * The bowler sets off, and the field walks in with him — each man when he
   * is ready, at his own pace and as far as he feels like. Some of the deep
   * men do not bother.
   */
  walkIn(now: number) {
    this.ball++;
    this.marks.forEach((m, i) => {
      const routine = this.routines[i];
      const body = routine.at(now);
      // Only a man waiting on his mark; one still on his way back from the
      // last ball carries on getting there.
      if (away(body, m.spot) > .3 || !routine.actions[routine.current(now)].name.startsWith('Waiting')) return;
      if (m.deep && deal(i, this.ball, 1) < .3) return;
      const r = (salt: number) => deal(i, this.ball, salt);
      const distance = m.deep ? .8 + r(2) * .9 : 1.3 + r(2) * 1.1;
      const forward = new THREE.Vector3(Math.sin(m.spot.heading), 0, Math.cos(m.spot.heading)).multiplyScalar(distance);
      const walk = travel(m.spot, { x: m.spot.x + forward.x, z: m.spot.z + forward.z },
        now + 60 + r(3) * 480, 900 + r(4) * 650, 'stop', { name: 'Walking in' });
      this.routines[i] = new Routine([...recent(routine, now), walk]);
    });
  }

  /**
   * The ball is on its way: a split step from each of them, near enough to
   * when it reaches the bat — a man reads it a touch early or a touch late —
   * and from wherever his walk in left him.
   */
  set(now: number, contactAt: number) {
    this.routines.forEach((routine, i) => {
      // Walking in, or still waiting on his mark; a man on his way back from
      // the last ball keeps going.
      const last = routine.actions[routine.actions.length - 1];
      const waiting = last.name.startsWith('Waiting') && away(routine.at(now), this.marks[i].spot) < .3;
      if (last.name !== 'Walking in' && !waiting) return;
      const r = (salt: number) => deal(i, this.ball, salt);
      const from = Math.max(now, last.name === 'Walking in' ? last.end : now, contactAt - 300 + (r(5) - .5) * 180);
      const at = routine.at(from);
      const step = splitStep({ x: at.x, z: at.z, heading: this.marks[i].spot.heading }, from, 230 + r(6) * 120);
      this.routines[i] = new Routine([...recent(routine, now), step]);
    });
  }

  /**
   * Off the bat. If it is going up to somebody, a catch is found for it and
   * the fielder it belongs to sets off; everyone else watches it, and when it
   * is dead they wander back to their marks.
   *
   * The catch is put where the camera can see it, along the line of the
   * stroke as near as that allows, and far enough from the nearest man that
   * he has to run for it — usually in from outside the frame — and close
   * enough that he gets there. The answer is where his hands are when it
   * arrives, which is where the flight should finish.
   */
  struck(now: number, deadAt: number, look: (t: number) => THREE.Vector3 | null,
    take?: { angle: number; height: number; arrives: number; dropped: boolean; visible: Visible }): CatchPlan | null {
    let plan: CatchPlan | null = null;
    let catcher = -1;
    if (take) {
      const spots = this.routines.map(routine => { const at = routine.at(now); return { x: at.x, z: at.z, heading: at.heading }; });
      const found = this.findCatch(spots, now, take);
      catcher = found.index;
      plan = planCatch(spots[catcher], found.target, now, take.arrives, { dropped: take.dropped, look });
      // His own lead-in, then the plan without the split step it opens with:
      // he has already done that.
      const after = plan.routine.actions.slice(1);
      const end = after[after.length - 1];
      const back = this.homeward(catcher, plan.routine, end.start + (plan.style === 'dive' ? 1400 : 700));
      this.routines[catcher] = new Routine([...recent(this.routines[catcher], now), ...after, ...back], plan.routine.look);
      this.catching = { index: catcher, plan, dropped: take.dropped };
    }
    // Caught, the ball is dead in his hands, and the rest can go back then.
    const over = plan && !take?.dropped ? Math.min(deadAt, plan.catchAt + 250) : deadAt + 200;
    this.routines.forEach((routine, i) => {
      if (i === catcher) return;
      const back = this.homeward(i, routine, over + deal(i, this.ball, 7) * 450);
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
        return { name: this.marks[i].name, deep: this.marks[i].deep, x: +hip.x.toFixed(3), y: +hip.y.toFixed(3), z: +hip.z.toFixed(3),
          action: routine.actions[routine.current(now)].name, home: +away(hip, this.marks[i].spot).toFixed(2),
          plan: routine.actions.map(a => `${a.name}@${Math.round(a.start)}`).join(' > ') };
      }),
      catcher: this.catching ? this.marks[this.catching.index].name : null,
      catchAt: this.catching ? Math.round(this.catching.plan.catchAt) : null,
      style: this.catching?.plan.style ?? null,
      hands: this.catching ? this.catching.plan.hands.toArray().map(v => +v.toFixed(3)) : null,
      held: this.held(now)?.toArray().map(v => +v.toFixed(3)) ?? null,
    };
  }

  /**
   * Where a skied ball comes down, and who it comes down to.
   *
   * Points are tried along the stroke's line and then either side of it,
   * at catching distances — as far round as it takes to find one in shot,
   * since a square drive sliced up off the toe can go anywhere, and a phone
   * held upright sees only twenty degrees either side of straight. A point has to
   * be in shot. Then the nearest man to it has to be able to get there — a
   * sprint and a dive — and the best of them is the one that makes him run
   * most of that, so the catch is a man arriving, not a man who was already
   * standing there. Nothing in shot that anyone can reach (a field set deep
   * and a short hang can do it) falls back to the stroke's own line and the
   * best-placed man, and the flight is bent to wherever he gets to.
   */
  private findCatch(spots: Spot[], now: number, take: { angle: number; height: number; arrives: number; visible: Visible }) {
    const reach = furthest(Math.max(0, take.arrives - now - REACTION_MS - DIVE.catch)) + diveReach() * .95;
    let best: { index: number; target: THREE.Vector3; score: number } | null = null;
    const toward = (angle: number, distance: number) =>
      new THREE.Vector3(Math.sin(angle) * distance, take.height, Math.cos(angle) * distance);
    for (let swing = 0; swing <= 90; swing += 2) {
      for (const side of swing ? [1, -1] : [1]) {
        const angle = take.angle + side * swing * Math.PI / 180;
        for (let distance = 15; distance <= 28; distance += 1) {
          const target = toward(angle, distance);
          if (!take.visible(target)) continue;
          let index = 0, gap = Infinity;
          spots.forEach((spot, i) => { const d = away(spot, target); if (d < gap) { gap = d; index = i; } });
          if (gap > reach * .9) continue;
          const score = Math.abs(gap - reach * .7) + swing * .12 + Math.abs(distance - 20) * .15;
          if (!best || score < best.score) best = { index, target, score };
        }
      }
    }
    if (best) return best;
    const target = toward(take.angle, 19);
    let index = 0, gap = Infinity;
    spots.forEach((spot, i) => { const d = away(spot, target); if (d < gap) { gap = d; index = i; } });
    // As far as he can get: the flight is bent to meet him there.
    if (gap > reach) {
      const spot = spots[index], t = reach / gap;
      target.set(spot.x + (target.x - spot.x) * t, target.y, spot.z + (target.z - spot.z) * t);
    }
    return { index, target };
  }

  /** From wherever this routine leaves him at `from`, back to his mark and waiting there. */
  private homeward(i: number, routine: Routine, from: number): Action[] {
    const { spot, style } = this.marks[i];
    const there = routine.at(from);
    const distance = away(there, spot);
    if (distance < .15) return [idle(spot, style, SEEDS[i], from)];
    // A step or two he takes backwards, eyes on the bat; further than that he
    // turns and jogs.
    const near = distance < 4;
    const pace = .85 + deal(i, this.ball, 8) * .4;
    const duration = (near ? WALK_BACK_MS : Math.max(WALK_BACK_MS, distance / 3.4 * 1000)) * pace;
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
