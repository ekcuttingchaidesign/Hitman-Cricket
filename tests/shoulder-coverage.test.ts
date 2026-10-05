import { expect, it } from 'vitest';
import * as THREE from 'three';
import { Batter, CELEBRATION_MS, FIFTY_MS, STROKE_DURATION_MS, CHARGE_MEETS_AT } from '../src/entities/Batter';
import { GAME, SHOTS } from '../src/config/gameplay';
import type { ConnectedJersey } from '../src/entities/ConnectedJersey';
import type { ShotType } from '../src/game/types';

it('keeps shoulders topologically joined to the torso throughout shots and celebrations', () => {
  const batter = new Batter();
  const rig = batter as unknown as { connectedJersey: ConnectedJersey };
  const geometry = rig.connectedJersey.mesh.geometry;
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  const indices = geometry.index!;
  const edges = new Map<string, number>();
  const edgeKey = (a: number,b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
  for(let i=0;i<indices.count;i+=3)for(let j=0;j<3;j++){
    const key=edgeKey(indices.getX(i+j),indices.getX(i+(j+1)%3));
    edges.set(key,(edges.get(key)??0)+1);
  }
  // Only waist, collar and wrists may be open. Shoulder edges share vertices
  // with a face on either side, so animation cannot pull two meshes apart.
  expect([...edges.values()].filter(n=>n===1)).toHaveLength(96);
  expect([...edges.values()].every(n=>n===1||n===2)).toBe(true);
  for(const loop of rig.connectedJersey.loops)for(let i=0;i<loop.length;i++)
    expect(edges.get(edgeKey(loop[i],loop[(i+1)%loop.length]))).toBe(2);
  let checked=0;
  const point=new THREE.Vector3(),normal=new THREE.Vector3();
  const used=[...new Set(Array.from(indices.array))];
  function check(label: string) {
    expect(geometry.getAttribute('position')).toBe(positions);
    for(const i of used){
      point.fromBufferAttribute(positions,i);normal.fromBufferAttribute(normals,i);
      if(!point.toArray().every(Number.isFinite)||Math.abs(normal.length()-1)>1e-4)
        throw new Error(`${label}: invalid garment vertex ${i}`);
      checked++;
    }
  }
  const shots: {shot: ShotType; y: number; charge?: boolean; loft?: boolean; sweep?: boolean; flat?: boolean}[] = [
    ...[...SHOTS, 'DEFEND' as ShotType].flatMap(shot => [.54, 1.12].map(y => ({shot,y}))),
    {shot:'STRAIGHT',y:.54,loft:true}, {shot:'LONG_ON',y:.54,loft:true},
    ...(['STRAIGHT','COVER_LONG_OFF','LONG_ON'] as ShotType[]).map(shot=>({shot,y:.54,charge:true})),
    {shot:'LEG',y:.48,sweep:true}, {shot:'LEG',y:.48,flat:true},
  ];
  for (const spec of shots) for (const x of [-.55, 0, .55]) {
    batter.reset(); batter.prepare(1); batter.update(0);
    batter.swing(spec.shot,0,x,spec.y,GAME.contactZ+(spec.charge?CHARGE_MEETS_AT:0),spec.charge??false,spec.loft??false,spec.sweep??false,spec.flat??false);
    for (let t=0;t<=STROKE_DURATION_MS;t+=80) {batter.update(t);check(`${spec.shot} @ ${t}, x=${x}, y=${spec.y}`);}
  }
  for (const mild of [true,false]) {
    batter.reset();batter.celebrate(0,mild);
    for(let t=0;t<=(mild?FIFTY_MS:CELEBRATION_MS);t+=80){batter.update(t);check(`celebration @ ${t}`);}
  }
  expect(checked).toBeGreaterThan(10000);
}, 60000);
