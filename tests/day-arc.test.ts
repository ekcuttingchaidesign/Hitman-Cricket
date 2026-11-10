import { describe, expect, it } from 'vitest';
import { DAY_ARC, dayArcAt, RICH } from '../src/scene/night';

describe('a Test\'s day, morning to evening', () => {
  it('starts on its first key and ends on its last, and holds outside them', () => {
    expect(dayArcAt(0).sun).toEqual(DAY_ARC[0].sun);
    expect(dayArcAt(1).sun).toEqual(DAY_ARC[DAY_ARC.length - 1].sun);
    expect(dayArcAt(-3).colour).toBe(DAY_ARC[0].colour);
    expect(dayArcAt(9).horizon).toBe(DAY_ARC[DAY_ARC.length - 1].horizon);
  });
  it('passes through the afternoon the other games stand in', () => {
    const afternoon = DAY_ARC.find(key => key.at > .5 && key.at < 1)!;
    expect(afternoon.sun).toEqual(RICH.day.key.position);
    expect(dayArcAt(afternoon.at).key).toBeCloseTo(RICH.day.key.intensity);
  });
  it('moves the sun smoothly, with no jump from one ball to the next', () => {
    let last = dayArcAt(0);
    for (let p = .005; p <= 1; p += .005) {
      const now = dayArcAt(p);
      expect(Math.hypot(now.sun[0] - last.sun[0], now.sun[1] - last.sun[1], now.sun[2] - last.sun[2])).toBeLessThan(1);
      expect(Math.abs(now.key - last.key)).toBeLessThan(.05);
      last = now;
    }
  });
  it('keeps the sun in the sky and the ground lit all day', () => {
    for (let p = 0; p <= 1; p += .05) {
      const day = dayArcAt(p);
      expect(day.sun[1]).toBeGreaterThan(10);
      expect(day.key).toBeGreaterThan(3);
      expect(day.hemisphere).toBeGreaterThan(.45);
    }
  });
  it('is highest in the middle of the day and lowest at its ends', () => {
    const noon = Math.max(...DAY_ARC.map(key => key.sun[1]));
    expect(dayArcAt(.42).sun[1]).toBe(noon);
    expect(dayArcAt(0).sun[1]).toBeLessThan(noon);
    expect(dayArcAt(1).sun[1]).toBeLessThan(dayArcAt(.78).sun[1]);
  });
});
