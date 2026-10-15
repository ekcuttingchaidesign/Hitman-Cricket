import { cleanName, foldName } from './board-store.js';
import { foldKey, keepKey, keyMatches, keyShaped, mintKey, type StoredKey } from './career-key.js';
import { keepPassword, passwordMatches, type StoredPassword } from './career-password.js';
import { cleanPassword, passwordProblem } from './password-rules.js';

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
  /** The password a player set, kept against their id, or null where they set none. */
  passwordOf(playerId: string): Promise<StoredPassword | null>;
  /** Keeps this password against the player, replacing whatever was there. */
  putPassword(playerId: string, held: StoredPassword): Promise<void>;
  /**
   * Puts a name in the list a restore searches: `folded`, a space, and the name
   * as the board shows it. Folded names have no spaces, so the space both ends
   * the part a search runs along and sorts a name ahead of the longer names it
   * begins — "gaurav Gaurav" before "gaurav7 Gaurav7".
   */
  listName(entry: string): Promise<void>;
  /** Up to `limit` entries of that list starting with this folded prefix, in order. */
  namesFrom(prefix: string, limit: number): Promise<string[]>;
  /** Searches from this address inside the window, counting this one. */
  searchesFrom(address: string, windowSeconds: number): Promise<number>;
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

/**
 * The key a player already has, put behind the name they have just changed to.
 *
 * A new name minted a new key, which left a player who had saved theirs holding
 * one that opened only the name they had stopped using — and being told to save
 * a second key a month after being told the first was the only way back. So the
 * one they have comes with them, and `keyOnClaim` after it finds the name
 * already keyed and mints nothing.
 *
 * Only between two names the same player holds, which is the whole check: the
 * old name is the browser's word, and taking somebody else's key across would
 * hand them a way into this record. The old name keeps its key too — a name
 * once held is never released, and a key written down beside it goes on
 * opening the same career.
 */
export async function carryKey(
  store: RecoveryStore, input: { from: unknown; to: string; playerId: string },
): Promise<void> {
  const from = typeof input.from === 'string' ? foldName(cleanName(input.from)) : '';
  if (!from || from === input.to) return;
  const [held, already, oldHolder, newHolder] = await Promise.all([
    store.keyFor(from), store.keyFor(input.to), store.holderOf(from), store.holderOf(input.to),
  ]);
  if (!held || already || oldHolder !== input.playerId || newHolder !== input.playerId) return;
  await store.putKey(input.to, held);
}

/**
 * Passwords: the way back a player chooses for themselves.
 *
 * Keys were the way back, and players did not keep them: a key is the game's
 * three words, shown once, and saving it was homework. A password is the
 * player's own, asked for with the name before the first innings, and a phone
 * offers to remember it against the name. So a wiped phone comes back by the
 * name, picked from a short list, and the password.
 *
 * It belongs to the player, not to a name: kept against the player id, so every
 * name they have held opens with it, and a new name needs no new one. Keys go
 * on working beside it — a player who forgets their password comes back with a
 * key (the owner can read one back or reset it) and sets another.
 *
 * The list is the one thing here that says which names exist, and it was
 * chosen to: somebody coming back types "Gaur" and sees Gaurav Rana, rather
 * than having to remember whether they spelled it with a space. It lists only
 * names whose player has set a password — a name with nothing behind it to type
 * is no way back — gives a name, a kit and an innings count, never a player id,
 * and is counted per address like the tries are. Names are printed down the
 * board already; what it adds is the claimed names that are not on it.
 */
export const FIND_WINDOW_SECONDS = 3600;
export const FIND_TRIES_FROM = 60;
/** The fewest letters a search runs on, so one letter is not a way to page through every name. */
export const FIND_MIN = 3;
export const FIND_MAX = 6;

/** One name in the list a restore picks from. */
export interface FoundPlayer {
  /** The name to restore by, as the board shows it. */
  name: string;
  /** Their kit, and how many innings their careers have counted, so they know it is them. */
  avatar: number;
  innings: number;
}

/**
 * What the list says about each player, from their careers: the name and kit
 * on the latest one, and the innings across all of them. Handed the careers' `many`,
 * so this file stays the store's and the endpoint chooses which careers.
 */
type Described = { name?: string; avatar: number; at: number; career: { innings: number } };
export function describeFrom(
  careers: { many(ids: string[]): Promise<(Described | null)[]> }[],
): (ids: string[]) => Promise<({ avatar: number; innings: number; name?: string } | null)[]> {
  return async ids => {
    if (!ids.length) return [];
    const read = await Promise.all(careers.map(career => career.many(ids)));
    return ids.map((_, at) => {
      const held = read.map(one => one[at]).filter(Boolean) as Described[];
      if (!held.length) return null;
      const latest = held.reduce((a, b) => (b.at > a.at ? b : a));
      const named = held.filter(one => one.name).reduce<Described | null>((a, b) => (!a || b.at > a.at ? b : a), null);
      return {
        name: named?.name || undefined, avatar: latest.avatar,
        innings: held.reduce((sum, one) => sum + (Number(one.career?.innings) || 0), 0),
      };
    });
  };
}

/** The sentence a wrong password gets, whatever was wrong. */
const NO_PASSWORD = 'That name and password do not go together. Check both and try again.';

/** The list a restore picks from, for what has been typed so far. */
export async function findPlayers(
  store: RecoveryStore,
  input: { name: unknown; address: string },
  describe: (ids: string[]) => Promise<({ avatar: number; innings: number; name?: string } | null)[]> = async ids => ids.map(() => null),
): Promise<RecoveryOutcome<{ players: FoundPlayer[] }>> {
  const prefix = foldName(cleanName(input.name));
  if (prefix.length < FIND_MIN) return { ok: true, players: [] };
  if (await store.searchesFrom(input.address, FIND_WINDOW_SECONDS) > FIND_TRIES_FROM) {
    return { ok: false, status: 429, reason: 'Too many searches from here. Try again in an hour.' };
  }
  // More than are shown, because one player can be listed under every name they
  // have held, and they are shown once.
  const entries = await store.namesFrom(prefix, FIND_MAX * 3);
  const seen = new Set<string>();
  const found: { id: string; name: string }[] = [];
  for (const entry of entries) {
    const space = entry.indexOf(' ');
    const folded = space < 0 ? entry : entry.slice(0, space);
    const name = space < 0 ? entry : entry.slice(space + 1);
    const id = await store.holderOf(folded);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    found.push({ id, name });
    if (found.length === FIND_MAX) break;
  }
  const about = await describe(found.map(one => one.id)).catch(() => found.map(() => null));
  return {
    ok: true,
    // Under the name they bat under now, where their careers say: a player found
    // by a name they have since moved on from comes back as who they are.
    players: found.map((one, at) => ({
      name: about[at]?.name || one.name, avatar: about[at]?.avatar ?? 0, innings: about[at]?.innings ?? 0,
    })),
  };
}

/**
 * A name and a password, for the player id they open.
 *
 * The key's rules: the tries are spent before the hash is, from the same two
 * counters, so a key and a password cannot be tried ten times each; and every
 * answer that depends on what is stored is the one sentence.
 */
export async function restoreWithPassword(
  store: RecoveryStore,
  input: { name: unknown; password: unknown; address: string },
): Promise<RecoveryOutcome<{ playerId: string }>> {
  const folded = foldName(cleanName(input.name));
  const password = cleanPassword(input.password);
  if (!folded || !password) return { ok: false, status: 400, reason: NO_PASSWORD };
  if (await store.triesFrom(input.address, RESTORE_WINDOW_SECONDS) > RESTORE_TRIES_FROM) {
    return { ok: false, status: 429, reason: 'Too many tries from here. Try again in an hour.' };
  }
  if (await store.triesAt(folded, RESTORE_WINDOW_SECONDS) > RESTORE_TRIES_AT) {
    return { ok: false, status: 429, reason: 'Too many tries for that name. Try again in an hour.' };
  }
  const holder = await store.holderOf(folded);
  const held = holder ? await store.passwordOf(holder) : null;
  if (!holder || !held || !passwordMatches(password, held)) return { ok: false, status: 403, reason: NO_PASSWORD };
  return { ok: true, playerId: holder };
}

/**
 * A password set, or changed, by the player who holds the name.
 *
 * Proved by the player id, as a new key is: whoever has it can already post
 * under the name. What is held to the rules is the password, and the name goes
 * into the list a restore searches.
 */
export async function setPassword(
  store: RecoveryStore,
  input: { name: unknown; playerId: unknown; password: unknown },
  now = Date.now(),
): Promise<RecoveryOutcome<{ at: number }>> {
  const name = cleanName(input.name);
  const folded = foldName(name);
  if (!folded || typeof input.playerId !== 'string' || !input.playerId) {
    return { ok: false, status: 400, reason: 'That is not a player.' };
  }
  const password = cleanPassword(input.password);
  const problem = passwordProblem(password, folded);
  if (problem) return { ok: false, status: 400, reason: problem };
  const holder = await store.holderOf(folded);
  if (!holder || holder !== input.playerId) return { ok: false, status: 403, reason: 'That name is not yours.' };
  await store.putPassword(holder, keepPassword(password, now));
  await store.listName(`${folded} ${name}`);
  return { ok: true, at: now };
}

/** Whether the player holding this name has set a password, asked by that player. */
export async function passwordSet(
  store: RecoveryStore,
  input: { name: unknown; playerId: unknown },
): Promise<RecoveryOutcome<{ password: boolean }>> {
  const folded = foldName(cleanName(input.name));
  if (!folded || typeof input.playerId !== 'string' || !input.playerId) {
    return { ok: false, status: 400, reason: 'That is not a player.' };
  }
  const holder = await store.holderOf(folded);
  if (!holder || holder !== input.playerId) return { ok: false, status: 403, reason: 'That name is not yours.' };
  return { ok: true, password: !!await store.passwordOf(holder) };
}

/**
 * A name just claimed, put in the list where its player has a password.
 *
 * Every claim passes here — a new name from My Stats, a name typed into a Rivals
 * sheet — so a player who renames is found under the new name as well as the
 * old. A player with no password is not listed: there would be nothing to type.
 */
export async function listOnClaim(store: RecoveryStore, input: { name: string; playerId: string }): Promise<void> {
  const name = cleanName(input.name);
  const folded = foldName(name);
  if (!folded || await store.holderOf(folded) !== input.playerId) return;
  if (await store.passwordOf(input.playerId)) await store.listName(`${folded} ${name}`);
}

/** Whether an outcome is a refusal, for callers that have to narrow it. */
export function refusedRecovery<T>(
  outcome: RecoveryOutcome<T>,
): outcome is { ok: false; status: number; reason: string } {
  return !outcome.ok;
}
