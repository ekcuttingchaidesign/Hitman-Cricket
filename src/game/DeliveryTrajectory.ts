import { GAME, LINES, LINE_X } from '../config/gameplay';
import type { BallLine, Delivery } from './types';
const smooth = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
export function effectiveLine(delivery: Delivery): BallLine {
  return LINES.reduce((a, b) => Math.abs(delivery.finalTargetX - LINE_X[a]) <= Math.abs(delivery.finalTargetX - LINE_X[b]) ? a : b);
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/**
 * How much a slower ball holds back off the hand and pays for later. Zero for
 * anything at or above a length ball's pace, so a quick ball is never asked to
 * accelerate down the pitch — only a slow one is floated and only a slow one
 * dies.
 */
export const flightDrag = (durationMs: number) =>
  clamp(GAME.slowBallDrag * (durationMs / GAME.nominalFlightMs - 1), 0, GAME.maxSlowBallDrag);

/**
 * How far down the pitch the ball is `sinceRelease` ms after it left the hand.
 *
 * Not simply the fraction of its flight time, and that is the point. The
 * bowler's action is identical every ball, so the only thing left to read a
 * slower one off is the ball itself — and a ball that crawls out of the hand at
 * two thirds the pace of the last one announces itself in the first frame,
 * which is a whole second before it arrives. There is nothing to be deceived by
 * in that.
 *
 * So a slower ball leaves the hand at very nearly full pace and dies on the way
 * down instead, which is also what a floated one does: the drag it never had
 * the speed to overcome takes the pace off it late. The curve is arranged so
 * `progress` still reaches exactly 1 after exactly `durationMs` — the ball
 * arrives when it always arrived, every timing window is untouched, and what
 * changes is only where it is in between.
 */
export function flightProgress(delivery: Delivery, sinceRelease: number) {
  const u = sinceRelease / delivery.durationMs;
  const drag = flightDrag(delivery.durationMs);
  // Past the bat it carries on at the pace it arrived with, so a beaten ball
  // runs through to the keeper rather than turning round.
  return u <= 1 ? u + drag * u * (1 - u) : 1 + (u - 1) * (1 - drag);
}

export function ballPosition(delivery: Delivery, progress: number) {
  const bounceT = (GAME.releaseZ - delivery.bounceZ) / (GAME.releaseZ - GAME.contactZ);
  const t = Math.max(0, progress);
  const pre = Math.min(1, t / bounceT);
  const post = Math.max(0, (t - bounceT) / (1 - bounceT));
  const spin = delivery.style === 'OFF_SPIN' || delivery.style === 'LEG_SPIN';
  // Spin finishes its turn by this point in the flight — before the final third,
  // so the required key never changes at the last moment. Tying it to the bounce
  // keeps that true whatever length the ball is pitched at.
  const settled = 0.66;
  const movementT = spin ? smooth((t - bounceT) / (settled - bounceT)) : smooth(pre);
  const x = delivery.baseTargetX + (delivery.finalTargetX - delivery.baseTargetX) * movementT;
  // The climb off the pitch is the delivery's length: a yorker barely leaves the
  // ground, a bouncer is at the chest by the time it arrives.
  const rise = delivery.rise;
  const y = t <= bounceT ? 0.09 + 2.05 * (1 - pre) + 0.55 * Math.sin(Math.PI * pre)
    : Math.max(0.09, 0.09 + rise * post - rise * 0.64 * post * post);
  return { x, y, z: GAME.releaseZ - t * (GAME.releaseZ - GAME.contactZ) };
}
export function stumpIntersection(delivery: Delivery) {
  const p = ballPosition(delivery, GAME.releaseZ / (GAME.releaseZ - GAME.contactZ));
  return Math.abs(p.x) <= GAME.stumpZone && p.y <= GAME.stumpHeight;
}
