import { GAME } from '../config/gameplay.js';
import type { ShotOutcome } from '../game/types.js';

/**
 * What a struck ball does after it leaves the bat, as four numbers and two
 * fractions. No three.js, no scene, no WebGL — which is the point.
 *
 * This used to be four nested ternaries inside `GameScene.hit`, and it was
 * exactly the kind of code that can be quietly wrong for weeks. It was: a
 * condition written for Survive's skied mishit also caught the classic
 * innings' mishit *six*, and shortened a shot that is supposed to clear the
 * rope from fifty-two metres to nineteen. Nothing failed, nothing logged, and
 * no test could have noticed, because the whole decision lived inside a class
 * that cannot be constructed without a browser.
 *
 * Out here it is a pure function of an outcome, so the shapes a ball can take
 * are stated once and checked by `tests/flight.test.ts`.
 */
export interface Flight {
  /** How far from the bat it finishes, in metres. */
  distance: number;
  /** The top of its arc. Zero-ish for anything that stays down. */
  height: number;
  /** How long the whole thing takes. */
  flightMs: number;
  /** How high it finishes: a fielder's hands, or the turf. */
  endY: number;
  /**
   * Where in the flight it reaches whoever is under it. One when nobody is.
   * Short of one otherwise, because an arc that only comes down on the last
   * frame has the fielder closing his hands on a ball still above his head.
   */
  takeAt: number;
  /** Where it is spilled, or zero when it is held or nobody touches it. */
  dropAt: number;
}

/** Runs to how far a ball that stayed down runs away from the bat. */
const GROUND_REACH: Record<number, number> = { 0: 5, 1: 10, 2: 19, 3: 26, 4: 44, 6: 52 };

export function flightOf(outcome: ShotOutcome): Flight {
  const caught = outcome.wicketType === 'CAUGHT';
  /** A ball that hit him rather than the bat: it has spent itself on his body. */
  const struckBody = !!outcome.hit;
  /** The inside edge that comes back off the bat into his own stumps. */
  const playedOn = outcome.wicketType === 'BOWLED' && outcome.madeBatContact;
  /**
   * Skied *to somebody* — held or spilled. Not merely "in the air": a mishit
   * that clears the rope is also in the air, and it is a six, and it has to
   * travel like one. Getting that distinction wrong is what shortened the
   * classic innings' mishit six to a shot that lands inside the ground.
   */
  const toAFielder = (caught || !!outcome.dropped) && outcome.aerial;

  if (outcome.advance) return shape(78, 32, 2200, 0.1);
  if (playedOn) {
    // It carries on past the timber rather than stopping dead on it, and that
    // is not decoration: the bails are thrown from the frame the ball reaches
    // the stumps, so a ball that only arrives on the last frame of its flight
    // sets them going with no flight left to run the throw in.
    return shape(1.4, 0.18, 1100, 0.14);
  }
  if (struckBody) return shape(2.4, 0.42, 640, 0.1);
  if (outcome.defended) return shape(1.9, 0.05, 700, 0.1);
  if (outcome.edged) return shape(1.6, 0.18, 460, 0.42);
  if (toAFielder) {
    // Far enough out to need a fielder, near enough that the take happens where
    // the camera can see it — twenty-seven metres put it half out of frame.
    return {
      distance: 19, height: 14, flightMs: hang(outcome), endY: 1.5,
      takeAt: 0.86, dropAt: outcome.dropped ? 0.88 : 0,
    };
  }
  // In the air and nobody under it: a mishit that cleared the rope.
  if (outcome.aerial) return shape(GROUND_REACH[6], 15, hang(outcome), 0.1);
  if (caught) return shape(18, 5, GAME.hitAnimationMs, 1.5, 0.86);
  const height = outcome.runs === 6 ? 12 : outcome.runs === 4 ? 0.22 : 0.6;
  return shape(GROUND_REACH[outcome.runs] ?? 5, height, GAME.hitAnimationMs, 0.1);
}

/** How long a ball hangs. Survive asks for less than the classic innings gives. */
const hang = (outcome: ShotOutcome) => outcome.hangMs ?? GAME.aerialFlightMs;

const shape = (distance: number, height: number, flightMs: number, endY: number, takeAt = 1): Flight =>
  ({ distance, height, flightMs, endY, takeAt, dropAt: 0 });
