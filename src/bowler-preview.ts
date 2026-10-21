/**
 * The bowling actions on their own, in 3D, for looking at from any side: the
 * game's `Bowler` running in and bowling at the far end of a pitch with a
 * batter in his guard at this one, the ball leaving his hand and going down
 * the pitch to a yorker length. Drag to turn the camera round him, pinch or
 * scroll to come nearer, or take one of the set views; the camera can follow
 * him down his run or stay where it is.
 *
 * The world is mirrored as `GameScene`'s is, so the bowler is the right-armer
 * the batter faces in the game. Nothing is bowled for real: the ball's flight
 * here is drawn for the eye, not the game's trajectory. Isolated from `Game`,
 * like `cover-drive-preview.ts`; `scripts/bowler-artifact.mjs` bundles it
 * into one HTML file.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ACTION_MS, Bowler, DEATH_ACTION, EXPRESS_ACTION, PACE_ACTION, PHASES, type ActionStyle } from './entities/Bowler';
import { Batter } from './entities/Batter';
import { GAME } from './config/gameplay';
import { buildWicket } from './scene/wicket';

const RUNUP_MS = GAME.runupMs;
/** A beat at the end before it goes round again. */
const HOLD_MS = 500;
const LOOP_MS = ACTION_MS + HOLD_MS;
/** How long the ball takes to reach the batter: about the death bowler's, in the game. */
const FLIGHT_MS = 670;
const RADIUS = .036;
/** Where it pitches: a yorker, at his toes. */
const YORKER_Z = 1.6;

const ACTIONS: Record<string, { style: ActionStyle; name: string }> = {
  death: { style: DEATH_ACTION, name: 'Death bowler' },
  pace: { style: PACE_ACTION, name: 'Fast bowler' },
  express: { style: EXPRESS_ACTION, name: 'Sling bowler' },
};

/** The phases, in milliseconds from the top of his mark. The death bowler's names. */
const loop = DEATH_ACTION.loop!;
const PHASE_MARKS: [string, number][] = [
  ['Run-in', 0], ['The loop', loop.from * RUNUP_MS], ['The hop', PHASES.BOUND * RUNUP_MS],
  ['Drop back', PHASES.BACK_FOOT * RUNUP_MS], ['Release', loop.drop * RUNUP_MS], ['Follow-through', RUNUP_MS],
];

// ── The ground ──────────────────────────────────────────────────────────────
const stage = document.querySelector<HTMLDivElement>('#stage')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.append(renderer.domElement);

const scene = new THREE.Scene(); scene.background = new THREE.Color('#9fc3dc');
scene.fog = new THREE.Fog('#9fc3dc', 40, 90);
scene.add(new THREE.HemisphereLight(0xfff6ea, 0x3d5a36, 2.2));
const sun = new THREE.DirectionalLight(0xffeedd, 2.6);
sun.position.set(-6, 12, 14); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 14, bottom: -6, near: 1, far: 40 });
sun.target.position.set(0, 0, 12);
scene.add(sun, sun.target);

const world = new THREE.Group(); world.scale.x = -1; scene.add(world);
const outfield = new THREE.Mesh(new THREE.CircleGeometry(45, 72), new THREE.MeshStandardMaterial({ color: 0x4f8a43, roughness: 1 }));
outfield.rotation.x = -Math.PI / 2; outfield.position.z = 10; outfield.receiveShadow = true; world.add(outfield);
// Mown stripes across the square, as the game's turf has them.
for (let i = -6; i < 7; i++) {
  const band = new THREE.Mesh(new THREE.PlaneGeometry(4, 60), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x4a8340 : 0x579448, roughness: 1 }));
  band.rotation.x = -Math.PI / 2; band.position.set(i * 4, .001, 10); band.receiveShadow = true; world.add(band);
}
const strip = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 22.4), new THREE.MeshStandardMaterial({ color: 0xd8c38f, roughness: 1 }));
strip.rotation.x = -Math.PI / 2; strip.position.set(0, .003, 9.35); strip.receiveShadow = true; world.add(strip);
const chalk = new THREE.MeshBasicMaterial({ color: 0xf6f3ea });
const line = (w: number, d: number, x: number, z: number) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), chalk);
  m.rotation.x = -Math.PI / 2; m.position.set(x, .005, z); world.add(m);
};
// Both ends: the popping crease, the bowling crease and the return creases.
for (const [stumps, toward] of [[0, 1], [18.7, -1]] as const) {
  line(3.66, .05, 0, stumps + toward * GAME.creaseZ); line(2.64, .05, 0, stumps);
  for (const x of [-1.32, 1.32]) line(.05, 2.44, x, stumps + toward * (GAME.creaseZ - 1.22 + .6));
}
buildWicket(world, GAME.stumpHeight, 0);
buildWicket(world, GAME.stumpHeight, 18.7);

// ── Who is on it ─────────────────────────────────────────────────────────────
const bowler = new Bowler(); world.add(bowler.root);
const batter = new Batter(); world.add(batter.root); batter.mirrorStickers(true);
batter.reset(); batter.prepare(0); batter.update(0); batter.drape();
for (const figure of [bowler.root, batter.root]) figure.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });

const ball = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 20, 14), new THREE.MeshStandardMaterial({ color: 0xc0341c, roughness: .45 }));
ball.castShadow = true; world.add(ball);
let releasedAt: THREE.Vector3 | null = null;

/** The ball after it has left his hand, `ms` later: down to a yorker length and on to the bat. */
function ballAfter(ms: number) {
  const from = releasedAt!;
  const k = Math.min(1, ms / FLIGHT_MS);
  const bounceK = (from.z - YORKER_Z) / (from.z - GAME.contactZ);
  const z = THREE.MathUtils.lerp(from.z, GAME.contactZ, k);
  const x = THREE.MathUtils.lerp(from.x, GAME.stanceX + .2, k);
  const y = k < bounceK ? THREE.MathUtils.lerp(from.y, RADIUS, (k / bounceK) ** 1.15)
    : RADIUS + Math.sin((k - bounceK) / (1 - bounceK) * Math.PI * .5) * .12;
  return new THREE.Vector3(x, y, z);
}

// ── The camera ───────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(36, 1, .05, 200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI * .495; controls.minDistance = 1.5; controls.maxDistance = 60;
// Eyes and targets in the world's own frame, before the mirror: +x is the
// batter's off side, which the mirror puts on the screen's right as he faces the bowler.
const VIEWS: Record<string, { eye: [number, number, number]; at: [number, number, number]; fov: number }> = {
  batter: { eye: [0, 2.0, -3.2], at: [.3, 1.3, 20], fov: 17 },
  side: { eye: [-9, 1.6, 20.5], at: [.3, 1.2, 20.5], fov: 40 },
  front: { eye: [2.2, 1.7, 13.2], at: [.3, 1.3, 20], fov: 42 },
  behind: { eye: [.5, 2.2, 28.5], at: [.3, 1.2, 17], fov: 40 },
  above: { eye: [-5, 9, 20.5], at: [.3, .6, 20.3], fov: 40 },
};
const mirror = (p: readonly number[]) => new THREE.Vector3(-p[0], p[1], p[2]);
let follow = true;
let view = 'batter';
function placeCamera(name: string) {
  const v = VIEWS[name];
  view = name;
  camera.fov = v.fov; camera.updateProjectionMatrix();
  camera.position.copy(mirror(v.eye)); controls.target.copy(mirror(v.at));
  lastHips.copy(hips()); controls.update();
}
const hips = () => bowler.root.getWorldPosition(new THREE.Vector3());
const lastHips = new THREE.Vector3();

// ── Time ─────────────────────────────────────────────────────────────────────
const scrub = document.querySelector<HTMLInputElement>('#scrub')!;
const playButton = document.querySelector<HTMLButtonElement>('#play')!;
const readout = document.querySelector<HTMLOutputElement>('#time')!;
const phaseLabel = document.querySelector<HTMLOutputElement>('#phase')!;
const marks = document.querySelector<HTMLDivElement>('#marks')!;
scrub.max = String(ACTION_MS);

let playing = true, t = 0, speed = .25, previous = performance.now();
const phaseAt = (ms: number) => [...PHASE_MARKS].reverse().find(([, at]) => ms >= at)?.[0] ?? 'Run-in';

function pose(ms: number) {
  bowler.animate(Math.min(ms, ACTION_MS));
  if (ms < RUNUP_MS) { releasedAt = null; ball.visible = false; }
  else {
    if (!releasedAt) { bowler.runup(1); releasedAt = world.worldToLocal(bowler.releasePoint()); bowler.animate(ms); }
    const flight = ms - RUNUP_MS;
    ball.visible = flight <= FLIGHT_MS + 250;
    if (ball.visible) ball.position.copy(ballAfter(flight));
  }
  bowler.figure.drape();
}
function setPlaying(on: boolean) { playing = on; playButton.textContent = on ? 'Pause' : 'Play'; playButton.setAttribute('aria-pressed', String(on)); }
function seek(ms: number) { setPlaying(false); t = Math.max(0, Math.min(ACTION_MS, ms)); }
function choose(name: string) {
  bowler.action(ACTIONS[name].style); releasedAt = null;
  for (const o of document.querySelectorAll('[data-action]')) o.setAttribute('aria-pressed', String((o as HTMLElement).dataset.action === name));
  // His mark moves with his run, so a view framed on him is framed again.
  pose(t); placeCamera(view);
}

playButton.onclick = () => setPlaying(!playing);
scrub.oninput = () => seek(Number(scrub.value));
document.querySelector('#back')!.addEventListener('click', () => seek(Math.round(t) - 20));
document.querySelector('#fwd')!.addEventListener('click', () => seek(Math.round(t) + 20));
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
  b.onclick = () => {
    speed = Number(b.dataset.speed);
    for (const o of document.querySelectorAll('[data-speed]')) o.setAttribute('aria-pressed', String(o === b));
    setPlaying(true);
  };
}
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-action]')) b.onclick = () => choose(b.dataset.action!);
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-view]')) {
  b.onclick = () => {
    placeCamera(b.dataset.view!);
    for (const o of document.querySelectorAll('[data-view]')) o.setAttribute('aria-pressed', String(o === b));
  };
}
const followButton = document.querySelector<HTMLButtonElement>('#follow')!;
followButton.onclick = () => { follow = !follow; followButton.setAttribute('aria-pressed', String(follow)); lastHips.copy(hips()); };
marks.innerHTML = PHASE_MARKS.map(([name, at], i) =>
  `<button type="button" data-at="${at}" class="${i % 2 ? 'low' : ''}" style="left:${(at / ACTION_MS * 100).toFixed(2)}%">${name}</button>`).join('');
for (const b of marks.querySelectorAll<HTMLButtonElement>('button')) {
  // Into the phase a little, where it shows: the release itself is the last frame of the run-up.
  b.onclick = () => seek(b.textContent === 'Release' ? RUNUP_MS - 4 : Number(b.dataset.at) + 60);
}
addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
  if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(Math.round(t) - (e.shiftKey ? 100 : 20)); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); seek(Math.round(t) + (e.shiftKey ? 100 : 20)); }
});

function resize() {
  const { clientWidth: width, clientHeight: height } = stage;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduced) { setPlaying(false); t = PHASES.BOUND * RUNUP_MS + 80; }

let wrapped = 0;
function frame(now: number) {
  const dt = Math.min(64, now - previous); previous = now;
  if (playing) {
    wrapped += dt * speed;
    if (wrapped >= LOOP_MS) wrapped = 0;
    t = Math.min(ACTION_MS, wrapped);
  } else wrapped = t;
  pose(t);
  // Following, the camera and its target travel with his hips down the pitch,
  // however the viewer has turned it.
  const at = hips();
  if (follow) {
    const moved = at.clone().sub(lastHips); moved.y = 0;
    camera.position.add(moved); controls.target.add(moved);
  }
  lastHips.copy(at);
  controls.update();
  renderer.render(scene, camera);
  scrub.value = String(Math.round(t));
  readout.textContent = t <= RUNUP_MS ? `${(t / 1000).toFixed(2)} s` : `+${((t - RUNUP_MS) / 1000).toFixed(2)} s`;
  const phase = phaseAt(t);
  phaseLabel.textContent = phase;
  for (const b of marks.querySelectorAll('button')) b.classList.toggle('on', b.textContent === phase);
  requestAnimationFrame(frame);
}

resize(); choose('death'); placeCamera('batter');
requestAnimationFrame(frame);
