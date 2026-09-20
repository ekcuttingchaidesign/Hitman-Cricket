import type { CareerStore, StoredCareer } from './career-store.js';

/**
 * Careers, in memory.
 *
 * The same two jobs the innings board's fake has. It backs the endpoints while
 * `npm run dev` is running, so the stats card fills up and the career boards
 * rank properly with no credentials and no database; and it is what the tests
 * run the counting path against.
 *
 * It keeps the semantics the Redis adapter leans on rather than the convenient
 * ones — `rank` only ever moves a score upwards, because a career total only
 * ever rises and a fake that quietly accepted a lower one would pass a test the
 * real store would fail.
 *
 * `names` is passed in so it can be the same registry the innings boards claim
 * into, which is what the deployed keys do: one name is one person across the
 * whole game, and a career is ranked under the name its owner actually claimed.
 */
export function memoryCareer<C>(
  names = new Map<string, string>(),
): CareerStore<C> & { clear(): void } {
  const records = new Map<string, StoredCareer<C>>();
  const boards = new Map<string, Map<string, number>>();
  const rate = new Map<string, { count: number; until: number }>();
  const ranking = (board: string) => {
    const held = boards.get(board) ?? new Map<string, number>();
    boards.set(board, held);
    return held;
  };
  return {
    async read(id) { return records.get(id) ?? null; },
    async write(id, held) { records.set(id, held); },
    async rank(board, id, score) {
      const held = ranking(board);
      // GT: a career total only ever rises, so a lower score is a stale write.
      if ((held.get(id) ?? -1) < score) held.set(id, score);
    },
    async top(board, n) {
      return [...ranking(board).entries()]
        .map(([id, score]) => ({ id, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, n);
    },
    async many(ids) { return ids.map(id => records.get(id) ?? null); },
    async nameHolder(folded) { return names.get(folded) ?? null; },
    async hits(address, windowSeconds) {
      const now = Date.now();
      const held = rate.get(address);
      if (!held || held.until <= now) {
        rate.set(address, { count: 1, until: now + windowSeconds * 1000 });
        return 1;
      }
      held.count++;
      return held.count;
    },
    clear() { records.clear(); boards.clear(); rate.clear(); },
  };
}
