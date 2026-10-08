import type { IntroStep } from './MarathonIntro';
import { today } from '../game/visits';

/**
 * How to hit, the first time somebody bats: one coachmark over the ground
 * before the first ball, in the Marathon's look — the screen dimmed, a line
 * drawing, a few words, and the bowler held at his mark until it is put away.
 *
 * The drawing is the six ways a thumb can go from where it lands, each an
 * arrow with the stroke it plays at its tip, and a streak of green running out
 * along them one after another so the eye is walked round the lot. On a
 * keyboard each carries its key instead of leaving the thumb to be translated.
 * The scoops are left off: they exist only on a full meter, and the swipe
 * guide over the pitch says where they are when they do.
 *
 * In a Blast, a Test Survival or a Rival Match it is a card on its own. In a
 * Test Marathon it is the first of that mode's coachmarks, so a player meets
 * one set of cards and not two.
 */

/** A direction a thumb can go, as it lies on the screen for a right-hander. */
interface Ray {
  /** The stroke it plays. */
  name: string;
  /** Degrees clockwise from straight up. */
  angle: number;
}

// In the order the streak goes round them: leg side to off, then the block.
const RAYS: readonly Ray[] = [
  { name: 'Pull', angle: -90 },
  { name: 'On drive', angle: -45 },
  { name: 'Straight drive', angle: 0 },
  { name: 'Cover drive', angle: 45 },
  { name: 'Cut', angle: 90 },
  { name: 'Block', angle: 180 },
];

/**
 * The key for a direction on the screen. Keys go by the side of the screen
 * they sit on, not by the stroke: a left-hander's keys are swapped with his
 * ground (`mirrorKey`), so the left arrow still plays whatever is on the left.
 */
function keysFor(angle: number): string {
  const a = Math.round(angle);
  if (a === 0) return 'W';
  if (a === 180 || a === -180) return 'S';
  if (a === 90) return 'D';
  if (a === -90) return 'A';
  return a > 0 ? 'W+D' : 'A+W';
}

/**
 * The drawing: the hub where the thumb lands, an arrow out to each stroke, and
 * the strokes' names beyond the tips. A left-hander's is the right-hander's
 * mirrored, as his ground is.
 */
export function shotsCompass(left = false): string {
  const from = 20, to = 62, label = 72;
  const rays = RAYS.map((ray, i) => {
    const angle = left ? -ray.angle : ray.angle;
    const a = angle * Math.PI / 180, sin = Math.sin(a), cos = Math.cos(a);
    // Out past the tip, and the label hung off that point by its near edge, so
    // a long name runs away from the drawing rather than across it.
    const x = 50 + sin * label / 2, y = 50 - cos * label / 2;
    const tx = sin > 0.3 ? '0' : sin < -0.3 ? '-100%' : '-50%';
    const ty = cos > 0.3 ? '-100%' : cos < -0.3 ? '0' : '-50%';
    return {
      arrow: `<g class="hb-ray" style="--i:${i}" transform="rotate(${angle})">`
        + `<line class="hb-shaft" x1="0" y1="${-from}" x2="0" y2="${-to}"/>`
        + `<line class="hb-run" x1="0" y1="${-from}" x2="0" y2="${-to}"/>`
        + `<path class="hb-head" d="M-6 ${-to + 7}L0 ${-to}L6 ${-to + 7}"/></g>`,
      name: `<span class="hb-label" style="--i:${i};left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;transform:translate(${tx},${ty})">`
        + `<b>${ray.name}</b><kbd class="keyboard-only">${keysFor(angle)}</kbd></span>`,
    };
  });
  return `<span class="hb-compass">`
    + `<svg viewBox="-100 -100 200 200" fill="none" aria-hidden="true">${rays.map(r => r.arrow).join('')}`
    + `<circle class="hb-ring" r="9"/><circle class="hb-hub" r="5"/></svg>`
    + rays.map(r => r.name).join('')
    + `</span>`;
}

/** The card. Its drawing is `shotsCompass`, drawn when the card goes up and the batter's hand is known. */
export const SHOTS_STEP: IntroStep = {
  title: 'Swipe to hit',
  line: '<span class="touch-only">Swipe the way you want the ball to go, as it reaches the bat</span>'
    + '<span class="keyboard-only">Press the way you want the ball to go, as it reaches the bat</span>',
  art: '',
  shots: true,
};

const KEY = 'hitman-shots-intro';

/**
 * Whether this browser has batted here before. Anything only a player leaves
 * behind will do: a best score, a career key, the Marathon's cards, or a visit
 * on an earlier day than this one. None of it is proof of a new player — a
 * cleared browser looks new — but a card on how to swipe, once, costs a
 * returning player one tap.
 */
export function playedBefore(read: (key: string) => string | null, day = today()): boolean {
  if (read('hitman-best') !== null || read('hitman-career-key') || read('hitman-marathon-intro')) return true;
  try {
    const visits = JSON.parse(read('hitman-visits') ?? 'null') as { first?: unknown } | null;
    return typeof visits?.first === 'string' && visits.first < day;
  } catch { return false; }
}

/**
 * Whether to show how to hit before this innings: never shown here before, and
 * nothing to say this browser has batted. A browser that cannot remember is
 * not shown it, or it would be shown it every innings.
 */
export function shotsDue(read: (key: string) => string | null = key => localStorage.getItem(key), day = today()): boolean {
  try {
    if (read(KEY)) return false;
    return !playedBefore(read, day);
  } catch { return false; }
}

/** Shown once, so not again: counted when it goes up, like the Marathon's. */
export function noteShots() {
  try { localStorage.setItem(KEY, 'done'); } catch { /* Nothing to remember it in. */ }
}
