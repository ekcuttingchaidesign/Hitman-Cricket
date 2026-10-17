import { describe, expect, it } from 'vitest';
import { landedSpecial, pulledBouncer, specialStroke } from '../src/game/Confidence';

const shot = (extra: object) => ({ madeBatContact: true, isWicket: false, runs: 0 as 0 | 1 | 2 | 3 | 4 | 6, ...extra });

describe('the flash for a special stroke', () => {
  it('is for the three strokes a full meter buys', () => {
    expect(landedSpecial(shot({ advance: true }))).toBe(true);
    expect(landedSpecial(shot({ swept: true }))).toBe(true);
    expect(landedSpecial(shot({ scooped: true, runs: 6 }))).toBe(true);
  });

  it('is for a scoop only when it goes for six', () => {
    for (const runs of [0, 1, 2, 3, 4] as const) expect(landedSpecial(shot({ scooped: true, runs })), `${runs}`).toBe(false);
    expect(landedSpecial(shot({ scooped: true, runs: 6 }))).toBe(true);
    // The charge and the sweep keep theirs for whatever they land.
    expect(landedSpecial(shot({ advance: true, runs: 1 }))).toBe(true);
    expect(landedSpecial(shot({ swept: true, runs: 4 }))).toBe(true);
    // A scoop for four still spent the meter.
    expect(specialStroke({ scooped: true })).toBe(true);
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

describe('the flash for a pulled bouncer', () => {
  const six = { runs: 6 as const, madeBatContact: true, isWicket: false };
  it('is for a bouncer pulled and hit', () => {
    expect(pulledBouncer({ style: 'SHORT' }, 'LEG', six)).toBe(true);
  });

  it('is not for the pull at anything but the bouncer, or anything but the pull at it', () => {
    expect(pulledBouncer({ style: 'RIB' }, 'LEG', six)).toBe(false);
    expect(pulledBouncer({ style: 'NORMAL' }, 'LEG', six)).toBe(false);
    // The cut is the other answer to a short ball, and an ordinary one.
    expect(pulledBouncer({ style: 'SHORT' }, 'SQUARE_CUT', six)).toBe(false);
    expect(pulledBouncer({ style: 'SHORT' }, undefined, six)).toBe(false);
  });

  it('is for a hooked six, and not a hook worth less', () => {
    expect(pulledBouncer({ style: 'SHORT' }, 'HOOK', six)).toBe(true);
    for (const runs of [1, 2, 3, 4] as const) expect(pulledBouncer({ style: 'SHORT' }, 'HOOK', { ...six, runs }), `${runs}`).toBe(false);
    expect(pulledBouncer({ style: 'SHORT' }, 'HOOK', { ...six, runs: 0, isWicket: true })).toBe(false);
  });

  it('is not for a pull that missed, gloved it, or got him out', () => {
    expect(pulledBouncer({ style: 'SHORT' }, 'LEG', { ...six, runs: 0, madeBatContact: false })).toBe(false);
    expect(pulledBouncer({ style: 'SHORT' }, 'LEG', { ...six, runs: 0 })).toBe(false);
    expect(pulledBouncer({ style: 'SHORT' }, 'LEG', { ...six, runs: 0, isWicket: true })).toBe(false);
  });

  it('is never a special stroke, which has its own flash', () => {
    expect(pulledBouncer({ style: 'SHORT' }, 'LEG', { ...six, swept: true })).toBe(false);
  });
});
