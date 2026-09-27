/**
 * What changed, told the way a story is told.
 *
 * An update is invisible if nobody is shown it, so it is put in front of a
 * player once, in the shape every phone already knows how to read: a card, a
 * bar across the top, a tap to move on.
 *
 * This update is Rivals: two cards for the mode, pictures of the screens
 * themselves, and then the key — said as a joke, with the key itself under it
 * so the ask and the means of doing it are on the same screen. The key goes
 * last because it is the one card that holds still: everything before it moves
 * on by itself, and a player tapping through lands on the card that wants
 * something from them rather than skipping past it.
 */

/**
 * Served from `public/` as the file was uploaded, space and all, so the name
 * is written encoded. Relative, because the build is served from `./`.
 */
const meme = 'save%20key%20meme.png';

/**
 * The Rivals screens, photographed from the `?room=` fixtures at three times a
 * phone's width and cut to the part that tells the story. Imported rather than
 * served from `public/`, so the build fingerprints them.
 */
const rivalsRoom = new URL('../assets/whatsnew/rivals-room.webp', import.meta.url).href;
const rivalsResult = new URL('../assets/whatsnew/rivals-result.webp', import.meta.url).href;

export interface Story {
  key: string;
  /** The small line above the picture. */
  eyebrow: string;
  /**
   * What the story is called. Read out rather than shown where the picture
   * already says it in bigger letters than a heading could.
   */
  title: string;
  /** The line under the picture, where the picture needs one. */
  body?: string;
  art: string;
  /** What the picture shows, for whoever cannot see it. */
  alt: string;
  /** The picture's own width, so it is laid out before it has loaded. */
  width: number;
  /** And its height, where it is not square. */
  height?: number;
  /**
   * The picture brings its own rounded corners, cut into it as transparency.
   * A frame drawn round it as well has corners of a different radius, and the
   * gap between the two curves shows as a thin outline at each corner.
   */
  cut?: boolean;
  /**
   * Whether the career key is drawn under the picture.
   *
   * A story that asks for something holds still: one that moved itself on
   * would take the key away from under a thumb on its way to it.
   */
  withKey?: boolean;
}

export const STORIES: readonly Story[] = [
  {
    key: 'rivals',
    eyebrow: 'NEW MODE \u00b7 RIVALS',
    title: 'Bat against your friends',
    body: 'Make a room, send the link, and everyone who opens it bats the same thirty balls \u2014 together right now, or days apart. Their runs flash up ball by ball. The score stays hidden till your last.',
    art: rivalsRoom,
    alt: 'The Rivals match room: You, Rahul and Priya seated round a VS, each marked JOINED.',
    width: 720,
    height: 709,
  },
  {
    key: 'rivals-result',
    eyebrow: 'RIVALS',
    title: 'Winner gets the fire',
    body: 'Top score takes the match and the flames round their face. Every result goes on your record \u2014 won, lost, drawn \u2014 in Rival Matches and on My Stats. Find Rivals on the mode screen.',
    art: rivalsResult,
    alt: 'A Rivals result: fire round the winner\u2019s face over You Win, then WINNER and LOSER rows with runs, sixes and fours.',
    width: 720,
    height: 760,
  },
  {
    key: 'save-key',
    eyebrow: 'CAREER KEY',
    title: 'Save your career key',
    art: meme,
    alt: 'Bernie Sanders in a winter coat, captioned: I am once again asking you to save your career key.',
    width: 370,
    cut: true,
    withKey: true,
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
export const UPDATE = 'rivals-launch';

/**
 * How many times one browser is shown it unasked.
 *
 * Twice, because once is missed. The first is taken as an obstacle between the
 * player and the innings they came for, and skipped without a word of it being
 * read; the second lands on somebody who has already played and has a record
 * worth keeping. Three would be nagging.
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
