import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SHOT_CALLS, STORIES, TIMES, UPDATE, markWhatsNewShown, whatsNewDue, whatsNewShown, type Story,
} from '../src/game/whats-new';
import { shotCallMarkup, shotCueMarkup, storiesAlt, storiesMarkup, storyHolds, storyKeyMarkup } from '../src/ui/WhatsNew';
import { CUE, reelSeconds } from '../src/game/ShotReel';

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

/** The last card, which holds still with the way into the room. */
const LAST = STORIES.length - 1;
/** The new strokes' films first, then the Dressing Room's cards, which carry the way in. */
const REELS = STORIES.flatMap((one, at) => one.reel ? [at] : []);
const ROOM = STORIES.flatMap((one, at) => one.opens ? [at] : []);

describe('what the update says it did', () => {
  it('tells the two new strokes first, then the Dressing Room in two, each of those with the way in', () => {
    expect(STORIES.map(one => one.key)).toEqual(['hook-it', 'show-it-the-way', 'suit-up', 'earn-your-willow']);
    expect(STORIES.map(one => one.reel)).toEqual(['hook', 'latecut', undefined, undefined]);
    expect(ROOM).toEqual([2, 3]);
    for (const at of ROOM) expect(STORIES[at].opens).toBe('dressing');
    for (const at of REELS) expect(STORIES[at].opens, STORIES[at].key).toBeUndefined();
  });

  it('is a new update, so everybody is shown it, the room\'s cards again among it', () => {
    expect(UPDATE).toBe('new-shots');
  });

  it('gives every card something to show, a name for it and a line under it', () => {
    for (const story of STORIES) {
      expect(story.title.length, story.key).toBeGreaterThan(6);
      // A picture, a film, the Dressing Room's stage, or the game's own ground.
      expect(!!(story.art || story.film || story.stage || story.reel), story.key).toBe(true);
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
  it('draws a bar a story, and holds still on the last, with the way in', () => {
    expect(storyHolds(LAST)).toBe(true);
    const markup = storiesMarkup({ at: LAST, where: 'intro', holdMs: 7000 });
    expect(markup.match(/class="whatsnew-bar(?: is-\w+)*"/g)).toHaveLength(STORIES.length);
    expect(markup.match(/is-live/g)).toHaveLength(1);
    // A card that moved on by itself would take the key from under a thumb.
    expect(markup).toContain('is-held');
    expect(markup).not.toContain('--hold:');
  });

  it('moves on by itself from an earlier card, its keys standing where the next card has them', () => {
    expect(storyHolds(ROOM[0])).toBe(false);
    const markup = storiesMarkup({ at: ROOM[0], where: 'intro', holdMs: 7000 });
    expect(markup).toContain('--hold:');
    expect(markup).not.toContain('is-held');
    expect(markup).toContain('id="whatsnew-open"');
  });

  it('holds a card with the key on it wherever it stands, and an earlier way in nowhere', () => {
    const story = (over: Partial<Story>): Story => ({ key: 'x', eyebrow: 'X', title: 'XXXXXXX', alt: 'x'.repeat(30), ...over });
    expect(storyHolds(0, [story({ withKey: true }), story({})])).toBe(true);
    expect(storyHolds(0, [story({ opens: 'dressing' }), story({})])).toBe(false);
    expect(storyHolds(1, [story({}), story({ opens: 'dressing' })])).toBe(true);
    expect(storyHolds(1, [story({}), story({})])).toBe(false);
  });

  it('puts SKIP and GO TO DRESSING ROOM side by side under every card of the room', () => {
    for (const at of ROOM) {
      const markup = storiesMarkup({ at, where: 'intro', holdMs: 1 });
      expect(markup).toMatch(/whatsnew-foot is-pair[\s\S]*k-cta--secondary[^>]*id="whatsnew-done"[\s\S]*>SKIP<[\s\S]*k-cta--primary[^>]*id="whatsnew-open"[\s\S]*>GO TO DRESSING ROOM</);
      expect(markup.indexOf('whatsnew-room')).toBeLessThan(markup.indexOf('whatsnew-done'));
      // Opened from the board, the way out goes back there.
      expect(storiesMarkup({ at, where: 'board', holdMs: 1 })).toMatch(/id="whatsnew-done"[\s\S]*?>CLOSE</);
    }
  });

  it('plays the Dressing Room full screen on its stage, with no picture to download', () => {
    expect(ROOM.map(at => STORIES[at].stage)).toEqual(['kits', 'bats']);
    for (const at of ROOM) {
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

  it('names the way out for where it was opened from', () => {
    // Beside the way in it is short: SKIP, wherever skipping goes in this
    // build, or CLOSE back to the board it was opened from.
    const out = (markup: string) => markup.match(/id="whatsnew-done"[\s\S]*?<span>([^<]+)<\/span>/)?.[1];
    const at = ROOM[0];
    expect(out(storiesMarkup({ at, where: 'intro', holdMs: 1 }))).toBe('SKIP');
    expect(out(storiesMarkup({ at, where: 'intro', holdMs: 1, locked: true }))).toBe('SKIP');
    expect(out(storiesMarkup({ at, where: 'board', holdMs: 1, locked: true }))).toBe('CLOSE');
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

describe('the new strokes, filmed in the game', () => {
  it('is the whole screen, the game\'s ground under it, with no stage or picture of its own', () => {
    for (const at of REELS) {
      const markup = storiesMarkup({ at, where: 'intro', holdMs: 1 });
      expect(markup).toContain('whatsnew-sheet is-reel');
      expect(markup).not.toContain('whatsnew-stage');
      expect(markup).not.toContain('<img');
      // Said for whoever cannot see the film.
      expect(markup).toMatch(/class="whatsnew-reel"[^>]*role="img"[^>]*aria-label="[^"]{40,}"/);
      // The room between the title and the words, where the camera has him.
      expect(markup.indexOf('whatsnew-title')).toBeLessThan(markup.indexOf('whatsnew-room'));
      expect(markup.indexOf('whatsnew-room')).toBeLessThan(markup.indexOf('whatsnew-say'));
    }
  });

  it('draws the swipe that plays it over the whole screen, the key, and what it went for', () => {
    expect(SHOT_CALLS).toEqual({
      hook: { way: 'leg', key: 'A', call: 'SIX', where: 'TO LEG AT THE BOUNCER' },
      latecut: { way: 'off', key: 'D + S', call: 'FOUR', where: 'DOWN TO OFF, LATE' },
    });
    for (const at of REELS) {
      const shot = STORIES[at].reel!, markup = storiesMarkup({ at, where: 'intro', holdMs: 1 });
      // The swipe on the sheet itself, over everything but the bars and the way out, for as long as the film holds.
      expect(markup).toContain(shotCueMarkup(shot));
      expect(markup).toMatch(new RegExp(`class="whatsnew-cue" data-way="${SHOT_CALLS[shot].way}" style="--cue:${CUE.ms}ms" aria-hidden="true"`));
      expect(markup.indexOf('whatsnew-cue')).toBeLessThan(markup.indexOf('whatsnew-body'));
      expect(markup).toContain(`<kbd>${SHOT_CALLS[shot].key}</kbd>`);
      expect(markup).toContain(SHOT_CALLS[shot].where);
      // What it went for, in the room where he is.
      expect(markup).toContain(shotCallMarkup(shot));
      expect(markup).toMatch(new RegExp(`id="whatsnew-room"[^>]*aria-hidden="true">[\\s\\S]*>${SHOT_CALLS[shot].call}<`));
    }
  });

  it('has the one way out, saying where it lands, and moves on by itself', () => {
    const out = (markup: string) => markup.match(/id="whatsnew-done"[^>]*>([^<]+)</)?.[1];
    for (const at of REELS) {
      expect(storyHolds(at)).toBe(false);
      expect(storiesMarkup({ at, where: 'intro', holdMs: 1 })).not.toContain('whatsnew-open');
      expect(out(storiesMarkup({ at, where: 'intro', holdMs: 1 }))).toBe('SKIP TO MODE SELECTION');
      expect(out(storiesMarkup({ at, where: 'intro', holdMs: 1, locked: true }))).toBe('SKIP AND START BATTING');
      expect(out(storiesMarkup({ at, where: 'board', holdMs: 1 }))).toBe('CLOSE');
    }
  });

  it('holds each for the whole of one go of its film, the hold for the swipe in it, and not a second', () => {
    expect(CUE.ms).toBeGreaterThanOrEqual(1500);
    for (const at of REELS) {
      const story = STORIES[at], film = reelSeconds(story.reel!);
      expect(story.holdMs, story.key).toBeGreaterThanOrEqual(film);
      expect(story.holdMs!, story.key).toBeLessThan(film + 1000);
      expect(storiesMarkup({ at, where: 'intro', holdMs: 7000 })).toContain(`--hold:${story.holdMs}ms`);
    }
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
