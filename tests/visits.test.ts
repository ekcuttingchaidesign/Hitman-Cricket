import { describe, expect, it } from 'vitest';
import { inningsBand, marksPassed, PLAY_MARKS } from '../src/game/analytics';
import { backBand, daysBand, daysBetween, today, visiting, type Visits } from '../src/game/visits';

describe('a day, as the player would name it', () => {
  it('is their own date and not UTC', () => {
    // Half past eight in the evening in India is still the same day there, and
    // three in the afternoon UTC. A UTC date would file it under the wrong day
    // for a game whose players are mostly in one timezone.
    const evening = new Date('2026-09-16T20:30:00+05:30');
    expect(today(evening)).toBe(new Date(evening.getTime() - evening.getTimezoneOffset() * 60_000).toISOString().slice(0, 10));
  });

  it('counts whole days between two of them', () => {
    expect(daysBetween('2026-09-16', '2026-09-16')).toBe(0);
    expect(daysBetween('2026-09-16', '2026-09-17')).toBe(1);
    expect(daysBetween('2026-09-16', '2026-10-16')).toBe(30);
    // Across a daylight-saving change, where the two days are 23 hours apart.
    expect(daysBetween('2026-03-28', '2026-03-29')).toBe(1);
  });
});

describe('who is coming back', () => {
  it('files a browser that has never played as new', () => {
    expect(visiting(null, '2026-09-16')).toEqual({
      visits: { first: '2026-09-16', last: '2026-09-16', days: 1 },
      events: ['visitor-new', 'days-played-1'],
    });
  });

  it('does not count the same day twice', () => {
    const held: Visits = { first: '2026-09-16', last: '2026-09-16', days: 1 };
    const { visits, events } = visiting(held, '2026-09-16');
    expect(visits.days).toBe(1);
    expect(events).toEqual(['visitor-returning', 'back-same-day', 'days-played-1']);
  });

  it('counts a new day and says how long they were away', () => {
    const held: Visits = { first: '2026-09-01', last: '2026-09-15', days: 4 };
    const { visits, events } = visiting(held, '2026-09-16');
    expect(visits).toEqual({ first: '2026-09-01', last: '2026-09-16', days: 5 });
    expect(events).toEqual(['visitor-returning', 'back-next-day', 'days-played-3-5']);
  });

  it('keeps the day it first played, whatever else changes', () => {
    const held: Visits = { first: '2026-01-01', last: '2026-09-15', days: 9 };
    expect(visiting(held, '2026-09-30').visits.first).toBe('2026-01-01');
  });

  it('treats a clock wound backwards as the same day rather than a new one', () => {
    const held: Visits = { first: '2026-09-16', last: '2026-09-16', days: 1 };
    const { visits, events } = visiting(held, '2026-09-15');
    expect(visits).toEqual({ first: '2026-09-16', last: '2026-09-16', days: 1 });
    expect(events[1]).toBe('back-same-day');
  });

  it('treats a record it cannot read as a browser that has not played', () => {
    for (const junk of [{}, { first: 'x', last: 'x', days: 1 }, { first: '2026-09-16', last: '2026-09-16', days: 0 }]) {
      expect(visiting(junk as Visits, '2026-09-16').events[0]).toBe('visitor-new');
    }
  });

  it('bands the gap and the loyalty the way a retention curve is read', () => {
    expect([0, 1, 2, 7, 8, 30, 31].map(backBand)).toEqual([
      'back-same-day', 'back-next-day', 'back-2-7-days', 'back-2-7-days',
      'back-8-30-days', 'back-8-30-days', 'back-over-30-days',
    ]);
    expect([1, 2, 3, 5, 6, 10, 11, 400].map(daysBand)).toEqual([
      'days-played-1', 'days-played-2', 'days-played-3-5', 'days-played-3-5',
      'days-played-6-10', 'days-played-6-10', 'days-played-11-plus', 'days-played-11-plus',
    ]);
  });
});

describe('how long it took', () => {
  it('bands an innings around the two minutes thirty balls actually take', () => {
    expect(inningsBand(12_000)).toBe('innings-under-30s');
    expect(inningsBand(45_000)).toBe('innings-30-60s');
    expect(inningsBand(75_000)).toBe('innings-60-90s');
    expect(inningsBand(110_000)).toBe('innings-90-120s');
    expect(inningsBand(150_000)).toBe('innings-2-3m');
    expect(inningsBand(240_000)).toBe('innings-3-5m');
    expect(inningsBand(600_000)).toBe('innings-over-5m');
  });

  it('never leaves a duration between two bands', () => {
    const bands = new Set(Array.from({ length: 700 }, (_, s) => inningsBand(s * 1000)));
    expect(bands.size).toBe(7);
  });

  it('passes each mark once, and only once it is reached', () => {
    expect(marksPassed(0)).toEqual([]);
    expect(marksPassed(59_000)).toEqual([]);
    expect(marksPassed(60_000)).toEqual(['played-1m']);
    expect(marksPassed(5 * 60_000)).toEqual(['played-1m', 'played-3m', 'played-5m']);
    // Every mark is passed by a session that runs past the last one, which is
    // what makes the counts a curve rather than a set of disjoint buckets.
    expect(marksPassed(60 * 60_000)).toHaveLength(PLAY_MARKS.length);
  });
});
