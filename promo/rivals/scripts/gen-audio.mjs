// Synthesises the whole soundtrack as 16-bit WAVs into public/sfx/.
// No downloads, fully deterministic: the same file every run.
//
//   music.wav     15 s bed at 120 BPM, so one beat is exactly 15 frames at 30 fps
//   whoosh.wav    filtered-noise swell for whips and slides
//   hit.wav       low boom + crack for slams
//   pop.wav       pitch-drop blip for small entrances
//   tick.wav      click for counters and balls
//   bubble.wav    chat message pop
//   trombone.wav  wah wah wah waaah, for the loser
//   riser.wav     noise + sweep into the leaderboard
//   ding.wav      bell for reaching number one
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sfx');
mkdirSync(OUT, { recursive: true });

// Deterministic noise.
let seed = 1234567;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };

function wav(name, data) {
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0.98 ? 0.98 / peak : 1;
  const buf = Buffer.alloc(44 + data.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + data.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(data.length * 2, 40);
  data.forEach((v, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v * gain)) * 32767), 44 + i * 2));
  writeFileSync(join(OUT, name), buf);
  console.log('wrote', name, (data.length / SR).toFixed(2) + 's');
}

const buffer = s => new Float32Array(Math.round(s * SR));
const lowpass = (data, cutoff) => {
  const a = 1 - Math.exp(-2 * Math.PI * cutoff / SR);
  let y = 0;
  for (let i = 0; i < data.length; i++) { y += a * (data[i] - y); data[i] = y; }
  return data;
};
const saw = ph => 2 * (ph - Math.floor(ph + 0.5));

// ── one-shot voices, written into a buffer at an offset ──────────────────────
function kick(out, at, amp = 1) {
  const n = Math.round(0.32 * SR), start = Math.round(at * SR);
  let ph = 0;
  for (let i = 0; i < n && start + i < out.length; i++) {
    const t = i / SR;
    const f = 45 + 110 * Math.exp(-t * 38);
    ph += f / SR;
    const env = Math.exp(-t * 9);
    out[start + i] += amp * (Math.sin(2 * Math.PI * ph) * env + (i < 90 ? rnd() * 0.25 * (1 - i / 90) : 0));
  }
}
function clap(out, at, amp = 1) {
  const n = Math.round(0.22 * SR), start = Math.round(at * SR);
  let lp = 0;
  for (let i = 0; i < n && start + i < out.length; i++) {
    const t = i / SR;
    // three quick bursts then a tail, the way a clap is really several hands
    const burst = t < 0.03 ? (Math.floor(t / 0.01) % 2 === 0 ? 1 : 0.4) : 1;
    const env = Math.exp(-t * 22) * burst;
    const nz = rnd();
    lp += 0.35 * (nz - lp);
    out[start + i] += amp * ((nz - lp) * 0.9 * env + Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 40) * 0.35);
  }
}
function hat(out, at, amp = 1, len = 0.04) {
  const n = Math.round(len * 2 * SR), start = Math.round(at * SR);
  let prev = 0;
  for (let i = 0; i < n && start + i < out.length; i++) {
    const t = i / SR;
    const nz = rnd();
    const hp = nz - prev; prev = nz;
    out[start + i] += amp * hp * 0.35 * Math.exp(-t / len * 4);
  }
}
function bassNote(out, at, dur, freq, amp = 1) {
  const n = Math.round(dur * SR), start = Math.round(at * SR);
  const tmp = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += freq / SR;
    const env = Math.min(1, t / 0.005) * Math.exp(-t * 3.5) * Math.min(1, (dur - t) / 0.01);
    tmp[i] = (saw(ph) * 0.6 + Math.sin(2 * Math.PI * ph) * 0.8) * env;
  }
  lowpass(tmp, 520);
  for (let i = 0; i < n && start + i < out.length; i++) out[start + i] += amp * tmp[i];
}
function stab(out, at, freqs, amp = 1) {
  const dur = 0.22, n = Math.round(dur * SR), start = Math.round(at * SR);
  const tmp = new Float32Array(n);
  for (const f of freqs) {
    for (const det of [-0.006, 0.006]) {
      let ph = rnd();
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        ph += f * (1 + det) / SR;
        tmp[i] += saw(ph) * Math.exp(-t * 14) * 0.18;
      }
    }
  }
  lowpass(tmp, 2600);
  for (let i = 0; i < n && start + i < out.length; i++) out[start + i] += amp * tmp[i];
}

// ── the music bed ─────────────────────────────────────────────────────────────
{
  const LEN = 15, BEAT = 0.5;
  const drums = buffer(LEN), bass = buffer(LEN), keys = buffer(LEN);
  // Am  F  C  G, one chord a bar (two seconds)
  const roots = [110, 87.31, 130.81, 98];
  const chords = [[440, 523.25, 659.25], [349.23, 440, 523.25], [523.25, 659.25, 783.99], [392, 493.88, 587.33]];
  const beats = LEN / BEAT;
  for (let b = 0; b < beats; b++) {
    const t = b * BEAT;
    const bar = Math.floor(b / 4), inBar = b % 4;
    // The result lands at 7.5 s and the board at 11.5 s: the kick drops out for
    // the beat before each, so the hit on the downbeat lands in a hole.
    const hole = (b === 14) || (b === 22);
    if (!hole) kick(drums, t, 1);
    if (inBar === 1 || inBar === 3) clap(drums, t, hole ? 0.4 : 0.8);
    hat(drums, t + BEAT / 2, 0.8);
    if (b >= 4) hat(drums, t + BEAT / 4, 0.35, 0.02), hat(drums, t + BEAT * 3 / 4, 0.35, 0.02);
    // eighth-note bass, root and octave
    const root = roots[bar % 4];
    if (!hole) {
      bassNote(bass, t, BEAT / 2 - 0.01, root, 1);
      bassNote(bass, t + BEAT / 2, BEAT / 2 - 0.01, inBar === 3 ? root * 2 : root, 0.85);
    }
    if (inBar === 1 || inBar === 3) stab(keys, t + BEAT / 2, chords[bar % 4], 0.9);
  }
  // Sidechain: the bass and keys duck under every kick, which is the pump.
  const mix = buffer(LEN);
  for (let i = 0; i < mix.length; i++) {
    const t = i / SR;
    const since = (t % BEAT) / BEAT;
    const duck = 0.35 + 0.65 * Math.min(1, since / 0.45);
    // gentle fade over the last 0.4 s
    const tail = Math.min(1, (LEN - t) / 0.4);
    mix[i] = (drums[i] * 0.95 + (bass[i] * 0.8 + keys[i] * 0.55) * duck) * tail;
  }
  wav('music.wav', mix);
}

// ── effects ─────────────────────────────────────────────────────────────────
{
  const d = buffer(0.42);
  let lp = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR, p = t / 0.42;
    const cutoff = 300 + 5000 * Math.sin(Math.PI * p);
    const a = 1 - Math.exp(-2 * Math.PI * cutoff / SR);
    lp += a * (rnd() - lp);
    d[i] = lp * Math.pow(Math.sin(Math.PI * p), 1.6) * 1.6;
  }
  wav('whoosh.wav', d);
}
{
  const d = buffer(0.9);
  kick(d, 0, 1.2);
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    ph += (38 + 40 * Math.exp(-t * 12)) / SR;
    d[i] += Math.sin(2 * Math.PI * ph) * Math.exp(-t * 3) * 0.7 + (t < 0.05 ? rnd() * (1 - t / 0.05) * 0.6 : 0);
  }
  wav('hit.wav', d);
}
{
  const d = buffer(0.14);
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    ph += (320 + 700 * Math.exp(-t * 40)) / SR;
    d[i] = Math.sin(2 * Math.PI * ph) * Math.exp(-t * 28) * 0.9;
  }
  wav('pop.wav', d);
}
{
  const d = buffer(0.035);
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    d[i] = (Math.sin(2 * Math.PI * 2400 * t) * 0.6 + rnd() * 0.3) * Math.exp(-t * 180);
  }
  wav('tick.wav', d);
}
{
  const d = buffer(0.2);
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const f = t < 0.06 ? 740 : 1110;
    const tt = t < 0.06 ? t : t - 0.06;
    d[i] = Math.sin(2 * Math.PI * f * tt) * Math.exp(-tt * 30) * 0.8;
  }
  wav('bubble.wav', d);
}
{
  // Bb A Ab, then a long G with the wobble.
  const notes = [[233.08, 0.2], [220, 0.2], [207.65, 0.2], [196, 0.55]];
  const total = notes.reduce((s, [, l]) => s + l, 0);
  const d = buffer(total + 0.1);
  let at = 0;
  for (const [f, len] of notes) {
    const n = Math.round(len * SR), start = Math.round(at * SR);
    const tmp = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const vib = len > 0.5 ? 1 + 0.018 * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t / 0.2) : 1;
      ph += f * vib / SR;
      // the "wah": attack swells, then closes
      const env = Math.min(1, t / 0.04) * Math.min(1, (len - t) / 0.08);
      tmp[i] = (saw(ph) * 0.7 + saw(ph * 2.002) * 0.2) * env;
    }
    // a filter that opens and closes on each note, like a hand over the bell
    let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR, p = t / len;
      const cutoff = 400 + 1600 * Math.sin(Math.PI * Math.min(1, p * 1.3));
      const a = 1 - Math.exp(-2 * Math.PI * cutoff / SR);
      y += a * (tmp[i] - y);
      d[start + i] += y * 0.9;
    }
    at += len;
  }
  wav('trombone.wav', d);
}
{
  const d = buffer(1.0);
  let lp = 0, ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR, p = t;
    const cutoff = 400 + 7000 * p * p;
    const a = 1 - Math.exp(-2 * Math.PI * cutoff / SR);
    lp += a * (rnd() - lp);
    ph += (180 + 900 * p * p) / SR;
    d[i] = (lp * 0.8 + Math.sin(2 * Math.PI * ph) * 0.25) * Math.pow(p, 1.8);
  }
  wav('riser.wav', d);
}
{
  const d = buffer(1.2);
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    d[i] = (Math.sin(2 * Math.PI * 1318.5 * t) * 0.5 + Math.sin(2 * Math.PI * 1975.5 * t) * 0.3 +
      Math.sin(2 * Math.PI * 2637 * t) * 0.15) * Math.exp(-t * 4) * Math.min(1, t / 0.003);
  }
  wav('ding.wav', d);
}
