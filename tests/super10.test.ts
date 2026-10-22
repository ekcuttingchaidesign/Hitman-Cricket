import { describe, expect, it } from 'vitest';
import { BATTERS, DEATH_OVER, SIX_WINDOW, SUPER10, batterAt, scheduleOf, windowsAt, type Bowler as Super10Bowler } from '../src/config/super10';
import { BATTERS as MARATHON_BATTERS } from '../src/config/marathon';
import { DeliveryGenerator, MARATHON_PLAN, SUPER10_PLAN, spun, withoutYorkers } from '../src/game/DeliveryGenerator';
import { SeededRandom } from '../src/game/SeededRandom';
import { Bowler, DEATH_ACTION, PACE_ACTION, PHASES, loopDrop } from '../src/entities/Bowler';
import type { Delivery } from '../src/game/types';

/** A whole Super10 innings' bowling, sixty balls, over by over. */
function innings(seed: number, plan = SUPER10_PLAN, field: string | null = null) {
  const generator = new DeliveryGenerator(new SeededRandom(seed), plan);
  generator.field = field;
  const overs: { kind: ReturnType<DeliveryGenerator['overKind']>; balls: Delivery[] }[] = [];
  for (let over = 0; over < SUPER10.overs; over++) {
    const kind = generator.overKind(over);
    const balls = Array.from({ length: SUPER10.ballsPerOver }, () => generator.next(0));
    overs.push({ kind, balls });
  }
  return overs;
}
const SEEDS = Array.from({ length: 200 }, (_, i) => (i * 2654435761 + 7) >>> 0);

describe('Super10: who bowls when', () => {
  it('gives five bowlers two overs each, and nobody two running', () => {
    for (const seed of SEEDS) {
      const overs = scheduleOf(new SeededRandom(seed));
      expect(overs).toHaveLength(SUPER10.overs);
      const count = (who: Super10Bowler) => overs.filter(o => o === who).length;
      for (const who of ['SWING', 'SEAM', 'SPIN', 'SLING', 'DEATH'] as const) expect(count(who)).toBe(2);
      for (let i = 1; i < overs.length; i++) expect(overs[i]).not.toBe(overs[i - 1]);
    }
  });

  it('opens with the swing bowler, always brings the spinner on fourth and the sling bowler fifth, and finishes with the death bowler', () => {
    for (const seed of SEEDS) {
      const overs = scheduleOf(new SeededRandom(seed));
      expect([overs[0], overs[2]]).toEqual(['SWING', 'SWING']);
      expect(overs[1]).toBe('SEAM');
      expect(overs[3]).toBe('SPIN');
      expect(overs[4]).toBe('SLING');
      expect([overs[7], overs[8], overs[9]]).toEqual(['DEATH', 'SLING', 'DEATH']);
    }
  });

  it('draws the order of the sixth and seventh off the seed, both ways round', () => {
    const middles = new Set(SEEDS.map(seed => scheduleOf(new SeededRandom(seed)).slice(5, 7).join('-')));
    expect(middles).toEqual(new Set(['SPIN-SEAM', 'SEAM-SPIN']));
  });

  it('bowls the same innings off the same seed', () => {
    expect(innings(12345)).toEqual(innings(12345));
  });
});

describe('Super10: the bowling', () => {
  it('bowls to the field: the seamer at the stumps and the pads after the Powerplay, the death bowler wide of off', () => {
    const share = (pick: (over: number, kind: string | null) => boolean, lines: string[]) => {
      let mine = 0, all = 0;
      for (const seed of SEEDS) innings(seed).forEach(({ kind, balls }, over) => {
        if (!pick(over, kind)) return;
        for (const ball of balls) { all++; if (lines.includes(ball.line)) mine++; }
      });
      return mine / all;
    };
    // Two lines of five dealt at random are two in five; bowled to the field, well over half.
    expect(share((over, kind) => kind === 'PACE' && over >= SUPER10.powerplay, ['MIDDLE', 'LEG'])).toBeGreaterThan(.55);
    expect(share((_, kind) => kind === 'DEATH', ['OFF', 'OUTSIDE_OFF'])).toBeGreaterThan(.55);
  });

  it('bowls to the field he set: the death bowler at the stumps and the pads to his straight field', () => {
    let mine = 0, all = 0;
    for (const seed of SEEDS) innings(seed, SUPER10_PLAN, 'straight').forEach(({ kind, balls }) => {
      if (kind !== 'DEATH') return;
      for (const ball of balls) { all++; if (['MIDDLE', 'LEG'].includes(ball.line)) mine++; }
    });
    expect(mine / all).toBeGreaterThan(.55);
  });

  it('hands each over to the bowler the schedule names', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      for (const { kind, balls } of innings(seed)) {
        for (const ball of balls) {
          expect(!!ball.express).toBe(kind === 'EXPRESS');
          expect(!!ball.death).toBe(kind === 'DEATH');
          expect(spun(ball)).toBe(kind === 'SPIN');
        }
      }
    }
  });

  it('swings the new ball late, and never reverses it', () => {
    let swung = 0, late = 0;
    for (const seed of SEEDS.slice(0, 40)) {
      const overs = innings(seed);
      for (const over of [0, 2]) {
        for (const ball of overs[over].balls) {
          expect(ball.style.startsWith('REVERSE')).toBe(false);
          if (ball.style === 'SWING_IN' || ball.style === 'SWING_OUT') { swung++; if (ball.late) late++; }
        }
      }
      // And the seamer's over is the Blast's own: nothing held late.
      for (const ball of overs[1].balls) expect(ball.late ?? 0).toBe(0);
    }
    // Two thirds of what he rolls for: well over half his balls, every one held late.
    expect(swung / (40 * 12)).toBeGreaterThan(.45);
    expect(late).toBe(swung);
  });

  it('bowls the new ball at the Marathon swing bowler\'s pace, and as quick to the bat', () => {
    // His own balls only: the Marathon's spinner shares those overs, and its reverse swing is not Super10's.
    const swingBalls = (plan: typeof SUPER10_PLAN, overs: number[]) => {
      const kph: number[] = [], ms: number[] = [];
      for (const seed of SEEDS) {
        const generator = new DeliveryGenerator(new SeededRandom(seed), plan);
        for (let over = 0; over < SUPER10.overs; over++) {
          const swinging = generator.overKind(over) === 'PACE' && generator.levelAt(over)?.swingShare !== undefined;
          for (let ball = 0; ball < SUPER10.ballsPerOver; ball++) {
            const d = generator.next(0);
            if (overs.includes(over) && swinging && !spun(d) && !d.style.startsWith('REVERSE')) { kph.push(d.speedKph); ms.push(d.durationMs); }
          }
        }
      }
      const mean = (a: number[]) => a.reduce((t, v) => t + v, 0) / a.length;
      return { kph: mean(kph), ms: mean(ms) };
    };
    const super10 = swingBalls(SUPER10_PLAN, [0, 2]);
    const marathon = swingBalls(MARATHON_PLAN, [5, 6, 7, 8, 9]);
    expect(Math.abs(super10.kph / marathon.kph - 1)).toBeLessThan(.03);
    expect(Math.abs(super10.ms / marathon.ms - 1)).toBeLessThan(.05);
  });

  it('plans the death bowler\'s over: two yorkers, a slower ball, and his stock ball at his own pace', () => {
    let wide = 0, bouncers = 0;
    for (const seed of SEEDS) {
      for (const { kind, balls } of innings(seed)) {
        if (kind !== 'DEATH') continue;
        const yorkers = balls.filter(b => b.style === 'YORKER');
        expect(yorkers).toHaveLength(DEATH_OVER.yorkers);
        expect(balls.filter(b => b.style === 'SLOWER')).toHaveLength(1);
        if (yorkers.some(b => b.line === DEATH_OVER.wideLine)) wide++;
        const short = balls.filter(b => b.style === 'SHORT');
        expect(short.length).toBeLessThanOrEqual(1);
        bouncers += short.length;
        for (const ball of balls) {
          const pace = ball.style === 'SLOWER' ? DEATH_OVER.slower : ball.style === 'SHORT' ? DEATH_OVER.slowBouncer : DEATH_OVER;
          expect(ball.speedKph).toBeGreaterThanOrEqual(pace.min);
          expect(ball.speedKph).toBeLessThanOrEqual(pace.max);
        }
      }
    }
    // Four hundred overs. Half have the planned wide yorker, and in the rest a
    // yorker can still be dealt outside off by the bag (one line in five, two
    // yorkers): about 0.5 + 0.5 × 0.36 = 0.68 in all. Half have the slower bouncer.
    expect(wide / 400).toBeGreaterThan(.58); expect(wide / 400).toBeLessThan(.78);
    expect(bouncers / 400).toBeGreaterThan(.4); expect(bouncers / 400).toBeLessThan(.6);
  });

  it('bowls a newcomer no yorker from the death bowler either', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      for (const { kind, balls } of innings(seed, withoutYorkers(SUPER10_PLAN))) {
        if (kind === 'DEATH') expect(balls.some(b => b.style === 'YORKER')).toBe(false);
      }
    }
  });
});

describe('Super10: the three batters', () => {
  it('all bat with the Marathon opener\'s windows, the window for a six narrowed', () => {
    const opener = MARATHON_BATTERS[0].timing;
    for (const b of BATTERS) {
      expect(b.timing.perfect).toBe(Math.round(opener.perfect * SIX_WINDOW));
      expect(b.timing).toMatchObject({ good: opener.good, ok: opener.ok, poor: opener.poor });
    }
  });

  it('send in whoever the wickets say, and the middle-order batter stays', () => {
    expect(batterAt(0).title).toBe('OPENER');
    expect(batterAt(1).title).toBe('NO. 3');
    expect(batterAt(2).title).toBe('MIDDLE ORDER');
    expect(batterAt(5).title).toBe('MIDDLE ORDER');
  });

  it('keep the same windows to the last ball: the death overs narrow nothing', () => {
    for (let ball = 0; ball < SUPER10.totalBalls; ball++) expect(windowsAt(0, ball)).toEqual(BATTERS[0].timing);
  });
});

describe('Super10: the death bowler\'s action, against the fast bowler', () => {
  const bowler = new Bowler();
  const at = (t: number) => { bowler.runup(t); return bowler.figure.inspect(); };
  const both = <T>(read: () => T): [T, T] => {
    bowler.action(PACE_ACTION); const pace = read();
    bowler.action(DEATH_ACTION); const death = read();
    bowler.action(PACE_ACTION);
    return [pace, death];
  };
  const loop = DEATH_ACTION.loop!;

  it('swings the ball arm out wide to his side before the leap, straight', () => {
    const mid = loop.from + (PHASES.BOUND - loop.from) * .5;
    const [pace, death] = both(() => at(mid));
    const out = (s: ReturnType<typeof at>) => Math.abs(s.hands[1][0] - s.chest[0]);
    expect(out(death)).toBeGreaterThan(out(pace) + .25);
    // Out at about the height of his shoulder, not hanging by his hip.
    expect(death.hands[1][1]).toBeGreaterThan(death.chest[1] - .25);
    expect(death.armReach[1]).toBeGreaterThan(.95);
  });

  it('holds the ball high above his head through the hop', () => {
    const [pace, death] = both(() => at((PHASES.BOUND + PHASES.BACK_FOOT) / 2));
    expect(death.hands[1][1]).toBeGreaterThan(death.chest[1] + .45);
    expect(death.hands[1][1]).toBeGreaterThan(pace.hands[1][1] + .4);
  });

  it('holds the front arm out level at the batter as he takes off, then turns it over with the ball arm', () => {
    bowler.action(DEATH_ACTION);
    const shoulderY = (st: ReturnType<typeof at>) => st.shoulders[0][1];
    // At 0.54 seconds, in the hop: level with his shoulder, out in front of his chest.
    const hop = at(.54 * 1000 / 840);
    expect(Math.abs(hop.hands[0][1] - shoulderY(hop))).toBeLessThan(.12);
    expect(hop.armReach[0]).toBeGreaterThan(.9);
    // Still there when the ball arm starts its whip.
    const whip = at(loopDrop(DEATH_ACTION));
    expect(Math.abs(whip.hands[0][1] - shoulderY(whip))).toBeLessThan(.15);
    // And halfway through the whip both arms are half way round: the front arm
    // has dropped below his shoulder as the ball arm has risen above it.
    const mid = at((loopDrop(DEATH_ACTION) + 1) / 2);
    expect(mid.hands[0][1]).toBeLessThan(shoulderY(mid) - .1);
    expect(mid.hands[1][1]).toBeGreaterThan(shoulderY(mid) + .1);
    // At the release it is down by his hip and going on behind him.
    const release = at(1);
    expect(release.hands[0][1]).toBeLessThan(release.hip[1] + .15);
    bowler.action(PACE_ACTION);
  });

  it('takes the ball arm once all the way round from over his head before it lets go, quickening all the way', () => {
    bowler.action(DEATH_ACTION);
    // The arm's angle about the shoulder, nought straight up and climbing
    // towards the batter, followed round without wrapping.
    const angle = (s: ReturnType<typeof at>) => Math.atan2(-(s.hands[1][2] - s.shoulders[1][2]), s.hands[1][1] - s.shoulders[1][1]);
    const steps = 300;
    const shots = Array.from({ length: steps + 1 }, (_, i) => at(loop.turn + (1 - loop.turn) * (i / steps)));
    let turned = 0, low = Infinity, last = angle(shots[0]);
    const turns: number[] = [];
    for (const s of shots.slice(1)) {
      let d = angle(s) - last;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      turns.push(d); turned += d; last = angle(s);
      low = Math.min(low, s.hands[1][1] - s.hip[1]);
    }
    // Over the top at the start and again at the ball, and always forward: the
    // body moving under the slow first of it is all that can tip it back, by a
    // fraction of a degree.
    expect(turned).toBeGreaterThan(2 * Math.PI);
    expect(Math.min(...turns)).toBeGreaterThan(-.01);
    // Down past his hip on the way round, the arm straight.
    expect(low).toBeLessThan(.15);
    // And quickening: each third of the clock turns it further than the last.
    const third = (k: number) => turns.slice(k * steps / 3, (k + 1) * steps / 3).reduce((a, b) => a + b, 0);
    expect(third(1)).toBeGreaterThan(third(0));
    expect(third(2)).toBeGreaterThan(third(1));
    bowler.action(PACE_ACTION);
  });

  it('stays front-on where the fast bowler turns side-on', () => {
    const [pace, death] = both(() => at(PHASES.BACK_FOOT));
    expect(Math.abs(death.yaw - Math.PI)).toBeLessThan(Math.abs(pace.yaw - Math.PI) - .2);
  });

  it('runs a shorter run, in shorter strides, to the same release', () => {
    const [pace, death] = both(() => { bowler.runup(0); const start = bowler.root.position.z; bowler.runup(1); return [start, bowler.root.position.z]; });
    expect(death[0]).toBeLessThan(pace[0]);
    expect(death[1]).toBeCloseTo(pace[1], 5);
    expect(DEATH_ACTION.run!.stride).toBeLessThan(1);
  });
});
