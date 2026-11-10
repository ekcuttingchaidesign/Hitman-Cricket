import * as THREE from 'three';

/**
 * A burst of small pieces thrown from a point and let fall: dust where the
 * ball pitches, chips off a middled bat. One `Points` a kind, so one draw call
 * while a burst is up and none between; every piece is a closed-form flight
 * off the game's clock, so a beat held on the ball holds them too.
 */
export interface Burst {
  count: number; colour: THREE.ColorRepresentation;
  /** Metres a second, and how much of it is upward. */
  speed: number; lift: number;
  /** How long it lasts, in ms, and a piece's size in metres. */
  life: number; size: number;
  /** How hard they fall, in metres a second squared. */
  gravity: number;
  /** Which way they lean, if any: added to every piece's own direction. */
  toward?: THREE.Vector3;
}

const MOST = 16;
let dot: THREE.Texture | null = null;
function round() {
  if (dot) return dot;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d')!, fade = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  fade.addColorStop(0, 'rgba(255,255,255,1)'); fade.addColorStop(.55, 'rgba(255,255,255,.8)'); fade.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = fade; ctx.fillRect(0, 0, 32, 32);
  return dot = new THREE.CanvasTexture(canvas);
}

export class Puff {
  readonly points: THREE.Points;
  private material: THREE.PointsMaterial;
  private from = new THREE.Vector3();
  private ways: THREE.Vector3[] = Array.from({ length: MOST }, () => new THREE.Vector3());
  private start = -Infinity; private burst: Burst | null = null;
  constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOST * 3), 3));
    this.material = new THREE.PointsMaterial({ map: round(), transparent: true, depthWrite: false, sizeAttenuation: true });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false; this.points.visible = false;
  }
  /** Thrown from `at` at `now`. The directions are the page's dice: nothing is scored by them. */
  throw(at: THREE.Vector3, now: number, burst: Burst) {
    this.from.copy(at); this.start = now; this.burst = burst;
    const count = Math.min(MOST, burst.count);
    for (let i = 0; i < count; i++) {
      const turn = Math.random() * Math.PI * 2, pace = burst.speed * (.45 + Math.random() * .55);
      this.ways[i].set(Math.cos(turn) * pace, burst.lift * pace * (.5 + Math.random() * .5), Math.sin(turn) * pace);
      if (burst.toward) this.ways[i].addScaledVector(burst.toward, pace);
    }
    this.points.geometry.setDrawRange(0, count);
    this.material.color.set(burst.colour); this.material.size = burst.size;
  }
  /** How many pieces are up, for the checks. */
  get shown() { return this.points.visible ? Math.min(MOST, this.burst?.count ?? 0) : 0; }
  stop() { this.start = -Infinity; this.points.visible = false; }
  update(now: number) {
    const burst = this.burst, age = now - this.start;
    this.points.visible = !!burst && age >= 0 && age < burst.life;
    if (!this.points.visible || !burst) return;
    const t = age / 1000, k = age / burst.life, position = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0, n = Math.min(MOST, burst.count); i < n; i++) {
      const way = this.ways[i];
      // Slowed by the air as they go, so they burst out and hang rather than fly off.
      const drag = (1 - Math.exp(-3.2 * t)) / 3.2;
      position.setXYZ(i, this.from.x + way.x * drag, Math.max(.02, this.from.y + way.y * drag - .5 * burst.gravity * t * t), this.from.z + way.z * drag);
    }
    position.needsUpdate = true;
    this.material.opacity = (1 - k) * (1 - k);
  }
}
