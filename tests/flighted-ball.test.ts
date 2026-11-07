import { describe, expect, it } from 'vitest';
import { FLIGHT, GAME, LINE_X, STYLES } from '../src/config/gameplay';
import { SURVIVE } from '../src/config/survive';
import { CLASSIC_PLAN, DeliveryGenerator, MARATHON_PLAN, SUPER10_PLAN, SURVIVE_PLAN, flightsEvery, spun, type BowlingPlan } from '../src/game/DeliveryGenerator';
import { ballPosition, flightProgress } from '../src/game/DeliveryTrajectory';
import { SeededRandom } from '../src/game/SeededRandom';
import { resolveShot } from '../src/game/ShotResolver';
import { surviveBall } from '../src/game/Survive';
import type { Delivery, ShotType, TimingGrade } from '../src/game/types';

const innings = (plan: BowlingPlan, seed: number, balls = 120) => {
  const generator = new DeliveryGenerator(new SeededRandom(seed), plan);
  return Array.from({ length: balls }, (_, i) => generator.next(i * 4000));
};
const without = (plan: BowlingPlan): BowlingPlan => ({ ...plan, spin: plan.spin && { ...plan.spin, flightedPerOver: 0 } });
/** The ball tossed up, as the generator makes it, with what a test changes. */
const tossed = (changes: Partial<Delivery> = {}): Delivery => ({
  line: 'OFF', style: 'OFF_SPIN', speedKph: 78, baseTargetX: LINE_X.OFF, finalTargetX: LINE_X.OFF - 0.3,
  bounceZ: FLIGHT.bounce, rise: GAME.rise, durationMs: 800, releaseTimeMs: 0, idealContactTimeMs: 800, flighted: true, ...changes,
});
/** A die that always lands where it is told. */
const die = (value: number) => ({ next: () => value });
const BLAST: Record<TimingGrade, number> = { PERFECT: 0, GOOD: GAME.timing.perfect + 5, OK: GAME.timing.good + 5, POOR: GAME.timing.ok + 5, MISS: GAME.timing.poor + 30 };
const blast = (d: Delivery, grade: TimingGrade, shot: ShotType, value: number, early = false) =>
  resolveShot(d, { shotType: shot, inputTimeMs: d.idealContactTimeMs + BLAST[grade] * (early ? -1 : 1) }, die(value));
const test = (d: Delivery, delta: number, shot: ShotType, value: number) =>
  surviveBall(d, { shotType: shot, inputTimeMs: d.idealContactTimeMs + delta }, die(value));

describe('the flighted ball: when and how he bowls it', () => {
  const plans: [string, BowlingPlan, number][] = [['Blast', CLASSIC_PLAN, 120], ['Survival', SURVIVE_PLAN, 120], ['Marathon', MARATHON_PLAN, 300], ['Super10', SUPER10_PLAN, 60]];
  it.each(plans)('comes once in every one of his overs in the %s, a turning ball on a good length, off, outside off or middle', (_, plan, length) => {
    const perOver = plan.spin?.ballsPerOver ?? GAME.ballsPerOver;
    let overs = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const balls = innings(plan, seed, length);
      for (let start = 0; start + perOver <= balls.length; start += perOver) {
        const over = balls.slice(start, start + perOver);
        if (!over.every(spun)) continue;
        overs++;
        const flighted = over.filter(d => d.flighted);
        expect(flighted, `seed ${seed} over at ${start}`).toHaveLength(1);
        const [ball] = flighted;
        expect(['OFF_SPIN', 'LEG_SPIN']).toContain(ball.style);
        expect(FLIGHT.lines).toContain(ball.line);
        expect(ball.dragged).toBeFalsy();
        expect(ball.bounceZ).toBe(FLIGHT.bounce);
        expect(ball.speedKph).toBeLessThanOrEqual(Math.round(STYLES[ball.style].max * FLIGHT.pace));
      }
      for (const ball of balls) if (!spun(ball)) expect(ball.flighted).toBeFalsy();
    }
    expect(overs).toBeGreaterThan(plan === SUPER10_PLAN ? 15 : 20);
  });
  it('turns both ways', () => {
    const styles = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) for (const ball of innings(CLASSIC_PLAN, seed, 30)) if (ball.flighted) styles.add(ball.style);
    expect([...styles].sort()).toEqual(['LEG_SPIN', 'OFF_SPIN']);
  });
  it('moves no other ball of any innings: it is placed off a stream of its own', () => {
    for (const [, plan] of plans) for (let seed = 1; seed <= 10; seed++) {
      const was = innings(without(plan), seed, 200);
      innings(plan, seed, 200).forEach((ball, i) => {
        if (!ball.flighted) { expect(ball, `seed ${seed} ball ${i}`).toEqual(was[i]); return; }
        // Itself, only what flight changes: its line, its pace, its length, and so its turn.
        expect(ball.style).toBe(was[i].style);
      });
    }
  });
  it('is every ball but the arm ball on `?flight=1`', () => {
    const balls = innings(flightsEvery(CLASSIC_PLAN), 7, GAME.totalBalls);
    expect(balls.every(spun)).toBe(true);
    for (const ball of balls) expect(!!ball.flighted, ball.style).toBe(ball.style !== 'ARM_BALL');
  });
});

describe('the flighted ball: its flight', () => {
  const same = (a: { x: number; y: number; z: number }, b: typeof a) => {
    expect(a.x).toBeCloseTo(b.x, 9); expect(a.y).toBeCloseTo(b.y, 9); expect(a.z).toBeCloseTo(b.z, 9);
  };
  const stock = (d: Delivery): Delivery => ({ ...d, flighted: false });
  const bounceT = (GAME.releaseZ - FLIGHT.bounce) / (GAME.releaseZ - GAME.contactZ);
  it('goes higher than his stock ball and comes down steeper, onto the same spot', () => {
    const ball = tossed();
    const peak = (d: Delivery) => Math.max(...Array.from({ length: 50 }, (_, i) => ballPosition(d, bounceT * i / 50).y));
    expect(peak(ball)).toBeGreaterThan(peak(stock(ball)) + 0.6);
    const fall = (d: Delivery) => ballPosition(d, bounceT * 0.9).y - ballPosition(d, bounceT).y;
    expect(fall(ball)).toBeGreaterThan(fall(stock(ball)));
    same(ballPosition(ball, bounceT), ballPosition(stock(ball), bounceT));
  });
  it('drifts the other way to its turn in the air, and arrives where his stock ball would', () => {
    for (const style of ['OFF_SPIN', 'LEG_SPIN'] as const) {
      const turn = style === 'OFF_SPIN' ? -0.3 : 0.25;
      const ball = tossed({ style, baseTargetX: LINE_X.MIDDLE, finalTargetX: turn });
      const midAir = ballPosition(ball, bounceT * 0.6).x - ballPosition(stock(ball), bounceT * 0.6).x;
      // Drawn from the hand on the side it turns to, it drifts back across to the other.
      const drift = ballPosition(ball, bounceT * 0.6).x - ballPosition(ball, 0).x;
      expect(Math.sign(drift), style).toBe(-Math.sign(turn));
      expect(Math.abs(midAir)).toBeGreaterThan(0.02);
      // At the bat, exactly where his stock ball on that line and turn would be.
      same(ballPosition(ball, 1), ballPosition({ ...stock(ball), bounceZ: GAME.bounceZ }, 1));
      expect(ballPosition(ball, bounceT).z).toBeCloseTo(FLIGHT.bounce, 9);
    }
  });
  it('pitches up, nearer the batter than his stock ball, and turns after it lands, done before the bat', () => {
    expect(FLIGHT.bounce).toBeLessThan(GAME.bounceZ - 1.5);
    for (const style of ['OFF_SPIN', 'LEG_SPIN'] as const) {
      const turn = style === 'OFF_SPIN' ? -0.3 : 0.25;
      const ball = tossed({ style, baseTargetX: LINE_X.MIDDLE, finalTargetX: turn });
      // Straight off the pitch, then all the way round by `settle` after it.
      expect(ballPosition(ball, bounceT + 1e-6).x).toBeCloseTo(LINE_X.MIDDLE, 4);
      expect(ballPosition(ball, bounceT + FLIGHT.settle / 2).x).not.toBeCloseTo(turn, 2);
      expect(ballPosition(ball, bounceT + FLIGHT.settle).x).toBeCloseTo(turn, 9);
      expect(bounceT + FLIGHT.settle).toBeLessThan(0.9);
      // And it turns the same way every step of the way: no going back.
      let last = ballPosition(ball, bounceT).x;
      for (let i = 1; i <= 20; i++) {
        const x = ballPosition(ball, bounceT + FLIGHT.settle * i / 20).x;
        expect(Math.sign(x - last) || Math.sign(turn)).toBe(Math.sign(turn));
        last = x;
      }
    }
  });
  it('is slower, so it arrives later, and still arrives on time', () => {
    const ball = tossed();
    expect(flightProgress(ball, ball.durationMs)).toBeCloseTo(1, 9);
  });
});

describe('the flighted ball in the Blast', () => {
  const drives: ShotType[] = ['STRAIGHT', 'LONG_ON', 'COVER_LONG_OFF'];
  it('driven at and beaten, he is lured out and stumped half the time', () => {
    for (const shot of drives) {
      const out = blast(tossed(), 'MISS', shot, 0.1);
      expect(out.wicketType, shot).toBe('STUMPED');
      expect(out.feedback).toBe(FLIGHT.feedback.stumped);
      expect(blast(tossed(), 'MISS', shot, 0.9).wicketType, shot).not.toBe('STUMPED');
    }
  });
  it('driven early, the dip has it up and held; driven late, the drift takes the edge', () => {
    const early = blast(tossed(), 'OK', 'STRAIGHT', 0.1, true);
    expect([early.isWicket, early.wicketType, early.aerial, early.feedback]).toEqual([true, 'CAUGHT', true, FLIGHT.feedback.deceived]);
    const late = blast(tossed(), 'OK', 'COVER_LONG_OFF', 0.1);
    expect([late.isWicket, late.edged, late.feedback]).toEqual([true, true, FLIGHT.feedback.drift]);
    // Not every time: OK is still worth runs more often than not.
    expect(blast(tossed(), 'OK', 'STRAIGHT', 0.9, true).isWicket).toBe(false);
    expect(blast(tossed(), 'OK', 'STRAIGHT', 0.9).isWicket).toBe(false);
  });
  it('middled, it is the ball with something to hit: six, as ever', () => {
    expect(blast(tossed({ line: 'MIDDLE', baseTargetX: 0, finalTargetX: 0 }), 'PERFECT', 'STRAIGHT', 0.1).runs).toBe(6);
  });
  it('asks nothing of a stroke that is not a drive', () => {
    // Against the same ball at his stock length, which the sweep reads too.
    const ball = tossed(), stock = { ...ball, flighted: false, bounceZ: GAME.bounceZ };
    for (const shot of ['LEG', 'SQUARE_CUT', 'DEFEND', 'LATE_CUT'] as ShotType[]) for (const grade of ['OK', 'MISS'] as TimingGrade[])
      expect(blast(ball, grade, shot, 0.1), `${shot} ${grade}`).toEqual(blast(stock, grade, shot, 0.1));
  });
});

describe('the flighted ball in a Test', () => {
  const { perfect, ok, poor } = SURVIVE.timing;
  it('driven at and beaten, he is stumped more often than the turn alone has him', () => {
    expect(test(tossed(), poor + 60, 'STRAIGHT', 0.3).wicketType).toBe('STUMPED');
    expect(test(tossed(), poor + 60, 'STRAIGHT', 0.3).feedback).toBe(FLIGHT.feedback.stumped);
  });
  it('driven poorly and early it goes up; late, the drift takes the edge on any line', () => {
    const early = test(tossed(), -(ok + 5), 'STRAIGHT', 0.01);
    expect([early.isWicket, early.aerial, early.feedback]).toEqual([true, true, FLIGHT.feedback.deceived]);
    const late = test(tossed({ line: 'MIDDLE', baseTargetX: 0, finalTargetX: 0.2, style: 'LEG_SPIN' }), ok + 5, 'STRAIGHT', 0.01);
    expect([late.isWicket, late.edged, late.feedback]).toEqual([true, true, FLIGHT.feedback.drift]);
  });
  it('driven well, it beats the field for four, where his other balls are worked for ones and twos', () => {
    const ball = tossed({ line: 'MIDDLE', baseTargetX: 0, finalTargetX: 0 });
    expect(test(ball, perfect + 5, 'STRAIGHT', 0.5).runs).toBe(4);
    expect(test({ ...ball, flighted: false }, perfect + 5, 'STRAIGHT', 0.5).runs).toBeLessThan(4);
  });
});
