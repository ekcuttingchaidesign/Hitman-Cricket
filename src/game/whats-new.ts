/**
 * What changed, told the way a story is told.
 *
 * An update this size is invisible if nobody is shown it. The board grew four
 * ladders a game, every innings started counting towards something, and a card
 * appeared that is worth sending to people — and none of that is discoverable
 * by a player who opens the game, taps PLAY, and bats. So it is put in front of
 * them once, in the shape every phone already knows how to read: a handful of
 * cards, a bar across the top, a tap to move on.
 *
 * Four, and not one more. A player came here to bat, and the only thing that
 * makes an interruption forgivable is that it is over before they resent it.
 * Three of these say what the game now does; the fourth is the only one that
 * asks the player to do something, and it earns the extra card by being the
 * thing that makes the other three survive a new phone.
 *
 * The pictures are screenshots of the real screens, made by
 * `scripts/whatsnew-art.mjs`. Drawings of them would be a second design to keep
 * in step with the first, and would be wrong the first time either moved.
 */

const board = new URL('../assets/whatsnew/board.webp', import.meta.url).href;
const ladders = new URL('../assets/whatsnew/ladders.webp', import.meta.url).href;
const card = new URL('../assets/whatsnew/card.webp', import.meta.url).href;
const key = new URL('../assets/whatsnew/key.webp', import.meta.url).href;

export interface Story {
  key: string;
  /** The small line above the heading. */
  eyebrow: string;
  title: string;
  body: string;
  art: string;
  /** What the picture shows, for whoever cannot see it. */
  alt: string;
}

export const STORIES: readonly Story[] = [
  {
    key: 'board',
    eyebrow: 'LEADERBOARD',
    title: 'A new-look leaderboard',
    body: 'Tap to switch between The Blast, Test Survival and your own stats. Wherever you sit on the board, your row is the highlighted one.',
    art: board,
    alt: 'The leaderboard, with tabs for The Blast, Test Survival and My Stats, and one row lit as yours.',
  },
  {
    key: 'counts',
    eyebrow: 'ALL TIME',
    title: 'Every innings counts now',
    body: 'Not only your best one. Runs, boundaries, hundreds and your best individual score now add up over every innings you play — four all-time ladders under each game.',
    art: ladders,
    alt: 'The all-time runs ladder, with career totals and innings played beside each name.',
  },
  {
    key: 'card',
    eyebrow: 'MY STATS',
    title: 'And a card to prove it',
    body: 'Your figures, the tier you have climbed to, and the mark on it. Tap any number to see what it counts, then send the card to a group chat with the link to play riding along.',
    art: card,
    alt: 'A career stats card in the black and silver STAR theme, showing runs, highest, hundreds and best individual score.',
  },
  {
    key: 'key',
    eyebrow: 'CAREER KEY',
    title: 'Never lose your record',
    body: 'Phones forget. Register a score and you get a career key \u2014 three words and two numbers. Save it somewhere that is not this browser, and your record comes back on any phone.',
    art: key,
    alt: 'The career key card on My Stats, with a key of three words and two numbers across it and a key marked SAVE YOUR KEY.',
  },
];

/**
 * Which update this is.
 *
 * Kept in the key, so the next set of stories is a new key and shows itself to
 * everybody — including the players who have already read these ones. A single
 * "seen" flag would mean the second update in this game's life could never be
 * announced at all.
 */
export const UPDATE = 'career-key';

/**
 * How many times one browser is shown it unasked.
 *
 * Twice, because once is missed. The first is taken as an obstacle between the
 * player and the innings they came for, and skipped without a word of it being
 * read; the second lands on somebody who has already played and has a reason to
 * care what a ladder is. Three would be nagging.
 */
export const TIMES = 2;

const KEY = 'hitman-whatsnew';

/** How many times this browser has been shown this update. */
export function whatsNewShown(): number {
  try {
    const held = localStorage.getItem(KEY);
    if (!held) return 0;
    const [update, count] = held.split(':');
    if (update !== UPDATE) return 0;
    const times = Number(count);
    return Number.isInteger(times) && times > 0 ? times : 0;
  } catch {
    // No storage: every visit is the first one, and the stories are two taps.
    return 0;
  }
}

/** Whether it is shown on its own this time. */
export function whatsNewDue(): boolean {
  return whatsNewShown() < TIMES;
}

export function markWhatsNewShown() {
  try { localStorage.setItem(KEY, `${UPDATE}:${whatsNewShown() + 1}`); } catch { /* Then it asks again. */ }
}
