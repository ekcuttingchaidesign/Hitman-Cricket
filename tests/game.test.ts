import { describe, expect, it } from 'vitest';
import { ADVANCE, COMPATIBILITY, CONFIDENCE_FULL, CONFIDENCE_STEP, CLASSIC_SPIN, CUT, DEFENCE, FLAT_SWEEP, GAME, HOOK, PUNCH, SPIN_CUT, LINES, LINE_X, QUICK_STYLES, SCOOP, SHOTS, SHOT_ANGLES, SPIN_BOWLING, SQUARE_DRIVE, STYLES, SWEEP } from '../src/config/gameplay';
import { Confidence } from '../src/game/Confidence';
import { shareText, whatsappLink } from '../src/game/Share';
import { quietBall, Sledger } from '../src/game/Sledge';
import { CLASSIC_PLAN, DeliveryGenerator, MARATHON_PLAN, SURVIVE_PLAN, bouncersEvery, lateCutsEvery, spinCutsEvery, spun } from '../src/game/DeliveryGenerator';
import { ballPosition, effectiveLine, flightDrag, flightProgress, stumpIntersection } from '../src/game/DeliveryTrajectory';
import { COVER_ODDS, coverRoll, coverVersionOf } from '../src/entities/Batter';
import { resolveSurvive } from '../src/game/Survive';
import { mapKeys, mapSwipe } from '../src/game/InputManager';
import { ScoreManager } from '../src/game/ScoreManager';
import { SeededRandom } from '../src/game/SeededRandom';
import { advanceShot, chargeable, crampedCut, cuttable, fitOf, gradeOf, gradeTiming, hookable, playedAs, punch, punchable, spinCut, resolveShot, scoopLine, scoopShot, scoopable, slogSweep, squareDrivable, sweepable, sweeps, turningIn } from '../src/game/ShotResolver';
import type { Delivery, ShotOutcome, ShotType } from '../src/game/types';
const delivery = (changes: Partial<Delivery> = {}): Delivery => ({ line: 'MIDDLE', style: 'NORMAL', speedKph: 125, baseTargetX: 0, finalTargetX: 0, bounceZ: GAME.bounceZ, rise: GAME.rise, durationMs: 1000, releaseTimeMs: 0, idealContactTimeMs: 1000, ...changes });
const rng = (value: number) => ({ next: () => value });
const dot = (): ShotOutcome => resolveShot(delivery({ finalTargetX: 0.5 }), null, rng(0.5));

describe('shot controls', () => {
  it.each([ [['A'], 'LEG'], [['W'], 'STRAIGHT'], [['D'], 'SQUARE_CUT'], [['A', 'W'], 'LONG_ON'], [['W', 'D'], 'COVER_LONG_OFF'], [['w', 'a'], 'LONG_ON'], [['D', 'W'], 'COVER_LONG_OFF'], [['A', 'D'], null], [['D', 'S'], 'REVERSE_SCOOP'], [['S', 'D'], 'REVERSE_SCOOP'], [['S'], 'DEFEND'], [['A', 'S'], 'SCOOP'], [['s', 'a'], 'SCOOP'], [[], null] ])('maps %j to %s', (keys, shot) => expect(mapKeys(keys as string[])).toBe(shot));
});
describe('compatibility and timing', () => {
  it('matches every entry of the specified 5 by 5 matrix', () => {
    // The last column is the cut: it wants width and has little on the stumps.
    expect(LINES.map(line => SHOTS.map(shot => COMPATIBILITY[line][shot]))).toEqual([
      [1, .9, .3, .1, 0], [1, 1, .65, .25, .1], [.55, .85, 1, .85, .4], [.1, .25, .65, 1, .85], [0, .1, .3, .9, 1],
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
      // 840ms against a 1000ms contact is a 160ms miss: poor, and caught. Every
      // stroke skies it except the cut, whose square face feathers it behind.
      const poor = resolveShot(delivery(), { shotType, inputTimeMs: 840 }, rng(roll));
      if (poor.madeBatContact) {
        expect(poor.wicketType, shotType).toBe('CAUGHT');
        expect(poor.aerial, shotType).toBe(shotType !== 'SQUARE_CUT');
        expect(poor.edged, shotType).toBe(shotType === 'SQUARE_CUT' ? true : undefined);
      }
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
  it('bowls a bouncer over the stumps that, at the body, only the pull can reach', () => {
    const bouncer = delivery({ style: 'SHORT', bounceZ: STYLES.SHORT.bounce, rise: STYLES.SHORT.rise });
    // Too high to hit the stumps, so leaving it is always safe.
    expect(ballPosition(bouncer, 1).y).toBeGreaterThan(1);
    expect(stumpIntersection(bouncer)).toBe(false);
    expect(resolveShot(bouncer, null, rng(0)).isWicket).toBe(false);
    // Pulled and middled it is six; anything else but the punch, below, goes through to the keeper.
    const pulled = resolveShot(bouncer, { shotType: 'LEG', inputTimeMs: 1000 }, rng(0));
    expect(pulled.runs).toBe(6); expect(pulled.madeBatContact).toBe(true);
    for (const shotType of SHOTS.filter(shot => shot !== 'COVER_LONG_OFF')) for (const delta of [0, 60, 100, 170]) {
      const played = resolveShot(bouncer, { shotType, inputTimeMs: 1000 + delta }, rng(0));
      const middledPull = shotType === 'LEG' && delta <= 40;
      expect(played.runs).toBe(middledPull ? 6 : 0);
      expect(played.isWicket).toBe(false);
    }
    // This one is at the body, so there is no room to cut it either.
    expect(cuttable(bouncer)).toBe(false);
  });
  it('lets the bouncer be blocked off the back foot, in time, for a dot off the bat', () => {
    // It used to go through him whatever he did with the block.
    const bouncer = delivery({ style: 'SHORT', bounceZ: STYLES.SHORT.bounce, rise: STYLES.SHORT.rise });
    const blocked = resolveShot(bouncer, { shotType: 'DEFEND', inputTimeMs: 1000 }, rng(0));
    expect(blocked.defended).toBe(true); expect(blocked.madeBatContact).toBe(true);
    expect(blocked.runs).toBe(0); expect(blocked.isWicket).toBe(false);
    // Too late with it, the ball is past him, and still cannot bowl him.
    const late = resolveShot(bouncer, { shotType: 'DEFEND', inputTimeMs: 1300 }, rng(0));
    expect(late.madeBatContact).toBe(false); expect(late.isWicket).toBe(false);
  });
});

describe('the back-foot punch', () => {
  const bouncer = (changes: Partial<Delivery> = {}) => delivery({ style: 'SHORT', bounceZ: STYLES.SHORT.bounce, rise: STYLES.SHORT.rise, ...changes });
  const rib = (changes: Partial<Delivery> = {}) => delivery({ style: 'RIB', bounceZ: STYLES.RIB.bounce, rise: STYLES.RIB.rise, ...changes });
  const punched = (ball: Delivery, delta: number, roll = .5) => resolveShot(ball, { shotType: 'COVER_LONG_OFF', inputTimeMs: ball.idealContactTimeMs + delta }, rng(roll));
  it('is the cover swipe at a ball short of a length, and never at one pitched up', () => {
    expect(punchable(bouncer())).toBe(true); expect(punchable(rib())).toBe(true);
    expect(punchable(delivery())).toBe(false);
    expect(punch(rib(), { shotType: 'COVER_LONG_OFF' })).toBe(true);
    expect(punch(rib(), { shotType: 'STRAIGHT' })).toBe(false);
    // Pitched up, the same swipe is the cover drive it always was.
    expect(punched(delivery({ line: 'OFF', baseTargetX: LINE_X.OFF, finalTargetX: LINE_X.OFF }), 0).punched).toBeUndefined();
  });
  it('goes through cover along the ground off a length: four middled, never six', () => {
    for (const ball of [rib()]) {
      const four = punched(ball, 0);
      expect(four.runs).toBe(4); expect(four.punched).toBe(true); expect(four.madeBatContact).toBe(true);
      expect(four.feedback).toBe(PUNCH.feedback.four); expect(four.aerial).toBe(false);
      expect([2, 3]).toContain(punched(ball, 60).runs);
      expect([1, 2]).toContain(punched(ball, 100).runs);
      for (const delta of [0, 60, 100, 170]) for (const roll of [0, .5, .99]) expect(punched(ball, delta, roll).runs).not.toBe(6);
    }
  });
  it('is only pushed for ones and twos at a bouncer, never four', () => {
    const ball = bouncer();
    expect(punched(ball, 0, .5).runs).toBe(2); expect(punched(ball, 0, .9).runs).toBe(1);
    expect(punched(ball, 0, .5).punched).toBe(true);
    for (const delta of [0, 60, 100]) for (const roll of [0, .5, .99]) expect([1, 2]).toContain(punched(ball, delta, roll).runs);
    expect(punched(ball, 100, .5).runs).toBe(1);
    // Poor, it is taken behind three times in four.
    expect(punched(ball, 170, .5).wicketType).toBe('CAUGHT');
  });
  it('takes the edge when it is poor, or played across a ball on the legs', () => {
    const edged = punched(bouncer(), 170, 0);
    expect(edged.isWicket).toBe(true); expect(edged.wicketType).toBe('CAUGHT'); expect(edged.edged).toBe(true);
    const thick = punched(bouncer(), 170, .99);
    expect(thick.isWicket).toBe(false); expect(thick.runs).toBe(1);
    const across = punched(bouncer({ line: 'OUTSIDE_LEG', baseTargetX: LINE_X.OUTSIDE_LEG, finalTargetX: LINE_X.OUTSIDE_LEG }), 0, 0);
    expect(across.runs).not.toBe(4); expect(across.edged).toBe(true);
  });
  it('lets a bouncer it misses go through to the keeper', () => {
    const missed = punched(bouncer(), 300);
    expect(missed.madeBatContact).toBe(false); expect(missed.isWicket).toBe(false); expect(missed.punched).toBeUndefined();
  });
  it('is played in Survival and the Marathon too, and kept down there as well', () => {
    const middled = resolveSurvive(rib(), { shotType: 'COVER_LONG_OFF', inputTimeMs: rib().idealContactTimeMs }, rng(.5));
    expect(middled.runs).toBe(4); expect(middled.punched).toBe(true);
    // A bouncer only ones and twos there too.
    const pushed = resolveSurvive(bouncer(), { shotType: 'COVER_LONG_OFF', inputTimeMs: 1000 }, rng(.5));
    expect([1, 2]).toContain(pushed.runs); expect(pushed.punched).toBe(true);
    const missed = resolveSurvive(bouncer(), { shotType: 'COVER_LONG_OFF', inputTimeMs: 1300 }, rng(.5));
    expect(missed.runs).toBe(0); expect(missed.isWicket).toBe(false);
  });
});

describe('the square cut', () => {
  const short = (finalTargetX: number) =>
    delivery({ line: 'OUTSIDE_OFF', style: 'SHORT', baseTargetX: finalTargetX, finalTargetX, bounceZ: STYLES.SHORT.bounce, rise: STYLES.SHORT.rise });
  const wide = (changes = {}) => delivery({ line: 'OUTSIDE_OFF', baseTargetX: LINE_X.OUTSIDE_OFF, finalTargetX: LINE_X.OUTSIDE_OFF, ...changes });
  const cut = (ball: Delivery, delta: number, roll = .5) =>
    resolveShot(ball, { shotType: 'SQUARE_CUT', inputTimeMs: ball.idealContactTimeMs + delta }, rng(roll));

  it('needs width, and reads it off where the ball finishes rather than where it started', () => {
    expect(cuttable(wide())).toBe(true);
    expect(cuttable(delivery())).toBe(false);
    // Bowled wide but swinging back in: no room by the time it arrives.
    expect(cuttable(delivery({ baseTargetX: .42, finalTargetX: .10 }))).toBe(false);
    // Bowled at the stumps but leaving him: room by the time it arrives.
    expect(cuttable(delivery({ baseTargetX: .10, finalTargetX: .42 }))).toBe(true);
    expect(cuttable(delivery({ finalTargetX: CUT.minWidth }))).toBe(true);
    expect(cuttable(delivery({ finalTargetX: CUT.minWidth - .001 }))).toBe(false);
  });

  it('puts a short ball outside off away square, and edges anything mistimed', () => {
    const ball = short(LINE_X.OUTSIDE_OFF);
    // Middled: six, then four, exactly as any other stroke rewards timing.
    expect(cut(ball, 0).runs).toBe(6);
    expect(cut(ball, GAME.timing.perfect).runs).toBe(6);
    expect(cut(ball, GAME.timing.perfect + 1).runs).toBe(4);
    expect(cut(ball, GAME.timing.good).runs).toBe(4);
    // Held back: worked away along the ground rather than given away.
    const ok = cut(ball, GAME.timing.ok);
    expect(ok.runs).toBeGreaterThan(0); expect(ok.runs).toBeLessThan(4); expect(ok.isWicket).toBe(false);
    // Later than that and the keeper has it, whatever the dice say.
    for (const roll of [0, .5, .99]) {
      const edged = cut(ball, GAME.timing.poor, roll);
      expect(edged.isWicket).toBe(true); expect(edged.wicketType).toBe('CAUGHT');
      expect(edged.edged).toBe(true); expect(edged.madeBatContact).toBe(true);
      expect(edged.feedback).toBe(CUT.edged);
      // An edge is taken behind, not skied to a fielder waiting under it.
      expect(edged.aerial).toBe(false);
    }
    // Missed altogether, and it carries on through.
    expect(cut(ball, GAME.timing.poor + 200).madeBatContact).toBe(false);
    expect(cut(ball, GAME.timing.poor + 200).isWicket).toBe(false);
  });

  it('has nothing to offer against a short ball at the body', () => {
    for (const delta of [0, 40, 100]) {
      const played = cut(short(0), delta);
      expect(played.runs).toBe(0); expect(played.madeBatContact).toBe(false); expect(played.isWicket).toBe(false);
    }
  });

  it('scores off a length ball with width the same way', () => {
    expect(cut(wide(), 0).runs).toBe(6);
    expect(cut(wide(), GAME.timing.perfect + 1).runs).toBe(4);
    const edged = cut(wide(), GAME.timing.poor);
    expect(edged.edged).toBe(true); expect(edged.wicketType).toBe('CAUGHT');
  });

  it('nicks a straight ball behind rather than scoring off it, however well it is timed', () => {
    // There is no room to swing square at a ball on the stumps. The bat is
    // close enough to catch it and never square enough to hit it, so the best
    // that can happen is the edge — a cut at a straight one is a poor idea
    // however well it is middled, and the keeper is the one who benefits.
    for (const roll of [0, .5, .99]) {
      const played = resolveShot(delivery(), { shotType: 'SQUARE_CUT', inputTimeMs: 1000 }, rng(roll));
      expect(played.runs).toBe(0);
      expect(played.isWicket).toBe(true);
      expect(played.edged).toBe(true);
      expect(played.wicketType).toBe('CAUGHT');
    }
    // Down the leg side there is nothing to nick, and the ball misses the
    // stumps too, so nothing happens at all.
    const legSide = delivery({ line: 'OUTSIDE_LEG', baseTargetX: LINE_X.OUTSIDE_LEG, finalTargetX: LINE_X.OUTSIDE_LEG });
    const missed = resolveShot(legSide, { shotType: 'SQUARE_CUT', inputTimeMs: 1000 }, rng(.5));
    expect(missed.madeBatContact).toBe(false); expect(missed.isWicket).toBe(false); expect(missed.runs).toBe(0);
  });

  it('leaves the pull, the drives and the block exactly as they were', () => {
    const bouncer = delivery({ style: 'SHORT', bounceZ: STYLES.SHORT.bounce, rise: STYLES.SHORT.rise });
    expect(resolveShot(bouncer, { shotType: 'LEG', inputTimeMs: 1000 }, rng(0)).runs).toBe(6);
    expect(resolveShot(wide(), { shotType: 'COVER_LONG_OFF', inputTimeMs: 1000 }, rng(0)).runs).toBe(6);
    expect(resolveShot(delivery(), { shotType: 'STRAIGHT', inputTimeMs: 1000 }, rng(0)).runs).toBe(6);
    expect(resolveShot(delivery(), { shotType: 'DEFEND', inputTimeMs: 1000 }, rng(0)).defended).toBe(true);
  });
});
describe('delivery fairness and determinism', () => {
  it('balances the bag across every ball that is not turning, and respects speed and movement ranges', () => {
    // Only the two that turn come out of the bag's reckoning: they take their
    // line from the ones with room to turn away from instead.
    const gen = new DeliveryGenerator(new SeededRandom(42)); const counts = Object.fromEntries(LINES.map(l => [l, 0]));
    let pace = 0;
    for (let i = 0; i < 30; i++) {
      const d = gen.next(0);
      expect(d.speedKph).toBeGreaterThanOrEqual(STYLES[d.style].min);
      expect(d.speedKph).toBeLessThanOrEqual(STYLES[d.style].max);
      if (d.style === 'OFF_SPIN' || d.style === 'LEG_SPIN') {
        // A turning ball moves far more than the seamer does, and is the one
        // delivery with a promise about how far: never less than a full line,
        // and never finishing outside the widest one.
        const turn = Math.abs(d.finalTargetX - d.baseTargetX);
        expect(turn).toBeGreaterThanOrEqual(SPIN_BOWLING.minTurn - 1e-9);
        expect(turn).toBeLessThanOrEqual(SPIN_BOWLING.maxTurn + 1e-9);
        expect(Math.abs(d.finalTargetX)).toBeLessThanOrEqual(SPIN_BOWLING.maxFinalX + 1e-9);
        continue;
      }
      // Everything else takes its line from the bag, the spinner's arm ball
      // included: it goes straight on, so it wants a line like any other ball.
      pace++; counts[d.line]++;
      expect(Math.abs(d.finalTargetX - d.baseTargetX)).toBeLessThanOrEqual(GAME.movement);
    }
    // Four or five of the six turn, so the bag deals the other twenty-five or
    // twenty-six — and it deals them evenly, which is the whole of what it is
    // for: no line comes up more than one time oftener than any other.
    expect(pace).toBeGreaterThanOrEqual(25);
    expect(pace).toBeLessThanOrEqual(26);
    const dealt = Object.values(counts);
    expect(Math.max(...dealt) - Math.min(...dealt)).toBeLessThanOrEqual(1);
  });
  it('produces every style a fresh bowler can pick', () => {
    // Ten: the six weighted pace styles, the bouncer, and the spinner's three.
    // The yorker is an answer to being hit, so it never appears without sixes
    // going against him.
    const gen = new DeliveryGenerator(new SeededRandom(875)); expect(new Set(Array.from({ length: 400 }, () => gen.next(0).style)).size).toBe(10);
  });
  it('gives the classic innings a single over of spin, and it is the third', () => {
    for (let seed = 0; seed < 40; seed++) {
      const gen = new DeliveryGenerator(new SeededRandom(seed));
      const spinning: number[] = [];
      for (let ball = 0; ball < GAME.totalBalls; ball++) {
        const style = gen.next(0).style;
        if (['OFF_SPIN', 'LEG_SPIN', 'ARM_BALL'].includes(style)) spinning.push(Math.floor(ball / GAME.ballsPerOver));
      }
      expect(new Set(spinning)).toEqual(new Set([CLASSIC_SPIN.notBefore]));
      expect(spinning).toHaveLength(GAME.ballsPerOver);
    }
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
      score.record(resolveShot(d, { shotType: x < 0 ? 'LEG' : x > 0 ? 'SQUARE_CUT' : 'STRAIGHT', inputTimeMs: d.idealContactTimeMs }, r));
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
    // The cover input is the charge over cover: the same six, its own call.
    const overCover = resolveShot(ball, { shotType: 'COVER_LONG_OFF', inputTimeMs: ball.idealContactTimeMs }, new SeededRandom(4), true);
    expect(overCover.runs).toBe(6); expect(overCover.feedback).toBe(ADVANCE.coverFeedback);
    expect(resolveShot(ball, { shotType: 'LONG_ON', inputTimeMs: ball.idealContactTimeMs }, new SeededRandom(4), true).feedback).toBe(ADVANCE.onFeedback);
    expect(resolveShot(ball, { shotType: 'STRAIGHT', inputTimeMs: ball.idealContactTimeMs }, new SeededRandom(4), true).feedback).toBe(ADVANCE.feedback);
    // A leg-side or square swipe is that shot, not a charge.
    for (const shot of ['LEG', 'SQUARE_CUT'] as const)
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

describe('the slog sweep', () => {
  /** The spinner's stock ball, pitched up enough to get underneath. */
  const turning = (changes: Partial<Delivery> = {}) =>
    delivery({ style: 'OFF_SPIN', speedKph: 82, bounceZ: SWEEP.minBounceZ + .4, ...changes });
  const sweep = (d: Delivery, delta = 0, shot: ShotType = 'LEG') =>
    resolveShot(d, { shotType: shot, inputTimeMs: d.idealContactTimeMs + delta }, new SeededRandom(4), true);
  it('takes the turning ball, pitched up, and nothing else', () => {
    expect(sweepable(turning())).toBe(true);
    expect(sweepable(turning({ style: 'LEG_SPIN' }))).toBe(true);
    // Dropped short is how a sweep becomes a top edge, so it is not offered.
    expect(sweepable(turning({ bounceZ: SWEEP.minBounceZ - .1 }))).toBe(false);
    // And there is no sweeping a seamer, at any length.
    for (const style of ['NORMAL', 'SWING_IN', 'SLOWER', 'FAST', 'EXPRESS', 'SHORT', 'YORKER'] as const)
      expect(sweepable(turning({ style })), style).toBe(false);
  });
  it('needs a full meter, a leg-side swipe, and timing worth the shot', () => {
    const ball = turning();
    const six = sweep(ball);
    expect(six.swept).toBe(true); expect(six.runs).toBe(6); expect(six.feedback).toBe(SWEEP.feedback.six);
    // A shade under is the same stroke for four, and it says so.
    const four = sweep(ball, GAME.timing.perfect + 5);
    expect(four.swept).toBe(true); expect(four.runs).toBe(4); expect(four.feedback).toBe(SWEEP.feedback.four);
    // Worse than that and it is simply the leg-side stroke he played.
    expect(sweep(ball, GAME.timing.good + 5).swept).toBeFalsy();
    expect(sweep(ball, GAME.timing.ok + 5).swept).toBeFalsy();
    // Either leg-side swipe sweeps; an off-side or straight one is that shot.
    for (const shot of SWEEP.shots) expect(sweep(ball, 0, shot).swept, shot).toBe(true);
    for (const shot of ['STRAIGHT', 'COVER_LONG_OFF', 'SQUARE_CUT', 'DEFEND'] as const)
      expect(sweep(ball, 0, shot).swept, shot).toBeFalsy();
    // Without the meter it is an ordinary leg-side shot off a spinner.
    expect(resolveShot(ball, { shotType: 'LEG', inputTimeMs: ball.idealContactTimeMs }, new SeededRandom(4)).swept).toBeFalsy();
  });
  it('is never offered against a ball the charge would take, and vice versa', () => {
    // The two special strokes answer opposite balls: the charge wants a seamer
    // on the stumps, the sweep a spinner pitched up. Nothing is both, or the
    // cue on the meter would have to lie about one of them.
    const seam = delivery({ line: 'MIDDLE', baseTargetX: 0, finalTargetX: 0, style: 'NORMAL', speedKph: 125 });
    expect(chargeable(seam)).toBe(true); expect(sweepable(seam)).toBe(false);
    expect(sweepable(turning())).toBe(true); expect(chargeable(turning())).toBe(false);
  });
  it('goes to midwicket, between square leg and mid-on', () => {
    expect(SWEEP.angle).toBeLessThan(SHOT_ANGLES.LONG_ON);
    expect(SWEEP.angle).toBeGreaterThan(SHOT_ANGLES.LEG);
  });
  it('agrees with the swing that plays it, and spends the meter', () => {
    const ball = turning();
    const attempt = { shotType: 'LEG' as const, inputTimeMs: ball.idealContactTimeMs + 10 };
    expect(slogSweep(ball, attempt, true)).toBe(!!resolveShot(ball, attempt, new SeededRandom(4), true).swept);
    expect(slogSweep(ball, attempt, false)).toBe(false);
    expect(slogSweep(ball, null, true)).toBe(false);
    // Spent, like the charge: a special stroke costs the meter it was bought with.
    const meter = new Confidence();
    const six: ShotOutcome = { runs: 6, isWicket: false, quality: 1, feedback: '', timingGrade: 'PERFECT',
      timingDeltaMs: 0, compatibility: 1, madeBatContact: true, aerial: false };
    for (let i = 0; i < 4; i++) meter.record(six);
    expect(meter.full).toBe(true);
    meter.record(resolveShot(ball, attempt, new SeededRandom(4), true));
    expect(meter.value).toBe(0);
  });
});

describe('the square drive', () => {
  /** Wide of off and full: the half-volley the stroke answers. */
  const wide = (changes: Partial<Delivery> = {}) =>
    delivery({ line: 'OUTSIDE_OFF', baseTargetX: LINE_X.OUTSIDE_OFF, finalTargetX: LINE_X.OUTSIDE_OFF, ...changes });
  const drive = (d: Delivery, delta = 0, shot: ShotType = 'COVER_LONG_OFF') =>
    resolveShot(d, { shotType: shot, inputTimeMs: d.idealContactTimeMs + delta }, new SeededRandom(4));
  it('takes a full ball wide of off, and nothing else', () => {
    expect(squareDrivable(wide())).toBe(true);
    // On off stump there is no room to free the arms: that is the cover drive.
    expect(squareDrivable(delivery({ line: 'OFF', baseTargetX: LINE_X.OFF, finalTargetX: LINE_X.OFF }))).toBe(false);
    // Swung far enough back in and the width is gone with it — the movement cap
    // is .13, so a ball that starts at .42 and comes all the way in finishes at
    // .29, a centimetre under. The same delivery is two different strokes
    // depending on whether it holds its line.
    expect(squareDrivable(wide({ finalTargetX: LINE_X.OUTSIDE_OFF - GAME.movement }))).toBe(false);
    // Short is the cut's, however wide. A bouncer arrives at 1.13, well over
    // the .70 a batter can get under off the front foot.
    expect(squareDrivable(wide({ style: 'SHORT', bounceZ: STYLES.SHORT.bounce!, rise: STYLES.SHORT.rise! }))).toBe(false);
  });
  it('is judged on timing alone once the ball is right', () => {
    const ball = wide();
    const six = drive(ball);
    expect(six.squared).toBe(true); expect(six.runs).toBe(6);
    // Full value, where the cover drive on this line is capped at .9 — which
    // was the whole complaint: width made the easiest ball to hit score worse.
    expect(six.compatibility).toBe(1);
    expect(COMPATIBILITY.OUTSIDE_OFF.COVER_LONG_OFF).toBeLessThan(1);
    expect(drive(ball, GAME.timing.perfect + 5).runs).toBe(4);
    expect(drive(ball, GAME.timing.good + 5).runs).toBeLessThan(4);
    expect(drive(ball, GAME.timing.good + 5).isWicket).toBe(false);
  });
  it('takes the edge when he drives at it and does not middle it', () => {
    const played = drive(wide(), GAME.timing.ok + 5);
    expect(played.isWicket).toBe(true);
    expect(played.wicketType).toBe('CAUGHT');
    expect(played.edged).toBe(true);
    expect(played.feedback).toBe(SQUARE_DRIVE.edged);
    // Missing it altogether is not an edge — there is nothing to edge it off.
    const missed = drive(wide(), GAME.timing.ok + 400);
    expect(missed.edged).toBeFalsy();
    expect(missed.madeBatContact).toBe(false);
    // And it cannot bowl him: a ball that wide never reaches the stumps.
    expect(missed.isWicket).toBe(false);
  });
  it('belongs to the off-side drive and to no other swipe', () => {
    for (const shot of ['LEG', 'LONG_ON', 'STRAIGHT', 'SQUARE_CUT', 'DEFEND'] as const)
      expect(drive(wide(), 0, shot).squared, shot).toBeFalsy();
  });
  it('goes square of the wicket, between the cover drive and the cut', () => {
    expect(SQUARE_DRIVE.angle).toBeGreaterThan(SHOT_ANGLES.COVER_LONG_OFF);
    expect(SQUARE_DRIVE.angle).toBeLessThan(SHOT_ANGLES.SQUARE_CUT);
  });
  it('leaves the short wide ball to the cut', () => {
    const short = wide({ style: 'SHORT', bounceZ: STYLES.SHORT.bounce!, rise: STYLES.SHORT.rise! });
    const cut = resolveShot(short, { shotType: 'SQUARE_CUT', inputTimeMs: short.idealContactTimeMs }, new SeededRandom(4));
    expect(cut.runs).toBe(6); expect(cut.squared).toBeFalsy();
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
  it('costs the meter nothing: a block is a decision, not a failure', () => {
    const meter = new Confidence();
    for (let i = 0; i < 2; i++) meter.record({ runs: 4, isWicket: false, advance: false });
    const before = meter.value;
    for (let i = 0; i < 5; i++) meter.record(block(onTheStumps, 0));
    expect(meter.value).toBe(before);
    // A ball that beats the bat still costs what a dot costs.
    const wide = delivery({ line: 'OUTSIDE_OFF', baseTargetX: LINE_X.OUTSIDE_OFF, finalTargetX: LINE_X.OUTSIDE_OFF });
    const missed = block(wide, GAME.timing.poor);
    expect(missed.isWicket).toBe(false); expect(missed.defended).toBeFalsy();
    meter.record(missed);
    expect(meter.value).toBe(before + CONFIDENCE_STEP[0]);
  });
});

describe('the fielders sledging', () => {
  const ball = (over: Partial<ShotOutcome>): ShotOutcome =>
    ({ runs: 0, isWicket: false, quality: 0, feedback: '', timingGrade: 'MISS', timingDeltaMs: null,
      compatibility: 0, madeBatContact: false, aerial: false, ...over });
  const beaten = ball({});
  const blocked = ball({ defended: true, madeBatContact: true, timingGrade: 'PERFECT' });
  const scored = ball({ runs: 4, madeBatContact: true, timingGrade: 'GOOD' });
  const bowled = ball({ isWicket: true, wicketType: 'BOWLED' });
  const runs = (over: ShotOutcome[]) => { const s = new Sledger(); return over.map(o => s.record(o)); };

  it('speaks up after three balls the batter went nowhere with', () => {
    for (const three of [
      [beaten, beaten, beaten],           // three beaten
      [blocked, blocked, blocked],        // three blocked
      [beaten, blocked, beaten],          // beaten and blocked, any order
      [blocked, blocked, beaten],
      [beaten, blocked, blocked],
    ]) expect(runs(three), JSON.stringify(three.map(b => b.defended ? 'block' : 'miss'))).toEqual([false, false, true]);
  });
  it('says nothing while the batter is scoring', () => {
    expect(runs([beaten, beaten, scored, beaten, beaten])).toEqual([false, false, false, false, false]);
    expect(runs([blocked, scored, blocked, blocked])).toEqual([false, false, false, false]);
    // Two quiet balls are not a run of them.
    expect(runs([blocked, beaten])).toEqual([false, false]);
  });
  it('leaves a dismissed batter alone', () => {
    expect(quietBall(bowled)).toBe(false);
    expect(runs([beaten, beaten, bowled, beaten, beaten])).toEqual([false, false, false, false, false]);
  });
  it('needs another three before it speaks again', () => {
    expect(runs([beaten, beaten, beaten, beaten, beaten, beaten]))
      .toEqual([false, false, true, false, false, true]);
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

describe('a slower ball is meant to be a surprise', () => {
  const PITCH = GAME.releaseZ - GAME.contactZ;
  const flight = (kph: number, rush = 1) => ({
    durationMs: PITCH / (kph / 3.6) * 1000 * GAME.travelScale * rush,
    baseTargetX: 0, finalTargetX: 0, bounceZ: GAME.bounceZ, rise: GAME.rise,
  } as Delivery);
  /** Metres per second over the first `ms` of the flight. */
  const offTheHand = (delivery: Delivery, ms = 120) =>
    (ballPosition(delivery, 0).z - ballPosition(delivery, flightProgress(delivery, ms)).z) / (ms / 1000);
  // A ball off a length is whatever the innings bowls most of, so it tracks the
  // seam band rather than a number typed in beside it.
  const lengthBall = flight((STYLES.NORMAL.min + STYLES.NORMAL.max) / 2);

  it('leaves the hand at nearly the pace of a length ball', () => {
    // The bowler's action is identical every ball, so the ball itself is the
    // only thing left to read a slower one off — and one that crawls out of the
    // hand at two thirds the pace of the last one announces itself in the first
    // frame, a whole second before it arrives.
    const slower = flight(88, 1.15);
    const ratio = offTheHand(slower) / offTheHand(lengthBall);
    expect(ratio).toBeGreaterThan(.8);
    // Which is the whole change: flat out, its average pace is far slower.
    const average = PITCH / (slower.durationMs / 1000);
    expect(average / (PITCH / (lengthBall.durationMs / 1000))).toBeLessThan(.7);
  });

  it('pays for it late, and dies on the way down', () => {
    const slower = flight(88, 1.15);
    const near = flightProgress(slower, slower.durationMs) - flightProgress(slower, slower.durationMs - 120);
    const atBat = near * PITCH / .120;
    expect(atBat).toBeLessThan(offTheHand(slower) * .6);
  });

  it('never asks a quick ball to accelerate down the pitch', () => {
    // Balls slow down; they do not speed up. Only a floated one is held back.
    for (const [kph, rush] of [[176, .64], [158, .8], [138, 1]] as const) {
      expect(flightDrag(flight(kph, rush).durationMs)).toBe(0);
    }
    // A ball off a length is the reference, so it is held back by nothing worth
    // measuring either way.
    expect(flightDrag(lengthBall.durationMs)).toBeLessThan(.01);
    expect(flightDrag(flight(88, 1.15).durationMs)).toBeGreaterThan(.2);
  });

  it('arrives exactly when it always arrived, whatever it does in between', () => {
    // Every timing window in the game is measured off the contact time, so the
    // curve has to reach the bat at precisely the moment the old one did.
    for (const style of Object.keys(STYLES) as (keyof typeof STYLES)[]) {
      const shape = STYLES[style];
      const delivery = flight((shape.min + shape.max) / 2, shape.rush ?? 1);
      expect(flightProgress(delivery, delivery.durationMs)).toBeCloseTo(1, 9);
      expect(flightProgress(delivery, 0)).toBeCloseTo(0, 9);
    }
  });

  it('never turns round, before the bat or past it', () => {
    for (const [kph, rush] of [[168, .62], [122, 1], [88, 1.15], [82, 1]] as const) {
      const delivery = flight(kph, rush);
      let previous = -Infinity;
      for (let ms = 0; ms <= delivery.durationMs * 1.8; ms += 5) {
        const progress = flightProgress(delivery, ms);
        expect(progress).toBeGreaterThan(previous);
        previous = progress;
      }
    }
  });

  it('bowls the quick ones a little quicker than it used to', () => {
    expect(STYLES.EXPRESS.min).toBeGreaterThan(STYLES.FAST.max);
    expect(STYLES.FAST.min).toBeGreaterThan(STYLES.NORMAL.max);
    // An express ball still has to be playable: it is the shortest flight in
    // the game and the timing windows are tightened on top of it.
    const quickest = flight(STYLES.EXPRESS.max, STYLES.EXPRESS.rush);
    expect(quickest.durationMs).toBeGreaterThan(380);
  });
});

describe('the orthodox sweep', () => {
  /**
   * The spinner's ball, and which way it is turning — which is the whole of
   * what decides between the sweep and the flick. Negative turn is into the
   * right-hander; positive is away towards off.
   */
  const turning = (baseTargetX: number, finalTargetX: number, over: Partial<Delivery> = {}) =>
    delivery({ style: 'OFF_SPIN', bounceZ: SWEEP.minBounceZ + .4, line: 'MIDDLE',
      baseTargetX, finalTargetX, ...over });
  // Both finish on the stumps, so the only thing separating them is the
  // direction they got there from. A ball that finishes wide of the stumps is
  // a different question and has its own tests below.
  const into = (over: Partial<Delivery> = {}) => turning(.25, -.05, over);
  const away = (over: Partial<Delivery> = {}) => turning(-.25, .05, over);
  const swipe = (delta: number) => ({ shotType: 'LEG' as const, inputTimeMs: 1000 + delta });
  const played = (d: Delivery, delta: number, roll = .99, charged = false) =>
    resolveShot(d, swipe(delta), rng(roll), charged);
  const swept = (d: Delivery, delta: number) => sweeps(d, swipe(delta), gradeOf(d, swipe(delta)));

  it('reads the turn off the ball, not off the bowler\u2019s name', () => {
    expect(turningIn(into())).toBe(true);
    expect(turningIn(away())).toBe(false);
    // A leg-break that drifts back in is swept; an off-break that goes on with
    // the arm is not. The style name says neither.
    expect(turningIn(turning(.25, -.05, { style: 'LEG_SPIN' }))).toBe(true);
    expect(turningIn(turning(-.25, .05, { style: 'OFF_SPIN' }))).toBe(false);
  });

  it('pays four, three, two and one down the timing ladder, turning in', () => {
    expect([0, 60, 100, 180].map(d => played(into(), d).runs)).toEqual([4, 3, 2, 1]);
    expect([0, 60, 100, 180].map(d => played(into(), d).timingGrade))
      .toEqual(['PERFECT', 'GOOD', 'OK', 'POOR']);
  });

  it('never goes up and never goes for six, turning in', () => {
    for (const delta of [0, 30, 60, 100, 140, 180]) {
      const outcome = played(into(), delta);
      expect(outcome.aerial, `${delta}ms`).toBe(false);
      expect(outcome.isWicket, `${delta}ms`).toBe(false);
      expect(outcome.runs, `${delta}ms`).toBeLessThan(6);
      expect(outcome.sweptFlat, `${delta}ms`).toBe(true);
    }
  });

  it('is not the stroke he plays at one turning away, if he times it', () => {
    // He works it away instead, and it is scored as the leg-side stroke has
    // always been scored: the six and the four are back, and so is the risk.
    for (const delta of [0, 60, 100]) expect(swept(away(), delta), `${delta}ms`).toBe(false);
    expect(played(away(), 0).sweptFlat).toBeUndefined();
    expect(played(away(), 0).runs).toBe(6);
    expect(played(away(), 60).runs).toBe(4);
  });

  it('is a dot when he swipes to leg at one that has turned past off', () => {
    // Not a sweep and not a flick: a leg-side swipe at a ball going past
    // outside off is a stroke at nothing, and the line says so.
    const past = turning(0, .42);
    expect(swept(past, 0)).toBe(false);
    const outcome = played(past, 0);
    expect(outcome.madeBatContact).toBe(false);
    expect(outcome.runs).toBe(0);
    expect(outcome.isWicket).toBe(false);
  });

  it('top-edges the one turning away when he mistimes it', () => {
    // Bat on ball, but the face is going to leg and the ball to off.
    const outcome = played(away(), 180);
    expect(outcome.timingGrade).toBe('POOR');
    expect(swept(away(), 180)).toBe(true);
    expect(outcome.madeBatContact).toBe(true);
    expect(outcome.aerial).toBe(true);
    expect(outcome.isWicket).toBe(true);
    expect(outcome.wicketType).toBe('CAUGHT');
    expect(outcome.feedback).toBe(FLAT_SWEEP.topEdge);
  });

  it('is certain, not rolled for: every roll is the same catch', () => {
    for (const roll of [0, .01, .5, .99]) expect(played(away(), 180, roll).isWicket, `roll ${roll}`).toBe(true);
  });

  it('is bowled or LBW when he misses it altogether, either way it turned', () => {
    // No bat on the ball, so there is nothing to edge and nothing to catch.
    for (const ball of [into, away]) {
      const outcome = played(ball(), 400, .1);
      expect(outcome.madeBatContact).toBe(false);
      expect(outcome.aerial).toBe(false);
      expect(outcome.wicketType === 'LBW' || outcome.wicketType === 'BOWLED').toBe(true);
    }
    // The roll picks which of the two it is given as, not whether he is out.
    expect(played(into(), 400, .99).wicketType).toBe('BOWLED');
    expect(played(into(), 400, .1).wicketType).toBe('LBW');
  });

  it('cannot be LBW to one pitched outside leg, however plumb it looks', () => {
    const outsideLeg = turning(FLAT_SWEEP.outsideLegX - .05, 0);
    for (const roll of [0, .1, .5, .9, .99])
      expect(played(outsideLeg, 400, roll).wicketType, `roll ${roll}`).toBe('BOWLED');
  });

  it('survives the miss when the ball was going past the stumps', () => {
    const outcome = played(turning(0, 0.9), 400, .1);
    expect(outcome.isWicket).toBe(false);
    expect(outcome.feedback).toBe('PLAYED AND MISSED');
  });

  it('is offered only against the spinner, and only at one pitched up', () => {
    expect(swept(into(), 0)).toBe(true);
    for (const style of ['NORMAL', 'FAST', 'SWING_IN', 'SLOWER', 'ARM_BALL'] as const)
      expect(swept(into({ style }), 0), style).toBe(false);
    expect(swept(into({ bounceZ: SWEEP.minBounceZ - .1 }), 0)).toBe(false);
  });

  it('answers the leg-side swipe alone', () => {
    for (const shotType of ['STRAIGHT', 'COVER_LONG_OFF', 'SQUARE_CUT', 'LONG_ON', 'DEFEND'] as const) {
      const attempt = { shotType, inputTimeMs: 1000 };
      expect(sweeps(into(), attempt, gradeOf(into(), attempt)), shotType).toBe(false);
    }
    expect(sweeps(into(), null, 'PERFECT')).toBe(false);
  });

  it('gives way to the slog sweep when the meter is full and it is middled', () => {
    expect(played(into(), 0, .99, true).runs).toBe(6);
    expect(played(into(), 0, .99, true).swept).toBe(true);
    // Full meter but past GOOD: the slog does not fire, so this does.
    expect(played(into(), 100, .99, true).sweptFlat).toBe(true);
    expect(played(into(), 0, .99, false).sweptFlat).toBe(true);
  });

  it('is hit square of the wicket, squarer than the slog and the swipe', () => {
    expect(FLAT_SWEEP.angle).toBeLessThan(SWEEP.angle);
    expect(FLAT_SWEEP.angle).toBeLessThan(SHOT_ANGLES.LEG);
    expect(FLAT_SWEEP.angle).toBeGreaterThan(-90);
  });
});

describe('the scoops', () => {
  const at = (line: keyof typeof LINE_X, changes: Partial<Delivery> = {}) =>
    delivery({ line, baseTargetX: LINE_X[line], finalTargetX: LINE_X[line], ...changes });
  const scoop = (d: Delivery, delta = 0, shot: ShotType = 'SCOOP', roll = .99, charged = true) =>
    resolveShot(d, { shotType: shot, inputTimeMs: d.idealContactTimeMs + delta }, rng(roll), charged);
  it('takes any ball but the one over his head', () => {
    for (const style of ['NORMAL', 'FAST', 'EXPRESS', 'SLOWER', 'SWING_IN', 'OFF_SPIN', 'YORKER'] as const)
      expect(scoopable(delivery({ style })), style).toBe(true);
    expect(scoopable(delivery({ style: 'SHORT' }))).toBe(false);
  });
  it('gives each scoop its lines: the stumps and leg for the scoop, off and outside for the reverse', () => {
    expect(LINES.map(line => scoopLine(at(line), 'SCOOP'))).toEqual([false, true, true, false, false]);
    expect(LINES.map(line => scoopLine(at(line), 'REVERSE_SCOOP'))).toEqual([false, false, false, true, true]);
    // Read off where the ball finishes, like every other line rule.
    expect(scoopLine(at('MIDDLE', { finalTargetX: LINE_X.OFF }), 'REVERSE_SCOOP')).toBe(true);
  });
  it('needs the meter: without it the swipe down is the block it would have been', () => {
    const ball = at('MIDDLE');
    const attempt = { shotType: 'SCOOP' as const, inputTimeMs: ball.idealContactTimeMs };
    expect(scoopShot(ball, attempt, false)).toBeNull();
    expect(playedAs(ball, attempt, false).shotType).toBe('DEFEND');
    expect(playedAs(ball, attempt, true).shotType).toBe('SCOOP');
    expect(scoop(ball, 0, 'SCOOP', .99, false).defended).toBe(true);
    expect(scoop(ball, 0, 'SCOOP', .99, false).scooped).toBeUndefined();
    // And at a bouncer, the same: there is no getting under that one.
    const bouncer = at('OFF', { style: 'SHORT', bounceZ: STYLES.SHORT.bounce!, rise: STYLES.SHORT.rise! });
    // The reverse's diagonal there is the late cut, an ordinary stroke.
    expect(playedAs(bouncer, { ...attempt, shotType: 'REVERSE_SCOOP' }, true).shotType).toBe('LATE_CUT');
    expect(playedAs(ball, { ...attempt, shotType: 'REVERSE_SCOOP' }, false).shotType).toBe('LATE_CUT');
  });
  it('is paid by timing: six middled, four a shade under, singles held back', () => {
    for (const [shot, line] of [['SCOOP', 'LEG'], ['SCOOP', 'MIDDLE'], ['REVERSE_SCOOP', 'OFF'], ['REVERSE_SCOOP', 'OUTSIDE_OFF']] as const) {
      const six = scoop(at(line), 0, shot);
      expect(six.runs, `${shot} ${line}`).toBe(6); expect(six.scooped).toBe(true); expect(six.madeBatContact).toBe(true);
      expect(six.feedback).toBe(SCOOP.feedback[shot].six); expect(six.isWicket).toBe(false); expect(six.aerial).toBe(false);
      const four = scoop(at(line), GAME.timing.perfect + 5, shot);
      expect(four.runs, `${shot} ${line}`).toBe(4); expect(four.feedback).toBe(SCOOP.feedback[shot].four); expect(four.scooped).toBe(true);
      for (const roll of [0, .5, .99]) {
        const held = scoop(at(line), GAME.timing.good + 5, shot, roll);
        expect(held.runs, `${shot} ${line} ok`).toBeGreaterThanOrEqual(1); expect(held.runs).toBeLessThanOrEqual(3);
        expect(held.scooped).toBe(true); expect(held.isWicket).toBe(false);
      }
    }
  });
  it('top-edges a poor one to the keeper, and is bowled or LBW when it misses', () => {
    const edged = scoop(at('MIDDLE'), GAME.timing.ok + 5);
    expect(edged.isWicket).toBe(true); expect(edged.wicketType).toBe('CAUGHT'); expect(edged.edged).toBe(true);
    expect(edged.feedback).toBe(SCOOP.topEdge); expect(edged.scooped).toBe(true);
    // Missed altogether on the stumps: nothing but the pads in the way.
    const bowled = scoop(at('MIDDLE'), GAME.timing.poor + 5, 'SCOOP', .9);
    expect(bowled.isWicket).toBe(true); expect(bowled.wicketType).toBe('BOWLED'); expect(bowled.madeBatContact).toBe(false);
    const lbw = scoop(at('MIDDLE'), GAME.timing.poor + 5, 'SCOOP', .1);
    expect(lbw.wicketType).toBe('LBW');
    // Missed off the stumps: a play and miss, and the meter spent anyway.
    const missed = scoop(at('OUTSIDE_OFF'), GAME.timing.poor + 5, 'REVERSE_SCOOP');
    expect(missed.isWicket).toBe(false); expect(missed.feedback).toBe('PLAYED AND MISSED'); expect(missed.scooped).toBe(true);
  });
  it('plays at air on the wrong line, and says so', () => {
    const wide = scoop(at('OUTSIDE_OFF'), 0, 'SCOOP');
    expect(wide.madeBatContact).toBe(false); expect(wide.isWicket).toBe(false); expect(wide.feedback).toBe(SCOOP.wrongLine.SCOOP);
    expect(wide.scooped).toBe(true); expect(wide.runs).toBe(0);
    // Reversed at a straight one, perfectly timed, is still a straight one
    // going past a bat that is nowhere near it.
    const straight = scoop(at('MIDDLE'), 0, 'REVERSE_SCOOP', .9);
    expect(straight.isWicket).toBe(true); expect(straight.wicketType).toBe('BOWLED');
    const legSide = scoop(at('OUTSIDE_LEG'), 0, 'REVERSE_SCOOP');
    expect(legSide.isWicket).toBe(false); expect(legSide.feedback).toBe(SCOOP.wrongLine.REVERSE_SCOOP);
  });
  it('spends the meter whatever it was worth, and goes behind the wicket', () => {
    const meter = new Confidence(); meter.value = CONFIDENCE_FULL;
    meter.record(scoop(at('MIDDLE'), 0)); expect(meter.value).toBe(0);
    meter.value = CONFIDENCE_FULL;
    meter.record(scoop(at('OUTSIDE_OFF'), 0, 'SCOOP')); expect(meter.value).toBe(0);
    meter.value = CONFIDENCE_FULL;
    meter.record(scoop(at('LEG'), GAME.timing.good + 5)); expect(meter.value).toBe(0);
    expect(Math.abs(SHOT_ANGLES.SCOOP)).toBeGreaterThan(90); expect(SHOT_ANGLES.SCOOP).toBeLessThan(0);
    expect(SHOT_ANGLES.REVERSE_SCOOP).toBeGreaterThan(90);
  });
  it('leaves the charge and the sweep to their own inputs', () => {
    const ball = at('MIDDLE');
    expect(scoop(ball, 0, 'STRAIGHT').advance).toBe(true);
    expect(scoop(ball, 0, 'SCOOP').advance).toBeUndefined();
  });
});

/**
 * The cut off the spinner: he makes room, so the off-spinner's ball turning
 * into him and the leg-spinner's turning away from leg are both cuttable.
 * The same swipe as the cut; only the ball is different.
 */
describe('the late cut', () => {
  const wide = (x = LINE_X.OUTSIDE_OFF) => delivery({ baseTargetX: x, finalTargetX: x });
  const lateCutAt = (d: Delivery, delta = 0, roll = .99) =>
    resolveShot(d, playedAs(d, { shotType: 'LATE_CUT', inputTimeMs: d.idealContactTimeMs + delta }, false), rng(roll));
  it('is the swipe down and to off, and the keys D and S, without a meter', () => {
    expect(mapSwipe(60, 60)).toBe('LATE_CUT');
    expect(mapKeys(['d', 's'])).toBe('REVERSE_SCOOP');
    const d = wide(), keys = { shotType: 'REVERSE_SCOOP' as const, inputTimeMs: d.idealContactTimeMs };
    expect(playedAs(d, keys, false).shotType).toBe('LATE_CUT');
    // With the meter full it is still the reverse scoop.
    expect(playedAs(d, keys, true).shotType).toBe('REVERSE_SCOOP');
  });
  it('is four at the most, middled, and never six', () => {
    for (const x of [LINE_X.OFF, LINE_X.OUTSIDE_OFF]) for (const roll of [0, .5, .99]) {
      const middled = lateCutAt(wide(x), 0, roll);
      expect(middled.runs, `${x}`).toBe(4); expect(middled.lateCut).toBe(true); expect(middled.aerial).toBe(false);
    }
    expect(SHOT_ANGLES.LATE_CUT).toBeGreaterThan(SHOT_ANGLES.SQUARE_CUT);
    expect(SHOT_ANGLES.LATE_CUT).toBeLessThan(SHOT_ANGLES.REVERSE_SCOOP);
  });
  it('runs two or three a shade under, one or two held back, and is edged behind when poor', () => {
    expect([0, .99].map(roll => lateCutAt(wide(), 60, roll).runs)).toEqual([3, 2]);
    expect([0, .99].map(roll => lateCutAt(wide(), 100, roll).runs)).toEqual([2, 1]);
    const caught = lateCutAt(wide(), 170, 0);
    expect(caught.isWicket).toBe(true); expect(caught.wicketType).toBe('CAUGHT'); expect(caught.edged).toBe(true);
    const edged = lateCutAt(wide(), 170, .99);
    expect(edged.isWicket).toBe(false); expect(edged.runs).toBe(1);
  });
  it('is bowled played across a ball on the stumps, and lets a missed one go by outside off', () => {
    const straight = lateCutAt(delivery({ baseTargetX: 0, finalTargetX: 0 }), 0, 0);
    expect(straight.isWicket).toBe(true); expect(straight.madeBatContact).toBe(false);
    const missed = lateCutAt(wide(), 400);
    expect(missed.isWicket).toBe(false); expect(missed.madeBatContact).toBe(false);
  });
  it('is every ball on `?latecut=1`, in every mode: pitched at off stump or wider, nothing short', () => {
    for (const plan of [CLASSIC_PLAN, SURVIVE_PLAN, MARATHON_PLAN]) {
      const generator = new DeliveryGenerator(new SeededRandom(5), lateCutsEvery(plan));
      const dealt = Array.from({ length: 60 }, () => generator.next(0));
      expect(dealt.every(ball => ball.line === 'OFF' || ball.line === 'OUTSIDE_OFF')).toBe(true);
      expect(dealt.some(ball => ball.style === 'SHORT' || ball.style === 'RIB' || spun(ball))).toBe(false);
    }
  });
});

describe('the cut off the spinner', () => {
  const spinner = (style: 'OFF_SPIN' | 'LEG_SPIN' | 'ARM_BALL', base: number, final: number) =>
    delivery({ style, baseTargetX: base, finalTargetX: final, speedKph: 88 });
  const cutAt = (d: Delivery, delta = 0, roll = .99) => resolveShot(d, { shotType: 'SQUARE_CUT', inputTimeMs: d.idealContactTimeMs + delta }, rng(roll));
  it('is the cut at any spinner, and only at a spinner', () => {
    expect(spinCut(spinner('OFF_SPIN', .42, .03), { shotType: 'SQUARE_CUT' })).toBe(true);
    expect(spinCut(spinner('LEG_SPIN', -.42, .19), { shotType: 'SQUARE_CUT' })).toBe(true);
    expect(spinCut(spinner('ARM_BALL', 0, 0), { shotType: 'SQUARE_CUT' })).toBe(true);
    expect(spinCut(delivery({ finalTargetX: 0 }), { shotType: 'SQUARE_CUT' })).toBe(false);
    expect(spinCut(spinner('OFF_SPIN', .42, .03), { shotType: 'LEG' })).toBe(false);
  });
  it('suits the lines a spinner turns onto, where the cut at a quick wants width', () => {
    for (const line of LINES) {
      const d = spinner('OFF_SPIN', .42, LINE_X[line]);
      expect(fitOf(d, 'SQUARE_CUT'), line).toBe(SPIN_CUT.fit[line]);
      expect(fitOf(delivery({ finalTargetX: LINE_X[line] }), 'SQUARE_CUT'), line).toBe(COMPATIBILITY[line].SQUARE_CUT);
      // Every other stroke at the spinner keeps its own column.
      expect(fitOf(d, 'STRAIGHT'), line).toBe(COMPATIBILITY[line].STRAIGHT);
    }
    expect(SPIN_CUT.fit.MIDDLE).toBeGreaterThan(COMPATIBILITY.MIDDLE.SQUARE_CUT);
    expect(SPIN_CUT.fit.LEG).toBeGreaterThan(COMPATIBILITY.LEG.SQUARE_CUT);
  });
  it('cuts the off-spinner turning in, and the leg-spinner turning away from leg, for boundaries', () => {
    expect(cutAt(spinner('OFF_SPIN', .42, .03)).runs).toBe(6);
    expect(cutAt(spinner('LEG_SPIN', -.42, -.03), 60).runs).toBe(4);
  });
  it('is edged behind mistimed, and bowled missed with the stumps left open', () => {
    const edged = cutAt(spinner('OFF_SPIN', .42, .03), 170);
    expect(edged.isWicket).toBe(true); expect(edged.edged).toBe(true);
    const missed = cutAt(spinner('OFF_SPIN', .42, .03), 400);
    expect(missed.isWicket).toBe(true); expect(missed.wicketType).toBe('BOWLED');
  });
  it('is cramped at the ball finishing outside leg: squeezed to point at best, gloved behind when poor', () => {
    for (const style of ['OFF_SPIN', 'ARM_BALL'] as const) {
      const wide = spinner(style, -.14, LINE_X.OUTSIDE_LEG);
      expect(crampedCut(wide, { shotType: 'SQUARE_CUT' }), style).toBe(true);
      // Middled: one or two, never a boundary, along the ground the way the bat goes.
      const middled = [0, .2, .5, .99].map(roll => cutAt(wide, 0, roll));
      for (const shot of middled) {
        expect(shot.isWicket, style).toBe(false); expect(shot.aerial).toBe(false);
        expect([1, 2]).toContain(shot.runs);
      }
      expect(new Set(middled.map(shot => shot.runs))).toEqual(new Set([1, 2]));
      // A shade under: a single, or straight to point.
      expect([0, .99].map(roll => cutAt(wide, 60, roll).runs)).toEqual([1, 0]);
      // Worse: off the inside edge onto the pad, dead.
      const padded = cutAt(wide, 100);
      expect(padded.padded).toBe(true); expect(padded.runs).toBe(0); expect(padded.isWicket).toBe(false);
      // Poor: gloved through to the keeper more often than not.
      const gloved = cutAt(wide, 170, 0), lucky = cutAt(wide, 170, .99);
      expect(gloved.isWicket).toBe(true); expect(gloved.edged).toBe(true); expect(gloved.wicketType).toBe('CAUGHT');
      expect(lucky.isWicket).toBe(false); expect(lucky.padded).toBe(true);
      // Missed, it goes on down the leg side: it can bowl nobody.
      const missed = cutAt(wide, 400);
      expect(missed.isWicket).toBe(false); expect(missed.madeBatContact).toBe(false);
    }
    // Every other line the turn leaves him is his to cut for six.
    for (const line of LINES.filter(line => line !== 'OUTSIDE_LEG')) {
      expect(crampedCut(spinner('OFF_SPIN', .42, LINE_X[line]), { shotType: 'SQUARE_CUT' }), line).toBe(false);
      expect(cutAt(spinner('OFF_SPIN', .42, LINE_X[line])).runs, line).toBe(6);
    }
    // And the cut at a quick down the leg side is not this.
    expect(crampedCut(delivery({ finalTargetX: LINE_X.OUTSIDE_LEG }), { shotType: 'SQUARE_CUT' })).toBe(false);
  });
  it('is every ball on `?spincut=1`, in every mode: all of the spinner\'s, on every line', () => {
    for (const plan of [CLASSIC_PLAN, SURVIVE_PLAN, MARATHON_PLAN]) {
      const dealt = [7, 8, 9].flatMap(seed => {
        const generator = new DeliveryGenerator(new SeededRandom(seed), spinCutsEvery(plan));
        return Array.from({ length: 24 }, () => generator.next(0));
      });
      expect(dealt.every(ball => spinCut(ball, { shotType: 'SQUARE_CUT' }))).toBe(true);
      expect(new Set(dealt.map(ball => ball.style))).toEqual(new Set(['OFF_SPIN', 'LEG_SPIN', 'ARM_BALL']));
      // The one he cannot cut comes too.
      expect(dealt.some(ball => effectiveLine(ball) === 'OUTSIDE_LEG')).toBe(true);
    }
  });
});

/**
 * The hook: a bouncer on off stump or wider, round to fine leg off the scoop's
 * diagonal. An ordinary stroke, so no meter, and the bouncer's: nothing else
 * is hooked.
 */
describe('the hook', () => {
  const bouncer = (line: keyof typeof LINE_X) => delivery({ line, style: 'SHORT', baseTargetX: LINE_X[line], finalTargetX: LINE_X[line],
    bounceZ: STYLES.SHORT.bounce!, rise: STYLES.SHORT.rise! });
  const hook = (d: Delivery, delta = 0, roll = .99, shot: ShotType = 'HOOK') =>
    resolveShot(d, playedAs(d, { shotType: shot, inputTimeMs: d.idealContactTimeMs + delta }, false), rng(roll));
  it('answers the bouncer on off stump and wider, and no other ball', () => {
    expect(LINES.map(line => hookable(bouncer(line)))).toEqual([false, false, false, true, true]);
    for (const line of LINES) expect(hookable(delivery({ line, baseTargetX: LINE_X[line], finalTargetX: LINE_X[line] })), line).toBe(false);
  });
  it('is the whole leg side under the on drive at that ball, meter or none, and leaves the cut and the block where they were', () => {
    // Down and to leg, and straight out to leg: the ball has picked the hook.
    expect(mapSwipe(-60, 60, 0, false, true)).toBe('HOOK');
    expect(mapSwipe(-60, 60, 0, true, true)).toBe('HOOK');
    expect(mapSwipe(-80, 0, 0, false, true)).toBe('HOOK');
    expect(mapSwipe(-60, -60, 0, false, true)).toBe('LONG_ON');
    // Without the ball it is the leg-side stroke, or the scoop on a meter.
    expect(mapSwipe(-60, 60)).toBe('LEG');
    expect(mapSwipe(-60, 60, 0, true)).toBe('SCOOP');
    // The other side and straight down are untouched by it: the cut, the
    // late cut and the block.
    expect(mapSwipe(60, 25, 0, false, true)).toBe('SQUARE_CUT');
    expect(mapSwipe(60, 60, 0, false, true)).toBe('LATE_CUT');
    expect(mapSwipe(0, 80, 0, false, true)).toBe('DEFEND');
  });
  it('is whatever leg-side stroke is asked for at that ball, and the pull at a bouncer on the body: the line decides', () => {
    const attempt = { shotType: mapKeys(['S', 'A'])!, inputTimeMs: 1000 };
    for (const shotType of ['SCOOP', 'LEG', 'HOOK'] as const) for (const charged of [false, true]) {
      expect(playedAs(bouncer('OUTSIDE_OFF'), { ...attempt, shotType }, charged).shotType, shotType).toBe('HOOK');
      expect(playedAs(bouncer('OFF'), { ...attempt, shotType }, charged).shotType, shotType).toBe('HOOK');
      for (const line of ['MIDDLE', 'LEG', 'OUTSIDE_LEG'] as const)
        expect(playedAs(bouncer(line), { ...attempt, shotType }, charged).shotType, `${shotType} ${line}`).toBe('LEG');
    }
    // Off a bouncer the hook is nothing, and the keyboard's diagonal the block.
    expect(playedAs(delivery(), { ...attempt, shotType: 'HOOK' }, true).shotType).toBe('DEFEND');
    expect(playedAs(delivery(), attempt, false).shotType).toBe('DEFEND');
  });
  it('goes over fine leg for six middled, four a shade under, and is worked round held back', () => {
    for (const line of ['OFF', 'OUTSIDE_OFF'] as const) {
      const six = hook(bouncer(line));
      expect(six.runs, line).toBe(6); expect(six.feedback).toBe(HOOK.feedback.six); expect(six.madeBatContact).toBe(true);
      expect(six.isWicket).toBe(false); expect(six.scooped).toBeUndefined(); expect(six.advance).toBeUndefined();
      expect(hook(bouncer(line), 60).runs).toBe(4);
      const worked = hook(bouncer(line), -100, .2);
      expect([1, 2, 3]).toContain(worked.runs); expect(worked.isWicket).toBe(false);
    }
  });
  it('takes the glove through to the keeper late, and goes straight up early', () => {
    const late = hook(bouncer('OUTSIDE_OFF'), 170);
    expect(late.isWicket).toBe(true); expect(late.wicketType).toBe('CAUGHT'); expect(late.edged).toBe(true);
    expect(late.feedback).toBe(HOOK.gloved);
    const early = hook(bouncer('OUTSIDE_OFF'), -170);
    expect(early.isWicket).toBe(true); expect(early.wicketType).toBe('CAUGHT'); expect(early.aerial).toBe(true);
    expect(early.edged).toBeUndefined(); expect(early.feedback).toBe(HOOK.skied);
  });
  it('lets a missed one go on over the stumps', () => {
    const missed = hook(bouncer('OFF'), 400);
    expect(missed.isWicket).toBe(false); expect(missed.madeBatContact).toBe(false); expect(missed.runs).toBe(0);
  });
  it('is every ball on `?hooks=1`, in every mode, and only some on `?bouncers=1`', () => {
    for (const plan of [CLASSIC_PLAN, SURVIVE_PLAN, MARATHON_PLAN]) {
      const hooks = new DeliveryGenerator(new SeededRandom(11), bouncersEvery(plan, true));
      const bouncers = new DeliveryGenerator(new SeededRandom(11), bouncersEvery(plan));
      const dealt = Array.from({ length: 120 }, () => [hooks.next(0), bouncers.next(0)]);
      expect(dealt.every(([ball]) => hookable(ball))).toBe(true);
      expect(dealt.every(([, ball]) => ball.style === 'SHORT')).toBe(true);
      expect(dealt.some(([, ball]) => !hookable(ball))).toBe(true);
      // Both lines it answers come, not one of them.
      expect(new Set(dealt.map(([ball]) => effectiveLine(ball)))).toEqual(new Set(['OFF', 'OUTSIDE_OFF']));
    }
  });
  it('goes behind square on the leg side, finer than the pull', () => {
    expect(SHOT_ANGLES.HOOK).toBeLessThan(-90);
    expect(SHOT_ANGLES.HOOK).toBeLessThan(SHOT_ANGLES.LEG);
  });
});

describe('the cover drive drill', () => {
  it('bowls the cover drive\'s own ball every time, whatever the plan would have bowled', () => {
    for (const plan of [CLASSIC_PLAN, MARATHON_PLAN]) {
      const generator = new DeliveryGenerator(new SeededRandom(7), plan);
      generator.drill('NORMAL', 'OFF');
      for (let ball = 0; ball < 60; ball++) {
        const delivery = generator.next(ball * 3000);
        expect(delivery.style).toBe('NORMAL');
        expect(delivery.line).toBe('OFF');
        expect(delivery.finalTargetX).toBe(LINE_X.OFF);
      }
    }
  });
});

describe('the versions of the cover strokes', () => {
  it('are played four in ten, two in ten and four in ten', () => {
    const counts = { 1: 0, 2: 0, 3: 0 };
    for (let i = 0; i < 1000; i++) counts[coverVersionOf((i + .5) / 1000)]++;
    expect(counts).toEqual({ 1: 400, 2: 200, 3: 400 });
    expect(Object.values(COVER_ODDS).reduce((a, b) => a + b)).toBeCloseTo(1, 9);
  });

  it('are rolled the same for the same ball of the same innings, and near enough by the odds', () => {
    const counts = { 1: 0, 2: 0, 3: 0 };
    for (let seed = 1; seed <= 40; seed++) for (let ball = 0; ball < 250; ball++) {
      const roll = coverRoll(seed, ball);
      expect(roll).toBeGreaterThanOrEqual(0); expect(roll).toBeLessThan(1);
      expect(coverRoll(seed, ball)).toBe(roll);
      counts[coverVersionOf(roll)]++;
    }
    expect(counts[1] / 10000).toBeCloseTo(.4, 1);
    expect(counts[2] / 10000).toBeCloseTo(.2, 1);
    expect(counts[3] / 10000).toBeCloseTo(.4, 1);
    expect(coverRoll(7, 3)).not.toBe(coverRoll(8, 3));
  });

  it('go for four, not six, when skied off a stroke kept down and not caught', () => {
    let escaped = 0, held = 0;
    for (const seed of [3, 7, 11, 19]) {
      const generator = new DeliveryGenerator(new SeededRandom(seed));
      // Driven through the off side at a ball on the pads: the line does not
      // suit it, so it goes up, caught or not by the dice.
      generator.drill('NORMAL', 'LEG');
      for (let ball = 0; ball < 30; ball++) {
        const delivery = generator.next(ball * 3000);
        for (const roll of [.1, .9]) {
          const play = (grounded: boolean) => resolveShot(delivery, { shotType: 'COVER_LONG_OFF', inputTimeMs: delivery.idealContactTimeMs, grounded }, { next: () => roll });
          const over = play(false), down = play(true);
          if (!over.aerial) continue;
          expect(down.aerial).toBe(true);
          expect(down.isWicket).toBe(over.isWicket);
          if (over.isWicket) { held++; continue; }
          escaped++;
          expect(over.runs).toBe(6);
          expect(down.runs).toBe(4); expect(down.feedback).toBe('FOUR!');
        }
      }
    }
    expect(escaped).toBeGreaterThan(0);
    expect(held).toBeGreaterThan(0);
  });

  // Versions two and three keep the ball down: what would have been a six is
  // a four, and nothing else about the ball changes.
  for (const [mode, play] of [
    ['the Blast', (d: Delivery, grounded: boolean) => resolveShot(d, { shotType: 'COVER_LONG_OFF', inputTimeMs: d.idealContactTimeMs, grounded }, new SeededRandom(5))],
    ['the Test', (d: Delivery, grounded: boolean) => resolveSurvive(d, { shotType: 'COVER_LONG_OFF', inputTimeMs: d.idealContactTimeMs, grounded }, new SeededRandom(5))],
  ] as const) {
    it(`go for four, not six, when kept down, in ${mode}`, () => {
      let sixes = 0;
      for (const seed of [3, 7, 11, 19]) {
        const generator = new DeliveryGenerator(new SeededRandom(seed));
        generator.drill('NORMAL', 'OFF');
        for (let ball = 0; ball < 30; ball++) {
          const delivery = generator.next(ball * 3000);
          const over = play(delivery, false), down = play(delivery, true);
          if (over.runs === 6) { sixes++; expect(down.runs).toBe(4); expect(down.feedback).toBe('FOUR!'); }
          else expect(down).toEqual(over);
          expect(down.isWicket).toBe(over.isWicket);
        }
      }
      expect(sixes).toBeGreaterThan(0);
    });
  }
});
