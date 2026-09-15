import { describe, expect, it } from 'vitest';
import { GAME, STYLES as CLASSIC_STYLES } from '../src/config/gameplay';
import { BANDS, DAMAGE, HEALTH, SIX, STYLES, SURVIVE, damageFor } from '../src/config/survive';
import { ballPosition, stumpIntersection } from '../src/game/DeliveryTrajectory';
import { Health } from '../src/game/Health';
import {
  atTheBody, blowSpot, contactOf, endingOf, inTheSlot, outsideOff, resolveSurvive, teamScore, timingSide,
} from '../src/game/Survive';
import type { Delivery, DeliveryStyle } from '../src/game/types';

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
