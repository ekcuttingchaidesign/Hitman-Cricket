/**
 * The batting gloves, for choosing the Dressing Room's: every design in the
 * catalogue (`entities/gloves.ts`), the Classic pair the game has always had
 * first, each as a pair on a handle and on the game's own `Batter` in a pose.
 *
 * The pair on the handle is lifted off a batter standing in his guard, so it
 * is the grip he holds, not a picture of one. The stage is mirrored as the
 * game's is, so he is right-handed. Nothing is scored, sent or counted.
 * `scripts/gloves-artifact.mjs` bundles it into one HTML file.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Batter, HOOK_MEETS_AT } from './entities/Batter';
import { GLOVES, type GloveDesign } from './entities/gloves';
import { GAME, LINE_X } from './config/gameplay';
import { buildWicket } from './scene/wicket';
import type { ShotType } from './game/types';

interface Pose { label: string; shot?: ShotType; at: number; ball?: [number, number, number]; lofted?: boolean; lift?: number }
const POSES: Record<string, Pose> = {
  guard: { label: 'Guard', at: -1, lift: 0 },
  backlift: { label: 'Backlift', at: -1, lift: 1 },
  cover: { label: 'Cover drive', shot: 'COVER_LONG_OFF', at: 300, ball: [LINE_X.OFF, .54, GAME.contactZ] },
  six: { label: 'Straight six', shot: 'STRAIGHT', at: 330, lofted: true, ball: [LINE_X.MIDDLE, .54, GAME.contactZ] },
  hook: { label: 'Hook wrap', shot: 'HOOK', at: 520, ball: [LINE_X.OUTSIDE_OFF, 1.134, GAME.contactZ + HOOK_MEETS_AT] },
};

const mirror = (p: THREE.Vector3) => p.setX(-p.x);

/** Puts a batter in a pose, its clothes fitted. */
function strike(batter: Batter, pose: Pose) {
  batter.reset(); batter.prepare(pose.shot ? 1 : pose.lift ?? 0); batter.update(0);
  if (pose.shot) {
    const [x, y, z] = pose.ball!;
    batter.swing(pose.shot, 0, x, y, z, false, !!pose.lofted, false, false, 2, false);
    batter.update(pose.at);
  }
  batter.drape();
  batter.root.updateMatrixWorld(true);
}

const named = (root: THREE.Object3D, name: string) => root.getObjectByName(name)!;
/** The two hands' midpoint, in the world. */
function handsOf(batter: Batter) {
  const a = named(batter.root, 'Left top glove — overhand').getWorldPosition(new THREE.Vector3());
  const b = named(batter.root, 'Right bottom glove — underhand').getWorldPosition(new THREE.Vector3());
  return a.add(b).multiplyScalar(.5);
}

// ── The pair on a handle ─────────────────────────────────────────────────────
/**
 * Both gloves and both gauntlets as a batter in his guard holds them, taken
 * into the bat's frame, round the bat's grip. Shares the batter's geometry and
 * materials, so it is exactly what he wears.
 */
const model = new Batter();
function pairOf(design: GloveDesign) {
  model.wearGloves(design);
  strike(model, POSES.guard);
  const top = named(model.root, 'Left top glove — overhand'), bat = top.parent!;
  const inverse = bat.matrixWorld.clone().invert();
  const pair = new THREE.Group();
  const take = (part: THREE.Object3D) => {
    const copy = part.clone();
    copy.matrixAutoUpdate = false;
    copy.matrix.multiplyMatrices(inverse, part.matrixWorld);
    copy.visible = true;
    pair.add(copy);
  };
  take(top); take(named(model.root, 'Right bottom glove — underhand'));
  take(named(model.root, 'Left gauntlet')); take(named(model.root, 'Right gauntlet'));
  const grip = bat.children.find(c => (c as THREE.Mesh).geometry?.type === 'LatheGeometry');
  if (grip) take(grip);
  // Centred on the fists, and right-handed.
  const holder = new THREE.Group(); holder.add(pair);
  pair.position.set(0, -.02, 0);
  holder.scale.x = -1;
  return holder;
}

const lights = (scene: THREE.Scene, shadows: boolean) => {
  scene.add(new THREE.HemisphereLight(0xfff6ea, 0x3d4a3a, 2.2));
  const sun = new THREE.DirectionalLight(0xffeedd, 2.6);
  sun.position.set(3, 7, 4); sun.castShadow = shadows;
  if (shadows) { sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 1, far: 16 }); }
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0xbfd6ff, 1.1); rim.position.set(-4, 3, -5); scene.add(rim);
};

function renderer(host: HTMLElement) {
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.outputColorSpace = THREE.SRGBColorSpace;
  host.append(r.domElement);
  return r;
}

const studio = new THREE.Scene(); studio.background = new THREE.Color('#14181d'); lights(studio, false);
const closeHost = document.querySelector<HTMLDivElement>('#close')!;
const closeRenderer = renderer(closeHost);
const closeCamera = new THREE.PerspectiveCamera(30, 1, .01, 10);
const closeControls = new OrbitControls(closeCamera, closeRenderer.domElement);
closeControls.enableDamping = true; closeControls.autoRotate = true; closeControls.autoRotateSpeed = 1.6;
closeControls.minDistance = .2; closeControls.maxDistance = 1.2;
closeCamera.position.set(.11, .05, .74); closeControls.target.set(0, -.02, 0);
let shownPair: THREE.Object3D | null = null;

// ── On the batter ────────────────────────────────────────────────────────────
const ground = new THREE.Scene(); ground.background = new THREE.Color('#0e1a14');
ground.fog = new THREE.Fog('#0e1a14', 14, 34); lights(ground, true);
const world = new THREE.Group(); world.scale.x = -1; ground.add(world);
const outfield = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 1 }));
outfield.rotation.x = -Math.PI / 2; outfield.receiveShadow = true; world.add(outfield);
const strip = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 22), new THREE.MeshStandardMaterial({ color: 0xc8b98a, roughness: 1 }));
strip.rotation.x = -Math.PI / 2; strip.position.set(0, .002, 9.35); strip.receiveShadow = true; world.add(strip);
buildWicket(world, GAME.stumpHeight, 0);
const batter = new Batter(); world.add(batter.root); batter.mirrorStickers(true);

const bodyHost = document.querySelector<HTMLDivElement>('#body')!;
const bodyRenderer = renderer(bodyHost);
const bodyCamera = new THREE.PerspectiveCamera(32, 1, .02, 80);
const bodyControls = new OrbitControls(bodyCamera, bodyRenderer.domElement);
bodyControls.enableDamping = true; bodyControls.maxPolarAngle = Math.PI * .52;

/** Where the camera stands, from the hands: close up, the whole of him, or the game's own view down the pitch. */
const VIEWS: Record<string, { eye: [number, number, number]; full?: boolean }> = {
  hands: { eye: [.75, .25, .95] },
  full: { eye: [3.1, .55, 2.7], full: true },
  game: { eye: [-.4, 1.3, -5.6], full: true },
};
let view = 'hands', pose = 'guard', design = GLOVES[0];

function aim(camera: THREE.PerspectiveCamera, controls: OrbitControls, key: string, target = handsOf(batter)) {
  const v = VIEWS[key];
  const at = v.full ? new THREE.Vector3(target.x * .4, .95, target.z * .4) : target;
  camera.position.copy(at).add(mirror(new THREE.Vector3(...v.eye)));
  controls.target.copy(at); controls.update();
}

function setPose(key: string) {
  pose = key; strike(batter, POSES[key]);
  aim(bodyCamera, bodyControls, view);
}

// ── The line-up: every design on him, the same pose and camera ──────────────
const sheet = document.querySelector<HTMLDivElement>('#lineup')!;
function lineUp() {
  const W = 300, H = 300, cam = new THREE.PerspectiveCamera(30, W / H, .02, 80);
  bodyRenderer.setPixelRatio(1); bodyRenderer.setSize(W, H, false);
  const kept = design;
  for (const [i, glove] of GLOVES.entries()) {
    batter.wearGloves(glove); strike(batter, POSES[pose]);
    const hands = handsOf(batter);
    cam.position.copy(hands).add(mirror(new THREE.Vector3(.62, .2, .8))); cam.lookAt(hands);
    bodyRenderer.render(ground, cam);
    const canvas = sheet.querySelectorAll('canvas')[i];
    canvas.getContext('2d')!.drawImage(bodyRenderer.domElement, 0, 0, W, H);
  }
  bodyRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  wear(kept); resize();
}

// ── The picker: each design's pair, photographed for its card ────────────────
const cards = document.querySelector<HTMLDivElement>('#designs')!;
function pick() {
  const W = 220, H = 220, cam = new THREE.PerspectiveCamera(30, 1, .01, 10);
  closeRenderer.setPixelRatio(1); closeRenderer.setSize(W, H, false);
  cam.position.set(.1, .05, .6); cam.lookAt(0, -.012, 0);
  for (const [i, glove] of GLOVES.entries()) {
    const pair = pairOf(glove); studio.add(pair);
    closeRenderer.render(studio, cam);
    studio.remove(pair);
    const button = cards.children[i] as HTMLButtonElement;
    button.querySelector('canvas')!.getContext('2d')!.drawImage(closeRenderer.domElement, 0, 0, W, H);
  }
  closeRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
}

const title = document.querySelector<HTMLElement>('#name')!;
const line = document.querySelector<HTMLElement>('#line')!;
const tag = document.querySelector<HTMLElement>('#tag')!;
function wear(glove: GloveDesign) {
  design = glove;
  batter.wearGloves(glove); strike(batter, POSES[pose]);
  if (shownPair) studio.remove(shownPair);
  shownPair = pairOf(glove); studio.add(shownPair);
  title.textContent = glove.name;
  line.textContent = glove.line;
  tag.textContent = glove.id === 'classic' ? 'Current' : 'New';
  tag.dataset.kind = glove.id === 'classic' ? 'current' : 'new';
  for (const b of cards.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.glove === glove.id));
}

for (const glove of GLOVES) {
  const button = document.createElement('button');
  button.className = 'design'; button.dataset.glove = glove.id;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 220;
  const swatch = document.createElement('span'); swatch.className = 'swatches';
  const colours = [glove.base, ...glove.rolls.map(r => typeof r === 'string' ? r : r.ground), glove.knuckleBar && typeof glove.knuckleBar.colour === 'string' ? glove.knuckleBar.colour : glove.base,
    glove.cuff.bands[0]?.colour ?? glove.cuff.base];
  for (const c of [...new Set(colours.map(c => c.toUpperCase()))].slice(0, 5)) {
    const dot = document.createElement('i'); dot.style.background = c; swatch.append(dot);
  }
  const label = document.createElement('span'); label.className = 'label';
  label.innerHTML = `<b>${glove.name}</b><em>${glove.id === 'classic' ? 'Current' : 'New'}</em>`;
  button.append(canvas, label, swatch);
  button.onclick = () => wear(glove);
  cards.append(button);
  const figure = document.createElement('figure');
  const still = document.createElement('canvas'); still.width = still.height = 300;
  const caption = document.createElement('figcaption');
  caption.innerHTML = `<b>${glove.name}</b><em>${glove.id === 'classic' ? 'Current' : 'New'}</em>`;
  figure.append(still, caption); figure.onclick = () => wear(glove);
  sheet.append(figure);
}

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-pose]')) {
  b.onclick = () => {
    for (const o of document.querySelectorAll('[data-pose]')) o.setAttribute('aria-pressed', String(o === b));
    setPose(b.dataset.pose!); lineUp();
  };
}
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-view]')) {
  b.onclick = () => {
    for (const o of document.querySelectorAll('[data-view]')) o.setAttribute('aria-pressed', String(o === b));
    view = b.dataset.view!; aim(bodyCamera, bodyControls, view);
  };
}
/** The close-up from the bat's flat face, from its curved back, or edge on: the face is +z on the handle. */
const SIDES: Record<string, [number, number, number]> = { face: [.11, .05, .74], back: [.3, .16, -.66], edge: [-.76, .05, .05] };
function side(key: string) {
  closeControls.autoRotate = false; spin.setAttribute('aria-pressed', 'false');
  closeCamera.position.set(...SIDES[key]); closeControls.target.set(0, -.02, 0); closeControls.update();
  for (const o of document.querySelectorAll('[data-side]')) o.setAttribute('aria-pressed', String((o as HTMLElement).dataset.side === key));
}
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-side]')) b.onclick = () => side(b.dataset.side!);
const spin = document.querySelector<HTMLButtonElement>('#spin')!;
spin.onclick = () => {
  closeControls.autoRotate = !closeControls.autoRotate;
  spin.setAttribute('aria-pressed', String(closeControls.autoRotate));
  if (closeControls.autoRotate) for (const o of document.querySelectorAll('[data-side]')) o.setAttribute('aria-pressed', 'false');
};

function resize() {
  for (const [host, r, camera] of [[closeHost, closeRenderer, closeCamera], [bodyHost, bodyRenderer, bodyCamera]] as const) {
    r.setSize(host.clientWidth, host.clientHeight, false);
    camera.aspect = host.clientWidth / Math.max(1, host.clientHeight); camera.updateProjectionMatrix();
  }
}
addEventListener('resize', resize);

pick();
wear(GLOVES[1]);
setPose('guard');
lineUp();
if (matchMedia('(prefers-reduced-motion: reduce)').matches) { closeControls.autoRotate = false; spin.setAttribute('aria-pressed', 'false'); }
(window as unknown as { __gloves: object }).__gloves = { wear: (id: string) => wear(GLOVES.find(g => g.id === id)!), setPose, side, ready: true };

function frame() {
  closeControls.update(); bodyControls.update();
  closeRenderer.render(studio, closeCamera);
  bodyRenderer.render(ground, bodyCamera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
