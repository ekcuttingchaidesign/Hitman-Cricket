/**
 * Who the board thinks you are.
 *
 * A leaderboard needs one row per person, and a static page has no accounts to
 * ask. So a player is a long random id the browser holds on to, and the whole
 * job of this file is holding on to it: a browser that forgets the id has not
 * lost a row, it has quietly minted a second player who plays under the same
 * name, and the board fills up with the same person four times over.
 *
 * So the id is written to three places at once — localStorage, a long-lived
 * cookie and IndexedDB — and read back from whichever survived. They fail in
 * different ways and at different times, which is the point: Safari evicts
 * script-written storage after seven idle days but keeps cookies longer, a
 * cleared-site-data sweep takes the lot, and private windows keep nothing past
 * the tab. Any one of the three coming back is enough to stay the same player.
 *
 * None of this is a security measure. An id in a browser identifies a browser,
 * not a person: anyone who wants two rows can have two rows, and the answer to
 * that is a delete path for the owner rather than a cleverer cookie.
 */

/** Where the id lives in each of the three stores. */
export const PLAYER_KEY = 'hitman-player';
const DB_NAME = 'hitman-cricket';
const DB_STORE = 'player';
/** Two years, which is the most a browser will keep a cookie anyway. */
const COOKIE_MAX_AGE = 63_072_000;

/**
 * An id carries the moment it was minted, in base 36, ahead of its random half.
 *
 * That prefix is what settles a disagreement. If the three stores come back
 * with two different ids the browser has been half-wiped at some point and
 * minted a second player, and the older of the two is the one the board is more
 * likely to already know, so it wins and gets written back over the younger.
 * A random id alone would leave nothing to choose between them.
 */
const ID_PATTERN = /^[0-9a-z]{6,10}-[0-9a-z]{12,}$/;
const RANDOM_CHARS = 12;

export function isPlayerId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

/** When an id was minted, as milliseconds, or Infinity if it will not parse. */
export function mintedAt(id: string): number {
  const stamp = Number.parseInt(id.slice(0, id.indexOf('-')), 36);
  return Number.isFinite(stamp) ? stamp : Infinity;
}

/** A new player: the clock, then enough randomness that two never collide. */
export function mintPlayerId(now = Date.now(), random = randomChars): string {
  return `${Math.floor(now).toString(36)}-${random(RANDOM_CHARS)}`;
}

/**
 * The id to keep out of whatever the stores gave back: the oldest one that is
 * a real id, or null if none of them held anything. Ids that do not parse are
 * dropped rather than repaired — a store holding junk is a store that is not
 * holding an id.
 */
export function pickPlayerId(found: readonly (string | null | undefined)[]): string | null {
  const real = found.filter(isPlayerId);
  if (!real.length) return null;
  // Oldest first, and on the same millisecond the ids sort against each other,
  // so two browsers restoring the same pair always agree on the winner.
  return real.sort((a, b) => mintedAt(a) - mintedAt(b) || (a < b ? -1 : a > b ? 1 : 0))[0];
}

/** One place an id can be kept. Every method is allowed to throw or to hang. */
export interface IdStore {
  read(): string | null | Promise<string | null>;
  write(id: string): void | Promise<void>;
}

/**
 * Reads all three, keeps the oldest id any of them held, and writes it back to
 * every one of them — including the ones that already agreed, because a
 * localStorage write is what pushes Safari's seven-day eviction clock back.
 *
 * A store that throws or never answers is treated as empty. Nothing here is
 * allowed to keep the player waiting: the caller has a game to start.
 */
export async function resolvePlayerId(
  stores: readonly IdStore[],
  mint: () => string = mintPlayerId,
): Promise<string> {
  const found = await Promise.all(stores.map(store => settle(() => store.read())));
  const id = pickPlayerId(found) ?? mint();
  await Promise.all(stores.map(store => settle(() => store.write(id))));
  return id;
}

/** The three stores a browser actually offers, in the order they answer. */
export function browserStores(): IdStore[] {
  return [localStore(), cookieStore(), indexedDbStore()];
}

export function localStore(key = PLAYER_KEY): IdStore {
  return {
    read: () => localStorage.getItem(key),
    write: id => localStorage.setItem(key, id),
  };
}

/**
 * The cookie is here for the browsers that keep cookies longer than they keep
 * script storage, so it is set for as long as one is allowed to live. `Lax`
 * because nothing ever reads it cross-site, and `Secure` only where the page is
 * served over https, or a local http dev server would refuse to keep it.
 */
export function cookieStore(key = PLAYER_KEY): IdStore {
  return {
    read: () => {
      const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${key}=([^;]*)`));
      return match ? decodeURIComponent(match[1]) : null;
    },
    write: id => {
      const secure = location.protocol === 'https:' ? ';Secure' : '';
      document.cookie = `${key}=${encodeURIComponent(id)};path=/;max-age=${COOKIE_MAX_AGE};SameSite=Lax${secure}`;
    },
  };
}

/**
 * IndexedDB is the slowest of the three and the only one that can hang rather
 * than fail — a blocked upgrade never calls back at all — so every call it
 * makes is wrapped in a promise that a timeout can walk away from.
 */
export function indexedDbStore(key = PLAYER_KEY): IdStore {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('blocked'));
  });
  const run = async <T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>) => {
    const db = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const request = act(db.transaction(DB_STORE, mode).objectStore(DB_STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  };
  return {
    read: async () => (await run('readonly', store => store.get(key))) as string | null ?? null,
    write: async id => { await run('readwrite', store => store.put(id, key)); },
  };
}

/**
 * The id for this browser, settled before the board is asked anything. A store
 * that hangs is given a second and then left behind, so a wedged IndexedDB
 * costs the player a second rather than the game.
 */
export async function playerId(stores = browserStores(), timeoutMs = 1000): Promise<string> {
  const fallback = new Promise<string>(resolve => setTimeout(() => resolve(mintPlayerId()), timeoutMs));
  return Promise.race([resolvePlayerId(stores), fallback]);
}

/**
 * Whatever a store does, the answer is an id or nothing. The call itself is
 * made in here rather than passed in already made, because a disabled
 * localStorage throws on the way in — before there is a promise to catch.
 */
async function settle<T>(act: () => T | Promise<T>): Promise<T | null> {
  try { return await act(); } catch { return null; }
}

/** Base-36 randomness, from the crypto source where there is one. */
function randomChars(length: number): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  // 256 is not a multiple of 36, so the low four letters come up very slightly
  // more often. It costs nothing here: this is a name, not a key.
  return Array.from(bytes, byte => alphabet[byte % 36]).join('');
}
