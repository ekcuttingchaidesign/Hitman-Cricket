/**
 * An unlinked page for looking at the batting rig, one stroke at a time.
 *
 * Isolated from `Game`: it builds a `Batter` and a floor and nothing else, so
 * inspecting a pose cannot submit a score, play music, or touch analytics. It
 * is not linked from the game and exists to be opened directly.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Batter, PULL_CONTACT_MS, PULL_LOAD_MS, SQUARE_DRIVE_CONTACT_MS, STROKE_CONTACT_MS, STROKE_DURATION_MS } from './entities/Batter';
import { ADVANCE, GAME } from './config/gameplay';
import type { ShotType } from './game/types';

interface Play {
  label: string; shot: ShotType; ballX: number; ballY: number; charging?: boolean; lofted?: boolean;
  phases: readonly (readonly [string, number])[];
  note: string;
}
const DRIVE_PHASES = [['Contact', STROKE_CONTACT_MS], ['Extension', 220], ['Carry', 310], ['Finish', 410], ['Recovery', 700]] as const;
const PLAYS: Record<string, Play> = {
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
  charge: {
    label: 'Advance charge (production)', shot: 'STRAIGHT', ballX: 0, ballY: .54, charging: true,
    phases: [['Contact', STROKE_CONTACT_MS], ['Finish', 410], ['Down the pitch', 900], ['Walking back', 1600]],
    note: 'Deliberately untouched: this is the production animation, verified identical to it to six decimal places. Left for a separate pass.',
  },
  glance: {
    label: 'Leg-side flick', shot: 'LEG', ballX: -.30, ballY: .54,
    phases: [['Contact', STROKE_CONTACT_MS], ['Finish', 410], ['Recovery', 700]], note: 'Unchanged.',
  },
  longon: {
    label: 'Long on', shot: 'LONG_ON', ballX: -.20, ballY: .54,
    phases: [['Contact', STROKE_CONTACT_MS], ['Finish', 410], ['Recovery', 700]], note: 'Unchanged.',
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
const contactOf = (play: Play) => play.shot === 'LEG' && play.ballY > .85 ? PULL_CONTACT_MS
  : play.charging ? STROKE_CONTACT_MS
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
  batter.swing(play.shot, 0, play.ballX, play.ballY, GAME.contactZ, play.charging ?? false);
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
  marker.position.set(play.ballX, ballHeight(play), GAME.contactZ);
  marker.visible = shown <= contactOf(play) + 160;

  const pose = batter.inspect();
  const variation = pose.squaring ? 'square drive'
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

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

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

shotPicker.value = 'square';
restart(); placeCamera(); resize();
requestAnimationFrame(frame);
