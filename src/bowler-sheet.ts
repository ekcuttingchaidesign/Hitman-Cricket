// Offline contact sheet of the bowling actions: each action a row, sampled at
// the same moments of the run-up and the follow-through, from the batter's end
// (as the game's camera sees him, closer) or side on, the reference clips'
// angles. Dev tool, like `rig-sheet.ts`; `scripts/bowler-sheet.mjs` drives it.
import * as THREE from 'three';
import { Bowler, DEATH_ACTION, EXPRESS_ACTION, PACE_ACTION, RELEASE_Z, type ActionStyle } from './entities/Bowler';

const params = new URLSearchParams(location.search);
const view = params.get('view') ?? 'batter';
// `?fixed=1` holds the camera still, framed on the crease, so he runs in
// towards it rather than being followed; `?tile=` sizes the frames.
const fixed = params.get('fixed') === '1';
const ACTIONS: Record<string, ActionStyle> = { pace: PACE_ACTION, express: EXPRESS_ACTION, death: DEATH_ACTION };
const rows = (params.get('actions') ?? 'pace,express,death').split(',').filter(a => a in ACTIONS);
// Moments: run-up fractions, then `f` and a fraction for the follow-through.
const moments = (params.get('times') ?? '.3,.46,.52,.64,.8,.9,.97,1,f.12,f.3').split(',');
const TILE = Number(params.get('tile')) || 260, COLS = moments.length, ROWS = rows.length;
const canvas = document.createElement('canvas');
canvas.width = COLS * TILE; canvas.height = ROWS * TILE; canvas.id = 'sheet';
document.body.append(canvas);
const ctx = canvas.getContext('2d')!;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(TILE, TILE); renderer.setPixelRatio(1);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#a9c6dc');
// The game's world is mirrored so the leg side reads on the left; so is this.
const world = new THREE.Group(); world.scale.x = -1; scene.add(world);
scene.add(new THREE.HemisphereLight(0xffffff, 0x53634a, 2.6));
const key = new THREE.DirectionalLight(0xffedda, 2.2); key.position.set(-3, 6, 4); scene.add(key);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 30), new THREE.MeshStandardMaterial({ color: 0x6f7a55, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.position.z = 15; world.add(ground);
const pitch = new THREE.Mesh(new THREE.PlaneGeometry(3, 20.1), new THREE.MeshStandardMaterial({ color: 0xc9b27a, roughness: 1 }));
pitch.rotation.x = -Math.PI / 2; pitch.position.set(0, .002, 10); world.add(pitch);

const bowler = new Bowler(); world.add(bowler.root);
const camera = new THREE.PerspectiveCamera(fixed ? (view === 'side' ? 40 : 12) : view === 'side' ? 26 : 13, 1, .1, 80);

ctx.font = '14px sans-serif'; ctx.fillStyle = '#10202c';
rows.forEach((name, row) => {
  bowler.action(ACTIONS[name]);
  moments.forEach((moment, col) => {
    const follow = moment.startsWith('f');
    const t = Number(follow ? moment.slice(1) : moment);
    if (follow) bowler.followThrough(t); else bowler.runup(t);
    // The clothes are bent to the rig just before a frame is drawn, as the game does.
    bowler.figure.drape();
    bowler.root.updateMatrixWorld(true);
    // Keep him in the middle of the tile wherever he has got to.
    const at = bowler.root.getWorldPosition(new THREE.Vector3());
    const focus = new THREE.Vector3(at.x, 1.15, at.z);
    if (fixed) {
      // The middle of his run and delivery, wherever this frame has him.
      const middle = new THREE.Vector3(.3, 1.15, RELEASE_Z + 2.2);
      if (view === 'side') camera.position.set(-9.5, 1.4, middle.z);
      else camera.position.set(0, 1.75, RELEASE_Z - 16);
      camera.lookAt(middle);
    } else {
      if (view === 'side') camera.position.set(at.x - 7.5, 1.3, at.z - .4);
      else camera.position.set(0, 1.7, at.z - 16);
      camera.lookAt(focus);
    }
    renderer.render(scene, camera);
    ctx.drawImage(renderer.domElement, col * TILE, row * TILE);
    if (params.get('labels') !== '0') ctx.fillText(`${name} ${moment}`, col * TILE + 8, row * TILE + 18);
  });
});
document.title = 'ready';
