import { describe, expect, it } from 'vitest';
import { batting, DAY_MARKS, WEEK_MARKS, weekOf, type Playtime } from '../src/game/playtime';

const MIN = 60_000;

describe('the week a day is in', () => {
  it('starts on the Monday', () => {
    expect(weekOf('2026-10-26')).toBe('2026-10-26'); // a Monday
    expect(weekOf('2026-10-27')).toBe('2026-10-26');
    expect(weekOf('2026-11-01')).toBe('2026-10-26'); // the Sunday after
    expect(weekOf('2026-11-02')).toBe('2026-11-02');
    // Across a year.
    expect(weekOf('2027-01-01')).toBe('2026-12-28');
  });
});

describe('a day and a week of batting', () => {
  it('says a browser is here this week on its first load, batting or not', () => {
    expect(batting(null, '2026-10-27', 0)).toEqual({
      playtime: { day: '2026-10-27', dayMs: 0, week: '2026-10-26', weekMs: 0 },
      events: ['week-active'],
    });
  });

  it('says it once a week', () => {
    const held: Playtime = { day: '2026-10-26', dayMs: 2 * MIN, week: '2026-10-26', weekMs: 2 * MIN };
    expect(batting(held, '2026-10-27', 0).events).toEqual([]);
    expect(batting(held, '2026-11-02', 0).events).toEqual(['week-active']);
  });

  it('sends a mark once, when it is passed', () => {
    const start = batting(null, '2026-10-27', 0).playtime;
    const first = batting(start, '2026-10-27', 50_000);
    expect(first.events).toEqual([]);
    const second = batting(first.playtime, '2026-10-27', 15_000);
    expect(second.events).toEqual(['day-batted-1m', 'week-batted-1m']);
    expect(batting(second.playtime, '2026-10-27', 5_000).events).toEqual([]);
  });

  it('adds up across sessions, so a day is one count however many it took', () => {
    let held: Playtime | null = null;
    const sent: string[] = [];
    for (let session = 0; session < 3; session++) {
      // Each session batting four minutes, folded in five-second pieces.
      for (let piece = 0; piece < 48; piece++) {
        const { playtime, events } = batting(held, '2026-10-27', 5_000);
        held = playtime;
        sent.push(...events);
      }
    }
    expect(held!.dayMs).toBe(12 * MIN);
    expect(sent.filter(event => event.startsWith('day-'))).toEqual(['day-batted-1m', 'day-batted-3m', 'day-batted-5m', 'day-batted-10m']);
    expect(sent.filter(event => event === 'week-active')).toHaveLength(1);
  });

  it('passes every mark a long fold jumps over', () => {
    const { events } = batting(null, '2026-10-27', 25 * MIN);
    expect(events).toEqual([
      'week-active',
      'day-batted-1m', 'day-batted-3m', 'day-batted-5m', 'day-batted-10m', 'day-batted-20m',
      'week-batted-1m', 'week-batted-5m', 'week-batted-10m', 'week-batted-20m',
    ]);
  });

  it('starts the day again on a new day and keeps the week', () => {
    const held: Playtime = { day: '2026-10-26', dayMs: 40 * MIN, week: '2026-10-26', weekMs: 40 * MIN };
    const { playtime, events } = batting(held, '2026-10-27', 2 * MIN);
    expect(playtime).toEqual({ day: '2026-10-27', dayMs: 2 * MIN, week: '2026-10-26', weekMs: 42 * MIN });
    expect(events).toEqual(['day-batted-1m']);
  });

  it('starts both again on a new week', () => {
    const held: Playtime = { day: '2026-11-01', dayMs: 10 * MIN, week: '2026-10-26', weekMs: 400 * MIN };
    const { playtime, events } = batting(held, '2026-11-02', 2 * MIN);
    expect(playtime).toEqual({ day: '2026-11-02', dayMs: 2 * MIN, week: '2026-11-02', weekMs: 2 * MIN });
    expect(events).toEqual(['week-active', 'day-batted-1m', 'week-batted-1m']);
  });

  it('treats a record it cannot read as none', () => {
    const junk = { day: 'yesterday', dayMs: -5, week: '2026-10-26', weekMs: 'lots' } as unknown as Playtime;
    expect(batting(junk, '2026-10-27', 0)).toEqual({
      playtime: { day: '2026-10-27', dayMs: 0, week: '2026-10-26', weekMs: 0 },
      events: ['week-active'],
    });
  });

  it('ignores a nonsense amount of play', () => {
    const held = batting(null, '2026-10-27', 0).playtime;
    expect(batting(held, '2026-10-27', Number.NaN).playtime.dayMs).toBe(0);
    expect(batting(held, '2026-10-27', -MIN).playtime.dayMs).toBe(0);
  });

  it('has its marks rising', () => {
    for (const marks of [DAY_MARKS, WEEK_MARKS]) expect([...marks].sort((a, b) => a - b)).toEqual([...marks]);
  });
});
