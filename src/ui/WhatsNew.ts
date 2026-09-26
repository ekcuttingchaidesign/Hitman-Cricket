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
   * name, who has no key to save — and is offered the way back instead, since
   * somebody reading about keys with none on this phone may well own one.
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
          <img src="${story.art}" alt="${escape(story.alt)}" width="${story.width}" height="${
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
 * The key under the picture, in whichever of its three states this player is.
 *
 * The end card's panel, borrowed whole: it is the shape a player has already
 * been shown their key in, and every one of its buttons ends at the same save
 * sheet as everywhere else, which is the only place a key is ever saved.
 */
export function storyKeyMarkup(view: KeyView | null): string {
  if (view && view.state !== 'lost') {
    return panel('Your career key',
      `<p class="key-serial is-inline"><span>${escape(view.code ?? '')}</span></p>`,
      'whatsnew-key-save', view.state === 'saved' ? 'AGAIN' : 'SAVE');
  }
  if (view) {
    return panel('No career key yet',
      '<p class="key-panel-line">Make one now. It brings your record back on a new phone.</p>',
      'whatsnew-key-make', 'MAKE IT');
  }
  return panel('No career key yet',
    '<p class="key-panel-line">Get on the board and one is made for you.</p>',
    'whatsnew-key-restore', 'I HAVE ONE');
}

function panel(heading: string, line: string, id: string, action: string): string {
  return `
    <section class="key-panel whatsnew-keypanel" aria-labelledby="whatsnew-key-title">
      <div class="key-panel-face">
        <span class="key-mark" aria-hidden="true">${MARK}</span>
        <div class="key-panel-say">
          <h3 id="whatsnew-key-title">${escape(heading)}</h3>
          ${line}
        </div>
        <button id="${id}" class="key-panel-key" type="button">${escape(action)}</button>
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
