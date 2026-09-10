import * as THREE from 'three';
import { Bowler } from '../src/entities/Bowler';
import { Cricketer } from '../src/entities/Cricketer';

/**
 * The bowling action, laid out one moment per panel. An action is a sequence
 * and the sequence is the thing that has to be right, so seeing the gather next
 * to the brace next to the release is worth more than watching it once at speed
 * — and every panel orbits, because a side-on gather cannot be judged from
 * behind the bowler's arm.
 *
 * Excluded from the production build, like the batter's pose lab beside it.
 */
type Frame = [label: string, t: number, after: number];
const frames: Frame[] = [
  ['Top of the mark', 0, 0],
  ['Running in', .34, 0],
  ['The bound · side-on, arm back', .63, 0],
  ['Back foot lands', .74, 0],
  ['Delivery stride · arm climbing', .89, 0],
  ['Release · just past vertical', 1, 0],
  ['Falling away', 1, .35],
  ['Back leg through', 1, 1],
];

const grid = document.querySelector('.grid')!;
const views = frames.map(([label, t, after]) => {
  const article = document.createElement('article');
  article.innerHTML = `<h2>${label}</h2><div class="view"></div>`;
  grid.append(article);
  const host = article.querySelector('.view') as HTMLElement;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(host.clientWidth, 300);
  renderer.setClearColor(0xd7e0d2);
  renderer.shadowMap.enabled = true;
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x66744a, 2.6));
  const sun = new THREE.DirectionalLight(0xfff1d8, 2.6);
  sun.position.set(-5, 9, 4); sun.castShadow = true; scene.add(sun);
  // The game mirrors its stage, so the lab does too: what you see here is what
  // the camera behind the batter sees.
  const stage = new THREE.Group(); stage.scale.x = -1; scene.add(stage);
  const bowler = new Bowler(); stage.add(bowler.root);
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(3, 40), new THREE.MeshStandardMaterial({ color: 0xcbb283 }));
  pitch.rotation.x = -Math.PI / 2; pitch.position.set(0, 0, 10); pitch.receiveShadow = true; stage.add(pitch);
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x6d9450 }));
  grass.rotation.x = -Math.PI / 2; grass.position.set(0, -.01, 10); grass.receiveShadow = true; stage.add(grass);
  // The bowler's stumps, so the crease and the release point have something to
  // be measured against.
  for (const x of [-.145, 0, .145]) {
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .76, 12), new THREE.MeshStandardMaterial({ color: 0xf8f1df }));
    stump.position.set(x, .38, 18.7); stage.add(stump);
  }
  const crease = new THREE.Mesh(new THREE.PlaneGeometry(3.1, .05), new THREE.MeshBasicMaterial({ color: 0xf8f1df }));
  crease.rotation.x = -Math.PI / 2; crease.position.set(0, .02, 17.5); stage.add(crease);

  const camera = new THREE.PerspectiveCamera(40, host.clientWidth / 300, .1, 90);
  return { bowler, t, after, camera, scene, renderer, host };
});

/** A second figure, stood in a fielder's ready stance, for the kit review. */
const fielderHost = document.querySelector('#fielder') as HTMLElement | null;
if (fielderHost) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(fielderHost.clientWidth, 320);
  renderer.setClearColor(0xd7e0d2); renderer.shadowMap.enabled = true;
  fielderHost.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x66744a, 2.6));
  const sun = new THREE.DirectionalLight(0xfff1d8, 2.6); sun.position.set(-4, 8, 5); sun.castShadow = true; scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: 0x6d9450 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const camera = new THREE.PerspectiveCamera(34, fielderHost.clientWidth / 320, .1, 40);
  const people = [0, 1, 2].map(i => {
    const fielder = new Cricketer();
    fielder.root.position.x = (i - 1) * 1.15;
    fielder.root.rotation.y = (i - 1) * .9;
    if (i === 2) fielder.catchAt(1);
    scene.add(fielder.root);
    return fielder;
  });
  let angle = 0;
  const spin = () => {
    angle += .006;
    camera.position.set(Math.sin(angle) * 4.4, 1.5, Math.cos(angle) * 4.4);
    camera.lookAt(0, 1.05, 0);
    renderer.render(scene, camera);
    requestAnimationFrame(spin);
  };
  people[1].catchAt(0);
  spin();
}

let azimuth = 0;
let playing = false;
let started = 0;

function draw(t?: number, after?: number) {
  for (const view of views) {
    const at = t ?? view.t, tail = after ?? view.after;
    if (tail > 0) { view.bowler.runup(1); view.bowler.followThrough(tail * .34); }
    else view.bowler.runup(at);
    // The camera walks in with him, so every panel frames the body rather than
    // the ten metres of turf he has covered.
    const a = azimuth * Math.PI / 180;
    const z = view.bowler.root.position.z;
    view.camera.position.set(-Math.sin(a) * 5.4, 2.1, z - Math.cos(a) * 5.4);
    view.camera.lookAt(0, 1.0, z - .2);
    view.renderer.render(view.scene, view.camera);
  }
}
draw();

document.querySelectorAll<HTMLButtonElement>('[data-az]').forEach(button => {
  button.onclick = () => {
    azimuth = Number(button.dataset.az);
    document.querySelectorAll('[data-az]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    draw();
  };
});
const play = document.querySelector<HTMLButtonElement>('#play');
if (play) play.onclick = () => { playing = !playing; started = performance.now(); if (!playing) draw(); };
function frame(now: number) {
  if (playing) {
    // The run-up and the follow-through at the speeds the game runs them.
    const age = (now - started) % 2100;
    if (age < 900) draw(age / 900, 0);
    else draw(1, Math.min(1, (age - 900) / 700));
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
