/**
 * The Super10 team kits on the game's own batter (`kits.html`), for setting
 * their prints against the designer's sheets: turned round by a drag, from the
 * chest, side on, behind and the game's view, with any of the five numbers on
 * his back, by day or glowing under the floodlights as `kitsUnderLights`
 * lights a kit at night. The stage is mirrored as the game's is, so he is
 * right-handed. Nothing is scored, sent or counted.
 * `scripts/kits-artifact.mjs` bundles it into one HTML file.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Batter } from './entities/Batter';
import { SUPER10_GLOVES } from './entities/gloves';
import { GAME } from './config/gameplay';
import { buildWicket } from './scene/wicket';
import { SUPER10_KITS, SUPER10_NUMBERS, type Super10Kit } from './game/super10-kits';

const KIT_GLOW = .32;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0d0a1f');
scene.add(new THREE.HemisphereLight(0xfff6ea, 0x2a2440, 1.6));
const key = new THREE.DirectionalLight(0xffeedd, 2.2); key.position.set(3, 7, 4); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 1, far: 16 });
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0xbfd6ff, 1.1); rim.position.set(-4, 3, -5); scene.add(rim);
const world = new THREE.Group(); world.scale.x = -1; scene.add(world);
const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; world.add(ground);
buildWicket(world, GAME.stumpHeight, 0);
const batter = new Batter(); world.add(batter.root); batter.mirrorStickers(true);
batter.reset(); batter.prepare(0); batter.update(0); batter.drape();

const host = document.querySelector<HTMLDivElement>('#stage')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.outputColorSpace = THREE.SRGBColorSpace;
host.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(30, 4 / 3, .02, 80);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.minDistance = .9; controls.maxDistance = 7; controls.autoRotateSpeed = 3;

/**
 * Where the camera stands, from his middle: his chest (which in his guard is
 * open to the bowler, as the game's camera behind him sees his back), his
 * back, side on from the off side, and the game's own view.
 */
const VIEWS: Record<string, [number, number, number]> = {
  front: [-2.6, .2, 0], side: [0, .2, 2.6], back: [2.6, .2, 0], game: [-.4, 1.3, -5.6],
};
let view = 'front', night = true, kit = SUPER10_KITS[0], shirtNumber = '10';
function aim() {
  // His middle, wherever his guard puts him.
  const at = new THREE.Box3().setFromObject(batter.root).getCenter(new THREE.Vector3()), eye = new THREE.Vector3(...VIEWS[view]);
  at.y = Math.max(at.y, .8);
  // Further back on a tall, narrow screen, so the whole of him is in it.
  if (view !== 'game') eye.multiplyScalar(Math.max(1, 1.45 / Math.max(.5, camera.aspect)));
  camera.position.copy(at).add(eye); controls.target.copy(at); controls.update();
}
function light() {
  batter.root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of [o.material].flat()) {
      if (!(m instanceof THREE.MeshStandardMaterial) || m.vertexColors) continue;
      if (night) { m.emissive.copy(m.color); m.emissiveIntensity = KIT_GLOW; } else { m.emissive.setHex(0); m.emissiveIntensity = 1; }
    }
  });
  scene.background = new THREE.Color(night ? '#0d0a1f' : '#8fb6d8');
}
function wear(next: Super10Kit) {
  kit = next;
  batter.wear({ shirt: kit.shirt, helmet: kit.helmet, trousers: kit.trousers, trim: kit.trim, number: kit.number });
  batter.wearGloves(SUPER10_GLOVES[kit.guard]);
  batter.printKit(kit.print, shirtNumber);
  batter.reset(); batter.prepare(0); batter.update(0); batter.drape();
  light();
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-kit]')) b.setAttribute('aria-pressed', String(b.dataset.kit === kit.id));
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-number]')) b.setAttribute('aria-pressed', String(b.dataset.number === shirtNumber));
  const rung = SUPER10_KITS.indexOf(kit);
  document.querySelector('#team')!.innerHTML = `${kit.name}<small>${rung ? `Tier ${rung} of ${SUPER10_KITS.length - 1}` : 'Free for everybody'}</small>`;
}

const kits = document.querySelector<HTMLDivElement>('#kits')!;
for (const k of SUPER10_KITS) {
  const b = document.createElement('button'); b.dataset.kit = k.id; b.onclick = () => wear(k);
  const dot = document.createElement('i'); dot.style.background = `linear-gradient(90deg, ${k.shirt} 50%, ${k.trousers} 50%)`;
  b.append(dot, k.name); kits.append(b);
}
const numbers = document.querySelector<HTMLDivElement>('#numbers')!;
for (const n of SUPER10_NUMBERS) {
  const b = document.createElement('button'); b.dataset.number = n; b.textContent = n;
  b.onclick = () => { shirtNumber = n; wear(kit); }; numbers.append(b);
}
const spin = document.querySelector<HTMLButtonElement>('#spin')!;
spin.onclick = () => { controls.autoRotate = !controls.autoRotate; spin.setAttribute('aria-pressed', String(controls.autoRotate)); };
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-view]')) b.onclick = () => {
  view = b.dataset.view!; aim();
  for (const o of document.querySelectorAll('[data-view]')) o.setAttribute('aria-pressed', String(o === b));
};
const nightKey = document.querySelector<HTMLButtonElement>('#night')!;
nightKey.onclick = () => { night = !night; nightKey.setAttribute('aria-pressed', String(night)); light(); };

function resize() {
  renderer.setSize(host.clientWidth, host.clientHeight, false);
  camera.aspect = host.clientWidth / Math.max(1, host.clientHeight); camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize(); wear(kit); aim();
(window as unknown as { __kits: object }).__kits = {
  wear: (id: string) => wear(SUPER10_KITS.find(k => k.id === id)!),
  view: (name: string) => { view = name; aim(); },
  night: (on: boolean) => { night = on; light(); },
  number: (n: string) => { shirtNumber = n; wear(kit); },
  ready: true,
};
function frame() { controls.update(); renderer.render(scene, camera); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
