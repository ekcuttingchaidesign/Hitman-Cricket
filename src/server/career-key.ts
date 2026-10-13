import { createCipheriv, createDecipheriv, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
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
  /**
   * The key itself, sealed with `KEY_SEAL_SECRET`, so the owner can read a
   * player's key back for them. Absent on every key issued before sealing, and
   * on any issued where the secret is not set. See `sealKey`.
   */
  sealed?: string;
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

/**
 * What to keep for a key: the slow hash a restore is checked against, and,
 * where the sealing secret is set, the key sealed so the owner can read it.
 */
export function keepKey(key: string, now = Date.now(), secret: Buffer | null = keySealSecret()): StoredKey {
  const salt = randomBytes(16).toString('hex');
  const held: StoredKey = { salt, hash: scryptSync(foldKey(key), salt, LENGTH, COST).toString('hex'), at: now };
  if (secret) held.sealed = sealKey(foldKey(key), secret);
  return held;
}

/**
 * Sealing: the key kept so the owner can read it back, and nobody else can.
 *
 * The hash above is one-way on purpose, and that leaves a friend who lost their
 * key with no way back but a new one. So the key is also kept sealed — AES-256
 * in GCM mode, a fresh nonce every time — with a secret that lives in Vercel's
 * environment and in the terminal of whoever runs `scripts/key-show.ts`, and
 * nowhere else. Never in the repository, never in a conversation.
 *
 * What it costs is the thing the hash alone ruled out: somebody holding both
 * the database and the secret holds every key. The database alone, or the
 * secret alone, still opens nothing. The hash stays, and a restore is still
 * checked against it and only it; the seal is read by the owner's script, never
 * by an endpoint, so no request a player can make ever opens one.
 *
 * GCM authenticates as well as hides: a sealed key that has been changed in the
 * store, or one sealed under another secret, does not open to a wrong key — it
 * does not open at all.
 */
export const SEAL_ENV = 'KEY_SEAL_SECRET';
/** What a sealed key says it is, so a later scheme can be told apart from this one. */
const SEAL_VERSION = 'v1';
/** Bound into every seal, so a sealed key cannot be passed off as anything else this secret seals. */
const SEAL_CONTEXT = Buffer.from('hitman-career-key');

/**
 * The sealing secret from the environment: thirty-two random bytes, base64.
 * Anything else is no secret rather than a crash — keys are then kept as they
 * always were, hash only, and the game carries on.
 */
export function keySealSecret(env: Record<string, string | undefined> = process.env): Buffer | null {
  const raw = env[SEAL_ENV]?.trim();
  if (!raw) return null;
  try {
    const secret = Buffer.from(raw, 'base64');
    return secret.length === 32 ? secret : null;
  } catch {
    return null;
  }
}

/** The key, sealed. The nonce and the tag travel with it; none of the three is secret. */
export function sealKey(key: string, secret: Buffer): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secret, nonce);
  cipher.setAAD(SEAL_CONTEXT);
  const body = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()]);
  return [SEAL_VERSION, nonce, cipher.getAuthTag(), body]
    .map(part => typeof part === 'string' ? part : part.toString('base64url')).join('.');
}

/**
 * A sealed key opened, or null: no seal, a seal from another secret, one that
 * has been tampered with, or one that opens to something that is not a key.
 */
export function openKey(held: Pick<StoredKey, 'sealed'> | null | undefined, secret: Buffer): string | null {
  const parts = held?.sealed?.split('.');
  if (!parts || parts.length !== 4 || parts[0] !== SEAL_VERSION) return null;
  try {
    const [nonce, tag, body] = parts.slice(1).map(part => Buffer.from(part, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', secret, nonce);
    decipher.setAAD(SEAL_CONTEXT);
    decipher.setAuthTag(tag);
    const key = Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
    return keyShaped(key) ? key : null;
  } catch {
    return null;
  }
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
