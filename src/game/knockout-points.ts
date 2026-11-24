/**
 * What a Super Knockout match with friends is worth (`PRODUCT.md`, Figma
 * Battle Royale page, "Points by real players").
 *
 * Points go to the top three by place in the whole field of twelve, and how
 * many depends on how many real players batted: subs fill seats but never
 * add to what a match is worth, and a place a sub took pays nobody. A match
 * of fewer than three real players is practice and counts for nothing; a win
 * goes on the record only with four or more.
 *
 * Pure, and read by the store and the game alike, so the lobby's "worth" line
 * and what the store pays can never be two different tables.
 */

/** Real players in the match, from, and what first, second and third are paid. */
export const POINTS_TABLE: readonly (readonly [from: number, first: number, second: number, third: number])[] = [
  [10, 10, 5, 2],
  [8, 8, 4, 2],
  [6, 7, 3, 1],
  [4, 5, 2, 1],
  [0, 3, 1, 0],
];

/** How many real players a match needs before it pays, and before its win is counted. */
export interface PointsRules { pointsFrom: number; winsFrom: number }
/** The game's own rules: points from three real players, a counted win from four. */
export const LIVE_RULES: PointsRules = { pointsFrom: 3, winsFrom: 4 };
/**
 * A preview's and the dev server's: two is enough for both, so the owner's
 * phone and computer can see points land without a third device. Its keys are
 * the preview's own, so nothing it pays ever reaches a real board.
 */
export const PREVIEW_RULES: PointsRules = { pointsFrom: 2, winsFrom: 2 };

/** What first, second and third are paid in a match of this many real players; all nothing where it is practice. */
export function worthOf(reals: number, rules: PointsRules = LIVE_RULES): [number, number, number] {
  if (reals < rules.pointsFrom) return [0, 0, 0];
  const row = POINTS_TABLE.find(([from]) => reals >= from)!;
  return [row[1], row[2], row[3]];
}

/** What a place pays in a match of this many real players. */
export function pointsFor(place: number, reals: number, rules: PointsRules = LIVE_RULES): number {
  return place >= 1 && place <= 3 ? worthOf(reals, rules)[place - 1] : 0;
}

/** Whether a win in a match of this many real players goes on the record. */
export function winCounts(reals: number, rules: PointsRules = LIVE_RULES): boolean {
  return reals >= rules.winsFrom;
}

/** India's clock, as the year recap keeps it: the week turns over on Monday there. */
const ZONE_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** The week a moment falls in, as the date of its Monday in India: `2026-11-16`. The boards' "this week" is keyed on it. */
export function weekOf(now: number): string {
  const local = new Date(now + ZONE_MS);
  const sinceMonday = (local.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - sinceMonday * DAY_MS);
  return monday.toISOString().slice(0, 10);
}

/** A finish in words: 1st, 2nd, 3rd, 9th, 11th, 12th. */
export function ordinal(place: number): string {
  const tens = place % 100;
  const end = tens >= 11 && tens <= 13 ? 'th' : place % 10 === 1 ? 'st' : place % 10 === 2 ? 'nd' : place % 10 === 3 ? 'rd' : 'th';
  return `${place}${end}`;
}
