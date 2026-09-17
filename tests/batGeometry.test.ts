import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { bladeGeometry, gripGeometry } from '../src/entities/batGeometry';

describe('modern bat profile',()=>{
  it('has a closed blade, broad toe, and a deeper back spine than edges',()=>{
    const g=bladeGeometry(), p=g.getAttribute('position'), index=g.getIndex()!;
    const edges=new Map<string,number>();
    for(let i=0;i<index.count;i+=3) {
      const triangle=[index.getX(i),index.getX(i+1),index.getX(i+2)];
      for(let n=0;n<3;n++) {
        const key=[triangle[n],triangle[(n+1)%3]].sort((a,b)=>a-b).join(':');
        edges.set(key,(edges.get(key)??0)+1);
      }
      const [a,b,c]=triangle.map(n=>new Vector3().fromBufferAttribute(p,n));
      expect(b.sub(a).cross(c.sub(a)).length()).toBeGreaterThan(1e-8);
    }
    expect([...edges.values()].every(count=>count===2)).toBe(true);
    expect(g.boundingBox!.min.y).toBeCloseTo(-.834);
    expect(g.boundingBox!.max.x).toBeCloseTo(.068);
    // Station at the sweet spot: back spine is materially deeper than edge.
    expect(p.getZ(4*9+4)-p.getZ(4*9+6)).toBeGreaterThan(.04);
    expect(p.getX(9*9+3)*2).toBeGreaterThan(.09);
    expect(g.getAttribute('normal').getZ(4*9+2)).toBeGreaterThan(.5);
    g.dispose();
  });
  it('keeps a ribbed grip covering both unchanged hand anchors',()=>{
    const g=gripGeometry(); g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBeLessThan(-.035);
    expect(g.boundingBox!.max.y).toBeGreaterThan(.1);
    expect(g.boundingBox!.max.x).toBeCloseTo(.028);
    expect(Array.from(g.getAttribute('position').array).every(Number.isFinite)).toBe(true);
    g.dispose();
  });
});
