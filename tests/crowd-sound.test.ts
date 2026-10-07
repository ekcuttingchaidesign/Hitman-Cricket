import { describe, expect, it } from 'vitest';
import { boundaryCheer, boundaryStreak, GROAN, milestoneCheer, MURMUR, nearMiss } from '../src/game/crowd';

const ball = (runs: number, isWicket = false) => ({ runs: runs as 0, isWicket });

describe('the crowd', () => {
  it('counts the boundaries running, this ball the last of them', () => {
    expect(boundaryStreak([])).toBe(0);
    expect(boundaryStreak([ball(4), ball(1)])).toBe(0);
    expect(boundaryStreak([ball(1), ball(4)])).toBe(1);
    expect(boundaryStreak([ball(0), ball(6), ball(4), ball(6)])).toBe(3);
    // A wicket breaks the run, even off a ball that would have been four.
    expect(boundaryStreak([ball(4), ball(4, true), ball(4)])).toBe(1);
  });

  it('cheers a size up for each boundary in a row, and for a six', () => {
    expect(boundaryCheer(4, 1, false).size).toBe('soft');
    expect(boundaryCheer(6, 1, false).size).toBe('mid');
    expect(boundaryCheer(4, 2, false).size).toBe('mid');
    expect(boundaryCheer(6, 2, false).size).toBe('big');
    expect(boundaryCheer(4, 3, false).size).toBe('big');
    expect(boundaryCheer(4, 9, false).size).toBe('big');
  });

  it('and louder, longer, and lifting the murmur further as the run goes on', () => {
    for (const runs of [4, 6] as const) for (let run = 1; run < 6; run++) {
      const [now, next] = [boundaryCheer(runs, run, false), boundaryCheer(runs, run + 1, false)];
      expect(next.peak).toBeGreaterThanOrEqual(now.peak);
      expect(next.decay).toBeGreaterThanOrEqual(now.decay);
      expect(next.swell).toBeGreaterThanOrEqual(now.swell);
      expect(next.peak).toBeLessThanOrEqual(1);
    }
    expect(boundaryCheer(6, 1, false).peak).toBeGreaterThan(boundaryCheer(4, 1, false).peak);
  });

  it('a size down in a Test, and quieter, but a milestone is the biggest in either', () => {
    expect(boundaryCheer(4, 1, true).size).toBe('soft');
    expect(boundaryCheer(6, 2, true).size).toBe('mid');
    expect(boundaryCheer(4, 3, true).size).toBe('mid');
    for (let run = 1; run < 5; run++) expect(boundaryCheer(4, run, true).peak).toBeLessThan(boundaryCheer(4, run, false).peak);
    expect(MURMUR.test).toBeLessThan(MURMUR.blast);
    const hundred = milestoneCheer(2.8);
    expect(hundred.size).toBe('big');
    expect(hundred.peak).toBe(1);
    expect(hundred.decay).toBeGreaterThan(boundaryCheer(6, 1, false).decay);
  });
  it('groans at a near thing only in a Test, off the express bowler, at a stroke that missed', () => {
    const missed = { madeBatContact: false, isWicket: false };
    const near = { test: true, express: true, attempted: true, outcome: missed };
    expect(nearMiss(near)).toBe(true);
    expect(nearMiss({ ...near, test: false })).toBe(false);
    expect(nearMiss({ ...near, express: false })).toBe(false);
    // Left alone: never near the bat.
    expect(nearMiss({ ...near, attempted: false })).toBe(false);
    expect(nearMiss({ ...near, outcome: { ...missed, madeBatContact: true } })).toBe(false);
    // Out is the wicket's groan, not this one; ducked, or hit, is not a near thing.
    expect(nearMiss({ ...near, outcome: { ...missed, isWicket: true } })).toBe(false);
    expect(nearMiss({ ...near, outcome: { ...missed, defended: true } })).toBe(false);
    expect(nearMiss({ ...near, outcome: { ...missed, hit: { where: 'RIBS' as const, damage: 10 } } })).toBe(false);
    // Quieter than a wicket's, and a Test's wicket quieter than the Blast's.
    expect(GROAN.near.level).toBeLessThan(GROAN.outTest.level);
    expect(GROAN.outTest.level).toBeLessThan(GROAN.out.level);
    // The murmur gives way to it, a near thing's least.
    expect(GROAN.near.under).toBeGreaterThan(GROAN.out.under);
    for (const groan of Object.values(GROAN)) expect(groan.under).toBeLessThan(1);
  });
});

describe('the placards', () => {
  it('always the number, then two others, with the name put in, or left out without one', async () => {
    const { CROWD_MOMENTS, pickLabels } = await import('../src/scene/CrowdCelebration');
    for (let i = 0; i < 40; i++) {
      const named = pickLabels(CROWD_MOMENTS.century.labels(100), 'Arjun Sharma-Verma');
      expect(named[0]).toBe('100');
      expect(new Set(named).size).toBe(3);
      for (const label of named) expect(label).not.toContain('{NAME}');
      const nameless = pickLabels(CROWD_MOMENTS.century.labels(100), '');
      for (const label of nameless) expect(label).not.toMatch(/NAME|\*$|^GO /);
    }
    // Names are cut to fit a placard.
    expect(pickLabels(['{NAME}'], 'Bartholomew Longname')[0]).toBe('BARTHOLOME');
  });
});
