import { describe, expect, it } from 'vitest';
import {
  CATCH_CUT_IN, CATCH_HOLD, CATCH_MIN_FRAME, CATCH_SLOW, catchCamera, catchPace, catchShotOf, catchTimes, spillable, spillTo,
} from '../src/game/catch-cam';
import { ropeAt } from '../src/game/replay';
import { flightOf } from '../src/scene/flight';
import type { ShotOutcome } from '../src/game/types';

const ball = (over: Partial<ShotOutcome> = {}): ShotOutcome => ({
  runs: 0, isWicket: false, quality: 0, feedback: '', timingGrade: 'POOR', timingDeltaMs: -60, compatibility: 1,
  madeBatContact: true, aerial: true, ...over,
});
const skier = ball({ isWicket: true, wicketType: 'CAUGHT', feedback: 'CAUGHT!' });

describe('which balls the camera goes with', () => {
  it('a skier caught or put down', () => {
    expect(catchShotOf(skier)).toBe('catch');
    expect(catchShotOf(ball({ dropped: true }))).toBe('drop');
    expect(catchShotOf(ball({ dropped: true, spilled: true, runs: 4 }))).toBe('spill');
    // On the rope, a Super10 boundary rider's catch.
    expect(catchShotOf({ ...skier, fielder: { name: 'long-on', angle: 12, distance: 38, deep: true, how: 'caught' } })).toBe('catch');
  });
  it('not an edge to the keeper, a ball off the body, a catch in the ring or a ball nobody was under', () => {
    expect(catchShotOf({ ...skier, edged: true })).toBe(null);
    expect(catchShotOf({ ...skier, aerial: false })).toBe(null);
    expect(catchShotOf({ ...skier, madeBatContact: false })).toBe(null);
    expect(catchShotOf(ball({ runs: 6 }))).toBe(null);
    expect(catchShotOf(ball({ runs: 4 }))).toBe(null);
    expect(catchShotOf(ball({ isWicket: true, wicketType: 'BOWLED' }))).toBe(null);
  });
  it('a skier that fell safe for four may be shown put down, and nothing else', () => {
    expect(spillable(ball({ runs: 4 }))).toBe(true);
    expect(spillable(ball({ runs: 6 }))).toBe(false);
    expect(spillable(ball({ runs: 4, aerial: false }))).toBe(false);
    expect(spillable(skier)).toBe(false);
    for (const own of ['swept', 'sweptFlat', 'scooped', 'hooked'] as const) expect(spillable(ball({ runs: 4, [own]: true }))).toBe(false);
  });
});

describe('a skier put down on the rope', () => {
  it('comes down to him as a skier does, then takes as long again to run on', () => {
    const held = flightOf(skier), spilled = flightOf(ball({ runs: 4, dropped: true, spilled: true }));
    expect(spilled.flightMs * spilled.takeAt).toBeCloseTo(held.flightMs * held.takeAt);
    expect(spilled.dropAt).toBeGreaterThan(spilled.takeAt);
    expect(spilled.flightMs).toBeGreaterThan(held.flightMs);
  });
  it('runs on over the rope along the line it came', () => {
    for (const hands of [[3, 1.5, 22], [-18, 1.5, -14], [20, 1, 4]] as const) {
      const to = spillTo(hands), length = Math.hypot(hands[0], hands[2]);
      expect(Math.hypot(to[0], to[2])).toBeGreaterThan(ropeAt(hands[0] / length, hands[2] / length));
      expect(to[0] * hands[2] - to[2] * hands[0]).toBeCloseTo(0);
    }
  });
});

describe('the catch camera', () => {
  it('cuts in after the bat, holds after the take, and a spill to the end of its run', () => {
    const t = catchTimes('catch', 1000, 2600, 2900);
    expect(t.cut).toBe(1000 + CATCH_CUT_IN);
    expect(t.until).toBe(2600 + CATCH_HOLD);
    expect(catchTimes('spill', 1000, 2600, 4100).until).toBeGreaterThan(4100);
  });
  it('slows through the take and is back to full speed either side', () => {
    expect(catchPace(-2000)).toBe(1);
    expect(catchPace(0)).toBeCloseTo(CATCH_SLOW.pace);
    expect(catchPace(1500)).toBe(1);
    for (let t = -2000; t < 2000; t += 10) expect(Math.abs(catchPace(t + 10) - catchPace(t))).toBeLessThan(.06);
  });
  it('up behind the bat and off the line, looking at the ball and him together', () => {
    for (const hands of [[4, 1.5, 22], [-20, 1.2, -16], [24, 1.8, 6], [-6, 1.5, 33]] as const) {
      const pose = catchCamera(hands, [hands[0] / 3, 12, hands[2] / 3]);
      expect(pose.eye[1]).toBeGreaterThan(4);
      // Behind the bat from where the ball went.
      expect(pose.eye[0] * hands[0] + pose.eye[2] * hands[2]).toBeLessThan(0);
      // Wide while the ball is up, close once it is in his hands.
      const taken = catchCamera(hands, hands);
      expect(taken.fov).toBeLessThan(pose.fov);
      // Never so near that he is more than a quarter of the picture.
      const away = Math.hypot(taken.eye[0] - taken.at[0], taken.eye[1] - taken.at[1], taken.eye[2] - taken.at[2]);
      expect(2 * away * Math.tan(taken.fov * Math.PI / 360)).toBeGreaterThanOrEqual(CATCH_MIN_FRAME - 1e-6);
    }
  });
});
