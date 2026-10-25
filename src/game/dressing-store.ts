import { FREE_BAT, FREE_GUARD, FREE_OUTFIT } from './dressing';
import { cleanDressing, type SavedDressing } from './dressing-sync';

/**
 * What this browser remembers of the Dressing Room: what the player wears and
 * holds, where each mode's figure stood when the room arrived, and which
 * unlocks have already been shown to them.
 *
 * None of it is the record. What is earned is worked out from the career every
 * time (`dressing.ts`), so clearing this costs a player their pick and nothing
 * they have earned; the pick also travels with their Rival Match innings.
 *
 * A named player's copy is also kept by the store and merged into this one on
 * every device they play on (`dressing-sync.ts`), so the pick follows them.
 */
const KEY = 'hitman-dressing';

/** The same shape the store keeps, so the two can be merged without translating either. */
export type Dressing = SavedDressing;

const fresh = (): Dressing => ({ outfit: FREE_OUTFIT, bat: FREE_BAT, guard: FREE_GUARD, super10: null, pickedAt: 0, launch: null, seen: [], shown: [], visited: false });

export function readDressing(): Dressing {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    // A pick that is no longer on the shelves (or never was) goes back to the free ones, keeping the rest.
    const held = JSON.parse(raw) as Partial<Dressing>;
    return cleanDressing(held) ?? cleanDressing({ ...held, outfit: FREE_OUTFIT, bat: FREE_BAT }) ?? fresh();
  } catch {
    return fresh();
  }
}

/** Told of every write but a quiet one: how a change gets sent to the store. */
const listeners = new Set<(dressing: Dressing) => void>();
export function onDressingWrite(listener: (dressing: Dressing) => void) { listeners.add(listener); return () => listeners.delete(listener); }

/**
 * Keeps a copy. A change of kit, bat, guard or Super10 kit is stamped with the time it was made,
 * unless the copy already carries a time of its own — one merged in from the
 * store, whose time is the other device's. `quiet` keeps it from being sent
 * back: it is how a copy that came from the store is taken up.
 */
export function writeDressing(dressing: Dressing, { quiet = false } = {}) {
  const before = readDressing();
  const next = (dressing.outfit !== before.outfit || dressing.bat !== before.bat || dressing.guard !== before.guard || dressing.super10 !== before.super10) && dressing.pickedAt === before.pickedAt
    ? { ...dressing, pickedAt: Date.now() } : dressing;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* Worn for this visit only. */ }
  if (!quiet) for (const listener of listeners) listener(next);
}

/** The key an item is remembered under in `seen`: `kit:forest`, `bat:savage`. */
export const seenKey = (shelf: 'kit' | 'bat', id: string) => `${shelf}:${id}`;
