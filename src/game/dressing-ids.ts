/**
 * The Dressing Room's ids alone, with nothing imported, so the server can
 * check what a Rival Match player says they wear without pulling in the
 * catalogue and the careers behind it (`dressing.ts` has the rest).
 */
export const OUTFIT_IDS = ['home', 'crimson', 'forest', 'gold', 'violet', 'electric', 'lagoon'] as const;
export const BAT_IDS = ['plain', 'boom', 'rage', 'venom', 'lonewolf', 'meg', 'icecold', 'roar', 'savage', 'reign', 'inferno', 'hitman'] as const;
/** The gloves, the pair he is built wearing first (`src/entities/gloves.ts` has the designs). None is earned: every pair is free to wear. */
export const GLOVE_IDS = ['sterling', 'glacier', 'fern', 'carbon', 'blaze', 'midnight'] as const;
export type OutfitId = typeof OUTFIT_IDS[number];
export type BatId = typeof BAT_IDS[number];
export type GloveId = typeof GLOVE_IDS[number];

/** What every player has from the start, here so the server knows them without the catalogue. */
export const FREE_OUTFIT: OutfitId = 'home';
export const FREE_BAT: BatId = 'plain';
export const FREE_GLOVES: GloveId = 'sterling';

export const isOutfit = (id: unknown): id is OutfitId => typeof id === 'string' && (OUTFIT_IDS as readonly string[]).includes(id);
export const isBat = (id: unknown): id is BatId => typeof id === 'string' && (BAT_IDS as readonly string[]).includes(id);
export const isGloves = (id: unknown): id is GloveId => typeof id === 'string' && (GLOVE_IDS as readonly string[]).includes(id);

/** What a player wears and holds, as it travels with their innings in a Rival Match. */
export interface Look { kit: OutfitId; bat: BatId; gloves: GloveId }

/**
 * A look as sent, or null if it names anything that is not on the shelves. A
 * look with no gloves named is from before there were any to choose, and
 * wears the free pair.
 */
export function lookOf(raw: unknown): Look | null {
  if (!raw || typeof raw !== 'object') return null;
  const { kit, bat, gloves } = raw as Record<string, unknown>;
  if (!isOutfit(kit) || !isBat(bat)) return null;
  if (gloves !== undefined && !isGloves(gloves)) return null;
  return { kit, bat, gloves: isGloves(gloves) ? gloves : FREE_GLOVES };
}
