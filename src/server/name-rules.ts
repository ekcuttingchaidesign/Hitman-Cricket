/**
 * The rules a name is held to, beyond being unique.
 *
 * Unique is `foldName`'s business, in `board-store.ts`: case, spacing,
 * punctuation and accents are thrown away, so "Big Show" and "bigshow" are one
 * name. Numbers are kept, so "Rohit45" and "Rohit7" are two — plenty of people
 * bat under a number, and that is fine.
 *
 * What is not fine is one person claiming "Name", "Name 1", "Name 2" and
 * "Name 3" within minutes of each other to stand on the board four times. Those
 * are siblings: the same name but for a number on the end. A sibling cannot be
 * claimed within a day of another sibling being claimed by somebody else — see
 * `SIBLING_WINDOW_MS` — which turns the copies into a prompt to bring the old
 * career back, and leaves a genuine Rohit45 three weeks later alone.
 */

/** How long after one sibling is claimed another may not be, by anybody else. */
export const SIBLING_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The name a folded name is a sibling of: the folded form with the number on
 * its end taken off. "rohit", "rohit1" and "rohit45" all come back "rohit". A
 * name that is nothing but a number has no siblings — it comes back whole.
 */
export function siblingBase(folded: string): string {
  const base = folded.replace(/\d+$/, '');
  return base || folded;
}

/** Whether two folded names are siblings: different names, the same but for the number on the end. */
export function areSiblings(a: string, b: string): boolean {
  return a !== b && siblingBase(a) === siblingBase(b);
}
