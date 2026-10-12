import type { CareerMode } from './career';
import { FREE_BAT, FREE_OUTFIT, isBat, isOutfit, type BatId, type OutfitId } from './dressing';

/**
 * What this browser remembers of the Dressing Room: what the player wears and
 * holds, where each mode's figure stood when the room arrived, and which
 * unlocks have already been shown to them.
 *
 * None of it is the record. What is earned is worked out from the career every
 * time (`dressing.ts`), so clearing this costs a player their pick and nothing
 * they have earned; the pick also travels with their Rival Match innings.
 */
const KEY = 'hitman-dressing';

export interface Dressing {
  outfit: OutfitId;
  bat: BatId;
  /** Each mode's tier figure the first time this browser saw the room; see `DressingRecord.launch`. */
  launch: Record<CareerMode, number> | null;
  /** Everything the player has been shown as theirs, so an unlock is celebrated once. */
  seen: string[];
}

const fresh = (): Dressing => ({ outfit: FREE_OUTFIT, bat: FREE_BAT, launch: null, seen: [] });

export function readDressing(): Dressing {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const held = JSON.parse(raw) as Partial<Dressing>;
    const launch = held.launch && typeof held.launch === 'object'
      ? { classic: Number(held.launch.classic) || 0, survive: Number(held.launch.survive) || 0, marathon: Number(held.launch.marathon) || 0 }
      : null;
    return {
      outfit: isOutfit(held.outfit) ? held.outfit : FREE_OUTFIT,
      bat: isBat(held.bat) ? held.bat : FREE_BAT,
      launch,
      seen: Array.isArray(held.seen) ? held.seen.filter((s): s is string => typeof s === 'string') : [],
    };
  } catch {
    return fresh();
  }
}

export function writeDressing(dressing: Dressing) {
  try { localStorage.setItem(KEY, JSON.stringify(dressing)); } catch { /* Worn for this visit only. */ }
}

/** The key an item is remembered under in `seen`: `kit:forest`, `bat:savage`. */
export const seenKey = (shelf: 'kit' | 'bat', id: string) => `${shelf}:${id}`;
