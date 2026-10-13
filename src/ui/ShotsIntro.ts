import type { IntroStep } from './MarathonIntro';
import { today } from '../game/visits';

/**
 * How to hit, the first time somebody bats: one coachmark over the ground
 * before the first ball (Figma 128:4759) — the ground dimmed, the card at the
 * foot, and the bowler held at his mark until it is put away.
 *
 * The drawing is five lanes of light fanned out from the bat, one a stroke,
 * each with its name at the far end, and a thumb swiping below: the lane it
 * plays lights up in the game's colour, then the next, so the eye is walked
 * round the lot. The block is the caption on the left — a swipe down — and the
 * lit lane's swipe is the one on the right. On a keyboard each carries its key
 * instead of leaving the thumb to be translated. The scoops are left off: they
 * exist only on a full meter, and the swipe guide over the pitch says where
 * they are when they do.
 *
 * In a Blast or a Rival Match a second card follows it, lighting the confidence
 * meter on the scoreboard; in a Test Survival, whose meter is the injury, it is
 * a card on its own. In a Test Marathon it is the first of that mode's
 * coachmarks, so a player meets one set of cards and not two.
 */

/** A lane, as it lies on the screen for a right-hander. */
interface Lane {
  /** The stroke it plays. */
  name: string;
  /** Degrees clockwise from straight up. */
  angle: number;
  /** Its two far corners, in design pixels from the bat (Figma's lane vectors). */
  far: readonly [number, number, number, number];
  /** Where its name stands, in design pixels from the bat. */
  label: readonly [number, number];
}

// Leg side to off, as on the drawing. The corners are the design's own, its
// lanes being triangles with their point at the bat.
const LANES: readonly Lane[] = [
  { name: 'Pull', angle: -90, far: [-221.6, 5.9, -218.4, -37.9], label: [-176, -15] },
  { name: 'On drive', angle: -45, far: [-184.6, -133.5, -155.4, -166.5], label: [-147, -130] },
  { name: 'Straight drive', angle: 0, far: [-34, -210, 34, -210], label: [0, -181] },
  { name: 'Cover drive', angle: 45, far: [184.6, -133.5, 155.4, -166.5], label: [136, -130] },
  { name: 'Cut', angle: 90, far: [221.6, 5.9, 218.4, -37.9], label: [157, -15] },
];
/** The order the light goes round them: straight first, as drawn, then the off side, then the leg. */
export const LANE_ORDER: readonly number[] = [2, 3, 4, 0, 1];

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

/** The swipe for a direction on the screen, in words. */
function swipeFor(angle: number): string {
  const a = Math.round(angle);
  if (a === 0) return 'Swipe up';
  if (a === 90) return 'Swipe right';
  if (a === -90) return 'Swipe left';
  return a > 0 ? 'Swipe up-right' : 'Swipe up-left';
}

/** One lane as it stands for this batter: mirrored for a left-hander, as his ground is. */
export function laneFor(index: number, left = false) {
  const lane = LANES[index];
  const flip = left ? -1 : 1;
  const [x1, y1, x2, y2] = lane.far;
  return {
    name: lane.name,
    angle: lane.angle * flip,
    far: [x1 * flip, y1, x2 * flip, y2] as const,
    label: [lane.label[0] * flip, lane.label[1]] as const,
    keys: keysFor(lane.angle * flip),
    swipe: swipeFor(lane.angle * flip),
  };
}

/** A caption's words: the swipe on a touch screen, the key on a keyboard. */
export function captionMarkup(swipe: string, keys: string, stroke: string): string {
  return `<b class="touch-only">${swipe}</b><b class="keyboard-only">${keys}</b><span>=&nbsp;&nbsp;${stroke}</span>`;
}

/**
 * The drawing, set down at the bat: `--x` and `--y` on the overlay say where
 * that is. Five lanes, the names at their ends, the point of contact, the
 * thumb with its trail and the two ghosts it left, and the captions under it.
 * Which lane is lit is `data-lit` on the fan, walked round by the HUD.
 */
export function shotsCompass(left = false): string {
  const lanes = LANES.map((_, i) => laneFor(i, left));
  const paths = lanes.map((lane, i) => {
    const d = `M0 0L${lane.far[0]} ${lane.far[1]}L${lane.far[2]} ${lane.far[3]}Z`;
    return `<path class="hb-lane" data-i="${i}" d="${d}" fill="url(#hb-lane)"/><path class="hb-lane is-lit" data-i="${i}" d="${d}" fill="url(#hb-lane-lit)"/>`;
  }).join('');
  const names = lanes.map((lane, i) => `<span class="hb-label" data-i="${i}" style="--dx:${lane.label[0]};--dy:${lane.label[1]}">`
    + `<b>${lane.name}</b><kbd class="keyboard-only">${lane.keys}</kbd></span>`).join('');
  const lit = lanes[LANE_ORDER[0]];
  return `<span class="hb-fan" data-lit="${LANE_ORDER[0]}">`
    // Each lane's light is an ellipse over its own bounds, brightest in the
    // middle (the design's radial fill), white or in the game's colour.
    + '<svg class="hb-lanes" viewBox="-240 -240 480 480" aria-hidden="true"><defs>'
    + '<radialGradient id="hb-lane"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity=".02"/></radialGradient>'
    + '<radialGradient id="hb-lane-lit"><stop offset="0" style="stop-color:var(--mi-tone)" stop-opacity=".7"/><stop offset="1" style="stop-color:var(--mi-tone)" stop-opacity=".02"/></radialGradient>'
    + `</defs>${paths}<circle class="hb-contact" r="5.5"/></svg>`
    + names
    + `<span class="hb-swipe" style="--a:${lit.angle}deg" aria-hidden="true"><i class="hb-trail"></i><i class="hb-ghost"></i><i class="hb-ghost is-near"></i><i class="hb-thumb"></i></span>`
    + `<span class="hb-caption is-block">${captionMarkup('Swipe down', 'S', 'block')}</span>`
    + `<span class="hb-caption is-lane">${captionMarkup(lit.swipe, lit.keys, lit.name.toLowerCase())}</span>`
    + `</span>`;
}

/** The card. Its drawing is `shotsCompass`, drawn when the card goes up and the batter's hand is known. */
export const SHOTS_STEP: IntroStep = {
  title: 'Swipe to hit',
  line: '<span class="touch-only">Swipe the way you want the ball to go, just as it reaches the bat.</span>'
    + '<span class="keyboard-only">Press the way you want the ball to go, just as it reaches the bat.</span>',
  shots: true,
};

/** Test Survival's, which has no meter to tell and says what it is to win (Figma 133:12413). */
export const SURVIVE_SHOTS_STEP: IntroStep = {
  ...SHOTS_STEP,
  line: '<span class="touch-only">Swipe the way you want the ball to go, just as it reaches the bat. Chase the target, or survive every ball for the draw.</span>'
    + '<span class="keyboard-only">Press the way you want the ball to go, just as it reaches the bat. Chase the target, or survive every ball for the draw.</span>',
};

/**
 * The meter, outlined where it sits on the scoreboard. Only where that meter
 * is confidence: a Test Survival's slot is the injury meter, and a Marathon
 * tells its own Focus.
 */
export const CONFIDENCE_STEP: IntroStep = {
  title: 'Fill your confidence',
  line: 'Score runs to fill the meter. When it’s full, play a special shot.',
  spot: 'confidence',
  tag: 'Confidence meter',
};

const KEY = 'hitman-shots-intro';

/**
 * Whether this browser has batted here before. Anything only a player leaves
 * behind will do: a best score, the Marathon's cards, or a visit on an earlier
 * day than this one. None of it is proof of a new player — a cleared browser
 * looks new — but these cards, once, cost a returning player a tap or two.
 *
 * Not the career key. It used to be something only a player who had batted
 * could hold, but the name asked before the first innings is claimed with one,
 * so every new player now has a key before their first ball — and was shown
 * nothing.
 */
export function playedBefore(read: (key: string) => string | null, day = today()): boolean {
  if (read('hitman-best') !== null || read('hitman-marathon-intro')) return true;
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
    return meter ? [SHOTS_STEP, CONFIDENCE_STEP] : [SURVIVE_SHOTS_STEP];
  } catch { return []; }
}

/** What has now been shown, counted when it goes up, like the Marathon's. */
export function noteHowTo(confidence: boolean) {
  try {
    if (confidence) localStorage.setItem(KEY, 'done');
    else if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, 'swipes');
  } catch { /* Nothing to remember it in. */ }
}
