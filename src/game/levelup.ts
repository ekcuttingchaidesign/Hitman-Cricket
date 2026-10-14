import type { CareerMode } from './career';
import { TIERS, type Tier } from './tier';

/**
 * Level Up: the screen an innings ends on when it carried a career onto a new
 * rung (`climbedTo`), before the innings card underneath it.
 *
 * What is here is the choreography as figures, kept apart from the drawing
 * (`src/ui/LevelUp.ts`) so the one rule worth holding to a test can be: each
 * rung is a bigger occasion than the one below it. The ladder already climbs
 * in its materials — navy, bronze, black and silver, black and gold — and the
 * moment of reaching a rung climbs with it: more arrows and faster, a longer
 * held breath before the card turns, light behind it from STAR, and the
 * ground itself shaking for HITMAN. A bronze moment that spent everything the
 * gold one does would leave the top of the ladder nothing to be.
 *
 * The arrows are the innings card's chevrons (`BAND_CHEVRONS` in the HUD),
 * stood on end: the same shape that runs on the total's band, rising.
 */
export interface LevelUpFx {
  /** The arrows rising behind everything, at once. */
  arrows: number;
  /** How fast they rush in the first second, in screen heights a second. */
  rush: number;
  /** The great chevrons that sweep the screen and uncover LEVEL UP. */
  sweeps: number;
  /** How long the old card is held before it turns, after it has risen. ms. */
  hold: number;
  /** How long the seam takes to climb the card. ms. */
  morph: number;
  /** The burst at the turn: bits of the tier's metal. */
  burst: number;
  /** Sparkles that keep twinkling over the screen once it has turned. */
  sparkles: number;
  /** Foil drifting down after the burst, in the tier's metal. */
  foil: number;
  /** How strongly the turned card is lit from behind by turning rays, nought for none. */
  rays: number;
  /** How white the flash at the turn is, nought to one. */
  flash: number;
  /** How far the screen shakes at the turn, in design pixels; nought for none. */
  shake: number;
  /** Whether the arrows carry a glow. */
  glow: boolean;
  /** The cheer the crowd gives it, by size. */
  cheer: 'mid' | 'big' | null;
  /** A second cheer a beat later, for the rung the game is named for. */
  encore: boolean;
}

/** By rung. DEBUTANT is never climbed to (everybody starts there), so it is the floor and is never played. */
const FX: Record<string, LevelUpFx> = {
  debutant: { arrows: 12, rush: 1.2, sweeps: 1, hold: 500, morph: 520, burst: 30, sparkles: 0, foil: 0, rays: 0, flash: .35, shake: 0, glow: false, cheer: null, encore: false },
  emerging: { arrows: 18, rush: 1.5, sweeps: 2, hold: 600, morph: 620, burst: 60, sparkles: 10, foil: 0, rays: 0, flash: .5, shake: 0, glow: false, cheer: 'mid', encore: false },
  star: { arrows: 30, rush: 1.9, sweeps: 3, hold: 750, morph: 760, burst: 110, sparkles: 34, foil: 40, rays: .5, flash: .7, shake: 0, glow: true, cheer: 'big', encore: false },
  hitman: { arrows: 46, rush: 2.4, sweeps: 4, hold: 950, morph: 920, burst: 180, sparkles: 60, foil: 120, rays: .85, flash: .92, shake: 9, glow: true, cheer: 'big', encore: true },
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

export function levelUpBeats(fx: LevelUpFx): LevelUpBeats {
  const word = 650, card = word + 450, turn = card + fx.hold, turned = turn + fx.morph;
  return { word, card, turn, turned, named: turned + 350, ready: turned + 900 };
}

/**
 * The buzz in the hand, as `navigator.vibrate` patterns at a beat each: a
 * tick for each great chevron as it sweeps by, a thump as the seam starts up
 * the card, and the burst at the turn — longer and more of it up the ladder.
 */
export function levelUpHaptics(fx: LevelUpFx, beats: LevelUpBeats): { at: number; pattern: number[] }[] {
  const out: { at: number; pattern: number[] }[] = [];
  const sweepGap = beats.word / Math.max(1, fx.sweeps);
  for (let i = 0; i < fx.sweeps; i++) out.push({ at: Math.round(i * sweepGap + sweepGap * .6), pattern: [8] });
  out.push({ at: beats.turn, pattern: [14] });
  const burst: Record<number, number[]> = { 0: [30], 1: [40, 50, 30], 2: [60, 40, 40, 40, 90], 3: [70, 40, 50, 40, 70, 60, 140] };
  const rung = fx.shake ? 3 : fx.rays ? 2 : fx.cheer ? 1 : 0;
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
