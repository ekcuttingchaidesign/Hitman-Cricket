import { describe, expect, it } from 'vitest';
import { CONTACT, contactDark, RIM_LIGHT } from '../src/scene/polish';

describe('the picture\'s finish', () => {
  it('is darkest under a boot on the turf, fainter as it lifts, and gone once it is well up', () => {
    expect(contactDark(0)).toBe(CONTACT.dark);
    expect(contactDark(CONTACT.lifted / 2)).toBeLessThan(CONTACT.dark / 2);
    expect(contactDark(CONTACT.lifted)).toBe(0);
    expect(contactDark(2)).toBe(0);
    let last = Infinity;
    for (let h = 0; h <= .5; h += .02) { const dark = contactDark(h); expect(dark).toBeLessThanOrEqual(last); last = dark; }
  });
  it('never blacks the turf out, and is laid above the strip', () => {
    expect(CONTACT.dark).toBeLessThanOrEqual(.5);
    // The strip's top is 12.5mm over the ground: under it, nothing shows.
    expect(CONTACT.over).toBeGreaterThan(.0125);
  });
  it('lights his edges a little by day and more under the floodlights, never as bright as the kit itself', () => {
    expect(RIM_LIGHT.night.strength).toBeGreaterThan(RIM_LIGHT.day.strength);
    expect(RIM_LIGHT.night.strength).toBeLessThan(1);
  });
});
