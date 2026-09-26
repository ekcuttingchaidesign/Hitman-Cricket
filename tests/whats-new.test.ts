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

describe('what the update says it did', () => {
  it('says it in one, because a player came here to bat', () => {
    expect(STORIES).toHaveLength(1);
  });

  it('gives every card something to show, and a name for it', () => {
    for (const story of STORIES) {
      expect(story.title.length, story.key).toBeGreaterThan(8);
      expect(story.art, story.key).toMatch(/\.(png|webp)$/);
      // A picture says nothing to a screen reader on its own.
      expect(story.alt.length, story.key).toBeGreaterThan(20);
    }
  });

  it('asks for the key, and carries it', () => {
    const said = STORIES.map(one => `${one.title} ${one.alt}`).join(' ').toLowerCase();
    expect(said).toContain('career key');
    expect(STORIES.some(one => one.withKey)).toBe(true);
  });

  it('reads out as one sentence for somebody who cannot see the pictures', () => {
    const alt = storiesAlt();
    expect(alt).toContain(String(STORIES.length));
    for (const story of STORIES) expect(alt).toContain(story.title);
  });
});

describe('the story screen', () => {
  it('draws a bar a story, and holds still on one carrying the key', () => {
    const markup = storiesMarkup({ at: 0, where: 'intro', holdMs: 7000 });
    expect(markup.match(/class="whatsnew-bar(?: is-\w+)*"/g)).toHaveLength(STORIES.length);
    expect(markup.match(/is-live/g)).toHaveLength(1);
    // A card that moved on by itself would take the key from under a thumb.
    expect(markup).toContain('is-held');
    expect(markup).not.toContain('--hold:');
  });

  it('puts the meme on the screen, and the key under it', () => {
    const markup = storiesMarkup({ at: 0, where: 'intro', holdMs: 1 });
    expect(markup).toContain('src="save%20key%20meme.png"');
    expect(markup.indexOf('whatsnew-art')).toBeLessThan(markup.indexOf('whatsnew-keyslot'));
    // The way out stays at the foot, under both.
    expect(markup.indexOf('whatsnew-keyslot')).toBeLessThan(markup.indexOf('whatsnew-done'));
  });

  it('asks a player with a name to save their key, and shows nobody else a card', () => {
    const held = storiesMarkup({ at: 0, where: 'intro', holdMs: 1,
      careerKey: { state: 'unsaved', code: 'brave-otter-lamp-07' } });
    expect(held).toContain('Save your key');
    expect(held).toContain('brave-otter-lamp-07');
    expect(held).toMatch(/id="whatsnew-key-save"[^>]*>SAVE YOUR KEY</);
    expect(storyKeyMarkup({ state: 'saved', code: 'a-b-c-01' })).toContain('id="whatsnew-key-save"');
    // A name with no key behind it: the press makes one, then the sheet saves it.
    const lost = storyKeyMarkup({ state: 'lost' });
    expect(lost).toContain('Save your key');
    expect(lost).toMatch(/id="whatsnew-key-make"[^>]*>SAVE YOUR KEY</);
    // No name at all: nothing to save, so no card.
    expect(storyKeyMarkup(null)).toBe('');
  });

  it('draws no frame round a picture that brings its own corners', () => {
    expect(storiesMarkup({ at: 0, where: 'intro', holdMs: 1 })).toContain('class="is-cut"');
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
