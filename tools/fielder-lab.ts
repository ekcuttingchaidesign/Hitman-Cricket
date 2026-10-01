import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Batter } from '../src/entities/Batter';
import {
  DIVE, Fielder, REACTION_MS, Routine, idle, midpointOfHands, onField, planCatch, splitStep, travel,
  type Action, type Body, type Idle, type Spot,
} from '../src/entities/Fielder';
import { ease, span } from '../src/entities/rig';
import { Field } from '../src/scene/field';

/**
 * The fielders' rig, one action at a time and then all of them together.
 *
 * Every clip is built from the same planner the game will use, on the game's
 * own coordinates: the batter at the origin, the bowler's end up the pitch at
 * eighteen metres, the stage mirrored so the leg side reads left. What moves
 * here is what will move there. Excluded from the production build, like the
 * bowler's lab beside it.
 */

const HIT = 1000;
const HANG = 1650;
const BAT = new THREE.Vector3(-.2, 1.05, 1.3);
const toBat = (x: number, z: number) => Math.atan2(-x, -z);
const spotAt = (x: number, z: number): Spot => ({ x, z, heading: toBat(x, z) });

interface Cast { fielder: Fielder; routine: Routine }
interface Built {
  cast: Cast[];
  /** Whom the camera follows and the read-out describes. */
  lead: number;
  ball?: (t: number) => THREE.Vector3 | null;
  /** Where the catch is going to be, for the ring on the turf. */
  ring?: { at: THREE.Vector3; from: number; to: number };
}
interface Clip {
  id: string; group: string; label: string; length: number; view: View; note: string;
  build(): Built;
}
type View = 'follow' | 'side' | 'game';

/** A ball skied off the bat into a fielder's catch, held or spilled, then wherever he takes it. */
function flightTo(plan: ReturnType<typeof planCatch>, dropped: boolean, apex = 12, hit = HIT) {
  const { routine, catchAt, hands } = plan;
  const rising = routine.actions.find(a => a.name.startsWith('Up'));
  const held = (t: number) => {
    const body = routine.at(t);
    const middle = midpointOfHands(body);
    if (!rising || t < rising.start) return middle;
    return middle.lerp(onField(body, body.pose.rightHand), ease(span(t, rising.start, rising.start + 500)));
  };
  const spillAt = catchAt + (DIVE.land - DIVE.catch) + 40;
  const spilled = held(spillAt);
  return (t: number) => {
    if (t < hit) return null;
    if (t <= catchAt) {
      const u = (t - hit) / (catchAt - hit);
      const p = BAT.clone().lerp(hands, u);
      p.y += Math.sin(u * Math.PI) * apex;
      return p;
    }
    if (!dropped || t < spillAt) return held(t);
    // Out of his hands on landing: up a little, forward, down, and a short roll.
    const s = (t - spillAt) / 1000;
    const away = new THREE.Vector3(Math.sin(routine.at(spillAt).heading), 0, Math.cos(routine.at(spillAt).heading));
    const y = Math.max(.04, spilled.y + 1.6 * s - 4.9 * s * s);
    return spilled.clone().addScaledVector(away, Math.min(1.1, 1.4 * s)).setY(y);
  };
}

function soloCatch(home: Spot, ball: THREE.Vector3, dropped = false, style: Idle = 'loose'): Built {
  let fly: (t: number) => THREE.Vector3 | null = () => null;
  const plan = planCatch(home, ball, HIT, HIT + HANG, { dropped, look: t => fly(t) });
  fly = flightTo(plan, dropped);
  const routine = new Routine([idle(home, style, 1.7, -Infinity, HIT - 300), ...plan.routine.actions], plan.routine.look);
  const fielder = new Fielder();
  return { cast: [{ fielder, routine }], lead: 0, ball: fly, ring: { at: plan.hands, from: HIT, to: plan.catchAt } };
}

/** A point `sideways` metres to his side and `forward` metres towards the bat from his mark. */
function offset(home: Spot, sideways: number, forward: number, height = .6) {
  const f = new THREE.Vector3(Math.sin(home.heading), 0, Math.cos(home.heading));
  const r = new THREE.Vector3(Math.cos(home.heading), 0, -Math.sin(home.heading));
  return new THREE.Vector3(home.x, height, home.z).addScaledVector(r, sideways).addScaledVector(f, forward);
}

const MIDWICKET = spotAt(-8, 19);
const FIELD: { spot: Spot; style: Idle; seed: number }[] = [
  { spot: spotAt(8.5, 18), style: 'hips', seed: .3 },     // mid-off
  { spot: spotAt(-8.5, 18), style: 'loose', seed: 1.9 },  // mid-on
  { spot: spotAt(16, 10), style: 'loose', seed: 3.1 },    // cover
  { spot: spotAt(-16.5, 11), style: 'hips', seed: 4.4 },  // midwicket
  { spot: spotAt(10, 35), style: 'loose', seed: 5.2 },    // long-off
  { spot: spotAt(-11, 34), style: 'hips', seed: 6.6 },    // long-on
];

/**
 * A ball along the ground through the Blast's field, planned by the game's
 * own `Field` exactly as the game plans it: the walk in, the split step, the
 * line turned off anybody it would have gone through, and whoever goes after
 * it. Then it is played back. The camera follows `who`: the man who dives,
 * chases, or picks it up.
 */
function groundBall(angle: number, distance: number, four: boolean, who: 'Diving catch' | 'Chasing it' | 'Picking it up'): Built {
  const field = new Field();
  const hit = HIT + 1600, flightMs = 1250;
  field.walkIn(HIT - 400);
  field.set(HIT + 400, hit);
  const turned = field.clear(hit, angle * Math.PI / 180, distance);
  const from = BAT.clone().setY(.1);
  const to = new THREE.Vector3(Math.sin(turned) * distance, .1, Math.cos(turned) * distance);
  let ballAt: (t: number) => THREE.Vector3 | null = () => null;
  const { gathered } = field.ground(hit, hit + flightMs, t => ballAt(t), { from, to, flightMs, four });
  ballAt = t => {
    if (t < hit) return null;
    const held = field.held(t);
    if (held) return held;
    const u = Math.min(1, (t - hit) / flightMs);
    if (u >= 1 && !gathered) return null;
    const p = from.clone().lerp(to, u);
    p.y = .1 + Math.sin(Math.min(1, u * 1.6) * Math.PI) * .22;
    return p;
  };
  const cast = field.fielders.map((fielder, i) => ({ fielder, routine: field.routine(i) }));
  const lead = Math.max(0, cast.findIndex(c => c.routine.actions.some(a => a.name === who)));
  return { cast, lead, ball: ballAt };
}

const CLIPS: Clip[] = [
  {
    id: 'idle', group: 'Waiting', label: 'Waiting', length: 9000, view: 'follow',
    note: 'Between balls. He breathes, his weight drifts from one foot to the other, and now and then he glances away. Each fielder runs on his own seed, so six of them never breathe together.',
    build: () => ({ cast: [{ fielder: new Fielder(), routine: new Routine([idle(MIDWICKET, 'loose', 1.1)]) }], lead: 0 }),
  },
  {
    id: 'hips', group: 'Waiting', label: 'Hands on hips', length: 9000, view: 'follow',
    note: 'The other way of waiting. The hands are placed on the hip bones and the elbows go wide because the solver bends them that way. The elbows are not posed.',
    build: () => ({ cast: [{ fielder: new Fielder(), routine: new Routine([idle(MIDWICKET, 'hips', 2.4)]) }], lead: 0 }),
  },
  {
    id: 'walkin', group: 'Waiting', label: 'Walk in and split step', length: 6200, view: 'follow',
    note: 'As the bowler runs in, the fielder walks in two metres. A small hop as the ball is bowled lands him wide and low as it reaches the bat. Then he walks back to his mark backwards, still watching the batter. The feet stay planted while the body goes over them.',
    build: () => {
      const home = MIDWICKET;
      const inside = offset(home, 0, 2.1, 0);
      const walk = travel(home, inside, 900, 1350, 'stop', { name: 'Walking in' });
      const set: Spot = { x: inside.x, z: inside.z, heading: home.heading };
      const back = travel(set, home, 3700, 1700, 'stop', { face: home.heading, name: 'Walking back' });
      return {
        cast: [{ fielder: new Fielder(), routine: new Routine([idle(home, 'loose', 1.1, -Infinity, 900), walk, splitStep(set, 2250, 280, 3700), back, idle(home, 'loose', 1.1, 5400)]) }],
        lead: 0,
      };
    },
  },
  {
    id: 'run', group: 'Moving', label: 'Sprint and pull up', length: 5200, view: 'side',
    note: 'From standing to a sprint and back to a stop over sixteen metres. The stride lengthens with pace and the time each foot spends on the ground shortens. The arms go from swinging to pumping. Pulling up, he takes short steps to stop.',
    build: () => {
      const home = spotAt(-3, 20);
      const to = { x: home.x - 16, z: home.z };
      const run = travel(home, to, 600, 3400, 'stop', { name: 'Running' });
      const end: Spot = { x: to.x, z: to.z, heading: run.at(run.end).heading };
      return { cast: [{ fielder: new Fielder(), routine: new Routine([idle(home, 'loose', 1, -Infinity, 600), run, idle(end, 'loose', 1, 4200)]) }], lead: 0 };
    },
  },
  {
    id: 'dive-across', group: 'Catching', label: 'Diving catch, sideways', length: 5200, view: 'follow',
    note: 'The ball is seven metres to his side. He reads it for a quarter of a second, sprints, and dives the last two metres. He rolls on to his side so his chest stays towards the bat, takes it at full stretch just before he lands, then gets up with the ball held high.',
    build: () => soloCatch(MIDWICKET, offset(MIDWICKET, 7.5, -.5)),
  },
  {
    id: 'dive-other', group: 'Catching', label: 'Diving catch, other side', length: 5200, view: 'follow',
    note: 'The same catch to his other hand, further back. He has to turn and go, so it is a longer sprint and a flatter dive.',
    build: () => soloCatch(MIDWICKET, offset(MIDWICKET, -7, -2.5)),
  },
  {
    id: 'dive-in', group: 'Catching', label: 'Diving catch, coming in', length: 5200, view: 'follow',
    note: 'Mistimed and dropping short. He charges in and dives forward on to his front with both hands out in front of him, and takes it just above the grass.',
    build: () => soloCatch(MIDWICKET, offset(MIDWICKET, 1, 9, .45)),
  },
  {
    id: 'high', group: 'Catching', label: 'Settled under it', length: 4600, view: 'follow',
    note: 'A skier he has time for. He moves a few steps, settles, and takes it above his head. No dive is needed when the ball is this close.',
    build: () => soloCatch(MIDWICKET, offset(MIDWICKET, 2, -1.2, 2.2)),
  },
  {
    id: 'drop', group: 'Catching', label: 'Diving, put down', length: 5400, view: 'follow',
    note: 'He gets there and gets both hands to it. The ball comes out as he hits the ground, and he gets up with his hands on his head.',
    build: () => soloCatch(MIDWICKET, offset(MIDWICKET, 6.5, 0), true),
  },
  {
    id: 'beaten', group: 'Along the ground', label: 'Cover drive, beaten by it', length: 6800, view: 'follow',
    note: 'A cover drive struck straight at mid-off in the Blast field. The line is turned a stride and a half off him, and he goes from the spot, full length towards it, and is down just as it passes his hands. Then he gets up with his hands on his head.',
    build: () => groundBall(24, 44, true, 'Diving catch'),
  },
  {
    id: 'chase', group: 'Along the ground', label: 'On drive for four, chased', length: 6800, view: 'follow',
    note: 'An on drive along the ground to the rope. The man in the deep nearest where it crosses goes after it as hard as he can and pulls up when it is over, then jogs back to his mark so the bowler is not kept waiting.',
    build: () => groundBall(-24, 44, true, 'Chasing it'),
  },
  {
    id: 'pick', group: 'Along the ground', label: 'Picked up for two', length: 7200, view: 'follow',
    note: 'A push into the field that stops for two. The nearest man runs to it, gets there once it has stopped, bends to pick it up with his right hand, and comes up with it at his chest. There is no throw.',
    build: () => groundBall(-30, 19, false, 'Picking it up'),
  },
  {
    id: 'field', group: 'In the field', label: 'Six fielders, one catch', length: 8600, view: 'game',
    note: 'The whole ring from the game camera. They wait, walk in with the bowler and split step together. Then one of them runs and dives for a mistimed drive while the rest turn to watch and the nearest backs him up. The deep fielders are out of shot most of the time, which is how it will be in the game.',
    build: () => {
      const hit = HIT + 2000;
      let fly: (t: number) => THREE.Vector3 | null = () => null;
      const cast: Cast[] = [];
      const catcher = 1;
      const walkStart = hit - 1650, walkMs = 1350;
      FIELD.forEach(({ spot, style, seed }, i) => {
        const inside = offset(spot, 0, i >= 4 ? 1.4 : 2, 0);
        const walk = travel(spot, inside, walkStart + seed * 30, walkMs, 'stop', { name: 'Walking in' });
        const set: Spot = { x: inside.x, z: inside.z, heading: spot.heading };
        const before: Action[] = [idle(spot, style, seed, -Infinity, walkStart + seed * 30), walk];
        if (i === catcher) {
          const target = offset(set, 6.5, 3.5, .6);
          const plan = planCatch(set, target, hit, hit + HANG, { look: t => fly(t) });
          fly = flightTo(plan, false, 11, hit);
          cast.push({ fielder: new Fielder(), routine: new Routine([...before, ...plan.routine.actions], plan.routine.look) });
          return;
        }
        const actions: Action[] = [...before, splitStep(set, hit - 300, 280, hit + REACTION_MS)];
        // Mid-off is nearest, so he backs up: a few strides towards where it
        // is coming down, in case it goes through.
        if (i === 0) {
          const towards = offset(set, -3.5, -1, 0);
          actions.push(travel(set, towards, hit + REACTION_MS + 120, 1500, 'stop', { name: 'Backing up' }));
        }
        cast.push({ fielder: new Fielder(), routine: new Routine(actions, t => fly(t)) });
      });
      return { cast, lead: catcher, ball: t => fly(t) };
    },
  },
];

// ---------------------------------------------------------------------------
// The stage
// ---------------------------------------------------------------------------

const host = document.getElementById('stage')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
host.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfd7e3);
scene.fog = new THREE.Fog(0xbfd7e3, 60, 140);
scene.add(new THREE.HemisphereLight(0xfff4e2, 0x5f7247, 1.9));
const sun = new THREE.DirectionalLight(0xffedce, 3.0);
sun.position.set(-15, 30, -8); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 40, bottom: -24 });
sun.shadow.normalBias = .025;
scene.add(sun);

// The game mirrors its stage so the leg side reads left; so does this.
const stage = new THREE.Group(); stage.scale.x = -1; scene.add(stage);
const grass = new THREE.Mesh(new THREE.CircleGeometry(70, 96), new THREE.MeshStandardMaterial({ color: 0x5f8d43, roughness: .95 }));
grass.rotation.x = -Math.PI / 2; grass.position.set(0, -.03, 10); grass.receiveShadow = true; stage.add(grass);
// Mowing stripes, so movement across the turf can be read against something.
for (let i = -6; i <= 6; i++) {
  if (i % 2) continue;
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(5, 120), new THREE.MeshStandardMaterial({ color: 0x6a9a4b, roughness: .95 }));
  stripe.rotation.x = -Math.PI / 2; stripe.position.set(i * 5, -.025, 10); stripe.receiveShadow = true; stage.add(stripe);
}
const strip = new THREE.Mesh(new THREE.BoxGeometry(2.8, .02, 22), new THREE.MeshStandardMaterial({ color: 0xcdb487, roughness: .9 }));
strip.position.set(0, 0, 9.35); strip.receiveShadow = true; stage.add(strip);
const rope = new THREE.Mesh(new THREE.TorusGeometry(30, .06, 5, 128), new THREE.MeshStandardMaterial({ color: 0xffffff }));
rope.rotation.x = Math.PI / 2; rope.position.set(0, .06, 10); stage.add(rope);
const ringLine = new THREE.Mesh(new THREE.RingGeometry(21.9, 22, 128), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .35 }));
ringLine.rotation.x = -Math.PI / 2; ringLine.position.set(0, .01, 10); stage.add(ringLine);
for (const z of [0, 18.7]) for (const x of [-.11, 0, .11]) {
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .72, 8), new THREE.MeshStandardMaterial({ color: 0xf5ecd8 }));
  stump.position.set(x, .36, z); stump.castShadow = true; stage.add(stump);
}
const batter = new Batter(); batter.reset(); batter.update(0); stage.add(batter.root);
const ball = new THREE.Mesh(new THREE.SphereGeometry(.115, 20, 14), new THREE.MeshStandardMaterial({ color: 0xe84829, roughness: .34, emissive: 0x972708, emissiveIntensity: .25 }));
ball.castShadow = true; stage.add(ball);
const shadow = new THREE.Mesh(new THREE.CircleGeometry(.17, 16), new THREE.MeshBasicMaterial({ color: 0x243828, transparent: true, opacity: .35, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2; stage.add(shadow);
const ring = new THREE.Mesh(new THREE.RingGeometry(.6, .66, 32), new THREE.MeshBasicMaterial({ color: 0xffe4a6, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false }));
ring.rotation.x = -Math.PI / 2; stage.add(ring);

const camera = new THREE.PerspectiveCamera(42, 16 / 9, .1, 200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI * .49;

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const clipsEl = $('clips'), playEl = $<HTMLButtonElement>('play'), speedEl = $<HTMLSelectElement>('speed');
const scrubEl = $<HTMLInputElement>('scrub'), timeEl = $('time'), noteEl = $('note'), titleEl = $('clip-title');
const ticksEl = $('ticks'), hudEl = $('hud');
const views = [...document.querySelectorAll<HTMLButtonElement>('[data-view]')];

let clip = CLIPS[0];
let built: Built;
let view: View = clip.view;
let t = 0, playing = true, rate = .5, last = performance.now();
const followed = new THREE.Vector3();

for (const group of [...new Set(CLIPS.map(c => c.group))]) {
  const section = document.createElement('div'); section.className = 'clip-group';
  section.innerHTML = `<span class="group-label">${group}</span>`;
  const row = document.createElement('div'); row.className = 'clip-row';
  for (const c of CLIPS.filter(c => c.group === group)) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'clip'; b.textContent = c.label; b.dataset.clip = c.id;
    b.addEventListener('click', () => load(c));
    row.append(b);
  }
  section.append(row); clipsEl.append(section);
}

function load(next: Clip) {
  clip = next;
  if (built) for (const { fielder } of built.cast) stage.remove(fielder.root);
  built = next.build();
  for (const { fielder } of built.cast) {
    fielder.figure.root.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    stage.add(fielder.root);
  }
  for (const b of clipsEl.querySelectorAll<HTMLButtonElement>('.clip')) b.setAttribute('aria-pressed', String(b.dataset.clip === next.id));
  titleEl.textContent = next.label; noteEl.textContent = next.note;
  scrubEl.max = String(next.length);
  t = 0; setView(next.view, true);
  // The lead fielder's actions, as marks along the timeline you can jump to.
  ticksEl.replaceChildren();
  const seen = new Set<string>();
  for (const action of built.cast[built.lead].routine.actions) {
    if (!Number.isFinite(action.start) || action.start < 0 || action.start > next.length || seen.has(action.name)) continue;
    seen.add(action.name);
    const tick = document.createElement('button'); tick.type = 'button'; tick.className = 'tick';
    tick.style.left = `${action.start / next.length * 100}%`; tick.textContent = action.name;
    tick.addEventListener('click', () => { t = action.start; draw(); });
    ticksEl.append(tick);
  }
  draw();
}

function setView(next: View, reset = false) {
  view = next;
  for (const b of views) b.setAttribute('aria-pressed', String(b.dataset.view === next));
  controls.enabled = next !== 'game';
  if (next === 'game') {
    camera.fov = 50; camera.position.set(0, 2.9, -5.15); camera.lookAt(0, 1.05, 9);
  } else if (reset || next === 'side' || next === 'follow') {
    camera.fov = 42;
    const hip = hipOf(built.cast[built.lead].routine.at(t));
    // In the mirrored stage a point's x is flipped on its way to the screen.
    followed.set(-hip.x, .9, hip.z);
    if (next === 'follow') camera.position.set(followed.x + 2.9, 1.7, followed.z - 3.6);
    else camera.position.set(followed.x, 1.3, followed.z - 6.5);
    controls.target.copy(followed);
  }
  camera.updateProjectionMatrix();
}

/** Where his hips are on the field: what the camera follows, through a dive and all. */
const hipOf = (body: Body) => onField(body, body.pose.hip);

function draw() {
  let lead: Body | null = null;
  built.cast.forEach(({ fielder, routine }, i) => {
    const body = routine.at(t);
    fielder.show(body);
    if (i === built.lead) lead = body;
  });
  const b = built.ball?.(t) ?? null;
  ball.visible = !!b; shadow.visible = !!b;
  if (b) {
    ball.position.copy(b);
    shadow.position.set(b.x, .02, b.z);
    shadow.scale.setScalar(1 + Math.max(0, b.y) * .22);
  }
  ring.visible = !!built.ring && t >= built.ring.from && t <= built.ring.to;
  if (built.ring) ring.position.set(built.ring.at.x, .03, built.ring.at.z);
  if (lead && view !== 'game') {
    // Keep the camera's offset and carry it along with him.
    const hip = hipOf(lead as Body);
    const next = new THREE.Vector3(-hip.x, .9, hip.z);
    const delta = next.clone().sub(followed);
    camera.position.add(delta);
    controls.target.add(delta); followed.copy(next);
  }
  const routine = built.cast[built.lead].routine;
  const action = routine.actions[routine.current(t)];
  const speed = 'speedAt' in action && t <= action.end ? (action as unknown as { speedAt(t: number): number }).speedAt(t) : 0;
  hudEl.textContent = `${action.name}${speed > .3 ? ` · ${speed.toFixed(1)} m/s` : ''}`;
  scrubEl.value = String(Math.round(t));
  timeEl.textContent = `${(t / 1000).toFixed(2)} s`;
}

function resize() {
  const w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(host);

playEl.addEventListener('click', () => { playing = !playing; playEl.textContent = playing ? 'Pause' : 'Play'; playEl.setAttribute('aria-pressed', String(!playing)); });
speedEl.addEventListener('change', () => { rate = Number(speedEl.value); });
scrubEl.addEventListener('input', () => { t = Number(scrubEl.value); draw(); });
for (const b of views) b.addEventListener('click', () => setView(b.dataset.view as View, true));
document.addEventListener('keydown', e => {
  const on = (e.target as HTMLElement).tagName;
  if (on === 'BUTTON' || on === 'SELECT') return;
  if (e.key === ' ') { e.preventDefault(); playEl.click(); }
  if (e.key === 'ArrowRight') { t = Math.min(clip.length, t + 1000 / 30); draw(); }
  if (e.key === 'ArrowLeft') { t = Math.max(0, t - 1000 / 30); draw(); }
});

/** For the contact-sheet script: put a clip at a moment and render it. */
(window as unknown as { lab: unknown }).lab = {
  clips: CLIPS.map(c => ({ id: c.id, length: c.length })),
  show(id: string, at: number, v?: View) {
    playing = false; load(CLIPS.find(c => c.id === id)!); t = at; if (v) setView(v, true); draw();
    controls.update(); renderer.render(scene, camera);
  },
  inspect: (at: number) => built.cast.map(({ routine, fielder }) => { fielder.show(routine.at(at)); return fielder.figure.inspect(); }),
};

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduced) { playing = false; playEl.textContent = 'Play'; }
const wanted = CLIPS.find(c => c.id === location.hash.slice(1));
load(wanted ?? CLIPS[0]);
resize();
renderer.setAnimationLoop(now => {
  const dt = Math.min(100, now - last); last = now;
  if (playing) { t += dt * rate; if (t > clip.length) t = 0; draw(); }
  controls.update();
  renderer.render(scene, camera);
});
