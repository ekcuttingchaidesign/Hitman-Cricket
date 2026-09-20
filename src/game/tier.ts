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

export interface Tier {
  key: string;
  /** The word on the badge. */
  name: string;
  /** What it takes to get here, in the mode's own lead figure. */
  at: number;
  /** The badge's ink, and the colour the card borrows for its own fittings. */
  ink: string;
  /** The wash behind the badge, and the bloom behind the card's hero row. */
  glow: string;
  /** One line saying what it took, for the card's fallback and a screen reader. */
  blurb: string;
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
 * Adding a rung later is one entry in this array — the badge, the bloom, the
 * progress bar and the card's own hairline all read whatever is here, and
 * nothing else needs touching. That is the whole reason it is a list.
 *
 * The thresholds are pulled in tighter than the names might suggest, because a
 * rung nobody reaches is the same as no rung at all: at something under fifty
 * runs an innings, REGULAR is about five innings, STAR about twenty-five, and
 * HITMAN a season of them.
 *
 * Every colour has been picked to read on the card's navy rather than to sit
 * on a palette, and they run cool to hot so the ladder is legible in a
 * thumbnail where the word itself is too small to read at all. The first is
 * deliberately quiet: a first-innings badge that shouted would make every card
 * look the same at a glance.
 */
export const TIERS: readonly Tier[] = [
  { key: 'debutant', name: 'DEBUTANT', at: 0, ink: '#9fb2bd', glow: '#9fb2bd', blurb: 'First time out there.' },
  { key: 'regular', name: 'REGULAR', at: 250, ink: '#5aa9f0', glow: '#5aa9f0', blurb: 'In the side every week.' },
  { key: 'star', name: 'STAR', at: 1200, ink: '#f0c65c', glow: '#f0c65c', blurb: 'People turn up to watch.' },
  { key: 'hitman', name: 'HITMAN', at: 4000, ink: '#ff4d5e', glow: '#ff4d5e', blurb: 'The one the game is named for.' },
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
