/**
 * The Dressing Room's ids alone, with nothing imported, so the server can
 * check what a Rival Match player says they wear without pulling in the
 * catalogue and the careers behind it (`dressing.ts` has the rest).
 */
export const OUTFIT_IDS = ['home', 'papaya', 'crimson', 'forest', 'gold', 'violet', 'electric', 'lagoon'] as const;
export const BAT_IDS = ['plain', 'boom', 'rage', 'venom', 'lonewolf', 'meg', 'icecold', 'roar', 'savage', 'reign', 'inferno', 'hitman'] as const;
/** The guards — gloves and pads in one colourway — the one he is built wearing first (`src/entities/gloves.ts` has the designs). None is earned: every one is free to wear. */
export const GUARD_IDS = ['sterling', 'glacier', 'fern', 'evergreen', 'carbon', 'blaze', 'midnight'] as const;
export type OutfitId = typeof OUTFIT_IDS[number];
export type BatId = typeof BAT_IDS[number];
export type GuardId = typeof GUARD_IDS[number];

/** What every player has from the start, here so the server knows them without the catalogue. */
export const FREE_OUTFIT: OutfitId = 'home';
/** Every kit that comes free: the one he is built in, and Papaya. Never won, never celebrated. */
export const FREE_OUTFITS: readonly OutfitId[] = ['home', 'papaya'];
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
