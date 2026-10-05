import { expect, it } from 'vitest';
import * as THREE from 'three';
import { Batter, CELEBRATION_MS, FIFTY_MS, STROKE_DURATION_MS, CHARGE_MEETS_AT } from '../src/entities/Batter';
import { GAME, SHOTS } from '../src/config/gameplay';
import { jerseyGeometry } from '../src/entities/garment';
import type { BendingLimb } from '../src/entities/BendingLimb';
import type { ShotType } from '../src/game/types';

it('keeps every sleeve-root vertex enclosed by the actual jersey throughout shots and celebrations', () => {
  const batter = new Batter();
  const rig = batter as unknown as { torso: THREE.Group; sleeves: BendingLimb[] };
  const jersey = new THREE.Mesh(jerseyGeometry(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  jersey.updateMatrixWorld();
  const ray = new THREE.Raycaster(), point = new THREE.Vector3(), inverse = new THREE.Quaternion();
  const forward = new THREE.Vector3(0, 0, 1), back = new THREE.Vector3(0, 0, -1);
  let worstClearance = Infinity, checked = 0;
  function check(label: string) {
    inverse.copy(rig.torso.quaternion).invert();
    for (const sleeve of rig.sleeves) {
      const positions = sleeve.mesh.geometry.getAttribute('position');
      // The open root ring must stay inside the torso, whatever way the arm points.
      for (let i = 0; i < 16; i++) {
        point.fromBufferAttribute(positions, i).sub(rig.torso.position).applyQuaternion(inverse);
        for (const direction of [forward, back]) {
          ray.set(point, direction);
          const hit = ray.intersectObject(jersey)[0];
          expect(hit, `${label}: exposed sleeve root at ${point.toArray()}`).toBeDefined();
          if (hit) worstClearance = Math.min(worstClearance, hit.distance);
        }
        checked++;
      }
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
  // Some overlap must remain; a ring exactly on the surface can flicker open.
  expect(worstClearance).toBeGreaterThan(.01);
}, 60000);
