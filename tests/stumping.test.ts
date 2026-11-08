import { describe, expect, it } from 'vitest';
import { catchShotOf } from '../src/game/catch-cam';
import { STUMPING, STUMPING_CAMERA, stumpingAt } from '../src/game/stumping';
import type { Delivery, ShotOutcome, ShotType } from '../src/game/types';
import { ADVANCE, GAME, SWEEP } from '../src/config/gameplay';
import { advanceShot, chargeableSpin, resolveShot, steppedOut } from '../src/game/ShotResolver';
import { SeededRandom } from '../src/game/SeededRandom';

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

describe('stepping out to the spinner', () => {
  const ball = (changes: Partial<Delivery> = {}): Delivery => ({ line: 'MIDDLE', style: 'OFF_SPIN', speedKph: 88, baseTargetX: 0, finalTargetX: .25,
    bounceZ: SWEEP.minBounceZ + .4, rise: GAME.rise, durationMs: 1000, releaseTimeMs: 0, idealContactTimeMs: 1000, ...changes });
  const swing = (d: Delivery, delta: number, shotType: ShotType = 'STRAIGHT') => ({ shotType, inputTimeMs: d.idealContactTimeMs + delta });
  it('is his off break or leg break, pitched up near the stumps, never the one dropped short', () => {
    expect(chargeableSpin(ball())).toBe(true);
    expect(chargeableSpin(ball({ style: 'LEG_SPIN', finalTargetX: -.25 }))).toBe(true);
    expect(chargeableSpin(ball({ dragged: true }))).toBe(false);
    expect(chargeableSpin(ball({ style: 'ARM_BALL' }))).toBe(false);
    expect(chargeableSpin(ball({ baseTargetX: ADVANCE.spinLine + .1 }))).toBe(false);
  });
  it('middled up the V, goes out of the ground as the charge does', () => {
    const d = ball();
    for (const shot of ['STRAIGHT', 'COVER_LONG_OFF'] as const) {
      const hit = resolveShot(d, swing(d, 0, shot), new SeededRandom(3), true);
      expect(hit.advance, shot).toBe(true); expect(hit.runs).toBe(6);
    }
  });
  it('mistimed or beaten, the ball turns past him and he is stumped', () => {
    const d = ball();
    for (const delta of [GAME.timing.ok + 5, GAME.timing.poor + 40, -(GAME.timing.poor + 40)]) {
      expect(steppedOut(d, swing(d, delta), true), `${delta}`).toBe(true);
      const out = resolveShot(d, swing(d, delta), new SeededRandom(3), true);
      expect([out.isWicket, out.wicketType, out.steppedOut, out.madeBatContact], `${delta}`).toEqual([true, 'STUMPED', true, false]);
      expect(out.feedback).toBe(ADVANCE.stumpedFeedback);
      expect(catchShotOf(out)).toBe('stumped');
    }
  });
  it('needs the full meter and a drive up the V; timed OK it is just the drive', () => {
    const d = ball(), late = GAME.timing.ok + 5;
    expect(steppedOut(d, swing(d, late), false)).toBe(false);
    expect(resolveShot(d, swing(d, late), new SeededRandom(3), false).steppedOut).toBeFalsy();
    // The on drive's swipe at the spinner is the slog sweep's, not a charge.
    expect(steppedOut(d, swing(d, late, 'LONG_ON'), true)).toBe(false);
    expect(advanceShot(d, swing(d, 0, 'LONG_ON'), true)).toBe(false);
    expect(steppedOut(d, swing(d, late, 'LEG'), true)).toBe(false);
    const ok = GAME.timing.good + 5;
    expect(steppedOut(d, swing(d, ok), true)).toBe(false);
    expect(advanceShot(d, swing(d, ok), true)).toBe(false);
  });
  it('never stumps him off the seamer: there the keeper is twenty yards back', () => {
    const seam = ball({ style: 'NORMAL', speedKph: 125, bounceZ: GAME.bounceZ, finalTargetX: 0 });
    expect(steppedOut(seam, swing(seam, GAME.timing.poor + 40), true)).toBe(false);
  });
});

describe("the keeper's coach card", () => {
  it('is told once a browser, and says he can stump you without a word about the ball', async () => {
    const { KEEPER_STEP, keeperIntroDue } = await import('../src/ui/ShotsIntro');
    expect(keeperIntroDue(() => null)).toBe(true);
    expect(keeperIntroDue(() => 'done')).toBe(false);
    expect(keeperIntroDue(() => { throw new Error('no storage'); })).toBe(false);
    expect(KEEPER_STEP.spot).toBe('keeper');
    expect(KEEPER_STEP.line).toMatch(/stump/);
    expect(`${KEEPER_STEP.title} ${KEEPER_STEP.line}`).not.toMatch(/flight|flighted|toss/i);
  });
});
