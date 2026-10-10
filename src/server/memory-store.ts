import type { Innings } from '../game/leaderboard.js';
import type { BoardStore, StoredRow } from './board-store.js';
import {
  packResult, unpackResult,
  type ChallengeStore, type RivalsResult, type StoredChallenge, type StoredRivalsRow,
} from './challenge-store.js';

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
/**
 * The siblings claimed in the last day, kept beside the name registry they
 * belong to — so two ladders that share a registry share these too, without
 * every caller having to hand both maps over.
 */
const SIBLINGS = new WeakMap<Map<string, string>, Map<string, { id: string; name: string; until: number }>>();
function siblingsOf(names: Map<string, string>) {
  if (!SIBLINGS.has(names)) SIBLINGS.set(names, new Map());
  return SIBLINGS.get(names)!;
}

/** The last new name each player took, beside the registry for the same reason. */
const NAMED = new WeakMap<Map<string, string>, Map<string, { name: string; at: number }>>();
function namedOf(names: Map<string, string>) {
  if (!NAMED.has(names)) NAMED.set(names, new Map());
  return NAMED.get(names)!;
}

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
    async standing(id) {
      // ZREVRANK: one more than the scores above this one. Ties go the way
      // Redis puts them, member against member, rather than sharing a place.
      const score = ranking.get(id);
      if (score === undefined) return { rank: null, score: null, total: ranking.size };
      const ahead = [...ranking.entries()].filter(([other, s]) => s > score || (s === score && other > id)).length;
      return { rank: ahead + 1, score, total: ranking.size };
    },
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
    async nameOwner(folded) { return names.get(folded) ?? null; },
    async recentSibling(base) {
      const held = siblingsOf(names).get(base);
      return held && held.until > Date.now() ? { id: held.id, name: held.name } : null;
    },
    async markSibling(base, id, name, windowSeconds) {
      siblingsOf(names).set(base, { id, name, until: Date.now() + windowSeconds * 1000 });
    },
    async lastNamed(id) { return namedOf(names).get(id) ?? null; },
    async markNamed(id, name, at) { namedOf(names).set(id, { name, at }); },
    async rename(id, name) {
      const row = rows.get(id);
      if (row) rows.set(id, { ...row, name });
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
    clear() { ranking.clear(); rows.clear(); names.clear(); siblingsOf(names).clear(); namedOf(names).clear(); rate.clear(); },
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
 *
 * `names` is the board's registry, passed in for the reason the careers take
 * it: the dev server's boards and its Rivals board have to agree on who is
 * registered. Left out, the store keeps its own, which a test fills by hand.
 */
export function memoryChallenges(
  names = new Map<string, string>(),
): ChallengeStore & { clear(): void; expire(code: string): void; names: Map<string, string> } {
  const challenges = new Map<string, { challenge: StoredChallenge; until: number }>();
  const rate = new Map<string, { count: number; until: number }>();
  const mine = new Map<string, Set<string>>();
  // Kept packed, the way Redis keeps them, so a result that does not survive
  // the round trip fails here first.
  const results = new Map<string, Record<string, string>>();
  const ranking = new Map<string, number>();
  const rows = new Map<string, StoredRivalsRow>();
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
    async unseat(code, playerId) {
      const held = live(code, Date.now());
      if (held) delete held.challenge.players[playerId];
    },
    async outcomes(playerId) {
      const kept: Record<string, RivalsResult> = {};
      for (const [code, value] of Object.entries(results.get(playerId) ?? {})) {
        const result = unpackResult(value);
        if (result) kept[code] = result;
      }
      return kept;
    },
    async setOutcome(playerId, code, result) {
      results.set(playerId, { ...(results.get(playerId) ?? {}), [code]: packResult(result) });
    },
    async nameHolders(folded) { return folded.map(name => names.get(name) ?? null); },
    async rank(playerId, score, row) {
      ranking.set(playerId, score);
      rows.set(playerId, structuredClone(row));
    },
    async unrank(playerId) {
      ranking.delete(playerId);
      rows.delete(playerId);
    },
    async topRivals(n) {
      return [...ranking.entries()]
        .sort(([a, one], [b, two]) => two - one || b.localeCompare(a))
        .slice(0, n)
        .flatMap(([id]) => (rows.has(id) ? [{ playerId: id, ...structuredClone(rows.get(id)!) }] : []));
    },
    names,
    clear() { challenges.clear(); rate.clear(); mine.clear(); results.clear(); ranking.clear(); rows.clear(); },
    /** Ages a room out on the spot, so a test does not wait a week. */
    expire(code: string) {
      const held = challenges.get(code);
      if (held) held.until = 0;
    },
  };
}
