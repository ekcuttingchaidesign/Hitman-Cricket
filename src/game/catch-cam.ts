/**
 * The catch camera: a ball skied to somebody is watched live from a camera
 * of its own, from a moment after the bat to a moment after it comes down —
 * held, put down, or put down and run on to the rope. Nothing about the ball
 * changes: it was decided at the bat, as every ball is, and the camera only
 * goes with it. It stands in for a replay of a catch, which there is none of.
 *
 * Every rule here is a pure function of the ball and the clock, in
 * `tests/catch-cam.test.ts`; `Game.catchCam` plays it and `GameScene`
 * draws it.
 */
import type { CameraPose } from './ShotReel';
import type { ShotOutcome } from './types';
import { ropeAt } from './replay';

type Vec = readonly [number, number, number];

/**
 * A catch held, one put down where he stands, one put down that runs on to
 * the rope for four, and Super10's ball a boundary rider cut off or saved out
 * of the game's picture — a sweep or a pull fielded in the deep — followed to
 * him (`Game.catchShot`).
 */
export type CatchShot = 'catch' | 'drop' | 'spill' | 'field';

/**
 * Which balls it goes with: one skied off the bat to a fielder, caught or put
 * down. Not an edge to the keeper, nor a ball off the body: neither goes up
 * to anybody. A ball caught flat in the ring is in the game's own picture
 * and over before a camera could cut to it, so only one that goes up.
 */
export function catchShotOf(outcome: ShotOutcome): CatchShot | null {
  if (!outcome.madeBatContact || !outcome.aerial || outcome.edged || outcome.hit || outcome.advance) return null;
  if (outcome.isWicket) return outcome.wicketType === 'CAUGHT' ? 'catch' : null;
  if (outcome.dropped) return outcome.spilled ? 'spill' : 'drop';
  return null;
}

/**
 * A skier that fell safe for four — a stroke played to keep it down that went
 * up anyway, or one reached for — which may be shown as put down by a man on
 * the rope and running on over it. Its four is the four it was: only the
 * picture changes. The sweeps, the scoops and the hook have flights of their
 * own and are left to them.
 */
export function spillable(outcome: ShotOutcome) {
  return outcome.madeBatContact && outcome.aerial && !outcome.isWicket && !outcome.dropped && outcome.runs === 4
    && !outcome.edged && !outcome.hit && !outcome.advance && !outcome.fielder
    && !outcome.swept && !outcome.sweptFlat && !outcome.scooped && !outcome.hooked;
}
/** How often a ball that can be is shown put down: half of a rare thing. */
export const SPILL_ODDS = .5;
/** How long a spilled ball takes from his hands to over the rope. */
export const SPILL_ROLL_MS = 1500;
/** The share of that it spends falling off his hands to the turf, before it runs on. */
export const SPILL_FALL = .16;

/** After the bat, the game's own picture, so the stroke and the ball going up are seen as they always were. */
export const CATCH_CUT_IN = 280;
/** After the take, held on him with it (or on the ball on the turf) before the cut back. */
export const CATCH_HOLD = 750;
/** Nearer than this the figures do not hold up: the man under it is never more than a quarter of the picture. */
export const CATCH_MIN_FRAME = 10;

/** Slowed through the take, and back to full speed either side, as the replay slows through contact. */
export const CATCH_SLOW = { pace: .45, inFrom: -650, inTo: -300, outFrom: 200, outTo: 520 } as const;
export function catchPace(sinceTake: number) {
  const ease = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
  const into = ease((sinceTake - CATCH_SLOW.inFrom) / (CATCH_SLOW.inTo - CATCH_SLOW.inFrom));
  const out = ease((sinceTake - CATCH_SLOW.outFrom) / (CATCH_SLOW.outTo - CATCH_SLOW.outFrom));
  return 1 - (1 - CATCH_SLOW.pace) * into * (1 - out);
}

/** When it cuts in, slows round and hands back, from when the bat met it, the take and the end of the flight. */
export function catchTimes(shot: CatchShot, contact: number, take: number, flightEnd: number) {
  return { cut: contact + CATCH_CUT_IN, take, until: shot === 'spill' ? flightEnd + 250 : take + CATCH_HOLD };
}

/**
 * Where a spilled ball goes once it is off his hands: on along the line it
 * came, over the rope there.
 */
export function spillTo(hands: Vec): Vec {
  const length = Math.hypot(hands[0], hands[2]) || 1, dx = hands[0] / length, dz = hands[2] / length;
  const rope = ropeAt(dx, dz) + 1.5;
  return [dx * rope, .12, dz * rope];
}

/**
 * The camera: up behind the bat, a little off the line the ball went, looking
 * down it at the ball and the man under it together. Zoomed on the two of
 * them, so it starts wide — the ball climbing, him getting there — and closes
 * in as it comes down into his hands, never nearer than `CATCH_MIN_FRAME`. A
 * spilled ball running away from him widens it again. Off the line to the
 * bowler's side, so a portrait picture has the ball above him rather than
 * beside him, and he faces it as he faces the ball.
 */
export function catchCamera(hands: Vec, ball: Vec | null): CameraPose {
  const length = Math.hypot(hands[0], hands[2]) || 1, dx = hands[0] / length, dz = hands[2] / length;
  let px = dz, pz = -dx;
  if (pz < 0) { px = -px; pz = -pz; }
  const eye: Vec = [-dx * 9 + px * 5, 7, -dz * 9 + pz * 5];
  const him: Vec = [hands[0], Math.max(hands[1], 1), hands[2]];
  const b = ball ?? him;
  const at: Vec = [(b[0] + him[0]) / 2, (b[1] + him[1]) / 2, (b[2] + him[2]) / 2];
  const spread = Math.hypot(b[0] - him[0], b[1] - him[1], b[2] - him[2]);
  const away = Math.hypot(at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]);
  const frame = Math.max(CATCH_MIN_FRAME, spread * 1.2 + 4);
  const fov = Math.min(55, Math.max(8, 2 * Math.atan(frame / 2 / away) * 180 / Math.PI));
  return { eye, at, fov };
}
