import { describe, expect, it } from 'vitest';
import { GAME, LINE_X } from '../src/config/gameplay';
import { BATTERS, BLOCK_OVERS, EXPRESS_OVER, LEVELS, MARATHON, levelOf } from '../src/config/marathon';
import { STYLES as SURVIVE_STYLES, SURVIVE } from '../src/config/survive';
import { shownKph } from '../src/game/speed-gun';
import { ballPosition } from '../src/game/DeliveryTrajectory';
import { DeliveryGenerator, MARATHON_PLAN, SPIN_STYLES, SURVIVE_PLAN, drawBlock, marathonOnly } from '../src/game/DeliveryGenerator';
import { MarathonInnings } from '../src/game/Marathon';
import { SeededRandom } from '../src/game/SeededRandom';
import { surviveBall } from '../src/game/Survive';
import type { Delivery, ShotOutcome } from '../src/game/types';

const ball = (over: Partial<ShotOutcome> = {}): ShotOutcome => ({
  runs: 0, isWicket: false, quality: 0, feedback: '', timingGrade: 'MISS', timingDeltaMs: null,
  compatibility: 0, madeBatContact: false, aerial: false, ...over,
});
const out = ball({ isWicket: true });
const felled = ball({ hit: { where: 'HELMET', damage: 100 } } as Partial<ShotOutcome>);
const play = (innings: MarathonInnings, n: number, outcome = ball({ runs: 1 })) => {
  for (let i = 0; i < n; i++) innings.record(outcome);
};

/** Every over of an innings, by who bowled it, read off the balls themselves. */
function overs(seed: number, count = 84) {
  const generator = new DeliveryGenerator(new SeededRandom(seed), MARATHON_PLAN);
  const bowled: Delivery[][] = [];
  for (let over = 0; over < count; over++) {
    bowled.push([]);
    for (let b = 0; b < MARATHON.ballsPerOver; b++) bowled[over].push(generator.next(0));
  }
  return { generator, bowled };
}
const kindOf = (over: Delivery[]) =>
  over.every(d => d.express) ? 'EXPRESS' : over.every(d => SPIN_STYLES.includes(d.style)) ? 'SPIN' : 'PACE';

describe('the three batters', () => {
  it('get worse with each wicket, the last of them Survival\'s own tailender', () => {
    for (const key of ['perfect', 'good', 'ok', 'poor'] as const) {
      expect(BATTERS[0].timing[key]).toBeGreaterThan(BATTERS[1].timing[key]);
      expect(BATTERS[1].timing[key]).toBeGreaterThan(BATTERS[2].timing[key]);
    }
    expect(BATTERS[2].timing).toEqual(SURVIVE.timing);
  });

  it('grade the same stroke by whoever is in', () => {
    const delivery: Delivery = {
      line: 'MIDDLE', style: 'NORMAL', speedKph: 144, baseTargetX: 0, finalTargetX: 0,
      bounceZ: GAME.bounceZ, rise: GAME.rise, durationMs: 600, releaseTimeMs: 0, idealContactTimeMs: 600,
    };
    const stroke = { shotType: 'STRAIGHT' as const, inputTimeMs: 630 };
    const rng = { next: () => 0.5 };
    expect(surviveBall(delivery, stroke, rng, BATTERS[0]).timingGrade).toBe('PERFECT');
    expect(surviveBall(delivery, stroke, rng, BATTERS[2]).timingGrade).toBe('GOOD');
    // And Survival, asked nothing, is graded as it always was.
    expect(surviveBall(delivery, stroke, rng).timingGrade).toBe('GOOD');
  });
});

describe('the innings', () => {
  it('sends the next batter in on a wicket, and ends on the third', () => {
    const innings = new MarathonInnings();
    expect(innings.current.batter.role).toBe('OPENER');
    expect(innings.record(out)).toBe('OUT');
    expect(innings.current.batter.role).toBe('NO_3');
    innings.record(out);
    expect(innings.current.batter.role).toBe('TAILENDER');
    expect(innings.ended).toBe(false);
    innings.record(out);
    expect(innings.ending).toBe('ALL_OUT');
    expect(innings.batters).toHaveLength(3);
  });

  it('carries a battered batter off not out, and brings the next one in with a full meter', () => {
    const innings = new MarathonInnings();
    play(innings, 30, ball({ runs: 4 }));
    expect(innings.record(felled)).toBe('RETIRED');
    const [opener, next] = innings.batters;
    expect(opener.retired).toBe(true);
    expect(opener.out).toBe(false);
    expect(MarathonInnings.score(opener)).toBe('120*');
    expect(next.health.value).toBe(100);
    expect(innings.ended).toBe(false);
  });

  it('calls a third batter carried off a retirement, not all out', () => {
    const innings = new MarathonInnings();
    innings.record(out);
    innings.record(out);
    innings.record(felled);
    expect(innings.ending).toBe('RETIRED');
  });

  it('takes the wicket over the blow when one ball does both', () => {
    const innings = new MarathonInnings();
    expect(innings.record({ ...felled, isWicket: true })).toBe('OUT');
    expect(innings.batters[0].out).toBe(true);
    expect(innings.batters[0].retired).toBe(false);
  });

  it('keeps every batter\'s runs and balls adding up to the team\'s', () => {
    const innings = new MarathonInnings();
    play(innings, 40, ball({ runs: 2 }));
    innings.record(out);
    play(innings, 25, ball({ runs: 6 }));
    innings.record(felled);
    play(innings, 7, ball({ runs: 4 }));
    const sum = (key: 'runs' | 'balls' | 'fours' | 'sixes') => innings.batters.reduce((t, b) => t + b[key], 0);
    expect(sum('runs')).toBe(innings.runs);
    expect(sum('balls')).toBe(innings.balls);
    expect(sum('fours')).toBe(innings.fours);
    expect(sum('sixes')).toBe(innings.sixes);
    expect(innings.gone).toBe(2);
  });

  it('stops at the five hundredth ball, with whoever is in not out', () => {
    const innings = new MarathonInnings();
    play(innings, MARATHON.maxBalls - 1);
    expect(innings.ended).toBe(false);
    innings.record(ball({ runs: 1 }));
    expect(innings.ending).toBe('BALLS');
    expect(innings.current.out).toBe(false);
    expect(innings.record(ball({ runs: 6 }))).toBe(null);
    expect(innings.balls).toBe(MARATHON.maxBalls);
  });

  it('calls a third wicket off the last ball all out, not out of balls', () => {
    const innings = new MarathonInnings();
    innings.record(out);
    innings.record(out);
    play(innings, MARATHON.maxBalls - 3);
    innings.record(out);
    expect(innings.ending).toBe('ALL_OUT');
  });

  it('sends nobody in after a wicket off the last ball', () => {
    const innings = new MarathonInnings();
    play(innings, MARATHON.maxBalls - 1);
    innings.record(out);
    expect(innings.batters).toHaveLength(1);
    expect(innings.ending).toBe('BALLS');
  });

  it('may be declared once twenty overs are done, and not a ball before', () => {
    const innings = new MarathonInnings();
    play(innings, MARATHON.declareFrom - 1);
    expect(innings.canDeclare).toBe(false);
    expect(innings.declare()).toBe(false);
    innings.record(ball());
    expect(innings.canDeclare).toBe(true);
    expect(innings.declare()).toBe(true);
    expect(innings.ending).toBe('DECLARED');
    expect(innings.canDeclare).toBe(false);
    expect(innings.record(ball({ runs: 4 }))).toBe(null);
    expect(innings.balls).toBe(MARATHON.declareFrom);
  });

  it('cannot be declared once it is over', () => {
    const innings = new MarathonInnings();
    play(innings, MARATHON.declareFrom);
    innings.record(out); innings.record(out); innings.record(out);
    expect(innings.declare()).toBe(false);
    expect(innings.ending).toBe('ALL_OUT');
  });
});

describe('the levels', () => {
  it('are one for ten overs, two for the next ten, and three ever after', () => {
    expect(levelOf(0).level).toBe(1);
    expect(levelOf(1).level).toBe(2);
    expect(levelOf(2).level).toBe(3);
    expect(levelOf(7).level).toBe(3);
  });

  it('fill every block exactly', () => {
    for (const level of LEVELS) expect(level.pace + level.spin + level.express).toBe(BLOCK_OVERS);
  });

  it('swing it further and later after the first ten, and not in them', () => {
    expect(LEVELS[0]).toMatchObject({ swing: 1, late: 0 });
    expect(LEVELS[1].swing).toBeGreaterThan(1);
    expect(LEVELS[1].late).toBeGreaterThan(0);
  });
});

describe('a block of overs', () => {
  it('has every level\'s counts, whatever the seed', () => {
    for (let seed = 1; seed < 200; seed++) {
      for (const level of LEVELS) {
        const block = drawBlock(level, BLOCK_OVERS, new SeededRandom(seed));
        const count = (kind: string) => block.filter(k => k === kind).length;
        expect([count('PACE'), count('SPIN'), count('EXPRESS')]).toEqual([level.pace, level.spin, level.express]);
      }
    }
  });

  it('opens with two of pace and gives the spinner the third, as Survival does', () => {
    for (let seed = 1; seed < 100; seed++) {
      expect(drawBlock(LEVELS[0], BLOCK_OVERS, new SeededRandom(seed)).slice(0, 3)).toEqual(['PACE', 'PACE', 'SPIN']);
    }
  });

  it('is not the same pattern every time', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed < 50; seed++) seen.add(drawBlock(LEVELS[2], BLOCK_OVERS, new SeededRandom(seed)).join());
    expect(seen.size).toBeGreaterThan(20);
  });

  it('never gives the express bowler two overs running, inside a block or across the join', () => {
    for (let seed = 1; seed < 60; seed++) {
      const { generator } = overs(seed, 0);
      for (let over = 1; over < 84; over++) {
        expect(generator.overKind(over) === 'EXPRESS' && generator.overKind(over - 1) === 'EXPRESS').toBe(false);
      }
    }
  });
});

describe('the Marathon\'s bowling', () => {
  it('bowls what the plan says, over by over', () => {
    for (const seed of [3, 41, 977]) {
      const { generator, bowled } = overs(seed);
      bowled.forEach((over, i) => expect(kindOf(over)).toBe(generator.overKind(i)));
    }
  });

  it('keeps the express bowler out of the first ten overs, and gives him one of the next ten and four of every ten after', () => {
    const { generator } = overs(17, 0);
    const express = (from: number) => [...Array(10)].filter((_, i) => generator.overKind(from + i) === 'EXPRESS').length;
    expect(express(0)).toBe(0);
    expect(express(10)).toBe(1);
    for (let from = 20; from < 80; from += 10) expect(express(from)).toBe(4);
  });

  it('bowls the express over at his pace, with a bouncer and a yorker in every one and a slower ball in some', () => {
    let seconds = 0, slowers = 0, total = 0;
    for (let seed = 1; seed < 40; seed++) {
      const { bowled } = overs(seed);
      for (const over of bowled.filter(o => kindOf(o) === 'EXPRESS')) {
        total++;
        for (const d of over) {
          const range = d.style === 'SLOWER' ? EXPRESS_OVER.slower : EXPRESS_OVER;
          expect(d.speedKph).toBeGreaterThanOrEqual(range.min);
          expect(d.speedKph).toBeLessThanOrEqual(range.max);
          expect(['EXPRESS', 'SHORT', 'YORKER', 'SLOWER']).toContain(d.style);
        }
        const short = over.filter(d => d.style === 'SHORT').length;
        expect(short === 1 || short === 2).toBe(true);
        expect(over.filter(d => d.style === 'YORKER')).toHaveLength(1);
        const slower = over.filter(d => d.style === 'SLOWER').length;
        expect(slower <= 1).toBe(true);
        expect(over.filter(d => d.style === 'EXPRESS').length).toBeGreaterThanOrEqual(2);
        seconds += Number(short === 2);
        slowers += slower;
      }
    }
    // One over in three, and one in two, give or take the draw.
    expect(seconds / total).toBeGreaterThan(0.2);
    expect(seconds / total).toBeLessThan(0.47);
    expect(slowers / total).toBeGreaterThan(0.35);
    expect(slowers / total).toBeLessThan(0.65);
  });

  it('bowls his slower ball well off his pace, and still quicker than a seamer\'s change-up', () => {
    expect(EXPRESS_OVER.slower.max).toBeLessThan(EXPRESS_OVER.min - 40);
    expect(EXPRESS_OVER.slower.min).toBeGreaterThan(SURVIVE_STYLES.SLOWER.max);
  });

  it('places one bouncer in every pace over, with no barrage — the tenth over is the middle of this innings', () => {
    for (let seed = 1; seed < 30; seed++) {
      const { bowled } = overs(seed, 30);
      for (const over of bowled.filter(o => kindOf(o) === 'PACE')) {
        expect(over.filter(d => d.style === 'SHORT')).toHaveLength(1);
      }
    }
  });

  it('bowls the first ten overs as Survival bowls them, swing and all', () => {
    const { bowled } = overs(5, 10);
    for (const d of bowled.flat().filter(d => !SPIN_STYLES.includes(d.style))) {
      expect(d.late).toBeUndefined();
      expect(Math.abs(d.finalTargetX - d.baseTargetX)).toBeLessThanOrEqual(GAME.movement + 1e-9);
    }
  });

  it('swings it later and further from the eleventh over, and never into a wide', () => {
    let biggest = 0;
    for (let seed = 1; seed < 30; seed++) {
      const { bowled } = overs(seed, 30);
      for (const d of bowled.slice(10).flat().filter(d => d.style === 'SWING_IN' || d.style === 'SWING_OUT')) {
        expect(d.late).toBe(LEVELS[1].late);
        biggest = Math.max(biggest, Math.abs(d.finalTargetX - d.baseTargetX));
        expect(Math.abs(d.finalTargetX)).toBeLessThanOrEqual(LINE_X.OUTSIDE_OFF + GAME.movement + 1e-9);
      }
    }
    expect(biggest).toBeGreaterThan(GAME.movement * 1.4);
  });

  it('starts the inswinger on or outside off and the outswinger on middle or leg, from the eleventh over', () => {
    for (let seed = 1; seed < 30; seed++) {
      const { bowled } = overs(seed, 30);
      for (const d of bowled.slice(10).flat()) {
        if (d.express) continue;
        if (d.style === 'SWING_IN') {
          expect(['OFF', 'OUTSIDE_OFF']).toContain(d.line);
          expect(d.finalTargetX).toBeLessThan(d.baseTargetX);
        }
        if (d.style === 'SWING_OUT') {
          expect(['LEG', 'MIDDLE']).toContain(d.line);
          expect(d.finalTargetX).toBeGreaterThan(d.baseTargetX);
        }
      }
    }
  });

  it('swings about two balls in three from the eleventh over, in and out evenly, and the rest go straight on any line', () => {
    let pace = 0, ins = 0, outs = 0;
    const straightLines = new Set<string>();
    for (let seed = 1; seed < 60; seed++) {
      const { bowled } = overs(seed, 30);
      for (const d of bowled.slice(10).flat()) {
        if (d.express || SPIN_STYLES.includes(d.style) || d.style === 'SHORT') continue;
        pace++;
        if (d.style === 'SWING_IN') ins++;
        else if (d.style === 'SWING_OUT') outs++;
        else straightLines.add(d.line);
      }
    }
    expect((ins + outs) / pace).toBeGreaterThan(0.55);
    expect((ins + outs) / pace).toBeLessThan(0.78);
    expect(Math.abs(ins - outs) / (ins + outs)).toBeLessThan(0.12);
    expect(straightLines.size).toBe(5);
  });

  it('leaves the first ten overs\' lines and table to Survival', () => {
    let swing = 0, pace = 0;
    for (let seed = 1; seed < 60; seed++) {
      for (const d of overs(seed, 10).bowled.flat()) {
        if (SPIN_STYLES.includes(d.style) || d.style === 'SHORT') continue;
        pace++;
        swing += Number(d.style === 'SWING_IN' || d.style === 'SWING_OUT');
      }
    }
    expect(swing / pace).toBeLessThan(0.33);
    expect(LEVELS[0].swingShare).toBeUndefined();
  });

  it('holds a late swinger\'s line for the first of the way, and gets it there all the same', () => {
    const delivery: Delivery = {
      line: 'MIDDLE', style: 'SWING_OUT', speedKph: 144, baseTargetX: 0, finalTargetX: 0.2,
      bounceZ: GAME.bounceZ, rise: GAME.rise, durationMs: 600, releaseTimeMs: 0, idealContactTimeMs: 600,
    };
    const early = ballPosition(delivery, 0.12).x;
    const late = ballPosition({ ...delivery, late: 0.35 }, 0.12).x;
    expect(early).toBeGreaterThan(0);
    expect(late).toBe(0);
    expect(ballPosition({ ...delivery, late: 0.35 }, 1).x).toBeCloseTo(0.2);
  });

  it('replays the same innings off the same seed', () => {
    const a = overs(2024, 40).bowled.flat();
    const b = overs(2024, 40).bowled.flat();
    expect(a).toEqual(b);
  });

  it('leaves Survival\'s own plan without blocks', () => {
    expect(SURVIVE_PLAN.blocks).toBeUndefined();
    const generator = new DeliveryGenerator(new SeededRandom(1), SURVIVE_PLAN);
    expect(generator.overKind(0)).toBe(null);
    expect(generator.expressOn).toBe(false);
  });
});

describe('the switches for trying one bowler', () => {
  const bowl = (plan: ReturnType<typeof marathonOnly>, balls = 120) => {
    const generator = new DeliveryGenerator(new SeededRandom(7), plan);
    return { generator, bowled: [...Array(balls)].map(() => generator.next(0)) };
  };

  it('?swing=1 gives the Level 2 swing bowler every over, from the first, as he bowls it', () => {
    const { generator, bowled } = bowl(marathonOnly({ swing: true }));
    expect(generator.levelAt(0)?.level).toBe(2);
    expect(bowled.every(d => !d.express && !SPIN_STYLES.includes(d.style))).toBe(true);
    const swung = bowled.filter(d => d.style === 'SWING_IN' || d.style === 'SWING_OUT');
    expect(swung.length).toBeGreaterThan(bowled.length / 2);
    for (const d of swung) expect(d.late).toBe(LEVELS[1].late);
    expect(bowled.some(d => d.style !== 'SWING_IN' && d.style !== 'SWING_OUT')).toBe(true);
  });

  it('?express=1 gives the express bowler every over, as he bowls it', () => {
    const { generator, bowled } = bowl(marathonOnly({ express: true }));
    for (const d of bowled) {
      expect(d.express).toBe(true);
      expect(['EXPRESS', 'SHORT', 'YORKER', 'SLOWER']).toContain(d.style);
    }
    for (let over = 0; over < 20; over++) {
      const six = bowled.slice(over * 6, over * 6 + 6);
      expect(six.some(d => d.style === 'SHORT')).toBe(true);
      expect(six.some(d => d.style === 'YORKER')).toBe(true);
    }
    expect(bowled.some(d => d.style === 'SLOWER')).toBe(true);
    expect(generator.levelAt(0)?.level).toBe(3);
  });

  it('both share the overs, and never give him two running', () => {
    const { generator, bowled } = bowl(marathonOnly({ swing: true, express: true }));
    const kinds = [...Array(20)].map((_, over) => generator.overKind(over));
    expect(kinds.filter(k => k === 'EXPRESS')).toHaveLength(10);
    kinds.forEach((kind, i) => expect(kind === 'EXPRESS' && kinds[i - 1] === 'EXPRESS').toBe(false));
    expect(bowled.filter(d => !d.express).some(d => d.style === 'SWING_IN' || d.style === 'SWING_OUT')).toBe(true);
  });

  it('leaves the Marathon\'s own plan as it was', () => {
    marathonOnly({ swing: true, express: true });
    expect(MARATHON_PLAN.blocks!.levelOf(0).level).toBe(1);
    expect(MARATHON_PLAN.blocks!.levelOf(0).express).toBe(0);
  });
});

describe('the speed gun', () => {
  it('reads anything up to 140 as it is, never under 70', () => {
    expect(shownKph(84)).toBe(84);
    expect(shownKph(140)).toBe(140);
    expect(shownKph(55)).toBe(70);
  });

  it('folds the quicks into 140 to 160, and never more', () => {
    expect(shownKph(186)).toBe(160);
    expect(shownKph(163)).toBe(150);
    expect(shownKph(200)).toBe(160);
  });

  it('keeps the order: an express ball always reads faster than a fast one, and the slower ball slower than both', () => {
    for (let kph = 70; kph < 186; kph++) expect(shownKph(kph + 1)).toBeGreaterThanOrEqual(shownKph(kph));
    expect(shownKph(EXPRESS_OVER.min)).toBeGreaterThan(shownKph(SURVIVE_STYLES.FAST.max) - 1);
    expect(shownKph(EXPRESS_OVER.slower.max)).toBeLessThan(shownKph(EXPRESS_OVER.min) - 25);
  });
});
