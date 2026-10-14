/**
 * The cover drive on its own, for reworking it: the game's `Batter`, a right-
 * hander, playing the one stroke against a ball that comes down the pitch, is
 * met at the red marker and goes off through the covers.
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
import { Batter, STROKE_CONTACT_MS, STROKE_DURATION_MS } from './entities/Batter';
import { GAME, LINE_X } from './config/gameplay';
import { buildWicket } from './scene/wicket';

/** The ball the game plays a cover drive at: on off stump, full, met at knee-roll height. */
const BALL = { x: LINE_X.OFF, y: .54, z: GAME.contactZ };
/** Ball time before the swing starts, so the delivery can be seen arriving. */
const LEAD_MS = 260;
const END_MS = STROKE_DURATION_MS;
/** The stroke's own clock, as `STROKES.COVER_LONG_OFF` is keyed. */
const PHASES = [
  ['Backlift', -LEAD_MS], ['Contact', STROKE_CONTACT_MS], ['Through', 220], ['Carry', 310], ['Finish', 410], ['Recovery', 700],
] as const;
/** Incoming pace and the shot's pace and line off the bat (from straight, towards the off side). */
const IN_SPEED = .030, OUT_SPEED = .024, OUT_ANGLE = THREE.MathUtils.degToRad(58), BOUNCE_Z = 3.5;
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
marker.position.set(BALL.x, BALL.y, BALL.z); world.add(marker);

/** Where the ball is at time `t` on the stroke's clock, in the rig's frame. */
function ballAt(t: number): [number, number, number] {
  const dt = t - STROKE_CONTACT_MS;
  if (dt <= 0) {
    const z = BALL.z - dt * IN_SPEED;
    if (z <= BOUNCE_Z) {
      const k = (z - BALL.z) / (BOUNCE_Z - BALL.z);
      return [BALL.x, RADIUS + (BALL.y - RADIUS) * (1 - k) + .18 * k * (1 - k), z];
    }
    const k = Math.min(1, (z - BOUNCE_Z) / 9);
    return [BALL.x, RADIUS + 2.0 * k - .55 * k * k, z];
  }
  // Off the bat: down into the ground quickly, then along it through the covers.
  const s = dt * OUT_SPEED, fall = Math.min(1, dt / 90);
  const y = THREE.MathUtils.lerp(BALL.y, RADIUS, fall * fall) + .06 * Math.sin(Math.min(1, dt / 90) * Math.PI);
  return [BALL.x + Math.sin(OUT_ANGLE) * s, y, BALL.z + Math.cos(OUT_ANGLE) * s];
}

const camera = new THREE.PerspectiveCamera(36, 1, .05, 80);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI * .49;
const mirror = (p: readonly number[]) => new THREE.Vector3(-(GAME.stanceX + p[0]), p[1], GAME.stanceZ + p[2]);
function placeCamera(view: string) {
  const v = VIEWS[view];
  camera.position.copy(mirror(v.eye)); controls.target.copy(mirror(v.at)); controls.update();
}

/** Puts the batter and the ball at time `t`. Before the swing he holds his backlift. */
function pose(t: number) {
  if (t < 0) { batter.prepare(1); batter.update(0); } else batter.update(t);
  ball.position.fromArray(ballAt(t));
  marker.visible = t <= STROKE_CONTACT_MS + 140;
  batter.drape();
}

function start() {
  batter.reset(); batter.prepare(1); batter.update(0);
  batter.swing('COVER_LONG_OFF', 0, BALL.x, BALL.y, BALL.z);
}

// ── Controls ─────────────────────────────────────────────────────────────────
const scrub = document.querySelector<HTMLInputElement>('#scrub')!;
const playButton = document.querySelector<HTMLButtonElement>('#play')!;
const readout = document.querySelector<HTMLOutputElement>('#time')!;
const phaseLabel = document.querySelector<HTMLOutputElement>('#phase')!;
const strip_ = document.querySelector<HTMLDivElement>('#frames')!;
scrub.min = String(-LEAD_MS); scrub.max = String(END_MS);

let playing = true, t = -LEAD_MS, speed = .5, previous = performance.now(), view = 'side';
const phaseAt = (time: number) => [...PHASES].reverse().find(([, at]) => time >= at)?.[0] ?? 'Backlift';
function setPlaying(on: boolean) { playing = on; playButton.textContent = on ? 'Pause' : 'Play'; playButton.setAttribute('aria-pressed', String(on)); }
function seek(time: number) { setPlaying(false); t = Math.max(-LEAD_MS, Math.min(END_MS, time)); }

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
  shotCam.position.copy(mirror([4.6, 1.25, .45])); shotCam.lookAt(mirror([.12, .95, .3]));
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  for (const [label, at] of PHASES) {
    pose(at); renderer.render(scene, shotCam);
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
}

function frame(now: number) {
  const step = Math.min(now - previous, 50); previous = now;
  if (playing) { t += step * speed; if (t > END_MS + 300) t = -LEAD_MS; }
  const shown = Math.min(t, END_MS);
  pose(shown);
  scrub.value = String(Math.round(shown));
  readout.textContent = `${Math.round(shown)} ms`;
  const phase = phaseAt(shown);
  phaseLabel.textContent = phase;
  for (const b of strip_.children) (b as HTMLElement).classList.toggle('on', b.querySelector('b')!.textContent === phase);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

start();
contactSheet();
start();
placeCamera(view); resize();
if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setPlaying(false); t = STROKE_CONTACT_MS; }
requestAnimationFrame(frame);
