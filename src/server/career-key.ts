import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { KEY_WORDS } from '../game/key-words.js';

/**
 * Making a career key, and checking one.
 *
 * The key is three words from the list and two digits: twenty-four bits of
 * word and a hundred of digit, about 1.7 billion of them. On its own that is
 * not a lot — a machine that could ask freely would walk it — so it is never
 * asked on its own. Restoring takes the name too, the store counts attempts
 * against the address and against the name, and what is kept here is a slow
 * hash rather than the key. Any one of those alone would be thin; the point is
 * that all three have to fail together.
 *
 * `randomInt` and `randomBytes` rather than `Math.random`. A key minted from a
 * predictable generator is a key anybody who knows when it was issued can
 * work out, and the whole value of this thing is that nobody but its owner can
 * produce it.
 */

/** Three words and two digits, as it is written everywhere it appears. */
const SHAPE = /^[a-z]+-[a-z]+-[a-z]+-\d{2}$/;

/** What is kept against a name. Never the key. */
export interface StoredKey {
  /** Per-key, so two players with the same key do not share a hash. */
  salt: string;
  hash: string;
  /** When it was issued, so a key can be aged out later if that is ever wanted. */
  at: number;
}

/**
 * How hard the hash is to compute, which is how much a stolen store costs to
 * work through. Node's defaults, whose memory cost is the point: scrypt is
 * hard to run in parallel on a graphics card in a way PBKDF2 is not.
 */
const COST = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const LENGTH = 32;

/** A fresh key, in the shape the player will read it in. */
export function mintKey(): string {
  const words = [0, 0, 0].map(() => KEY_WORDS[randomInt(KEY_WORDS.length)]);
  return `${words.join('-')}-${String(randomInt(100)).padStart(2, '0')}`;
}

/**
 * The form a key is compared in.
 *
 * Case and spaces go, because a key read off paper is typed with whatever case
 * the writer used and whatever spaces the phone's keyboard added. Nothing else
 * is forgiven: a wrong word is a wrong key, and a store that guessed at near
 * misses would be a store that answers questions about keys it was not given.
 */
export function foldKey(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase().replace(/\s+/g, '');
}

/** Whether this is the shape of a key at all, which is worth saying separately. */
export function keyShaped(folded: string): boolean {
  return SHAPE.test(folded);
}

/** What to keep for a key, so the key itself never has to be. */
export function keepKey(key: string, now = Date.now()): StoredKey {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: scryptSync(foldKey(key), salt, LENGTH, COST).toString('hex'), at: now };
}

/**
 * Whether a key is the one that was kept.
 *
 * Compared in constant time. A comparison that stops at the first wrong byte
 * takes longer the more of the hash is right, and a caller who can measure that
 * can find the hash a byte at a time without ever guessing the key.
 */
export function keyMatches(key: string, held: StoredKey): boolean {
  const folded = foldKey(key);
  if (!keyShaped(folded)) return false;
  let mine: Buffer;
  try {
    mine = scryptSync(folded, held.salt, LENGTH, COST);
  } catch {
    // A stored record whose salt or cost this build cannot reproduce. Not a
    // match, and not a crash: the player is told no and can make a new key.
    return false;
  }
  const theirs = Buffer.from(held.hash, 'hex');
  return mine.length === theirs.length && timingSafeEqual(mine, theirs);
}
