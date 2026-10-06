import { expect, it } from 'vitest';
import * as THREE from 'three';
import { Batter, STROKE_DURATION_MS } from '../src/entities/Batter';
import { Cricketer, KIT } from '../src/entities/Cricketer';
import { Bowler } from '../src/entities/Bowler';
import { ADVANCE, GAME } from '../src/config/gameplay';
import type { ConnectedJersey } from '../src/entities/ConnectedJersey';
import type { ConnectedTrousers } from '../src/entities/ConnectedTrousers';

type Garments = { connectedJersey: ConnectedJersey; connectedTrousers: ConnectedTrousers };
function checkWaist(figure: Batter | Cricketer) {
  const rig = figure as unknown as Garments;
  const shirt = rig.connectedJersey.mesh.geometry.getAttribute('position');
  const trousers = rig.connectedTrousers.mesh.geometry.getAttribute('position');
  for (let i = 0; i < 24; i++) for (let axis = 0; axis < 3; axis++)
    expect(trousers.getComponent(i, axis)).toBeCloseTo(shirt.getComponent(i, axis), 6);
  for (const value of trousers.array) expect(Number.isFinite(value)).toBe(true);
}

it('keeps the jersey hem and trouser waist joined in shots, catches and the bowling action', () => {
  const batter = new Batter(), bowler = new Bowler(), fielder = new Cricketer();
  for (const shot of ['STRAIGHT', 'LEG', 'COVER_LONG_OFF', 'REVERSE_SCOOP'] as const) {
    batter.reset();batter.swing(shot,0,0,shot==='LEG'?1.1:.54);
    for(let t=0;t<=940;t+=80){batter.update(t);checkWaist(batter);}
  }
  for(let t=0;t<=2240;t+=80){bowler.animate(t);checkWaist(bowler.figure);}
  for(let i=0;i<=10;i++){fielder.catchAt(i/10);checkWaist(fielder);}
  const geometry = (fielder as unknown as Garments).connectedTrousers.mesh.geometry;
  const index = geometry.index!, edges = new Map<string, number>();
  for(let i=0;i<index.count;i+=3)for(let j=0;j<3;j++){
    const a=index.getX(i+j),b=index.getX(i+(j+1)%3),key=a<b?`${a}:${b}`:`${b}:${a}`;
    edges.set(key,(edges.get(key)??0)+1);
  }
  expect([...edges.values()].filter(n=>n===1)).toHaveLength(56); // waist and two ankles only
  expect([...edges.values()].every(n=>n===1||n===2)).toBe(true);
});

it('redresses the connected fielding surfaces without recolouring skin', () => {
  const figure = new Cricketer(); figure.dress({...KIT,shirt:0xffffff,trousers:0xdddddd,skin:0x986b48});
  const rig=figure as unknown as Garments;
  const [shirt,skin]=rig.connectedJersey.mesh.material as THREE.MeshStandardMaterial[];
  expect(shirt.color.getHex()).toBe(0xffffff);expect(skin.color.getHex()).toBe(0x986b48);
  expect((rig.connectedTrousers.mesh.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xdddddd);
});

it('returns from the charge without teleporting a foot at stride boundaries', () => {
  const batter = new Batter();batter.swing('STRAIGHT',0,0,.54,GAME.contactZ+.76,true);
  let previous: THREE.Vector3[] | undefined, worst=0;
  for(let t=STROKE_DURATION_MS-4;t<=STROKE_DURATION_MS+ADVANCE.walkBackMs;t+=4){
    batter.update(t);const pose=batter.inspect();
    const feet=[pose.frontFoot,pose.backFoot].map(p=>new THREE.Vector3(...p).add(batter.root.position));
    if(previous)for(let i=0;i<2;i++)worst=Math.max(worst,feet[i].distanceTo(previous[i]));
    previous=feet;
  }
  expect(worst).toBeLessThan(.018);
});

it('keeps a supporting foot down while the bowler recovers', () => {
  const bowler=new Bowler();bowler.followThrough(.56);
  expect(Math.min(...bowler.figure.inspect().feet.map(p=>p[1]))).toBeLessThan(.085);
});
