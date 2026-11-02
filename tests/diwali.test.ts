import { afterEach, describe, expect, it, vi } from 'vitest';
import { diwaliBadgeDue, diwaliOn, markDiwaliRoomSeen } from '../src/game/diwali';

const DIWALI_WEEK = Date.parse('2026-11-08T20:00:00+05:30');
const LAST_MINUTE = Date.parse('2026-11-11T23:59:00+05:30');
const AFTER_DIWALI = Date.parse('2026-11-12T00:00:00+05:30');

function fakeStorage() {
  const held = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => { held.set(key, value); },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('the Dressing Room card\'s NEW DIWALI KITS', () => {
  it('is Diwali week to the end of 11 November in India, and not after', () => {
    expect(diwaliOn(DIWALI_WEEK)).toBe(true);
    expect(diwaliOn(LAST_MINUTE)).toBe(true);
    expect(diwaliOn(AFTER_DIWALI)).toBe(false);
  });

  it('shows until the room is opened, and only in Diwali week', () => {
    fakeStorage();
    expect(diwaliBadgeDue(DIWALI_WEEK)).toBe(true);
    expect(diwaliBadgeDue(AFTER_DIWALI)).toBe(false);
    markDiwaliRoomSeen();
    expect(diwaliBadgeDue(DIWALI_WEEK)).toBe(false);
  });

  it('shows where nothing can be remembered, and saying so never throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('off'); },
      setItem: () => { throw new Error('off'); },
    });
    expect(diwaliBadgeDue(DIWALI_WEEK)).toBe(true);
    expect(() => markDiwaliRoomSeen()).not.toThrow();
  });
});
