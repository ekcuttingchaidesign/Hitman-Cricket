/**
 * The Dressing Room's ids alone, with nothing imported, so the server can
 * check what a Rival Match player says they wear without pulling in the
 * catalogue and the careers behind it (`dressing.ts` has the rest).
 */
export const OUTFIT_IDS = ['home', 'crimson', 'forest', 'gold', 'violet', 'electric', 'lagoon'] as const;
export const BAT_IDS = ['plain', 'boom', 'rage', 'venom', 'lonewolf', 'meg', 'icecold', 'roar', 'savage', 'reign', 'inferno', 'hitman'] as const;
export type OutfitId = typeof OUTFIT_IDS[number];
export type BatId = typeof BAT_IDS[number];

export const isOutfit = (id: unknown): id is OutfitId => typeof id === 'string' && (OUTFIT_IDS as readonly string[]).includes(id);
export const isBat = (id: unknown): id is BatId => typeof id === 'string' && (BAT_IDS as readonly string[]).includes(id);

/** What a player wears and holds, as it travels with their innings in a Rival Match. */
export interface Look { kit: OutfitId; bat: BatId }

/** A look as sent, or null if it names anything that is not on the shelves. */
export function lookOf(raw: unknown): Look | null {
  if (!raw || typeof raw !== 'object') return null;
  const { kit, bat } = raw as Record<string, unknown>;
  return isOutfit(kit) && isBat(bat) ? { kit, bat } : null;
}
