import { describe, expect, it } from 'vitest';
import { GAME, STYLES as CLASSIC_STYLES } from '../src/config/gameplay';
import {
  BANDS, BOUNCERS, CLOSE, DAMAGE, HEALTH, SIX, SPECIALS as SURVIVE_SPECIALS, SPIN, STYLES, SURVIVE, damageFor,
} from '../src/config/survive';
import { ballPosition, stumpIntersection } from '../src/game/DeliveryTrajectory';
import { Health } from '../src/game/Health';
import {
  atTheBody, blowSpot, contactOf, endingOf, inTheSlot, outsideOff, resolveSurvive, resultOf, sledgeDue,
  spun, surviveBall, teamScore, timingSide,
} from '../src/game/Survive';
import { DeliveryGenerator, SPIN_STYLES, SURVIVE_PLAN, spinOvers } from '../src/game/DeliveryGenerator';
import { SeededRandom } from '../src/game/SeededRandom';
import { PACE_RUN, SPIN_RUN } from '../src/entities/Bowler';
import type { Delivery, DeliveryStyle, ShotOutcome } from '../src/game/types';

/** A delivery, built from a style in the Survive table so lengths are the real ones. */
function ball(style: DeliveryStyle = 'NORMAL', over: Partial<Delivery> = {}): Delivery {
  const shape = STYLES[style];
  return {
    line: 'MIDDLE', style, speedKph: Math.round((shape.min + shape.max) / 2),
    baseTargetX: 0, finalTargetX: 0,
    bounceZ: shape.bounce ?? GAME.bounceZ, rise: shape.rise ?? GAME.rise,
    durationMs: 600, releaseTimeMs: 0, idealContactTimeMs: 600, ...over,
  };
}

/** A scripted source of randomness, so every branch can be reached on purpose. */
const rolls = (...values: number[]) => {
  let i = 0;
  return { next: () => values[Math.min(i++, values.length - 1)] };
};

/** A shot played this many milliseconds off the ideal moment. */
const at = (delta: number, shotType: Parameters<typeof resolveSurvive>[1] extends null ? never : 'DEFEND' | 'STRAIGHT' | 'LEG' | 'SQUARE_CUT' | 'COVER_LONG_OFF' = 'STRAIGHT') =>
  ({ shotType, inputTimeMs: 600 + delta });

describe('the ball that climbs into the ribs', () => {
  // This is the delivery the mode was built around, and the whole reason it can
  // exist is that the post-bounce curve peaks before the batter and is falling
  // again by the stumps. If either end of that stops being true the ball becomes
  // either a length ball or a bouncer, and the mode loses its centre.
  it('arrives above the waist', () => {
    expect(ballPosition(ball('RIB'), 1).y).toBeGreaterThan(0.72);
  });

  it('is still under the bails at the stumps, so it can bowl him', () => {
    const height = ballPosition(ball('RIB'), GAME.releaseZ / (GAME.releaseZ - GAME.contactZ)).y;
    expect(height).toBeLessThanOrEqual(GAME.stumpHeight);
    expect(stumpIntersection(ball('RIB'))).toBe(true);
  });

  it('sits between the length ball and the bouncer', () => {
    const height = (style: DeliveryStyle) => ballPosition(ball(style), 1).y;
    expect(height('NORMAL')).toBeLessThan(height('RIB'));
    expect(height('RIB')).toBeLessThan(height('SHORT'));
  });

  it('is the only rising ball that can still hit the stumps', () => {
    expect(stumpIntersection(ball('SHORT'))).toBe(false);
  });
});

describe('where a ball that beat the bat hits him', () => {
  it('reads the body part off the trajectory, not off the delivery name', () => {
    expect(blowSpot(ball('SHORT'))).toBe('HELMET');
    expect(blowSpot(ball('RIB'))).toBe('RIBS');
    expect(blowSpot(ball('NORMAL'))).toBe('THIGH');
    expect(blowSpot(ball('YORKER'))).toBe('THIGH');
  });

  it('costs more off a faster ball, by the square of the pace', () => {
    expect(damageFor('HELMET', HEALTH.nominalKph)).toBe(DAMAGE.HELMET);
    expect(damageFor('HELMET', 175)).toBeGreaterThan(damageFor('HELMET', 145));
    // Double the pace, four times the blow.
    expect(damageFor('RIBS', 280)).toBe(DAMAGE.RIBS * 4);
  });
});

describe('reading the sign of a timing error', () => {
  it('names the side the ball was played on', () => {
    expect(timingSide(-200)).toBe('EARLY');
    expect(timingSide(0)).toBe('CLEAN');
    expect(timingSide(200)).toBe('LATE');
    expect(timingSide(null)).toBe('LATE');
  });

  it('separates bat-on-ball from an edge from being beaten', () => {
    expect(contactOf(0)).toBe('CLEAN');
    expect(contactOf(BANDS.clean + 20)).toBe('EDGED_LATE');
    expect(contactOf(-(BANDS.clean + 20))).toBe('EDGED_EARLY');
    expect(contactOf(BANDS.beaten + 20)).toBe('BEATEN');
  });

  it('squeezes the block on a quick ball the way it squeezes a stroke', () => {
    const edge = BANDS.clean - 2;
    expect(contactOf(edge, false)).toBe('CLEAN');
    expect(contactOf(edge, true)).toBe('EDGED_LATE');
  });
});

describe('the line decides what a mistake costs', () => {
  it('knows a ball angled at the batter from one at the stumps', () => {
    expect(atTheBody(ball('RIB', { finalTargetX: GAME.stanceX }))).toBe(true);
    expect(atTheBody(ball('RIB', { finalTargetX: 0.3 }))).toBe(false);
  });

  it('knows width outside off', () => {
    expect(outsideOff(ball('NORMAL', { finalTargetX: 0.4 }))).toBe(true);
    expect(outsideOff(ball('NORMAL', { finalTargetX: -0.4 }))).toBe(false);
  });
});

describe('the block', () => {
  it('kills the ball inside the clean band', () => {
    const played = resolveSurvive(ball(), at(0, 'DEFEND'), rolls(0.5));
    expect(played.defended).toBe(true);
    expect(played.isWicket).toBe(false);
    expect(played.hit).toBeUndefined();
  });

  it('catches the glove when it is late — it hurts, but he is still there', () => {
    const played = resolveSurvive(ball(), at(BANDS.clean + 30, 'DEFEND'), rolls(0.5));
    expect(played.hit?.where).toBe('GLOVES');
    expect(played.isWicket).toBe(false);
    expect(played.hit!.damage).toBeGreaterThan(0);
  });

  it('goes into the ribs when it is early and angled at him', () => {
    const rib = ball('RIB', { finalTargetX: GAME.stanceX });
    const played = resolveSurvive(rib, at(-(BANDS.clean + 30), 'DEFEND'), rolls(0.5));
    expect(played.hit?.where).toBe('RIBS');
    expect(played.isWicket).toBe(false);
  });

  it('takes the top edge when it is early at one going across him', () => {
    const wide = ball('NORMAL', { finalTargetX: 0.4 });
    const played = resolveSurvive(wide, at(-(BANDS.clean + 30), 'DEFEND'), rolls(0));
    expect(played.isWicket).toBe(true);
    expect(played.wicketType).toBe('CAUGHT');
    expect(played.feedback).toContain('CAUGHT BEHIND');
  });

  it('is bowled only once the bat is nowhere near', () => {
    const played = resolveSurvive(ball(), at(BANDS.beaten + 60, 'DEFEND'), rolls(0.99));
    expect(played.isWicket).toBe(true);
    expect(played.wicketType).toBe('BOWLED');
  });
});

describe('the bouncer', () => {
  it('is safe to duck on time', () => {
    const played = resolveSurvive(ball('SHORT'), at(0, 'DEFEND'), rolls(0.5));
    expect(played.isWicket).toBe(false);
    expect(played.hit).toBeUndefined();
    expect(played.feedback).toBe('DUCKED');
  });

  it('hits him if he ducks late', () => {
    // Ducking used to be unconditionally safe, which made the fastest ball in
    // the mode the one a player could answer without thinking. Get under it
    // late and you are still standing up when it arrives.
    const played = resolveSurvive(ball('SHORT'), at(BANDS.clean + 40, 'DEFEND'), rolls(0.5));
    expect(played.hit?.where).toBe('HELMET');
  });

  it('hits him on the helmet if he does nothing at all', () => {
    // The whole point of the health meter: standing there is no longer the same
    // thing as leaving it, and it is the one ball where inaction is the mistake.
    const played = resolveSurvive(ball('SHORT'), null, rolls(0.5));
    expect(played.hit?.where).toBe('HELMET');
    expect(played.hit!.damage).toBeGreaterThan(DAMAGE.RIBS);
  });

  it('goes for six off a middled pull', () => {
    const played = resolveSurvive(ball('SHORT'), at(0, 'LEG'), rolls(0.5));
    expect(played.runs).toBe(6);
  });
});

describe('a mistimed stroke', () => {
  it('goes up only when he is badly early, and is usually caught', () => {
    const played = resolveSurvive(ball(), at(-130), rolls(0));
    expect(played.timingGrade).toBe('POOR');
    expect(played.aerial).toBe(true);
    expect(played.isWicket).toBe(true);
    expect(played.wicketType).toBe('CAUGHT');
  });

  it('comes off the leading edge along the ground when he is only a little early', () => {
    // Every early stroke used to go up, which put a ball in the air twice an
    // over — too often to read as a mistake and too slow to watch.
    const wide = ball('NORMAL', { line: 'OUTSIDE_OFF', baseTargetX: 0.42, finalTargetX: 0.42 });
    const played = resolveSurvive(wide, at(-60), rolls(0.99, 0.99));
    expect(played.aerial).toBe(false);
    expect(played.isWicket).toBe(false);
    expect(played.runs).toBeLessThanOrEqual(1);
  });

  it('hangs for less time than the classic innings when it does go up', () => {
    const played = resolveSurvive(ball(), at(-130), rolls(0.99, 0.99));
    expect(played.hangMs).toBe(SURVIVE.hangMs);
    expect(played.hangMs!).toBeLessThan(GAME.aerialFlightMs);
  });

  it('hits him when he plays early at one angled into his body', () => {
    // Without this the only way to take a blow was to block, so a batter who
    // attacked was never hit at all — which is exactly what the playtest found.
    const inswinger = ball('RIB', { finalTargetX: GAME.stanceX });
    const played = resolveSurvive(inswinger, at(-130, 'LEG'), rolls(0.5));
    expect(played.timingGrade).toBe('POOR');
    expect(played.hit?.where).toBe('RIBS');
    expect(played.isWicket).toBe(false);
  });

  it('never pays a boundary for a mishit that lands safely', () => {
    const played = resolveSurvive(ball(), at(-130), rolls(0.99, 0.99));
    expect(played.isWicket).toBe(false);
    expect(played.runs).toBeLessThanOrEqual(1);
  });

  it('finds the edge when he is late at one outside off', () => {
    const wide = ball('NORMAL', { line: 'OUTSIDE_OFF', baseTargetX: 0.42, finalTargetX: 0.42 });
    const played = resolveSurvive(wide, at(130, 'SQUARE_CUT'), rolls(0));
    expect(played.isWicket).toBe(true);
    expect(played.feedback).toContain('CAUGHT BEHIND');
  });

  it('is only an inside edge when he is late at a straight one', () => {
    // The change that made the mode playable at all: being a little late on a
    // straight ball is the commonest way to mistime, and it must not be a
    // dismissal or every innings is over inside an over.
    const played = resolveSurvive(ball(), at(130), rolls(0.99));
    expect(played.isWicket).toBe(false);
    expect(played.feedback).toBe('INSIDE EDGE');
  });

  it('is bowled only when the bat missed altogether', () => {
    const played = resolveSurvive(ball(), at(SURVIVE.timing.poor + 80), rolls(0.99));
    expect(played.isWicket).toBe(true);
    expect(played.wicketType).toBe('BOWLED');
  });
});

describe('middling it', () => {
  /** A ball in the slot: full enough to swing through and slow enough to line up. */
  const slot = () => ball('NORMAL', { speedKph: SIX.maxKph - 2 });

  it('pays six only for a perfect stroke at a ball that was there to be hit', () => {
    expect(resolveSurvive(slot(), at(0), rolls(0.5)).runs).toBe(6);
    expect(inTheSlot(slot())).toBe(true);
  });

  it('pays four for the same stroke at a ball that was not', () => {
    // A number eleven who middles an express delivery has middled it. He has
    // not cleared the rope with it.
    const quick = ball('EXPRESS');
    expect(inTheSlot(quick)).toBe(false);
    expect(resolveSurvive(quick, at(0), rolls(0.5)).runs).toBe(4);
  });

  it('pays four for a perfect stroke that was not the one the line asked for', () => {
    expect(inTheSlot(slot(), 0.6)).toBe(false);
  });

  it('pays four for good timing', () => {
    expect(resolveSurvive(slot(), at(SURVIVE.timing.perfect + 5), rolls(0.5)).runs).toBe(4);
  });

  it('is worked away for ones and twos when it is only well enough timed', () => {
    const played = resolveSurvive(ball(), at(SURVIVE.timing.good + 10), rolls(0.5));
    expect(played.runs).toBeGreaterThanOrEqual(1);
    expect(played.runs).toBeLessThanOrEqual(2);
  });
});

describe('how the innings ends', () => {
  it('ends the moment the target is passed', () => {
    expect(endingOf(SURVIVE.target, 40, 0, false)).toBe('CHASED');
  });

  it('is a draw once the last ball is survived', () => {
    expect(endingOf(60, SURVIVE.totalBalls, 0, false)).toBe('DRAWN');
  });

  it('is a draw, not a retirement, when the blow lands on the last ball', () => {
    // Cricket's own reading, and the user's: he had no batting left to be
    // unable to do. The order of these checks is the whole of the rule.
    expect(endingOf(60, SURVIVE.totalBalls, 0, true)).toBe('DRAWN');
  });

  it('prefers the target to the ball count, so a hundred off the last ball wins', () => {
    expect(endingOf(SURVIVE.target, SURVIVE.totalBalls, 0, false)).toBe('CHASED');
  });

  it('is lost on the wicket and on the meter', () => {
    expect(endingOf(40, 30, 1, false)).toBe('BOWLED_OUT');
    expect(endingOf(40, 30, 0, true)).toBe('RETIRED');
  });

  it('is still going when none of those is true', () => {
    expect(endingOf(40, 30, 0, false)).toBeNull();
  });
});

describe('the meter', () => {
  it('never heals', () => {
    const health = new Health();
    health.record({ hit: { where: 'RIBS', damage: 20 } });
    health.record({ hit: undefined });
    expect(health.value).toBe(HEALTH.full - 20);
  });

  it('remembers every blow, so a retirement can name the battering', () => {
    const health = new Health();
    health.record({ hit: { where: 'GLOVES', damage: 11 } });
    health.record({ hit: { where: 'HELMET', damage: 34 } });
    expect(health.blows).toHaveLength(2);
  });

  it('fills as the blows land rather than draining', () => {
    // The bar draws `injury`, so this is the direction a player actually sees.
    const health = new Health();
    expect(health.injury).toBe(0);
    health.record({ hit: { where: 'RIBS', damage: HEALTH.full / 4 } });
    expect(health.injury).toBeCloseTo(0.25);
    health.record({ hit: { where: 'RIBS', damage: HEALTH.full / 4 } });
    expect(health.injury).toBeCloseTo(0.5);
  });

  it('reaches the end of the track exactly when he is retired', () => {
    // The right-hand end of the meter is labelled RETIRE HURT, so a full bar
    // and a finished innings have to be the same moment — and a blow bigger
    // than what was left must not push it past the end and out of the track.
    const health = new Health();
    health.record({ hit: { where: 'HELMET', damage: HEALTH.full * 3 } });
    expect(health.injury).toBe(1);
    expect(health.spent).toBe(true);
  });

  it('warns before it ends the innings', () => {
    const health = new Health();
    health.record({ hit: { where: 'HELMET', damage: HEALTH.full - HEALTH.critical } });
    expect(health.critical).toBe(true);
    expect(health.spent).toBe(false);
    health.record({ hit: { where: 'RIBS', damage: HEALTH.critical } });
    expect(health.spent).toBe(true);
    expect(health.critical).toBe(false);
  });
});

describe('the blow that finishes him', () => {
  // The three pieces have to agree: the resolver produces a blow, the meter
  // empties, and the ending reads as a retirement rather than a dismissal.
  // Nothing else in the game ends an innings without a wicket falling.
  it('empties the meter and retires him rather than dismissing him', () => {
    const health = new Health();
    health.value = 6;
    const bouncer = ball('SHORT', { finalTargetX: GAME.stanceX });
    const played = resolveSurvive(bouncer, at(BANDS.clean + 60, 'DEFEND'), rolls(0.5));
    expect(played.hit).toBeDefined();
    expect(played.isWicket).toBe(false);
    health.record(played);
    expect(health.spent).toBe(true);
    expect(endingOf(40, 30, 0, health.spent)).toBe('RETIRED');
  });

  it('leaves him standing while there is anything left', () => {
    const health = new Health();
    const played = resolveSurvive(ball('RIB', { finalTargetX: GAME.stanceX }), at(BANDS.clean + 40, 'DEFEND'), rolls(0.5));
    health.record(played);
    expect(health.spent).toBe(false);
    expect(endingOf(40, 30, 0, health.spent)).toBeNull();
  });
});

describe('the field having something to say', () => {
  /** An innings as a run of per-ball scores. */
  const over = (...runs: number[]) => runs.map(r => ({ runs: r as ShotOutcome['runs'] }));
  const quiet = (n: number) => over(...Array(n).fill(0));

  it('needles a batter who has been stuck', () => {
    expect(sledgeDue(quiet(10), 0)).toBe(true);
  });

  it('says nothing to one who is scoring', () => {
    // Four runs in the window is enough to be getting on with, and a fixed
    // clock would have had them needling a man who had just hit a boundary.
    expect(sledgeDue(over(0, 0, 0, 0, 4, 0, 0, 0, 0, 0), 0)).toBe(false);
    expect(sledgeDue(over(0, 0, 0, 0, 3, 0, 0, 0, 0, 0), 0)).toBe(true);
  });

  it('waits for a full window before saying anything at all', () => {
    expect(sledgeDue(quiet(9), 0)).toBe(false);
  });

  it('does not repeat itself every ball while the drought goes on', () => {
    // Said on ball 10; silent through 11 to 19 however quiet it stays.
    expect(sledgeDue(quiet(15), 10)).toBe(false);
    expect(sledgeDue(quiet(20), 10)).toBe(true);
  });

  it('catches a drought that straddles the boundary, which a clock would miss', () => {
    // Six off the first four balls, then nothing: by ball fourteen the last ten
    // have produced nothing at all, and a check every tenth ball would be silent.
    const innings = over(6, 0, 0, 0, ...Array(10).fill(0));
    expect(innings).toHaveLength(14);
    expect(sledgeDue(innings, 0)).toBe(true);
  });
});

describe('a ball that goes up', () => {
  it('is put down rather than falling safe in a gap', () => {
    // A ball skied that high does not land where nobody is. Somebody gets under
    // it and gets hands to it, and the scene needs to know which so it can send
    // the fielder and then spill it.
    const played = resolveSurvive(ball(), at(-130), rolls(0.99, 0.99));
    expect(played.aerial).toBe(true);
    expect(played.dropped).toBe(true);
    expect(played.isWicket).toBe(false);
    expect(played.feedback).toContain('DROPPED');
  });

  it('is not marked dropped when it is held', () => {
    const played = resolveSurvive(ball(), at(-130), rolls(0));
    expect(played.isWicket).toBe(true);
    expect(played.dropped).toBeUndefined();
  });
});

describe('a ball that hits him', () => {
  it('never counts as bat contact, so it dies on the pitch instead of carrying on', () => {
    // The scene reads `hit` to drop the ball at his feet. Before it did, a blow
    // to the ribs ran through to the keeper like a ball he had simply missed.
    const played = resolveSurvive(ball('RIB', { finalTargetX: GAME.stanceX }), at(-130, 'LEG'), rolls(0.5));
    expect(played.hit?.where).toBe('RIBS');
    expect(played.madeBatContact).toBe(false);
    expect(played.aerial).toBe(false);
  });
});

describe('the scoreboard he walks out to', () => {
  it('is drawn from the seed, inside the range the mode advertises', () => {
    for (const roll of [0, 0.5, 1]) {
      const score = teamScore(rolls(roll));
      expect(score).toBeGreaterThanOrEqual(SURVIVE.minTeamScore);
      expect(score).toBeLessThanOrEqual(SURVIVE.maxTeamScore);
    }
  });
});

describe('the classic innings is untouched', () => {
  // Survive shrinks the windows, reads the sign of an error and can end an
  // innings without a wicket. None of that is an improvement to the game people
  // are already playing, so none of it is allowed to reach it.
  it('keeps its own timing windows', () => {
    expect(GAME.timing).toEqual({ perfect: 40, good: 78, ok: 135, poor: 205 });
    expect(GAME.totalBalls).toBe(30);
    expect(GAME.maxWickets).toBe(3);
  });

  it('never bowls the ball Survive added', () => {
    // The classic table lists it so that every style the game knows is named in
    // one place, and weights it to zero — the same way it already holds the
    // yorker and the bouncer, which are bowled by the state of the innings
    // rather than rolled for.
    expect(CLASSIC_STYLES.RIB.weight).toBe(0);
    expect(STYLES.RIB.weight).toBeGreaterThan(0);
  });

  it('keeps its own flight, so no Survive tuning reaches it', () => {
    expect(GAME.travelScale).not.toBe(SURVIVE.travelScale);
    expect(GAME.timing.poor).not.toBe(SURVIVE.timing.poor);
  });
});

describe('what the scorecard says he cost the side', () => {
  // The card renders `9 + wickets`: he walked out with nine already down. These
  // pin the half of that sum the card cannot work out for itself — being
  // carried off is not a dismissal, so it must never reach the card as one.
  it('does not count a retired batter out', () => {
    // Nine down and no wicket to this innings: 9, not 10.
    expect(endingOf(40, 30, 0, true)).toBe('RETIRED');
  });

  it('counts a dismissed batter out', () => {
    expect(endingOf(40, 30, SURVIVE.maxWickets, false)).toBe('BOWLED_OUT');
  });

  it('calls him out rather than hurt when the wicket and the last blow land together', () => {
    // Both at once is the awkward case, and being bowled off a blow that would
    // also have finished him is still being bowled: the side loses the wicket.
    expect(endingOf(40, 30, SURVIVE.maxWickets, true)).toBe('BOWLED_OUT');
  });

  it('costs the side nothing when he is carried off having saved the match', () => {
    // A batter who survives the last ball and collapses has drawn the match,
    // and a draw with nine down is not the same scorecard as one with ten.
    expect(endingOf(40, SURVIVE.totalBalls, 0, true)).toBe('DRAWN');
  });
});


/**
 * The Survive attack, which is the one the game bowls rather than one written
 * out again here. It used to be restated, and a restated plan is a plan that
 * goes stale: the short ball moved out of the weight table and into a plan of
 * its own, and every copy went on testing a mode with no bouncers in it.
 */
const SPELL = { ...SPIN, ofOvers: SURVIVE.totalBalls / SURVIVE.ballsPerOver, ballsPerOver: SURVIVE.ballsPerOver };
const OVERS = SURVIVE.totalBalls / SURVIVE.ballsPerOver;
const attack = (seed: number) => new DeliveryGenerator(new SeededRandom(seed), SURVIVE_PLAN);
/** Every delivery of a full innings, with the over it was bowled in. */
const innings = (seed: number) => {
  const generator = attack(seed);
  return Array.from({ length: SURVIVE.totalBalls }, (_, ball) => ({
    over: Math.floor(ball / SURVIVE.ballsPerOver),
    inOver: ball % SURVIVE.ballsPerOver,
    style: generator.next(0).style,
  }));
};

describe('the warning the player actually sees', () => {
  it('keeps the critical band wider than a typical blow, so it is not stepped over', () => {
    // The band is presentation — `spent` ends the innings — but a band narrower
    // than the blows that cross it is a warning nobody ever sees. It was 25
    // against a helmet blow worth up to 81, and half of all retirements skipped
    // it entirely. Anything short of the biggest blow will be skipped sometimes;
    // what this holds is that the common ones land inside it.
    const typical = Math.max(damageFor('RIBS', 160), damageFor('GLOVES', 172), damageFor('THIGH', 172));
    expect(HEALTH.critical).toBeGreaterThan(typical);
  });

  it('leaves the critical state meaning he is most of the way gone', () => {
    // Wide is not the same as early. Half the meter would make it the innings
    // rather than its last act.
    expect(HEALTH.critical).toBeLessThan(HEALTH.full / 2);
  });
});

describe('the short ball is planned, not rolled for', () => {
  it('puts one in every over of pace, and never misses an over', () => {
    // Rolled for, thirty-eight per cent of innings met no bouncer at all. The
    // whole point of placing it is that the over always has its quota.
    for (let seed = 0; seed < 120; seed++) {
      const spell = new Set(attack(seed).spell);
      const balls = innings(seed);
      for (let over = 0; over < OVERS; over++) {
        if (spell.has(over)) continue;
        const short = balls.filter(b => b.over === over && b.style === 'SHORT').length;
        const wanted = over >= OVERS - BOUNCERS.deathOvers ? BOUNCERS.atTheDeath : BOUNCERS.perOver;
        expect(short, `seed ${seed}, over ${over}`).toBe(wanted);
      }
    }
  });

  it('gives the last two overs to the quick bowlers, so the plan has somewhere to land', () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const over of attack(seed).spell) {
        expect(over, `seed ${seed}`).toBeLessThan(OVERS - BOUNCERS.deathOvers);
      }
    }
  });

  it('still gives the spinner his three overs out of a smaller pool', () => {
    for (let seed = 0; seed < 200; seed++) expect(attack(seed).spell).toHaveLength(SPIN.overs);
  });

  it('never bowls it from the same place in the over twice running', () => {
    // Placed at a position drawn fresh, the way the arm ball already is. A fixed
    // slot would be a timetable and the batter would simply wait for it.
    const seen = new Set<number>();
    for (let seed = 0; seed < 120; seed++) {
      for (const b of innings(seed)) if (b.style === 'SHORT') seen.add(b.inOver);
    }
    expect(seen.size).toBe(SURVIVE.ballsPerOver);
  });

  it('bowls none at all off the spinner', () => {
    for (let seed = 0; seed < 120; seed++) {
      const spell = new Set(attack(seed).spell);
      for (const b of innings(seed)) {
        if (spell.has(b.over)) expect(b.style, `seed ${seed}`).not.toBe('SHORT');
      }
    }
  });

  it('is the only thing bowling it, so the two cannot stack', () => {
    // The weight table gave it thirteen per cent. Left there alongside the plan,
    // an over could carry three and the measured rates would all have been wrong.
    expect(STYLES.SHORT.weight).toBe(0);
    expect(SURVIVE_SPECIALS.shortChance).toBe(0);
  });
});

describe('the spinner gets overs, not deliveries', () => {
  it('gives him three of the ten, every innings', () => {
    for (let seed = 0; seed < 200; seed++) {
      expect(spinOvers(new SeededRandom(seed), SPELL).size).toBe(SPIN.overs);
    }
  });

  it('never hands him the first two', () => {
    // The mode opens with pace: the batter has to feel the quick bowling before
    // taking it away can mean anything.
    for (let seed = 0; seed < 300; seed++) {
      for (const over of spinOvers(new SeededRandom(seed), SPELL)) {
        expect(over).toBeGreaterThanOrEqual(SPIN.notBefore);
        expect(over).toBeLessThan(SPELL.ofOvers);
      }
    }
  });

  it('always gives him the third, whatever else it draws', () => {
    // The change arrives on a fixed cue rather than as a coin landing, so two
    // overs of pace and then the ball goes to the spinner, every innings.
    for (let seed = 0; seed < 300; seed++) {
      expect(spinOvers(new SeededRandom(seed), SPELL).has(SPIN.notBefore)).toBe(true);
    }
  });

  it('leaves when he comes back an open question', () => {
    // Only the first is fixed. If the other two were fixed as well the whole
    // spell would be a timetable, which is the thing the draw is there to stop.
    const later = new Set<string>();
    for (let seed = 0; seed < 120; seed++) {
      const rest = [...spinOvers(new SeededRandom(seed), SPELL)].filter(o => o !== SPIN.notBefore).sort();
      expect(rest).toHaveLength(SPIN.overs - 1);
      later.add(rest.join(','));
    }
    expect(later.size).toBeGreaterThan(8);
  });

  it('bowls him the third over in a real innings, not just on paper', () => {
    // The generator counts its own deliveries, so this is the guarantee as the
    // batter meets it: balls 13 to 18 are his.
    for (let seed = 0; seed < 25; seed++) {
      const generator = attack(seed);
      for (let ball = 0; ball < SURVIVE.totalBalls; ball++) {
        const spin = SPIN_STYLES.includes(generator.next(0).style);
        if (Math.floor(ball / SURVIVE.ballsPerOver) === SPIN.notBefore) expect(spin).toBe(true);
      }
    }
  });

  it('draws a different three from innings to innings', () => {
    // A fixed spell is a timetable, and a batter who knows the seventh is the
    // one to see off is batting to the clock rather than to the ball.
    const seen = new Set<string>();
    for (let seed = 0; seed < 60; seed++) seen.add([...spinOvers(new SeededRandom(seed), SPELL)].sort().join(','));
    expect(seen.size).toBeGreaterThan(10);
  });

  it('bowls only his own deliveries inside his over, and none outside it', () => {
    for (let seed = 0; seed < 40; seed++) {
      const generator = attack(seed);
      const spell = new Set(generator.spell);
      for (let ball = 0; ball < SURVIVE.totalBalls; ball++) {
        const over = Math.floor(ball / SURVIVE.ballsPerOver);
        const delivery = generator.next(0);
        expect(SPIN_STYLES.includes(delivery.style)).toBe(spell.has(over));
      }
    }
  });

  it('bowls him a whole over at a time', () => {
    // Six from the same bowler, not a spinner spliced into a seamer's over.
    const generator = attack(7);
    const styles: boolean[] = [];
    for (let ball = 0; ball < SURVIVE.totalBalls; ball++) styles.push(SPIN_STYLES.includes(generator.next(0).style));
    for (let over = 0; over < SPELL.ofOvers; over++) {
      const inOver = styles.slice(over * 6, over * 6 + 6);
      expect(new Set(inOver).size).toBe(1);
    }
  });
});

describe('the ball that turns', () => {
  const turned = (seed: number, wanted: DeliveryStyle) => {
    const generator = attack(seed);
    for (let ball = 0; ball < SURVIVE.totalBalls * 4; ball++) {
      const delivery = generator.next(0);
      if (delivery.style === wanted) return delivery;
    }
    return null;
  };

  it('brings the off break back in and takes the leg break away', () => {
    // Off spin turns in towards the batter, leg spin away from him. He stands
    // outside leg, so in is negative and away is positive.
    for (let seed = 0; seed < 120; seed++) {
      const off = turned(seed, 'OFF_SPIN');
      if (off) expect(off.finalTargetX).toBeLessThanOrEqual(off.baseTargetX);
      const leg = turned(seed, 'LEG_SPIN');
      if (leg) expect(leg.finalTargetX).toBeGreaterThanOrEqual(leg.baseTargetX);
    }
  });

  it('never finishes wide, either side', () => {
    for (let seed = 0; seed < 60; seed++) {
      const generator = attack(seed);
      for (let ball = 0; ball < SURVIVE.totalBalls; ball++) {
        const delivery = generator.next(0);
        if (delivery.style === 'OFF_SPIN' || delivery.style === 'LEG_SPIN') {
          expect(Math.abs(delivery.finalTargetX)).toBeLessThanOrEqual(SPIN.maxFinalX + 1e-9);
        }
      }
    }
  });

  it('always bites, and never less than a whole line', () => {
    // A ball the over promises will turn has to turn. The old version drew the
    // line first and cut the turn off at the tramline afterwards, so an off
    // break pitched outside leg lost all of it and came out dead straight — a
    // non-turning ball that was not the arm ball, which is the one thing the
    // spell must not contain.
    const lineGap = 0.14;
    for (let seed = 0; seed < 60; seed++) {
      const generator = attack(seed);
      for (let ball = 0; ball < SURVIVE.totalBalls; ball++) {
        const delivery = generator.next(0);
        if (delivery.style !== 'OFF_SPIN' && delivery.style !== 'LEG_SPIN') continue;
        const turn = Math.abs(delivery.finalTargetX - delivery.baseTargetX);
        expect(turn).toBeGreaterThanOrEqual(SPIN.minTurn - 1e-9);
        expect(turn).toBeGreaterThan(lineGap);
      }
    }
  });

  it('leaves both directions available off the same lines', () => {
    // Three of the five are common to both, so where it pitches does not say
    // which way it is going. If a line only ever produced one direction the
    // batter could read the turn before it landed.
    const both = new Map<string, Set<string>>();
    for (let seed = 0; seed < 60; seed++) {
      const generator = attack(seed);
      for (let ball = 0; ball < SURVIVE.totalBalls; ball++) {
        const delivery = generator.next(0);
        if (delivery.style !== 'OFF_SPIN' && delivery.style !== 'LEG_SPIN') continue;
        if (!both.has(delivery.line)) both.set(delivery.line, new Set());
        both.get(delivery.line)!.add(delivery.style);
      }
    }
    expect([...both].filter(([, styles]) => styles.size === 2)).toHaveLength(3);
  });

  it('does not turn every ball the same distance', () => {
    const turns = new Set<string>();
    for (let seed = 0; seed < 80; seed++) {
      const off = turned(seed, 'OFF_SPIN');
      if (off) turns.add((off.finalTargetX - off.baseTargetX).toFixed(4));
    }
    expect(turns.size).toBeGreaterThan(20);
  });

  it('arrives quicker than the change-up and slower than the seamer', () => {
    // The whole point of the rush on these: at ninety kph the arithmetic alone
    // floats the ball for as long as the slower one, and a spell where every
    // delivery behaves like the change-up has no change-up in it.
    const flight = (style: DeliveryStyle) => {
      const shape = STYLES[style];
      const kph = (shape.min + shape.max) / 2;
      return (GAME.releaseZ - GAME.contactZ) / (kph / 3.6) * 1000 * SURVIVE.travelScale * (shape.rush ?? 1);
    };
    for (const style of ['OFF_SPIN', 'LEG_SPIN'] as const) {
      expect(flight(style)).toBeGreaterThan(flight('NORMAL'));
      expect(flight(style)).toBeLessThan(flight('SLOWER'));
    }
    // And the one that goes straight on is quicker than both of them.
    expect(flight('ARM_BALL')).toBeLessThan(flight('OFF_SPIN'));
    expect(flight('ARM_BALL')).toBeGreaterThan(flight('NORMAL'));
  });

  it('does not turn the arm ball at all', () => {
    for (let seed = 0; seed < 200; seed++) {
      const arm = turned(seed, 'ARM_BALL');
      if (arm) expect(arm.finalTargetX).toBeCloseTo(arm.baseTargetX, 9);
    }
  });
});

describe('the shape of a spin over', () => {
  const overs = (seed: number) => {
    const generator = attack(seed);
    const spell = new Set(generator.spell);
    const out: string[][] = [];
    for (let over = 0; over < SPELL.ofOvers; over++) {
      const balls: string[] = [];
      for (let ball = 0; ball < SURVIVE.ballsPerOver; ball++) balls.push(generator.next(0).style);
      if (spell.has(over)) out.push(balls);
    }
    return out;
  };

  it('always puts the quicker one somewhere in the over', () => {
    // Rolled for per ball this came out as overs with three of them and, worse,
    // overs with none — six turning balls and nothing to be wary of.
    for (let seed = 0; seed < 80; seed++) {
      for (const over of overs(seed)) {
        expect(over.filter(style => style === 'ARM_BALL').length).toBeGreaterThanOrEqual(SPIN.armBallsPerOver);
      }
    }
  });

  it('turns four or five of the six', () => {
    for (let seed = 0; seed < 80; seed++) {
      for (const over of overs(seed)) {
        const turning = over.filter(style => style === 'OFF_SPIN' || style === 'LEG_SPIN').length;
        expect(turning).toBeGreaterThanOrEqual(4);
        expect(turning).toBeLessThanOrEqual(5);
      }
    }
  });

  it('does not bowl it at the same point of every over', () => {
    const positions = new Set<number>();
    for (let seed = 0; seed < 60; seed++) {
      for (const over of overs(seed)) over.forEach((style, at) => { if (style === 'ARM_BALL') positions.add(at); });
    }
    expect(positions.size).toBe(SURVIVE.ballsPerOver);
  });
});

describe('the spinner cannot hurt him', () => {
  it('takes nothing off the meter, wherever it hits him', () => {
    // Every injury in the mode goes through one funnel, so this is the whole of
    // it: a ball that would be a blow off the quick bowler is a dot off him.
    for (const style of SPIN_STYLES) {
      const delivery = ball(style, { finalTargetX: GAME.stanceX });
      const played = resolveSurvive(delivery, at(BANDS.clean + 40, 'DEFEND'), rolls(0.5));
      expect(played.hit).toBeUndefined();
      expect(played.isWicket).toBe(false);
      expect(played.runs).toBe(0);
    }
  });

  it('still takes the meter down off the quick bowler', () => {
    const played = resolveSurvive(ball('RIB', { finalTargetX: GAME.stanceX }), at(BANDS.clean + 40, 'DEFEND'), rolls(0.5));
    expect(played.hit).toBeDefined();
  });

  it('leaves a blow off the spinner off the meter entirely', () => {
    const health = new Health();
    const played = resolveSurvive(ball('OFF_SPIN', { finalTargetX: GAME.stanceX }), at(BANDS.clean + 40, 'DEFEND'), rolls(0.5));
    health.record(played);
    expect(health.value).toBe(HEALTH.full);
    expect(health.blows).toHaveLength(0);
  });

  it('knows which deliveries are his', () => {
    for (const style of SPIN_STYLES) expect(spun(ball(style))).toBe(true);
    for (const style of ['NORMAL', 'RIB', 'SHORT', 'EXPRESS', 'SLOWER'] as const) expect(spun(ball(style))).toBe(false);
  });
});

describe('what the spinner can take instead', () => {
  it('stumps a batter beaten by a turning ball', () => {
    // His wicket, and without it three overs of spin were three overs off: an
    // expert is beaten on about one ball in a thousand by pace and it costs
    // him nothing unless the ball hits something.
    const played = resolveSurvive(ball('OFF_SPIN'), at(BANDS.beaten + 200, 'DEFEND'), rolls(0.01));
    expect(played.isWicket).toBe(true);
    expect(played.wicketType).toBe('STUMPED');
  });

  it('lets him back in when the roll goes the other way', () => {
    const played = resolveSurvive(ball('OFF_SPIN', { finalTargetX: 0.40 }), at(BANDS.beaten + 200, 'DEFEND'), rolls(0.99));
    expect(played.wicketType).not.toBe('STUMPED');
  });

  it('does not stump him off the arm ball', () => {
    // Beaten by a ball that went straight on is being bowled, not stumped.
    const played = resolveSurvive(ball('ARM_BALL', { finalTargetX: 0.40 }), at(BANDS.beaten + 200, 'DEFEND'), rolls(0.01));
    expect(played.wicketType).not.toBe('STUMPED');
  });

  it('never pays the maximum off him', () => {
    // The slot gate asks for slow and full, which every ball he bowls is — so
    // left alone it made all three overs slot balls and the six stopped being
    // a reward for waiting for the right one.
    for (const style of SPIN_STYLES) {
      expect(inTheSlot(ball(style, { bounceZ: (SIX.minBounce + SIX.maxBounce) / 2, speedKph: 88 }), 1)).toBe(false);
    }
  });
});

describe('the spinner does not run in', () => {
  it('walks to the crease instead of running to it', () => {
    expect(SPIN_RUN.approach).toBeLessThan(PACE_RUN.approach / 2);
    expect(SPIN_RUN.releaseAdvance).toBeLessThan(PACE_RUN.releaseAdvance);
  });

  it('keeps the action that follows the run', () => {
    // Only the approach is a choice. The gather and the delivery stride are the
    // length of a man's legs, so the spinner keeps both — the distance from his
    // back foot landing to the ball leaving is the quick bowler's exactly.
    const paceAction = PACE_RUN.frontFootPlant - PACE_RUN.backFootPlant;
    const spinAction = SPIN_RUN.frontFootPlant - SPIN_RUN.backFootPlant;
    expect(spinAction).toBeCloseTo(paceAction, 9);
  });

  it('releases the ball from the same place', () => {
    // A shorter run moves where he starts, never where he finishes: the ball
    // has to leave from the crease whoever bowled it.
    expect(SPIN_RUN.startZ - SPIN_RUN.releaseAdvance).toBeCloseTo(PACE_RUN.startZ - PACE_RUN.releaseAdvance, 9);
  });
});


describe('which card the innings earns', () => {
  // The four endings are the rules; the five results are what the card says.
  it('names the three endings that speak for themselves', () => {
    expect(resultOf('CHASED', 100, 44)).toBe('WON');
    expect(resultOf('DRAWN', 38, SURVIVE.totalBalls)).toBe('DRAWN');
    expect(resultOf('RETIRED', 12, 9)).toBe('HURT');
  });

  it('splits a loss by how close it came', () => {
    // Twelve short with the field up is not the third ball of the match, and a
    // card that says the same thing about both has stopped watching.
    expect(resultOf('BOWLED_OUT', SURVIVE.target - CLOSE.byRuns, 30)).toBe('ALMOST');
    expect(resultOf('BOWLED_OUT', 4, CLOSE.byBalls)).toBe('ALMOST');
    expect(resultOf('BOWLED_OUT', 4, 6)).toBe('LOST');
  });

  it('holds the line on both edges of close', () => {
    // One run and one ball either side, so neither threshold drifts unnoticed.
    expect(resultOf('BOWLED_OUT', SURVIVE.target - CLOSE.byRuns - 1, 10)).toBe('LOST');
    expect(resultOf('BOWLED_OUT', 10, CLOSE.byBalls - 1)).toBe('LOST');
  });

  it('keeps the hurt card whatever the score', () => {
    // A man carried off twelve short is still a man carried off: telling him he
    // almost did it says nothing about the thing that actually stopped him.
    expect(resultOf('RETIRED', SURVIVE.target - 1, SURVIVE.totalBalls - 1)).toBe('HURT');
  });

  it('gives every result a card and every card a result', () => {
    const seen = new Set([
      resultOf('CHASED', 100, 40), resultOf('DRAWN', 20, 60), resultOf('RETIRED', 20, 20),
      resultOf('BOWLED_OUT', 90, 20), resultOf('BOWLED_OUT', 2, 2),
    ]);
    expect(seen).toEqual(new Set(['WON', 'DRAWN', 'HURT', 'ALMOST', 'LOST']));
  });
});

describe('the square drive in Survive', () => {
  // The rig animates the square drive off ball position alone, with no mode in
  // the question — so the stroke is played in this mode as well as the classic
  // innings. What follows is the other half of that: the ball has to leave on
  // the sector the stroke sends it, and it has to do so without this mode's
  // runs being touched.
  const wideFull = ball('NORMAL', { line: 'OUTSIDE_OFF', finalTargetX: 0.5, bounceZ: 12 });
  const drive = at(0, 'COVER_LONG_OFF');

  it('is tagged, so the ball goes square rather than through cover', () => {
    expect(resolveSurvive(wideFull, drive, rolls(.5)).squared).toBe(true);
  });

  it('is still paid at this mode’s rates, not the classic innings’', () => {
    // Four, not the classic innings' six: `inTheSlot` denies a tailender the
    // maximum off a ball he cannot get to the pitch of. The tag must not have
    // quietly promoted him.
    const outcome = resolveSurvive(wideFull, drive, rolls(.5));
    expect(outcome.runs).toBe(4);
    expect(outcome.madeBatContact).toBe(true);
  });

  it('is never tagged on a ball the bat did not touch', () => {
    // A sector is only meaningful for a ball that was hit. Everything else is
    // placed by `GameScene.hit` regardless, and a tag here would be a lie.
    for (const delta of [0, 60, 140, 260, 400, -60, -140, -260, -400]) {
      const outcome = resolveSurvive(wideFull, at(delta, 'COVER_LONG_OFF'), rolls(.5));
      if (!outcome.madeBatContact) expect(outcome.squared).toBeUndefined();
    }
    expect(resolveSurvive(wideFull, null, rolls(.5)).squared).toBeUndefined();
  });

  it('is not tagged on a ball too straight or too high to drive square', () => {
    expect(resolveSurvive(ball('NORMAL', { line: 'MIDDLE', finalTargetX: 0, bounceZ: 12 }), drive, rolls(.5)).squared).toBeUndefined();
    expect(resolveSurvive(ball('SHORT', { line: 'OUTSIDE_OFF', finalTargetX: 0.5 }), drive, rolls(.5)).squared).toBeUndefined();
  });

  it('is not tagged off any other stroke', () => {
    for (const shot of ['STRAIGHT', 'LEG', 'SQUARE_CUT', 'DEFEND'] as const) {
      expect(resolveSurvive(wideFull, at(0, shot), rolls(.5)).squared).toBeUndefined();
    }
  });

  it('leaves every run, wicket and blow in the mode exactly as they were', () => {
    // The tags are additive and nothing else. Stripping them back off has to give
    // the mode its old answer on every ball it can bowl — which is what makes
    // this safe to put in front of a ladder tuned over twelve thousand innings.
    const seeds = [.05, .3, .5, .8, .97];
    let tagged = 0, balls = 0;
    for (const style of Object.keys(STYLES) as DeliveryStyle[])
      for (const line of ['OUTSIDE_LEG', 'LEG', 'MIDDLE', 'OFF', 'OUTSIDE_OFF'] as const)
        for (const finalTargetX of [-0.5, -0.2, 0, 0.2, 0.5])
          for (const shot of ['STRAIGHT', 'LEG', 'SQUARE_CUT', 'COVER_LONG_OFF', 'DEFEND'] as const)
            for (const delta of [0, 50, 120, 220, 400, -50, -120, -220, -400])
              for (const seed of seeds) {
                const delivery = ball(style, { line, finalTargetX });
                const outcome = resolveSurvive(delivery, at(delta, shot), rolls(seed));
                balls++;
                if (outcome.squared) tagged++;
                // Everything the mode is scored and judged on, untouched.
                const { squared, sweptFlat, ...rest } = outcome;
                expect(rest).toEqual(surviveBall(delivery, at(delta, shot), rolls(seed)));
              }
    // The sweep is meter-gated and this mode has no meter, so it never appears.
    expect(balls).toBeGreaterThan(20000);
    expect(tagged).toBeGreaterThan(0);
  });
});
