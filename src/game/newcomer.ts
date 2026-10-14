import type { CareerMode } from './career';

/**
 * A newcomer's first innings, made a little kinder.
 *
 * The first few finished innings in each mode are batted with a wider OK
 * window and a wider clean block, the help shrinking innings by innings until
 * it is gone. A mode is new on its own: a player who has mastered the Blast
 * is still new to Test Survival, whose windows are two thirds the width.
 *
 * What it widens is chosen so that it saves a newcomer's wicket without
 * handing anybody a boundary. PERFECT and GOOD are where the sixes and fours
 * come from, and they are left exactly as they are; POOR and the edge of the
 * block are where the dismissals come from, and that is the band the help
 * eats into. A ball that was a skied catch becomes a nudged single, a block
 * that was beaten dies on the bat. So a good player who clears their browser
 * for an easy innings gains almost nothing — they were not getting out to
 * those balls anyway — and a new one gets to bat long enough to learn.
 *
 * The bowling is the same but for the yorker, which a newcomer is not bowled:
 * neither the one owed for a run of sixes nor the express bowler's, whose
 * ball is a full, fast one in its place. The pace stays; a slow innings is a
 * dull one.
 *
 * Nothing on screen says so. The help fades over the innings rather than
 * stopping, so there is no step to explain.
 */

/** How much wider the OK window and the clean block are, innings by innings in a mode. */
export const EASE: readonly number[] = [1.35, 1.2, 1.1];

/** How many innings in a mode are helped at all. */
export const NEWCOMER_INNINGS = EASE.length;

/** The factor for the next innings, after `played` finished ones in that mode. */
export function easeFor(played: number): number {
  return Number.isInteger(played) && played >= 0 && played < EASE.length ? EASE[played] : 1;
}

type Windows = { perfect: number; good: number; ok: number; poor: number };
type Bands = { clean: number; beaten: number };

/** The windows with OK widened into POOR, and never past it. PERFECT and GOOD untouched. */
export function easedWindows<W extends Windows>(windows: W, ease: number): W {
  if (ease <= 1) return windows;
  return { ...windows, ok: Math.min(windows.poor, Math.round(windows.ok * ease)) };
}

/** The block's clean band widened into the edged one, and never past it. */
export function easedBands<B extends Bands>(bands: B, ease: number): B {
  if (ease <= 1) return bands;
  return { ...bands, clean: Math.min(bands.beaten, Math.round(bands.clean * ease)) };
}

/** A batter's skill, for either Test mode: both his windows and his block. */
export function easedSkill<S extends { timing: Windows; bands: Bands }>(skill: S, ease: number): S {
  if (ease <= 1) return skill;
  return { ...skill, timing: easedWindows(skill.timing, ease), bands: easedBands(skill.bands, ease) };
}

/**
 * The finished innings this browser has played in each mode, as far as the
 * help is concerned. Kept apart from the career, which only a named player
 * has, so a player with no name is helped and stops being helped the same.
 */
const KEY = 'hitman-newcomer';
export type Played = Partial<Record<CareerMode, number>>;

/** What is kept, or null for a browser that has never been asked. */
export function readPlayed(read: (key: string) => string | null): Played | null {
  try {
    const raw = read(KEY);
    if (raw === null) return null;
    const held = JSON.parse(raw) as Record<string, unknown> | null;
    if (!held || typeof held !== 'object') return {};
    const played: Played = {};
    for (const mode of ['classic', 'survive', 'marathon'] as const) {
      const value = held[mode];
      if (typeof value === 'number' && Number.isInteger(value) && value > 0) played[mode] = value;
    }
    return played;
  } catch { return {}; }
}

/**
 * The first time a browser loads a build with the help in it. One that has
 * batted here before is a player from before the help, and is counted as past
 * it in every mode — otherwise every regular would be handed three easy
 * innings of each the day it shipped. Written once, so a newcomer's second
 * day does not turn them into a veteran.
 */
export function seedPlayed(read: (key: string) => string | null, write: (key: string, value: string) => void, veteran: boolean) {
  try {
    if (read(KEY) !== null) return;
    const past = NEWCOMER_INNINGS;
    write(KEY, JSON.stringify(veteran ? { classic: past, survive: past, marathon: past } : {}));
  } catch { /* Then it is asked again next load. */ }
}

/** One more finished innings in a mode. Counted up to where it stops mattering. */
export function notePlayed(mode: CareerMode, read: (key: string) => string | null, write: (key: string, value: string) => void) {
  try {
    const played = readPlayed(read) ?? {};
    played[mode] = Math.min(NEWCOMER_INNINGS, (played[mode] ?? 0) + 1);
    write(KEY, JSON.stringify(played));
  } catch { /* Nothing to remember it in, and the help runs out by the career. */ }
}

/**
 * The innings to judge by: this browser's count or the career's, whichever is
 * further on. A player who brings a career back with a key has it in the
 * career; one who has never named themselves has only the browser's.
 */
export function playedIn(mode: CareerMode, read: (key: string) => string | null, careerInnings = 0): number {
  const held = readPlayed(read);
  return Math.max(held?.[mode] ?? 0, Number.isFinite(careerInnings) ? careerInnings : 0);
}
