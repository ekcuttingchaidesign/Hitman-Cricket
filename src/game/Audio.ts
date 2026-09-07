export class GameAudio {
  private context: AudioContext | null = null;
  muted = false;
  unlock() { this.context ??= new AudioContext(); void this.context.resume(); }
  play(kind: 'hit' | 'bounce' | 'wicket' | 'six') {
    if (!this.context || this.muted) return;
    const ctx = this.context; const now = ctx.currentTime;
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type = kind === 'hit' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(kind === 'hit' ? 720 : kind === 'wicket' ? 170 : kind === 'six' ? 540 : 240, now);
    osc.frequency.exponentialRampToValueAtTime(kind === 'six' ? 980 : 55, now + 0.18);
    gain.gain.setValueAtTime(kind === 'bounce' ? 0.025 : 0.09, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(now + 0.26); osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  dispose() { void this.context?.close(); }
}
