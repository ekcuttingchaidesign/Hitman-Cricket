import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_GROUND, buildGround, groundFrom } from '../src/scene/grounds';

describe('the ground', () => {
  it('is the pavilion ground unless the link asks for the bowl', () => {
    expect(DEFAULT_GROUND).toBe('pavilion');
    expect(groundFrom('')).toBe('pavilion');
    expect(groundFrom('?debug=1&seed=222')).toBe('pavilion');
    expect(groundFrom('?ground=bowl')).toBe('bowl');
    expect(groundFrom('?ground=BOWL&debug=1')).toBe('bowl');
    expect(groundFrom('?ground=lords')).toBe('pavilion');
  });

  it('builds the pavilion ground from a handful of meshes, one a colour, and a crowd', () => {
    const world = new THREE.Group();
    buildGround('pavilion', world);
    const meshes: THREE.Mesh[] = [];
    world.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
    const crowd = meshes.filter(mesh => mesh instanceof THREE.InstancedMesh) as THREE.InstancedMesh[];
    expect(crowd).toHaveLength(1);
    // Twenty-five sections of seven rows of twelve, and three rows of benches.
    expect(crowd[0].count).toBe(25 * 7 * 12 + 3 * 32);
    // Merged: a mesh for each colour, not a mesh for each box.
    const merged = meshes.filter(mesh => !(mesh instanceof THREE.InstancedMesh));
    expect(merged.length).toBeLessThan(20);
    const stands = merged.filter(mesh => mesh.parent === world);
    expect(new Set(stands.map(mesh => (mesh.material as THREE.MeshStandardMaterial).color.getHex())).size).toBe(stands.length);
  });

  it('still builds the bowl the way it always was', () => {
    const world = new THREE.Group();
    buildGround('bowl', world);
    const crowd = world.children.filter(child => child instanceof THREE.InstancedMesh) as THREE.InstancedMesh[];
    expect(crowd).toHaveLength(1);
    expect(crowd[0].count).toBe(1344);
    // Twenty-eight sections, each a group of its own, and the clubhouse beside them.
    expect(world.children.filter(child => child instanceof THREE.Group && !(child instanceof THREE.Mesh))).toHaveLength(28);
  });
});
