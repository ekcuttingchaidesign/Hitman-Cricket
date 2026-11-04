/**
 * The replay camera lab: the game's own scene — its grounds, its batter, its
 * bowler, its ball — playing the cover drive for four on a loop in a phone's
 * frame, with a camera that can be dragged anywhere, so a replay's angle can be
 * found by eye and handed over as numbers. The numbers are in the game's frame
 * as `replay.ts` writes them (+x the off side, +z towards the bowler, for a
 * right-hander), whatever hand is batting here, so they paste straight in.
 *
 * Nothing is scored or sent: the ball is bowled and struck through the scene's
 * own calls (`reset`, `runup`, `delivery`, `swing`, `hit`, `result`) as the
 * game makes them on a perfect cover drive, and its outcome is `resolveShot`'s.
 * `scripts/replay-camera-artifact.mjs` bundles it into one HTML file.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GameScene } from './scene/GameScene';
import { GAME, LINE_X, STYLES } from './config/gameplay';
import { flightProgress } from './game/DeliveryTrajectory';
import { resolveShot } from './game/ShotResolver';
import { COVER_V3_MEETS_AT, type CoverVersion } from './entities/Batter';
import { batOf, outfitOf, super10KitOf } from './game/dressing';
import { gloveOf } from './entities/gloves';
import { REPLAY_ANGLES, replayPace } from './game/replay';
import type { CameraPose } from './game/ShotReel';
import type { Delivery } from './game/types';
import type { GroundName } from './scene/grounds';

type Vec = [number, number, number];
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const round = (v: number) => Math.round(v * 100) / 100;
const vec = (v: readonly number[]) => `[${v.map(n => round(n).toFixed(2)).join(', ')}]`;
const smooth = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };

// ── The scene ───────────────────────────────────────────────────────────────
const stage = $('stage');
const scene = new GameScene(stage);
/** +1 for a left-hander's stage, -1 for a right-hander's: the game's frame is the world's x times this. */
const side = () => (scene.mirrored ? 1 : -1);

// ── The ball, and when everything happens on the loop's clock ───────────────
const LEAD = 700, AFTER = 2600;
let version: CoverVersion = 2;
let delivery: Delivery, times: { runup: number; release: number; swing: number; hit: number; end: number };
let outcome: ReturnType<typeof resolveShot>;
let meets = 1;

function plan() {
  const shape = STYLES.NORMAL, kph = 134;
  const runup = LEAD, release = LEAD + GAME.runupMs;
  const durationMs = (GAME.releaseZ - GAME.contactZ) / (kph / 3.6) * 1000 * GAME.travelScale * (shape.rush ?? 1);
  delivery = {
    line: 'OFF', style: 'NORMAL', speedKph: kph, baseTargetX: LINE_X.OFF, finalTargetX: LINE_X.OFF,
    bounceZ: shape.bounce ?? GAME.bounceZ, rise: shape.rise ?? GAME.rise,
    durationMs, releaseTimeMs: release, idealContactTimeMs: release + durationMs,
  } as Delivery;
  meets = version === 3 ? 1 - COVER_V3_MEETS_AT / (GAME.releaseZ - GAME.contactZ) : 1;
  // Played as a perfect press of the keys: the swing at the ideal moment, the
  // ball resolved once it reaches where this version meets it.
  const swing = delivery.idealContactTimeMs;
  let hit = swing;
  if (flightProgress(delivery, swing - release) < meets) {
    let low = swing - release, high = durationMs * 2;
    for (let i = 0; i < 40; i++) { const mid = (low + high) / 2; if (flightProgress(delivery, mid) < meets) low = mid; else high = mid; }
    hit = release + high;
  }
  outcome = resolveShot(delivery, { shotType: 'COVER_LONG_OFF', inputTimeMs: swing, grounded: version >= 2 }, { next: () => .5 });
  times = { runup, release, swing, hit, end: hit + AFTER };
  $('scrub').setAttribute('max', String(Math.round(times.end)));
  restart();
}

// ── Playing it, from any moment on the loop ─────────────────────────────────
let clock = 0, last = -1, anchored = false, swung = false, struck = false;
function restart() { scene.reset(); last = -1; anchored = false; swung = false; struck = false; }
function stageAt(t: number) {
  if (t < last) restart();
  if (t >= times.runup && t < times.release) scene.runup(Math.min(1, (t - times.runup) / GAME.runupMs));
  if (t >= times.release && !anchored) {
    // Jumped past the release: his action's clock set as if the run-up had been watched.
    scene.runup(1); scene.render(times.release); anchored = true;
  }
  if (t >= times.release && !struck) {
    if (!swung && t >= times.swing) {
      swung = true;
      scene.swing('COVER_LONG_OFF', times.swing, delivery, false, false, false, false, version, meets, false, false);
    }
    if (t >= times.hit) {
      if (!swung) { swung = true; scene.swing('COVER_LONG_OFF', times.swing, delivery, false, false, false, false, version, meets, false, false); }
      scene.hit(outcome, 'COVER_LONG_OFF', delivery, times.hit); struck = true;
    } else {
      const since = t - times.release;
      scene.delivery(delivery, flightProgress(delivery, since), since);
    }
  }
  if (struck) scene.result(t);
  last = t;
}

// ── The camera ──────────────────────────────────────────────────────────────
// Dragged in the world's own frame, so a drag goes the way the hand goes, and
// read out in the game's (`toGame`).
const proxy = new THREE.PerspectiveCamera(33, 1, .1, 400);
const controls = new OrbitControls(proxy, stage);
controls.enableDamping = true; controls.dampingFactor = .12; controls.zoomSpeed = .7; controls.rotateSpeed = .6;
let fov = 33;

interface Shot { eye: Vec; at: Vec; fov: number }
const toGame = (): Shot => ({
  eye: [proxy.position.x * side(), proxy.position.y, proxy.position.z],
  at: [controls.target.x * side(), controls.target.y, controls.target.z], fov,
});
function put(shot: Shot) {
  proxy.position.set(shot.eye[0] * side(), shot.eye[1], shot.eye[2]);
  controls.target.set(shot.at[0] * side(), shot.at[1], shot.at[2]);
  setFov(shot.fov); controls.update();
}
function setFov(value: number) {
  fov = Math.min(80, Math.max(5, value)); proxy.fov = fov; proxy.updateProjectionMatrix();
  ($('fov') as HTMLInputElement).value = String(Math.round(fov)); $('fov-out').textContent = `${Math.round(fov)}°`;
}

/** The angles to start from, in the game's frame for a right-hander. */
const home = scene.homeView;
const PRESETS: Record<string, { name: string; shot: Shot }> = {
  game: { name: 'Game view', shot: { eye: [...home.eye] as Vec, at: [...home.at] as Vec, fov: home.fov } },
  'idea-midoff': { name: 'Mid-off, wide', shot: { eye: [6.5, 2.4, 12.5], at: [-.2, .85, 1.6], fov: 26 } },
  point: { name: 'Point, square', shot: { eye: [13, 2.2, 1.8], at: [-.3, .9, 1.3], fov: 24 } },
  broadcast: { name: 'Behind bowler', shot: { eye: [.8, 5.2, 34], at: [-.2, .8, 1.2], fov: 11 } },
  squareleg: { name: 'Square leg', shot: { eye: [-11, 2.2, 2.4], at: [-.3, .9, 1.3], fov: 26 } },
  keeper: { name: 'Behind keeper', shot: { eye: [.4, 1.5, -6.5], at: [-.1, .9, 4], fov: 40 } },
  crane: { name: 'Crane over cover', shot: { eye: [7, 9, 10], at: [-.1, .5, 1.8], fov: 30 } },
};

// The move: from a start to an end over the loop, as the replay creeps.
let start: Shot | null = null, end: Shot | null = null, moving = false;
const lerp = (a: Vec, b: Vec, k: number): Vec => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
function moveAt(t: number): Shot | null {
  if (!moving || !start || !end) return null;
  const k = smooth(t / times.end);
  return { eye: lerp(start.eye, end.eye, k), at: lerp(start.at, end.at, k), fov: start.fov + (end.fov - start.fov) * k };
}

scene.cinematic(() => {
  const move = moveAt(clock);
  const shot = move ?? toGame();
  return { eye: shot.eye, at: shot.at, fov: shot.fov } satisfies CameraPose;
});

// ── How much of the picture he fills ────────────────────────────────────────
const scratch = new THREE.Vector3();
function batterShare() {
  // His feet and the top of his helmet, where he stands, in the world's frame.
  const x = GAME.stanceX * side(), z = GAME.stanceZ + .2;
  scratch.set(x, .02, z).project(scene.camera); const feet = scratch.y;
  scratch.set(x, 1.78, z).project(scene.camera); const head = scratch.y;
  // The bars take 11% top and bottom: the picture is the 78% between.
  return Math.abs(head - feet) / 2 / (bars ? .78 : 1);
}

// ── The loop ────────────────────────────────────────────────────────────────
let playing = true, speed = .5, replayTiming = true, bars = true, previous = 0, sinceReadout = 0;
function frame(now: number) {
  const dt = previous ? Math.min(now - previous, 50) : 0; previous = now;
  if (playing && !dragging) {
    const pace = replayTiming ? replayPace(clock - times.hit) : 1;
    clock += dt * speed * pace;
    if (clock > times.end) clock = 0;
  }
  if (!moving) controls.update();
  stageAt(clock);
  scene.render(clock);
  ($('scrub') as HTMLInputElement).value = String(Math.round(clock));
  sinceReadout += dt;
  if (sinceReadout > 100) { sinceReadout = 0; readout(); }
  requestAnimationFrame(frame);
}

function poseText(shot: Shot) { return `eye: ${vec(shot.eye)}\nat:  ${vec(shot.at)}\nfov: ${Math.round(shot.fov)}`; }
function readout() {
  const shot = moveAt(clock) ?? toGame();
  $('pose').textContent = poseText(shot);
  const share = batterShare();
  $('share').textContent = `${Math.round(share * 100)}%`;
  ($('share-bar') as HTMLElement).style.setProperty('--k', String(Math.min(1, share)));
  const label = share > .5 ? 'Close — shows the model up' : share > .3 ? 'Medium' : share > .1 ? 'Wide — reads well' : 'Very wide';
  $('share-say').textContent = label;
  $('t-out').textContent = `${(clock / 1000).toFixed(2)}s${Math.abs(clock - times.hit) < 60 ? ' · contact' : ''}`;
  $('move-out').textContent = start || end
    ? `Start ${start ? 'set' : '—'} · End ${end ? 'set' : '—'}` : 'No start or end set';
}

// ── Controls ────────────────────────────────────────────────────────────────
let dragging = false;
controls.addEventListener('start', () => { if (moving) setMoving(false); });

function pressed(group: string, id: string) {
  document.querySelectorAll<HTMLButtonElement>(`[data-group="${group}"]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === id)));
}
function onGroup(group: string, fn: (value: string) => void) {
  document.querySelectorAll<HTMLButtonElement>(`[data-group="${group}"]`).forEach(b => b.addEventListener('click', () => { pressed(group, b.dataset.value!); fn(b.dataset.value!); }));
}

let ground: GroundName = 'stadium', night = false, super10 = false, left = false;
function dress() {
  const shot = toGame();
  scene.stands(super10 ? 'canopy' : ground);
  scene.brand(super10);
  scene.time(super10 || night ? 'night' : 'day');
  scene.dressBatter(outfitOf('home'), batOf('plain'), gloveOf('sterling'), super10 ? super10KitOf('s10-purple') : null);
  scene.leftHanded(left);
  put(shot);
  restart();
}
onGroup('ground', v => { super10 = v === 'super10'; if (!super10) ground = v as GroundName; dress(); });
onGroup('light', v => { night = v === 'night'; dress(); });
onGroup('hand', v => { left = v === 'left'; dress(); });
onGroup('version', v => { version = Number(v) as CoverVersion; plan(); });
// The replay's own cameras, the ones the game shows a cover drive from, first.
const inGame = $('in-game');
for (const angle of REPLAY_ANGLES.cover) {
  PRESETS[angle.id] = { name: angle.name, shot: { eye: [...angle.eye] as Vec, at: [...angle.at] as Vec, fov: angle.fov } };
  const key = document.createElement('button');
  key.type = 'button'; key.dataset.group = 'preset'; key.dataset.value = angle.id; key.textContent = angle.name;
  inGame.append(key);
}
onGroup('preset', v => { setMoving(false); put(PRESETS[v].shot); });

$('play').addEventListener('click', () => { playing = !playing; $('play').textContent = playing ? 'Pause' : 'Play'; $('play').setAttribute('aria-pressed', String(!playing)); });
const scrub = $('scrub') as HTMLInputElement;
scrub.addEventListener('input', () => { clock = Number(scrub.value); });
scrub.addEventListener('pointerdown', () => { dragging = true; });
scrub.addEventListener('pointerup', () => { dragging = false; });
$('to-contact').addEventListener('click', () => { clock = times.hit - 40; playing = false; $('play').textContent = 'Play'; });
const speedInput = $('speed') as HTMLInputElement;
speedInput.addEventListener('input', () => { speed = Number(speedInput.value); $('speed-out').textContent = `${speed.toFixed(2)}×`; });
($('replay-timing') as HTMLInputElement).addEventListener('change', e => { replayTiming = (e.target as HTMLInputElement).checked; });
($('bars') as HTMLInputElement).addEventListener('change', e => { bars = (e.target as HTMLInputElement).checked; stage.classList.toggle('no-bars', !bars); });
($('fov') as HTMLInputElement).addEventListener('input', e => { setMoving(false); setFov(Number((e.target as HTMLInputElement).value)); });

function setMoving(on: boolean) {
  moving = on && !!start && !!end;
  ($('move') as HTMLInputElement).checked = moving;
  controls.enabled = !moving;
  if (!moving && on) flash('Set a start and an end first');
}
$('set-start').addEventListener('click', () => { start = toGame(); flash('Start set'); readout(); });
$('set-end').addEventListener('click', () => { end = toGame(); flash('End set'); readout(); });
($('move') as HTMLInputElement).addEventListener('change', e => setMoving((e.target as HTMLInputElement).checked));

// ── Copying it out ──────────────────────────────────────────────────────────
const json = (shot: Shot) => `{ "eye": ${vec(shot.eye)}, "at": ${vec(shot.at)}, "fov": ${Math.round(shot.fov)} }`;
function cameraText() {
  const lines = [`Replay camera (cover drive v${version}, game frame, right-hander's numbers)`, `camera: ${json(moveAt(clock) ?? toGame())}`];
  if (start) lines.push(`start:  ${json(start)}`);
  if (end) lines.push(`end:    ${json(end)}`);
  return lines.join('\n');
}
async function copy(text: string, what: string) {
  const box = $('copy-box') as HTMLTextAreaElement;
  box.value = text;
  try { await navigator.clipboard.writeText(text); flash(`${what} copied`); }
  catch { box.hidden = false; box.focus(); box.select(); flash('Select the text below and copy it'); }
}
$('copy').addEventListener('click', () => void copy(cameraText(), 'Camera'));

// Saved angles, kept in this browser.
const KEY = 'replay-camera-angles';
interface Saved { name: string; shot: Shot; start: Shot | null; end: Shot | null; version: CoverVersion }
let saved: Saved[] = [];
try { saved = JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { saved = []; }
const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* For this visit, then. */ } };
function drawSaved() {
  const list = $('saved');
  list.replaceChildren(...saved.map((s, i) => {
    const row = document.createElement('li');
    const go = document.createElement('button'); go.type = 'button'; go.className = 'saved-go'; go.textContent = s.name;
    go.addEventListener('click', () => { start = s.start; end = s.end; put(s.shot); setMoving(false); readout(); });
    const meta = document.createElement('span'); meta.className = 'saved-meta'; meta.textContent = `fov ${Math.round(s.shot.fov)}${s.start && s.end ? ' · move' : ''}`;
    const del = document.createElement('button'); del.type = 'button'; del.className = 'saved-del'; del.setAttribute('aria-label', `Remove ${s.name}`); del.textContent = '×';
    del.addEventListener('click', () => { saved.splice(i, 1); keep(); drawSaved(); });
    row.append(go, meta, del); return row;
  }));
  $('saved-empty').hidden = saved.length > 0;
  ($('copy-all') as HTMLButtonElement).disabled = saved.length === 0;
}
$('save').addEventListener('click', () => {
  const name = ($('save-name') as HTMLInputElement).value.trim() || `Angle ${saved.length + 1}`;
  saved.push({ name, shot: toGame(), start, end, version }); keep(); drawSaved();
  ($('save-name') as HTMLInputElement).value = ''; flash(`Saved “${name}”`);
});
$('copy-all').addEventListener('click', () => void copy(
  [`Replay camera angles (game frame, right-hander's numbers)`, ...saved.map(s =>
    `${s.name} (v${s.version}): ${json(s.shot)}${s.start ? `\n  start: ${json(s.start)}` : ''}${s.end ? `\n  end:   ${json(s.end)}` : ''}`)].join('\n'),
  'All angles'));

let toast = 0;
function flash(text: string) {
  const el = $('toast'); el.textContent = text; el.classList.add('on');
  clearTimeout(toast); toast = window.setTimeout(() => el.classList.remove('on'), 1600);
}

// ── Go ──────────────────────────────────────────────────────────────────────
pressed('ground', 'stadium'); pressed('light', 'day'); pressed('hand', 'right'); pressed('version', '2'); pressed('preset', 'midoff');
plan(); dress(); put(PRESETS.midoff.shot);
drawSaved(); readout();
requestAnimationFrame(frame);
