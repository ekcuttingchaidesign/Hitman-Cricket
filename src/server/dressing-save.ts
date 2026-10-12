import { isPlayerId } from './board-store.js';
import { cleanDressing, mergeDressing, type SavedDressing } from '../game/dressing-sync.js';

/**
 * Each player's Dressing Room, kept so it follows them to another device: the
 * player id is the key, as it is for their careers, so a browser that brings a
 * record back with the career key brings this back with it.
 *
 * Writing it takes the player id, the same secret the boards are written with.
 * It is merged into what is held rather than laid over it (`mergeDressing`),
 * so two devices writing at once both keep what they had.
 */
export interface DressingStore {
  read(playerId: string): Promise<SavedDressing | null>;
  write(playerId: string, saved: SavedDressing): Promise<void>;
  /** Calls from one address in the window so far, this one counted. */
  hits(address: string, windowSeconds: number): Promise<number>;
}

/** Saves from one address an hour. A pick is a tap, so this is a great many taps; it is there for a loop, not a player. */
export const SAVE_LIMIT = 300;
const WINDOW_SECONDS = 3600;

export type Saved = { ok: true; saved: SavedDressing } | SaveRefusal;
export type SaveRefusal = { ok: false; status: number; reason: string };
/** A save turned away, told apart the way the endpoints' compile can follow. */
export const refusedSave = (outcome: Saved): outcome is SaveRefusal => !outcome.ok;

/** What is kept for a player, or null for one with nothing kept (or no such player). */
export async function readSaved(store: DressingStore, playerId: unknown): Promise<SavedDressing | null> {
  if (!isPlayerId(playerId)) return null;
  return cleanDressing(await store.read(playerId));
}

/** A copy sent from a device, merged into what is kept; the merged copy is the answer, for the device to take up. */
export async function saveDressing(store: DressingStore, input: { playerId: unknown; dressing: unknown; address: string }): Promise<Saved> {
  if (!isPlayerId(input.playerId)) return { ok: false, status: 400, reason: 'That is not a player.' };
  const incoming = cleanDressing(input.dressing);
  if (!incoming) return { ok: false, status: 400, reason: 'That is not a Dressing Room.' };
  if (await store.hits(input.address, WINDOW_SECONDS) > SAVE_LIMIT) return { ok: false, status: 429, reason: 'Too many saves. Try again in a while.' };
  const saved = mergeDressing(cleanDressing(await store.read(input.playerId)), incoming);
  await store.write(input.playerId, saved);
  return { ok: true, saved };
}

/** In memory, for the dev server and the tests. */
export function memoryDressing(): DressingStore & { clear(): void } {
  const held = new Map<string, SavedDressing>();
  const rate = new Map<string, { count: number; until: number }>();
  return {
    async read(id) { return held.get(id) ?? null; },
    async write(id, saved) { held.set(id, saved); },
    async hits(address, windowSeconds) {
      const now = Date.now(), was = rate.get(address);
      const next = was && was.until > now ? { count: was.count + 1, until: was.until } : { count: 1, until: now + windowSeconds * 1000 };
      rate.set(address, next);
      return next.count;
    },
    clear() { held.clear(); rate.clear(); },
  };
}
