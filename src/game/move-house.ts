import { browserStores, isPlayerId, mintedAt, PLAYER_KEY, type IdStore } from './identity';

/**
 * Moving the game from the Vercel address to its own domain without losing
 * anybody.
 *
 * A browser keeps what a site stores — localStorage, the cookie, IndexedDB —
 * per address, so `hitmancricket.in` opens on an empty browser for every player
 * who has only ever played at `hitman-cricket.vercel.app`. Their rows stay on
 * the board and their names stay claimed, but the new address does not know it
 * is them: no name, no career, no key, and a player who never saved the key has
 * no way back to their own record.
 *
 * So the old address does not redirect on the server. It loads, packs up
 * everything the game ever wrote here, and hands it across in the link's
 * fragment, and the new address unpacks it before anything else reads who is
 * playing. The fragment is the one part of a link a browser never sends: not to
 * the server, not in a Referer, not to the counter. It is taken off the address
 * the moment it has been read, so the link in the history is a plain one.
 *
 * Nothing moves until `VITE_HOME_ORIGIN` names the new address. A build without
 * it behaves exactly as before, so this can be merged ahead of the domain going
 * live and switched on in Vercel once it has.
 */

/** The address being moved away from. Previews have their own and never move. */
export const OLD_HOST = 'hitman-cricket.vercel.app';

/** The address being moved to, or null while the move is not switched on. */
export function homeOrigin(env: string | undefined = import.meta.env.VITE_HOME_ORIGIN): string | null {
  if (!env) return null;
  try {
    const url = new URL(env);
    return url.protocol === 'https:' ? url.origin : null;
  } catch { return null; }
}

/** The address printed where a player will read it — on the saved key. */
export function homeHost(origin = homeOrigin()): string {
  return origin ? new URL(origin).host : OLD_HOST;
}

/** Every key the game writes begins with this, as `fresh-start.ts` relies on too. */
const PREFIX = 'hitman-';
const CARRY = 'carry';

/** What crosses from one address to the other. */
export interface Parcel {
  /** The player id, found in whichever of the three stores held it. */
  id: string | null;
  /** Every `hitman-` key from localStorage, as it stood. */
  local: Record<string, string>;
}

/** Whether this page is the old address and there is somewhere to move to. */
export function moving(where: { hostname: string } = location, origin = homeOrigin()): origin is string {
  return !!origin && where.hostname === OLD_HOST && new URL(origin).hostname !== OLD_HOST;
}

/**
 * Gathers everything, without minting anything: a browser that has never been
 * here has nothing to carry, and should arrive at the new address as new.
 */
export async function packUp(stores: readonly IdStore[] = browserStores(), storage: Storage | null = safeLocal(), waitMs = 800): Promise<Parcel> {
  const local: Record<string, string> = {};
  try {
    if (storage) {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        const value = key?.startsWith(PREFIX) ? storage.getItem(key) : null;
        if (key && value !== null) local[key] = value;
      }
    }
  } catch { /* Storage off: there is nothing in it to carry. */ }
  const found = await Promise.all(stores.map(store => within(waitMs, () => store.read())));
  const ids = found.filter(isPlayerId).sort((a, b) => mintedAt(a) - mintedAt(b) || (a < b ? -1 : a > b ? 1 : 0));
  return { id: ids[0] ?? null, local };
}

/** The new address's link, carrying the parcel in its fragment. */
export function forwardingAddress(origin: string, where: { pathname: string; search: string }, parcel: Parcel): string {
  const url = new URL(where.pathname + where.search, origin);
  if (parcel.id || Object.keys(parcel.local).length) url.hash = `${CARRY}=${encode(parcel)}`;
  return url.href;
}

/** The parcel a link arrived with, or null if it brought none or it will not read. */
export function parcelIn(hash: string): Parcel | null {
  const raw = new URLSearchParams(hash.replace(/^#/, '')).get(CARRY);
  if (!raw) return null;
  try {
    const held = JSON.parse(decode(raw)) as Partial<Parcel>;
    const id = isPlayerId(held.id) ? held.id : null;
    const local: Record<string, string> = {};
    if (held.local && typeof held.local === 'object') {
      for (const [key, value] of Object.entries(held.local)) {
        if (key.startsWith(PREFIX) && typeof value === 'string') local[key] = value;
      }
    }
    return { id, local };
  } catch { return null; }
}

/**
 * Whether the parcel should be unpacked over what this browser already has.
 *
 * Nearly always this browser has nothing, and it should. When it has a player
 * of its own — somebody opened a shared `hitmancricket.in` link before they
 * ever followed the old one — the same rule as `identity.ts` settles it: the
 * older id is the one the board is likelier to know. The name, the career and
 * the key belong to an id, so the parcel is taken whole or not at all; half of
 * one player laid over half of another is a player who exists nowhere.
 */
export function shouldUnpack(parcel: Parcel, here: string | null): boolean {
  if (!parcel.id) return !here && Object.keys(parcel.local).length > 0;
  if (!isPlayerId(here)) return true;
  if (here === parcel.id) return false;
  return mintedAt(parcel.id) < mintedAt(here) || (mintedAt(parcel.id) === mintedAt(here) && parcel.id < here);
}

/**
 * The old address's half. Returns true when the page is on its way out, and
 * the caller should start nothing.
 */
export async function moveHouse(): Promise<boolean> {
  const origin = homeOrigin();
  if (!moving(location, origin)) return false;
  const parcel = await packUp();
  location.replace(forwardingAddress(origin, location, parcel));
  return true;
}

/**
 * The new address's half, run before anything reads who is playing. Takes the
 * fragment off first, so nothing that follows — the counter, a share, a copy of
 * the address bar — ever sees the key that was in it.
 */
export async function moveIn(stores: readonly IdStore[] = browserStores()): Promise<void> {
  const parcel = parcelIn(location.hash);
  if (!parcel && !location.hash.includes(`${CARRY}=`)) return;
  try { history.replaceState(history.state, '', location.pathname + location.search); } catch { /* It stays, unread. */ }
  if (!parcel) return;
  const found = await Promise.all(stores.map(store => within(800, () => store.read())));
  const here = found.filter(isPlayerId).sort((a, b) => mintedAt(a) - mintedAt(b))[0] ?? null;
  if (!shouldUnpack(parcel, here)) return;
  const storage = safeLocal();
  for (const [key, value] of Object.entries(parcel.local)) {
    if (key === PLAYER_KEY) continue;
    try { storage?.setItem(key, value); } catch { /* Full or off: the id below is what matters most. */ }
  }
  if (parcel.id) await Promise.all(stores.map(store => within(1500, () => store.write(parcel.id!))));
}

function safeLocal(): Storage | null {
  try { return localStorage; } catch { return null; }
}

/** A store's answer, or null if it throws or takes longer than it is given. */
function within<T>(ms: number, act: () => T | Promise<T>): Promise<T | null> {
  return new Promise<T | null>(resolve => {
    const timer = setTimeout(() => resolve(null), ms);
    Promise.resolve().then(act).then(
      value => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(null); },
    );
  });
}

/** UTF-8 safe base64url: names can be in any script. */
function encode(parcel: Parcel): string {
  const bytes = new TextEncoder().encode(JSON.stringify(parcel));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode(raw: string): string {
  const binary = atob(raw.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}
