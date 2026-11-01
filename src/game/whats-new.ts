import type { Film } from '../ui/Lottie';
import type { ReelShot } from './ShotReel';

/**
 * What changed, told the way a story is told.
 *
 * An update is invisible if nobody is shown it, so it is put in front of a
 * player once, in the shape every phone already knows how to read: a card, a
 * bar across the top, a tap to move on.
 *
 * This update is Rivals live, told in one film (`public/stories/rivals.mp4`,
 * made as a canvas film by `rivals-film/` on the machine that made it, from
 * real screens of the game): who's around, a challenge sent from a profile,
 * one arriving on the bell with its total on the same balls, TARGET CHASED,
 * VICTORY, DEFEAT on the other phone with WIN IT BACK, and CALL THEM OUT,
 * held, with SEE WHO'S ONLINE beside the way out.
 * (Super10 was told before it in a film made in Remotion, the player profiles
 * before that in a Lottie film, the two new
 * strokes and the Dressing Room before them, the
 * Dressing Room's cards on their own first, and the Test Marathon's film and
 * the career key before that, each twice to everybody who played then. The
 * ways a story can be told — a picture, a film, the room's stage, a stroke
 * filmed in the game — are all kept for the next update.)
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
  /**
   * A video instead, the whole of the story as a film is (`public/stories/`),
   * played muted down the sheet and held on its last frame; `still` is that
   * frame, shown in its place under reduced motion.
   */
  video?: string;
  still?: string;
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
   * A way into the room the story is about, beside the way out under its
   * words. The last card holds still with it (`storyHolds`), so a player
   * tapping through lands on it.
   */
  opens?: 'dressing' | 'super10' | 'rivals';
  /**
   * The Dressing Room's own stage, the whole of the screen behind the words,
   * playing the real models: every kit on the batter in turn, or every bat on
   * the stand (`StoryStage.ts`). No picture to download and none
   * to go stale — a phone that cannot draw it cannot play the game either.
   */
  stage?: StoryStageKind;
  /**
   * A new stroke, filmed in the game: the ground behind the words is the
   * game's own, the batter playing it to its ball over and over, the camera
   * cutting in to the stroke and following the ball away (`ShotReel.ts`).
   * Where the game cannot film it — a story opened mid-innings — the words
   * stand on the sheet's own dark.
   */
  reel?: ReelShot;
}

/**
 * What a stroke's story puts over the film as the stroke is played: the swipe
 * that plays it, over the whole screen with the film held on the frame before
 * the bat comes down — to the leg side or down to the off side, the screen
 * turned round for a left-hander as the game's is — the key that plays it on a
 * keyboard, and what it went for, stamped as the ball is met.
 */
export const SHOT_CALLS: Record<ReelShot, { way: 'leg' | 'off'; key: string; call: string; where: string }> = {
  hook: { way: 'leg', key: 'A', call: 'SIX', where: 'TO LEG AT THE BOUNCER' },
  latecut: { way: 'off', key: 'D + S', call: 'FOUR', where: 'DOWN TO OFF, LATE' },
};

export type StoryStageKind = 'kits' | 'bats';

export const STORIES: readonly Story[] = [
  {
    key: 'rivals',
    eyebrow: 'WHAT’S NEW · RIVALS',
    title: 'WHO’S AROUND? CALL THEM OUT',
    alt: 'Faces pop up with green dots for online and an amber bat for batting now: who is around. Riya’s profile opens and CHALLENGE sends her a match, the Blast or Super10, you batting first. The bell rings with Kabir’s challenge and his 64 to beat on the same balls. TARGET CHASED, then VICTORY with a crown on your face; and on Kabir’s phone DEFEAT, an L stamped on his face, you laughing in the corner with LMAO NOOB, and WIN IT BACK. It ends on CALL THEM OUT over everybody who is on.',
    video: 'stories/rivals.mp4',
    still: 'stories/rivals-lockup.webp',
    // The last card with a way in holds still (`storyHolds`), on the film's last frame.
    opens: 'rivals',
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
export const UPDATE = 'rivals';

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

/** Whether it is shown on its own this time: the first two visits after the update. */
export function whatsNewDue(): boolean {
  return whatsNewShown() < TIMES;
}

export function markWhatsNewShown() {
  try {
    localStorage.setItem(KEY, `${UPDATE}:${whatsNewShown() + 1}`);
  } catch { /* Then it asks again. */ }
}
