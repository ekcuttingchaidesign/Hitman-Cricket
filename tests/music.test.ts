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
afterEach(() => { for (const name of ['Audio', 'window', 'localStorage']) delete (globalThis as Record<string, unknown>)[name]; });

/** A browser's storage, so the switch can be carried from one visit to the next. */
const storage = () => {
  const held = new Map<string, string>();
  const store = { getItem: (key: string) => held.get(key) ?? null, setItem: (key: string, value: string) => { held.set(key, value); }, removeItem: (key: string) => { held.delete(key); } };
  Object.assign(globalThis, { localStorage: store });
  return held;
};

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
  it('hands the card\'s music over to the cover\'s for the picker', () => {
    const audio = new GameAudio();
    // The mode picker is reached from the Test card as well as from the cover,
    // and it replaces whichever it was reached from — so it takes the cover's
    // music with it either way.
    audio.music('result');
    result()!.currentTime = 12;
    audio.music('cover');
    expect(result()!.calls).toEqual(['play', 'pause']);
    expect(result()!.currentTime).toBe(0);
    expect(cover()!.calls).toEqual(['play']);
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
    audio.set('off');
    expect(cover()!.calls).toEqual(['play', 'pause']);
    expect(cover()!.currentTime).toBe(42);
    audio.set('on');
    expect(cover()!.calls).toEqual(['play', 'pause', 'play']);
    audio.dispose();
  });
  it('does not so much as fetch a track while the sound is off', () => {
    const audio = new GameAudio();
    audio.set('off');
    audio.music('result');
    expect(FakeAudio.made).toHaveLength(0);
    audio.set('on');
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

/**
 * An audio context that only counts: how many were opened, how many impacts
 * were struck on one, and whether it was let go of.
 */
const contexts = () => {
  const seen = { opened: 0, struck: 0, suspended: 0 };
  const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, onended: null,
    frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} } });
  class FakeContext {
    state = 'running'; currentTime = 0; sampleRate = 44100; destination = {};
    constructor() { seen.opened++; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { seen.suspended++; this.state = 'suspended'; return Promise.resolve(); }
    close() { return Promise.resolve(); }
    createBuffer() { return {}; }
    createBufferSource() { return node(); }
    createGain() { return node(); }
    createOscillator() { seen.struck++; return node(); }
    decodeAudioData() { return Promise.reject(new Error('no decoder here')); }
  }
  Object.assign(globalThis, { AudioContext: FakeContext });
  return seen;
};

describe('a player with their own music on', () => {
  afterEach(() => { delete (globalThis as Record<string, unknown>).AudioContext; });
  it('steps the key from everything on, to the music off, to nothing at all, and round', () => {
    const audio = new GameAudio();
    expect(audio.setting).toBe('on');
    audio.step(); expect(audio.setting).toBe('effects');
    audio.step(); expect(audio.setting).toBe('off');
    audio.step(); expect(audio.setting).toBe('on');
    audio.dispose();
  });
  it('keeps the bat on the ball with the music off', () => {
    const seen = contexts();
    const audio = new GameAudio();
    audio.music('cover');
    audio.set('effects');
    // The music stops, and stays stopped when the next screen asks for its own.
    expect(cover()!.calls).toEqual(['play', 'pause']);
    audio.music('result');
    expect(result()?.calls ?? []).toEqual([]);
    // The impacts are still let through.
    audio.unlock();
    audio.play('hit');
    expect(seen.opened).toBe(1);
    expect(seen.struck).toBe(1);
    audio.dispose();
  });
  it('opens no audio context with everything off, and lets go of one already open', () => {
    const seen = contexts();
    const audio = new GameAudio();
    audio.unlock();
    audio.set('off');
    expect(seen.suspended).toBe(1);
    audio.play('hit');
    expect(seen.struck).toBe(0);
    const next = new GameAudio();
    next.set('off'); next.unlock();
    expect(seen.opened).toBe(1);
    audio.dispose(); next.dispose();
  });
  it('remembers the setting, so the next visit never takes the speaker', () => {
    const held = storage();
    new GameAudio().set('effects');
    expect(held.get('hitman-sound')).toBe('effects');
    // The next visit: the cover asks for its music and nothing is so much as
    // built, so there is nothing to take the phone's audio away from theirs.
    const next = new GameAudio();
    expect(next.setting).toBe('effects');
    next.music('cover');
    expect(FakeAudio.made).toHaveLength(0);
    next.set('on');
    expect(held.has('hitman-sound')).toBe(false);
    expect(cover()!.calls).toEqual(['play']);
    next.dispose();
  });
  it('reads anything it does not recognise as everything on', () => {
    storage().set('hitman-sound', 'loud');
    expect(new GameAudio().setting).toBe('on');
  });
  it('asks an iPhone to mix the impacts in with the music while ours is off', () => {
    const session = { type: 'auto' };
    Object.defineProperty(globalThis.navigator, 'audioSession', { value: session, configurable: true });
    try {
      const audio = new GameAudio();
      audio.set('effects'); expect(session.type).toBe('ambient');
      audio.set('off'); expect(session.type).toBe('ambient');
      audio.set('on'); expect(session.type).toBe('auto');
      // A returning player's setting is applied before anything plays.
      storage().set('hitman-sound', 'effects');
      new GameAudio();
      expect(session.type).toBe('ambient');
      audio.dispose();
    } finally { delete (globalThis.navigator as unknown as Record<string, unknown>).audioSession; }
  });
  it('plays as before in a browser that keeps nothing', () => {
    Object.assign(globalThis, { localStorage: { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } } });
    const audio = new GameAudio();
    expect(audio.setting).toBe('on');
    audio.set('off');
    expect(audio.muted).toBe(true);
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
