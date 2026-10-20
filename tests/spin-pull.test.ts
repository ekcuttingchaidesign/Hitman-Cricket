import { describe, expect, it } from 'vitest';
import { DRAGGED, GAME, LINE_X, PUNCH, SPIN_PULL, SWEEP } from '../src/config/gameplay';
import { CLASSIC_PLAN, DeliveryGenerator, MARATHON_PLAN, SURVIVE_PLAN, spinPullsEvery, spun, type BowlingPlan } from '../src/game/DeliveryGenerator';
import { ballPosition } from '../src/game/DeliveryTrajectory';
import { SeededRandom } from '../src/game/SeededRandom';
import { droveShort, gradeTiming, loftedDrive, resolveShot, slogSweep, spinPull, sweepable, sweeps } from '../src/game/ShotResolver';
import { resolveSurvive, surviveBall } from '../src/game/Survive';
import type { Delivery, ShotType, TimingGrade } from '../src/game/types';

/** Every ball of an innings bowled on `plan`, up to `balls`. */
const innings = (plan: BowlingPlan, seed: number, balls = 120) => {
  const generator = new DeliveryGenerator(new SeededRandom(seed), plan);
  return Array.from({ length: balls }, (_, i) => generator.next(i * 4000));
};
/** The spinner's ball, as the generator makes it, with what a test changes. */
const spinner = (changes: Partial<Delivery> = {}): Delivery => ({
  line: 'MIDDLE', style: 'OFF_SPIN', speedKph: 88, baseTargetX: 0, finalTargetX: 0,
  bounceZ: GAME.bounceZ, rise: GAME.rise, durationMs: 700, releaseTimeMs: 0, idealContactTimeMs: 700, ...changes,
});
const short = (changes: Partial<Delivery> = {}) => spinner({ bounceZ: DRAGGED.bounce, rise: DRAGGED.rise, dragged: true, ...changes });
const arm = (changes: Partial<Delivery> = {}) => spinner({ style: 'ARM_BALL', speedKph: 124, ...changes });
/** A delta that lands in `grade` of the Blast's windows. */
const DELTA: Record<TimingGrade, number> = { PERFECT: 0, GOOD: GAME.timing.perfect + 5, OK: GAME.timing.good + 5, POOR: GAME.timing.ok + 5, MISS: GAME.timing.poor + 30 };
const play = (d: Delivery, grade: TimingGrade, shot: ShotType = 'LEG', seed = 3, charged = false) =>
  resolveShot(d, { shotType: shot, inputTimeMs: d.idealContactTimeMs + DELTA[grade] }, new SeededRandom(seed), charged);

describe("the spinner's ball dropped short", () => {
  const plans: [string, BowlingPlan][] = [['Blast', CLASSIC_PLAN], ['Survival', SURVIVE_PLAN], ['Marathon', MARATHON_PLAN]];
  it.each(plans)('comes once in every one of his overs in the %s, never the arm ball', (_, plan) => {
    const perOver = plan.spin?.ballsPerOver ?? GAME.ballsPerOver;
    let overs = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const balls = innings(plan, seed, plan === MARATHON_PLAN ? 300 : 120);
      for (let start = 0; start + perOver <= balls.length; start += perOver) {
        const over = balls.slice(start, start + perOver);
        if (!over.every(spun)) continue;
        overs++;
        const dragged = over.filter(d => d.dragged);
        expect(dragged, `seed ${seed} over at ${start}`).toHaveLength(1);
        expect(dragged[0].style === 'OFF_SPIN' || dragged[0].style === 'LEG_SPIN').toBe(true);
      }
      // Nobody else drops one short this way.
      for (const ball of balls) if (!spun(ball)) expect(ball.dragged).toBeFalsy();
    }
    expect(overs).toBeGreaterThan(20);
  });
  it('is too short to sweep, and reaches him at the waist, where the punch and the back-foot defence take over', () => {
    const ball = short();
    expect(sweepable(ball)).toBe(false);
    expect(ball.bounceZ).toBeLessThan(SWEEP.minBounceZ);
    const height = ballPosition(ball, 1).y;
    expect(height).toBeGreaterThan(PUNCH.minBallY);
    expect(height).toBeLessThan(.9);
  });
  it('moves no other ball of any innings: it is placed off a stream of its own', () => {
    for (const [, plan] of plans) for (let seed = 1; seed <= 10; seed++) {
      const without = innings({ ...plan, spin: plan.spin && { ...plan.spin, draggedPerOver: 0 } }, seed, 200);
      const withIt = innings(plan, seed, 200);
      withIt.forEach((ball, i) => {
        const { bounceZ: _b, rise: _r, dragged: _d, ...rest } = ball;
        const { bounceZ: _b2, rise: _r2, dragged: _d2, ...was } = without[i];
        expect(rest, `seed ${seed} ball ${i}`).toEqual(was);
      });
    }
  });
  it('is every ball but the arm ball on `?spinpull=1`', () => {
    const balls = innings(spinPullsEvery(CLASSIC_PLAN), 7, GAME.totalBalls);
    expect(balls.every(spun)).toBe(true);
    for (const ball of balls) expect(!!ball.dragged, ball.style).toBe(ball.style !== 'ARM_BALL');
  });
});

describe('the pull off the spinner: when it is played', () => {
  const grades: TimingGrade[] = ['PERFECT', 'GOOD', 'OK', 'POOR', 'MISS'];
  it('at the ball dropped short, off the leg-side swipe, whatever the timing', () => {
    for (const grade of grades) expect(spinPull(short(), { shotType: 'LEG' }, grade), grade).toBe(true);
    for (const shot of ['LONG_ON', 'STRAIGHT', 'COVER_LONG_OFF', 'SQUARE_CUT', 'DEFEND', 'LATE_CUT'] as const)
      expect(spinPull(short(), { shotType: shot }, 'PERFECT'), shot).toBe(false);
  });
  it('at the arm ball timed good or better; timed worse it is still the flick', () => {
    expect(spinPull(arm(), { shotType: 'LEG' }, 'PERFECT')).toBe(true);
    expect(spinPull(arm(), { shotType: 'LEG' }, 'GOOD')).toBe(true);
    for (const grade of ['OK', 'POOR', 'MISS'] as const) expect(spinPull(arm(), { shotType: 'LEG' }, grade), grade).toBe(false);
    expect(play(arm(), 'OK').spinPulled).toBeFalsy();
    expect(play(arm(), 'POOR').spinPulled).toBeFalsy();
  });
  it('never at the full ball, which is swept or flicked as it always was, nor at a seamer', () => {
    for (const style of ['OFF_SPIN', 'LEG_SPIN'] as const) for (const grade of grades)
      expect(spinPull(spinner({ style }), { shotType: 'LEG' }, grade), `${style} ${grade}`).toBe(false);
    for (const style of ['NORMAL', 'FAST', 'SHORT', 'RIB'] as const)
      expect(spinPull(spinner({ style }), { shotType: 'LEG' }, 'PERFECT'), style).toBe(false);
  });
  it('is never the sweep: neither sweep is offered at the ball dropped short, meter or not', () => {
    const attempt = { shotType: 'LEG' as const, inputTimeMs: short().idealContactTimeMs };
    expect(slogSweep(short(), attempt, true)).toBe(false);
    for (const grade of grades) expect(sweeps(short(), attempt, grade), grade).toBe(false);
    expect(play(short(), 'PERFECT', 'LEG', 3, true).swept).toBeFalsy();
  });
});

describe('the pull off the spinner: what it is worth', () => {
  it('middled six, a shade under four, held back one or two', () => {
    const six = play(short(), 'PERFECT');
    expect(six.spinPulled).toBe(true); expect(six.runs).toBe(6);
    expect(play(short(), 'GOOD').runs).toBe(4);
    for (let seed = 1; seed < 30; seed++) expect([1, 2]).toContain(play(short(), 'OK', 'LEG', seed).runs);
    // The arm ball read early pays the same.
    expect(play(arm(), 'PERFECT').runs).toBe(6);
    expect(play(arm(), 'GOOD').runs).toBe(4);
  });
  it('poor off the top edge, caught three times in four, a single off the bottom of the bat otherwise', () => {
    let caught = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const out = play(short(), 'POOR', 'LEG', seed);
      expect(out.spinPulled).toBe(true);
      if (out.isWicket) { caught++; expect(out.wicketType).toBe('CAUGHT'); expect(out.feedback).toBe(SPIN_PULL.feedback.topEdge); }
      else expect(out.runs).toBe(1);
    }
    expect(caught / 400).toBeGreaterThan(.65); expect(caught / 400).toBeLessThan(.85);
  });
  it('missed, the ball goes on, and is judged as any ball that beat the bat', () => {
    const out = play(arm(), 'MISS');
    expect(out.spinPulled).toBeFalsy(); expect(out.madeBatContact).toBe(false);
  });
  it('is not held to the line: pulled from outside off it is still six middled', () => {
    for (const line of ['OUTSIDE_OFF', 'OFF', 'MIDDLE', 'LEG', 'OUTSIDE_LEG'] as const) {
      const ball = short({ line, baseTargetX: LINE_X[line], finalTargetX: LINE_X[line] });
      expect(play(ball, 'PERFECT').runs, line).toBe(6);
    }
  });
  it('goes between midwicket and square leg', () => {
    expect(SPIN_PULL.angle).toBeLessThan(-52);
    expect(SPIN_PULL.angle).toBeGreaterThan(-90);
  });
});

describe('a drive at the ball dropped short', () => {
  it('is four at the most, never six, and never lofted', () => {
    for (const shot of ['STRAIGHT', 'LONG_ON'] as const) {
      const ball = short({ line: shot === 'LONG_ON' ? 'LEG' : 'MIDDLE', baseTargetX: shot === 'LONG_ON' ? LINE_X.LEG : 0, finalTargetX: shot === 'LONG_ON' ? LINE_X.LEG : 0 });
      expect(droveShort(ball, { shotType: shot })).toBe(true);
      expect(loftedDrive(ball, { shotType: shot, inputTimeMs: ball.idealContactTimeMs })).toBe(false);
      expect(play(ball, 'PERFECT', shot).runs, shot).toBe(4);
      expect(play(ball, 'GOOD', shot).runs, shot).toBe(2);
    }
  });
  it('leaves the drive at a full spinner as it was: middled on the stumps it is still six', () => {
    expect(play(spinner(), 'PERFECT', 'STRAIGHT').runs).toBe(6);
  });
});

describe('the pull off the spinner in a Test', () => {
  // Survival's grade, a tailender's, which the rig asks for too.
  const at = (d: Delivery, grade: TimingGrade, shot: ShotType = 'LEG') => {
    const delta = { PERFECT: 0, GOOD: 25, OK: 60, POOR: 120, MISS: 400 }[grade];
    return { shotType: shot, inputTimeMs: d.idealContactTimeMs - delta };
  };
  it('is the same stroke on the same rule, tagged for where it goes, and paid off the mode\'s own ladder', () => {
    const attempt = at(short(), 'PERFECT');
    const out = resolveSurvive(short(), attempt, new SeededRandom(2));
    expect(out.spinPulled).toBe(true);
    expect(out.runs).toBe(4);
    // The tag is all the wrapper adds.
    const { spinPulled: _tag, ...paid } = out;
    expect(paid).toEqual(surviveBall(short(), attempt, new SeededRandom(2)));
  });
  it('is not held to the line there either', () => {
    const wide = short({ line: 'OUTSIDE_OFF', baseTargetX: LINE_X.OUTSIDE_OFF, finalTargetX: LINE_X.OUTSIDE_OFF });
    expect(resolveSurvive(wide, at(wide, 'PERFECT'), new SeededRandom(2)).runs).toBe(4);
  });
  it('picks the pull or the flick at the arm ball on the mode\'s own grade', () => {
    const ball = arm();
    for (const grade of ['PERFECT', 'GOOD', 'OK', 'POOR'] as const) {
      const attempt = at(ball, grade);
      const survival = gradeTiming(attempt.inputTimeMs - ball.idealContactTimeMs, false, { perfect: 18, good: 40, ok: 78, poor: 165 });
      const out = resolveSurvive(ball, attempt, new SeededRandom(2));
      if (out.madeBatContact) expect(!!out.spinPulled, grade).toBe(survival === 'PERFECT' || survival === 'GOOD');
    }
  });
  it('drives the ball dropped short for four at the most', () => {
    const ball = short();
    for (let seed = 1; seed < 40; seed++) expect(resolveSurvive(ball, at(ball, 'PERFECT', 'STRAIGHT'), new SeededRandom(seed)).runs).toBeLessThanOrEqual(4);
  });
});
