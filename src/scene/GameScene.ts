import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Batter } from '../entities/Batter';
import { GAME, SHOT_ANGLES } from '../config/gameplay';
import { ballPosition } from '../game/DeliveryTrajectory';
import type { Delivery, ShotOutcome, ShotType } from '../game/types';

/** Where a beaten ball runs out of steam: just short of the stumps. */
const BEATEN_STOP = (GAME.releaseZ - 0.3) / (GAME.releaseZ - GAME.contactZ);
const colors = { grass: 0x668b49, grassLight: 0x70974e, pitch: 0xcbb283, navy: 0x19334a, orange: 0xf37943, white: 0xf8f1df, skin: 0xb77950 };
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
interface Player { root: THREE.Group; arm: THREE.Group; legs: THREE.Group[] }
// One set of smooth primitives, scaled into limbs and torsos: spheres carry the
// joints so every fielder reads as a soft sculpted figure rather than a stack.
const SHAPES = {
  ball: new THREE.SphereGeometry(1, 22, 15),
  tube: new THREE.CylinderGeometry(0.5, 0.5, 1, 18),
  soft: new RoundedBoxGeometry(1, 1, 1, 4, 0.3),
};
function part(parent: THREE.Object3D, shape: keyof typeof SHAPES, color: number, scale: [number, number, number], position: [number, number, number] = [0, 0, 0]) {
  const mesh = new THREE.Mesh(SHAPES[shape], soft(color));
  mesh.scale.set(...scale); mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}
function limb(parent: THREE.Object3D, color: number, radius: number, length: number, y: number) {
  part(parent, 'tube', color, [radius * 2, length, radius * 2], [0, y - length / 2, 0]);
  return part(parent, 'ball', color, [radius, radius, radius], [0, y - length, 0]);
}
function player(color: number): Player {
  const root = new THREE.Group();
  part(root, 'ball', color, [0.225, 0.215, 0.155], [0, 1.20, 0]);
  part(root, 'ball', color, [0.195, 0.19, 0.14], [0, 0.97, 0]);
  part(root, 'ball', colors.white, [0.205, 0.15, 0.145], [0, 0.83, 0]);
  // A visible neck and shoulder caps keep the figure from reading as a skittle.
  part(root, 'tube', colors.skin, [0.115, 0.17, 0.115], [0, 1.44, 0]);
  for (const x of [-0.205, 0.205]) part(root, 'ball', color, [0.108, 0.10, 0.108], [x, 1.325, 0]);
  const legs = [-0.115, 0.115].map(x => {
    const leg = new THREE.Group(); leg.position.set(x, 0.8, 0); root.add(leg);
    limb(leg, colors.white, 0.095, 0.36, 0);
    limb(leg, colors.white, 0.08, 0.33, -0.36);
    const shoe = new THREE.Group(); shoe.position.y = -0.69; leg.add(shoe);
    part(shoe, 'soft', colors.white, [0.185, 0.11, 0.30], [0, 0.01, 0.05]);
    part(shoe, 'ball', colors.white, [0.085, 0.05, 0.055], [0, -0.015, 0.19]);
    return leg;
  });
  part(root, 'ball', colors.skin, [0.175, 0.19, 0.175], [0, 1.63, 0]);
  part(root, 'ball', color, [0.185, 0.14, 0.19], [0, 1.70, -0.015]);
  part(root, 'soft', color, [0.34, 0.048, 0.22], [0, 1.68, 0.15]);
  const arm = new THREE.Group(); arm.position.set(0.235, 1.33, 0); root.add(arm);
  limb(arm, color, 0.075, 0.24, 0);
  const forearm = new THREE.Group(); forearm.position.y = -0.24; arm.add(forearm);
  limb(forearm, colors.skin, 0.065, 0.22, 0);
  part(forearm, 'ball', colors.skin, [0.085, 0.09, 0.085], [0, -0.24, 0]);
  const other = new THREE.Group(); other.position.set(-0.255, 1.33, 0.02); other.rotation.z = -0.18; root.add(other);
  limb(other, color, 0.075, 0.24, 0);
  limb(other, colors.skin, 0.065, 0.22, -0.24);
  part(other, 'ball', colors.skin, [0.085, 0.09, 0.085], [0, -0.5, 0]);
  return { root, arm, legs };
}

export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(53, 1, 0.1, 180);
  private world = new THREE.Group();
  private batter = new Batter();
  private bowler = player(colors.orange);
  private catcher = player(colors.orange);
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
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    const mobile = window.matchMedia('(pointer: coarse)').matches;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0xa9cbd0);
    container.prepend(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', '3D cricket ground viewed from behind the batter');
    this.scene.fog = new THREE.Fog(0xb4ced0, 48, 125);
    // Mirror the stage so the batter's leg side (negative X) reads left on screen.
    this.world.scale.x = -1; this.scene.add(this.world);
    this.camera.fov = 50;
    this.camera.position.set(0, 2.9, -5.15); this.camera.lookAt(0, 1.05, 9);
    this.scene.add(new THREE.HemisphereLight(0xe9f6ff, 0x66744a, 2.5));
    const sun = new THREE.DirectionalLight(0xffedce, 3.2); sun.position.set(-15, 30, -8); sun.castShadow = true;
    sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048); sun.shadow.camera.left = -28; sun.shadow.camera.right = 28;
    sun.shadow.camera.top = 35; sun.shadow.camera.bottom = -20; sun.shadow.normalBias = 0.025;
    this.scene.add(sun);
    this.createGround();
    this.wicket(0); this.wicket(18.7);
    this.bowler.root.position.set(0, 0, 21);
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
    // The shockwave that goes out from under a charged hit.
    this.chargeRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.60, 48), new THREE.MeshBasicMaterial({ color: 0xffdb96, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    this.chargeRing.rotation.x = -Math.PI / 2; this.chargeRing.visible = false; this.world.add(this.chargeRing);
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
    const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 96), mat(colors.grass)); ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.035, 10); ground.receiveShadow = true; this.world.add(ground);
    for (let i = 0; i < 10; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(i * 6 + 2, i * 6 + 5, 96), mat(colors.grassLight));
      ring.rotation.x = -Math.PI / 2; ring.position.set(0, -0.025, 10); ring.receiveShadow = true; this.world.add(ring);
    }
    box(this.world, 2.8, 0.025, 32, colors.pitch, 0, 0, 4.3);
    box(this.world, 2.0, 0.029, 30, 0xc4ac80, 0, 0, 4.6);
    // Fine deterministic wear marks on the wicket; all created once.
    for (let i = 0; i < 95; i++) box(this.world, 0.015 + (i % 5) * 0.018, 0.003, 0.08 + (i % 4) * 0.1, i % 2 ? 0xb49d73 : 0xd4be94, Math.sin(i * 72.4) * 0.92, 0.018, 0.5 + (i * 1.73) % 18);
    // Popping creases, 1.2m in front of each wicket, with return creases running
    // back past the stumps.
    [GAME.creaseZ, 18.7 - GAME.creaseZ].forEach(z => {
      const behind = z < 2 ? -0.75 : 0.75;
      box(this.world, 3.1, 0.015, 0.045, colors.white, 0, 0.024, z);
      [-1.1, 1.1].forEach(x => box(this.world, 0.045, 0.015, 1.5, colors.white, x, 0.024, z + behind));
    });
    const boundary = new THREE.Mesh(new THREE.TorusGeometry(GAME.boundaryRadius, 0.055, 5, 128), mat(colors.white));
    boundary.rotation.x = Math.PI / 2; boundary.position.set(0, 0.06, 10); this.world.add(boundary);
    this.createStadium();
    // Fielders are scenery except the one scripted catcher.
    [[-18, 20], [22, 5], [-14, -4], [2, 35], [-7, 29]].forEach(([x, z]) => {
      const fielder = player(colors.orange); fielder.root.position.set(x, 0, z); fielder.root.rotation.y = Math.atan2(-x, -z); this.world.add(fielder.root);
    });
  }
  private createStadium() {
    const seatGeometry = new THREE.BoxGeometry(0.6, 0.55, 0.55);
    const crowd = new THREE.InstancedMesh(seatGeometry, mat(0xffffff), 1344);
    const dummy = new THREE.Object3D(); let index = 0;
    const seatColors = [0x22465a, 0xf5bf71, 0xc8dbce, 0xf4794c, 0xe9e0c9, 0x467787];
    for (let section = 0; section < 28; section++) {
      const a = section / 28 * Math.PI * 2;
      const group = new THREE.Group(); group.position.set(Math.sin(a) * 39, 0, 10 + Math.cos(a) * 39); group.rotation.y = a; this.world.add(group);
      box(group, 8.7, 1.5, 1.2, section % 3 ? colors.navy : colors.orange, 0, 0.75, -3.3);
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
  reset() {
    this.hitOutcome = null; this.bailsBrokeAt = 0; this.flightMs = GAME.hitAnimationMs; this.hitHeight = 0; this.ball.visible = false; this.shadow.visible = false; this.bounceRing.visible = false; this.catchRing.visible = false; this.chargeRing.visible = false;
    this.trail.forEach(t => t.visible = false); this.batter.reset();
    this.bails.forEach((b, i) => { b.position.set(i ? 0.073 : -0.073, GAME.stumpHeight + 0.02, 0); b.rotation.set(0, 0, 0); });
    this.batter.root.visible = true;
    this.catcher.root.position.set(12, 0, 20); this.catcher.arm.rotation.x = 0;
    this.bowler.root.position.set(0, 0, 21); this.bowler.arm.rotation.x = 0;
    this.bowler.legs.forEach(leg => leg.rotation.x = 0);
  }
  runup(t: number) {
    this.bowler.root.position.z = 21 - t * 3;
    this.bowler.root.position.y = Math.abs(Math.sin(t * Math.PI * 6)) * 0.055;
    this.bowler.legs.forEach((leg, i) => leg.rotation.x = Math.sin(t * 20 + i * Math.PI) * 0.35);
    this.bowler.arm.rotation.x = t > 0.55 ? -(t - 0.55) / 0.45 * Math.PI * 2 : Math.sin(t * 18) * 0.6;
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
    this.bowler.arm.rotation.x = Math.PI * 0.5;
  }
  swing(shot: ShotType, now: number, delivery: Delivery, charging = false) {
    const contact = ballPosition(delivery, 1);
    this.batter.swing(shot, now, contact.x, contact.y, contact.z, charging);
  }
  hit(outcome: ShotOutcome, shot: ShotType | undefined, delivery: Delivery, now: number) {
    this.hitStart = outcome.madeBatContact ? Math.max(now, this.batter.strikeAt) : now;
    this.contactDelay = this.hitStart - now;
    this.incomingPosition.copy(this.ball.position);
    this.hitOutcome = outcome;
    const p = ballPosition(delivery, 1); this.hitOrigin.set(p.x, p.y, p.z);
    let angle = (SHOT_ANGLES[shot ?? 'STRAIGHT'] + Math.max(-8, Math.min(8, (outcome.timingDeltaMs ?? 0) / 28))) * Math.PI / 180;
    const caught = outcome.wicketType === 'CAUGHT';
    // A charged straight hit does not land in the ground: it clears the stand.
    const distance = outcome.advance ? 78 : caught ? (outcome.aerial ? 27 : 18) : ({ 0: 5, 1: 10, 2: 19, 3: 26, 4: 44, 6: 52 }[outcome.runs]);
    if (caught && Math.abs(angle) < 0.2) angle = 0.35;
    this.hitEnd.set(Math.sin(angle) * distance, caught ? 1.5 : 0.1, Math.cos(angle) * distance);
    // A skied shot hangs long enough to be watched down; a middled one leaves
    // fast. The charge is worth watching all the way over the roof.
    this.flightMs = outcome.advance ? 2200 : outcome.aerial ? GAME.aerialFlightMs : GAME.hitAnimationMs;
    // A four is a boundary along the turf — a drive races to the rope on the
    // ground. Only a six leaves it, and only a mishit hangs.
    this.hitHeight = outcome.advance ? 32 : outcome.aerial ? (outcome.runs === 6 ? 15 : 11)
      : outcome.runs === 6 ? 12 : caught ? 5 : outcome.runs === 4 ? 0.22 : 0.6;
    if (caught) {
      this.catcher.root.position.set(this.hitEnd.x, 0, this.hitEnd.z); this.catchRing.position.set(this.hitEnd.x, 0.04, this.hitEnd.z); this.catchRing.visible = true;
    }
    this.bounceRing.visible = false;
    if (outcome.advance) this.chargeRing.position.set(this.hitOrigin.x, 0.045, this.hitOrigin.z);
    // Hold the call back until a skied ball is taken or clears the rope.
    return { contactAt: this.hitStart, presentAt: this.hitStart + (outcome.aerial ? this.flightMs * 0.82 : 0), endAt: this.hitStart + this.flightMs };
  }
  /** Where a struck ball sits at `t` through its flight; also drives the trail. */
  private struckAt(t: number, into: THREE.Vector3) {
    into.lerpVectors(this.hitOrigin, this.hitEnd, t);
    into.y += Math.sin(Math.min(1, t) * Math.PI) * this.hitHeight;
    return into;
  }
  result(now: number) {
    const result = this.hitOutcome; if (!result) return;
    if (now < this.hitStart) {
      const approach = 1 - (this.hitStart - now) / this.contactDelay;
      this.ball.position.lerpVectors(this.incomingPosition, this.hitOrigin, approach);
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
    if (result.madeBatContact) {
      this.struckAt(t, this.ball.position);
      if (result.wicketType === 'CAUGHT' && t > 0.86) this.catcher.arm.rotation.x = -2.5;
      this.ball.visible = t < 1;
      // The streak behind the ball is most of what sells a struck shot.
      this.trail.forEach((dot, i) => {
        const behind = t - (i + 1) * 0.019;
        dot.visible = this.ball.visible && behind > 0;
        if (dot.visible) this.struckAt(behind, dot.position);
      });
    } else {
      this.trail.forEach(dot => dot.visible = false);
      // Carry on from where the ball actually is rather than resetting it to the
      // crease, so a beaten stroke never rewinds the delivery.
      const from = this.incomingPosition;
      const stopZ = result.wicketType === 'LBW' ? from.z : -1.3;
      this.ball.position.set(from.x, Math.max(0.1, from.y - t * 0.3), THREE.MathUtils.lerp(from.z, stopZ, Math.min(1, t * 5)));
      // The bails leave when the ball reaches them, not on a fixed delay.
      if (result.wicketType === 'BOWLED') {
        if (!this.bailsBrokeAt && this.ball.position.z <= 0) this.bailsBrokeAt = now;
        if (this.bailsBrokeAt) {
          const flung = Math.min(1, (now - this.bailsBrokeAt) / 620);
          this.bails.forEach((bail, i) => {
            bail.position.z = -flung * 1.9;
            bail.position.y = Math.max(0.05, GAME.stumpHeight + 0.02 + flung * 0.9 - flung * flung * 1.6);
            bail.rotation.x = flung * 11; bail.rotation.z = flung * (i ? 5 : -5);
          });
        }
      }
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
    const outcome = this.hitOutcome, since = now - this.hitStart;
    // A skied ball shakes the same whatever it becomes, so the camera cannot
    // give the result away before the fielder has settled under it.
    const power = !this.reducedMotion && outcome && since >= 0
      ? outcome.advance ? 0.062 : outcome.aerial ? 0.020 : outcome.runs === 6 ? 0.030 : outcome.runs === 4 ? 0.017 : outcome.isWicket ? 0.022 : 0
      : 0;
    const shake = power * Math.max(0, 1 - since / (outcome?.advance ? 620 : 300));
    this.camera.position.x = Math.sin(now * 0.085) * shake;
    this.camera.position.y = 2.9 + Math.sin(now * 0.13) * shake * 0.6;
    this.renderer.render(this.scene, this.camera);
  }
  inspectBatter() { return this.batter.inspect(); }
  dispose() {
    this.resizeObserver.disconnect();
    const geometries = new Set<THREE.BufferGeometry>(); const mats = new Set<THREE.Material>();
    this.scene.traverse(object => { if (object instanceof THREE.Mesh) { geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => mats.add(m)); } });
    // The shared character primitives outlive any one scene; the rest is ours.
    Object.values(SHAPES).forEach(shape => geometries.delete(shape));
    geometries.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); materials.clear(); this.renderer.dispose();
  }
}
