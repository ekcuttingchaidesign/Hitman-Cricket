import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Batter } from '../src/entities/Batter';
import { Cricketer, KIT } from '../src/entities/Cricketer';
import { Bowler } from '../src/entities/Bowler';
import { WHITES } from '../src/config/survive';
import { prepareReviewPose } from '../tools/graphics-review-poses';
import { createVenue } from '../src/scene/visuals/venue';
function garments(root: THREE.Object3D) {
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverseVisible(mesh => {
    if(mesh instanceof THREE.SkinnedMesh)
      meshes.push(mesh);
  });
  return meshes;
}
describe('rendered graphics surfaces', () => {
  it('keeps the actual deformed clothing outside the blade core in the demanding review poses', () => {
    const batter = new Batter(), point = new THREE.Vector3();
    for(const action of ['guard', 'drive', 'pull', 'charge'] as const) {
      prepareReviewPose(batter, action);
      for(const time of [0, 110, 230, 300, 410, 615, 900]) {
        batter.update(time);
        batter.root.updateMatrixWorld(true);
        const inverse = batter.bat.matrixWorld.clone().invert();
        let intersections = 0, invalid = 0;
        for(const mesh of garments(batter.root)) {
          const matrix = inverse.clone().multiply(mesh.matrixWorld);
          // These are skinned vertices, not the retained rig diagnostic primitives.
          for(let i = 0; i < mesh.geometry.attributes.position.count; i++) {
            mesh.getVertexPosition(i, point);
            point.applyMatrix4(matrix);
            if(!Number.isFinite(point.lengthSq()))
              invalid++;
            if(Math.abs(point.x) < .050 && point.y < -.205 && point.y > -.70 && point.z > -.027 && point.z < .014)
              intersections++;
          }
        }
        expect(invalid, `${action}@${time}: invalid surface`).toBe(0);
        expect(intersections, `${action}@${time}: cloth inside blade core`).toBe(0);
      }
    }
  });
  it('changes both new garments with the mode', () => {
    const batter = new Batter();
    batter.dress(true);
    const [shirt, trousers] = garments(batter.root);
    expect((shirt.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xf2ece0);
    expect((trousers.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xf4f0e4);
    batter.dress(false);
    expect((shirt.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x19334a);
    const fielder = new Cricketer();
    fielder.dress(WHITES);
    const [top, bottom] = garments(fielder.root);
    expect((top.material as THREE.MeshStandardMaterial).color.getHex()).toBe(WHITES.shirt);
    expect((bottom.material as THREE.MeshStandardMaterial).color.getHex()).toBe(WHITES.trousers);
    fielder.dress(KIT);
    expect((top.material as THREE.MeshStandardMaterial).color.getHex()).toBe(KIT.shirt);
  });
  it('keeps bowling clothing finite and attached throughout release and follow-through', () => {
    const bowler = new Bowler(), point = new THREE.Vector3();
    for(const time of [0, 400, 800, 1000, 1200, 1600, 2000]) {
      bowler.animate(time);
      bowler.root.updateMatrixWorld(true);
      for(const mesh of garments(bowler.root))
        for(let i = 0; i < mesh.geometry.attributes.position.count; i += 6) {
          mesh.getVertexPosition(i, point);
          expect(Number.isFinite(point.lengthSq())).toBe(true);
          expect(point.length()).toBeLessThan(3.5);
        }
    }
  });
  it('constructs valid merged stadium geometry and seated crowd batches', () => {
    const errors: string[] = [];
    const venue = createVenue();
    let meshes = 0;
    venue.traverse(object => {
      if(object instanceof THREE.Mesh) {
        meshes++;
        if(!object.geometry?.attributes.position?.count)
          errors.push(object.name);
      }
    });
    expect(errors).toEqual([]);
    expect(meshes).toBeLessThan(240);
    expect(venue.children.filter(object => object instanceof THREE.InstancedMesh).length).toBe(5);
  });
});
