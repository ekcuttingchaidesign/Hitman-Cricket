import * as THREE from 'three';
import { jerseyGeometry } from './garment';
import type { BendingLimb } from './BendingLimb';

/** Torso, shoulder gussets and arms share vertices: no inserted tubes or joint caps. */
export class ConnectedJersey {
  readonly mesh: THREE.Mesh;
  readonly loops: number[][] = [];
  private base = jerseyGeometry(16, 24);
  private torsoCount = 17 * 24;
  private point = new THREE.Vector3();
  private start = new THREE.Vector3();
  private end = new THREE.Vector3();
  private normal = new THREE.Vector3();
  private tangent = new THREE.Vector3();
  private axis = new THREE.Vector3();
  private ref = new THREE.Vector3();
  private armOffset(i: number) { return this.torsoCount + i * 20 * 24; }

  constructor(materials: THREE.Material[]) {
    const shirt: number[] = [], skin: number[] = [];
    const vertex = (j: number, i: number) => j * 24 + i % 24;
    for (let j = 0; j < 16; j++) for (let i = 0; i < 24; i++) {
      if (j >= 7 && j < 13 && ((i >= 3 && i < 9) || (i >= 15 && i < 21))) continue;
      const a = vertex(j, i), b = vertex(j + 1, i), c = vertex(j, i + 1), d = vertex(j + 1, i + 1);
      shirt.push(a, c, b, c, d, b);
    }
    // Match left/right IK order. Each opening has 24 vertices, like an arm ring.
    for (const [arm, left] of [15, 3].entries()) {
      const loop: number[] = [];
      for (let i = left; i < left + 6; i++) loop.push(vertex(7, i));
      for (let j = 7; j < 13; j++) loop.push(vertex(j, left + 6));
      for (let i = left + 6; i > left; i--) loop.push(vertex(13, i));
      for (let j = 13; j > 7; j--) loop.push(vertex(j, left));
      this.loops.push(loop);
      const at = (row: number, i: number) => row === 0 ? loop[i % 24] : this.armOffset(arm) + (row - 1) * 24 + i % 24;
      for (let row = 0; row < 20; row++) for (let i = 0; i < 24; i++) {
        const a = at(row, i), b = at(row + 1, i), c = at(row, i + 1), d = at(row + 1, i + 1);
        (row < 11 ? shirt : skin).push(a, c, b, c, d, b);
      }
    }
    const geometry = new THREE.BufferGeometry(), count = this.torsoCount + 2 * 20 * 24;
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setIndex([...shirt, ...skin]);
    geometry.addGroup(0, shirt.length, 0); geometry.addGroup(shirt.length, skin.length, 1);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 3);
    this.mesh = new THREE.Mesh(geometry, materials);
    this.mesh.name = 'Continuous jersey shoulders and arms';
    this.mesh.castShadow = this.mesh.receiveShadow = true;
  }

  reference(arm: number, torso: THREE.Object3D) {
    const p = this.base.getAttribute('position');
    const id = this.loops[arm][0], j = Math.floor(id / 24), i = id % 24;
    return this.ref.fromBufferAttribute(p, j * 25 + i)
      .sub(this.point.set(arm === 0 ? -.20 : .20, .025, 0)).applyQuaternion(torso.quaternion);
  }

  update(torso: THREE.Object3D, arms: BendingLimb[]) {
    const positions = this.mesh.geometry.getAttribute('position'), source = this.base.getAttribute('position');
    const normals = this.base.getAttribute('normal');
    for (let j = 0; j <= 16; j++) for (let i = 0; i < 24; i++) {
      this.point.fromBufferAttribute(source, j * 25 + i).applyQuaternion(torso.quaternion).add(torso.position);
      positions.setXYZ(j * 24 + i, this.point.x, this.point.y, this.point.z);
    }
    for (let arm = 0; arm < 2; arm++) {
      const limb = arms[arm].mesh.geometry.getAttribute('position');
      for (let row = 1; row <= 20; row++) for (let i = 0; i < 24; i++) {
        if (row >= 4) this.point.fromBufferAttribute(limb, row * 25 + i);
        else {
          const id = this.loops[arm][i], j = Math.floor(id / 24), side = id % 24;
          this.start.fromBufferAttribute(positions, id);
          this.end.fromBufferAttribute(limb, 4 * 25 + i);
          this.normal.fromBufferAttribute(normals, j * 25 + side).applyQuaternion(torso.quaternion);
          // Leave the torso along its surface; arrive tangent to the upper arm.
          this.tangent.subVectors(this.end, this.start);
          this.tangent.addScaledVector(this.normal, -this.tangent.dot(this.normal)).normalize().multiplyScalar(.12);
          this.axis.fromBufferAttribute(limb, 5 * 25 + i).sub(this.end).multiplyScalar(4);
          const t = row / 4, t2 = t * t, t3 = t2 * t;
          this.point.copy(this.start).multiplyScalar(2 * t3 - 3 * t2 + 1)
            .addScaledVector(this.tangent, t3 - 2 * t2 + t)
            .addScaledVector(this.end, -2 * t3 + 3 * t2)
            .addScaledVector(this.axis, t3 - t2);
        }
        positions.setXYZ(this.armOffset(arm) + (row - 1) * 24 + i, this.point.x, this.point.y, this.point.z);
      }
    }
    positions.needsUpdate = true;
    this.updateNormals();
  }

  private updateNormals() {
    // Accumulate directly into the existing arrays. This runs every frame;
    // avoid per-triangle BufferAttribute access and temporary vector work.
    const geometry = this.mesh.geometry;
    const p = geometry.getAttribute('position').array as Float32Array;
    const attribute = geometry.getAttribute('normal'), n = attribute.array as Float32Array;
    const index = geometry.index!.array;
    n.fill(0);
    for (let i = 0; i < index.length; i += 3) {
      const a = index[i] * 3, b = index[i + 1] * 3, c = index[i + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
      n[a] += x; n[a + 1] += y; n[a + 2] += z;
      n[b] += x; n[b + 1] += y; n[b + 2] += z;
      n[c] += x; n[c + 1] += y; n[c + 2] += z;
    }
    for (let i = 0; i < n.length; i += 3) {
      const inverse = 1 / (Math.sqrt(n[i] ** 2 + n[i + 1] ** 2 + n[i + 2] ** 2) || 1);
      n[i] *= inverse; n[i + 1] *= inverse; n[i + 2] *= inverse;
    }
    attribute.needsUpdate = true;
  }
}
