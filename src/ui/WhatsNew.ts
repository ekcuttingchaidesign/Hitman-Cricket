import { escape } from './Leaderboard';
import { SHOT_CALLS, STORIES, type Story } from '../game/whats-new';
import { CUE, type ReelShot } from '../game/ShotReel';
import { MARK, type KeyView } from './CareerKey';
import { cta } from './Kit';

/**
 * The stories, as a screen.
 *
 * Everything about the shape is borrowed on purpose: the segmented bar across
 * the top, the whole page as a tap target, forward on the right and back on the
 * left. Nobody has to be taught any of it, which is the only reason an
 * interruption like this is affordable at all.
 *
 * What is not borrowed is the way out. A story app hides it; this one keeps a
 * key on the bottom edge the whole time, because a player who wants to bat
 * rather than read should never have to hunt for the door — and a door that is
 * always there is what makes showing this twice forgivable.
 */

/** Where the stories were opened from, which is the only thing that differs. */
export type StoriesWhere = 'intro' | 'board';

export interface StoriesView {
  at: number;
  where: StoriesWhere;
  /** How long one story holds before it moves on, for the bar to run against. */
  holdMs: number;
  /**
   * Whether this build, or this link, has already chosen the mode.
   *
   * The key says where it goes, and where it goes is not the same in every
   * build: one that plays a single mode has no picker to skip to, and a key
   * promising one would be the only thing on the screen that lies.
   */
  locked?: boolean;
  /**
   * The player's key, for a story that carries one. Null for a player with no
   * name, who has no key to save and is shown no card.
   */
  careerKey?: KeyView | null;
  /** The cards this run plays: the whole update unless the caller says otherwise. */
  stories?: readonly Story[];
}

export function storiesMarkup(view: StoriesView): string {
  const { at, where, holdMs, locked = false, careerKey = null, stories = STORIES } = view;
  const story = stories[at] ?? stories[0];
  const holds = storyHolds(at, stories);
  const live = (i: number) => i !== at ? '' : holds ? ' is-live is-held' : ' is-live';
  const art = story.art ? `<img${story.cut ? ' class="is-cut"' : ''} src="${story.art}" alt="${escape(story.alt)}" width="${story.width}" height="${
    story.height ?? story.width}" draggable="false">` : '';
  // A film is the whole story: played down the sheet from the top, under the
  // bars and over nothing, with the way out under it. It says its own words.
  // A story on the stage is the whole screen too, the stage behind the words,
  // and the room left between them is where the camera stands the batter.
  // A stroke's film is the game's own ground under the whole screen, edge to
  // edge: the sheet is see-through and the room between the words is where
  // the camera has him.
  const kind = story.film ? ' is-film' : story.stage ? ' is-stage' : story.reel ? ' is-reel' : '';
  return `
    <div class="whatsnew-sheet${kind}" role="document" aria-roledescription="story">${
  story.film ? `
      <div id="whatsnew-film" class="whatsnew-film" role="img" aria-label="${escape(story.alt)}"></div>` : ''}${
  story.stage ? `
      <div id="whatsnew-stage" class="whatsnew-stage" data-stage="${story.stage}" role="img" aria-label="${escape(story.alt)}"></div>` : ''}${
  story.reel ? `
      <div class="whatsnew-reel" data-reel="${story.reel}" role="img" aria-label="${escape(story.alt)}"></div>${shotCueMarkup(story.reel)}` : ''}
      <div class="whatsnew-bars" aria-hidden="true">${stories.map((_, i) => `
        <span class="whatsnew-bar${i < at ? ' is-done' : live(i)}"${
  i === at && !holds ? ` style="--hold:${story.holdMs ?? holdMs}ms"` : ''}><i></i></span>`).join('')}
      </div>
      <button id="whatsnew-back" class="whatsnew-half is-back" type="button" aria-label="Previous"></button>
      <button id="whatsnew-next" class="whatsnew-half is-next" type="button" aria-label="Next"></button>
      <div class="whatsnew-body">
        ${story.film ? '' : `<p class="whatsnew-eyebrow">${escape(story.eyebrow)}</p>`}
        <h2 class="whatsnew-title${story.body ? '' : ' is-unseen'}">${escape(story.title)}</h2>${story.stage || story.reel ? `
        <div id="whatsnew-room" class="whatsnew-room" aria-hidden="true">${story.reel ? shotCallMarkup(story.reel) : ''}</div>` : ''}${art ? `
        <div class="whatsnew-art">
          ${art}
        </div>` : ''}
        ${story.body ? `<p class="whatsnew-say" aria-live="polite">${escape(story.body)}</p>` : ''}
        ${story.withKey ? `<div id="whatsnew-keyslot" class="whatsnew-keyslot">${
  storyKeyMarkup(careerKey)}</div>` : ''}
      </div>${story.opens ? `
      <div class="whatsnew-foot is-pair">
        ${cta({ kind: 'secondary', label: where === 'board' ? 'CLOSE' : 'SKIP', id: 'whatsnew-done' })}
        ${cta({ kind: 'primary', label: 'GO TO DRESSING ROOM', id: 'whatsnew-open' })}
      </div>` : `
      <div class="whatsnew-foot">
        <button id="whatsnew-done" class="key-button whatsnew-key" type="button">${
  wayOut(where, locked)}</button>
      </div>`}
    </div>`;
}

/**
 * Whether a card holds still rather than moving on by itself.
 *
 * One carrying the key does: moving on would take it from under a thumb on its
 * way there. So does the last card with the way in, because moving on from it
 * puts the stories away under whoever is reaching for it. An earlier card with
 * the way in moves on as any other — the next has the same two keys in the
 * same place, so nothing is taken from under anybody.
 */
export function storyHolds(at: number, stories: readonly Story[] = STORIES): boolean {
  const story = stories[at];
  return !!story && (!!story.withKey || (!!story.opens && at === stories.length - 1));
}

/**
 * The key under the picture: the save card from My Stats.
 *
 * A key held is printed, and the press opens the save sheet. A name without a
 * key gets the same card without the print, and the press makes one and opens
 * the sheet on it. A player with no name has no key to save, so is shown no
 * card at all — a save key with nothing behind it would be the one lie on the
 * screen, and the picture above says the rest.
 *
 * Its own ids rather than the card's, because My Stats can be standing under
 * this story when it is opened from the board.
 */
export function storyKeyMarkup(view: KeyView | null): string {
  if (!view) return '';
  const held = view.state !== 'lost';
  return `
    <section class="key-pass whatsnew-keypass" aria-labelledby="whatsnew-key-title">
      <div class="key-face">
        <div class="key-stamp">
          <span class="key-mark" aria-hidden="true">${MARK}</span>
          <h3 id="whatsnew-key-title">Save your key</h3>
        </div>
        ${held ? `<p class="key-serial"><span>${escape(view.code ?? '')}</span></p>` : ''}
        <p class="key-line">The only way back to your record if this browser forgets you.</p>
        <button id="${held ? 'whatsnew-key-save' : 'whatsnew-key-make'}" class="key-save" type="button">SAVE YOUR KEY</button>
      </div>
    </section>`;
}

/**
 * What a stroke's film stamps over him as the ball is met (`SHOT_CALLS`): what
 * it went for, on the side it went. It waits, unseen, for the film to say when
 * (`is-hit` on the sheet), so it lands on the stroke and not on a clock of its own.
 */
export function shotCallMarkup(shot: ReelShot): string {
  const { way, call } = SHOT_CALLS[shot];
  return `
          <span class="whatsnew-call" data-way="${way}" data-call="${call.toLowerCase()}">${escape(call)}</span>`;
}

/**
 * The swipe that plays it, over the whole screen: the film holds on the frame
 * before the bat comes down, a shade comes over it, a great arrow the way the
 * thumb goes with a thumb running down it twice — or on a keyboard, the key —
 * and then it fades and the film goes on from that frame (`CUE`, `is-cueing`
 * on the sheet). The arrow is drawn down and to the leg side of a right-hander,
 * turned round for the off side and for a left-hander, whose screen the game
 * turns round.
 */
export function shotCueMarkup(shot: ReelShot): string {
  const { way, key, where } = SHOT_CALLS[shot];
  return `
      <div class="whatsnew-cue" data-way="${way}" style="--cue:${CUE.ms}ms" aria-hidden="true">
        <div class="whatsnew-cue-pad">
          <span class="whatsnew-cue-track"><svg viewBox="0 0 200 160"><path class="whatsnew-cue-lane" d="M168 20 32 128"/><polygon class="whatsnew-cue-head" points="32,128 61.1,122.8 43.7,100.8"/></svg><i class="whatsnew-cue-thumb"></i></span>
          <b class="whatsnew-cue-word"><span class="touch-only">SWIPE</span><span class="keyboard-only">PRESS <kbd>${escape(key)}</kbd></span></b>
          <span class="whatsnew-cue-where">${escape(where)}</span>
        </div>
      </div>`;
}

/** What the key says, which is wherever pressing it actually lands. */
function wayOut(where: StoriesWhere, locked: boolean): string {
  if (where === 'board') return 'CLOSE';
  return locked ? 'SKIP AND START BATTING' : 'SKIP TO MODE SELECTION';
}

/** The whole update as a sentence, for a screen reader arriving at the first card. */
export function storiesAlt(stories: readonly Story[] = STORIES): string {
  return `What's new, in ${stories.length}: ${stories.map(one => one.title).join('. ')}.`;
}
