import type { BlastTally, CareerMode, MarathonTally, SurviveTally } from './career.js';
import { standingOf } from './survive-board.js';
import { FREE_BAT, FREE_OUTFIT, type Look } from './dressing-ids.js';

/**
 * A player's year, kept for the recap at the end of it.
 *
 * A career is a sum since the first innings and cannot say what happened in
 * one year, on which days, in which kit. So every innings counted toward a
 * career is also folded into the player's record for its year, and into the
 * year's totals for everybody: the figures a December recap tells — innings,
 * runs, best and milestones a mode, the kit and the bat played in most, the
 * days and hours played, the date each piece of the Dressing Room was won —
 * and what the whole game did beside them.
 *
 * It is folded on the server, from the same innings the career takes and only
 * when the career takes it (`counted`), so a repeat is never counted twice and
 * nothing here can be asked for by a browser on its own. Dates are the
 * server's, read in India's time, where the game is played: a day is a day
 * there, and so is an hour.
 */

/** India's time, ahead of UTC by five and a half hours, with no summer time to follow. */
const ZONE_MS = 330 * 60_000;

/** What one mode added up to over the year. */
export interface RecapMode {
  innings: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  /** The most runs in one innings: one batter's in the Blast and Survival, the side's in a Marathon. */
  best: number;
  /** Batters' scores of fifty to ninety-nine, and of a hundred or more. */
  fifties: number;
  hundreds: number;
  /** Test Survivals won; nought for the other two, which are not won. */
  wins: number;
}

export interface YearRecap {
  innings: number;
  /** When the year's first and last innings were counted. */
  first: number;
  last: number;
  modes: Partial<Record<CareerMode, RecapMode>>;
  /** Innings played in each kit and with each bat, by id. */
  kits: Record<string, number>;
  bats: Record<string, number>;
  /** Innings on each day (`MM-DD`) and in each hour (`0`–`23`), in India's time. */
  days: Record<string, number>;
  hours: Record<string, number>;
  /** When each piece of the Dressing Room was won, by its seen key (`kit:electric`). */
  unlocked: Record<string, number>;
}

/** The year, the day and the hour a moment falls in, in India's time. */
export function whenOf(at: number): { year: number; day: string; hour: number } {
  const there = new Date(at + ZONE_MS);
  const day = `${String(there.getUTCMonth() + 1).padStart(2, '0')}-${String(there.getUTCDate()).padStart(2, '0')}`;
  return { year: there.getUTCFullYear(), day, hour: there.getUTCHours() };
}

/** One innings' figures, the same whichever mode it was. */
export interface InningsFacts {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  fifties: number;
  hundreds: number;
  won: boolean;
}

export function factsOf(mode: CareerMode, tally: BlastTally | SurviveTally | MarathonTally): InningsFacts {
  const milestones = (scores: number[]) => ({
    fifties: scores.filter(runs => runs >= 50 && runs < 100).length,
    hundreds: scores.filter(runs => runs >= 100).length,
  });
  if (mode === 'marathon') {
    const t = tally as MarathonTally;
    return { runs: t.runs, balls: t.balls, fours: t.fours, sixes: t.sixes, ...milestones(t.batters.map(b => b.runs)), won: false };
  }
  if (mode === 'survive') {
    const t = tally as SurviveTally;
    return { runs: t.runs, balls: t.balls, fours: t.fours, sixes: t.sixes, ...milestones([t.runs]), won: standingOf(t) === 'WON' };
  }
  // A Blast tally knows its best batsman's score and how many reached a hundred,
  // so a fifty is that best score short of a hundred.
  const t = tally as BlastTally;
  return {
    runs: t.runs, balls: t.balls, fours: t.fours, sixes: t.sixes,
    fifties: Number(t.individual >= 50 && t.individual < 100), hundreds: t.hundreds, won: false,
  };
}

export function emptyRecap(at: number): YearRecap {
  return { innings: 0, first: at, last: at, modes: {}, kits: {}, bats: {}, days: {}, hours: {}, unlocked: {} };
}

const bump = (counts: Record<string, number>, key: string, by = 1) => ({ ...counts, [key]: (counts[key] ?? 0) + by });

/** A counted innings, added to the player's year. */
export function foldInnings(held: YearRecap | null, mode: CareerMode, facts: InningsFacts, look: Look | null, at: number): YearRecap {
  const was = held ?? emptyRecap(at);
  const { day, hour } = whenOf(at);
  const m = was.modes[mode] ?? { innings: 0, runs: 0, balls: 0, fours: 0, sixes: 0, best: 0, fifties: 0, hundreds: 0, wins: 0 };
  return {
    ...was,
    innings: was.innings + 1,
    first: Math.min(was.first, at),
    last: Math.max(was.last, at),
    modes: {
      ...was.modes,
      [mode]: {
        innings: m.innings + 1, runs: m.runs + facts.runs, balls: m.balls + facts.balls,
        fours: m.fours + facts.fours, sixes: m.sixes + facts.sixes, best: Math.max(m.best, facts.runs),
        fifties: m.fifties + facts.fifties, hundreds: m.hundreds + facts.hundreds, wins: m.wins + Number(facts.won),
      },
    },
    kits: look ? bump(was.kits, look.kit) : was.kits,
    bats: look ? bump(was.bats, look.bat) : was.bats,
    days: bump(was.days, day),
    hours: bump(was.hours, String(hour)),
  };
}

/** What every player has from the start: in a seen list, never won. */
const FREE = new Set([`kit:${FREE_OUTFIT}`, `bat:${FREE_BAT}`]);

/**
 * Pieces of the Dressing Room newly won, dated. One already dated keeps its
 * first date, and the free kit and bat are never won.
 */
export function foldUnlocks(held: YearRecap | null, keys: readonly string[], at: number): { recap: YearRecap; dated: string[] } {
  const was = held ?? emptyRecap(at);
  const dated = keys.filter(key => !FREE.has(key) && !(key in was.unlocked));
  if (!dated.length) return { recap: was, dated };
  return { recap: { ...was, unlocked: { ...was.unlocked, ...Object.fromEntries(dated.map(key => [key, at])) } }, dated };
}

/**
 * What one innings adds to the year's totals for everybody, as counters to
 * raise. Flat names, so the store can keep them as one hash of numbers and
 * raise each in place: two players counted at once both land.
 */
export function totalsOf(mode: CareerMode, facts: InningsFacts, look: Look | null, at: number, firstOfYear: boolean): Record<string, number> {
  const { day, hour } = whenOf(at);
  const counts: Record<string, number> = {
    innings: 1, [`innings:${mode}`]: 1, runs: facts.runs, balls: facts.balls, fours: facts.fours, sixes: facts.sixes,
    [`day:${day}`]: 1, [`hour:${hour}`]: 1,
  };
  if (facts.fifties) counts.fifties = facts.fifties;
  if (facts.hundreds) counts.hundreds = facts.hundreds;
  if (facts.won) counts[`wins:${mode}`] = 1;
  if (look) { counts[`kit:${look.kit}`] = 1; counts[`bat:${look.bat}`] = 1; }
  if (firstOfYear) counts.players = 1;
  return counts;
}

/** Newly won pieces, as counters on the year's totals: how many players won each. */
export const unlockTotals = (dated: readonly string[]): Record<string, number> =>
  Object.fromEntries(dated.map(key => [`unlock:${key}`, 1]));

/** A held record as read back, or null for anything that is not one. */
export function cleanRecap(raw: unknown): YearRecap | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<YearRecap>;
  if (typeof r.innings !== 'number' || typeof r.first !== 'number' || typeof r.last !== 'number') return null;
  const counts = (v: unknown) => (v && typeof v === 'object' ? v as Record<string, number> : {});
  return {
    innings: r.innings, first: r.first, last: r.last,
    modes: counts(r.modes) as YearRecap['modes'],
    kits: counts(r.kits), bats: counts(r.bats), days: counts(r.days), hours: counts(r.hours), unlocked: counts(r.unlocked),
  };
}
