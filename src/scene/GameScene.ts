import * as THREE from 'three';
import { Batter, type BatterKit, CELEBRATION_MS, CHARGE_MEETS_AT } from '../entities/Batter';
import { Bowler } from '../entities/Bowler';
import { Cricketer, FIGURE_ASSETS } from '../entities/Cricketer';
import { ADVANCE, FLAT_SWEEP, GAME, SHOT_ANGLES, SQUARE_DRIVE, SWEEP } from '../config/gameplay';
import { ballPosition } from '../game/DeliveryTrajectory';
import { KIT } from '../entities/Cricketer';
import { WHITES } from '../config/survive';
import { flightOf } from './flight';
import { SKY, Sky } from './sky';
import { contactShadowTexture, grassTexture, pitchTexture } from './turf';
import { perimeterBoards } from './boards';
import type { Delivery, ShotOutcome, ShotType } from '../game/types';

/** Where a beaten ball runs out of steam: just short of the stumps. */
const BEATEN_STOP = (GAME.releaseZ - 0.3) / (GAME.releaseZ - GAME.contactZ);
const colors = { navy: 0x19334a, orange: 0xf37943, white: 0xf8f1df, skin: 0xb77950 };
const materials = new Map<number, THREE.MeshStandardMaterial>();
// Scenery keeps its faceted, low-poly look; anything sculpted asks for `soft`.
function mat(color: number) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true }));
  return materials.get(color)!;
}
function soft(color: number, roughness = 0.72) {
  const key = color + 0x1000000;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
  return materials.get(key)!;
}
function box(parent: THREE.Object3D, w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function cylinder(parent: THREE.Object3D, r: number, h: number, color: number, x: number, y: number, z: number, sides = 8) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, sides), sides > 8 ? soft(color, 0.8) : mat(color));
  mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh;
}
/**
 * The world going quiet around a hundred.
 *
 * Everything but the batter drains towards grey for the second and a half he
 * holds the bat up, so the one thing left in colour is him. It is done inside
 * each material's own shader rather than as a pass over the finished frame: a
 * pass would grey him too, or need a second render to keep him out, and this
 * is one blend at the end of a shader that already runs. At nought it changes
 * nothing, which is every frame but these.
 */
const MUTE = /* glsl */`
  gl_FragColor.rgb = mix(gl_FragColor.rgb,
    vec3(dot(gl_FragColor.rgb, vec3(.2126, .7152, .0722))) * .80 + .04, uMute * .9);
`;
function mutable(material: THREE.Material, amount: { value: number }) {
  if (material.userData.mutable) return;
  material.userData.mutable = true;
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    shader.uniforms.uMute = amount;
    // At the very end of main, after tone mapping and the colour space: the
    // grey is taken of the colour as it will be seen.
    shader.fragmentShader = `uniform float uMute;\n${shader.fragmentShader.replace(/\}\s*$/, `${MUTE}}`)}`;
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}|mute`;
  material.needsUpdate = true;
}
/** How long the flash of grey round a special stroke lasts, from the hit. */
export const POWER_MS = 1100;
/** How far gone the colour is, a given time into a special stroke: in fast, out slower. */
function powerAt(age: number) {
  if (age < 0 || age >= POWER_MS) return 0;
  return Math.min(THREE.MathUtils.smoothstep(age, 0, 110), 1 - THREE.MathUtils.smoothstep(age, POWER_MS - 380, POWER_MS));
}
/**
 * The swoosh behind the bat on a pulled bouncer: how much of the swing it
 * covers, as a stretch of the bat's own recent past, and how long it is up
 * from the hit. It covers the downswing into the ball and follows the bat on
 * through the finish, thinning out behind as it goes.
 */
const SWISH_SPAN_MS = 220;
/** How wide the swoosh is at the bat, in metres; it tapers to nothing behind. */
const SWISH_WIDTH = .3;
const SWISH_MS = 560;
const SWISH_SAMPLES = 32;
/**
 * The band is drawn through a curve laid over the bat's samples, this many
 * points to a frame's worth of travel: the toe goes the best part of half a
 * metre in a frame at the bottom of a pull, and drawn straight from sample to
 * sample the band came out as a run of kinks.
 */
const SWISH_SMOOTH = 4;
/** Points round the half-circle that rounds off the end at the bat. */
const SWISH_CAP = 8;
/** How strong the band is at its two edges against its middle: a feathered edge rather than a cut one. */
const SWISH_EDGE = .55;
/** Rows of points the band can need: the cap, and the smoothed path behind it. */
const SWISH_ROWS = SWISH_CAP + 1 + (SWISH_SAMPLES - 1) * SWISH_SMOOTH + 1;
/**
 * The colours the struck ball's tail is drawn in, head to tail. Fire for a
 * special stroke; red for a pulled bouncer, bright at the ball and going to
 * crimson, so it reads apart from the fire's yellow.
 */
const TAILS = {
  fire: [0xffd23f, 0xff7a1f, 0xd7261b],
  pull: [0xff6a55, 0xf01b2c, 0x9c0018],
} as const;
/** How far gone the colour is, a given time into his celebration. */
function muteAt(age: number) {
  if (age < 0 || age >= CELEBRATION_MS) return 0;
  const into = THREE.MathUtils.smoothstep(age, 0, 180);
  const out = 1 - THREE.MathUtils.smoothstep(age, CELEBRATION_MS - 320, CELEBRATION_MS);
  return Math.min(into, out);
}

// The ball and its trail are the only things left that want a bare sphere;
// every figure on the field is a Cricketer, which carries its own primitives.
const SHAPES = { ball: new THREE.SphereGeometry(1, 24, 16) };

export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(53, 1, 0.1, 180);
  private world = new THREE.Group();
  private batter = new Batter();
  private bowler = new Bowler();
  private catcher = new Cricketer();
  /** Scenery, but they are on the same field and wear the same kit as everyone else. */
  private fielders: Cricketer[] = [];
  private ball: THREE.Mesh;
  private shadow: THREE.Mesh;
  private bounceRing: THREE.Mesh;
  private catchRing: THREE.Mesh;
  private chargeRing: THREE.Mesh;
  private bails: THREE.Mesh[] = [];
  private trail: THREE.Mesh[] = [];
  /**
   * The fire behind a ball struck with a special stroke: yellow at the ball,
   * red at the tail, glowing rather than lit, and flickering. Drawn instead of
   * the ordinary trail on those balls, and on a pulled bouncer, recoloured
   * red (see `TAILS`); on no others.
   */
  private fire: THREE.Mesh[] = [];
  /** Which tail the struck ball has: fire, the pull's, or the ordinary trail. */
  private blaze: keyof typeof TAILS | null = null;
  /**
   * The swoosh behind the bat on a pulled bouncer: a band laid along the path
   * the toe of the bat has taken over the last stretch of the swing, turned to
   * face the camera. Not a ribbon strung down the blade: a pull swings the bat
   * flat at chest height, and the sheet that sweeps out is seen edge-on from
   * behind him — a hairline. Where the bat has been is kept every frame,
   * because by the time the ball is hit the downswing that hit it is history.
   */
  private swish!: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private batPath: { at: number; toe: THREE.Vector3 }[] = [];
  private swishedAt = -Infinity;
  /** The swoosh's colours, at the bat and behind it: the pull's pen (see `PULL_PENS`). */
  private swishHead = new THREE.Color(0x2f8bff);
  private swishTail = new THREE.Color(0xffffff);
  private resizeObserver: ResizeObserver;
  private hitStart = 0;
  private hitOrigin = new THREE.Vector3();
  private incomingPosition = new THREE.Vector3();
  private contactDelay = 0;
  private hitEnd = new THREE.Vector3();
  private hitOutcome: ShotOutcome | null = null;
  private bailsBrokeAt = 0;
  private flightMs: number = GAME.hitAnimationMs;
  private hitHeight = 0;
  /** Where in a skied ball's flight it is spilled, or 0 when it is not. */
  private dropAt = 0;
  private bounceAt = 0;
  /**
   * Where in the flight the ball arrives at whoever is under it. One for
   * everything nobody catches; short of it when there is a fielder, because a
   * sine arc that only comes down on the final frame had him closing his hands
   * on a ball still nine metres above his head.
   */
  private takeAt = 1;
  /**
   * When the run-up started. The bowler's whole action runs off this one clock,
   * so nothing about how fast the ball is bowled can reach it.
   */
  private actionStartedAt = Infinity;
  private bowling = false;
  private runupProgress = 0;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private sky = new Sky();
  private environment: THREE.WebGLRenderTarget;
  /** Painted once at start-up; the scene's traversal finds materials, not their maps. */
  private textures: THREE.Texture[] = [];
  /** How grey everything but the batter is: see `MUTE`. */
  private mute = { value: 0 };
  private celebratedAt = -Infinity;
  private poweredAt = -Infinity;
  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    const mobile = window.matchMedia('(pointer: coarse)').matches;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Neutral rather than ACES: it rolls off the sunlit whites without shifting
    // the kit colours, which are the club's and are not the renderer's to change.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.setClearColor(SKY.horizon);
    container.prepend(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', '3D cricket ground viewed from behind the batter');
    // The haze is the sky's own horizon, so the far stands sink into it rather
    // than into a grey that belongs to nothing.
    this.scene.fog = new THREE.Fog(SKY.horizon, 48, 125);
    this.scene.add(this.sky.mesh);
    this.environment = this.sky.environment(this.renderer);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.75;
    // Mirror the stage so the batter's leg side (negative X) reads left on screen.
    this.world.scale.x = -1; this.scene.add(this.world);
    this.camera.fov = 50;
    this.camera.position.set(0, 2.9, -5.15); this.camera.lookAt(0, 1.05, 9);
    // The sky now lights the scene through the environment map; this is what is
    // left of the old fill, warm from above so the shade does not go cold.
    this.scene.add(new THREE.HemisphereLight(0xfff4e2, 0x66744a, 1.1));
    const sun = new THREE.DirectionalLight(0xffedce, 3.2); sun.position.set(-15, 30, -8); sun.castShadow = true;
    sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048); sun.shadow.camera.left = -28; sun.shadow.camera.right = 28;
    sun.shadow.camera.top = 35; sun.shadow.camera.bottom = -20; sun.shadow.normalBias = 0.025;
    this.scene.add(sun);
    this.createGround();
    this.wicket(0); this.wicket(18.7);
    this.catcher.root.position.set(12, 0, 20);
    this.world.add(this.batter.root, this.bowler.root, this.catcher.root);
    this.ball = new THREE.Mesh(SHAPES.ball, soft(0xe84829, 0.34));
    this.ball.scale.setScalar(0.115); this.ball.castShadow = true; this.world.add(this.ball);
    (this.ball.material as THREE.MeshStandardMaterial).emissive.setHex(0x972708);
    (this.ball.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2;
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.07, 10, 32), soft(0xffefd6));
    this.ball.add(seam);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.17, 16), new THREE.MeshBasicMaterial({ color: 0x243828, transparent: true, opacity: 0.35, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.world.add(this.shadow);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe4a6, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
    this.bounceRing = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.19, 24), ringMat);
    this.bounceRing.rotation.x = -Math.PI / 2; this.world.add(this.bounceRing);
    this.catchRing = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.66, 32), ringMat.clone());
    this.catchRing.rotation.x = -Math.PI / 2; this.catchRing.visible = false; this.world.add(this.catchRing);
    // The shockwave under a charged hit.
    this.chargeRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 48), new THREE.MeshBasicMaterial({ color: 0xffdb96, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    this.chargeRing.rotation.x = -Math.PI / 2; this.chargeRing.visible = false; this.world.add(this.chargeRing);
    for (let i = 0; i < 9; i++) {
      const dot = new THREE.Mesh(this.ball.geometry, new THREE.MeshBasicMaterial({ color: 0xfff5cd, transparent: true, opacity: (1 - i / 9) * 0.32, depthWrite: false }));
      dot.scale.setScalar(0.115 * (1 - i / 12)); this.world.add(dot); this.trail.push(dot);
    }
    // Solid colours rather than light added on: added light over a pale sky
    // comes out white, and this is meant to read as yellow going to red.
    const hot = new THREE.Color(0xffd23f), mid = new THREE.Color(0xff7a1f), cold = new THREE.Color(0xd7261b);
    for (let i = 0; i < 26; i++) {
      const t = i / 25;
      const dot = new THREE.Mesh(this.ball.geometry, new THREE.MeshBasicMaterial({
        color: t < .5 ? hot.clone().lerp(mid, t * 2) : mid.clone().lerp(cold, (t - .5) * 2),
        transparent: true, opacity: 0.9 - t * 0.75, depthWrite: false,
      }));
      dot.visible = false; this.world.add(dot); this.fire.push(dot);
    }
    // Everything built so far, bar him, can be greyed for his hundred. Done
    // once, here, so the shaders are compiled with it before the first frame.
    const his = new Set<THREE.Material>();
    this.batter.root.traverse(object => { if (object instanceof THREE.Mesh) [object.material].flat().forEach(m => his.add(m)); });
    // And the ball he hit, and its trail: a special stroke greys the ground
    // while the ball is still in the air, and the eye wants to follow it.
    for (const mesh of [this.ball, ...this.trail, ...this.fire]) [mesh.material].flat().forEach(m => his.add(m));
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh) [object.material].flat().forEach(m => { if (!his.has(m)) mutable(m, this.mute); });
    });
    // After the greying is wired, so a hundred never greys the swoosh.
    this.swish = this.createSwish();
    this.reset();
    this.resizeObserver = new ResizeObserver(this.resize); this.resizeObserver.observe(container); this.resize();
  }
  /**
   * The band for the swoosh: rows of three points across it — an edge, the
   * middle, the other edge — strung along the toe's path, with a half-circle
   * of rows rounding off the end at the bat. Laid out once and moved each
   * frame. Flat colour, untouched by the lights or the tone mapping, so it
   * reads as drawn on rather than lit, and fading out to both edges so it has
   * no hard one.
   */
  private createSwish() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SWISH_ROWS * 3 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SWISH_ROWS * 3 * 4), 4).setUsage(THREE.DynamicDrawUsage));
    const index: number[] = [];
    for (let row = 0; row < SWISH_ROWS - 1; row++) {
      const a = row * 3, b = a + 3;
      index.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    }
    geometry.setIndex(index);
    const swish = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }));
    // Its points move every frame, so a bounding sphere worked out once is wrong.
    swish.frustumCulled = false; swish.visible = false;
    this.world.add(swish);
    return swish;
  }
  /** Where the bat is now, kept for the swoosh; then the swoosh drawn through it. */
  private traceBat(now: number) {
    const bat = this.batter.bat;
    bat.updateWorldMatrix(true, false);
    // Kept in the ground's own frame, which the swoosh is drawn in: the ground
    // is mirrored (see `world`), and a point in the scene's frame drawn inside
    // it lands on the far side of him.
    this.batPath.unshift({ at: now, toe: this.world.worldToLocal(bat.localToWorld(new THREE.Vector3(0, -.8, 0))) });
    while (this.batPath.length > SWISH_SAMPLES || (this.batPath.length > 2 && now - this.batPath[this.batPath.length - 1].at > SWISH_SPAN_MS)) this.batPath.pop();
    const age = now - this.swishedAt;
    this.swish.visible = age >= 0 && age < SWISH_MS && this.batPath.length > 1;
    if (!this.swish.visible) return;
    const fade = 1 - THREE.MathUtils.smoothstep(age, SWISH_MS * .5, SWISH_MS);
    const position = this.swish.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colour = this.swish.geometry.getAttribute('color') as THREE.BufferAttribute;
    const camera = this.world.worldToLocal(this.camera.getWorldPosition(new THREE.Vector3()));

    // The path, smoothed: a curve through the samples, newest first.
    const toes = this.batPath.map(({ toe }) => toe);
    const steps = (toes.length - 1) * SWISH_SMOOTH;
    const curve = toes.length > 2 ? new THREE.CatmullRomCurve3(toes, false, 'centripetal') : null;
    const path = Array.from({ length: steps + 1 }, (_, j) => curve ? curve.getPoint(j / steps) : toes[0].clone().lerp(toes[1], j / steps));

    // Across the path and across the line of sight at each point, so the band
    // shows its face whichever way the bat is going. Held over from the last
    // point where the bat is still, which has no way it is going.
    const sides: THREE.Vector3[] = [];
    const side = new THREE.Vector3(0, 1, 0);
    path.forEach((point, j) => {
      const along = path[Math.max(j - 1, 0)].clone().sub(path[Math.min(j + 1, steps)]);
      const across = along.cross(camera.clone().sub(point));
      if (across.lengthSq() > 1e-10) side.copy(across.normalize());
      sides.push(side.clone());
    });

    let row = 0;
    const c = new THREE.Color();
    const put = (centre: THREE.Vector3, across: THREE.Vector3, half: number, f: number) => {
      c.copy(this.swishHead).lerp(this.swishTail, Math.min(1, f * 1.6));
      // Solid at the bat and gone at the tail; softer at both edges than down the middle.
      const alpha = (1 - f) ** 1.5 * fade;
      for (const [k, at, strength] of [[0, half, SWISH_EDGE], [1, 0, 1], [2, -half, SWISH_EDGE]] as const) {
        position.setXYZ(row * 3 + k, centre.x + across.x * at, centre.y + across.y * at, centre.z + across.z * at);
        colour.setXYZW(row * 3 + k, c.r, c.g, c.b, alpha * strength);
      }
      row++;
    };

    // The end at the bat, rounded: a half-circle as wide as the band there,
    // its far edge on the toe itself so it never runs out ahead of the bat.
    const head = SWISH_WIDTH / 2;
    const forward = path[0].clone().sub(path[1]);
    const reach = forward.length();
    forward.normalize();
    const radius = Math.min(head, reach * steps * .5);
    const middle = path[0].clone().addScaledVector(forward, -radius);
    for (let k = 0; k <= SWISH_CAP; k++) {
      const turn = k / SWISH_CAP * Math.PI / 2;
      put(middle.clone().addScaledVector(forward, radius * Math.cos(turn)), sides[0], radius * Math.sin(turn), 0);
    }
    // Then the path behind it, from where the half-circle leaves off.
    let travelled = 0;
    path.forEach((point, j) => {
      if (j) travelled += point.distanceTo(path[j - 1]);
      if (travelled <= radius) return;
      const f = j / steps;
      put(point, sides[j], SWISH_WIDTH / 2 * (1 - f) ** .5, f);
    });
    position.needsUpdate = true; colour.needsUpdate = true;
    this.swish.geometry.setDrawRange(0, Math.max(0, row - 1) * 12);
  }
  /** The struck ball's tail, in the colours of `TAILS[kind]`. */
  private tail(kind: keyof typeof TAILS) {
    this.blaze = kind;
    const [hot, mid, cold] = TAILS[kind].map(hex => new THREE.Color(hex));
    this.fire.forEach((dot, i) => {
      const t = i / (this.fire.length - 1);
      (dot.material as THREE.MeshBasicMaterial).color.copy(t < .5 ? hot.clone().lerp(mid, t * 2) : mid.clone().lerp(cold, (t - .5) * 2));
    });
  }
  private createGround() {
    const anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const grass = grassTexture(70, 10, GAME.boundaryRadius, anisotropy);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 96), new THREE.MeshStandardMaterial({ map: grass, roughness: 0.95 })); ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.035, 10); ground.receiveShadow = true; this.world.add(ground);
    // The strip, its wear painted on rather than built from boxes.
    const surface = pitchTexture(2.8, 32, 4.3, anisotropy, { batting: 0, bowling: 18.7 });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.025, 32), new THREE.MeshStandardMaterial({ map: surface, roughness: 0.9 }));
    strip.position.set(0, 0, 4.3); strip.receiveShadow = true; this.world.add(strip);
    this.textures.push(grass, surface);
    // Popping creases, 1.2m in front of each wicket, with return creases running
    // back past the stumps.
    [GAME.creaseZ, 18.7 - GAME.creaseZ].forEach(z => {
      const behind = z < 2 ? -0.75 : 0.75;
      box(this.world, 3.1, 0.015, 0.045, colors.white, 0, 0.024, z);
      [-1.1, 1.1].forEach(x => box(this.world, 0.045, 0.015, 1.5, colors.white, x, 0.024, z + behind));
    });
    const boundary = new THREE.Mesh(new THREE.TorusGeometry(GAME.boundaryRadius, 0.055, 5, 128), mat(colors.white));
    boundary.rotation.x = Math.PI / 2; boundary.position.set(0, 0.06, 10); this.world.add(boundary);
    this.createStadium(anisotropy);
    // Fielders are scenery except the one scripted catcher.
    [[-18, 20], [22, 5], [-14, -4], [2, 35], [-7, 29]].forEach(([x, z]) => {
      const fielder = new Cricketer(); fielder.root.position.set(x, 0, z); fielder.root.rotation.y = Math.atan2(-x, -z); this.world.add(fielder.root);
      this.fielders.push(fielder);
    });
    // A soft patch under everyone but the batter, who is close enough to the
    // camera that the sun's own shadow does the job.
    const contact = contactShadowTexture(); this.textures.push(contact);
    const patch = new THREE.MeshBasicMaterial({ map: contact, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const plane = new THREE.PlaneGeometry(1.15, 1.15);
    for (const figure of [...this.fielders, this.catcher, this.bowler.figure]) {
      const under = new THREE.Mesh(plane, patch); under.rotation.x = -Math.PI / 2; under.position.y = 0.016;
      figure.root.add(under);
    }
  }
  private createStadium(anisotropy: number) {
    const seatGeometry = new THREE.BoxGeometry(0.6, 0.55, 0.55);
    const crowd = new THREE.InstancedMesh(seatGeometry, mat(0xffffff), 1344);
    const dummy = new THREE.Object3D(); let index = 0;
    const seatColors = [0x22465a, 0xf5bf71, 0xc8dbce, 0xf4794c, 0xe9e0c9, 0x467787];
    for (let section = 0; section < 28; section++) {
      const a = section / 28 * Math.PI * 2;
      const group = new THREE.Group(); group.position.set(Math.sin(a) * 39, 0, 10 + Math.cos(a) * 39); group.rotation.y = a; this.world.add(group);
      for (let row = 0; row < 4; row++) {
        box(group, 8.5, 0.7 + row * 0.7, 1.4, 0x7d9397, 0, (0.7 + row * 0.7) / 2, -1.7 + row * 1.4);
        for (let col = 0; col < 12; col++) {
          dummy.position.set(-3.9 + col * 0.71, 1 + row * 0.7, -1.7 + row * 1.4);
          dummy.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), a).add(group.position);
          dummy.rotation.y = a; dummy.updateMatrix(); crowd.setMatrixAt(index, dummy.matrix);
          crowd.setColorAt(index, new THREE.Color(seatColors[(section * 13 + row * 7 + col * 3 + col % 2) % seatColors.length])); index++;
        }
      }
      if (section % 4 !== 0) {
        box(group, 9.1, 0.25, 7.5, 0xc7d3cd, 0, 5.3, 0.4).rotation.x = -0.07;
        [-3.9, 3.9].forEach(x => cylinder(group, 0.075, 5.2, 0x627d83, x, 2.6, 3.3));
      }
    }
    crowd.instanceMatrix.needsUpdate = true; this.world.add(crowd);
    // The boards along the foot of the stands. Added to the scene rather than
    // the mirrored stage, or every sponsor would read backwards.
    const boards = perimeterBoards(35.1, 1.2, 1.5, 10, anisotropy);
    this.scene.add(boards.group); this.textures.push(boards.texture);
    for (const [x, z] of [[-29, 35], [29, 35], [-32, -13], [32, -13]]) {
      cylinder(this.world, 0.19, 18, 0x839697, x, 9, z);
      box(this.world, 4, 2, 0.3, 0x304953, x, 17.5, z);
      for (let row = 0; row < 2; row++) for (let col = 0; col < 5; col++) box(this.world, 0.55, 0.55, 0.1, 0xfff4d9, x - 1.5 + col * 0.75, 17.1 + row * 0.8, z - 0.21);
    }
    // Clubhouse pavilion at the bowler's end.
    box(this.world, 13, 7, 5, 0xe0d7bc, 0, 3.5, 53);
    box(this.world, 15, 0.45, 6, colors.navy, 0, 7, 53);
    box(this.world, 9, 2, 0.08, colors.navy, 0, 4.1, 50.46);
    for (let i = -2; i <= 2; i++) box(this.world, 1.3, 1.6, 0.1, 0x406876, i * 2.4, 1.8, 50.45);
    for (let i = -1; i <= 1; i++) {
      cylinder(this.world, 0.05, 3, 0xe9e3cb, i * 4, 8.6, 53);
      box(this.world, 1.15, 0.65, 0.04, i === 0 ? colors.orange : colors.navy, i * 4 + 0.56, 9.5, 53);
    }
  }
  private wicket(z: number) {
    for (const x of [-0.145, 0, 0.145]) cylinder(this.world, 0.025, GAME.stumpHeight, colors.white, x, GAME.stumpHeight / 2, z, 16);
    for (const x of [-0.073, 0.073]) {
      const bail = box(this.world, 0.16, 0.035, 0.045, colors.orange, x, GAME.stumpHeight + 0.02, z);
      if (z === 0) this.bails.push(bail);
    }
  }
  private resize = () => {
    const { width, height } = this.container.getBoundingClientRect();
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    // Below 16:9 the view widens towards a constant horizontal field of view, so
    // a tall phone sees the whole pitch rather than the batter's shoulders. The
    // aim drops with it: the extra frame goes to the wicket, not to empty sky.
    const design = 16 / 9, base = 50;
    const widened = 2 * Math.atan(Math.tan(base * Math.PI / 360) * design / this.camera.aspect) * 180 / Math.PI;
    this.camera.fov = THREE.MathUtils.clamp(this.camera.aspect < design ? widened : base, base, 67);
    const tall = THREE.MathUtils.clamp((design - this.camera.aspect) / (design - 0.5), 0, 1);
    this.camera.lookAt(0, THREE.MathUtils.lerp(1.05, 0.15, tall), THREE.MathUtils.lerp(9, 5.4, tall));
    this.camera.updateProjectionMatrix();
  };
  /**
   * Put both figures into whites, or back into colours. The ball is left alone:
   * it is red in both, which is the one thing a Test match and this game's
   * limited-overs innings have always agreed on.
   */
  /** He has taken one too many. Nothing stands him back up but a new innings. */
  fall(now: number) { this.batter.fall(now); }
  /**
   * A moment: his hundred or six sixes, the bat to the sky and the world gone
   * grey round him; or his fifty, `mild`, the bat raised and the colours left
   * where they are.
   */
  celebrate(now: number, mild = false) {
    this.batter.celebrate(now, mild);
    this.celebratedAt = mild ? -Infinity : now;
  }
  /**
   * A special stroke on a full meter, from the moment it is hit: the same
   * grey as his hundred, round him and the ball, for about a second.
   */
  power(now: number) { this.poweredAt = now; this.tail('fire'); }
  /**
   * A bouncer pulled and hit, from the moment it is hit: a swoosh behind the
   * bat, from `head` at the bat to `tail` behind it, and a red streak behind
   * the ball. No grey — it is a great shot, not a special one.
   */
  pull(now: number, swish: { head: string; tail: string }) {
    this.swishedAt = now; this.tail('pull');
    this.swishHead.set(swish.head); this.swishTail.set(swish.tail);
  }
  /** Whether the swoosh behind the bat is up this frame. For the checks. */
  get swishing() { return this.swish.visible; }
  /** Which tail the struck ball has, for the checks: 'fire', 'pull', or null. */
  get tailKind() { return this.blaze; }
  /** How much of the fire trail is showing this frame. For the checks. */
  get burning() { return this.fire.filter(dot => dot.visible).length; }
  /** How grey the ground is this frame, nought to one. For the checks. */
  get muted() { return this.mute.value; }
  /**
   * Where he stands on the screen, in CSS pixels of the canvas: his feet, the
   * top of his helmet, and the height the bat reaches held up to the sky. The
   * doodles that go up round his hundred are drawn to these.
   */
  batterOnScreen() {
    const { width, height } = this.renderer.domElement.getBoundingClientRect();
    this.batter.root.updateWorldMatrix(true, false);
    const at = (y: number) => {
      const p = this.batter.root.localToWorld(new THREE.Vector3(0, y, 0)).project(this.camera);
      return { x: (p.x + 1) / 2 * width, y: (1 - p.y) / 2 * height };
    };
    return { feet: at(0), head: at(1.78), bat: at(2.75), width, height };
  }

  whites(on: boolean) {
    const kit = on ? WHITES : KIT;
    this.batter.dress(on ? 'whites' : 'home');
    this.bowler.figure.dress(kit);
    // The fielding side too. Leaving them in coloured clothing while the two
    // men in the middle wore whites read as a bug rather than as a mode.
    this.catcher.dress(kit);
    for (const fielder of this.fielders) fielder.dress(kit);
  }

  /** The batter alone, into a Rivals kit. The fielding side keeps its colours. */
  kit(kit: BatterKit) { this.batter.dress(kit); }

  reset() {
    this.celebratedAt = -Infinity; this.poweredAt = -Infinity; this.mute.value = 0; this.blaze = null; this.swishedAt = -Infinity; this.swish.visible = false;
    this.hitOutcome = null; this.bailsBrokeAt = 0; this.flightMs = GAME.hitAnimationMs; this.hitHeight = 0; this.dropAt = 0; this.bounceAt = 0; this.takeAt = 1; this.ball.visible = false; this.shadow.visible = false; this.bounceRing.visible = false; this.catchRing.visible = false; this.chargeRing.visible = false;
    this.trail.forEach(t => t.visible = false); this.fire.forEach(f => f.visible = false); this.batter.reset();
    this.bails.forEach((b, i) => { b.position.set(i ? 0.073 : -0.073, GAME.stumpHeight + 0.02, 0); b.rotation.set(0, 0, 0); });
    this.batter.root.visible = true;
    this.catcher.root.position.set(12, 0, 20); this.catcher.root.rotation.y = Math.atan2(-12, -20); this.catcher.catchAt(0);
    this.bowler.reset(); this.bowling = false; this.actionStartedAt = Infinity; this.runupProgress = 0;
  }
  /**
   * Called each frame of the run-up. It only starts the action's clock — the
   * pose itself is set in `render`, off that clock, so the run-up and the
   * follow-through are one continuous timeline rather than two that have to be
   * talked into lining up at the join.
   */
  runup(t: number) { this.bowling = true; this.runupProgress = t; }
  /**
   * Which bowler is at the top of the mark. Set after `reset` and before the
   * action starts, because `reset` puts the ball back in the quick bowler's
   * hand and the spinner has to take it again each ball of his over.
   */
  spinner(on: boolean) { this.bowler.spinner(on); }
  /**
   * Past the bat, the ball eases through to the stumps over the rest of the
   * late-swing window instead of running on at full speed. That window is worth
   * most of a second, so extrapolating it flew the ball through the stumps and
   * out behind the camera, only to snap back when the delivery was finally
   * judged — which is what made the stumps break long after the ball.
   */
  private flightAt(delivery: Delivery, progress: number) {
    if (progress <= 1) return progress;
    const window = (GAME.timing.poor + GAME.comboMs) / delivery.durationMs;
    return 1 + Math.min(1, (progress - 1) / window) * (BEATEN_STOP - 1);
  }
  delivery(delivery: Delivery, progress: number) {
    this.batter.prepare(progress);
    this.ball.visible = this.shadow.visible = true;
    const pos = ballPosition(delivery, this.flightAt(delivery, progress)); this.ball.position.set(pos.x, pos.y, pos.z);
    this.groundShadow(this.ball.position, true);
    this.trail.forEach((dot, i) => {
      dot.visible = progress > 0.03;
      const p = ballPosition(delivery, this.flightAt(delivery, Math.max(0, progress - (i + 1) * 0.009))); dot.position.set(p.x, p.y, p.z);
    });
    const bounce = (GAME.releaseZ - delivery.bounceZ) / (GAME.releaseZ - GAME.contactZ);
    const age = (progress - bounce) * delivery.durationMs;
    this.bounceRing.visible = age > 0 && age < 260;
    if (this.bounceRing.visible) { this.bounceRing.position.set(pos.x, 0.037, delivery.bounceZ); this.bounceRing.scale.setScalar(1 + age / 65); (this.bounceRing.material as THREE.MeshBasicMaterial).opacity = 1 - age / 260; }
    // Nothing to do for the bowler here. His action has been running since the
    // first step of the run-up and finishes on its own clock, so how long this
    // particular ball takes to reach the bat never touches it — which is the
    // whole of the disguise a slower ball is bowled behind.
  }
  /**
   * Where along the flight the ball is met. The crease, for every stroke but
   * one: the charge goes down the pitch to it and meets it a stride and a
   * half short of where it would otherwise have arrived.
   */
  private static meetsAt(charging: boolean) {
    return charging ? 1 - CHARGE_MEETS_AT / (GAME.releaseZ - GAME.contactZ) : 1;
  }
  swing(shot: ShotType, now: number, delivery: Delivery, charging = false, lofted = false, sweeping = false, levelled = false) {
    const contact = ballPosition(delivery, GameScene.meetsAt(charging));
    this.batter.swing(shot, now, contact.x, contact.y, contact.z, charging, lofted, sweeping, levelled);
  }
  hit(outcome: ShotOutcome, shot: ShotType | undefined, delivery: Delivery, now: number) {
    this.hitStart = outcome.madeBatContact ? Math.max(now, this.batter.strikeAt) : now;
    this.contactDelay = this.hitStart - now;
    this.incomingPosition.copy(this.ball.position);
    this.hitOutcome = outcome;
    const p = ballPosition(delivery, GameScene.meetsAt(!!outcome.advance)); this.hitOrigin.set(p.x, p.y, p.z);
    // The sweep is hit where the sweep goes — midwicket — rather than out along
    // the sector of the leg-side swipe that played it.
    // The orthodox sweep goes squarer than the slog does: the blade is level and
    // going across the line, so the ball leaves square of the wicket rather than
    // in front of it.
    // The charge over cover goes over extra cover, where the stroke sends it,
    // rather than out along the long-off sector the cover input names.
    const sector = outcome.swept ? SWEEP.angle
      : outcome.sweptFlat ? FLAT_SWEEP.angle
      : outcome.advance && shot === 'COVER_LONG_OFF' ? ADVANCE.coverAngle
      : outcome.advance && shot === 'LONG_ON' ? ADVANCE.onAngle
      : outcome.squared ? SQUARE_DRIVE.angle : SHOT_ANGLES[shot ?? 'STRAIGHT'];
    let angle = (sector + Math.max(-8, Math.min(8, (outcome.timingDeltaMs ?? 0) / 28))) * Math.PI / 180;
    const caught = outcome.wicketType === 'CAUGHT';
    /**
     * A ball that hit him rather than the bat. It has spent itself on his body,
     * so it drops where he stands — it does not carry on through to the keeper,
     * which is what it used to do and what made a blow to the ribs look like a
     * ball he had simply missed.
     */
    const struckBody = !!outcome.hit;
    // Everything about where the ball goes and how long it takes lives in
    // `flightOf`, out of this file, so it can be tested without a browser.
    const flight = flightOf(outcome);
    const playedOn = outcome.wicketType === 'BOWLED' && outcome.madeBatContact;
    const toAFielder = (caught || !!outcome.dropped) && outcome.aerial;
    this.dropAt = flight.dropAt;
    this.bounceAt = flight.bounceAt;
    this.takeAt = flight.takeAt;
    this.flightMs = flight.flightMs;
    this.hitHeight = flight.height;
    // A ball going to a fielder is swept off the straight, so the take does not
    // happen directly behind the bowler where nothing can be seen of it.
    if ((caught || toAFielder) && Math.abs(angle) < 0.2) angle = 0.22;
    // A ball off the body drops away on the leg side, at his feet.
    if (struckBody) angle = -0.85;
    this.hitEnd.set(Math.sin(angle) * flight.distance, flight.endY, Math.cos(angle) * flight.distance);
    // Played on and edged are both placed rather than swept out along the
    // stroke's angle: one finishes in his own stumps, the other in the keeper's
    // gloves before the stroke is over.
    if (playedOn) this.hitEnd.set(0.1, flight.endY, -1.5);
    if (outcome.edged) this.hitEnd.set(0.58, flight.endY, -1.6);
    // An edge is taken behind the stumps with nobody in the frame: the ball
    // simply deflects off the face and dies back past him. A fielder placed
    // there stands between the camera and the batter and fills the shot.
    // Somebody is under every skied ball, whether he holds it or not.
    if ((caught || outcome.dropped) && !outcome.edged) {
      this.catcher.root.position.set(this.hitEnd.x, 0, this.hitEnd.z);
      this.catcher.root.rotation.y = Math.atan2(-this.hitEnd.x, -this.hitEnd.z);
      this.catchRing.position.set(this.hitEnd.x, 0.04, this.hitEnd.z); this.catchRing.visible = true;
    }
    // The take lines up with the fielder's hands closing — see `takeAt`.
    this.takeAt = (caught || outcome.dropped) && !outcome.edged ? 0.86 : 1;
    this.bounceRing.visible = false;
    if (outcome.advance) this.chargeRing.position.set(this.hitOrigin.x, 0.045, this.hitOrigin.z);
    // Hold the call back until a skied ball is taken, put down, or clears the rope.
    return { contactAt: this.hitStart, presentAt: this.hitStart + (outcome.aerial ? this.flightMs * 0.88 : 0), endAt: this.hitStart + this.flightMs };
  }
  /**
   * The bails leave when the ball reaches them, not on a fixed delay. Called
   * from both halves of `result` — a ball that beat the bat and a ball the
   * batter dragged back onto his own stumps both end with the timber going.
   */
  private breakBails(now: number) {
    if (!this.bailsBrokeAt && this.ball.position.z <= 0) this.bailsBrokeAt = now;
    if (!this.bailsBrokeAt) return;
    const flung = Math.min(1, (now - this.bailsBrokeAt) / 620);
    this.bails.forEach((bail, i) => {
      bail.position.z = -flung * 1.9;
      bail.position.y = Math.max(0.05, GAME.stumpHeight + 0.02 + flung * 0.9 - flung * flung * 1.6);
      bail.rotation.x = flung * 11; bail.rotation.z = flung * (i ? 5 : -5);
    });
  }

  /** Where a struck ball sits at `t` through its flight; also drives the trail. */
  private struckAt(t: number, into: THREE.Vector3) {
    // Measured against the take rather than against the end of the animation, so
    // a ball with somebody under it is in his hands when his hands close and
    // waits there rather than still falling.
    const flown = Math.min(1, t / this.takeAt);
    into.lerpVectors(this.hitOrigin, this.hitEnd, flown);
    // One arc, or two with the turf in between. A ball that reaches the rope on
    // the bounce comes down inside the ground and goes on lower and flatter,
    // which is the whole of what makes it read as a four rather than a six.
    into.y += this.bounceAt > 0
      ? (flown < this.bounceAt
        ? Math.sin(flown / this.bounceAt * Math.PI) * this.hitHeight
        : Math.sin((flown - this.bounceAt) / (1 - this.bounceAt) * Math.PI) * this.hitHeight * .30)
      : Math.sin(flown * Math.PI) * this.hitHeight;
    // A dropped catch. The ball is in his hands and then it is not: past the
    // take it leaves them and goes to the turf, accelerating, just beyond him.
    if (this.dropAt > 0 && t > this.dropAt) {
      const fall = Math.min(1, (t - this.dropAt) / (1 - this.dropAt));
      into.y = THREE.MathUtils.lerp(1.42, 0.12, fall * fall);
      into.z += fall * 0.6;
    }
    return into;
  }
  result(now: number) {
    const result = this.hitOutcome; if (!result) return;
    if (now < this.hitStart) {
      const approach = 1 - (this.hitStart - now) / this.contactDelay;
      // The charge is resolved the moment it is played, with the ball still in
      // the air and the batter still in his crease, and the ball is drawn to
      // where he meets it over the whole of his run at it. Eased, so it does
      // not set off at a new pace on the frame of the swipe.
      this.ball.position.lerpVectors(this.incomingPosition, this.hitOrigin, result.advance ? THREE.MathUtils.smoothstep(approach, 0, 1) : approach);
      this.groundShadow(this.ball.position, true);
      this.trail.forEach(dot => dot.visible = false);
      this.fire.forEach(dot => dot.visible = false);
      return;
    }
    const t = Math.min(1, (now - this.hitStart) / this.flightMs);
    if (result.advance) {
      const age = now - this.hitStart;
      this.chargeRing.visible = age >= 0 && age < 760;
      this.chargeRing.scale.setScalar(1 + age / 105);
      (this.chargeRing.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 - age / 760);
    }
    if (result.madeBatContact || result.hit) {
      this.struckAt(t, this.ball.position);
      // The fielder reaches for it either way. Whether it stays in his hands is
      // decided by `dropAt`, not by whether he gets there.
      if ((result.wicketType === 'CAUGHT' || result.dropped) && !result.edged) {
        this.catcher.catchAt(THREE.MathUtils.clamp((t - 0.62) / 0.24, 0, 1));
      }
      // A ball he did not hold, and a ball that came off the body, both finish
      // on the ground in shot rather than winking out at the end of a flight.
      // Played on, the stumps go when the ball gets there, the same as any other
      // ball that finishes in them.
      if (result.wicketType === 'BOWLED') this.breakBails(now);
      this.ball.visible = t < 1 || !!result.dropped || !!result.hit;
      // The streak behind the ball is most of what sells a struck shot. A ball
      // off the body is not a struck shot, and a tail behind it says it was.
      this.trail.forEach((dot, i) => {
        const behind = t - (i + 1) * 0.019;
        dot.visible = !this.blaze && !result.hit && this.ball.visible && behind > 0;
        if (dot.visible) this.struckAt(behind, dot.position);
      });
      // Struck with a special stroke, the ball burns instead: closer-set and
      // smaller as they go, each one breathing a little so the tail flickers.
      this.fire.forEach((dot, i) => {
        // Close enough that they overlap into one streak rather than a string
        // of beads, even on a six going away at full pelt.
        const behind = t - (i + 1) * 0.0018;
        dot.visible = !!this.blaze && this.ball.visible && behind > 0;
        if (!dot.visible) return;
        this.struckAt(behind, dot.position);
        dot.scale.setScalar(0.13 * (1 - i / 32) * (1 + 0.18 * Math.sin(now * 0.045 + i * 1.7)));
      });
    } else {
      this.trail.forEach(dot => dot.visible = false);
      this.fire.forEach(dot => dot.visible = false);
      // Carry on from where the ball actually is rather than resetting it to the
      // crease, so a beaten stroke never rewinds the delivery.
      const from = this.incomingPosition;
      const stopZ = result.wicketType === 'LBW' ? from.z : -1.3;
      this.ball.position.set(from.x, Math.max(0.1, from.y - t * 0.3), THREE.MathUtils.lerp(from.z, stopZ, Math.min(1, t * 5)));
      // The bails leave when the ball reaches them, not on a fixed delay. A
      // stumping breaks them too: the ball carries through to the keeper either
      // way, and without this the call read STUMPED over a standing wicket.
      if (result.wicketType === 'BOWLED' || result.wicketType === 'STUMPED') this.breakBails(now);
      if (result.wicketType === 'LBW') {
        this.batter.root.position.x = THREE.MathUtils.lerp(GAME.stanceX, this.hitOrigin.x - 0.13, Math.min(1, t * 8));
        this.batter.root.rotation.z = Math.sin(Math.min(1, t * 4) * Math.PI) * 0.13;
      }
      this.ball.visible = t < 0.8;
    }
    this.groundShadow(this.ball.position, this.ball.visible);
  }
  /** A high ball keeps a wide, faint shadow under it so its flight stays legible. */
  private groundShadow(ball: THREE.Vector3, visible: boolean) {
    this.shadow.position.set(ball.x, 0.03, ball.z);
    this.shadow.scale.setScalar(1 + Math.max(0, ball.y) * 0.22);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.07, 0.35 - Math.max(0, ball.y) * 0.021);
    this.shadow.visible = visible;
  }
  render(now: number) {
    this.batter.update(now);
    this.traceBat(now);
    if (this.bowling) {
      // Anchor the action's clock to how far into the run-up the game already
      // is, rather than to the frame this happened to be noticed on: started a
      // frame late, the arm reaches the top a frame after the ball has gone.
      if (!Number.isFinite(this.actionStartedAt)) this.actionStartedAt = now - this.runupProgress * GAME.runupMs;
      this.bowler.animate(now - this.actionStartedAt);
    }
    const outcome = this.hitOutcome, since = now - this.hitStart;
    // A skied ball shakes the same whatever it becomes, so the camera cannot
    // give the result away before the fielder has settled under it.
    const power = !this.reducedMotion && outcome && since >= 0
      ? outcome.advance ? 0.062 : outcome.aerial ? 0.020 : outcome.runs === 6 ? 0.030 : outcome.runs === 4 ? 0.017 : outcome.isWicket ? 0.022 : 0
      : 0;
    const shake = power * Math.max(0, 1 - since / (outcome?.advance ? 620 : 300));
    this.camera.position.x = Math.sin(now * 0.085) * shake;
    this.camera.position.y = 2.9 + Math.sin(now * 0.13) * shake * 0.6;
    this.sky.mesh.position.copy(this.camera.position);
    this.mute.value = Math.max(muteAt(now - this.celebratedAt), powerAt(now - this.poweredAt));
    this.renderer.render(this.scene, this.camera);
  }
  inspectBatter() { return this.batter.inspect(); }
  inspectBowler() {
    const b = this.bowler.figure.inspect();
    return { z: this.bowler.root.position.z, handY: b.hands[1][1], handZ: b.hands[1][2], hipY: b.hip[1] };
  }
  dispose() {
    this.resizeObserver.disconnect();
    const geometries = new Set<THREE.BufferGeometry>(); const mats = new Set<THREE.Material>();
    this.scene.traverse(object => { if (object instanceof THREE.Mesh) { geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => mats.add(m)); } });
    // The shared character primitives outlive any one scene; the rest is ours.
    // That now covers the figures too — bowler and fielders are built from one
    // set of geometries and one set of materials, and freeing either would take
    // them out from under the next scene to be built.
    Object.values(SHAPES).forEach(shape => geometries.delete(shape));
    FIGURE_ASSETS.shapes.forEach(shape => geometries.delete(shape));
    FIGURE_ASSETS.materials.forEach(material => mats.delete(material));
    // The sky's own, and what was painted for the ground.
    geometries.delete(this.sky.mesh.geometry); mats.delete(this.sky.mesh.material as THREE.Material); this.sky.dispose();
    this.environment.dispose(); this.textures.forEach(t => t.dispose());
    geometries.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); materials.clear(); this.renderer.dispose();
  }
}
