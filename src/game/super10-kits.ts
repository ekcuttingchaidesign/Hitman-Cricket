import type { KitPrint, Mark } from '../entities/kitPrint';
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
const PURPLE = '#271473', LILAC = '#A447FF', LIME = '#B7FF3B', CHERRY = '#E92568';
const NAVY = '#0B1A36', WHITE = '#FFFFFF', ROYAL = '#112E80';
const ORANGE = '#FE7701', BUTTER = '#FDE17A', GOLD = '#EDC562', VIOLET = '#E78CFF', TEAL = '#178C89';

/** The lightning, the Panthers' alone, the first team's mark: the chest's two bolts, a main one and a smaller one beside it, and the leg's, in two colours. */
const chest = (main: string, second: string): Mark[] => [{ x: .03, y: .27, w: .13, h: .44, lean: 38, colour: main }, { x: -.07, y: .3, w: .08, h: .3, lean: 38, colour: second }];
const leg = (main: string, second: string): Mark[] => [{ x: 0, y: .3, w: .14, h: .5, lean: 8, colour: main }, { x: -.035, y: .24, w: .08, h: .32, lean: 8, colour: second }];

/**
 * The other four teams each have a pattern of their own, from their names,
 * kept to a few bold shapes so it reads on a batter a few hundred pixels tall.
 *
 * Nova Kings, a star flaring up: a big four-pointed star on the chest, blue
 * with a white heart, two small ones beside it, and a yellow stripe down each
 * leg ending in a star at the knee.
 */
const novaChest: Mark[] = [
  { shape: 'star', x: .03, y: .29, w: .29, h: .29, lean: 0, colour: ROYAL },
  { shape: 'star', x: .03, y: .29, w: .09, h: .09, lean: 0, colour: WHITE },
  { shape: 'star', x: -.1, y: .41, w: .08, h: .08, lean: 0, colour: ROYAL },
  { shape: 'star', x: .14, y: .15, w: .06, h: .06, lean: 0, colour: ROYAL },
];
const novaLeg: Mark[] = [
  { shape: 'bar', x: 0, y: .3, w: .045, h: .5, lean: 0, colour: BUTTER },
  { shape: 'star', x: 0, y: .6, w: .1, h: .1, lean: 0, colour: BUTTER },
];
/** Frontier Falcons, wings: three stacked V's across the chest, a falcon's spread wings, purple, white and purple, and two small ones down each leg. */
const falconChest: Mark[] = [
  { shape: 'chevron', x: 0, y: .36, w: .32, h: .13, lean: 0, colour: PURPLE, thick: .2 },
  { shape: 'chevron', x: 0, y: .3, w: .32, h: .13, lean: 0, colour: WHITE, thick: .2 },
  { shape: 'chevron', x: 0, y: .24, w: .32, h: .13, lean: 0, colour: PURPLE, thick: .2 },
];
const falconLeg: Mark[] = [
  { shape: 'chevron', x: 0, y: .34, w: .12, h: .06, lean: 0, colour: PURPLE, thick: .3 },
  { shape: 'chevron', x: 0, y: .41, w: .12, h: .06, lean: 0, colour: WHITE, thick: .3 },
];
/** Aura Farmers, a glow spreading out: three arcs from the right shoulder across the chest, navy fading to white, and two orange stripes down each leg. */
const auraChest: Mark[] = [
  { shape: 'ring', x: .16, y: .52, w: .16, h: .05, lean: 0, from: 180, sweep: 90, colour: NAVY },
  { shape: 'ring', x: .16, y: .52, w: .27, h: .042, lean: 0, from: 180, sweep: 90, colour: '#0B1A3699' },
  { shape: 'ring', x: .16, y: .52, w: .38, h: .034, lean: 0, from: 180, sweep: 90, colour: WHITE },
];
const auraLeg: Mark[] = [
  { shape: 'bar', x: -.026, y: .32, w: .022, h: .56, lean: 0, colour: ORANGE },
  { shape: 'bar', x: .026, y: .32, w: .022, h: .56, lean: 0, colour: ORANGE },
];
/** Royal Mavericks, a royal sash: a wide teal band from the left shoulder to the right hip, edged in white, and a teal stripe with a white line down each leg. */
const sashChest: Mark[] = [
  { shape: 'bar', x: 0, y: .26, w: .125, h: .7, lean: -40, colour: WHITE },
  { shape: 'bar', x: 0, y: .26, w: .095, h: .7, lean: -40, colour: TEAL },
];
const sashLeg: Mark[] = [
  { shape: 'bar', x: 0, y: .32, w: .035, h: .56, lean: 0, colour: TEAL },
  { shape: 'bar', x: .028, y: .32, w: .01, h: .56, lean: 0, colour: WHITE },
];
/** Apex Vipers, a diamondback: a chain of purple diamonds across the chest the way a viper's back is marked, and a lime chain down each leg. */
const chain = (x: number, y: number, lean: number, count: number, step: number, w: number, h: number, colour: string): Mark[] =>
  Array.from({ length: count }, (_, i) => {
    const along = (i - (count - 1) / 2) * step, turn = lean * Math.PI / 180;
    // Each diamond stands upright whichever way the chain runs: tilted with it, they read as squares.
    return { shape: 'diamond' as const, x: x + along * Math.sin(turn), y: y + along * Math.cos(turn), w, h, lean: 0, colour };
  });
const viperChest: Mark[] = chain(0, .25, -40, 5, .105, .085, .15, PURPLE);
const viperLeg: Mark[] = chain(0, .4, 0, 5, .1, .06, .09, LIME);

export const SUPER10_KITS: readonly Super10Kit[] = [
  {
    id: 's10-purple', name: 'Midnight Panthers', shirt: PURPLE, helmet: PURPLE, trousers: PURPLE, trim: LIME, number: LIME, glow: LILAC,
    print: { number: LIME, chest: chest(LIME, LILAC), back: [], collar: { colour: LIME, inner: LILAC }, hem: { colour: LIME, line: LILAC }, leg: leg(LIME, LILAC) },
    guard: 'super10', stumps: 'violet',
  },
  {
    id: 's10-neon', name: 'Apex Vipers', shirt: LIME, helmet: PURPLE, trousers: PURPLE, trim: PURPLE, number: PURPLE, glow: LIME,
    print: { number: PURPLE, chest: viperChest, back: [], collar: { colour: PURPLE, inner: LILAC }, hem: { colour: PURPLE, line: LILAC }, leg: viperLeg },
    guard: 'super10', stumps: 'violet',
  },
  {
    id: 's10-yellow', name: 'Nova Kings', shirt: BUTTER, helmet: ROYAL, trousers: ROYAL, trim: NAVY, number: NAVY, glow: GOLD,
    print: { number: NAVY, chest: novaChest, back: [], collar: { colour: NAVY, inner: WHITE }, hem: { colour: NAVY, line: WHITE }, leg: novaLeg },
    guard: 'super10-yellow', stumps: 'raspberry',
  },
  {
    id: 's10-cherry', name: 'Frontier Falcons', shirt: CHERRY, helmet: PURPLE, trousers: CHERRY, trim: WHITE, number: PURPLE, glow: CHERRY,
    print: { number: PURPLE, chest: falconChest, back: [], collar: { colour: PURPLE, inner: WHITE }, hem: { colour: PURPLE, line: WHITE }, leg: falconLeg },
    cap: CHERRY, guard: 'super10-cherry', stumps: 'violet',
  },
  {
    id: 's10-orange', name: 'Aura Farmers', shirt: ORANGE, helmet: NAVY, trousers: NAVY, trim: NAVY, number: NAVY, glow: ORANGE,
    print: { number: NAVY, chest: auraChest, back: [], collar: { colour: NAVY, inner: WHITE }, hem: { colour: NAVY, line: WHITE }, leg: auraLeg },
    guard: 'super10-orange', stumps: 'raspberry',
  },
  {
    id: 's10-violet', name: 'Royal Mavericks', shirt: VIOLET, helmet: TEAL, trousers: VIOLET, trim: TEAL, number: WHITE, glow: VIOLET,
    print: { number: WHITE, chest: sashChest, back: [], collar: { colour: TEAL, inner: WHITE }, hem: { colour: TEAL, line: WHITE }, leg: sashLeg },
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

