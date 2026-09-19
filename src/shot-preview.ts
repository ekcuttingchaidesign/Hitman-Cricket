/**
 * An unlinked page for looking at the batting rig, one stroke at a time.
 *
 * Isolated from `Game`: it builds a `Batter` and a floor and nothing else, so
 * inspecting a pose cannot submit a score, play music, or touch analytics. It
 * is not linked from the game and exists to be opened directly.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Batter, CHARGE_CLOCK, CHARGE_CONTACT_MS, CHARGE_MEETS_AT, PULL_CONTACT_MS, PULL_LOAD_MS, REVERSE_CONTACT_MS, SCOOP_CONTACT_MS, SQUARE_DRIVE_CONTACT_MS, STROKE_CONTACT_MS, STROKE_DURATION_MS, SWEEP_CONTACT_MS } from './entities/Batter';
import { ADVANCE, GAME } from './config/gameplay';
import type { ShotType } from './game/types';

interface Play {
  label: string; shot: ShotType; ballX: number; ballY: number; charging?: boolean; lofted?: boolean; sweeping?: boolean;
  levelled?: boolean;
  phases: readonly (readonly [string, number])[];
  note: string;
}
const DRIVE_PHASES = [['Contact', STROKE_CONTACT_MS], ['Extension', 220], ['Carry', 310], ['Finish', 410], ['Recovery', 700]] as const;
const PLAYS: Record<string, Play> = {
  scoop: {
    label: 'Scoop (new)', shot: 'SCOOP', ballX: -.07, ballY: .54,
    phases: [['Set', 70], ['Contact', SCOOP_CONTACT_MS], ['Roll', 245], ['Carry', 380], ['Finish', 490], ['Over', 680], ['Recovery', 765]],
    note: 'From the broadcast recording, taken from the bowler\u2019s end. Watch 0\u2013150 ms: he is already down before the ball \u2014 a wide base, both knees bent, square to the bowler \u2014 with the bat brought down early and held out in front of the front hip, toe angled down and forward to the off side and the face turned up at the bowler. The ball is met at knee height in front of the pads and ridden off the face over the keeper\u2019s shoulder. Then the wrists roll and the bat comes up and over the front shoulder \u2014 the toe swinging from down and forward, past the leg side, back, and down behind him \u2014 to finish high beside the front shoulder with the blade wrapped over it, watching it over that shoulder. Home is the straight charge\u2019s way: back up over the top and down in front. Played off the down-and-to-leg swipe with the meter full at a ball on middle or leg.',
  },
  reverseScoop: {
    label: 'Reverse scoop (new)', shot: 'REVERSE_SCOOP', ballX: .28, ballY: .54,
    phases: [['Down', 130], ['Contact', REVERSE_CONTACT_MS], ['Extension', 340], ['Carry', 400], ['Over', 520], ['Finish', 600], ['Recovery', 780]],
    note: 'From the broadcast recording, taken from behind the bowler. He goes down the way the sweep does \u2014 onto the back knee, the front foot forward and to the off \u2014 and the bat comes down beside the front pad and out under the ball on the off side, the face turned up, met beside the pad at waist height with the blade level and pointing at point. The arms extend out to the off, and the bat keeps going: up in front of the off ear, across in front of the face with the blade laid back over the top of the helmet, and down the leg side, the shoulders turning with it until he is looking back over them at the ball going over the slips, still on the knee. Played off the down-and-to-off swipe with the meter full at a ball on or outside off.',
  },
  charge: {
    label: 'Advance charge (new)', shot: 'STRAIGHT', ballX: 0, ballY: .54, charging: true,
    phases: [['Skip', CHARGE_CLOCK.skip], ['Plant', CHARGE_CLOCK.plant], ['Contact', CHARGE_CONTACT_MS], ['Extension', CHARGE_CLOCK.through], ['Carry', CHARGE_CLOCK.carry], ['Over', CHARGE_CLOCK.over], ['Finish', CHARGE_CLOCK.finish], ['Unwrap', CHARGE_CLOCK.unwrap], ['Walking back', 1000]],
    note: 'Rebuilt from the two recordings. Watch 0–200 ms: the back foot skips up to the front one, then the front foot strides out a stride and a half down the pitch while the bat goes up to the sky over the back shoulder. From there it is a lofted straight drive on the move — met on the full level with the front pad, arms opening out straight up the ground, the blade climbing up over the front shoulder into a wrap with the hands high beside the helmet and the toe hanging down behind his back. The red marker is a stride and a half short of the crease, because that is where he meets it. Play it at match speed and he hits it in three tenths of a second; in the game the clock runs at two thirds speed from the swipe.',
  },
  coverCharge: {
    label: 'Advance charge over cover (new)', shot: 'COVER_LONG_OFF', ballX: 0, ballY: .54, charging: true,
    phases: [['Skip', CHARGE_CLOCK.skip], ['Plant', CHARGE_CLOCK.plant], ['Contact', CHARGE_CONTACT_MS], ['Extension', CHARGE_CLOCK.through], ['Carry', CHARGE_CLOCK.carry], ['High finish', 580], ['Down', 760], ['Walking back', 1000]],
    note: 'The same walk at the ball as the straight charge — skip, stride, bat to the sky — and a different shot from the ball onwards, built from the two cover recordings. The face is opened to cover at contact with the body still closed, the arms extend out towards extra cover with the blade climbing, and the finish is held with the hands together above the helmet and the bat pointing to the sky over the off shoulder. Played off the cover swipe with the meter full; six over extra cover.',
  },
  onCharge: {
    label: 'Advance charge over long-on (new)', shot: 'LONG_ON', ballX: 0, ballY: .54, charging: true,
    phases: [['Skip', CHARGE_CLOCK.skip], ['Plant', CHARGE_CLOCK.plant], ['Contact', CHARGE_CONTACT_MS], ['Extension', CHARGE_CLOCK.through], ['Carry', CHARGE_CLOCK.carry], ['Over', CHARGE_CLOCK.over], ['Finish', CHARGE_CLOCK.finish], ['Unwrap', CHARGE_CLOCK.unwrap], ['Walking back', 1000]],
    note: 'The same walk at the ball, then the mirror of the shot over cover up to the carry, built from the third recording: the face closed towards mid-on at contact, the arms extended out that way with the blade climbing. It finishes the way the straight charge does — over the top and wrapped over the front (left) shoulder, hands high beside it, toe hanging down behind his back — facing mid-on. Played off the long-on swipe with the meter full; six a little squarer than long-on.',
  },
  sweep: {
    label: 'Slog sweep (new)', shot: 'LEG', ballX: 0, ballY: .48, sweeping: true,
    phases: [['Down on it', 130], ['Contact', SWEEP_CONTACT_MS], ['Through', 390], ['Climb', 470], ['Finish', 560], ['Up again', 750]],
    note: 'The second special stroke, and the only one played off the knee — a spinner pitched up, the meter full, and a leg-side swipe. Watch 130–240 ms: he drops onto the back knee with the front leg planted across him before the bat moves, and the swing is flat and round rather than down and through. Perfect timing is six over midwicket; good is a four that pitches once before the rope.',
  },
  flat: {
    label: 'Flat sweep (new)', shot: 'LEG', ballX: 0, ballY: .48, levelled: true,
    phases: [['Down on it', 130], ['Contact', SWEEP_CONTACT_MS], ['Through', 390], ['Round', 470], ['Finish', 560], ['Up again', 750]],
    note: 'The orthodox sweep: the slog\u2019s ball and the slog\u2019s body, with no meter and no arc. Put it beside the slog sweep and scrub them together \u2014 everything below the hands is the same stroke, and the difference is the blade, which is held level from contact all the way round instead of climbing over the shoulder. A level blade cannot lift the ball, so this one never goes up: it is four, three, two or one along the ground to square leg, on timing alone. Miss it and the pads are all that is behind the bat.',
  },
  square: {
    label: 'Square drive (new)', shot: 'COVER_LONG_OFF', ballX: .44, ballY: .40,
    phases: [['Contact', SQUARE_DRIVE_CONTACT_MS], ['Flat extension', 240], ['Turn over', 330], ['High finish', 430], ['Recovery', 700]],
    note: 'The off-side drive at a wide, full ball. Watch 130–240 ms: the arms come out straight and punch square with the blade still hanging under them, and only then does it turn over.',
  },
  straight: {
    label: 'Straight drive — four', shot: 'STRAIGHT', ballX: 0, ballY: .54, phases: DRIVE_PHASES,
    note: 'The checked one. Same ball and same contact as the six below; the hands finish high in front of the chest with the blade pointing up the ground after the ball, over a braced front leg.',
  },
  lofted: {
    label: 'Straight drive — six (lofted)', shot: 'STRAIGHT', ballX: 0, ballY: .54, lofted: true, phases: DRIVE_PHASES,
    note: 'Middled: the blade keeps climbing through the line, the chest opens right up, the back foot comes off and the bat finishes over the front shoulder. Played when the timing is perfect — the same rule that scores it as six.',
  },
  onLofted: {
    label: 'On drive — six (lofted, new)', shot: 'LONG_ON', ballX: -.20, ballY: .54, lofted: true, phases: DRIVE_PHASES,
    note: 'Middled, from a broadcast recording: the same ball and the same contact as the on drive below, then the arms open out towards long-on with the blade climbing, the hands keep going up and across to the leg side, and the finish is both arms straight above the helmet with the bat to the sky over the front shoulder, back foot on its toe. Played when the timing is perfect — the same rule that scores it as six. No slow motion: it is a regular stroke.',
  },
  cover: {
    label: 'Cover drive', shot: 'COVER_LONG_OFF', ballX: .12, ballY: .54, phases: DRIVE_PHASES,
    note: 'Inside the square drive’s width, so the same input stays a cover drive. Its elbows now open through the ball too.',
  },
  pull: {
    label: 'Pull', shot: 'LEG', ballX: -.30, ballY: 1.12,
    phases: [['Load', PULL_LOAD_MS], ['Contact', PULL_CONTACT_MS], ['Extension', 340], ['Wrap', 500], ['Recovery', 720]],
    note: 'Reworked: the elbows fold so the blade lifts out of the sweep and wraps behind the front shoulder, instead of finishing flat across the chest.',
  },
  cut: {
    label: 'Square cut', shot: 'SQUARE_CUT', ballX: .42, ballY: .92,
    phases: [['Contact', STROKE_CONTACT_MS], ['Finish', 410], ['Recovery', 700]],
    note: 'Unchanged. The back-foot answer to a short, wide ball — the square drive is its front-foot counterpart.',
  },
  glance: {
    label: 'Leg-side flick', shot: 'LEG', ballX: -.30, ballY: .54,
    phases: [['Contact', STROKE_CONTACT_MS], ['Finish', 410], ['Recovery', 700]], note: 'Unchanged.',
  },
  longon: {
    label: 'On drive — along the ground', shot: 'LONG_ON', ballX: -.20, ballY: .54,
    phases: [['Contact', STROKE_CONTACT_MS], ['Finish', 410], ['Recovery', 700]], note: 'Unchanged: the on drive for anything short of perfect timing — four, three, two, one.',
  },
  defend: {
    label: 'Forward defensive', shot: 'DEFEND', ballX: 0, ballY: .54,
    phases: [['Contact', STROKE_CONTACT_MS], ['Finish', 410]], note: 'Unchanged.',
  },
};
// Square of the wicket on the off side is the angle both reference recordings
// were filmed from, so it is the one to compare against and the default.
const VIEWS: Record<string, { label: string; eye: [number, number, number]; at: [number, number, number] }> = {
  square: { label: 'Square (off side)', eye: [4.3, 1.9, .35], at: [.05, 1.12, .2] },
  bowler: { label: "Bowler's view", eye: [-.1, 1.6, 5.4], at: [0, 1.05, .2] },
  leg: { label: 'Leg side', eye: [-4.3, 1.9, .35], at: [.05, 1.05, .2] },
  high: { label: 'High three-quarter', eye: [3.4, 3.2, 3.0], at: [0, 1.0, .2] },
  grip: { label: 'Grip close-up', eye: [1.5, 1.5, 1.2], at: [.25, 1.15, .35] },
};

/** The stroke's own contact time, and the height it actually plays the ball at:
 *  everything but the two cross-bat strokes lets a high ball go over the bat. */
const contactOf = (play: Play) => play.sweeping || play.levelled ? SWEEP_CONTACT_MS
  : play.shot === 'SCOOP' ? SCOOP_CONTACT_MS : play.shot === 'REVERSE_SCOOP' ? REVERSE_CONTACT_MS
  : play.shot === 'LEG' && play.ballY > .85 ? PULL_CONTACT_MS
  : play.charging ? CHARGE_CONTACT_MS
  : play.shot === 'COVER_LONG_OFF' && play.ballX >= .30 && play.ballY <= .70 ? SQUARE_DRIVE_CONTACT_MS
  : STROKE_CONTACT_MS;
const ballHeight = (play: Play) => play.ballY > .85 && (play.shot === 'LEG' || play.shot === 'SQUARE_CUT')
  ? play.ballY : Math.min(play.ballY, .62);

const stage = document.querySelector<HTMLDivElement>('#stage')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
stage.append(renderer.domElement);

const scene = new THREE.Scene(); scene.background = new THREE.Color('#16211f');
scene.add(new THREE.HemisphereLight(0xffffff, 0x53634a, 2.5));
const key = new THREE.DirectionalLight(0xffedda, 2.4);
key.position.set(-3, 6, -1); key.castShadow = true; scene.add(key);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 16), new THREE.MeshStandardMaterial({ color: 0x6f7a55, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const grid = new THREE.GridHelper(14, 28, 0x9aa88c, 0x5b6850); grid.position.y = .002; scene.add(grid);

const batter = new Batter(); scene.add(batter.root);
// Where the ball is met, so the blade can be checked against it rather than eyeballed.
const marker = new THREE.Mesh(new THREE.SphereGeometry(.036, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd43b32 }));
scene.add(marker);

const camera = new THREE.PerspectiveCamera(40, 1, .1, 80);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const shotPicker = document.querySelector<HTMLSelectElement>('#shot')!;
const viewPicker = document.querySelector<HTMLSelectElement>('#view')!;
const phaseBar = document.querySelector<HTMLDivElement>('#phases')!;
const scrub = document.querySelector<HTMLInputElement>('#scrub')!;
const playButton = document.querySelector<HTMLButtonElement>('#play')!;
const speedPicker = document.querySelector<HTMLSelectElement>('#speed')!;
const readout = document.querySelector<HTMLOutputElement>('#time')!;
const note = document.querySelector<HTMLParagraphElement>('#note')!;

for (const [value, play] of Object.entries(PLAYS)) {
  shotPicker.append(new Option(play.label, value));
}
for (const [value, view] of Object.entries(VIEWS)) {
  viewPicker.append(new Option(view.label, value));
}

let playing = true, age = 0, previous = performance.now();
const current = () => PLAYS[shotPicker.value];

function placeCamera() {
  const view = VIEWS[viewPicker.value];
  camera.position.set(GAME.stanceX + view.eye[0], view.eye[1], GAME.stanceZ + view.eye[2]);
  controls.target.set(GAME.stanceX + view.at[0], view.at[1], GAME.stanceZ + view.at[2]);
  followed = 0;
  controls.update();
}

function buildPhases() {
  phaseBar.replaceChildren();
  for (const [label, time] of current().phases) {
    const button = document.createElement('button');
    button.className = 'phase'; button.textContent = `${label} · ${time}ms`;
    button.onclick = () => { playing = false; playButton.textContent = 'Play'; age = time; };
    phaseBar.append(button);
  }
}

function restart() {
  const play = current();
  // The charge keeps travelling after the stroke, so its scrub covers the walk
  // back to the crease as well.
  scrub.max = String(play.charging ? STROKE_DURATION_MS + ADVANCE.walkBackMs : STROKE_DURATION_MS);
  batter.reset(); batter.prepare(1); batter.update(0);
  batter.swing(play.shot, 0, play.ballX, play.ballY, GAME.contactZ + (play.charging ? CHARGE_MEETS_AT : 0), play.charging ?? false, play.lofted ?? false, play.sweeping ?? false, play.levelled ?? false);
  note.textContent = play.note;
  buildPhases();
}

function frame(now: number) {
  const step = now - previous; previous = now;
  const limit = Number(scrub.max);
  if (playing) age = (age + step * Number(speedPicker.value)) % (limit + 260);
  const shown = Math.min(age, limit);
  batter.update(shown);
  scrub.value = String(Math.round(shown));

  const play = current();
  // Where the ball is, not where the blade is: a marker that rides the bat
  // proves nothing about whether the two ever met.
  marker.position.set(play.ballX, ballHeight(play), GAME.contactZ + (play.charging ? CHARGE_MEETS_AT : 0));
  marker.visible = shown <= contactOf(play) + 160;

  const pose = batter.inspect();
  const variation = pose.levelled ? 'flat sweep'
    : pose.sweeping ? 'slog sweep'
    : pose.squaring ? 'square drive'
    : pose.lofted ? 'lofted drive'
    : pose.pulling ? 'pull'
    : pose.cutting ? 'standing cut'
    : pose.charging ? 'charge'
    : 'base stroke';
  readout.textContent = `${Math.round(shown)} ms · ${variation}`;
  const phase = [...play.phases].reverse().find(([, t]) => shown >= t);
  for (const button of phaseBar.children) {
    button.classList.toggle('on', !!phase && button.textContent!.startsWith(phase[0]));
  }

  // The charge runs a metre down the pitch, so the camera goes with him —
  // eye and target together, which keeps the view the user chose.
  const follow = pose.downPitch * .8;
  camera.position.z += follow - followed; controls.target.z += follow - followed; followed = follow;
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
let followed = 0;

function resize() {
  const { clientWidth: width, clientHeight: height } = stage;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix();
}

shotPicker.onchange = () => { age = 0; restart(); };
viewPicker.onchange = placeCamera;
scrub.oninput = () => { playing = false; playButton.textContent = 'Play'; age = Number(scrub.value); };
playButton.onclick = () => { playing = !playing; playButton.textContent = playing ? 'Pause' : 'Play'; };
addEventListener('resize', resize);

shotPicker.value = 'scoop';
restart(); placeCamera(); resize();
requestAnimationFrame(frame);
