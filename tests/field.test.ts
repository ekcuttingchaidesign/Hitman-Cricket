import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BLAST_FIELD, Field, TEST_FIELD, mark, type Mark, type Visible } from '../src/scene/field';
import { boardsAlong } from '../src/scene/flight';
import { drawnOf, fieldFor } from '../src/game/super10-field';
import { DIVE, Routine, SPRINT, bodyOf, midpointOfHands } from '../src/entities/Fielder';
import { standPose } from '../src/entities/Cricketer';

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

  it('goes home, settled, when the clock starts again from nought', () => {
    // An innings ended mid-chase, and the next starts the game clock at zero.
    const field = new Field();
    field.walkIn(HIT - 2000);
    field.set(HIT - 1000, HIT);
    field.ground(HIT, HIT + 1250, look, { from: new THREE.Vector3(-.2, .1, 1.3), to: new THREE.Vector3(-30, .1, 30), flightMs: 1250, four: true });
    expect(field.settled(0)).toBe(false);
    field.home();
    expect(field.settled(0)).toBe(true);
    expect(field.bowlerRoutine()).toBeNull();
    // And walks in with the next bowler as if nothing had happened.
    field.walkIn(600);
    const routines = (field as unknown as { routines: { actions: { name: string }[] }[] }).routines;
    expect(routines.filter(r => r.actions.some(a => a.name === 'Walking in')).length).toBeGreaterThanOrEqual(3);
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

    it('never goes through a fielder: a drive straight at a man is turned to pass him by a stride and a half', () => {
      // Every man's own line, and between mid-off and long-off, three strides
      // apart at the rope: the turn used to go the wrong way, onto the man,
      // and between two men away from one was onto the other.
      for (const marks of [BLAST_FIELD, TEST_FIELD]) {
        for (const at of [...marks.map(m => Math.atan2(m.spot.x, m.spot.z) * 180 / Math.PI), 13, 16, -12]) {
          const field = new Field(); field.setField(marks);
          const end = line(field, at, 44);
          const a = Math.atan2(end.x, end.z);
          for (const m of marks) {
            const along = m.spot.x * Math.sin(a) + m.spot.z * Math.cos(a);
            if (along < 3 || along > 43) continue;
            expect(Math.abs(m.spot.x * Math.cos(a) - m.spot.z * Math.sin(a)), `${m.name}, at ${at.toFixed(1)}°`).toBeGreaterThan(1.6);
          }
          // Turned the least it takes: never further than the man's half a stride needs.
          expect(Math.abs(a * 180 / Math.PI - at), `at ${at.toFixed(1)}°`).toBeLessThan(12);
        }
      }
    });

    it('goes past every man, never through him, the ones chasing it included', () => {
      // A four along the ground at every angle from fine leg to third man:
      // the man in the deep chasing it, and those near it getting across,
      // run to beside its line (`CHASE_KEEP`). Sent to a point on it, they
      // got there with the ball, and it went through them.
      for (const marks of [BLAST_FIELD, TEST_FIELD]) {
        for (let at = -100; at <= 100; at += 4) {
          const field = new Field(); field.setField(marks);
          const end = line(field, at, Math.min(44, boardsAlong(deg(at)) - .6));
          field.ground(HIT, HIT + 1300, look, { from: origin, to: end, flightMs: 1300, four: true });
          routinesOf(field).forEach((r, i) => {
            let near = Infinity;
            for (let t = 0; t <= 1300; t += 20) {
              const ball = origin.clone().lerp(end, t / 1300), him = r.at(HIT + t);
              near = Math.min(near, Math.hypot(him.x - ball.x, him.z - ball.z));
            }
            expect(near, `${marks[i].name}, a four at ${at}°: ${r.actions.map(a => a.name).join(' > ')}`).toBeGreaterThan(1);
          });
        }
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

    it('never dives under a four still in the air, only where it has pitched', () => {
      // The same line past mid-off: pitching beyond him, he lets it go over;
      // pitching before him, he dives for it as for one along the ground.
      const over = new Field(), on = new Field();
      const end = line(over, 24, 44);
      line(on, 24, 44);
      over.ground(HIT, HIT + 1250, look, { from: origin, to: end, flightMs: 1250, four: true, airborne: .9 });
      on.ground(HIT, HIT + 1250, look, { from: origin, to: end, flightMs: 1250, four: true, airborne: .2 });
      const midOff = BLAST_FIELD.findIndex(m => m.name === 'Mid-off');
      expect(routinesOf(over)[midOff].actions.map(a => a.name)).not.toContain('Diving catch');
      expect(routinesOf(on)[midOff].actions.map(a => a.name)).toContain('Diving catch');
    });

    it('has a man it passes a few metres off, too far to dive, get across towards it', () => {
      const field = new Field();
      // Eleven degrees off mid-off at 17°: four metres wide of him at his depth.
      const end = line(field, 28, 44);
      field.ground(HIT, HIT + 1250, look, { from: origin, to: end, flightMs: 1250, four: true });
      const routines = routinesOf(field);
      const midOff = BLAST_FIELD.findIndex(m => m.name === 'Mid-off');
      const names = routines[midOff].actions.map(a => a.name);
      expect(names, names.join(' > ')).toContain('Chasing it');
      expect(names).not.toContain('Diving catch');
      // He goes towards the line, and stops short of it.
      const before = routines[midOff].at(HIT), after = routines[midOff].at(HIT + 900);
      const dir = end.clone().sub(origin).setY(0).normalize();
      const off = (p: { x: number; z: number }) => Math.abs((p.x - origin.x) * dir.z - (p.z - origin.z) * dir.x);
      expect(off(after)).toBeLessThan(off(before) - 1);
      expect(off(after)).toBeGreaterThan(.5);
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

    /** The bowler at the end of his follow-through: just short of the stumps at his end, facing the bat. */
    const bowler = () => {
      const pose = standPose(new THREE.Group());
      pose.yaw = Math.PI;
      for (const p of [pose.hip, pose.chest, pose.leftFoot, pose.rightFoot, pose.leftHand, pose.rightHand]) p.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
      return { rest: bodyOf(pose, .3, 16.6), free: HIT + 600 };
    };

    it('leaves a ball stopping on the pitch to the bowler, who walks to it and picks it up', () => {
      const field = new Field();
      const end = new THREE.Vector3(.4, .1, 10);
      const { gathered } = field.ground(HIT, HIT + 1250, look, { from: origin, to: end, flightMs: 1250, four: false }, bowler());
      expect(gathered).toBe(true);
      expect(routinesOf(field).some(r => r.actions.some(a => a.name === 'Picking it up'))).toBe(false);
      const his = field.bowlerRoutine()!;
      const pick = his.actions.find(a => a.name === 'Picking it up')!;
      expect(pick).toBeDefined();
      expect(pick.start).toBeGreaterThanOrEqual(HIT + 1250);
      const inHand = field.held(pick.start + 400)!;
      expect(Math.hypot(inHand.x - end.x, inHand.z - end.z)).toBeLessThan(.6);
    });

    it('throws a ball picked up in the field to the bowler, who takes it, and is home in time', () => {
      const field = new Field();
      const end = line(field, -60, 19);
      field.ground(HIT, HIT + 1250, look, { from: origin, to: end, flightMs: 1250, four: false }, bowler());
      const routines = routinesOf(field);
      const picker = routines.findIndex(r => r.actions.some(a => a.name === 'Throwing it in'));
      expect(picker).toBeGreaterThanOrEqual(0);
      const his = field.bowlerRoutine()!;
      const taking = his.actions.find(a => a.name === 'Taking the throw')!;
      expect(taking).toBeDefined();
      // The ball goes hand to hand without a jump: picked up, thrown, taken.
      const pick = routines[picker].actions.find(a => a.name === 'Picking it up')!;
      let last = field.held(pick.start + 340)!;
      expect(last).not.toBeNull();
      for (let t = pick.start + 350; t < pick.start + 4000; t += 10) {
        const now = field.held(t)!;
        expect(now.distanceTo(last), `at ${t}`).toBeLessThan(.45);
        last = now;
      }
      // And finishes in the bowler's hands, near where he stands.
      expect(Math.hypot(last.x - .3, last.z - 16.6)).toBeLessThan(1);
      let home = HIT;
      while (!field.settled(home) && home < HIT + 20_000) home += 50;
      expect(home - HIT).toBeLessThan(1250 + 1050 + 550 + 3500);
    });

    for (const [stroke, angle, whose] of [['flick to square leg', -62, 'Deep midwicket'], ['flick at deep midwicket', -52, 'Deep midwicket'],
      ['flick, a shade straighter', -55, 'Deep midwicket'], ['sweep, fine of square', -80, 'Deep midwicket'], ['square drive', 62, 'Deep cover']] as const) {
      it(`leaves a ${stroke} for four to the man whose area it is`, () => {
        const field = new Field();
        const end = line(field, angle, 44);
        field.ground(HIT, HIT + 1250, look, { from: origin, to: end, flightMs: 1250, four: true });
        const routines = routinesOf(field);
        BLAST_FIELD.forEach((m, i) => {
          const names = routines[i].actions.map(a => a.name);
          const after = names.includes('Chasing it') || names.includes('Diving catch');
          // Long-on and long-off, nearly straight, stay out of it, and nobody
          // on the ring runs a four down to the rope.
          if (m.name === 'Long-on' || m.name === 'Long-off') expect(after, m.name).toBe(false);
          expect(names.includes('Chasing it') && !m.deep, m.name).toBe(false);
          if (m.name === whose) expect(after, m.name).toBe(true);
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


describe('Super10\'s field on the ground', () => {
  const marksOf = (field: ReturnType<typeof fieldFor>): Mark[] => drawnOf(field).map((m, i) => ({
    name: `${i}`, spot: mark(m.angle, m.distance), style: 'loose', deep: m.deep,
  }));

  it('stands every man straight on the next field\'s marks, and waits for the bowler\'s signal', () => {
    const field = new Field();
    const from = fieldFor({ bowler: 'SEAM', over: 5 }), to = fieldFor({ bowler: 'SEAM', over: 5, surge: true });
    field.setField(marksOf(from));
    const next = marksOf(to);
    field.standOn(next);
    // Nobody walks: every man is on his new mark at once.
    for (const man of field.state(HIT + 20).fielders) expect(man.home).toBeLessThan(.2);
    expect(field.state(HIT + 20).fielders.map(f => f.name).sort()).toEqual(next.map(m => m.name).sort());
    const rest = { x: 1, z: 16, heading: Math.PI, pitch: 0, anchor: new THREE.Vector3(0, .9, 0), pose: standPose(new THREE.Group()) };
    const man = to.men.find(m => !m.deep && !from.men.some(n => n.angle === m.angle && !n.deep))!;
    field.bowlerSignal(rest, HIT, mark(man.angle, man.distance), 'in');
    expect(field.bowlerRoutine()!.at(HIT + 400).heading).not.toBeCloseTo(Math.PI, 1);
    expect(field.settled(HIT + 500)).toBe(false);
    expect(field.settled(HIT + 6000)).toBe(true);
  });

  it('takes a catch on the rope where the boundary rider stands', () => {
    const field = new Field();
    field.setField(marksOf(fieldFor({ bowler: 'DEATH', over: 7 })));
    const at = mark(-12, fieldFor({ bowler: 'DEATH', over: 7 }).men.find(m => m.angle === -12)!.distance);
    const target = new THREE.Vector3(at.x, 2, at.z);
    const plan = field.struck(HIT, HIT + 1900, look, { angle: deg(-12), height: 2, arrives: HIT + HANG, dropped: false, visible: () => true, at: target })!;
    expect(plan).not.toBeNull();
    expect(plan.hands.distanceTo(target)).toBeLessThan(.8);
    expect(field.state(HIT).catcher).not.toBeNull();
  });
});

describe('a Super10 fielder getting to a ball along the ground', () => {
  const origin = new THREE.Vector3(-.2, .1, 1.3);
  const bowler = () => {
    const pose = standPose(new THREE.Group());
    pose.yaw = Math.PI;
    for (const p of [pose.hip, pose.chest, pose.leftFoot, pose.rightFoot, pose.leftHand, pose.rightHand]) p.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    return { rest: bodyOf(pose, .3, 16.6), free: HIT + 600 };
  };
  const marksOf = (field: ReturnType<typeof fieldFor>): Mark[] => drawnOf(field).map((m, i) => ({
    name: `${i}`, spot: mark(m.angle, m.distance), style: 'loose', deep: m.deep,
  }));
  const routinesOf = (field: Field) => (field as unknown as { routines: Routine[] }).routines;
  const seam = fieldFor({ bowler: 'SEAM', over: 6 });
  /** Where a ball along `angle` ends, a stride short of the man at that depth. */
  const toward = (angle: number, distance: number) => new THREE.Vector3(Math.sin(deg(angle)) * distance, .1, Math.cos(deg(angle)) * distance);

  it('lets a man joined for the catch camera go with the ball in his hands, and goes on', () => {
    // The game froze here: a deep man joined for the camera fielded it, was
    // taken off when the camera cut back, and the throw read his plan after.
    const field = new Field();
    const drawn = drawnOf(seam), undrawn = seam.men.filter(m => !drawn.includes(m));
    field.setField(marksOf(seam));
    field.join(undrawn.map((m, i) => ({ name: `j${i}`, spot: mark(m.angle, m.distance), style: 'loose' as const, deep: m.deep })));
    const deepIndex = 6, man = routinesOf(field)[deepIndex].at(HIT);
    const to = new THREE.Vector3(man.x, .1, man.z).multiplyScalar(.97), arrives = HIT + 900;
    const taken = field.fielded(HIT, arrives, look, { from: origin, to, flightMs: 900 }, bowler());
    expect(taken).not.toBeNull();
    expect(field.held(arrives + 200)).not.toBeNull();
    field.leave();
    expect(() => { field.update(arrives + 400); field.held(arrives + 400); field.settled(arrives + 400); }).not.toThrow();
    expect(field.held(arrives + 400)).toBeNull();
    expect(routinesOf(field)).toHaveLength(6);
  });
  it('gets down behind one hit straight at him and collects it in both hands, then throws it to the bowler', () => {
    const field = new Field();
    field.setField(marksOf(seam));
    // Straight at mid-off, along the ground.
    const to = toward(18, 22 - 1.2), arrives = HIT + 875;
    const taken = field.fielded(HIT, arrives, look, { from: origin, to, flightMs: 875 }, bowler())!;
    expect(taken).not.toBeNull();
    expect(taken.hands.distanceTo(to.clone().setY(.08))).toBeLessThan(.3);
    const midOff = drawnOf(seam).findIndex(m => m.name === 'mid-off');
    const names = routinesOf(field)[midOff].actions.map(a => a.name);
    expect(names, names.join(' > ')).toContain('Collecting it');
    expect(names).toContain('Throwing it in');
    expect(names).not.toContain('Diving catch');
    // In his hands as it arrives, and the bowler takes the throw.
    expect(field.held(arrives - 20)).toBeNull();
    expect(field.held(arrives + 10)!.distanceTo(taken.hands)).toBeLessThan(.2);
    expect(field.bowlerRoutine()!.actions.map(a => a.name)).toContain('Taking the throw');
  });

  it('runs and dives full length to save one on the rope, gets up and throws it in', () => {
    const field = new Field();
    field.setField(marksOf(seam));
    // Five metres wide of long-on, slowing on the way out.
    const longOn = drawnOf(seam).find(m => m.name === 'long-on')!;
    const angle = longOn.angle + Math.asin(5 / longOn.distance) * 180 / Math.PI;
    const to = toward(angle, longOn.distance - 1.2), flightMs = 1250 * 1.3;
    const taken = field.fielded(HIT, HIT + flightMs, look, { from: origin, to, flightMs, dive: true }, bowler())!;
    expect(taken).not.toBeNull();
    const i = drawnOf(seam).indexOf(longOn);
    const names = routinesOf(field)[i].actions.map(a => a.name);
    expect(names, names.join(' > ')).toContain('Diving catch');
    expect(names).toContain('Throwing it in');
    // He gets to it: his hands within a stride of where it was going.
    expect(Math.hypot(taken.hands.x - to.x, taken.hands.z - to.z)).toBeLessThan(1.5);
  });
});
