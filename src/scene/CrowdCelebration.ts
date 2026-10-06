import * as THREE from 'three';
import type { Milestone } from '../game/milestone';

/** How long the stands take to sit back down. */
const SETTLE_MS = 450;

/**
 * What the stands get up for: a four or a six struck, and every milestone.
 * The boundaries are named for the stroke because the milestones already use
 * `'four'`, for four hundred.
 */
export type CrowdMoment = 'hit-four' | 'hit-six' | Milestone;
interface Reaction { ms: number; strength: number; labels: (mark: number) => [string, string, string]; priority: number }
export const CROWD_MOMENTS: Record<CrowdMoment, Reaction> = {
  'hit-four': { ms: 2400, strength: .48, labels: () => ['4', 'FOUR!', 'CLASS!'], priority: 1 },
  'hit-six': { ms: 3200, strength: .75, labels: () => ['6', 'SIX!', 'HITMAN!'], priority: 1 },
  fifty: { ms: 3800, strength: .85, labels: () => ['50', 'FIFTY!', 'HITMAN!'], priority: 2 },
  // 150, 250 and 350: the raised bat, and the placards say which.
  raise: { ms: 3800, strength: .85, labels: mark => [String(mark), 'WELL BATTED!', 'HITMAN!'], priority: 2 },
  century: { ms: 4800, strength: 1, labels: () => ['100', 'HERO!', 'TAKE A BOW'], priority: 3 },
  'six-sixes': { ms: 4800, strength: 1, labels: () => ['6 x 6', 'UNREAL!', 'HITMAN!'], priority: 3 },
  double: { ms: 5200, strength: 1, labels: () => ['200', 'DOUBLE!', 'HITMAN!'], priority: 3 },
  triple: { ms: 5200, strength: 1, labels: () => ['300', 'TRIPLE!', 'LEGEND!'], priority: 3 },
  four: { ms: 5600, strength: 1, labels: () => ['400', 'FOUR HUNDRED', 'LEGEND!'], priority: 3 },
};

/** Event-only animation of the existing audience. Four extra draws while cheering,
 * none at rest. Fixed buffers; no meshes or textures allocated per celebration.
 */
export class CrowdCelebration {
  private selected: number[] = [];
  private holders: number[] = [];
  private arms: THREE.InstancedMesh;
  private signs: THREE.InstancedMesh[] = [];
  readonly textures: THREE.CanvasTexture[] = [];
  private canvases: HTMLCanvasElement[] = [];
  private started = -Infinity;
  private moment: CrowdMoment | null = null;
  private settling = false;
  private matrix = new THREE.Matrix4();
  private local = new THREE.Matrix4();
  private position = new THREE.Vector3();
  private end = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private rotation = new THREE.Quaternion();
  private angles = new THREE.Euler();
  private scale = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private mirrored = true;

  constructor(private world: THREE.Object3D, private bodies: THREE.InstancedMesh,
    private heads: THREE.InstancedMesh, private seats: THREE.Matrix4[], private reducedMotion: boolean) {
    // Animate only the spectators visible across the far end, capped for phones.
    const visible: number[] = [];
    for (let i = 0; i < seats.length; i++) {
      const e = seats[i].elements;
      if (e[14] > 32 && Math.abs(e[12]) < 29) visible.push(i);
    }
    const limit = Math.min(320, visible.length);
    for (let i = 0; i < limit; i++) this.selected.push(visible[Math.floor(i * visible.length / limit)]);
    const candidates = this.selected.filter(i => {
      const e = seats[i].elements; return e[13] > 2 && e[13] < 6.7 && Math.abs(e[12]) > 4.6 && Math.abs(e[12]) < 22;
    });
    // Spread placards through both tiers; keep the sightscreen and aisles clear.
    for (const i of candidates) {
      const e = seats[i].elements;
      if (this.holders.filter(j => Math.sign(seats[j].elements[12]) === Math.sign(e[12])).length < 6 && this.holders.every(j => {const f = seats[j].elements; return Math.hypot(e[12]-f[12],(e[13]-f[13])*2) > 3.8;})) this.holders.push(i);
      if (this.holders.length === 12) break;
    }
    this.arms = new THREE.InstancedMesh(new THREE.CylinderGeometry(.055, .065, 1, 5), new THREE.MeshStandardMaterial({ color: 0xe0b692, roughness: .9 }), this.selected.length * 2);
    this.arms.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.arms.frustumCulled = false; this.arms.visible = false;
    world.add(this.arms);
    for (let i = 0; i < 3; i++) {
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 192;
      const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
      map.repeat.x = -1; map.offset.x = 1;
      this.textures.push(map); this.canvases.push(canvas);
      const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.6, .98), new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }), Math.ceil(this.holders.length / 3));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.visible = false; mesh.count = 0;
      this.signs.push(mesh); world.add(mesh);
    }
    bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage); heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  trigger(kind: CrowdMoment, now: number, mark = 0) {
    // A smaller moment waits on a bigger one still up, but not on one already
    // sitting down for the next ball.
    if (this.moment && !this.settling && now < this.started + CROWD_MOMENTS[this.moment].ms && CROWD_MOMENTS[kind].priority < CROWD_MOMENTS[this.moment].priority) return;
    this.moment = kind; this.started = now; this.settling = false;
    const colours = [['#fff6d8', '#153d56'], ['#f5ad42', '#173647'], ['#174c43', '#fff8e5']];
    CROWD_MOMENTS[kind].labels(mark).forEach((label, i) => {
      const ctx = this.canvases[i].getContext('2d')!;
      ctx.fillStyle = colours[i][0]; ctx.fillRect(0, 0, 512, 192);
      ctx.strokeStyle = colours[i][1]; ctx.lineWidth = 9; ctx.strokeRect(9, 9, 494, 174);
      ctx.fillStyle = colours[i][1]; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${label.length > 7 ? 66 : label.length > 3 ? 88 : 132}px Arial`;
      ctx.fillText(label, 256, 104, 464); this.textures[i].needsUpdate = true;
    });
    this.update(now);
  }

  update(now: number) {
    if (!this.moment) return;
    const event = CROWD_MOMENTS[this.moment], age = now - this.started;
    if (age < 0 || age >= event.ms) { this.reset(); return; }
    const mirrored = this.world.scale.x < 0;
    if (mirrored !== this.mirrored) {
      this.mirrored = mirrored;
      this.textures.forEach(t => {t.repeat.x = mirrored ? -1 : 1; t.offset.x = mirrored ? 1 : 0;});
    }
    const envelope = Math.min(1, age / 220, (event.ms - age) / SETTLE_MS);
    this.arms.visible = true; this.arms.count = 0;
    for (let n = 0; n < this.selected.length; n++) {
      const i = this.selected[n], base = this.seats[i];
      const takingPart = n % 10 < Math.ceil(event.strength * 10) || this.holders.includes(i);
      const wave = this.reducedMotion ? 0 : Math.sin(age * .009 - n * .63);
      const lift = takingPart ? envelope * (.28 + (this.reducedMotion ? 0 : Math.max(0, wave) * .17)) : 0;
      this.local.makeTranslation(0, lift, 0); this.matrix.copy(base).multiply(this.local);
      this.bodies.setMatrixAt(i, this.matrix); this.heads.setMatrixAt(i, this.matrix);
      if (!takingPart) continue;
      for (const side of [-1, 1]) {
        this.position.set(side * .19, lift + .1, 0);
        this.end.set(side * (.36 + wave * .035), lift + .66 + wave * .06, -.05);
        this.direction.subVectors(this.end, this.position);
        const length = this.direction.length();
        this.rotation.setFromUnitVectors(this.up, this.direction.multiplyScalar(1 / length));
        this.scale.set(1, length, 1); this.position.add(this.end).multiplyScalar(.5);
        this.local.compose(this.position, this.rotation, this.scale); this.matrix.copy(base).multiply(this.local);
        this.arms.setMatrixAt(this.arms.count++, this.matrix);
      }
    }
    this.bodies.instanceMatrix.needsUpdate = true; this.heads.instanceMatrix.needsUpdate = true; this.arms.instanceMatrix.needsUpdate = true;
    this.signs.forEach(m => {m.count = 0; m.visible = true;});
    const count = this.moment === 'hit-four' ? Math.ceil(this.holders.length * .6) : this.holders.length;
    for (let n = 0; n < count; n++) {
      const base = this.seats[this.holders[n]], mesh = this.signs[n % 3];
      const sway = this.reducedMotion ? 0 : Math.sin(age * .005 + n) * .045;
      this.position.set(0, .92 + envelope * .18, -.3);
      this.rotation.setFromEuler(this.angles.set(0, Math.PI, sway));
      this.scale.setScalar(this.reducedMotion ? 1 : Math.max(.001, envelope));
      this.local.compose(this.position, this.rotation, this.scale); this.matrix.copy(base).multiply(this.local);
      mesh.setMatrixAt(mesh.count++, this.matrix);
    }
    this.signs.forEach(m => {m.instanceMatrix.needsUpdate = true;});
  }

  /**
   * Sit down now rather than see the moment out: the next ball is coming. The
   * same half-second fall as a moment's own end, so nobody drops into a seat.
   */
  settle(now: number) {
    if (!this.moment) return;
    const event = CROWD_MOMENTS[this.moment];
    this.settling = true;
    this.started = Math.min(this.started, now - Math.max(0, event.ms - SETTLE_MS));
  }

  reset() {
    if (this.moment) {
      for (const i of this.selected) {this.bodies.setMatrixAt(i, this.seats[i]); this.heads.setMatrixAt(i, this.seats[i]);}
      this.bodies.instanceMatrix.needsUpdate = this.heads.instanceMatrix.needsUpdate = true;
    }
    this.moment = null; this.started = -Infinity; this.settling = false; this.arms.visible = false; this.signs.forEach(m => {m.visible = false;});
  }
  get state() { return { kind: this.moment, spectators: this.selected.length, banners: this.signs.reduce((n, m) => n + (m.visible ? m.count : 0), 0) }; }
}
