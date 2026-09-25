import { cleanName, foldName } from './board-store.js';
import { foldKey, keepKey, keyMatches, keyShaped, mintKey, type StoredKey } from './career-key.js';

/**
 * Bringing a record back, and the rules that stand between a key and one.
 *
 * What a key opens is a player id — the secret this game identifies somebody
 * by — so this is the one endpoint where being wrong hands a stranger
 * somebody else's career. Everything below is shaped by that.
 *
 * The rules, and what each is for:
 *
 * A name and a key together, never either alone. Names are printed down the
 * board, so a name is public knowledge; a key is one of 1.7 billion, which is
 * not enough on its own against a machine.
 *
 * Attempts are counted twice — against the address asking and against the name
 * asked about. One address working through a name is stopped by the first; a
 * thousand addresses working through the same name are stopped by the second,
 * and that is the attack this shape actually invites.
 *
 * One answer for every failure that depends on what is stored. A key that is
 * wrong, a name nobody holds, and a name held by somebody who has no key all
 * say the same sentence; telling them apart would turn this into a way to ask
 * which names exist. A key that is not the shape of a key is the exception and
 * is said plainly: the shape is printed in the field's own placeholder, so
 * naming it gives away nothing, and the player it happens to is the one who
 * pasted half a key or typed over part of it — who is helped by being told
 * what a key looks like and not at all by being told it did not match.
 *
 * Nothing is deleted when a key is replaced. Making a new key overwrites the
 * record for that name, so the old one stops working — which is what somebody
 * asking for a new key wants — but the name, the career and the board row are
 * untouched. This endpoint can lose a key. It must never lose a record.
 */

export interface RecoveryStore {
  /** The key kept against a folded name, or null where there is none. */
  keyFor(folded: string): Promise<StoredKey | null>;
  /** Keeps this key against the folded name, replacing whatever was there. */
  putKey(folded: string, held: StoredKey): Promise<void>;
  /** Which player id holds this folded name, or null. */
  holderOf(folded: string): Promise<string | null>;
  /** Attempts from this address inside the window, counting this one. */
  triesFrom(address: string, windowSeconds: number): Promise<number>;
  /** Attempts against this name inside the window, counting this one. */
  triesAt(folded: string, windowSeconds: number): Promise<number>;
}

/**
 * How many tries, and over how long.
 *
 * Ten an hour from one address is far above what somebody reading their own
 * handwriting needs and far below what working through a keyspace wants. The
 * limit on the name is higher because a household behind one address can share
 * it, and lower than the address limit would make a family look like an attack.
 */
export const RESTORE_WINDOW_SECONDS = 3600;
export const RESTORE_TRIES_FROM = 10;
export const RESTORE_TRIES_AT = 20;

/** The one sentence every failure that depends on the store gets. */
const NO = 'That name and key do not go together. Check both and try again.';
/** And the one that depends only on what was typed. */
const SHAPE = 'A key is three words and two numbers, like yorker-sprint-cover-47.';

export type RecoveryOutcome<T> =
  | ({ ok: true } & T)
  | { ok: false; status: number; reason: string };

/**
 * A name and a key, weighed against what is kept.
 *
 * The rate limits are spent before the hash is computed, deliberately: scrypt
 * is expensive on purpose, and an endpoint that runs it before counting the
 * attempt is an endpoint that can be made to do that work on demand.
 */
export async function restore(
  store: RecoveryStore,
  input: { name: unknown; key: unknown; address: string },
): Promise<RecoveryOutcome<{ playerId: string }>> {
  const name = cleanName(input.name);
  const folded = foldName(name);
  const key = foldKey(input.key);
  // Shape is checked before anything is spent on it: a key of the wrong shape
  // cannot match anything, and saying so costs no lookup and no hash.
  if (!keyShaped(key)) return { ok: false, status: 400, reason: SHAPE };
  if (!folded) return { ok: false, status: 400, reason: NO };

  if (await store.triesFrom(input.address, RESTORE_WINDOW_SECONDS) > RESTORE_TRIES_FROM) {
    return { ok: false, status: 429, reason: 'Too many tries from here. Try again in an hour.' };
  }
  if (await store.triesAt(folded, RESTORE_WINDOW_SECONDS) > RESTORE_TRIES_AT) {
    return { ok: false, status: 429, reason: 'Too many tries for that name. Try again in an hour.' };
  }

  const held = await store.keyFor(folded);
  const holder = await store.holderOf(folded);
  // Both are checked and both fail the same way. A name nobody holds and a
  // name whose key is wrong are the same answer, or this becomes a way to ask
  // which names are taken without ever offering an innings.
  if (!held || !holder || !keyMatches(key, held)) return { ok: false, status: 403, reason: NO };
  return { ok: true, playerId: holder };
}

/**
 * A fresh key for a name its holder can prove they are.
 *
 * Proved by holding the player id, which is the same secret the board is
 * written with: somebody who has it is already able to post innings under that
 * name, so this hands them nothing they did not have. What it must not do is
 * take a key from somebody who does not hold the name — that would be a way to
 * lock a stranger out of their own record.
 */
export async function newKey(
  store: RecoveryStore,
  input: { name: unknown; playerId: unknown },
  now = Date.now(),
): Promise<RecoveryOutcome<{ key: string }>> {
  const folded = foldName(cleanName(input.name));
  if (!folded || typeof input.playerId !== 'string' || !input.playerId) {
    return { ok: false, status: 400, reason: 'That is not a player.' };
  }
  const holder = await store.holderOf(folded);
  if (!holder || holder !== input.playerId) {
    return { ok: false, status: 403, reason: 'That name is not yours.' };
  }
  const key = mintKey();
  await store.putKey(folded, keepKey(key, now));
  return { ok: true, key };
}

/**
 * The key an existing player never got, minted the first time they ask.
 *
 * Every name claimed before keys existed has none behind it, and the only path
 * that mints one is a successful claim — which happens when an innings beats
 * the one on the board, not when an innings is played. A player sitting fourth
 * with two thousand runs could go weeks without registering anything, and
 * until they did, the feature that exists to save their record could not reach
 * them. This is that path: asked on sight of the game rather than waited for.
 *
 * Proved the way `newKey` is proved, by holding the player id the name is
 * written under, and refused the same way when it is somebody else's.
 *
 * What makes it safe to call unasked is that it will not mint over a key that
 * exists. A player with two browsers gets a key on the first and `null` on the
 * second, which reads as `lost` there — true, and better than the alternative,
 * because minting again would quietly stop the key they had already written
 * down from working. `null` is therefore an ordinary answer and not a refusal:
 * there was nothing to hand over.
 */
export async function firstKey(
  store: RecoveryStore,
  input: { name: unknown; playerId: unknown },
  now = Date.now(),
): Promise<RecoveryOutcome<{ key: string | null }>> {
  const folded = foldName(cleanName(input.name));
  if (!folded || typeof input.playerId !== 'string' || !input.playerId) {
    return { ok: false, status: 400, reason: 'That is not a player.' };
  }
  const holder = await store.holderOf(folded);
  if (!holder || holder !== input.playerId) {
    return { ok: false, status: 403, reason: 'That name is not yours.' };
  }
  if (await store.keyFor(folded)) return { ok: true, key: null };
  const key = mintKey();
  await store.putKey(folded, keepKey(key, now));
  return { ok: true, key };
}

/**
 * The key handed over the moment a name is claimed.
 *
 * Only where there is none. Claiming happens on every innings a player
 * registers, not only the first, so minting here unconditionally would hand
 * somebody a new key every time they improved their score — and quietly stop
 * the one they had written down from working.
 */
export async function keyOnClaim(
  store: RecoveryStore,
  folded: string,
  now = Date.now(),
): Promise<string | null> {
  if (await store.keyFor(folded)) return null;
  const key = mintKey();
  await store.putKey(folded, keepKey(key, now));
  return key;
}

/** Whether an outcome is a refusal, for callers that have to narrow it. */
export function refusedRecovery<T>(
  outcome: RecoveryOutcome<T>,
): outcome is { ok: false; status: number; reason: string } {
  return !outcome.ok;
}
