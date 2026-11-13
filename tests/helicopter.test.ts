/**
 * The helicopter's rules (`helicopterBall`, `helicoptered`, `HELI`): which
 * balls the straight and on swipes play it at, and what each timing is worth.
 * The stroke itself is the rig's, in `tests/batter.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { helicopterBall, resolveShot } from '../src/game/ShotResolver';
import { helicopterVersionOf } from '../src/entities/Batter';
import { FULLER, GAME, HELI, LINE_X } from '../src/config/gameplay';
import type { BallLine, Delivery, DeliveryStyle, TimingGrade } from '../src/game/types';
import { sectorOf } from '../src/scene/flight';
import { steer, steerOf } from '../src/game/super10-field';

const ball = (style: DeliveryStyle, line: BallLine, full = false): Delivery => ({
  line, style, speedKph: 145, baseTargetX: LINE_X[line], finalTargetX: LINE_X[line],
  bounceZ: full ? FULLER.bounce : style === 'YORKER' ? 1.6 : GAME.bounceZ, rise: full ? FULLER.rise : style === 'YORKER' ? .28 : GAME.rise,
  durationMs: 500, releaseTimeMs: 0, idealContactTimeMs: 1000, ...(full ? { full: true } : {}),
});
/** A swing off by this many milliseconds, the grades' own windows deciding what it is. */
const OFF: Record<Exclude<TimingGrade, 'MISS'>, number> = { PERFECT: 0, GOOD: GAME.timing.perfect + 2, OK: GAME.timing.good + 2, POOR: GAME.timing.ok + 2 };
const play = (delivery: Delivery, grade: keyof typeof OFF, roll = .99) =>
  resolveShot(delivery, { shotType: 'STRAIGHT', inputTimeMs: delivery.idealContactTimeMs + OFF[grade], helicopter: true }, { next: () => roll });

describe('which balls are the helicopter', () => {
  it('is every straight or on swipe at a pace yorker, on any line', () => {
    for (const line of ['OFF', 'MIDDLE', 'LEG'] as const) for (const shot of ['STRAIGHT', 'LONG_ON'] as const)
      expect(helicopterBall(ball('YORKER', line), shot, .99), `${line} ${shot}`).toBe(true);
  });
  it('is never another swipe, nor a spinner\'s ball', () => {
    for (const shot of ['COVER_LONG_OFF', 'LEG', 'DEFEND'] as const) expect(helicopterBall(ball('YORKER', 'MIDDLE'), shot, 0)).toBe(false);
    expect(helicopterBall(ball('OFF_SPIN', 'MIDDLE', true), 'STRAIGHT', 0)).toBe(false);
  });
  it('is the fuller ball on middle or leg a third of the time, and never the fuller ball on off or a length ball', () => {
    for (const line of ['MIDDLE', 'LEG'] as const) {
      expect(helicopterBall(ball('FAST', line, true), 'STRAIGHT', HELI.fullShare - .01)).toBe(true);
      expect(helicopterBall(ball('FAST', line, true), 'LONG_ON', HELI.fullShare + .01)).toBe(false);
    }
    expect(helicopterBall(ball('FAST', 'OFF', true), 'STRAIGHT', 0)).toBe(false);
    expect(helicopterBall(ball('FAST', 'MIDDLE'), 'STRAIGHT', 0)).toBe(false);
  });
});

describe('what a helicopter is worth', () => {
  it('is six middled and four a shade under, over midwicket', () => {
    for (const delivery of [ball('YORKER', 'MIDDLE'), ball('FAST', 'LEG', true)]) {
      const six = play(delivery, 'PERFECT'), four = play(delivery, 'GOOD');
      expect([six.runs, six.isWicket, six.helicopter, six.feedback]).toEqual([6, false, true, HELI.feedback.six]);
      expect([four.runs, four.isWicket]).toEqual([4, false]);
      expect(sectorOf(six, 'STRAIGHT')).toBeCloseTo(HELI.angle, 5);
    }
  });
  it('mistimed, is bowled on the stumps and caught off the toe on leg', () => {
    const bowled = play(ball('YORKER', 'MIDDLE'), 'POOR'), caught = play(ball('YORKER', 'OUTSIDE_LEG'), 'POOR');
    expect([bowled.isWicket, bowled.wicketType, bowled.madeBatContact]).toEqual([true, 'BOWLED', false]);
    expect([caught.isWicket, caught.wicketType, caught.aerial]).toEqual([true, 'CAUGHT', true]);
    // Up over midwicket: never turned into caught and bowled, however the dice fall.
    expect(caught.returned).toBeFalsy();
  });
  it('held back, is a single or two off the toe half the time and out the other half', () => {
    expect(play(ball('YORKER', 'MIDDLE'), 'OK', .9)).toMatchObject({ runs: 1, isWicket: false });
    expect(play(ball('YORKER', 'OUTSIDE_LEG'), 'OK', .9)).toMatchObject({ runs: 2, isWicket: false });
    expect(play(ball('YORKER', 'MIDDLE'), 'OK', .1)).toMatchObject({ isWicket: true, wicketType: 'BOWLED' });
  });
});

describe('which version', () => {
  it('plays version one three times in ten and version two seven', () => {
    let ones = 0;
    for (let n = 0; n < 1000; n++) if (helicopterVersionOf((n + .5) / 1000) === 1) ones++;
    expect(ones).toBe(300);
  });
});

describe('where it goes', () => {
  it('always between long-on and midwicket, whatever the timing', () => {
    for (const grade of ['PERFECT', 'GOOD'] as const) for (const late of [-1, 1]) {
      const delivery = ball('YORKER', 'MIDDLE'), outcome = resolveShot(delivery,
        { shotType: 'STRAIGHT', inputTimeMs: delivery.idealContactTimeMs + late * OFF[grade], helicopter: true }, { next: () => .99 });
      const line = sectorOf(outcome, 'STRAIGHT');
      expect(line, `${grade} ${late}`).toBeLessThan(-24);
      expect(line, `${grade} ${late}`).toBeGreaterThan(-52);
    }
  });
  it('in Super10, steered along its own arc from either swipe, never down the ground', () => {
    const six = play(ball('YORKER', 'MIDDLE'), 'PERFECT');
    for (const [shot, swipes] of [['STRAIGHT', [-22, 0, 22]], ['LONG_ON', [-66, -45, -23]]] as const) for (const swipe of swipes) {
      const lane = steerOf(shot, six)!, { angle } = steer(lane, swipe);
      expect(angle, `${shot} ${swipe}`).toBeLessThanOrEqual(-24);
      expect(angle, `${shot} ${swipe}`).toBeGreaterThanOrEqual(-46);
    }
  });
});
