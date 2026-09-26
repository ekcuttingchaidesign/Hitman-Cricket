/**
 * The names a challenge will not carry.
 *
 * A challenge name renders on somebody else's phone, in a notification they did
 * not ask for, from a link a friend forwarded — which is a different exposure
 * from the board, where a name sits in a list the reader chose to open. So a
 * short list of the words nobody should be handed by a game, checked in the
 * same folded form the board compares names in: case, spacing, punctuation and
 * accents are already gone by then, so `S.h.i.t` and `sh it` are the same word.
 *
 * Short and obvious, deliberately. A long list catches Scunthorpe and misses
 * the next spelling anyway; this catches the words a friend would actually type
 * to be funny, and the screen says why in one line. It runs on both sides of
 * the wire — the join step, so the refusal is inline rather than a round trip,
 * and the store, so it holds whatever the client did.
 */

const BLOCKED = [
  'fuck', 'shit', 'cunt', 'bitch', 'dick', 'cock', 'pussy', 'nigger', 'nigga', 'faggot', 'retard',
  'chutiya', 'chutiye', 'bhosdike', 'bhosdi', 'madarchod', 'behenchod', 'bhenchod', 'gandu', 'gaand',
  'lund', 'lauda', 'randi', 'harami', 'kutta', 'kutti', 'saala', 'saali', 'motherfucker', 'asshole',
  'wanker', 'twat', 'slut', 'whore', 'rape', 'nazi', 'hitler',
];

/** The form a name is compared in. Mirrors the board's `foldName` without importing it. */
function fold(name: string): string {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Whether a name is one the game will not put on a friend's phone. */
export function nameBlocked(name: string): boolean {
  const folded = fold(name);
  if (!folded) return false;
  return BLOCKED.some(word => folded.includes(word));
}

/** What the screen says, in one line, when it is. */
export const NAME_BLOCKED_REASON = "That name isn't allowed here. Pick something your friend will recognise.";
