import * as THREE from 'three';
import type { Kit } from '../entities/Cricketer';
import {
  DIVE, Fielder, PICKED_UP, REACTION_MS, Routine, diveReach, furthest, gather, idle, midpointOfHands, onField, planCatch,
  splitStep, travel, type Action, type CatchPlan, type Idle, type Spot,
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
  /** Who is picking up a ball along the ground, and when it is in his hand. */
  private gathering: { index: number; at: number } | null = null;
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
    this.catching = null; this.gathering = null;
  }

  /** Pose everyone for this instant. */
  update(now: number) {
    this.fielders.forEach((fielder, i) => fielder.show(this.routines[i].at(now)));
  }

  /** A fresh delivery: whoever was under the last one is no longer catching it. */
  reset() { this.catching = null; this.gathering = null; }

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
      // Anyone on his mark, whatever he is doing there — the end of the last
      // ball's walk back is dealt to each man separately, so one can still be
      // holding his crouch on the spot for a moment after the bowler sets
      // off. Asking for "waiting" left him stood there while the rest walked
      // in. One still on his way back from the last ball carries on getting
      // there.
      if (away(body, m.spot) > .3) return;
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
    if (this.gathering && now >= this.gathering.at) {
      const body = this.routines[this.gathering.index].at(now);
      return onField(body, body.pose.rightHand);
    }
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
   * A line along the ground that does not go through anybody. A ball struck
   * at a man is struck to one side of him or the other, never between his
   * boots; this turns the stroke's angle the least it takes to leave every
   * fielder at least a stride and a half from it, away from whoever it would
   * have hit. Near enough is the point: he dives for it, and it beats him.
   */
  clear(now: number, angle: number, distance: number): number {
    const CLEAR = 1.7;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const routine of this.routines) {
        const at = routine.at(now);
        const along = at.x * Math.sin(angle) + at.z * Math.cos(angle);
        if (along < 3 || along > distance - .5) continue;
        const across = at.x * Math.cos(angle) - at.z * Math.sin(angle);
        if (Math.abs(across) >= CLEAR) continue;
        // Turn the line away from him: towards the side he is not on.
        const side = across >= 0 ? 1 : -1;
        angle += side * Math.atan2(CLEAR - Math.abs(across), along) * 1.05;
        moved = true;
      }
      if (!moved) break;
    }
    return angle;
  }

  /**
   * A ball along the ground, from `from` to `to` over `flightMs`, stopping
   * there unless it is going for four.
   *
   * Anybody it passes within a dive of goes full length at it and misses —
   * the run of the game decided it is not stopped, so it beats him by a hand.
   * Going for four, the man in the deep nearest where it reaches the rope
   * goes for it too, diving if he can get there and chasing it to the rope
   * if he cannot. Stopping in the field, the nearest man runs to where it
   * stops and picks it up. Everyone else watches it and wanders back.
   *
   * Answers with whether somebody is going to pick it up, which means the
   * ball should stay in sight where it stops until he does.
   */
  ground(now: number, deadAt: number, look: (t: number) => THREE.Vector3 | null,
    path: { from: THREE.Vector3; to: THREE.Vector3; flightMs: number; four: boolean }): { gathered: boolean } {
    const dir = path.to.clone().sub(path.from).setY(0);
    const length = dir.length();
    if (length < 2) { this.struck(now, deadAt, look); return { gathered: false }; }
    dir.divideScalar(length);
    const spots = this.routines.map(routine => { const at = routine.at(now); return { x: at.x, z: at.z, heading: at.heading }; });
    /** Where along the line it passes him, how far off it he is, and when it gets there. */
    const passing = (spot: Spot) => {
      const along = THREE.MathUtils.clamp((spot.x - path.from.x) * dir.x + (spot.z - path.from.z) * dir.z, 0, length);
      const point = path.from.clone().addScaledVector(dir, along).setY(.12);
      return { point, gap: away(spot, point), at: now + along / length * path.flightMs, along };
    };
    const reachBy = (at: number) => furthest(Math.max(0, at - now - REACTION_MS - DIVE.catch)) + diveReach() * .95;
    /**
     * When his hands get to the line: just after the ball, or as soon as a man
     * can react and get down if that is later still. Struck hard at him, it
     * is past before he is down — which is what being beaten looks like.
     */
    const late = (at: number) => Math.max(at + 40, now + REACTION_MS + DIVE.catch + 60);
    const busy = new Set<number>();
    const dives: number[] = [];

    // At it full length, and beaten.
    spots.forEach((spot, i) => {
      const pass = passing(spot);
      // Past him before it stops, and close enough to throw himself at.
      if (pass.along > length - .8 || pass.gap > reachBy(late(pass.at))) return;
      dives.push(i);
    });
    dives.sort((a, b) => passing(spots[a]).gap - passing(spots[b]).gap);
    for (const i of dives.slice(0, 2)) {
      const pass = passing(spots[i]);
      this.diveAt(i, spots[i], { ...pass, at: late(pass.at) - 40 }, now, look);
      busy.add(i);
    }

    if (path.four) {
      // The man in the deep nearest where it reaches the rope goes after it.
      const rope = path.from.clone().addScaledVector(dir, Math.min(length, ropeAlong(path.from, dir) - 1.5)).setY(.12);
      let chaser = -1, best = Infinity;
      spots.forEach((spot, i) => {
        if (busy.has(i)) return;
        const d = away(spot, rope) + (this.marks[i].deep ? 0 : 6);
        if (d < best) { best = d; chaser = i; }
      });
      // Always somebody, and a man from the deep if one is free: a four along
      // the ground with nobody going after it is the thing this is here to stop.
      if (chaser >= 0) {
        const spot = spots[chaser], pass = passing(spot);
        if (pass.gap <= reachBy(late(pass.at)) && pass.along < length - .8) this.diveAt(chaser, spot, { ...pass, at: late(pass.at) - 40 }, now, look);
        else this.chase(chaser, spot, rope, now, path.flightMs * (ropeAlong(path.from, dir) / length), look);
        busy.add(chaser);
      }
    } else {
      // Stopping in the field: the nearest man free goes and picks it up.
      let picker = -1, best = Infinity;
      spots.forEach((spot, i) => {
        if (busy.has(i)) return;
        const d = away(spot, path.to);
        if (d < best) { best = d; picker = i; }
      });
      if (picker >= 0 && best < 28) {
        this.pickUp(picker, spots[picker], path.to.clone().setY(.07), now, now + path.flightMs, look);
        busy.add(picker);
      }
    }

    // Everyone else watches it go and wanders back once it is dead.
    this.routines.forEach((routine, i) => {
      if (busy.has(i)) return;
      const back = this.homeward(i, routine, deadAt + 200 + deal(i, this.ball, 7) * 450);
      this.routines[i] = new Routine([...recent(routine, now), ...back], look);
    });
    return { gathered: !!this.gathering };
  }

  /** Full length at a ball going past him, a hand short of it, and up with his hands on his head. */
  private diveAt(i: number, spot: Spot, pass: { point: THREE.Vector3; gap: number; at: number }, now: number,
    look: (t: number) => THREE.Vector3 | null) {
    const toward = new THREE.Vector3(spot.x - pass.point.x, 0, spot.z - pass.point.z);
    if (toward.lengthSq() < .0001) toward.set(1, 0, 0);
    toward.normalize();
    // Where his hands get to: short of the line, and just after it has gone.
    const target = pass.point.clone().addScaledVector(toward, .45).setY(.25);
    const plan = planCatch(spot, target, now, pass.at + 40, { dropped: true, ground: true, look });
    const after = plan.routine.actions.slice(1);
    const end = after[after.length - 1];
    const back = this.homeward(i, plan.routine, end.start + 1400);
    this.routines[i] = new Routine([...recent(this.routines[i], now), ...after, ...back], plan.routine.look);
  }

  /** After it, to the rope: too far to dive, so he runs it down and pulls up as it goes over. */
  private chase(i: number, spot: Spot, rope: THREE.Vector3, now: number, reachesRopeIn: number,
    look: (t: number) => THREE.Vector3 | null) {
    const routine = this.routines[i];
    const distance = away(spot, rope);
    // Flat out, arriving a little after the ball, a stride short of the rope.
    const duration = Math.max(reachesRopeIn - REACTION_MS + 250, distance / 5.3 * 1000);
    const toward = new THREE.Vector3(rope.x - spot.x, 0, rope.z - spot.z).normalize();
    const end = { x: rope.x - toward.x * .8, z: rope.z - toward.z * .8 };
    const run = travel(spot, end, now + REACTION_MS, duration, 'stop', { name: 'Chasing it' });
    const stopped: Spot = { x: end.x, z: end.z, heading: Math.atan2(toward.x, toward.z) };
    const pause = idle(stopped, 'hips', SEEDS[i], run.end + 100);
    const back = this.homeward(i, new Routine([run, pause]), run.end + 900);
    this.routines[i] = new Routine([...recent(routine, now), run, pause, ...back], look);
  }

  /** To where it has stopped, and down to pick it up; then back with it. */
  private pickUp(i: number, spot: Spot, ball: THREE.Vector3, now: number, stops: number,
    look: (t: number) => THREE.Vector3 | null) {
    const routine = this.routines[i];
    const toward = new THREE.Vector3(ball.x - spot.x, 0, ball.z - spot.z);
    const distance = toward.length();
    toward.normalize();
    // A stride short of it, facing it, and the ball off his right foot.
    const right = new THREE.Vector3(toward.z, 0, -toward.x);
    const stand = { x: ball.x - toward.x * .58 - right.x * .12, z: ball.z - toward.z * .58 - right.z * .12 };
    const heading = Math.atan2(toward.x, toward.z);
    const going = Math.max(0, distance - .58);
    // No faster than a sprint gets him there, and not before it has stopped.
    const duration = Math.max(going / 5.3 * 1000, stops + 120 - now - REACTION_MS, 300);
    const run = travel(spot, stand, now + REACTION_MS, duration, 'stop', { name: 'After it' });
    const there: Spot = { x: stand.x, z: stand.z, heading };
    const pick = gather(there, run.end, ball);
    this.gathering = { index: i, at: run.end + PICKED_UP };
    const back = this.homeward(i, new Routine([run, pick]), run.end + PICKED_UP + 900);
    this.routines[i] = new Routine([...recent(routine, now), run, pick, ...back],
      t => (t < run.end + PICKED_UP ? look(t) : null));
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

/** How far along a line from `from` the rope is: thirty metres round a point ten up the pitch. */
function ropeAlong(from: THREE.Vector3, dir: THREE.Vector3) {
  const cx = from.x, cz = from.z - 10;
  const b = cx * dir.x + cz * dir.z, c = cx * cx + cz * cz - 30 * 30;
  return -b + Math.sqrt(Math.max(0, b * b - c));
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
