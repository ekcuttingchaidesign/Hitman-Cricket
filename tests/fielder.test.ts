import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  DIVE, Fielder, REACTION_MS, Routine, SPRINT, idle, midpointOfHands, planCatch, splitStep, travel,
  type Spot,
} from '../src/entities/Fielder';

const toBat = (x: number, z: number) => Math.atan2(-x, -z);
const home: Spot = { x: -8, z: 19, heading: toBat(-8, 19) };
const fielder = new Fielder();
const HIT = 1000, HANG = 1650;

/** A point `sideways` across and `forward` towards the bat from the mark. */
function offset(sideways: number, forward: number, height = .6) {
  const f = new THREE.Vector3(Math.sin(home.heading), 0, Math.cos(home.heading));
  const r = new THREE.Vector3(Math.cos(home.heading), 0, -Math.sin(home.heading));
  return new THREE.Vector3(home.x, height, home.z).addScaledVector(r, sideways).addScaledVector(f, forward);
}

/** The catches the lab shows, and a spread more around them. */
const CATCHES = [
  ['sideways', offset(7.5, -.5)], ['other side', offset(-7, -2.5)], ['coming in', offset(1, 9, .45)],
  ['settled', offset(2, -1.2, 2.2)], ['going back', offset(3, -6)], ['wide', offset(-8, 1.5)],
] as const;
/** Long enough after the hit for him to be up on his feet again. */
const AFTER = HIT + HANG + 2600;

/** Every joint of the posed figure, out on the field. */
function joints(routine: Routine, t: number) {
  fielder.show(routine.at(t));
  fielder.root.updateMatrixWorld(true);
  const look = fielder.figure.inspect();
  const out = (p: number[]) => new THREE.Vector3(...p).applyMatrix4(fielder.figure.root.matrixWorld);
  return { ...look, world: [...look.feet, ...look.knees, ...look.hands, ...look.elbows, look.hip].map(out), feetWorld: look.feet.map(out) };
}
const every = (from: number, to: number, step = 10) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

describe('a fielder running', () => {
  const run = travel(home, { x: home.x - 16, z: home.z }, 0, 3400, 'stop');

  it('never asks a leg or an arm to reach further than it is long', () => {
    const routine = new Routine([run]);
    for (const t of every(0, 3400)) {
      const { legReach, armReach } = joints(routine, t);
      for (const r of [...legReach, ...armReach]) expect(r, `at ${t}ms`).toBeLessThan(1.001);
    }
  });

  it('keeps a planted foot exactly where it came down', () => {
    // The whole difference between running and skating. A foot on the turf
    // has no business moving until it lifts.
    let before = run.feetAt(0);
    for (const t of every(5, 3400, 5)) {
      const now = run.feetAt(t);
      for (let i = 0; i < 2; i++) {
        const grounded = before[i].y < .061 && now[i].y < .061;
        if (grounded && before[i].distanceTo(now[i]) > 1e-6) {
          // Coming down on a new plant is allowed; sliding along the ground is not.
          expect(before[i].distanceTo(now[i]), `foot ${i} at ${t}ms`).toBeGreaterThan(.25);
        }
      }
      before = now;
    }
  });

  it('gets no quicker than a man can run', () => {
    expect(run.topSpeed).toBeLessThanOrEqual(SPRINT);
  });

  it('walks back to his mark facing the bat', () => {
    const back = travel({ ...home, x: home.x + 1.5, z: home.z - 1.5 }, home, 0, 1700, 'stop', { face: home.heading });
    for (const t of every(0, 1700, 50)) expect(back.at(t).heading).toBeCloseTo(home.heading, 6);
  });
});

describe('a fielder waiting', () => {
  it('breathes and shifts, rather than standing frozen', () => {
    const routine = new Routine([idle(home, 'loose', 1)]);
    const chest = every(0, 8000, 400).map(t => routine.at(t).pose.chest.clone());
    const spread = Math.max(...chest.map(c => c.distanceTo(chest[0])));
    expect(spread).toBeGreaterThan(.01);
    expect(spread).toBeLessThan(.08);
  });

  it('does not breathe in time with the man next to him', () => {
    const a = new Routine([idle(home, 'loose', 1)]), b = new Routine([idle(home, 'loose', 4)]);
    const differs = every(0, 6000, 300).some(t => Math.abs(a.at(t).pose.chest.y - b.at(t).pose.chest.y) > .004);
    expect(differs).toBe(true);
  });

  it('lands the split step in a crouch, feet wide', () => {
    const body = new Routine([splitStep(home, 0)]).at(400);
    expect(body.pose.hip.y).toBeLessThan(.85);
    expect(body.pose.rightFoot.x - body.pose.leftFoot.x).toBeGreaterThan(.45);
  });
});

describe('a catch', () => {
  for (const [name, ball] of CATCHES) {
    describe(name, () => {
      const plan = planCatch(home, ball, HIT, HIT + HANG);
      const { routine } = plan;

      it('starts from his own mark: he is never somewhere he could not have got to', () => {
        const at = routine.at(HIT);
        expect(Math.hypot(at.x - home.x, at.z - home.z)).toBeLessThan(.05);
        // And nothing jumps on the way: the hips go no further in ten
        // milliseconds than a diving man's would.
        let hip = joints(routine, HIT).world[8];
        for (const t of every(HIT + 10, AFTER)) {
          const now = joints(routine, t).world[8];
          expect(now.distanceTo(hip), `at ${t}ms`).toBeLessThan(.13);
          hip = now;
        }
      });

      it('gets there at no more than a sprint', () => {
        expect(plan.topSpeed).toBeLessThanOrEqual(SPRINT);
      });

      it('has his hands on the ball when it arrives', () => {
        const hands = midpointOfHands(routine.at(plan.catchAt));
        expect(hands.distanceTo(plan.hands)).toBeLessThan(.02);
        // And the ball is where it was going, or near enough that bending the
        // flight to his hands is not a visible swerve.
        expect(Math.hypot(plan.hands.x - ball.x, plan.hands.z - ball.z)).toBeLessThan(1.2);
      });

      it('waits a moment to read it before he moves', () => {
        const still = routine.at(HIT + REACTION_MS - 20);
        expect(Math.hypot(still.x - home.x, still.z - home.z)).toBeLessThan(.05);
      });

      it('keeps every joint above the grass and every limb within its length', () => {
        for (const t of every(HIT, AFTER, 20)) {
          const { world, legReach, armReach } = joints(routine, t);
          for (const p of world) expect(p.y, `at ${t}ms`).toBeGreaterThan(-.02);
          for (const r of armReach) expect(r, `arm at ${t}ms`).toBeLessThan(1.001);
          // A dive tips him over, so the legs' targets are his own: what
          // matters is that the solver can reach them.
          for (const r of legReach) expect(r, `leg at ${t}ms`).toBeLessThan(1.001);
        }
      });

      if (plan.style === 'dive') {
        it('goes the last of it through the air', () => {
          const flying = routine.at(plan.catchAt - DIVE.catch + (DIVE.takeoff + DIVE.land) / 2);
          expect(flying.pitch).toBeGreaterThan(.8);
          const lying = routine.at(plan.catchAt + 300);
          expect(lying.anchor.y).toBeLessThan(.25);
        });
      }
    });
  }

  it('never runs faster than a sprint to reach one that is out of reach, and comes up short', () => {
    const far = offset(-14, 2);
    const plan = planCatch(home, far, HIT, HIT + HANG);
    expect(plan.topSpeed).toBeLessThanOrEqual(SPRINT);
    expect(Math.hypot(plan.hands.x - far.x, plan.hands.z - far.z)).toBeGreaterThan(2);
  });

  it('settles under one he has time for, and dives for one he has not', () => {
    expect(planCatch(home, offset(2, -1.2, 2.2), HIT, HIT + HANG).style).toBe('high');
    expect(planCatch(home, offset(7.5, -.5), HIT, HIT + HANG).style).toBe('dive');
  });
});
