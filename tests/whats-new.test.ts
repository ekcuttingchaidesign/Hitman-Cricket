import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STORIES, TIMES, UPDATE, markWhatsNewShown, whatsNewDue, whatsNewShown,
} from '../src/game/whats-new';
import { storiesAlt, storiesMarkup, storyKeyMarkup } from '../src/ui/WhatsNew';

/** localStorage, as a map, so the counting can be tested without a browser. */
function fakeStorage(seed: Record<string, string> = {}) {
  const held = new Map(Object.entries(seed));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => { held.set(key, value); },
  });
  return held;
}

afterEach(() => vi.unstubAllGlobals());

/** The card with the way into the room, wherever it stands in the set. */
const OPENS = STORIES.findIndex(one => one.opens);

describe('what the update says it did', () => {
  it('tells the Dressing Room in three, and ends on the way in', () => {
    expect(STORIES.map(one => one.key)).toEqual(['suit-up', 'earn-your-willow', 'boom']);
    // The way in goes last: it is the one card that holds still, so tapping
    // through lands on it rather than past it.
    expect(OPENS).toBe(STORIES.length - 1);
    expect(STORIES[OPENS].opens).toBe('dressing');
  });

  it('gives every card something to show, a name for it and a line under it', () => {
    for (const story of STORIES) {
      expect(story.title.length, story.key).toBeGreaterThan(6);
      // A picture, a film, or the Dressing Room's stage.
      expect(!!(story.art || story.film || story.stage), story.key).toBe(true);
      expect(story.body?.length ?? 0, story.key).toBeGreaterThan(30);
      // A picture says nothing to a screen reader on its own.
      expect(story.alt.length, story.key).toBeGreaterThan(20);
    }
  });

  it('says each in two lines at most, and never counts kits or bats, which only grow', () => {
    for (const story of STORIES) {
      // Two lines of a phone's width, at the story's size, is about sixty-four letters.
      expect(story.body!.length, story.key).toBeLessThanOrEqual(64);
      expect(story.body, story.key).not.toMatch(/\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b (kits?|bats?)/i);
      expect(story.body, story.key).not.toMatch(/\b(seven|six|eleven|twelve)\b/i);
    }
  });

  it('reads out as one sentence for somebody who cannot see the pictures', () => {
    const alt = storiesAlt();
    expect(alt).toContain(String(STORIES.length));
    for (const story of STORIES) expect(alt).toContain(story.title);
  });
});

describe('the story screen', () => {
  it('draws a bar a story, and holds still on the one with the way in', () => {
    const markup = storiesMarkup({ at: OPENS, where: 'intro', holdMs: 7000 });
    expect(markup.match(/class="whatsnew-bar(?: is-\w+)*"/g)).toHaveLength(STORIES.length);
    expect(markup.match(/is-live/g)).toHaveLength(1);
    // A card that moved on by itself would take the key from under a thumb.
    expect(markup).toContain('is-held');
    expect(markup).not.toContain('--hold:');
  });

  it('moves on by itself from a card that asks for nothing', () => {
    const markup = storiesMarkup({ at: 0, where: 'intro', holdMs: 7000 });
    expect(markup).toContain('--hold:');
    expect(markup).not.toContain('is-held');
    expect(markup).not.toContain('whatsnew-open');
  });

  it('puts the way out and OPEN DRESSING ROOM side by side under the last stage', () => {
    const markup = storiesMarkup({ at: OPENS, where: 'intro', holdMs: 1 });
    expect(markup).toMatch(/whatsnew-foot is-pair[\s\S]*k-cta--secondary[^>]*id="whatsnew-done"[\s\S]*>SKIP<[\s\S]*k-cta--primary[^>]*id="whatsnew-open"[\s\S]*>OPEN DRESSING ROOM</);
    expect(markup.indexOf('whatsnew-room')).toBeLessThan(markup.indexOf('whatsnew-done'));
    // Opened from the board, the way out goes back there.
    expect(storiesMarkup({ at: OPENS, where: 'board', holdMs: 1 })).toMatch(/id="whatsnew-done"[\s\S]*?>CLOSE</);
  });

  it('plays the Dressing Room full screen on its stage, with no picture to download', () => {
    expect(STORIES.map(one => one.stage)).toEqual(['kits', 'bats', 'boom']);
    for (let at = 0; at < STORIES.length; at++) {
      const markup = storiesMarkup({ at, where: 'intro', holdMs: 1 });
      expect(markup).toContain('whatsnew-sheet is-stage');
      expect(markup).toMatch(/id="whatsnew-stage"[^>]*role="img"[^>]*aria-label="[^"]{20,}"/);
      // The room is between the title and the words: where the batter stands.
      expect(markup.indexOf('whatsnew-title')).toBeLessThan(markup.indexOf('whatsnew-room'));
      expect(markup.indexOf('whatsnew-room')).toBeLessThan(markup.indexOf('whatsnew-say'));
      expect(markup).not.toContain('<img');
    }
  });

  it('asks a player with a name to save their key, and shows nobody else a card', () => {
    // The key's card, for a story that carries it (`Story.withKey`); none of this update's does.
    expect(STORIES.some(one => one.withKey)).toBe(false);
    expect(storyKeyMarkup({ state: 'unsaved', code: 'brave-otter-lamp-07' })).toContain('brave-otter-lamp-07');
    expect(storyKeyMarkup({ state: 'saved', code: 'a-b-c-01' })).toContain('id="whatsnew-key-save"');
    expect(storyKeyMarkup({ state: 'lost' })).toMatch(/id="whatsnew-key-make"[^>]*>SAVE YOUR KEY</);
    expect(storyKeyMarkup(null)).toBe('');
  });

  it('never prints a key it was not handed', () => {
    expect(storyKeyMarkup({ state: 'unsaved', code: '<b>x</b>' })).not.toContain('<b>x</b>');
  });

  it('names the way out for where it was opened from, and where that goes', () => {
    expect(storiesMarkup({ at: 0, where: 'intro', holdMs: 1 })).toContain('SKIP TO MODE SELECTION');
    // A build that plays one mode has no picker to skip to, so the key cannot
    // promise one — it is the only thing on the screen that could lie.
    expect(storiesMarkup({ at: 0, where: 'intro', holdMs: 1, locked: true }))
      .toContain('SKIP AND START BATTING');
    expect(storiesMarkup({ at: 0, where: 'board', holdMs: 1, locked: true })).toContain('CLOSE');
  });

  it('carries both halves of the page, so a tap means back or on', () => {
    const markup = storiesMarkup({ at: 0, where: 'intro', holdMs: 1 });
    expect(markup).toContain('id="whatsnew-back"');
    expect(markup).toContain('id="whatsnew-next"');
    expect(markup).toContain('id="whatsnew-done"');
  });

  it('shows the first card for a card that is not there', () => {
    expect(storiesMarkup({ at: 9, where: 'intro', holdMs: 1 })).toContain(STORIES[0].title);
  });
});

describe('how often it puts itself in front of somebody', () => {
  it('shows itself twice and then stops', () => {
    fakeStorage();
    expect(whatsNewDue()).toBe(true);
    markWhatsNewShown();
    expect(whatsNewShown()).toBe(1);
    expect(whatsNewDue()).toBe(true);
    markWhatsNewShown();
    expect(whatsNewShown()).toBe(TIMES);
    expect(whatsNewDue()).toBe(false);
    // And no amount of further opening turns it back on.
    markWhatsNewShown();
    expect(whatsNewDue()).toBe(false);
  });

  it('starts again for the next update rather than being spent for ever', () => {
    fakeStorage({ 'hitman-whatsnew': 'something-older:2' });
    expect(whatsNewShown()).toBe(0);
    expect(whatsNewDue()).toBe(true);
    markWhatsNewShown();
    expect(localStorage.getItem('hitman-whatsnew')).toBe(`${UPDATE}:1`);
  });

  it('treats a count it cannot read as never having been shown', () => {
    fakeStorage({ 'hitman-whatsnew': `${UPDATE}:banana` });
    expect(whatsNewShown()).toBe(0);
  });

  it('still shows it where nothing can be remembered', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('off'); },
      setItem: () => { throw new Error('off'); },
    });
    expect(whatsNewDue()).toBe(true);
    // And saying so must not throw, or a private window never gets to play.
    expect(() => markWhatsNewShown()).not.toThrow();
  });
});
