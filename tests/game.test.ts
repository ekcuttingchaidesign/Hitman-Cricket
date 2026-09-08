import { describe, expect, it } from 'vitest';
import { ADVANCE, COMPATIBILITY, CONFIDENCE_FULL, CONFIDENCE_STEP, DEFENCE, GAME, LINES, LINE_X, QUICK_STYLES, SHOTS, STYLES } from '../src/config/gameplay';
import { Confidence } from '../src/game/Confidence';
import { shareText, whatsappLink } from '../src/game/Share';
import { DeliveryGenerator } from '../src/game/DeliveryGenerator';
import { ballPosition, effectiveLine, stumpIntersection } from '../src/game/DeliveryTrajectory';
import { mapKeys } from '../src/game/InputManager';
import { ScoreManager } from '../src/game/ScoreManager';
import { SeededRandom } from '../src/game/SeededRandom';
import { advanceShot, chargeable, gradeTiming, resolveShot } from '../src/game/ShotResolver';
import type { Delivery, ShotOutcome } from '../src/game/types';
const delivery = (changes: Partial<Delivery> = {}): Delivery => ({ line: 'MIDDLE', style: 'NORMAL', speedKph: 125, baseTargetX: 0, finalTargetX: 0, bounceZ: GAME.bounceZ, rise: GAME.rise, durationMs: 1000, releaseTimeMs: 0, idealContactTimeMs: 1000, ...changes });
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
  it.each([[0, 'PERFECT'], [40, 'PERFECT'], [41, 'GOOD'], [78, 'GOOD'], [79, 'OK'], [135, 'OK'], [136, 'POOR'], [205, 'POOR'], [206, 'MISS']])('grades boundary %s as %s', (ms, grade) => {
    expect(gradeTiming(Number(ms))).toBe(grade); expect(gradeTiming(-Number(ms))).toBe(grade);
  });
  it('tightens the quick-ball windows by 18%', () => { expect(gradeTiming(32, true)).toBe('PERFECT'); expect(gradeTiming(33, true)).toBe('GOOD'); });
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
  it('always catches poor timing, and never catches a middled shot', () => {
    for (const shotType of SHOTS) for (const roll of [0, .5, .99]) {
      // 840ms against a 1000ms contact is a 160ms miss: poor, and skied.
      const poor = resolveShot(delivery(), { shotType, inputTimeMs: 840 }, rng(roll));
      if (poor.madeBatContact) { expect(poor.wicketType).toBe('CAUGHT'); expect(poor.aerial).toBe(true); }
      // Perfect, good and ok all keep a suited shot out of a fielder's hands.
      for (const ms of [1000, 970, 920]) {
        const played = resolveShot(delivery(), { shotType, inputTimeMs: ms }, rng(roll));
        if (played.compatibility >= .55) expect(played.wicketType).not.toBe('CAUGHT');
      }
    }
  });
  it('never bowls a ball the bat has touched', () => {
    for (const ms of [1000, 970, 930, 870]) for (const roll of [0, .5, .99]) {
      const played = resolveShot(delivery(), { shotType: 'STRAIGHT', inputTimeMs: ms }, rng(roll));
      expect(played.madeBatContact).toBe(true);
      expect(played.wicketType).not.toBe('BOWLED'); expect(played.wicketType).not.toBe('LBW');
    }
  });
  it('lets timing name the shot: perfect is six, good is four', () => {
    const played = (shotType: typeof SHOTS[number], delta: number, roll: number) =>
      resolveShot(delivery(), { shotType, inputTimeMs: 1000 + delta }, rng(roll));
    for (const roll of [0, .3, .7, .99]) for (const shotType of ['STRAIGHT', 'LONG_ON', 'LEG'] as const) {
      // Every one of these suits a middle-stump ball, so timing alone decides.
      expect(played(shotType, 0, roll).runs).toBe(6);
      expect(played(shotType, 60, roll).runs).toBe(4);
      expect(played(shotType, 0, roll).aerial).toBe(false);
    }
    // Ok timing keeps the ball along the ground: never a boundary, never a wicket.
    for (let roll = 0; roll < 1; roll += .05) {
      const nudged = played('STRAIGHT', 100, roll);
      expect(nudged.timingGrade).toBe('OK');
      expect([1, 2, 3]).toContain(nudged.runs);
      expect(nudged.isWicket).toBe(false); expect(nudged.aerial).toBe(false);
    }
  });
  it('a ball in the air comes down as six or a catch, never as a nudged single', () => {
    const skied = new Set<string>();
    for (let roll = 0; roll < 1; roll += .02) {
      // Reaching for a leg-side shot at a ball outside off is a mishit, not a miss.
      const result = resolveShot(delivery({ line: 'OUTSIDE_OFF', baseTargetX: .42, finalTargetX: .42 }),
        { shotType: 'STRAIGHT', inputTimeMs: 1000 }, rng(roll));
      expect(result.madeBatContact).toBe(true); expect(result.aerial).toBe(true);
      skied.add(result.wicketType === 'CAUGHT' ? 'CAUGHT' : String(result.runs));
    }
    expect([...skied].sort()).toEqual(['6', 'CAUGHT']);
  });
  it('resolves every supported run award, and only perfect or airborne shots reach six', () => {
    const runs = new Set<number>();
    for (const delta of [0, 60, 100, 170, 500]) for (const shotType of SHOTS) for (let roll = 0; roll < 1; roll += .02) {
      const result = resolveShot(delivery(), { shotType, inputTimeMs: 1000 + delta }, rng(roll));
      runs.add(result.runs);
      if (result.runs === 6) expect(result.timingGrade === 'PERFECT' || result.aerial).toBe(true);
      // A controlled four and a thin edge alike stay inside the rope.
      if (result.timingGrade === 'GOOD' || result.timingGrade === 'POOR') expect(result.runs).not.toBe(6);
    }
    expect([...runs].sort((a,b) => a-b)).toEqual([0,1,2,3,4,6]);
  });
});
describe('special deliveries', () => {
  const six = (): ShotOutcome => ({ ...dot(), runs: 6 });
  it('answers three sixes with a yorker, at the toes and fast', () => {
    const gen = new DeliveryGenerator(new SeededRandom(7));
    const before = Array.from({ length: 3 }, () => gen.next(0));
    expect(before.every(d => d.style !== 'YORKER')).toBe(true);
    for (let i = 0; i < 3; i++) gen.record(six());
    const answer = gen.next(0);
    expect(answer.style).toBe('YORKER');
    expect(answer.speedKph).toBeGreaterThanOrEqual(148);
    // It pitches at the toes and skids on, so it arrives at boot height.
    expect(ballPosition(answer, 1).y).toBeLessThan(0.3);
    expect(stumpIntersection({ ...answer, finalTargetX: 0 })).toBe(true);
    // The count resets: three more sixes are needed for the next one.
    gen.record(six()); gen.record(six());
    expect(gen.next(0).style).not.toBe('YORKER');
  });
  it('mixes his pace up once four quick balls have gone by', () => {
    for (const seed of [3, 41, 900]) {
      const gen = new DeliveryGenerator(new SeededRandom(seed));
      let quick = 0, answered = false;
      for (let i = 0; i < 120 && !answered; i++) {
        const style = gen.next(0).style;
        if (quick >= 4) { expect(style).toBe('SLOWER'); answered = true; }
        else if (QUICK_STYLES.includes(style)) quick++;
      }
      expect(answered, `seed ${seed} never got a change of pace`).toBe(true);
    }
  });
  it('bowls a bouncer over the stumps that only the pull can reach', () => {
    const bouncer = delivery({ style: 'SHORT', bounceZ: STYLES.SHORT.bounce, rise: STYLES.SHORT.rise });
    // Too high to hit the stumps, so leaving it is always safe.
    expect(ballPosition(bouncer, 1).y).toBeGreaterThan(1);
    expect(stumpIntersection(bouncer)).toBe(false);
    expect(resolveShot(bouncer, null, rng(0)).isWicket).toBe(false);
    // Pulled and middled it is six; anything else goes through to the keeper.
    const pulled = resolveShot(bouncer, { shotType: 'LEG', inputTimeMs: 1000 }, rng(0));
    expect(pulled.runs).toBe(6); expect(pulled.madeBatContact).toBe(true);
    for (const shotType of SHOTS) for (const delta of [0, 60, 100, 170]) {
      const played = resolveShot(bouncer, { shotType, inputTimeMs: 1000 + delta }, rng(0));
      const middledPull = shotType === 'LEG' && delta <= 40;
      expect(played.runs).toBe(middledPull ? 6 : 0);
      expect(played.isWicket).toBe(false);
    }
  });
});
describe('delivery fairness and determinism', () => {
  it('balances all five lines across an innings and respects speed and movement ranges', () => {
    const gen = new DeliveryGenerator(new SeededRandom(42)); const counts = Object.fromEntries(LINES.map(l => [l, 0]));
    for (let i = 0; i < 30; i++) { const d = gen.next(0); counts[d.line]++; expect(d.speedKph).toBeGreaterThanOrEqual(STYLES[d.style].min); expect(d.speedKph).toBeLessThanOrEqual(STYLES[d.style].max); expect(Math.abs(d.finalTargetX - d.baseTargetX)).toBeLessThanOrEqual(GAME.movement); }
    expect(Object.values(counts)).toEqual([6,6,6,6,6]);
  });
  it('produces every style a fresh bowler can pick', () => {
    // Nine: the eight weighted styles plus the bouncer. The yorker is an answer
    // to being hit, so it never appears without sixes going against him.
    const gen = new DeliveryGenerator(new SeededRandom(875)); expect(new Set(Array.from({ length: 400 }, () => gen.next(0).style)).size).toBe(9);
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

describe('the confidence meter', () => {
  const outcome = (runs: ShotOutcome['runs'], extra: Partial<ShotOutcome> = {}): ShotOutcome =>
    ({ runs, isWicket: false, quality: 1, feedback: '', timingGrade: 'PERFECT', timingDeltaMs: 0, compatibility: 1, madeBatContact: true, aerial: false, ...extra });
  it('fills on boundaries and hard running, and only dots drain it', () => {
    const meter = new Confidence();
    meter.record(outcome(4)); expect(meter.value).toBe(CONFIDENCE_STEP[4]);
    // A single is neither: nudging one costs nothing.
    meter.record(outcome(1)); expect(meter.value).toBe(CONFIDENCE_STEP[4]);
    meter.record(outcome(2)); meter.record(outcome(3));
    expect(meter.value).toBeGreaterThan(CONFIDENCE_STEP[4]);
    // Only dots drain it, and it cannot go below empty however long the drought.
    for (let i = 0; i < 20; i++) meter.record(outcome(0));
    expect(meter.value).toBe(0);
  });
  it('fills from empty in four scoring shots and stops there', () => {
    const meter = new Confidence();
    for (let i = 0; i < 3; i++) meter.record(outcome(6));
    expect(meter.full).toBe(false);
    meter.record(outcome(6));
    expect(meter.full).toBe(true); expect(meter.value).toBe(CONFIDENCE_FULL); expect(meter.fraction).toBe(1);
  });
  it('is emptied by a wicket and by spending it', () => {
    const meter = new Confidence();
    for (let i = 0; i < 4; i++) meter.record(outcome(6));
    meter.record(outcome(0, { isWicket: true, wicketType: 'BOWLED' }));
    expect(meter.value).toBe(0);
    for (let i = 0; i < 4; i++) meter.record(outcome(6));
    meter.record(outcome(6, { advance: true }));
    expect(meter.value).toBe(0);
  });
});

describe('charging down the pitch', () => {
  const onTheStumps = { line: 'MIDDLE' as const, baseTargetX: 0, finalTargetX: 0 };
  const charge = (d: Delivery, delta = 0) => resolveShot(d, { shotType: 'STRAIGHT', inputTimeMs: d.idealContactTimeMs + delta }, new SeededRandom(4), true);
  it('takes a length ball on the stumps at a bowler’s pace', () => {
    expect(chargeable(delivery({ ...onTheStumps, style: 'NORMAL', speedKph: 125 }))).toBe(true);
    expect(chargeable(delivery({ ...onTheStumps, style: 'SWING_IN', speedKph: 118 }))).toBe(true);
    // Leg and off stump are on the stumps too; only the line matters, not the name.
    expect(chargeable(delivery({ line: 'LEG', baseTargetX: LINE_X.LEG, finalTargetX: LINE_X.LEG, speedKph: 125 }))).toBe(true);
    expect(chargeable(delivery({ line: 'OFF', baseTargetX: LINE_X.OFF, finalTargetX: LINE_X.OFF, speedKph: 125 }))).toBe(true);
    // Swung far enough away and it is no longer a ball to walk at.
    expect(chargeable(delivery({ line: 'LEG', baseTargetX: LINE_X.LEG, finalTargetX: LINE_X.LEG - GAME.movement, speedKph: 125 }))).toBe(false);
  });
  it('refuses every ball the batter could not walk at', () => {
    // Off the stumps, however good the length.
    expect(chargeable(delivery({ line: 'OUTSIDE_OFF', baseTargetX: .42, finalTargetX: .42, speedKph: 125 }))).toBe(false);
    expect(chargeable(delivery({ line: 'OUTSIDE_LEG', baseTargetX: -.42, finalTargetX: -.42, speedKph: 125 }))).toBe(false);
    // Too full and too short: a yorker and a bouncer pitch outside the window.
    expect(chargeable(delivery({ ...onTheStumps, style: 'YORKER', speedKph: 130, bounceZ: STYLES.YORKER.bounce! }))).toBe(false);
    expect(chargeable(delivery({ ...onTheStumps, style: 'SHORT', speedKph: 125, bounceZ: STYLES.SHORT.bounce! }))).toBe(false);
    // Too slow and too quick.
    expect(chargeable(delivery({ ...onTheStumps, style: 'SLOWER', speedKph: 88 }))).toBe(false);
    expect(chargeable(delivery({ ...onTheStumps, style: 'OFF_SPIN', speedKph: 82 }))).toBe(false);
    expect(chargeable(delivery({ ...onTheStumps, style: 'EXPRESS', speedKph: 155 }))).toBe(false);
    expect(chargeable(delivery({ ...onTheStumps, style: 'FAST', speedKph: 145 }))).toBe(false);
  });
  it('needs a full meter, the straight drive, and timing worth the shot', () => {
    const ball = delivery({ ...onTheStumps, style: 'NORMAL', speedKph: 125 });
    const played = charge(ball);
    expect(played.advance).toBe(true); expect(played.runs).toBe(6); expect(played.feedback).toBe(ADVANCE.feedback);
    // Without the meter it is the same shot, scored the ordinary way.
    expect(resolveShot(ball, { shotType: 'STRAIGHT', inputTimeMs: ball.idealContactTimeMs }, new SeededRandom(4)).advance).toBeFalsy();
    // Good timing charges it too; only a mistimed one is left as the shot played.
    const wellTimed = charge(ball, GAME.timing.perfect + 5);
    expect(wellTimed.advance).toBe(true); expect(wellTimed.runs).toBe(6);
    expect(charge(ball, GAME.timing.good + 5).advance).toBeFalsy();
    expect(charge(ball, GAME.timing.ok + 5).advance).toBeFalsy();
    // Any upward drive charges it: a swipe up that drifts a sector is still a
    // swipe up, and the player has no way of seeing that it drifted.
    for (const shot of ADVANCE.shots)
      expect(resolveShot(ball, { shotType: shot, inputTimeMs: ball.idealContactTimeMs }, new SeededRandom(4), true).advance, shot).toBe(true);
    // A leg-side or square swipe is that shot, not a charge.
    for (const shot of ['LEG', 'OFF'] as const)
      expect(resolveShot(ball, { shotType: shot, inputTimeMs: ball.idealContactTimeMs }, new SeededRandom(4), true).advance, shot).toBeFalsy();
    // And no charge at a ball that cannot be charged.
    const quick = delivery({ ...onTheStumps, style: 'EXPRESS', speedKph: 155 });
    expect(resolveShot(quick, { shotType: 'STRAIGHT', inputTimeMs: quick.idealContactTimeMs }, new SeededRandom(4), true).advance).toBeFalsy();
  });
  it('agrees with the swing that plays it', () => {
    const ball = delivery({ ...onTheStumps, style: 'NORMAL', speedKph: 125 });
    const attempt = { shotType: 'STRAIGHT' as const, inputTimeMs: ball.idealContactTimeMs + 10 };
    expect(advanceShot(ball, attempt, true)).toBe(resolveShot(ball, attempt, new SeededRandom(4), true).advance);
    expect(advanceShot(ball, attempt, false)).toBe(false);
    expect(advanceShot(ball, null, true)).toBe(false);
  });
});

describe('the forward defensive', () => {
  const block = (d: Delivery, delta: number, roll = 0.9) =>
    resolveShot(d, { shotType: 'DEFEND', inputTimeMs: d.idealContactTimeMs + delta }, rng(roll));
  const onTheStumps = delivery({ line: 'MIDDLE', baseTargetX: 0, finalTargetX: 0 });
  it('kills the ball for a dot when the bat is down in time', () => {
    for (const delta of [0, GAME.timing.perfect, GAME.timing.good, -GAME.timing.ok]) {
      const played = block(onTheStumps, delta);
      expect(played.defended, `${delta}ms`).toBe(true);
      expect(played.runs).toBe(0); expect(played.isWicket).toBe(false);
      expect(played.madeBatContact).toBe(true); expect(played.feedback).toBe(DEFENCE.feedback);
    }
  });
  it('can never be caught, whatever the line or the timing', () => {
    for (const line of LINES)
      for (const delta of [0, 60, 120, 180, 260])
        for (const roll of [0, 0.5, 0.99]) {
          const played = block(delivery({ line, baseTargetX: LINE_X[line], finalTargetX: LINE_X[line] }), delta, roll);
          expect(played.wicketType, `${line} ${delta}ms`).not.toBe('CAUGHT');
          expect(played.aerial).toBe(false);
          expect(played.runs).toBe(0);
        }
  });
  it('is bowled when the bat comes down late on the stumps', () => {
    // Poor timing and worse: the ball goes past the bat, and the stumps are behind it.
    for (const delta of [GAME.timing.ok + 1, GAME.timing.poor, GAME.timing.poor + 400]) {
      const played = block(onTheStumps, delta);
      expect(played.defended, `${delta}ms`).toBeFalsy();
      expect(played.isWicket, `${delta}ms`).toBe(true);
      expect(played.wicketType === 'BOWLED' || played.wicketType === 'LBW').toBe(true);
    }
    // LBW only comes up on a ball straight enough to be hitting; a high roll keeps it bowled.
    expect(block(onTheStumps, 300, 0.99).wicketType).toBe('BOWLED');
    expect(block(onTheStumps, 300, 0).wicketType).toBe('LBW');
  });
  it('survives a late block at a ball that was missing the stumps', () => {
    const wide = delivery({ line: 'OUTSIDE_OFF', baseTargetX: LINE_X.OUTSIDE_OFF, finalTargetX: LINE_X.OUTSIDE_OFF });
    const played = block(wide, GAME.timing.poor);
    expect(played.isWicket).toBe(false); expect(played.runs).toBe(0);
    expect(played.feedback).toBe('PLAYED AND MISSED');
  });
  it('cannot be bowled off a bouncer, however late the block', () => {
    const short = delivery({ style: 'SHORT', bounceZ: STYLES.SHORT.bounce!, line: 'MIDDLE', baseTargetX: 0, finalTargetX: 0 });
    expect(block(short, 300).isWicket).toBe(false);
  });
  it('scores nothing, so the meter treats it as the dot it is', () => {
    const meter = new Confidence();
    meter.record(block(onTheStumps, 0));
    expect(meter.value).toBe(0);
  });
});

describe('sharing a score', () => {
  it('asks the friend to beat exactly what was scored, with the game link', () => {
    expect(shareText(132, 'https://example.test/game/')).toBe('I scored 132 runs on Hitman Cricket, Can you beat my score https://example.test/game/');
    const link = whatsappLink(7, 'https://example.test/game/');
    expect(link.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(link.slice('https://wa.me/?text='.length))).toBe(shareText(7, 'https://example.test/game/'));
    // The whole message travels in the query, so nothing may be left unescaped.
    expect(link).not.toContain(' ');
  });
});
