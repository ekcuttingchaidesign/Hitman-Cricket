/**
 * The new ground, shown off once.
 *
 * The graphics update changed the sky, the turf, the boards, the kit and the
 * scoreboard, and a player who had batted on the old ground would otherwise
 * notice it as "something looks different" rather than as a thing done for
 * them. So the first innings chosen — any mode, from the picker, a link or a
 * Rivals room — puts the old ground up first, full screen, with a line down its
 * right edge, and the player drags that line across to pull the old ground off
 * and find the new one under it. Then they bat, on it.
 *
 * Once per browser, counted when the covers actually come off rather than when
 * the screen goes up: a player who reloads halfway through a swipe has not
 * seen the new ground yet, and the whole of this is the seeing.
 */

/**
 * Which reveal this is. In the key, so a later update that wants its own
 * before-and-after is a new key and shows itself to everybody again.
 */
export const REVEAL = 'ground-pavilion';

const KEY = 'hitman-unveiled';

/** Whether this browser still has the old ground to pull off. */
export function unveilDue(): boolean {
  try {
    return localStorage.getItem(KEY) !== REVEAL;
  } catch {
    // No storage, and so no way to remember it was seen: asking every visit
    // would be a swipe in front of every innings, so it is not asked at all.
    return false;
  }
}

export function markUnveiled() {
  try { localStorage.setItem(KEY, REVEAL); } catch { /* Then it was never due. */ }
}

/**
 * Where the line rests before it is touched, as a fraction of the width from
 * the left: far enough in that a strip of the new ground shows past it, which
 * is the tease, and far enough from the edge that a thumb can find the grip.
 */
export const REST = 0.84;

/**
 * Past this, a let-go finishes the reveal; short of it, the line springs back.
 * Under half, because by then more new ground is showing than old.
 */
export const COMMIT = 0.5;

/** A flick this fast to the left (widths a second) finishes it wherever it is. */
export const FLICK = 1.2;

/**
 * Where a let-go leaves the line: finished, or back at rest.
 *
 * `at` is the line's place as a fraction of the width, `speed` how fast it was
 * moving when the finger came off, in widths a second, negative to the left.
 */
export function settle(at: number, speed: number): 'open' | 'rest' {
  if (at <= COMMIT) return 'open';
  if (speed <= -FLICK && at < REST) return 'open';
  return 'rest';
}
