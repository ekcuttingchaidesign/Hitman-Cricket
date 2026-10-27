/**
 * How long a player bats in a day and in a week.
 *
 * The session marks (`played-5m` and the rest) stop at a session, and a
 * session is GoatCounter's: one player on a phone whose address changes is two
 * of them, and a player who comes back after lunch is two more. What a player
 * spends in a day or a week can only be added up where the player is, so the
 * browser keeps its own running totals and says, once, each time one of them
 * passes a mark: `day-batted-10m` is a device that batted ten minutes on one
 * day, counted once for that day however many sessions it took.
 *
 * A mark goes out the moment it is passed rather than in a report at the next
 * visit, so a player who never comes back still has their last day counted.
 * The counts fall away across the marks as the session marks do, and the
 * falling-away is the distribution. `week-active` is the denominator for the
 * week's marks, sent once a week on the first load, batting or not; the day's
 * is the daily active count `visits.ts` already gives. `month-active` is the
 * same once a calendar month, which makes it the monthly active count:
 * GoatCounter cannot give one, since it forgets a visitor overnight. As there,
 * no date and no identifier ever goes out: only the mark.
 */

const KEY = 'hitman-playtime';

/** The marks a day's batting is counted past, in minutes. */
export const DAY_MARKS = [1, 3, 5, 10, 20, 30, 45, 60, 90, 120] as const;
/** The same for a week, Monday to Sunday. */
export const WEEK_MARKS = [1, 5, 10, 20, 30, 60, 90, 120, 180, 300] as const;

/** What this browser has batted today and this week. */
export interface Playtime {
  /** The day the day's total is for, YYYY-MM-DD in the player's own timezone. */
  day: string;
  dayMs: number;
  /** The Monday the week's total is for. */
  week: string;
  weekMs: number;
  /** The last month this browser said it was here, YYYY-MM. Missing from a record kept before it was. */
  month?: string;
}

/** The Monday of the week a day is in, as YYYY-MM-DD. */
export function weekOf(day: string): string {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() - (at.getUTCDay() + 6) % 7);
  return at.toISOString().slice(0, 10);
}

const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isMs = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** The marks passed going from one total to another. */
function passed(marks: readonly number[], from: number, to: number, unit: 'day' | 'week'): string[] {
  return marks.filter(minutes => from < minutes * 60_000 && to >= minutes * 60_000).map(minutes => `${unit}-batted-${minutes}m`);
}

/**
 * Some batting, folded into what came before it, on the day it was batted.
 * Pure, so the rollover and the marks can be tested without a clock. A day or
 * week that has moved on starts its total again; a record that does not parse
 * is treated as none. `week-active` and `month-active` go out whenever the
 * week or month is new to this browser, which is why a load folds in nothing
 * to say it was here.
 */
export function batting(held: Playtime | null, day: string, ms: number): { playtime: Playtime; events: string[] } {
  const week = weekOf(day), month = day.slice(0, 7);
  const valid = !!held && isDay(held.day) && isMs(held.dayMs) && isDay(held.week) && isMs(held.weekMs);
  const dayFrom = valid && held.day === day ? held.dayMs : 0;
  const weekFrom = valid && held.week === week ? held.weekMs : 0;
  const add = isMs(ms) ? ms : 0;
  const playtime: Playtime = { day, dayMs: dayFrom + add, week, weekMs: weekFrom + add, month };
  const events = [
    ...(valid && held.week === week ? [] : ['week-active']),
    ...(held?.month === month ? [] : ['month-active']),
    ...passed(DAY_MARKS, dayFrom, playtime.dayMs, 'day'),
    ...passed(WEEK_MARKS, weekFrom, playtime.weekMs, 'week'),
  ];
  return { playtime, events };
}

/** What this browser has kept, or null for nothing or nothing readable. */
export function readPlaytime(): Playtime | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as Playtime : null;
  } catch {
    return null;
  }
}

export function writePlaytime(playtime: Playtime) {
  try { localStorage.setItem(KEY, JSON.stringify(playtime)); } catch { /* A session remains playable without it. */ }
}
