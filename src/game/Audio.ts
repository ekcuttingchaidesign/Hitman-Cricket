import type { ShotOutcome } from './types';
type Sound = 'hit' | 'boundary' | 'bounce' | 'wicket' | 'sledge' | 'edge';
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
  setMuted(muted: boolean) { this.muted = muted; if (muted) this.stop(); }
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
  dispose() { this.disposed = true; this.stop(); void this.context?.close(); }
}
