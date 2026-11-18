/**
 * Super Knockout's floodlights answering the room (Figma "Super Knockout ·
 * Final", F4 · Motion, and the Battle Royale page's sections 39 and 40): at a
 * cut, while the bowler walks back, they flash once as the crowd swells; going
 * into the final they dip, and stay a shade down for it. A level a frame, 1
 * the lights as the night has them, from the cue and the game's clock, so it
 * holds through a pause and any moment can be drawn on its own. The arena's
 * rule holds: no strobe, one flash a cut. Under reduced motion nothing flashes
 * and the final's lights stand at their settled level.
 */
export type FloodKind = 'flash' | 'dip';
export interface FloodCue { kind: FloodKind; at: number }

export const FLOOD = {
  /** The flash: up to `peak` in `rise`, and back to the night's level by `back`. */
  flash: { peak: 1.9, rise: 60, back: 700 },
  /** The dip: down to `low` in `fall`, held to `hold`, then up to `settle` by `back`, where it stays. */
  dip: { low: .45, fall: 350, hold: 900, back: 1600, settle: .8 },
  /** How much of the lamps' level reaches the light on the ground: most of it, the night's whole light being theirs. */
  ground: .8,
} as const;

const ease = (p: number) => p * p * (3 - 2 * p);
const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** The lamps' level at `now`, for a cue made at its own time (in the future, it waits). */
export function floodAt(cue: FloodCue | null, now: number, still = false): number {
  if (!cue) return 1;
  const since = now - cue.at;
  if (since < 0) return 1;
  if (cue.kind === 'flash') {
    if (still) return 1;
    const f = FLOOD.flash;
    if (since < f.rise) return 1 + (f.peak - 1) * (since / f.rise);
    return 1 + (f.peak - 1) * (1 - ease(clamp((since - f.rise) / (f.back - f.rise))));
  }
  const d = FLOOD.dip;
  if (still || since >= d.back) return d.settle;
  if (since < d.fall) return 1 - (1 - d.low) * ease(since / d.fall);
  if (since < d.hold) return d.low;
  return d.low + (d.settle - d.low) * ease((since - d.hold) / (d.back - d.hold));
}

/** The light on the ground for a lamps' level: the same way, by `FLOOD.ground` of it. */
export const groundLevel = (lamps: number) => 1 + (lamps - 1) * FLOOD.ground;
