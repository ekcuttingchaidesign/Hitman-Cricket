import type { ShotOutcome } from './types';
type Sound = 'hit' | 'boundary' | 'bounce' | 'wicket' | 'sledge' | 'edge';
/**
 * The music, and the screen each piece belongs to.
 *
 * Held by an audio element apiece rather than by the buffer bank below. That
 * bank exists to fire an impact the instant a bat meets a ball, and it stops
 * everything else in order to do it; music is the opposite job in every
 * respect — minutes long, looped, streamed rather than decoded up front, and
 * the one thing on the page that is supposed to survive the next sound.
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
 * Under the calls rather than over them. Ignored on iOS, which does not let a
 * page set its own volume — there the device's own is the only one there is.
 */
const MUSIC_GAIN = .5;
/** How long a track started off a tap stays silent before it is let through. */
const FADE_IN_MS = 220;
/** What counts as the tap that lets a refused track through. */
const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const;
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
  muted = false;
  /** One element per track, built the first time that track is asked for. */
  private elements = new Map<Track, HTMLAudioElement>();
  /** The track the screen the player is on wants. Null while they are batting. */
  private wanted: Track | null = null;
  /** Tracks this browser has already refused to decode. Asked for once only. */
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
  // Fetch before the innings; decoding and playback are unlocked by Start's tap.
  private downloads = this.files.map(async ([kind, url]) => {
    try { const response = await fetch(url); if (!response.ok) return null; return { kind, data: await response.arrayBuffer() }; }
    catch { return null; }
  });
  unlock() {
    if (this.disposed) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state !== 'running') void this.context.resume().catch(() => {});
      const silent = this.context.createBufferSource();
      silent.buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
      silent.connect(this.context.destination); silent.start(); silent.onended = () => silent.disconnect();
      this.loading ??= this.load();
    } catch { /* Unsupported audio must not stop the innings. */ }
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
  setMuted(muted: boolean) {
    this.muted = muted;
    // The switch silences the music too, and hands it back where it left off
    // rather than at the top: a player who muted to take a call and unmuted
    // afterwards has not asked to hear the opening bar again.
    if (muted) { this.stop(); this.hush(false); } else this.resume();
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
  warm(track: Track) { if (!this.disposed && !this.broken.has(track)) this.element(track); }
  /** A tab that goes away takes the music with it, and gives it back. */
  background(hidden: boolean) {
    if (this.disposed || hidden === this.backgrounded) return;
    this.backgrounded = hidden;
    if (hidden) this.hush(false); else this.resume();
  }
  /**
   * Starts the wanted track, if there is one and anything is willing to play it.
   *
   * `afterGesture` is the retry that follows a refused autoplay, and it comes up
   * silent for a beat. The tap that let it through is very often a tap that is
   * leaving this screen — the play key is on the cover and the board key is on
   * the card — and by the time the fade is over, whatever that tap started has
   * already taken the music away if it was going to. Muted rather than turned
   * down, because iOS ignores a volume a page sets for itself.
   */
  private resume(afterGesture = false) {
    const track = this.wanted;
    if (!track || this.muted || this.backgrounded || this.disposed || this.broken.has(track)) return;
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
  /** Autoplay was refused. The next touch of the page is what lets it through. */
  private arm() {
    if (this.gesture || this.disposed) return;
    const through = () => { this.disarm(); this.resume(true); };
    this.gesture = through;
    GESTURES.forEach(type => window.addEventListener(type, through, { passive: true }));
  }
  private disarm() {
    const through = this.gesture;
    if (!through) return;
    this.gesture = null;
    GESTURES.forEach(type => window.removeEventListener(type, through));
  }
  play(kind: Sound) {
    if (!this.context || this.muted || this.disposed) return;
    const ctx = this.context, buffer = this.buffers.get(kind);
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
