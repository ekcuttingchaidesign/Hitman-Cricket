import * as THREE from 'three';
import type { BendingLimb } from './BendingLimb';
import { updateGarmentNormals } from './ConnectedJersey';

/** One trouser surface: waist, tailored rise, crotch and both bending legs. */
export class ConnectedTrousers {
  readonly mesh: THREE.Mesh;
  private loops: number[][] = [];
  private p = new THREE.Vector3();
  private q = new THREE.Vector3();
  private ref = new THREE.Vector3();
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
      } else set(24 + i, Math.sin(angle) * .184, .025, Math.cos(angle) * .122);
    }
    set(48, 0, -.055, .085); set(49, 0, -.098, 0); set(50, 0, -.055, -.085);
    for (let leg = 0; leg < 2; leg++) {
      const source = legs[leg].mesh.geometry.getAttribute('position');
      for (let row = 1; row <= 20; row++) for (let i = 0; i < 16; i++) {
        if (row < 3) {
          this.p.fromBufferAttribute(positions, this.loops[leg][i]);
          this.q.fromBufferAttribute(source, 3 * 17 + i);
          this.p.lerp(this.q, row / 3);
        } else this.p.fromBufferAttribute(source, row * 17 + i);
        positions.setXYZ(this.offset(leg) + (row - 1) * 16 + i, this.p.x, this.p.y, this.p.z);
      }
    }
    positions.needsUpdate = true; updateGarmentNormals(this.mesh.geometry);
  }
}
