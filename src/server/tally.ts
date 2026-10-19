import { whenOf } from '../game/recap.js';

/**
 * What players do with passwords and career keys, and with each other's
 * profiles, counted by the store as it happens.
 *
 * GoatCounter counts the same moments from the browser (`password-created`,
 * `restore-done-password` and the rest), and for the taps — Played before?,
 * the cards, the sheets opened and closed — it is the only count there is. But
 * an ad blocker takes a player off it, and its export is visitor-days rather
 * than events, so "how many set a password" is a guess there. Here it is a
 * figure: one field a total and one a day (India's, `YYYY-MM-DD:event`), raised
 * in place in one hash, `${SCOPE}tally`. `scripts/password-report.ts` reads it
 * beside the exact count of players holding a password.
 *
 * Only what went through is counted, never a refusal: a refused try is the
 * rate limiter's business, and a run of them is somebody guessing.
 */
export const TALLIES = [
  'password-created',
  'password-changed',
  'question-set',
  'restore-password',
  'restore-question',
  'restore-key',
  'forgot-asked',
  // The profiles: a viewer counted once a day on somebody's profile, as the
  // profile's own count is, and the events innings leave on other players'.
  'profile-view',
  'chase-beat',
  'chase-short',
  'passed',
] as const;

export type Tally = typeof TALLIES[number];

/** The fields one event raises: its total, and its day's. */
export function tallyFields(event: Tally, at: number): [string, string] {
  const { year, day } = whenOf(at);
  return [event, `${year}-${day}:${event}`];
}
