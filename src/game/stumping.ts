/**
 * A stumping, seen. The wicketkeeper is never drawn in play: the game's
 * camera stands where he squats. So a batter stumped is shown from a camera
 * of its own, cut to live as the catch camera is (`catch-cam.ts`, `Game.catchCam`):
 * side on from square leg, the batter drawn out of his crease and beaten, the
 * keeper squatting up at the stumps, gathering the ball and whipping the bails
 * off, then standing up out of it. Nothing about the ball changes: it was
 * decided at the bat.
 *
 * Everything here is a pure function of the clock, in `tests/stumping.test.ts`;
 * `GameScene.keeperAt` and the beaten ball's branch of `GameScene.result` draw
 * it.
 */
import type { CameraPose } from './ShotReel';

export const STUMPING = {
  /** The ball is in his gloves this share of the way through the dead ball's animation. */
  takeShare: .2,
  /** After the take, a beat to gather it, then the gloves go forward onto the stumps. */
  whipFrom: 40,
  whipMs: 170,
  /** The bails go once the gloves are this far onto the stumps. */
  bailsAt: .85,
  /** Then up out of his crouch. */
  standFrom: 700,
  standMs: 520,
  /** The camera cuts in this soon after the ball beats the bat, and holds this long after the take. */
  cutIn: 60,
  hold: 1350,
  /** How far forward he lunges for the bails, metres, from where he took the ball. */
  lunge: .25,
  /**
   * The batter: drawn this far down the pitch from his guard by the take, and
   * back towards his crease by this much as the bails go — still a long way
   * out of it (`GAME.creaseZ` is a fifth of a metre in front of his guard).
   */
  out: .85,
  back: .2,
} as const;

/**
 * Where the keeper squats up to the spinner, in the game's frame: outside
 * off stump and level with the stumps, as a keeper stands up, so the game's
 * camera behind the stumps sees him in every spinner's over without him ever
 * standing between it and the batter. He moves across to take a ball that
 * beats the bat.
 */
export const KEEPER_UP = { x: .78, z: -.5 } as const;
/**
 * The keeper drawn smaller than the figure he is built on: that figure stands
 * a little taller than the batter, and squatting a metre and a half nearer the
 * game's camera than the batter, at full size he looked the bigger man.
 */
export const KEEPER_SCALE = .84;

const smooth = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };

/**
 * Where the stumping is, `since` milliseconds after the ball beat the bat on
 * a dead ball's animation `flightMs` long: when the ball is in his gloves,
 * how far the gloves have gone onto the stumps, how far he has stood up, and
 * whether the bails have gone.
 */
export function stumpingAt(since: number, flightMs: number) {
  const take = flightMs * STUMPING.takeShare;
  const whip = smooth((since - take - STUMPING.whipFrom) / STUMPING.whipMs);
  const rise = smooth((since - take - STUMPING.standFrom) / STUMPING.standMs);
  return { take, whip, rise, bails: whip >= STUMPING.bailsAt };
}

/**
 * The camera: square leg, at a crouching umpire's height, looking across the
 * stumps, so the batter out of his crease and the keeper behind the timber
 * are both in a phone's upright picture, the one either side of the stumps.
 * In the game's frame: the leg side is negative, the bowler's end ahead.
 */
export const STUMPING_CAMERA: CameraPose = { eye: [-11.5, 1.6, .45], at: [.1, 1, .45], fov: 46 };
