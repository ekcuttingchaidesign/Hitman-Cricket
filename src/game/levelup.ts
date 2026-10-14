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
 * It is played in the ground itself, with the game's own pieces: the batter
 * plays one last lofted drive, the bat's crack, and the real ball goes up
 * over the bowler's head into the floodlights with the camera craning after
 * it (`GameScene.salute`), the stands up behind it holding the rung's name on
 * their placards. It slows as it climbs and hangs; LEVEL UP bursts out of the
 * point where it hangs, the ground blurs behind, and a line of light drops
 * from it and swells into the card, which turns to the new rung.
 *
 * What climbs is the shot and everything round it: the ball goes higher and
 * hangs longer, an ordinary streak behind it for EMERGING PLAYER and the
 * special stroke's fire from STAR, fireworks over the far stand after dark
 * from STAR (two waves for HITMAN), the held breath before the card turns,
 * the streaks, glints, rings and flash round the card, and for HITMAN alone a
 * shake and a second cheer. A bronze moment that spent everything the gold
 * one does would leave the top of the ladder nothing to be.
 */
export interface LevelUpFx {
  /** The ticks in the hand as the ball climbs. */
  lift: number;
  /** How high the ball goes, in metres. */
  height: number;
  /** How long it takes to get there from the bat, in ms. */
  flight: number;
  /** The tail behind it: the ordinary streak, or the special stroke's fire. */
  tail: 'plain' | 'fire';
  /** Waves of fireworks over the far stand when it hangs, after dark. */
  fireworks: number;
  /** How long the old card is held before it turns, after it has swelled out of the light. ms. */
  hold: number;
  /** How long the seam takes to climb the card. ms. */
  morph: number;
  /** The streaks that fly off the card as it turns. */
  streaks: number;
  /** Glints that twinkle on the card's corners once it has turned. */
  glints: number;
  /** Rings going out from the card as it turns, and from the ball as it bursts. */
  rings: number;
  /** How bright the flash round the card is at the turn, nought to one. */
  flash: number;
  /** How far the card shakes at the turn, in degrees; nought for none. */
  shake: number;
  /** The cheer the crowd gives it, by size. */
  cheer: 'mid' | 'big' | null;
  /** A second cheer a beat later, for the rung the game is named for. */
  encore: boolean;
}

/** By rung. DEBUTANT is never climbed to (everybody starts there), so it is the floor and is never played. */
const FX: Record<string, LevelUpFx> = {
  debutant: { lift: 2, height: 18, flight: 1300, tail: 'plain', fireworks: 0, hold: 500, morph: 520, streaks: 8, glints: 0, rings: 0, flash: .3, shake: 0, cheer: null, encore: false },
  emerging: { lift: 3, height: 22, flight: 1500, tail: 'plain', fireworks: 0, hold: 550, morph: 620, streaks: 10, glints: 0, rings: 1, flash: .4, shake: 0, cheer: 'mid', encore: false },
  star: { lift: 4, height: 27, flight: 1750, tail: 'fire', fireworks: 1, hold: 650, morph: 760, streaks: 14, glints: 4, rings: 2, flash: .5, shake: 0, cheer: 'big', encore: false },
  hitman: { lift: 5, height: 32, flight: 2000, tail: 'fire', fireworks: 2, hold: 750, morph: 880, streaks: 18, glints: 6, rings: 3, flash: .6, shake: 4, cheer: 'big', encore: true },
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
 * When the screen does what, in ms from its start. The bat meets the ball at
 * `contact`, which the scene says (it is when his stroke gets there); the
 * rest follows from the rung's figures, so a bigger rung is a longer climb
 * and a longer breath.
 */
export interface LevelUpBeats {
  /** The bat meets the ball. */
  contact: number;
  /** The ball hangs at the top and bursts into LEVEL UP. */
  word: number;
  /** The line of light has swelled into the card the player held. */
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

/** From LEVEL UP to the card standing: the line dropping and swelling. ms. */
export const SWELL_MS = 900;

export function levelUpBeats(fx: LevelUpFx, contact = 350): LevelUpBeats {
  const word = contact + fx.flight, card = word + SWELL_MS, turn = card + fx.hold, turned = turn + fx.morph;
  return { contact, word, card, turn, turned, named: turned + 350, ready: turned + 900 };
}

/**
 * The buzz in the hand, as `navigator.vibrate` patterns at a beat each: a
 * firm knock as the bat meets it, ticks thinning out as the ball climbs and
 * slows, a pop as it bursts into LEVEL UP, a thump as the seam starts up the
 * card, and the burst at the turn — longer and more of it up the ladder.
 */
export function levelUpHaptics(fx: LevelUpFx, beats: LevelUpBeats): { at: number; pattern: number[] }[] {
  const out: { at: number; pattern: number[] }[] = [{ at: beats.contact, pattern: [28] }];
  for (let i = 1; i <= fx.lift; i++) out.push({ at: Math.round(beats.contact + fx.flight * (1 - (1 - i / (fx.lift + 1)) ** 2) * .9), pattern: [6] });
  out.push({ at: beats.word, pattern: [18, 40, 18] });
  out.push({ at: beats.turn, pattern: [14] });
  const burst: Record<number, number[]> = { 0: [30], 1: [40, 50, 30], 2: [60, 40, 40, 40, 90], 3: [70, 40, 50, 40, 70, 60, 140] };
  const rung = fx.shake ? 3 : fx.fireworks ? 2 : fx.cheer ? 1 : 0;
  out.push({ at: beats.turned, pattern: burst[rung] });
  return out;
}

/** What the screen says, from the rung reached and the career as it now stands. */
export interface LevelUpWords {
  /** The word the ball bursts into. */
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
