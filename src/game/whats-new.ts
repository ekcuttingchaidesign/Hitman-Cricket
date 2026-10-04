/**
 * What changed, told the way a story is told.
 *
 * An update is invisible if nobody is shown it, so it is put in front of a
 * player once, in the shape every phone already knows how to read: a card, a
 * bar across the top, a tap to move on.
 *
 * This update is the Test Marathon: two cards for the mode, pictures of the
 * screens themselves — the card it is found by, and the scorecard a long
 * innings ends on — and then the key — said as a joke, with the key itself under it
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
 * The Marathon's screens, photographed at three times a phone's width and cut
 * to the part that tells the story: its card on Select Mode, and the worm and
 * the batting card from the end of an innings. Imported rather than served
 * from `public/`, so the build fingerprints them. (The Rivals launch's two,
 * `rivals-room.webp` and `rivals-result.webp`, are kept beside them.)
 */
const marathonHero = new URL('../assets/whatsnew/marathon-hero.webp', import.meta.url).href;
const marathonCard = new URL('../assets/whatsnew/marathon-card.webp', import.meta.url).href;

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
    key: 'marathon',
    eyebrow: 'NEW MODE \u00b7 TEST MARATHON',
    title: 'Bat all day',
    body: 'Three batters, as many balls as they last. Focus to settle in, then build. The pitch wears and the bowling gets tougher as the innings goes on.',
    art: marathonHero,
    alt: 'The Test Marathon card on the mode screen: a helmet, gloves and a red ball on the square, and a red PLAY key.',
    width: 720,
    height: 294,
  },
  {
    key: 'marathon-card',
    eyebrow: 'TEST MARATHON',
    title: 'Declare and get on the board',
    body: 'Declare when you\u2019re ready and put your score on the boards \u2014 the team total and your best batter. Find Test Marathon at the top of the mode screen.',
    art: marathonCard,
    alt: 'A Test Marathon scorecard: the runs climbing over 32 overs with a ball where each batter went, then each batter\u2019s runs, balls, fours, sixes and strike rate, and the total, 271 for 3.',
    width: 720,
    height: 753,
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
export const UPDATE = 'marathon-launch';

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
