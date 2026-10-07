import * as THREE from 'three';
import { type AfterBall, Batter, type BatterKit, CELEBRATION_MS, CHARGE_MEETS_AT, type Celebration, celebrationLength, type Hurt } from '../entities/Batter';
import { ACTION_MS, Bowler, EXPRESS_ACTION, PACE_ACTION } from '../entities/Bowler';
import { bodyOf, showBody } from '../entities/Fielder';
import { FIGURE_ASSETS } from '../entities/Cricketer';
import { BLAST_FIELD, Field, TEST_FIELD } from './field';
import { ADVANCE, FLAT_SWEEP, GAME, SHOT_ANGLES, SQUARE_DRIVE, SWEEP } from '../config/gameplay';
import { ballPosition, drawnAt } from '../game/DeliveryTrajectory';
import { KIT } from '../entities/Cricketer';
import { WHITES } from '../config/survive';
import { flightOf } from './flight';
import { OVERCAST, SKY, Sky, type SkyTime } from './sky';
import { FILL_POSITION, LIGHTING, glows, moon, nightReflections } from './night';
import { WEAR_STAGES, contactShadowTexture, grassTexture, pitchTexture } from './turf';
import { perimeterBoards } from './boards';
import { box, colors, cylinder, forgetMaterials, mat, soft } from './build';
import { buildGround, groundFrom, ownFloodlights, type GroundName } from './grounds';
import { buildWicket } from './wicket';
import type { CrowdCelebration, CrowdMoment } from './CrowdCelebration';
import { PerformanceReadout } from './performance';
import { grassBlades } from './grassBlades';
import { grassDetail } from './grassDetail';
import type { Delivery, ShotOutcome, ShotType } from '../game/types';
import type { Cutout } from '../ui/Milestone';

/** How much a kit glows in its own colour under the floodlights: see `kitsUnderLights`. */
const KIT_GLOW = 0.32;
/** Where a beaten ball runs out of steam: just short of the stumps. */
const BEATEN_STOP = (GAME.releaseZ - 0.3) / (GAME.releaseZ - GAME.contactZ);
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
/** How long the Marathon's cloud takes to come over. */
const COVER_MS = 3200;
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
function muteAt(age: number, lasts = CELEBRATION_MS) {
  if (age < 0 || age >= lasts) return 0;
  const into = THREE.MathUtils.smoothstep(age, 0, 180);
  const out = 1 - THREE.MathUtils.smoothstep(age, lasts - 320, lasts);
  return Math.min(into, out);
}

// The ball and its trail are the only things left that want a bare sphere;
// every figure on the field is a Cricketer, which carries its own primitives.
const SHAPES = { ball: new THREE.SphereGeometry(1, 24, 16) };

/**
 * The ball, by format: the Blast's bright red, and the Test match's darker
 * Dukes. Both keep the faint glow of their own colour, which is what holds a
 * ball against the stands in the second it is in the air.
 */
const BALL = {
  blast: { color: 0xe84829, glow: 0x972708 },
  test: { color: 0xa81c1c, glow: 0x5c0b07 },
  /**
   * How much grass the Test strip keeps, of `pitchTexture`'s nought to one. A
   * little greener, not a green top: at one the whole strip reads as grass.
   */
  testGrass: 0.5,
} as const;

export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  /** Frame rate and draw calls on screen, for judging the graphics on a phone: `?perf=1`. */
  private performanceReadout?: PerformanceReadout;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(53, 1, 0.1, 180);
  private world = new THREE.Group();
  private batter = new Batter();
  private bowler = new Bowler();
  /**
   * What the bowler stands in: nothing, while he bowls — his action places
   * him itself — and the man on the turf once he has a ball to field, when he
   * is driven by the same rig as the fielders.
   */
  private bowlerHolder = new THREE.Group();
  /** The fielding side: six men who wait, walk in, and go for the ball. See `Field`. */
  private field = new Field();
  /** The game's clock as of the last frame drawn, for the calls that are not handed it. */
  private clock = 0;
  /** Whether this delivery has been let go yet, so the split step is timed once. */
  private released = false;
  /** A ball along the ground that a fielder is going to pick up, so it stays in sight where it stops. */
  private gathered = false;
  private ball: THREE.Mesh;
  /** The strip's material, and the two surfaces it is laid with: see `testLook`. */
  private pitch!: THREE.MeshStandardMaterial;
  private dryPitch!: THREE.Texture;
  private greenPitch: THREE.Texture | null = null;
  /** The Test strip worn to the current stage, painted when the stage comes; null while it is fresh. */
  private wornPitch: THREE.Texture | null = null;
  private wearStage = 0;
  private anisotropy = 1;
  private shadow: THREE.Mesh;
  private bounceRing: THREE.Mesh;
  private catchRing: THREE.Mesh;
  private chargeRing: THREE.Mesh;
  private bails: THREE.Mesh[] = [];
  /** His own stumps, the ones between the camera and him: drawn back over a moment's back layer with him. */
  private stumps: THREE.Mesh[] = [];
  /**
   * The layers a Test innings' moment puts between the picture and the HUD:
   * the doodle's back layer, then him cut back out over it with his outline.
   * See `cutout`.
   */
  private readonly underlay = document.createElement('div');
  private readonly cutCanvas = document.createElement('canvas');
  private cut: { spec: Cutout; until: number; him: Set<THREE.Object3D>; stumps: Set<THREE.Object3D>; sil: HTMLCanvasElement; ring: HTMLCanvasElement } | null = null;
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
  /** The moment the ball breaks the wicket, for the stumps' rattle. Once a ball. */
  onStumps: (() => void) | null = null;
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
  /** Which ground the stands are built for: see `grounds.ts`. */
  readonly ground: GroundName = groundFrom(location.search);
  /** Day or night: see `time`. */
  private now: SkyTime = 'day';
  private hemisphere = new THREE.HemisphereLight(LIGHTING.day.hemisphere.sky, LIGHTING.day.hemisphere.ground, LIGHTING.day.hemisphere.intensity);
  private sun = new THREE.DirectionalLight(LIGHTING.day.key.colour, LIGHTING.day.key.intensity);
  private fill = new THREE.DirectionalLight(LIGHTING.night.fill.colour, 0);
  /** What lights up after dark: the boards' material, the stadium's lamps, the moon and the glows. */
  private boardsMaterial: THREE.MeshStandardMaterial | null = null;
  private lamps: THREE.MeshStandardMaterial | null = null;
  private night: THREE.Object3D[] = [];
  /** The lights the ground reflects after dark: see `nightReflections`. */
  private reflections = nightReflections();
  private environment: THREE.WebGLRenderTarget;
  /** Painted once at start-up; the scene's traversal finds materials, not their maps. */
  private textures: THREE.Texture[] = [];
  /** How grey everything but the batter is: see `MUTE`. */
  private mute = { value: 0 };
  private celebratedAt = -Infinity;
  /** The stands on their feet for a boundary or a milestone; the stadium's only, the bowl has none. */
  private crowd?: CrowdCelebration;
  /** How long the celebration under way greys the ground for. */
  private celebratedFor = CELEBRATION_MS;
  private poweredAt = -Infinity;
  constructor(private container: HTMLElement) {
    // Alpha, so a pass of him alone can be lifted off a clear background: see `cutout`.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
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
    this.underlay.className = 'stage-underlay'; this.cutCanvas.className = 'stage-cut';
    this.cutCanvas.style.display = 'none'; this.cutCanvas.setAttribute('aria-hidden', 'true');
    this.renderer.domElement.after(this.underlay, this.cutCanvas);
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
    this.scene.add(this.hemisphere);
    // The sun by day, the floodlights behind the batter's end by night: the one that casts.
    const sun = this.sun; sun.position.set(-15, 30, -8); sun.castShadow = true;
    sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048); sun.shadow.camera.left = -28; sun.shadow.camera.right = 28;
    sun.shadow.camera.top = 35; sun.shadow.camera.bottom = -20; sun.shadow.normalBias = 0.025;
    this.scene.add(sun);
    // The far towers' light, catching the batter's edges after dark; nothing by day.
    // Always in the scene, so switching to night recompiles no shader.
    this.fill.position.set(...FILL_POSITION); this.scene.add(this.fill);
    this.createGround();
    this.wicket(0); this.wicket(18.7);
    this.bowlerHolder.add(this.bowler.root);
    this.world.add(this.batter.root, this.bowlerHolder, ...this.field.fielders.map(f => f.root));
    this.ball = new THREE.Mesh(SHAPES.ball, soft(BALL.blast.color, 0.34));
    this.ball.scale.setScalar(0.115); this.ball.castShadow = true; this.world.add(this.ball);
    (this.ball.material as THREE.MeshStandardMaterial).emissive.setHex(BALL.blast.glow);
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
    if (new URLSearchParams(location.search).get('perf') === '1') this.performanceReadout = new PerformanceReadout(container);
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
    // Relief only, the colour left to the turf: a blade's light and shade,
    // tiled, and fading into the flat as the mipmaps take over.
    const blades = grassDetail(140, anisotropy);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 96), new THREE.MeshStandardMaterial({ map: grass, normalMap: blades, normalScale: new THREE.Vector2(0.65, 0.65), roughness: 0.95 })); ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.035, 10); ground.receiveShadow = true; this.world.add(ground);
    // The strip, its wear painted on rather than built from boxes.
    const surface = pitchTexture(2.8, 32, 4.3, anisotropy, { batting: 0, bowling: 18.7 });
    this.pitch = new THREE.MeshStandardMaterial({ map: surface, roughness: 0.9 });
    this.dryPitch = surface; this.anisotropy = anisotropy;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.025, 32), this.pitch);
    strip.position.set(0, 0, 4.3); strip.receiveShadow = true; this.world.add(strip);
    this.textures.push(grass, blades, surface);
    // And standing blades either side of the strip near the bat, one draw.
    this.world.add(grassBlades(grass));
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
    // A soft patch under everyone but the batter, who is close enough to the
    // camera that the sun's own shadow does the job.
    const contact = contactShadowTexture(); this.textures.push(contact);
    const patch = new THREE.MeshBasicMaterial({ map: contact, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const plane = new THREE.PlaneGeometry(1.15, 1.15);
    const under = () => { const mesh = new THREE.Mesh(plane, patch); mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.016; return mesh; };
    this.bowler.figure.root.add(under());
    // A fielder's goes on the man standing on the turf, not on the figure that
    // tips over in a dive, and follows his hips wherever they go.
    for (const fielder of this.field.fielders) { fielder.patch = under(); fielder.root.add(fielder.patch); }
    this.field.update(0);
  }
  private createStadium(anisotropy: number) {
    const lights = buildGround(this.ground, this.world);
    // The boards along the foot of the stands. Added to the scene rather than
    // the mirrored stage, or every sponsor would read backwards.
    const boards = perimeterBoards(35.1, 1.2, 1.5, 10, anisotropy);
    this.scene.add(boards.group); this.textures.push(boards.texture);
    boards.group.traverse(object => {
      if (object instanceof THREE.Mesh && (object.material as THREE.MeshStandardMaterial).emissiveMap) this.boardsMaterial = object.material as THREE.MeshStandardMaterial;
    });
    // The night's own: the moon, and a glow on every lamp the stadium has.
    const theMoon = moon(this.camera.position);
    this.scene.add(theMoon.sprite); this.night.push(theMoon.sprite); this.textures.push(theMoon.texture);
    if (lights) {
      this.crowd = lights.createCrowd?.(this.reducedMotion);
      if (this.crowd) this.textures.push(...this.crowd.textures);
      this.lamps = lights.lamps;
      const glow = glows(lights.roof, lights.towers);
      this.world.add(...glow.points); this.night.push(...glow.points); this.textures.push(glow.texture);
    }
    if (!ownFloodlights(this.ground)) for (const [x, z] of [[-29, 35], [29, 35], [-32, -13], [32, -13]]) {
      cylinder(this.world, 0.19, 18, 0x839697, x, 9, z);
      box(this.world, 4, 2, 0.3, 0x304953, x, 17.5, z);
      for (let row = 0; row < 2; row++) for (let col = 0; col < 5; col++) box(this.world, 0.55, 0.55, 0.1, 0xfff4d9, x - 1.5 + col * 0.75, 17.1 + row * 0.8, z - 0.21);
    }
  }
  private wicket(z: number) {
    const { timber, bails } = buildWicket(this.world, GAME.stumpHeight, z);
    if (z === 0) { this.bails.push(...bails); this.stumps.push(...timber, ...bails); }
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
  /**
   * Day or night. Repaints the sky and takes its environment map again,
   * moves and recolours the lights, turns the lamps and the boards up, and
   * puts the moon and the glows out. The ground is the same ground: nothing is
   * built or rebuilt, and no shader changes, so it can be switched from the
   * pause menu between balls.
   */
  time(time: SkyTime) {
    if (time === this.now) return;
    this.now = time;
    const palette = this.sky.time(time), light = LIGHTING[time];
    this.scene.fog = new THREE.Fog(palette.horizon, 48, 125);
    this.renderer.setClearColor(palette.horizon);
    this.environment.dispose();
    this.environment = this.sky.environment(this.renderer, time === 'night' ? this.reflections : []);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = light.environment;
    this.hemisphere.color.set(light.hemisphere.sky); this.hemisphere.groundColor.set(light.hemisphere.ground);
    this.hemisphere.intensity = light.hemisphere.intensity;
    this.sun.color.set(light.key.colour); this.sun.intensity = light.key.intensity * (1 - this.sky.cover * OVERCAST.sun); this.sun.position.set(...light.key.position);
    this.fill.intensity = light.fill.intensity;
    if (this.boardsMaterial) this.boardsMaterial.emissiveIntensity = light.boards;
    if (this.lamps) this.lamps.emissiveIntensity = light.lamps;
    for (const object of this.night) object.visible = time === 'night';
    this.kitsUnderLights();
  }
  /**
   * The kits under the floodlights. Lit only by a warm key from behind and a
   * cool fill from the far end, a navy shirt went to black and an orange one
   * to brown: floodlit cricket is a riot of colour, and this was a dim one. So
   * at night every figure's own colours are lifted a little by glowing in
   * themselves — the shirt's colour, not white, so a kit stays its colour and
   * only gets brighter. Called again whenever a kit changes, since the glow is
   * the kit's own colour.
   */
  private kitsUnderLights() {
    const night = this.now === 'night';
    const roots = [this.batter.root, this.bowler.root, ...this.field.fielders.map(f => f.root)];
    for (const root of roots) root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of [object.material].flat()) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        const day = material.userData.dayGlow ??= { colour: material.emissive.getHex(), intensity: material.emissiveIntensity };
        if (night) { material.emissive.copy(material.color); material.emissiveIntensity = KIT_GLOW; }
        else { material.emissive.setHex(day.colour); material.emissiveIntensity = day.intensity; }
      }
    });
  }
  /** Whether the ground is lit for night. For the checks. */
  get lit() { return this.now; }
  /** He has taken one too many. Nothing stands him back up but a new innings. */
  fall(now: number, where?: Hurt) { this.batter.fall(now, where); }
  /**
   * A left-hander at the crease. The stage is mirrored once already so that a
   * right-hander's leg side reads left; this takes the mirror off, and the
   * batter, his field and the ball's flight all come out the other way round.
   * Everything the game knows stays in the one frame — the line, the stance,
   * the leg side — so not a rule has to know he is left-handed.
   *
   * The bowler is mirrored back on his own, inside it: the same right-arm
   * bowler, now bowling across him rather than at him.
   */
  leftHanded(on: boolean) {
    this.world.scale.x = on ? 1 : -1;
    this.bowlerHolder.scale.x = on ? -1 : 1;
  }
  get mirrored() { return this.world.scale.x > 0; }
  /** The next man in, at his guard. The last one may be lying where he fell. */
  newBatter() { this.batter.reset(); }
  /** What the batter does once the ball is done with (`Batter.afterBall`), and when he will be back in his guard. */
  afterBall(kind: AfterBall, now: number) { return this.batter.afterBall(kind, now); }
  /**
   * `?actions=1`: the stroke that earns `kind` played at no ball, and then
   * `kind` itself. When he will be back in his guard.
   */
  rehearse(kind: AfterBall, now: number) {
    const [shot, height, lofted, swept] = REHEARSED[kind];
    this.batter.swing(shot, now, 0, height, GAME.contactZ, false, lofted, swept);
    return this.batter.afterBall(kind, now);
  }
  /** The stroke he played, for choosing what he does after it. */
  get stroke() { return this.batter.played; }
  /**
   * The stands for a four or six struck, or a milestone: arms up and placards
   * across the far end. A boundary does not cut short a bigger moment still
   * up, and the next ball sits them down (`reset`) rather than waiting on them.
   */
  cheer(kind: CrowdMoment, now: number, mark = 0) { this.crowd?.trigger(kind, now, mark); }
  get crowdState() { return this.crowd?.state ?? { kind: null, spectators: 0, banners: 0 }; }
  /**
   * A moment: his hundred or six sixes, the bat to the sky and the world gone
   * grey round him; or his fifty, `mild`, the bat raised and the colours left
   * where they are.
   */
  celebrate(now: number, kind: Celebration = 'hundred') {
    this.batter.celebrate(now, kind);
    // The fifty keeps the ground in its colours; the rest grey it for as long as they last.
    this.celebratedAt = kind === 'fifty' ? -Infinity : now;
    this.celebratedFor = celebrationLength(kind);
  }
  /**
   * A moment's layers under the HUD, for `lasts` milliseconds: `back`, the
   * doodle's layer that goes behind him, and `spec`, how he is cut back out
   * over it — outline rings stamped round his silhouette, and his stumps
   * with him where they stand in front of him. Each frame he is rendered
   * once more on his own, onto a clear background, and that picture is laid
   * over the back layer, so the doodle goes behind him without a 3D card in
   * the scene. Called with nothing, it takes them down.
   */
  cutout(back?: HTMLElement, spec?: Cutout, lasts = 0) {
    this.underlay.replaceChildren(...(back ? [back] : []));
    if (back) window.setTimeout(() => back.remove(), lasts);
    if (!spec) { this.cut = null; this.cutCanvas.style.display = 'none'; return; }
    const him = new Set<THREE.Object3D>(), stumps = new Set<THREE.Object3D>(spec.stumps ? this.stumps : []);
    this.batter.root.traverse(o => him.add(o));
    this.cut = { spec, until: performance.now() + lasts, him, stumps, sil: document.createElement('canvas'), ring: document.createElement('canvas') };
  }
  /** Him alone, then his stumps with him, into the cut-out's canvas, with the outline rings under. */
  private drawCutout() {
    const cut = this.cut!, left = cut.until - performance.now();
    if (left <= 0) { this.cutout(); return; }
    const gl = this.renderer.domElement, canvas = this.cutCanvas;
    if (canvas.width !== gl.width || canvas.height !== gl.height) { canvas.width = gl.width; canvas.height = gl.height; }
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    canvas.style.display = '';
    canvas.style.opacity = String(Math.min(1, left / 300));

    const hidden: THREE.Object3D[] = [];
    const only = (keep: (o: THREE.Object3D) => boolean) => this.scene.traverse(o => {
      if (o.visible && !keep(o) && ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite)) { o.visible = false; hidden.push(o); }
    });
    const clear = this.renderer.getClearColor(new THREE.Color()), alpha = this.renderer.getClearAlpha();
    const shadows = this.renderer.shadowMap.autoUpdate;
    this.renderer.setClearColor(0x000000, 0);
    // The shadow map is the last frame's: drawn again for him alone, he would
    // be lit as if nothing else stood on the ground.
    this.renderer.shadowMap.autoUpdate = false;
    try {
      only(o => cut.him.has(o));
      this.renderer.render(this.scene, this.camera);
      this.outline(context, gl);
      context.drawImage(gl, 0, 0);
      if (cut.stumps.size) {
        hidden.forEach(o => { if (cut.stumps.has(o)) o.visible = true; });
        this.renderer.render(this.scene, this.camera);
        context.drawImage(gl, 0, 0);
      }
    } finally {
      hidden.forEach(o => { o.visible = true; });
      this.renderer.setClearColor(clear, alpha);
      this.renderer.shadowMap.autoUpdate = shadows;
    }
  }
  /**
   * The outline rings, biggest first: his silhouette stamped round a circle
   * of each ring's radius and filled with its colour. Worked at CSS pixels in
   * a box round him rather than across the whole screen, and the stamps are
   * jittered afresh nine times a second so the line boils like the pen's.
   */
  private outline(context: CanvasRenderingContext2D, gl: HTMLCanvasElement) {
    const cut = this.cut!, at = this.batterOnScreen(), ratio = gl.width / Math.max(1, at.width);
    const s = Math.max(40, (at.feet.y - at.head.y) / 1.78);
    const x0 = Math.max(0, Math.min(at.head.x, at.feet.x) - s * 2.1), x1 = Math.min(at.width, Math.max(at.head.x, at.feet.x) + s * 2.1);
    const y0 = Math.max(0, at.head.y - s * 1.5), y1 = Math.min(at.height, at.feet.y + s * .45);
    const w = Math.ceil(x1 - x0), h = Math.ceil(y1 - y0);
    if (w <= 0 || h <= 0) return;
    for (const c of [cut.sil, cut.ring]) if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const sil = cut.sil.getContext('2d'), ring = cut.ring.getContext('2d');
    if (!sil || !ring) return;
    sil.clearRect(0, 0, w, h);
    sil.drawImage(gl, x0 * ratio, y0 * ratio, w * ratio, h * ratio, 0, 0, w, h);
    let seed = Math.floor(performance.now() / 110) * 7919 >>> 0;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (const { r, colour, dx = 0, dy = 0 } of cut.spec.rings) {
      ring.globalCompositeOperation = 'source-over';
      ring.clearRect(0, 0, w, h);
      for (const [count, reach] of [[16, 1], [8, .55]] as const) for (let i = 0; i < count; i++) {
        const a = (i + random() * .3) / count * Math.PI * 2, rr = r * reach * (1 + (random() - .5) * .16);
        ring.drawImage(cut.sil, Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ring.globalCompositeOperation = 'source-in';
      ring.fillStyle = colour;
      ring.fillRect(0, 0, w, h);
      context.drawImage(cut.ring, 0, 0, w, h, (x0 + dx) * ratio, (y0 + dy) * ratio, w * ratio, h * ratio);
    }
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
    this.testLook(on);
    this.batter.dress(on ? 'whites' : 'home');
    this.bowler.figure.dress(kit);
    // The fielding side too. Leaving them in coloured clothing while the two
    // men in the middle wore whites read as a bug rather than as a mode.
    this.field.dress(kit);
    // And set the field for the game: the Test match's attacking ring, or
    // the Blast's men back on the rope.
    this.field.setField(on ? TEST_FIELD : BLAST_FIELD);
    this.kitsUnderLights();
  }

  /**
   * The Test match's ball and strip. A Dukes rather than the Blast's bright
   * red — deep cherry, its cream seam standing out the more for it — and a
   * strip with grass left on it. The green one is painted the first time a
   * Test is played and kept, so a player who only ever bats in the Blast never
   * pays for it; swapping the map is all either costs after that, and it
   * changes no shader.
   */
  private testLook(on: boolean) {
    const ball = this.ball.material as THREE.MeshStandardMaterial;
    const look = on ? BALL.test : BALL.blast;
    ball.color.setHex(look.color); ball.emissive.setHex(look.glow);
    if (on && !this.greenPitch) {
      this.greenPitch = pitchTexture(2.8, 32, 4.3, this.anisotropy, { batting: 0, bowling: 18.7 }, BALL.testGrass);
      this.textures.push(this.greenPitch);
    }
    this.pitch.map = on ? this.greenPitch! : this.dryPitch;
    this.dropWear();
  }
  /** Which strip is down, for the checks. */
  get greenTop() { return this.pitch.map === this.greenPitch; }
  /** How worn the Test strip is, as a stage of `WEAR_STAGES`, for the checks. */
  get worn() { return this.wearStage; }

  /**
   * The Marathon's strip, worn to a stage: repainted as each level comes — the
   * swing, the express bowler, Level 3 — so what the bowling is doing can be
   * seen in the surface it is doing it off. One worn strip is kept at a time;
   * the last is thrown away when the next is painted.
   */
  wear(stage: number) {
    const at = Math.max(0, Math.min(WEAR_STAGES.length - 1, Math.round(stage)));
    if (at === this.wearStage || !this.greenPitch || this.pitch.map === this.dryPitch) return;
    this.dropWear();
    this.wearStage = at;
    if (!at) return;
    this.wornPitch = pitchTexture(2.8, 32, 4.3, this.anisotropy, { batting: 0, bowling: 18.7 }, BALL.testGrass, WEAR_STAGES[at]);
    this.pitch.map = this.wornPitch;
  }
  private dropWear() {
    if (this.wornPitch) {
      if (this.pitch.map === this.wornPitch) this.pitch.map = this.greenPitch;
      this.wornPitch.dispose();
      this.wornPitch = null;
    }
    this.wearStage = 0;
  }

  /**
   * The Marathon's cloud cover: the sky greys over and the sun dims as the
   * ball starts to swing, which is the weather every cricket fan already links
   * with it. Drawn in over a few seconds, not switched — weather comes over —
   * and the environment map retaken once when it has, rather than every frame
   * on the way. `instant` is for a new innings, which starts under clear sky.
   */
  private cover = { from: 0, to: 0, at: 0 };
  overcast(on: boolean, instant = false) {
    const to = on ? 1 : 0;
    if (to === this.cover.to && (!instant || this.sky.cover === to)) return;
    this.cover = { from: instant ? to : this.sky.cover, to, at: this.clock };
    if (instant) this.clouding(to, true);
  }
  /** How clouded over it is now, nought to one, for the checks. */
  get clouded() { return Math.round(this.sky.cover * 100) / 100; }
  private clouding(amount: number, settled: boolean) {
    this.sky.overcast(amount);
    this.sun.intensity = LIGHTING[this.now].key.intensity * (1 - amount * OVERCAST.sun);
    if (!settled) return;
    this.environment.dispose();
    this.environment = this.sky.environment(this.renderer, this.now === 'night' ? this.reflections : []);
    this.scene.environment = this.environment.texture;
  }

  /** The batter alone, into a Rivals kit. The fielding side keeps its colours. */
  kit(kit: BatterKit) { this.batter.dress(kit); this.kitsUnderLights(); }

  /** A new ball. `carryOn`: see `Batter.reset`. */
  reset(carryOn = false) {
    this.cutout();
    this.crowd?.settle(this.clock);
    this.celebratedAt = -Infinity; this.poweredAt = -Infinity; this.mute.value = 0; this.blaze = null; this.swishedAt = -Infinity; this.swish.visible = false;
    this.hitOutcome = null; this.bailsBrokeAt = 0; this.flightMs = GAME.hitAnimationMs; this.hitHeight = 0; this.dropAt = 0; this.bounceAt = 0; this.takeAt = 1; this.ball.visible = false; this.shadow.visible = false; this.bounceRing.visible = false; this.catchRing.visible = false; this.chargeRing.visible = false;
    this.trail.forEach(t => t.visible = false); this.fire.forEach(f => f.visible = false); this.batter.reset(carryOn);
    this.bails.forEach((b, i) => { b.position.set(i ? 0.073 : -0.073, GAME.stumpHeight + 0.02, 0); b.rotation.set(0, 0, 0); });
    this.batter.root.visible = true;
    this.field.reset(); this.released = false; this.gathered = false;
    // Out of the holder's hands and back into his own.
    this.bowlerHolder.position.set(0, 0, 0); this.bowlerHolder.rotation.set(0, 0, 0); this.bowler.root.quaternion.identity();
    this.bowler.reset(); this.bowling = false; this.actionStartedAt = Infinity; this.runupProgress = 0;
  }
  /**
   * Called each frame of the run-up. It only starts the action's clock — the
   * pose itself is set in `render`, off that clock, so the run-up and the
   * follow-through are one continuous timeline rather than two that have to be
   * talked into lining up at the join.
   */
  runup(t: number) {
    // The bowler sets off and the field walks in with him.
    if (!this.bowling) this.field.walkIn(this.clock);
    this.bowling = true; this.runupProgress = t;
  }
  /**
   * Which bowler is at the top of the mark. Set after `reset` and before the
   * action starts, because `reset` puts the ball back in the quick bowler's
   * hand and the spinner has to take it again each ball of his over.
   */
  spinner(on: boolean) { this.bowler.spinner(on); }
  /**
   * And whose action he bowls it with: the Marathon's express bowler in his
   * overs, the fast bowler in everyone else's. Set beside `spinner`, every ball,
   * so an over can never inherit the last one's.
   */
  express(on: boolean) { this.bowler.action(on ? EXPRESS_ACTION : PACE_ACTION); }
  /** Which action is at the top of the mark, for the checks. */
  get bowlerAction() { return this.bowler.actionStyle === EXPRESS_ACTION ? 'express' : 'pace'; }
  /**
   * And which side of the stumps he bowls it from: round the wicket in the
   * Marathon's overs that are, over it in everyone else's. Set beside
   * `express`, every ball, for the same reason.
   */
  round(on: boolean) { this.bowler.round(on); }
  get bowlerSide() { return this.bowler.isRound ? 'round' : 'over'; }
  /** Where the ball leaves his hand across the pitch, in the stage's frame: mirrored with him for a left-hander. */
  private get releaseX() { return this.bowlerHolder.scale.x * this.bowler.releaseX(); }
  /** Where the ball is drawn: from his hand, round the wicket. See `drawnAt`. */
  private flight(delivery: Delivery, progress: number) {
    return delivery.round ? drawnAt(delivery, progress, this.releaseX) : ballPosition(delivery, progress);
  }
  /** And at any point of a flight, by asking rather than by catching the frame: for the checks. */
  drawnBall(delivery: Delivery, progress: number) {
    const p = this.flight(delivery, progress);
    return [p.x, p.y, p.z].map(v => +v.toFixed(4));
  }
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
    // Out of his hand: the field times its split step to the ball reaching the bat.
    if (!this.released) { this.released = true; this.field.set(this.clock, this.clock + Math.max(0, 1 - progress) * delivery.durationMs); }
    this.ball.visible = this.shadow.visible = true;
    const pos = this.flight(delivery, this.flightAt(delivery, progress)); this.ball.position.set(pos.x, pos.y, pos.z);
    this.groundShadow(this.ball.position, true);
    this.trail.forEach((dot, i) => {
      dot.visible = progress > 0.03;
      const p = this.flight(delivery, this.flightAt(delivery, Math.max(0, progress - (i + 1) * 0.009))); dot.position.set(p.x, p.y, p.z);
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
    const contact = this.flight(delivery, GameScene.meetsAt(charging));
    this.batter.swing(shot, now, contact.x, contact.y, contact.z, charging, lofted, sweeping, levelled);
  }
  hit(outcome: ShotOutcome, shot: ShotType | undefined, delivery: Delivery, now: number) {
    this.hitStart = outcome.madeBatContact ? Math.max(now, this.batter.strikeAt) : now;
    this.contactDelay = this.hitStart - now;
    this.incomingPosition.copy(this.ball.position);
    this.hitOutcome = outcome;
    const p = this.flight(delivery, GameScene.meetsAt(!!outcome.advance)); this.hitOrigin.set(p.x, p.y, p.z);
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
    // Along the ground and into the field: never between a fielder's boots.
    // Turned the least it takes to pass him by a stride and a half, which is
    // close enough that he dives for it and it beats him.
    const along = outcome.madeBatContact && !outcome.aerial && !caught && !outcome.edged && !playedOn && !outcome.defended
      && !struckBody && !outcome.advance && flight.height < 1 && outcome.runs >= 1;
    if (along) angle = this.field.clear(this.hitStart, angle, flight.distance);
    this.gathered = false;
    this.hitEnd.set(Math.sin(angle) * flight.distance, flight.endY, Math.cos(angle) * flight.distance);
    // Played on and edged are both placed rather than swept out along the
    // stroke's angle: one finishes in his own stumps, the other in the keeper's
    // gloves before the stroke is over.
    if (playedOn) this.hitEnd.set(0.1, flight.endY, -1.5);
    if (outcome.edged) this.hitEnd.set(0.58, flight.endY, -1.6);
    // The take lines up with the fielder's hands closing — see `takeAt`.
    this.takeAt = (caught || outcome.dropped) && !outcome.edged ? 0.86 : 1;
    // An edge is taken behind the stumps with nobody in the frame: the ball
    // simply deflects off the face and dies back past him. A fielder placed
    // there stands between the camera and the batter and fills the shot.
    // Somebody goes for every other ball that goes up to the field, whether he
    // holds it or not — the fielder best placed, from where he is standing,
    // running and diving if he has to. The flight is bent to finish in his
    // hands, wherever they get to, so he is never put under it.
    const look = () => (this.ball.visible ? this.ball.position.clone() : null);
    const deadAt = this.hitStart + this.flightMs;
    if ((caught || outcome.dropped) && !outcome.edged) {
      const plan = this.field.struck(this.hitStart, deadAt, look, {
        angle, height: flight.endY, arrives: this.hitStart + this.flightMs * this.takeAt, dropped: !!outcome.dropped,
        visible: point => this.inShot(point),
      });
      if (plan) this.hitEnd.copy(plan.hands);
      this.catchRing.position.set(this.hitEnd.x, 0.04, this.hitEnd.z); this.catchRing.visible = true;
    } else if (along) {
      this.gathered = this.field.ground(this.hitStart, deadAt, look,
        { from: this.hitOrigin.clone(), to: this.hitEnd.clone(), flightMs: this.flightMs, four: outcome.runs === 4 },
        this.bowling ? this.bowlerAtRest() : undefined).gathered;
    } else this.field.struck(this.hitStart, deadAt, look);
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
    if (!this.bailsBrokeAt && this.ball.position.z <= 0) { this.bailsBrokeAt = now; this.onStumps?.(); }
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
      into.y = THREE.MathUtils.lerp(this.hitEnd.y, 0.12, fall * fall);
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
      // A ball he did not hold, and a ball that came off the body, both finish
      // on the ground in shot rather than winking out at the end of a flight.
      // Played on, the stumps go when the ball gets there, the same as any other
      // ball that finishes in them.
      if (result.wicketType === 'BOWLED') this.breakBails(now);
      // Caught, it stays in his hands: `render` carries it with him.
      // And along the ground, it lies where it stopped until somebody picks it up.
      this.ball.visible = t < 1 || !!result.dropped || !!result.hit || (result.wicketType === 'CAUGHT' && !result.edged) || this.gathered;
      // The streak behind the ball is most of what sells a struck shot. A ball
      // off the body is not a struck shot, and a tail behind it says it was.
      this.trail.forEach((dot, i) => {
        const behind = t - (i + 1) * 0.019;
        // Not behind a ball that has stopped: the streak is for one moving.
        dot.visible = !this.blaze && !result.hit && this.ball.visible && behind > 0 && t < 1;
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
    // A new innings starts the game's clock again from nought, and every plan
    // the field has is timed on the old one: put them back on their marks.
    if (now + 1 < this.clock) this.field.home();
    this.clock = now;
    this.crowd?.update(now);
    this.batter.update(now);
    this.field.update(now);
    // Held, the ball goes where his hands go: through the slide, and up with
    // him when he stands.
    const held = this.field.held(now);
    if (held && this.ball.visible) { this.ball.position.copy(held); this.groundShadow(this.ball.position, true); }
    this.traceBat(now);
    // Fielding the ball he bowled: driven by his plan, standing in his holder.
    const bowling = this.field.bowlerRoutine();
    if (bowling && now >= bowling.actions[0].start) showBody(this.bowlerHolder, this.bowler.figure, bowling.at(now));
    else if (this.bowling) {
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
    if (this.sky.cover !== this.cover.to) {
      const k = Math.min(1, Math.max(0, (now - this.cover.at) / COVER_MS));
      this.clouding(THREE.MathUtils.lerp(this.cover.from, this.cover.to, k * k * (3 - 2 * k)), k >= 1);
    }
    this.mute.value = Math.max(muteAt(now - this.celebratedAt, this.celebratedFor), powerAt(now - this.poweredAt));
    this.batter.drape(); this.bowler.figure.drape();
    if (this.cut) this.drawCutout();
    this.renderer.render(this.scene, this.camera);
    this.performanceReadout?.update(this.renderer);
  }
  inspectBatter() { return this.batter.inspect(); }
  /**
   * Where the bowler will be standing, and how, once his follow-through is
   * over — and when that is. The ball he has just bowled may be his to field.
   */
  private bowlerAtRest() {
    this.bowler.animate(ACTION_MS);
    const rest = bodyOf(this.bowler.figure.posed, this.bowler.root.position.x, this.bowler.root.position.z);
    // Back to where he really is this frame.
    this.bowler.animate(this.clock - this.actionStartedAt);
    return { rest, free: this.actionStartedAt + ACTION_MS };
  }

  /** Whether the field is back on its marks, so the next ball can be bowled. */
  get fieldSettled() { return this.field.settled(this.clock); }
  /** The field as of the last frame, for `field-check.mjs`. */
  get fieldState() {
    const state = this.field.state(this.clock);
    const hands = state.hands ? new THREE.Vector3(...state.hands) : null;
    return { ...state, ball: this.ball.visible ? this.ball.position.toArray().map(v => +v.toFixed(3)) : null, inShot: hands ? this.inShot(hands) : null };
  }
  /**
   * Whether a point on the field is on the screen this player is holding, and
   * clear of its edges and the scoreboard: a phone held upright sees a wedge
   * of the ground a third as wide as a laptop does, and a catch is put where
   * it can be seen.
   */
  private inShot(point: THREE.Vector3) {
    this.world.updateMatrixWorld();
    const p = this.world.localToWorld(point.clone()).project(this.camera);
    return p.z < 1 && Math.abs(p.x) < .8 && p.y > -.7 && p.y < .55;
  }
  inspectBowler() {
    const b = this.bowler.figure.inspect();
    return { z: this.bowler.root.position.z, handY: b.hands[1][1], handZ: b.hands[1][2], hipY: b.hip[1],
      // Across the pitch, in the stage's frame: where he runs in, and where the ball leaves his hand.
      x: this.bowlerHolder.scale.x * this.bowler.root.position.x, releaseX: this.releaseX, side: this.bowlerSide };
  }
  dispose() {
    this.performanceReadout?.dispose();
    this.resizeObserver.disconnect();
    const geometries = new Set<THREE.BufferGeometry>(); const mats = new Set<THREE.Material>();
    this.scene.traverse(object => { if (object instanceof THREE.Mesh) {
      if (object instanceof THREE.InstancedMesh) object.dispose();
      geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => mats.add(m));
    } });
    // The shared character primitives outlive any one scene; the rest is ours.
    // That now covers the figures too — bowler and fielders are built from one
    // set of geometries and one set of materials, and freeing either would take
    // them out from under the next scene to be built.
    Object.values(SHAPES).forEach(shape => geometries.delete(shape));
    FIGURE_ASSETS.shapes.forEach(shape => geometries.delete(shape));
    FIGURE_ASSETS.materials.forEach(material => mats.delete(material));
    // The sky's own, and what was painted for the ground.
    geometries.delete(this.sky.mesh.geometry); mats.delete(this.sky.mesh.material as THREE.Material); this.sky.dispose();
    this.environment.dispose(); this.textures.forEach(t => t.dispose()); this.wornPitch?.dispose();
    geometries.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); forgetMaterials(); this.renderer.dispose();
  }
}

/** The stroke `?actions=1` plays for each: the one each follows in an innings. */
const REHEARSED: Record<AfterBall, [ShotType, number, boolean, boolean]> = {
  admire: ['COVER_LONG_OFF', .54, false, false], watch: ['STRAIGHT', .54, true, false], twirl: ['LEG', 1.1, false, false],
  brush: ['LEG', .48, false, true], shadow: ['COVER_LONG_OFF', .54, false, false], scrub: ['COVER_LONG_OFF', .54, false, false],
  sky: ['COVER_LONG_OFF', .54, false, false], lean: ['STRAIGHT', .54, false, false], down: ['COVER_LONG_OFF', .54, false, false],
  ribs: ['DEFEND', .54, false, false], sting: ['DEFEND', .54, false, false], dazed: ['DEFEND', .54, false, false],
};
