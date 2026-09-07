import * as THREE from 'three';
import { Batter } from '../src/entities/Batter';
import type { ShotType } from '../src/game/types';
const examples: [string, ShotType, number][] = [
  ['Guard · side view', 'STRAIGHT', 0], ['A · leg-side flick', 'LEG', -.3], ['A + W · long-on drive', 'LONG_ON', -.14],
  ['W · straight drive', 'STRAIGHT', 0], ['W + D · cover drive', 'COVER_LONG_OFF', .14], ['D · square cut', 'OFF', .42],
];
let time = -1;
let playing = false;
let start = 0;
const views = examples.map(([label, shot, ballX], index) => {
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
  camera.position.set(index === 0 ? -2.5 : .1, 1.6, index === 0 ? -1.8 : -3.7); camera.lookAt(.15, 1.1, .4);
  return { batter, shot, ballX, camera, scene, renderer };
});
function draw(age: number) {
  views.forEach(({ batter, shot, ballX, renderer, scene, camera }, i) => {
    batter.reset();
    if (age >= 0 && i !== 0) { batter.prepare(1); batter.update(0); batter.swing(shot, 0, ballX); batter.update(age); }
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
document.querySelector<HTMLButtonElement>('#play')!.onclick = () => { playing = !playing; start = performance.now(); };
function frame(now: number) { if (playing) draw((now - start) % 1500); requestAnimationFrame(frame); }
draw(time); requestAnimationFrame(frame);
