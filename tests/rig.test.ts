import {expect,it} from 'vitest';
import {Vector3} from 'three';
import {solveJoint} from '../src/entities/rig';

it('keeps an unequal two-bone chain finite inside its inner reach limit',()=>{
  const start=new Vector3(), pole=new Vector3(0,-1,0);
  for(const distance of [.0001,.001,.01,.02,.03]) {
    const joint=solveJoint(start,new Vector3(distance,0,0),.32,.34,pole);
    expect(joint.toArray().every(Number.isFinite)).toBe(true);
    expect(joint.distanceTo(start)).toBeCloseTo(.32,9);
  }
});
