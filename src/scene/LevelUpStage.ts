import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { LevelUpFx } from '../game/levelup';

/**
 * Level Up's ground: the innings card's chevrons, stood on end and cast in the
 * rung's metal, rising through a dark room that goes on into fog.
 *
 * One instanced mesh, so one draw call however many there are. They rush up
 * past the camera for the first second — the arrows that uncover LEVEL UP —
 * then drift, turning slowly, for as long as the screen is up. The near ones
 * keep to the sides and the middle is left to the far ones, which the fog
 * has nearly taken, so the card and the words in front of the middle are
 * never read through a bright shape. At the turn they surge and catch the
 * light once. STAR and HITMAN bring dust of their metal, out of focus.
 *
 * The camera leans with the card (`lean`), so the room moves behind it the way
 * a room does behind something held up to the eye.
 */
export interface StageMetal { base: string; light: string; deep: string }

/** The up-chevron in the band's proportions, a unit wide: 144 by 104, arms 46 thick. */
const UP: readonly [number, number][] = [[0, 104], [0, 58], [72, 0], [144, 58], [144, 104], [72, 46]];

type Rider = { x: number; y: number; z: number; speed: number; spin: number; turn: number; tilt: number; size: number };

/** How tall the column they rise through is, in world units. */
const SPAN = 22;

export class LevelUpStage {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, .1, 80);
  private readonly mesh: THREE.InstancedMesh;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly dust: THREE.Points | null = null;
  private readonly riders: Rider[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly environment: THREE.Texture;
  private surgeAt = -1e9;
  private lastAt = 0;
  private aim = { x: 0, y: 0 };

  constructor(fx: LevelUpFx, metal: StageMetal) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.renderer.setClearColor(0x0b0c0e, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.5;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'lu-3d';
    this.canvas.setAttribute('aria-hidden', 'true');

    this.scene.fog = new THREE.Fog(0x0b0c0e, 13, 32);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), .02).texture;
    pmrem.dispose();
    this.scene.environment = this.environment;
    this.camera.position.set(0, 0, 12);

    const shape = new THREE.Shape(UP.map(([x, y]) => new THREE.Vector2((x - 72) / 144, (52 - y) / 144)));
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: .16, bevelEnabled: true, bevelThickness: .03, bevelSize: .025, bevelSegments: 2, curveSegments: 1,
    });
    geometry.center();
    this.material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(metal.light).lerp(new THREE.Color(metal.base), .45), metalness: .85, roughness: .22,
      emissive: new THREE.Color(metal.base), emissiveIntensity: .18, envMapIntensity: 1.8,
    });
    const count = fx.chevrons;
    this.mesh = new THREE.InstancedMesh(geometry, this.material, count);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    for (let i = 0; i < count; i++) this.riders.push(this.rider(i, Math.random() * SPAN - SPAN / 2 - SPAN * .6));

    const key = new THREE.DirectionalLight(new THREE.Color(metal.light), 3);
    key.position.set(-4, 6, 8);
    const rim = new THREE.DirectionalLight(0xffffff, 1.1);
    rim.position.set(5, -2, -6);
    this.scene.add(key, rim, new THREE.AmbientLight(0xffffff, .15));

    if (fx.dust) {
      const n = fx.dust * 8, positions = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        positions[i * 3] = (Math.random() - .5) * 22;
        positions[i * 3 + 1] = (Math.random() - .5) * SPAN;
        positions[i * 3 + 2] = -Math.random() * 16 + 2;
      }
      const points = new THREE.BufferGeometry();
      points.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      this.dust = new THREE.Points(points, new THREE.PointsMaterial({
        color: new THREE.Color(metal.light), size: .09, map: bokeh(), transparent: true, opacity: .55,
        depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
      }));
      this.scene.add(this.dust);
    }
  }

  /**
   * One chevron. Anything nearer than the fog stands clear of the middle of
   * the screen as the camera sees it at its depth — the middle is where the
   * card and the words are — and only the far ones, which the fog has nearly
   * taken, may pass behind them.
   */
  private rider(i: number, y: number): Rider {
    const z = -Math.random() * 16 + 3.5;
    const half = (this.camera.position.z - z) * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect;
    const side = i % 2 ? 1 : -1;
    const x = z < -9 ? (Math.random() - .5) * 2 * half : side * half * (.62 + Math.random() * .5);
    return {
      x, y, z,
      speed: .5 + Math.random() * .7,
      spin: (Math.random() - .5) * .5,
      turn: Math.random() * Math.PI * 2,
      tilt: (Math.random() - .5) * .5,
      size: z > -3 ? 1 + Math.random() * .8 : 1 + Math.random() * 1.5,
    };
  }

  /** The column's own rhythm: a rush up past the camera for the first second and a bit, then a drift. */
  private pace(t: number, now: number) {
    const rush = 1 + 22 * Math.max(0, 1 - t / 1300) ** 2;
    const surge = 1 + 9 * Math.max(0, 1 - (now - this.surgeAt) / 700) ** 2;
    return rush * surge;
  }

  /** The turn: the column surges and the metal catches the light once. */
  surge(now: number) { this.surgeAt = now; }

  /** Where the card leans, nought either way at rest; the camera follows it a little. */
  lean(x: number, y: number) { this.aim.x = x; this.aim.y = y; }

  size(width: number, height: number) {
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // A tall phone sees the column; a wider screen stands further back from it.
    this.camera.fov = width / height > .7 ? 42 : 50;
    this.camera.updateProjectionMatrix();
    // Where the clear column is depends on the screen's shape, so the room is laid out again for it.
    this.riders.forEach((one, i) => Object.assign(one, this.rider(i, one.y)));
  }

  /** One frame, at `t` ms since the screen went up; `still` draws the column where it stands. */
  render(t: number, now: number, still = false) {
    const dt = Math.min(.05, (now - (this.lastAt || now)) / 1000); this.lastAt = now;
    const pace = still ? 0 : this.pace(t, now);
    this.riders.forEach((one, i) => {
      if (!still) {
        one.y += one.speed * pace * dt;
        one.turn += one.spin * dt;
        if (one.y > SPAN / 2) Object.assign(one, this.rider(i, -SPAN / 2 - Math.random() * 2));
      }
      this.dummy.position.set(one.x, one.y, one.z);
      this.dummy.rotation.set(one.tilt + Math.sin(now / 2400 + i) * .12, one.turn, Math.sin(now / 3100 + i * 1.7) * .08);
      // Stretched along the way it is going while it rushes, as fast things are.
      const stretch = 1 + Math.min(.9, (pace - 1) * .05);
      this.dummy.scale.set(one.size, one.size * stretch, one.size);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    const glow = Math.max(0, 1 - (now - this.surgeAt) / 900);
    this.material.emissiveIntensity = .18 + glow * 1.4;
    if (this.dust && !still) {
      this.dust.position.y = ((t / 1000) * .35) % 2;
      this.dust.rotation.y = t / 40000;
    }
    this.camera.position.x += (this.aim.x * 1.2 - this.camera.position.x) * .06;
    this.camera.position.y += (-this.aim.y * .8 - this.camera.position.y) * .06;
    this.camera.lookAt(0, 0, -6);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    if (this.dust) { this.dust.geometry.dispose(); (this.dust.material as THREE.PointsMaterial).map?.dispose(); (this.dust.material as THREE.Material).dispose(); }
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/** A soft round mote, white at the middle and nothing at the edge. */
function bokeh(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const fill = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  fill.addColorStop(0, '#ffffff'); fill.addColorStop(.35, '#ffffffaa'); fill.addColorStop(1, '#ffffff00');
  g.fillStyle = fill; g.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
