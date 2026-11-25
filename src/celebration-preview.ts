/**
 * The hundred beside a try at it with the arms held aloft (`celebration.html`):
 * two of the game's own batters on one clock, the one celebrating as the game
 * does and the other with `hundredAloft`, a routine the game never plays. For
 * the owner to find what the try still gets wrong before it goes in. Nothing
 * is scored, sent or counted. `scripts/celebration-artifact.mjs` bundles it
 * into one HTML file.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Batter, celebrationBeats, type Posed } from './entities/Batter';
import { GAME } from './config/gameplay';
import { buildWicket } from './scene/wicket';
import { batSheet } from './entities/batSkins';
import { ALL_BATS, type BatSkin } from './game/dressing';

const NOW: Posed = 'hundred', TRY: Posed = 'hundredAloft';
const beats = celebrationBeats(NOW);
/** The hundred's beats by name, at their times: the try keeps the same clock. */
const NAMES = ['Rise', 'Lift', 'Up', 'Pump', 'Up', 'Pump', 'Look'];
const BEATS = [...beats.keys.map((t, i) => ({ t, name: NAMES[i] })),
  { t: beats.back, name: 'Back' }, { t: beats.down, name: 'Down' }, { t: beats.settle, name: 'Settle' }, { t: beats.total, name: 'Guard' }];
const END = beats.total + 150;

/** What the try still gets wrong, each with the moment it shows best. */
const GAPS = [
  { t: 330, title: 'The blade twirls in his fist on the way up',
    text: 'To show its face, the bat is turned more than half round inside the hand. Going up, that turn happens in a quarter of a second, so the blade spins in his fingers as it rises. The hundred has no turn at all.' },
  { t: 540, title: 'The pump barely reads',
    text: 'The hundred pumps by drawing the fist and the bat down together. With both arms held straight, only the knees give, so the arms sink a few centimetres and the bat does not punch. It may want a real punch: the arms bending and driving back up.' },
  { t: 990, title: 'The look round',
    text: 'He turns his head to the crowd with both arms still straight up. Worth checking the head does not turn into the raised bat arm.' },
  { t: 1180, title: 'The way down unwinds the blade',
    text: 'From arms wide to the hundred\'s way down, the half-turn in the fist unwinds, so the blade turns the other way in his hand as he lowers it, and the hand slides back down the handle.' },
  { t: 1260, title: 'The left hand finds the handle',
    text: 'The free hand comes from out wide, further than in the hundred, to take the handle again. Watch for it crossing in front of his face or arriving late.' },
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

const stages = [stage(document.querySelector('#now')!, NOW), stage(document.querySelector('#try')!, TRY)];

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
const beatNow = document.querySelector<HTMLOutputElement>('#beat-now')!, beatTry = document.querySelector<HTMLOutputElement>('#beat-try')!;
scrub.max = String(END);
const ticks = document.querySelector<HTMLDivElement>('#ticks')!;
// Every other name on a narrow screen, so they never run into each other.
const drawTicks = () => {
  const narrow = ticks.clientWidth < 520;
  ticks.innerHTML = BEATS.filter((b, i) => !narrow || i % 2 === 0 || b.name === 'Guard')
    .map(b => `<i style="left:${(b.t / END * 100).toFixed(2)}%">${b.name}</i>`).join('');
};
new ResizeObserver(drawTicks).observe(ticks);

let t = 390, playing = false, speed = .5, last = 0, held = 0;
const beatAt = (ms: number) => [...BEATS].reverse().find(b => ms >= b.t)?.name ?? 'Guard';
function show(ms: number) {
  t = Math.max(0, Math.min(END, ms));
  scrub.value = String(Math.round(t));
  time.textContent = `${Math.round(t)} ms`;
  const name = t < BEATS[0].t ? 'Guard' : beatAt(t);
  beatNow.textContent = beatTry.textContent = name;
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
  const go = document.createElement('button'); go.textContent = `Show at ${g.t} ms`;
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
