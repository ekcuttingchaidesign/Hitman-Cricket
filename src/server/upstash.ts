import { Redis } from '@upstash/redis';
import type { BoardStore, StoredRow } from './board-store.js';
import type { CareerStore, StoredCareer } from './career-store.js';
import type { StoredKey } from './career-key.js';
import type { RecoveryStore } from './recovery-store.js';
import { FEEDBACK_KEPT, type FeedbackStore, type StoredFeedback } from './feedback-store.js';
import type { ChallengeStore, StoredPlayer } from './challenge-store.js';

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

/**
 * The keys one mode's careers use.
 *
 * A separate hash and a separate sorted set per board, and deliberately not the
 * innings board's keys. The two records answer different questions and are
 * written on different paths — a career counts every innings, an innings board
 * keeps only the best one — so sharing a key would mean one of the two writes
 * clobbering the other's row the first time somebody had a bad day.
 *
 * The name registry is shared, because a name is a person. A career is ranked
 * under the name its owner claimed on one of the innings boards, and this
 * adapter only ever reads it: claiming is a write with a rule attached, and
 * that rule lives in one place.
 */
function careerKeysFor(scope: string) {
  return {
    /** Player id to their whole career, as JSON. */
    records: `${SCOPE}${scope}careers`,
    /** One ranking a board, named by the board's own key. */
    ranking: (board: string) => `${SCOPE}${scope}career:${board}`,
    names: `${SCOPE}names`,
  };
}
const RATE = `${SCOPE}rate:`;
/** The questionnaire's own counter, kept apart from the board's. */
const FEEDBACK_RATE = `${SCOPE}frate:`;
/**
 * Restoring counts twice, and both counters are its own.
 *
 * Its own, because an allowance shared with posting innings would let somebody
 * lock a player out of their own record by playing: sixty innings from a
 * household's address would spend the tries their returning player needs. And
 * twice, because one address working through a name and a thousand addresses
 * working through the same one are different attacks, and only the second
 * counter sees the one this shape actually invites.
 */
const RESTORE_RATE = `${SCOPE}rrate:`;
const RESTORE_NAME_RATE = `${SCOPE}nrate:`;

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
 * Careers in Redis, written to cost as little as the board does.
 *
 * Counting an innings is two commands against the hash plus one `ZADD` a
 * board, and reading a whole mode's boards is one `ZRANGE` each and a single
 * `HMGET` for everybody who appears on any of them. Nothing walks a key space
 * and nothing reads a row at a time.
 *
 * `rank` uses `GT` rather than a plain write. A career total only ever rises,
 * so a lower score arriving is a request that overtook a newer one, and taking
 * it would move a player down a board they had already climbed.
 */
export function upstashCareer<C>(redis: Redis, scope: string): CareerStore<C> {
  const KEY = careerKeysFor(scope);
  return {
    async read(id) {
      const found = await redis.hget<StoredCareer<C>>(KEY.records, id);
      return found ?? null;
    },

    async write(id, held) {
      await redis.hset(KEY.records, { [id]: held });
    },

    async rank(board, id, score) {
      await redis.zadd(KEY.ranking(board), { gt: true }, { score, member: id });
    },

    async top(board, n) {
      // Flat pairs come back: member, score, member, score.
      const flat = await redis.zrange<(string | number)[]>(KEY.ranking(board), 0, n - 1, { rev: true, withScores: true });
      const ranked: { id: string; score: number }[] = [];
      for (let i = 0; i + 1 < flat.length; i += 2) ranked.push({ id: String(flat[i]), score: Number(flat[i + 1]) });
      return ranked;
    },

    async many(ids) {
      if (!ids.length) return [];
      const found = await redis.hmget<Record<string, StoredCareer<C>>>(KEY.records, ...ids);
      return ids.map(id => found?.[id] ?? null);
    },

    async nameHolder(folded) {
      return (await redis.hget<string>(KEY.names, folded)) ?? null;
    },

    async hits(address, windowSeconds) {
      const key = RATE + address;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSeconds);
      return count;
    },
  };
}

/**
 * The questionnaire, in the same database.
 *
 * A list rather than a sorted set or a hash, because what is wanted of it is
 * never anything but "the most recent few hundred, newest first": nothing ranks
 * a form, nothing looks one up by id, and the only read is the one that hands
 * the lot to a spreadsheet. `LPUSH` then `LTRIM` is two commands a form and
 * keeps the list from growing past `FEEDBACK_KEPT` without anything having to
 * come along later and tidy it.
 *
 * The rate counter is deliberately not the board's. They are separate
 * allowances over separate things — somebody who has posted forty innings has
 * not filled in forty questionnaires — and sharing one key would let an evening
 * of play use up the right to say what they thought of it.
 */
export function upstashFeedback(redis: Redis): FeedbackStore {
  const key = `${SCOPE}feedback`;
  return {
    async save(entry) {
      await redis.lpush(key, JSON.stringify(entry));
      await redis.ltrim(key, 0, FEEDBACK_KEPT - 1);
    },
    async read(limit) {
      const held = await redis.lrange<StoredFeedback | string>(key, 0, limit - 1);
      // Upstash parses a JSON-looking value on the way out, so an entry can
      // arrive already an object. A row that will not parse is dropped rather
      // than repaired: one unreadable form must not cost the other thousand.
      return held.flatMap(one => {
        if (one && typeof one === 'object') return [one as StoredFeedback];
        try { return [JSON.parse(String(one)) as StoredFeedback]; } catch { return []; }
      });
    },
    async hits(address, windowSeconds) {
      const counter = `${FEEDBACK_RATE}${address}`;
      const count = await redis.incr(counter);
      if (count === 1) await redis.expire(counter, windowSeconds);
      return count;
    },
  };
}

/**
 * The keys kept in Redis: one hash, keyed by the folded name.
 *
 * Keyed by the name rather than by the player id, because the name is what a
 * player restoring can tell us — the id is the thing they have lost. The name
 * registry is the same one the board claims into, deliberately: who holds a
 * name is one fact, and a second copy of it here would be a second copy to
 * disagree.
 *
 * Nothing here is scoped to a ladder. A key is a person's, like their name.
 */
export function upstashRecovery(redis: Redis): RecoveryStore {
  const keys = `${SCOPE}keys`;
  const names = `${SCOPE}names`;
  const count = async (counter: string, windowSeconds: number) => {
    const count = await redis.incr(counter);
    // Only the first spends the clock, so the window rolls from the first try
    // rather than from the latest — otherwise a steady drip never expires.
    if (count === 1) await redis.expire(counter, windowSeconds);
    return count;
  };
  return {
    async keyFor(folded) {
      const held = await redis.hget<StoredKey | string>(keys, folded);
      if (!held) return null;
      // Upstash parses a JSON-looking value on the way out, so a record can
      // arrive already an object. One that will not parse is no key rather
      // than a crash: the player is told no and can make another.
      if (typeof held === 'object') return held as StoredKey;
      try { return JSON.parse(String(held)) as StoredKey; } catch { return null; }
    },
    async putKey(folded, held) {
      await redis.hset(keys, { [folded]: JSON.stringify(held) });
    },
    async holderOf(folded) {
      return (await redis.hget<string>(names, folded)) ?? null;
    },
    async triesFrom(address, windowSeconds) {
      return count(`${RESTORE_RATE}${address}`, windowSeconds);
    },
    async triesAt(folded, windowSeconds) {
      return count(`${RESTORE_NAME_RATE}${folded}`, windowSeconds);
    },
  };
}

/**
 * The challenges kept in Redis.
 *
 * One hash per challenge, which is the whole reason a challenge is cheap:
 * reading one is a single `HGETALL` and writing an answer is a single `HSET`
 * that cannot touch the other innings. `at` and `host` are the challenge's own
 * fields and every other field is a player id. They cannot collide — a player id
 * always carries a dash and neither reserved name does.
 *
 * A challenge's key carries a week-long TTL and every write pushes it out.
 * Reads deliberately do not, which is what keeps a read at exactly one command:
 * a challenge nobody has written to for a week was never answered, and it should
 * go. The counters are separate from the board's so that a busy week of
 * challenges cannot spend the budget that puts people on the fifty.
 */
export function upstashChallenges(redis: Redis): ChallengeStore {
  const key = (code: string) => `${SCOPE}ch:${code}`;
  const rate = (kind: string, address: string) => `${SCOPE}chrate:${kind}:${address}`;
  const list = (playerId: string) => `${SCOPE}chu:${playerId}`;
  return {
    async claim(code, challenge, ttlSeconds) {
      // Set-if-absent on one field, so two challenges drawn onto the same code
      // in the same second cannot both be told it was free.
      const claimed = await redis.hsetnx(key(code), 'host', challenge.host);
      if (!claimed) return false;
      // The expiry goes on before the rest does, and not after. A process that
      // died between the two would otherwise leave a key holding one field, with
      // no TTL and no way for anybody to use or clear it — a code burnt for
      // good. This way the worst case expires like any challenge.
      await redis.expire(key(code), ttlSeconds);
      await redis.hset(key(code), {
        at: challenge.at, v: challenge.v,
        // Left off rather than written as null: a null field reads back as the
        // string "null", and a room is not a rematch of a room called that.
        ...(challenge.rematchOf ? { rematchOf: challenge.rematchOf } : {}),
        ...challenge.players,
      });
      return true;
    },

    async read(code) {
      // One command for the whole challenge, both innings included.
      const held = await redis.hgetall<Record<string, unknown>>(key(code));
      if (!held || !held.host) return null;
      const players: Record<string, StoredPlayer> = {};
      for (const [field, value] of Object.entries(held)) {
        // Anything that is not one of the room's own fields is an innings, and
        // anything that is not an object is not an innings at all.
        if (field === 'at' || field === 'host' || field === 'v' || field === 'rematchOf') continue;
        if (value && typeof value === 'object') players[field] = value as StoredPlayer;
      }
      return {
        at: Number(held.at) || 0,
        host: String(held.host),
        v: Number(held.v) || 0,
        rematchOf: typeof held.rematchOf === 'string' && held.rematchOf ? held.rematchOf : null,
        players,
      };
    },

    async write(code, change, ttlSeconds) {
      const fields: Record<string, unknown> = { ...change.players };
      // Nothing to say is nothing to send: a write with no fields is an error
      // from Redis rather than a no-op, and would cost a command to be told so.
      if (!Object.keys(fields).length) return;
      await redis.hset(key(code), fields);
      // Answered today, so it is not going anywhere for another week.
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

    // One set per player of the rooms they are in. It is what makes the list
    // and the result-on-open work from any phone that holds the same id —
    // which, through the career key, is any phone of theirs. It lives as long
    // as the longest-lived room in it and every join pushes that out.
    async index(playerId, code, ttlSeconds) {
      await redis.sadd(list(playerId), code);
      await redis.expire(list(playerId), ttlSeconds);
    },
    async indexed(playerId) {
      return (await redis.smembers(list(playerId))) ?? [];
    },
    async unindex(playerId, code) {
      await redis.srem(list(playerId), code);
    },
  };
}
