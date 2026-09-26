import type { Innings } from '../game/leaderboard.js';
import type { BoardStore, StoredRow } from './board-store.js';
import type { ChallengeStore, StoredChallenge } from './challenge-store.js';

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
 *
 * `names` is passed in rather than made here so two boards can share one
 * registry, which is what the deployed keys do: a name is a person, not an
 * innings, and the same one must not belong to two people across the two
 * ladders. Left out, a store keeps its own, which is what a test wants.
 */
export function memoryStore<I = Innings>(
  names = new Map<string, string>(),
): BoardStore<I> & { clear(): void } {
  const ranking = new Map<string, number>();
  const rows = new Map<string, StoredRow<I>>();
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

/**
 * Challenges, in memory. The same two jobs the board's fake has: it backs
 * `POST /api/challenge` while `npm run dev` is running, so a challenge can be
 * made in one tab and answered in another with no credentials and no network,
 * and it is what the challenge tests run the rules against.
 *
 * It keeps the semantics the Redis adapter leans on rather than the convenient
 * ones. `claim` refuses a code somebody already holds, because that is what
 * makes two challenges drawn in the same second safe. `write` merges the fields
 * it is given and leaves the rest alone. And a challenge really does expire, so
 * the rule that a stale code reads as nothing at all is something a test can
 * prove rather than something we hope Redis does.
 */
export function memoryChallenges(): ChallengeStore & { clear(): void; expire(code: string): void } {
  const challenges = new Map<string, { challenge: StoredChallenge; until: number }>();
  const rate = new Map<string, { count: number; until: number }>();
  const mine = new Map<string, Set<string>>();
  /** Drops the room if its time is up, which is what the TTL buys in Redis. */
  const live = (code: string, now: number) => {
    const held = challenges.get(code);
    if (!held) return null;
    if (held.until <= now) { challenges.delete(code); return null; }
    return held;
  };
  return {
    async claim(code, challenge, ttlSeconds) {
      const now = Date.now();
      // HSETNX: whoever asks first holds the code.
      if (live(code, now)) return false;
      challenges.set(code, { challenge: structuredClone(challenge), until: now + ttlSeconds * 1000 });
      return true;
    },
    async read(code) {
      const held = live(code, Date.now());
      // Cloned on the way out, or a caller holding the answer could edit the
      // store by editing what it read — which Redis would never allow.
      return held ? structuredClone(held.challenge) : null;
    },
    async write(code, change, ttlSeconds) {
      const now = Date.now();
      const held = live(code, now);
      if (!held) return;
      // Field by field, never wholesale: the innings not named stays as it was.
      for (const [id, player] of Object.entries(change.players ?? {})) {
        held.challenge.players[id] = structuredClone(player);
      }
      held.until = now + ttlSeconds * 1000;
    },
    async hits(kind, address, windowSeconds) {
      const key = `${kind}:${address}`;
      const now = Date.now();
      const held = rate.get(key);
      if (!held || held.until <= now) {
        rate.set(key, { count: 1, until: now + windowSeconds * 1000 });
        return 1;
      }
      held.count++;
      return held.count;
    },
    async index(playerId, code) {
      const held = mine.get(playerId) ?? new Set<string>();
      held.add(code);
      mine.set(playerId, held);
    },
    async indexed(playerId) { return [...(mine.get(playerId) ?? [])]; },
    async unindex(playerId, code) { mine.get(playerId)?.delete(code); },
    clear() { challenges.clear(); rate.clear(); mine.clear(); },
    /** Ages a room out on the spot, so a test does not wait a week. */
    expire(code: string) {
      const held = challenges.get(code);
      if (held) held.until = 0;
    },
  };
}
