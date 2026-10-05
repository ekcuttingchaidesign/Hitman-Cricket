import { expect, it } from 'vitest';
import * as THREE from 'three';
import { BendingLimb } from '../src/entities/BendingLimb';
import { helmetGeometry } from '../src/entities/helmetGeometry';

it('keeps a connected, outward-facing limb through straight and bent poses without replacing buffers', () => {
  const limb = new BendingLimb(new THREE.MeshStandardMaterial(), [.072, .062, .046]);
  const geometry = limb.mesh.geometry, positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  const a = new THREE.Vector3(0, 1, 0), joint = new THREE.Vector3(0, .7, 0);
  const index = geometry.index!;
  for (const b of [new THREE.Vector3(0, .4, 0), new THREE.Vector3(.28, .68, 0), new THREE.Vector3(.15, .93, .08)]) {
    limb.update(a, joint, b);
    expect(geometry.getAttribute('position')).toBe(positions);
    for (let row = 0; row <= 20; row++) {
      const first = row * 17, last = first + 16;
      expect(new THREE.Vector3().fromBufferAttribute(positions, first).distanceTo(new THREE.Vector3().fromBufferAttribute(positions, last))).toBeLessThan(1e-6);
      for (let i = first; i <= last; i++) expect(new THREE.Vector3().fromBufferAttribute(normals, i).length()).toBeCloseTo(1, 4);
    }
    for (const [row, centre] of [[0, a], [20, b]] as const) {
      const average = new THREE.Vector3();
      for (let i = 0; i < 16; i++) average.add(new THREE.Vector3().fromBufferAttribute(positions, row * 17 + i));
      expect(average.divideScalar(16).distanceTo(centre)).toBeLessThan(1e-6);
    }
    // First ring is straight in all three poses; winding must face outside.
    const p = [0, 1, 2].map(i => new THREE.Vector3().fromBufferAttribute(positions, index.getX(i)));
    const face = p[1].sub(p[0]).cross(p[2].sub(p[0]));
    expect(face.dot(new THREE.Vector3().fromBufferAttribute(normals, index.getX(0)))).toBeGreaterThan(0);
  }
});

it('raises the rear neckline above the ears and gives the shell outward normals', () => {
  const geometry = helmetGeometry(), p = geometry.getAttribute('position'), n = geometry.getAttribute('normal');
  expect(p.getY(20 * 41 + 20) - p.getY(20 * 41 + 10)).toBeGreaterThan(.04);
  const front = 10 * 41;
  expect(n.getZ(front)).toBeGreaterThan(.5);
  for (let i = 0; i < p.count; i++) expect(Number.isFinite(p.getY(i))).toBe(true);
});
