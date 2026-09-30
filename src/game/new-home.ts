import { DB_NAME, PLAYER_KEY, isPlayerId } from './identity';

/**
 * The game's own address, and moving players to it with their careers.
 *
 * It lived at hitman-cricket.vercel.app and now lives at hitmancricket.in. A
 * redirect at the server would get people there, and every one of them would
 * arrive a stranger: who a player is lives in this browser — the id, the name,
 * the career key, the best score, the settings — and a browser keeps all of
 * that per address. The same phone on the new address is a new player with no
 * record and no name.
 *
 * So the move is done by the page. On the old address it reads everything the
 * game keeps and goes to the new one carrying it in the fragment — the part of
 * an address after `#`, which a browser never sends to any server, so it is in
 * no log. On the new address it is written back and taken straight off the
 * address bar, and the player carries on as themselves.
 *
 * What the new address accepts is guarded, because a link is a thing anybody
 * can write: `#carry=` with somebody else's id in it, handed round, would have
 * everybody who tapped it batting as that somebody, and every innings they
 * finished counting towards that one career. So it is taken only when the
 * browser says it came from the old address, which no link on another site can
 * make it say, and only into a browser that is not already somebody here. A
 * move refused for either reason loses nothing: the old address still has it
 * all, and the career key still brings a record back.
 */

/** Where the game lives. */
export const HOME = 'hitmancricket.in';

/**
 * Where it used to, and forwards from: the short production alias, and the
 * team-scoped one Vercel gives every project alongside it. Previews and the
 * per-deployment addresses are not here — a preview is where a change is
 * looked at before it ships, and a deployment's own address is pinned to one
 * build on purpose.
 */
export const OLD_HOMES = ['hitman-cricket.vercel.app', 'hitman-cricket-ek-cutting-chai-design.vercel.app'];

const PREFIX = 'hitman-';
const MARK = '#carry=';
/** A good deal more than every key the game writes, and far short of what an address can hold. */
const MOST = 200_000;

interface Where { hostname: string; pathname: string; search: string; hash: string }

/**
 * Whether the move is switched on for this build: `VITE_MOVE_HOME=1`, set in
 * Vercel once the new domain answers. Until then the old address stays where
 * it is, and so does everyone on it.
 */
export const MOVE_LIVE = import.meta.env.VITE_MOVE_HOME === '1';

/** The address to print where the game names itself: wherever it lives today. */
export const LIVE_ADDRESS = MOVE_LIVE ? HOME : 'hitman-cricket.vercel.app';

/** Whether this page is on an old address and should move. */
export function movingOut(where: Pick<Where, 'hostname'> = location, live = MOVE_LIVE): boolean {
  return live && OLD_HOMES.includes(where.hostname);
}

/** What travels: the game's keys, and whatever fragment the address already had. */
export interface Carried { keys: Record<string, string>; hash: string }

const toBase64 = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64 = (packed: string) => {
  const binary = atob(packed.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
};

export function pack(carried: Carried): string {
  return toBase64(JSON.stringify({ v: 1, k: carried.keys, h: carried.hash }));
}

/**
 * Back out of a fragment, or null for anything that is not a move this game
 * made: the wrong version, a key that is not one of the game's, a value that
 * is not a string, or more than the game could ever have written.
 */
export function unpack(packed: string): Carried | null {
  if (!packed || packed.length > MOST) return null;
  try {
    const read = JSON.parse(fromBase64(packed)) as { v?: unknown; k?: unknown; h?: unknown };
    if (read.v !== 1 || !read.k || typeof read.k !== 'object' || Array.isArray(read.k)) return null;
    const keys: Record<string, string> = {};
    for (const [key, value] of Object.entries(read.k as Record<string, unknown>)) {
      if (!key.startsWith(PREFIX) || typeof value !== 'string') return null;
      keys[key] = value;
    }
    if (PLAYER_KEY in keys && !isPlayerId(keys[PLAYER_KEY])) return null;
    const hash = typeof read.h === 'string' && read.h.startsWith('#') && !read.h.startsWith(MARK) ? read.h : '';
    return { keys, hash };
  } catch {
    return null;
  }
}

/** The same page at the new address, carrying `packed` if there is anything to carry. */
export function forwardingAddress(where: Where, packed: string | null): string {
  return `https://${HOME}${where.pathname}${where.search}${packed ? `${MARK}${packed}` : where.hash}`;
}

/** Everything the game keeps in this browser's localStorage. */
export function gather(storage: Pick<Storage, 'length' | 'key' | 'getItem'> = localStorage): Record<string, string> {
  const keys: Record<string, string> = {};
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      const value = key ? storage.getItem(key) : null;
      if (key?.startsWith(PREFIX) && value !== null) keys[key] = value;
    }
  } catch { /* A storage that will not be read has nothing to carry. */ }
  return keys;
}

/**
 * The id, from whichever of the other two stores still has it, for a browser
 * whose localStorage was swept: the cookie at once, IndexedDB if it answers in
 * time. Either is enough to stay the same player.
 */
async function rescuedId(): Promise<string | null> {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${PLAYER_KEY}=([^;]*)`));
    const id = match ? decodeURIComponent(match[1]) : null;
    if (isPlayerId(id)) return id;
  } catch { /* On to the slow one. */ }
  const fromDb = new Promise<string | null>(resolve => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('player');
      request.onerror = request.onblocked = () => resolve(null);
      request.onsuccess = () => {
        try {
          const get = request.result.transaction('player', 'readonly').objectStore('player').get(PLAYER_KEY);
          get.onsuccess = () => { request.result.close(); resolve(isPlayerId(get.result) ? get.result : null); };
          get.onerror = () => { request.result.close(); resolve(null); };
        } catch { resolve(null); }
      };
    } catch { resolve(null); }
  });
  return Promise.race([fromDb, new Promise<null>(resolve => setTimeout(() => resolve(null), 800))]);
}

/** Packs this browser up and goes to the new address. Nothing after it runs. */
export async function moveOut(where: Where & { replace(url: string): void } = location as unknown as Where & { replace(url: string): void }) {
  const keys = gather();
  if (!isPlayerId(keys[PLAYER_KEY])) {
    const id = await rescuedId();
    if (id) keys[PLAYER_KEY] = id;
  }
  const packed = Object.keys(keys).length ? pack({ keys, hash: where.hash }) : null;
  where.replace(forwardingAddress(where, packed));
}

/** How an arrival went, for the analytics and the tests. */
export type Arrival = 'moved' | 'kept' | 'refused' | null;

/**
 * On the new address: takes in what the old one sent, if it was the old one
 * that sent it and this browser is nobody here yet, and takes the fragment off
 * the address either way — it is not a thing to leave in a history or a
 * bookmark, and a reload should not ask again.
 */
export function moveIn(
  where: Pick<Where, 'hash'> = location,
  referrer: string = document.referrer,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
  forget: (hash: string) => void = forgetCarry,
  cookie: () => string = () => document.cookie,
): Arrival {
  if (!where.hash.startsWith(MARK)) return null;
  const carried = unpack(where.hash.slice(MARK.length));
  forget(carried?.hash ?? '');
  if (!carried) return 'refused';
  let from = '';
  try { from = new URL(referrer).hostname; } catch { /* No referrer, no move. */ }
  if (!OLD_HOMES.includes(from)) return 'refused';
  try {
    // Somebody already, here: they are kept as they are, whole, rather than
    // spliced with somebody else's keys.
    if (storage.getItem(PLAYER_KEY) || cookie().includes(`${PLAYER_KEY}=`)) return 'kept';
    for (const [key, value] of Object.entries(carried.keys)) storage.setItem(key, value);
  } catch {
    return 'refused';
  }
  return 'moved';
}

function forgetCarry(hash: string) {
  try {
    history.replaceState(history.state, '', `${location.pathname}${location.search}${hash}`);
  } catch { /* Then it stays on the address, and is refused as a repeat on the next load. */ }
}
