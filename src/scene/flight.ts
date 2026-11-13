import { ADVANCE, FLAT_SWEEP, GAME, HELI, PUNCH, SHOT_ANGLES, SPIN_PULL, SQUARE_DRIVE, SWEEP } from '../config/gameplay.js';
import type { ShotOutcome, ShotType } from '../game/types.js';
import { SPILL_ROLL_MS } from '../game/catch-cam.js';

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
  /**
   * Where in the flight it pitches, for a ball that reaches the rope on the
   * bounce. Zero for everything else, which either carries the whole way or
   * never leaves the ground. A swept four is the one shot that does this: it
   * beats the field in the air, lands, and skids over — one bounce, and the
   * difference between watching a four and watching a six.
   */
  bounceAt: number;
}

/**
 * Which way a struck ball goes, in degrees off straight, the off side
 * positive: the stroke's sector, moved up to eight degrees by the timing — a
 * shade early pulls it round to leg, a shade late pushes it to off.
 *
 * The sweep is hit where the sweep goes — midwicket — rather than out along
 * the sector of the leg-side swipe that played it. The orthodox sweep goes
 * squarer than the slog does: the blade is level and going across the line,
 * so the ball leaves square of the wicket rather than in front of it. The
 * back-foot punch goes through cover, squarer than the drive's sector. The
 * pull off the spinner goes between midwicket and square leg. The charge over
 * cover goes over extra cover, where the stroke sends it, rather than out
 * along the long-off sector the cover input names.
 *
 * The scene draws the ball along it and the Super10 field judges it on it
 * (`src/game/super10-field.ts`), so a ball a fielder is said to have stopped
 * is one the player watched go to him. In Super10 the swipe steers the line
 * inside the stroke's arc (`steer`), and it arrives here as `outcome.angle`.
 */
export function sectorOf(outcome: ShotOutcome, shot: ShotType | undefined): number {
  const sector = outcome.swept ? SWEEP.angle
    : outcome.sweptFlat ? FLAT_SWEEP.angle
    : outcome.advance && shot === 'COVER_LONG_OFF' ? ADVANCE.coverAngle
    : outcome.advance && shot === 'LONG_ON' ? ADVANCE.onAngle
    : outcome.helicopter ? HELI.angle : outcome.squared ? SQUARE_DRIVE.angle : outcome.punched ? PUNCH.angle : outcome.spinPulled ? SPIN_PULL.angle : SHOT_ANGLES[shot ?? 'STRAIGHT'];
  // Steered (Super10), the swipe chose the line inside the stroke's arc.
  return (outcome.angle ?? sector) + Math.max(-8, Math.min(8, (outcome.timingDeltaMs ?? 0) / 28));
}

/** Runs to how far a ball that stayed down runs away from the bat. */
const GROUND_REACH: Record<number, number> = { 0: 5, 1: 10, 2: 19, 3: 26, 4: 44, 6: 52 };

/**
 * Played on: off the inside edge the ball changes direction and goes hard
 * down into the stumps, there in `strikeMs`, where it used to float back onto
 * them over a second. Then it comes off the timber and dies behind them.
 */
export const PLAYED_ON = { strikeMs: 110, height: 0.42 } as const;

/**
 * Where a played-on ball is, `t` through its flight: straight from the bat to
 * the stumps, fast, then off them and away on the turf, slowing.
 */
export function playedOnAt(t: number, flightMs: number, from: { x: number; y: number; z: number }, into: { x: number; y: number; z: number }) {
  const strike = PLAYED_ON.strikeMs / flightMs, side = from.x < 0 ? -1 : 1;
  const hitX = side * 0.05, hitY = Math.min(PLAYED_ON.height, from.y), hitZ = -0.02;
  if (t <= strike) {
    const u = t / strike;
    into.x = from.x + (hitX - from.x) * u; into.y = from.y + (hitY - from.y) * u; into.z = from.z + (hitZ - from.z) * u;
    return into;
  }
  // Off the stumps: knocked on behind and a little to the other side, one low hop, and a roll to a stop.
  const u = (t - strike) / (1 - strike), out = 1 - (1 - u) * (1 - u);
  into.x = hitX - side * 0.32 * out; into.z = hitZ - 1.3 * out;
  into.y = Math.max(0.04, hitY * Math.max(0, 1 - u * 5) + Math.abs(Math.sin(Math.min(1, u * 2.2) * Math.PI)) * 0.1);
  return into;
}

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

  // Hit back at the bowler: flat and quick, into his hands at his chest. The scene fits its end to them.
  if (outcome.returned) return shape(17, 2, 780, 1.3);
  if (outcome.fielder) {
    // To the man who got to it: a six he caught comes down to him high on the
    // rope; anything he stopped runs out to him along the ground and is in his
    // hands a stride short of where he stood. One a boundary rider saves, a
    // few metres off him, slows on the long way out, which gives him the time
    // to run and dive across for it.
    const { distance, how } = outcome.fielder;
    return how === 'caught'
      ? { distance, height: 15, flightMs: hang(outcome), endY: 2, takeAt: 0.9, dropAt: 0, bounceAt: 0 }
      : shape(Math.max(6, distance - 1.2), 0.22, GAME.hitAnimationMs * (how === 'stopped' ? 0.7 : how === 'saved' ? 1.3 : 0.9), 0.1);
  }
  if (outcome.advance) return shape(78, 32, 2200, 0.1);
  if (outcome.swept) {
    // Middled off the knee: over midwicket and into the crowd, flatter and
    // faster than the charge's towering hit. A shade under and it clears the
    // infield, pitches around three-quarters of the way out, and skids over
    // the rope — the same four on the scoreboard, a different ball to watch.
    return outcome.runs === 6
      ? shape(74, 21, 2050, 0.1)
      : { ...shape(GROUND_REACH[4], 7.5, 1650, 0.1), bounceAt: 0.72 };
  }
  if (outcome.scooped && outcome.madeBatContact && !outcome.isWicket && outcome.runs >= 4) {
    // Ramped over the keeper: shorter and lower than a drive's six, because it
    // is the bowler's pace doing the work rather than the bat's. A shade under
    // clears the keeper, lands, and runs away to the rope.
    return outcome.runs === 6
      ? shape(58, 20, 1900, 0.1)
      : { ...shape(GROUND_REACH[4], 6.5, 1600, 0.1), bounceAt: 0.7 };
  }
  if (outcome.hooked && outcome.madeBatContact && !outcome.isWicket && !outcome.hit) {
    // Hooked: met out in front of him and sent back over him to fine leg, so
    // it has to climb from the bat, steeply enough to be over his head by the
    // time it passes him, whatever it is worth. Middled it carries the rope; a
    // shade under it lands inside and runs on; worked round it lobs over him
    // and dies on the bounce.
    if (outcome.runs === 6) return shape(66, 20, 2050, 0.1);
    if (outcome.runs === 4) return { ...shape(GROUND_REACH[4], 11, 1650, 0.1), bounceAt: 0.66 };
    return { ...shape(GROUND_REACH[outcome.runs] ?? 5, 4, 1300, 0.1), bounceAt: 0.4 };
  }
  if (playedOn) {
    // It carries on past the timber rather than stopping dead on it, and that
    // is not decoration: the bails are thrown from the frame the ball reaches
    // the stumps, so a ball that only arrives on the last frame of its flight
    // sets them going with no flight left to run the throw in.
    return shape(1.4, 0.18, 1100, 0.14);
  }
  if (struckBody) return shape(2.4, 0.42, 640, 0.1);
  if (outcome.defended) return shape(1.9, 0.05, 700, 0.1);
  if (outcome.padded) return shape(1.2, 0.1, 560, 0.1);
  if (outcome.edged) return shape(1.6, 0.18, 460, 0.42);
  if (toAFielder && outcome.spilled) {
    // Put down on the rope: it comes down to him as any skier does, then off
    // his hands and on over the rope (`spillTo`), which takes as long again.
    const take = hang(outcome) * 0.86, flightMs = take + SPILL_ROLL_MS;
    return { distance: 19, height: 14, flightMs, endY: 1.5, takeAt: take / flightMs, dropAt: (take + 40) / flightMs, bounceAt: 0 };
  }
  if (toAFielder) {
    // Far enough out to need a fielder, near enough that the take happens where
    // the camera can see it — twenty-seven metres put it half out of frame.
    return {
      distance: 19, height: 14, flightMs: hang(outcome), endY: 1.5,
      takeAt: 0.86, dropAt: outcome.dropped ? 0.88 : 0, bounceAt: 0,
    };
  }
  // In the air and nobody under it: a mishit that cleared the rope, or for a
  // stroke played to keep it down, one that clears the infield, lands well
  // inside and runs away to it.
  if (outcome.aerial) return outcome.runs === 4
    ? { ...shape(GROUND_REACH[4], 11, 1700, 0.1), bounceAt: 0.7 }
    : shape(GROUND_REACH[6], 15, hang(outcome), 0.1);
  if (caught) return shape(18, 5, GAME.hitAnimationMs, 1.5, 0.86);
  const height = outcome.runs === 6 ? 12 : outcome.runs === 4 ? 0.22 : 0.6;
  return shape(GROUND_REACH[outcome.runs] ?? 5, height, GAME.hitAnimationMs, 0.1);
}

/** How long a ball hangs. Survive asks for less than the classic innings gives. */
const hang = (outcome: ShotOutcome) => outcome.hangMs ?? GAME.aerialFlightMs;

const shape = (distance: number, height: number, flightMs: number, endY: number, takeAt = 1): Flight =>
  ({ distance, height, flightMs, endY, takeAt, dropAt: 0, bounceAt: 0 });

/** The boards' radius, round a point ten metres up the pitch from the bat (`perimeterBoards`). */
export const BOARDS = 35.1;
/**
 * How far the boards are from the bat along a line `angle` (radians) off
 * straight: forty-five straight, thirty-three and a half square, twenty-five
 * behind him. A four stops there (`GameScene.hit`).
 */
export function boardsAlong(angle: number) {
  const c = Math.cos(angle);
  return 10 * c + Math.sqrt(100 * c * c - 100 + BOARDS * BOARDS);
}
