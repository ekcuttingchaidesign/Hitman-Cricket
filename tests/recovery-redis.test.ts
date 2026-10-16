import { describe, expect, it } from 'vitest';
import type { Redis } from '@upstash/redis';
import { keepKey } from '../src/server/career-key';
import { upstashRecovery } from '../src/server/upstash';
import { restore, restoreWithPassword, setPassword } from '../src/server/recovery-store';

/**
 * The adapter the deployed game actually uses.
 *
 * Everything else about recovery is tested against the memory store, which is
 * a fake written to behave — so it proved the rules and nothing about the
 * thing in front of them. This exercises the Redis side, and the reason it has
 * to exist is one quirk: Upstash parses a value that looks like JSON on the way
 * out, so what `hset` was given as a string does not necessarily come back as
 * one. Anything that assumes it does works against a fake and fails in
 * production, which is the worst shape a bug can have.
 */
function fakeRedis() {
  const hashes = new Map<string, Map<string, string>>();
  const counters = new Map<string, number>();
  const sets = new Map<string, Set<string>>();
  const hash = (key: string) => hashes.get(key) ?? hashes.set(key, new Map()).get(key)!;
  /** What Upstash does on the way out, and the whole reason for this file. */
  const asUpstashWouldReturn = (raw: string | undefined) => {
    if (raw === undefined) return null;
    try { return JSON.parse(raw); } catch { return raw; }
  };
  return {
    hashes,
    counters,
    /**
     * The registry the board writes and this only reads, under whichever scope
     * the adapter is using. Derived from a key it has already written rather
     * than guessed: the scope comes from `VERCEL_ENV` at module load, so a
     * test that spelled it out would be testing its own guess — which is how
     * this file's first two failures happened.
     */
    holds(who: Record<string, string>) {
      const written = [...hashes.keys()].find(key => key.endsWith('keys'));
      const scope = written ? written.slice(0, -'keys'.length) : '';
      hashes.set(`${scope}names`, new Map(Object.entries(who)));
    },
    redis: {
      async hset(key: string, pairs: Record<string, string>) {
        for (const [field, value] of Object.entries(pairs)) hash(key).set(field, value);
        return 1;
      },
      async hget(key: string, field: string) {
        return asUpstashWouldReturn(hash(key).get(field));
      },
      async incr(key: string) {
        const next = (counters.get(key) ?? 0) + 1;
        counters.set(key, next);
        return next;
      },
      async expire() { return 1; },
      // A sorted set whose scores are all 0, read BYLEX as Redis reads one:
      // byte by byte, between an inclusive '[' bound and another.
      async zadd(key: string, { member }: { member: string }) {
        const set = sets.get(key) ?? sets.set(key, new Set()).get(key)!;
        set.add(member);
        return 1;
      },
      async zrange(key: string, min: string, max: string, opts: { byLex: true; offset: number; count: number }) {
        const bytes = (s: string) => Buffer.from(s, 'utf8');
        const from = bytes(min.slice(1)), to = bytes(max.slice(1));
        return [...(sets.get(key) ?? [])].map(bytes).sort(Buffer.compare)
          .filter(one => Buffer.compare(one, from) >= 0 && Buffer.compare(one, to) <= 0)
          .slice(opts.offset, opts.offset + opts.count).map(one => asUpstashWouldReturn(one.toString('utf8')));
      },
    } as unknown as Redis,
  };
}

describe('passwords in Redis', () => {
  it('reads back a password it wrote, through Upstash’s own JSON handling', async () => {
    const fake = fakeRedis();
    const store = upstashRecovery(fake.redis);
    await store.putKey('seed', keepKey('yorker-sprint-cover-47'));
    fake.holds({ gauravrana: 'p-gaurav' });
    await setPassword(store, { name: 'Gaurav Rana', playerId: 'p-gaurav', password: 'square-cut-9' });
    expect(await restoreWithPassword(store, { name: 'Gaurav Rana', password: 'square-cut-9', address: '10.0.0.1' }))
      .toEqual({ ok: true, playerId: 'p-gaurav' });
  });

  /** The bound past the prefix has to sort after every name that begins with it, accents and all. */
  it('finds every name that begins with what was typed, and none that does not', async () => {
    const fake = fakeRedis();
    const store = upstashRecovery(fake.redis);
    for (const entry of ['gauravrana Gaurav Rana', 'gaurav Gaurav', 'gaurav7 Gaurav7', 'gauri Gauri', 'gauravz Gaurav Zé', 'gaurb Gaurb']) {
      await store.listName(entry);
    }
    expect(await store.namesFrom('gaurav', 10)).toEqual(['gaurav Gaurav', 'gaurav7 Gaurav7', 'gauravrana Gaurav Rana', 'gauravz Gaurav Zé']);
  });
});

describe('career keys in Redis', () => {
  const at = { address: '10.0.0.1' };

  it('reads back a key it wrote, through Upstash’s own JSON handling', async () => {
    const { redis } = fakeRedis();
    const store = upstashRecovery(redis);
    await store.putKey('rohit', keepKey('yorker-sprint-cover-47'));
    const held = await store.keyFor('rohit');
    expect(held).not.toBeNull();
    expect(typeof held?.salt).toBe('string');
    expect(typeof held?.hash).toBe('string');
  });

  it('opens a record with the name and key together', async () => {
    const fake = fakeRedis();
    const store = upstashRecovery(fake.redis);
    await store.putKey('rohit', keepKey('yorker-sprint-cover-47'));
    // The name registry is the board's, written by the claim rather than here.
    fake.holds({ rohit: 'p-rohit' });
    const out = await restore(store, { name: 'Rohit', key: 'yorker-sprint-cover-47', ...at });
    expect(out).toEqual({ ok: true, playerId: 'p-rohit' });
  });

  /**
   * A player id is a stamp, a dash and a random tail. Nothing about that is
   * JSON, so it comes back as the string it went in as — but an id that ever
   * looked like a number would come back as one, and `holderOf` promises a
   * string or null.
   */
  it('gives back a holder as a string, whatever it looks like', async () => {
    const fake = fakeRedis();
    const store = upstashRecovery(fake.redis);
    await fake.redis.hset('x', {});
    await store.putKey('seed', keepKey('yorker-sprint-cover-47'));
    fake.holds({ rohit: 'mfn3k2-abc123def456', digits: '12345678' });
    expect(await store.holderOf('rohit')).toBe('mfn3k2-abc123def456');
    expect(await store.holderOf('nobody')).toBeNull();
  });

  it('turns a record it cannot read into no key rather than a crash', async () => {
    const fake = fakeRedis();
    const store = upstashRecovery(fake.redis);
    await store.putKey('rohit', keepKey('yorker-sprint-cover-47'));
    const written = [...fake.hashes.keys()].find(key => key.endsWith('keys'))!;
    fake.hashes.get(written)!.set('rohit', 'not json at all');
    await expect(store.keyFor('rohit')).resolves.toBeNull();
  });

  it('counts a try against the address and against the name apart', async () => {
    const { redis, counters } = fakeRedis();
    const store = upstashRecovery(redis);
    await store.triesFrom('10.0.0.1', 60);
    await store.triesFrom('10.0.0.1', 60);
    await store.triesAt('rohit', 60);
    const spent = [...counters.entries()];
    expect(spent.find(([k]) => k.includes('10.0.0.1'))?.[1]).toBe(2);
    expect(spent.find(([k]) => k.includes('rohit'))?.[1]).toBe(1);
    // Two counters, not one shared: an allowance spent by posting innings would
    // let somebody lock a player out of their own record by playing.
    expect(new Set(spent.map(([k]) => k)).size).toBe(2);
  });
});
