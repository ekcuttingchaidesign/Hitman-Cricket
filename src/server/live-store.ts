import { handleOf } from '../game/handle.js';
import { AVATARS, cleanName, foldName, isPlayerId } from './board-store.js';

/**
 * Who is around right now: a green dot for a player with the game open, an
 * amber badge with a bat for one in an innings.
 *
 * A browser checks in every couple of minutes while the game is open and on
 * screen, and again the moment an innings starts or ends; the store keeps the
 * last check-in of each player, and anybody can ask for the list. Nothing in
 * the list is a player id: a check-in is sent with the id, which proves who it
 * is, and kept and answered under the handle (`game/handle.ts`), the way every
 * board row is. The name and kit come with it so the Rivals screen can show
 * somebody it has no board row for; the name is checked against the registry,
 * so nobody can be online as somebody else.
 *
 * No "last seen": an entry older than `ONLINE_MS` is not around, and the list
 * says nothing about it at all.
 *
 * The rules live here and the keeping is behind `LiveStore`, so the tests run
 * them against `memoryLive()` and the deployed endpoint against Redis
 * (`upstashLive` in `upstash.ts`) with nothing in between.
 */

export type LiveState = 'online' | 'batting';
export type LiveMode = 'classic' | 'marathon' | 'survive' | 'super10';
const MODES: readonly LiveMode[] = ['classic', 'marathon', 'survive', 'super10'];

/** One player's last check-in, as kept. */
export interface StoredLive {
  name: string;
  avatar: number;
  state: LiveState;
  /** The mode being batted, while batting. */
  mode: LiveMode | null;
  at: number;
}

/** One player in the list: what any browser may be told. */
export interface LivePlayer {
  handle: string;
  name: string;
  avatar: number;
  state: LiveState;
  mode: LiveMode | null;
}

export interface LivePayload {
  at: number;
  players: LivePlayer[];
}

export interface LiveStore {
  /** Who holds this folded name, or null. */
  nameOwner(folded: string): Promise<string | null>;
  write(handle: string, entry: StoredLive): Promise<void>;
  /** Every entry kept, stale ones included. */
  readAll(): Promise<Record<string, StoredLive>>;
  /** Forgets these handles' entries. */
  remove(handles: string[]): Promise<void>;
}

/**
 * How long a check-in counts. A browser checks in every `CHECK_IN_MS` while it
 * is on screen, so a player stays around through one missed check-in and is
 * gone a few minutes after closing the game.
 */
export const CHECK_IN_MS = 2 * 60_000;
export const ONLINE_MS = 5 * 60_000;
/** An innings left batting with no word for this long is taken to be over: a tab closed mid-over says nothing. */
export const BATTING_MS = 4 * 60_000;
/** At most this many in a list, batting first: the Rivals screen shows a dozen, and a crowd is not a list. */
export const LIVE_MAX = 60;

export type LiveOutcome = { ok: true } | { ok: false; status: number; reason: string };

/** A check-in: a named player with the game open, or batting. */
export async function checkIn(
  store: LiveStore,
  input: { playerId: unknown; name: unknown; avatar: unknown; state: unknown; mode: unknown },
  now = Date.now(),
): Promise<LiveOutcome> {
  if (!isPlayerId(input.playerId)) return { ok: false, status: 400, reason: 'That is not a player.' };
  const name = cleanName(input.name);
  if (!name) return { ok: false, status: 400, reason: 'Only a named player shows as online.' };
  // The name must be this player's: the list carries it to everybody.
  if ((await store.nameOwner(foldName(name))) !== input.playerId) return { ok: false, status: 403, reason: 'That name is not yours.' };
  const state: LiveState = input.state === 'batting' ? 'batting' : 'online';
  const mode = state === 'batting' && MODES.includes(input.mode as LiveMode) ? input.mode as LiveMode : null;
  const avatar = Number.isInteger(input.avatar) && (input.avatar as number) >= 0 && (input.avatar as number) < AVATARS ? input.avatar as number : 0;
  await store.write(handleOf(input.playerId), { name, avatar, state, mode, at: now });
  return { ok: true };
}

/** Whether an entry is still around, and as what. */
export function liveStateOf(entry: StoredLive, now = Date.now()): LiveState | null {
  const age = now - entry.at;
  if (age > ONLINE_MS || age < -60_000) return null;
  // A batting entry nobody has refreshed is a tab that closed mid-innings:
  // still online for the rest of the window, not still batting.
  return entry.state === 'batting' && age > BATTING_MS ? 'online' : entry.state;
}

/** The list: batting first, then online, each newest first. Stale entries are forgotten as they are found. */
export async function readLive(store: LiveStore, now = Date.now()): Promise<LivePayload> {
  const all = await store.readAll();
  const stale: string[] = [];
  const players: (LivePlayer & { at: number })[] = [];
  for (const [handle, entry] of Object.entries(all)) {
    const state = entry ? liveStateOf(entry, now) : null;
    if (!state) { stale.push(handle); continue; }
    players.push({ handle, name: entry.name, avatar: entry.avatar, state, mode: state === 'batting' ? entry.mode : null, at: entry.at });
  }
  if (stale.length) await store.remove(stale).catch(() => undefined);
  players.sort((a, b) => (a.state === b.state ? b.at - a.at : a.state === 'batting' ? -1 : 1));
  return { at: now, players: players.slice(0, LIVE_MAX).map(({ at: _at, ...player }) => player) };
}

/** Kept in memory: the dev server's and the tests'. */
export function memoryLive(nameOwner: (folded: string) => string | null): LiveStore & { clear(): void } {
  const entries = new Map<string, StoredLive>();
  return {
    async nameOwner(folded) { return nameOwner(folded); },
    async write(handle, entry) { entries.set(handle, entry); },
    async readAll() { return Object.fromEntries(entries); },
    async remove(handles) { for (const handle of handles) entries.delete(handle); },
    clear() { entries.clear(); },
  };
}
