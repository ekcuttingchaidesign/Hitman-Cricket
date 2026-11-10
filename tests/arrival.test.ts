import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Batter } from '../src/entities/Batter';
import { ARRIVE, ARRIVE_DISTANCE, ARRIVE_PACE, ARRIVE_STEP, arrivalBars, arrivalCamera, arrivalDue, walkedBy } from '../src/game/arrival';

// One batter, staged at each moment in turn: the arrival is a function of its clock, so nothing carries over.
const batter = new Batter();
const at = (t: number) => {
  batter.stage(t, 'arrive'); batter.update(t);
  return batter.inspect();
};

describe("the new batter's arrival: the walk", () => {
  it('walks the whole way at a walking pace and stops dead at the end of it, a whole number of strides', () => {
    expect(walkedBy(0)).toBe(0);
    expect(walkedBy(ARRIVE.walk)).toBeCloseTo(ARRIVE_DISTANCE, 9);
    expect(walkedBy(ARRIVE.walk + 500)).toBeCloseTo(ARRIVE_DISTANCE, 9);
    expect(ARRIVE_PACE).toBeGreaterThan(1.1); expect(ARRIVE_PACE).toBeLessThan(1.6);
    expect(ARRIVE_STEP).toBeGreaterThan(.6); expect(ARRIVE_STEP).toBeLessThan(.85);
    // Slowing, never stepping back: each moment no further than the next.
    for (let t = 0; t < ARRIVE.walk; t += 10) expect(walkedBy(t + 10)).toBeGreaterThanOrEqual(walkedBy(t));
    // Stopped: the last few milliseconds of it barely move him.
    expect(walkedBy(ARRIVE.walk) - walkedBy(ARRIVE.walk - 20)).toBeLessThan(.002);
  });

  it('keeps a planted foot where it came down until it lifts', () => {
    let before = at(0);
    for (let t = 10; t <= ARRIVE.walk; t += 10) {
      const now = at(t);
      for (const foot of ['frontFoot', 'backFoot'] as const) {
        const down = before[foot][1] < .0801 && now[foot][1] < .0801;
        if (down) expect(new Vector3(...before[foot]).distanceTo(new Vector3(...now[foot])), `${foot} at ${t}ms`).toBeLessThan(1e-4);
      }
      before = now;
    }
  });

  it('carries the bat with its toe off the turf, and never asks an arm or a leg for more than it has', () => {
    for (let t = 0; t <= ARRIVE.total; t += 20) {
      const pose = at(t);
      expect(pose.bladeTip[1], `toe at ${t}ms`).toBeGreaterThan(t <= ARRIVE.walk ? .02 : -.02);
      for (const [upper, lower] of pose.armLengths) {
        expect(upper, `upper arm at ${t}ms`).toBeCloseTo(.32, 3);
        expect(lower, `forearm at ${t}ms`).toBeLessThan(.345);
      }
      for (const [thigh, shin] of pose.legLengths) {
        expect(thigh, `thigh at ${t}ms`).toBeCloseTo(.43, 3);
        expect(shin, `shin at ${t}ms`).toBeLessThan(.445);
      }
    }
  });

  it('swings both arms as he walks, against the legs', () => {
    const hands = [0, 160, 330, 500].map(t => at(t).hands.map(h => new Vector3(...h)));
    const travel = (i: number) => Math.max(...hands.map(h => h[i].distanceTo(hands[0][i])));
    expect(travel(0)).toBeGreaterThan(.08);
    expect(travel(1)).toBeGreaterThan(.06);
  });

  it('ends exactly in his guard, where the next ball finds him', () => {
    const settled = at(ARRIVE.total), guard = new Batter();
    guard.update(0);
    const g = guard.inspect();
    expect(settled.hip).toEqual(g.hip); expect(settled.grip).toEqual(g.grip);
  });
});

describe("the new batter's arrival: the camera and the rules", () => {
  const home = { eye: [0, 2.9, -5.15] as const, at: [0, 1, 6] as const, fov: 50 };
  it('lands on the game’s own view, and the bars are away by then', () => {
    const end = arrivalCamera(ARRIVE.total, home);
    end.eye.forEach((v, i) => expect(v).toBeCloseTo(home.eye[i], 6));
    end.at.forEach((v, i) => expect(v).toBeCloseTo(home.at[i], 6));
    expect(end.fov).toBeCloseTo(home.fov, 6);
    expect(arrivalBars(ARRIVE.total)).toBe(0);
    expect(arrivalBars(1000)).toBe(1);
  });

  it('moves without a jump from the cut to the end', () => {
    let last = arrivalCamera(0, home);
    for (let t = 20; t <= ARRIVE.total; t += 20) {
      const now = arrivalCamera(t, home);
      expect(new Vector3(...now.eye).distanceTo(new Vector3(...last.eye)), `at ${t}ms`).toBeLessThan(.25);
      last = now;
    }
  });

  it('comes on a wicket with the innings going on, and only then', () => {
    const base = { out: true, over: false, lesson: false, demo: false, asked: null, debug: false, still: false };
    expect(arrivalDue(base)).toBe(true);
    expect(arrivalDue({ ...base, out: false })).toBe(false);
    expect(arrivalDue({ ...base, over: true })).toBe(false);
    expect(arrivalDue({ ...base, lesson: true })).toBe(false);
    expect(arrivalDue({ ...base, demo: true })).toBe(false);
    expect(arrivalDue({ ...base, still: true })).toBe(false);
    expect(arrivalDue({ ...base, debug: true })).toBe(false);
    expect(arrivalDue({ ...base, debug: true, asked: true })).toBe(true);
    expect(arrivalDue({ ...base, asked: false })).toBe(false);
  });
});
