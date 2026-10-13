import { BAT_IDS, OUTFIT_IDS, isBat, isOutfit, type BatId, type OutfitId } from './dressing-ids.js';

/**
 * The Dressing Room as it travels between a player's devices, and the one rule
 * for putting two copies of it together.
 *
 * It is the browser's own record (`dressing-store.ts`) less nothing: what the
 * player wears and holds and when they last chose it, which unlocks they have
 * already been shown, each mode's figure when the room arrived, and whether
 * the room has been opened. The browser and the store both merge with
 * `mergeDressing`, so whichever of them does it, two devices end up agreeing.
 *
 * Nothing here is the record of what is earned — that is worked out from the
 * careers, which travel on their own. Lose this and a player loses their pick
 * and sees an unlock twice; nothing they have earned.
 */
export interface Figures { classic: number; survive: number; marathon: number }

export interface SavedDressing {
  outfit: OutfitId;
  bat: BatId;
  /** When the pick was last changed, by the clock of the device that changed it: the later pick wins. */
  pickedAt: number;
  launch: Figures | null;
  /** Unlocks known to be earned: what the end of an innings has no need to celebrate again. */
  seen: string[];
  /**
   * Unlocks whose moment has played. One seen and not shown — earned before the
   * room arrived — waits in the room for its key, as Boom does (`ready`).
   */
  shown: string[];
  visited: boolean;
}

/** Shown before there was a record of it: Boom's key and the free pair are the only moments the first release played for history. */
const SHOWN_BEFORE = new Set(['bat:boom', 'kit:home', 'bat:plain']);

const KNOWN = new Set<string>([...OUTFIT_IDS.map(id => `kit:${id}`), ...BAT_IDS.map(id => `bat:${id}`)]);
const figure = (value: unknown) => { const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : 0; };

/** A copy as sent or as stored, or null if it is not one: an unknown kit or bat refuses the lot. */
export function cleanDressing(raw: unknown): SavedDressing | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const held = raw as Record<string, unknown>;
  if (!isOutfit(held.outfit) || !isBat(held.bat)) return null;
  const launch = held.launch && typeof held.launch === 'object'
    ? { classic: figure((held.launch as Figures).classic), survive: figure((held.launch as Figures).survive), marathon: figure((held.launch as Figures).marathon) }
    : null;
  const keys = (list: unknown) => Array.isArray(list) ? [...new Set(list.filter((one): one is string => typeof one === 'string' && KNOWN.has(one)))] : [];
  const seen = keys(held.seen);
  // A copy from before `shown` was kept: everything its seen list took in
  // silently, a career's worth earned before the room, has never had its moment.
  const shown = Array.isArray(held.shown) ? keys(held.shown) : seen.filter(one => SHOWN_BEFORE.has(one));
  return { outfit: held.outfit, bat: held.bat, pickedAt: figure(held.pickedAt), launch, seen, shown, visited: held.visited === true };
}

/**
 * Two copies made one. The later pick wins whole — a kit from one device and
 * a bat from another would be a look nobody chose. Every unlock either has
 * been shown stays shown, the room once opened stays opened, and where both
 * noted the figures the room arrived at, the lower of each is kept: the
 * earlier of the two, so play between them is not counted twice towards "a
 * quarter more since".
 */
export function mergeDressing(held: SavedDressing | null, incoming: SavedDressing): SavedDressing {
  if (!held) return incoming;
  const pick = incoming.pickedAt >= held.pickedAt ? incoming : held;
  const launch = held.launch && incoming.launch
    ? { classic: Math.min(held.launch.classic, incoming.launch.classic), survive: Math.min(held.launch.survive, incoming.launch.survive), marathon: Math.min(held.launch.marathon, incoming.launch.marathon) }
    : held.launch ?? incoming.launch;
  return {
    outfit: pick.outfit, bat: pick.bat, pickedAt: pick.pickedAt, launch,
    seen: [...new Set([...held.seen, ...incoming.seen])],
    shown: [...new Set([...held.shown, ...incoming.shown])],
    visited: held.visited || incoming.visited,
  };
}

/** Whether two copies say the same thing, so an answer that changes nothing is not written back. */
export function sameDressing(a: SavedDressing | null, b: SavedDressing | null) {
  if (!a || !b) return a === b;
  return a.outfit === b.outfit && a.bat === b.bat && a.pickedAt === b.pickedAt && a.visited === b.visited
    && JSON.stringify(a.launch) === JSON.stringify(b.launch)
    && a.seen.length === b.seen.length && a.seen.every(one => b.seen.includes(one))
    && a.shown.length === b.shown.length && a.shown.every(one => b.shown.includes(one));
}
