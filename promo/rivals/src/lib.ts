import { interpolate, spring, type SpringConfig } from 'remotion';
import { theme } from './theme';

type Ease = (t: number) => number;

/** An eased, clamped ramp. Never linear. */
export const ramp = (f: number, from: [number, number], to: [number, number], easing: Ease = theme.ease.out) =>
  interpolate(f, from, to, { easing, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

/** A spring that starts at `delay`. */
export const pop = (f: number, delay: number, fps: number, config: Partial<SpringConfig> = theme.spring.snappy) =>
  spring({ frame: f - delay, fps, config });

/** A decaying shake from `start`, deterministic. */
export const shake = (f: number, start: number, dur = 10, amp = 18) => {
  const t = f - start;
  if (t < 0 || t > dur) return { x: 0, y: 0 };
  const k = Math.pow(1 - t / dur, 2) * amp;
  return { x: Math.sin(t * 2.7) * k, y: Math.cos(t * 3.9) * k * 0.7 };
};

/** Exit to 0 over `[a, b]`, accelerating. */
export const out = (f: number, a: number, b: number) => ramp(f, [a, b], [1, 0], theme.ease.in);

/** Sine breathing for anything that sits still for a while. */
export const breathe = (f: number, amt = 0.015, speed = 22) => 1 + Math.sin(f / speed) * amt;
