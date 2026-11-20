import type { ShotOutcome, ShotType, TimingGrade, TimingSide, WicketType } from './types';

/**
 * How a ball was played, told by the phone that played it for whoever watches
 * that player's game in a match with friends (section 51's stories).
 *
 * Only what a ball was worth used to travel (a run figure or a W), so the
 * watching device made up a stroke that fitted it: the owner played the
 * helicopter at a yorker for one, and the story showed a cover drive for one
 * (20 November 2026). This is the swing as the game told its own scene, with
 * every argument, when it came and when the ball was resolved, and what came
 * of it: what a replay keeps (`Kept` in `src/Game.ts`), so a story stages a
 * friend's ball as a replay stages one's own.
 *
 * It is the picture and nothing else. The room still counts a ball by its
 * figure on the card, the same on every phone, and a how that does not agree
 * with that figure, or does not read, is let go and the stroke made up as
 * before. What comes off the wire is another player's, so every field is held
 * to its kind and its range, and the call's words to capitals and a few marks.
 */
export interface HowSwing {
  shot: ShotType; charging: boolean; lofted: boolean; sweeping: boolean; levelled: boolean;
  version: 1 | 2 | 3; meets: number; cutting: boolean; spinPulling: boolean; helicopter: boolean;
}
export interface BallHow {
  /** The stroke, or null for a ball left alone. */
  swing: HowSwing | null;
  /** From the ball's release, in the game's milliseconds: when he swung, and when the ball was resolved. */
  swingAfter: number;
  resolveAfter: number;
  outcome: ShotOutcome;
}

/** The longest a how may be on the wire: the store turns a longer one away. */
export const HOW_MAX = 700;
/** How many of a player's latest balls an answer of the store's carries the how of: a story never shows one older. */
export const HOWS_TOLD = 3;

const SHOTS: readonly ShotType[] = ['LEG', 'LONG_ON', 'STRAIGHT', 'COVER_LONG_OFF', 'SQUARE_CUT', 'DEFEND', 'SCOOP', 'REVERSE_SCOOP', 'HOOK', 'LATE_CUT'];
const GRADES: readonly TimingGrade[] = ['PERFECT', 'GOOD', 'OK', 'POOR', 'MISS'];
const WICKETS: readonly WicketType[] = ['BOWLED', 'LBW', 'CAUGHT', 'STUMPED'];
const SIDES: readonly TimingSide[] = ['EARLY', 'CLEAN', 'LATE'];
const FLAGS = ['charging', 'lofted', 'sweeping', 'levelled', 'cutting', 'spinPulling', 'helicopter'] as const;
/** The outcome's numbers, each with the range it is held to. */
const NUMBERS: Record<string, [number, number]> = { quality: [0, 1], compatibility: [0, 1], timingDeltaMs: [-2000, 2000], hangMs: [0, 6000], angle: [-180, 180] };
/** The call over the pitch: capitals, figures and the marks the game's own calls use, and no longer than they run. */
const CALL = /^[A-Z0-9 ·&!—’'.,+\-]{0,48}$/;

const within = (n: unknown, lo: number, hi: number, otherwise: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : otherwise);

/** A ball's how, packed for the store: short keys, the flags as one number. */
export function packHow(how: BallHow): string {
  const s = how.swing;
  const outcome: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(how.outcome)) {
    // Who fielded it and where it hit him are another mode's, and objects: left behind.
    if (value === undefined || value === null && key !== 'timingDeltaMs' || typeof value === 'object' && value !== null) continue;
    outcome[key] = typeof value === 'number' ? Math.round(value * 1000) / 1000 : value;
  }
  return JSON.stringify({
    ...(s ? { s: s.shot, f: FLAGS.reduce((bits, flag, i) => bits | (s[flag] ? 1 << i : 0), 0), v: s.version, m: Math.round(s.meets * 1000) / 1000, a: Math.round(how.swingAfter) } : {}),
    r: Math.round(how.resolveAfter), o: outcome,
  });
}

/**
 * A how as it came off the wire, read against the ball's figure on the card
 * (`0` to `6`, or `W`): null unless it reads, and says the same as the card.
 */
export function readHow(raw: unknown, char: string | undefined): BallHow | null {
  if (typeof raw !== 'string' || !raw || raw.length > HOW_MAX || char === undefined) return null;
  let told: Record<string, unknown>;
  try { told = JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  if (!told || typeof told !== 'object') return null;
  const o = told.o as Record<string, unknown> | undefined;
  if (!o || typeof o !== 'object') return null;
  const isWicket = char === 'W', runs = isWicket ? 0 : Number(char);
  if (![0, 1, 2, 3, 4, 6].includes(runs) || o.runs !== runs || !!o.isWicket !== isWicket) return null;
  if (!GRADES.includes(o.timingGrade as TimingGrade)) return null;
  const outcome: Record<string, unknown> = {
    runs, isWicket, quality: 0, compatibility: 0, aerial: false, madeBatContact: false, timingGrade: o.timingGrade, timingDeltaMs: null,
    feedback: typeof o.feedback === 'string' && CALL.test(o.feedback) ? o.feedback : '',
  };
  for (const [key, value] of Object.entries(o)) {
    if (key in outcome && key !== 'quality' && key !== 'compatibility' && key !== 'aerial' && key !== 'madeBatContact' && key !== 'timingDeltaMs') continue;
    if (typeof value === 'boolean') outcome[key] = value;
    else if (NUMBERS[key] && typeof value === 'number' && Number.isFinite(value)) outcome[key] = within(value, NUMBERS[key][0], NUMBERS[key][1], 0);
    else if (key === 'wicketType' && isWicket && WICKETS.includes(value as WicketType)) outcome.wicketType = value;
    else if (key === 'side' && SIDES.includes(value as TimingSide)) outcome.side = value;
  }
  const resolveAfter = within(told.r, 0, 8000, -1);
  if (resolveAfter < 0) return null;
  let swing: HowSwing | null = null;
  if (told.s !== undefined) {
    if (!SHOTS.includes(told.s as ShotType)) return null;
    const bits = within(told.f, 0, (1 << FLAGS.length) - 1, 0) | 0, version = within(told.v, 1, 3, 2) | 0;
    swing = {
      shot: told.s as ShotType, version: (version === 1 || version === 3 ? version : 2), meets: within(told.m, -3, 3, 1),
      ...Object.fromEntries(FLAGS.map((flag, i) => [flag, !!(bits & 1 << i)])) as Record<typeof FLAGS[number], boolean>,
    };
  }
  return { swing, swingAfter: swing ? within(told.a, -3000, 8000, resolveAfter) : resolveAfter, resolveAfter, outcome: outcome as unknown as ShotOutcome };
}
