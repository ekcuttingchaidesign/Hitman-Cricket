import { Redis } from '@upstash/redis';
import type { BoardStore, StoredRow } from './board-store.js';

/**
 * The board kept in Redis.
 *
 * Upstash's free tier allows half a million commands a month, so the shape here
 * is chosen to spend as few as possible rather than for how it would look in a
 * relational schema. Reading the whole board is two commands and never fifty:
 * the ranking is one sorted set, and every player's row lives as a field of one
 * hash, so fifty rows come back in a single `HMGET`.
 *
 * The names live in a hash of their own, keyed by the folded form, which is what
 * makes a name unique across the board.
 */

/**
 * Preview deployments and production share one database, because the
 * integration injects one set of credentials into every environment. Without a
 * prefix, testing a branch writes to the board people are playing for — and a
 * name claimed by a test is never released, which is the whole point of that
 * rule. So every environment but production keeps its own keys.
 *
 * Vercel sets `VERCEL_ENV` to production, preview or development on its own.
 * Anywhere it is unset — a script run by hand against the real database — is
 * treated as development rather than as production, so the accident is a wasted
 * key rather than a polluted board.
 */
const SCOPE = process.env.VERCEL_ENV === 'production' ? '' : `${process.env.VERCEL_ENV ?? 'development'}:`;

/**
 * The keys one board uses. A ladder's own scope goes between the environment's
 * and the key's name, so the Test match keeps its own ranking and its own rows —
 * two boards writing one sorted set would rank a chase against a slog, which is
 * the whole thing the second ladder exists to avoid.
 *
 * Two things are deliberately not scoped, and both for the same reason: they
 * are about the person rather than about the innings. The rate limit counts
 * submissions from an address, and an address that has posted sixty innings has
 * posted sixty whichever mode they were played in. And a name is a name — one
 * registry across the whole game, so a player carries theirs from one board to
 * the other and nobody else can bat under it on the one they have not played
 * yet. Two registries would have let two people be the same Rohit.
 */
function keysFor(scope: string) {
  return {
    /** Player id to packed score. The board's order, and nothing else. */
    ranking: `${SCOPE}${scope}board`,
    /** Player id to their row, as JSON. The figures behind the order. */
    rows: `${SCOPE}${scope}players`,
    /** Folded name to the player id that holds it. Shared by both boards. */
    names: `${SCOPE}names`,
  };
}
const RATE = `${SCOPE}rate:`;

/**
 * No database behind the board. This is a setup that was never finished, not an
 * outage, and the two must not be reported as the same thing: one is fixed by
 * adding an environment variable and the other by waiting.
 */
export class NoDatabase extends Error {
  constructor(missing: string) {
    super(`The board has no database: ${missing} is missing.`);
    this.name = 'NoDatabase';
  }
}

/**
 * The credentials Vercel's Upstash integration injects. They are `KV_`-prefixed
 * rather than `UPSTASH_`-prefixed, which is why this does not use the client's
 * own `Redis.fromEnv()` — that looks for `UPSTASH_REDIS_REST_URL` and would find
 * nothing here, at runtime, on a page nobody is watching.
 *
 * Reading falls back to the write token, which is usually a kindness and once
 * was not: with only the read-only token set, the board reads perfectly and
 * every submission fails, so the game looks healthy right up until somebody
 * tries to get on it. The fallback stays, because the opposite arrangement is
 * the common one, but a write that has no token of its own now says which token
 * it wanted rather than reporting itself as unreachable.
 */
export function redisFromEnv(readOnly = false): Redis {
  const url = process.env.KV_REST_API_URL;
  const token = readOnly
    ? process.env.KV_REST_API_READ_ONLY_TOKEN ?? process.env.KV_REST_API_TOKEN
    : process.env.KV_REST_API_TOKEN;
  if (!url) throw new NoDatabase('KV_REST_API_URL');
  if (!token) throw new NoDatabase(readOnly ? 'KV_REST_API_READ_ONLY_TOKEN and KV_REST_API_TOKEN' : 'KV_REST_API_TOKEN');
  return new Redis({ url, token });
}

export function upstashStore<I>(redis: Redis, scope = ''): BoardStore<I> {
  const KEY = keysFor(scope);
  return {
    async top(n) {
      // Flat pairs come back: member, score, member, score.
      const flat = await redis.zrange<(string | number)[]>(KEY.ranking, 0, n - 1, { rev: true, withScores: true });
      const ranked: { id: string; score: number }[] = [];
      for (let i = 0; i + 1 < flat.length; i += 2) ranked.push({ id: String(flat[i]), score: Number(flat[i + 1]) });
      return ranked;
    },

    async rows(ids) {
      if (!ids.length) return [];
      // One command for the whole board. The answer is keyed by field rather
      // than ordered, so it is put back into the ranking's order here.
      const found = await redis.hmget<Record<string, StoredRow<I>>>(KEY.rows, ...ids);
      return ids.map(id => found?.[id] ?? null);
    },

    async record(id, score, row) {
      // GT writes only when the new score is higher; CH makes the reply say
      // whether anything changed, which is the only way to know from one call.
      const changed = await redis.zadd(KEY.ranking, { gt: true, ch: true }, { score, member: id });
      if (!changed) return false;
      await redis.hset(KEY.rows, { [id]: row });
      return true;
    },

    async claimName(folded, id) {
      // Set-if-absent, so two players claiming the same name in the same second
      // cannot both be told it is free.
      const claimed = await redis.hsetnx(KEY.names, folded, id);
      if (claimed) return id;
      return (await redis.hget<string>(KEY.names, folded)) ?? id;
    },

    async hits(address, windowSeconds) {
      const key = RATE + address;
      const count = await redis.incr(key);
      // Only the first hit in a window sets the clock, so the window rolls
      // forward from the first submission rather than from the latest.
      if (count === 1) await redis.expire(key, windowSeconds);
      return count;
    },
  };
}
