import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { GAME } from '../src/config/gameplay';
import { Batter, WALK_STYLES, type WalkStyle } from '../src/entities/Batter';
import { ARRIVAL_ANGLES, walkedTo, ARRIVE, ARRIVE_HEADING, ARRIVE_DISTANCE, ARRIVE_PACE, ARRIVE_STEP, arrivalBars, arrivalCamera, arrivalDue, walkedBy } from '../src/game/arrival';

// One batter, staged at each moment in turn: the arrival is a function of its clock, so nothing carries over.
const batter = new Batter();
const at = (t: number, style: WalkStyle = 'carry') => {
  batter.walkStyle = style; batter.stage(t, 'arrive'); batter.update(t);
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

  it('carries the bat with its toe off the turf, and never asks an arm or a leg for more than it has, however he carries it', () => {
    for (const style of WALK_STYLES) for (let t = 0; t <= ARRIVE.total; t += 20) {
      const pose = at(t, style);
      expect(pose.bladeTip[1], `${style} toe at ${t}ms`).toBeGreaterThan(t <= ARRIVE.walk ? .02 : -.02);
      for (const [upper, lower] of pose.armLengths) {
        expect(upper, `${style} upper arm at ${t}ms`).toBeCloseTo(.32, 3);
        expect(lower, `${style} forearm at ${t}ms`).toBeLessThan(.345);
      }
      for (const [thigh, shin] of pose.legLengths) {
        expect(thigh, `${style} thigh at ${t}ms`).toBeCloseTo(.43, 3);
        expect(shin, `${style} shin at ${t}ms`).toBeLessThan(.445);
      }
    }
  });

  it('bends each knee forward over its own foot as he walks, never out across his line', () => {
    const along = new Vector3(Math.sin(ARRIVE_HEADING), 0, Math.cos(ARRIVE_HEADING));
    for (let t = 0; t <= ARRIVE.walk; t += 40) {
      const pose = at(t);
      for (let i = 0; i < 2; i++) {
        const hipToFoot = new Vector3(...(i === 0 ? pose.frontFoot : pose.backFoot)).sub(new Vector3(...pose.hip));
        const knee = new Vector3(...pose.knees[i]).sub(new Vector3(...pose.hip));
        // Where the knee stands off the straight line from hip to foot: ahead of it, not to either side.
        const off = knee.clone().sub(hipToFoot.clone().multiplyScalar(knee.dot(hipToFoot) / hipToFoot.lengthSq())).setY(0);
        // Never bent backwards, and never more than a few centimetres off his line, which is what a twisted leg is.
        const across = new Vector3(along.z, 0, -along.x);
        expect(off.dot(along), `knee ${i} at ${t}ms`).toBeGreaterThan(-.005);
        expect(Math.abs(off.dot(across)), `knee ${i} at ${t}ms`).toBeLessThan(.08);
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
  it('lands on the game’s own view from every angle, and the bars are away by then', () => {
    for (const angle of ARRIVAL_ANGLES) {
      const end = arrivalCamera(ARRIVE.total, home, angle);
      end.eye.forEach((v, i) => expect(v, angle).toBeCloseTo(home.eye[i], 6));
      end.at.forEach((v, i) => expect(v, angle).toBeCloseTo(home.at[i], 6));
      expect(end.fov).toBeCloseTo(home.fov, 6);
    }
    expect(arrivalBars(ARRIVE.total)).toBe(0);
    expect(arrivalBars(1000)).toBe(1);
  });

  it('moves without a jump, but for the one cut over his shoulder as he stops when shot from in front or side on', () => {
    for (const angle of ARRIVAL_ANGLES) {
      let last = arrivalCamera(0, home, angle);
      for (let t = 20; t <= ARRIVE.total; t += 20) {
        const now = arrivalCamera(t, home, angle);
        const cut = angle !== 'behind' && t - 20 <= ARRIVE.walk && t > ARRIVE.walk;
        if (!cut) expect(new Vector3(...now.eye).distanceTo(new Vector3(...last.eye)), `${angle} at ${t}ms`).toBeLessThan(.25);
        last = now;
      }
    }
  });

  it('keeps him in the picture all the way in, whichever angle shoots him', () => {
    for (const angle of ARRIVAL_ANGLES) for (let t = 0; t <= ARRIVE.walk; t += 100) {
      const cam = arrivalCamera(t, home, angle), hip = walkedTo(t);
      const him = new Vector3(GAME.stanceX + hip[0], .9, GAME.stanceZ + hip[1]);
      const look = new Vector3(...cam.at).sub(new Vector3(...cam.eye)).normalize();
      const to = him.clone().sub(new Vector3(...cam.eye));
      // Within a third of the lens either way of the middle: a phone held upright is narrow.
      expect(to.angleTo(look) * 180 / Math.PI, `${angle} at ${t}ms`).toBeLessThan(cam.fov / 3);
      // And never nearer than three metres: close to, the figures do not hold up.
      expect(to.length(), `${angle} at ${t}ms`).toBeGreaterThan(3);
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
