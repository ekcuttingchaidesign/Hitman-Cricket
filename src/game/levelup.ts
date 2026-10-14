import type { CareerMode } from './career';
import { TIERS, type Tier } from './tier';

/**
 * Level Up: the screen an innings ends on when it carried a career onto a new
 * rung (`climbedTo`), before the innings card underneath it.
 *
 * What is here is the choreography as figures, kept apart from the drawing
 * (`src/ui/LevelUp.ts`) so the rules worth holding to a test can be: which
 * rung opens which way, and that each rung is a bigger occasion than the one
 * below it.
 *
 * Each rung has its own opening, built from the game's own pieces, and all
 * three end the same way — the card flips over to the new rung, the cannons
 * go, the figure counts on, the name and the two keys:
 *
 * - EMERGING PLAYER, `road`: the player's Road to Hitman, the fill running on
 *   to the next medallion, which squats, lights, pops, and flies off the
 *   track spinning like a coin to land in the middle; then into the card.
 * - STAR, `six`: the card waits and the ball comes in already at full speed
 *   and hits it square; the card spins like a struck coin onto the new rung.
 * - HITMAN, `rush`: the end card's chevron squats, charges and fires a train
 *   of chevrons up the screen, which uncovers LEVEL UP and bursts into
 *   chevron fireworks off the top; the card is pulled up in its wake and a
 *   last chevron dives into it. The biggest of the three: a gold flash, two
 *   waves of cannons and a gold shower.
 *
 * Every move is on a spring (`spring`), so things squash, overshoot and
 * settle, and every launch has a beat of anticipation before it. The
 * confetti is paper: fired, dragged by the air, swaying and turning over.
 */
export type Opening = 'road' | 'six' | 'rush';

export interface LevelUpFx {
  /** How it opens: see above. */
  opening: Opening;
  /** Confetti from the two bottom corners, each wave. */
  confetti: number;
  /** Waves of it. */
  waves: number;
  /** Paper in the rung's metal falling from the top. */
  shower: number;
  /** Confetti thrown out of the moment itself: the landing, the impact, the dive. */
  burst: number;
  /** Shockwaves at the big moments. */
  rings: number;
  /** How bright the flash at the turn is, nought to one. */
  flash: number;
  /** How far the screen shakes at the landing, in design pixels. */
  shake: number;
  /** Glints that twinkle on the card's corners once it has turned. */
  glints: number;
  /** The cheer the crowd gives it, by size. */
  cheer: 'mid' | 'big' | null;
  /** A second cheer a beat later, for the rung the game is named for. */
  encore: boolean;
}

/** By rung. DEBUTANT is never climbed to (everybody starts there), so it is the floor and is never played. */
const FX: Record<string, LevelUpFx> = {
  debutant: { opening: 'road', confetti: 50, waves: 1, shower: 0, burst: 12, rings: 1, flash: .3, shake: 0, glints: 0, cheer: null, encore: false },
  emerging: { opening: 'road', confetti: 80, waves: 1, shower: 0, burst: 20, rings: 1, flash: .35, shake: 2, glints: 0, cheer: 'mid', encore: false },
  star: { opening: 'six', confetti: 110, waves: 1, shower: 0, burst: 44, rings: 2, flash: .5, shake: 4, glints: 4, cheer: 'big', encore: false },
  hitman: { opening: 'rush', confetti: 150, waves: 2, shower: 90, burst: 60, rings: 3, flash: .65, shake: 5, glints: 6, cheer: 'big', encore: true },
};

export function levelUpFx(tier: Pick<Tier, 'key'>): LevelUpFx {
  return FX[tier.key] ?? FX.emerging;
}

/**
 * The tier's metal as the chevrons and the confetti are drawn in: the colour,
 * a lighter cast for the edge that catches the light, and a deeper one for
 * the shadow side and the chevron's ledge.
 */
export function levelUpMetal(tier: Tier): { base: string; light: string; deep: string } {
  const deep: Record<string, string> = { debutant: '#2b4c78', emerging: '#7a4a22', star: '#6d7680', hitman: '#9a7322' };
  return { base: tier.theme.accent, light: tier.theme.sheen, deep: deep[tier.key] ?? tier.theme.accent };
}

/**
 * The springs, as a motion designer sets them: stiffness and damping, mass one.
 * Bounce is for small moves; a long travel goes on `soft`, which barely
 * overshoots, or it sails past where it is going and covers the words.
 */
export const SPRINGS = { snappy: [320, 22], bouncy: [240, 13], wobbly: [180, 9], soft: [140, 18] } as const;
export type SpringKind = keyof typeof SPRINGS;

/** A damped spring from nought to one, `ms` after it is let go. Closed form, so any moment can be drawn on its own. */
export function spring(ms: number, kind: SpringKind = 'bouncy'): number {
  if (ms <= 0) return 0;
  const [k, c] = SPRINGS[kind], t = ms / 1000, w0 = Math.sqrt(k), z = c / (2 * w0);
  if (z >= 1) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  const wd = w0 * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + z * w0 / wd * Math.sin(wd * t));
}
/** How long a spring takes to first reach where it is going: the moment a flip has turned. */
export function springArrives(kind: SpringKind): number {
  for (let ms = 1; ms < 2000; ms++) if (spring(ms, kind) >= 1) return ms;
  return 2000;
}

/**
 * When each opening does what, in ms from the start. `word` is LEVEL UP, `card`
 * the card in place, `turn` the flip let go, `turned` the new rung facing, and
 * the ending — the count, the name, the keys — follows from `turned`.
 */
export interface LevelUpBeats {
  word: number;
  card: number;
  turn: number;
  turned: number;
  /** The figure starts counting on. */
  count: number;
  named: number;
  ready: number;
  /** The opening's own moments, for the buzz: when, and what. */
  marks: { at: number; pattern: number[] }[];
}

/** The road: the fill from 0.5s, the medallion's pop, its landing, LEVEL UP, the card up, the flight into it. */
export const ROAD = { fill: [500, 1250], pop: 1370, lift: 1500, land: 2150, word: 2300, card: 2750, flip: 3330 } as const;
/** The six: the card waits, the ball from 0.48s, the hit; the spin's length grows with how many times it turns. */
export const SIX = { ball: 480, hit: 820, spins: 2 } as const;
/** The rush: the chevron's charge, the launch, the train's stagger, the card pulled up, the last chevron's dive. */
export const RUSH = { charge: 300, launch: 760, gap: 70, travel: 560, train: 5, card: 1300, dive: [2080, 2330] } as const;

export function sixSpinMs(spins: number = SIX.spins) { return 700 + spins * 350; }

export function levelUpBeats(fx: LevelUpFx): LevelUpBeats {
  const flipLands = springArrives('bouncy');
  let word: number, card: number, turn: number, turned: number;
  const marks: { at: number; pattern: number[] }[] = [];
  if (fx.opening === 'road') {
    ({ word, card } = ROAD); turn = ROAD.flip; turned = turn + flipLands;
    for (let i = 0; i < 4; i++) marks.push({ at: Math.round(ROAD.fill[0] + (ROAD.fill[1] - ROAD.fill[0]) * (i + 1) / 5), pattern: [6] });
    marks.push({ at: ROAD.pop, pattern: [26] }, { at: ROAD.land, pattern: [40, 30, 20] });
  } else if (fx.opening === 'six') {
    word = SIX.hit + 60; card = SIX.hit + 100; turn = SIX.hit + 120; turned = SIX.hit + sixSpinMs();
    marks.push({ at: SIX.hit, pattern: [45] });
    // The spin ticking over, slower and slower.
    for (let i = 1; i <= SIX.spins * 2; i++) marks.push({ at: Math.round(SIX.hit + sixSpinMs() * (1 - (1 - i / (SIX.spins * 2 + 1)) ** (1 / 2.6))), pattern: [8] });
  } else {
    const pass = RUSH.launch + RUSH.travel * Math.cbrt(.6);
    word = Math.round(pass); card = RUSH.card; turn = RUSH.dive[1]; turned = turn + flipLands;
    marks.push({ at: RUSH.charge, pattern: [12, 40, 16, 30, 22, 20, 30] }, { at: RUSH.launch, pattern: [50] });
    for (let i = 1; i < RUSH.train; i++) marks.push({ at: RUSH.launch + i * RUSH.gap, pattern: [8] });
  }
  const count = turned + 100;
  return { word, card, turn, turned, count, named: count + 250, ready: count + 650, marks };
}

/**
 * The buzz in the hand: the opening's own moments (`marks`), a thump as the
 * card is let go to flip, and the burst as the new rung faces — longer and
 * more of it up the ladder.
 */
export function levelUpHaptics(fx: LevelUpFx, beats: LevelUpBeats): { at: number; pattern: number[] }[] {
  const burst: Record<number, number[]> = { 0: [30], 1: [40, 50, 30], 2: [60, 40, 40, 40, 90], 3: [70, 40, 50, 40, 70, 60, 140] };
  const rung = fx.waves > 1 ? 3 : fx.glints ? 2 : fx.cheer ? 1 : 0;
  return [...beats.marks, { at: beats.turn, pattern: [14] }, { at: beats.turned, pattern: burst[rung] }].sort((a, b) => a.at - b.at);
}

/** What the screen says, from the rung reached and the career as it now stands. */
export interface LevelUpWords {
  /** The word every opening uncovers. */
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
