/**
 * The cover drive on its own, for reworking it: the game's `Batter`, a right-
 * hander, playing the one stroke against a ball that comes down the pitch, is
 * met at the red marker and goes off through the covers. Beside it, the other
 * stroke played off the same input: the charge over cover, the special one,
 * down the pitch at a ball on the stumps and over extra cover for six.
 *
 * The rig is authored in a frame where he bats left-handed; `GameScene` mirrors
 * the stage to make him right-handed, and this does the same (`world`), so what
 * is seen here is what a player sees. `shot-preview.ts` does not, which is why
 * every stroke there is a left-hander's.
 *
 * Isolated from `Game` like that page: nothing is scored, sent or counted.
 * `scripts/cover-drive-artifact.mjs` bundles it into one HTML file.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Batter, type CoverVersion, COVER_V3_MEETS_AT, PULL_CONTACT_MS, SLOG_CLOCK, SLOG_HOLD_MS, SLOG_MEETS_AT, SWEEP_CONTACT_MS, ON_DRIVE_MEETS_AT, CHARGE_CLOCK, CHARGE_CONTACT_MS, CHARGE_MEETS_AT, HOOK_CONTACT_MS, HOOK_HOLD_MS, HOOK_LOAD_MS, HOOK_MEETS_AT, LOFT_V2_CLOCK, REVERSE_CLOCK, SCOOP_CLOCK, LATE_CUT_CONTACT_MS, LATE_CUT_LOAD_MS, LATE_CUT_MEETS_AT, SPIN_CUT_CONTACT_MS, SPIN_CUT_HOLD_MS, SPIN_CUT_LOAD_MS, STROKE_CONTACT_MS, STROKE_DURATION_MS } from './entities/Batter';
import { ADVANCE, GAME, LINE_X, SHOT_ANGLES, STYLES } from './config/gameplay';
import { buildWicket } from './scene/wicket';
import type { ShotType } from './game/types';
import { GLOVES, gloveOf } from './entities/gloves';

/** Ball time before the swing starts, so the delivery can be seen arriving. */
const LEAD_MS = 260;
/**
 * The two strokes off the cover input, each at the ball the game plays it at,
 * on its own clock, and with where the ball goes off the bat.
 */
interface Stroke {
  label: string; shot: ShotType; charging: boolean; lofted?: boolean;
  /** Played the same in every version: the on drive has only the one. */
  single?: boolean;
  /** The cut at a spinner, room made by stepping away to leg. */
  spinCut?: boolean;
  /** The slog sweep, on the knee. */
  sweeping?: boolean;
  /** Where the ball is met, in the rig's frame. */
  ball: { x: number; y: number; z: number };
  contact: number; end: number; bounceZ: number;
  phases: readonly (readonly [string, number])[];
  /** Off the bat: speed along the ground, its line from straight, and how fast it climbs. */
  out: { speed: number; angle: number; climb: number };
  facts: [string, string]; note: string;
}
const STROKES: Record<string, Stroke> = {
  block: {
    label: 'Block', shot: 'DEFEND', charging: false, single: true, ball: { x: LINE_X.MIDDLE, y: .54, z: GAME.contactZ },
    contact: STROKE_CONTACT_MS, end: STROKE_DURATION_MS, bounceZ: 3.5,
    phases: [['Stance', -LEAD_MS], ['Backlift', -60], ['Forward', 55], ['Contact', STROKE_CONTACT_MS], ['Dead bat', 220], ['Home', 600]],
    out: { speed: .006, angle: THREE.MathUtils.degToRad(20), climb: 0 },
    facts: ['good length, on the stumps', `${STROKE_DURATION_MS} ms`],
    note: 'The forward defensive, off the swipe straight down or S: a short step to the pitch of the ball, the bat brought down straight beside the front pad with the face turned down, the hands soft, and the ball dropped dead in front of him.',
  },
  straight: {
    label: 'Straight drive', shot: 'STRAIGHT', charging: false, single: true, ball: { x: LINE_X.MIDDLE, y: .54, z: GAME.contactZ },
    contact: STROKE_CONTACT_MS, end: STROKE_DURATION_MS, bounceZ: 3.5,
    phases: [['Stance', -LEAD_MS], ['Backlift', -60], ['Plant', 55], ['Contact', STROKE_CONTACT_MS], ['Through', 220], ['Finish', 410], ['Home', 600]],
    out: { speed: .024, angle: 0, climb: 0 },
    facts: ['full, middle stump', `${STROKE_DURATION_MS} ms`],
    note: 'The straight drive, off the swipe straight up or W: a stride down the line, the bat coming down straight under his eyes, the ball met beside the front pad and the arms out long back past the bowler, the finish high over the front shoulder.',
  },
  flick: {
    label: 'Flick', shot: 'LEG', charging: false, single: true, ball: { x: LINE_X.LEG, y: .54, z: GAME.contactZ },
    contact: STROKE_CONTACT_MS, end: STROKE_DURATION_MS, bounceZ: 3.5,
    phases: [['Stance', -LEAD_MS], ['Backlift', -60], ['Across', 55], ['Contact', STROKE_CONTACT_MS], ['Whip', 220], ['Finish', 410], ['Home', 600]],
    out: { speed: .024, angle: THREE.MathUtils.degToRad(SHOT_ANGLES.LEG), climb: 0 },
    facts: ['full, leg stump', `${STROKE_DURATION_MS} ms`],
    note: 'The flick off the pads, off the swipe to leg or A at a full ball on the legs: the front foot across, the ball met in front of the pad and the wrists turned over it, whipping the bat round to midwicket.',
  },
  pull: {
    label: 'Pull', shot: 'LEG', charging: false, single: true, ball: { x: LINE_X.MIDDLE, y: 1.0, z: GAME.contactZ },
    contact: PULL_CONTACT_MS, end: STROKE_DURATION_MS, bounceZ: STYLES.SHORT.bounce!,
    phases: [['Stance', -LEAD_MS], ['Back and across', 120], ['Contact', PULL_CONTACT_MS], ['Round', 330], ['Finish', 450], ['Home', 650]],
    out: { speed: .028, angle: THREE.MathUtils.degToRad(SHOT_ANGLES.LEG), climb: .012 },
    facts: ['bouncer, on the stumps', `${STROKE_DURATION_MS} ms`],
    note: 'The pull, off the swipe to leg or A at a bouncer on the stumps or the body: back and across, the bat swung flat across the line at chest height and the ball sent round in front of square.',
  },
  cut: {
    label: 'Square cut', shot: 'SQUARE_CUT', charging: false, single: true, ball: { x: LINE_X.OUTSIDE_OFF, y: .90, z: GAME.contactZ },
    contact: STROKE_CONTACT_MS, end: STROKE_DURATION_MS, bounceZ: 4.0,
    phases: [['Stance', -LEAD_MS], ['Backlift', -60], ['Back', 55], ['Contact', STROKE_CONTACT_MS], ['Through', 220], ['Finish', 410], ['Home', 600]],
    out: { speed: .028, angle: THREE.MathUtils.degToRad(SHOT_ANGLES.SQUARE_CUT), climb: 0 },
    facts: ['short, wide of off', `${STROKE_DURATION_MS} ms`],
    note: 'The square cut, off the swipe to off or D at a short, wide ball: back and across onto the back foot, the bat brought down and across it with the arms out, sent square through point.',
  },
  slog: {
    label: 'Slog sweep', shot: 'LEG', charging: false, single: true, sweeping: true, ball: { x: LINE_X.MIDDLE, y: .54, z: GAME.contactZ + SLOG_MEETS_AT },
    contact: SWEEP_CONTACT_MS, end: STROKE_DURATION_MS + SLOG_HOLD_MS, bounceZ: 4.2,
    phases: [['Stance', -LEAD_MS], ['Lunge', SLOG_CLOCK.lift], ['Down', SLOG_CLOCK.down], ['Contact', SWEEP_CONTACT_MS], ['Through', SLOG_CLOCK.through], ['Carry', SLOG_CLOCK.carry], ['Over', SLOG_CLOCK.over], ['Finish', SLOG_CLOCK.finish], ['Home', SLOG_CLOCK.up + SLOG_HOLD_MS]],
    out: { speed: .028, angle: THREE.MathUtils.degToRad(SHOT_ANGLES.LEG), climb: .016 },
    facts: ['spinner, on the stumps', `${STROKE_DURATION_MS + SLOG_HOLD_MS} ms`],
    note: 'The slog sweep, the meter\'s stroke at the spinner: a long lunge down the pitch onto the back knee, the bat high behind the back shoulder, then down and through flat out in front of the front pad, the arms long, and on round over the leg side and behind his head.',
  },
  cover: {
    label: 'Cover drive', shot: 'COVER_LONG_OFF', charging: false, ball: { x: LINE_X.OFF, y: .54, z: GAME.contactZ },
    contact: STROKE_CONTACT_MS, end: STROKE_DURATION_MS, bounceZ: 3.5,
    phases: [['Stance', -LEAD_MS], ['Backlift', -60], ['Plant', 55], ['Contact', STROKE_CONTACT_MS], ['Through', 220], ['Carry', 310], ['Finish', 410], ['Home', 600]],
    out: { speed: .024, angle: THREE.MathUtils.degToRad(58), climb: 0 },
    facts: ['full, off stump', `${STROKE_DURATION_MS} ms`],
    note: 'Version two, played twice in ten and four at most: the cover drive rebuilt from a side-on slow-motion recording of the shot: the front foot is down at 55 ms with the bat still coming, the ball is met at 110, the hands go out towards cover at 220 and up to the chin at 310 with the blade still hanging under them, and the checked finish at 410 is held until 600. Then the bat goes home back along its own swing, down through the carry and under him, and up into his stance.',
  },
  charge: {
    label: 'Charge over cover', shot: 'COVER_LONG_OFF', charging: true, ball: { x: 0, y: .54, z: GAME.contactZ + CHARGE_MEETS_AT },
    contact: CHARGE_CONTACT_MS, end: STROKE_DURATION_MS + ADVANCE.walkBackMs, bounceZ: 4.6,
    phases: [['Stance', -LEAD_MS], ['Backlift', -60], ['Skip', CHARGE_CLOCK.skip], ['Plant', CHARGE_CLOCK.plant], ['Contact', CHARGE_CONTACT_MS],
      ['Extension', CHARGE_CLOCK.through], ['Carry', CHARGE_CLOCK.carry], ['High finish', 580], ['Down', 760], ['Walking back', 1000]],
    out: { speed: .028, angle: THREE.MathUtils.degToRad(40), climb: .013 },
    facts: ['length, on the stumps', `${STROKE_DURATION_MS + ADVANCE.walkBackMs} ms`],
    note: 'The charge over cover: the back foot skips up to the front one, the front foot strides out down the pitch with the bat up to the sky, and the ball is met at 300 ms on the full, three quarters of a metre out of his ground. The face is opened to cover with the body still closed, the arms extend out towards extra cover, and the finish is held with the hands together above the helmet, the face of the blade to the sky: from the ball on the bat rides his hands without turning in them, until it unwinds into his guard on the way down. Then he walks back to his crease. In the game it is played off the cover swipe with the meter full, and its clock runs at two thirds speed.',
  },
  on: {
    label: 'On drive', shot: 'LONG_ON', charging: false, single: true, ball: { x: LINE_X.LEG, y: .54, z: GAME.contactZ + ON_DRIVE_MEETS_AT },
    contact: STROKE_CONTACT_MS, end: STROKE_DURATION_MS, bounceZ: 3.6,
    phases: [['Stance', -LEAD_MS], ['Backlift', -60], ['Plant', 55], ['Contact', STROKE_CONTACT_MS], ['Through', 220], ['Carry', 310], ['Finish', 410], ['Home', 600]],
    out: { speed: .024, angle: THREE.MathUtils.degToRad(-22), climb: 0 },
    facts: ['full, leg stump', `${STROKE_DURATION_MS} ms`],
    note: 'The on drive, rebuilt as a drive: the straight drive turned 24 degrees to long-on about the back foot. The front foot is down at 55 ms, a long stride down the line of a ball on leg stump pointing towards mid-on, the head over the ball; the bat comes down straight with its face closed to mid-on and meets the ball at 110 ms beside the front pad, 16 cm further down the pitch than the straight drive, with the front elbow high. The arms go out along the line to long-on at 220, the hands finish high in front of him at 410 with the blade up the ground after the ball, held to 600, and the bat goes home back down the way it came without turning in his hands. It used to whip the bat across the front of him and over the leg-side shoulder, the blade turning more than once round in his hands.',
  },
  six: {
    label: 'On drive six', shot: 'LONG_ON', charging: false, lofted: true, single: true, ball: { x: LINE_X.LEG, y: .54, z: GAME.contactZ + ON_DRIVE_MEETS_AT },
    contact: STROKE_CONTACT_MS, end: STROKE_DURATION_MS, bounceZ: 3.6,
    phases: [['Stance', -LEAD_MS], ['Backlift', -60], ['Plant', 55], ['Contact', STROKE_CONTACT_MS], ['Through', 220], ['Carry', 310], ['Wrap', 440], ['Home', 580]],
    out: { speed: .028, angle: THREE.MathUtils.degToRad(-22), climb: .014 },
    facts: ['full, leg stump', `${STROKE_DURATION_MS} ms`],
    note: 'The on drive lofted for six, played when the swipe is perfectly timed: the on drive\'s own stride and contact, then the arms carry the bat up through the line and over into a wrap, the elbows bent rather than reaching for the sky: the hands just over the front shoulder with the bat lying back over it behind his head, the front elbow up beside the helmet, the back arm across in front of his face, the chest open to long-on and the back foot up on its toe, held to 580 ms. The arms take the bat over, not the wrists: the one turn in his hands is the bottom hand rolling over the top one through the carry, evenly and one way, so that at the wrap the flat face looks out and the curved back of the blade lies against his shoulder; held, nothing turns it, and on the way home, back over his head and down the line, it settles into his guard a little at a time. The six it replaces turned the bat a full turn in his hands on the way home.',
  },
  loft: {
    label: 'Straight six', shot: 'STRAIGHT', charging: false, lofted: true, ball: { x: LINE_X.MIDDLE, y: .54, z: GAME.contactZ },
    contact: STROKE_CONTACT_MS, end: STROKE_DURATION_MS, bounceZ: 3.5,
    phases: [['Stance', -LEAD_MS], ['Backlift', -60], ['Plant', LOFT_V2_CLOCK.plant], ['Contact', STROKE_CONTACT_MS], ['Through', LOFT_V2_CLOCK.through],
      ['Finish', LOFT_V2_CLOCK.finish], ['Home', LOFT_V2_CLOCK.hold]],
    out: { speed: .028, angle: 0, climb: .016 },
    facts: ['full, middle stump', `${STROKE_DURATION_MS} ms`],
    note: 'Version two, played seven times in ten: the straight drive lofted for six, built from a six over the bowler\'s head filmed side on and from behind the bowler. A long stride first, the front foot down the line and planted at 70 ms with the head over the knee and the back foot left where it was; a straight bat meets the ball under his eyes at 110; the arms go out long up the line at 220, and the stroke ends there at 320: the hands high in front of him over the front shoulder and clear of his face, the back arm crossing under his chin, the blade carried on up the line with its toe to the sky over the bowler. No wrap over the shoulder. He holds it to 650, low on the bent front leg with the back foot up on its toe, watching it go, then brings the bat home down the line and up into his guard. From the ball the face rides the handle, so the bat never turns in his hands.',
  },
  latecut: {
    label: 'Late cut', shot: 'LATE_CUT', charging: false, single: true, ball: { x: LINE_X.OUTSIDE_OFF, y: .56, z: GAME.contactZ + LATE_CUT_MEETS_AT },
    contact: LATE_CUT_CONTACT_MS, end: STROKE_DURATION_MS, bounceZ: 3.8,
    phases: [['Stance', -LEAD_MS], ['Back and across', LATE_CUT_LOAD_MS], ['Contact', LATE_CUT_CONTACT_MS], ['Down to the turf', 310], ['Held', 400], ['Up', 620]],
    out: { speed: .026, angle: THREE.MathUtils.degToRad(SHOT_ANGLES.LATE_CUT), climb: 0 },
    facts: ['outside off', `${STROKE_DURATION_MS} ms`],
    note: 'The late cut, off the swipe down and to off (or D and S) without a meter, at pace or spin, in every mode. The back foot goes a long way back towards the stumps and across towards off, and he sinks on it until the back knee is nearly on the turf, the front leg left where it was, bent at the knee. The bat is held up high while he goes down, then comes down late and steep, the hands out at his hip, to meet the ball beside the back pad at 230 ms, 40 cm behind where the other strokes meet it, with the face open to third man. It is not struck: the ball is shown the way, and the blade goes on down until the toe points at the turf behind him, held there with his head down over the hands, before he lifts the bat out towards point and gets up into his guard. Middled it runs away to third man for four, never six; a shade under two or three, held back one or two, poor off the edge to the keeper.',
  },
  spincut: {
    label: 'Cut off the spinner', shot: 'SQUARE_CUT', charging: false, single: true, spinCut: true, ball: { x: LINE_X.MIDDLE, y: .54, z: GAME.contactZ },
    contact: SPIN_CUT_CONTACT_MS, end: STROKE_DURATION_MS + SPIN_CUT_HOLD_MS, bounceZ: 4.2,
    phases: [['Stance', -LEAD_MS], ['Back and away', SPIN_CUT_LOAD_MS], ['Contact', SPIN_CUT_CONTACT_MS], ['Through', 260], ['Up', 350], ['Past the ear', 435], ['On the shoulder', 520], ['Home', 795]],
    out: { speed: .03, angle: THREE.MathUtils.degToRad(SHOT_ANGLES.SQUARE_CUT), climb: 0 },
    facts: ['off-spinner turning in', `${STROKE_DURATION_MS + SPIN_CUT_HOLD_MS} ms`],
    note: 'The cut at a spinner, off the same swipe as the cut: an off-spinner pitched outside off and turning in at him, or a leg-spinner pitched on leg and turning away. He makes the room himself: the back foot goes back and away towards leg, the front foot is drawn back with it and the stance opens wide, the weight on the back foot, the bat taken up high. The ball is met at 190 ms out in front of the off stump on the back foot, the bat coming down on it with the arms out straight and the face over the ball, and the hands go on through level towards point at 260, then up at 350 with the blade upright in front of his face. The hands never go over his head: they stop at the peak of the helmet, the elbows down either side of his face, while the bat tips out past his leg-side ear and lands at 520 across the opposite shoulder, the back of the blade to it, the face riding his hands all the way. Held there, as the hook is, it comes off the shoulder the way it went on, stands up in front of him and goes down into his guard.',
  },
  hook: {
    label: 'Hook shot', shot: 'HOOK', charging: false, single: true, ball: { x: LINE_X.OUTSIDE_OFF, y: 1.134, z: GAME.contactZ + HOOK_MEETS_AT },
    contact: HOOK_CONTACT_MS, end: STROKE_DURATION_MS + HOOK_HOLD_MS, bounceZ: STYLES.SHORT.bounce!,
    phases: [['Stance', -LEAD_MS], ['Back and across', HOOK_LOAD_MS], ['Down', 160], ['Contact', HOOK_CONTACT_MS], ['Out front', 255], ['To leg', 315], ['Round', 395], ['Wrap', 520], ['Turning', 600], ['Back to the bowler', 720], ['Home', 860]],
    out: { speed: .03, angle: THREE.MathUtils.degToRad(SHOT_ANGLES.HOOK), climb: .032 },
    facts: ['bouncer, outside off', `${STROKE_DURATION_MS + HOOK_HOLD_MS} ms`],
    note: 'The hook, at a bouncer on off stump or wider, off the swipe down and to leg with or without a meter; from Tendulkar\'s off Caddick in 2003 and a net session in slow motion for the hands. He goes back and across, the back foot over towards off stump and the front one drawn back and opened, the bat taken high over the back shoulder. The hands come down and out, and the ball is met at 200 ms well away from him, out in front and towards off, both arms straight and the bat level with its face to the bowler. Then the arms swing it round flat like a baseball bat, still long: straight out in front at 255, out to leg at 315, round behind square at 395, the chest turning with them and the face going round with the body, never in his hands. Only then do the elbows fold, the bottom hand rolling over the top one, and by 520 the bat is wrapped behind his head with the hands up over the front shoulder, the curved back of the blade against it and his head turned after the ball. And the turn the swing began carries on through it, one movement slowing all the way, on his feet as well as his shoulders, the hands staying up over the front shoulder as the body turns under them: square to the leg side, then on round until his back is to the bowler and his hips to the stumps, the front foot come round on its toe to off stump and the back one turned to leg stump, the bat up behind his head pointing away to off and his head up after the ball; held there, he unwinds with the bat brought upright over his head and lets the hands down in front of him into his guard. It goes up over him to backward square leg: middled for six, a shade under for four; late it takes the glove through to the keeper, early it goes straight up.',
  },
  scoop: {
    label: 'Scoop', shot: 'SCOOP', charging: false, single: true, ball: { x: LINE_X.MIDDLE, y: .54, z: GAME.contactZ },
    contact: SCOOP_CLOCK.contact, end: STROKE_DURATION_MS, bounceZ: 2.6,
    phases: [['Stance', -LEAD_MS], ['Across and down', SCOOP_CLOCK.set], ['Contact', SCOOP_CLOCK.contact], ['Through', SCOOP_CLOCK.through], ['Carry', SCOOP_CLOCK.carry],
      ['Upright', SCOOP_CLOCK.finish], ['Back across', SCOOP_CLOCK.hold], ['Home', SCOOP_CLOCK.across]],
    out: { speed: .026, angle: THREE.MathUtils.degToRad(SHOT_ANGLES.SCOOP), climb: .022 },
    facts: ['full, middle or leg', `${STROKE_DURATION_MS} ms`],
    note: 'The scoop, with the meter full, off the swipe down and to leg (S and A); from a net session filmed from the off side and from behind the stumps. He gets out of the ball\'s way first: by 95 ms the back foot has gone across to the off side and the front foot opened, so he stands square to the bowler on a wide, low base with his body outside the line of a ball on the stumps, the bat brought down upright in front of him. At 150 ms the bat is laid back almost flat, pointing at the bowler with the face turned up, the hands low beside the front thigh, and the ball is met at knee height and ridden up off the face over his leg-side shoulder to fine leg. Then the bat lifts toe first without turning in his hands, out in front at 240 and climbing at 330, until at 430 it stands upright in front of the front shoulder with the hands at his chin. He holds it there to 600 with his head turned to watch it go, then steps back across into his crease and into his pick-up. The step across is what keeps the ball out of him: standing where he took guard, it flew through his body.',
  },
  reverse: {
    label: 'Reverse scoop', shot: 'REVERSE_SCOOP', charging: false, single: true, ball: { x: LINE_X.OUTSIDE_OFF, y: .54, z: GAME.contactZ },
    contact: REVERSE_CLOCK.contact, end: STROKE_DURATION_MS, bounceZ: 3.0,
    phases: [['Stance', -LEAD_MS], ['Down in front', REVERSE_CLOCK.drop], ['Out to leg', REVERSE_CLOCK.flip], ['Backlift and stride', REVERSE_CLOCK.lift], ['Down on the knee', REVERSE_CLOCK.down],
      ['Contact', REVERSE_CLOCK.contact], ['Through', REVERSE_CLOCK.through], ['Up and back', REVERSE_CLOCK.carry], ['Upright', REVERSE_CLOCK.finish], ['Home', REVERSE_CLOCK.hold]],
    out: { speed: .026, angle: THREE.MathUtils.degToRad(SHOT_ANGLES.REVERSE_SCOOP), climb: .022 },
    facts: ['off stump or wider', `${STROKE_DURATION_MS} ms`],
    note: 'The reverse scoop, with the meter full, off the swipe down and to off (S and D), played as a left-hander would play it. The bat comes down to hang in front of the pads by 48 ms, swings out to the leg side outside him by 90 and up beside the front shoulder by 140, his chest open to the bowler and the hands out in front, while the front foot strides a long way out to the off and the leg stretches nearly straight. It comes down past his legs with the back knee on the turf by 180 and meets the ball at 240 out beside the front knee with the arms long, level and pointing out to the off, the face open to the sky. Then it follows the ball up and back over the slips, through 310 and 400, to stand upright out in front of him at 520 with the face to the keeper, held on the knee to 650 while he watches it go. Into the ball the bat never turns in his hands; after it the forearms roll it over to the keeper, evenly.',
  },
};
let stroke = STROKES.cover;
/** Which version of the stroke: the game's own (1), the rebuilt one (2), or met beside the pad (3). The game plays them 40, 20 and 40 in a hundred. */
let version: CoverVersion = 2;
/** Incoming pace, metres a millisecond. */
const IN_SPEED = .030;
const RADIUS = .036;

// Camera eyes and targets in the rig's frame (off side +x), relative to the stance.
const VIEWS: Record<string, { eye: [number, number, number]; at: [number, number, number] }> = {
  side: { eye: [4.3, 1.5, .4], at: [.05, 1.0, .25] },
  bowler: { eye: [-.15, 1.55, 6.2], at: [0, 1.0, .25] },
  behind: { eye: [.36, 2.3, -4.6], at: [.1, 1.0, 1.4] },
  leg: { eye: [-4.3, 1.5, .4], at: [.05, 1.0, .25] },
  high: { eye: [3.0, 3.6, 3.4], at: [0, .9, .3] },
};

const stage = document.querySelector<HTMLDivElement>('#stage')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.append(renderer.domElement);

const scene = new THREE.Scene(); scene.background = new THREE.Color('#0e1a14');
scene.fog = new THREE.Fog('#0e1a14', 14, 34);
scene.add(new THREE.HemisphereLight(0xfff6ea, 0x3d5a36, 2.3));
const sun = new THREE.DirectionalLight(0xffeedd, 2.6);
sun.position.set(3, 7, -2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 16 });
scene.add(sun, sun.target);

// Everything that belongs to the ground goes in `world`, mirrored as the game's stage is.
const world = new THREE.Group(); world.scale.x = -1; scene.add(world);
const outfield = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 1 }));
outfield.rotation.x = -Math.PI / 2; outfield.receiveShadow = true; world.add(outfield);
const strip = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 22), new THREE.MeshStandardMaterial({ color: 0xc8b98a, roughness: 1 }));
strip.rotation.x = -Math.PI / 2; strip.position.set(0, .002, 9.35); strip.receiveShadow = true; world.add(strip);
const chalk = new THREE.MeshBasicMaterial({ color: 0xf4f1e8 });
const line = (w: number, d: number, x: number, z: number) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), chalk);
  m.rotation.x = -Math.PI / 2; m.position.set(x, .004, z); world.add(m);
};
line(3.66, .05, 0, GAME.creaseZ); line(2.64, .05, 0, 0);
for (const x of [-1.32, 1.32]) line(.05, 2.44, x, GAME.creaseZ - 1.22 + .6);
buildWicket(world, GAME.stumpHeight, 0);

const batter = new Batter(); world.add(batter.root); batter.mirrorStickers(true);
batter.root.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });

const ball = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 24, 16), new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: .45 }));
ball.castShadow = true; world.add(ball);
// Where the ball is met: fixed, so the blade can be checked against it.
const marker = new THREE.Mesh(new THREE.RingGeometry(.05, .062, 32), new THREE.MeshBasicMaterial({ color: 0xff6b5e, side: THREE.DoubleSide, transparent: true, opacity: .9 }));
world.add(marker);

/** Where the ball is at time `t` on the stroke's clock, in the rig's frame. */
function ballAt(t: number): [number, number, number] {
  const at = metAt(), { contact, bounceZ, out } = stroke, dt = t - contact;
  if (dt <= 0) {
    const z = at.z - dt * IN_SPEED;
    if (z <= bounceZ) {
      const k = (z - at.z) / (bounceZ - at.z);
      return [at.x, RADIUS + (at.y - RADIUS) * (1 - k) + .18 * k * (1 - k), z];
    }
    const k = Math.min(1, (z - bounceZ) / 9);
    return [at.x, RADIUS + 2.0 * k - .55 * k * k, z];
  }
  const s = dt * out.speed;
  // In the air: up off the bat and over the field, falling as it goes.
  if (out.climb) return [at.x + Math.sin(out.angle) * s, at.y + out.climb * dt - 9.8e-6 * dt * dt, at.z + Math.cos(out.angle) * s];
  // Along the ground: down into it quickly, then through the covers.
  const fall = Math.min(1, dt / 90);
  const y = THREE.MathUtils.lerp(at.y, RADIUS, fall * fall) + .06 * Math.sin(fall * Math.PI);
  return [at.x + Math.sin(out.angle) * s, y, at.z + Math.cos(out.angle) * s];
}

const camera = new THREE.PerspectiveCamera(36, 1, .05, 80);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI * .49;
const mirror = (p: readonly number[]) => new THREE.Vector3(-(GAME.stanceX + p[0]), p[1], GAME.stanceZ + p[2]);
function placeCamera(view: string) {
  const v = VIEWS[view];
  camera.position.copy(mirror(v.eye)); controls.target.copy(mirror(v.at)); followed = 0; controls.update();
}
/** How far down the pitch he is: the charge takes him a metre out and walks him back. */
const downPitch = () => batter.root.position.z - GAME.stanceZ;
let followed = 0;

/**
 * Puts the batter and the ball at time `t`. Before the swing he rises out of
 * his stance into the backlift as the ball comes, as the game has him do while
 * the bowler runs in, so the loop starts in the stance the stroke ends in
 * rather than snapping from it to the backlift.
 */
function pose(t: number) {
  if (t < 0) {
    batter.reset(); swinging = false;
    batter.prepare(THREE.MathUtils.smoothstep(t, -LEAD_MS, 0)); batter.update(0);
  } else {
    if (!swinging) start();
    batter.update(t);
  }
  ball.position.fromArray(ballAt(t));
  const at = metAt(); marker.position.set(at.x, at.y, at.z);
  marker.visible = t <= stroke.contact + 140;
  batter.drape();
}

let swinging = false;
/** Where this stroke meets the ball: version three's cover drive beside the front pad, a little further on. */
const metAt = () => ({ ...stroke.ball, z: stroke.ball.z + (version === 3 && !stroke.charging && !stroke.single ? COVER_V3_MEETS_AT : 0) });
function start() {
  batter.reset(); batter.prepare(1); batter.update(0);
  const at = metAt();
  batter.swing(stroke.shot, 0, at.x, at.y, at.z, stroke.charging, !!stroke.lofted, !!stroke.sweeping, false, version, !!stroke.spinCut);
  swinging = true;
}

// ── Controls ─────────────────────────────────────────────────────────────────
const scrub = document.querySelector<HTMLInputElement>('#scrub')!;
const playButton = document.querySelector<HTMLButtonElement>('#play')!;
const readout = document.querySelector<HTMLOutputElement>('#time')!;
const phaseLabel = document.querySelector<HTMLOutputElement>('#phase')!;
const strip_ = document.querySelector<HTMLDivElement>('#frames')!;

let playing = true, t = -LEAD_MS, speed = .5, previous = performance.now(), view = 'side';
const phaseAt = (time: number) => [...stroke.phases].reverse().find(([, at]) => time >= at)?.[0] ?? 'Stance';
function setPlaying(on: boolean) { playing = on; playButton.textContent = on ? 'Pause' : 'Play'; playButton.setAttribute('aria-pressed', String(on)); }
function seek(time: number) { setPlaying(false); t = Math.max(-LEAD_MS, Math.min(stroke.end, time)); }

playButton.onclick = () => setPlaying(!playing);
scrub.oninput = () => seek(Number(scrub.value));
document.querySelector('#back')!.addEventListener('click', () => seek(Math.round(t) - 10));
document.querySelector('#fwd')!.addEventListener('click', () => seek(Math.round(t) + 10));
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
  b.onclick = () => {
    speed = Number(b.dataset.speed);
    for (const o of document.querySelectorAll('[data-speed]')) o.setAttribute('aria-pressed', String(o === b));
    setPlaying(true);
  };
}
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-stroke]')) {
  b.onclick = () => {
    for (const o of document.querySelectorAll('[data-stroke]')) o.setAttribute('aria-pressed', String(o === b));
    choose(b.dataset.stroke!);
  };
}
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-version]')) {
  b.onclick = () => {
    for (const o of document.querySelectorAll('[data-version]')) o.setAttribute('aria-pressed', String(o === b));
    version = Number(b.dataset.version) as CoverVersion;
    choose(Object.keys(STROKES).find(key => STROKES[key] === stroke)!);
  };
}
// The gloves: the Classic pair he was built with, or one of the Dressing Room's (`entities/gloves.ts`).
const gloveRow = document.querySelector<HTMLDivElement>('#gloves')!;
function wear(id: string) {
  batter.wearGloves(gloveOf(id));
  for (const o of gloveRow.querySelectorAll('button')) o.setAttribute('aria-pressed', String(o.dataset.glove === id));
  swinging = false; contactSheet(); start();
}
for (const glove of GLOVES) {
  const button = document.createElement('button');
  button.dataset.glove = glove.id; button.textContent = glove.name; button.setAttribute('aria-pressed', 'false');
  button.onclick = () => wear(glove.id);
  gloveRow.append(button);
}
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-view]')) {
  b.onclick = () => {
    view = b.dataset.view!; placeCamera(view);
    for (const o of document.querySelectorAll('[data-view]')) o.setAttribute('aria-pressed', String(o === b));
  };
}
addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
  if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); }
  else if (e.key === 'ArrowLeft' || e.key === ',') { e.preventDefault(); seek(Math.round(t) - (e.shiftKey ? 50 : 10)); }
  else if (e.key === 'ArrowRight' || e.key === '.') { e.preventDefault(); seek(Math.round(t) + (e.shiftKey ? 50 : 10)); }
});

function resize() {
  const { clientWidth: width, clientHeight: height } = stage;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

/** The key poses, each photographed side-on into the strip, and each a way to jump there. */
function contactSheet() {
  const W = 240, H = 300, shotCam = new THREE.PerspectiveCamera(30, W / H, .05, 60);
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  strip_.replaceChildren();
  for (const [label, at] of stroke.phases) {
    pose(at);
    const along = new THREE.Vector3(0, 0, downPitch());
    shotCam.position.copy(mirror([4.6, 1.25, .45])).add(along); shotCam.lookAt(mirror([.12, .95, .3]).add(along));
    renderer.render(scene, shotCam);
    const button = document.createElement('button');
    button.className = 'frame'; button.dataset.at = String(at);
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    canvas.getContext('2d')!.drawImage(renderer.domElement, 0, 0, W, H);
    const caption = document.createElement('span');
    caption.innerHTML = `<b>${label}</b><i>${at} ms</i>`;
    button.append(canvas, caption);
    button.onclick = () => seek(at);
    strip_.append(button);
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  resize();
}

function frame(now: number) {
  const step = Math.min(now - previous, 50); previous = now;
  if (playing) { t += step * speed; if (t > stroke.end + 300) t = -LEAD_MS; }
  const shown = Math.min(t, stroke.end);
  pose(shown);
  // Down the pitch with him, eye and target together, which keeps the view chosen.
  const follow = downPitch() * .8;
  camera.position.z += follow - followed; controls.target.z += follow - followed; followed = follow;
  scrub.value = String(Math.round(shown));
  readout.textContent = `${Math.round(shown)} ms`;
  const phase = phaseAt(shown);
  phaseLabel.textContent = phase;
  for (const b of strip_.children) (b as HTMLElement).classList.toggle('on', b.querySelector('b')!.textContent === phase);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

/** What version one of each stroke is: the game's own, as it was. */
const VERSION_ONE: Record<string, string> = {
  cover: 'Version one, played four times in ten and the only one middled for six: the cover drive the game has always played, kept beside the rebuilt one: a short step in, the ball met at 110 ms, the arms out through the line at 220 and the high finish at 410, with the bat pointing out square, held to 570, and home to his guard over the top.',
  loft: 'Version one, played three times in ten: the lofted straight drive the game has always played: the classic drive\'s stride and contact, the blade climbing through the line, and the finish over the front shoulder with the hands above the helmet and the bat pointing to the sky, held to 410.',
  charge: 'Version one, the charge over cover the game has always played: the same run down the pitch, ball and finish as version two, with the bat turning in his hands on the way up into the finish and on the way home.',
};
/** What version three of each stroke is: the cover drive met beside the front pad. */
const VERSION_THREE: Record<string, string> = {
  cover: 'Version three, played four times in ten: version two met beside the front pad, under his eyes, as the recording meets it, 28 cm further down the pitch than the game meets every other drive. The hips and chest are further forward, the front knee bent deeper over the foot, and the back foot slides back less. The swipe is timed as for the other two, and like version two it keeps the ball down: middled, it is four, never six.',
  loft: 'The straight six has no version three: it is version two\'s.',
  charge: 'The charge over cover has no version three: it is version two\'s, down the pitch to the ball as it always was.',
};
const title = document.querySelector<HTMLHeadingElement>('h1')!;
const facts = document.querySelectorAll<HTMLElement>('[data-fact]');
const note = document.querySelector<HTMLSpanElement>('#note-text')!;
/** Puts `key`'s stroke up: its clock on the scrubber, its key poses in the strip, its words. */
function choose(key: string) {
  stroke = STROKES[key];
  const [first, ...rest] = stroke.label.split(' ');
  title.innerHTML = `${first} <span>${rest.join(' ')}</span>`;
  facts.forEach((fact, i) => { fact.textContent = stroke.facts[i]; });
  note.textContent = stroke.single ? stroke.note : version === 1 ? VERSION_ONE[key] : version === 3 ? VERSION_THREE[key] : stroke.note;
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-version]')) b.disabled = !!stroke.single;
  scrub.min = String(-LEAD_MS); scrub.max = String(stroke.end);
  swinging = false; contactSheet(); start();
  t = -LEAD_MS; placeCamera(view); setPlaying(true);
}

const firstGlove = new URLSearchParams(location.search).get('gloves') ?? 'fern';
batter.wearGloves(gloveOf(firstGlove));
for (const o of gloveRow.querySelectorAll('button')) o.setAttribute('aria-pressed', String(o.dataset.glove === firstGlove));
choose('cover');
if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setPlaying(false); t = stroke.contact; }
requestAnimationFrame(frame);
