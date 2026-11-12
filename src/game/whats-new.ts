import type { Film } from '../ui/Lottie';
import { diwaliOn } from './diwali';
import type { ReelShot } from './ShotReel';
import { showSeconds, type CamShow } from './CameraShow';

/**
 * What changed, told the way a story is told.
 *
 * An update is invisible if nobody is shown it, so it is put in front of a
 * player once, in the shape every phone already knows how to read: a card, a
 * bar across the top, a tap to move on.
 *
 * The update is the cameras (`CAMERA_STORIES`), told through the game's own
 * cameras. Diwali week told the Diwali kits and bats on the room's stage
 * (`DIWALI_STORIES`), and between the two the update was Rivals live, told in one film (`public/stories/rivals.mp4`,
 * made as a canvas film by `rivals-film/` on the machine that made it, from
 * real screens of the game): who's around, a challenge sent from a profile,
 * one arriving on the bell with its total on the same balls, TARGET CHASED,
 * VICTORY (the winner gets the glory), DEFEAT (the loser gets the L) with
 * WIN IT BACK, and BRING IT ON, held, with SEE WHO'S ONLINE beside the way out.
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
  opens?: 'dressing' | 'super10' | 'rivals' | 'procam';
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
  /**
   * The game's own cameras, filmed through each in turn (`CameraShow.ts`):
   * the same six through Classic, Close and Pro Cam, or Pro Cam's quick ones
   * left alone in a Test match. The card's tag names the camera, or gives the
   * speed gun's figure, ball by ball.
   */
  show?: CamShow;
  /**
   * The Camera row's pictures on the card, each a key that picks that camera
   * there and then, the one in use outlined.
   */
  cameras?: boolean;
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

/** The room's stage: every kit or every bat on the shelf, or only Diwali's. */
export type StoryStageKind = 'kits' | 'bats' | 'diwali-kits' | 'diwali-bats';

export const RIVALS_STORIES: readonly Story[] = [
  {
    key: 'rivals',
    eyebrow: 'WHAT’S NEW · RIVALS',
    title: 'WHO’S AROUND? CHALLENGE ANYONE',
    alt: 'Faces pop up with green dots for online and an amber bat for batting now: who is around. Riya’s profile opens and CHALLENGE sends her a match, the Blast or Super10, you batting first. The bell rings with Kabir’s challenge and his 64 to beat on the same balls. TARGET CHASED, then the winner gets the glory, VICTORY with a crown on your face; and the loser gets the L, DEFEAT with an L stamped on Kabir’s face, you laughing in the corner with LMAO NOOB, and WIN IT BACK. It ends on BRING IT ON over everybody who is on.',
    video: 'stories/rivals.mp4',
    still: 'stories/rivals-lockup.webp',
    // The last card with a way in holds still (`storyHolds`), on the film's last frame.
    opens: 'rivals',
  },
];

/**
 * The cameras: the same six through Classic, Close and Pro Cam, then Pro
 * Cam sold on what it is for, the ball coming at the lens at 150 in a Test
 * match and gone past before it can be followed, then the Camera row's own
 * pictures to pick from, with TRY PRO CAM, which walks out into a Blast
 * watched from his eyes. The first two move on by themselves after one round
 * of their balls; the last holds still (`storyHolds`).
 */
export const CAMERA_STORIES: readonly Story[] = [
  {
    key: 'cameras-views',
    eyebrow: 'WHAT’S NEW · CAMERAS',
    title: 'THREE WAYS TO WATCH',
    body: 'The same six through Classic, Close and Pro Cam.',
    alt: 'One straight six played three times: from the game’s classic view behind the batter, from low and close behind him, and from his own eyes with Pro Cam.',
    show: 'views',
    holdMs: Math.round(showSeconds('views')),
  },
  {
    key: 'cameras-speed',
    eyebrow: 'NEW · PRO CAM',
    title: 'FEEL THE BALL SPEED',
    body: 'Pro Cam puts you behind the batter’s eyes. 150 clicks, coming straight at you.',
    alt: 'A Test match from the batter’s own eyes: the fast bowler runs in and the red ball comes at the lens at about 150 kilometres an hour and flashes past off stump into the keeper’s gloves, ball after ball.',
    show: 'speed',
    holdMs: Math.round(showSeconds('speed')),
  },
  {
    key: 'cameras-pick',
    eyebrow: 'WHAT’S NEW · CAMERAS',
    title: 'PICK YOUR CAMERA',
    body: 'Change it any time: pause, then Camera.',
    alt: 'The three cameras as pictures, Classic, Close and Pro Cam, each a key that picks it.',
    cameras: true,
    opens: 'procam',
  },
];

/**
 * Diwali week: the five kits on the batter in turn, each with one of the
 * firecracker bats, then the five bats on the stand, both on the room's own
 * stage, so there is nothing to download and nothing to go stale, and both
 * with GO TO DRESSING ROOM. The last holds still (`storyHolds`).
 */
export const DIWALI_STORIES: readonly Story[] = [
  {
    key: 'diwali-kits',
    eyebrow: 'WHAT’S NEW · DIWALI',
    title: 'DIWALI KITS ARE HERE',
    body: 'Festive kurtas for the Blast and Rivals. Free all Diwali week.',
    alt: 'The batter turns on the Dressing Room pedestal in each Diwali kit in turn: maroon with gold butis, royal blue with feathers, ivory with pastel florals, bottle green with a red fuse, and mustard patola.',
    stage: 'diwali-kits',
    // Five kits at 800ms each, once round and a beat on the last.
    holdMs: 4500,
    opens: 'dressing',
  },
  {
    key: 'diwali-bats',
    eyebrow: 'WHAT’S NEW · DIWALI',
    title: 'FIRECRACKER BATS',
    body: 'A rocket, a sutli bomb, a ladi and more. Free all Diwali week.',
    alt: 'Each Diwali bat turns on the stand in turn: Golden Arrow the rocket, Dhoom the sutli bomb, Chain Reaction the ladi, Angaar the anaar and Chakri the ground spinner.',
    stage: 'diwali-bats',
    // Five bats at 650ms each, once round, then on to the Rivals film.
    holdMs: 4000,
    opens: 'dressing',
  },
];

/**
 * What the update tells at `now`: during Diwali week the Diwali kits and bats
 * and then the Rivals film, still the latest thing in the game, which holds
 * last and goes on to Choose a mode as it always has; Rivals alone after it.
 */
const DIWALI_RUN: readonly Story[] = [...DIWALI_STORIES, ...RIVALS_STORIES];
export const storiesAt = (now: number): readonly Story[] => (diwaliOn(now) ? DIWALI_RUN : CAMERA_STORIES);
export const updateAt = (now: number) => (diwaliOn(now) ? 'diwali' : 'cameras');
/** The update's stories, as the page loaded. */
export const STORIES: readonly Story[] = storiesAt(Date.now());

/**
 * Which update this is.
 *
 * Kept in the key, so the next set of stories is a new key and shows itself to
 * everybody — including the players who have already read these ones. A single
 * "seen" flag would mean the second update in this game's life could never be
 * announced at all.
 */
export const UPDATE = updateAt(Date.now());

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
/**
 * The updates whose counts are kept side by side (`rivals:1,diwali:2`), so
 * Diwali's two showings do not use up Rivals' for a player who has seen it
 * once, and Rivals comes back to them after Diwali week.
 */
const KEPT_UPDATES = ['rivals', 'diwali', 'cameras'];
/**
 * What the browser checks seed (`rivals:9`) to keep the stories out of their
 * way. No player is ever shown an update more than `TIMES`, so a count this
 * high is a check, and keeps every update's stories away, not only its own.
 */
const CHECKS = 9;

/** The counts this browser holds, by update. */
function held(): Map<string, number> {
  const counts = new Map<string, number>();
  const raw = localStorage.getItem(KEY);
  for (const part of raw ? raw.split(',') : []) {
    const [update, count] = part.split(':');
    const times = Number(count);
    if (update && Number.isInteger(times) && times > 0) counts.set(update, times);
  }
  return counts;
}

/** How many times this browser has been shown this update. */
export function whatsNewShown(): number {
  try {
    const counts = held();
    if ([...counts.values()].some(times => times >= CHECKS)) return Math.max(TIMES, counts.get(UPDATE) ?? 0);
    return counts.get(UPDATE) ?? 0;
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
    const counts = held();
    counts.set(UPDATE, whatsNewShown() + 1);
    // Only the updates still told are kept; an older update's count goes.
    const kept = [...counts].filter(([update]) => KEPT_UPDATES.includes(update) || update === UPDATE);
    localStorage.setItem(KEY, kept.map(([update, times]) => `${update}:${times}`).join(','));
  } catch { /* Then it asks again. */ }
}
