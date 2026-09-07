import * as THREE from 'three';
import { Batter } from '../entities/Batter';
import { GAME, SHOT_ANGLES } from '../config/gameplay';
import { ballPosition } from '../game/DeliveryTrajectory';
import type { Delivery, ShotOutcome, ShotType } from '../game/types';

const colors = { grass: 0x668b49, grassLight: 0x70974e, pitch: 0xcbb283, navy: 0x19334a, orange: 0xf37943, white: 0xf8f1df, skin: 0xb77950 };
function material(color: number) { return new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true }); }
const materials = new Map<number, THREE.MeshStandardMaterial>();
function mat(color: number) { if (!materials.has(color)) materials.set(color, material(color)); return materials.get(color)!; }
function box(parent: THREE.Object3D, w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function sphere(parent: THREE.Object3D, radius: number, color: number, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), mat(color));
  mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh;
}
function cylinder(parent: THREE.Object3D, r: number, h: number, color: number, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 8), mat(color));
  mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh;
}
interface Player { root: THREE.Group; arm: THREE.Group; legs: THREE.Mesh[] }
function player(color: number): Player {
  const root = new THREE.Group();
  box(root, 0.46, 0.58, 0.29, color, 0, 1.08, 0);
  const legs = [-0.13, 0.13].map(x => box(root, 0.19, 0.65, 0.23, colors.white, x, 0.47, 0));
  [-0.13, 0.13].forEach(x => { box(root, 0.21, 0.11, 0.35, colors.white, x, 0.09, 0.065); });
  sphere(root, 0.2, colors.skin, 0, 1.56, 0);
  sphere(root, 0.215, color, 0, 1.64, -0.02);
  box(root, 0.43, 0.055, 0.3, color, 0, 1.59, 0.15);
  const arm = new THREE.Group(); arm.position.set(0.25, 1.3, 0); root.add(arm);
  box(arm, 0.16, 0.42, 0.17, color, 0, -0.15, 0);
  sphere(arm, 0.105, colors.white, 0, -0.38, 0);
  const otherArm = box(root, 0.17, 0.44, 0.18, color, -0.29, 1.08, 0.03); otherArm.rotation.z = -0.2;
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
  private bails: THREE.Mesh[] = [];
  private trail: THREE.Mesh[] = [];
  private resizeObserver: ResizeObserver;
  private hitStart = 0;
  private hitOrigin = new THREE.Vector3();
  private incomingPosition = new THREE.Vector3();
  private contactDelay = 0;
  private hitEnd = new THREE.Vector3();
  private hitOutcome: ShotOutcome | null = null;
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
    this.camera.position.set(0, 2.9, -5.8); this.camera.lookAt(0, 1.05, 9);
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
    this.ball = sphere(this.world, 0.115, 0xe84829);
    (this.ball.material as THREE.MeshStandardMaterial).emissive.setHex(0x972708);
    (this.ball.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2;
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.113, 0.008, 4, 24), mat(0xffefd6));
    this.ball.add(seam);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.17, 16), new THREE.MeshBasicMaterial({ color: 0x243828, transparent: true, opacity: 0.35, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.world.add(this.shadow);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe4a6, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
    this.bounceRing = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.19, 24), ringMat);
    this.bounceRing.rotation.x = -Math.PI / 2; this.world.add(this.bounceRing);
    this.catchRing = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.66, 32), ringMat.clone());
    this.catchRing.rotation.x = -Math.PI / 2; this.catchRing.visible = false; this.world.add(this.catchRing);
    for (let i = 0; i < 9; i++) {
      const dot = new THREE.Mesh(this.ball.geometry, new THREE.MeshBasicMaterial({ color: 0xfff5cd, transparent: true, opacity: (1 - i / 9) * 0.32, depthWrite: false }));
      dot.scale.setScalar(1 - i / 12); this.world.add(dot); this.trail.push(dot);
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
    box(this.world, 2.8, 0.025, 22, colors.pitch, 0, 0, 9.3);
    box(this.world, 2.0, 0.029, 20.5, 0xc4ac80, 0, 0, 9.3);
    // Fine deterministic wear marks on the wicket; all created once.
    for (let i = 0; i < 95; i++) box(this.world, 0.015 + (i % 5) * 0.018, 0.003, 0.08 + (i % 4) * 0.1, i % 2 ? 0xb49d73 : 0xd4be94, Math.sin(i * 72.4) * 0.92, 0.018, 0.5 + (i * 1.73) % 18);
    [0.7, 17.5].forEach(z => {
      box(this.world, 3.1, 0.015, 0.045, colors.white, 0, 0.024, z);
      [-1.1, 1.1].forEach(x => box(this.world, 0.045, 0.015, 1.25, colors.white, x, 0.024, z + (z < 2 ? -0.55 : 0.55)));
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
    for (const x of [-0.145, 0, 0.145]) cylinder(this.world, 0.025, GAME.stumpHeight, colors.white, x, GAME.stumpHeight / 2, z);
    for (const x of [-0.073, 0.073]) {
      const bail = box(this.world, 0.16, 0.035, 0.045, colors.orange, x, GAME.stumpHeight + 0.02, z);
      if (z === 0) this.bails.push(bail);
    }
  }
  private resize = () => {
    const { width, height } = this.container.getBoundingClientRect();
    this.renderer.setSize(width, height); this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
  };
  reset() {
    this.hitOutcome = null; this.ball.visible = false; this.shadow.visible = false; this.bounceRing.visible = false; this.catchRing.visible = false;
    this.trail.forEach(t => t.visible = false); this.batter.reset();
    this.bails.forEach((b, i) => { b.position.set(i ? 0.073 : -0.073, GAME.stumpHeight + 0.02, 0); b.rotation.set(0, 0, 0); });
    this.batter.root.visible = true;
    this.catcher.root.position.set(12, 0, 20); this.catcher.arm.rotation.x = 0;
    this.bowler.root.position.set(0, 0, 21); this.bowler.arm.rotation.x = 0;
  }
  runup(t: number) {
    this.bowler.root.position.z = 21 - t * 3;
    this.bowler.root.position.y = Math.abs(Math.sin(t * Math.PI * 6)) * 0.055;
    this.bowler.legs.forEach((leg, i) => leg.rotation.x = Math.sin(t * 20 + i * Math.PI) * 0.35);
    this.bowler.arm.rotation.x = t > 0.55 ? -(t - 0.55) / 0.45 * Math.PI * 2 : Math.sin(t * 18) * 0.6;
  }
  delivery(delivery: Delivery, progress: number) {
    this.batter.prepare(progress);
    this.ball.visible = this.shadow.visible = true;
    const pos = ballPosition(delivery, progress); this.ball.position.set(pos.x, pos.y, pos.z);
    this.shadow.position.set(pos.x, 0.035, pos.z); this.shadow.scale.setScalar(1 + pos.y * 0.2);
    this.trail.forEach((dot, i) => {
      dot.visible = progress > 0.03; const p = ballPosition(delivery, Math.max(0, progress - (i + 1) * 0.009)); dot.position.set(p.x, p.y, p.z);
    });
    const bounce = (GAME.releaseZ - delivery.bounceZ) / (GAME.releaseZ - GAME.contactZ);
    const age = (progress - bounce) * delivery.durationMs;
    this.bounceRing.visible = age > 0 && age < 260;
    if (this.bounceRing.visible) { this.bounceRing.position.set(pos.x, 0.037, delivery.bounceZ); this.bounceRing.scale.setScalar(1 + age / 65); (this.bounceRing.material as THREE.MeshBasicMaterial).opacity = 1 - age / 260; }
    this.bowler.arm.rotation.x = Math.PI * 0.5;
  }
  swing(shot: ShotType, now: number, delivery: Delivery) {
    const contact = ballPosition(delivery, 1);
    this.batter.swing(shot, now, contact.x, contact.y, contact.z);
  }
  hit(outcome: ShotOutcome, shot: ShotType | undefined, delivery: Delivery, now: number) {
    this.hitStart = outcome.madeBatContact ? Math.max(now, this.batter.strikeAt) : now;
    this.contactDelay = this.hitStart - now;
    this.incomingPosition.copy(this.ball.position);
    this.hitOutcome = outcome;
    const p = ballPosition(delivery, 1); this.hitOrigin.set(p.x, p.y, p.z);
    let angle = (SHOT_ANGLES[shot ?? 'STRAIGHT'] + Math.max(-8, Math.min(8, (outcome.timingDeltaMs ?? 0) / 28))) * Math.PI / 180;
    const distance = outcome.wicketType === 'CAUGHT' ? 18 : ({ 0: 5, 1: 10, 2: 19, 3: 26, 4: 44, 6: 49 }[outcome.runs]);
    if (outcome.wicketType === 'CAUGHT' && Math.abs(angle) < 0.2) angle = 0.35;
    this.hitEnd.set(Math.sin(angle) * distance, outcome.wicketType === 'CAUGHT' ? 1.4 : 0.1, Math.cos(angle) * distance);
    if (outcome.wicketType === 'CAUGHT') {
      this.catcher.root.position.set(this.hitEnd.x, 0, this.hitEnd.z); this.catchRing.position.set(this.hitEnd.x, 0.04, this.hitEnd.z); this.catchRing.visible = true;
    }
    this.bounceRing.visible = false;
    return this.hitStart;
  }
  result(now: number) {
    const result = this.hitOutcome; if (!result) return;
    if (now < this.hitStart) {
      const approach = 1 - (this.hitStart - now) / this.contactDelay;
      this.ball.position.lerpVectors(this.incomingPosition, this.hitOrigin, approach);
      this.shadow.position.set(this.ball.position.x, .03, this.ball.position.z);
      this.trail.forEach(dot => dot.visible = false);
      return;
    }
    const t = Math.min(1, (now - this.hitStart) / GAME.hitAnimationMs);
    this.trail.forEach(dot => dot.visible = false);
    if (result.madeBatContact) {
      this.ball.position.lerpVectors(this.hitOrigin, this.hitEnd, t);
      const height = result.runs === 6 ? 12 : result.wicketType === 'CAUGHT' ? 5 : result.runs === 4 ? 0.8 : 0.5;
      this.ball.position.y += Math.sin(t * Math.PI) * height;
      if (result.wicketType === 'CAUGHT' && t > 0.85) this.catcher.arm.rotation.x = -2.5;
      this.ball.visible = t < 1;
    } else {
      const stopZ = result.wicketType === 'LBW' ? 0.38 : -1.3;
      this.ball.position.set(this.hitOrigin.x, Math.max(0.1, this.hitOrigin.y - t * 0.3), THREE.MathUtils.lerp(this.hitOrigin.z, stopZ, Math.min(1, t * 5)));
      if (result.wicketType === 'BOWLED' && t > 0.06) this.bails.forEach((b, i) => { b.position.z = -t * 2; b.position.y = Math.max(0.06, 0.8 + t * 2 - t * t * 4); b.rotation.x = t * 12; b.rotation.z = t * (i ? 5 : -5); });
      if (result.wicketType === 'LBW') {
        this.batter.root.position.x = THREE.MathUtils.lerp(-0.36, this.hitOrigin.x - 0.13, Math.min(1, t * 8));
        this.batter.root.rotation.z = Math.sin(Math.min(1, t * 4) * Math.PI) * 0.13;
      }
      this.ball.visible = t < 0.8;
    }
    this.shadow.position.set(this.ball.position.x, 0.03, this.ball.position.z); this.shadow.visible = this.ball.visible;
  }
  render(now: number) {
    this.batter.update(now);
    const shake = !this.reducedMotion && now >= this.hitStart && this.hitOutcome && (this.hitOutcome.runs === 6 || this.hitOutcome.isWicket) ? Math.max(0, 1 - (now - this.hitStart) / 250) * 0.02 : 0;
    this.camera.position.x = Math.sin(now * 0.08) * shake;
    this.renderer.render(this.scene, this.camera);
  }
  inspectBatter() { return this.batter.inspect(); }
  dispose() {
    this.resizeObserver.disconnect();
    const geometries = new Set<THREE.BufferGeometry>(); const mats = new Set<THREE.Material>();
    this.scene.traverse(object => { if (object instanceof THREE.Mesh) { geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => mats.add(m)); } });
    geometries.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); materials.clear(); this.renderer.dispose();
  }
}
