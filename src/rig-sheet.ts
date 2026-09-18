// Offline rig contact sheet: every stroke sampled across its own clock from a
// chosen camera, tiled into one canvas for frame-by-frame review. Dev tool.
import * as THREE from 'three';
import { Batter, STROKE_DURATION_MS } from './entities/Batter';
import { GAME } from './config/gameplay';

const params = new URLSearchParams(location.search);
const shot = params.get('shot') ?? 'STRAIGHT';
const view = params.get('view') ?? 'side';
const COLS = 6, ROWS = 3, TILE = 300;
const canvas = document.createElement('canvas');
canvas.width = COLS * TILE; canvas.height = ROWS * TILE;
canvas.id = 'sheet';
document.body.append(canvas);
const ctx = canvas.getContext('2d')!;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(TILE, TILE); renderer.setPixelRatio(1);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#16211f');
scene.add(new THREE.HemisphereLight(0xffffff, 0x53634a, 2.6));
const key = new THREE.DirectionalLight(0xffedda, 2.2); key.position.set(-3, 6, -1); scene.add(key);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 12), new THREE.MeshStandardMaterial({ color: 0x6f7a55, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);
scene.add(new THREE.GridHelper(10, 20, 0x9aa88c, 0x5e6b52));

const batter = new Batter(); scene.add(batter.root);
const camera = new THREE.PerspectiveCamera(38, 1, .1, 60);
const focus = new THREE.Vector3(GAME.stanceX, .95, GAME.stanceZ + .2);
// side  = square of the wicket on the off side, the reference recording's view
// front = from the bowler, down the pitch
// leg   = square on the leg side
const eye = view === 'front' ? new THREE.Vector3(GAME.stanceX - .1, 1.25, GAME.stanceZ + 4.6)
  : view === 'leg' ? new THREE.Vector3(GAME.stanceX - 4.4, 1.35, GAME.stanceZ + .3)
  : new THREE.Vector3(GAME.stanceX + 4.4, 1.35, GAME.stanceZ + .3);
camera.position.copy(eye); camera.lookAt(focus);

const ballFor = (s: string): {shot: 'STRAIGHT'|'COVER_LONG_OFF'|'LEG'|'SQUARE_CUT'; x: number; y: number; lofted?: boolean; sweeping?: boolean} => s === 'PULL' ? { shot: 'LEG' as const, x: -.30, y: 1.12 }
  : s === 'SLOG_SWEEP' ? { shot: 'LEG' as const, x: 0, y: .48, sweeping: true }
  : s === 'SQUARE_DRIVE' ? { shot: 'COVER_LONG_OFF' as const, x: .42, y: .30 }
  : s === 'COVER' ? { shot: 'COVER_LONG_OFF' as const, x: .16, y: .48 }
  : s === 'CHARGE' ? { shot: 'STRAIGHT' as const, x: 0, y: .54 }
  : s === 'CUT' ? { shot: 'SQUARE_CUT' as const, x: .40, y: .92 }
  : s === 'LOFTED' ? { shot: 'STRAIGHT' as const, x: 0, y: .54, lofted: true }
  : { shot: 'STRAIGHT' as const, x: 0, y: .54 };

const spec = ballFor(shot);
const total = STROKE_DURATION_MS;
const frames = COLS * ROWS;
ctx.fillStyle = '#0d1413'; ctx.fillRect(0, 0, canvas.width, canvas.height);
for (let i = 0; i < frames; i++) {
  // Bias the sampling towards the active stroke: the recovery is not the part
  // under review, so it gets the last few tiles rather than half the sheet.
  const age = i / (frames - 1) <= .75 ? (i / (frames - 1)) / .75 * 620 : 620 + ((i / (frames - 1)) - .75) / .25 * (total - 620);
  batter.reset(); batter.prepare(1); batter.update(0);
  batter.swing(spec.shot, 0, spec.x, spec.y, GAME.contactZ, shot === 'CHARGE', spec.lofted ?? false, spec.sweeping ?? false);
  batter.update(age);
  renderer.render(scene, camera);
  const col = i % COLS, row = Math.floor(i / COLS);
  ctx.drawImage(renderer.domElement, col * TILE, row * TILE);
  ctx.fillStyle = '#d8f0c8'; ctx.font = '600 15px monospace';
  ctx.fillText(`${Math.round(age)}ms`, col * TILE + 8, row * TILE + 20);
}
ctx.fillStyle = '#ffe9a8'; ctx.font = '700 17px monospace';
ctx.fillText(`${shot} — ${view}`, 8, canvas.height - 10);
document.title = 'ready';
