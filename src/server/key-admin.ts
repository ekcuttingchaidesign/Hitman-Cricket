import { cleanName, foldName } from './board-store.js';
import { keepKey, mintKey, openKey, type StoredKey } from './career-key.js';
import type { RecoveryStore } from './recovery-store.js';

/**
 * The owner's two answers for a player who has lost their career key: read it
 * back, or give them a new one. `scripts/key-show.ts` and `scripts/key-reset.ts`
 * are these two run against the real store; everything they decide is here, so
 * it is tested without one.
 *
 * Neither is reachable from the game. A player's way back is still their name
 * and their key; these are for the owner, in their own terminal, when a friend
 * asks — and the owner is the one who has to be sure the friend is who they say.
 */

/** What is known about one name's key. */
export interface KeyLookup {
  /** The name as the board keeps it, and folded as the store files it. */
  name: string;
  folded: string;
  /** The player id holding the name, or null when nobody does. */
  holder: string | null;
  /** When the key behind the name was issued, or null when there is none. */
  issued: number | null;
  /** The key, where it was sealed and the secret opens it; otherwise null. */
  key: string | null;
  /** Why there is no key to show, in words for the owner. Null when there is one. */
  missing: string | null;
}

/** Reads one name's key back, where it can be. Reads only; writes nothing. */
export async function lookUpKey(
  store: Pick<RecoveryStore, 'holderOf' | 'keyFor'>, rawName: unknown, secret: Buffer | null,
): Promise<KeyLookup> {
  const name = cleanName(rawName);
  const folded = foldName(name);
  const holder = folded ? await store.holderOf(folded) : null;
  const held: StoredKey | null = holder ? await store.keyFor(folded) : null;
  const base = { name, folded, holder, issued: held?.at ?? null };
  if (!folded) return { ...base, key: null, missing: 'That is not a name.' };
  if (!holder) return { ...base, key: null, missing: 'Nobody holds that name.' };
  if (!held) return { ...base, key: null, missing: 'That name has no key yet. The player gets one the next time they open the game.' };
  if (!held.sealed) {
    return { ...base, key: null, missing: 'This key was issued before keys were sealed, so it cannot be read back. Give the player a new one with key-reset.' };
  }
  if (!secret) return { ...base, key: null, missing: 'KEY_SEAL_SECRET is not set in this terminal, so the sealed key cannot be opened.' };
  const key = openKey(held, secret);
  if (!key) return { ...base, key: null, missing: 'The sealed key does not open with this secret. Check KEY_SEAL_SECRET is the one this environment uses.' };
  return { ...base, key, missing: null };
}

export type KeyReset =
  | { ok: true; name: string; folded: string; holder: string; key: string; sealed: boolean }
  | { ok: false; reason: string };

/**
 * A new key behind one name, and the old one stops opening it.
 *
 * Only the one name, and only its key: the record behind it — the board rows,
 * the careers, the Dressing Room, the name itself — is filed under the player
 * id and is not touched. A name nobody holds is refused rather than given a key,
 * because a key with no player behind it opens nothing and would only confuse
 * whoever was handed it.
 */
export async function resetKey(
  store: Pick<RecoveryStore, 'holderOf' | 'putKey'>,
  rawName: unknown,
  options: { now?: number; secret?: Buffer | null; mint?: () => string } = {},
): Promise<KeyReset> {
  const name = cleanName(rawName);
  const folded = foldName(name);
  if (!folded) return { ok: false, reason: 'That is not a name.' };
  const holder = await store.holderOf(folded);
  if (!holder) return { ok: false, reason: 'Nobody holds that name, so there is no record to give a key to.' };
  const key = (options.mint ?? mintKey)();
  const secret = options.secret ?? null;
  await store.putKey(folded, keepKey(key, options.now ?? Date.now(), secret));
  return { ok: true, name, folded, holder, key, sealed: !!secret };
}

/**
 * How much of a player there is, for the owner to be sure it is the right one
 * before they hand anybody a key: innings counted in each mode's career.
 */
export async function inningsOf(
  read: (field: string, id: string) => Promise<unknown>, scope: string, id: string,
): Promise<Record<string, number>> {
  const careers: Record<string, string> = { blast: 'blast:', survival: 'survivecareer:', marathon: 'marathoncareer:' };
  const counted: Record<string, number> = {};
  for (const [mode, prefix] of Object.entries(careers)) {
    const record = await read(`${scope}${prefix}careers`, id).catch(() => null) as { career?: { innings?: unknown } } | null;
    const innings = Number(record?.career?.innings);
    counted[mode] = Number.isFinite(innings) ? innings : 0;
  }
  return counted;
}
