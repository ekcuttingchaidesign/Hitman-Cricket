import { describe, expect, it } from 'vitest';
import { contactKind, contactOf, pushAt, PUSH_IN_MS, PUSH_OUT_MS } from '../src/game/contact';

const ball = (over: Partial<Parameters<typeof contactOf>[0]> = {}) => ({ madeBatContact: true, timingGrade: 'PERFECT' as const, runs: 6 as const, ...over });

describe('the bat meeting the ball', () => {
  it('is nothing for a ball the bat never met, or one that hit him', () => {
    expect(contactOf(ball({ madeBatContact: false, timingGrade: 'MISS', runs: 0 }))).toBeNull();
    expect(contactOf(ball({ runs: 0, hit: { where: 'ribs' as never, damage: 1 } }))).toBeNull();
  });
  it('names it by how well it was hit', () => {
    expect(contactKind(ball())).toBe('sweet');
    expect(contactKind(ball({ runs: 4 }))).toBe('sweet');
    expect(contactKind(ball({ runs: 1 }))).toBe('clean');
    expect(contactKind(ball({ timingGrade: 'GOOD', runs: 4 }))).toBe('clean');
    expect(contactKind(ball({ timingGrade: 'OK', runs: 1 }))).toBe('soft');
    expect(contactKind(ball({ timingGrade: 'POOR', runs: 0, edged: true }))).toBe('edge');
    expect(contactKind(ball({ runs: 0, defended: true }))).toBe('soft');
  });
  it('holds a beat only on a boundary, the longest for a middled six, and never long', () => {
    const six = contactOf(ball())!, four = contactOf(ball({ runs: 4 }))!, good = contactOf(ball({ timingGrade: 'GOOD', runs: 4 }))!;
    expect(six.stopMs).toBeGreaterThan(four.stopMs);
    expect(four.stopMs).toBeGreaterThan(good.stopMs);
    expect(six.stopMs).toBeLessThanOrEqual(80);
    expect(contactOf(ball({ runs: 2 }))!.stopMs).toBe(0);
    expect(contactOf(ball({ timingGrade: 'OK', runs: 4 }))!.stopMs).toBe(0);
    expect(contactOf(ball({ timingGrade: 'POOR', runs: 0, edged: true }))!.stopMs).toBe(0);
  });
  it('leaves the charge to its own slow motion', () => {
    const charge = contactOf(ball({ advance: true }))!;
    expect(charge.kind).toBe('sweet');
    expect(charge.stopMs).toBe(0);
  });
  it('gives more of everything the better it was hit', () => {
    const [sweet, clean, soft] = [ball(), ball({ timingGrade: 'GOOD', runs: 4 }), ball({ timingGrade: 'OK', runs: 1 })].map(b => contactOf(b)!);
    for (const key of ['gain', 'thock', 'chips'] as const) {
      expect(sweet[key]).toBeGreaterThan(clean[key]);
      expect(clean[key]).toBeGreaterThanOrEqual(soft[key]);
    }
    // A knock every time the bat finds it, and a deeper note the better it is.
    for (const c of [sweet, clean, soft]) expect(c.buzz.length % 2).toBe(1);
    expect(sweet.rate[1]).toBeLessThan(soft.rate[1]);
  });
  it('moves the camera only for a special stroke that came off', () => {
    expect(contactOf(ball())!.push).toBe(0);
    expect(contactOf(ball({ runs: 4 }))!.push).toBe(0);
    expect(contactOf(ball({ advance: true }))!.push).toBeGreaterThan(0);
    expect(contactOf(ball({ swept: true }))!.push).toBeGreaterThan(0);
    expect(contactOf(ball({ scooped: true }))!.push).toBeGreaterThan(0);
    // A scoop gets its moment only for six, and nothing that got him out does.
    expect(contactOf(ball({ scooped: true, runs: 4 }))!.push).toBe(0);
    expect(contactOf(ball({ swept: true, runs: 0, isWicket: true, timingGrade: 'OK' }))!.push).toBe(0);
  });
  it('pushes the camera in fast and lets it out slowly, and back to nothing', () => {
    expect(pushAt(0)).toBe(0);
    expect(pushAt(PUSH_IN_MS)).toBeCloseTo(1);
    expect(pushAt(PUSH_IN_MS + PUSH_OUT_MS)).toBe(0);
    let last = 1;
    for (let t = PUSH_IN_MS; t <= PUSH_IN_MS + PUSH_OUT_MS; t += 10) { const v = pushAt(t); expect(v).toBeLessThanOrEqual(last + 1e-9); last = v; }
  });
});
