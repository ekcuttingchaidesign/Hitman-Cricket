/**
 * How often somebody comes back.
 *
 * GoatCounter counts a visitor once per day and, deliberately, has no way to
 * recognise them tomorrow: the hash it identifies a visit by is salted and the
 * salt rotates, which is most of why it needs no cookie banner. So it can give a
 * daily active count and it can never give a monthly one — thirty days of
 * uniques added up counts a player who came back every day as thirty people.
 *
 * What it can count is events, and the browser already knows what GoatCounter
 * has forgotten. So the recognising happens here, on the player's own machine,
 * and what leaves it is a bucket: new or returning, how long since last time,
 * and how many separate days they have played. No date and no identifier ever
 * goes out, which keeps the counter as anonymous as it was.
 */

const KEY = 'hitman-visits';

/** What this browser remembers about its own visits. */
export interface Visits {
  /** The day it first played, as YYYY-MM-DD. */
  first: string;
  /** The last day it played. */
  last: string;
  /** How many separate days it has played on. */
  days: number;
}

/** A day, in the player's own timezone: the one they would call today. */
export function today(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Whole days between two of those, which is what the gap buckets are counted in. */
export function daysBetween(from: string, to: string): number {
  const gap = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Number.isFinite(gap) ? Math.round(gap / 86_400_000) : 0;
}

/**
 * This visit, folded into what came before it. Pure, so the bucketing can be
 * tested without a browser and without a clock.
 *
 * A day is only counted once however many innings are played in it, and a
 * record whose dates do not parse is treated as no record at all rather than
 * repaired — a browser holding junk is a browser that has not played before.
 */
export function visiting(held: Visits | null, day: string): { visits: Visits; events: string[] } {
  if (!held || !/^\d{4}-\d{2}-\d{2}$/.test(held.last) || !Number.isInteger(held.days) || held.days < 1) {
    return { visits: { first: day, last: day, days: 1 }, events: ['visitor-new', 'days-played-1'] };
  }
  const gap = daysBetween(held.last, day);
  // A clock wound backwards, or a day that has not turned over yet: the same
  // day either way, and a day already counted is not counted again.
  const sameDay = gap <= 0;
  const visits: Visits = {
    first: held.first,
    last: sameDay ? held.last : day,
    days: sameDay ? held.days : held.days + 1,
  };
  return { visits, events: ['visitor-returning', backBand(gap), daysBand(visits.days)] };
}

/** How long they were away, in the bands a retention curve is read in. */
export function backBand(gap: number): string {
  if (gap <= 0) return 'back-same-day';
  if (gap === 1) return 'back-next-day';
  if (gap <= 7) return 'back-2-7-days';
  if (gap <= 30) return 'back-8-30-days';
  return 'back-over-30-days';
}

/** How many separate days they have played. The stickiness of the game, banded. */
export function daysBand(days: number): string {
  if (days <= 1) return 'days-played-1';
  if (days === 2) return 'days-played-2';
  if (days <= 5) return 'days-played-3-5';
  if (days <= 10) return 'days-played-6-10';
  return 'days-played-11-plus';
}

/**
 * What this browser remembers, or null where it remembers nothing — which
 * includes storage being switched off. That case is deliberately not reported
 * as a new player: a browser that cannot remember would file one every single
 * session and the new-player count, the one figure here that is exact, would be
 * the least trustworthy thing on the dashboard.
 */
export function readVisits(): { held: Visits | null; storable: boolean } {
  try {
    const raw = localStorage.getItem(KEY);
    // A write is attempted rather than assumed: Safari in a private window has
    // the API and throws on use, which is the case this is here to catch.
    localStorage.setItem(KEY, raw ?? '');
    if (!raw) { localStorage.removeItem(KEY); return { held: null, storable: true }; }
    return { held: JSON.parse(raw) as Visits, storable: true };
  } catch {
    return { held: null, storable: false };
  }
}

export function writeVisits(visits: Visits) {
  try { localStorage.setItem(KEY, JSON.stringify(visits)); } catch { /* A session remains playable without it. */ }
}
