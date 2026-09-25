import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Batter, CHARGE_MEETS_AT } from '../src/entities/Batter';
import { Cricketer, KIT } from '../src/entities/Cricketer';
import { Bowler } from '../src/entities/Bowler';
import { WHITES } from '../src/config/survive';
import { prepareReviewPose } from '../tools/graphics-review-poses';
import { GAME } from '../src/config/gameplay';
import type { ShotType } from '../src/game/types';
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
      for(let time = 0; time < 940; time += 4) {
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
  it('has consistently wound seams and only the intentional neck, cuffs, waist and ankle openings', () => {
    for (const actor of [new Batter(), new Cricketer()]) for (const [meshIndex, mesh] of garments(actor.root).entries()) {
      const edges = new Map<string, { a: number; b: number; count: number; winding: number }>();
      const indices = mesh.geometry.index!;
      for(let i=0;i<indices.count;i+=3) for(let j=0;j<3;j++) {
        const a=indices.getX(i+j),b=indices.getX(i+(j+1)%3),key=a<b?`${a}:${b}`:`${b}:${a}`;
        const edge=edges.get(key)??{a,b,count:0,winding:0};edge.count++;edge.winding+=a<b?1:-1;edges.set(key,edge);
      }
      const boundary = new Map<number,number[]>();
      for(const edge of edges.values()) {
        expect(edge.count).toBeLessThanOrEqual(2);
        if(edge.count===2) expect(edge.winding).toBe(0);
        else for(const [a,b] of [[edge.a,edge.b],[edge.b,edge.a]]) boundary.set(a,[...(boundary.get(a)??[]),b]);
      }
      for(const neighbours of boundary.values()) expect(neighbours.length).toBe(2);
      const seen=new Set<number>();let loops=0;
      for(const start of boundary.keys()) if(!seen.has(start)) {
        loops++;const queue=[start];while(queue.length){const id=queue.pop()!;if(seen.has(id))continue;seen.add(id);queue.push(...boundary.get(id)!);}
      }
      expect(loops).toBe(meshIndex===0?4:3);
    }
  });
  it('keeps cloth clear of the blade through the remaining shot families', () => {
    const cases: [ShotType, number, boolean?, boolean?, boolean?, boolean?][] = [
      ['COVER_LONG_OFF',.54],['LONG_ON',.54],['SQUARE_CUT',1.05],['DEFEND',.54],['SCOOP',.54],['REVERSE_SCOOP',.54],
      ['COVER_LONG_OFF',.54,true],['LONG_ON',.54,true],['STRAIGHT',.54,false,true],['LEG',.48,false,false,true],['LEG',.48,false,false,false,true],
    ];
    const batter=new Batter(),point=new THREE.Vector3();
    for(const [shot,y,charge=false,lofted=false,sweep=false,flat=false] of cases) {
      batter.reset();batter.prepare(1);batter.update(0);
      batter.swing(shot,0,shot==='SQUARE_CUT'?.4:0,y,GAME.contactZ+(charge?CHARGE_MEETS_AT:0),charge,lofted,sweep,flat);
      let intersections=0;
      for(let t=0;t<940;t+=8) {
        batter.update(t);batter.root.updateMatrixWorld(true);const inverse=batter.bat.matrixWorld.clone().invert();
        for(const mesh of garments(batter.root)) {
          const matrix=inverse.clone().multiply(mesh.matrixWorld);
          for(let i=0;i<mesh.geometry.attributes.position.count;i++) {
            mesh.getVertexPosition(i,point).applyMatrix4(matrix);
            if(Math.abs(point.x)<.05&&point.y<-.205&&point.y>-.7&&point.z>-.027&&point.z<.014)intersections++;
          }
        }
      }
      expect(intersections,`${shot}, charge=${charge}, lofted=${lofted}, sweep=${sweep}, flat=${flat}`).toBe(0);
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
    expect(venue.children.filter(object => object instanceof THREE.InstancedMesh).length).toBe(6);
  });
});
