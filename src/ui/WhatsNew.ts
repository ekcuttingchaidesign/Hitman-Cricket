import { escape } from './Leaderboard';
import { STORIES, type Story } from '../game/whats-new';
import { MARK, type KeyView } from './CareerKey';

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
}

export function storiesMarkup(view: StoriesView): string {
  const { at, where, holdMs, locked = false, careerKey = null } = view;
  const story = STORIES[at] ?? STORIES[0];
  const live = (i: number) => i !== at ? '' : story.withKey ? ' is-live is-held' : ' is-live';
  return `
    <div class="whatsnew-sheet" role="document" aria-roledescription="story">
      <div class="whatsnew-bars" aria-hidden="true">${STORIES.map((_, i) => `
        <span class="whatsnew-bar${i < at ? ' is-done' : live(i)}"${
  i === at && !story.withKey ? ` style="--hold:${holdMs}ms"` : ''}><i></i></span>`).join('')}
      </div>
      <button id="whatsnew-back" class="whatsnew-half is-back" type="button" aria-label="Previous"></button>
      <button id="whatsnew-next" class="whatsnew-half is-next" type="button" aria-label="Next"></button>
      <div class="whatsnew-body">
        <p class="whatsnew-eyebrow">${escape(story.eyebrow)}</p>
        <h2 class="whatsnew-title${story.body ? '' : ' is-unseen'}">${escape(story.title)}</h2>
        <div class="whatsnew-art">
          <img${story.cut ? ' class="is-cut"' : ''} src="${story.art}" alt="${escape(story.alt)}" width="${story.width}" height="${
  story.width}" draggable="false">
        </div>
        ${story.body ? `<p class="whatsnew-say" aria-live="polite">${escape(story.body)}</p>` : ''}
        ${story.withKey ? `<div id="whatsnew-keyslot" class="whatsnew-keyslot">${
  storyKeyMarkup(careerKey)}</div>` : ''}
      </div>
      <div class="whatsnew-foot">
        <button id="whatsnew-done" class="key-button whatsnew-key" type="button">${
  wayOut(where, locked)}</button>
      </div>
    </div>`;
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

/** What the key says, which is wherever pressing it actually lands. */
function wayOut(where: StoriesWhere, locked: boolean): string {
  if (where === 'board') return 'CLOSE';
  return locked ? 'SKIP AND START BATTING' : 'SKIP TO MODE SELECTION';
}

/** The whole update as a sentence, for a screen reader arriving at the first card. */
export function storiesAlt(stories: readonly Story[] = STORIES): string {
  return `What's new, in ${stories.length}: ${stories.map(one => one.title).join('. ')}.`;
}
