import type { CareerMode } from './career.js';
import type { RecapMode, YearRecap } from './recap.js';

/**
 * What the year recap says, poster by poster ("Season '26: The Drop", the
 * Figma file's Year Recap page): which of the eleven a player gets, the
 * figure each one leads with, the words round it, the footer's figures, and
 * the batter on it — his stroke, the camera round him and the kit and bat he
 * is rendered in. A pure function of the player's year (`YearRecap`), where
 * their best stands on the boards, and the year's totals for everybody, so
 * every case is in `tests/recap-view.test.ts`; `src/ui/Recap.ts` draws it.
 *
 * It never says anything unkind and never makes a figure up: what the store
 * does not keep (runs by month, the longest six, a favourite stroke) is not on
 * a poster. A player with little to show gets the same set drawn for them
 * (the page's "A player with little to show"): metres in place of
 * kilometres, the big day in place of a streak, a count of the batters
 * behind in place of a share in the bottom half, the next kit or bat in place
 * of a runner-up, the New Ball under twenty innings. A poster with nothing to
 * say — no sixes, no fours, fewer than a hundred batters behind — is left
 * out and the set is numbered without it.
 */

export type PosterId = 'cover' | 'runs' | 'sixes' | 'fours' | 'when' | 'streak' | 'kit' | 'bat' | 'rank' | 'type' | 'season';

/** The order the posters stand in. */
export const POSTER_ORDER: readonly PosterId[] = ['cover', 'runs', 'sixes', 'fours', 'when', 'streak', 'kit', 'bat', 'rank', 'type', 'season'];

/** The batter on a poster: a still from `recap-stills`' renderer, cut out with the cream edge. */
export interface HeroAsk {
  shot: string; age: number; az: number; el: number; fov?: number;
  kit: string; bat: string; guard: string;
  only?: 'bat';
}

/** One figure in a poster's footer: a label over a value. */
export interface Fact { label: string; value: string }

export interface PosterBase {
  id: PosterId;
  /** Its place in the set as the player sees it, and how many there are. */
  n: number; of: number;
  /** The one roast, in its pill. */
  roast: string;
  facts: Fact[];
  hero: HeroAsk | null;
}

export type Look = 'day' | 'night';
export type TypeId = 'six' | 'artist' | 'wall' | 'finisher' | 'grinder' | 'newball';
export type Slice = 'world' | 'state' | 'club' | 'gully';

export interface CoverPoster extends PosterBase { id: 'cover'; name: string; since: string; disc: 'pink' | 'cobalt' | 'marigold'; arch: 'lime' | 'cream' }
export interface RunsPoster extends PosterBase {
  id: 'runs'; runs: number; average: string; best: number;
  /** A stump a mode, in the game's order; `runs` null for a mode never played, which stands as a stub. */
  stumps: { mode: CareerMode; label: string; runs: number | null; bail: boolean }[];
}
export interface HitsPoster extends PosterBase {
  id: 'sixes' | 'fours'; count: number;
  /** How far they went: `12.3 KM`, or `225 M` under a kilometre. */
  distance: string;
  /** What that distance is, set against something its own size. */
  line: string;
  word: string;
}
export interface WhenPoster extends PosterBase {
  id: 'when'; look: Look; hour: number; clock: string; name: string; word: string; share: number; line: string;
}
export interface StreakPoster extends PosterBase {
  id: 'streak';
  /** `streak` for three days running or more; `day` for the big day, the most innings in one day. */
  kind: 'streak' | 'day';
  figure: number; dates: string; line: string; word: string;
  /** What the figure counts, on two lines: DAYS / IN A ROW, or INNINGS / IN A DAY. */
  label: string;
  /**
   * Fifteen days as stumps, the ones it is about in the middle: each day's
   * date, whether it is in the streak (or is the big day), and the innings
   * played on it, which a big day's stumps stand as tall as.
   */
  bars: { date: string; lit: boolean; innings: number }[];
}
export interface KitPoster extends PosterBase {
  id: 'kit'; kit: string; name: string; innings: number;
  /** The kit's three colours for the colourway chips: shirt, trim, pads. */
  colours: [string, string, string];
  /** The number's colour: the kit's shirt. */
  ink: string;
  line: string;
}
export interface BatPoster extends PosterBase { id: 'bat'; bat: string; name: string; innings: number }
export interface RankPoster extends PosterBase {
  id: 'rank';
  /** `share` leads with TOP 9%; `count` (the bottom half) leads with the batters their best beat. */
  kind: 'share' | 'count';
  share: number; place: number; behind: number; ahead: number; slice: Slice;
  mode: CareerMode; modeName: string; field: number;
  /** The next slice up and the runs their best is short of it, where there is one. */
  next: { slice: Slice; runs: number } | null;
  /** The two lines under their place, by their face: how few are ahead, or the next step. */
  callout: string[];
  word: string; line: string;
}
export interface TypePoster extends PosterBase {
  id: 'type'; type: TypeId; top: string; bottom: string; word: string; figure: string; line: string; ground: string;
}
export interface SeasonPoster extends PosterBase {
  id: 'season'; name: string; lines: string[]; tag: string;
  tiles: { value: string; label: string; ground: string; ink: string; outlined?: boolean }[];
  /** The grounds of the posters before it, for the set's thumbnails. */
  set: { n: number; ground: string; outlined?: boolean }[];
}

export type Poster = CoverPoster | RunsPoster | HitsPoster | WhenPoster | StreakPoster | KitPoster | BatPoster | RankPoster | TypePoster | SeasonPoster;
/** A poster before the set is numbered. */
type Draft = Poster extends infer P ? P extends Poster ? Omit<P, 'n' | 'of'> : never : never;

/** A mode's best on its board: their place among the named batters, of how many, and the runs to the slices above. */
export interface Standing {
  place: number; of: number;
  /** The best score it takes to stand in each slice, where the store said: runs at the top tenth, quarter and half. */
  bars?: Partial<Record<'world' | 'state' | 'club', number>>;
  best?: number;
}

export interface RecapInput {
  year: number;
  /** The name they play under, or null for a player with none (the recap calls them YOU). */
  name: string | null;
  record: YearRecap;
  /** What they have on now in the Dressing Room: the cover wears it and every batter holds the bat. */
  kitNow: string; batNow: string; guardNow: string;
  /** Where their best stands on each mode's board. */
  standings?: Partial<Record<CareerMode, Standing>>;
  /** The year's totals for everybody (`recap:<year>:all`), for the average batter the type is judged against. */
  totals?: Record<string, number> | null;
  /** The next kit and bat they can put on, where they have worn only one. */
  nextKit?: string | null; nextBat?: string | null;
  /** The names of kits and bats, by id: the catalogue, handed in so this file reads no shelf. */
  kitNames: Record<string, string>; batNames: Record<string, string>;
  kitColours: Record<string, { shirt: string; trim: string; pads: string }>;
  /** A number fixed for the player, for the kit a screen is drawn in where it has two or three. */
  seed: number;
  /** The end of the season told: the recap is read in December, and a day counted is never after it. */
  now: number;
}

/** The poster grounds (the Drop's palette). */
export const INK = {
  cream: '#F2E8D5', ink: '#121212', tomato: '#F2441D', marigold: '#FFB000', green: '#0E7C5A', field: '#0A6A4C',
  cobalt: '#2340D9', night: '#0B0B0F', lime: '#C6FF3D', pink: '#FF3DA8', cyan: '#2DE2FF',
} as const;

const GROUND: Record<PosterId, string> = {
  cover: INK.night, runs: INK.marigold, sixes: INK.cream, fours: INK.field, when: INK.night, streak: INK.cobalt,
  kit: INK.cream, bat: INK.tomato, rank: INK.night, type: INK.pink, season: INK.cream,
};

export const MODE_NAMES: Record<CareerMode, string> = { classic: 'BLAST', super10: 'SUPER10', marathon: 'MARATHON', survive: 'SURVIVAL' };
const titleOf = (mode: CareerMode) => ({ classic: 'Blast', super10: 'Super10', marathon: 'Marathon', survive: 'Survival' })[mode];
/** The game's order, the runs poster's stumps left to right. */
const MODES: readonly CareerMode[] = ['classic', 'super10', 'marathon', 'survive'];

const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');
const pct = (share: number) => `${Math.round(share * 100)}%`;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** How far a six carries on average and a four runs, for the distances: what a six and a four look like in the game. */
export const SIX_CARRY_M = 75;
export const FOUR_RUN_M = 30;

/** The kits each screen is drawn in where it is not the player's own (the owner's picks, 23 November 2026). */
export const SCREEN_KITS = {
  sixes: ['violet'], fours: ['crimson', 'forest'], when: ['gold', 'lagoon'], type: ['lagoon', 'forest'], season: ['home', 'forest', 'violet'],
} as const;

/** The poses, from `recap-stills` (the notes under each poster). */
export const POSES = {
  cover: { shot: 'LOFTED_V2', age: 760, az: 55, el: -24, fov: 40 },
  sixes: { shot: 'PULL', age: 320, az: 135, el: -8 },
  fours: { shot: 'COVER', age: 620, az: 70, el: -8 },
  when: { shot: 'after:sky', age: 900, az: 40, el: -10 },
  kit: { shot: 'GUARD', age: 0, az: 215, el: -4 },
  bat: { shot: 'GUARD', age: 0, az: 70, el: 0, only: 'bat' as const },
  season: { shot: 'celebrate:double', age: 1800, az: 20, el: -12 },
  six: { shot: 'CUT', age: 660, az: 75, el: 3 },
  artist: { shot: 'STRAIGHT', age: 500, az: 60, el: -6 },
  wall: { shot: 'DEFEND_BACK', age: 380, az: -15, el: -4 },
  finisher: { shot: 'HELICOPTER', age: 320, az: 90, el: -6 },
  grinder: { shot: 'after:scrub', age: 1100, az: 60, el: -6 },
  newball: { shot: 'GUARD', age: 0, az: 35, el: -4 },
} as const;

const pick = <T>(list: readonly T[], seed: number, salt: number): T => list[Math.abs(Math.imul(seed ^ salt, 2654435761) >>> 0) % list.length];

/** The kit with the most innings in a count, then the one after it. */
function ranked(counts: Record<string, number>): [string, number][] {
  return Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const sumModes = (r: YearRecap, f: (m: RecapMode) => number) => MODES.reduce((s, mode) => s + (r.modes[mode] ? f(r.modes[mode]!) : 0), 0);

/** The clock's label for an hour: 0 is 12 AM, 13 is 1 PM. */
export const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;

/** The four names by the hour most innings began in, India's time. */
export function bandOf(hour: number): { name: string; word: string; look: Look; hours: number[]; span: string; roast: string } {
  if (hour >= 5 && hour <= 10) return { name: 'EARLY BIRD', word: 'अर्ली बर्ड', look: 'day', hours: [5, 6, 7, 8, 9, 10], span: '5 AM and 11 AM', roast: 'Up before the groundsman.\nEvery single day.' };
  if (hour >= 11 && hour <= 16) return { name: 'LUNCH BREAK', word: 'ऑफिस टाइम', look: 'day', hours: [11, 12, 13, 14, 15, 16], span: '11 AM and 5 PM', roast: 'Your boss thinks that\nwas a meeting.' };
  if (hour >= 17 && hour <= 21) return { name: 'PRIME TIME', word: 'प्राइम टाइम', look: 'night', hours: [17, 18, 19, 20, 21], span: '5 PM and 10 PM', roast: 'Dinner went cold.\nTwice.' };
  return { name: 'NIGHT OWL', word: 'रात का उल्लू', look: 'night', hours: [22, 23, 0, 1, 2, 3, 4], span: '10 PM and 5 AM', roast: 'The night watchman guards a\nwicket. You just don’t sleep.' };
}

/** A day key (`MM-DD`) as a date in the year, at noon UTC, so a day is never off by a zone. */
const dayAt = (year: number, key: string) => Date.UTC(year, Number(key.slice(0, 2)) - 1, Number(key.slice(3)), 12);
const keyOf = (at: number) => { const d = new Date(at); return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };
const DAY = 86_400_000;
const dateLabel = (year: number, key: string) => { const d = new Date(dayAt(year, key)); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };

/** The longest run of days batted in a row: its first and last day and how many innings were in it. */
export function longestStreak(days: Record<string, number>, year: number): { from: string; to: string; length: number; innings: number } | null {
  const keys = Object.keys(days).filter(k => days[k] > 0).sort();
  if (!keys.length) return null;
  let best = { from: keys[0], to: keys[0], length: 1, innings: days[keys[0]] };
  let run = { ...best };
  for (let i = 1; i < keys.length; i++) {
    if (dayAt(year, keys[i]) - dayAt(year, keys[i - 1]) === DAY) run = { from: run.from, to: keys[i], length: run.length + 1, innings: run.innings + days[keys[i]] };
    else run = { from: keys[i], to: keys[i], length: 1, innings: days[keys[i]] };
    if (run.length > best.length) best = run;
  }
  return best;
}

/** The share of a field a place is in, and its slice: World Class the top tenth, State Level the top quarter, Club Level the top half. */
export function sliceOf(place: number, of: number): { share: number; slice: Slice } {
  const share = place / of;
  return { share, slice: share <= .1 ? 'world' : share <= .25 ? 'state' : share <= .5 ? 'club' : 'gully' };
}
export const SLICE_NAMES: Record<Slice, string> = { world: 'WORLD CLASS', state: 'STATE LEVEL', club: 'CLUB LEVEL', gully: 'GULLY CRICKET' };
const ABOVE: Record<Slice, Slice | null> = { gully: 'club', club: 'state', state: 'world', world: null };

/** The top share, rounded up so nobody in the top tenth is told eleven. */
const topShare = (share: number) => Math.max(1, Math.ceil(share * 100));

/**
 * The type a player is: the one they stand furthest above the average batter
 * on, among those they have enough of to say so, or the New Ball under twenty
 * innings. The averages are the year's totals where the store has them and a
 * fixed guess where it keeps none (balls a Test innings, days played).
 */
export function typeOf(r: YearRecap, totals?: Record<string, number> | null): { type: TypeId; value: number } {
  if (r.innings < 20) return { type: 'newball', value: r.innings };
  const runs = sumModes(r, m => m.runs), sixes = sumModes(r, m => m.sixes), fours = sumModes(r, m => m.fours);
  const t = totals ?? {};
  const avgSix = t.runs ? (t.sixes ?? 0) * 6 / t.runs : .25;
  const avgFour = t.runs ? (t.fours ?? 0) * 4 / t.runs : .3;
  const avgS10 = t.innings ? (t['innings:super10'] ?? 0) / t.innings : .2;
  const tests = (r.modes.survive?.innings ?? 0) + (r.modes.marathon?.innings ?? 0);
  const testBalls = (r.modes.survive?.balls ?? 0) + (r.modes.marathon?.balls ?? 0);
  const days = Object.values(r.days).filter(n => n > 0).length;
  const s10 = r.modes.super10?.innings ?? 0;
  const scores: { type: TypeId; value: number; score: number }[] = [];
  if (runs > 0 && sixes >= 10) scores.push({ type: 'six', value: sixes * 6 / runs, score: sixes * 6 / runs / Math.max(avgSix, .05) });
  if (runs > 0 && fours >= 10) scores.push({ type: 'artist', value: fours * 4 / runs, score: fours * 4 / runs / Math.max(avgFour, .05) });
  if (tests >= 5) scores.push({ type: 'wall', value: testBalls, score: testBalls / tests / 30 });
  if (s10 >= 5) scores.push({ type: 'finisher', value: s10 / r.innings, score: s10 / r.innings / Math.max(avgS10, .05) });
  if (days >= 7) scores.push({ type: 'grinder', value: days, score: days / 20 });
  if (!scores.length) return { type: 'newball', value: r.innings };
  const best = scores.sort((a, b) => b.score - a.score)[0];
  return { type: best.type, value: best.value };
}

const TYPE_ORDER: readonly TypeId[] = ['six', 'artist', 'wall', 'finisher', 'grinder', 'newball'];
export const TYPE_NAMES: Record<TypeId, string> = {
  six: 'SIX MACHINE', artist: 'THE ARTIST', wall: 'THE WALL', finisher: 'THE FINISHER', grinder: 'THE GRINDER', newball: 'NEW BALL',
};

/** A name split for the season card: one line, or two at the space nearest its middle for a name over eight with a space in it. */
export function nameLines(name: string): string[] {
  const n = name.trim().toUpperCase().replace(/\s+/g, ' ');
  if (n.length <= 8 || !n.includes(' ')) return [n];
  const mid = n.length / 2;
  let at = -1;
  for (let i = 0; i < n.length; i++) if (n[i] === ' ' && (at < 0 || Math.abs(i - mid) < Math.abs(at - mid))) at = i;
  return [n.slice(0, at), n.slice(at + 1)];
}

/** A share of innings in words, as the kit poster says it. */
export function shareWords(share: number): string {
  if (share >= .97) return 'every innings you played';
  if (share >= .85) return 'nearly every innings';
  if (share >= .62) return 'two of every three innings';
  if (share >= .45) return 'half your innings';
  if (share >= .3) return 'a third of your innings';
  if (share >= .2) return 'one in every four innings';
  return 'more than any other';
}

/** Under a kilometre in metres, otherwise kilometres to a decimal. */
const distanceOf = (m: number) => m >= 1000 ? `${(m / 1000).toFixed(1)} KM` : `${fmt(m)} M`;

const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
/** How many times over, in words under ten as the design writes it: twice, three times, six and a half times. */
const times = (n: number) => {
  if (n <= 1.15) return 'once';
  if (n < 1.9) return 'nearly twice';
  if (n < 2.15) return 'twice';
  if (n >= 10) return `${fmt(n)} times`;
  const half = Math.round(n * 2) / 2;
  return `${WORDS[Math.floor(half)]}${half % 1 ? ' and a half' : ''} times`;
};

/** Laps of the rope: the boundary's 410 metres round, in words. */
const laps = (m: number) => { const n = m / 410; return n < 1.5 ? 'a lap of the rope' : `${times(n).replace(/ times$/, '').replace(/^twice$/, 'two')} laps of the rope`; };

function sixesLine(m: number): string {
  if (m >= 3600) return `of cricket ball in the air. Marine Drive, ${times(m / 3600)} over.`;
  if (m >= 410) return `of cricket ball in the air. That’s ${laps(m)}.`;
  return `of cricket ball in the air. A football pitch, ${times(m / 105)} end to end.`;
}
function foursLine(m: number): string {
  if (m >= 5600) return `along the ground. The Sea Link, ${times(m / 5600)} across.`;
  if (m >= 410) return `along the ground. That’s ${laps(m)}.`;
  return `along the ground. A football pitch, ${times(m / 105)} end to end.`;
}

/** The recap's posters for one player's year, in order and numbered. */
export function recapPosters(input: RecapInput): Poster[] {
  const { record: r, year, seed } = input;
  const name = (input.name ?? 'YOU').toUpperCase();
  const runs = sumModes(r, m => m.runs), balls = sumModes(r, m => m.balls);
  const sixes = sumModes(r, m => m.sixes), fours = sumModes(r, m => m.fours);
  const best = Math.max(0, ...MODES.map(mode => r.modes[mode]?.best ?? 0));
  const hundreds = sumModes(r, m => m.hundreds), fifties = sumModes(r, m => m.fifties);
  const strikeRate = balls ? Math.round(runs / balls * 100) : 0;
  const daysPlayed = Object.values(r.days).filter(n => n > 0).length;
  const heroBat = input.batNow;
  const hero = (pose: { shot: string; age: number; az: number; el: number; fov?: number; only?: 'bat' }, kit: string, bat = heroBat): HeroAsk =>
    ({ ...pose, kit, bat, guard: input.guardNow });
  const out: Draft[] = [];

  // 01 · Cover: the player's own kit, the disc and arch turned away from a kit that fights them.
  const kit = input.kitNow;
  const disc = kit === 'crimson' || kit === 'papaya' ? 'cobalt' : kit === 'violet' ? 'marigold' : 'pink';
  const arch = kit === 'gold' ? 'cream' : 'lime';
  out.push({
    id: 'cover', name, since: dateLabel(year, keyOf(r.first + 330 * 60_000)), disc, arch,
    roast: `${name}${input.name ? ' · OPENER' : ''}`, facts: [{ label: 'PLAYER', value: name }, { label: 'BATTING SINCE', value: dateLabel(year, keyOf(r.first + 330 * 60_000)) }],
    hero: hero(POSES.cover, kit),
  } as Omit<CoverPoster, 'n' | 'of'>);

  // 02 · Runs: a stump a mode, the bail on the most.
  const top = MODES.reduce<CareerMode | null>((b, mode) => (r.modes[mode]?.runs ?? -1) > (b ? r.modes[b]?.runs ?? -1 : -1) ? mode : b, null);
  out.push({
    id: 'runs', runs, average: r.innings ? (runs / r.innings).toFixed(1) : '0', best,
    stumps: MODES.map(mode => ({ mode, label: MODE_NAMES[mode], runs: r.modes[mode] ? r.modes[mode]!.runs : null, bail: mode === top && runs > 0 })),
    roast: runs >= 1000 ? 'Scorers have asked\nfor a raise.' : 'Every run counted.\nThe scorer checked.',
    facts: [{ label: 'INNINGS', value: fmt(r.innings) }, { label: 'HUNDREDS', value: fmt(hundreds) }, { label: 'FIFTIES', value: fmt(fifties) }],
    hero: null,
  } as Omit<RunsPoster, 'n' | 'of'>);

  // 03 · Sixes, 04 · Fours: how far they went, set against something their own size. None, no poster.
  if (sixes > 0) {
    const m = sixes * SIX_CARRY_M;
    out.push({
      id: 'sixes', count: sixes, distance: distanceOf(m), line: sixesLine(m), word: sixes >= 50 ? 'बूम बूम' : 'बूम',
      roast: sixes >= 50 ? 'Bowlers have started\na support group.' : 'The rope saw you coming.\nIt will remember.',
      facts: [{ label: 'AN INNINGS', value: (sixes / Math.max(1, r.innings)).toFixed(1) }, { label: 'RUNS IN SIXES', value: fmt(sixes * 6) }],
      hero: hero(POSES.sixes, pick(SCREEN_KITS.sixes, seed, 3)),
    } as Omit<HitsPoster, 'n' | 'of'>);
  }
  if (fours > 0) {
    const m = fours * FOUR_RUN_M;
    out.push({
      id: 'fours', count: fours, distance: distanceOf(m), line: foursLine(m), word: 'क्लासी',
      roast: fours >= 50 ? 'The rope has\nfiled a complaint.' : 'Along the carpet.\nNo fuss.',
      facts: [{ label: 'AN INNINGS', value: (fours / Math.max(1, r.innings)).toFixed(1) }, { label: 'RUNS IN FOURS', value: fmt(fours * 4) }],
      hero: hero(POSES.fours, pick(SCREEN_KITS.fours, seed, 4)),
    } as Omit<HitsPoster, 'n' | 'of'>);
  }

  // 05 · When you bat: named by the peak hour, day or night by its band.
  const hours = Object.entries(r.hours).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]));
  if (hours.length) {
    const hour = Number(hours[0][0]);
    const band = bandOf(hour);
    const inBand = band.hours.reduce((s, h) => s + (r.hours[String(h)] ?? 0), 0);
    out.push({
      id: 'when', look: band.look, hour, clock: hourLabel(hour), name: band.name, word: band.word, share: inBand / r.innings,
      line: `of your innings began between ${band.span}.`, roast: band.roast,
      facts: [{ label: band.span.replace(' and ', ' TO ').toUpperCase(), value: `${fmt(inBand)} INNINGS` }, { label: 'DAYS PLAYED', value: fmt(daysPlayed) }],
      hero: hero(POSES.when, pick(SCREEN_KITS.when, seed, 5)),
    } as Omit<WhenPoster, 'n' | 'of'>);
  }

  // 06 · Streak: three days running or more under one long bail; under that the big day.
  const streak = longestStreak(r.days, year);
  if (streak) {
    /** Fifteen days, the ones it is about in the middle, as the stumps under the bail. */
    const window = (from: string, to: string, lit: (key: string) => boolean): StreakPoster['bars'] => {
      const span = Math.round((dayAt(year, to) - dayAt(year, from)) / DAY) + 1;
      const shownTo = dayAt(year, to), shownFrom = span > 13 ? shownTo - 12 * DAY : dayAt(year, from);
      const before = Math.floor((15 - Math.round((shownTo - shownFrom) / DAY) - 1) / 2);
      const bars: StreakPoster['bars'] = [];
      for (let i = 0, d = shownFrom - before * DAY; i < 15; i++, d += DAY) {
        const k = keyOf(d);
        bars.push({ date: String(new Date(d).getUTCDate()), lit: new Date(d).getUTCFullYear() === year && lit(k), innings: new Date(d).getUTCFullYear() === year ? r.days[k] ?? 0 : 0 });
      }
      return bars;
    };
    if (streak.length >= 3) {
      const inIt = (k: string) => k >= streak.from && k <= streak.to;
      out.push({
        id: 'streak', kind: 'streak', figure: streak.length, word: 'ऑन फायर', label: 'DAYS\nIN A ROW',
        dates: streak.from.slice(0, 2) === streak.to.slice(0, 2)
          ? `${Number(streak.from.slice(3))} – ${dateLabel(year, streak.to)}` : `${dateLabel(year, streak.from)} – ${dateLabel(year, streak.to)}`,
        line: 'You batted every single day. Even the Tuesday.', bars: window(streak.from, streak.to, inIt),
        roast: 'Your thumbs have asked\nfor a rest day.',
        facts: [{ label: 'INNINGS IN IT', value: fmt(streak.innings) }, { label: 'DAYS PLAYED', value: fmt(daysPlayed) }],
        hero: null,
      } as Omit<StreakPoster, 'n' | 'of'>);
    } else {
      const [bigDay, n] = Object.entries(r.days).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(dayAt(year, bigDay)).getUTCDay()];
      out.push({
        id: 'streak', kind: 'day', figure: n, word: 'बिंज', label: n === 1 ? 'INNINGS\nIN A DAY' : 'INNINGS\nIN A DAY', dates: dateLabel(year, bigDay),
        line: `Your busiest day of the season. It was a ${weekday}.`,
        bars: window(bigDay, bigDay, k => k === bigDay), roast: 'One day you couldn’t\nput it down.',
        facts: [{ label: 'THAT DAY', value: `${fmt(n)} ${n === 1 ? 'INNINGS' : 'INNINGS'}` }, { label: 'LONGEST RUN', value: `${streak.length} ${streak.length === 1 ? 'DAY' : 'DAYS'}` }],
        hero: null,
      } as Omit<StreakPoster, 'n' | 'of'>);
    }
  }

  // 07 · Kit: the most worn, its own colours; the runner-up, or the next to put on.
  const kits = ranked(r.kits);
  if (kits.length) {
    const [id, n] = kits[0];
    const colours = input.kitColours[id] ?? { shirt: INK.cobalt, trim: INK.tomato, pads: INK.cream };
    const second = kits[1];
    out.push({
      id: 'kit', kit: id, name: (input.kitNames[id] ?? id).toUpperCase(), innings: n, colours: [colours.shirt, colours.trim, colours.pads], ink: colours.shirt,
      line: `Your most-worn kit: ${shareWords(n / r.innings)}.`,
      roast: kits.length > 1 ? 'Wash it. Please.' : 'One kit all year.\nThe Dressing Room misses you.',
      facts: [
        { label: 'WORN IN', value: `${fmt(n)} OF ${fmt(r.innings)}` },
        second ? { label: 'RUNNER-UP', value: `${(input.kitNames[second[0]] ?? second[0]).toUpperCase()} · ${fmt(second[1])}` }
          : { label: 'NEXT UP', value: (input.nextKit ? input.kitNames[input.nextKit] ?? input.nextKit : 'THE DRESSING ROOM').toUpperCase() },
      ],
      hero: hero(POSES.kit, id),
    } as Omit<KitPoster, 'n' | 'of'>);
  }

  // 08 · Bat: the most used, alone.
  const bats = ranked(r.bats);
  if (bats.length) {
    const [id, n] = bats[0];
    const second = bats[1];
    out.push({
      id: 'bat', bat: id, name: (input.batNames[id] ?? id).toUpperCase(), innings: n,
      roast: bats.length > 1 ? 'Handle with care.\nBowlers didn’t.' : 'Loyal to one bat.\nIt is loyal back.',
      facts: [
        { label: 'USED IN', value: `${fmt(n)} OF ${fmt(r.innings)}` },
        second ? { label: 'RUNNER-UP', value: `${(input.batNames[second[0]] ?? second[0]).toUpperCase()} · ${fmt(second[1])}` }
          : { label: 'NEXT UP', value: (input.nextBat ? input.batNames[input.nextBat] ?? input.nextBat : 'THE DRESSING ROOM').toUpperCase() },
      ],
      hero: hero(POSES.bat, kit, id),
    } as Omit<BatPoster, 'n' | 'of'>);
  }

  // 09 · You vs everyone: their best mode on the boards; the share in the top half, the batters behind below it.
  const standings = Object.entries(input.standings ?? {})
    .filter(([, s]) => s && s.of > 0 && s.place > 0 && s.place <= s.of)
    .map(([mode, s]) => ({ mode: mode as CareerMode, ...s!, ...sliceOf(s!.place, s!.of) }))
    .sort((a, b) => a.share - b.share || b.of - a.of);
  const lead = standings[0];
  let rank: RankPoster | null = null;
  if (lead && lead.of - lead.place >= 100) {
    const kind = lead.share <= .5 ? 'share' : 'count';
    const up = ABOVE[lead.slice];
    const bar = up && up !== 'gully' ? lead.bars?.[up] : undefined;
    const next = up && bar !== undefined && lead.best !== undefined ? { slice: up, runs: Math.max(1, bar - lead.best) } : null;
    const callout = lead.slice === 'world'
      ? [`ONLY ${fmt(lead.place - 1)}`, 'AHEAD OF YOU']
      : next ? [`NEXT STEP: ${SLICE_NAMES[next.slice]}`, `${fmt(next.runs)} ${next.runs === 1 ? 'RUN' : 'RUNS'} AWAY`] : [`NEXT STEP: ${SLICE_NAMES[up!]}`];
    const facts = next && lead.best !== undefined
      ? [{ label: 'YOUR BEST', value: fmt(lead.best) }, { label: `${SLICE_NAMES[next.slice]} AT`, value: fmt(bar!) }, { label: 'TO GO', value: `${fmt(next.runs)} ${next.runs === 1 ? 'RUN' : 'RUNS'}` }]
      : standings.slice(0, 3).map(s => ({ label: MODE_NAMES[s.mode], value: s.share <= .5 ? `TOP ${topShare(s.share)}%` : `#${fmt(s.place)}` }));
    rank = {
      id: 'rank', kind, share: lead.share, place: lead.place, behind: lead.of - lead.place, ahead: lead.place - 1, slice: lead.slice,
      mode: lead.mode, modeName: MODE_NAMES[lead.mode], field: lead.of, next, callout,
      word: { world: 'बिल्ट डिफरेंट', state: 'बिल्ट डिफरेंट', club: 'उभरता सितारा', gully: 'अंडरडॉग' }[lead.slice],
      line: kind === 'share' ? `On your best ${titleOf(lead.mode)}, against ${fmt(lead.of)} named batters.` : `That’s how many named batters your best ${titleOf(lead.mode)} beat.`,
      roast: { world: 'Don’t look\ndown.', state: 'Nearly at the top.\nDon’t get comfortable.', club: 'Club legend. Still buys\ntheir own chai.', gully: 'The only way is up.\nLiterally.' }[lead.slice],
      facts, hero: null, n: 0, of: 0,
    };
    out.push(rank);
  }

  // 10 · Personality: one of six.
  const t = typeOf(r, input.totals);
  const typeKit = pick(SCREEN_KITS.type, seed, 10);
  const typeFacts = (first: Fact, second: Fact): Fact[] => [first, second, { label: 'TYPE', value: `${TYPE_ORDER.indexOf(t.type) + 1} OF 6` }];
  const tests = (r.modes.survive?.innings ?? 0) + (r.modes.marathon?.innings ?? 0);
  const typed: Record<TypeId, () => Omit<TypePoster, 'n' | 'of' | 'id' | 'type' | 'hero'>> = {
    six: () => ({ top: 'SIX', bottom: 'MACHINE', word: 'मेन\nकैरेक्टर', figure: pct(t.value), line: 'of your runs came in sixes.\nThe rest was jogging.', ground: INK.pink,
      roast: 'Singles are a rumour\nyou once heard.', facts: typeFacts({ label: 'RUNS IN SIXES', value: pct(t.value) }, { label: 'STRIKE RATE', value: fmt(strikeRate) }) }),
    artist: () => ({ top: 'ARTIST', bottom: '', word: 'कलाकार', figure: pct(t.value), line: 'of your runs came in fours.\nAlong the ground, like a gentleman.', ground: INK.cobalt,
      roast: 'Sixes are for people who\ncan’t find the gap.', facts: typeFacts({ label: 'RUNS IN FOURS', value: pct(t.value) }, { label: 'FOURS', value: fmt(fours) }) }),
    wall: () => ({ top: 'WALL', bottom: '', word: 'दीवार', figure: fmt(t.value), line: 'balls faced in the Tests.\nYou left more than you hit.', ground: INK.tomato,
      roast: 'Bowlers aged visibly.', facts: typeFacts({ label: 'BALLS FACED', value: fmt(t.value) },
        (r.modes.survive?.wins ?? 0) > 0 ? { label: 'SURVIVED', value: fmt(r.modes.survive!.wins) } : { label: 'TEST INNINGS', value: fmt(tests) }) }),
    finisher: () => ({ top: 'FINISHER', bottom: '', word: 'फिनिशर', figure: pct(t.value), line: 'of your innings were Super10.\nThe Powerplay is just your warm-up.', ground: INK.night,
      roast: 'Calm down. It’s only\nthe tenth over.', facts: typeFacts({ label: 'SUPER10 INNINGS', value: fmt(r.modes.super10?.innings ?? 0) }, { label: 'BEST', value: fmt(r.modes.super10?.best ?? 0) }) }),
    grinder: () => {
      const span = Math.max(daysPlayed, Math.round((Math.min(input.now, Date.UTC(year, 11, 31, 18)) - r.first) / DAY) + 1);
      return { top: 'GRINDER', bottom: '', word: 'ग्राइंड मोड', figure: fmt(t.value), line: `days at the crease, out of ${fmt(span)}.\nThe pitch pays you rent.`, ground: INK.marigold,
        roast: 'Touch grass? You’re\nmowing it.', facts: typeFacts({ label: 'DAYS PLAYED', value: fmt(daysPlayed) }, { label: 'INNINGS', value: fmt(r.innings) }) };
    },
    newball: () => ({ top: 'NEW', bottom: 'BALL', word: 'फ्रेश', figure: fmt(r.innings), line: 'innings in. Still got the shine.\nAnything could happen.', ground: INK.pink,
      roast: 'Still shiny.\nGive it an over.', facts: typeFacts({ label: 'INNINGS', value: fmt(r.innings) }, { label: 'STRIKE RATE', value: fmt(strikeRate) }) }),
  };
  const typePoster = { id: 'type', type: t.type, ...typed[t.type](), hero: hero(POSES[t.type], typeKit) } as Omit<TypePoster, 'n' | 'of'>;
  out.push(typePoster);

  // 11 · Season card: six tiles of what the posters before it told, and the set.
  const streakPoster = out.find(p => p.id === 'streak') as StreakPoster | undefined;
  const tiles: SeasonPoster['tiles'] = [
    { value: fmt(runs), label: 'RUNS', ground: INK.tomato, ink: INK.ink },
    sixes > 0 ? { value: fmt(sixes), label: 'SIXES', ground: INK.marigold, ink: INK.ink } : { value: fmt(r.innings), label: 'INNINGS', ground: INK.marigold, ink: INK.ink },
    fours > 0 ? { value: fmt(fours), label: 'FOURS', ground: INK.field, ink: INK.cream } : { value: fmt(daysPlayed), label: 'DAYS PLAYED', ground: INK.field, ink: INK.cream },
    { value: fmt(best), label: 'BEST', ground: INK.cobalt, ink: INK.cream },
    streakPoster?.kind === 'streak' ? { value: fmt(streakPoster.figure), label: 'DAYS IN A ROW', ground: INK.ink, ink: INK.cream }
      : { value: fmt(streakPoster?.figure ?? 0), label: 'IN ONE DAY', ground: INK.ink, ink: INK.cream },
    rank ? (rank.kind === 'share' ? { value: `${topShare(rank.share)}%`, label: 'TOP OF ALL', ground: INK.cream, ink: INK.ink, outlined: true }
      : { value: fmt(rank.behind), label: 'BEHIND YOU', ground: INK.cream, ink: INK.ink, outlined: true })
      : { value: fmt(daysPlayed), label: 'DAYS PLAYED', ground: INK.cream, ink: INK.ink, outlined: true },
  ];
  out.push({
    id: 'season', name, lines: nameLines(name), tag: TYPE_NAMES[t.type], tiles, set: [],
    roast: TYPE_NAMES[t.type], facts: [{ label: 'PLAY IT', value: 'HITMANCRICKET.IN' }],
    hero: hero(POSES.season, pick(SCREEN_KITS.season, seed, 11)),
  } as Omit<SeasonPoster, 'n' | 'of'>);

  const of = out.length;
  const posters = out.map((p, i) => ({ ...p, n: i + 1, of }) as Poster);
  const season = posters[posters.length - 1] as SeasonPoster;
  season.set = posters.slice(0, -1).map(p => ({ n: p.n, ground: groundOf(p), outlined: groundOf(p) === INK.cream }));
  return posters;
}

/** The ground a poster stands on. */
export function groundOf(p: { id: PosterId; ground?: string; look?: Look }): string {
  if (p.id === 'type' && p.ground) return p.ground;
  if (p.id === 'when' && p.look === 'day') return INK.cream;
  return GROUND[p.id];
}
