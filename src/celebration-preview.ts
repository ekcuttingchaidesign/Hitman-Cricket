/**
 * The hundred's four ways side by side (`celebration.html`): four of the
 * game's own batters on one clock, each playing one of the celebrations a
 * hundred draws from (`HUNDRED_STYLES`): the jump, the gun, the sword and to
 * the sky. Nothing is scored, sent or counted. `scripts/celebration-artifact.mjs` bundles it
 * into one HTML file.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Batter, celebrationBeats, type Posed } from './entities/Batter';
import { GAME } from './config/gameplay';
import { buildWicket } from './scene/wicket';
import { batSheet } from './entities/batSkins';
import { ALL_BATS, type BatSkin } from './game/dressing';

/**
 * The four hundreds, one drawn each hundred (`HundredStyle`): each stage plays
 * one, on one clock. The beats are named for the pill in each stage's corner.
 */
const STAGES: { id: string; kind: Posed; names: string[] }[] = [
  { id: 'jump', kind: 'hundred', names: ['Crouch', 'Spring', 'Leave', 'Top', 'Touch', 'Land', 'Up', 'Pump', 'Up', 'Pump', 'Look'] },
  { id: 'gun', kind: 'hundredGun', names: ['Rise', 'Aim', 'Aim', 'Bang', 'Aim', 'Bang', 'Aim', 'Bang', 'Aim', 'Swing round', 'Bang', 'Aim', 'Bang', 'Aim', 'Smoke', 'Smoke'] },
  // The swirl is keyed every 20ms off the clock: every key of it is Swirl, then the salute.
  { id: 'sword', kind: 'hundredSword', names: ['Rise', 'Lift', ...Array(celebrationBeats('hundredSword').keys.length - 3).fill('Swirl'), 'Salute'] },
  { id: 'sky', kind: 'hundredSky', names: ['Rise', 'Lift', 'To the sky', 'Held', 'Heart', 'Tap', 'Heart', 'Raised', 'Look'] },
];
/** Each one's moments by name, at their times. */
const named = (kind: Posed, names: string[]) => {
  const b = celebrationBeats(kind);
  return [...b.keys.map((t, i) => ({ t, name: names[i] })), { t: b.back, name: 'Back' }, { t: b.down, name: 'Down' }, { t: b.settle, name: 'Settle' }, { t: b.total, name: 'Guard' }];
};
const BEATS = STAGES.map(s => named(s.kind, s.names));
const END = Math.max(...BEATS.map(b => b.at(-1)!.t)) + 150;

/** What to look at, each with the moment and the stage it shows best. */
const GAPS = [
  { t: 520, title: 'Taking aim', text: 'The bat brought up like a rifle: the handle against his right shoulder, the blade out level, the left hand under it and his head down along it.' },
  { t: 570, title: 'The shots', text: 'Three shots at the crowd, each one kicking the bat back into him and its end up. Then swung round onto another stand for two more.' },
  { t: 1800, title: 'Blowing the smoke', text: 'The bat stood up in front of his face and the smoke blown off its end, the other hand on his hip. Then back to his stance.' },
  { t: 760, title: 'The swirl', text: 'Jadeja\'s sword: the bat held by the handle out in front of him, the arm out long, swirled slowly so its tip draws one figure of eight on its side, gathering speed and easing off. The path has no corners.' },
  { t: 1900, title: 'Into the salute', text: 'The swirl runs on and slows while the blade rises, so the tip carries round and up into the salute before his face. Then back to his stance.' },
  { t: 800, title: 'To the sky', text: 'Both arms straight up and close together, the bat pointing at the sky, his head right back. Quieter than the jump, and held longer.' },
  { t: 1320, title: 'Hand on heart', text: 'The left hand comes down to his heart and taps it, the bat back beside his head, then raised to the crowd.' },
];
function lights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xfff6ea, 0x3d4a3a, 2.2));
  const sun = new THREE.DirectionalLight(0xffeedd, 2.6);
  sun.position.set(3, 7, 4); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 16 });
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0xbfd6ff, 1.1); rim.position.set(-4, 3, -5); scene.add(rim);
}

/** One stage: the pitch, the stumps and a batter, mirrored as the game's is so he is right-handed. */
function stage(host: HTMLElement, kind: Posed) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#0e1a14');
  scene.fog = new THREE.Fog('#0e1a14', 16, 40); lights(scene);
  const world = new THREE.Group(); world.scale.x = -1; scene.add(world);
  const outfield = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 1 }));
  outfield.rotation.x = -Math.PI / 2; outfield.receiveShadow = true; world.add(outfield);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 22), new THREE.MeshStandardMaterial({ color: 0xc8b98a, roughness: 1 }));
  strip.rotation.x = -Math.PI / 2; strip.position.set(0, .002, 9.35); strip.receiveShadow = true; world.add(strip);
  buildWicket(world, GAME.stumpHeight, 0);
  const batter = new Batter(); world.add(batter.root); batter.mirrorStickers(true);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.prepend(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(30, 1, .05, 80);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * .55; controls.minDistance = 2; controls.maxDistance = 14;
  /** Him at `age` of the celebration, from his guard as the game starts it. */
  const pose = (age: number) => {
    batter.reset(); batter.prepare(0); batter.update(0);
    batter.celebrate(0, kind); batter.update(Math.max(.001, age));
    batter.drape(); batter.root.updateMatrixWorld(true);
  };
  return { scene, renderer, camera, controls, pose, host, batter };
}

const stages = STAGES.map(s => stage(document.querySelector(`#${s.id}`)!, s.kind));

/** Where each camera stands: round him from his chest, the stills' own convention (`recap-render`). */
const VIEWS: Record<string, { az: number; el: number; dist: number }> = {
  game: { az: -90, el: 12, dist: 7.5 },
  front: { az: -50, el: 6, dist: 7 },
  side: { az: 0, el: 4, dist: 7 },
  card: { az: 20, el: -12, dist: 6.5 },
};
// Aimed at him in his guard, not at the stumps he stands beside.
stages[0].pose(0);
const CENTRE = new THREE.Box3().setFromObject(stages[0].batter.root).getCenter(new THREE.Vector3()).setY(1.2);
let syncing = false;
function aim(key: string) {
  const v = VIEWS[key];
  const az = THREE.MathUtils.degToRad(v.az), el = THREE.MathUtils.degToRad(v.el);
  const dir = new THREE.Vector3(-Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
  syncing = true;
  for (const s of stages) { s.camera.position.copy(CENTRE).addScaledVector(dir, v.dist); s.controls.target.copy(CENTRE); s.controls.update(); }
  syncing = false;
}
// Either stage dragged, the other follows.
for (const s of stages) s.controls.addEventListener('change', () => {
  if (syncing) return; syncing = true;
  for (const o of stages) if (o !== s) { o.camera.position.copy(s.camera.position); o.controls.target.copy(s.controls.target); o.controls.update(); }
  syncing = false;
});

// ── The clock ────────────────────────────────────────────────────────────────
const scrub = document.querySelector<HTMLInputElement>('#scrub')!;
const time = document.querySelector<HTMLOutputElement>('#time')!;
const play = document.querySelector<HTMLButtonElement>('#play')!;
const beats = STAGES.map(s => document.querySelector<HTMLOutputElement>(`#beat-${s.id}`)!);
scrub.max = String(END);

let t = 360, playing = false, speed = .5, last = 0, held = 0;
const beatAt = (beats: { t: number; name: string }[], ms: number) => ms < beats[0].t ? 'Guard' : [...beats].reverse().find(b => ms >= b.t)!.name;
function show(ms: number) {
  t = Math.max(0, Math.min(END, ms));
  scrub.value = String(Math.round(t));
  time.textContent = `${Math.round(t)} ms`;
  beats.forEach((b, i) => { b.textContent = beatAt(BEATS[i], t); });
  for (const s of stages) s.pose(t);
}
scrub.oninput = () => { setPlaying(false); show(Number(scrub.value)); };
function setPlaying(on: boolean) {
  playing = on; play.textContent = on ? 'Pause' : 'Play'; play.setAttribute('aria-pressed', String(on));
  if (on && t >= END) t = 0;
  last = performance.now(); held = 0;
}
play.onclick = () => setPlaying(!playing);
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) b.onclick = () => {
  speed = Number(b.dataset.speed);
  for (const o of document.querySelectorAll('[data-speed]')) o.setAttribute('aria-pressed', String(o === b));
};
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-view]')) b.onclick = () => {
  for (const o of document.querySelectorAll('[data-view]')) o.setAttribute('aria-pressed', String(o === b));
  aim(b.dataset.view!);
};
addEventListener('keydown', e => {
  if (e.key === ' ' && e.target === document.body) { e.preventDefault(); setPlaying(!playing); }
  if (e.key === 'ArrowRight') { setPlaying(false); show(t + 10); }
  if (e.key === 'ArrowLeft') { setPlaying(false); show(t - 10); }
});

// ── The bat in both their hands ─────────────────────────────────────────────
const batRow = document.querySelector<HTMLDivElement>('#bats')!;
async function holdBat(bat: BatSkin) {
  for (const b of batRow.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.bat === bat.id));
  const sheet = await batSheet(bat.id);
  for (const s of stages) s.batter.holdBat(bat.grip, sheet);
  show(t);
}
for (const bat of ALL_BATS) {
  const b = document.createElement('button'); b.dataset.bat = bat.id; b.setAttribute('aria-pressed', 'false');
  const dot = document.createElement('i'); dot.style.background = bat.grip;
  b.append(dot, document.createTextNode(bat.name));
  b.onclick = () => void holdBat(bat);
  batRow.append(b);
}

// ── The gaps ─────────────────────────────────────────────────────────────────
const gaps = document.querySelector<HTMLDivElement>('#gaps')!;
for (const g of GAPS) {
  const card = document.createElement('article'); card.className = 'gap';
  const h = document.createElement('h3'); h.textContent = g.title;
  const p = document.createElement('p'); p.textContent = g.text;
  const go = document.createElement('button'); go.textContent = `Go to ${g.t} ms`;
  go.onclick = () => { setPlaying(false); show(g.t); document.querySelector('.stages')!.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  card.append(h, p, go); gaps.append(card);
}

function resize() {
  for (const s of stages) {
    const w = s.host.clientWidth, h = s.host.clientHeight;
    s.renderer.setSize(w, h, false); s.camera.aspect = w / Math.max(1, h);
    // A narrow stage widens the lens so he keeps both arms and the bat across it: at least 26 degrees side to side.
    s.camera.fov = Math.max(30, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(13)) / s.camera.aspect)));
    s.camera.updateProjectionMatrix();
  }
}
addEventListener('resize', resize);

function frame(now: number) {
  if (playing) {
    const dt = Math.min(100, now - last); last = now;
    if (t >= END) { held += dt; if (held > 700) { held = 0; show(0); } }
    else show(t + dt * speed);
  }
  for (const s of stages) { s.controls.update(); s.renderer.render(s.scene, s.camera); }
  requestAnimationFrame(frame);
}

resize(); aim('front'); show(t); void holdBat(ALL_BATS.find(b => b.id === 'boom')!);
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setPlaying(true);
requestAnimationFrame(frame);
(window as unknown as { __celebration: object }).__celebration = { show, aim, play: setPlaying, bat: (id: string) => holdBat(ALL_BATS.find(b => b.id === id)!), ready: true };
