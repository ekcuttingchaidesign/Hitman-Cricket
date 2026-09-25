import { describe, expect, it } from 'vitest';
import { GAME } from '../src/config/gameplay';
import { SURVIVE } from '../src/config/survive';
import { flightOf } from '../src/scene/flight';
import type { ShotOutcome, WicketType } from '../src/game/types';

/**
 * What a ball does after it leaves the bat used to be decided inside a class
 * that cannot be built without WebGL, which is why a real regression sat in it
 * unnoticed: a condition written for Survive's skied mishit also caught the
 * classic innings' mishit six and shortened a shot meant to clear the rope from
 * fifty-two metres to nineteen. These are the shapes, stated once.
 */
function outcome(over: Partial<ShotOutcome> = {}): ShotOutcome {
  return {
    runs: 0, isWicket: false, quality: 0, feedback: '', timingGrade: 'GOOD',
    timingDeltaMs: 0, compatibility: 1, madeBatContact: true, aerial: false, ...over,
  };
}
const out = (wicketType: WicketType, over: Partial<ShotOutcome> = {}) =>
  outcome({ isWicket: true, wicketType, ...over });

describe('a ball that stays down', () => {
  it('runs further the more it is worth', () => {
    const reach = (runs: ShotOutcome['runs']) => flightOf(outcome({ runs })).distance;
    expect(reach(0)).toBeLessThan(reach(1));
    expect(reach(1)).toBeLessThan(reach(2));
    expect(reach(2)).toBeLessThan(reach(4));
    expect(reach(4)).toBeLessThan(reach(6));
  });

  it('keeps a four along the turf and lifts a six over it', () => {
    expect(flightOf(outcome({ runs: 4 })).height).toBeLessThan(1);
    expect(flightOf(outcome({ runs: 6 })).height).toBeGreaterThan(10);
  });
});

describe('a ball in the air', () => {
  it('still clears the rope when it is a six, in either innings', () => {
    // The regression. A mishit that is not caught is a six in the classic
    // innings, and a six has to land outside the ground: nineteen metres is a
    // shot that pitches in front of the sponsor's boards.
    const six = flightOf(outcome({ aerial: true, runs: 6 }));
    expect(six.distance).toBe(flightOf(outcome({ runs: 6 })).distance);
    expect(six.distance).toBeGreaterThan(40);
    expect(six.height).toBeGreaterThan(12);
    // And nobody is under it, so nothing reaches for it.
    expect(six.takeAt).toBe(1);
    expect(six.dropAt).toBe(0);
  });

  it('goes out to a fielder when somebody is under it', () => {
    const held = flightOf(out('CAUGHT', { aerial: true }));
    expect(held.distance).toBeGreaterThan(15);
    expect(held.height).toBeGreaterThan(10);
    expect(held.endY).toBeGreaterThan(1);
  });

  it('arrives in his hands before the flight is over, not on the last frame', () => {
    // The fielder's hands close at 0.86 of the flight. An arc that only comes
    // down at 1 has him catching a ball still metres above his head.
    expect(flightOf(out('CAUGHT', { aerial: true })).takeAt).toBeLessThan(0.9);
    expect(flightOf(outcome({ aerial: true, dropped: true })).takeAt).toBeLessThan(0.9);
  });

  it('is spilled only when it was put down, and only after the take', () => {
    const spilled = flightOf(outcome({ aerial: true, dropped: true }));
    expect(spilled.dropAt).toBeGreaterThan(spilled.takeAt);
    expect(flightOf(out('CAUGHT', { aerial: true })).dropAt).toBe(0);
  });

  it('hangs for less time in Survive than in the classic innings', () => {
    expect(flightOf(out('CAUGHT', { aerial: true })).flightMs).toBe(GAME.aerialFlightMs);
    expect(flightOf(out('CAUGHT', { aerial: true, hangMs: SURVIVE.hangMs })).flightMs).toBe(SURVIVE.hangMs);
  });
});

describe('played on', () => {
  /**
   * The bails are thrown from the frame the ball reaches the stumps, and the
   * throw itself runs for 620ms. The first version of this had the ball arrive
   * on the very last frame of a 430ms flight, so the bails were released with
   * no flight left to move in and the stumps simply stood there while the call
   * said he was bowled.
   */
  const BAIL_THROW_MS = 620;
  const CONTACT_Z = GAME.contactZ;

  it('reaches the stumps with the whole bail throw still to come', () => {
    const flight = flightOf(out('BOWLED', { madeBatContact: true }));
    // It finishes behind the stumps, so it crosses them partway through.
    const endZ = -1.5;
    const crossing = CONTACT_Z / (CONTACT_Z - endZ);
    const left = flight.flightMs * (1 - crossing);
    expect(crossing).toBeLessThan(0.6);
    expect(left).toBeGreaterThanOrEqual(BAIL_THROW_MS * 0.9);
  });

  it('stays low and quick, not a shot into the field', () => {
    const flight = flightOf(out('BOWLED', { madeBatContact: true }));
    expect(flight.height).toBeLessThan(0.5);
    expect(flight.distance).toBeLessThan(3);
  });

  it('is not confused with being beaten all ends up', () => {
    // No bat on it is the classic innings' bowled, which the scene draws by
    // carrying the delivery on rather than by striking a new flight.
    expect(flightOf(out('BOWLED', { madeBatContact: false })).distance)
      .not.toBe(flightOf(out('BOWLED', { madeBatContact: true })).distance);
  });
});

describe('a ball that hit the batter', () => {
  it('drops at his feet rather than carrying through to the keeper', () => {
    const flight = flightOf(outcome({ hit: { where: 'RIBS', damage: 20 }, madeBatContact: false }));
    expect(flight.distance).toBeLessThan(3);
    expect(flight.endY).toBeLessThan(0.3);
    expect(flight.flightMs).toBeLessThan(GAME.hitAnimationMs);
  });
});

describe('the strokes that are placed rather than struck', () => {
  it('drops a defended ball dead in front of him', () => {
    expect(flightOf(outcome({ defended: true })).distance).toBeLessThan(2.5);
  });

  it('sends the charge out of the ground', () => {
    const flight = flightOf(outcome({ advance: true, runs: 6 }));
    expect(flight.distance).toBeGreaterThan(70);
    expect(flight.height).toBeGreaterThan(30);
  });

  it('ramps a scoop over the keeper, and lands the four before the rope', () => {
    const six = flightOf(outcome({ scooped: true, runs: 6, madeBatContact: true }));
    expect(six.distance).toBeGreaterThan(52); expect(six.height).toBeGreaterThan(15); expect(six.bounceAt).toBe(0);
    const four = flightOf(outcome({ scooped: true, runs: 4, madeBatContact: true }));
    expect(four.bounceAt).toBeGreaterThan(0); expect(four.distance).toBe(44);
    // Held back it runs away along the turf like any other single.
    expect(flightOf(outcome({ scooped: true, runs: 2, madeBatContact: true })).height).toBeLessThan(1);
    // Top-edged to the keeper it is the edge's short drop, not a stroke.
    expect(flightOf(outcome({ scooped: true, runs: 0, madeBatContact: true, edged: true, isWicket: true, wicketType: 'CAUGHT' })).distance).toBeLessThan(2);
  });
  it('sends a middled slog sweep flat into the crowd', () => {
    const flight = flightOf(outcome({ swept: true, runs: 6 }));
    expect(flight.distance).toBeGreaterThan(70);
    // Flatter and faster than the charge's towering hit, which is the whole
    // difference between the two special strokes to watch.
    expect(flight.height).toBeLessThan(flightOf(outcome({ advance: true, runs: 6 })).height);
    expect(flight.bounceAt).toBe(0);
  });

  it('bounces a swept four in before the rope', () => {
    const flight = flightOf(outcome({ swept: true, runs: 4 }));
    // It pitches once, three-quarters of the way out, and skids over: a four on
    // the scoreboard and a different ball to watch.
    expect(flight.bounceAt).toBeGreaterThan(0.5);
    expect(flight.bounceAt).toBeLessThan(1);
    // In the air long enough to clear the infield first.
    expect(flight.height).toBeGreaterThan(5);
    expect(flight.distance).toBeGreaterThan(40);
  });

  it('leaves every other ball with one arc and no pitch', () => {
    for (const shape of [outcome({ runs: 4 }), outcome({ runs: 6 }), outcome({ advance: true, runs: 6 }),
      outcome({ defended: true, runs: 0 }), outcome({ edged: true, runs: 1 }), out('CAUGHT')])
      expect(flightOf(shape).bounceAt, JSON.stringify(shape)).toBe(0);
  });

  it('has an edge reach the keeper before the stroke is finished', () => {
    const flight = flightOf(out('CAUGHT', { edged: true }));
    expect(flight.flightMs).toBeLessThan(600);
    expect(flight.height).toBeLessThan(0.5);
  });
});
