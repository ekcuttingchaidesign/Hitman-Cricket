/**
 * The batter's model on a turntable, for looking at the female build
 * (`Batter.shapeAs`) beside the male one: in her guard, playing a few
 * strokes on a loop, celebrating, in any Dressing Room kit and guard, at any
 * speed. Nothing is bowled or scored. `batter-model.html` is the page;
 * `scripts/batter-model-artifact.mjs` bundles it into one HTML file.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Batter, CELEBRATION_LENGTHS, HOOK_HOLD_MS, HOOK_MEETS_AT, PULL_MEETS_AT, STROKE_DURATION_MS } from './entities/Batter';
import { GAME, LINE_X } from './config/gameplay';
import { buildWicket } from './scene/wicket';
import type { ShotType } from './game/types';
import { GLOVES, gloveOf } from './entities/gloves';
import { OUTFITS } from './game/dressing';
import { physiqueOf, type Physique } from './entities/physique';

interface Action {
  label: string;
  /** A stroke at a ball met here, in the rig's frame, played to its end; or the celebration. */
  shot?: ShotType; lofted?: boolean; version?: number;
  ball?: [number, number, number];
  end: number;
  celebrate?: boolean;
}
const ACTIONS: Record<string, Action> = {
  guard: { label: 'Guard', end: Infinity },
  cover: { label: 'Cover drive', shot: 'COVER_LONG_OFF', version: 2, ball: [LINE_X.OFF, .54, GAME.contactZ], end: STROKE_DURATION_MS },
  loft: { label: 'Straight six', shot: 'STRAIGHT', lofted: true, version: 2, ball: [LINE_X.MIDDLE, .54, GAME.contactZ], end: STROKE_DURATION_MS },
  pull: { label: 'Pull', shot: 'LEG', version: 2, ball: [LINE_X.MIDDLE, 1.12, GAME.contactZ + PULL_MEETS_AT], end: STROKE_DURATION_MS + HOOK_HOLD_MS },
  hook: { label: 'Hook', shot: 'HOOK', ball: [LINE_X.OUTSIDE_OFF, 1.134, GAME.contactZ + HOOK_MEETS_AT], end: STROKE_DURATION_MS + HOOK_HOLD_MS },
  hundred: { label: 'Hundred', celebrate: true, end: CELEBRATION_LENGTHS.hundred },
};
/** Before a stroke, rising into the backlift; after it, a moment back in the guard. */
const LEAD_MS = 650, REST_MS = 1100;

// Camera eyes and targets in the rig's frame (off side +x), from where he takes guard.
const VIEWS: Record<string, { eye: [number, number, number]; at: [number, number, number] }> = {
  front: { eye: [-.3, 1.45, 4.4], at: [0, 1.0, .1] },
  side: { eye: [3.6, 1.4, .2], at: [0, 1.0, .1] },
  behind: { eye: [.25, 1.65, -3.2], at: [0, 1.15, .2] },
  close: { eye: [-.9, 1.6, -1.6], at: [0, 1.38, .05] },
};

const stage = document.querySelector<HTMLDivElement>('#stage')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.append(renderer.domElement);

const scene = new THREE.Scene(); scene.background = new THREE.Color('#0d1612');
scene.fog = new THREE.Fog('#0d1612', 9, 22);
scene.add(new THREE.HemisphereLight(0xfff4e6, 0x2f4a2c, 2.1));
const key = new THREE.DirectionalLight(0xfff0de, 2.8);
key.position.set(2.5, 6, 3.5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 3, bottom: -1, near: 1, far: 14 });
const rim = new THREE.DirectionalLight(0xffb48f, 1.4); rim.position.set(-3, 3, -4);
scene.add(key, key.target, rim);

// The ground, mirrored as the game's stage is so a right-hander's leg side reads left.
const world = new THREE.Group(); world.scale.x = -1; scene.add(world);
const grass = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ color: 0x3c7537, roughness: 1 }));
grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; world.add(grass);
const strip = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 12), new THREE.MeshStandardMaterial({ color: 0xc9b98a, roughness: 1 }));
strip.rotation.x = -Math.PI / 2; strip.position.set(0, .002, 4.4); strip.receiveShadow = true; world.add(strip);
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

const camera = new THREE.PerspectiveCamera(34, 1, .05, 60);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.minDistance = .9; controls.maxDistance = 9;
controls.maxPolarAngle = Math.PI / 2 - .04; controls.autoRotateSpeed = 1.6;
/** A point in the rig's frame, relative to where he takes guard, in the mirrored world. */
const rig = (p: readonly number[]) => new THREE.Vector3(-(GAME.stanceX + p[0]), p[1], GAME.stanceZ + p[2]);
function view(name: string) {
  const v = VIEWS[name];
  camera.position.copy(rig(v.eye)); controls.target.copy(rig(v.at)); controls.update();
  press('view', name);
}

function fit() {
  const { clientWidth: w, clientHeight: h } = stage;
  renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
}
new ResizeObserver(fit).observe(stage);

// ── What he or she is doing, on one clock that only ever runs forward ───────
let now = 0, speed = 1, action = 'cover', cycleFrom = 0, swung = false;
function begin(name: string) {
  action = name; cycleFrom = now; swung = false;
  batter.alive = name === 'guard';
  batter.reset(); batter.prepare(0); batter.update(now);
  press('action', name);
}
function tick() {
  const a = ACTIONS[action], age = now - cycleFrom;
  if (action === 'guard') { batter.update(now); return; }
  if (a.celebrate) {
    if (!swung) { batter.celebrate(now, 'hundred'); swung = true; }
    batter.update(now);
    if (age > a.end + REST_MS) { cycleFrom = now; swung = false; batter.reset(); }
    return;
  }
  if (age < LEAD_MS) { batter.prepare(THREE.MathUtils.smoothstep(age, 0, LEAD_MS)); batter.update(now); return; }
  if (!swung) {
    const [x, y, z] = a.ball!;
    batter.swing(a.shot!, now, x, y, z, false, !!a.lofted, false, false, (a.version ?? 2) as 1 | 2 | 3);
    swung = true;
  }
  batter.update(now);
  if (age > LEAD_MS + a.end + REST_MS) { cycleFrom = now; swung = false; batter.reset(); batter.prepare(0); }
}

// ── Controls ────────────────────────────────────────────────────────────────
function press(group: string, value: string) {
  for (const b of document.querySelectorAll<HTMLButtonElement>(`[data-${group}]`)) b.setAttribute('aria-pressed', String(b.dataset[group] === value));
}
function build(physique: Physique) {
  batter.shapeAs(physique);
  batter.root.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  press('build', physique);
  const note = document.querySelector<HTMLElement>('#build-note');
  if (note) note.hidden = physique !== 'female';
}
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-build]')) b.onclick = () => build(physiqueOf(b.dataset.build));
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-action]')) b.onclick = () => begin(b.dataset.action!);
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-view]')) b.onclick = () => view(b.dataset.view!);
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) b.onclick = () => { speed = Number(b.dataset.speed); press('speed', b.dataset.speed!); };
const spin = document.querySelector<HTMLButtonElement>('#spin')!;
spin.onclick = () => { controls.autoRotate = !controls.autoRotate; spin.setAttribute('aria-pressed', String(controls.autoRotate)); };

function swatches(host: string, items: readonly { id: string; name: string; colour: string }[], pick: (id: string) => void) {
  const row = document.querySelector<HTMLDivElement>(host)!;
  for (const item of items) {
    const b = document.createElement('button');
    b.className = 'swatch'; b.dataset[host.slice(1)] = item.id; b.title = item.name; b.setAttribute('aria-label', item.name);
    b.style.setProperty('--sw', item.colour); b.onclick = () => { pick(item.id); press(host.slice(1), item.id); };
    row.append(b);
  }
}
swatches('#kit', OUTFITS.map(o => ({ id: o.id, name: o.name, colour: o.shirt })), id => batter.wear(OUTFITS.find(o => o.id === id)!));
swatches('#guard', GLOVES.map(g => ({ id: g.id, name: g.name, colour: g.glow })), id => batter.wearGloves(gloveOf(id)));
press('kit', 'home'); press('guard', 'sterling');

build('female');
begin('cover');
view('front');
controls.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
spin.setAttribute('aria-pressed', String(controls.autoRotate));
fit();

let last = performance.now();
function frame(at: number) {
  now += Math.min(100, at - last) * speed; last = at;
  tick(); batter.drape(); controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
