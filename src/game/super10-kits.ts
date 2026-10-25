import type { KitPrint } from '../entities/kitPrint';
import type { Super10GuardId } from '../entities/gloves';

/**
 * Super10's own kits, off the designer's sheets (Figma, the Super10 page's
 * Kits frame `524:616` and the cherry kit beside it `525:618`). In Super10 the
 * batter always bats in one of them, never a Dressing Room kit: the purple
 * one, everybody's from the first innings, and the neon and the cherry ones
 * once earned. The side in the field wears the cherry kit against either of
 * the first two, and the purple against the cherry; the LED stumps go the
 * other way, raspberry behind a purple or neon batter and violet behind a
 * cherry one.
 *
 * The designs are pictures made with an image model, so they are followed
 * for their colours and the lie of the bolts, not drawn stroke for stroke:
 * nothing on the helmet, and the fabric's weave left to the cloth's own.
 */
/**
 * Each kit is a team's, and named for it: Midnight Panthers (purple), Apex
 * Vipers (neon), Frontier Falcons (cherry); and, drawn and still to be built,
 * Aura Farmers (orange and navy), Nova Kings (butter yellow and navy) and
 * Royal Mavericks (violet and teal), Figma `532:625`.
 */
export const SUPER10_KIT_IDS = ['s10-purple', 's10-neon', 's10-cherry'] as const;
export type Super10KitId = typeof SUPER10_KIT_IDS[number];

export interface Super10Kit {
  id: Super10KitId;
  name: string;
  shirt: string; helmet: string; trousers: string;
  /** The collar, the cuffs and the shoe flash. */
  trim: string;
  number: string;
  /** The light the Dressing Room is lit in while it is on show. */
  glow: string;
  print: KitPrint;
  /** The cap the side in the field wears with it, where it is not the helmet's colour. */
  cap?: string;
  /** The gloves and pads that go with it. */
  guard: Super10GuardId;
  /** What the side in the field wears against it, and the colour of the LED stumps behind it. */
  against: Super10KitId;
  stumps: 'violet' | 'raspberry';
}

// Purple and cherry as the designer set them after a look at the first build, whose purple read too light.
const PURPLE = '#271473', LILAC = '#A447FF', LIME = '#B7FF3B', CHERRY = '#E92568', PALE = '#F3DDFF';

export const SUPER10_KITS: readonly Super10Kit[] = [
  {
    id: 's10-purple', name: 'Midnight Panthers', shirt: PURPLE, helmet: PURPLE, trousers: PURPLE, trim: LIME, number: LIME, glow: LILAC,
    print: {
      number: LIME,
      chest: [{ x: .03, y: .27, w: .13, h: .44, lean: 38, colour: LIME }, { x: -.07, y: .3, w: .08, h: .3, lean: 38, colour: LILAC }],
      back: [],
      collar: { colour: LIME, inner: LILAC },
      hem: { colour: LIME, line: LILAC },
      leg: [{ x: 0, y: .3, w: .14, h: .5, lean: 8, colour: LIME }, { x: -.035, y: .24, w: .08, h: .32, lean: 8, colour: LILAC }],
    },
    guard: 'super10', against: 's10-cherry', stumps: 'raspberry',
  },
  {
    id: 's10-neon', name: 'Apex Vipers', shirt: LIME, helmet: PURPLE, trousers: PURPLE, trim: PURPLE, number: PURPLE, glow: LIME,
    print: {
      number: PURPLE,
      chest: [{ x: .03, y: .27, w: .13, h: .44, lean: 38, colour: PURPLE }, { x: -.07, y: .3, w: .08, h: .3, lean: 38, colour: LILAC }],
      back: [],
      collar: { colour: PURPLE, inner: LILAC },
      hem: { colour: PURPLE, line: LILAC },
      sleeve: [{ x: 0, y: .05, w: .06, h: .14, lean: 20, colour: PURPLE }],
      leg: [{ x: 0, y: .3, w: .14, h: .5, lean: 8, colour: LIME }, { x: -.035, y: .24, w: .08, h: .32, lean: 8, colour: LILAC }],
    },
    guard: 'super10', against: 's10-cherry', stumps: 'raspberry',
  },
  {
    id: 's10-cherry', name: 'Frontier Falcons', shirt: CHERRY, helmet: PURPLE, trousers: CHERRY, trim: '#FFFFFF', number: PURPLE, glow: CHERRY,
    print: {
      number: PURPLE,
      chest: [{ x: .03, y: .27, w: .13, h: .44, lean: 38, colour: PURPLE }, { x: -.07, y: .3, w: .08, h: .3, lean: 38, colour: PALE }],
      back: [],
      collar: { colour: PURPLE, inner: '#FFFFFF' },
      hem: { colour: PURPLE, line: '#FFFFFF' },
      sleeve: [{ x: 0, y: .05, w: .06, h: .14, lean: 20, colour: PURPLE }],
      leg: [{ x: 0, y: .3, w: .14, h: .5, lean: 8, colour: PURPLE }, { x: -.035, y: .24, w: .08, h: .32, lean: 8, colour: PALE }],
    },
    cap: CHERRY, guard: 'super10-cherry', against: 's10-purple', stumps: 'violet',
  },
];

/**
 * The numbers on the five batters' backs, by how many are down: the opener
 * 10, then 17, 9, 23 and 77. Printed on whichever Super10 kit he wears, in
 * its print's `number` colour (lime on Purple, purple on Neon and Cherry),
 * where the back's bolt was.
 */
export const SUPER10_NUMBERS = ['10', '17', '9', '23', '77'] as const;
export const super10Number = (down: number) => SUPER10_NUMBERS[Math.min(Math.max(0, down), SUPER10_NUMBERS.length - 1)];

export const super10KitOf = (id: Super10KitId) => SUPER10_KITS.find(k => k.id === id)!;
