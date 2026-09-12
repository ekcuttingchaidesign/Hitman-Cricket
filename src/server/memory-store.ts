import type { BoardStore, StoredRow } from './board-store';

/**
 * The board, in memory.
 *
 * Two jobs. It backs the endpoints while `npm run dev` is running, so the whole
 * thing can be played and the board claimed with no Vercel CLI, no credentials
 * and no network. And it is what the tests run the submit path against.
 *
 * It keeps the semantics the Redis adapter leans on rather than the ones that
 * would be convenient: `record` only moves a score upwards, and `claimName`
 * only takes a name nobody holds. A fake that took every write would pass tests
 * the real store would fail, which is worse than no fake at all.
 */
export function memoryStore(): BoardStore & { clear(): void } {
  const ranking = new Map<string, number>();
  const rows = new Map<string, StoredRow>();
  const names = new Map<string, string>();
  const rate = new Map<string, { count: number; until: number }>();
  return {
    async top(n) {
      return [...ranking.entries()]
        .map(([id, score]) => ({ id, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, n);
    },
    async rows(ids) { return ids.map(id => rows.get(id) ?? null); },
    async record(id, score, row) {
      // GT: a worse innings cannot displace a better one, and the row is only
      // written when the score actually moved.
      if ((ranking.get(id) ?? -1) >= score) return false;
      ranking.set(id, score);
      rows.set(id, row);
      return true;
    },
    async claimName(folded, id) {
      // SETNX: whoever asks first holds it.
      if (!names.has(folded)) names.set(folded, id);
      return names.get(folded)!;
    },
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
    clear() { ranking.clear(); rows.clear(); names.clear(); rate.clear(); },
  };
}
