import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CAMERA_STORIES, DIWALI_STORIES, KNOCKOUT_STORIES, KNOCKOUT_TOLD, RIVALS_STORIES, SHOT_CALLS, STORIES, TIMES, UPDATE, storiesAt, updateAt, markWhatsNewShown, whatsNewDue, whatsNewShown, type Story,
} from '../src/game/whats-new';
import { shotCallMarkup, shotCueMarkup, storiesAlt, storiesMarkup, storyHolds, storyKeyMarkup } from '../src/ui/WhatsNew';
import { CUE, reelSeconds } from '../src/game/ShotReel';
import { KNOCKOUT } from '../src/game/knockout';
import { fullMatchPoints, ladderOf } from '../src/ui/KnockoutStory';
import { knockoutBarMarkup } from '../src/ui/KnockoutBar';
const DIWALI_WEEK = Date.parse('2026-11-08T20:00:00+05:30'), AFTER_DIWALI = Date.parse('2026-11-12T00:00:00+05:30');

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
  it('is Rivals live, one film', () => {
    expect(RIVALS_STORIES.map(one => one.key)).toEqual(['rivals']);
    expect(RIVALS_STORIES[0].video).toBe('stories/rivals.mp4');
    expect(RIVALS_STORIES[0].opens).toBe('rivals');
  });

  it('is Diwali\'s kits and bats on the room\'s stage during Diwali week, and the cameras after it', () => {
    // Then the Rivals film, kept: it holds last, so the bats card moves on to it.
    expect(storiesAt(DIWALI_WEEK).map(one => one.key)).toEqual(['diwali-kits', 'diwali-bats', 'rivals']);
    expect(storiesAt(DIWALI_WEEK).map((_, at) => storyHolds(at, storiesAt(DIWALI_WEEK)))).toEqual([false, false, true]);
    expect(updateAt(DIWALI_WEEK)).toBe('diwali');
    expect(DIWALI_STORIES.map(one => one.stage)).toEqual(['diwali-kits', 'diwali-bats']);
    expect(DIWALI_STORIES.every(one => one.opens === 'dressing')).toBe(true);
    // The kits go off the shelf at midnight in India, 11 November ending; the stories with them.
    expect(storiesAt(AFTER_DIWALI, false)).toBe(CAMERA_STORIES);
    expect(updateAt(AFTER_DIWALI, false)).toBe('cams');
    expect(STORIES).toBe(storiesAt(Date.now()));
    expect(UPDATE).toBe(updateAt(Date.now()));
  });

  it('ships the film it plays and its last frame, light enough for a phone', () => {
    const film = readFileSync('public/stories/rivals.mp4');
    // An MP4: its first box is ftyp.
    expect(film.subarray(4, 8).toString('latin1')).toBe('ftyp');
    expect(film.length).toBeLessThan(4_000_000);
    expect(readFileSync('public/stories/rivals-lockup.webp').subarray(8, 12).toString('latin1')).toBe('WEBP');
  });

  it('gives every card something to show, a name for it, and words for whoever cannot see it', () => {
    for (const one of [...KNOCKOUT_STORIES, ...CAMERA_STORIES, ...RIVALS_STORIES, ...DIWALI_STORIES]) {
      expect(one.title.length, one.key).toBeGreaterThan(6);
      expect(!!(one.art || one.scene || one.film || one.video || one.stage || one.reel || one.show), one.key).toBe(true);
      // A film says its own words; anything else needs a line under it.
      if (!one.film && !one.video && !one.show) expect(one.body?.length ?? 0, one.key).toBeGreaterThan(30);
      expect(one.alt.length, one.key).toBeGreaterThan(20);
    }
  });

  it('plays the film down the sheet, muted, held on its last frame with GOT IT and SEE WHO’S ONLINE under it', () => {
    const markup = storiesMarkup({ at: 0, where: 'intro', holdMs: 7000, stories: RIVALS_STORIES });
    expect(markup).toContain('whatsnew-sheet is-film');
    expect(markup).toMatch(/<video id="whatsnew-film"[^>]*muted playsinline[^>]*aria-label="[^"]{40,}"/);
    expect(markup).toContain('whatsnew-title is-unseen');
    expect(markup).not.toContain('whatsnew-eyebrow');
    expect(markup).toContain('id="whatsnew-open"');
    expect(markup).toContain('SEE WHO’S ONLINE');
    expect(markup).toContain('GOT IT');
    // The last card with a way in holds still, so the film is not cut off by the bar running out.
    expect(storyHolds(0, RIVALS_STORIES)).toBe(true);
    expect(markup).not.toContain('--hold:');
    expect(markup.match(/class="whatsnew-bar(?: is-\w+)*"/g)).toHaveLength(1);
  });

  it('says each in two lines at most, and never counts kits or bats, which only grow', () => {
    for (const one of [...RIVALS_STORIES, ...DIWALI_STORIES].filter(it => it.body)) {
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
    expect([...RIVALS_STORIES, ...DIWALI_STORIES].some(one => one.withKey)).toBe(false);
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

  it('keeps Rivals\' count beside Diwali\'s, so one does not spend the other', () => {
    const other = UPDATE === 'diwali' ? 'rivals' : 'diwali';
    fakeStorage({ 'hitman-whatsnew': `${other}:1` });
    expect(whatsNewShown()).toBe(0);
    markWhatsNewShown();
    expect(localStorage.getItem('hitman-whatsnew')).toBe(`${other}:1,${UPDATE}:1`);
    expect(whatsNewShown()).toBe(1);
  });

  it('takes the checks\' seed of nine as every update seen', () => {
    fakeStorage({ 'hitman-whatsnew': 'rivals:9' });
    expect(whatsNewDue()).toBe(false);
    fakeStorage({ 'hitman-whatsnew': 'diwali:9' });
    expect(whatsNewDue()).toBe(false);
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

describe('the batting cams\' update', () => {
  it('is one card, filmed in the game, that holds on its last beat', () => {
    expect(CAMERA_STORIES.map(one => one.key)).toEqual(['cams']);
    expect(CAMERA_STORIES[0].show).toBe('cams');
    expect(storyHolds(0, CAMERA_STORIES)).toBe(true);
    expect(CAMERA_STORIES[0].opens).toBeUndefined();
  });

  it('says each beat in its words, ends on FIND IT IN PAUSE MENU, and has one way on: GOT IT', () => {
    const card = storiesMarkup({ at: 0, where: 'intro', holdMs: 7000, stories: CAMERA_STORIES });
    expect(card).toContain('is-cams');
    expect(card).toContain('data-beat="intro"');
    for (const words of ['NEW BATTING CAMS', 'BAT CLOSER', 'FEEL THE SPEED', 'FIND IT IN PAUSE MENU']) expect(card).toContain(words);
    expect(card).toContain('id="whatsnew-got"');
    expect(card.match(/k-cta--primary/g)?.length).toBe(1);
    expect(card).not.toContain('TRY PRO CAM');
    expect(card).not.toContain('whatsnew-open');
  });
});

describe('Super Knockout\'s update', () => {
  const card = (at: number, where: 'intro' | 'board' = 'intro') => storiesMarkup({ at, where, holdMs: 7000, stories: KNOCKOUT_STORIES });

  it('is told wherever the mode is played, and the cameras where it is not yet', () => {
    expect(storiesAt(AFTER_DIWALI, true)).toBe(KNOCKOUT_STORIES);
    expect(updateAt(AFTER_DIWALI, true)).toBe('knockout');
    expect(storiesAt(AFTER_DIWALI, false)).toBe(CAMERA_STORIES);
    // Off production, which is where the tests run.
    expect(KNOCKOUT_TOLD).toBe(true);
    // Diwali's week came first while it lasted.
    expect(updateAt(DIWALI_WEEK, true)).toBe('diwali');
  });

  it('can be asked for by name, as any update still kept can', () => {
    expect(storiesAt(AFTER_DIWALI, false, 'knockout')).toBe(KNOCKOUT_STORIES);
    expect(storiesAt(AFTER_DIWALI, true, 'cams')).toBe(CAMERA_STORIES);
    expect(updateAt(AFTER_DIWALI, true, 'rivals')).toBe('rivals');
    expect(storiesAt(AFTER_DIWALI, true, 'rivals')).toBe(RIVALS_STORIES);
    // A name it does not know asks for nothing.
    expect(updateAt(AFTER_DIWALI, true, 'banana')).toBe('knockout');
  });

  it('is four cards, one idea each, the first three moving on and the last holding with the way in', () => {
    expect(KNOCKOUT_STORIES.map(one => one.scene)).toEqual(['mode', 'cut', 'watch', 'friends']);
    expect(KNOCKOUT_STORIES.map((_, at) => storyHolds(at, KNOCKOUT_STORIES))).toEqual([false, false, false, true]);
    expect(KNOCKOUT_STORIES.map(one => one.opens)).toEqual([undefined, undefined, undefined, 'knockout']);
    for (const one of KNOCKOUT_STORIES) {
      expect(one.eyebrow).toBe('WHAT’S NEW · SUPER KNOCKOUT');
      // A short title, and a line under it that runs to two lines of the card's width, three at the outside.
      expect(one.title.split(' ').length).toBeLessThanOrEqual(5);
      expect(one.body!.length).toBeGreaterThan(40);
      expect(one.body!.length).toBeLessThanOrEqual(110);
    }
  });

  it('draws every card in the stories\' own chrome: a bar a card, the eyebrow, the close key and both halves', () => {
    KNOCKOUT_STORIES.forEach((one, at) => {
      const markup = card(at);
      expect(markup).toContain(`class="whatsnew-sheet is-ko" data-scene="${one.scene}"`);
      expect(markup.match(/class="whatsnew-bar(?: is-\w+)*"/g)).toHaveLength(KNOCKOUT_STORIES.length);
      expect(markup.match(/is-done/g) ?? []).toHaveLength(at);
      expect(markup).toContain('WHAT’S NEW · SUPER KNOCKOUT');
      expect(markup).toMatch(/id="whatsnew-done" class="cams-x" type="button" aria-label="Skip"/);
      expect(markup).toContain('id="whatsnew-back"');
      expect(markup).toContain('id="whatsnew-next"');
      expect(markup).toContain(`<h2 class="kos-title">${one.title}</h2>`);
      // The piece is a picture to whoever is listening, and says what it shows.
      expect(markup).toContain('role="img" aria-label="');
      expect(markup).toContain('class="kos-mid" aria-hidden="true"');
    });
    // An earlier card runs its bar for as long as it holds; the last holds still.
    expect(card(0)).toContain('--hold:5000ms');
    expect(card(3)).toContain('is-held');
    expect(card(3)).not.toContain('--hold:');
  });

  it('shows the mode on its poster, with the format counted off the rules', () => {
    const markup = card(0);
    expect(markup).toContain('class="kos-hero"');
    expect(markup).toContain('class="kos-mark"');
    expect(markup).toContain(`${KNOCKOUT.seats} PLAYERS`);
    expect(markup).toContain('THE SAME BALLS');
    expect(markup).toContain('1 WICKET');
  });

  it('counts who is left after each over off the cuts, down to the one the final leaves', () => {
    expect(ladderOf()).toEqual([
      { left: 12, when: 'START' }, { left: 10, when: 'OVER 1' }, { left: 8, when: 'OVER 2' },
      { left: 5, when: 'OVER 3' }, { left: 2, when: 'OVER 4' }, { left: 1, when: 'FINAL' },
    ]);
    const markup = card(1);
    for (const step of ladderOf()) expect(markup).toContain(`<b>${step.left}</b><span>${step.when}</span>`);
    expect(markup).toContain('THE KNOCKOUT BAR');
  });

  it('stands the game\'s own bar in the card, without the ids that are the game\'s bar\'s alone', () => {
    const markup = card(1);
    expect(markup).toContain('class="ko-track"');
    expect(markup).toContain('class="ko-seats"');
    expect(markup).not.toMatch(/id="ko-/);
    // The game's own still carries them.
    expect(knockoutBarMarkup()).toContain('id="ko-track"');
    expect(knockoutBarMarkup()).toContain('id="ko-brow"');
  });

  it('shows the rings, who is watching, and the tray\'s six with the poop emoji, the reaction floating as the emoji alone', () => {
    const markup = card(2);
    expect(markup).toContain('STILL IN · TAP TO WATCH');
    expect(markup.match(/class="ko-ring[ "]/g)!.length).toBeGreaterThanOrEqual(6);
    expect(markup).toContain('2 WATCHING');
    const tray = markup.match(/class="ko-watch-tray">([\s\S]*?)<\/div>/)![1];
    expect(tray.match(/<button/g)).toHaveLength(6);
    expect(tray).toContain('💩');
    // No pill, no face, no name: only the emoji.
    expect(markup).toMatch(/<span class="kos-rx" style="[^"]*">💩<\/span>/);
  });

  it('shows a match\'s room and what the top three of a full one take, off the points table', () => {
    expect(fullMatchPoints()).toEqual({ from: 10, paid: [10, 5, 2] });
    const markup = card(3);
    expect(markup.match(/class="ko-lseat is-ready"/g)).toHaveLength(4);
    expect(markup).toContain('MATCH CODE');
    expect(markup).toContain('POINTS FOR THE TOP THREE');
    expect(markup).toContain('10 to 12 playing');
    expect(markup).toMatch(/data-points="10">\+10<\/b><span>1ST</);
    expect(markup).toMatch(/data-points="2">\+2<\/b><span>3RD</);
  });

  it('ends on PLAY SUPER KNOCKOUT over LATER, or CLOSE where it was opened from the board', () => {
    const last = card(3);
    expect(last).toMatch(/k-cta--primary[^>]*id="whatsnew-open"[\s\S]*PLAY SUPER KNOCKOUT/);
    expect(last).toMatch(/id="whatsnew-later"[^>]*>LATER</);
    expect(card(3, 'board')).toMatch(/id="whatsnew-later"[^>]*>CLOSE</);
    expect(card(3, 'board')).toMatch(/id="whatsnew-done" class="cams-x" type="button" aria-label="Close"/);
    // The earlier cards have the close key and nothing else to press.
    for (const at of [0, 1, 2]) { expect(card(at)).not.toContain('id="whatsnew-open"'); expect(card(at)).not.toContain('id="whatsnew-later"'); }
  });
});
