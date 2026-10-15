/**
 * The cover drive on its own, for reworking it: the game's `Batter`, a right-
 * hander, playing the one stroke against a ball that comes down the pitch, is
 * met at the red marker and goes off through the covers. Beside it, the other
 * stroke played off the same input: the charge over cover, the special one,
 * down the pitch at a ball on the stumps and over extra cover for six.
 *
 * The rig is authored in a frame where he bats left-handed; `GameScene` mirrors
 * the stage to make him right-handed, and this does the same (`world`), so what
 * is seen here is what a player sees. `shot-preview.ts` does not, which is why
 * every stroke there is a left-hander's.
 *
 * Isolated from `Game` like that page: nothing is scored, sent or counted.
 * `scripts/cover-drive-artifact.mjs` bundles it into one HTML file.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Batter, type CoverVersion, COVER_V3_MEETS_AT, ON_DRIVE_MEETS_AT, CHARGE_CLOCK, CHARGE_CONTACT_MS, CHARGE_MEETS_AT, STROKE_CONTACT_MS, STROKE_DURATION_MS } from './entities/Batter';
import { ADVANCE, GAME, LINE_X } from './config/gameplay';
import { buildWicket } from './scene/wicket';
import type { ShotType } from './game/types';

/** Ball time before the swing starts, so the delivery can be seen arriving. */
const LEAD_MS = 260;
/**
 * The two strokes off the cover input, each at the ball the game plays it at,
 * on its own clock, and with where the ball goes off the bat.
 */
interface Stroke {
  label: string; shot: ShotType; charging: boolean; lofted?: boolean;
  /** Played the same in every version: the on drive has only the one. */
  single?: boolean;
  /** Where the ball is met, in the rig's frame. */
  ball: { x: number; y: number; z: number };
  contact: number; end: number; bounceZ: number;
  phases: readonly (readonly [string, number])[];
  /** Off the bat: speed along the ground, its line from straight, and how fast it climbs. */
  out: { speed: number; angle: number; climb: number };
  facts: [string, string]; note: string;
}
const STROKES: Record<string, Stroke> = {
  cover: {
    label: 'Cover drive', shot: 'COVER_LONG_OFF', charging: false, ball: { x: LINE_X.OFF, y: .54, z: GAME.contactZ },
    contact: STROKE_CONTACT_MS, end: STROKE_DURATION_MS, bounceZ: 3.5,
    phases: [['Stance', -LEAD_MS], ['Backlift', -60], ['Plant', 55], ['Contact', STROKE_CONTACT_MS], ['Through', 220], ['Carry', 310], ['Finish', 410], ['Home', 600]],
    out: { speed: .024, angle: THREE.MathUtils.degToRad(58), climb: 0 },
    facts: ['full, off stump', `${STROKE_DURATION_MS} ms`],
    note: 'Version two, played twice in ten and four at most: the cover drive rebuilt from a side-on slow-motion recording of the shot: the front foot is down at 55 ms with the bat still coming, the ball is met at 110, the hands go out towards cover at 220 and up to the chin at 310 with the blade still hanging under them, and the checked finish at 410 is held until 600. Then the bat goes home back along its own swing, down through the carry and under him, and up into his stance.',
  },
  charge: {
    label: 'Charge over cover', shot: 'COVER_LONG_OFF', charging: true, ball: { x: 0, y: .54, z: GAME.contactZ + CHARGE_MEETS_AT },
    contact: CHARGE_CONTACT_MS, end: STROKE_DURATION_MS + ADVANCE.walkBackMs, bounceZ: 4.6,
    phases: [['Stance', -LEAD_MS], ['Backlift', -60], ['Skip', CHARGE_CLOCK.skip], ['Plant', CHARGE_CLOCK.plant], ['Contact', CHARGE_CONTACT_MS],
      ['Extension', CHARGE_CLOCK.through], ['Carry', CHARGE_CLOCK.carry], ['High finish', 580], ['Down', 760], ['Walking back', 1000]],
    out: { speed: .028, angle: THREE.MathUtils.degToRad(40), climb: .013 },
    facts: ['length, on the stumps', `${STROKE_DURATION_MS + ADVANCE.walkBackMs} ms`],
    note: 'The charge over cover: the back foot skips up to the front one, the front foot strides out down the pitch with the bat up to the sky, and the ball is met at 300 ms on the full, three quarters of a metre out of his ground. The face is opened to cover with the body still closed, the arms extend out towards extra cover, and the finish is held with the hands together above the helmet, the face of the blade to the sky: from the ball on the bat rides his hands without turning in them, until it unwinds into his guard on the way down. Then he walks back to his crease. In the game it is played off the cover swipe with the meter full, and its clock runs at two thirds speed.',
  },
  on: {
    label: 'On drive', shot: 'LONG_ON', charging: false, single: true, ball: { x: LINE_X.LEG, y: .54, z: GAME.contactZ + ON_DRIVE_MEETS_AT },
    contact: STROKE_CONTACT_MS, end: STROKE_DURATION_MS, bounceZ: 3.6,
    phases: [['Stance', -LEAD_MS], ['Backlift', -60], ['Plant', 55], ['Contact', STROKE_CONTACT_MS], ['Through', 220], ['Carry', 310], ['Finish', 410], ['Home', 600]],
    out: { speed: .024, angle: THREE.MathUtils.degToRad(-22), climb: 0 },
    facts: ['full, leg stump', `${STROKE_DURATION_MS} ms`],
    note: 'The on drive, rebuilt as a drive: the straight drive turned 24 degrees to long-on about the back foot. The front foot is down at 55 ms, a long stride down the line of a ball on leg stump pointing towards mid-on, the head over the ball; the bat comes down straight with its face closed to mid-on and meets the ball at 110 ms beside the front pad, 16 cm further down the pitch than the straight drive, with the front elbow high. The arms go out along the line to long-on at 220, the hands finish high in front of him at 410 with the blade up the ground after the ball, held to 600, and the bat goes home back down the way it came without turning in his hands. It used to whip the bat across the front of him and over the leg-side shoulder, the blade turning more than once round in his hands.',
  },
  six: {
    label: 'On drive six', shot: 'LONG_ON', charging: false, lofted: true, single: true, ball: { x: LINE_X.LEG, y: .54, z: GAME.contactZ + ON_DRIVE_MEETS_AT },
    contact: STROKE_CONTACT_MS, end: STROKE_DURATION_MS, bounceZ: 3.6,
    phases: [['Stance', -LEAD_MS], ['Backlift', -60], ['Plant', 55], ['Contact', STROKE_CONTACT_MS], ['Through', 220], ['Carry', 310], ['Wrap', 440], ['Home', 580]],
    out: { speed: .028, angle: THREE.MathUtils.degToRad(-22), climb: .014 },
    facts: ['full, leg stump', `${STROKE_DURATION_MS} ms`],
    note: 'The on drive lofted for six, played when the swipe is perfectly timed: the on drive\'s own stride and contact, then the arms carry the bat up through the line and over into a wrap, the elbows bent rather than reaching for the sky: the hands just over the front shoulder with the bat lying back over it behind his head, the front elbow up beside the helmet, the back arm across in front of his face, the chest open to long-on and the back foot up on its toe, held to 580 ms. The arms take the bat over, not the wrists: from the ball to the end of the hold the face does not turn in his hands at all, and on the way home, back over his head and down the line, it settles into his guard a little at a time. The six it replaces turned the bat a full turn in his hands on the way home.',
  },
};
let stroke = STROKES.cover;
/** Which version of the stroke: the game's own (1), the rebuilt one (2), or met beside the pad (3). The game plays them 40, 20 and 40 in a hundred. */
let version: CoverVersion = 2;
/** Incoming pace, metres a millisecond. */
const IN_SPEED = .030;
const RADIUS = .036;

// Camera eyes and targets in the rig's frame (off side +x), relative to the stance.
const VIEWS: Record<string, { eye: [number, number, number]; at: [number, number, number] }> = {
  side: { eye: [4.3, 1.5, .4], at: [.05, 1.0, .25] },
  bowler: { eye: [-.15, 1.55, 6.2], at: [0, 1.0, .25] },
  behind: { eye: [.36, 2.3, -4.6], at: [.1, 1.0, 1.4] },
  leg: { eye: [-4.3, 1.5, .4], at: [.05, 1.0, .25] },
  high: { eye: [3.0, 3.6, 3.4], at: [0, .9, .3] },
};

const stage = document.querySelector<HTMLDivElement>('#stage')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.append(renderer.domElement);

const scene = new THREE.Scene(); scene.background = new THREE.Color('#0e1a14');
scene.fog = new THREE.Fog('#0e1a14', 14, 34);
scene.add(new THREE.HemisphereLight(0xfff6ea, 0x3d5a36, 2.3));
const sun = new THREE.DirectionalLight(0xffeedd, 2.6);
sun.position.set(3, 7, -2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 16 });
scene.add(sun, sun.target);

// Everything that belongs to the ground goes in `world`, mirrored as the game's stage is.
const world = new THREE.Group(); world.scale.x = -1; scene.add(world);
const outfield = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 1 }));
outfield.rotation.x = -Math.PI / 2; outfield.receiveShadow = true; world.add(outfield);
const strip = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 22), new THREE.MeshStandardMaterial({ color: 0xc8b98a, roughness: 1 }));
strip.rotation.x = -Math.PI / 2; strip.position.set(0, .002, 9.35); strip.receiveShadow = true; world.add(strip);
const chalk = new THREE.MeshBasicMaterial({ color: 0xf4f1e8 });
const line = (w: number, d: number, x: number, z: number) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), chalk);
  m.rotation.x = -Math.PI / 2; m.position.set(x, .004, z); world.add(m);
};
line(3.66, .05, 0, GAME.creaseZ); line(2.64, .05, 0, 0);
for (const x of [-1.32, 1.32]) line(.05, 2.44, x, GAME.creaseZ - 1.22 + .6);
buildWicket(world, GAME.stumpHeight, 0);

const batter = new Batter(); world.add(batter.root); batter.mirrorStickers(true);
batter.root.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });

const ball = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 24, 16), new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: .45 }));
ball.castShadow = true; world.add(ball);
// Where the ball is met: fixed, so the blade can be checked against it.
const marker = new THREE.Mesh(new THREE.RingGeometry(.05, .062, 32), new THREE.MeshBasicMaterial({ color: 0xff6b5e, side: THREE.DoubleSide, transparent: true, opacity: .9 }));
world.add(marker);

/** Where the ball is at time `t` on the stroke's clock, in the rig's frame. */
function ballAt(t: number): [number, number, number] {
  const at = metAt(), { contact, bounceZ, out } = stroke, dt = t - contact;
  if (dt <= 0) {
    const z = at.z - dt * IN_SPEED;
    if (z <= bounceZ) {
      const k = (z - at.z) / (bounceZ - at.z);
      return [at.x, RADIUS + (at.y - RADIUS) * (1 - k) + .18 * k * (1 - k), z];
    }
    const k = Math.min(1, (z - bounceZ) / 9);
    return [at.x, RADIUS + 2.0 * k - .55 * k * k, z];
  }
  const s = dt * out.speed;
  // In the air: up off the bat and over the field, falling as it goes.
  if (out.climb) return [at.x + Math.sin(out.angle) * s, at.y + out.climb * dt - 9.8e-6 * dt * dt, at.z + Math.cos(out.angle) * s];
  // Along the ground: down into it quickly, then through the covers.
  const fall = Math.min(1, dt / 90);
  const y = THREE.MathUtils.lerp(at.y, RADIUS, fall * fall) + .06 * Math.sin(fall * Math.PI);
  return [at.x + Math.sin(out.angle) * s, y, at.z + Math.cos(out.angle) * s];
}

const camera = new THREE.PerspectiveCamera(36, 1, .05, 80);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI * .49;
const mirror = (p: readonly number[]) => new THREE.Vector3(-(GAME.stanceX + p[0]), p[1], GAME.stanceZ + p[2]);
function placeCamera(view: string) {
  const v = VIEWS[view];
  camera.position.copy(mirror(v.eye)); controls.target.copy(mirror(v.at)); followed = 0; controls.update();
}
/** How far down the pitch he is: the charge takes him a metre out and walks him back. */
const downPitch = () => batter.root.position.z - GAME.stanceZ;
let followed = 0;

/**
 * Puts the batter and the ball at time `t`. Before the swing he rises out of
 * his stance into the backlift as the ball comes, as the game has him do while
 * the bowler runs in, so the loop starts in the stance the stroke ends in
 * rather than snapping from it to the backlift.
 */
function pose(t: number) {
  if (t < 0) {
    batter.reset(); swinging = false;
    batter.prepare(THREE.MathUtils.smoothstep(t, -LEAD_MS, 0)); batter.update(0);
  } else {
    if (!swinging) start();
    batter.update(t);
  }
  ball.position.fromArray(ballAt(t));
  const at = metAt(); marker.position.set(at.x, at.y, at.z);
  marker.visible = t <= stroke.contact + 140;
  batter.drape();
}

let swinging = false;
/** Where this stroke meets the ball: version three's cover drive beside the front pad, a little further on. */
const metAt = () => ({ ...stroke.ball, z: stroke.ball.z + (version === 3 && !stroke.charging && !stroke.single ? COVER_V3_MEETS_AT : 0) });
function start() {
  batter.reset(); batter.prepare(1); batter.update(0);
  const at = metAt();
  batter.swing(stroke.shot, 0, at.x, at.y, at.z, stroke.charging, !!stroke.lofted, false, false, version);
  swinging = true;
}

// ── Controls ─────────────────────────────────────────────────────────────────
const scrub = document.querySelector<HTMLInputElement>('#scrub')!;
const playButton = document.querySelector<HTMLButtonElement>('#play')!;
const readout = document.querySelector<HTMLOutputElement>('#time')!;
const phaseLabel = document.querySelector<HTMLOutputElement>('#phase')!;
const strip_ = document.querySelector<HTMLDivElement>('#frames')!;

let playing = true, t = -LEAD_MS, speed = .5, previous = performance.now(), view = 'side';
const phaseAt = (time: number) => [...stroke.phases].reverse().find(([, at]) => time >= at)?.[0] ?? 'Stance';
function setPlaying(on: boolean) { playing = on; playButton.textContent = on ? 'Pause' : 'Play'; playButton.setAttribute('aria-pressed', String(on)); }
function seek(time: number) { setPlaying(false); t = Math.max(-LEAD_MS, Math.min(stroke.end, time)); }

playButton.onclick = () => setPlaying(!playing);
scrub.oninput = () => seek(Number(scrub.value));
document.querySelector('#back')!.addEventListener('click', () => seek(Math.round(t) - 10));
document.querySelector('#fwd')!.addEventListener('click', () => seek(Math.round(t) + 10));
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
  b.onclick = () => {
    speed = Number(b.dataset.speed);
    for (const o of document.querySelectorAll('[data-speed]')) o.setAttribute('aria-pressed', String(o === b));
    setPlaying(true);
  };
}
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-stroke]')) {
  b.onclick = () => {
    for (const o of document.querySelectorAll('[data-stroke]')) o.setAttribute('aria-pressed', String(o === b));
    choose(b.dataset.stroke!);
  };
}
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-version]')) {
  b.onclick = () => {
    for (const o of document.querySelectorAll('[data-version]')) o.setAttribute('aria-pressed', String(o === b));
    version = Number(b.dataset.version) as CoverVersion;
    choose(Object.keys(STROKES).find(key => STROKES[key] === stroke)!);
  };
}
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-view]')) {
  b.onclick = () => {
    view = b.dataset.view!; placeCamera(view);
    for (const o of document.querySelectorAll('[data-view]')) o.setAttribute('aria-pressed', String(o === b));
  };
}
addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
  if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); }
  else if (e.key === 'ArrowLeft' || e.key === ',') { e.preventDefault(); seek(Math.round(t) - (e.shiftKey ? 50 : 10)); }
  else if (e.key === 'ArrowRight' || e.key === '.') { e.preventDefault(); seek(Math.round(t) + (e.shiftKey ? 50 : 10)); }
});

function resize() {
  const { clientWidth: width, clientHeight: height } = stage;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

/** The key poses, each photographed side-on into the strip, and each a way to jump there. */
function contactSheet() {
  const W = 240, H = 300, shotCam = new THREE.PerspectiveCamera(30, W / H, .05, 60);
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  strip_.replaceChildren();
  for (const [label, at] of stroke.phases) {
    pose(at);
    const along = new THREE.Vector3(0, 0, downPitch());
    shotCam.position.copy(mirror([4.6, 1.25, .45])).add(along); shotCam.lookAt(mirror([.12, .95, .3]).add(along));
    renderer.render(scene, shotCam);
    const button = document.createElement('button');
    button.className = 'frame'; button.dataset.at = String(at);
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    canvas.getContext('2d')!.drawImage(renderer.domElement, 0, 0, W, H);
    const caption = document.createElement('span');
    caption.innerHTML = `<b>${label}</b><i>${at} ms</i>`;
    button.append(canvas, caption);
    button.onclick = () => seek(at);
    strip_.append(button);
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  resize();
}

function frame(now: number) {
  const step = Math.min(now - previous, 50); previous = now;
  if (playing) { t += step * speed; if (t > stroke.end + 300) t = -LEAD_MS; }
  const shown = Math.min(t, stroke.end);
  pose(shown);
  // Down the pitch with him, eye and target together, which keeps the view chosen.
  const follow = downPitch() * .8;
  camera.position.z += follow - followed; controls.target.z += follow - followed; followed = follow;
  scrub.value = String(Math.round(shown));
  readout.textContent = `${Math.round(shown)} ms`;
  const phase = phaseAt(shown);
  phaseLabel.textContent = phase;
  for (const b of strip_.children) (b as HTMLElement).classList.toggle('on', b.querySelector('b')!.textContent === phase);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

/** What version one of each stroke is: the game's own, as it was. */
const VERSION_ONE: Record<string, string> = {
  cover: 'Version one, played four times in ten and the only one middled for six: the cover drive the game has always played, kept beside the rebuilt one: a short step in, the ball met at 110 ms, the arms out through the line at 220 and the high finish at 410, with the bat pointing out square, held to 570, and home to his guard over the top.',
  charge: 'Version one, the charge over cover the game has always played: the same run down the pitch, ball and finish as version two, with the bat turning in his hands on the way up into the finish and on the way home.',
};
/** What version three of each stroke is: the cover drive met beside the front pad. */
const VERSION_THREE: Record<string, string> = {
  cover: 'Version three, played four times in ten: version two met beside the front pad, under his eyes, as the recording meets it, 28 cm further down the pitch than the game meets every other drive. The hips and chest are further forward, the front knee bent deeper over the foot, and the back foot slides back less. The swipe is timed as for the other two, and like version two it keeps the ball down: middled, it is four, never six.',
  charge: 'The charge over cover has no version three: it is version two\'s, down the pitch to the ball as it always was.',
};
const title = document.querySelector<HTMLHeadingElement>('h1')!;
const facts = document.querySelectorAll<HTMLElement>('[data-fact]');
const note = document.querySelector<HTMLSpanElement>('#note-text')!;
/** Puts `key`'s stroke up: its clock on the scrubber, its key poses in the strip, its words. */
function choose(key: string) {
  stroke = STROKES[key];
  const [first, ...rest] = stroke.label.split(' ');
  title.innerHTML = `${first} <span>${rest.join(' ')}</span>`;
  facts.forEach((fact, i) => { fact.textContent = stroke.facts[i]; });
  note.textContent = stroke.single ? stroke.note : version === 1 ? VERSION_ONE[key] : version === 3 ? VERSION_THREE[key] : stroke.note;
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-version]')) b.disabled = !!stroke.single;
  scrub.min = String(-LEAD_MS); scrub.max = String(stroke.end);
  swinging = false; contactSheet(); start();
  t = -LEAD_MS; placeCamera(view); setPlaying(true);
}

choose('cover');
if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setPlaying(false); t = stroke.contact; }
requestAnimationFrame(frame);
