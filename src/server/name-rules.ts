import { nameBlocked } from './name-filter.js';

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

/** The least a name can be: three letters or numbers, once spaces and punctuation are set aside. */
export const NAME_MIN = 3;
/**
 * Names the game keeps for itself, matched whole: a row called "Admin" or
 * "Hitman Cricket" looks official, and a row that looks official is a row
 * somebody will believe. Whole, not on the sibling base — the game is named
 * for Rohit Sharma's nickname, and "Hitman45" is a fan, not an impostor.
 */
const RESERVED = new Set(['hitman', 'hitmancricket', 'admin', 'administrator', 'official', 'moderator', 'support']);

/**
 * What is wrong with a name somebody is claiming for the first time, in one line
 * they can act on, or null when nothing is. Held names are never put to this
 * again: a name claimed under older rules goes on working.
 *
 * Letters (accents too), numbers, spaces and `.` `_` `-` `'` — Latin letters,
 * because the registry compares names in folded Latin and a name in another
 * script folds to nothing, which would make two different names one. At least
 * one letter, so a name is a name and not a number. No run of seven digits: a
 * phone number on a public board is somebody's, and nearly always a mistake.
 */
export function nameProblem(name: string, folded: string): string | null {
  // The characters first: a name in another script folds to nothing, and being
  // told it is too short would be the wrong thing to fix.
  if (!/^[\p{Script=Latin}\p{M}0-9 ._'-]+$/u.test(name)) return 'Use letters, numbers, spaces, or . _ - \' only.';
  if (folded.length < NAME_MIN) return `At least ${NAME_MIN} letters or numbers.`;
  if (!/\p{Script=Latin}/u.test(name)) return 'Put at least one letter in it.';
  if (/\d{7,}/.test(name)) return 'Too many numbers in a row. Keep your phone number off the board.';
  if (RESERVED.has(folded)) return 'That name is kept for the game. Pick another.';
  if (nameBlocked(name)) return "That name isn't allowed here. Pick something your friends will recognise.";
  return null;
}

/**
 * How long after taking a new name a player waits to take another.
 *
 * A name is how the board, the career boards and a friend's Rivals link know
 * somebody, so one that changes every day is no name at all — and changing it
 * freely was the other way to stand on the board as somebody new. Going back
 * to a name the player already holds is not a change and is never held back:
 * every name a player has taken stays theirs.
 */
export const RENAME_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** "7 Nov": a day and a month, in the one time zone the store keeps. */
function day(at: number): string {
  return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** What a second new name inside the window says: when the last was taken, and when the next can be. */
export function renameReason(lastAt: number): string {
  return `You took your name on ${day(lastAt)}. You can change it again from ${day(lastAt + RENAME_WINDOW_MS)}.`;
}

/** What a sibling claimed in the last day says, naming the one that is held. */
export function siblingReason(held: string): string {
  return `${held} was claimed in the last day. Is it you? Bring your career back with your key.`;
}
