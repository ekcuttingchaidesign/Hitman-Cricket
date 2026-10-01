import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BLAST_FIELD, Field, TEST_FIELD, type Visible } from '../src/scene/field';
import { DIVE, SPRINT, midpointOfHands } from '../src/entities/Fielder';

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

  it('walks in a man still crouched on his mark from the last ball', () => {
    // Nobody walked in for this one, so each split steps on his mark; the
    // ball goes nowhere and each is dealt his own moment to stand up again,
    // some of them after the bowler is already on his way for the next.
    const field = new Field();
    field.set(HIT - 300, HIT);
    field.struck(HIT, HIT + 1250, look);
    const next = HIT + 1300;
    field.walkIn(next);
    const routines = (field as unknown as { routines: { actions: { name: string; start: number }[] }[] }).routines;
    BLAST_FIELD.forEach((m, i) => {
      if (m.deep) return;
      expect(routines[i].actions.some(a => a.name === 'Walking in'), m.name).toBe(true);
    });
  });

  it('is settled for the next ball only once everyone is back on his mark', () => {
    const field = new Field();
    expect(field.settled(HIT - 5000)).toBe(true);
    field.walkIn(HIT - 2000);
    field.set(HIT - 1000, HIT);
    field.struck(HIT, HIT + 1250, look);
    expect(field.settled(HIT + 500)).toBe(false);
    let at = HIT + 500;
    while (!field.settled(at) && at < HIT + 10_000) at += 50;
    expect(at).toBeLessThan(HIT + 10_000);
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

  describe('a ball along the ground', () => {
    const origin = new THREE.Vector3(-.2, .1, 1.3);
    /** Where a stroke at `angle` ends `distance` out, once the field has had its say. */
    const line = (field: Field, angle: number, distance: number) => {
      const turned = field.clear(HIT, deg(angle), distance);
      return new THREE.Vector3(Math.sin(turned) * distance, .1, Math.cos(turned) * distance);
    };
    const routinesOf = (field: Field) => (field as unknown as { routines: { actions: { name: string; start: number; end: number }[]; at(t: number): { x: number; z: number } }[] }).routines;

    it('never goes through a fielder: a cover drive at mid-off is turned to pass him by a stride and a half', () => {
      const field = new Field();
      // Mid-off stands at 24°; a cover drive goes at 24°.
      const end = line(field, 24, 44);
      for (const m of BLAST_FIELD) {
        const along = m.spot.x * Math.sin(Math.atan2(end.x, end.z)) + m.spot.z * Math.cos(Math.atan2(end.x, end.z));
        if (along < 3 || along > 43) continue;
        const across = Math.abs(m.spot.x * Math.cos(Math.atan2(end.x, end.z)) - m.spot.z * Math.sin(Math.atan2(end.x, end.z)));
        expect(across, m.name).toBeGreaterThan(1.6);
      }
    });

    it('beats the man it passes close to, who dives for it', () => {
      const field = new Field();
      const end = line(field, 24, 44);
      field.ground(HIT, HIT + 1250, look, { from: origin, to: end, flightMs: 1250, four: true });
      const routines = routinesOf(field);
      const midOff = BLAST_FIELD.findIndex(m => m.name === 'Mid-off');
      expect(routines[midOff].actions.map(a => a.name)).toContain('Diving catch');
      expect(routines[midOff].actions.map(a => a.name)).toContain('Up, hands on head');
    });

    for (const [stroke, angle] of [['straight drive', 0], ['on drive', -24], ['cover drive', 24]] as const) {
      it(`sends somebody from the deep after a ${stroke} going for four`, () => {
        const field = new Field();
        const end = line(field, angle, 44);
        field.ground(HIT, HIT + 1250, look, { from: origin, to: end, flightMs: 1250, four: true });
        const routines = routinesOf(field);
        const going = BLAST_FIELD.map((m, i) => ({ m, names: routines[i].actions.map(a => a.name) }))
          .filter(({ m, names }) => m.deep && (names.includes('Chasing it') || names.includes('Diving catch')));
        expect(going.length, JSON.stringify(routines.map(r => r.actions.map(a => a.name)))).toBeGreaterThanOrEqual(1);
        // And everyone is back on his mark in time for the next ball: the bowler
        // waits for the field, and a man chasing to the far end of the rope
        // kept him waiting past his limit.
        let home = HIT;
        while (!field.settled(home) && home < HIT + 20_000) home += 50;
        expect(home - HIT, 'back on their marks').toBeLessThan(1250 + 1050 + 550 + 3000);
        // And nobody goes faster than a man can.
        for (const r of routines) {
          let last = r.at(HIT);
          for (let t = HIT + 20; t < HIT + 4000; t += 20) {
            const now = r.at(t);
            expect(Math.hypot(now.x - last.x, now.z - last.z) / .02).toBeLessThan(SPRINT * 1.3);
            last = now;
          }
        }
      });
    }

    for (const [stroke, angle] of [['straight drive', 0], ['on drive', -24], ['cover drive', 24], ['on drive, wide', -14], ['cover drive, wide', 16]] as const) {
      it(`dives towards a ${stroke}, not away from it, and gets there as it passes`, () => {
        const field = new Field();
        const end = line(field, angle, 44);
        field.ground(HIT, HIT + 1250, look, { from: origin, to: end, flightMs: 1250, four: true });
        const routines = routinesOf(field) as unknown as { actions: { name: string; start: number }[]; at(t: number): Parameters<typeof midpointOfHands>[0] }[];
        const dir = end.clone().sub(origin).setY(0).normalize();
        /** How far a point is from the ball's line, and which side of it. */
        const across = (p: { x: number; z: number }) => (p.x - origin.x) * dir.z - (p.z - origin.z) * dir.x;
        routines.forEach((routine, i) => {
          const dive = routine.actions.find(a => a.name === 'Diving catch');
          if (!dive) return;
          const name = BLAST_FIELD[i].name;
          const stood = routine.at(HIT);
          const out = midpointOfHands(routine.at(dive.start + DIVE.catch));
          // Towards it: his hands finish nearer the line than he stood, on his own side of it.
          expect(Math.abs(across(out)), name).toBeLessThan(Math.abs(across(stood)));
          expect(Math.sign(across(out)) === Math.sign(across(stood)) || Math.abs(across(out)) < .5, name).toBe(true);
          // And as it passes: the ball reaches him along the line at a known time.
          const along = (stood.x - origin.x) * dir.x + (stood.z - origin.z) * dir.z;
          const passes = HIT + along / end.clone().sub(origin).setY(0).length() * 1250;
          const out_at = dive.start + DIVE.catch;
          expect(out_at, name).toBeGreaterThan(passes - 60);
          expect(out_at, name).toBeLessThan(Math.max(passes, HIT + 140 + DIVE.catch) + 120);
        });
      });
    }

    it('has the nearest man pick up a ball that stops in the field, and hold it', () => {
      const field = new Field();
      const end = line(field, -24, 19);
      const { gathered } = field.ground(HIT, HIT + 1250, look, { from: origin, to: end, flightMs: 1250, four: false });
      expect(gathered).toBe(true);
      const routines = routinesOf(field);
      const picker = routines.findIndex(r => r.actions.some(a => a.name === 'Picking it up'));
      expect(picker).toBeGreaterThanOrEqual(0);
      const pick = routines[picker].actions.find(a => a.name === 'Picking it up')!;
      // Not before the ball has stopped.
      expect(pick.start).toBeGreaterThanOrEqual(HIT + 1250);
      // And then it is in his hand, where it lay to begin with.
      const inHand = field.held(pick.start + 400)!;
      expect(inHand).not.toBeNull();
      expect(Math.hypot(inHand.x - end.x, inHand.z - end.z)).toBeLessThan(.6);
      expect(field.held(pick.start + 100)).toBeNull();
    });
  });
});

