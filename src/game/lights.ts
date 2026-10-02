import type { SkyTime } from '../scene/sky';

/**
 * Day or night, for the Blast.
 *
 * The Blast is played under the floodlights unless the player has asked for
 * a day game, from the pause card; that choice is remembered in this
 * browser. A Test is always played by day, so this is asked only when a Blast
 * innings starts.
 *
 * `?lights=day` or `?lights=night` on a link overrides both, for looking at
 * one or the other on purpose, and for the checks.
 */
export const BLAST_DEFAULT: SkyTime = 'night';

const KEY = 'hitman-lights';

const valid = (value: string | null | undefined): value is SkyTime => value === 'day' || value === 'night';

export function blastLights(search = location.search): SkyTime {
  const asked = new URLSearchParams(search).get('lights');
  if (valid(asked)) return asked;
  try {
    const kept = localStorage.getItem(KEY);
    if (valid(kept)) return kept;
  } catch { /* No storage: the default. */ }
  return BLAST_DEFAULT;
}

export function keepLights(value: SkyTime) {
  try { localStorage.setItem(KEY, value); } catch { /* Then it lasts this innings. */ }
}
