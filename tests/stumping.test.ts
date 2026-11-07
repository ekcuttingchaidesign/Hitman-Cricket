import { describe, expect, it } from 'vitest';
import { catchShotOf } from '../src/game/catch-cam';
import { STUMPING, STUMPING_CAMERA, stumpingAt } from '../src/game/stumping';
import type { ShotOutcome } from '../src/game/types';
import { GAME } from '../src/config/gameplay';

const out = (changes: Partial<ShotOutcome>): ShotOutcome => ({
  runs: 0, isWicket: false, quality: 0, feedback: '', timingGrade: 'MISS', timingDeltaMs: null,
  compatibility: 0, madeBatContact: false, aerial: false, ...changes,
});

describe('a stumping, seen', () => {
  it('goes to its own camera, and no other wicket off a beaten ball does', () => {
    expect(catchShotOf(out({ isWicket: true, wicketType: 'STUMPED' }))).toBe('stumped');
    expect(catchShotOf(out({ isWicket: true, wicketType: 'BOWLED' }))).toBeNull();
    expect(catchShotOf(out({ isWicket: true, wicketType: 'LBW' }))).toBeNull();
  });
  it('has the keeper squatting until the ball is in his gloves, then whipping the bails off, then standing', () => {
    const flightMs = 1250, { take } = stumpingAt(0, flightMs);
    expect(take).toBe(flightMs * STUMPING.takeShare);
    const before = stumpingAt(take - 10, flightMs);
    expect([before.whip, before.rise, before.bails]).toEqual([0, 0, false]);
    const gathered = stumpingAt(take + STUMPING.whipFrom - 1, flightMs);
    expect(gathered.whip).toBe(0);
    const struck = stumpingAt(take + STUMPING.whipFrom + STUMPING.whipMs, flightMs);
    expect([struck.whip, struck.bails, struck.rise]).toEqual([1, true, 0]);
    // Still down over the broken wicket a good while before he gets up.
    expect(STUMPING.standFrom).toBeGreaterThan(STUMPING.whipFrom + STUMPING.whipMs + 300);
    expect(stumpingAt(take + STUMPING.standFrom + STUMPING.standMs, flightMs).rise).toBe(1);
  });
  it('the bails go only once the gloves are on the stumps, and the camera is still on them a while after', () => {
    const flightMs = 1250, { take } = stumpingAt(0, flightMs);
    for (let t = 0; t < take + STUMPING.whipFrom; t += 10) expect(stumpingAt(t, flightMs).bails, `${t}`).toBe(false);
    expect(STUMPING.hold).toBeGreaterThan(STUMPING.whipFrom + STUMPING.whipMs + 600);
  });
  it('has the batter out of his crease when the bails go', () => {
    expect(STUMPING.out - STUMPING.back).toBeGreaterThan(GAME.creaseZ - GAME.stanceZ + .3);
  });
  it('watches from square leg, across the stumps', () => {
    const [x, y, z] = STUMPING_CAMERA.eye;
    expect(x).toBeLessThan(-5);
    expect(y).toBeGreaterThan(.8); expect(y).toBeLessThan(2.5);
    expect(Math.abs(z)).toBeLessThan(1.5);
    expect(Math.abs(STUMPING_CAMERA.at[2])).toBeLessThan(1);
  });
});
