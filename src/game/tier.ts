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
  /**
   * What it takes to get here, per mode, in that mode's own lead figure.
   *
   * Per mode rather than one figure for both, and the reason is measured
   * rather than guessed: five days of play says a Blast player banks about
   * 140 runs a day and a Test player about 39 balls — roughly three and a half
   * to one, because Test innings end early where Blast innings mostly run
   * their course. One shared ladder was the assumption this started on, and it
   * would have had Test players climbing three and a half times slower for
   * identical time at the crease.
   *
   * So the two ladders are set to cost the same *effort* instead: about six or
   * seven innings to the second rung, sixty-odd to the third, and a month of
   * heavy play to the top, whichever mode is being played.
   */
  at: Record<CareerMode, number>;
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
 * The thresholds are set off what people actually do rather than off what the
 * numbers look like. Five days of play put a Blast innings at about
 * fifty-four runs and a Test innings at about seventeen balls, and a player at
 * two and a half innings on a day they play at all — so EMERGING PLAYER is
 * six or seven innings, which is the second or third sitting, STAR is a few
 * committed weeks, and HITMAN is upwards of a month of heavy play and out of
 * reach of everybody else. A rung nobody reaches is the same as no rung at
 * all; a rung everybody reaches is not a rung.
 *
 * The top rung is the one figure here that is chosen rather than measured. The
 * rates put it anywhere in a wide band and the band is all the data can say, so
 * where in it the number lands is a decision about how far away the last rung
 * should feel — and fifteen thousand is that decision. The three below it are
 * what the rates give.
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
    at: { classic: 0, survive: 0 },
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
    at: { classic: 350, survive: 100 },
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
    at: { classic: 3600, survive: 1000 },
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
    at: { classic: 15000, survive: 4250 },
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

/**
 * A tier a player holds regardless of their figures, and why.
 *
 * The board existed before careers did, so the people who built it would
 * otherwise open their first card and find themselves DEBUTANT next to
 * somebody who arrived that morning. Being early should count for something,
 * and what it buys is the *tier* — the badge and the material — while every
 * figure on the card stays their own.
 *
 * That line matters and is the whole reason this is a grant rather than a pile
 * of invented runs: the card is built to be sent to other people, and a card
 * saying three thousand runs to somebody who scored a hundred and forty-eight
 * is a claim about them that is not true. So the grant carries its own reason,
 * printed on the card in place of the usual blurb, and the numbers are left
 * alone.
 */
export interface Granted {
  /** The tier key they hold. */
  key: string;
  /** Why, in the words the card prints. */
  reason: string;
}

export interface Standing {
  tier: Tier;
  /** Set where the tier came from a grant rather than from the figures. */
  granted?: Granted | null;
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
export function standingOf(
  mode: CareerMode, career: BlastCareer | SurviveCareer, granted: Granted | null = null,
): Standing {
  const measure = Math.max(0, Math.floor(tierMeasure(mode, career)));
  let index = 0;
  for (let i = 0; i < TIERS.length; i++) if (measure >= TIERS[i].at[mode]) index = i;
  // A grant is a floor, never a ceiling. Somebody who was given STAR for being
  // early and has since played their way to HITMAN keeps HITMAN — the grant was
  // to stop them starting at the bottom, not to hold them there.
  const floor = granted ? TIERS.findIndex(one => one.key === granted.key) : -1;
  const held = Math.max(index, floor);
  const earned = held === index;
  index = held;
  const tier = TIERS[index];
  const mark = earned ? null : granted;
  const next = TIERS[index + 1] ?? null;
  if (!next) return { tier, granted: mark, next, measure, progress: 1, toNext: null };
  const span = next.at[mode] - tier.at[mode];
  return {
    tier,
    granted: mark,
    next,
    measure,
    progress: span > 0 ? Math.min(1, Math.max(0, (measure - tier.at[mode]) / span)) : 1,
    toNext: Math.max(0, next.at[mode] - measure),
  };
}

/**
 * The line under the bar. It says what is left rather than what has been done,
 * because the figure that has been done is already the biggest thing on the
 * card and saying it twice tells nobody anything new.
 */
export function nextLine(mode: CareerMode, standing: Standing): string {
  // A granted tier says what it was for rather than what is left to it. The
  // figure underneath is the player's real one and is a long way off the rung
  // they have been handed, so printing it would read as a demotion notice on
  // the very card that is meant to be a reward.
  if (standing.granted) return standing.granted.reason;
  if (!standing.next || standing.toNext === null) return 'Top of the ladder.';
  return `${standing.toNext.toLocaleString()} ${measureName(mode)} to ${standing.next.name}`;
}

/**
 * The tiers the first players on a board are handed, by where they stand on it.
 *
 * Top five take STAR and the next eleven take EMERGING PLAYER, which is the
 * shape of a cricket side and is meant to be: the people who made the board
 * worth having get to look like it. Everybody below sixteen earns theirs the
 * ordinary way, which is also what everybody who arrives from now on does.
 */
/**
 * The rung a career has just climbed onto, or null where it has not moved.
 *
 * Lives here rather than where it is counted because it is a question about the
 * ladder, and because a rule kept inside the thing that reports it is a rule
 * nothing can check. The two records go in, a tier comes out, and the test can
 * walk a career over a threshold and watch what it says.
 *
 * Only upward. Every figure a tier is read off is a sum or a maximum, so it
 * cannot fall; a drop would mean the two records were measured against
 * different rules rather than that anybody was demoted, and reporting it would
 * put a promotion on the dashboard that nobody earned.
 */
export function climbedTo(
  mode: CareerMode,
  was: BlastCareer | SurviveCareer | null,
  now: BlastCareer | SurviveCareer,
  granted: Granted | null = null,
): Tier | null {
  // Nothing to have climbed from. A first innings is an arrival rather than a
  // promotion, and counting it would make every new player a climber.
  if (!was) return null;
  const before = standingOf(mode, was, granted).tier;
  const after = standingOf(mode, now, granted).tier;
  if (before.key === after.key) return null;
  const rung = (tier: Tier) => TIERS.findIndex(one => one.key === tier.key);
  return rung(after) > rung(before) ? after : null;
}

export function foundingGrant(place: number): Granted | null {
  if (place >= 1 && place <= 5) {
    return { key: 'star', reason: `Founding place · ${ordinal(place)} on the board` };
  }
  if (place >= 6 && place <= 16) {
    return { key: 'emerging', reason: `Founding place · ${ordinal(place)} on the board` };
  }
  return null;
}

function ordinal(n: number) {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}
