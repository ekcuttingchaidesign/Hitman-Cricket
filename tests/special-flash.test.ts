import { describe, expect, it } from 'vitest';
import { landedSpecial, specialStroke } from '../src/game/Confidence';

const shot = (extra: object) => ({ madeBatContact: true, isWicket: false, ...extra });

describe('the flash for a special stroke', () => {
  it('is for the three strokes a full meter buys', () => {
    expect(landedSpecial(shot({ advance: true }))).toBe(true);
    expect(landedSpecial(shot({ swept: true }))).toBe(true);
    expect(landedSpecial(shot({ scooped: true }))).toBe(true);
  });

  it('is not for an ordinary shot, however big', () => {
    expect(specialStroke({})).toBe(false);
    expect(landedSpecial(shot({}))).toBe(false);
  });

  it('is not for a special stroke that missed or got him out', () => {
    expect(landedSpecial(shot({ scooped: true, madeBatContact: false }))).toBe(false);
    expect(landedSpecial(shot({ swept: true, isWicket: true }))).toBe(false);
    // Still a special stroke, and it still spends the meter.
    expect(specialStroke({ swept: true })).toBe(true);
  });
});
