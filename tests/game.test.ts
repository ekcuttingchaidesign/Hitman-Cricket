import { describe, expect, it } from 'vitest';
import { COMPATIBILITY, GAME, LINES, LINE_X, SHOTS, STYLES } from '../src/config/gameplay';
import { DeliveryGenerator } from '../src/game/DeliveryGenerator';
import { ballPosition, effectiveLine, stumpIntersection } from '../src/game/DeliveryTrajectory';
import { mapKeys } from '../src/game/InputManager';
import { ScoreManager } from '../src/game/ScoreManager';
import { SeededRandom } from '../src/game/SeededRandom';
import { gradeTiming, resolveShot } from '../src/game/ShotResolver';
import type { Delivery, ShotOutcome } from '../src/game/types';
const delivery = (changes: Partial<Delivery> = {}): Delivery => ({ line: 'MIDDLE', style: 'NORMAL', speedKph: 125, baseTargetX: 0, finalTargetX: 0, bounceZ: GAME.bounceZ, durationMs: 1000, releaseTimeMs: 0, idealContactTimeMs: 1000, ...changes });
const rng = (value: number) => ({ next: () => value });
const dot = (): ShotOutcome => resolveShot(delivery({ finalTargetX: 0.5 }), null, rng(0.5));

describe('shot controls', () => {
  it.each([ [['A'], 'LEG'], [['W'], 'STRAIGHT'], [['D'], 'OFF'], [['A', 'W'], 'LONG_ON'], [['W', 'D'], 'COVER_LONG_OFF'], [['w', 'a'], 'LONG_ON'], [['D', 'W'], 'COVER_LONG_OFF'], [['A', 'D'], null], [[], null] ])('maps %j to %s', (keys, shot) => expect(mapKeys(keys as string[])).toBe(shot));
});
describe('compatibility and timing', () => {
  it('matches every entry of the specified 5 by 5 matrix', () => {
    expect(LINES.map(line => SHOTS.map(shot => COMPATIBILITY[line][shot]))).toEqual([
      [1, .9, .3, .1, 0], [1, 1, .65, .25, .1], [.55, .85, 1, .85, .55], [.1, .25, .65, 1, 1], [0, .1, .3, .9, 1],
    ]);
  });
  it.each([[0, 'PERFECT'], [90, 'PERFECT'], [91, 'GOOD'], [170, 'GOOD'], [171, 'OK'], [260, 'OK'], [261, 'POOR'], [360, 'POOR'], [361, 'MISS']])('grades boundary %s as %s', (ms, grade) => {
    expect(gradeTiming(Number(ms))).toBe(grade); expect(gradeTiming(-Number(ms))).toBe(grade);
  });
  it('tightens fast-ball windows by 10%', () => { expect(gradeTiming(81, true)).toBe('PERFECT'); expect(gradeTiming(82, true)).toBe('GOOD'); });
});
describe('innings progression', () => {
  it('counts legal balls and ends at precisely 30; ignores extra results', () => {
    const score = new ScoreManager();
    for (let i = 1; i <= 30; i++) { score.record(dot()); expect(score.balls).toBe(i); expect(score.ended).toBe(i === 30); if (i === 6) expect(score.overs).toBe('1.0'); }
    expect(score.overs).toBe('5.0'); score.record(dot()); expect(score.balls).toBe(30);
  });
  it('ends after 3 wickets and retains runs', () => {
    const score = new ScoreManager(); score.record({ ...dot(), runs: 4 });
    for (let i = 0; i < 3; i++) score.record(resolveShot(delivery(), null, rng(.5)));
    expect(score.runs).toBe(4); expect(score.wickets).toBe(3); expect(score.fours).toBe(1); expect(score.ended).toBe(true); expect(score.overs).toBe('0.4');
  });
});
describe('wickets and scoring', () => {
  it('bowls an unplayed ball on the stumps', () => expect(resolveShot(delivery(), null, rng(.5)).wicketType).toBe('BOWLED'));
  it('never dismisses an outside-line miss that stays outside', () => {
    for (const x of [-.42, .42]) expect(resolveShot(delivery({ finalTargetX: x }), null, rng(0)).isWicket).toBe(false);
  });
  it('allows a ball moving back in from an outside base line to bowl', () => {
    for (const style of ['SWING_IN', 'OFF_SPIN'] as const) {
      const ball = delivery({ line: 'OUTSIDE_OFF', baseTargetX: .42, finalTargetX: .16, style });
      expect(stumpIntersection(ball)).toBe(true); expect(resolveShot(ball, null, rng(.9)).wicketType).toBe('BOWLED');
    }
  });
  it('can give LBW on a failed attempted middle shot', () => {
    expect(resolveShot(delivery(), { shotType: 'STRAIGHT', inputTimeMs: 400 }, rng(.1)).wicketType).toBe('LBW');
    expect(resolveShot(delivery(), { shotType: 'STRAIGHT', inputTimeMs: 400 }, rng(.9)).wicketType).toBe('BOWLED');
  });
  it('can catch mistimed contact, but never catches perfect or good timing', () => {
    for (const ms of [800, 700]) expect(resolveShot(delivery(), { shotType: 'LEG', inputTimeMs: ms }, rng(0)).wicketType).toBe('CAUGHT');
    for (const ms of [1000, 900]) for (const shotType of SHOTS) expect(resolveShot(delivery(), { shotType, inputTimeMs: ms }, rng(0)).wicketType).not.toBe('CAUGHT');
  });
  it('does not bowl a ball after actual contact', () => expect(resolveShot(delivery(), { shotType: 'STRAIGHT', inputTimeMs: 700 }, rng(.99)).isWicket).toBe(false));
  it('resolves every supported run award and never awards a six on non-perfect timing', () => {
    const runs = new Set<number>();
    for (const delta of [0, 100, 200, 300, 500]) for (const shotType of SHOTS) for (let roll = 0; roll < 1; roll += .02) {
      const result = resolveShot(delivery(), { shotType, inputTimeMs: 1000 + delta }, rng(roll));
      runs.add(result.runs); if (delta >= 100) expect(result.runs).not.toBe(6);
    }
    expect([...runs].sort((a,b) => a-b)).toEqual([0,1,2,3,4,6]);
  });
});
describe('delivery fairness and determinism', () => {
  it('balances all five lines across an innings and respects speed and movement ranges', () => {
    const gen = new DeliveryGenerator(new SeededRandom(42)); const counts = Object.fromEntries(LINES.map(l => [l, 0]));
    for (let i = 0; i < 30; i++) { const d = gen.next(0); counts[d.line]++; expect(d.speedKph).toBeGreaterThanOrEqual(STYLES[d.style].min); expect(d.speedKph).toBeLessThanOrEqual(STYLES[d.style].max); expect(Math.abs(d.finalTargetX - d.baseTargetX)).toBeLessThanOrEqual(GAME.movement); }
    expect(Object.values(counts)).toEqual([6,6,6,6,6]);
  });
  it('produces all seven styles across seeds', () => {
    const gen = new DeliveryGenerator(new SeededRandom(875)); expect(new Set(Array.from({ length: 300 }, () => gen.next(0).style)).size).toBe(7);
  });
  it('is continuous through the bounce and lands on the stated contact plane', () => {
    const gen = new DeliveryGenerator(new SeededRandom(91));
    for (let i = 0; i < 70; i++) {
      const d = gen.next(0); const bounce = (GAME.releaseZ-d.bounceZ)/(GAME.releaseZ-GAME.contactZ);
      const before = ballPosition(d, bounce-1e-6), after = ballPosition(d, bounce+1e-6), final = ballPosition(d,1);
      expect(Math.abs(before.x-after.x)).toBeLessThan(.001); expect(Math.abs(before.y-after.y)).toBeLessThan(.001);
      expect(final.x).toBeCloseTo(d.finalTargetX); expect(final.z).toBeCloseTo(GAME.contactZ);
    }
  });
  it('moves swing before bounce and spin after bounce', () => {
    const swing = delivery({ style: 'SWING_OUT', finalTargetX: .13 }); const spin = delivery({ style: 'LEG_SPIN', finalTargetX: .13 });
    expect(ballPosition(swing, .4).x).toBeGreaterThan(0); expect(ballPosition(spin,.4).x).toBe(0);
    expect(ballPosition(spin,.95).x).toBeCloseTo(.13); expect(effectiveLine(spin)).toBe('OFF');
  });
  it('finishes lateral movement before the final third of the pitch', () => {
    for (const style of ['SWING_IN', 'SWING_OUT', 'OFF_SPIN', 'LEG_SPIN'] as const) {
      const d = delivery({ style, finalTargetX: .13 });
      expect(ballPosition(d, 2 / 3).x).toBeCloseTo(d.finalTargetX, 5);
    }
  });
  it('same seed and player inputs yield identical deliveries and results', () => {
    const simulate = () => { const r = new SeededRandom(9824); const gen = new DeliveryGenerator(r); return Array.from({length:30},(_,i) => { const d = gen.next(i*4000); return { d, outcome: resolveShot(d,{shotType:SHOTS[i%5],inputTimeMs:d.idealContactTimeMs+(i%3)*100},r) }; }); };
    expect(simulate()).toEqual(simulate());
  });
  it('a full 5-over innings can be completed with well-timed correct shots', () => {
    const r = new SeededRandom(222); const gen = new DeliveryGenerator(r); const score = new ScoreManager();
    for (let i = 0; i < 30; i++) {
      const d = gen.next(i * 5000); const x = LINE_X[effectiveLine(d)];
      score.record(resolveShot(d, { shotType: x < 0 ? 'LEG' : x > 0 ? 'OFF' : 'STRAIGHT', inputTimeMs: d.idealContactTimeMs }, r));
    }
    expect(score.overs).toBe('5.0'); expect(score.wickets).toBe(0); expect(score.runs).toBeGreaterThanOrEqual(120); expect(score.runs).toBeLessThanOrEqual(180);
  });
});
