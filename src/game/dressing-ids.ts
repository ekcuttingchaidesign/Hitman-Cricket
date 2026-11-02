/**
 * The Dressing Room's ids alone, with nothing imported, so the server can
 * check what a Rival Match player says they wear without pulling in the
 * catalogue and the careers behind it (`dressing.ts` has the rest).
 */
export const OUTFIT_IDS = ['home', 'papaya', 'diwali', 'diwali-blue', 'diwali-ivory', 'diwali-green', 'diwali-yellow', 'crimson', 'forest', 'gold', 'violet', 'electric', 'lagoon'] as const;
export const BAT_IDS = ['plain', 'boom', 'rage', 'venom', 'lonewolf', 'meg', 'icecold', 'roar', 'savage', 'reign', 'inferno', 'hitman'] as const;
/** The guards — gloves and pads in one colourway — the one he is built wearing first (`src/entities/gloves.ts` has the designs). None is earned: every one is free to wear. */
export const GUARD_IDS = ['sterling', 'glacier', 'fern', 'evergreen', 'carbon', 'blaze', 'midnight', 'volt'] as const;
export type OutfitId = typeof OUTFIT_IDS[number];
export type BatId = typeof BAT_IDS[number];
export type GuardId = typeof GUARD_IDS[number];

/** What every player has from the start, here so the server knows them without the catalogue. */
export const FREE_OUTFIT: OutfitId = 'home';
/** Every kit that comes free: the one he is built in, Papaya, and the five Diwali kits while they are up. Never won, never celebrated. */
export const FREE_OUTFITS: readonly OutfitId[] = ['home', 'papaya', 'diwali', 'diwali-blue', 'diwali-ivory', 'diwali-green', 'diwali-yellow'];
/** The end of 11 November 2026 in India. */
const DIWALI_UNTIL = Date.UTC(2026, 10, 11, 18, 30);
/**
 * Kits on the shelf for a while only, and when they come off it: the Diwali
 * kits, Royal Anaar, Sky Shot, Kaju Katli, Sutli Bomb and Soan Papdi, free to everybody until the end of 11 November 2026 in India
 * (18:30 UTC). After that each is off the shelf, a pick of one is worn as
 * the free kit, and nobody bats in it; the id stays known, so a saved pick or a
 * Rival Match innings batted in it still reads.
 */
export const LIMITED_UNTIL: Partial<Record<OutfitId, number>> = { diwali: DIWALI_UNTIL, 'diwali-blue': DIWALI_UNTIL, 'diwali-ivory': DIWALI_UNTIL, 'diwali-green': DIWALI_UNTIL, 'diwali-yellow': DIWALI_UNTIL };
/** Whether a kit is on the shelf at `now`: always, but for a limited one past its time. */
export const onShelf = (id: OutfitId, now = Date.now()) => !(LIMITED_UNTIL[id] !== undefined && now >= LIMITED_UNTIL[id]!);
export const FREE_BAT: BatId = 'plain';
export const FREE_GUARD: GuardId = 'sterling';

export const isOutfit = (id: unknown): id is OutfitId => typeof id === 'string' && (OUTFIT_IDS as readonly string[]).includes(id);
export const isBat = (id: unknown): id is BatId => typeof id === 'string' && (BAT_IDS as readonly string[]).includes(id);
export const isGuard = (id: unknown): id is GuardId => typeof id === 'string' && (GUARD_IDS as readonly string[]).includes(id);

/** What a player wears and holds, as it travels with their innings in a Rival Match. */
export interface Look { kit: OutfitId; bat: BatId; guard: GuardId }

/**
 * A look as sent, or null if it names anything that is not on the shelves. A
 * look with no guard named is from before there were any to choose, and
 * wears the free one.
 */
export function lookOf(raw: unknown): Look | null {
  if (!raw || typeof raw !== 'object') return null;
  const { kit, bat, guard } = raw as Record<string, unknown>;
  if (!isOutfit(kit) || !isBat(bat)) return null;
  if (guard !== undefined && !isGuard(guard)) return null;
  return { kit, bat, guard: isGuard(guard) ? guard : FREE_GUARD };
}
