import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_GROUND, buildGround, groundFrom, ownFloodlights } from '../src/scene/grounds';

const built = (name: 'stadium' | 'bowl') => {
  const world = new THREE.Group();
  buildGround(name, world);
  const meshes: THREE.Mesh[] = [];
  world.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
  const crowd = meshes.filter(mesh => mesh instanceof THREE.InstancedMesh) as THREE.InstancedMesh[];
  return { world, crowd, scenery: meshes.filter(mesh => !(mesh instanceof THREE.InstancedMesh)) };
};

describe('the ground', () => {
  it('is the stadium unless the link asks for the bowl', () => {
    expect(DEFAULT_GROUND).toBe('stadium');
    expect(groundFrom('')).toBe('stadium');
    expect(groundFrom('?debug=1&seed=222')).toBe('stadium');
    expect(groundFrom('?ground=bowl')).toBe('bowl');
    expect(groundFrom('?ground=BOWL&debug=1')).toBe('bowl');
    expect(groundFrom('?ground=pavilion')).toBe('stadium');
  });

  it('builds the stadium from a mesh a colour and one crowd', () => {
    const { crowd, scenery } = built('stadium');
    expect(crowd).toHaveLength(1);
    expect(crowd[0].count).toBeGreaterThan(2500);
    // Merged: a mesh for each colour, not a mesh for each box.
    expect(scenery.length).toBeLessThan(16);
    const colours = scenery.map(mesh => (mesh.material as THREE.MeshStandardMaterial).color.getHex());
    expect(new Set(colours).size).toBe(colours.length);
  });

  it('seats nobody behind the sightscreen', () => {
    const { crowd } = built('stadium');
    const at = new THREE.Vector3(), m = new THREE.Matrix4();
    let behind = 0;
    for (let i = 0; i < crowd[0].count; i++) {
      crowd[0].getMatrixAt(i, m);
      at.setFromMatrixPosition(m);
      // The lower tier straight behind the bowler's arm.
      if (Math.abs(at.x) < 3.5 && at.z > 45 && at.y < 4.5) behind++;
    }
    expect(behind).toBe(0);
  });

  it('lights the stadium itself, and leaves the bowl its four poles', () => {
    expect(ownFloodlights('stadium')).toBe(true);
    expect(ownFloodlights('bowl')).toBe(false);
  });

  it('still builds the bowl the way it always was', () => {
    const { world, crowd } = built('bowl');
    expect(crowd).toHaveLength(1);
    expect(crowd[0].count).toBe(1344);
    // Twenty-eight sections, each a group of its own, and the clubhouse beside them.
    expect(world.children.filter(child => child instanceof THREE.Group && !(child instanceof THREE.Mesh))).toHaveLength(28);
  });
});
