import { GAME, LINES, LINE_X } from '../config/gameplay';
import type { BallLine, Delivery } from './types';
const smooth = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
export function effectiveLine(delivery: Delivery): BallLine {
  return LINES.reduce((a, b) => Math.abs(delivery.finalTargetX - LINE_X[a]) <= Math.abs(delivery.finalTargetX - LINE_X[b]) ? a : b);
}
export function ballPosition(delivery: Delivery, progress: number) {
  const bounceT = (GAME.releaseZ - delivery.bounceZ) / (GAME.releaseZ - GAME.contactZ);
  const t = Math.max(0, progress);
  const pre = Math.min(1, t / bounceT);
  const post = Math.max(0, (t - bounceT) / (1 - bounceT));
  const spin = delivery.style === 'OFF_SPIN' || delivery.style === 'LEG_SPIN';
  // Spin finishes its turn before the final third; no last-moment required-key changes.
  const movementT = spin ? smooth((t - bounceT) / 0.09) : smooth(pre);
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
