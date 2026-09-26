import * as THREE from 'three';
import { Batter } from '../src/entities/Batter';
import { BatterModel } from '../src/entities/BatterModel';
import type { ShotType } from '../src/game/types';
/**
 * The modelled batter through two strokes, from the game's camera and from
 * square, so a bad bend shows before it reaches the pitch. Columns are
 * moments in the stroke, rows are stroke × camera. `?kit=india` dresses it.
 */
const q = new URLSearchParams(location.search);
const W = 300, H = 380;
const moments: [string, number][] = [['guard', -1], ['backlift', 0], ['contact', 110], ['follow', 470]];
const strokes: [string, ShotType, number, number?][] = q.get('set') === 'b'
  ? [['pull', 'LEG', -.02, 1.12], ['scoop', 'SCOOP', 0]]
  : [['straight drive', 'STRAIGHT', 0], ['square cut', 'SQUARE_CUT', .46]];
// Offsets from the hips: the game's own camera line, and square on the off side.
const cams = { behind: [new THREE.Vector3(0, 0.95, -3.6), new THREE.Vector3(0, 0, 1.2)], square: [new THREE.Vector3(-3.4, 0.3, 0.2), new THREE.Vector3(0, 0, 0.2)] };
const rows = strokes.flatMap(s => Object.entries(cams).map(([c, v]) => [s, c, v] as const));
const canvas = document.querySelector<HTMLCanvasElement>('#c')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(W * moments.length, H * rows.length); renderer.setScissorTest(true);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2; renderer.shadowMap.enabled = true;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xd6c9a3);
scene.add(new THREE.HemisphereLight(0xcfe0f5, 0x6f7f40, 1.15));
const sun = new THREE.DirectionalLight(0xffd9a3, 3.9); sun.position.set(-3, 8, 4); sun.castShadow = true; sun.shadow.normalBias = 0.025; sun.shadow.mapSize.set(2048, 2048); scene.add(sun);
const fill = new THREE.DirectionalLight(0xf2e6d2, 0.7); fill.position.set(2, 4, -6); scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0xd4b172 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
// The game mirrors its world, so the lab does too.
const stage = new THREE.Group(); stage.scale.x = -1; scene.add(stage);
const batter = new Batter(); stage.add(batter.root);
const hips = new THREE.Vector3();
const camera = new THREE.PerspectiveCamera(30, W / H, 0.05, 50);
const model = await BatterModel.load('/models/batter.glb');
batter.attachModel(model);
if (q.get('kit') === 'india') batter.dress(false);
const report: string[] = [];
rows.forEach(([[name, shot, ballX, ballY], cam, [eye, at]], r) => moments.forEach(([label, age], c) => {
  batter.reset();
  if (age >= 0) { batter.prepare(1); batter.update(0); batter.swing(shot, 0, ballX, ballY ?? .54); batter.update(age); }
  batter.root.updateMatrixWorld(true); model.root.getObjectByName('CTRL_pelvis')!.getWorldPosition(hips);
  camera.position.copy(hips).add(eye); camera.lookAt(hips.clone().add(at));
  const y = (rows.length - 1 - r) * H;
  renderer.setViewport(c * W, y, W, H); renderer.setScissor(c * W, y, W, H);
  renderer.render(scene, camera);
  if (cam === 'behind') report.push(`${name.padEnd(15)} ${label.padEnd(9)} ${model.diagnostics()}`);
}));
document.querySelector('#out')!.textContent = report.join('\n');
document.title = 'ready';
