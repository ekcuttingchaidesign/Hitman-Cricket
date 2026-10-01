import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BLAST_FIELD, Field, TEST_FIELD, type Visible } from '../src/scene/field';
import { SPRINT } from '../src/entities/Fielder';

/**
 * The camera a phone held upright gets: `GameScene.resize` at 390×844, where
 * the view widens to its 67° ceiling and drops its aim towards the wicket.
 * The stage is mirrored in the game, which a field symmetric about straight
 * does not notice.
 */
function phone(): Visible {
  const camera = new THREE.PerspectiveCamera(67, 390 / 844, .1, 180);
  camera.position.set(0, 2.9, -5.15);
  camera.lookAt(0, .15, 5.4);
  camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  return point => {
    const p = point.clone().project(camera);
    return p.z < 1 && Math.abs(p.x) < .8 && p.y > -.7 && p.y < .55;
  };
}
const look = () => null;
const HIT = 10_000, HANG = 1900 * .86;
const deg = (d: number) => d * Math.PI / 180;

describe('the field', () => {
  it('sets a slogger a field back on the rope, and a survivor an attacking ring', () => {
    const ring = BLAST_FIELD.filter(m => !m.deep), deep = BLAST_FIELD.filter(m => m.deep);
    expect(ring.length).toBe(2);
    for (const m of deep) expect(Math.hypot(m.spot.x, m.spot.z)).toBeGreaterThan(29);
    for (const m of ring) expect(Math.hypot(m.spot.x, m.spot.z)).toBeGreaterThan(21);
    expect(TEST_FIELD.filter(m => !m.deep).length).toBe(4);
    // Every deep man inside the rope, which is thirty metres round a point ten up the pitch.
    for (const m of [...BLAST_FIELD, ...TEST_FIELD]) expect(Math.hypot(m.spot.x, m.spot.z - 10)).toBeLessThan(29);
  });

  it('walks in with the bowler, but nobody sets off, or split steps, with anybody else', () => {
    const field = new Field();
    field.walkIn(HIT - 2000);
    field.set(HIT - 1000, HIT);
    const routines = (field as unknown as { routines: { actions: { name: string; start: number; end: number }[] }[] }).routines;
    const walks = routines.map(r => r.actions.find(a => a.name === 'Walking in')).filter(Boolean);
    expect(walks.length).toBeGreaterThanOrEqual(3);
    const starts = walks.map(w => Math.round(w!.start)), ends = walks.map(w => Math.round(w!.end));
    expect(new Set(starts).size).toBe(starts.length);
    expect(new Set(ends).size).toBe(ends.length);
    // Not merely different: spread, by more than a few frames.
    expect(Math.max(...starts) - Math.min(...starts)).toBeGreaterThan(150);
    const steps = routines.map(r => r.actions.find(a => a.name === 'Split step')?.start).filter((s): s is number => s !== undefined);
    expect(steps.length).toBe(6);
    expect(new Set(steps.map(Math.round)).size).toBe(6);
  });

  it('deals a different walk the next ball', () => {
    const field = new Field();
    const walksOf = () => (field as unknown as { routines: { actions: { name: string; start: number }[] }[] }).routines
      .map(r => r.actions.find(a => a.name === 'Walking in')?.start ?? null);
    field.walkIn(0);
    const first = walksOf().map(s => (s === null ? null : s - 0));
    const later = new Field();
    later.walkIn(0); later.walkIn(0);
    const second = (later as unknown as { routines: { actions: { name: string; start: number }[] }[] }).routines
      .map(r => r.actions.find(a => a.name === 'Walking in')?.start ?? null);
    expect(second).not.toEqual(first);
  });

  describe('a skied ball, on a phone held upright', () => {
    const visible = phone();
    for (const [stroke, angle] of [['leg', -52], ['long-on', -24], ['straight', 12.6], ['cover', 24], ['square drive', 62], ['cut', 100]] as const) {
      for (const [mode, marks] of [['Blast', BLAST_FIELD], ['Test', TEST_FIELD]] as const) {
        it(`is caught in shot — ${stroke}, ${mode}`, () => {
          const field = new Field();
          field.setField(marks);
          const plan = field.struck(HIT, HIT + 1900, look, { angle: deg(angle), height: .6, arrives: HIT + HANG, dropped: false, visible })!;
          expect(plan).not.toBeNull();
          // His hands, where the flight finishes, are on the screen.
          const hands = plan.hands.clone().setY(Math.min(plan.hands.y, 1.5));
          expect(visible(hands) || visible(plan.hands.clone().setY(.6))).toBe(true);
          expect(plan.topSpeed).toBeLessThanOrEqual(SPRINT);
          // And he ran to it: started a fair way from it.
          const start = (field as unknown as { routines: { at(t: number): { x: number; z: number } }[] }).routines
            .map(r => r.at(HIT)).reduce((best, at) => Math.min(best, Math.hypot(at.x - plan.hands.x, at.z - plan.hands.z)), Infinity);
          expect(start).toBeGreaterThan(2.5);
        });
      }
    }
  });
});
