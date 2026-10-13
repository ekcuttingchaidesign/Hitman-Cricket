import type { Film } from '../ui/Lottie';

/**
 * What changed, told the way a story is told.
 *
 * An update is invisible if nobody is shown it, so it is put in front of a
 * player once, in the shape every phone already knows how to read: a card, a
 * bar across the top, a tap to move on.
 *
 * This update is the Dressing Room: the kits, the bats, and bat styles, each
 * played full screen on the room's own stage, the last card holding still with
 * the way in under it.
 * (The Test Marathon's film and the career key, the update before, were told
 * twice to everybody who played then.)
 */
export interface Story {
  key: string;
  /** The small line above the picture. */
  eyebrow: string;
  /**
   * What the story is called. Read out rather than shown where the picture
   * already says it in bigger letters than a heading could.
   */
  title: string;
  /**
   * The line under the picture, where the picture needs one: two lines at
   * most on a phone, and no count of kits or bats, which only grow.
   */
  body?: string;
  /** The picture, for a story that is one. */
  art?: string;
  /** What the picture or the film shows, for whoever cannot see it. */
  alt: string;
  /** The picture's own width, so it is laid out before it has loaded. */
  width?: number;
  /** And its height, where it is not square. */
  height?: number;
  /**
   * The picture brings its own rounded corners, cut into it as transparency.
   * A frame drawn round it as well has corners of a different radius, and the
   * gap between the two curves shows as a thin outline at each corner.
   */
  cut?: boolean;
  /**
   * A film instead of a picture, the whole of the story: a Lottie from
   * `public/lotties/`, played down the screen from the top with the way out
   * under it. Its words are its own, so the story's are read out, not shown.
   */
  film?: Film;
  /** How long the story holds before it moves on, where it is not the usual. */
  holdMs?: number;
  /**
   * Whether the career key is drawn under the picture.
   *
   * A story that asks for something holds still: one that moved itself on
   * would take the key away from under a thumb on its way to it.
   */
  withKey?: boolean;
  /**
   * A way into the room the story is about, under its words: the last card
   * holds still with it, so a player tapping through lands on it.
   */
  opens?: 'dressing';
  /**
   * The Dressing Room's own stage, the whole of the screen behind the words,
   * playing the real models: every kit on the batter in turn, every bat on
   * the stand, or one bat (`StoryStage.ts`). No picture to download and none
   * to go stale — a phone that cannot draw it cannot play the game either.
   */
  stage?: StoryStageKind;
}

export type StoryStageKind = 'kits' | 'bats' | 'boom';

export const STORIES: readonly Story[] = [
  {
    key: 'suit-up',
    eyebrow: 'WHAT’S NEW · DRESSING ROOM',
    title: 'SUIT UP',
    body: 'Explore different kits, each one earned out in the middle.',
    alt: 'Your batter on a pedestal under a spotlight, changing from one kit to the next.',
    stage: 'kits',
  },
  {
    key: 'earn-your-willow',
    eyebrow: 'WHAT’S NEW · DRESSING ROOM',
    title: 'EARN YOUR WILLOW',
    body: 'Every bat in its own stickers, earned as you climb to Hitman.',
    alt: 'A bat on a stand under a spotlight, turning into the next bat and the next, each in its own stickers.',
    stage: 'bats',
  },
  {
    key: 'boom',
    eyebrow: 'WHAT’S NEW · DRESSING ROOM',
    title: 'BAT WITH STYLE',
    body: 'Explore different styles of bat. Your first one is waiting.',
    alt: 'The Boom bat standing on the pedestal under a spotlight, its pink grip and green and purple stickers.',
    stage: 'boom',
    opens: 'dressing',
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
export const UPDATE = 'dressing-room';

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
