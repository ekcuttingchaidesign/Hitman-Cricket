import * as THREE from 'three';
import { Batter, CHARGE_MEETS_AT } from '../entities/Batter';
import { BatterModel } from '../entities/BatterModel';
import { Bowler } from '../entities/Bowler';
import { Cricketer, FIGURE_ASSETS } from '../entities/Cricketer';
import { ADVANCE, FLAT_SWEEP, GAME, SHOT_ANGLES, SQUARE_DRIVE, SWEEP } from '../config/gameplay';
import { ballPosition } from '../game/DeliveryTrajectory';
import { KIT } from '../entities/Cricketer';
import { WHITES } from '../config/survive';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { flightOf } from './flight';
import { contactTexture, outfieldTexture, pitchTexture, skyDome } from './surfaces';
import { createVenue } from './venue';
import type { Delivery, ShotOutcome, ShotType } from '../game/types';

/** Where a beaten ball runs out of steam: just short of the stumps. */
const BEATEN_STOP = (GAME.releaseZ - 0.3) / (GAME.releaseZ - GAME.contactZ);
const colors = { grass: 0x668b49, grassLight: 0x70974e, pitch: 0xcbb283, navy: 0x19334a, orange: 0xf37943, white: 0xf8f1df, skin: 0xb77950 };
const materials = new Map<number, THREE.MeshStandardMaterial>();
function soft(color: number, roughness = 0.72) {
  const key = color + 0x1000000;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
  return materials.get(key)!;
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
  /** Everything painted at start-up, so `dispose` can let it go. */
  private painted: THREE.Texture[] = [];
  private environment: THREE.WebGLRenderTarget | null = null;
  /** The soft shade under each figure; the batter's two follow his feet. */
  private footShade: THREE.Mesh[] = [];
  private figureShade: { mesh: THREE.Mesh; of: THREE.Object3D }[] = [];
  private footPoints = [new THREE.Vector3(), new THREE.Vector3()];
  private disposed = false;
  private vignette: HTMLDivElement;
  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    const mobile = window.matchMedia('(pointer: coarse)').matches;
    // Held at 1.5 on a phone on purpose: a 3x screen at native resolution is
    // four times the pixels of this, and nothing below is worth that.
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Neutral rather than filmic: it rolls the highlights off without pulling
    // the navy, the orange and the green towards grey, which is what a
    // stylised ground is made of.
    // Filmic: it adds contrast through the midtones and lets the sun's side
    // of a figure bloom against its shaded side, which is most of what reads
    // as a photograph rather than a diagram.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.setClearColor(0xc9e6f4);
    container.prepend(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', '3D cricket ground viewed from behind the batter');
    // A vignette over the canvas and under the HUD: the edges of the frame
    // fall off a little, the way a lens does. It is a gradient in the page,
    // so it costs the renderer nothing.
    this.vignette = document.createElement('div');
    this.vignette.setAttribute('aria-hidden', 'true');
    this.vignette.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 78% 68% at 50% 46%, rgba(20,14,6,0) 58%, rgba(20,14,6,.30) 100%)';
    this.renderer.domElement.after(this.vignette);
    // The fog is the horizon's colour and starts beyond the stands, so the
    // outfield keeps its green and only the far trees go hazy.
    this.scene.fog = new THREE.Fog(0xd2e4ec, 95, 210);
    this.scene.add(skyDome(160));
    // Mirror the stage so the batter's leg side (negative X) reads left on screen.
    this.world.scale.x = -1; this.scene.add(this.world);
    this.camera.fov = 50;
    this.camera.position.set(0, 2.9, -5.15); this.camera.lookAt(0, 1.05, 9);
    // Light from the sky itself: the dome and a green floor are rendered once
    // into an environment map, so every surface is lit by blue from above and
    // green from below, and the helmet and grille have something to reflect.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.add(skyDome(100));
    const floor = new THREE.Mesh(new THREE.CircleGeometry(300, 32), new THREE.MeshBasicMaterial({ color: 0x4d8a34 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -2; envScene.add(floor);
    this.environment = pmrem.fromScene(envScene, 0.04);
    pmrem.dispose(); floor.geometry.dispose(); (floor.material as THREE.Material).dispose();
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.6;
    this.scene.add(new THREE.HemisphereLight(0xcfe0f5, 0x6f7f40, 1.15));
    // A warm sun high in front and to the off side, so the shadows fall
    // towards the camera and the batter's back is lit, as on the cover.
    const sun = new THREE.DirectionalLight(0xffd9a3, 3.9); sun.position.set(-13, 30, 11); sun.castShadow = true;
    sun.target.position.set(0, 0, 6); this.scene.add(sun.target);
    sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048); sun.shadow.camera.left = -28; sun.shadow.camera.right = 28;
    sun.shadow.camera.top = 35; sun.shadow.camera.bottom = -20; sun.shadow.normalBias = 0.025; sun.shadow.radius = 1.6;
    this.scene.add(sun);
    // A soft fill from behind the camera. With the sun in front, the side of
    // every figure the camera sees is the shaded one, and without this the
    // bowler is a silhouette against the boards.
    const fill = new THREE.DirectionalLight(0xf2e6d2, 0.7); fill.position.set(6, 14, -24); this.scene.add(fill);
    this.createGround();
    this.placeClouds();
    // The modelled batter arrives as a file and takes over from the primitives
    // when it lands; until then, and if it never does, the code-built one bats.
    BatterModel.load('models/batter.glb').then(model => { if (!this.disposed) this.batter.attachModel(model); }).catch(error => console.warn('batter model', error));
    this.wicket(0); this.wicket(18.7);
    this.catcher.root.position.set(12, 0, 20);
    this.world.add(this.batter.root, this.bowler.root, this.catcher.root);
    this.ball = new THREE.Mesh(SHAPES.ball, soft(0xe84829, 0.55));
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
    this.reset();
    this.resizeObserver = new ResizeObserver(this.resize); this.resizeObserver.observe(container); this.resize();
  }
  private createGround() {
    const anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    // One painted disc carries the mowing bands, the circles and the grain that
    // eleven flat discs and rings used to stand in for.
    const turf = outfieldTexture(70, anisotropy); this.painted.push(turf);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 96), new THREE.MeshStandardMaterial({ map: turf, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.035, 10); ground.receiveShadow = true; this.world.add(ground);
    // The strip is painted too — wear, footmarks and the creases in one image,
    // in place of a hundred small boxes. The plane sits a little proud of the
    // grass so the two never fight over a pixel.
    const strip = pitchTexture(2.8, 32, { fromBatterEnd: 11.7 + GAME.creaseZ, fromBowlerEnd: 32 - 11.7 - 18.7 + GAME.creaseZ, returnX: 1.1, returnLength: 1.5 }, anisotropy);
    this.painted.push(strip);
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 32), new THREE.MeshStandardMaterial({ map: strip, roughness: 0.98 }));
    pitch.rotation.x = -Math.PI / 2; pitch.position.set(0, 0.012, 4.3); pitch.receiveShadow = true; this.world.add(pitch);
    this.createStadium();
    // Feet want shade under them or a figure floats on the grass. A soft disc
    // under every figure does most of what an occlusion pass would, for one
    // small texture. The batter's two ride on his shoes; the rest follow the
    // figure they belong to.
    const contact = contactTexture(); this.painted.push(contact);
    const shade = (width: number, depth: number) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshBasicMaterial({ map: contact, color: 0x1d3020, transparent: true, opacity: 0.42, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.02; mesh.renderOrder = 1; this.world.add(mesh); return mesh;
    };
    this.footShade.push(shade(0.5, 0.68), shade(0.5, 0.68));
    this.figureShade.push({ mesh: shade(1.1, 0.9), of: this.bowler.root }, { mesh: shade(1.1, 0.9), of: this.catcher.root });
    // Fielders are scenery except the one scripted catcher.
    [[-18, 20], [22, 5], [-14, -4], [2, 35], [-7, 29]].forEach(([x, z]) => {
      const fielder = new Cricketer(); fielder.root.position.set(x, 0, z); fielder.root.rotation.y = Math.atan2(-x, -z); this.world.add(fielder.root);
      this.fielders.push(fielder);
      this.figureShade.push({ mesh: shade(1.2, 0.9), of: fielder.root });
    });
  }
  /**
   * The clouds are a modelled shape, placed round the sky in front of the
   * dome and behind the stands. It arrives as a file, so it is asked for and
   * placed when it lands; a sky with no clouds is the fallback, not an error.
   */
  private placeClouds() {
    new GLTFLoader().load('models/cloud.glb', gltf => {
      if (this.disposed) return;
      let shape: THREE.BufferGeometry | undefined;
      gltf.scene.traverse(object => { if (object instanceof THREE.Mesh && !shape) shape = object.geometry; });
      if (!shape) return;
      // One shape, many clouds: each is two or three copies of it at different
      // sizes and turns, sitting into one another, so no two read
      // as the same cloud. Smaller and more of them than one big one, at a
      // spread of heights so a phone's narrow band of sky always holds a few.
      const clusters = 18, perCluster = 3, count = clusters * perCluster;
      const clouds = new THREE.InstancedMesh(shape, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xb8c8d8, emissiveIntensity: 0.32, fog: false }), count);
      clouds.name = 'Clouds';
      clouds.frustumCulled = false;
      const dummy = new THREE.Object3D();
      let seed = 11;
      const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      for (let i = 0; i < clusters; i++) {
        // Spread across the half of the sky the camera can see, none of them
        // straight down the pitch where the pavilion and the flags already are.
        const angle = (-0.66 + (i + 0.5) / clusters * 1.32 + (rng() - 0.5) * 0.06) * Math.PI;
        const radius = 115 + rng() * 30, height = 17 + rng() * 14, width = 9 + rng() * 11;
        const centre = new THREE.Vector3(Math.sin(angle) * radius, height, 10 + Math.cos(angle) * radius);
        for (let j = 0; j < perCluster; j++) {
          const part = width * (j === 0 ? 1 : 0.55 + rng() * 0.4);
          dummy.position.copy(centre).add(new THREE.Vector3((rng() - 0.5) * width * 0.9, (rng() - 0.3) * width * 0.25, (rng() - 0.5) * width * 0.6));
          dummy.rotation.set(0, rng() * Math.PI * 2, 0);
          dummy.scale.set(part, part * (0.7 + rng() * 0.5), part * (0.8 + rng() * 0.4));
          dummy.updateMatrix(); clouds.setMatrixAt(i * perCluster + j, dummy.matrix);
        }
      }
      this.scene.add(clouds);
    }, undefined, () => { /* A clear sky. */ });
  }
  private createStadium() { this.world.add(createVenue(colors, GAME.boundaryRadius)); }
  private wicket(z: number) {
    // Stumps taper a little towards a domed top, in an ivory rather than a
    // paper white; the bails are the barrel shape of the real thing, in wood.
    // Both lie along their axes in the geometry, so a bail can be flung about
    // by `breakBails` with plain rotations.
    const ivory = soft(0xf6f1e4, 0.55);
    for (const x of [-0.145, 0, 0.145]) {
      const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, GAME.stumpHeight, 20), ivory);
      stump.position.set(x, GAME.stumpHeight / 2, z); stump.castShadow = true; this.world.add(stump);
      const top = new THREE.Mesh(SHAPES.ball, ivory); top.scale.set(0.018, 0.012, 0.018); top.position.set(x, GAME.stumpHeight, z); this.world.add(top);
    }
    const barrel = new THREE.LatheGeometry([[0.0055, 0], [0.0095, 0.012], [0.0135, 0.028], [0.0135, 0.082], [0.0095, 0.098], [0.0055, 0.11]].map(([r, y]) => new THREE.Vector2(r, y - 0.055)), 14);
    barrel.rotateZ(Math.PI / 2);
    for (const x of [-0.073, 0.073]) {
      const bail = new THREE.Mesh(barrel, soft(0xd9a548, 0.6));
      bail.position.set(x, GAME.stumpHeight + 0.02, z); bail.castShadow = true; this.world.add(bail);
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

  whites(on: boolean) {
    const kit = on ? WHITES : KIT;
    this.batter.dress(on);
    this.bowler.figure.dress(kit);
    // The fielding side too. Leaving them in coloured clothing while the two
    // men in the middle wore whites read as a bug rather than as a mode.
    this.catcher.dress(kit);
    for (const fielder of this.fielders) fielder.dress(kit);
  }

  reset() {
    this.hitOutcome = null; this.bailsBrokeAt = 0; this.flightMs = GAME.hitAnimationMs; this.hitHeight = 0; this.dropAt = 0; this.bounceAt = 0; this.takeAt = 1; this.ball.visible = false; this.shadow.visible = false; this.bounceRing.visible = false; this.catchRing.visible = false; this.chargeRing.visible = false;
    this.trail.forEach(t => t.visible = false); this.batter.reset();
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
        dot.visible = !result.hit && this.ball.visible && behind > 0;
        if (dot.visible) this.struckAt(behind, dot.position);
      });
    } else {
      this.trail.forEach(dot => dot.visible = false);
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
    // The shade under the feet goes where the feet are, and fades as one lifts.
    this.batter.contactFeet(this.footPoints);
    this.footPoints.forEach((point, i) => {
      this.world.worldToLocal(point);
      const shade = this.footShade[i]; shade.position.x = point.x; shade.position.z = point.z;
      shade.visible = this.batter.root.visible;
      (shade.material as THREE.MeshBasicMaterial).opacity = 0.42 * Math.max(0, 1 - Math.max(0, point.y - 0.09) * 2.5);
    });
    for (const { mesh, of } of this.figureShade) { mesh.position.x = of.position.x; mesh.position.z = of.position.z; mesh.visible = of.visible; }
    this.renderer.render(this.scene, this.camera);
  }
  inspectBatter() { return this.batter.inspect(); }
  inspectBowler() {
    const b = this.bowler.figure.inspect();
    return { z: this.bowler.root.position.z, handY: b.hands[1][1], handZ: b.hands[1][2], hipY: b.hip[1] };
  }
  dispose() {
    this.disposed = true;
    this.vignette.remove();
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
    geometries.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); materials.clear();
    this.painted.forEach(t => t.dispose()); this.environment?.dispose();
    this.renderer.dispose();
  }
}
