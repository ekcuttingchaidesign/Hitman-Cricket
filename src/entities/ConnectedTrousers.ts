import * as THREE from 'three';
import type { BendingLimb } from './BendingLimb';
import { updateGarmentNormals } from './ConnectedJersey';

/**
 * How many rows down each leg the trousers take to become the leg: the hip
 * and the seat live here, so they are blended on a curve rather than in a
 * straight line, which left a slab behind him and a corner at each hip.
 */
const SEAT_ROWS = 4;
/** How far the seat stands out behind the line from hip to thigh, at its fullest. */
const SEAT = .034;
/** And the hips past the thigh at the sides, so the leg grows out of them. */
const HIP = .018;
/** How far the seat's curve hangs from the opening before it turns, as a share of the way to the thigh. */
const FALL = .7;

/** One trouser surface: waist, tailored rise, crotch and both bending legs. */
export class ConnectedTrousers {
  readonly mesh: THREE.Mesh;
  private loops: number[][] = [];
  private p = new THREE.Vector3();
  private q = new THREE.Vector3();
  private ref = new THREE.Vector3();
  private inverse = new THREE.Quaternion();
  private offset(i: number) { return 51 + i * 320; }
  constructor(material: THREE.Material) {
    const indices: number[] = [], count = 691;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const uv = new Float32Array(count * 2);
    for (let i = 0; i < 24; i++) {
      const next = (i + 1) % 24;
      indices.push(i, i + 24, next, next, i + 24, next + 24);
      uv[i * 2] = uv[(i + 24) * 2] = i / 24; uv[i * 2 + 1] = .12;
    }
    // Half a waist plus the shared crotch seam makes each closed leg opening.
    this.loops = [
      [...Array.from({ length: 13 }, (_, i) => 24 + (24 - i) % 24), 50, 49, 48],
      [...Array.from({ length: 13 }, (_, i) => 24 + 12 - i), 48, 49, 50],
    ];
    for (let leg = 0; leg < 2; leg++) {
      const at = (row: number, i: number) => row === 0 ? this.loops[leg][i % 16] : this.offset(leg) + (row - 1) * 16 + i % 16;
      for (let row = 0; row < 20; row++) for (let i = 0; i < 16; i++) {
        const a = at(row, i), b = at(row + 1, i), c = at(row, i + 1), d = at(row + 1, i + 1);
        indices.push(a, c, b, c, d, b);
        uv[b * 2] = i / 16; uv[b * 2 + 1] = (row + 1) / 20;
      }
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geometry.setIndex(indices);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 3);
    this.mesh = new THREE.Mesh(geometry, material); this.mesh.name = 'Continuous tailored trousers';
    this.mesh.castShadow = this.mesh.receiveShadow = true;
  }
  reference(leg: number, hips: THREE.Object3D) {
    return this.ref.set(leg === 0 ? .065 : -.065, 0, leg === 0 ? .122 : -.122).applyQuaternion(hips.quaternion);
  }
  update(hips: THREE.Object3D, legs: BendingLimb[], torso: THREE.Object3D) {
    const positions = this.mesh.geometry.getAttribute('position');
    const set = (id: number, x: number, y: number, z: number) => {
      this.p.set(x, y, z).applyQuaternion(hips.quaternion).add(hips.position);
      positions.setXYZ(id, this.p.x, this.p.y, this.p.z);
    };
    for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 24; i++) {
      const angle = i / 24 * Math.PI * 2;
      if (ring === 0) {
        // Follow the actual jersey hem through twists and bends. A waist tied
        // only to the pelvis lets the shirt poke through the back of the pants.
        this.p.set(Math.sin(angle) * .164, -.337, Math.cos(angle) * .124)
          .applyQuaternion(torso.quaternion).add(torso.position);
        positions.setXYZ(i, this.p.x, this.p.y, this.p.z);
      } else {
        // Below the shirt's hem, so the cloth falls from it rather than folding
        // back up; and deeper behind than in front, the top of the seat.
        const z = Math.cos(angle);
        set(24 + i, Math.sin(angle) * .17, -.02, z * (z < 0 ? .15 : .122));
      }
    }
    // The crotch seam: front, under, and behind, where it is set low and well
    // back so the seat is whole at the top and parts only lower down.
    set(48, 0, -.055, .085); set(49, 0, -.098, 0); set(50, 0, -.085, -.125);
    this.inverse.copy(hips.quaternion).invert();
    for (let leg = 0; leg < 2; leg++) {
      const source = legs[leg].mesh.geometry.getAttribute('position');
      const outside = leg === 0 ? -1 : 1;
      for (let row = 1; row <= 20; row++) for (let i = 0; i < 16; i++) {
        if (row <= SEAT_ROWS) {
          // From the opening to the leg, worked in the hips' own frame so that
          // behind him is behind him however he turns.
          const t = row / (SEAT_ROWS + 1);
          this.p.fromBufferAttribute(positions, this.loops[leg][i]).sub(hips.position).applyQuaternion(this.inverse);
          this.q.fromBufferAttribute(source, (SEAT_ROWS + 1) * 17 + i).sub(hips.position).applyQuaternion(this.inverse);
          // Behind and at the sides the cloth falls from the hip before it
          // turns into the thigh. Straight from the opening to a thigh raised
          // in front, as in the sweep's front leg, the seat folded forward
          // under the hem and left a gap there to see into from behind. So a
          // curve whose first handle hangs straight down from the opening,
          // furthest behind and not at all in front.
          const fall = FALL * (1 - this.p.z / (Math.hypot(this.p.x, this.p.z) || 1)) / 2 * this.p.distanceTo(this.q);
          this.p.multiplyScalar((1 - t) ** 2 + 2 * t * (1 - t)).addScaledVector(this.q, t * t);
          this.p.y -= 2 * t * (1 - t) * fall;
          // Rounded out behind, fullest halfway down, and a little at the
          // outside of each hip; nothing in front or between the legs.
          const swell = Math.sin(t ** .7 * Math.PI);
          const behind = Math.max(0, -this.p.z) / (Math.hypot(this.p.x, this.p.z) || 1);
          const side = Math.max(0, this.p.x * outside) / (Math.hypot(this.p.x, this.p.z) || 1);
          this.p.z -= SEAT * swell * behind * behind;
          this.p.x += outside * HIP * swell * side * side;
          this.p.applyQuaternion(hips.quaternion).add(hips.position);
        } else this.p.fromBufferAttribute(source, row * 17 + i);
        positions.setXYZ(this.offset(leg) + (row - 1) * 16 + i, this.p.x, this.p.y, this.p.z);
      }
    }
    positions.needsUpdate = true; updateGarmentNormals(this.mesh.geometry);
  }
}
