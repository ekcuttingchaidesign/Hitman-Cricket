import type { BlastCareer, CareerMode, SurviveCareer } from './career';

/**
 * What a player *is*, rather than what they have.
 *
 * The figures on a career card are true and, on their own, inert: nine numbers
 * and no answer to the only question somebody actually asks about them, which
 * is whether they are any good. A tier answers it in one word, and it is the
 * word that makes the card worth sending — "900 runs" means nothing to a friend
 * who has never played, and "STAR" means something immediately.
 *
 * Three rules shape the ladder below.
 *
 * It is read off the figure the mode already leads on — career runs in the
 * Blast, balls faced in the Test match — rather than off a score of its own.
 * That keeps one number in charge of the headline tile, the tier under it and
 * the progress bar under that, so a card cannot say a player is climbing on one
 * line and stalled on the next.
 *
 * The thresholds are the same for both modes, which is a convenience the two
 * measures happen to allow: sixty balls an innings and something under sixty
 * runs an innings put them in the same range, so one ladder covers both and
 * there is one set of words to learn rather than two.
 *
 * And it is unbounded at the bottom and capped at the top on purpose. Everybody
 * who finishes one innings has a tier — a card with a blank where the badge
 * goes is the one card nobody would send — and the last rung is far enough out
 * that reaching it means something for as long as this game is up.
 */

/**
 * A tier's whole palette, not just its accent.
 *
 * The card used to be one navy object with a coloured badge on it, which made
 * every player's card the same card. A tier that changes the *material* makes
 * them different objects — and that is the difference between a screen somebody
 * reads and a thing somebody collects. A bronze card and a black-and-gold one
 * are recognisable across a room at thumbnail size, where a badge is not.
 *
 * Every field here is spent by `StatsCard.ts` and nothing else decides a colour
 * on that card, so a new tier is a palette rather than an edit to the painter.
 */
export interface Theme {
  /** The card's own ground, top to bottom. */
  top: string;
  mid: string;
  bottom: string;
  /** The solid shadow it stands on, and the mat the picture sits on. */
  ledge: string;
  mat: string;
  /** Figures, and the quiet labels over them. */
  ink: string;
  quiet: string;
  /** The tier's colour: badge, the ring round the kit, the bar, the hairlines. */
  accent: string;
  /** A lighter cast of it. On a metal tier this is the highlight in the sheen. */
  sheen: string;
  /** The hairline between sections. */
  rule: string;
  /** The hero tiles, which are lit glass on every theme. */
  tileTop: string;
  tileBottom: string;
  /**
   * How strongly the accent blooms behind the hero row.
   *
   * Per theme rather than one figure for the card, because it is the single
   * thing that decides whether a black card is black. At the strength the navy
   * card wants, the same wash over a near-black ground lifts the whole middle
   * of it into grey or brown haze — and then the tier is no longer black and
   * silver, it is silver-grey with silver on it. The metals keep barely enough
   * to stop the ground reading as flat.
   */
  bloom: number;
  /**
   * Whether the accent is a metal. A metal tier gets a brushed gradient on the
   * badge and the bar, and a second hairline inset inside the first — the two
   * things that separate a printed card from a coloured rectangle.
   */
  metal: boolean;
}

export interface Tier {
  key: string;
  /** The word on the badge. */
  name: string;
  /** What it takes to get here, in the mode's own lead figure. */
  at: number;
  /** One line saying what it took, for the card and for a screen reader. */
  blurb: string;
  /** What the card is made of at this rung. */
  theme: Theme;
}

/**
 * The ladder, lowest first.
 *
 * Four rungs, and deliberately not more. A ladder with seven rungs on it
 * flatters the arithmetic and nobody else: each step means less, the word on
 * the badge stops being a claim worth making, and a player two thirds of the
 * way up still cannot say in one syllable what they are. Four names are four
 * things a person can hold in their head, and the gaps between them are wide
 * enough that moving up is an event.
 *
 * Adding a rung later is one entry in this array — the badge, the ground, the
 * bloom, the progress bar and the card's own edges all read whatever is here,
 * and nothing else needs touching. That is the whole reason it is a list.
 *
 * The thresholds are pulled in tighter than the names might suggest, because a
 * rung nobody reaches is the same as no rung at all: at something under fifty
 * runs an innings, EMERGING PLAYER is about five innings, STAR about
 * twenty-five, and HITMAN a season of them.
 *
 * The materials climb rather than merely differ — navy, then bronze, then
 * black and silver, then black and gold — so the ladder is legible in a
 * thumbnail where the word itself is too small to read at all. The first is
 * deliberately the plainest: a first-innings card that arrived in gold would
 * leave the top of the ladder nothing to be.
 */
export const TIERS: readonly Tier[] = [
  {
    key: 'debutant',
    name: 'DEBUTANT',
    at: 0,
    blurb: 'First time out there.',
    // The game's own navy, which is the card everybody starts on and the only
    // one that is not trying to be a material.
    theme: {
      top: '#16354a', mid: '#0f2738', bottom: '#0b1f2e',
      ledge: '#040e15', mat: '#071219',
      ink: '#f7f0e5', quiet: '#9fb2bd',
      accent: '#5fa8d8', sheen: '#a8d4ef',
      rule: '#ffffff1f',
      tileTop: '#ffffff1c', tileBottom: '#ffffff08',
      bloom: 0.15,
      metal: false,
    },
  },
  {
    key: 'emerging',
    name: 'EMERGING PLAYER',
    at: 250,
    blurb: 'Making a name out there.',
    // Bronze, and dark. A warm ground rather than navy tinted brown, or the
    // copper has nothing to be warm against — but a long way below where it
    // started, because a milky brown card is the one ground on which cream
    // figures stop being cream figures and start being beige ones.
    theme: {
      top: '#2b1a10', mid: '#180f09', bottom: '#0d0705',
      ledge: '#050201', mat: '#080403',
      ink: '#fbf1e6', quiet: '#b7967c',
      accent: '#cd7f32', sheen: '#f3bd80',
      rule: '#ffffff1a',
      tileTop: '#ffffff14', tileBottom: '#ffffff05',
      bloom: 0.08,
      metal: true,
    },
  },
  {
    key: 'star',
    name: 'STAR',
    at: 1200,
    blurb: 'People turn up to watch.',
    // Black and silver, in that order. The ground is a neutral near-black with
    // just enough lift at the top to keep an edge; the silver is spent on the
    // badge, the ring, the bar and the two hairlines and nowhere else. Anything
    // more of it and the card is grey with silver on it, which is neither.
    theme: {
      top: '#1a1d21', mid: '#0e1012', bottom: '#050607',
      ledge: '#000000', mat: '#040405',
      ink: '#f6f9fc', quiet: '#8e98a3',
      accent: '#d6dee7', sheen: '#ffffff',
      rule: '#ffffff1c',
      tileTop: '#ffffff10', tileBottom: '#ffffff04',
      bloom: 0.05,
      metal: true,
    },
  },
  {
    key: 'hitman',
    name: 'HITMAN',
    at: 4000,
    blurb: 'The one the game is named for.',
    // Black and gold, and the only card in the game that gets to be either.
    // The ground is black with the faintest warmth in it rather than a dark
    // gold — gold on gold has nowhere to shine from.
    theme: {
      top: '#1c1913', mid: '#0f0d09', bottom: '#060504',
      ledge: '#000000', mat: '#050403',
      ink: '#fdf7e8', quiet: '#a2947a',
      accent: '#e8bf5a', sheen: '#fff2bd',
      rule: '#ffffff1c',
      tileTop: '#ffffff10', tileBottom: '#ffffff04',
      bloom: 0.07,
      metal: true,
    },
  },
] as const;

/** The figure a mode's tier is read off: its own headline number. */
export function tierMeasure(mode: CareerMode, career: BlastCareer | SurviveCareer): number {
  return mode === 'survive' ? career.balls : (career as BlastCareer).runs;
}

/** What the mode calls that figure, for the line under the progress bar. */
export function measureName(mode: CareerMode): string {
  return mode === 'survive' ? 'balls' : 'runs';
}

export interface Standing {
  tier: Tier;
  /** The rung above, or null at the top of the ladder. */
  next: Tier | null;
  /** The figure the tier was read off. */
  measure: number;
  /** How far into this rung, nought to one. One at the top of the ladder. */
  progress: number;
  /** How much more of the measure the next rung wants, or null at the top. */
  toNext: number | null;
}

/**
 * Where a career stands: the rung it is on, the one above, and how far along.
 *
 * The progress is measured across the gap between the two rungs rather than
 * from nought, which is the difference between a bar that creeps for a week and
 * one that visibly moves every time somebody plays. At the top of the ladder it
 * reads full, because there is nowhere further and a bar stuck at four-fifths
 * for good is a worse reward than no bar.
 */
export function standingOf(mode: CareerMode, career: BlastCareer | SurviveCareer): Standing {
  const measure = Math.max(0, Math.floor(tierMeasure(mode, career)));
  let index = 0;
  for (let i = 0; i < TIERS.length; i++) if (measure >= TIERS[i].at) index = i;
  const tier = TIERS[index];
  const next = TIERS[index + 1] ?? null;
  if (!next) return { tier, next, measure, progress: 1, toNext: null };
  const span = next.at - tier.at;
  return {
    tier,
    next,
    measure,
    progress: span > 0 ? Math.min(1, Math.max(0, (measure - tier.at) / span)) : 1,
    toNext: Math.max(0, next.at - measure),
  };
}

/**
 * The line under the bar. It says what is left rather than what has been done,
 * because the figure that has been done is already the biggest thing on the
 * card and saying it twice tells nobody anything new.
 */
export function nextLine(mode: CareerMode, standing: Standing): string {
  if (!standing.next || standing.toNext === null) return 'Top of the ladder.';
  return `${standing.toNext.toLocaleString()} ${measureName(mode)} to ${standing.next.name}`;
}
