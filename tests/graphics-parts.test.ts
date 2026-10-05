import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { compactRigidParts, LimbInstances } from '../src/entities/compactParts';
import { jerseyGeometry } from '../src/entities/garment';

describe('graphics experiment geometry', () => {
  it('bakes rigid local transforms while retaining material and kit role', () => {
    const root = new THREE.Group(), material = new THREE.MeshStandardMaterial();
    for (const x of [-2, 2]) {
      const part = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
      part.position.x = x; part.userData.role = 'shirt'; root.add(part);
    }
    const [merged] = compactRigidParts(root);
    expect(root.children).toHaveLength(1);
    expect(merged.material).toBe(material);
    expect(merged.userData.role).toBe('shirt');
    merged.geometry.computeBoundingBox();
    expect(merged.geometry.boundingBox!.min.x).toBeCloseTo(-2.5);
    expect(merged.geometry.boundingBox!.max.x).toBeCloseTo(2.5);
  });
  it('keeps nested rig controls independent and copies animated local matrices', () => {
    const root = new THREE.Group(); root.scale.x = -1;
    const geometry = new THREE.SphereGeometry(1, 8, 6), material = new THREE.MeshStandardMaterial();
    const a = new THREE.Mesh(geometry, material), b = new THREE.Mesh(geometry, material);
    const control = new THREE.Mesh(geometry, material); control.add(new THREE.Group());
    root.add(a, b, control);
    const batch = new LimbInstances(root);
    expect(batch.meshes).toHaveLength(1);
    expect(control.visible).toBe(true);
    a.position.set(1, 2, 3); a.rotation.z = .8; a.scale.set(.2, .4, .3);
    batch.update();
    const matrix = new THREE.Matrix4(); batch.meshes[0].getMatrixAt(0, matrix);
    matrix.elements.forEach((v, i) => expect(v).toBeCloseTo(a.matrix.elements[i], 5));
    expect(matrix.determinant()).toBeGreaterThan(0);
    expect(a.visible).toBe(false);
  });
  it('has a finite, outward-facing jersey and a smooth wrap seam', () => {
    const geometry = jerseyGeometry(), positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    for (let i = 0; i < positions.count; i++) {
      expect(Number.isFinite(positions.getY(i))).toBe(true);
      expect(positions.getX(i) * normals.getX(i) + positions.getZ(i) * normals.getZ(i)).toBeGreaterThan(0);
    }
    for (let row = 0; row <= 32; row++) {
      const a = row * 25, b = a + 24;
      expect(normals.getZ(a)).toBeCloseTo(normals.getZ(b), 5);
    }
  });
});
