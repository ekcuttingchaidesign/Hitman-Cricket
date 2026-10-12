import * as THREE from 'three';
import { Batter, STROKE_DURATION_MS } from '../entities/Batter';
import { bladeGeometry, gripGeometry } from '../entities/batGeometry';
import { willowMaterial } from '../entities/characterMaterials';
import { batSheet } from '../entities/batSkins';
import { GAME } from '../config/gameplay';
import type { ShotType } from '../game/types';
import type { BatSkin, Outfit } from '../game/dressing';

/**
 * The Dressing Room's stage: the batter, or a bat on its own, turning on a
 * pedestal under a spotlight in a dark room.
 *
 * It is the game's own batter and the game's own bat, so what is on show is
 * exactly what goes out to bat. It draws into its own canvas with its own
 * renderer, made when the room opens and thrown away when it closes, so the
 * ground behind it is never asked to share a frame.
 */
export type StageView = 'kit' | 'bat';

const BAT_SHOW_SCALE = 1.45;
const BAT_SHOW_Y = 1.53;

function glowTexture(inner = 1, outer = 0, ring = false) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d')!;
  const gradient = g.createRadialGradient(128, 128, ring ? 70 : 0, 128, 128, 128);
  if (ring) {
    gradient.addColorStop(0, 'rgba(255,255,255,0)'); gradient.addColorStop(.35, 'rgba(255,255,255,.9)');
    gradient.addColorStop(.55, 'rgba(255,255,255,.25)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
  } else { gradient.addColorStop(0, `rgba(255,255,255,${inner})`); gradient.addColorStop(1, `rgba(255,255,255,${outer})`); }
  g.fillStyle = gradient; g.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

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
    const blade = new THREE.Mesh(bladeGeometry(), this.blade); blade.castShadow = true; this.root.add(blade);
  }
  /** Takes up a bat; its sheet arrives when it has loaded, unless another bat was asked for first. */
  hold(bat: BatSkin): Promise<void> {
    const asked = ++this.asked;
    this.grip.color.set(bat.grip);
    return batSheet(bat.id).then(sheet => {
      if (asked !== this.asked) return;
      this.blade.map = sheet; this.blade.color.set(sheet ? 0xffffff : 0xe0b77a); this.blade.needsUpdate = true;
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

  constructor() {
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
    const pool = new THREE.Mesh(new THREE.CircleGeometry(2.6, 64), new THREE.MeshBasicMaterial({ map: glowTexture(.32, 0), transparent: true, depthWrite: false, color: '#ffe2bd' }));
    pool.rotation.x = -Math.PI / 2; pool.position.y = .002; scene.add(pool);

    // The pedestal, its rim lit in the colour of whatever is on it.
    scene.add(this.turntable);
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(.66, .72, .16, 96), new THREE.MeshStandardMaterial({ color: '#171c22', roughness: .32, metalness: .75 }));
    pedestal.position.y = .08; pedestal.castShadow = pedestal.receiveShadow = true; this.turntable.add(pedestal);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(.6, .6, .012, 96), new THREE.MeshStandardMaterial({ color: '#232a33', roughness: .45, metalness: .5 }));
    top.position.y = .166; top.receiveShadow = true; this.turntable.add(top);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.645, .009, 8, 160), this.rimMaterial); rim.rotation.x = Math.PI / 2; rim.position.y = .163; scene.add(rim);
    this.ringMaterial = new THREE.MeshBasicMaterial({ map: glowTexture(1, 0, true), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ED7044' });
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), this.ringMaterial); ring.rotation.x = -Math.PI / 2; ring.position.y = .03; scene.add(ring);
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

    // The batter, standing on the pedestal as he stands at the crease; and the bat on its own.
    this.turntable.add(this.holder); this.holder.add(this.batter.root);
    this.holder.position.set(-GAME.stanceX - .02, .172, -GAME.stanceZ + .02);
    this.batter.root.traverse(object => { if ((object as THREE.Mesh).isMesh) object.castShadow = object.receiveShadow = true; });
    this.batter.reset(); this.batter.update(0); this.batter.drape();
    this.turntable.add(this.showBat.root); this.showBat.root.scale.setScalar(BAT_SHOW_SCALE); this.showBat.root.visible = false;

    this.canvas.addEventListener('pointerdown', this.down);
    this.canvas.addEventListener('pointermove', this.move);
    this.canvas.addEventListener('pointerup', this.up);
    this.canvas.addEventListener('pointercancel', this.up);
    this.resize.observe(this.canvas);
    this.raf = requestAnimationFrame(this.tick);
  }

  /** The batter in a kit, holding a bat. */
  dress(outfit: Outfit, bat: BatSkin) {
    this.batter.wear(outfit);
    void batSheet(bat.id).then(sheet => this.batter.holdBat(bat.grip, sheet));
  }
  /** A bat on its own, on the stand. */
  showcase(bat: BatSkin) { void this.showBat.hold(bat); }
  /** Which of the two is on the pedestal, and the colour the room is lit in. */
  show(view: StageView, glow: string) {
    this.view = view; this.glow.set(glow);
    this.holder.visible = view === 'kit'; this.showBat.root.visible = view === 'bat';
    this.flashAt = performance.now();
  }

  /**
   * Small pictures of every kit and bat, off the same models, for the shelf.
   * Drawn by a renderer of its own, made for the job and let go after it.
   */
  async thumbnails(outfits: readonly Outfit[], bats: readonly BatSkin[], holding: BatSkin): Promise<Record<string, string>> {
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
    for (const outfit of outfits) { this.batter.wear(outfit); out[`kit:${outfit.id}`] = shot(this.holder, new THREE.Vector3(.02, 1.28, 0), 2.1, .55); }
    // Every sheet loaded first, so the pictures are taken in one go: the stage
    // moves the bat every frame, and a wait between two pictures let it.
    await Promise.all(bats.map(bat => batSheet(bat.id)));
    const was = { visible: this.showBat.root.visible, y: this.showBat.root.position.y };
    this.showBat.root.visible = true; this.showBat.root.position.set(0, 0, 0); this.showBat.root.rotation.set(0, 0, -.72);
    for (const bat of bats) { await this.showBat.hold(bat); this.showBat.root.position.set(0, 0, 0); out[`bat:${bat.id}`] = shot(this.showBat.root, new THREE.Vector3(-.3, -.42, 0), 3.0, 0); }
    this.showBat.root.rotation.set(0, 0, 0); this.showBat.root.position.y = was.y; this.showBat.root.visible = was.visible;
    this.turntable.rotation.y = spin;
    renderer.dispose(); renderer.forceContextLoss();
    return out;
  }

  dispose() {
    cancelAnimationFrame(this.raf); this.resize.disconnect();
    this.renderer.dispose(); this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  /**
   * Where the stage is to stand in the canvas: between `top` (under the name)
   * and `floor` (the top of the shelf), in CSS pixels from the canvas's top.
   * The camera is sized and moved so the pedestal sits on the shelf and the
   * batter, bat raised, fills the space above it, whatever shape the screen.
   */
  frame(top: number, floor: number) { this.room = { top, floor }; this.fit(); }
  private room: { top: number; floor: number } | null = null;

  private fit() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h;
    // Drawn on an 874-high phone with the name ending at 140 and the shelf at
    // 556: those, scaled, until the screen says where they are.
    const { top, floor } = this.room ?? { top: h * 140 / 874, floor: h * 556 / 874 };
    // Level, eye high, 8.1 m out. The pedestal's top to the bat held high is
    // 2.1 m; that many metres across the space, and the pedestal's top on the floor.
    const distance = 8.1, eye = 1.3, span = 2.1, base = .17;
    const perMetre = Math.max(40, floor - top) / span;
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(h / 2 / (perMetre * distance)));
    this.camera.position.set(0, eye, distance); this.camera.lookAt(0, eye, 0);
    // Where the pedestal falls now, and how far to move the picture to put it on the shelf.
    const falls = h / 2 + (eye - base) * perMetre;
    this.camera.setViewOffset(w, h, 0, falls - floor, w, h);
    this.camera.updateProjectionMatrix();
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
    if (this.moved < 6 && performance.now() - this.downAt < 350) this.play();
  };
  /** A tap on the batter: a shot, so the bat's face comes round to be seen. */
  private play() {
    if (this.view !== 'kit') return;
    const shots: [ShotType, number, number][] = [['STRAIGHT', .54, 0], ['COVER_LONG_OFF', .54, .1], ['LEG', 1.12, 0]];
    const [shot, y, x] = shots[Math.floor(Math.random() * shots.length)];
    this.batter.reset(); this.batter.prepare(1); this.batter.swing(shot, this.clock, x, y, GAME.contactZ);
    this.swingEnd = this.clock + STROKE_DURATION_MS + 700;
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(50, now - (this.last || now)); this.last = now; this.clock += dt;
    if (!this.dragging) {
      // Turning slowly on its own, a while after a drag lets go.
      const rest = this.reducedMotion ? 0 : .35;
      if (now - this.idleAt > 1600) this.spinV += (rest - this.spinV) * .03; else this.spinV *= .94;
      this.spin += this.spinV * dt / 1000;
    }
    this.turntable.rotation.y = this.spin + (this.view === 'kit' ? -.9 : 0);
    this.showBat.root.position.y = BAT_SHOW_Y + (this.reducedMotion ? 0 : Math.sin(now / 900) * .03);
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
}
