import { Redis } from '@upstash/redis';
import type { BoardStore, StoredRow } from './board-store.js';
import type { RoomStore, StoredPlayer, StoredRoom } from './room-store.js';

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

/**
 * The rooms kept in Redis.
 *
 * One hash per room, which is the whole reason a room is cheap: reading a room
 * is a single `HGETALL` however many people are in it, and writing one player's
 * over is a single `HSET` that cannot touch anybody else's field. `state`, `at`
 * and `host` are the room's own fields and every other field is a player id.
 * They cannot collide — a player id always carries a dash and none of the three
 * reserved names does.
 *
 * A room's key carries a TTL and every write pushes it out. Reads deliberately
 * do not, which is what keeps a read at exactly one command: a room nobody has
 * written to for two hours is a lobby that was abandoned or a game that finished,
 * and both should go. The counters are separate from the board's so that a busy
 * afternoon of rooms cannot spend the budget that puts people on the fifty.
 */
export function upstashRooms(redis: Redis): RoomStore {
  const key = (code: string) => `${SCOPE}room:${code}`;
  const rate = (kind: string, address: string) => `${SCOPE}roomrate:${kind}:${address}`;
  return {
    async claim(code, room, ttlSeconds) {
      // Set-if-absent on one field, so two rooms drawn onto the same code in the
      // same second cannot both be told it was free.
      const claimed = await redis.hsetnx(key(code), 'state', room.state);
      if (!claimed) return false;
      // The expiry goes on before the rest of the room does, and not after. A
      // process that died between the two would otherwise leave a key holding a
      // single field, with no TTL and no way for anybody to use or clear it —
      // a code burnt for good. This way the worst case expires like any room.
      await redis.expire(key(code), ttlSeconds);
      await redis.hset(key(code), { at: room.at, host: room.host, ...room.players });
      return true;
    },

    async read(code) {
      // One command for the whole room, whoever is in it.
      const held = await redis.hgetall<Record<string, unknown>>(key(code));
      if (!held || !held.state) return null;
      const players: Record<string, StoredPlayer> = {};
      for (const [field, value] of Object.entries(held)) {
        // Anything that is not one of the room's own three fields is a player,
        // and anything that is not an object is not a player at all.
        if (field === 'state' || field === 'at' || field === 'host') continue;
        if (value && typeof value === 'object') players[field] = value as StoredPlayer;
      }
      return {
        state: held.state as StoredRoom['state'],
        at: Number(held.at) || 0,
        host: String(held.host ?? ''),
        players,
      };
    },

    async write(code, change, ttlSeconds) {
      const fields: Record<string, unknown> = { ...change.players };
      if (change.state) fields.state = change.state;
      // Nothing to say is nothing to send: a write with no fields is an error
      // from Redis rather than a no-op, and would cost a command to be told so.
      if (!Object.keys(fields).length) return;
      await redis.hset(key(code), fields);
      // The room is being played, so it is not going anywhere yet.
      await redis.expire(key(code), ttlSeconds);
    },

    async hits(kind, address, windowSeconds) {
      const counter = rate(kind, address);
      const count = await redis.incr(counter);
      // Only the first hit in a window sets the clock, so the window rolls
      // forward from the first call rather than from the latest.
      if (count === 1) await redis.expire(counter, windowSeconds);
      return count;
    },
  };
}
