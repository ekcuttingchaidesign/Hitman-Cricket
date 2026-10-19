import { readFileSync } from 'node:fs';
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

/** A story made up for the machinery: the update itself is one film, and the other ways a story is told are kept for the next. */
const story = (over: Partial<Story>): Story => ({ key: 'x', eyebrow: 'X', title: 'XXXXXXX', alt: 'x'.repeat(30), ...over });
/** The last update's shape, made up: two strokes filmed in the game, then two cards on the room's stage with the way in. */
const KEPT: readonly Story[] = [
  story({ key: 'hook', title: 'HOOK IT FOR SIX', body: 'b'.repeat(40), alt: 'a'.repeat(50), reel: 'hook', holdMs: 7000 }),
  story({ key: 'latecut', title: 'SHOW IT THE WAY', body: 'b'.repeat(40), alt: 'a'.repeat(50), reel: 'latecut', holdMs: 7000 }),
  story({ key: 'kits', title: 'SUIT UP', body: 'b'.repeat(40), stage: 'kits', opens: 'dressing' }),
  story({ key: 'bats', title: 'EARN YOUR WILLOW', body: 'b'.repeat(40), stage: 'bats', opens: 'dressing' }),
];
const LAST = KEPT.length - 1;
const REELS = [0, 1];
const ROOM = [2, 3];
const kept = (at: number, over: { where?: 'intro' | 'board'; locked?: boolean; holdMs?: number } = {}) =>
  storiesMarkup({ at, where: over.where ?? 'intro', holdMs: over.holdMs ?? 1, locked: over.locked, stories: KEPT });

describe('what the update says it did', () => {
  it('is the player profiles, one film', () => {
    expect(STORIES.map(one => one.key)).toEqual(['player-profiles']);
    expect(STORIES[0].film).toBe('player-profiles');
  });

  it('is a new update, so everybody is shown it', () => {
    expect(UPDATE).toBe('player-profiles');
  });

  it('ships the film it plays, a Lottie inside ten seconds, and holds a beat past its end', () => {
    const film = JSON.parse(readFileSync('public/lotties/player-profiles.json', 'utf8')) as { fr: number; op: number; w: number; h: number };
    expect([film.w, film.h]).toEqual([1080, 1920]);
    const ms = film.op / film.fr * 1000;
    expect(ms).toBeLessThanOrEqual(10_000);
    expect(STORIES[0].holdMs).toBeGreaterThan(ms);
    expect(STORIES[0].holdMs!).toBeLessThan(ms + 1000);
  });

  it('gives every card something to show, a name for it, and words for whoever cannot see it', () => {
    for (const one of STORIES) {
      expect(one.title.length, one.key).toBeGreaterThan(6);
      expect(!!(one.art || one.film || one.stage || one.reel), one.key).toBe(true);
      // A film says its own words; anything else needs a line under it.
      if (!one.film) expect(one.body?.length ?? 0, one.key).toBeGreaterThan(30);
      expect(one.alt.length, one.key).toBeGreaterThan(20);
    }
  });

  it('plays the film down the sheet with the one way out, its title read out rather than shown', () => {
    const markup = storiesMarkup({ at: 0, where: 'intro', holdMs: 7000 });
    expect(markup).toContain('whatsnew-sheet is-film');
    expect(markup).toMatch(/id="whatsnew-film"[^>]*role="img"[^>]*aria-label="[^"]{40,}"/);
    expect(markup).toContain('whatsnew-title is-unseen');
    expect(markup).not.toContain('whatsnew-eyebrow');
    expect(markup).not.toContain('whatsnew-open');
    expect(markup).toContain(`--hold:${STORIES[0].holdMs}ms`);
    expect(markup.match(/class="whatsnew-bar(?: is-\w+)*"/g)).toHaveLength(1);
  });

  it('says each in two lines at most, and never counts kits or bats, which only grow', () => {
    for (const one of STORIES.filter(it => it.body)) {
      // Two lines of a phone's width, at the story's size, is about sixty-four letters.
      expect(one.body!.length, one.key).toBeLessThanOrEqual(64);
      expect(one.body, one.key).not.toMatch(/\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b (kits?|bats?)/i);
    }
  });

  it('reads out as one sentence for somebody who cannot see the pictures', () => {
    const alt = storiesAlt();
    expect(alt).toContain(String(STORIES.length));
    for (const one of STORIES) expect(alt).toContain(one.title);
  });
});

describe('the story screen', () => {
  it('draws a bar a story, and holds still on the last, with the way in', () => {
    expect(storyHolds(LAST, KEPT)).toBe(true);
    const markup = kept(LAST, { holdMs: 7000 });
    expect(markup.match(/class="whatsnew-bar(?: is-\w+)*"/g)).toHaveLength(KEPT.length);
    expect(markup.match(/is-live/g)).toHaveLength(1);
    // A card that moved on by itself would take the key from under a thumb.
    expect(markup).toContain('is-held');
    expect(markup).not.toContain('--hold:');
  });

  it('moves on by itself from an earlier card, its keys standing where the next card has them', () => {
    expect(storyHolds(ROOM[0], KEPT)).toBe(false);
    const markup = kept(ROOM[0], { holdMs: 7000 });
    expect(markup).toContain('--hold:');
    expect(markup).not.toContain('is-held');
    expect(markup).toContain('id="whatsnew-open"');
  });

  it('holds a card with the key on it wherever it stands, and an earlier way in nowhere', () => {
    expect(storyHolds(0, [story({ withKey: true }), story({})])).toBe(true);
    expect(storyHolds(0, [story({ opens: 'dressing' }), story({})])).toBe(false);
    expect(storyHolds(1, [story({}), story({ opens: 'dressing' })])).toBe(true);
    expect(storyHolds(1, [story({}), story({})])).toBe(false);
  });

  it('puts SKIP and GO TO DRESSING ROOM side by side under every card of the room', () => {
    for (const at of ROOM) {
      const markup = kept(at);
      expect(markup).toMatch(/whatsnew-foot is-pair[\s\S]*k-cta--secondary[^>]*id="whatsnew-done"[\s\S]*>SKIP<[\s\S]*k-cta--primary[^>]*id="whatsnew-open"[\s\S]*>GO TO DRESSING ROOM</);
      expect(markup.indexOf('whatsnew-room')).toBeLessThan(markup.indexOf('whatsnew-done'));
      // Opened from the board, the way out goes back there.
      expect(kept(at, { where: 'board' })).toMatch(/id="whatsnew-done"[\s\S]*?>CLOSE</);
    }
  });

  it('plays the Dressing Room full screen on its stage, with no picture to download', () => {
    expect(ROOM.map(at => KEPT[at].stage)).toEqual(['kits', 'bats']);
    for (const at of ROOM) {
      const markup = kept(at);
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
    expect(out(kept(at))).toBe('SKIP');
    expect(out(kept(at, { locked: true }))).toBe('SKIP');
    expect(out(kept(at, { where: 'board', locked: true }))).toBe('CLOSE');
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

describe('a stroke filmed in the game', () => {
  it('is the whole screen, the game\'s ground under it, with no stage or picture of its own', () => {
    for (const at of REELS) {
      const markup = kept(at);
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
      const shot = KEPT[at].reel!, markup = kept(at);
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
      expect(storyHolds(at, KEPT)).toBe(false);
      expect(kept(at)).not.toContain('whatsnew-open');
      expect(out(kept(at))).toBe('SKIP TO MODE SELECTION');
      expect(out(kept(at, { locked: true }))).toBe('SKIP AND START BATTING');
      expect(out(kept(at, { where: 'board' }))).toBe('CLOSE');
    }
  });

  it('keeps the hold for the swipe long enough to read, inside one go of the film', () => {
    expect(CUE.ms).toBeGreaterThanOrEqual(1500);
    expect(reelSeconds('hook')).toBeGreaterThan(CUE.ms);
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
    // The strokes' update, shown every day of its launch week, does not stand in the way of this one.
    fakeStorage({ 'hitman-whatsnew': 'new-shots:6' });
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
