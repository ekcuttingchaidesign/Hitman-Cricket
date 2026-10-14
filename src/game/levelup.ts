import type { CareerMode } from './career';
import { TIERS, type Tier } from './tier';

/**
 * Level Up: the screen an innings ends on when it carried a career onto a new
 * rung (`climbedTo`), before the innings card underneath it.
 *
 * What is here is the choreography as figures, kept apart from the drawing
 * (`src/ui/LevelUp.ts`) so the one rule worth holding to a test can be: each
 * rung is a bigger occasion than the one below it.
 *
 * One thing in a deep room: the card, floating and leaning in 3D space, in
 * front of the innings card's chevrons cast in the rung's metal and rising
 * into fog (`src/scene/LevelUpStage.ts`). They rush up past the camera to
 * uncover LEVEL UP, then drift; the near ones keep to the sides, so the
 * words are never read through a bright shape. What climbs is everything
 * round that: more chevrons in the room, a longer held breath before the
 * turn, a stronger lean in the card's hover, streaks, glints on the card's
 * corners and dust of the metal from STAR, a ring going out from the card
 * (two for HITMAN), a firmer flash, and for HITMAN alone a small shake and a
 * second cheer. A bronze moment that spent everything the gold one does
 * would leave the top of the ladder nothing to be.
 *
 * The chevrons are the innings card's (`BAND_CHEVRONS` in the HUD), stood on
 * end: the same shape that runs on the total's band, rising.
 */
export interface LevelUpFx {
  /** The ticks in the hand as the chevrons rush up and uncover LEVEL UP. */
  lift: number;
  /** The chevrons in the room behind the card. */
  chevrons: number;
  /** How far the card leans as it hovers, in degrees. */
  hover: number;
  /** How long the old card is held before it turns, after it has risen. ms. */
  hold: number;
  /** How long the seam takes to climb the card. ms. */
  morph: number;
  /** The streaks that fly off the card as it turns. */
  streaks: number;
  /** Glints that twinkle on the card's corners once it has turned. */
  glints: number;
  /** Dust of the metal hanging in the room, out of focus: eight motes a unit. */
  dust: number;
  /** Rings going out from the card as it turns. */
  rings: number;
  /** How bright the flash round the card is at the turn, nought to one. */
  flash: number;
  /** How far the screen shakes at the turn, in design pixels; nought for none. */
  shake: number;
  /** The cheer the crowd gives it, by size. */
  cheer: 'mid' | 'big' | null;
  /** A second cheer a beat later, for the rung the game is named for. */
  encore: boolean;
}

/** By rung. DEBUTANT is never climbed to (everybody starts there), so it is the floor and is never played. */
const FX: Record<string, LevelUpFx> = {
  debutant: { lift: 2, chevrons: 16, hover: 5, hold: 500, morph: 520, streaks: 8, glints: 0, dust: 0, rings: 0, flash: .3, shake: 0, cheer: null, encore: false },
  emerging: { lift: 3, chevrons: 22, hover: 7, hold: 600, morph: 620, streaks: 10, glints: 0, dust: 0, rings: 0, flash: .4, shake: 0, cheer: 'mid', encore: false },
  star: { lift: 3, chevrons: 32, hover: 9, hold: 750, morph: 760, streaks: 14, glints: 4, dust: 10, rings: 1, flash: .5, shake: 0, cheer: 'big', encore: false },
  hitman: { lift: 3, chevrons: 44, hover: 11, hold: 900, morph: 880, streaks: 18, glints: 6, dust: 16, rings: 2, flash: .6, shake: 4, cheer: 'big', encore: true },
};

export function levelUpFx(tier: Pick<Tier, 'key'>): LevelUpFx {
  return FX[tier.key] ?? FX.emerging;
}

/**
 * The tier's metal as the arrows and the bits are drawn in: the colour, a
 * lighter cast for the edge that catches the light, and a deeper one for the
 * shadow side. Read off the ladder's own palette so a tier added later has a
 * moment in its own metal without an edit here.
 */
export function levelUpMetal(tier: Tier): { base: string; light: string; deep: string } {
  const deep: Record<string, string> = { debutant: '#2b4c78', emerging: '#7a4a22', star: '#6d7680', hitman: '#9a7322' };
  return { base: tier.theme.accent, light: tier.theme.sheen, deep: deep[tier.key] ?? tier.theme.accent };
}

/**
 * When the screen does what, in ms from its start. Everything after the card
 * rises waits on the tier's `hold`, so a bigger rung is a longer breath.
 */
export interface LevelUpBeats {
  /** The great chevrons have swept past and LEVEL UP is uncovered. */
  word: number;
  /** The old card has risen into the middle. */
  card: number;
  /** The seam starts up the card. */
  turn: number;
  /** The seam is over the top: the new card stands, the flash, the burst. */
  turned: number;
  /** The tier's name and the line under it. */
  named: number;
  /** The two keys. */
  ready: number;
}

/** The chevrons rise one after another, this far apart, the last over LEVEL UP as it pops. ms. */
export const LIFT_GAP = 120;

export function levelUpBeats(fx: LevelUpFx): LevelUpBeats {
  const word = 650, card = word + 450, turn = card + fx.hold, turned = turn + fx.morph;
  return { word, card, turn, turned, named: turned + 350, ready: turned + 900 };
}

/**
 * The buzz in the hand, as `navigator.vibrate` patterns at a beat each: a
 * tick for each chevron as it rises past the word, a thump as the seam starts up
 * the card, and the burst at the turn — longer and more of it up the ladder.
 */
export function levelUpHaptics(fx: LevelUpFx, beats: LevelUpBeats): { at: number; pattern: number[] }[] {
  const out: { at: number; pattern: number[] }[] = [];
  for (let i = 0; i < fx.lift; i++) out.push({ at: Math.round(beats.word - (fx.lift - 1 - i) * LIFT_GAP), pattern: [8] });
  out.push({ at: beats.turn, pattern: [14] });
  const burst: Record<number, number[]> = { 0: [30], 1: [40, 50, 30], 2: [60, 40, 40, 40, 90], 3: [70, 40, 50, 40, 70, 60, 140] };
  const rung = fx.shake ? 3 : fx.rings ? 2 : fx.cheer ? 1 : 0;
  out.push({ at: beats.turned, pattern: burst[rung] });
  return out;
}

/** What the screen says, from the rung reached and the career as it now stands. */
export interface LevelUpWords {
  /** The word the arrows uncover. */
  word: string;
  /** The small line over the rung's name: what kind of moment this is. */
  kicker: string;
  /** The rung, as big as the screen will take. */
  title: string;
  /** The ladder's one line for it. */
  line: string;
  /** What is next: the gap to the rung above, or the top. */
  next: string;
  /** The whole of it as one sentence, for a screen reader. */
  label: string;
}

const MODE_NAMES: Record<CareerMode, string> = { classic: 'The Blast', survive: 'Test Survival', marathon: 'Test Marathon' };

export function levelUpWords(mode: CareerMode, tier: Tier, next: string): LevelUpWords {
  const rung = TIERS.findIndex(one => one.key === tier.key);
  return {
    word: 'LEVEL UP',
    kicker: rung === TIERS.length - 1 ? `Top of the ladder · ${MODE_NAMES[mode]}` : `New tier · ${MODE_NAMES[mode]}`,
    title: tier.name,
    line: tier.blurb,
    next,
    label: `Level up. You are now ${tier.name} in ${MODE_NAMES[mode]}. ${tier.blurb} ${next}`,
  };
}
