import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GROUND, askedGround, buildGround, groundFor, groundFrom, ownFloodlights, turfOf } from '../src/scene/grounds';
import { paintless } from './paintless';

afterEach(() => { vi.unstubAllGlobals(); });

const built = (name: 'stadium' | 'bowl' | 'pavilion' | 'canopy') => {
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

  it('plays Super10 at the canopy, the Blast at the pavilion or the stadium, and a Test at any of the three, unless the link asks', () => {
    expect(askedGround('')).toBeNull();
    // Super10: the canopy, whatever the coin.
    for (const coin of [0, .3, .5, .9]) expect(groundFor(null, 'super10', coin)).toBe('canopy');
    // The Blast, day or night: the pavilion on the coin's lower half, the stadium on its upper.
    expect(groundFor(null, 'blast', 0)).toBe('pavilion');
    expect(groundFor(null, 'blast', .49)).toBe('pavilion');
    expect(groundFor(null, 'blast', .5)).toBe('stadium');
    expect(groundFor(null, 'blast', .99)).toBe('stadium');
    // A Test: a third each, the pavilion, the stadium, the canopy.
    expect(groundFor(null, 'test', 0)).toBe('pavilion');
    expect(groundFor(null, 'test', .33)).toBe('pavilion');
    expect(groundFor(null, 'test', .34)).toBe('stadium');
    expect(groundFor(null, 'test', .66)).toBe('stadium');
    expect(groundFor(null, 'test', .67)).toBe('canopy');
    expect(groundFor(null, 'test', .99)).toBe('canopy');
    // Even shares over a fine sweep of the coin.
    const count = (game: 'blast' | 'test') => {
      const seen: Record<string, number> = {};
      for (let i = 0; i < 3000; i++) { const g = groundFor(null, game, (i + .5) / 3000); seen[g] = (seen[g] ?? 0) + 1; }
      return seen;
    };
    expect(count('blast')).toEqual({ pavilion: 1500, stadium: 1500 });
    expect(count('test')).toEqual({ pavilion: 1000, stadium: 1000, canopy: 1000 });
    // A link's ground is every innings' ground, whatever the game and the coin.
    expect(groundFor(askedGround('?ground=stadium'), 'blast', 0)).toBe('stadium');
    expect(groundFor(askedGround('?ground=pavilion'), 'super10', .9)).toBe('pavilion');
    expect(groundFor(askedGround('?ground=arena'), 'test', .5)).toBe('arena');
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

  it('lays the brighter turf at the pavilion and the canopy only, the stadium keeping its own', () => {
    expect(turfOf('pavilion')).toBe('fresh');
    expect(turfOf('canopy')).toBe('fresh');
    for (const name of ['stadium', 'bowl', 'arena'] as const) expect(turfOf(name)).toBe('classic');
  });

  it('builds the canopy: a packed house, its own towers, a screen that reads the right way round, lit at night', () => {
    paintless();
    const { crowd, scenery, lights } = built('canopy');
    expect(crowd).toHaveLength(2);
    expect(crowd[0].count).toBeGreaterThan(4000);
    expect(lights!.towers).toHaveLength(4);
    expect(ownFloodlights('canopy')).toBe(true);
    // Its screen hangs in the scene, not the mirrored stage; its windows, soffits and roof are lit at night.
    expect(lights!.unmirrored?.map(o => o.name)).toEqual(['Big screen', 'Skyline']);
    expect(lights!.unmirrored![1].userData.nightOnly).toBe(true);
    // The screen is handed over for the brand to paint: its mark and the score, and its moments.
    expect(lights!.screen?.texture).toBe((lights!.unmirrored![0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.map);
    expect(lights!.warm?.length).toBeGreaterThanOrEqual(3);
    expect(lights!.spots!.length).toBeGreaterThan(200);
    expect(scenery.map(m => m.name)).toEqual(expect.arrayContaining(['Canopy', 'Canopy underside', 'Canopy rim']));
    // Nobody straight behind the sightscreen below its top, where they would move behind the bowler's arm: the block is glass and dark there.
    const at = new THREE.Vector3(), m = new THREE.Matrix4();
    let behind = 0;
    for (let i = 0; i < crowd[0].count; i++) {
      crowd[0].getMatrixAt(i, m); at.setFromMatrixPosition(m);
      if (Math.abs(at.x) < 3.5 && at.z > 45 && at.y < 3.4) behind++;
    }
    expect(behind).toBe(0);
  });

  it('still builds the bowl the way it always was', () => {
    const { world, crowd } = built('bowl');
    expect(crowd).toHaveLength(1);
    expect(crowd[0].count).toBe(1344);
    // Twenty-eight sections, each a group of its own, and the clubhouse beside them.
    expect(world.children.filter(child => child instanceof THREE.Group && !(child instanceof THREE.Mesh))).toHaveLength(28);
  });
});
