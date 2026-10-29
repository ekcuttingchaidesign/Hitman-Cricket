import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seeded } from './turf';

/**
 * A crowd that is never still, for the arena: everybody in the stands bobbing
 * on their seat and swaying from the hips, each to a rhythm of their own; a
 * Mexican wave sent round the bowl in the breaks; flags on poles waving over
 * the heads; and banners held up across a few seats, rippling.
 *
 * All of it is in the vertex shaders, off one clock (`CrowdLife`), so it costs
 * nothing a frame on the CPU however many there are: the crowd is still the
 * stadium's two instanced meshes, the flags one more and the banners one more.
 * Where each one sits (its instance's place) decides its phase, so no two
 * neighbours move together. Under reduced motion it all stands still.
 */
export interface CrowdLife {
  /** The clock, in seconds. */
  time: { value: number };
  /** Where the wave's front is, as an angle round the ground from straight down it, and how much of a wave there is, nought to one. */
  wave: { value: number };
  waveOn: { value: number };
  /** One under reduced motion. */
  still: { value: number };
}
export const crowdLife = (): CrowdLife => ({ time: { value: 0 }, wave: { value: 0 }, waveOn: { value: 0 }, still: { value: 0 } });

/** Where the ground's middle is, which the wave goes round: ten metres up the pitch. */
const CENTRE_Z = 10;

/**
 * The wave: how fast it goes round (a lap in sixteen seconds, about the
 * twelve metres a second a real one runs at this size of ground), where it
 * starts (a little round from straight, so it comes into a phone's picture
 * soon), and how long it lasts (a lap and a bit).
 */
export const WAVE = { lap: 16000, from: -1.4, laps: 1.25 } as const;
/** The wave at `since` milliseconds in: its front's angle and how strong it is. */
export function waveAt(since: number) {
  const ms = WAVE.lap * WAVE.laps;
  if (since < 0 || since >= ms) return { at: 0, on: 0 };
  const on = Math.min(1, since / 1200, (ms - since) / 1500);
  return { at: WAVE.from + since / WAVE.lap * Math.PI * 2, on };
}

const DECLARE = 'uniform float crowdTime, crowdWave, crowdWaveOn, crowdStill;';
/** A number from nought to one for a place on the ground, the same every frame. */
const HASH = 'fract(sin(dot(seat.xz, vec2(12.9898, 78.233))) * 43758.5453)';

function wire(material: THREE.Material, life: CrowdLife, key: string, body: string) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { crowdTime: life.time, crowdWave: life.wave, crowdWaveOn: life.waveOn, crowdStill: life.still });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${DECLARE}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${body}`);
  };
  material.customProgramCacheKey = () => key;
}

/**
 * Brings the stadium's crowd to life: its bodies' and heads' materials, which
 * must be their own (the shared scenery ones are drawn on boxes that have no
 * instances). Both are given the same movement, off the same seat, so a head
 * stays on its shoulders.
 */
export function livelyCrowd(materials: THREE.Material[], life: CrowdLife) {
  for (const material of materials) wire(material, life, 'crowd-life', `
#ifdef USE_INSTANCING
{
  vec3 seat = instanceMatrix[3].xyz;
  float phase = ${HASH} * 6.2831;
  float rate = 1.3 + fract(phase * 3.1) * 1.3;
  float moving = 1.0 - crowdStill;
  // A bob on the seat, and a sway from the hips, more the higher up the body.
  transformed.y += moving * 0.035 * max(0.0, sin(crowdTime * rate * 2.0 + phase));
  transformed.x += moving * 0.07 * sin(crowdTime * rate + phase) * (transformed.y + 0.25);
  // The wave: up on their feet as its front goes past, arms up — stretched
  // half as tall again, head and all — and down again behind it.
  float round = atan(seat.x, seat.z - ${CENTRE_Z.toFixed(1)});
  float off = mod(round - crowdWave + 3.14159, 6.28318) - 3.14159;
  float up = moving * crowdWaveOn * exp(-off * off / 0.045);
  transformed.y = transformed.y * (1.0 + 0.5 * up) + 0.6 * up;
}
#endif`);
}

/** The flags' colours: a home crowd's, the tricolour's saffron, white and green among team blues and reds. */
const FLAG_COLOURS = [0xff9933, 0xffffff, 0x138808, 0x1f4fd6, 0xd8322b, 0xff9933];
/** The flag, its pole and how many: one in about forty seats, most of them at the far end, where a phone looks. */
const FLAG = { width: 1.1, height: .7, pole: 1.7, far: 22, round: 14 } as const;

/** Seats a flag or banner can stand in: none in the covered seats or anywhere near the eyeline behind the bowler's arm. */
function clearOfEyeline(seat: THREE.Matrix4) {
  const e = seat.elements;
  return !(Math.abs(e[12]) < 7 && e[14] > 38);
}
/** Seats round the ground in order of how far round from straight down it they are, the far end first. */
function seatsBy(seats: THREE.Matrix4[], within: number, count: number, random: () => number) {
  const fit = seats.filter(seat => {
    const e = seat.elements, round = Math.abs(Math.atan2(e[12], e[14] - CENTRE_Z));
    return round < within && clearOfEyeline(seat);
  });
  const picked: THREE.Matrix4[] = [];
  for (let i = 0; i < count * 6 && picked.length < count && fit.length; i++) {
    const seat = fit[Math.floor(random() * fit.length)];
    const e = seat.elements;
    if (picked.every(p => Math.hypot(p.elements[12] - e[12], p.elements[13] - e[13], p.elements[14] - e[14]) > 3.2)) picked.push(seat);
  }
  return picked;
}

/**
 * Flags on poles held up over the heads, waving: one instanced mesh, the pole
 * and the cloth in one geometry, the pole drawn dark by its vertex colour and
 * the cloth taking the flag's. The cloth ripples off the pole, more the
 * further from it.
 */
export function flags(world: THREE.Object3D, seats: THREE.Matrix4[], life: CrowdLife) {
  const random = seeded(29);
  const held = [...seatsBy(seats, .75, FLAG.far, random), ...seatsBy(seats, Math.PI, FLAG.round, random)];
  const cloth = new THREE.PlaneGeometry(FLAG.width, FLAG.height, 10, 2).translate(FLAG.width / 2, FLAG.pole - FLAG.height / 2, 0);
  const pole = new THREE.CylinderGeometry(.025, .025, FLAG.pole, 4).translate(0, FLAG.pole / 2 - .2, 0);
  for (const [geometry, shade] of [[cloth, 1], [pole, .12]] as const) {
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(geometry.attributes.position.count * 3).fill(shade), 3));
  }
  const geometry = mergeGeometries([cloth.toNonIndexed(), pole.toNonIndexed()]);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, side: THREE.DoubleSide });
  wire(material, life, 'crowd-flag', `
#ifdef USE_INSTANCING
{
  vec3 seat = instanceMatrix[3].xyz;
  float phase = ${HASH} * 6.2831;
  float along = max(0.0, transformed.x);
  float moving = 1.0 - crowdStill;
  // Waved: the cloth travels in waves away from the pole, the pole swung a little in the hand.
  transformed.z += moving * along * 0.32 * sin(along * 5.0 - crowdTime * 7.0 + phase);
  transformed.y += moving * along * 0.06 * sin(along * 4.0 - crowdTime * 5.0 + phase);
  transformed.x += moving * 0.12 * sin(crowdTime * 2.2 + phase) * (transformed.y + 0.2) / ${FLAG.pole.toFixed(1)};
}
#endif`);
  const mesh = new THREE.InstancedMesh(geometry, material, held.length);
  held.forEach((seat, i) => {
    mesh.setMatrixAt(i, seat.clone().multiply(new THREE.Matrix4().makeTranslation(.3, .4, .1)));
    mesh.setColorAt(i, new THREE.Color(FLAG_COLOURS[i % FLAG_COLOURS.length]));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false; mesh.name = 'Flags';
  world.add(mesh);
  return mesh;
}

/** What the banners say, a row of the sheet each: the fans' own words, in the brand's colours. */
export const BANNERS = [
  { text: 'SUPER10', ink: '#c6ff1a', cloth: '#2a0e5c' },
  { text: 'HIT IT HERE', ink: '#12052b', cloth: '#ffffff' },
  { text: '6 6 6', ink: '#ffffff', cloth: '#e2401c' },
  { text: 'TEN OVERS. FULL CHARGE.', ink: '#ffffff', cloth: '#1f4fd6' },
  { text: 'HITMAN!', ink: '#2a0e5c', cloth: '#ffffff' },
  { text: 'MAXIMUM', ink: '#c6ff1a', cloth: '#12052b' },
] as const;
const BANNER = { width: 3.4, height: .62, rows: BANNERS.length, far: 9, round: 5 } as const;

function bannerSheet() {
  const W = 1024, H = 128 * BANNER.rows;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (ctx) BANNERS.forEach((banner, row) => {
    const y = row * 128;
    ctx.fillStyle = banner.cloth; ctx.fillRect(0, y, W, 128);
    ctx.fillStyle = banner.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'italic 900 84px Saira, "Arial Black", Impact, sans-serif';
    const fit = Math.min(1, (W - 60) / ctx.measureText(banner.text).width);
    ctx.save(); ctx.translate(W / 2, y + 68); ctx.scale(fit, 1); ctx.fillText(banner.text, 0, 0); ctx.restore();
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, canvas };
}

/**
 * Banners held up across a few seats by the fans behind them, each a row of
 * one painted sheet (`BANNERS`, the row an attribute of its instance),
 * rippling between the hands that hold its ends. Painted again once the
 * brand's face has loaded, so the words are in it.
 */
export function banners(world: THREE.Object3D, seats: THREE.Matrix4[], life: CrowdLife) {
  const random = seeded(53);
  const held = [...seatsBy(seats, .7, BANNER.far, random), ...seatsBy(seats, Math.PI, BANNER.round, random)];
  const { texture, canvas } = bannerSheet();
  const geometry = new THREE.PlaneGeometry(BANNER.width, BANNER.height, 12, 1);
  geometry.setAttribute('bannerRow', new THREE.InstancedBufferAttribute(new Float32Array(held.map((_, i) => i % BANNER.rows)), 1));
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: .85, side: THREE.DoubleSide });
  const ripple = `
#ifdef USE_INSTANCING
{
  vec3 seat = instanceMatrix[3].xyz;
  float phase = ${HASH} * 6.2831;
  float across = (transformed.x / ${BANNER.width.toFixed(2)}) + 0.5;
  float moving = 1.0 - crowdStill;
  // Held at both ends: it ripples most in the middle, and the whole of it lifts and dips with the arms.
  transformed.z += moving * sin(across * 3.14159) * 0.12 * sin(crowdTime * 3.0 + across * 6.0 + phase);
  transformed.y += moving * 0.08 * sin(crowdTime * 1.6 + phase);
}
#endif`;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { crowdTime: life.time, crowdWave: life.wave, crowdWaveOn: life.waveOn, crowdStill: life.still });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${DECLARE}\nattribute float bannerRow;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${ripple}`)
      // Each banner reads its own row of the sheet: the rows run top to bottom, the texture's v bottom to top.
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv.y = (vMapUv.y + ${(BANNER.rows - 1).toFixed(1)} - bannerRow) / ${BANNER.rows.toFixed(1)};\n#endif`);
  };
  material.customProgramCacheKey = () => 'crowd-banner';
  const mesh = new THREE.InstancedMesh(geometry, material, held.length);
  held.forEach((seat, i) => mesh.setMatrixAt(i, seat.clone().multiply(new THREE.Matrix4().makeTranslation(0, 1.05, -.3).multiply(new THREE.Matrix4().makeRotationY(Math.PI)))));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false; mesh.name = 'Banners';
  world.add(mesh);
  const repaint = () => { const again = bannerSheet(); canvas.getContext('2d')?.drawImage(again.canvas, 0, 0); again.texture.dispose(); texture.needsUpdate = true; };
  document.fonts?.load('italic 900 84px Saira').then(repaint).catch(() => {});
  return { mesh, texture };
}

/**
 * Phone torches held up in the stands, as a crowd does under lights: a point
 * over a seat in every seat clear of the eyeline, each up only while the
 * share asked for (`torches` in `arenaFrame`) is past its own draw, so more
 * go up as the game gets tight and the same ones stay up. Each twinkles as
 * the hand holding it moves; under reduced motion they stand steady. One
 * draw for all of them, in the vertex shader: a torch that is down is a
 * point of no size.
 */
export function torches(world: THREE.Object3D, seats: THREE.Matrix4[], life: CrowdLife) {
  const random = seeded(97);
  const held = seats.filter(clearOfEyeline);
  const at: number[] = [], draw: number[] = [], phase: number[] = [];
  for (const seat of held) {
    const e = seat.elements;
    at.push(e[12], e[13] + .62, e[14]); draw.push(random()); phase.push(random() * Math.PI * 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(at, 3));
  geometry.setAttribute('torchAt', new THREE.Float32BufferAttribute(draw, 1));
  geometry.setAttribute('torchPhase', new THREE.Float32BufferAttribute(phase, 1));
  const texture = torchTexture();
  const material = new THREE.PointsMaterial({ map: texture, color: 0xeef4ff, size: 1.3, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
  const share = { value: 0 };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { crowdTime: life.time, crowdStill: life.still, torchShare: share });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float crowdTime, crowdStill, torchShare;\nattribute float torchAt, torchPhase;')
      .replace('#include <fog_vertex>', `
  float up = step(torchAt, torchShare);
  float twinkle = mix(0.65 + 0.35 * sin(crowdTime * 5.0 + torchPhase), 1.0, crowdStill);
  gl_PointSize *= up * twinkle;
#include <fog_vertex>`);
  };
  material.customProgramCacheKey = () => 'crowd-torch';
  const points = new THREE.Points(geometry, material);
  points.name = 'Phone torches';
  world.add(points);
  return { material, share, texture };
}

/** A torch's light: a hot white middle in a soft round glow. */
function torchTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.18, 'rgba(255,255,255,.95)'); g.addColorStop(.4, 'rgba(255,255,255,.3)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
