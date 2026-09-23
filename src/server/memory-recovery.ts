import type { StoredKey } from './career-key.js';
import type { RecoveryStore } from './recovery-store.js';

/**
 * Keys in memory, for the tests and for a dev server with no database.
 *
 * `names` is passed in rather than made here, because a name registry is one
 * registry: restoring reads who holds a name, and claiming writes it, and a
 * fake where those were two different maps would pass a test the real store
 * fails. It is the same reason the board's fake takes one.
 */
export function memoryRecovery(names = new Map<string, string>()): RecoveryStore & {
  names: Map<string, string>;
  keys: Map<string, StoredKey>;
} {
  const keys = new Map<string, StoredKey>();
  const from = new Map<string, { count: number; until: number }>();
  const at = new Map<string, { count: number; until: number }>();
  const count = (held: Map<string, { count: number; until: number }>, of: string, windowSeconds: number) => {
    const now = Date.now();
    const standing = held.get(of);
    if (!standing || standing.until <= now) {
      held.set(of, { count: 1, until: now + windowSeconds * 1000 });
      return 1;
    }
    standing.count++;
    return standing.count;
  };
  return {
    names,
    keys,
    async keyFor(folded) { return keys.get(folded) ?? null; },
    async putKey(folded, held) { keys.set(folded, held); },
    async holderOf(folded) { return names.get(folded) ?? null; },
    async triesFrom(address, windowSeconds) { return count(from, address, windowSeconds); },
    async triesAt(folded, windowSeconds) { return count(at, folded, windowSeconds); },
  };
}
