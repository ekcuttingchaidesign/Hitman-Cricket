import type { ShotOutcome } from './types';
type Sound = 'hit' | 'boundary' | 'bounce' | 'wicket' | 'sledge' | 'edge';
/**
 * The music, and the screen each piece belongs to.
 *
 * Played through the same audio context as the impacts, decoded whole — half
 * a minute a track, a dozen megabytes each once decoded. It used to be an
 * audio element apiece, and on Android that was the bug: an element that
 * plays is a player the phone pauses everything else for, muted or not, and
 * the first tap on the cover was enough to stop a player's own music. The
 * context is not a player to the phone, so the game's music now plays over
 * theirs rather than instead of it, and the key turns ours off.
 *
 * The element is still here as the fallback, for a browser with no context or
 * one that will not decode the file.
 */
export type Track = 'cover' | 'result';
/**
 * Bare relative paths, the same reasoning as the kit pictures in
 * `config/board.ts`: the browser resolves them against the page's own URL,
 * which is right at a domain root and right under a GitHub Pages subdirectory,
 * where a leading slash would look for the file at the top of github.io.
 *
 * They sit in `public/` rather than being bundled so that the single-file build
 * does not try to carry two megabytes of music as a data URI.
 */
const TRACKS: Record<Track, string> = {
  cover: 'Hitman_start_screen.aac',
  result: 'test_survival_glory.aac',
};
/**
 * Under the calls rather than over them. A gain in the context, so iOS obeys it
 * too; only the fallback element is left at the device's own volume there.
 */
const MUSIC_GAIN = .5;
/** How long a track started off a tap stays silent before it is let through. */
const FADE_IN_MS = 220;
/** What counts as the tap that lets a refused track through. */
const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const;
/**
 * The sound key's three settings, in the order it steps through them.
 *
 * A phone has one speaker and gives it to whichever app last asked, so the
 * cover's music starting is a player's own music stopping — and Android does
 * not hand it back when the page goes quiet again. The middle setting is for
 * the player with their own songs on: the game's music is the part that takes
 * the speaker, and the bat on the ball is the part they still want to hear.
 * The impacts come from an audio context rather than an audio element, and a
 * context is not something the phone counts as a player to pause for.
 */
export type SoundSetting = 'on' | 'effects' | 'off';
const SETTINGS: readonly SoundSetting[] = ['on', 'effects', 'off'];
/**
 * Kept between visits. A player who has told us once that our music is not
 * wanted should not have to say it again at every visit, after the first tap
 * has already taken the speaker.
 */
const SOUND_KEY = 'hitman-sound';
function settingBefore(): SoundSetting {
  try { const held = localStorage.getItem(SOUND_KEY); return held === 'effects' || held === 'off' ? held : 'on'; } catch { return 'on'; }
}
export function outcomeSound(outcome: Pick<ShotOutcome, 'isWicket' | 'madeBatContact' | 'runs'> & { edged?: boolean }): Sound | null {
  // An edge has its own sound, and it is the sound of the wicket: the thin
  // noise off the face is the whole story of the dismissal, so it is read
  // before the general one for a wicket falling.
  if (outcome.edged) return 'edge';
  if (outcome.isWicket) return 'wicket';
  if (!outcome.madeBatContact) return null;
  return outcome.runs === 4 || outcome.runs === 6 ? 'boundary' : 'hit';
}
export class GameAudio {
  private context: AudioContext | null = null;
  private buffers = new Map<Sound, AudioBuffer>();
  private sources = new Set<AudioBufferSourceNode>();
  private loading: Promise<void> | null = null;
  private disposed = false;
  setting = settingBefore();
  /** Whether the game's music is off. Everything else is still allowed a noise. */
  get musicOff() { return this.setting !== 'on'; }
  /** Whether nothing at all is to be heard. */
  get muted() { return this.setting === 'off'; }
  /** Each track fetched and decoded, asked for once. Null for one that would not. */
  private tracks = new Map<Track, Promise<AudioBuffer | null>>();
  private decoded = new Map<Track, AudioBuffer>();
  /** Where a track was stopped, for a track handed back rather than rewound. */
  private positions = new Map<Track, number>();
  /** The track sounding through the context, and the clock it started on. */
  private playing: { track: Track; source: AudioBufferSourceNode; gain: GainNode; from: number; at: number } | null = null;
  /** Tracks left to an element, because there is no context or it would not decode them. */
  private plain = new Set<Track>();
  /** One element per fallback track, built the first time that track is asked for. */
  private elements = new Map<Track, HTMLAudioElement>();
  /** The track the screen the player is on wants. Null while they are batting. */
  private wanted: Track | null = null;
  /** Tracks the fallback element has already refused to play. Asked for once only. */
  private broken = new Set<Track>();
  private gesture: (() => void) | null = null;
  private fade = 0;
  private backgrounded = false;
  private files = [
    ['hit', new URL('../assets/normal-hit.mp3', import.meta.url)],
    ['boundary', new URL('../assets/boundary-hit.mp3', import.meta.url)],
    ['sledge', new URL('../assets/sledge.mp3', import.meta.url)],
    ['edge', new URL('../assets/bat-edge.mp3', import.meta.url)],
  ] as const;
  // The setting a returning player left behind applies before anything plays.
  constructor() { this.share(); }
  // Fetch before the innings; decoding and playback are unlocked by Start's tap.
  private downloads = this.files.map(async ([kind, url]) => {
    try { const response = await fetch(url); if (!response.ok) return null; return { kind, data: await response.arrayBuffer() }; }
    catch { return null; }
  });
  unlock() {
    // Nothing is opened while the sound is off. An audio context holds an
    // output stream whether or not it is making a noise, and that is enough for
    // some phones to count the page as something playing.
    if (this.disposed || this.muted || !this.open()) return;
    try {
      if (this.context!.state !== 'running') void this.context!.resume().catch(() => {});
      const silent = this.context!.createBufferSource();
      silent.buffer = this.context!.createBuffer(1, 1, this.context!.sampleRate);
      silent.connect(this.context!.destination); silent.start(); silent.onended = () => silent.disconnect();
      this.loading ??= this.load();
    } catch { /* Unsupported audio must not stop the innings. */ }
  }
  /** The context, opened the first time anything needs one. Null where there is none. */
  private open() {
    if (this.disposed) return null;
    try { this.context ??= new AudioContext(); } catch { return null; }
    return this.context;
  }
  private async load() {
    for (const download of this.downloads) {
      const file = await download;
      if (!file || !this.context || this.disposed) continue;
      try { this.buffers.set(file.kind, await this.context.decodeAudioData(file.data)); }
      catch { /* Keep the synthesized impact as an offline fallback. */ }
    }
  }
  stop() { this.sources.forEach(source => { try { source.stop(); } catch { /* Already ended. */ } }); this.sources.clear(); }
  /** The key's next setting: on, then the music off, then everything off. */
  step() { this.set(SETTINGS[(SETTINGS.indexOf(this.setting) + 1) % SETTINGS.length]); }
  set(setting: SoundSetting) {
    this.setting = setting;
    try { if (setting === 'on') localStorage.removeItem(SOUND_KEY); else localStorage.setItem(SOUND_KEY, setting); } catch { /* Asked again next visit, then. */ }
    this.share();
    // Switching the music off stops it where it stands rather than rewinding
    // it: a player who muted to take a call and unmuted afterwards has not
    // asked to hear the opening bar again.
    if (this.musicOff) this.hush(false); else this.resume();
    if (this.muted) {
      this.stop();
      // And lets go of the speaker, which `unlock` takes back when it is on.
      try { void this.context?.suspend().catch(() => {}); } catch { /* Already closed. */ }
    }
  }
  /**
   * Tells an iPhone the impacts are to be mixed in with whatever else is
   * playing rather than stop it. Only Safari has the switch, and it is only
   * thrown while the music is off: the price of mixing is that the ring switch
   * silences the page, which is right for a noise laid over somebody's own
   * songs and wrong for a game that has music of its own to offer.
   */
  private share() {
    try {
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = this.musicOff ? 'ambient' : 'auto';
    } catch { /* A browser without it plays as it always has. */ }
  }
  /**
   * The music for the screen the player is on, or nothing at all while they are
   * batting.
   *
   * Asking for the track that is already playing does nothing, which is the
   * whole of what keeps the card's music running when the board goes up over
   * it: the sheet is a screen on top of the innings-end card, not a screen
   * instead of it, so nothing tells the music to stop and it does not.
   */
  music(track: Track | null) {
    if (this.disposed || track === this.wanted) return;
    this.hush(true);
    this.wanted = track;
    this.resume();
  }
  /**
   * Fetches a track without playing it. The card's music is a megabyte, and a
   * card that goes up in silence while it arrives is worse than a load nobody
   * sees: this is called when the innings starts, so by the time it ends the
   * file is already here.
   */
  warm(track: Track) {
    if (this.disposed || this.musicOff) return;
    if (!this.plain.has(track) && this.open()) void this.track(track);
    else if (!this.broken.has(track)) { this.plain.add(track); this.element(track); }
  }
  /** Fetches and decodes a track, once. A track that will not decode goes to the element. */
  private track(track: Track) {
    let pending = this.tracks.get(track);
    if (!pending) {
      pending = (async () => {
        const context = this.open();
        const response = context ? await fetch(TRACKS[track]) : null;
        if (!context || !response?.ok) throw new Error('unavailable');
        return context.decodeAudioData(await response.arrayBuffer());
      })().then(buffer => { this.decoded.set(track, buffer); return buffer; }, () => { this.plain.add(track); return null; });
      this.tracks.set(track, pending);
    }
    return pending;
  }
  /** A tab that goes away takes the music with it, and gives it back. */
  background(hidden: boolean) {
    if (this.disposed || hidden === this.backgrounded) return;
    this.backgrounded = hidden;
    if (hidden) this.hush(false); else this.resume();
  }
  /**
   * Starts the wanted track, if there is one and anything is willing to play it.
   *
   * `afterGesture` is the start that follows a refused autoplay, and it comes up
   * silent for a beat. The tap that let it through is very often a tap that is
   * leaving this screen — the play key is on the cover and the board key is on
   * the card — and by the time the fade is over, whatever that tap started has
   * already taken the music away if it was going to.
   */
  private resume(afterGesture = false) {
    const track = this.wanted;
    if (!track || this.musicOff || this.backgrounded || this.disposed || this.broken.has(track)) return;
    if (this.playing?.track === track) return;
    const context = this.plain.has(track) ? null : this.open();
    if (!context) { this.plain.add(track); this.resumeElement(track, afterGesture); return; }
    const buffer = this.decoded.get(track);
    // Still arriving: it starts itself when it lands, if it is still wanted.
    if (!buffer) { void this.track(track).then(() => { if (this.wanted === track) this.resume(afterGesture); }); return; }
    // A context that is not running yet is asked to, and armed for the next
    // touch in case asking is not enough — nobody has touched the page yet.
    // Whichever lets it through first starts the track, faded in, since either
    // way it is starting late and very possibly under somebody's tap.
    if (context.state !== 'running') {
      this.arm();
      try {
        void context.resume().then(() => {
          if (context.state === 'running' && this.wanted === track) { this.disarm(); this.resume(true); }
        }, () => {});
      } catch { /* Closed. */ }
      return;
    }
    const source = context.createBufferSource(), gain = context.createGain(), now = context.currentTime;
    source.buffer = buffer; source.loop = true;
    if (afterGesture) {
      gain.gain.setValueAtTime(0, now);
      gain.gain.setValueAtTime(0, now + FADE_IN_MS / 1000);
      gain.gain.linearRampToValueAtTime(MUSIC_GAIN, now + FADE_IN_MS / 1000 + .25);
    } else gain.gain.value = MUSIC_GAIN;
    source.connect(gain); gain.connect(context.destination);
    const from = (this.positions.get(track) ?? 0) % buffer.duration;
    source.start(0, from);
    this.playing = { track, source, gain, from, at: now };
  }
  /** The fallback: the same track from an element, for a browser the context cannot serve. */
  private resumeElement(track: Track, afterGesture: boolean) {
    const element = this.element(track);
    element.muted = afterGesture;
    try {
      void element.play().catch((error: unknown) => {
        // A browser refusing to autoplay is a browser waiting to be asked: the
        // page has not been touched yet, and the next touch is what lets this
        // through. Anything else is a file it cannot play — raw AAC is not
        // universal — and retrying that on every tap for the rest of the
        // session would be a fetch a second for a screen that stays silent.
        if ((error as DOMException | null)?.name === 'NotAllowedError') this.arm();
        else this.broken.add(track);
      });
    } catch { this.arm(); }
    // Muted rather than turned down, because iOS ignores a volume a page sets
    // for an element.
    if (afterGesture) this.fade = window.setTimeout(() => { this.fade = 0; element.muted = false; }, FADE_IN_MS);
  }
  /**
   * Stops whatever is playing. Rewound when the screen it belongs to is done
   * with it, left where it stands when it is only the tab going away or the
   * sound being switched off.
   */
  private hush(rewind: boolean) {
    this.disarm();
    if (this.fade) { clearTimeout(this.fade); this.fade = 0; }
    const playing = this.playing;
    if (playing) {
      this.playing = null;
      const elapsed = (this.context?.currentTime ?? playing.at) - playing.at;
      this.positions.set(playing.track, rewind ? 0 : (playing.from + elapsed) % playing.source.buffer!.duration);
      try { playing.source.stop(); } catch { /* Already stopped. */ }
      playing.source.disconnect(); playing.gain.disconnect();
    } else if (rewind && this.wanted) this.positions.delete(this.wanted);
    const element = this.wanted ? this.elements.get(this.wanted) : null;
    if (!element) return;
    element.pause();
    if (rewind) { try { element.currentTime = 0; } catch { /* Nothing decoded to seek in yet. */ } }
  }
  private element(track: Track) {
    let element = this.elements.get(track);
    if (!element) {
      element = new Audio(TRACKS[track]);
      element.loop = true; element.preload = 'auto'; element.volume = MUSIC_GAIN;
      this.elements.set(track, element);
    }
    return element;
  }
  /**
   * Autoplay was refused. The next touch of the page is what lets it through.
   *
   * A context is asked inside the touch itself, which is the only place a
   * browser listens, and stays armed until it is actually running: a phone's
   * first touch is often a pointerdown, which Chrome and Safari do not count,
   * and the touchend after it is the one they do.
   */
  private arm() {
    if (this.gesture || this.disposed) return;
    const through = () => {
      const context = this.context, track = this.wanted;
      if (!context || !track || this.plain.has(track)) { this.disarm(); this.resume(true); return; }
      try {
        void context.resume().then(() => {
          if (context.state !== 'running' || this.gesture !== through) return;
          this.disarm(); this.resume(true);
        }, () => {});
      } catch { this.disarm(); }
    };
    this.gesture = through;
    GESTURES.forEach(type => window.addEventListener(type, through, { passive: true }));
  }
  private disarm() {
    const through = this.gesture;
    if (!through) return;
    this.gesture = null;
    GESTURES.forEach(type => window.removeEventListener(type, through));
  }
  /** Every impact asked for, and the state the context was in when it was. */
  private struck = 0;
  private lastStrike = '—';
  /**
   * What the sound is doing, for `?debug=1`. On an iPhone the part that goes
   * wrong is the part no desktop can show — Safari holding the page's sound
   * after another app has taken the speaker — so the overlay says what Safari
   * says, and a screenshot from the phone is the bug report.
   */
  describe() {
    const session = (navigator as Navigator & { audioSession?: { type: string; state?: string } }).audioSession;
    return {
      sound: this.setting, context: this.context?.state ?? 'none', rate: this.context?.sampleRate ?? '—',
      clips: this.buffers.size, struck: this.struck, lastStrike: this.lastStrike,
      music: this.playing?.track ?? '—', fallback: [...this.plain].join(',') || '—',
      session: session ? `${session.type}/${session.state ?? '?'}` : 'none',
    };
  }
  play(kind: Sound) {
    if (!this.context || this.muted || this.disposed) return;
    const ctx = this.context, buffer = this.buffers.get(kind);
    this.struck++; this.lastStrike = `${kind}@${ctx.state}`;
    // Safari holds a page's sound when another app takes the speaker — music
    // started from the control centre is enough — and leaves the context in
    // 'interrupted' until something asks for it back. Asking is what lets go:
    // a resume goes through the same admission a first play does, and that
    // admission ends the interruption. So an impact that finds the context held
    // asks, rather than striking into a context nobody will hear.
    if (ctx.state !== 'running') { try { void ctx.resume().catch(() => {}); } catch { /* Closed. */ } }
    if (buffer) {
      this.stop();
      const source = ctx.createBufferSource(); source.buffer = buffer;
      const gain = ctx.createGain(); gain.gain.value = .85;
      source.connect(gain); gain.connect(ctx.destination); this.sources.add(source); source.start();
      source.onended = () => { this.sources.delete(source); source.disconnect(); gain.disconnect(); };
      return;
    }
    // The synthesized fallback is an impact, not a voice: there is nothing
    // sensible to make of a sledge without its clip, so it stays silent.
    if (kind === 'sledge') return;
    const now = ctx.currentTime, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = kind === 'hit' || kind === 'edge' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(kind === 'edge' ? 1550 : kind === 'hit' ? 720 : kind === 'wicket' ? 170 : kind === 'boundary' ? 540 : 240, now);
    osc.frequency.exponentialRampToValueAtTime(kind === 'boundary' ? 980 : 55, now + .18);
    gain.gain.setValueAtTime(kind === 'bounce' ? .025 : .09, now); gain.gain.exponentialRampToValueAtTime(.001, now + (kind === 'edge' ? .09 : .25));
    osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(now + .26);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  dispose() {
    this.disposed = true; this.stop(); this.hush(true);
    // Whatever is still arriving is arriving for a page that is going away.
    this.elements.forEach(element => { element.pause(); element.removeAttribute('src'); element.load(); });
    this.elements.clear();
    void this.context?.close();
  }
}
