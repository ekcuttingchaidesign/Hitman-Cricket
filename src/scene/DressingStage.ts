import * as THREE from 'three';
import { Batter, STROKE_DURATION_MS } from '../entities/Batter';
import { bladeGeometry, gripGeometry } from '../entities/batGeometry';
import { willowMaterial } from '../entities/characterMaterials';
import { batSheet } from '../entities/batSkins';
import { GAME } from '../config/gameplay';
import type { ShotType } from '../game/types';
import type { BatSkin, Outfit } from '../game/dressing';
import { SUPER10_GLOVES, type GloveDesign } from '../entities/gloves';
import type { Super10Kit } from '../game/super10-kits';

/** A kit the stage can put on him: one of the room's own, or a Super10 team's, printed. */
export type StageKit = Outfit | Super10Kit;
const printOf = (kit: StageKit) => 'print' in kit ? kit.print : null;
/** A Super10 team's kit is shown with its own gloves and pads, and the opener's number on the back. */
export const guardFor = (kit: StageKit, guard?: GloveDesign<string>): GloveDesign<string> | undefined => 'print' in kit ? SUPER10_GLOVES[kit.guard] : guard;
const SHOWN_NUMBER = '10';

/**
 * The Dressing Room's stage: the batter, or a bat on its own, turning on a
 * pedestal under a spotlight in a dark room.
 *
 * It is the game's own batter and the game's own bat, so what is on show is
 * exactly what goes out to bat. It draws into its own canvas with its own
 * renderer, made when the room opens and thrown away when it closes, so the
 * ground behind it is never asked to share a frame.
 */
/** What is on the pedestal: the batter in a kit, a bat on the stand, or the batter near to in his guard, the gloves and the pads. */
export type StageView = 'kit' | 'bat' | 'guard';

/** The pedestal's front edge on the floor: the lowest thing on the stage as the camera sees it. */
const PEDESTAL_FOOT = new THREE.Vector3(0, 0, .72);
/** The bat's size in the shelf's pictures, whatever its size on the stand. */
const BAT_PICTURE_SCALE = 1.45;
/** How high the bat on the stand floats over the floor, at its toe: just over the pedestal's top. */
const BAT_TOE = .21;
/** The room's camera: level, eye high, this far out. */
const CAMERA = { distance: 8.1, eye: 1.3 };
/**
 * The camera at its nearest, as a focal length in design pixels: 30 degrees
 * across the 874-high phone the room was drawn on. A taller space than that
 * leaves the batter at this size rather than drawing him bigger.
 */
/** The Dressing Room's corridor, already lifted, softened and faded by depth. */
const ROOM_BACKDROP = new URL('../assets/dressing/room.webp', import.meta.url).href;
/** The guard's view: him turned a shade off the bowler's view, so the backs of both gloves show over the pads, the whole of him in his kit. */
const GUARD_FACE = .35;
/**
 * The guard's view is framed nearer than the kit's: from his helmet to his
 * shoes rather than to the pedestal's front edge, with the headroom the kit's
 * view leaves over him given up, and allowed this much nearer than the kit's
 * nearest, so the gloves and the pads can be looked at while the kit still
 * shows whole.
 */
const GUARD_NEARER = 1.35;
/** The headroom the kit's view leaves over his helmet. */
const CROWN_ROOM = .06;
const NEAREST_FOCAL = 437 / Math.tan(THREE.MathUtils.degToRad(15));

/**
 * A white texture whose only change is how see-through it is, made straight
 * into memory. The room's lights used to be drawn through a canvas, which
 * keeps colour already multiplied by its alpha and dithers its gradients; at
 * the soft edge of a glow, where alpha is a level or two, the colour came back
 * out of that black or tinted, and a phone's GPU drew it as speckle all
 * through the light. Here the colour is white everywhere and nothing is
 * multiplied, so there is nothing to come back wrong.
 */
function alphaTexture(size: number, alpha: (x: number, y: number) => number) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = Math.round(Math.min(1, Math.max(0, alpha((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1))) * 255);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}
/** A gradient's value `at` along it, from stops of [where, value], straight between them and flat beyond. */
function along(stops: readonly (readonly [number, number])[], at: number) {
  if (at <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [a, va] = stops[i - 1], [b, vb] = stops[i];
    if (at <= b) return va + (vb - va) * (at - a) / (b - a);
  }
  return stops[stops.length - 1][1];
}

/** A soft round light: `inner` at the middle to `outer` at the edge; or, `ring`, a band of light round an empty middle. */
function glowTexture(inner = 1, outer = 0, ring = false) {
  // The ring's band runs from 70 of 128 out to the edge, brightest a third of the way across it.
  const stops = ring ? [[0, 0], [.35, .9], [.55, .25], [1, 0]] as const : [[0, inner], [1, outer]] as const;
  return alphaTexture(256, (x, y) => {
    const r = Math.hypot(x, y);
    if (!ring) return along(stops, r);
    return r < 70 / 128 ? 0 : along(stops, (r - 70 / 128) / (1 - 70 / 128));
  });
}

/** Light breaking out behind an unlock: eighteen rays, soft where they meet and soft at their ends. */
function raysTexture() {
  const fade = [[0, 0], [.14, .6], [.3, 1], [.62, .7], [1, 0]] as const, rays = 18, half = 22 / 256;
  return alphaTexture(512, (x, y) => {
    const r = Math.hypot(x, y);
    if (r >= 1) return 0;
    // Into the nearest ray's own frame: along it, and across it.
    const a = Math.atan2(y, x), step = Math.PI * 2 / rays, turn = Math.round(a / step) * step;
    const along_ = r * Math.cos(a - turn), across = Math.abs(r * Math.sin(a - turn));
    // Inside the wedge, its edge softened over a pixel; brightest at the middle and gone at the rim.
    const inside = Math.min(1, Math.max(0, (half * along_ - across) * 256 + .5));
    return inside * .55 * (1 - along_) * along(fade, r);
  });
}

/**
 * An unlock on the stage. A bat comes up off the stand and across the screen,
 * bare willow, and a scan runs down it handle to toe leaving its stickers
 * behind; a kit is a ring of light that runs down the batter from helmet to
 * boots, the new kit above it and the old one below. Then the reveal.
 */
export type Moment = { kind: 'bat'; bat: BatSkin } | { kind: 'kit'; from: StageKit; to: StageKit; bat: BatSkin; guard?: GloveDesign };
/** When each moment's reveal comes, from its start. */
export const REVEAL_MS = { bat: 1650, kit: 2280 } as const;
/** The turn of the pedestal at which the celebration faces the camera. */
const KIT_FACE = -1.5;

/** A bat standing on its own: the grip, the collar and a blade wearing its sheet. */
class ShowBat {
  readonly root = new THREE.Group();
  private readonly grip = new THREE.MeshStandardMaterial({ color: '#FF2E88', roughness: .9 });
  readonly blade = willowMaterial(new THREE.MeshStandardMaterial({ color: 0xe0b77a, roughness: .55 }));
  private asked = 0;
  constructor() {
    const grip = new THREE.Mesh(gripGeometry(), this.grip); grip.castShadow = true; this.root.add(grip);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, 1, 24), new THREE.MeshStandardMaterial({ color: '#1a1d21', roughness: .9 }));
    tube.scale.set(.046, .018, .046); tube.position.y = -.117; this.root.add(tube);
    const blade = this.bladeMesh = new THREE.Mesh(bladeGeometry(), this.blade); blade.castShadow = true; this.root.add(blade);
  }
  /** The scan, where it has got to down the blade: nought at the handle, one at the toe; past one, all revealed. */
  readonly reveal = { uReveal: { value: 2 }, uGlow: { value: new THREE.Color('#46D2FF') }, uWillow: { value: new THREE.Color('#e0b77a') } };
  private bladeMesh!: THREE.Mesh;
  /** The blade bare willow above nothing and its stickers behind a moving scan line, with a honeycomb of light on the line. */
  readonly revealing = (() => {
    const material = willowMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .5 }));
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.reveal);
      shader.fragmentShader = 'uniform float uReveal; uniform vec3 uGlow; uniform vec3 uWillow;\n' + shader.fragmentShader
        .replace('#include <map_fragment>', `
          vec4 sampledDiffuseColor = texture2D(map, vMapUv);
          float toe = 1.0 - vMapUv.y;
          float shown = smoothstep(uReveal + .004, uReveal - .004, toe);
          diffuseColor.rgb *= mix(uWillow, sampledDiffuseColor.rgb, shown);
          vec2 hp = vec2(vMapUv.x * 720.0, vMapUv.y * 1400.0) / 30.0;
          vec2 hr = vec2(1.0, 1.7320508), hh = hr * .5;
          vec2 ha = mod(hp, hr) - hh, hb = mod(hp - hh, hr) - hh;
          vec2 hg = dot(ha, ha) < dot(hb, hb) ? ha : hb;
          float hd = max(dot(abs(hg), normalize(vec2(1.0, 1.7320508))), abs(hg.x));
          float lines = smoothstep(.40, .47, hd);
          float dist = toe - uReveal;
          float band = smoothstep(.16, 0.0, dist) * smoothstep(-.05, 0.0, dist);
          float trail = smoothstep(-.22, 0.0, dist) * step(dist, 0.0);
          float scanGlow = band * (.25 + 1.6 * lines) + trail * lines * .35 + smoothstep(.012, 0.0, abs(dist)) * 2.0;`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += uGlow * scanGlow;');
    };
    return material;
  })();
  /** The blade worn for an unlock (the scan), or its own again. */
  scanning(on: boolean) { this.bladeMesh.material = on ? this.revealing : this.blade; }
  setGrip(colour: string) { this.grip.color.set(colour); }
  /** Takes up a bat; its sheet arrives when it has loaded, unless another bat was asked for first. */
  hold(bat: BatSkin): Promise<void> {
    const asked = ++this.asked;
    this.grip.color.set(bat.grip);
    return batSheet(bat.id).then(sheet => {
      if (asked !== this.asked) return;
      this.blade.map = sheet; this.blade.color.set(sheet ? 0xffffff : 0xe0b77a); this.blade.needsUpdate = true;
      this.revealing.map = sheet; this.revealing.needsUpdate = true;
    });
  }
}

export class DressingStage {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 402 / 874, .1, 60);
  private readonly turntable = new THREE.Group();
  private readonly holder = new THREE.Group();
  private readonly batter = new Batter();
  private readonly showBat = new ShowBat();
  private readonly glow = new THREE.Color('#ED7044');
  private readonly rimMaterial = new THREE.MeshBasicMaterial({ color: '#ED7044' });
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  private readonly halo: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly motes: THREE.Points;
  private view: StageView = 'kit';
  private spin = 0; private spinV = .35; private dragging = false; private lastX = 0; private idleAt = 0; private downAt = 0; private moved = 0;
  private clock = 0; private swingEnd = 0; private flashAt = -1e9; private last = 0; private raf = 0;
  private readonly reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly resize = new ResizeObserver(() => this.fit());
  private readonly pedestalParts: THREE.Object3D[] = [];
  private readonly rays: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly revealKey = new THREE.DirectionalLight('#fff4e6', 0);
  private readonly revealRim = new THREE.DirectionalLight('#46D2FF', 0);
  /** The kit scan: where the ring is, its colour, and each material's old colour below it. */
  private readonly scan = { uScanY: { value: -10 }, uScanGlow: { value: new THREE.Color('#25C28A') } };
  private readonly scanRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  private readonly scanDisc: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private moment: { what: Moment; at: number; revealed: boolean; onReveal: () => void } | null = null;
  /** The top of the batter at his guard, with a little air over it: what the camera fits under the name. */
  private readonly crown: number;
  /** The soles of his shoes, their toes towards the camera: the lowest thing in the guard's view. */
  private readonly soles: THREE.Vector3;
  /** The bat on the stand, upright over the pedestal's middle and turning: from just over it to the batter's crown. */
  private readonly batShow: { y: number; scale: number };

  /**
   * `room`: the stage stands in the Dressing Room itself, in front of its
   * corridor of lockers (`src/assets/dressing/room.webp`, baked by
   * `scripts/dressing-backdrop.mjs`) rather than the warm wall the unlocks
   * play against.
   */
  /** Frames drawn in a row with the canvas off the page. */
  private offPage = 0;

  constructor({ room = false }: { room?: boolean } = {}) {
    this.canvas = document.createElement('canvas'); this.canvas.className = 'dr-stage';
    this.canvas.setAttribute('aria-label', 'Your batter on a turning pedestal; drag to turn him, tap to play a shot');
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = this.scene; scene.background = new THREE.Color('#06080b');

    // The room: a warm wall of light behind, a dark floor with a pool on it.
    const back = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: glowTexture(.55, 0), transparent: true, depthWrite: false, color: '#3a2a20' }));
    back.position.set(0, 1.6, -3.2); scene.add(back);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshStandardMaterial({ color: '#0b0e12', roughness: .55, metalness: .2 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    if (room) {
      // The corridor is painted behind everything; the floor only catches his shadow on it.
      back.visible = false;
      (floor as THREE.Mesh).material = new THREE.ShadowMaterial({ opacity: .6 });
      this.backdrop.src = ROOM_BACKDROP;
      this.backdrop.onload = () => this.paintBackdrop();
    }
    const pool = new THREE.Mesh(new THREE.CircleGeometry(2.6, 64), new THREE.MeshBasicMaterial({ map: glowTexture(.32, 0), transparent: true, depthWrite: false, color: '#ffe2bd' }));
    pool.rotation.x = -Math.PI / 2; pool.position.y = .002; scene.add(pool);

    // The pedestal, its rim lit in the colour of whatever is on it.
    scene.add(this.turntable);
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(.66, .72, .16, 96), new THREE.MeshStandardMaterial({ color: '#171c22', roughness: .32, metalness: .75 }));
    pedestal.position.y = .08; pedestal.castShadow = pedestal.receiveShadow = true; this.turntable.add(pedestal); this.pedestalParts.push(pedestal);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(.6, .6, .012, 96), new THREE.MeshStandardMaterial({ color: '#232a33', roughness: .45, metalness: .5 }));
    top.position.y = .166; top.receiveShadow = true; this.turntable.add(top); this.pedestalParts.push(top);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.645, .009, 8, 160), this.rimMaterial); rim.rotation.x = Math.PI / 2; rim.position.y = .163; scene.add(rim);
    this.ringMaterial = new THREE.MeshBasicMaterial({ map: glowTexture(1, 0, true), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ED7044' });
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), this.ringMaterial); ring.rotation.x = -Math.PI / 2; ring.position.y = .03; scene.add(ring);
    this.pedestalParts.push(rim, ring);
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ map: glowTexture(.5, 0), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ED7044', opacity: .45 }));
    this.halo.position.set(0, 1.0, -1.2); scene.add(this.halo);

    // A spot from above with a beam to see, a cool rim from behind, a warm kick, a little front fill.
    scene.add(new THREE.HemisphereLight('#c9d6ff', '#140f0b', .35));
    const spot = new THREE.SpotLight('#fff1dc', 70, 12, .36, .55, 1.6); spot.position.set(0, 6.2, .9); spot.target.position.set(0, .8, 0);
    spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -.0004; scene.add(spot, spot.target);
    const rimL = new THREE.DirectionalLight('#7fb2ff', 1.6); rimL.position.set(-3, 2.4, -3); scene.add(rimL);
    const rimR = new THREE.DirectionalLight('#ffb27a', 1.1); rimR.position.set(3, 1.8, -2.4); scene.add(rimR);
    const front = new THREE.DirectionalLight('#ffffff', .55); front.position.set(.5, 1.6, 4); scene.add(front);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.06, 1.25, 6, 64, 1, true), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color('#fff0d8') }, strength: { value: .16 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 color; uniform float strength; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float edge=pow(abs(dot(vN,vV)),2.0); float fall=smoothstep(0.0,0.85,vUv.y); gl_FragColor=vec4(color, strength*edge*fall); }',
    }));
    beam.position.set(0, 3.15, .2); scene.add(beam);
    // Dust in the beam.
    this.motes = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: .022, color: '#ffe6c4', transparent: true, opacity: .7, depthWrite: false, blending: THREE.AdditiveBlending }));
    const points: number[] = [];
    for (let i = 0; i < 90; i++) { const r = Math.random() * .9, a = Math.random() * Math.PI * 2; points.push(Math.cos(a) * r, .3 + Math.random() * 3.2, Math.sin(a) * r * .6); }
    this.motes.geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); scene.add(this.motes);

    // For the unlocks: lights for a bat out of the spotlight, rays behind, the ring that scans a kit.
    this.revealKey.position.set(1.6, 4.2, 7.5); this.revealKey.target.position.set(.3, 1.3, 2.6); scene.add(this.revealKey, this.revealKey.target);
    this.revealRim.position.set(-2.5, 2.5, -1); this.revealRim.target.position.set(.3, 1.3, 2.6); scene.add(this.revealRim, this.revealRim.target);
    this.rays = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 5.5), new THREE.MeshBasicMaterial({ map: raysTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    this.rays.position.set(0, 1.1, -.8); scene.add(this.rays);
    // Gone before they reach the floor, which would otherwise cut them off in a hard line.
    this.rays.material.onBeforeCompile = shader => {
      shader.vertexShader = 'varying float vWorldY;\n' + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWorldY = (modelMatrix * vec4(transformed, 1.0)).y;');
      shader.fragmentShader = 'varying float vWorldY;\n' + shader.fragmentShader.replace('#include <opaque_fragment>', 'diffuseColor.a *= smoothstep(.15, 1.1, vWorldY);\n#include <opaque_fragment>');
    };
    this.scanRing = new THREE.Mesh(new THREE.TorusGeometry(.46, .007, 8, 120), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scanRing.rotation.x = Math.PI / 2; scene.add(this.scanRing);
    this.scanDisc = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: glowTexture(1, 0, true), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.scanDisc.rotation.x = -Math.PI / 2; scene.add(this.scanDisc);
    for (const material of this.batter.kitMaterials) {
      const uOld = { value: new THREE.Color() }; material.userData.old = uOld.value;
      // Added to the hook already there, the kit's print (`printable`), never in its place:
      // the print's lines go in after the scan's, so the scan lays the old kit's plain colour over it.
      const printing = material.onBeforeCompile.bind(material);
      material.onBeforeCompile = (shader, renderer) => {
        Object.assign(shader.uniforms, this.scan, { uOld });
        shader.vertexShader = 'varying float vScanY;\n' + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vScanY = (modelMatrix * vec4(transformed, 1.0)).y;');
        shader.fragmentShader = 'uniform float uScanY; uniform vec3 uScanGlow; uniform vec3 uOld; varying float vScanY;\n' + shader.fragmentShader
          .replace('#include <color_fragment>', '#include <color_fragment>\n float scanD = vScanY - uScanY; diffuseColor.rgb = mix(uOld, diffuseColor.rgb, smoothstep(-.006, .006, scanD));')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += uScanGlow * (smoothstep(.16, 0.0, scanD) * step(0.0, scanD) * .45 + smoothstep(.018, 0.0, abs(scanD)) * 2.2);');
        printing(shader, renderer);
      };
      material.needsUpdate = true;
    }

    // The batter, standing on the pedestal as he stands at the crease; and the bat on its own.
    this.turntable.add(this.holder); this.holder.add(this.batter.root);
    this.holder.position.set(-GAME.stanceX - .02, .172, -GAME.stanceZ + .02);
    this.batter.root.traverse(object => { if ((object as THREE.Mesh).isMesh) object.castShadow = object.receiveShadow = true; });
    this.batter.reset(); this.batter.update(0); this.batter.drape();
    this.scene.updateMatrixWorld(true);
    const stands = new THREE.Box3().setFromObject(this.holder);
    this.crown = stands.max.y + CROWN_ROOM;
    this.soles = new THREE.Vector3(0, stands.min.y, .2);
    this.showBat.root.rotation.order = 'ZYX'; this.showBat.root.updateMatrixWorld(true);
    const bat = new THREE.Box3().setFromObject(this.showBat.root), scale = (this.crown - .03 - BAT_TOE) / (bat.max.y - bat.min.y);
    this.batShow = { scale, y: BAT_TOE - bat.min.y * scale };
    scene.add(this.showBat.root); this.showBat.root.scale.setScalar(scale); this.showBat.root.visible = false;

    this.canvas.addEventListener('pointerdown', this.down);
    this.canvas.addEventListener('pointermove', this.move);
    this.canvas.addEventListener('pointerup', this.up);
    this.canvas.addEventListener('pointercancel', this.up);
    this.resize.observe(this.canvas);
    this.raf = requestAnimationFrame(this.tick);
  }

  /** The batter in a kit, holding a bat, in a guard (left as it is when none is given). */
  dress(outfit: StageKit, bat: BatSkin, guard?: GloveDesign<string>) {
    this.put(outfit);
    const gloves = guardFor(outfit, guard);
    if (gloves) this.batter.wearGloves(gloves);
    void batSheet(bat.id).then(sheet => this.batter.holdBat(bat.grip, sheet));
  }
  /** A kit's colours on him, and its print where it has one. */
  private put(kit: StageKit) {
    this.batter.wear(kit);
    const print = printOf(kit);
    this.batter.printKit(print, print ? SHOWN_NUMBER : null);
  }
  /** A bat on its own, on the stand. */
  showcase(bat: BatSkin) { void this.showBat.hold(bat); }
  /**
   * Which of the three is on the pedestal, and the colour the room is lit in.
   * The guard is the batter whole, framed a little nearer than the kit (helmet
   * to shoes), held facing the camera as the bowler sees him so the backs of
   * both gloves show over the pads against the kit; a drag still turns him.
   */
  show(view: StageView, glow: string) {
    this.endMoment();
    if (view === 'guard' && this.view !== 'guard') { this.spin = 0; this.spinV = 0; this.idleAt = performance.now(); }
    this.view = view; this.glow.set(glow);
    this.holder.visible = view !== 'bat'; this.showBat.root.visible = view === 'bat';
    this.flashAt = performance.now();
    this.fit();
  }
  /** Where his hands are now, in the world. */
  private hands() {
    const at = new THREE.Vector3();
    for (const name of ['Left top glove — overhand', 'Right bottom glove — underhand']) at.add(this.batter.root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3()));
    return at.multiplyScalar(.5);
  }

  /**
   * Plays an unlock. `onReveal` is called the moment it lands, for the words
   * and the confetti over the stage. The stage stays in the moment until the
   * room is shown again.
   */
  play(what: Moment, onReveal: () => void) {
    this.moment = { what, at: performance.now(), revealed: false, onReveal };
    this.spin = 0; this.spinV = 0; this.glow.set(what.kind === 'bat' ? what.bat.glow : what.from.glow);
    this.batter.reset();
    if (what.kind === 'bat') {
      this.holder.visible = false; this.showBat.root.visible = true;
      void this.showBat.hold(what.bat);
      this.showBat.scanning(true); this.showBat.setGrip('#B9C2CA');
      this.showBat.reveal.uReveal.value = -.08; this.showBat.reveal.uGlow.value.set(what.bat.glow);
    } else {
      this.holder.visible = true; this.showBat.root.visible = false;
      // The scan sweeps the new kit, print and all, up over the old one's colours.
      this.put(what.to);
      const gloves = guardFor(what.to, what.guard);
      if (gloves) this.batter.wearGloves(gloves);
      void batSheet(what.bat.id).then(sheet => this.batter.holdBat(what.bat.grip, sheet));
      const [shirt, helmet, trousers, trim, number] = this.batter.kitMaterials;
      const from = what.from;
      for (const [material, colour] of [[shirt, from.shirt], [helmet, from.helmet], [trousers, from.trousers], [trim, from.trim], [number, from.number]] as const)
        (material.userData.old as THREE.Color).set(colour);
      this.scan.uScanY.value = 10; this.scan.uScanGlow.value.set(what.to.glow);
      this.scanRing.material.color.set(what.to.glow); this.scanDisc.material.color.set(what.to.glow);
    }
  }

  /** Back from a moment to the room. */
  private endMoment() {
    if (!this.moment) return;
    this.moment = null;
    this.showBat.scanning(false);
    this.showBat.root.scale.setScalar(this.batShow.scale);
    for (const part of this.pedestalParts) part.visible = true;
    this.scan.uScanY.value = -10; this.scanRing.material.opacity = 0; this.scanDisc.material.opacity = 0;
    this.rays.material.opacity = 0; this.revealKey.intensity = 0; this.revealRim.intensity = 0;
    this.fit();
  }

  /**
   * Small pictures of every kit and bat, off the same models, for the shelf.
   * Drawn by a renderer of its own, made for the job and let go after it.
   */
  async thumbnails(outfits: readonly StageKit[], bats: readonly BatSkin[], holding: BatSkin, guards: readonly GloveDesign[] = [], wearing?: GloveDesign): Promise<Record<string, string>> {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(2); renderer.setSize(84, 84); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight('#ffffff', '#30261c', 1.3));
    const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(1, 2, 3); scene.add(key);
    const rim = new THREE.DirectionalLight('#9cc4ff', 1.4); rim.position.set(-2, 1, -2); scene.add(rim);
    const camera = new THREE.PerspectiveCamera(26, 1, .1, 20);
    const shot = (object: THREE.Object3D, at: THREE.Vector3, distance: number, yaw: number) => {
      const parent = object.parent; scene.add(object);
      camera.position.set(at.x + Math.sin(yaw) * distance, at.y + .1, at.z + Math.cos(yaw) * distance); camera.lookAt(at);
      renderer.render(scene, camera); const url = renderer.domElement.toDataURL('image/png');
      parent?.add(object); return url;
    };
    const out: Record<string, string> = {};
    const spin = this.turntable.rotation.y; this.turntable.rotation.y = 0;
    this.batter.reset(); this.batter.update(0); this.batter.drape();
    await batSheet(holding.id).then(sheet => this.batter.holdBat(holding.grip, sheet));
    // The holder's offset stands him on the origin, a little off the ground: head and shoulders from there.
    for (const outfit of outfits) {
      this.put(outfit);
      const gloves = guardFor(outfit);
      if (gloves) this.batter.wearGloves(gloves);
      out[`kit:${outfit.id}`] = shot(this.holder, new THREE.Vector3(.02, 1.28, 0), 2.1, .55);
    }
    // The guards: him from the gloves down to his shoes, from the bowler's side
    // so the backs of both gloves show over both pads. The hands on the handle
    // alone, near to, cropped the pads to a corner and read as nothing much.
    // In the last of the room's own kits, as before there were Super10 kits on the shelf.
    const plain = outfits.filter(kit => !printOf(kit)).at(-1);
    if (plain) this.put(plain);
    this.scene.updateMatrixWorld(true);
    const hands = this.hands(), guardAt = new THREE.Vector3(hands.x, (hands.y + this.soles.y) / 2 + .04, 0);
    const guardDistance = (hands.y - this.soles.y + .42) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    for (const guard of guards) { this.batter.wearGloves(guard); out[`guard:${guard.id}`] = shot(this.holder, guardAt, guardDistance, .5); }
    if (wearing) this.batter.wearGloves(wearing);
    // Every sheet loaded first, so the pictures are taken in one go: the stage
    // moves the bat every frame, and a wait between two pictures let it.
    await Promise.all(bats.map(bat => batSheet(bat.id)));
    const was = { visible: this.showBat.root.visible, y: this.showBat.root.position.y };
    this.showBat.root.visible = true; this.showBat.root.position.set(0, 0, 0); this.showBat.root.rotation.set(0, 0, -.72); this.showBat.root.scale.setScalar(BAT_PICTURE_SCALE);
    for (const bat of bats) { await this.showBat.hold(bat); this.showBat.root.position.set(0, 0, 0); out[`bat:${bat.id}`] = shot(this.showBat.root, new THREE.Vector3(-.3, -.42, 0), 3.0, 0); }
    this.showBat.root.rotation.set(0, 0, 0); this.showBat.root.scale.setScalar(this.batShow.scale); this.showBat.root.position.y = was.y; this.showBat.root.visible = was.visible;
    this.turntable.rotation.y = spin;
    renderer.dispose(); renderer.forceContextLoss();
    return out;
  }

  dispose() {
    cancelAnimationFrame(this.raf); this.resize.disconnect();
    (this.scene.background as THREE.Texture | null)?.dispose?.();
    this.renderer.dispose(); this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  /**
   * Where the stage is to stand in the canvas: between `top` (under the name)
   * and `floor` (over the words at the foot), and across from `left` to
   * `right` (short of the shelf), in CSS pixels from the canvas's corner. The
   * camera is sized and moved so the whole pedestal stands on the floor and the
   * batter fills the space above it, no nearer than the room was drawn, in the
   * middle of the span. It is framed the same for a bat, so changing shelves
   * moves nothing. `nearer` lets the camera come that many times nearer than
   * the room was drawn, for a screen with more height to give it.
   */
  frame(top: number, floor: number, left: number, right: number, nearer = 1) { this.room = { top, floor, left, right, nearer }; this.fit(); }
  private room: { top: number; floor: number; left: number; right: number; nearer: number } | null = null;

  /** The room's corridor, once it has loaded; nothing for the unlocks. */
  private readonly backdrop = new Image();
  /**
   * The corridor painted to the canvas's size, covering it as the drawing
   * does its phone: centred, cropped on whichever side is the longer. Painted
   * again whenever the canvas changes shape, never stretched.
   */
  private paintBackdrop() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight, img = this.backdrop;
    if (!w || !h || !img.complete || !img.naturalWidth) return;
    const ratio = Math.min(2, devicePixelRatio), c = document.createElement('canvas');
    c.width = Math.round(w * ratio); c.height = Math.round(h * ratio);
    const k = Math.max(c.width / img.naturalWidth, c.height / img.naturalHeight), g = c.getContext('2d')!;
    g.drawImage(img, (c.width - img.naturalWidth * k) / 2, (c.height - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
    (this.scene.background as THREE.Texture | null)?.dispose?.();
    this.scene.background = texture;
  }

  private fit() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    if (this.backdrop.src) this.paintBackdrop();
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h;
    // Drawn on an 874-high phone with the name ending at 140 and the shelf at
    // 556: those, scaled, until the screen says where they are.
    const { top, floor, left, right, nearer } = this.room ?? { top: h * 140 / 874, floor: h * 652 / 874, left: 0, right: w, nearer: 1 };
    // Level, eye high, 8.1 m out: a point y high and z nearer falls (eye - y) / (distance - z)
    // of the focal length below the middle. The batter's crown to the pedestal's front edge
    // is the space between the name and the shelf.
    // The guard's view is nearer: his helmet to his shoes, and the pedestal under the shelf.
    const guard = this.view === 'guard', lowest = guard ? this.soles : PEDESTAL_FOOT, highest = guard ? this.crown - CROWN_ROOM : this.crown;
    const { distance, eye } = CAMERA, below = (y: number, z: number) => (eye - y) / (distance - z);
    const focal = Math.min(NEAREST_FOCAL * w / 402 * nearer * (guard ? GUARD_NEARER : 1), Math.max(40, floor - top) / (below(lowest.y, lowest.z) - below(highest, 0)));
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(h / 2 / focal));
    this.camera.position.set(0, eye, distance); this.camera.lookAt(0, eye, 0);
    // Where the lowest thing falls now, and how far to move the picture to stand it on the floor, in the middle of the span.
    const falls = h / 2 + below(lowest.y, lowest.z) * focal;
    this.camera.setViewOffset(w, h, w / 2 - (left + right) / 2, falls - floor, w, h);
    this.camera.updateProjectionMatrix();
    this.fitMoment();
  }

  /**
   * Where an unlock is to stand: between `top` and `floor` (the top of its
   * words), in CSS pixels from the canvas's top. It is drawn as it always is,
   * and on a screen too short for it the picture is made smaller and lifted
   * until it ends where the words begin.
   */
  frameMoment(top: number, floor: number) { this.momentRoom = { top, floor }; this.fitMoment(); }
  private momentRoom: { top: number; floor: number } | null = null;
  private momentView = { fov: 30, lift: 0 };

  private fitMoment() {
    const what = this.moment?.what, room = this.momentRoom, w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.momentView = { fov: 30, lift: 0 };
    if (!what || !room || !w || !h) return;
    // The moment at its end, as the plain camera draws it: how high and how low it reaches.
    const camera = new THREE.PerspectiveCamera(30, w / h, .1, 100), reach: number[] = [];
    const mark = (point: THREE.Vector3) => reach.push((1 - point.project(camera).y) / 2 * h);
    if (what.kind === 'bat') {
      camera.position.set(0, 1.3, 8.1); camera.lookAt(0, .56, 0); camera.updateMatrixWorld();
      const bat = this.showBat.root, was = { position: bat.position.clone(), rotation: bat.rotation.clone(), scale: bat.scale.x };
      bat.rotation.order = 'ZYX';
      bat.position.set(.4, 1.4, 2.6); bat.scale.setScalar(1.78); bat.rotation.set(0, Math.PI, -.62); bat.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(bat);
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) mark(new THREE.Vector3(x, y, z));
      bat.position.copy(was.position); bat.rotation.copy(was.rotation); bat.scale.setScalar(was.scale);
    } else {
      camera.position.set(0, 1.3, 8.4); camera.lookAt(0, .41, 0); camera.updateMatrixWorld();
      mark(new THREE.Vector3(0, this.crown, 0)); mark(PEDESTAL_FOOT.clone());
    }
    const high = Math.min(...reach), low = Math.max(...reach);
    const shrink = Math.max(.4, Math.min(1, (room.floor - room.top) / (low - high)));
    this.momentView = {
      fov: THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(15)) / shrink)),
      lift: Math.max(0, h / 2 + (low - h / 2) * shrink - room.floor),
    };
  }

  private down = (event: PointerEvent) => {
    this.dragging = true; this.lastX = event.clientX; this.downAt = performance.now(); this.moved = 0;
    this.canvas.setPointerCapture(event.pointerId);
  };
  private move = (event: PointerEvent) => {
    if (!this.dragging) return;
    const dx = event.clientX - this.lastX; this.lastX = event.clientX; this.moved += Math.abs(dx);
    this.spinV = dx * .012 / .016; this.spin += dx * .012; this.idleAt = performance.now();
  };
  private up = () => {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.moved < 6 && performance.now() - this.downAt < 350) this.playShot();
  };
  /** A tap on the batter: a shot, so the bat's face comes round to be seen. */
  private playShot() {
    if (this.view !== 'kit' || this.moment) return;
    const shots: [ShotType, number, number][] = [['STRAIGHT', .54, 0], ['COVER_LONG_OFF', .54, .1], ['LEG', 1.12, 0]];
    const [shot, y, x] = shots[Math.floor(Math.random() * shots.length)];
    this.batter.reset(); this.batter.prepare(1); this.batter.swing(shot, this.clock, x, y, GAME.contactZ);
    this.swingEnd = this.clock + STROKE_DURATION_MS + 700;
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    // Off the page — a stage made ahead for a story (`StoryStage.warm`) — it
    // draws its first few frames, which is what compiles its shaders, and then
    // rests until it is put up: nothing to see, and the cover's own frames to keep.
    if (!this.canvas.isConnected) { if (++this.offPage > 3) return; } else this.offPage = 0;
    const dt = Math.min(50, now - (this.last || now)); this.last = now; this.clock += dt;
    if (!this.dragging) {
      // Turning slowly on its own, a while after a drag lets go.
      const rest = this.reducedMotion || this.view === 'guard' ? 0 : .35;
      if (now - this.idleAt > 1600) this.spinV += (rest - this.spinV) * .03; else this.spinV *= .94;
      this.spin += this.spinV * dt / 1000;
    }
    if (this.moment) this.animate(now);
    else {
      this.turntable.rotation.y = this.spin + (this.view === 'kit' ? -.9 : this.view === 'guard' ? GUARD_FACE : 0);
      this.showBat.root.rotation.set(0, this.spin, 0);
      this.showBat.root.position.set(0, this.batShow.y + (this.reducedMotion ? 0 : Math.sin(now / 900) * .03), 0);
    }
    if (this.swingEnd && this.clock > this.swingEnd) { this.batter.reset(); this.swingEnd = 0; }
    this.batter.update(this.clock); this.batter.drape();
    // The rim and the light ease to the colour on show; a pick flashes them.
    this.rimMaterial.color.lerp(this.glow, .12); this.ringMaterial.color.lerp(this.glow, .12); this.halo.material.color.lerp(this.glow, .08);
    const flash = Math.max(0, 1 - (now - this.flashAt) / 450);
    this.ringMaterial.opacity = .75 + flash * .8; this.halo.material.opacity = .4 + flash * .4;
    if (!this.reducedMotion) {
      const motes = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < motes.count; i++) { let y = motes.getY(i) + dt * .00006; if (y > 3.6) y = .3; motes.setY(i, y); }
      motes.needsUpdate = true;
    }
    this.renderer.render(this.scene, this.camera);
  };

  /** Where the rays meet: on their plane, straight behind `point` as the camera sees it. */
  private raysBehind(point: THREE.Vector3) {
    const direction = point.clone().sub(this.camera.position).normalize();
    const k = (this.rays.position.z - this.camera.position.z) / direction.z;
    this.rays.position.set(this.camera.position.x + direction.x * k, this.camera.position.y + direction.y * k, this.rays.position.z);
  }

  /** One frame of the moment on the stage. */
  private animate(now: number) {
    const moment = this.moment!, t = now - moment.at, what = moment.what;
    const clamp = (x: number) => Math.min(1, Math.max(0, x));
    const ease = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
    const smooth = (x: number) => { x = clamp(x); return x * x * (3 - 2 * x); };
    const reveal = REVEAL_MS[what.kind];
    if (!moment.revealed && t > reveal) {
      moment.revealed = true;
      if (what.kind === 'bat') { this.showBat.setGrip(what.bat.grip); this.glow.set(what.bat.glow); }
      else { this.scan.uScanY.value = -10; this.glow.set(what.to.glow); this.batter.reset(); this.batter.celebrate(this.clock, 'hundred'); }
      this.flashAt = now;
      moment.onReveal();
    }
    const after = moment.revealed ? t - reveal : -1;
    // A short shake as it lands.
    const shake = moment.revealed && !this.reducedMotion ? Math.max(0, 1 - after / 380) : 0;
    const jolt = () => (Math.random() - .5) * .06 * shake;
    this.camera.fov = this.momentView.fov;
    if (this.momentView.lift) this.camera.setViewOffset(this.canvas.clientWidth, this.canvas.clientHeight, 0, this.momentView.lift, this.canvas.clientWidth, this.canvas.clientHeight);
    else this.camera.clearViewOffset();
    if (what.kind === 'bat') {
      // Up off the stand and into the screen, laid across it.
      const back = (x: number) => { x = clamp(x); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
      const rise = back(t / 650), bat = this.showBat.root;
      bat.rotation.order = 'ZYX';
      bat.position.set(.4 * rise, THREE.MathUtils.lerp(this.batShow.y, 1.4, rise) + Math.sin(now / 800) * .02 * rise, 2.6 * rise);
      bat.scale.setScalar(THREE.MathUtils.lerp(this.batShow.scale, 1.78, rise));
      const turn = moment.revealed ? ease(after / 1100) * Math.PI * 2 : 0;
      bat.rotation.set(0, Math.PI + turn + Math.sin(now / 1300) * .12 * rise, -.62 * rise);
      for (const part of this.pedestalParts) part.visible = rise < .35;
      this.turntable.rotation.y = 0;
      this.showBat.reveal.uReveal.value = THREE.MathUtils.lerp(-.08, 1.12, clamp((t - 600) / 1050) ** 1.15);
      this.camera.position.set(jolt(), 1.3 + jolt(), 8.1); this.camera.lookAt(0, .56, 0);
      bat.updateMatrixWorld(true); this.raysBehind(bat.localToWorld(new THREE.Vector3(0, -.42, 0)));
    } else {
      // He turns slowly while the ring goes down him; on the reveal, once round and into the hundred's celebration, facing the camera.
      const from = 700, scan = 1500;
      const turn = moment.revealed ? ease(after / 1200) * Math.PI * 2 : 0;
      this.turntable.rotation.y = moment.revealed ? KIT_FACE - Math.PI * 2 + turn : -.9 + Math.min(t, reveal) / reveal * .55;
      const u = (t - from) / scan, y = THREE.MathUtils.lerp(2.14, .14, smooth(u));
      if (!moment.revealed) this.scan.uScanY.value = t < from ? 10 : y;
      const ringOn = t > from - 200 && !moment.revealed ? Math.min(1, (t - from + 200) / 200) * Math.min(1, (reveal - t) / 150) : 0;
      this.scanRing.material.opacity = ringOn; this.scanDisc.material.opacity = ringOn * .9;
      this.scanRing.position.y = this.scanDisc.position.y = Math.min(2.14, y);
      this.scanRing.scale.setScalar(.85 + .3 * Math.sin(clamp(u) * Math.PI)); this.scanDisc.scale.copy(this.scanRing.scale);
      // In a little while he is scanned; back on the reveal, framing him above the words.
      const push = smooth(t / reveal), back = moment.revealed ? smooth(after / 600) : 0;
      const z = THREE.MathUtils.lerp(THREE.MathUtils.lerp(8.1, 7.7, push), 8.4, back), at = THREE.MathUtils.lerp(THREE.MathUtils.lerp(.56, .62, push), .41, back);
      this.camera.position.set(jolt(), 1.3 + jolt(), z); this.camera.lookAt(0, at, 0);
      this.raysBehind(new THREE.Vector3(0, 1.3, 0));
    }
    this.camera.updateProjectionMatrix();
    // Rays faint while it is scanned, full on the reveal and turning; the bat's own lights while it is out of the spot.
    const rays = this.rays.material, want = moment.revealed ? (what.kind === 'bat' ? .85 : .7) : what.kind === 'bat' ? .18 : .1;
    rays.opacity += (want - rays.opacity) * (moment.revealed ? .2 : .06); rays.color.copy(this.glow);
    this.rays.rotation.z = now / 9000 + (moment.revealed ? Math.max(0, 1 - after / 1500) * 1.2 : 0);
    this.rays.scale.setScalar(moment.revealed ? 1.1 + Math.max(0, 1 - after / 600) * .5 : 1);
    const lit = what.kind === 'bat' ? 1 : 0;
    this.revealKey.intensity += (lit * 2.1 - this.revealKey.intensity) * .08;
    this.revealRim.intensity += (lit * 2.2 - this.revealRim.intensity) * .08; this.revealRim.color.copy(this.glow);
  }
}
