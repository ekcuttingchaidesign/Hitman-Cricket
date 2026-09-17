import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameAudio } from '../src/game/Audio';

/**
 * The music, without a browser.
 *
 * Everything below is about which screen owns the sound and when it is allowed
 * to make it, and none of that needs a decoder: a fake element records what was
 * asked of it, and the assertions are about the asking. What a browser does with
 * a real file — whether it can decode raw AAC at all, whether it will play it
 * before the page has been touched — is precisely the part this cannot answer,
 * and precisely the part the code is written to survive either way.
 */
class FakeAudio {
  static made: FakeAudio[] = [];
  /** The name of the DOMException the next `play()` should be refused with. */
  static refusal: string | null = null;
  calls: string[] = [];
  loop = false; preload = ''; volume = 1; muted = false; currentTime = 0;
  constructor(readonly src: string) { FakeAudio.made.push(this); }
  play() {
    this.calls.push('play');
    if (!FakeAudio.refusal) return Promise.resolve();
    const error = new Error('refused'); error.name = FakeAudio.refusal;
    return Promise.reject(error);
  }
  pause() { this.calls.push('pause'); }
  load() { this.calls.push('load'); }
  removeAttribute(name: string) { this.calls.push(`remove:${name}`); }
}

/** The page's listeners, so a refused track can be handed its tap. */
const listeners = new Map<string, Set<() => void>>();
const tap = (type = 'pointerdown') => [...(listeners.get(type) ?? [])].forEach(fn => fn());
let timers: (() => void)[] = [];
/** Runs whatever the fade-in scheduled, the way a real 220 ms would. */
const settle = () => { const due = timers; timers = []; due.forEach(fn => fn()); };

const cover = () => FakeAudio.made.find(element => element.src.includes('start_screen'));
const result = () => FakeAudio.made.find(element => element.src.includes('survival_glory'));

beforeEach(() => {
  FakeAudio.made = []; FakeAudio.refusal = null; listeners.clear(); timers = [];
  const fakeWindow = {
    addEventListener: (type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: () => void) => { listeners.get(type)?.delete(fn); },
    setTimeout: (fn: () => void) => { timers.push(fn); return timers.length; },
  };
  Object.assign(globalThis, { Audio: FakeAudio, window: fakeWindow, clearTimeout: () => { timers = []; } });
});
afterEach(() => { delete (globalThis as Record<string, unknown>).Audio; delete (globalThis as Record<string, unknown>).window; });

describe('the music a screen owns', () => {
  it('plays the cover track, looped, the moment the cover asks for it', () => {
    const audio = new GameAudio();
    audio.music('cover');
    expect(cover()!.src).toBe('Hitman_start_screen.aac');
    expect(cover()!.loop).toBe(true);
    expect(cover()!.calls).toEqual(['play']);
    expect(cover()!.muted).toBe(false);
    audio.dispose();
  });
  it('leaves the card\'s music exactly where it is when the board goes up over it', () => {
    const audio = new GameAudio();
    audio.music('result');
    // The board is a sheet on top of the card, so the card goes on owning the
    // sound: asking again for what is already playing must touch nothing.
    audio.music('result'); audio.music('result');
    expect(result()!.calls).toEqual(['play']);
    expect(FakeAudio.made).toHaveLength(1);
    audio.dispose();
  });
  it('takes the cover away at the first ball and gives the card its own at the last', () => {
    const audio = new GameAudio();
    audio.music('cover');
    audio.music(null);
    expect(cover()!.calls).toEqual(['play', 'pause']);
    expect(cover()!.currentTime).toBe(0);
    audio.music('result');
    expect(result()!.src).toBe('test_survival_glory.aac');
    expect(result()!.calls).toEqual(['play']);
    audio.dispose();
  });
  it('fetches the card\'s music without playing it', () => {
    const audio = new GameAudio();
    audio.warm('result');
    expect(result()!.preload).toBe('auto');
    expect(result()!.calls).toEqual([]);
    audio.dispose();
  });
});

describe('the sound switch and the tab', () => {
  it('silences the music and hands it back where it left off', () => {
    const audio = new GameAudio();
    audio.music('cover');
    cover()!.currentTime = 42;
    audio.setMuted(true);
    expect(cover()!.calls).toEqual(['play', 'pause']);
    expect(cover()!.currentTime).toBe(42);
    audio.setMuted(false);
    expect(cover()!.calls).toEqual(['play', 'pause', 'play']);
    audio.dispose();
  });
  it('does not so much as fetch a track while the sound is off', () => {
    const audio = new GameAudio();
    audio.setMuted(true);
    audio.music('result');
    expect(FakeAudio.made).toHaveLength(0);
    audio.setMuted(false);
    expect(result()!.calls).toEqual(['play']);
    audio.dispose();
  });
  it('stops for a tab that goes away and starts again when it comes back', () => {
    const audio = new GameAudio();
    audio.music('cover');
    audio.background(true);
    expect(cover()!.calls).toEqual(['play', 'pause']);
    audio.background(true);
    expect(cover()!.calls).toEqual(['play', 'pause']);
    audio.background(false);
    expect(cover()!.calls).toEqual(['play', 'pause', 'play']);
    audio.dispose();
  });
});

describe('a browser that will not play it yet', () => {
  it('waits for the first touch of the page, and comes up silent for a beat', async () => {
    FakeAudio.refusal = 'NotAllowedError';
    const audio = new GameAudio();
    audio.music('cover');
    await Promise.resolve();
    FakeAudio.refusal = null;
    tap();
    // The tap that let it through may be the tap on the play key, so what comes
    // up is muted; the fade is what decides whether anybody hears it.
    expect(cover()!.calls).toEqual(['play', 'play']);
    expect(cover()!.muted).toBe(true);
    settle();
    expect(cover()!.muted).toBe(false);
    audio.dispose();
  });
  it('stays silent when the tap was the one that started the innings', async () => {
    FakeAudio.refusal = 'NotAllowedError';
    const audio = new GameAudio();
    audio.music('cover');
    await Promise.resolve();
    FakeAudio.refusal = null;
    tap();
    // Walking out is what that tap did, and the fade has not run yet.
    audio.music(null);
    settle();
    expect(cover()!.muted).toBe(true);
    expect(cover()!.calls).toEqual(['play', 'play', 'pause']);
    audio.dispose();
  });
  it('asks once for a file it cannot play at all', async () => {
    FakeAudio.refusal = 'NotSupportedError';
    const audio = new GameAudio();
    audio.music('cover');
    await Promise.resolve();
    tap();
    audio.music(null); audio.music('cover');
    // Put away and asked for again, and never played a second time: a browser
    // that cannot decode the file will not decode it on the ninth attempt
    // either, and a fetch per screen for silence is worse than the silence.
    expect(cover()!.calls).toEqual(['play', 'pause']);
    audio.dispose();
  });
});
