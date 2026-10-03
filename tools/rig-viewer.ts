import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ACTION_MS, Bowler, EXPRESS_ACTION, FOLLOW_PHASES, PACE_ACTION, PHASES, type ActionStyle } from '../src/entities/Bowler';
import type { Kit } from '../src/entities/Cricketer';
import { KIT } from '../src/entities/Cricketer';
import { WHITES } from '../src/config/survive';
import { GAME } from '../src/config/gameplay';
import { ballPosition } from '../src/game/DeliveryTrajectory';
import { pitchTexture } from '../src/scene/turf';
import type { Delivery } from '../src/game/types';

/**
 * The bowling action on a clock you can hold. `bowler-lab` lays the action out
 * one moment per panel; this plays it — the game's own `Bowler`, not a copy —
 * at a tenth of its speed or slower, with the two actions side by side if you
 * want them, a scrubber marked at every phase, and the numbers the tests hold
 * it to read off the figure as it moves.
 *
 * The whole run-up is 840 ms in the game, which is why it needs one: at full
 * speed the gather and the release are gone before the eye has found them.
 *
 * `scripts/rig-viewer.mjs` bundles it into one page with nothing to fetch, for
 * sharing; here it is `/tools/rig-viewer.html` on the dev server.
 */
const RUNUP = GAME.runupMs, FOLLOW = ACTION_MS - RUNUP;
/** The Test strip's grass, as the game paints it for the Marathon. */
const TEST_GRASS = .5;

type Key = 'pace' | 'express';
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// ── The ground ────────────────────────────────────────────────────────────
const host = document.getElementById('stage')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x5d6d45, 2.3));
const sun = new THREE.DirectionalLight(0xfff1d8, 2.8);
sun.position.set(-6, 11, 26); sun.target.position.set(0, 0, 19);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 9, bottom: -9, near: 1, far: 40 });
scene.add(sun, sun.target);

// The game mirrors its stage, so this does too: a right-arm bowler here is the
// right-arm bowler the batter faces.
const stage = new THREE.Group(); stage.scale.x = -1; scene.add(stage);
const grass = new THREE.Mesh(new THREE.PlaneGeometry(70, 90), new THREE.MeshStandardMaterial({ color: 0x5f8c47, roughness: 1 }));
grass.rotation.x = -Math.PI / 2; grass.position.set(0, -.012, 10); grass.receiveShadow = true; stage.add(grass);
const surface = pitchTexture(2.8, 32, 4.3, renderer.capabilities.getMaxAnisotropy(), { batting: 0, bowling: 18.7 }, TEST_GRASS);
const strip = new THREE.Mesh(new THREE.BoxGeometry(2.8, .025, 32), new THREE.MeshStandardMaterial({ map: surface, roughness: .9 }));
strip.position.set(0, 0, 4.3); strip.receiveShadow = true; stage.add(strip);
const wood = new THREE.MeshStandardMaterial({ color: 0xf3ead2, roughness: .6 });
for (const z of [0, 18.7]) for (const x of [-.115, 0, .115]) {
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .71, 12), wood);
  stump.position.set(x, .355 + .012, z); stump.castShadow = true; stage.add(stump);
}

// ── The two bowlers ───────────────────────────────────────────────────────
/** A ball as the game bowls it, for the flight after release. */
const DELIVERY = { baseTargetX: 0, finalTargetX: 0, bounceZ: GAME.bounceZ, rise: GAME.rise, style: 'GOOD' } as unknown as Delivery;

interface Rig {
  key: Key; name: string; bowler: Bowler; holder: THREE.Group; style: ActionStyle;
  ball: THREE.Mesh; flightMs: number; path: THREE.Mesh; done: THREE.Mesh; pathSegments: number;
  last?: { ms: number; values: string[] };
}
const SAMPLES = 220;
function rig(key: Key, name: string, style: ActionStyle, kit: Kit, flightMs: number): Rig {
  const bowler = new Bowler(kit);
  bowler.action(style);
  bowler.root.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  const holder = new THREE.Group();
  holder.add(bowler.root); stage.add(holder);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.037, 16, 12), new THREE.MeshStandardMaterial({ color: 0xa81c1c, roughness: .45 }));
  ball.castShadow = true; holder.add(ball);
  // The ball hand's path from the top of the mark to the arm finishing across
  // him, as a tube: faint for the whole of it, solid for the part already gone.
  const points: THREE.Vector3[] = [];
  const hand = bowler.figure.hands[1];
  for (let i = 0; i <= SAMPLES; i++) {
    const ms = i / SAMPLES * (RUNUP + FOLLOW * .36);
    bowler.animate(ms);
    holder.updateMatrixWorld(true);
    points.push(holder.worldToLocal(hand.getWorldPosition(new THREE.Vector3())));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, SAMPLES, .011, 6, false);
  const path = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: .28, depthWrite: false }));
  const done = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  holder.add(path, done);
  return { key, name, bowler, holder, style, ball, flightMs, path, done, pathSegments: SAMPLES };
}
const rigs: Record<Key, Rig> = {
  pace: rig('pace', 'Fast bowler', PACE_ACTION, KIT, 520),
  express: rig('express', 'Express', EXPRESS_ACTION, WHITES, 430),
};

// ── State ─────────────────────────────────────────────────────────────────
type Show = Key | 'both';
type Cam = 'side' | 'leg' | 'front' | 'behind' | 'game' | 'above';
const state = { show: 'express' as Show, cam: 'side' as Cam, speed: .1, playing: true, ms: 560, trail: true, holdUntil: 0 };
const shown = () => (state.show === 'both' ? [rigs.pace, rigs.express] : [rigs[state.show]]);

/**
 * Side by side is a split screen rather than two men on one pitch: they run the
 * same line to the same crease, so on one pitch every side-on view stands one
 * directly behind the other.
 */
function layout() {
  rigs.pace.holder.visible = state.show !== 'express';
  rigs.express.holder.visible = state.show !== 'pace';
  host.classList.toggle('split', state.show === 'both');
}

// ── Camera ────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(38, 1, .05, 200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = .12;
controls.minDistance = 1.5; controls.maxDistance = 40;
/** Where each view sits relative to the bowler it follows, in the scene's own (mirrored) space. */
const VIEWS: Record<Exclude<Cam, 'game'>, [number, number, number]> = {
  side: [-6.4, 1.45, -.6], leg: [6.4, 1.45, -.6], front: [.3, 1.6, -7.5], behind: [-1.1, 2.1, 6.5], above: [0, 8.5, .6],
};
let followZ = 0;
function bowlerZ() {
  const list = shown();
  return list.reduce((sum, r) => sum + r.bowler.root.position.z, 0) / list.length;
}
function aim(cam: Cam) {
  state.cam = cam;
  if (cam === 'game') {
    // Exactly where the game puts it: behind the batter, looking down the pitch.
    camera.position.set(0, 2.9, -5.15); controls.target.set(0, 1.05, 9);
    camera.fov = 53;
  } else {
    followZ = bowlerZ();
    const [x, y, z] = VIEWS[cam];
    controls.target.set(0, 1.05, followZ - .3);
    camera.position.set(x, y, followZ + z);
    camera.fov = 38;
  }
  camera.updateProjectionMatrix();
  controls.update();
}

// ── Phases ────────────────────────────────────────────────────────────────
const ofRun = (t: number) => t * RUNUP;
const ofFollow = (p: number) => RUNUP + p * FOLLOW;
/** `quiet` marks are ticked but not named: too close to their neighbours to label. `wide` are named only on a wide screen. */
const MARKS: { ms: number; label: string; quiet?: boolean; wide?: boolean; release?: boolean }[] = [
  { ms: 0, label: 'Mark' },
  { ms: ofRun(PHASES.BOUND), label: 'Leap', wide: true },
  { ms: ofRun(PHASES.BACK_FOOT), label: 'Back foot', wide: true },
  { ms: ofRun(PHASES.STRIDE_START), label: 'Delivery stride', quiet: true },
  { ms: ofRun(PHASES.FRONT_FOOT), label: 'Front foot down', quiet: true },
  { ms: RUNUP, label: 'Release', release: true },
  { ms: ofFollow(FOLLOW_PHASES.FOLLOWED), label: 'Fallen away', wide: true },
  { ms: ofFollow(FOLLOW_PHASES.RECOVERED), label: 'Stood' },
];
/** The express bowler's pre-gather, as `Bowler` blends it in and out. */
const PRE_GATHER = [ofRun(.40), ofRun(.61)];
function phaseAt(ms: number, express: boolean) {
  const t = ms / RUNUP;
  if (Math.abs(ms - RUNUP) <= 10) return 'Release';
  if (ms > RUNUP) return ms < ofFollow(FOLLOW_PHASES.FOLLOWED) ? 'Follow-through' : ms < ofFollow(FOLLOW_PHASES.RECOVERED) ? 'Standing up' : 'Stood';
  if (express && ms >= PRE_GATHER[0] && ms < ofRun(.55)) return 'Pre-gather';
  if (t < PHASES.BOUND) return t < .12 ? 'Top of the mark' : 'Run-up';
  if (t < PHASES.BACK_FOOT) return 'The leap';
  if (t < PHASES.STRIDE_START) return 'Back foot · gather';
  if (t < PHASES.FRONT_FOOT) return 'Delivery stride';
  return 'Front foot braced';
}

const ticks = document.getElementById('ticks')!;
function drawTicks() {
  const pct = (ms: number) => `${(ms / ACTION_MS * 100).toFixed(2)}%`;
  ticks.innerHTML = MARKS.map(m => `<i class="${m.release ? 'release' : ''}" style="left:${pct(m.ms)}" title="${m.label}"></i>`
    + (m.quiet ? '' : `<span class="${m.wide ? 'wide' : ''}" style="left:${pct(m.ms)}">${m.label}</span>`)).join('')
    + (state.show !== 'pace' ? `<div class="band" title="Express pre-gather" style="left:${pct(PRE_GATHER[0])};width:${pct(PRE_GATHER[1] - PRE_GATHER[0])}"></div>` : '');
  // The first and last labels sit inside the track rather than half off it.
  const spans = ticks.querySelectorAll('span');
  spans[0].style.transform = 'none';
  spans[spans.length - 1].style.transform = 'translateX(-100%)';
}

// ── Readings ──────────────────────────────────────────────────────────────
const readout = document.getElementById('readout')!;
const ROWS = ['Arm from upright', 'Arm speed, rad/s', 'Shoulders side-on', 'Ball hand height, m', 'Hip height, m', 'Moving at, m/s'];
/** Pose the rig at `ms`, and read the numbers off it: two samples 8 ms apart for the speeds. */
function pose(r: Rig, ms: number) {
  const dt = 8;
  r.bowler.animate(Math.max(0, ms - dt));
  const before = r.bowler.figure.inspect(), z0 = r.bowler.root.position.z;
  r.bowler.animate(ms);
  const s = r.bowler.figure.inspect(), z1 = r.bowler.root.position.z;
  const arm = (x: typeof s) => new THREE.Vector3(...x.hands[1]).sub(new THREE.Vector3(...x.shoulders[1]));
  const a0 = arm(before), a1 = arm(s);
  const fromVertical = Math.atan2(-a1.z, a1.y) * 180 / Math.PI;
  const rate = ms < dt ? 0 : a0.angleTo(a1) / (dt / 1000);
  const [l, rt] = s.shoulders;
  const side = Math.atan2(Math.abs(l[2] - rt[2]), Math.abs(l[0] - rt[0])) * 180 / Math.PI;
  const speed = ms < dt ? 0 : (z0 - z1) / (dt / 1000);
  return [
    `${fromVertical >= 0 ? '+' : '−'}${Math.abs(fromVertical).toFixed(0)}°`,
    rate.toFixed(1),
    `${side.toFixed(0)}°`,
    s.hands[1][1].toFixed(2),
    s.hip[1].toFixed(2),
    Math.max(0, speed).toFixed(1),
  ];
}
function writeReadout(values: string[][]) {
  const list = shown();
  const head = `<tr><th></th>${list.map(r => `<th><span class="dot ${r.key}"></span>${r.name}</th>`).join('')}</tr>`;
  readout.innerHTML = head + ROWS.map((row, i) => `<tr><td>${row}</td>${values.map(v => `<td>${v[i]}</td>`).join('')}</tr>`).join('');
}

// ── Drawing a moment ──────────────────────────────────────────────────────
const phaseEl = document.getElementById('phase')!, phaseTime = document.getElementById('phase-time')!;
const clock = document.getElementById('clock')!, scrub = document.getElementById('scrub') as HTMLInputElement;
let lastText = '';
function draw() {
  const ms = state.ms;
  const values: string[][] = [];
  for (const r of shown()) {
    values.push(pose(r, ms));
    // The ball in flight once it has left his hand, on the game's own trajectory.
    const progress = (ms - RUNUP) / r.flightMs;
    r.ball.visible = progress > 0 && progress <= 1;
    if (r.ball.visible) {
      const p = ballPosition(DELIVERY, progress);
      r.ball.position.set(p.x, p.y, p.z);
    }
    r.path.visible = r.done.visible = state.trail;
    const gone = THREE.MathUtils.clamp(ms / (RUNUP + FOLLOW * .36), 0, 1);
    r.done.geometry.setDrawRange(0, Math.floor(gone * r.pathSegments) * 6 * 6);
  }
  const express = state.show !== 'pace';
  const text = `${phaseAt(ms, express)}|${Math.round(ms)}|${values.flat().join('|')}`;
  if (text !== lastText) {
    lastText = text;
    phaseEl.textContent = phaseAt(ms, express);
    const toRelease = Math.round(ms - RUNUP);
    phaseTime.textContent = toRelease < 0 ? `${-toRelease} ms to release` : toRelease === 0 ? 'the ball leaves' : `${toRelease} ms after release`;
    clock.textContent = `${Math.round(ms)} / ${ACTION_MS} ms`;
    scrub.value = String(Math.round(ms));
    writeReadout(values);
  }
}

// ── Theme ─────────────────────────────────────────────────────────────────
function paint() {
  scene.background = new THREE.Color(css('--field') || '#d7e0d2');
  for (const r of Object.values(rigs)) {
    const color = new THREE.Color(css(r.key === 'pace' ? '--pace' : '--express') || '#a81c1c');
    (r.path.material as THREE.MeshBasicMaterial).color = color;
    (r.done.material as THREE.MeshBasicMaterial).color = color;
  }
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paint);
new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// ── Controls ──────────────────────────────────────────────────────────────
const play = document.getElementById('play') as HTMLButtonElement;
function setPlaying(on: boolean) { state.playing = on; play.textContent = on ? 'Pause' : 'Play'; }
play.onclick = () => { if (!state.playing && state.ms >= ACTION_MS) state.ms = 0; setPlaying(!state.playing); };
const step = (by: number) => { setPlaying(false); state.ms = THREE.MathUtils.clamp(state.ms + by, 0, ACTION_MS); };
document.getElementById('back')!.onclick = () => step(-10);
document.getElementById('fwd')!.onclick = () => step(10);
scrub.max = String(ACTION_MS);
scrub.oninput = () => { setPlaying(false); state.ms = Number(scrub.value); };
(document.getElementById('trail') as HTMLInputElement).onchange = e => { state.trail = (e.target as HTMLInputElement).checked; lastText = ''; };

function group(selector: string, attr: string, pick: (value: string) => void) {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>(selector)];
  for (const b of buttons) b.onclick = () => {
    for (const other of buttons) other.setAttribute('aria-pressed', String(other === b));
    pick(b.dataset[attr]!);
  };
}
group('[data-show]', 'show', v => { state.show = v as Show; layout(); drawTicks(); lastText = ''; draw(); if (state.cam !== 'game') aim(state.cam); });
group('[data-cam]', 'cam', v => aim(v as Cam));
group('[data-speed]', 'speed', v => { state.speed = Number(v); });
addEventListener('keydown', e => {
  if ((e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type === 'range') return;
  if (e.code === 'Space') { e.preventDefault(); play.click(); }
  if (e.code === 'ArrowLeft') step(e.shiftKey ? -50 : -10);
  if (e.code === 'ArrowRight') step(e.shiftKey ? 50 : 10);
});

// ── Running ───────────────────────────────────────────────────────────────
/** One view, or two through the same camera: side by side on a wide screen, one above the other on a tall one. */
function render() {
  const w = host.clientWidth, h = host.clientHeight;
  if (state.show !== 'both') {
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
    camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    return;
  }
  const across = w >= h;
  renderer.setScissorTest(true);
  [rigs.pace, rigs.express].forEach((r, i) => {
    rigs.pace.holder.visible = r === rigs.pace;
    rigs.express.holder.visible = r === rigs.express;
    // WebGL counts from the bottom, so the first of two stacked views is the upper one.
    const [x, y, vw, vh] = across ? [i * w / 2, 0, w / 2, h] : [0, (1 - i) * h / 2, w, h / 2];
    renderer.setViewport(x, y, vw, vh); renderer.setScissor(x, y, vw, vh);
    camera.aspect = vw / Math.max(1, vh); camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  });
  rigs.pace.holder.visible = rigs.express.holder.visible = true;
}

function resize() {
  const { clientWidth: w, clientHeight: h } = host;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(host);

let then = performance.now();
function frame(now: number) {
  const dt = Math.min(100, now - then); then = now;
  if (state.playing) {
    if (state.ms >= ACTION_MS) {
      // A beat on the last frame before going round again.
      if (!state.holdUntil) state.holdUntil = now + 700;
      if (now >= state.holdUntil) { state.ms = 0; state.holdUntil = 0; }
    } else state.ms = Math.min(ACTION_MS, state.ms + dt * state.speed);
  }
  draw();
  if (state.cam !== 'game') {
    // The camera walks in with him, so the view frames the body rather than
    // the turf he has already covered.
    const z = bowlerZ(), dz = z - followZ;
    followZ = z;
    camera.position.z += dz; controls.target.z += dz;
  }
  controls.update();
  render();
  requestAnimationFrame(frame);
}

layout(); paint(); drawTicks(); resize();
draw(); aim(state.cam);
requestAnimationFrame(frame);
