import * as THREE from 'three';
import { Batter } from '../src/entities/Batter';
import type { ShotType } from '../src/game/types';
// A fourth number lifts the ball to bouncer height, which turns the leg-side
// input into a pull.
const examples: [string, ShotType, number, number?, boolean?][] = [
  ['Guard · side view', 'STRAIGHT', 0], ['A · leg-side flick', 'LEG', -.3], ['A + W · long-on drive', 'LONG_ON', -.14],
  ['W · straight drive', 'STRAIGHT', 0], ['A vs bouncer · pull', 'LEG', -.02, 1.12], ['W charged · down the pitch', 'STRAIGHT', 0, .54, true],
  ['D · off-side punch', 'OFF', .42], ['D + S · square cut', 'SQUARE_CUT', .46], ['D + S vs bouncer · cut', 'SQUARE_CUT', .46, 1.12],
];
let time = -1;
let playing = false;
let start = 0;
const views = examples.map(([label, shot, ballX, ballY, charging], index) => {
  const article = document.createElement('article'); article.innerHTML = `<h2>${label}</h2><div class="view"></div>`;
  document.querySelector('.grid')!.append(article);
  const view = article.querySelector('.view')!;
  const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(view.clientWidth, 300); view.append(renderer.domElement);
  renderer.setClearColor(0xd5dfcf);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x657b51, 2.7));
  const light = new THREE.DirectionalLight(0xfff2dd, 2.4); light.position.set(-4, 6, -3); scene.add(light);
  const stage = new THREE.Group(); stage.scale.x = -1; scene.add(stage);
  const batter = new Batter(); stage.add(batter.root);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ color: 0xbac8a8 }));
  floor.rotation.x = -Math.PI / 2; stage.add(floor);
  const camera = new THREE.PerspectiveCamera(38, view.clientWidth / 300, .1, 30);
  return { batter, shot, ballX, ballY, charging, camera, scene, renderer, index };
});
/**
 * Where the cameras stand. A stroke played square cannot be judged from the one
 * angle the game happens to use, so the whole grid orbits: `azimuth` is degrees
 * round from the bowler's end, and the stage is mirrored, so a positive turn
 * walks the camera towards the off side.
 */
const TARGET = new THREE.Vector3(.15, 1.08, .25);
let azimuth = 0;
function place() {
  const a = azimuth * Math.PI / 180;
  for (const view of views) {
    if (view.index === 0) { view.camera.position.set(-2.5, 1.6, -1.8); view.camera.lookAt(.15, 1.1, .4); continue; }
    view.camera.position.set(TARGET.x - Math.sin(a) * 3.6, 1.62, TARGET.z - Math.cos(a) * 3.6);
    view.camera.lookAt(TARGET);
  }
}
place();
function draw(age: number) {
  views.forEach(({ batter, shot, ballX, ballY, charging, renderer, scene, camera }, i) => {
    batter.reset();
    if (age >= 0 && i !== 0) { batter.prepare(1); batter.update(0); batter.swing(shot, 0, ballX, ballY ?? .54, undefined, charging); batter.update(age); }
    renderer.render(scene, camera);
  });
}
document.querySelectorAll<HTMLButtonElement>('[data-time]').forEach(button => {
  button.onclick = () => {
    playing = false; time = Number(button.dataset.time);
    document.querySelectorAll('[data-time]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    draw(time);
  };
});
document.querySelectorAll<HTMLButtonElement>('[data-az]').forEach(button => {
  button.onclick = () => {
    azimuth = Number(button.dataset.az); place();
    document.querySelectorAll('[data-az]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    draw(time);
  };
});
document.querySelector<HTMLButtonElement>('#play')!.onclick = () => { playing = !playing; start = performance.now(); };
function frame(now: number) { if (playing) draw((now - start) % 1500); requestAnimationFrame(frame); }
draw(time); requestAnimationFrame(frame);
