import { isPlayerId } from './board-store.js';
import type { BlastTally, CareerMode, MarathonTally, SurviveTally } from '../game/career.js';
import type { Look } from '../game/dressing-ids.js';
import {
  cleanRecap, factsOf, foldInnings, foldUnlocks, totalsOf, unlockTotals, whenOf, type YearRecap,
} from '../game/recap.js';

/**
 * Where the year recaps are kept: one record a player a year, and the year's
 * totals for everybody as counters (`src/game/recap.ts` says what is in them).
 *
 * Nothing here is ever the reason an innings or a save fails. The callers wait
 * on it — a serverless function's work stops when its answer goes — but catch
 * whatever it throws: a recap missing an innings is a smaller loss than a
 * career missing one.
 */
export interface RecapStore {
  read(year: number, playerId: string): Promise<YearRecap | null>;
  write(year: number, playerId: string, recap: YearRecap): Promise<void>;
  /** Raises each of the year's totals by its amount. */
  add(year: number, counts: Record<string, number>): Promise<void>;
}

/** A counted innings, into the player's year and the year's totals. */
export async function recordInnings(store: RecapStore, input: {
  playerId: string; mode: CareerMode; tally: BlastTally | SurviveTally | MarathonTally; look: Look | null; at: number;
}): Promise<void> {
  if (!isPlayerId(input.playerId)) return;
  const { year } = whenOf(input.at);
  const held = cleanRecap(await store.read(year, input.playerId));
  const facts = factsOf(input.mode, input.tally);
  await store.write(year, input.playerId, foldInnings(held, input.mode, facts, input.look, input.at));
  await store.add(year, totalsOf(input.mode, facts, input.look, input.at, !held || held.innings === 0));
}

/** Pieces of the Dressing Room this player has newly won, dated now. */
export async function recordUnlocks(store: RecapStore, input: { playerId: string; keys: readonly string[]; at: number }): Promise<void> {
  if (!isPlayerId(input.playerId) || !input.keys.length) return;
  const { year } = whenOf(input.at);
  const { recap, dated } = foldUnlocks(cleanRecap(await store.read(year, input.playerId)), input.keys, input.at);
  if (!dated.length) return;
  await store.write(year, input.playerId, recap);
  await store.add(year, unlockTotals(dated));
}

/** In memory, for the dev server and the tests. */
export function memoryRecap(): RecapStore & { totals(year: number): Record<string, number>; clear(): void } {
  const held = new Map<string, YearRecap>();
  const totals = new Map<number, Record<string, number>>();
  return {
    async read(year, id) { return held.get(`${year}:${id}`) ?? null; },
    async write(year, id, recap) { held.set(`${year}:${id}`, recap); },
    async add(year, counts) {
      const was = totals.get(year) ?? {};
      totals.set(year, Object.fromEntries([...new Set([...Object.keys(was), ...Object.keys(counts)])]
        .map(key => [key, (was[key] ?? 0) + (counts[key] ?? 0)])));
    },
    totals(year) { return totals.get(year) ?? {}; },
    clear() { held.clear(); totals.clear(); },
  };
}
