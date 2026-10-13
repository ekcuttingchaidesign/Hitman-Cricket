import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { SKIN, bladeGeometry } from '../src/entities/batGeometry';

/**
 * The sticker sheet: each side of the blade reads its own panel of the sheet,
 * the right way round as the template draws it — the face as the bowler sees
 * it, the back as the camera behind the batter sees it, and the handle end at
 * the top of every panel.
 */
describe('the bat skin sheet', () => {
  const geometry = bladeGeometry();
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), uv1 = geometry.getAttribute('uv1');
  const all = Array.from({ length: position.count }, (_, i) => ({
    at: new Vector3().fromBufferAttribute(position, i),
    facing: new Vector3().fromBufferAttribute(normal, i),
    u: uv1.getX(i) * SKIN.width, v: (1 - uv1.getY(i)) * SKIN.height,
  }));
  // The two ends — inside the handle, under the toe — are on the willow between panels.
  const ends = all.filter(p => Math.abs(p.u - SKIN.face.x / 2) < 1e-3);
  const vertices = all.filter(p => !ends.includes(p));
  const inside = (u: number, panel: { x: number; width: number }) => u >= panel.x - 1e-6 && u <= panel.x + panel.width + 1e-6;

  it('maps the face onto the face panel, left to right as the bowler sees it', () => {
    const face = vertices.filter(p => p.facing.z > .95);
    expect(face.length).toBeGreaterThan(20);
    for (const p of face) expect(inside(p.u, SKIN.face), `${p.u}`).toBe(true);
    const left = face.reduce((a, b) => (b.at.x < a.at.x ? b : a)), right = face.reduce((a, b) => (b.at.x > a.at.x ? b : a));
    expect(left.u).toBeLessThan(right.u);
  });

  it('maps the back onto the back panel, as seen from behind the batter', () => {
    const back = vertices.filter(p => p.facing.z < -.95);
    expect(back.length).toBeGreaterThan(10);
    for (const p of back) expect(inside(p.u, SKIN.back), `${p.u}`).toBe(true);
    // From behind, the blade's +x is on the viewer's left.
    const plus = back.reduce((a, b) => (b.at.x > a.at.x ? b : a)), minus = back.reduce((a, b) => (b.at.x < a.at.x ? b : a));
    expect(plus.u).toBeLessThan(minus.u);
  });

  it('maps each edge onto its own panel, the face toward the bat seen from that side', () => {
    // Edge L is the blade's -x side, seen from that side with the face on its
    // right; edge R the +x side, with the face on its left.
    for (const [panel, sign] of [[SKIN.edgeLeft, -1], [SKIN.edgeRight, 1]] as const) {
      const strip = vertices.filter(p => inside(p.u, panel));
      expect(strip.length).toBeGreaterThan(20);
      for (const p of strip) {
        expect(Math.sign(p.at.x), `${p.at.x}`).toBe(sign);
        // Outward, if only just at the neck and the toe, where the blade turns away.
        expect(p.facing.x * sign).toBeGreaterThan(0);
      }
      const middle = strip.filter(p => Math.abs(p.at.y + .5) < .06);
      const front = middle.reduce((a, b) => (b.at.z > a.at.z ? b : a)), rear = middle.reduce((a, b) => (b.at.z < a.at.z ? b : a));
      if (sign < 0) expect(front.u).toBeGreaterThan(rear.u); else expect(front.u).toBeLessThan(rear.u);
    }
  });

  it('puts the handle end at the top of the sheet and the toe at the bottom, at half a millimetre a pixel', () => {
    const v = vertices.map(p => p.v);
    expect(Math.min(...v)).toBeCloseTo(0, 6);
    expect(Math.max(...v)).toBeCloseTo(SKIN.height, 6);
    const middle = vertices.find(p => p.facing.z > .95 && Math.abs(p.at.x) < .02 && Math.abs(p.at.y + .484) < .001);
    if (middle) expect(middle.v).toBeCloseTo((.484 - .134) * 2000, 3);
  });

  it('leaves the two ends on bare willow, outside every panel', () => {
    expect(ends.length).toBeGreaterThan(0);
    for (const panel of [SKIN.face, SKIN.edgeLeft, SKIN.back, SKIN.edgeRight]) for (const p of ends) expect(inside(p.u, panel)).toBe(false);
  });

  it('keeps the four panels apart with willow between them', () => {
    const panels = [SKIN.face, SKIN.edgeLeft, SKIN.back, SKIN.edgeRight];
    for (let i = 1; i < panels.length; i++) expect(panels[i].x).toBeGreaterThan(panels[i - 1].x + panels[i - 1].width);
    expect(panels[panels.length - 1].x + panels[panels.length - 1].width).toBeLessThan(SKIN.width);
  });
});
