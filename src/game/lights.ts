import type { SkyTime } from '../scene/sky';

/**
 * Day or night, for the Blast — by the player's own clock.
 *
 * From six in the evening to seven in the morning, on the device's local
 * time, the Blast is played under the floodlights; the rest of the day it is
 * a day game. Nothing is asked for and nothing leaves the browser: the hour is
 * read off `Date`, in whatever time zone the device keeps.
 *
 * The pause card's toggle still has the last word, but only until the clock
 * next turns. A player who switches to day at nine at night plays by day all
 * evening and gets the clock back at seven the next morning; one who switches
 * to night at lunchtime has it until six. A choice that lasted forever would
 * switch the clock off for anybody who had ever touched the toggle, and one
 * that lasted only the visit would have to be made again every time.
 *
 * A Test is always played by day, so this is asked only when a Blast innings
 * starts. `?lights=day` or `?lights=night` on a link overrides everything, for
 * looking at one or the other on purpose, and for the checks.
 */

/** The hours, local time, at which the night starts and ends. */
export const NIGHT_FROM = 18;
export const DAY_FROM = 7;

const KEY = 'hitman-lights';

const valid = (value: unknown): value is SkyTime => value === 'day' || value === 'night';

/** What the clock says, at `now`. */
export function clockLights(now = new Date()): SkyTime {
  const hour = now.getHours();
  return hour >= NIGHT_FROM || hour < DAY_FROM ? 'night' : 'day';
}

/** When the clock next turns after `now`: the coming six in the evening or seven in the morning. */
export function nextTurn(now = new Date()): Date {
  const turn = new Date(now);
  turn.setMinutes(0, 0, 0);
  const hour = now.getHours();
  if (hour >= DAY_FROM && hour < NIGHT_FROM) turn.setHours(NIGHT_FROM);
  else {
    if (hour >= NIGHT_FROM) turn.setDate(turn.getDate() + 1);
    turn.setHours(DAY_FROM);
  }
  return turn;
}

/** The player's own choice, while it still stands; null once the clock has turned since it was made. */
function kept(now: Date): SkyTime | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    // An earlier build kept the choice as a bare word with no end to it. It
    // cannot say when it was made, so the clock decides instead.
    const choice = JSON.parse(raw) as { time?: unknown; until?: unknown };
    if (!valid(choice.time) || typeof choice.until !== 'number') return null;
    return now.getTime() < choice.until ? choice.time : null;
  } catch {
    return null;
  }
}

export function blastLights(search = location.search, now = new Date()): SkyTime {
  const asked = new URLSearchParams(search).get('lights');
  if (valid(asked)) return asked;
  return kept(now) ?? clockLights(now);
}

/** The player has chosen, from the pause card: kept until the clock next turns. */
export function keepLights(time: SkyTime, now = new Date()) {
  try { localStorage.setItem(KEY, JSON.stringify({ time, until: nextTurn(now).getTime() })); } catch { /* Then it lasts this innings. */ }
}
