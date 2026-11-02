import { describe, expect, it } from 'vitest';
import { diwaliBadgeDue, diwaliOn } from '../src/game/diwali';

const DIWALI_WEEK = Date.parse('2026-11-08T20:00:00+05:30');
const LAST_MINUTE = Date.parse('2026-11-11T23:59:00+05:30');
const AFTER_DIWALI = Date.parse('2026-11-12T00:00:00+05:30');

describe('the Dressing Room card\'s NEW DIWALI KITS', () => {
  it('is Diwali week to the end of 11 November in India, and not after', () => {
    expect(diwaliOn(DIWALI_WEEK)).toBe(true);
    expect(diwaliOn(LAST_MINUTE)).toBe(true);
    expect(diwaliOn(AFTER_DIWALI)).toBe(false);
  });

  it('shows all Diwali week, the room opened or not, and goes with the kits', () => {
    expect(diwaliBadgeDue(DIWALI_WEEK)).toBe(true);
    expect(diwaliBadgeDue(LAST_MINUTE)).toBe(true);
    expect(diwaliBadgeDue(AFTER_DIWALI)).toBe(false);
  });
});
