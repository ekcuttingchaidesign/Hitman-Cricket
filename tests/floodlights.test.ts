import { describe, expect, it } from 'vitest';
import { FLOOD, floodAt, groundLevel } from '../src/scene/floodlights';

const frames = (cue: Parameters<typeof floodAt>[0], from: number, to: number, still = false) => {
  const out: number[] = [];
  for (let t = from; t <= to; t += 1000 / 60) out.push(floodAt(cue, t, still));
  return out;
};

describe("the floodlights answering the knockout's cut", () => {
  it('stand at the night\'s level with no cue, and before a cue made for later', () => {
    expect(floodAt(null, 5000)).toBe(1);
    expect(floodAt({ kind: 'flash', at: 2000 }, 1999)).toBe(1);
    expect(floodAt({ kind: 'dip', at: 2000 }, 1500)).toBe(1);
  });

  it('flash once at a cut: up to the peak, and back to the night by the end, never under it', () => {
    const levels = frames({ kind: 'flash', at: 0 }, 0, 1200);
    expect(Math.max(...levels)).toBeCloseTo(FLOOD.flash.peak, 1);
    expect(Math.min(...levels)).toBeGreaterThanOrEqual(1);
    expect(floodAt({ kind: 'flash', at: 0 }, FLOOD.flash.back)).toBeCloseTo(1, 5);
    // One flash, not a strobe: it rises once and falls once.
    let turns = 0;
    for (let i = 2; i < levels.length; i++) if (Math.sign(levels[i] - levels[i - 1]) !== Math.sign(levels[i - 1] - levels[i - 2]) && levels[i] !== levels[i - 1]) turns++;
    expect(turns).toBeLessThanOrEqual(1);
  });

  it('dip going into the final, and stay a shade down for it', () => {
    const cue = { kind: 'dip' as const, at: 0 };
    expect(floodAt(cue, FLOOD.dip.fall)).toBeCloseTo(FLOOD.dip.low, 5);
    expect(floodAt(cue, (FLOOD.dip.fall + FLOOD.dip.hold) / 2)).toBe(FLOOD.dip.low);
    expect(floodAt(cue, FLOOD.dip.back)).toBe(FLOOD.dip.settle);
    expect(floodAt(cue, 60_000)).toBe(FLOOD.dip.settle);
    const levels = frames(cue, 0, 2000);
    expect(Math.max(...levels)).toBeLessThanOrEqual(1);
    expect(Math.min(...levels)).toBeCloseTo(FLOOD.dip.low, 5);
  });

  it('under reduced motion: no flash, and the final straight at its settled level', () => {
    expect(Math.max(...frames({ kind: 'flash', at: 0 }, 0, 1000, true))).toBe(1);
    expect(floodAt({ kind: 'dip', at: 0 }, 10, true)).toBe(FLOOD.dip.settle);
  });

  it('light the ground by most of what the lamps change', () => {
    expect(groundLevel(1)).toBe(1);
    expect(groundLevel(FLOOD.flash.peak)).toBeCloseTo(1 + (FLOOD.flash.peak - 1) * FLOOD.ground, 5);
    expect(groundLevel(FLOOD.dip.low)).toBeGreaterThan(FLOOD.dip.low);
  });
});
