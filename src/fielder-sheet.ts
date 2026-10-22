// Offline contact sheet of the fielders' takes: each a row, sampled across
// its own clock, side on or from the bat. Dev tool, like `bowler-sheet.ts`;
// `scripts/fielder-sheet.mjs` drives it.
import * as THREE from 'three';
import {
  COLLECT_MS, DIVE, Fielder, REACTION_MS, Routine, collect, idle, planCatch, type Spot,
} from './entities/Fielder';

const params = new URLSearchParams(location.search);
const view = params.get('view') ?? 'side';
const TILE = Number(params.get('tile')) || 240;
const HIT = 1000;
// Each take: a routine, and the moments of it to draw.
const home: Spot = { x: 0, z: 0, heading: Math.PI };
const at = (x: number, z: number, y = .08) => new THREE.Vector3(x, y, z);
const TAKES: { name: string; routine: Routine; times: number[] }[] = [];
{
  // Collected: the ball along the ground straight at him, stopping in his hands.
  const arrives = HIT + 875;
  const routine = new Routine([idle(home, 'hips', 1), collect(home, arrives, at(0, -.42))]);
  TAKES.push({ name: 'collect', routine, times: [arrives - COLLECT_MS - 60, arrives - 220, arrives - 100, arrives, arrives + 200, arrives + 360, arrives + 520, arrives + 700] });
}
{
  // Saved on the rope: five metres to his right, a run and a dive, held.
  const arrives = HIT + 1625;
  const plan = planCatch(home, at(-5, -.6, .2), HIT, arrives, { ground: true });
  const c = plan.catchAt;
  TAKES.push({ name: 'dive save', routine: plan.routine, times: [HIT + REACTION_MS, c - DIVE.catch - 200, c - DIVE.catch, c - 200, c, c + 400, c + 1000, c + 1600] });
}
{
  // Run in to a catch: three metres in, a second and a fifth of hang.
  const arrives = HIT + 1200;
  const plan = planCatch(home, at(-1.5, -2.6, 1.6), HIT, arrives);
  TAKES.push({ name: `catch (${plan.style})`, routine: plan.routine, times: [HIT + REACTION_MS, HIT + 500, HIT + 700, arrives - 300, arrives - 120, arrives, arrives + 300, arrives + 600] });
}
const COLS = Math.max(...TAKES.map(t => t.times.length)), ROWS = TAKES.length;
const canvas = document.createElement('canvas');
canvas.width = COLS * TILE; canvas.height = ROWS * TILE; canvas.id = 'sheet';
document.body.append(canvas);
const ctx = canvas.getContext('2d')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(TILE, TILE); renderer.setPixelRatio(1);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#a9c6dc');
scene.add(new THREE.HemisphereLight(0xffffff, 0x53634a, 2.6));
const key = new THREE.DirectionalLight(0xffedda, 2.2); key.position.set(-3, 6, 4); scene.add(key);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x6f7a55, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);
const ball = new THREE.Mesh(new THREE.SphereGeometry(.036, 16, 12), new THREE.MeshStandardMaterial({ color: 0xb3132b }));
scene.add(ball);
const fielder = new Fielder(); scene.add(fielder.root);
const camera = new THREE.PerspectiveCamera(30, 1, .1, 80);
ctx.font = '13px sans-serif'; ctx.fillStyle = '#10202c';
TAKES.forEach(({ name, routine, times }, row) => {
  times.forEach((t, col) => {
    const body = routine.at(t);
    fielder.show(body);
    fielder.figure.drape();
    fielder.root.updateMatrixWorld(true);
    // On him wherever he has got to: a dive carries his body well past his feet.
    const hips = fielder.figure.root.getWorldPosition(new THREE.Vector3());
    const focus = new THREE.Vector3(hips.x, .7, hips.z);
    if (view === 'side') camera.position.set(hips.x + 5.5, 1.2, hips.z + .2);
    else camera.position.set(hips.x, 1.6, hips.z - 6);
    camera.lookAt(focus);
    ball.visible = name === 'collect';
    ball.position.set(0, .07, -.42 - Math.max(0, (HIT + 875 - t) / 875) * 20);
    renderer.render(scene, camera);
    ctx.drawImage(renderer.domElement, col * TILE, row * TILE);
    ctx.fillText(`${name} ${t - HIT}ms`, col * TILE + 8, row * TILE + 16);
  });
});
document.title = 'ready';
