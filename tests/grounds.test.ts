import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_GROUND, askedGround, buildGround, groundFor, groundFrom, ownFloodlights } from '../src/scene/grounds';

const built = (name: 'stadium' | 'bowl' | 'pavilion') => {
  const world = new THREE.Group();
  const lights = buildGround(name, world);
  const meshes: THREE.Mesh[] = [];
  world.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
  const crowd = meshes.filter(mesh => mesh instanceof THREE.InstancedMesh) as THREE.InstancedMesh[];
  return { world, lights, crowd, scenery: meshes.filter(mesh => !(mesh instanceof THREE.InstancedMesh)) };
};

describe('the ground', () => {
  it('is the stadium unless the link asks for the bowl', () => {
    expect(DEFAULT_GROUND).toBe('stadium');
    expect(groundFrom('')).toBe('stadium');
    expect(groundFrom('?debug=1&seed=222')).toBe('stadium');
    expect(groundFrom('?ground=bowl')).toBe('bowl');
    expect(groundFrom('?ground=BOWL&debug=1')).toBe('bowl');
    expect(groundFrom('?ground=pavilion')).toBe('pavilion');
    expect(groundFrom('?ground=members')).toBe('stadium');
  });

  it('plays the Blast under lights at the pavilion, and everything else at the stadium, unless the link asks', () => {
    expect(askedGround('')).toBeNull();
    expect(groundFor(null, true, 'night')).toBe('pavilion');
    expect(groundFor(null, true, 'day')).toBe('stadium');
    expect(groundFor(null, false, 'night')).toBe('stadium');
    expect(groundFor(null, false, 'day')).toBe('stadium');
    // A link's ground is every innings' ground, day or night.
    expect(groundFor(askedGround('?ground=stadium'), true, 'night')).toBe('stadium');
    expect(groundFor(askedGround('?ground=pavilion'), false, 'day')).toBe('pavilion');
  });

  it('batches the stadium by colour and the entire crowd into bodies and heads', () => {
    const { crowd, scenery } = built('stadium');
    expect(crowd).toHaveLength(2);
    expect(crowd[1].count).toBe(crowd[0].count);
    expect(crowd[0].count).toBeGreaterThan(2500);
    // Merged: a mesh for each colour, not a mesh for each box.
    expect(scenery.length).toBeLessThan(16);
    const colours = scenery.map(mesh => (mesh.material as THREE.MeshStandardMaterial).color.getHex());
    expect(new Set(colours).size).toBe(colours.length);
  });

  it.each(['stadium', 'pavilion'] as const)('seats nobody behind the sightscreen at the %s', name => {
    const { crowd } = built(name);
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

  it('builds the pavilion into the stadium\'s batch and crowd, under four towers of its own', () => {
    const { crowd, scenery, lights } = built('pavilion');
    expect(crowd).toHaveLength(2);
    expect(crowd[1].count).toBe(crowd[0].count);
    expect(crowd[0].count).toBeGreaterThan(2500);
    const colours = scenery.map(mesh => (mesh.material as THREE.MeshStandardMaterial).color.getHex());
    expect(new Set(colours).size).toBe(colours.length);
    expect(scenery.length).toBeLessThan(30);
    expect(lights!.towers).toHaveLength(4);
    expect(ownFloodlights('pavilion')).toBe(true);
    // People in its verandahs, up to the second deck, straight behind the bowler.
    const at = new THREE.Vector3(), m = new THREE.Matrix4();
    let upstairs = 0;
    for (let i = 0; i < crowd[0].count; i++) {
      crowd[0].getMatrixAt(i, m); at.setFromMatrixPosition(m);
      if (Math.abs(at.x) < 11 && at.z > 50 && at.y > 7) upstairs++;
    }
    expect(upstairs).toBeGreaterThan(100);
  });

  it('still builds the bowl the way it always was', () => {
    const { world, crowd } = built('bowl');
    expect(crowd).toHaveLength(1);
    expect(crowd[0].count).toBe(1344);
    // Twenty-eight sections, each a group of its own, and the clubhouse beside them.
    expect(world.children.filter(child => child instanceof THREE.Group && !(child instanceof THREE.Mesh))).toHaveLength(28);
  });
});
