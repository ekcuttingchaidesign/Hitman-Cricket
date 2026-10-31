import { describe, expect, it } from 'vitest';
import { PODIUM, PODIUM_FLOOR, podiumCamera, podiumDue, podiumLine, podiumScore } from '../src/game/podium';

const ask = { mode: 'classic' as const, real: true, runs: 80, record: true, chaseWon: false };

describe('the podium: when it goes up', () => {
  it('stands for a new best over the floor, in the Blast and Super10', () => {
    expect(podiumDue(ask)).toBe('best');
    expect(podiumDue({ ...ask, runs: PODIUM_FLOOR.classic - 1 })).toBeNull();
    expect(podiumDue({ ...ask, mode: 'super10', runs: PODIUM_FLOOR.super10 - 1 })).toBeNull();
    expect(podiumDue({ ...ask, mode: 'super10', runs: PODIUM_FLOOR.super10 })).toBe('best');
    expect(podiumDue({ ...ask, record: false })).toBeNull();
  });

  it('stands for a chase won whatever it made, and says so rather than the best', () => {
    expect(podiumDue({ ...ask, runs: 20, record: false, chaseWon: true })).toBe('chase');
    expect(podiumDue({ ...ask, chaseWon: true })).toBe('chase');
  });

  it('never in the Tests, nor for an innings that does not count', () => {
    for (const mode of ['marathon', 'survive'] as const) expect(podiumDue({ ...ask, mode, chaseWon: true })).toBeNull();
    expect(podiumDue({ ...ask, real: false, chaseWon: true })).toBeNull();
  });
});

describe('the podium: what it says', () => {
  it('names the chase, and reads a Super10 total as its board does', () => {
    expect(podiumLine('best', null)).toBe('New best');
    expect(podiumLine('chase', { name: 'Kabir', target: 157 })).toBe("Chased Kabir's 157");
    expect(podiumScore('classic', 181, 2)).toBe('181');
    expect(podiumScore('super10', 181, 3)).toBe('181/3');
  });
});

describe('the podium: the camera', () => {
  it('moves slowly, no faster than a crane but at a cut', () => {
    let last = podiumCamera(0);
    for (let t = 16; t <= PODIUM.total; t += 16) {
      const now = podiumCamera(t);
      if (!PODIUM.cuts.some(cut => t - 16 < cut && t >= cut)) expect(Math.hypot(...now.eye.map((v, i) => v - last.eye[i])) / .016).toBeLessThan(3.5);
      last = now;
    }
  });

  it('keeps off the gloves: never nearer him than full-body distance', () => {
    // He stands on the block, his chest about two metres over the deck's front edge and 2.4 back.
    for (let t = 0; t <= PODIUM.total; t += 50) {
      const { eye } = podiumCamera(t);
      expect(Math.hypot(eye[0], eye[1] - 2.6, eye[2] + 2.4)).toBeGreaterThan(6.5);
    }
  });

  it('ends low, looking up at him', () => {
    const end = podiumCamera(PODIUM.total);
    expect(end.eye[1]).toBeLessThan(1.5);
    expect(end.at[1]).toBeGreaterThan(end.eye[1] + 1.5);
  });
});
