import type { KitPrint } from '../entities/kitPrint';
import type { Super10GuardId } from '../entities/gloves';

/**
 * Super10's own kits, each a team's, off the designer's sheets (Figma, the
 * Super10 page: `524:616` and `525:618`, then `532:625`). In Super10 the batter
 * always bats in one of them, never a Dressing Room kit: Midnight Panthers,
 * everybody's from the first innings, and the rest once earned, in this order
 * up the ladder: Apex Vipers, Nova Kings, Frontier Falcons, Aura Farmers and,
 * at the top, Royal Mavericks (`SUPER10_KITS` runs easiest to hardest). The
 * side in the field wears any of the others, drawn afresh each innings
 * (`GameScene.dressBatter`). The LED stumps behind him are raspberry where his
 * trousers are navy and violet otherwise.
 *
 * The designs are pictures made with an image model, so they are followed
 * for their colours and the lie of the bolts, not drawn stroke for stroke:
 * nothing on the helmet, the back's bolt given over to his number, and the
 * fabric's weave left to the cloth's own. Their palettes' printed hex codes
 * do not always match their swatches; the swatches are what is taken.
 */
export const SUPER10_KIT_IDS = ['s10-purple', 's10-neon', 's10-yellow', 's10-cherry', 's10-orange', 's10-violet'] as const;
export type Super10KitId = typeof SUPER10_KIT_IDS[number];

export interface Super10Kit {
  id: Super10KitId;
  /** The team's name. */
  name: string;
  shirt: string; helmet: string; trousers: string;
  /** The collar, the cuffs and the shoe flash. */
  trim: string;
  number: string;
  /** The light the Dressing Room is lit in while it is on show. */
  glow: string;
  print: KitPrint;
  /** The cap the side in the field wears in it, where it is not the helmet's colour. */
  cap?: string;
  /** The gloves and pads that go with it. */
  guard: Super10GuardId;
  /** The LED stumps behind him: raspberry behind navy trousers, violet otherwise. */
  stumps: 'violet' | 'raspberry';
}

/**
 * What a Super10 kit takes, counted over the player's Super10 innings, every
 * score a team total (all five batters' runs, as the scoreboard shows them):
 * finished innings, sixes, runs, innings of a hundred or more, and the best
 * innings. Each figure given must be reached.
 */
export interface Super10Target { innings?: number; sixes?: number; runs?: number; hundreds?: number; best?: number }

/**
 * The ladder, agreed with the designer, easiest first: Midnight Panthers free;
 * Apex Vipers for 10 innings; Nova Kings for 50 sixes and 1,500 runs; Frontier
 * Falcons for 10 innings of 100 or more; Aura Farmers for 5,000 runs; Royal
 * Mavericks for an innings of 200 or more and 10,000 runs. All in Super10, and
 * all team totals: one batter's 200 would ask him to bat out the ten overs.
 */
export const SUPER10_LADDER: Record<Super10KitId, Super10Target | null> = {
  's10-purple': null,
  's10-neon': { innings: 10 },
  's10-yellow': { sixes: 50, runs: 1500 },
  's10-cherry': { hundreds: 10 },
  's10-orange': { runs: 5000 },
  's10-violet': { best: 200, runs: 10000 },
};

// Purple and cherry as the designer set them after a look at the first build, whose purple read too light.
const PURPLE = '#271473', LILAC = '#A447FF', LIME = '#B7FF3B', CHERRY = '#E92568', PALE = '#F3DDFF';
const NAVY = '#0B1A36', WHITE = '#FFFFFF', ROYAL = '#112E80';
const ORANGE = '#FE7701', BUTTER = '#FDE17A', GOLD = '#EDC562', VIOLET = '#E78CFF', TEAL = '#178C89';

/** The chest's two bolts, a main one and a smaller one beside it, and the leg's, in two colours. */
const chest = (main: string, second: string) => [{ x: .03, y: .27, w: .13, h: .44, lean: 38, colour: main }, { x: -.07, y: .3, w: .08, h: .3, lean: 38, colour: second }];
const leg = (main: string, second: string) => [{ x: 0, y: .3, w: .14, h: .5, lean: 8, colour: main }, { x: -.035, y: .24, w: .08, h: .32, lean: 8, colour: second }];
const sleeve = (colour: string) => [{ x: 0, y: .05, w: .06, h: .14, lean: 20, colour }];

export const SUPER10_KITS: readonly Super10Kit[] = [
  {
    id: 's10-purple', name: 'Midnight Panthers', shirt: PURPLE, helmet: PURPLE, trousers: PURPLE, trim: LIME, number: LIME, glow: LILAC,
    print: { number: LIME, chest: chest(LIME, LILAC), back: [], collar: { colour: LIME, inner: LILAC }, hem: { colour: LIME, line: LILAC }, leg: leg(LIME, LILAC) },
    guard: 'super10', stumps: 'violet',
  },
  {
    id: 's10-neon', name: 'Apex Vipers', shirt: LIME, helmet: PURPLE, trousers: PURPLE, trim: PURPLE, number: PURPLE, glow: LIME,
    print: { number: PURPLE, chest: chest(PURPLE, LILAC), back: [], collar: { colour: PURPLE, inner: LILAC }, hem: { colour: PURPLE, line: LILAC }, sleeve: sleeve(PURPLE), leg: leg(LIME, LILAC) },
    guard: 'super10', stumps: 'violet',
  },
  {
    id: 's10-yellow', name: 'Nova Kings', shirt: BUTTER, helmet: ROYAL, trousers: ROYAL, trim: NAVY, number: NAVY, glow: GOLD,
    print: { number: NAVY, chest: chest(NAVY, WHITE), back: [], collar: { colour: NAVY, inner: WHITE }, hem: { colour: NAVY, line: WHITE }, sleeve: sleeve(NAVY), leg: leg(BUTTER, WHITE) },
    guard: 'super10-yellow', stumps: 'raspberry',
  },
  {
    id: 's10-cherry', name: 'Frontier Falcons', shirt: CHERRY, helmet: PURPLE, trousers: CHERRY, trim: WHITE, number: PURPLE, glow: CHERRY,
    print: { number: PURPLE, chest: chest(PURPLE, PALE), back: [], collar: { colour: PURPLE, inner: WHITE }, hem: { colour: PURPLE, line: WHITE }, sleeve: sleeve(PURPLE), leg: leg(PURPLE, PALE) },
    cap: CHERRY, guard: 'super10-cherry', stumps: 'violet',
  },
  {
    id: 's10-orange', name: 'Aura Farmers', shirt: ORANGE, helmet: NAVY, trousers: NAVY, trim: NAVY, number: NAVY, glow: ORANGE,
    print: { number: NAVY, chest: chest(NAVY, WHITE), back: [], collar: { colour: NAVY, inner: WHITE }, hem: { colour: NAVY, line: WHITE }, sleeve: sleeve(NAVY), leg: leg(ORANGE, WHITE) },
    guard: 'super10-orange', stumps: 'raspberry',
  },
  {
    id: 's10-violet', name: 'Royal Mavericks', shirt: VIOLET, helmet: TEAL, trousers: VIOLET, trim: TEAL, number: WHITE, glow: VIOLET,
    print: { number: WHITE, chest: chest(TEAL, WHITE), back: [], collar: { colour: TEAL, inner: WHITE }, hem: { colour: TEAL, line: WHITE }, sleeve: sleeve(TEAL), leg: leg(TEAL, WHITE) },
    guard: 'super10-violet', stumps: 'violet',
  },
];

/**
 * The numbers on the five batters' backs, by how many are down: the opener
 * 10, then 17, 9, 23 and 77. Printed on whichever Super10 kit he wears, in
 * its print's `number` colour (lime on the Panthers, purple on the Vipers
 * and the Falcons, navy on the Kings and the Farmers, white on the Mavericks),
 * where the back's bolt was.
 */
export const SUPER10_NUMBERS = ['10', '17', '9', '23', '77'] as const;
export const super10Number = (down: number) => SUPER10_NUMBERS[Math.min(Math.max(0, down), SUPER10_NUMBERS.length - 1)];

