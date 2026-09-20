import { escape } from './Leaderboard';
import { STORIES, type Story } from '../game/whats-new';

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
}

export function storiesMarkup(view: StoriesView): string {
  const { at, where, holdMs } = view;
  const story = STORIES[at] ?? STORIES[0];
  return `
    <div class="whatsnew-sheet" role="document" aria-roledescription="story">
      <div class="whatsnew-bars" aria-hidden="true">${STORIES.map((_, i) => `
        <span class="whatsnew-bar${i < at ? ' is-done' : i === at ? ' is-live' : ''}"${
  i === at ? ` style="--hold:${holdMs}ms"` : ''}><i></i></span>`).join('')}
      </div>
      <button id="whatsnew-back" class="whatsnew-half is-back" type="button" aria-label="Previous"></button>
      <button id="whatsnew-next" class="whatsnew-half is-next" type="button" aria-label="Next"></button>
      <div class="whatsnew-body">
        <p class="whatsnew-eyebrow">${escape(story.eyebrow)}</p>
        <h2 class="whatsnew-title">${escape(story.title)}</h2>
        <div class="whatsnew-art">
          <img src="${story.art}" alt="${escape(story.alt)}" width="620" draggable="false">
        </div>
        <p class="whatsnew-say" aria-live="polite">${escape(story.body)}</p>
      </div>
      <div class="whatsnew-foot">
        <button id="whatsnew-done" class="key-button whatsnew-key" type="button">${
  where === 'board' ? 'CLOSE' : 'SKIP TO MODE SELECTION'}</button>
      </div>
    </div>`;
}

/** The whole update as a sentence, for a screen reader arriving at the first card. */
export function storiesAlt(stories: readonly Story[] = STORIES): string {
  return `What's new, in ${stories.length}: ${stories.map(one => one.title).join('. ')}.`;
}
