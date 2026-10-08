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
 * In a Blast or a Rival Match a second card follows it, lighting the confidence
 * meter on the scoreboard; in a Test Survival, whose meter is the injury, it is
 * a card on its own. In a Test Marathon it is the first of that mode's
 * coachmarks, so a player meets one set of cards and not two.
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
 * The hand: an index finger out, the rest curled, drawn twice — dark and a
 * little fatter, then white — so the fingers read as one outlined shape. Its
 * fingertip is the origin, which is where it touches the glass.
 */
const HAND_PARTS = [
  '<rect x="-5" y="-6" width="10" height="34" rx="5"/>',
  '<rect x="4" y="10" width="9.5" height="22" rx="4.75"/>',
  '<rect x="12.5" y="13" width="9" height="19" rx="4.5"/>',
  '<rect x="20.5" y="17" width="8" height="15" rx="4"/>',
  '<rect x="-6" y="22" width="35" height="24" rx="10"/>',
  '<rect x="-17" y="20" width="10" height="22" rx="5" transform="rotate(-40 -12 31)"/>',
  '<rect x="1" y="40" width="24" height="18" rx="4"/>',
].join('');
const HAND = `<g class="hb-ink">${HAND_PARTS}</g><g class="hb-skin">${HAND_PARTS}</g>`
  + '<path class="hb-crease" d="M4.5 22v6M13 25v5M21 27v4"/>';

/**
 * The drawing: an arrow out from the middle to each stroke, its name beyond
 * the tip, and a hand that swipes them in turn — down on the glass in the
 * middle, out along one arrow drawing a green trail behind its fingertip, and
 * off again, the arrow and its name lit as it goes. A left-hander's is the
 * right-hander's mirrored, as his ground is.
 */
export function shotsCompass(left = false): string {
  const label = 80;
  const rays = RAYS.map((ray, i) => {
    const angle = left ? -ray.angle : ray.angle;
    const a = angle * Math.PI / 180, sin = Math.sin(a), cos = Math.cos(a);
    // Out past the tip, and the label hung off that point by its near edge, so
    // a long name runs away from the drawing rather than across it.
    const x = 50 + sin * label / 2, y = 50 - cos * label / 2;
    const tx = sin > 0.3 ? '0' : sin < -0.3 ? '-100%' : '-50%';
    const ty = cos > 0.3 ? '-100%' : cos < -0.3 ? '0' : '-50%';
    return {
      // The hand is turned back upright inside its ray, so it travels along
      // the arrow but is never drawn on its side.
      arrow: `<g class="hb-ray" style="--i:${i}" transform="rotate(${angle})">`
        // A shaft that widens as it goes out, and a solid head.
        + '<path class="hb-shaft" d="M-1 -17L1 -17L3.2 -50L-3.2 -50Z"/>'
        + '<path class="hb-head" d="M-7.5 -50L0 -60.5L7.5 -50Z"/>'
        + '<line class="hb-trail" x1="0" y1="0" x2="0" y2="-50" pathLength="50"/>'
        + `<g class="hb-hand"><g transform="rotate(${-angle})"><circle class="hb-ripple" r="5"/>`
        + `<g class="hb-shadow" transform="translate(3 5) scale(.95)">${HAND_PARTS}</g><g transform="scale(.95)">${HAND}</g></g></g></g>`,
      name: `<span class="hb-label" style="--i:${i};left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;transform:translate(${tx},${ty})">`
        + `<b>${ray.name}</b><kbd class="keyboard-only">${keysFor(angle)}</kbd></span>`,
    };
  });
  // The shafts fade in from the middle: one gradient serves all six, being
  // laid out in each ray's own turned frame.
  return `<span class="hb-compass">`
    + '<svg viewBox="-100 -100 200 200" fill="none" aria-hidden="true"><defs>'
    + '<linearGradient id="hb-fade" gradientUnits="userSpaceOnUse" x1="0" y1="-17" x2="0" y2="-50"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".85"/></linearGradient></defs>'
    + '<circle class="hb-hub" r="3.5"/>'
    + rays.map(r => r.arrow).join('')
    + '</svg>'
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

/**
 * The meter, lit where it sits on the scoreboard with a bar under its name
 * filling and turning gold. Only where that meter is confidence: a Test
 * Survival's slot is the injury meter, and a Marathon tells its own Focus.
 */
export const CONFIDENCE_STEP: IntroStep = {
  title: 'Fill your confidence',
  line: 'Score runs to fill the meter. When it is full, play a special shot',
  art: '',
  spot: 'confidence',
};

const KEY = 'hitman-shots-intro';

/**
 * Whether this browser has batted here before. Anything only a player leaves
 * behind will do: a best score, a career key, the Marathon's cards, or a visit
 * on an earlier day than this one. None of it is proof of a new player — a
 * cleared browser looks new — but these cards, once, cost a returning player a
 * tap or two.
 */
export function playedBefore(read: (key: string) => string | null, day = today()): boolean {
  if (read('hitman-best') !== null || read('hitman-career-key') || read('hitman-marathon-intro')) return true;
  try {
    const visits = JSON.parse(read('hitman-visits') ?? 'null') as { first?: unknown } | null;
    return typeof visits?.first === 'string' && visits.first < day;
  } catch { return false; }
}

/**
 * The cards to show before this innings, which may be none. `meter` says the
 * scoreboard is showing confidence. What has been shown is remembered as
 * 'swipes' or 'done', so a first innings in Test Survival leaves the meter's
 * card for the first Blast. A browser that has batted before is shown
 * nothing, and one that cannot remember is shown nothing either, or it would
 * be shown them every innings.
 */
export function howToDue(meter: boolean, read: (key: string) => string | null = key => localStorage.getItem(key), day = today()): IntroStep[] {
  try {
    const seen = read(KEY);
    if (seen === 'done') return [];
    if (seen) return meter ? [CONFIDENCE_STEP] : [];
    if (playedBefore(read, day)) return [];
    return meter ? [SHOTS_STEP, CONFIDENCE_STEP] : [SHOTS_STEP];
  } catch { return []; }
}

/** What has now been shown, counted when it goes up, like the Marathon's. */
export function noteHowTo(confidence: boolean) {
  try {
    if (confidence) localStorage.setItem(KEY, 'done');
    else if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, 'swipes');
  } catch { /* Nothing to remember it in. */ }
}
