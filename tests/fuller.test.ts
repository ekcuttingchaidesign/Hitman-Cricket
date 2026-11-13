/**
 * The fuller ball (`FULLER`): about one an over from every fast bowler, in
 * every mode, pitched up to a half-volley at the shin, never the spinner's and
 * never a yorker, a bouncer or a slower ball; placed off a stream of its own,
 * so no other ball of any innings moved when it came.
 */
import { describe, expect, it } from 'vitest';
import { CLASSIC_PLAN, DeliveryGenerator, MARATHON_PLAN, SUPER10_PLAN, SURVIVE_PLAN, type BowlingPlan } from '../src/game/DeliveryGenerator';
import { SeededRandom } from '../src/game/SeededRandom';
import { FULLER, GAME } from '../src/config/gameplay';
import type { Delivery } from '../src/game/types';

const PLANS: Record<string, BowlingPlan> = { blast: CLASSIC_PLAN, survival: SURVIVE_PLAN, marathon: MARATHON_PLAN, super10: SUPER10_PLAN };
const SPUN = ['OFF_SPIN', 'LEG_SPIN', 'ARM_BALL'];

function innings(plan: BowlingPlan, seed: number, balls: number): Delivery[] {
  const generator = new DeliveryGenerator(new SeededRandom(seed), plan);
  const out: Delivery[] = [];
  for (let n = 0; n < balls; n++) {
    const delivery = generator.next(n * 4000);
    out.push(delivery);
    generator.record({ runs: 1, isWicket: false } as never);
  }
  return out;
}
const perOver = (plan: BowlingPlan) => plan.spin?.ballsPerOver ?? GAME.ballsPerOver;

describe('the fuller ball', () => {
  it.each(Object.keys(PLANS))('is bowled in the %s, pitched up to the shin, at most one an over, by the quicks and never the spinner', name => {
    const plan = PLANS[name];
    let fuller = 0, overs = 0;
    for (const seed of [3, 17, 29]) {
      const balls = innings(plan, seed, 120);
      for (let over = 0; over < balls.length / perOver(plan); over++) {
        const these = balls.slice(over * perOver(plan), (over + 1) * perOver(plan));
        const full = these.filter(ball => ball.full);
        expect(full.length, `${name} ${seed} over ${over}`).toBeLessThanOrEqual(FULLER.perOver);
        fuller += full.length; overs++;
      }
      for (const ball of balls.filter(b => b.full)) {
        expect(SPUN, name).not.toContain(ball.style);
        expect(FULLER.styles, name).toContain(ball.style);
        expect([ball.bounceZ, ball.rise]).toEqual([FULLER.bounce, FULLER.rise]);
      }
    }
    // Something like every other over or more: a place that falls on a yorker, a bouncer, a slower ball or the
    // spinner is let go, and the Marathon's spinner and bouncers take the most.
    expect(fuller / overs, name).toBeGreaterThan(.35);
  });
  it('comes from every kind of fast bowler: the seamer, the swing bowler, the sling bowler and the death bowler', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) for (const ball of innings(SUPER10_PLAN, seed, 60)) if (ball.full)
      kinds.add(ball.death ? 'death' : ball.express ? 'sling' : ball.style === 'SWING_IN' || ball.style === 'SWING_OUT' ? 'swing' : 'seam');
    expect([...kinds].sort()).toEqual(['death', 'seam', 'sling', 'swing']);
  });
  it.each(Object.keys(PLANS))('moves no other ball of the %s: every ball is as it was without it, but for its length', name => {
    for (const seed of [5, 11]) {
      const with_ = innings(PLANS[name], seed, 120), without = innings({ ...PLANS[name], fuller: 0 }, seed, 120);
      without.forEach((ball, n) => {
        const { bounceZ, rise, full, ...rest } = with_[n];
        expect(rest, `${name} ${seed} ball ${n}`).toEqual((({ bounceZ: _b, rise: _r, full: _f, ...r }) => r)(ball));
        if (!full) expect([bounceZ, rise], `${name} ${seed} ball ${n}`).toEqual([ball.bounceZ, ball.rise]);
      });
      expect(without.some(ball => ball.full), name).toBe(false);
    }
  });
});
