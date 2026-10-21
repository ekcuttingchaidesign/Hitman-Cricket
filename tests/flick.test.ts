import { describe, expect, it } from 'vitest';
import { FLICK, GAME, LINE_X } from '../src/config/gameplay';
import { DEFENCE_BACK_HEIGHT, FLICK_ODDS, PULL_HEIGHT, flickBackFoot, flickVersionOf } from '../src/entities/Batter';
import { flicked, resolveShot } from '../src/game/ShotResolver';
import { surviveBall } from '../src/game/Survive';
import { practiceSwitches } from '../src/game/practice';
import type { Delivery, ShotAttempt, ShotOutcome } from '../src/game/types';

/**
 * The flick's version two, worked off the pads with the wrists: four if it is
 * middled or a shade under, and ones, twos, threes or a catch held back or
 * mistimed, in every mode. Never six.
 */
const delivery = (changes: Partial<Delivery> = {}): Delivery => ({ line: 'LEG', style: 'NORMAL', speedKph: 125, baseTargetX: LINE_X.LEG,
  finalTargetX: LINE_X.LEG, bounceZ: GAME.bounceZ, rise: GAME.rise, durationMs: 1000, releaseTimeMs: 0, idealContactTimeMs: 1000, ...changes });
const flick = (delta: number): ShotAttempt => ({ shotType: 'LEG', inputTimeMs: 1000 + delta, flicked: true });
const rng = (value: number) => ({ next: () => value });
const outcome = (timingGrade: ShotOutcome['timingGrade'], compatibility = 1): ShotOutcome =>
  ({ runs: 0, isWicket: false, quality: 0, feedback: '', timingGrade, timingDeltaMs: 0, compatibility, madeBatContact: true, aerial: false });
const deltas = Array.from({ length: 41 }, (_, n) => n * 10 - 200);
const rolls = [0, .05, .2, .45, .6, .8, .95, .99];

describe('the flick, version two', () => {
  it('goes for four, along the ground, middled or a shade under', () => {
    for (const grade of ['PERFECT', 'GOOD'] as const) for (const roll of rolls) {
      const four = flicked(outcome(grade), rng(roll), false);
      expect(four.runs).toBe(4); expect(four.isWicket).toBe(false); expect(four.aerial).toBe(false);
    }
  });
  it('is ones, twos and threes held back or mistimed, or chipped up and caught', () => {
    for (const grade of ['OK', 'POOR'] as const) {
      const seen = new Set<number | string>();
      for (const roll of rolls) {
        const result = flicked(outcome(grade), rng(roll), false);
        if (result.isWicket) { expect(result.wicketType).toBe('CAUGHT'); expect(result.aerial).toBe(true); seen.add('caught'); }
        else { expect([1, 2, 3]).toContain(result.runs); seen.add(result.runs); }
      }
      expect(seen.has('caught'), grade).toBe(true);
    }
    // Rarely caught held back, half the time mistimed.
    expect(FLICK.ok.caught).toBeLessThan(FLICK.poor.caught);
    expect(flicked(outcome('OK'), rng(.2), false).isWicket).toBe(false);
    expect(flicked(outcome('POOR'), rng(.2), false).isWicket).toBe(true);
  });
  it('runs no three in a Test', () => {
    for (const grade of ['OK', 'POOR'] as const) for (const roll of rolls) expect(flicked(outcome(grade), rng(roll), true).runs).not.toBe(3);
  });
  it('is as good as mistimed across a ball it does not suit', () => {
    expect(flicked(outcome('PERFECT', .5), rng(.99), false).runs).not.toBe(4);
  });
  it('is never six in the Blast, and four whenever it is middled or a shade under', () => {
    for (const delta of deltas) for (const roll of rolls) {
      const result = resolveShot(delivery(), flick(delta), rng(roll));
      expect(result.runs, `${delta} ${roll}`).not.toBe(6);
      if (result.timingGrade === 'PERFECT' || result.timingGrade === 'GOOD') expect(result.runs).toBe(4);
      if (result.timingGrade === 'OK' || result.timingGrade === 'POOR') expect(result.isWicket ? result.wicketType : result.runs).toBeOneOf(['CAUGHT', 1, 2, 3]);
    }
    // Version one, untagged, is scored as every other stroke: middled, six.
    expect(resolveShot(delivery(), { shotType: 'LEG', inputTimeMs: 1000 }, rng(.5)).runs).toBe(6);
  });
  it('is paid on its own ladder in a Test as well, off the mode\'s own grade', () => {
    for (const delta of deltas) for (const roll of rolls) {
      const result = surviveBall(delivery(), flick(delta), rng(roll));
      expect(result.runs, `${delta} ${roll}`).not.toBe(6);
      expect(result.runs).not.toBe(3);
      if (result.timingGrade === 'PERFECT' || result.timingGrade === 'GOOD') expect(result.runs).toBe(4);
      if (result.timingGrade === 'OK' || result.timingGrade === 'POOR') expect(result.isWicket ? result.wicketType : result.runs).toBeOneOf(['CAUGHT', 1, 2]);
    }
  });
  it('is beaten like any other stroke when it misses, or across a ball wide of off', () => {
    expect(resolveShot(delivery(), flick(400), rng(.5)).madeBatContact).toBe(false);
    const wide = delivery({ line: 'OUTSIDE_OFF', baseTargetX: LINE_X.OUTSIDE_OFF, finalTargetX: LINE_X.OUTSIDE_OFF });
    expect(resolveShot(wide, flick(0), rng(.5)).madeBatContact).toBe(false);
  });
  it('is played half the time, the same version off the same ball of the same seed', () => {
    let twos = 0;
    for (let ball = 0; ball < 4000; ball++) {
      const version = flickVersionOf(1234567, ball);
      expect(flickVersionOf(1234567, ball)).toBe(version);
      if (version === 2) twos++;
    }
    expect(twos / 4000).toBeCloseTo(FLICK_ODDS[2], 1);
  });
  it('asked for by the link, is practice: version two moves the score', () => {
    expect(practiceSwitches('?flickv=2')).toEqual(['flickv']);
    expect(practiceSwitches('?flickv=1')).toEqual(['flickv']);
    expect(practiceSwitches('?flickv=3')).toEqual([]);
  });
});

/**
 * The flick's version three is the length's, not the roll's: at a ball short
 * of a length, rising to the thigh, the leg-side input flicks off the back
 * foot. Pitched up it is versions one and two; a bouncer is pulled.
 */
describe('the flick, version three', () => {
  it('is played at a ball short of a length and never at one pitched up or a bouncer', () => {
    // A yorker, a full ball, a good length, back of a length, a bouncer, as they reach him.
    expect([.19, .4, .54, .81, 1.13].map(flickBackFoot)).toEqual([false, false, false, true, false]);
    expect(flickBackFoot(DEFENCE_BACK_HEIGHT)).toBe(false);
    expect(flickBackFoot(PULL_HEIGHT)).toBe(true);
    expect(flickBackFoot(PULL_HEIGHT + .01)).toBe(false);
  });
});
