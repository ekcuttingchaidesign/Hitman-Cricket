import { expect, it } from 'vitest';
import * as THREE from 'three';
import { Batter, CELEBRATION_LENGTHS, type Celebration, STROKE_DURATION_MS } from '../src/entities/Batter';
import { Cricketer, KIT } from '../src/entities/Cricketer';
import { Bowler } from '../src/entities/Bowler';
import { ADVANCE, GAME } from '../src/config/gameplay';
import type { ConnectedJersey } from '../src/entities/ConnectedJersey';
import type { ConnectedTrousers } from '../src/entities/ConnectedTrousers';

type Garments = { connectedJersey: ConnectedJersey; connectedTrousers: ConnectedTrousers };
function checkWaist(figure: Batter) {
  figure.drape();
  const rig = figure as unknown as Garments;
  const shirt = rig.connectedJersey.mesh.geometry.getAttribute('position');
  const trousers = rig.connectedTrousers.mesh.geometry.getAttribute('position');
  for (let i = 0; i < 24; i++) for (let axis = 0; axis < 3; axis++)
    expect(trousers.getComponent(i, axis)).toBeCloseTo(shirt.getComponent(i, axis), 6);
  for (const value of trousers.array) expect(Number.isFinite(value)).toBe(true);
}

it('keeps the jersey hem and trouser waist joined in every shot and celebration', () => {
  // The batter only: the bowler and fielders keep the rigid figure, so they
  // pay nothing per frame for a surface nobody sees from that far away.
  const batter = new Batter();
  for (const shot of ['STRAIGHT', 'LEG', 'COVER_LONG_OFF', 'REVERSE_SCOOP'] as const) {
    batter.reset();batter.swing(shot,0,0,shot==='LEG'?1.1:.54);
    for(let t=0;t<=940;t+=80){batter.update(t);checkWaist(batter);}
  }
  for (const kind of Object.keys(CELEBRATION_LENGTHS) as Celebration[]) {
    batter.reset();batter.celebrate(0,kind);
    for(let t=0;t<=CELEBRATION_LENGTHS[kind];t+=80){batter.update(t);checkWaist(batter);}
  }
  const geometry = (batter as unknown as Garments).connectedTrousers.mesh.geometry;
  const index = geometry.index!, edges = new Map<string, number>();
  for(let i=0;i<index.count;i+=3)for(let j=0;j<3;j++){
    const a=index.getX(i+j),b=index.getX(i+(j+1)%3),key=a<b?`${a}:${b}`:`${b}:${a}`;
    edges.set(key,(edges.get(key)??0)+1);
  }
  expect([...edges.values()].filter(n=>n===1)).toHaveLength(56); // waist and two ankles only
  expect([...edges.values()].every(n=>n===1||n===2)).toBe(true);
});

it('tucks the seat by where the thigh points: whole in the guard, away in a drive\'s finish', () => {
  // The swell behind the seat, kept with a thigh lifted out in front, turned
  // forward under him as a point at the bottom of the seat. It was tucked by
  // a reading that followed the hips turning over the thigh, which tucked a
  // thigh hanging behind him and threw the swell off and on in a frame while
  // the leg hardly moved; it goes by the thigh's own direction now.
  const batter = new Batter();
  const tucked = () => { batter.drape(); return (batter as unknown as Garments).connectedTrousers.tucked; };
  batter.reset(); batter.update(0);
  expect(tucked()).toEqual([0, 0]);
  // Every drive's held finish, the front thigh well out in front: all of it away.
  for (const [shot, x, y, z, version] of [
    ['COVER_LONG_OFF', .16, .48, GAME.contactZ, 1], ['COVER_LONG_OFF', .16, .48, GAME.contactZ, 2],
    ['COVER_LONG_OFF', .16, .48, GAME.contactZ + .28, 3], ['STRAIGHT', 0, .54, GAME.contactZ, 2],
  ] as const) {
    batter.reset(); batter.update(0); batter.swing(shot, 0, x, y, z, false, false, false, false, version);
    for (let t = 410; t <= 600; t += 40) { batter.update(t); expect(tucked()[0]).toBeGreaterThan(.95); }
  }
  // Strokes whose front thigh hardly lifts take no more than half of it away
  // (the flick a third, at 240 ms), where every one of them used to lose the
  // lot.
  for (const [shot, x, y] of [['LEG', 0, .54], ['SQUARE_CUT', .4, .92]] as const) {
    batter.reset(); batter.update(0); batter.swing(shot, 0, x, y, GAME.contactZ);
    for (let t = 0; t <= STROKE_DURATION_MS; t += 20) { batter.update(t); expect(Math.max(...tucked())).toBeLessThan(.5); }
  }
  // And home again in his guard, whole.
  batter.update(STROKE_DURATION_MS + 400);
  expect(tucked()).toEqual([0, 0]);
});

it('keeps the bowler\'s shirt hem and trouser waist joined through his action', () => {
  // The bowler wears the batter's kind of clothes (the fielders do not).
  const bowler = new Bowler();
  const rig = bowler.figure as unknown as { garments: { jersey: ConnectedJersey; trousers: ConnectedTrousers } };
  expect(rig.garments).toBeDefined();
  for (let t = 0; t <= 2240; t += 80) {
    bowler.animate(t); bowler.figure.drape();
    const shirt = rig.garments.jersey.mesh.geometry.getAttribute('position');
    const trousers = rig.garments.trousers.mesh.geometry.getAttribute('position');
    for (let i = 0; i < 24; i++) for (let axis = 0; axis < 3; axis++)
      expect(trousers.getComponent(i, axis)).toBeCloseTo(shirt.getComponent(i, axis), 6);
    for (const value of [...shirt.array, ...trousers.array]) expect(Number.isFinite(value)).toBe(true);
  }
  expect((new Cricketer() as unknown as { garments?: unknown }).garments).toBeUndefined();
});

it('redresses a fielder\'s merged parts without recolouring skin', () => {
  const figure = new Cricketer(); figure.dress({...KIT,shirt:0xffffff,trousers:0xdddddd,skin:0x986b48});
  const seen = new Set<string>();
  figure.root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !object.userData.role) return;
    const want = ({ shirt: 0xffffff, trousers: 0xdddddd, skin: 0x986b48 } as Record<string, number>)[object.userData.role];
    if (want === undefined) return;
    seen.add(object.userData.role);
    expect((object.material as THREE.MeshStandardMaterial).color.getHex()).toBe(want);
  });
  expect([...seen].sort()).toEqual(['shirt', 'skin', 'trousers']);
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
